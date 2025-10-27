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
    this.log('📅 Starting experience analysis...');

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

      this.log(`✅ Experience analysis complete: ${results.score}%`, results);

      return results;

    } catch (error) {
      this.log(`❌ Error in experience analysis: ${error.message}`);
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

    // Try to get directly from resume
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
   * Extract required years from job description
   *
   * @private
   */
  extractRequiredYears(job) {
    if (!job) return 0;

    // Check for explicit years field
    if (job.required_years && typeof job.required_years === 'number') {
      return job.required_years;
    }

    // Try to parse from description
    if (job.description && typeof job.description === 'string') {
      const yearMatch = job.description.match(/(\d+)\s*(?:\+)?\s*years?/i);
      if (yearMatch) {
        return parseInt(yearMatch[1], 10);
      }
    }

    // Check requirements field
    if (job.requirements && typeof job.requirements === 'string') {
      const yearMatch = job.requirements.match(/(\d+)\s*(?:\+)?\s*years?/i);
      if (yearMatch) {
        return parseInt(yearMatch[1], 10);
      }
    }

    // Default: 0 years required (entry-level)
    return 0;
  }

  /**
   * Extract years from text using regex patterns
   *
   * @private
   */
  extractYearsFromText(text) {
    if (!text || typeof text !== 'string') return 0;

    // Look for patterns like "5 years of experience", "10+ years", etc.
    const patterns = [
      /(\d+)\s*\+?\s*years?(?:\s+of)?\s+(?:experience|exp)/gi,
      /(?:experience|exp)[:\s]+(\d+)\s*\+?\s*years?/gi,
      /(\d+)\s*\+?\s*years?(?:\s+professional|\s+relevant|\s+in)/gi,
    ];

    const matches = [];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const years = parseInt(match[1], 10);
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
