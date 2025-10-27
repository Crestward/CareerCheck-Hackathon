-- Migration: Create Knowledge Base Table
-- Stores dynamically discovered skills, certifications, and education
-- that are not in the main database yet

-- ============================================================================
-- Knowledge Base Table: Simple, Effective Learning System
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_base (
  id SERIAL PRIMARY KEY,
  item_name VARCHAR(255) UNIQUE NOT NULL,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('skill', 'certification', 'education')),
  source_count INT DEFAULT 1,                    -- How many resumes mention this item
  first_discovered TIMESTAMP DEFAULT NOW(),      -- When first found
  last_seen TIMESTAMP DEFAULT NOW(),             -- Most recent occurrence
  confidence_estimate FLOAT,                     -- Avg confidence (0-1)
  category_guess VARCHAR(100),                   -- Suggested category
  created_as_id INT,                             -- Link to main table if promoted
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS kb_name_idx ON knowledge_base(item_name);
CREATE INDEX IF NOT EXISTS kb_type_idx ON knowledge_base(item_type);
CREATE INDEX IF NOT EXISTS kb_source_count_idx ON knowledge_base(source_count DESC);
CREATE INDEX IF NOT EXISTS kb_first_discovered_idx ON knowledge_base(first_discovered DESC);

-- ============================================================================
-- Discovery Log: Audit Trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS discovery_audit_log (
  id SERIAL PRIMARY KEY,
  resume_id UUID,
  discovered_items TEXT,                        -- JSON array of discovered items
  discovery_count INT,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dal_resume_idx ON discovery_audit_log(resume_id);
CREATE INDEX IF NOT EXISTS dal_timestamp_idx ON discovery_audit_log(timestamp);

-- ============================================================================
-- Learning Statistics: Track System Improvement
-- ============================================================================

CREATE TABLE IF NOT EXISTS learning_metrics (
  id SERIAL PRIMARY KEY,
  metric_date DATE DEFAULT CURRENT_DATE,
  item_type VARCHAR(20),
  discovered_today INT DEFAULT 0,
  total_in_base INT,
  avg_source_count FLOAT,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(metric_date, item_type)
);

CREATE INDEX IF NOT EXISTS lm_date_idx ON learning_metrics(metric_date DESC);
CREATE INDEX IF NOT EXISTS lm_type_idx ON learning_metrics(item_type);

-- ============================================================================
-- Function: Increment or Create Knowledge Base Item
-- ============================================================================

CREATE OR REPLACE FUNCTION add_to_knowledge_base(
  p_item_name VARCHAR,
  p_item_type VARCHAR,
  p_confidence FLOAT DEFAULT 0.75
)
RETURNS INT AS $$
DECLARE
  v_id INT;
BEGIN
  -- Try to update existing
  UPDATE knowledge_base
  SET
    source_count = source_count + 1,
    last_seen = NOW(),
    confidence_estimate = (confidence_estimate + p_confidence) / 2,
    updated_at = NOW()
  WHERE LOWER(item_name) = LOWER(p_item_name) AND item_type = p_item_type
  RETURNING id INTO v_id;

  -- If not found, insert new
  IF v_id IS NULL THEN
    INSERT INTO knowledge_base
    (item_name, item_type, source_count, confidence_estimate)
    VALUES (p_item_name, p_item_type, 1, p_confidence)
    ON CONFLICT (item_name) DO UPDATE SET
      source_count = knowledge_base.source_count + 1,
      last_seen = NOW()
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- View: Top Discoveries (for analytics)
-- ============================================================================

CREATE OR REPLACE VIEW top_discoveries AS
SELECT
  kb.item_type,
  kb.item_name,
  kb.source_count,
  kb.confidence_estimate,
  kb.first_discovered,
  kb.last_seen,
  ROUND(CAST((kb.source_count::NUMERIC / (SELECT COUNT(*) FROM knowledge_base)) * 100 AS NUMERIC), 2) as percentage
FROM knowledge_base kb
ORDER BY kb.source_count DESC
LIMIT 100;

-- ============================================================================
-- Function: Log Discovery Event
-- ============================================================================

CREATE OR REPLACE FUNCTION log_discovery(
  p_resume_id UUID,
  p_items_json TEXT,
  p_count INT
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO discovery_audit_log (resume_id, discovered_items, discovery_count)
  VALUES (p_resume_id, p_items_json, p_count);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Ready for continuous learning
-- ============================================================================
