/**
 * Education Agent: Matches education level requirements
 *
 * Evaluates:
 * - Candidate's highest education level
 * - Job's education requirement
 * - Field of study relevance
 * - Additional certifications and qualifications
 */

import BaseAgent from './base-agent.js';

// Education level hierarchy (higher = more advanced)
const EDUCATION_LEVELS = {
  'high school': 1,
  'high school diploma': 1,
  'ged': 1,
  'associate': 2,
  'bachelors': 3,
  'bachelor': 3,
  'bachelor degree': 3,
  'bs': 3,
  'ba': 3,
  'b.s.': 3,
  'b.a.': 3,
  'masters': 4,
  'master': 4,
  'master degree': 4,
  'ms': 4,
  'ma': 4,
  'm.s.': 4,
  'm.a.': 4,
  'mba': 4,
  'doctorate': 5,
  'doctor': 5,
  'phd': 5,
  'ph.d.': 5,
  'md': 5,
  'professional degree': 5
};

// Tech-relevant fields
const TECH_FIELDS = [
  'computer science', 'engineering', 'electrical', 'mechanical', 'software',
  'information technology', 'it', 'data science', 'machine learning', 'ai',
  'artificial intelligence', 'web development', 'mobile development',
  'cybersecurity', 'network', 'database', 'systems', 'mathematics', 'physics',
  'statistics', 'programming', 'computer engineering'
];

export class EducationAgent extends BaseAgent {
  constructor(config) {
    super(config);
    this.agentType = 'education';
  }

  /**
   * Analyze education match between resume and job
   *
   * @protected
   * @param {Object} resume - Resume data from fork database
   * @param {Object} job - Job data from fork database
   * @returns {Promise<Object>} Results with education score and analysis
   */
  async analyze(resume, job) {
    this.log('🎓 Starting education analysis...');

    try {
      // Extract education data
      const candidateEducation = this.extractEducationLevel(resume);
      const requiredEducation = this.extractRequiredEducation(job);
      const fieldRelevance = this.assessFieldRelevance(resume, job);

      this.log(`Candidate education: ${candidateEducation.level}, Required: ${requiredEducation.level}`);

      // Calculate match
      const score = this.calculateEducationScore(
        candidateEducation.tier,
        requiredEducation.tier,
        fieldRelevance
      );

      const results = {
        score: this.normalizeScore(score),
        candidateDegree: candidateEducation.level,
        candidateTier: candidateEducation.tier,
        requiredDegree: requiredEducation.level,
        requiredTier: requiredEducation.tier,
        meetsRequirement: candidateEducation.tier >= requiredEducation.tier,
        fieldRelevance: fieldRelevance,
        fieldRelevanceScore: this.calculateFieldRelevanceScore(fieldRelevance),
        educationPath: this.describeEducationPath(resume),
        scoreReason: this.getEducationScoreReason(
          candidateEducation.tier,
          requiredEducation.tier,
          fieldRelevance
        ),
        processingTimeMs: this.getDuration()
      };

      this.log(`✅ Education analysis complete: ${results.score}%`, results);

      return results;

    } catch (error) {
      this.log(`❌ Error in education analysis: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract education level from resume
   *
   * @private
   */
  extractEducationLevel(resume) {
    if (!resume) {
      return { level: 'Unknown', tier: 0 };
    }

    // Try direct field first
    if (resume.education_level && typeof resume.education_level === 'string') {
      return this.parseEducationLevel(resume.education_level);
    }

    // Try education field
    if (resume.education && typeof resume.education === 'string') {
      return this.parseEducationLevel(resume.education);
    }

    // Try as array
    if (resume.education && Array.isArray(resume.education)) {
      const highest = resume.education
        .map(edu => this.parseEducationLevel(edu))
        .sort((a, b) => b.tier - a.tier)[0];
      return highest || { level: 'Unknown', tier: 0 };
    }

    // Search in raw text
    if (resume.raw_text && typeof resume.raw_text === 'string') {
      return this.extractFromText(resume.raw_text);
    }

    return { level: 'Unknown', tier: 0 };
  }

  /**
   * Extract required education from job description
   *
   * @private
   */
  extractRequiredEducation(job) {
    if (!job) {
      return { level: 'None Required', tier: 0 };
    }

    // Check specific field
    if (job.required_education && typeof job.required_education === 'string') {
      return this.parseEducationLevel(job.required_education);
    }

    // Search description
    if (job.description && typeof job.description === 'string') {
      const edu = this.extractFromText(job.description);
      if (edu.tier > 0) return edu;
    }

    // Search requirements
    if (job.requirements && typeof job.requirements === 'string') {
      const edu = this.extractFromText(job.requirements);
      if (edu.tier > 0) return edu;
    }

    // Check title for hints
    if (job.title && typeof job.title === 'string') {
      if (job.title.toLowerCase().includes('phd') || job.title.toLowerCase().includes('doctorate')) {
        return { level: 'Doctorate', tier: 5 };
      }
      if (job.title.toLowerCase().includes('master')) {
        return { level: 'Masters', tier: 4 };
      }
    }

    return { level: 'None Required', tier: 0 };
  }

  /**
   * Parse education level from text
   *
   * @private
   */
  parseEducationLevel(text) {
    if (!text || typeof text !== 'string') {
      return { level: 'Unknown', tier: 0 };
    }

    const textLower = text.toLowerCase();

    // Find matching education level
    for (const [level, tier] of Object.entries(EDUCATION_LEVELS)) {
      if (textLower.includes(level)) {
        return { level: this.formatLevel(level), tier };
      }
    }

    return { level: 'Unknown', tier: 0 };
  }

  /**
   * Extract education from free text
   *
   * @private
   */
  extractFromText(text) {
    if (!text || typeof text !== 'string') {
      return { level: 'Unknown', tier: 0 };
    }

    // Look for education keywords with context
    const patterns = [
      /(?:degree|studied|earned|completed).*?(doctorate|phd|masters?|bachelor|associate|high school|ged)/gi,
      /(phd|doctorate|masters?|bachelor|associate|high school|ged)(?:\s+in|\s+degree|\s+from)?/gi,
      /(?:degree|studied|earned|completed)\s+(?:in\s+)?([a-z\s]+)\s+(?:from|at)?/gi
    ];

    let highestTier = 0;
    let foundLevel = 'Unknown';

    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match) {
        const level = match[1] || match[0];
        const parsed = this.parseEducationLevel(level);
        if (parsed.tier > highestTier) {
          highestTier = parsed.tier;
          foundLevel = parsed.level;
        }
      }
    }

    return { level: foundLevel, tier: highestTier };
  }

  /**
   * Format education level for display
   *
   * @private
   */
  formatLevel(level) {
    const formatted = {
      'high school': 'High School Diploma',
      'high school diploma': 'High School Diploma',
      'ged': 'GED',
      'associate': "Associate's Degree",
      'bachelors': "Bachelor's Degree",
      'bachelor': "Bachelor's Degree",
      'bachelor degree': "Bachelor's Degree",
      'masters': "Master's Degree",
      'master': "Master's Degree",
      'master degree': "Master's Degree",
      'mba': 'MBA',
      'doctorate': 'Doctorate',
      'doctor': 'Doctorate',
      'phd': 'PhD'
    };

    return formatted[level.toLowerCase()] || level;
  }

  /**
   * Assess relevance of field of study to job
   *
   * @private
   */
  assessFieldRelevance(resume, job) {
    const relevance = {
      relevant: false,
      field: 'Unknown',
      relevanceScore: 0
    };

    if (!resume) return relevance;

    // Extract field from resume
    const field = this.extractFieldOfStudy(resume);
    if (!field) return relevance;

    relevance.field = field;

    // Check if field is tech-related
    const fieldLower = field.toLowerCase();
    const isTechField = TECH_FIELDS.some(tech => fieldLower.includes(tech));

    if (!isTechField) {
      relevance.relevant = false;
      return relevance;
    }

    // If job is tech-oriented, mark as relevant
    relevance.relevant = true;
    relevance.relevanceScore = 0.95; // High relevance

    // Check if field matches job specifics
    if (job && job.description) {
      const jobDescLower = job.description.toLowerCase();
      if (jobDescLower.includes(fieldLower)) {
        relevance.relevanceScore = 1.0; // Perfect match
      } else if (jobDescLower.includes(TECH_FIELDS.find(t => fieldLower.includes(t)) || '')) {
        relevance.relevanceScore = 0.9; // Close match
      }
    }

    return relevance;
  }

  /**
   * Extract field of study from resume
   *
   * @private
   */
  extractFieldOfStudy(resume) {
    if (!resume) return null;

    // Check specific field
    if (resume.field_of_study && typeof resume.field_of_study === 'string') {
      return resume.field_of_study;
    }

    // Look in education field
    if (resume.education && typeof resume.education === 'string') {
      // Try to find field keywords
      for (const field of TECH_FIELDS) {
        if (resume.education.toLowerCase().includes(field)) {
          return field;
        }
      }
    }

    return null;
  }

  /**
   * Calculate education match score
   *
   * @private
   */
  calculateEducationScore(candidateTier, requiredTier, fieldRelevance) {
    // If no education required, max points for any degree
    if (requiredTier === 0) {
      return 100;
    }

    // Exact match
    if (candidateTier === requiredTier) {
      const baseScore = 100;
      const fieldBonus = fieldRelevance.relevant ? 0 : -5;
      return baseScore + fieldBonus;
    }

    // Exceeds requirement
    if (candidateTier > requiredTier) {
      return 100; // Overqualification is acceptable
    }

    // Below requirement - penalize proportionally
    const gap = requiredTier - candidateTier;
    const percentage = (candidateTier / requiredTier) * 100;

    // Scale penalty based on gap size
    let penalty = 0;
    if (gap === 1) penalty = 25; // One level down: 75%
    if (gap === 2) penalty = 50; // Two levels down: 50%
    if (gap >= 3) penalty = 75; // Three+ levels down: 25%

    return Math.max(0, 100 - penalty);
  }

  /**
   * Calculate field relevance score
   *
   * @private
   */
  calculateFieldRelevanceScore(fieldRelevance) {
    if (!fieldRelevance.relevant) return 0;
    return Math.round(fieldRelevance.relevanceScore * 100);
  }

  /**
   * Get explanation for education score
   *
   * @private
   */
  getEducationScoreReason(candidateTier, requiredTier, fieldRelevance) {
    const tierNames = {
      0: 'None',
      1: 'High School',
      2: "Associate's",
      3: "Bachelor's",
      4: "Master's",
      5: 'Doctorate'
    };

    const candidate = tierNames[candidateTier] || 'Unknown';
    const required = tierNames[requiredTier] || 'Unknown';

    if (requiredTier === 0) {
      return 'No specific education requirement';
    }

    if (candidateTier === requiredTier) {
      const fieldStatus = fieldRelevance.relevant
        ? ' in a relevant field'
        : '';
      return `Perfect match: ${candidate}${fieldStatus}`;
    }

    if (candidateTier > requiredTier) {
      return `Exceeds requirement: ${candidate} (${required} required)`;
    }

    const gap = requiredTier - candidateTier;
    return `Below requirement: ${candidate} (${required} required, ${gap} level gap)`;
  }

  /**
   * Describe the education path
   *
   * @private
   */
  describeEducationPath(resume) {
    if (!resume || !resume.education) {
      return 'No education information found';
    }

    if (typeof resume.education === 'string') {
      return resume.education.substring(0, 200) + '...';
    }

    if (Array.isArray(resume.education)) {
      return resume.education.slice(0, 3).join('; ');
    }

    return 'Education information available';
  }

  /**
   * Define required result fields for validation
   *
   * @protected
   */
  getRequiredResultFields() {
    return ['score', 'candidateDegree', 'candidateTier', 'requiredDegree', 'requiredTier', 'meetsRequirement'];
  }
}

export default EducationAgent;
