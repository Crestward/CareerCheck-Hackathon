/**
 * WeightOptimizer: Dynamic weight adjustment based on job characteristics
 * Intelligently adjusts agent scoring weights based on industry, role, and seniority
 */

export class WeightOptimizer {
  constructor() {
    this.industryWeights = this.loadIndustryWeights();
    this.roleWeights = this.loadRoleWeights();
    this.seniorityLevels = [
      { keywords: ['intern', 'junior', 'entry'], level: 'entry' },
      { keywords: ['mid', 'senior'], level: 'mid' },
      { keywords: ['senior', 'lead', 'principal'], level: 'senior' },
      { keywords: ['director', 'vp', 'cto', 'ceo'], level: 'executive' }
    ];
  }

  /**
   * Load predefined industry weights
   */
  loadIndustryWeights() {
    return {
      fintech: { skill: 0.35, semantic: 0.20, experience: 0.15, education: 0.15, certification: 0.15 },
      healthcare: { skill: 0.25, semantic: 0.20, experience: 0.25, education: 0.20, certification: 0.10 },
      enterprise_saas: { skill: 0.25, semantic: 0.15, experience: 0.25, education: 0.20, certification: 0.15 },
      startup: { skill: 0.40, semantic: 0.25, experience: 0.15, education: 0.10, certification: 0.10 },
      data_science: { skill: 0.40, semantic: 0.25, experience: 0.15, education: 0.15, certification: 0.05 },
      security: { skill: 0.30, semantic: 0.15, experience: 0.20, education: 0.15, certification: 0.20 },
      default: { skill: 0.25, semantic: 0.20, experience: 0.20, education: 0.20, certification: 0.15 }
    };
  }

  /**
   * Load role-based weights
   */
  loadRoleWeights() {
    return {
      frontend_engineer: { skill: 0.40, semantic: 0.25, experience: 0.15, education: 0.10, certification: 0.10 },
      backend_engineer: { skill: 0.35, semantic: 0.20, experience: 0.20, education: 0.15, certification: 0.10 },
      devops_engineer: { skill: 0.30, semantic: 0.15, experience: 0.25, education: 0.15, certification: 0.15 },
      data_scientist: { skill: 0.45, semantic: 0.25, experience: 0.10, education: 0.15, certification: 0.05 },
      product_manager: { skill: 0.15, semantic: 0.30, experience: 0.30, education: 0.15, certification: 0.10 },
      engineering_manager: { skill: 0.20, semantic: 0.20, experience: 0.35, education: 0.15, certification: 0.10 },
      security_engineer: { skill: 0.35, semantic: 0.15, experience: 0.20, education: 0.10, certification: 0.20 }
    };
  }

  /**
   * Get optimal weights for a job
   */
  getOptimalWeights(jobTitle, jobDescription, jobMetadata = {}) {
    let baseWeights = { ...this.loadIndustryWeights().default };

    // Try to match industry
    const industryMatch = this.detectIndustry(jobDescription);
    if (industryMatch && this.industryWeights[industryMatch]) {
      baseWeights = { ...this.industryWeights[industryMatch] };
    }

    // Try to match specific role
    const roleMatch = this.detectRole(jobTitle, jobDescription);
    if (roleMatch && this.roleWeights[roleMatch]) {
      baseWeights = { ...this.roleWeights[roleMatch] };
    }

    // Adjust for seniority level
    const seniorityLevel = this.detectSeniorityLevel(jobTitle);
    baseWeights = this.adjustForSeniority(baseWeights, seniorityLevel);

    // Normalize (sum to 1.0)
    return this.normalizeWeights(baseWeights);
  }

  /**
   * Detect industry from description
   */
  detectIndustry(description) {
    const industryPatterns = {
      fintech: /fintech|banking|payment|crypto|blockchain/i,
      healthcare: /healthcare|medical|hospital|pharma|health/i,
      enterprise_saas: /enterprise|saas|cloud|crm|erp/i,
      startup: /startup|seed|series [a-z]|venture|agile/i,
      data_science: /data science|machine learning|ml|ai|nlp|computer vision/i,
      security: /security|cybersecurity|infosec|penetration|threat/i
    };

    for (const [industry, pattern] of Object.entries(industryPatterns)) {
      if (pattern.test(description)) {
        return industry;
      }
    }
    return null;
  }

  /**
   * Detect specific role from title and description
   */
  detectRole(title, description) {
    const roles = {
      frontend_engineer: /frontend|react|vue|angular|ui|web/i,
      backend_engineer: /backend|api|server|nodejs|python|java/i,
      devops_engineer: /devops|infrastructure|kubernetes|docker|ci\/cd/i,
      data_scientist: /data scientist|analytics|ml engineer|data engineer/i,
      product_manager: /product manager|pm|product lead/i,
      engineering_manager: /engineering manager|tech lead|engineering director/i,
      security_engineer: /security engineer|infosec|penetration/i
    };

    const combinedText = `${title} ${description}`.toLowerCase();

    for (const [role, pattern] of Object.entries(roles)) {
      if (pattern.test(combinedText)) {
        return role;
      }
    }
    return null;
  }

  /**
   * Detect seniority level
   */
  detectSeniorityLevel(jobTitle) {
    const titleLower = jobTitle.toLowerCase();
    for (const entry of this.seniorityLevels) {
      for (const keyword of entry.keywords) {
        if (titleLower.includes(keyword)) {
          return entry.level;
        }
      }
    }
    return 'mid';
  }

  /**
   * Adjust weights based on seniority
   */
  adjustForSeniority(weights, level) {
    const adjustments = {
      entry: { skill: 1.1, semantic: 1.0, experience: 0.8, education: 1.1, certification: 0.9 },
      mid: { skill: 1.0, semantic: 1.0, experience: 1.0, education: 1.0, certification: 1.0 },
      senior: { skill: 0.9, semantic: 1.0, experience: 1.2, education: 0.95, certification: 1.0 },
      executive: { skill: 0.7, semantic: 1.3, experience: 1.4, education: 0.9, certification: 0.9 }
    };

    const adj = adjustments[level] || adjustments.mid;

    return {
      skill: weights.skill * adj.skill,
      semantic: weights.semantic * adj.semantic,
      experience: weights.experience * adj.experience,
      education: weights.education * adj.education,
      certification: weights.certification * adj.certification
    };
  }

  /**
   * Normalize weights to sum to 1.0
   */
  normalizeWeights(weights) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    return {
      skill_match: weights.skill / total,
      semantic: weights.semantic / total,
      experience: weights.experience / total,
      education: weights.education / total,
      certification: weights.certification / total
    };
  }

  /**
   * Get weight confidence score (0-1)
   * Higher = more confident in the weight selection
   */
  getWeightConfidence(jobTitle, jobDescription) {
    let confidence = 0.5;

    if (this.detectIndustry(jobDescription)) confidence += 0.2;
    if (this.detectRole(jobTitle, jobDescription)) confidence += 0.2;
    if (this.detectSeniorityLevel(jobTitle) !== 'mid') confidence += 0.1;

    return Math.min(1.0, confidence);
  }
}

export default WeightOptimizer;
