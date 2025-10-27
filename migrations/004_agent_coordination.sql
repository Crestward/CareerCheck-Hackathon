-- Migration: Agent Coordination System for Agentic Postgres
-- Enables multi-agent parallel processing with database forks
-- Created: 2025-10-27
-- PostgreSQL syntax

-- ============================================================================
-- 1. Agent Tracking Tables
-- ============================================================================

/**
 * Agent Forks: Track all database forks created for agents
 * Each agent gets an isolated fork for parallel processing
 */
CREATE TABLE IF NOT EXISTS agent_forks (
  id SERIAL PRIMARY KEY,
  fork_id VARCHAR(255) UNIQUE NOT NULL,
  agent_type VARCHAR(50) NOT NULL,
  parent_db_url TEXT NOT NULL,
  fork_db_url TEXT,
  resume_id VARCHAR(255),
  job_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT
);

/**
 * Agent Channels: MCP communication channels between coordinator and agents
 */
CREATE TABLE IF NOT EXISTS agent_channels (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR(255) UNIQUE NOT NULL,
  fork_id VARCHAR(255) REFERENCES agent_forks(fork_id),
  agent_type VARCHAR(50),
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP
);

/**
 * Agent Messages: Message queue for agent coordination
 */
CREATE TABLE IF NOT EXISTS agent_messages (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR(255) REFERENCES agent_channels(channel_id),
  direction VARCHAR(20),
  message_type VARCHAR(50),
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

-- ============================================================================
-- 2. Agent Results Tables
-- ============================================================================

/**
 * Skill Agent Results: Output from skill matching agent
 */
CREATE TABLE IF NOT EXISTS skill_agent_results (
  id SERIAL PRIMARY KEY,
  fork_id VARCHAR(255),
  resume_id VARCHAR(255),
  job_id VARCHAR(255),
  matched_skills JSONB,
  skill_score NUMERIC(5, 2),
  processing_time_ms INT,
  created_at TIMESTAMP DEFAULT NOW()
);

/**
 * Experience Agent Results: Output from experience validation agent
 */
CREATE TABLE IF NOT EXISTS experience_agent_results (
  id SERIAL PRIMARY KEY,
  fork_id VARCHAR(255),
  resume_id VARCHAR(255),
  job_id VARCHAR(255),
  candidate_years INT,
  required_years INT,
  experience_score NUMERIC(5, 2),
  validation_notes TEXT,
  processing_time_ms INT,
  created_at TIMESTAMP DEFAULT NOW()
);

/**
 * Education Agent Results: Output from education matching agent
 */
CREATE TABLE IF NOT EXISTS education_agent_results (
  id SERIAL PRIMARY KEY,
  fork_id VARCHAR(255),
  resume_id VARCHAR(255),
  job_id VARCHAR(255),
  candidate_level VARCHAR(100),
  required_level VARCHAR(100),
  education_score NUMERIC(5, 2),
  matched BOOLEAN,
  processing_time_ms INT,
  created_at TIMESTAMP DEFAULT NOW()
);

/**
 * Certification Agent Results: Output from certification verification agent
 */
CREATE TABLE IF NOT EXISTS certification_agent_results (
  id SERIAL PRIMARY KEY,
  fork_id VARCHAR(255),
  resume_id VARCHAR(255),
  job_id VARCHAR(255),
  matched_certs JSONB,
  certification_score NUMERIC(5, 2),
  processing_time_ms INT,
  created_at TIMESTAMP DEFAULT NOW()
);

/**
 * Semantic Agent Results: Output from semantic/embedding agent
 */
CREATE TABLE IF NOT EXISTS semantic_agent_results (
  id SERIAL PRIMARY KEY,
  fork_id VARCHAR(255),
  resume_id VARCHAR(255),
  job_id VARCHAR(255),
  semantic_score NUMERIC(5, 2),
  processing_time_ms INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 3. Composite Results (Final Scores from All Agents)
-- ============================================================================

/**
 * Multi-Agent Scores: Final composite scores from all agents
 */
CREATE TABLE IF NOT EXISTS multi_agent_scores (
  id SERIAL PRIMARY KEY,
  resume_id VARCHAR(255),
  job_id VARCHAR(255),
  skill_score NUMERIC(5, 2),
  experience_score NUMERIC(5, 2),
  education_score NUMERIC(5, 2),
  certification_score NUMERIC(5, 2),
  semantic_score NUMERIC(5, 2),
  composite_score NUMERIC(5, 2),
  agents_used INT,
  total_processing_time_ms INT,
  processing_method VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(resume_id, job_id)
);

-- ============================================================================
-- 4. Fork Management Views
-- ============================================================================

/**
 * Active Agent Forks: Currently running agents
 */
CREATE OR REPLACE VIEW active_agent_forks AS
SELECT
  fork_id,
  agent_type,
  resume_id,
  job_id,
  status,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds
FROM agent_forks
WHERE status IN ('pending', 'active')
ORDER BY created_at DESC;

/**
 * Completed Agent Work: Finished agent runs
 */
CREATE OR REPLACE VIEW completed_agent_work AS
SELECT
  agent_type,
  COUNT(*) as total_runs,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as successes,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failures,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as avg_time_ms,
  MAX(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as max_time_ms,
  MIN(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as min_time_ms
FROM agent_forks
WHERE status IN ('completed', 'failed')
GROUP BY agent_type;

/**
 * Agent Performance: Detailed performance metrics
 */
CREATE OR REPLACE VIEW agent_performance AS
SELECT
  af.agent_type,
  COUNT(DISTINCT af.resume_id || '-' || af.job_id) as jobs_processed,
  ROUND(AVG(
    CASE af.agent_type
      WHEN 'skill' THEN sar.skill_score
      WHEN 'experience' THEN ear.experience_score
      WHEN 'education' THEN edr.education_score
      WHEN 'certification' THEN car.certification_score
      WHEN 'semantic' THEN sear.semantic_score
      ELSE 0
    END
  ), 2) as avg_score,
  ROUND(AVG(
    CASE af.agent_type
      WHEN 'skill' THEN sar.processing_time_ms
      WHEN 'experience' THEN ear.processing_time_ms
      WHEN 'education' THEN edr.processing_time_ms
      WHEN 'certification' THEN car.processing_time_ms
      WHEN 'semantic' THEN sear.processing_time_ms
      ELSE 0
    END
  ), 0) as avg_time_ms
FROM agent_forks af
LEFT JOIN skill_agent_results sar ON af.fork_id = sar.fork_id
LEFT JOIN experience_agent_results ear ON af.fork_id = ear.fork_id
LEFT JOIN education_agent_results edr ON af.fork_id = edr.fork_id
LEFT JOIN certification_agent_results car ON af.fork_id = car.fork_id
LEFT JOIN semantic_agent_results sear ON af.fork_id = sear.fork_id
WHERE af.status = 'completed'
GROUP BY af.agent_type;

-- ============================================================================
-- 5. Fork Management Stored Procedures
-- ============================================================================

/**
 * Create a new agent fork and track it
 */
CREATE OR REPLACE FUNCTION create_agent_fork(
  p_fork_id VARCHAR,
  p_agent_type VARCHAR,
  p_parent_db_url TEXT,
  p_resume_id VARCHAR DEFAULT NULL,
  p_job_id VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  fork_id VARCHAR,
  agent_type VARCHAR,
  status VARCHAR,
  created_at TIMESTAMP
) AS $$
BEGIN
  INSERT INTO agent_forks (
    fork_id, agent_type, parent_db_url, resume_id, job_id, status, created_at
  ) VALUES (
    p_fork_id, p_agent_type, p_parent_db_url, p_resume_id, p_job_id, 'pending', NOW()
  );

  RETURN QUERY
  SELECT af.fork_id, af.agent_type, af.status, af.created_at
  FROM agent_forks af
  WHERE af.fork_id = p_fork_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Mark a fork as active (when agent starts)
 */
CREATE OR REPLACE FUNCTION mark_fork_active(
  p_fork_id VARCHAR,
  p_fork_db_url TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE agent_forks
  SET status = 'active',
      started_at = NOW(),
      fork_db_url = p_fork_db_url
  WHERE fork_id = p_fork_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Mark a fork as completed
 */
CREATE OR REPLACE FUNCTION mark_fork_completed(
  p_fork_id VARCHAR
)
RETURNS VOID AS $$
BEGIN
  UPDATE agent_forks
  SET status = 'completed',
      completed_at = NOW()
  WHERE fork_id = p_fork_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Mark a fork as failed with error message
 */
CREATE OR REPLACE FUNCTION mark_fork_failed(
  p_fork_id VARCHAR,
  p_error_message TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE agent_forks
  SET status = 'failed',
      completed_at = NOW(),
      error_message = p_error_message
  WHERE fork_id = p_fork_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Cleanup old completed forks (retention policy)
 * Keeps forks for 24 hours, then deletes them
 */
CREATE OR REPLACE FUNCTION cleanup_old_forks()
RETURNS TABLE (deleted_count INT) AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM agent_forks
  WHERE status IN ('completed', 'failed')
    AND completed_at < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_deleted;
END;
$$ LANGUAGE plpgsql;

/**
 * Get agent fork statistics for a resume-job pair
 */
CREATE OR REPLACE FUNCTION get_agent_fork_stats(
  p_resume_id VARCHAR,
  p_job_id VARCHAR
)
RETURNS TABLE (
  agent_type VARCHAR,
  status VARCHAR,
  processing_time_ms INT,
  error_message TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    af.agent_type,
    af.status,
    (EXTRACT(EPOCH FROM (af.completed_at - af.started_at)))::INT * 1000 as ptime,
    af.error_message
  FROM agent_forks af
  WHERE af.resume_id = p_resume_id
    AND af.job_id = p_job_id
  ORDER BY af.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. Indexes for Performance (PostgreSQL style)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_agent_forks_status_created ON agent_forks(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_forks_agent_created ON agent_forks(agent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_forks_resume_job ON agent_forks(resume_id, job_id);

CREATE INDEX IF NOT EXISTS idx_agent_channels_fork_id ON agent_channels(fork_id);
CREATE INDEX IF NOT EXISTS idx_agent_channels_status ON agent_channels(status);

CREATE INDEX IF NOT EXISTS idx_agent_messages_channel_type ON agent_messages(channel_id, message_type);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created ON agent_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_skill_results_composite ON skill_agent_results(resume_id, job_id, skill_score);
CREATE INDEX IF NOT EXISTS idx_experience_results_composite ON experience_agent_results(resume_id, job_id, experience_score);
CREATE INDEX IF NOT EXISTS idx_education_results_composite ON education_agent_results(resume_id, job_id, education_score);
CREATE INDEX IF NOT EXISTS idx_certification_results_composite ON certification_agent_results(resume_id, job_id, certification_score);
CREATE INDEX IF NOT EXISTS idx_semantic_results_composite ON semantic_agent_results(resume_id, job_id, semantic_score);
CREATE INDEX IF NOT EXISTS idx_multi_agent_scores_composite ON multi_agent_scores(composite_score DESC);

-- ============================================================================
-- 7. Initialization Check
-- ============================================================================

-- Verify tables are created
SELECT 'Agent Coordination Schema Created Successfully' as status;
