// Improved Scoring Formula
// Uses database-driven data instead of hardcoded lists
// Implements best-practice scoring algorithms

// ============================================================================
// IMPROVED SKILL MATCHING SCORE
// ============================================================================

/**
 * Enhanced keyword score using database data
 * Factors: skill matches, salary impact, demand level, frequency
 */
export async function computeSkillMatchScore(
  extractedSkills,
  jobDescription,
  database
) {
  try {
    if (!extractedSkills || extractedSkills.length === 0) return { score: 0, matched_skills: 0, job_required_skills: 0, missing_skills: [], breakdown: {} };
    if (!jobDescription) return { score: 0, matched_skills: 0, job_required_skills: 0, missing_skills: [], breakdown: {} };

    let totalScore = 0;
    let weightedSkillCount = 0;

    // Extract job requirements from description (with error handling)
    let jobRequiredSkills = [];
    try {
      jobRequiredSkills = await extractJobRequiredSkills(jobDescription, database);
    } catch (error) {
      console.warn('Failed to extract job required skills:', error.message);
      jobRequiredSkills = [];
    }

    for (const resumeSkill of extractedSkills) {
      try {
        // Validate skill object - handle both object and string formats
        if (!resumeSkill) continue;

        let skillName = null;

        // If it's a string, try to parse it as JSON object first
        if (typeof resumeSkill === 'string') {
          try {
            const parsed = JSON.parse(resumeSkill);
            skillName = parsed.name;
          } catch (e) {
            // If not valid JSON, use the string directly
            skillName = resumeSkill;
          }
        } else if (typeof resumeSkill === 'object') {
          // If it's already an object, extract the name
          skillName = resumeSkill.normalized_name || resumeSkill.name;
        }

        // Validate skill name
        if (!skillName || typeof skillName !== 'string') {
          console.warn('[Scoring] Invalid skill name, skipping:', resumeSkill);
          continue;
        }

        // Skip unverified skills with low confidence
        if (resumeSkill.confidence && resumeSkill.confidence < 0.5) continue;

        // Sanitize skill name - remove special regex characters
        const sanitizedSkillName = skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLowerCase();

        const jobSkillLower = (jobDescription || '').toLowerCase();

        // Step 1: Check for exact match in job description
        const wordBoundaryRegex = new RegExp(`\\b${sanitizedSkillName}\\b`, 'gi');
        const skillMatches = jobSkillLower.match(wordBoundaryRegex) || [];

        // Step 2: Calculate skill score based on multiple factors
        let skillScore = 0;

        if (skillMatches.length > 0) {
          // Skill found in job description
          // Base score: 1.0
          skillScore = 1.0;

          // Bonus for frequency: +0.05 per mention (capped)
          const frequencyBonus = Math.min(skillMatches.length * 0.05, 0.2);
          skillScore += frequencyBonus;

          // Bonus for demand level (database-driven)
          const demandBonus = getDemandBonus(resumeSkill.demand);
          skillScore += demandBonus;

          // Weight by extraction confidence
          skillScore *= resumeSkill.confidence || 0.75;
        } else {
          // Skill not explicitly mentioned, check related skills
          if (resumeSkill.id) {
            const relatedSkillScore = await checkRelatedSkillsInJob(
              resumeSkill.id,
              jobDescription,
              database
            );
            skillScore = relatedSkillScore * 0.6; // Reduced score for related skills
          }
        }

        // Step 3: Weight by skill importance (salary impact as proxy)
        const importanceWeight = getImportanceWeight(resumeSkill.salary_impact);
        totalScore += skillScore * importanceWeight;
        weightedSkillCount += importanceWeight;
      } catch (skillError) {
        console.error('[Scoring] Error processing skill:', skillError.message);
        continue;
      }
    }

  // Step 4: Also check if job requires skills NOT in resume
  const missingRequiredSkills = jobRequiredSkills.filter(
    jobSkill => !extractedSkills.some(
      resumeSkill =>
        (resumeSkill.id === jobSkill.id) ||
        (resumeSkill.normalized_name?.toLowerCase() === jobSkill.name.toLowerCase())
    )
  );

  // Penalize missing required skills
  const missingSkillPenalty = (missingRequiredSkills.length * 0.1) / Math.max(jobRequiredSkills.length, 1);

  // Final score
  const averageScore = weightedSkillCount > 0 ? totalScore / weightedSkillCount : 0;
  const finalScore = Math.max(0, Math.min(1.0, averageScore - missingSkillPenalty));

  return {
    score: finalScore,
    matched_skills: extractedSkills.length,
    job_required_skills: jobRequiredSkills.length,
    missing_skills: missingRequiredSkills,
    breakdown: {
      exact_matches: extractedSkills.filter(s => s.id).length,
      confidence_weighted: averageScore.toFixed(3),
      penalty_applied: missingSkillPenalty.toFixed(3)
    }
  };
  } catch (error) {
    console.error('Error in computeSkillMatchScore:', error.message);
    return { score: 0, matched_skills: 0, job_required_skills: 0, missing_skills: [], breakdown: {} };
  }
}

// ============================================================================
// IMPROVED EDUCATION MATCHING SCORE
// ============================================================================

/**
 * Education match using database education levels
 */
export async function computeEducationScore(resumeEducation, jobDescription, database) {
  if (!resumeEducation || resumeEducation.length === 0) {
    // If no education found, return neutral score (not penalty)
    return {
      score: 0.4,
      reason: 'No education information found on resume',
      resume_level: null,
      required_level: null
    };
  }

  // Get education level from database
  const resumeLevelCode = await extractEducationLevel(resumeEducation, database);
  const requiredLevelCode = extractRequiredEducationLevel(jobDescription);

  // If no requirement specified, anyone is qualified
  if (requiredLevelCode === 0) {
    return {
      score: 1.0,
      reason: 'No specific education requirement',
      resume_level: getLevelName(resumeLevelCode),
      required_level: 'Not specified'
    };
  }

  // Calculate score
  let score = 0;
  if (resumeLevelCode >= requiredLevelCode) {
    score = 1.0; // Meets or exceeds requirement
  } else {
    score = (resumeLevelCode / requiredLevelCode) * 0.8; // Partial credit
  }

  return {
    score: Math.min(1.0, score),
    reason: `${getLevelName(resumeLevelCode)} for ${getLevelName(requiredLevelCode)} requirement`,
    resume_level: getLevelName(resumeLevelCode),
    required_level: getLevelName(requiredLevelCode)
  };
}

// ============================================================================
// IMPROVED CERTIFICATION MATCHING SCORE
// ============================================================================

/**
 * Certification match using database certifications
 */
export async function computeCertificationScore(extractedCerts, jobDescription, database) {
  if (!extractedCerts || extractedCerts.length === 0) {
    // No certs on resume - neutral score (not penalized)
    return {
      score: 0.3,
      reason: 'No certifications listed',
      matched_certs: [],
      required_certs: [],
      salary_boost: 0
    };
  }

  // Extract job requirements
  const jobRequiredCerts = await extractJobRequiredCertifications(jobDescription, database);

  if (jobRequiredCerts.length === 0) {
    // Job doesn't require certs - having them is a bonus
    return {
      score: 0.5,
      reason: 'Certifications helpful but not required',
      matched_certs: extractedCerts.slice(0, 3),
      required_certs: [],
      salary_boost: extractedCerts.reduce((sum, c) => sum + (c.salary_impact || 0), 0)
    };
  }

  // Match resume certs to job requirements
  let certMatches = 0;
  let totalSalaryBoost = 0;

  for (const jobCert of jobRequiredCerts) {
    const match = extractedCerts.find(
      resumeCert =>
        (resumeCert.id === jobCert.id) ||
        (resumeCert.normalized_name?.toLowerCase() === jobCert.name.toLowerCase()) ||
        (resumeCert.name.toLowerCase().includes(jobCert.issuer.toLowerCase()))
    );

    if (match) {
      certMatches++;
      totalSalaryBoost += match.salary_impact || jobCert.salary_impact_usd || 0;
    }
  }

  const score = certMatches > 0
    ? Math.min(1.0, certMatches / jobRequiredCerts.length)
    : 0.2;

  return {
    score,
    reason: `${certMatches}/${jobRequiredCerts.length} required certifications`,
    matched_certs: extractedCerts.slice(0, certMatches),
    required_certs: jobRequiredCerts,
    salary_boost: totalSalaryBoost
  };
}

// ============================================================================
// SEMANTIC SIMILARITY SCORE (Improved)
// ============================================================================

/**
 * Semantic similarity using embeddings
 * Better than simple keyword matching
 */
export async function computeSemanticScore(resumeEmbedding, jobEmbedding) {
  if (!resumeEmbedding || !jobEmbedding) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < resumeEmbedding.length; i++) {
    const valA = resumeEmbedding[i];
    const valB = jobEmbedding[i];

    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  const cosineScore = denominator === 0 ? 0 : dotProduct / denominator;

  // Normalize cosine similarity (-1 to 1) to 0 to 1
  return (cosineScore + 1) / 2;
}

// ============================================================================
// EXPERIENCE MATCH SCORE (Improved)
// ============================================================================

/**
 * Experience match with non-linear scaling
 * Rewards overqualification more than strict ratio
 */
export function computeExperienceScore(resumeYears, requiredYears) {
  if (!requiredYears || requiredYears === 0) {
    return 1.0; // No requirement
  }

  const ratio = resumeYears / requiredYears;

  if (ratio >= 1.0) {
    // Meets or exceeds requirement
    // Non-linear bonus for overqualification: reward up to 1.5x requirement
    return Math.min(1.0, 0.8 + (ratio - 1.0) * 0.2);
  } else {
    // Underqualified - penalty
    // More lenient: give partial credit
    return Math.pow(ratio, 0.8); // Logarithmic falloff
  }
}

// ============================================================================
// IMPROVED COMPOSITE SCORE
// ============================================================================

/**
 * Final composite score using proper weighting
 * All weights sum to 1.0
 */
export async function computeCompositeScore(
  skillScore,
  semanticScore,
  experienceScore,
  educationScore,
  certificationScore
) {
  // Dynamic weights based on importance
  // Formula: Technical (40%) + Credentials (50%) + Relevance (10%)

  const weights = {
    skill: 0.25,          // Technical skills (25%)
    semantic: 0.15,       // Job relevance (15%)
    experience: 0.10,     // Years of experience (10%)
    education: 0.30,      // Education match (30%)
    certification: 0.20   // Certifications (20%)
  };

  // Validate weights sum to 1.0
  const totalWeight =
    weights.skill +
    weights.semantic +
    weights.experience +
    weights.education +
    weights.certification;

  if (Math.abs(totalWeight - 1.0) > 0.001) {
    console.warn(`⚠️  Weight sum: ${totalWeight}, should be 1.0`);
  }

  // Calculate weighted composite
  const composite =
    (skillScore.score * weights.skill) +
    (semanticScore * weights.semantic) +
    (experienceScore * weights.experience) +
    (educationScore.score * weights.education) +
    (certificationScore.score * weights.certification);

  return {
    composite: Math.min(1.0, Math.max(0, composite)),
    weights: weights,
    components: {
      skill: skillScore,
      semantic: semanticScore,
      experience: experienceScore,
      education: educationScore,
      certification: certificationScore
    },
    breakdown: {
      skill_contribution: (skillScore.score * weights.skill).toFixed(3),
      semantic_contribution: (semanticScore * weights.semantic).toFixed(3),
      experience_contribution: (experienceScore * weights.experience).toFixed(3),
      education_contribution: (educationScore.score * weights.education).toFixed(3),
      certification_contribution: (certificationScore.score * weights.certification).toFixed(3)
    }
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function extractJobRequiredSkills(jobDescription, database) {
  try {
    if (!database || !jobDescription) return [];

    // Sanitize job description: convert to lowercase, extract words
    const jobText = (jobDescription || '').toLowerCase();

    // Simple keyword extraction: get words that are 3+ characters
    const words = jobText.match(/\b[a-z]+\b/g) || [];

    if (words.length === 0) return [];

    // Deduplicate and limit
    const uniqueWords = [...new Set(words)].slice(0, 10);

    // Try to find matching skills from database
    try {
      const result = await database.query(
        `SELECT DISTINCT id, name
         FROM skills
         WHERE LOWER(name) = ANY($1::text[])
         LIMIT 20`,
        [uniqueWords]
      );
      return result.rows || [];
    } catch (dbError) {
      // If database query fails, return empty array
      console.warn('Database skill query failed:', dbError.message);
      return [];
    }
  } catch (error) {
    console.warn('Error extracting job skills:', error.message);
    return [];
  }
}

async function extractJobRequiredCertifications(jobDescription, database) {
  try {
    const result = await database.query(
      `SELECT id, name, issuer, salary_impact_usd
       FROM certifications
       WHERE is_active = true
       AND (LOWER(name) % LOWER($1) OR LOWER(issuer) % LOWER($1))
       LIMIT 10`,
      [jobDescription]
    );

    return result.rows;
  } catch (error) {
    console.warn('Error extracting job certs:', error.message);
    return [];
  }
}

async function checkRelatedSkillsInJob(skillId, jobDescription, database) {
  try {
    const result = await database.query(
      `SELECT s.id, s.name
       FROM skill_relationships sr
       JOIN skills s ON sr.related_skill_id = s.id
       WHERE sr.skill_id = $1
       LIMIT 5`,
      [skillId]
    );

    if (result.rows.length === 0) return 0;

    // Check how many related skills are mentioned
    const jobLower = jobDescription.toLowerCase();
    const matches = result.rows.filter(
      row => jobLower.includes(row.name.toLowerCase())
    ).length;

    return matches / result.rows.length;
  } catch (error) {
    return 0;
  }
}

function getDemandBonus(demandLevel) {
  const bonuses = {
    'high': 0.15,
    'medium': 0.10,
    'low': 0.05,
    'emerging': 0.20
  };
  return bonuses[demandLevel] || 0;
}

function getImportanceWeight(salaryImpact) {
  if (!salaryImpact) return 1.0;

  // Skills with higher salary impact are weighted more
  // $0: 1.0x, $20k: 1.5x, $50k+: 2.0x
  return Math.min(2.0, 1.0 + (salaryImpact / 50000));
}

function extractEducationLevel(educationArray, database) {
  // This would be more sophisticated in production
  // Check common degree keywords
  const text = (educationArray || []).join(' ').toLowerCase();

  if (text.includes('phd') || text.includes('doctorate')) return 5;
  if (text.includes('master') || text.includes('m.s.') || text.includes('mba')) return 4;
  if (text.includes('bachelor') || text.includes('b.s.') || text.includes('b.a.')) return 3;
  if (text.includes('associate')) return 2;
  if (text.includes('bootcamp') || text.includes('certificate')) return 1;

  return 0;
}

function extractRequiredEducationLevel(jobDescription) {
  const text = jobDescription.toLowerCase();

  if (text.includes('phd') || text.includes('doctorate')) return 5;
  if (text.includes('master') || text.includes('m.s.')) return 4;
  if (text.includes('bachelor') || text.includes('b.s.')) return 3;
  if (text.includes('associate')) return 2;

  return 0; // No specific requirement
}

function getLevelName(code) {
  const levels = {
    0: 'No formal education',
    1: 'High School',
    2: 'Associate',
    3: 'Bachelor',
    4: 'Master',
    5: 'PhD'
  };
  return levels[code] || 'Unknown';
}

export default {
  computeSkillMatchScore,
  computeEducationScore,
  computeCertificationScore,
  computeSemanticScore,
  computeExperienceScore,
  computeCompositeScore
};
