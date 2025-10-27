-- ============================================================================
-- Migration 005: Phase 3 Advanced Features - Analytics & Monitoring
-- ============================================================================
-- Date: 2025-10-27
-- Purpose: Add analytics, audit, and continuous learning tables for Phase 3
-- ============================================================================

-- Agent execution metrics for performance tracking and debugging
CREATE TABLE IF NOT EXISTS agent_execution_metrics (
  id SERIAL PRIMARY KEY,
  agent_type VARCHAR(50) NOT NULL,
  resume_id VARCHAR(255),
  job_id VARCHAR(255),
  score NUMERIC(5, 2),
  execution_time_ms INT,
  quality_score NUMERIC(3, 2),
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Index for agent_type queries (most common)
CREATE INDEX IF NOT EXISTS idx_agent_execution_type_time
ON agent_execution_metrics(agent_type, timestamp DESC);

-- Index for resume-job pair queries
CREATE INDEX IF NOT EXISTS idx_agent_execution_resume_job
ON agent_execution_metrics(resume_id, job_id);

-- Batch processing jobs tracking
CREATE TABLE IF NOT EXISTS batch_jobs (
  id SERIAL PRIMARY KEY,
  batch_id VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'queued',
  total_pairs INT,
  completed INT DEFAULT 0,
  failed INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  results JSONB
);

-- Index for batch status queries
CREATE INDEX IF NOT EXISTS idx_batch_status_time
ON batch_jobs(status, created_at DESC);

-- Hiring outcomes for continuous learning and accuracy tracking
CREATE TABLE IF NOT EXISTS hiring_outcomes (
  id SERIAL PRIMARY KEY,
  resume_id VARCHAR(255) NOT NULL,
  job_id VARCHAR(255) NOT NULL,
  hired BOOLEAN NOT NULL,
  success_score NUMERIC(3, 2),
  timestamp TIMESTAMP DEFAULT NOW(),
  UNIQUE(resume_id, job_id)
);

-- Index for outcome queries by date
CREATE INDEX IF NOT EXISTS idx_hiring_outcomes_date
ON hiring_outcomes(timestamp DESC);

-- Index for queries filtering by hired status
CREATE INDEX IF NOT EXISTS idx_hiring_outcomes_hired
ON hiring_outcomes(hired);

-- Weight adjustment history for debugging dynamic weighting
CREATE TABLE IF NOT EXISTS weight_adjustments (
  id SERIAL PRIMARY KEY,
  job_id VARCHAR(255),
  detected_industry VARCHAR(100),
  detected_role VARCHAR(100),
  seniority_level VARCHAR(50),
  weights JSONB,
  confidence NUMERIC(3, 2),
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Index for weight history queries
CREATE INDEX IF NOT EXISTS idx_weight_adjustments_time
ON weight_adjustments(timestamp DESC);

-- API usage audit log for monitoring and compliance
CREATE TABLE IF NOT EXISTS api_audit_log (
  id SERIAL PRIMARY KEY,
  endpoint VARCHAR(255),
  method VARCHAR(10),
  user_id VARCHAR(255),
  ip_address VARCHAR(45),
  status_code INT,
  response_time_ms INT,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Index for audit log queries by endpoint
CREATE INDEX IF NOT EXISTS idx_audit_log_endpoint
ON api_audit_log(endpoint, timestamp DESC);

-- Index for audit log queries by user
CREATE INDEX IF NOT EXISTS idx_audit_log_user
ON api_audit_log(user_id, timestamp DESC);

-- Compliance and audit trail for regulatory requirements
CREATE TABLE IF NOT EXISTS compliance_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(255),
  user_id VARCHAR(255),
  description TEXT,
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Index for compliance queries by event type
CREATE INDEX IF NOT EXISTS idx_compliance_event_type
ON compliance_events(event_type, timestamp DESC);

-- Index for compliance queries by entity
CREATE INDEX IF NOT EXISTS idx_compliance_entity
ON compliance_events(entity_type, entity_id);

-- ============================================================================
-- View: Agent Performance Summary (Last 24 hours)
-- ============================================================================
CREATE OR REPLACE VIEW agent_performance_24h AS
SELECT
  agent_type,
  COUNT(*) as total_executions,
  AVG(execution_time_ms) as avg_execution_time,
  MAX(execution_time_ms) as max_execution_time,
  MIN(execution_time_ms) as min_execution_time,
  AVG(quality_score) as avg_quality_score,
  COUNT(CASE WHEN quality_score >= 0.8 THEN 1 END) as high_quality_executions
FROM agent_execution_metrics
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY agent_type;

-- ============================================================================
-- View: Batch Processing Status
-- ============================================================================
CREATE OR REPLACE VIEW batch_processing_summary AS
SELECT
  status,
  COUNT(*) as batch_count,
  SUM(total_pairs) as total_pairs,
  SUM(completed) as completed_pairs,
  SUM(failed) as failed_pairs,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration_seconds
FROM batch_jobs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY status;

-- ============================================================================
-- View: Hiring Accuracy Metrics
-- ============================================================================
CREATE OR REPLACE VIEW hiring_accuracy_metrics AS
SELECT
  COUNT(*) as total_outcomes,
  COUNT(CASE WHEN hired THEN 1 END) as hired_count,
  ROUND(COUNT(CASE WHEN hired THEN 1 END)::NUMERIC / COUNT(*) * 100, 2) as hire_rate_percentage,
  AVG(success_score) as avg_success_score,
  MIN(success_score) as min_success_score,
  MAX(success_score) as max_success_score
FROM hiring_outcomes
WHERE timestamp > NOW() - INTERVAL '30 days';

-- ============================================================================
-- Stored Procedure: Record Agent Execution with Error Handling
-- ============================================================================
CREATE OR REPLACE FUNCTION record_agent_execution(
  p_agent_type VARCHAR,
  p_resume_id VARCHAR,
  p_job_id VARCHAR,
  p_score NUMERIC,
  p_execution_time_ms INT,
  p_quality_score NUMERIC
) RETURNS void AS $$
BEGIN
  INSERT INTO agent_execution_metrics (
    agent_type, resume_id, job_id, score, execution_time_ms, quality_score
  ) VALUES (p_agent_type, p_resume_id, p_job_id, p_score, p_execution_time_ms, p_quality_score);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to record agent execution: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Stored Procedure: Record Hiring Outcome
-- ============================================================================
CREATE OR REPLACE FUNCTION record_hiring_outcome(
  p_resume_id VARCHAR,
  p_job_id VARCHAR,
  p_hired BOOLEAN,
  p_success_score NUMERIC
) RETURNS void AS $$
BEGIN
  INSERT INTO hiring_outcomes (resume_id, job_id, hired, success_score)
  VALUES (p_resume_id, p_job_id, p_hired, p_success_score)
  ON CONFLICT (resume_id, job_id) DO UPDATE SET
    hired = EXCLUDED.hired,
    success_score = EXCLUDED.success_score,
    timestamp = NOW();
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to record hiring outcome: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Stored Procedure: Cleanup Old Metrics
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_old_metrics(
  p_days_to_keep INT DEFAULT 30
) RETURNS TABLE(deleted_count INT) AS $$
DECLARE
  v_deleted INT := 0;
BEGIN
  DELETE FROM agent_execution_metrics
  WHERE timestamp < NOW() - (p_days_to_keep || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE agent_execution_metrics IS 'Tracks individual agent execution times, scores, and quality metrics for performance monitoring and debugging';

COMMENT ON TABLE batch_jobs IS 'Tracks batch processing jobs, including status, progress, and results';

COMMENT ON TABLE hiring_outcomes IS 'Records actual hiring decisions and outcomes to enable continuous learning and accuracy tracking';

COMMENT ON TABLE weight_adjustments IS 'Historical record of dynamic weight adjustments based on job characteristics';

COMMENT ON TABLE api_audit_log IS 'Complete audit trail of API usage for monitoring and compliance';

COMMENT ON TABLE compliance_events IS 'Regulatory compliance events for audit and reporting purposes';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- This migration adds comprehensive Phase 3 analytics and monitoring capabilities.
-- All tables include appropriate indexes for query performance.
-- Views and stored procedures provide convenient access patterns.
-- ============================================================================
