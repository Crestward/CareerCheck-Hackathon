-- Migration: Create Skills & Certifications Schema with pgvector
-- This replaces hardcoded lists with a dynamic database-driven approach
-- Simplified for PostgreSQL compatibility

-- ============================================================================
-- 1. Create Skills Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS skills (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) UNIQUE NOT NULL,
  category VARCHAR(50) NOT NULL,
  demand_level VARCHAR(20),
  salary_impact_usd INT DEFAULT 0,
  difficulty_level VARCHAR(20),
  trending BOOLEAN DEFAULT false,
  embedding vector(1536),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS skills_name_idx ON skills (name);
CREATE INDEX IF NOT EXISTS skills_category_idx ON skills (category);
CREATE INDEX IF NOT EXISTS skills_demand_idx ON skills (demand_level);

-- Fuzzy matching index (requires pg_trgm extension)
CREATE INDEX IF NOT EXISTS skills_name_trgm_idx ON skills USING gin(name gin_trgm_ops);

-- Full-text search support
ALTER TABLE skills ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS skills_search_idx ON skills USING gin(search_vector);

-- Vector index for semantic search (requires pgvector)
CREATE INDEX IF NOT EXISTS skills_embedding_idx ON skills USING ivfflat (embedding vector_cosine_ops)
WHERE embedding IS NOT NULL;

-- ============================================================================
-- 2. Create Certifications Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS certifications (
  id SERIAL PRIMARY KEY,
  name VARCHAR(250) UNIQUE NOT NULL,
  issuer VARCHAR(150) NOT NULL,
  category VARCHAR(50) NOT NULL,
  salary_impact_usd INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS certifications_issuer_idx ON certifications (issuer);
CREATE INDEX IF NOT EXISTS certifications_category_idx ON certifications (category);
CREATE INDEX IF NOT EXISTS certifications_name_trgm_idx ON certifications USING gin(name gin_trgm_ops);

-- ============================================================================
-- 3. Create Education Levels Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS education_levels (
  id SERIAL PRIMARY KEY,
  level_code INT UNIQUE NOT NULL,
  name VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert education level defaults
INSERT INTO education_levels (level_code, name, description)
VALUES
  (0, 'None', 'No formal education'),
  (1, 'High School', 'High school diploma'),
  (2, 'Associate', 'Associate degree'),
  (3, 'Bachelor', 'Bachelor degree'),
  (4, 'Master', 'Master degree'),
  (5, 'PhD', 'PhD or Doctorate')
ON CONFLICT (level_code) DO NOTHING;

-- ============================================================================
-- 4. Create Job Titles Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_titles (
  id SERIAL PRIMARY KEY,
  title VARCHAR(150) UNIQUE NOT NULL,
  category VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_titles_category_idx ON job_titles (category);

-- ============================================================================
-- 5. Create Skill Relationships Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS skill_relationships (
  id SERIAL PRIMARY KEY,
  skill_id INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  related_skill_id INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50),
  relevance_score FLOAT DEFAULT 0.5,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(skill_id, related_skill_id)
);

CREATE INDEX IF NOT EXISTS skill_rel_skill_idx ON skill_relationships (skill_id);
CREATE INDEX IF NOT EXISTS skill_rel_related_idx ON skill_relationships (related_skill_id);

-- ============================================================================
-- 6. Update Trigger for Full-Text Search
-- ============================================================================

CREATE OR REPLACE FUNCTION update_skills_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.name, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS skills_search_update ON skills;

CREATE TRIGGER skills_search_update
BEFORE INSERT OR UPDATE ON skills
FOR EACH ROW
EXECUTE FUNCTION update_skills_search_vector();

-- ============================================================================
-- Schema is ready for data insertion
-- ============================================================================
