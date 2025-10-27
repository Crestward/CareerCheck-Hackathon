/**
 * Agent Coordinator: Orchestrates parallel agent execution
 *
 * Manages:
 * - Agent fork creation
 * - Parallel agent execution
 * - Result aggregation
 * - Composite scoring
 * - Dynamic weight optimization
 * - Error handling and fallbacks
 */

import ForkManager from '../fork-manager.js';
import WeightOptimizer from '../weight-optimizer.js';
import SkillAgent from './skill-agent.js';
import ExperienceAgent from './experience-agent.js';
import EducationAgent from './education-agent.js';
import CertificationAgent from './certification-agent.js';
import SemanticAgent from './semantic-agent.js';

export class AgentCoordinator {
  constructor(config) {
    this.config = config || {};
    this.forkManager = config.forkManager;
    this.databaseUrl = config.databaseUrl;
    this.timeout = config.timeout || 120000; // 2 minutes default
    this.agents = [];
    this.results = {};
    this.startTime = null;
    this.endTime = null;
    this.weightOptimizer = new WeightOptimizer(); // Phase 3 enhancement
    this.jobMetadata = {}; // Store job metadata for weight optimization
    this.useStaticWeights = config.useStaticWeights || false; // Fallback option

    this.log('[Coordinator] Initialized with WeightOptimizer (Phase 3)');
  }

  /**
   * Run all agents in parallel for resume-job analysis
   *
   * @param {string} resumeId - Resume ID
   * @param {string} jobId - Job ID
   * @returns {Promise<Object>} Aggregated results from all agents
   */
  async scoreResume(resumeId, jobId) {
    this.startTime = Date.now();
    this.results = {};
    this.agents = [];

    this.log(`🚀 Starting multi-agent analysis: resume ${resumeId} vs job ${jobId}`);

    try {
      // Create agent instances with forks
      const agents = await this.createAgents(resumeId, jobId);

      // Run all agents in parallel with timeout
      const agentPromises = agents.map(agent => {
        this.log(`▶️  Starting ${agent.agentType} agent (fork: ${agent.forkId})`);
        return Promise.race([
          agent.run(),
          this.createTimeout(agent.agentType)
        ]);
      });

      // Execute in parallel
      const agentResults = await Promise.allSettled(agentPromises);

      // Process results
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const result = agentResults[i];

        if (result.status === 'fulfilled') {
          this.results[agent.agentType] = {
            status: 'completed',
            data: result.value,
            duration: agent.getDuration()
          };
          this.log(`✅ ${agent.agentType} agent completed: ${result.value.score}%`);
        } else {
          this.results[agent.agentType] = {
            status: 'failed',
            error: result.reason?.message || 'Unknown error',
            duration: agent.getDuration()
          };
          this.log(`❌ ${agent.agentType} agent failed: ${result.reason?.message}`);
        }
      }

      this.endTime = Date.now();

      // Aggregate results
      const aggregated = this.aggregateResults(resumeId, jobId);

      this.log(`✅ Multi-agent analysis complete: ${aggregated.composite_score}%`);

      return aggregated;

    } catch (error) {
      this.log(`❌ Coordinator error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create agent instances with database forks
   *
   * @private
   */
  async createAgents(resumeId, jobId) {
    const agentTypes = ['skill', 'experience', 'education', 'certification', 'semantic'];
    const agents = [];

    for (const agentType of agentTypes) {
      try {
        // Create fork for this agent
        const fork = await this.forkManager.createFork(agentType, resumeId, jobId);

        // Create agent instance
        const AgentClass = this.getAgentClass(agentType);
        const agent = new AgentClass({
          agentType,
          resumeId,
          jobId,
          forkManager: this.forkManager,
          forkUrl: fork.databaseUrl,
          forkId: fork.forkId
        });

        agents.push(agent);
      } catch (error) {
        this.log(`⚠️  Failed to create ${agentType} agent: ${error.message}`);
      }
    }

    if (agents.length === 0) {
      throw new Error('Failed to create any agents');
    }

    return agents;
  }

  /**
   * Get agent class by type
   *
   * @private
   */
  getAgentClass(agentType) {
    const classes = {
      skill: SkillAgent,
      experience: ExperienceAgent,
      education: EducationAgent,
      certification: CertificationAgent,
      semantic: SemanticAgent
    };

    return classes[agentType] || SkillAgent;
  }

  /**
   * Create timeout promise
   *
   * @private
   */
  createTimeout(agentType) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${agentType} agent timeout (>${this.timeout}ms)`));
      }, this.timeout);
    });
  }

  /**
   * Aggregate results from all agents
   *
   * @private
   */
  aggregateResults(resumeId, jobId) {
    // Extract scores from each agent
    const scores = {
      skill: this.results.skill?.data?.score || 0,
      experience: this.results.experience?.data?.score || 0,
      education: this.results.education?.data?.score || 0,
      certification: this.results.certification?.data?.score || 0,
      semantic: this.results.semantic?.data?.score || 0
    };

    // Get weight distribution (can be dynamic based on job type)
    const weights = this.getWeights(resumeId, jobId);

    // Calculate composite score
    const composite = this.calculateCompositeScore(scores, weights);

    // Build comprehensive response
    return {
      resume_id: resumeId,
      job_id: jobId,
      composite_score: composite,
      scores: scores,
      weights: weights,
      breakdown: {
        skill: {
          score: scores.skill,
          weight: weights.skill_match,
          weighted: scores.skill * weights.skill_match,
          ...this.results.skill?.data
        },
        experience: {
          score: scores.experience,
          weight: weights.experience,
          weighted: scores.experience * weights.experience,
          ...this.results.experience?.data
        },
        education: {
          score: scores.education,
          weight: weights.education,
          weighted: scores.education * weights.education,
          ...this.results.education?.data
        },
        certification: {
          score: scores.certification,
          weight: weights.certification,
          weighted: scores.certification * weights.certification,
          ...this.results.certification?.data
        },
        semantic: {
          score: scores.semantic,
          weight: weights.semantic,
          weighted: scores.semantic * weights.semantic,
          ...this.results.semantic?.data
        }
      },
      agent_statuses: {
        skill: this.results.skill?.status || 'pending',
        experience: this.results.experience?.status || 'pending',
        education: this.results.education?.status || 'pending',
        certification: this.results.certification?.status || 'pending',
        semantic: this.results.semantic?.status || 'pending'
      },
      processing_time_ms: this.endTime - this.startTime,
      agents_completed: Object.values(this.results).filter(r => r.status === 'completed').length,
      processing_method: 'parallel_agents',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get weight distribution for scoring
   * Uses dynamic WeightOptimizer based on job characteristics (Phase 3)
   * Falls back to default weights if job metadata unavailable
   *
   * @private
   */
  getWeights(resumeId, jobId) {
    // Try to use dynamic weights from WeightOptimizer (Phase 3)
    if (!this.useStaticWeights && this.jobMetadata.title && this.jobMetadata.description) {
      try {
        const dynamicWeights = this.weightOptimizer.getOptimalWeights(
          this.jobMetadata.title,
          this.jobMetadata.description,
          this.jobMetadata
        );

        // Get confidence score for metadata
        const confidence = this.weightOptimizer.getWeightConfidence(
          this.jobMetadata.title,
          this.jobMetadata.description
        );

        // Store weight adjustment for analytics
        if (this.config.database) {
          this.recordWeightAdjustment(jobId, dynamicWeights, confidence).catch(err =>
            this.log(`⚠️  Failed to record weight adjustment: ${err.message}`)
          );
        }

        this.log(`💡 Using dynamic weights (confidence: ${(confidence * 100).toFixed(0)}%)`);

        return dynamicWeights;
      } catch (error) {
        this.log(`⚠️  Failed to calculate dynamic weights: ${error.message}, using defaults`);
      }
    }

    // Default balanced weights (fallback)
    return {
      skill_match: 0.25,
      semantic: 0.20,
      experience: 0.20,
      education: 0.20,
      certification: 0.15
    };
  }

  /**
   * Set job metadata for dynamic weight calculation
   * @param {string} title - Job title
   * @param {string} description - Job description
   */
  setJobMetadata(title, description) {
    this.jobMetadata = { title, description };
    this.log(`📊 Job metadata set: "${title}"`);
  }

  /**
   * Record weight adjustments for analytics (Phase 3)
   * @private
   */
  async recordWeightAdjustment(jobId, weights, confidence) {
    if (!this.config.database) return;

    try {
      const industry = this.weightOptimizer.detectIndustry(this.jobMetadata.description);
      const role = this.weightOptimizer.detectRole(this.jobMetadata.title, this.jobMetadata.description);
      const seniority = this.weightOptimizer.detectSeniorityLevel(this.jobMetadata.title);

      await this.config.database.query(
        `INSERT INTO weight_adjustments (job_id, detected_industry, detected_role, seniority_level, weights, confidence)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [jobId, industry, role, seniority, JSON.stringify(weights), confidence]
      );
    } catch (error) {
      // Fail silently - analytics failure shouldn't break main flow
      console.error('[WeightAnalytics] Error recording adjustment:', error.message);
    }
  }

  /**
   * Calculate composite score from individual scores
   *
   * @private
   */
  calculateCompositeScore(scores, weights) {
    let total = 0;
    let weightSum = 0;

    // Weight each score
    for (const [agent, score] of Object.entries(scores)) {
      const weightKey = agent === 'skill' ? 'skill_match' : agent;
      const weight = weights[weightKey] || 0;

      if (weight > 0) {
        total += score * weight;
        weightSum += weight;
      }
    }

    // Normalize
    const composite = weightSum > 0 ? total / weightSum : 0;

    // Ensure 0-100 range
    return Math.max(0, Math.min(100, Math.round(composite * 100) / 100));
  }

  /**
   * Get summary of agent results
   *
   * @param {boolean} includeDetails - Whether to include full details
   * @returns {Object} Summary object
   */
  getSummary(includeDetails = false) {
    const summary = {
      agentsCompleted: Object.values(this.results).filter(r => r.status === 'completed').length,
      agentsFailed: Object.values(this.results).filter(r => r.status === 'failed').length,
      totalAgents: Object.keys(this.results).length,
      totalDuration: this.endTime - this.startTime,
      results: {}
    };

    for (const [agent, result] of Object.entries(this.results)) {
      if (includeDetails) {
        summary.results[agent] = result;
      } else {
        summary.results[agent] = {
          status: result.status,
          score: result.data?.score || 0,
          duration: result.duration
        };
      }
    }

    return summary;
  }

  /**
   * Log coordinator activity
   *
   * @private
   */
  log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
  }
}

export default AgentCoordinator;
