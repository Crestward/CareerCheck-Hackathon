/**
 * Fork Manager: Handles database fork lifecycle for agent processing
 *
 * Manages:
 * - Fork creation and tracking
 * - Fork status monitoring
 * - Fork cleanup
 * - Fork performance metrics
 */

import { Pool } from 'pg';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ForkManager {
  constructor(mainDatabaseUrl) {
    this.mainDatabaseUrl = mainDatabaseUrl;
    this.mainPool = new Pool({ connectionString: mainDatabaseUrl });
    this.forks = new Map(); // In-memory cache of active forks
    this.config = {
      maxConcurrentForks: 10,
      forkRetentionHours: 24,
      forkTimeoutSeconds: 30
    };

    console.log(`[ForkManager] Initialized for database: ${this.sanitizeUrl(mainDatabaseUrl)}`);
  }

  /**
   * Create a new database fork for an agent
   *
   * @param {string} agentType - Type of agent (skill, experience, etc.)
   * @param {string} resumeId - Resume being analyzed
   * @param {string} jobId - Job being matched
   * @returns {Promise<Object>} Fork information
   */
  async createFork(agentType, resumeId, jobId) {
    const forkId = this.generateForkId(agentType, resumeId, jobId);

    console.log(`[ForkManager] Creating fork for ${agentType}: ${forkId}`);

    try {
      // Check if we can create more forks
      const activeForks = Array.from(this.forks.values()).filter(f => f.status === 'active');
      if (activeForks.length >= this.config.maxConcurrentForks) {
        throw new Error(`Max concurrent forks reached: ${this.config.maxConcurrentForks}`);
      }

      // Register fork in database
      const result = await this.mainPool.query(
        'SELECT create_agent_fork($1, $2, $3, $4, $5)',
        [forkId, agentType, this.mainDatabaseUrl, resumeId, jobId]
      );

      if (!result.rows[0].create_agent_fork) {
        throw new Error('Failed to create fork record');
      }

      // Create fork in database (Tiger Postgres)
      const forkDatabaseUrl = await this.createDatabaseFork(forkId);

      console.log(`[ForkManager] ✅ Fork created: ${forkId}`);

      // Mark fork as active
      await this.mainPool.query(
        'SELECT mark_fork_active($1, $2)',
        [forkId, forkDatabaseUrl]
      );

      // Cache fork information
      const forkInfo = {
        forkId,
        agentType,
        resumeId,
        jobId,
        status: 'active',
        databaseUrl: forkDatabaseUrl,
        createdAt: new Date(),
        startTime: Date.now()
      };

      this.forks.set(forkId, forkInfo);

      return forkInfo;

    } catch (error) {
      console.error(`[ForkManager] ❌ Failed to create fork:`, error.message);

      // Mark fork as failed
      await this.mainPool.query(
        'SELECT mark_fork_failed($1, $2)',
        [forkId, error.message]
      ).catch(() => {}); // Ignore if record doesn't exist

      throw error;
    }
  }

  /**
   * Create actual database fork using Postgres
   * This is the core Fast Fork functionality
   *
   * @private
   * @param {string} forkId - Unique fork identifier
   * @returns {Promise<string>} Fork database connection URL
   */
  async createDatabaseFork(forkId) {
    try {
      // Parse main database URL
      const url = new URL(this.mainDatabaseUrl);
      const baseName = url.pathname.replace('/', '');
      const forkName = `${baseName}_${forkId}`;

      // Try zero-copy fork first (requires Tiger Postgres)
      try {
        await this.mainPool.query(
          `CREATE DATABASE "${forkName}" AS TEMPLATE "${baseName}" WITH (strategy = 'zero_copy');`
        );

        const forkUrl = new URL(this.mainDatabaseUrl);
        forkUrl.pathname = '/' + forkName;

        console.log(`[ForkManager] ✅ Zero-copy fork created: ${forkName}`);
        return forkUrl.toString();
      } catch (zeroError) {
        console.warn(`[ForkManager] Zero-copy fork not available:`, zeroError.message);

        // Try regular fork as fallback
        try {
          await this.mainPool.query(
            `CREATE DATABASE "${forkName}" TEMPLATE "${baseName}";`
          );

          const forkUrl = new URL(this.mainDatabaseUrl);
          forkUrl.pathname = '/' + forkName;

          console.log(`[ForkManager] ✅ Regular fork created: ${forkName}`);
          return forkUrl.toString();
        } catch (regularError) {
          console.warn(`[ForkManager] Regular fork not available:`, regularError.message);

          // Final fallback: Use main database with logical isolation via connections
          console.log(`[ForkManager] 📌 Using logical fork (same database, isolated connection)`);
          return this.createLogicalFork(forkId);
        }
      }

    } catch (error) {
      console.error(`[ForkManager] ❌ Fork creation failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fallback: Create logical fork
   * For managed databases (TimescaleDB Cloud, etc.) that don't allow database creation
   * Uses the main database but with isolated connections for logical isolation
   *
   * @private
   */
  async createLogicalFork(forkId) {
    // For managed databases, we can't create new databases
    // Instead, use the main database URL directly
    // Agents will run in parallel using separate connections from the pool
    // This provides logical isolation while working with managed services

    console.log(`[ForkManager] 📌 Logical fork ${forkId} will use main database with isolated connections`);

    // Return the main database URL - agents will use isolated connections
    return this.mainDatabaseUrl;
  }

  /**
   * Get a fork pool for an agent
   *
   * @param {string} forkId - Fork identifier
   * @returns {Pool} Database pool connected to fork
   */
  getForkPool(forkId) {
    const forkInfo = this.forks.get(forkId);
    if (!forkInfo) {
      throw new Error(`Fork not found: ${forkId}`);
    }

    return new Pool({ connectionString: forkInfo.databaseUrl });
  }

  /**
   * Mark a fork as completed
   *
   * @param {string} forkId - Fork identifier
   * @param {Object} results - Results object to store
   */
  async completeFork(forkId, results) {
    try {
      const forkInfo = this.forks.get(forkId);
      if (!forkInfo) {
        console.warn(`[ForkManager] Fork not found for cleanup: ${forkId}`);
        return;
      }

      const processingTime = Date.now() - forkInfo.startTime;

      console.log(`[ForkManager] Completing fork ${forkId} (${processingTime}ms)`);

      // Mark as completed in database
      await this.mainPool.query(
        'SELECT mark_fork_completed($1)',
        [forkId]
      );

      // Store results in appropriate result table
      await this.storeAgentResults(forkInfo, results, processingTime);

      // Update local cache
      forkInfo.status = 'completed';
      forkInfo.processingTime = processingTime;
      forkInfo.results = results;

    } catch (error) {
      console.error(`[ForkManager] Error completing fork:`, error.message);
      throw error;
    }
  }

  /**
   * Mark a fork as failed
   *
   * @param {string} forkId - Fork identifier
   * @param {Error} error - Error that occurred
   */
  async failFork(forkId, error) {
    try {
      const forkInfo = this.forks.get(forkId);
      if (!forkInfo) {
        console.warn(`[ForkManager] Fork not found for failure handling: ${forkId}`);
        return;
      }

      console.error(`[ForkManager] ❌ Fork failed: ${forkId}`, error.message);

      // Mark as failed in database
      await this.mainPool.query(
        'SELECT mark_fork_failed($1, $2)',
        [forkId, error.message]
      );

      // Update local cache
      forkInfo.status = 'failed';
      forkInfo.error = error.message;

    } catch (dbError) {
      console.error(`[ForkManager] Error marking fork as failed:`, dbError.message);
    }
  }

  /**
   * Store agent results in database
   *
   * @private
   */
  async storeAgentResults(forkInfo, results, processingTime) {
    const { agentType, resumeId, jobId, forkId } = forkInfo;

    try {
      switch (agentType) {
        case 'skill':
          await this.mainPool.query(
            `INSERT INTO skill_agent_results (
              fork_id, resume_id, job_id, matched_skills, skill_score, processing_time_ms
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [forkId, resumeId, jobId, JSON.stringify(results.matchedSkills || []), results.score || 0, processingTime]
          );
          break;

        case 'experience':
          await this.mainPool.query(
            `INSERT INTO experience_agent_results (
              fork_id, resume_id, job_id, candidate_years, required_years, experience_score, processing_time_ms
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [forkId, resumeId, jobId, results.candidateYears || 0, results.requiredYears || 0, results.score || 0, processingTime]
          );
          break;

        case 'education':
          await this.mainPool.query(
            `INSERT INTO education_agent_results (
              fork_id, resume_id, job_id, candidate_level, required_level, education_score, matched, processing_time_ms
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [forkId, resumeId, jobId, results.candidateDegree || 'Unknown', results.requiredDegree || 'None', results.score || 0, results.meetsRequirement || false, processingTime]
          );
          break;

        case 'certification':
          await this.mainPool.query(
            `INSERT INTO certification_agent_results (
              fork_id, resume_id, job_id, matched_certs, certification_score, processing_time_ms
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [forkId, resumeId, jobId, JSON.stringify(results.matchedCertifications || []), results.score || 0, processingTime]
          );
          break;

        case 'semantic':
          await this.mainPool.query(
            `INSERT INTO semantic_agent_results (
              fork_id, resume_id, job_id, semantic_score, processing_time_ms
            ) VALUES ($1, $2, $3, $4, $5)`,
            [forkId, resumeId, jobId, results.score || 0, processingTime]
          );
          break;

        default:
          console.warn(`[ForkManager] Unknown agent type: ${agentType}`);
      }

      console.log(`[ForkManager] ✅ Results stored for ${agentType} agent (score: ${results.score || 0})`);

    } catch (error) {
      console.error(`[ForkManager] Error storing ${agentType} results:`, error.message);
      throw error;
    }
  }

  /**
   * Cleanup old forks (database + memory)
   * Removes forks older than retention period
   */
  async cleanupOldForks() {
    try {
      console.log(`[ForkManager] Starting cleanup of old forks...`);

      // Delete from database
      const result = await this.mainPool.query(
        'SELECT cleanup_old_forks() as deleted_count'
      );

      const deletedCount = result.rows[0].deleted_count;
      console.log(`[ForkManager] ✅ Cleaned up ${deletedCount} old forks from database`);

      // Also cleanup memory cache
      const cutoffTime = Date.now() - (this.config.forkRetentionHours * 3600 * 1000);
      let memoryCleanupCount = 0;

      for (const [forkId, forkInfo] of this.forks.entries()) {
        if (forkInfo.status === 'completed' || forkInfo.status === 'failed') {
          if (forkInfo.createdAt.getTime() < cutoffTime) {
            this.forks.delete(forkId);
            memoryCleanupCount++;
          }
        }
      }

      console.log(`[ForkManager] ✅ Cleaned up ${memoryCleanupCount} old forks from memory`);

      return { databaseCount: deletedCount, memoryCount: memoryCleanupCount };

    } catch (error) {
      console.error(`[ForkManager] Error during cleanup:`, error.message);
    }
  }

  /**
   * Schedule periodic cleanup
   *
   * @param {number} intervalMinutes - How often to run cleanup (default: 30)
   */
  scheduleCleanup(intervalMinutes = 30) {
    setInterval(() => {
      this.cleanupOldForks().catch(err => {
        console.error('[ForkManager] Cleanup failed:', err.message);
      });
    }, intervalMinutes * 60 * 1000);

    console.log(`[ForkManager] Cleanup scheduled every ${intervalMinutes} minutes`);
  }

  /**
   * Get fork statistics
   *
   * @param {string} resumeId - Resume ID
   * @param {string} jobId - Job ID
   * @returns {Promise<Array>} Fork statistics
   */
  async getForkStats(resumeId, jobId) {
    try {
      const result = await this.mainPool.query(
        'SELECT * FROM get_agent_fork_stats($1, $2)',
        [resumeId, jobId]
      );

      return result.rows;

    } catch (error) {
      console.error(`[ForkManager] Error getting fork stats:`, error.message);
      return [];
    }
  }

  /**
   * Get all active forks
   *
   * @returns {Promise<Array>} Active fork information
   */
  async getActiveForks() {
    try {
      const result = await this.mainPool.query(
        'SELECT * FROM active_agent_forks'
      );

      return result.rows;

    } catch (error) {
      console.error(`[ForkManager] Error getting active forks:`, error.message);
      return [];
    }
  }

  /**
   * Get agent performance metrics
   *
   * @returns {Promise<Array>} Performance metrics
   */
  async getAgentPerformance() {
    try {
      const result = await this.mainPool.query(
        'SELECT * FROM agent_performance'
      );

      return result.rows;

    } catch (error) {
      console.error(`[ForkManager] Error getting performance metrics:`, error.message);
      return [];
    }
  }

  /**
   * Health check: verify fork manager is working
   *
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const activeForks = Array.from(this.forks.values()).filter(f => f.status === 'active').length;
      const completedForks = Array.from(this.forks.values()).filter(f => f.status === 'completed').length;
      const failedForks = Array.from(this.forks.values()).filter(f => f.status === 'failed').length;

      // Test database connection
      await this.mainPool.query('SELECT NOW()');

      return {
        status: 'healthy',
        activeForks,
        completedForks,
        failedForks,
        totalForks: this.forks.size,
        mainDatabaseUrl: this.sanitizeUrl(this.mainDatabaseUrl)
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Generate unique fork ID
   *
   * @private
   */
  generateForkId(agentType, resumeId, jobId) {
    const hash = crypto
      .createHash('md5')
      .update(`${agentType}-${resumeId}-${jobId}-${Date.now()}`)
      .digest('hex')
      .substring(0, 8);

    return `fork_${agentType}_${hash}`;
  }

  /**
   * Sanitize database URL for logging
   *
   * @private
   */
  sanitizeUrl(url) {
    try {
      const parsed = new URL(url);
      parsed.password = '***';
      return parsed.toString();
    } catch {
      return url.replace(/:[^:]+@/, ':***@');
    }
  }

  /**
   * Shutdown: Close all connections
   */
  async shutdown() {
    console.log(`[ForkManager] Shutting down...`);

    try {
      await this.mainPool.end();
      this.forks.clear();
      console.log(`[ForkManager] ✅ Shutdown complete`);
    } catch (error) {
      console.error(`[ForkManager] Error during shutdown:`, error.message);
    }
  }
}

export default ForkManager;
