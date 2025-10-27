/**
 * Base Agent: Abstract base class for all specialized agents
 *
 * Provides:
 * - Fork management
 * - Database access
 * - Error handling
 * - Logging
 * - Result aggregation
 */

import { Pool } from 'pg';

export class BaseAgent {
  /**
   * Initialize a base agent
   *
   * @param {Object} config - Agent configuration
   * @param {string} config.agentType - Type of agent (skill, experience, etc.)
   * @param {string} config.resumeId - Resume being analyzed
   * @param {string} config.jobId - Job being matched
   * @param {ForkManager} config.forkManager - Fork manager instance
   * @param {string} config.forkUrl - Fork database URL
   */
  constructor(config) {
    this.agentType = config.agentType;
    this.resumeId = config.resumeId;
    this.jobId = config.jobId;
    this.forkManager = config.forkManager;
    this.forkUrl = config.forkUrl;
    this.forkId = config.forkId;

    // Database pool for this fork
    this.forkPool = null;

    // Tracking
    this.startTime = null;
    this.endTime = null;
    this.status = 'initialized';
    this.error = null;
    this.results = null;

    this.log(`[${this.agentType.toUpperCase()}] Initialized for resume ${this.resumeId} vs job ${this.jobId}`);
  }

  /**
   * Run the agent analysis
   * Main entry point for agent processing
   */
  async run() {
    this.startTime = Date.now();
    this.status = 'running';

    try {
      this.log(`Starting analysis...`);

      // Connect to fork database with limited connections
      this.log(`Connecting to fork database...`);
      this.forkPool = new Pool({
        connectionString: this.forkUrl,
        max: 1,  // Limit to 1 connection per agent
        idleTimeoutMillis: 5000
      });

      // Verify database connection is working
      try {
        this.log(`Verifying database connection...`);
        await this.forkPool.query('SELECT 1 as ping');
        this.log(`✅ Database connection verified`);
      } catch (connError) {
        throw new Error(`Failed to connect to fork database: ${connError.message}`);
      }

      // Load required data
      this.log(`Loading resume and job data...`);
      const { resume, job } = await this.loadData();
      this.log(`✅ Data loaded`);

      // Perform agent-specific analysis
      this.log(`Performing agent-specific analysis...`);
      this.results = await this.analyze(resume, job);
      this.log(`✅ Analysis complete, score: ${this.results.score}%`);

      // Validate results
      this.validateResults(this.results);

      // Mark as completed
      this.status = 'completed';
      this.endTime = Date.now();

      this.log(`✅ Analysis complete (${this.getDuration()}ms), storing results...`);

      // Store results in database
      await this.forkManager.completeFork(this.forkId, this.results);
      this.log(`✅ Results stored in database`);

      return this.results;

    } catch (error) {
      this.status = 'failed';
      this.error = error;
      this.endTime = Date.now();

      this.log(`❌ Analysis failed: ${error.message}`);

      // Report failure to fork manager
      await this.forkManager.failFork(this.forkId, error);

      throw error;

    } finally {
      // Cleanup
      if (this.forkPool) {
        await this.forkPool.end();
      }
    }
  }

  /**
   * Load resume and job data from fork
   *
   * @protected
   * @returns {Promise<Object>} { resume, job }
   */
  async loadData() {
    try {
      const [resumeResult, jobResult] = await Promise.all([
        this.forkPool.query('SELECT * FROM resumes WHERE resume_id = $1', [this.resumeId]),
        this.forkPool.query('SELECT * FROM jobs WHERE job_id = $1', [this.jobId])
      ]);

      if (resumeResult.rows.length === 0) {
        throw new Error(`Resume not found: ${this.resumeId}`);
      }

      if (jobResult.rows.length === 0) {
        throw new Error(`Job not found: ${this.jobId}`);
      }

      return {
        resume: resumeResult.rows[0],
        job: jobResult.rows[0]
      };

    } catch (error) {
      this.log(`❌ Error loading data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Analyze resume vs job
   * Override in subclass with specific logic
   *
   * @protected
   * @abstract
   * @throws {Error} Must be implemented by subclass
   */
  async analyze(resume, job) {
    throw new Error('analyze() must be implemented by subclass');
  }

  /**
   * Validate agent results
   * Checks that results are properly formatted
   *
   * @protected
   */
  validateResults(results) {
    if (!results || typeof results !== 'object') {
      throw new Error('Results must be an object');
    }

    // Subclasses can override for specific validation
    const requiredFields = this.getRequiredResultFields();
    for (const field of requiredFields) {
      if (!(field in results)) {
        throw new Error(`Missing required field in results: ${field}`);
      }
    }

    // Validate score is numeric and in valid range
    if ('score' in results) {
      if (typeof results.score !== 'number') {
        throw new Error(`Score must be a number, got ${typeof results.score}`);
      }
      if (!Number.isFinite(results.score)) {
        throw new Error(`Score must be a finite number, got ${results.score}`);
      }
      if (results.score < 0 || results.score > 100) {
        throw new Error(`Score must be between 0-100, got ${results.score}`);
      }
    }
  }

  /**
   * Get required result fields for this agent
   *
   * @protected
   * @returns {Array<string>}
   */
  getRequiredResultFields() {
    return ['score']; // Base requirement: every agent must produce a score
  }

  /**
   * Execute a query on the fork database
   *
   * @protected
   */
  async query(sql, params = []) {
    try {
      return await this.forkPool.query(sql, params);
    } catch (error) {
      this.log(`❌ Query error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute multiple queries in transaction
   *
   * @protected
   */
  async transaction(queries) {
    const client = await this.forkPool.connect();

    try {
      await client.query('BEGIN');

      const results = [];
      for (const { sql, params } of queries) {
        results.push(await client.query(sql, params));
      }

      await client.query('COMMIT');

      return results;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;

    } finally {
      client.release();
    }
  }

  /**
   * Normalize score to 0-100 range
   *
   * @protected
   */
  normalizeScore(score) {
    if (typeof score !== 'number') {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
  }

  /**
   * Log agent activity
   *
   * @protected
   */
  log(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;

    if (data) {
      console.log(logMessage, JSON.stringify(data, null, 2));
    } else {
      console.log(logMessage);
    }
  }

  /**
   * Get processing duration in milliseconds
   *
   * @protected
   */
  getDuration() {
    if (!this.startTime || !this.endTime) {
      return 0;
    }
    return this.endTime - this.startTime;
  }

  /**
   * Get agent status summary
   *
   * @returns {Object}
   */
  getStatus() {
    return {
      agentType: this.agentType,
      status: this.status,
      resumeId: this.resumeId,
      jobId: this.jobId,
      duration: this.getDuration(),
      error: this.error?.message || null,
      results: this.results
    };
  }
}

export default BaseAgent;
