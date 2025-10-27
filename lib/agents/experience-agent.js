/**
 * Experience Agent: Validates years of experience requirement
 *
 * Evaluates:
 * - Years of experience in resume
 * - Years required by job
 * - Match score based on requirement fulfillment
 * - Career progression analysis
 */

import BaseAgent from './base-agent.js';

export class ExperienceAgent extends BaseAgent {
  constructor(config) {
    super(config);
    this.agentType = 'experience';
  }

  /**
   * Analyze experience match between resume and job
   *
   * @protected
   * @param {Object} resume - Resume data from fork database
   * @param {Object} job - Job data from fork database
   * @returns {Promise<Object>} Results with experience score and analysis
   */
  async analyze(resume, job) {
    this.log('Starting experience analysis...');

    try {
      // Extract experience data
      const candidateYears = this.extractYearsOfExperience(resume);
      const requiredYears = this.extractRequiredYears(job);

      this.log(`Candidate years: ${candidateYears}, Required years: ${requiredYears}`);

      // Calculate match
      const score = this.calculateExperienceScore(candidateYears, requiredYears);
      const analysis = this.analyzeCareerProgression(resume);

      const results = {
        score: this.normalizeScore(score),
        candidateYears: candidateYears,
        requiredYears: requiredYears,
        meetsRequirement: candidateYears >= requiredYears,
        scoreReason: this.getScoreReason(candidateYears, requiredYears),
        overqualified: candidateYears > requiredYears * 2,
        underqualified: candidateYears < requiredYears,
        careerAnalysis: analysis,
        processingTimeMs: this.getDuration()
      };

      this.log(`Experience analysis complete: ${results.score}%`, results);

      return results;

    } catch (error) {
      this.log(`Error in experience analysis: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract years of experience from resume
   *
   * @private
   */
  extractYearsOfExperience(resume) {
    if (!resume) return 0;

    // Try to get directly from resume (primary field - calculated from dates during parsing)
    if (resume.years_experience && typeof resume.years_experience === 'number') {
      return resume.years_experience;
    }

    // Also try alternate field name
    if (resume.years_of_experience && typeof resume.years_of_experience === 'number') {
      return resume.years_of_experience;
    }

    // Try to extract from experience field if it contains dates
    if (resume.experience && typeof resume.experience === 'string') {
      return this.extractYearsFromText(resume.experience);
    }

    // Check for employment history or similar
    if (resume.employment_history && Array.isArray(resume.employment_history)) {
      return this.calculateYearsFromHistory(resume.employment_history);
    }

    // Fallback: try to parse from raw text
    if (resume.raw_text && typeof resume.raw_text === 'string') {
      return this.extractYearsFromText(resume.raw_text);
    }

    return 0;
  }

  /**
   * Extract required years from job description using multiple smart methods
   *
   * @private
   */
  extractRequiredYears(job) {
    if (!job) return 0;

    // Method 1: Check for explicit years field (highest priority)
    if (job.required_years && typeof job.required_years === 'number') {
      return job.required_years;
    }

    // Method 2: Parse explicit year mentions from description/requirements
    let explicitYears = this.extractExplicitYears(job);
    if (explicitYears > 0) {
      return explicitYears;
    }

    // Method 3: Smart estimation based on job title seniority
    let estimatedYears = this.estimateFromJobTitle(job.title);
    if (estimatedYears > 0) {
      return estimatedYears;
    }

    // Method 4: Smart estimation based on job complexity and keywords
    estimatedYears = this.estimateFromJobComplexity(job);
    if (estimatedYears > 0) {
      return estimatedYears;
    }

    // Default: 0 years required (entry-level)
    return 0;
  }

  /**
   * Extract explicit year mentions from job description/requirements
   *
   * @private
   */
  extractExplicitYears(job) {
    // Try description first
    if (job.description && typeof job.description === 'string') {
      // Look for patterns like "5 years", "5+ years", "5-7 years"
      const patterns = [
        /(\d+)\s*(?:\+)\s*years?/i,  // 5+ years
        /(\d+)\s*-\s*(\d+)\s*years?/i, // 5-7 years (take the first number as minimum)
        /(\d+)\s+years?/i  // 5 years
      ];

      for (const pattern of patterns) {
        const match = job.description.match(pattern);
        if (match) {
          return parseInt(match[1], 10);
        }
      }
    }

    // Try requirements field
    if (job.requirements && typeof job.requirements === 'string') {
      const patterns = [
        /(\d+)\s*(?:\+)\s*years?/i,
        /(\d+)\s*-\s*(\d+)\s*years?/i,
        /(\d+)\s+years?/i
      ];

      for (const pattern of patterns) {
        const match = job.requirements.match(pattern);
        if (match) {
          return parseInt(match[1], 10);
        }
      }
    }

    return 0;
  }

  /**
   * Estimate required years based on job title seniority
   *
   * @private
   */
  estimateFromJobTitle(title) {
    if (!title || typeof title !== 'string') return 0;

    const titleLower = title.toLowerCase();

    // Executive/Director level: 15+ years
    if (titleLower.match(/\b(cto|cfo|ceo|vp|vice\s+president|director|chief)\b/i)) {
      return 15;
    }

    // Principal/Architect level: 12+ years
    if (titleLower.match(/\b(principal|architect|staff)\b/i)) {
      return 12;
    }

    // Senior/Lead level: 7+ years
    if (titleLower.match(/\b(senior|lead|principal engineer|tech lead)\b/i)) {
      return 7;
    }

    // Mid-level: 3-5 years
    if (titleLower.match(/\b(mid\s*level|mid\s*-\s*level)\b/i)) {
      return 4;
    }

    // Junior/Entry level: 0-2 years
    if (titleLower.match(/\b(junior|entry\s*level|entry\s*-\s*level|intern|graduate)\b/i)) {
      return 0;
    }

    // Default "Engineer", "Developer", "Specialist" without prefix: 3-5 years
    if (titleLower.match(/\b(engineer|developer|specialist|analyst)\b/i)) {
      return 3;
    }

    return 0;
  }

  /**
   * Estimate required years based on job requirements complexity
   *
   * @private
   */
  estimateFromJobComplexity(job) {
    let complexityScore = 0;
    let complexityFactors = 0;

    const fullText = `${job.title || ''} ${job.description || ''} ${job.requirements || ''}`.toLowerCase();

    // Count complexity indicators
    const advancedTechKeywords = [
      'machine learning', 'deep learning', 'ai', 'artificial intelligence',
      'kubernetes', 'microservices', 'distributed systems', 'cloud architecture',
      'devops', 'infrastructure', 'terraform', 'aws', 'gcp', 'azure',
      'data pipeline', 'big data', 'spark', 'hadoop',
      'system design', 'architecture', 'scalability'
    ];

    const seniorityKeywords = [
      'mentor', 'lead', 'guide', 'architect', 'design',
      'research', 'innovation', 'strategic', 'drive',
      'oversight', 'accountability', 'stakeholder'
    ];

    const managementKeywords = [
      'manage', 'lead team', 'team lead', 'supervision',
      'delegate', 'performance review', 'hiring'
    ];

    // Count advanced tech requirements
    let advancedTechCount = 0;
    for (const keyword of advancedTechKeywords) {
      if (fullText.includes(keyword)) {
        advancedTechCount++;
      }
    }

    // Count seniority indicators
    let seniorityCount = 0;
    for (const keyword of seniorityKeywords) {
      if (fullText.includes(keyword)) {
        seniorityCount++;
      }
    }

    // Count management indicators
    let managementCount = 0;
    for (const keyword of managementKeywords) {
      if (fullText.includes(keyword)) {
        managementCount++;
      }
    }

    // Estimate based on factors
    let estimatedYears = 0;

    // Management experience
    if (managementCount >= 2) {
      estimatedYears = Math.max(estimatedYears, 8);
    } else if (managementCount >= 1) {
      estimatedYears = Math.max(estimatedYears, 5);
    }

    // Seniority indicators
    if (seniorityCount >= 3) {
      estimatedYears = Math.max(estimatedYears, 10);
    } else if (seniorityCount >= 2) {
      estimatedYears = Math.max(estimatedYears, 6);
    } else if (seniorityCount >= 1) {
      estimatedYears = Math.max(estimatedYears, 4);
    }

    // Advanced technology complexity
    if (advancedTechCount >= 4) {
      estimatedYears = Math.max(estimatedYears, 8);
    } else if (advancedTechCount >= 2) {
      estimatedYears = Math.max(estimatedYears, 5);
    } else if (advancedTechCount >= 1) {
      estimatedYears = Math.max(estimatedYears, 3);
    }

    // Count total required skills (as proxy for complexity)
    const skillCount = (job.description || '').split(/[,;]/).length;
    if (skillCount >= 15) {
      estimatedYears = Math.max(estimatedYears, 6);
    } else if (skillCount >= 10) {
      estimatedYears = Math.max(estimatedYears, 4);
    } else if (skillCount >= 5) {
      estimatedYears = Math.max(estimatedYears, 2);
    }

    return estimatedYears;
  }

  /**
   * Extract years from text using regex patterns
   * Handles both explicit mentions and date ranges
   *
   * @private
   */
  extractYearsFromText(text) {
    if (!text || typeof text !== 'string') return 0;

    // First, try to calculate from date ranges
    let totalYears = 0;

    // Pattern 1: YYYY-YYYY format (e.g., 2020-2024)
    let match;
    const pattern1 = /(\d{4})\s*[-–]\s*(\d{4})/g;
    while ((match = pattern1.exec(text)) !== null) {
      const startYear = parseInt(match[1], 10);
      const endYear = parseInt(match[2], 10);
      if (startYear < endYear && endYear <= new Date().getFullYear() + 1) {
        const yearsInRole = endYear - startYear;
        totalYears += yearsInRole;
      }
    }

    // Pattern 2: Month Year - Month Year
    const pattern2 = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]?\s+(\d{4})\s*[-–]\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Present|Current)[a-z]?\s+(\d{4})?/gi;
    while ((match = pattern2.exec(text)) !== null) {
      const startYear = parseInt(match[1], 10);
      const endYear = match[2] ? parseInt(match[2], 10) : new Date().getFullYear();
      if (startYear <= endYear) {
        const yearsInRole = endYear - startYear;
        if (yearsInRole > 0 && yearsInRole < 80) {
          totalYears += yearsInRole;
        }
      }
    }

    // If we calculated years from date ranges, return that
    if (totalYears > 0) {
      return Math.round(totalYears * 10) / 10;
    }

    // Fallback: Look for explicit mentions like "5 years of experience", "10+ years", etc.
    const patterns = [
      /(\d+)\s*\+?\s*years?(?:\s+of)?\s+(?:experience|exp)/gi,
      /(?:experience|exp)[:\s]+(\d+)\s*\+?\s*years?/gi,
      /(\d+)\s*\+?\s*years?(?:\s+professional|\s+relevant|\s+in)/gi,
    ];

    const matches = [];
    for (const pattern of patterns) {
      let textMatch;
      while ((textMatch = pattern.exec(text)) !== null) {
        const years = parseInt(textMatch[1], 10);
        if (years > 0 && years < 100) { // Sanity check
          matches.push(years);
        }
      }
    }

    // Return the sum or maximum based on context
    if (matches.length === 0) return 0;

    // If we found multiple mentions, use the largest one (total career)
    return Math.max(...matches);
  }

  /**
   * Calculate years from employment history
   *
   * @private
   */
  calculateYearsFromHistory(history) {
    if (!Array.isArray(history) || history.length === 0) return 0;

    let totalYears = 0;

    for (const job of history) {
      const { start_date, end_date } = job;

      if (!start_date) continue;

      const startDate = new Date(start_date);
      let endDate = end_date ? new Date(end_date) : new Date();

      if (isNaN(startDate.getTime())) continue;

      const years = (endDate - startDate) / (1000 * 60 * 60 * 24 * 365.25);
      totalYears += Math.max(0, years);
    }

    return Math.round(totalYears * 10) / 10; // Round to 1 decimal
  }

  /**
   * Calculate experience match score
   *
   * @private
   */
  calculateExperienceScore(candidateYears, requiredYears) {
    // Perfect match or exceeds by small amount: 100 points
    if (candidateYears >= requiredYears && candidateYears <= requiredYears + 5) {
      return 100;
    }

    // Exceeds significantly (10+ years over): Still 100, but slightly penalize
    if (candidateYears > requiredYears + 5) {
      // Slight penalty for overqualification
      const overageYears = candidateYears - (requiredYears + 5);
      const penalty = Math.min(10, overageYears * 2);
      return Math.max(85, 100 - penalty);
    }

    // Below requirement
    if (candidateYears < requiredYears) {
      // Linear scale: 0 years = 0%, 50% of required = 50%
      const percentage = (candidateYears / requiredYears) * 100;
      return Math.max(0, Math.min(100, percentage));
    }

    return 100;
  }

  /**
   * Generate explanation for the score
   *
   * @private
   */
  getScoreReason(candidateYears, requiredYears) {
    if (candidateYears === 0 && requiredYears === 0) {
      return 'Entry-level position with no experience requirement';
    }

    if (candidateYears >= requiredYears && candidateYears <= requiredYears + 5) {
      return `Perfect match: ${candidateYears} years provided, ${requiredYears} required`;
    }

    if (candidateYears > requiredYears + 5) {
      const extra = candidateYears - requiredYears;
      return `Overqualified: ${candidateYears} years (${extra} years above requirement of ${requiredYears})`;
    }

    if (candidateYears < requiredYears) {
      const shortage = requiredYears - candidateYears;
      return `Underqualified: ${candidateYears} years (${shortage} years short of ${requiredYears} requirement)`;
    }

    return 'Experience analysis complete';
  }

  /**
   * Analyze career progression and job stability
   *
   * @private
   */
  analyzeCareerProgression(resume) {
    const analysis = {
      totalYears: 0,
      jobCount: 0,
      averageTenure: 0,
      careerDirection: 'Unknown',
      stability: 'Unknown'
    };

    if (!resume || !resume.employment_history || !Array.isArray(resume.employment_history)) {
      return analysis;
    }

    const history = resume.employment_history;
    analysis.jobCount = history.length;

    // Calculate total years
    let totalDays = 0;
    const startDates = [];
    const endDates = [];

    for (const job of history) {
      if (job.start_date) {
        const startDate = new Date(job.start_date);
        if (!isNaN(startDate.getTime())) {
          startDates.push(startDate);

          const endDate = job.end_date ? new Date(job.end_date) : new Date();
          if (!isNaN(endDate.getTime())) {
            totalDays += (endDate - startDate) / (1000 * 60 * 60 * 24);
            endDates.push(endDate);
          }
        }
      }
    }

    analysis.totalYears = Math.round((totalDays / 365.25) * 10) / 10;

    // Calculate average tenure
    if (history.length > 0) {
      const averageDays = totalDays / history.length;
      analysis.averageTenure = Math.round((averageDays / 365.25) * 10) / 10;
    }

    // Determine career progression
    if (history.length > 0) {
      const titles = history.map(j => j.title || '').filter(t => t);
      if (titles.length > 0) {
        // Simple heuristic: look for seniority keywords
        const seniorityKeywords = ['senior', 'lead', 'manager', 'director', 'principal', 'architect', 'vp'];
        const hasProgression = titles.some(t =>
          seniorityKeywords.some(kw => t.toLowerCase().includes(kw))
        );
        analysis.careerDirection = hasProgression ? 'Upward' : 'Lateral';
      }
    }

    // Assess job stability
    if (analysis.averageTenure >= 3) {
      analysis.stability = 'Stable';
    } else if (analysis.averageTenure >= 1.5) {
      analysis.stability = 'Moderate';
    } else if (analysis.averageTenure > 0) {
      analysis.stability = 'High Job Turnover';
    }

    return analysis;
  }

  /**
   * Define required result fields for validation
   *
   * @protected
   */
  getRequiredResultFields() {
    return ['score', 'candidateYears', 'requiredYears', 'meetsRequirement'];
  }
}

export default ExperienceAgent;
