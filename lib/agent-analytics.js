/**
 * AgentAnalytics: Track, measure, and optimize agent performance
 * Provides comprehensive metrics for system monitoring and debugging
 */

export class AgentAnalytics {
  constructor(database) {
    this.pool = database;
  }

  /**
   * Record agent execution for analytics
   */
  async recordAgentExecution(agentType, resumeId, jobId, results, executionTime) {
    const timestamp = new Date();
    const scoreQuality = this.assessScoreQuality(results.score);

    try {
      await this.pool.query(
        `INSERT INTO agent_execution_metrics (
          agent_type, resume_id, job_id, score, execution_time_ms,
          quality_score, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [agentType, resumeId, jobId, results.score, executionTime, scoreQuality, timestamp]
      );
    } catch (error) {
      console.error(`Failed to record agent execution for ${agentType}:`, error.message);
      // Don't throw - analytics failure shouldn't break main flow
    }
  }

  /**
   * Get agent performance summary for a specific agent type
   */
  async getAgentPerformanceSummary(agentType, timeframeHours = 24) {
    const cutoff = new Date(Date.now() - timeframeHours * 3600 * 1000);

    try {
      const result = await this.pool.query(
        `SELECT
          agent_type,
          COUNT(*) as total_executions,
          AVG(execution_time_ms) as avg_execution_time,
          MAX(execution_time_ms) as max_execution_time,
          MIN(execution_time_ms) as min_execution_time,
          STDDEV(execution_time_ms) as stddev_execution_time,
          AVG(score) as avg_score,
          AVG(quality_score) as avg_quality,
          COUNT(CASE WHEN quality_score >= 0.8 THEN 1 END)::FLOAT / COUNT(*) as quality_percentage
        FROM agent_execution_metrics
        WHERE agent_type = $1 AND timestamp > $2
        GROUP BY agent_type`,
        [agentType, cutoff]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error(`Failed to get performance summary for ${agentType}:`, error.message);
      return null;
    }
  }

  /**
   * Get all agents performance summary
   */
  async getAllAgentsPerformanceSummary(timeframeHours = 24) {
    const cutoff = new Date(Date.now() - timeframeHours * 3600 * 1000);

    try {
      const result = await this.pool.query(
        `SELECT
          agent_type,
          COUNT(*) as total_executions,
          AVG(execution_time_ms) as avg_execution_time,
          MAX(execution_time_ms) as max_execution_time,
          MIN(execution_time_ms) as min_execution_time,
          AVG(score) as avg_score,
          AVG(quality_score) as avg_quality
        FROM agent_execution_metrics
        WHERE timestamp > $1
        GROUP BY agent_type
        ORDER BY agent_type`,
        [cutoff]
      );

      return result.rows;
    } catch (error) {
      console.error('Failed to get all agents performance summary:', error.message);
      return [];
    }
  }

  /**
   * Get slowest agents
   */
  async getSlowestAgents(limit = 10) {
    try {
      const result = await this.pool.query(
        `SELECT
          agent_type,
          AVG(execution_time_ms) as avg_time,
          MAX(execution_time_ms) as max_time,
          COUNT(*) as executions
        FROM agent_execution_metrics
        WHERE timestamp > NOW() - INTERVAL '7 days'
        GROUP BY agent_type
        ORDER BY avg_time DESC
        LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      console.error('Failed to get slowest agents:', error.message);
      return [];
    }
  }

  /**
   * Get highest quality agents
   */
  async getHighestQualityAgents(limit = 10) {
    try {
      const result = await this.pool.query(
        `SELECT
          agent_type,
          AVG(quality_score) as avg_quality,
          COUNT(*) as executions,
          AVG(execution_time_ms) as avg_time
        FROM agent_execution_metrics
        WHERE timestamp > NOW() - INTERVAL '7 days'
        GROUP BY agent_type
        ORDER BY avg_quality DESC
        LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      console.error('Failed to get highest quality agents:', error.message);
      return [];
    }
  }

  /**
   * Get detailed agent metrics for a resume-job pair
   */
  async getAgentMetricsForPair(resumeId, jobId) {
    try {
      const result = await this.pool.query(
        `SELECT
          agent_type,
          score,
          execution_time_ms,
          quality_score,
          timestamp
        FROM agent_execution_metrics
        WHERE resume_id = $1 AND job_id = $2
        ORDER BY timestamp DESC`,
        [resumeId, jobId]
      );

      return result.rows;
    } catch (error) {
      console.error('Failed to get agent metrics for pair:', error.message);
      return [];
    }
  }

  /**
   * Assess score quality (0-1)
   * Higher score = more confident in the result
   */
  assessScoreQuality(score) {
    // Penalize extreme scores (too high or too low)
    // Mid-range scores (40-80) are typically more realistic
    if (!Number.isFinite(score)) return 0;
    if (score < 20 || score > 80) return 0.7; // Extreme scores less reliable
    return 0.9; // Mid-range scores more reliable
  }

  /**
   * Get trend analysis for an agent over time
   */
  async getAgentTrend(agentType, hours = 24) {
    const cutoff = new Date(Date.now() - hours * 3600 * 1000);

    try {
      const result = await this.pool.query(
        `SELECT
          DATE_TRUNC('hour', timestamp) as hour,
          COUNT(*) as executions,
          AVG(execution_time_ms) as avg_time,
          AVG(score) as avg_score,
          AVG(quality_score) as avg_quality
        FROM agent_execution_metrics
        WHERE agent_type = $1 AND timestamp > $2
        GROUP BY DATE_TRUNC('hour', timestamp)
        ORDER BY hour DESC`,
        [agentType, cutoff]
      );

      return result.rows;
    } catch (error) {
      console.error(`Failed to get trend for ${agentType}:`, error.message);
      return [];
    }
  }

  /**
   * Get system-wide health score
   */
  async getSystemHealthScore(hours = 24) {
    const cutoff = new Date(Date.now() - hours * 3600 * 1000);

    try {
      const result = await this.pool.query(
        `SELECT
          COUNT(*) as total_executions,
          AVG(quality_score) as avg_quality,
          COUNT(CASE WHEN quality_score >= 0.8 THEN 1 END)::FLOAT / COUNT(*) as quality_percentage,
          AVG(execution_time_ms) as avg_time,
          COUNT(DISTINCT agent_type) as active_agents
        FROM agent_execution_metrics
        WHERE timestamp > $1`,
        [cutoff]
      );

      const metrics = result.rows[0];
      if (!metrics || metrics.total_executions === 0) {
        return null;
      }

      // Calculate health score (0-100)
      const qualityScore = metrics.quality_percentage * 100 * 0.5; // 50% weight on quality
      const speedScore = Math.max(0, 100 - (metrics.avg_time / 100) * 50); // 50% weight on speed
      const healthScore = (qualityScore + speedScore) / 2;

      return {
        health_score: Math.round(healthScore),
        total_executions: parseInt(metrics.total_executions),
        quality_percentage: Math.round(metrics.quality_percentage * 100),
        avg_execution_time_ms: Math.round(metrics.avg_time),
        active_agents: parseInt(metrics.active_agents),
        status: healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'degraded' : 'critical'
      };
    } catch (error) {
      console.error('Failed to get system health score:', error.message);
      return null;
    }
  }
}

export default AgentAnalytics;
