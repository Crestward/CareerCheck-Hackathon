// Continuous Learning System
// Discovers unknown skills, certifications, education from resumes
// Stores them for later processing and enrichment
// Allows system to improve over time without manual curation

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// DISCOVERY PHASE: Identify Unknown Items
// ============================================================================

/**
 * Check which skills are unknown (not in database)
 */
export async function identifyUnknownSkills(extractedSkills, database) {
  if (!extractedSkills || extractedSkills.length === 0) return [];
  if (!database) return []; // Can't check without database

  try {
    const unknownSkills = [];

    for (const skill of extractedSkills) {
      const skillName = skill.name || skill;
      if (!skillName) continue;

      // Check if skill exists in database
      const result = await database.query(
        'SELECT id FROM skills WHERE LOWER(name) = LOWER($1) LIMIT 1',
        [skillName]
      );

      if (result.rows.length === 0) {
        // Unknown skill!
        unknownSkills.push({
          name: skillName,
          confidence: skill.confidence || 0.75,
          source: skill.source || 'regex',
          category: 'unknown' // Will be filled during enrichment
        });
      }
    }

    return unknownSkills;
  } catch (error) {
    console.error('[Learner] Error identifying unknown skills:', error.message);
    return [];
  }
}

/**
 * Check which certifications are unknown
 */
export async function identifyUnknownCertifications(extractedCerts, database) {
  if (!extractedCerts || extractedCerts.length === 0) return [];
  if (!database) return [];

  try {
    const unknownCerts = [];

    for (const cert of extractedCerts) {
      const certName = cert.name || cert;
      if (!certName) continue;

      const result = await database.query(
        'SELECT id FROM certifications WHERE LOWER(name) = LOWER($1) LIMIT 1',
        [certName]
      );

      if (result.rows.length === 0) {
        unknownCerts.push({
          name: certName,
          confidence: cert.confidence || 0.7
        });
      }
    }

    return unknownCerts;
  } catch (error) {
    console.error('[Learner] Error identifying unknown certs:', error.message);
    return [];
  }
}

// ============================================================================
// ENRICHMENT PHASE: Add Metadata to Unknown Items
// ============================================================================

/**
 * Enrich unknown skill with contextual metadata
 */
function enrichUnknownSkill(skill, resumeText) {
  const name = skill.name.toLowerCase();
  const resumeLower = (resumeText || '').toLowerCase();

  // Try to categorize skill
  const skillCategories = {
    'Backend': ['node', 'express', 'django', 'flask', 'spring', 'asp', 'rails', 'laravel', 'gin', 'fiber'],
    'Frontend': ['react', 'vue', 'angular', 'svelte', 'next', 'gatsby', 'nuxt'],
    'Database': ['postgresql', 'mysql', 'mongodb', 'redis', 'dynamodb', 'firestore'],
    'Cloud': ['aws', 'azure', 'gcp', 'heroku', 'vercel', 'netlify'],
    'DevOps': ['docker', 'kubernetes', 'terraform', 'jenkins', 'gitlab', 'github'],
    'Data/ML': ['tensorflow', 'pytorch', 'scikit', 'pandas', 'spark', 'hadoop', 'kafka'],
    'Testing': ['jest', 'pytest', 'selenium', 'cypress', 'mocha'],
    'Security': ['oauth', 'jwt', 'saml', 'tls', 'ssl'],
    'Other': []
  };

  let category = 'Other';
  for (const [cat, keywords] of Object.entries(skillCategories)) {
    if (keywords.some(kw => name.includes(kw))) {
      category = cat;
      break;
    }
  }

  // Estimate salary impact based on category
  const salaryByCategory = {
    'Backend': 8000,
    'Frontend': 6000,
    'Database': 7000,
    'Cloud': 9000,
    'DevOps': 10000,
    'Data/ML': 12000,
    'Testing': 3000,
    'Security': 11000,
    'Other': 3000
  };

  // Estimate demand level
  const demandByCategory = {
    'Backend': 'high',
    'Frontend': 'high',
    'Database': 'high',
    'Cloud': 'emerging',
    'DevOps': 'high',
    'Data/ML': 'emerging',
    'Testing': 'medium',
    'Security': 'high',
    'Other': 'low'
  };

  return {
    name: skill.name,
    confidence: skill.confidence,
    category,
    salary_estimate: salaryByCategory[category] || 3000,
    demand_level: demandByCategory[category] || 'low',
    source: skill.source
  };
}

/**
 * Enrich unknown certification with metadata
 */
function enrichUnknownCertification(cert, resumeText) {
  const name = cert.name.toLowerCase();

  // Try to extract issuer
  let issuer = 'Unknown';
  const issuerMap = {
    'AWS': ['aws', 'amazon'],
    'Google': ['google', 'gcp'],
    'Microsoft': ['azure', 'microsoft'],
    'Kubernetes': ['kubernetes', 'cka', 'ckad'],
    'Cisco': ['cisco', 'ccna', 'ccnp'],
    'CompTIA': ['security+', 'network+', 'a+'],
    'Oracle': ['oracle', 'ocp'],
    'Salesforce': ['salesforce'],
    'Linux': ['linux', 'lpi', 'rhce'],
    'HashiCorp': ['terraform', 'vault', 'consul']
  };

  for (const [issuername, patterns] of Object.entries(issuerMap)) {
    if (patterns.some(p => name.includes(p))) {
      issuer = issuername;
      break;
    }
  }

  return {
    name: cert.name,
    issuer,
    confidence: cert.confidence,
    salary_estimate: 4000, // Average cert boost
    category: 'Unclassified'
  };
}

// ============================================================================
// STORAGE PHASE: Save Unknown Items to Database
// ============================================================================

/**
 * Store unknown skills in database
 * Returns IDs for tracking in discovery log
 */
export async function storeUnknownSkills(unknownSkills, resumeId, resumeText, database) {
  if (unknownSkills.length === 0) return [];

  try {
    const stored = [];

    for (const skill of unknownSkills) {
      const enriched = enrichUnknownSkill(skill, resumeText);

      const result = await database.query(
        `INSERT INTO unknown_skills
         (name, discovered_from_resume_id, resume_context, confidence_score,
          suggested_category, salary_estimate, demand_level, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
         ON CONFLICT (name) DO UPDATE SET
           discovered_from_resume_id = $2,
           confidence_score = GREATEST(unknown_skills.confidence_score, $4),
           updated_at = NOW()
         RETURNING id`,
        [
          enriched.name,
          resumeId,
          `Found in resume context`,
          enriched.confidence,
          enriched.category,
          enriched.salary_estimate,
          enriched.demand_level
        ]
      );

      if (result.rows.length > 0) {
        stored.push({
          id: result.rows[0].id,
          name: enriched.name,
          type: 'skill'
        });
      }
    }

    return stored;
  } catch (error) {
    console.error('[Learner] Error storing unknown skills:', error.message);
    return [];
  }
}

/**
 * Store unknown certifications in database
 */
export async function storeUnknownCertifications(
  unknownCerts,
  resumeId,
  resumeText,
  database
) {
  if (unknownCerts.length === 0) return [];

  try {
    const stored = [];

    for (const cert of unknownCerts) {
      const enriched = enrichUnknownCertification(cert, resumeText);

      const result = await database.query(
        `INSERT INTO unknown_certifications
         (name, issuer, discovered_from_resume_id, resume_context, confidence_score, category, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         ON CONFLICT (name, issuer) DO UPDATE SET
           confidence_score = GREATEST(unknown_certifications.confidence_score, $5),
           updated_at = NOW()
         RETURNING id`,
        [
          enriched.name,
          enriched.issuer,
          resumeId,
          `Found in resume`,
          enriched.confidence,
          enriched.category
        ]
      );

      if (result.rows.length > 0) {
        stored.push({
          id: result.rows[0].id,
          name: enriched.name,
          type: 'certification'
        });
      }
    }

    return stored;
  } catch (error) {
    console.error('[Learner] Error storing unknown certs:', error.message);
    return [];
  }
}

// ============================================================================
// TRACKING PHASE: Log Discoveries for Analytics
// ============================================================================

/**
 * Log discovery to audit trail
 */
export async function logDiscovery(resumeId, itemType, itemName, unknownItemId, database) {
  if (!database) return;

  try {
    await database.query(
      `INSERT INTO discovery_log
       (resume_id, item_type, item_name, unknown_item_id, discovery_method, processing_status)
       VALUES ($1, $2, $3, $4, 'continuous_learning', 'pending')`,
      [resumeId, itemType, itemName, unknownItemId]
    );
  } catch (error) {
    console.error('[Learner] Error logging discovery:', error.message);
  }
}

/**
 * Update learning statistics
 */
export async function updateLearningStats(database) {
  if (!database) return;

  try {
    // Skills stats
    await database.query(
      `INSERT INTO learning_stats (stat_date, item_type, discovered_count)
       SELECT CURRENT_DATE, 'skill', COUNT(*)
       FROM unknown_skills
       WHERE DATE(discovered_at) = CURRENT_DATE AND status = 'pending'
       ON CONFLICT (stat_date, item_type) DO UPDATE SET
         discovered_count = EXCLUDED.discovered_count,
         last_updated = NOW()`
    );

    // Certifications stats
    await database.query(
      `INSERT INTO learning_stats (stat_date, item_type, discovered_count)
       SELECT CURRENT_DATE, 'certification', COUNT(*)
       FROM unknown_certifications
       WHERE DATE(discovered_at) = CURRENT_DATE AND status = 'pending'
       ON CONFLICT (stat_date, item_type) DO UPDATE SET
         discovered_count = EXCLUDED.discovered_count,
         last_updated = NOW()`
    );
  } catch (error) {
    console.error('[Learner] Error updating stats:', error.message);
  }
}

// ============================================================================
// MAIN ORCHESTRATION FUNCTION
// ============================================================================

/**
 * Main entry point: Discover, enrich, store unknown items
 * Returns map of all unknown items for scoring
 */
export async function learnFromResume(resumeData, database) {
  if (!database) return { skills: [], certifications: [], education: [] };

  try {
    const resumeId = resumeData.id || uuidv4();
    const resumeText = resumeData.text || '';
    const extractedSkills = resumeData.skills || [];
    const extractedCerts = resumeData.certifications || [];

    // Phase 1: Identify unknown items
    const unknownSkills = await identifyUnknownSkills(extractedSkills, database);
    const unknownCerts = await identifyUnknownCertifications(extractedCerts, database);

    // Track total discoveries
    const totalDiscoveries = unknownSkills.length + unknownCerts.length;
    if (totalDiscoveries > 0) {
      console.log(`[Learner] 🧠 Discovered ${totalDiscoveries} new items`);
    }

    // Phase 2 & 3: Enrich and Store
    let storedSkills = [];
    let storedCerts = [];

    if (unknownSkills.length > 0) {
      storedSkills = await storeUnknownSkills(unknownSkills, resumeId, resumeText, database);
    }

    if (unknownCerts.length > 0) {
      storedCerts = await storeUnknownCertifications(
        unknownCerts,
        resumeId,
        resumeText,
        database
      );
    }

    // Phase 4: Log discoveries
    for (const stored of storedSkills) {
      await logDiscovery(resumeId, 'skill', stored.name, stored.id, database);
    }

    for (const stored of storedCerts) {
      await logDiscovery(resumeId, 'certification', stored.name, stored.id, database);
    }

    // Phase 5: Update statistics
    if (totalDiscoveries > 0) {
      await updateLearningStats(database);
    }

    return {
      skills: unknownSkills.map(s => enrichUnknownSkill(s, resumeText)),
      certifications: unknownCerts.map(c => enrichUnknownCertification(c, resumeText)),
      discoveryCount: totalDiscoveries,
      resumeId
    };
  } catch (error) {
    console.error('[Learner] ❌ Error in learnFromResume:', error.message);
    return { skills: [], certifications: [], education: [], discoveryCount: 0 };
  }
}

/**
 * Get pending items for admin review
 */
export async function getPendingDiscoveries(database, limit = 50) {
  if (!database) return [];

  try {
    const result = await database.query(
      'SELECT * FROM pending_discoveries ORDER BY discovered_at DESC LIMIT $1',
      [limit]
    );

    return result.rows || [];
  } catch (error) {
    console.error('[Learner] Error fetching pending discoveries:', error.message);
    return [];
  }
}

/**
 * Promote unknown item to main database
 */
export async function promoteToMain(itemType, unknownId, database) {
  if (!database) return false;

  try {
    if (itemType === 'skill') {
      // Get enrichment data
      const result = await database.query(
        'SELECT name, suggested_category, salary_estimate, demand_level FROM unknown_skills WHERE id = $1',
        [unknownId]
      );

      if (result.rows.length === 0) return false;

      const { name, suggested_category, salary_estimate, demand_level } = result.rows[0];

      // Call promotion function
      await database.query(
        'SELECT promote_unknown_skill($1, $2, $3, $4)',
        [unknownId, suggested_category || 'Other', salary_estimate || 0, demand_level || 'low']
      );

      return true;
    }

    return false;
  } catch (error) {
    console.error('[Learner] Error promoting item:', error.message);
    return false;
  }
}

export default {
  learnFromResume,
  identifyUnknownSkills,
  identifyUnknownCertifications,
  storeUnknownSkills,
  storeUnknownCertifications,
  getPendingDiscoveries,
  promoteToMain
};
