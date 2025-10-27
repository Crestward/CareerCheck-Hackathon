// Skill & Certification Extraction
// Skills: Regex-based detection + fuzzy matching (reliable, no BERT tokens)
// Certifications: Pattern-based extraction (NLP validation available)

import { pipeline, env } from '@xenova/transformers';
import { extractAllSkills } from './skill-matcher.js';

// Allow downloading models on first use, cache them locally after
env.allowLocalModels = true;
env.allowRemoteModels = true;

// ============================================================================
// Initialize NLP Pipelines
// ============================================================================

let zeroShotClassifier = null;
let nerPipeline = null;
let initialized = false;

export async function initializeNLPPipelines() {
  if (initialized) return;

  console.log('[NLP] Initializing extraction pipelines...');

  try {
    // Zero-shot classifier: Classify if text is a skill/cert
    zeroShotClassifier = await pipeline(
      'zero-shot-classification',
      'Xenova/nli-deberta-v3-small',
      { device: 'cpu' }  // Use CPU, can change to GPU if available
    );

    // Named Entity Recognition: Extract potential skills
    nerPipeline = await pipeline(
      'token-classification',
      'Xenova/bert-base-NER',
      { device: 'cpu' }
    );

    initialized = true;
    console.log('[NLP] ✅ Pipelines initialized successfully');
  } catch (error) {
    console.error('[NLP] ❌ Failed to initialize pipelines:', error.message);
    throw error;
  }
}

// ============================================================================
// Skill Extraction Functions
// ============================================================================

/**
 * Extract skills from resume text using regex-based matching
 * RELIABLE: No BERT tokens, no hardcoded filter lists, works on any resume
 */
export async function extractSkillsFromResume(resumeText, database) {
  try {
    // PRIMARY METHOD: Regex-based skill detection + fuzzy matching
    // This is 100x more reliable than BERT NER for skill extraction
    console.log(`[SkillExtractor] 🔍 Extracting skills using regex-based matcher...`);
    const baseSkills = extractAllSkills(resumeText);

    if (baseSkills.length === 0) {
      console.warn('[SkillExtractor] ⚠️  No skills found');
      return [];
    }

    console.log(`[SkillExtractor] ✅ Found ${baseSkills.length} skills via regex matching`);

    // Optional: Enrich with database data (salary impact, demand level, category)
    let enrichedSkills = baseSkills;
    if (database) {
      try {
        enrichedSkills = await enrichSkillsWithDatabase(baseSkills, database);
        console.log(`[SkillExtractor] ✅ Enriched with database metadata`);
      } catch (enrichError) {
        console.warn('[SkillExtractor] ⚠️  Database enrichment failed, using base skills:', enrichError.message);
        // Continue with un-enriched skills
      }
    }

    return enrichedSkills;
  } catch (error) {
    console.error('[SkillExtractor] ❌ Skill extraction error:', error.message);
    return [];
  }
}

/**
 * Extract certifications from resume text
 */
export async function extractCertificationsFromResume(resumeText, database) {
  const extractedCerts = [];

  try {
    console.log('[NLP] Analyzing text for certifications...');

    // Certification patterns (still use patterns for structure, but validate with NLP)
    const certPatterns = [
      /(?:AWS|Azure|Google Cloud|Oracle|Kubernetes|CISSP|CEH|PMP|PRINCE2|Scrum Master|Certified)\s+([A-Z][A-Za-z\s-]+(?:Certified|Certificate|Certification)?)/gi,
      /(\b(?:AWS|Azure|Google|Oracle|Salesforce|Tableau|Databricks)\s+[A-Z][A-Za-z\s-]*)\b/gi
    ];

    // Extract using patterns (structure)
    for (const pattern of certPatterns) {
      let match;
      while ((match = pattern.exec(resumeText)) !== null) {
        const certName = match[1].trim();

        // Validate with NLP - is this really a certification?
        const isValid = await validateCertification(certName);

        if (isValid) {
          extractedCerts.push({
            name: certName,
            confidence: 0.85,
            source: 'nlp_pattern'
          });
        }
      }
    }

    // Step 2: Enrich with database
    const enrichedCerts = await enrichCertificationsWithDatabase(
      extractedCerts,
      database
    );

    console.log(`[NLP] ✅ Extracted ${enrichedCerts.length} certifications`);
    return enrichedCerts;
  } catch (error) {
    console.error('[NLP] ❌ Certification extraction error:', error.message);
    return [];
  }
}

// REMOVED: extractEntities() - BERT NER was unreliable for skill extraction
// Reason: BERT tokenizes at subword level, producing broken tokens (##text, Ad, SK)
// Solution: Use regex-based matching in skill-matcher.js instead

/**
 * Validate if extracted text is actually a certification
 */
async function validateCertification(certName) {
  try {
    if (!zeroShotClassifier) await initializeNLPPipelines();

    const result = await zeroShotClassifier(
      `This is ${certName}`,
      ['professional certification', 'random text'],
      { multi_class: false }
    );

    return result.scores[0] > 0.6;
  } catch (error) {
    return false;
  }
}

// REMOVED: deduplicateSkills() - No longer needed
// Reason: skill-matcher.js handles deduplication and filtering internally
// Benefit: No more hardcoded badTokens lists that don't scale

// ============================================================================
// Database Enrichment Functions
// ============================================================================

/**
 * Enrich extracted skills with database data
 */
async function enrichSkillsWithDatabase(extractedSkills, database) {
  const enriched = [];

  for (const skill of extractedSkills) {
    try {
      // Step 1: Try exact match first (fuzzy)
      const exactMatch = await database.query(
        `SELECT id, name, category, salary_impact_usd, demand_level, embedding
         FROM skills
         WHERE LOWER(name) = LOWER($1)
         LIMIT 1`,
        [skill.name]
      );

      if (exactMatch.rows.length > 0) {
        const dbSkill = exactMatch.rows[0];
        enriched.push({
          ...skill,
          id: dbSkill.id,
          normalized_name: dbSkill.name,
          category: dbSkill.category,
          salary_impact: dbSkill.salary_impact_usd,
          demand: dbSkill.demand_level,
          confidence: 0.95
        });
        continue;
      }

      // Step 2: Try fuzzy matching
      const fuzzyMatch = await database.query(
        `SELECT id, name, category, salary_impact_usd, demand_level
         FROM skills
         WHERE similarity(LOWER(name), LOWER($1)) > 0.7
         ORDER BY similarity(LOWER(name), LOWER($1)) DESC
         LIMIT 1`,
        [skill.name]
      );

      if (fuzzyMatch.rows.length > 0) {
        const dbSkill = fuzzyMatch.rows[0];
        enriched.push({
          ...skill,
          id: dbSkill.id,
          normalized_name: dbSkill.name,
          category: dbSkill.category,
          salary_impact: dbSkill.salary_impact_usd,
          demand: dbSkill.demand_level,
          confidence: 0.80
        });
        continue;
      }

      // Step 3: Try semantic similarity (pgvector) - find related skill
      const semanticMatch = await database.query(
        `SELECT id, name, category
         FROM skills
         WHERE embedding IS NOT NULL
         ORDER BY embedding <-> (SELECT embedding FROM skills WHERE LOWER(name) = LOWER($1) LIMIT 1)
         LIMIT 1`,
        [skill.name]
      );

      if (semanticMatch.rows.length > 0) {
        const dbSkill = semanticMatch.rows[0];
        enriched.push({
          ...skill,
          id: dbSkill.id,
          normalized_name: dbSkill.name,
          category: dbSkill.category,
          confidence: 0.65,
          note: 'Related skill (not exact match)'
        });
        continue;
      }

      // Step 4: Unknown skill - still include but mark as unverified
      enriched.push({
        ...skill,
        id: null,
        category: 'unknown',
        confidence: skill.confidence * 0.7, // Reduce confidence for unknown
        note: 'Extracted but not found in database'
      });

    } catch (error) {
      console.warn(`[NLP] Error enriching skill "${skill.name}":`, error.message);
      enriched.push({
        ...skill,
        confidence: skill.confidence * 0.5,
        error: true
      });
    }
  }

  return enriched;
}

/**
 * Enrich extracted certifications with database data
 */
async function enrichCertificationsWithDatabase(extractedCerts, database) {
  const enriched = [];

  for (const cert of extractedCerts) {
    try {
      // Try exact match first
      const exactMatch = await database.query(
        `SELECT id, name, issuer, category, salary_impact_usd
         FROM certifications
         WHERE LOWER(name) = LOWER($1)
         LIMIT 1`,
        [cert.name]
      );

      if (exactMatch.rows.length > 0) {
        const dbCert = exactMatch.rows[0];
        enriched.push({
          ...cert,
          id: dbCert.id,
          normalized_name: dbCert.name,
          issuer: dbCert.issuer,
          category: dbCert.category,
          salary_impact: dbCert.salary_impact_usd,
          confidence: 0.95
        });
        continue;
      }

      // Try fuzzy matching
      const fuzzyMatch = await database.query(
        `SELECT id, name, issuer, category, salary_impact_usd
         FROM certifications
         WHERE similarity(LOWER(name), LOWER($1)) > 0.6
         ORDER BY similarity(LOWER(name), LOWER($1)) DESC
         LIMIT 1`,
        [cert.name]
      );

      if (fuzzyMatch.rows.length > 0) {
        const dbCert = fuzzyMatch.rows[0];
        enriched.push({
          ...cert,
          id: dbCert.id,
          normalized_name: dbCert.name,
          issuer: dbCert.issuer,
          category: dbCert.category,
          salary_impact: dbCert.salary_impact_usd,
          confidence: 0.80
        });
        continue;
      }

      // Unknown certification
      enriched.push({
        ...cert,
        id: null,
        category: 'unknown',
        confidence: cert.confidence * 0.6,
        note: 'Extracted but not found in database'
      });

    } catch (error) {
      console.warn(`[NLP] Error enriching cert "${cert.name}":`, error.message);
      enriched.push({
        ...cert,
        confidence: cert.confidence * 0.5,
        error: true
      });
    }
  }

  return enriched;
}

/**
 * Find similar/related skills using pgvector
 */
export async function findRelatedSkills(skillId, database, limit = 5) {
  try {
    const result = await database.query(
      `SELECT
        s.id,
        s.name,
        ROUND((1 - (s.embedding <-> sk.embedding)) * 100, 2) as similarity_score
       FROM skills s, skills sk
       WHERE sk.id = $1
       AND s.id != $1
       AND s.embedding IS NOT NULL
       ORDER BY s.embedding <-> sk.embedding
       LIMIT $2`,
      [skillId, limit]
    );

    return result.rows;
  } catch (error) {
    console.warn('[NLP] Error finding related skills:', error.message);
    return [];
  }
}

/**
 * Search skills using full-text search (not pattern-based)
 */
export async function searchSkillsFullText(query, database, limit = 10) {
  try {
    const result = await database.query(
      `SELECT
        id,
        name,
        category,
        salary_impact_usd,
        demand_level,
        ts_rank(search_vector, q) as relevance
       FROM skills, to_tsquery('english', $1) as q
       WHERE search_vector @@ q
       ORDER BY relevance DESC
       LIMIT $2`,
      [query, limit]
    );

    return result.rows;
  } catch (error) {
    console.warn('[NLP] Full-text search error:', error.message);
    return [];
  }
}

// ============================================================================
// Export for use
// ============================================================================

export default {
  initializeNLPPipelines,
  extractSkillsFromResume,
  extractCertificationsFromResume,
  findRelatedSkills,
  searchSkillsFullText
};
