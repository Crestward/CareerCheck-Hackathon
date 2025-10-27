/**
 * Certification Agent: Verifies credential requirements
 *
 * Evaluates:
 * - Certifications held by candidate
 * - Certifications required by job
 * - Certification prestige and relevance
 * - Credential verification status
 */

import BaseAgent from './base-agent.js';

// Common high-value certifications
const CERT_DATABASE = {
  'aws solutions architect': { category: 'cloud', value: 9, vendor: 'AWS' },
  'aws developer': { category: 'cloud', value: 8, vendor: 'AWS' },
  'aws certified': { category: 'cloud', value: 7, vendor: 'AWS' },
  'aws': { category: 'cloud', value: 7, vendor: 'AWS' },
  'azure fundamentals': { category: 'cloud', value: 7, vendor: 'Azure' },
  'azure architect': { category: 'cloud', value: 9, vendor: 'Azure' },
  'azure certified': { category: 'cloud', value: 8, vendor: 'Azure' },
  'azure': { category: 'cloud', value: 7, vendor: 'Azure' },
  'gcp certified': { category: 'cloud', value: 8, vendor: 'GCP' },
  'gcp': { category: 'cloud', value: 7, vendor: 'GCP' },

  'kubernetes': { category: 'containers', value: 8, vendor: 'CNCF' },
  'ckad': { category: 'containers', value: 9, vendor: 'CNCF' },
  'cka': { category: 'containers', value: 9, vendor: 'CNCF' },
  'docker': { category: 'containers', value: 7, vendor: 'Docker' },

  'cissp': { category: 'security', value: 10, vendor: 'ISC2' },
  'cism': { category: 'security', value: 10, vendor: 'ISACA' },
  'ceritified ethical hacker': { category: 'security', value: 8, vendor: 'EC-Council' },
  'ceh': { category: 'security', value: 8, vendor: 'EC-Council' },
  'oscp': { category: 'security', value: 9, vendor: 'Offensive Security' },
  'security+': { category: 'security', value: 8, vendor: 'CompTIA' },
  'network+': { category: 'security', value: 7, vendor: 'CompTIA' },
  'a+': { category: 'security', value: 6, vendor: 'CompTIA' },

  'pmp': { category: 'management', value: 9, vendor: 'PMI' },
  'agile': { category: 'management', value: 7, vendor: 'Multiple' },
  'scrum': { category: 'management', value: 7, vendor: 'Scrum.org' },
  'csm': { category: 'management', value: 7, vendor: 'Scrum Alliance' },

  'tensorflow': { category: 'ml', value: 8, vendor: 'Google' },
  'pytorch': { category: 'ml', value: 8, vendor: 'Meta' },
  'machine learning': { category: 'ml', value: 7, vendor: 'Multiple' },

  'orca certified': { category: 'data', value: 7, vendor: 'Orca' },
  'data science': { category: 'data', value: 8, vendor: 'Multiple' },
  'tableau': { category: 'data', value: 7, vendor: 'Tableau' },
  'power bi': { category: 'data', value: 7, vendor: 'Microsoft' },

  'java': { category: 'programming', value: 7, vendor: 'Oracle' },
  'python': { category: 'programming', value: 7, vendor: 'Python Institute' },
  'javascript': { category: 'programming', value: 6, vendor: 'Multiple' }
};

export class CertificationAgent extends BaseAgent {
  constructor(config) {
    super(config);
    this.agentType = 'certification';
  }

  /**
   * Analyze certification match between resume and job
   *
   * @protected
   * @param {Object} resume - Resume data from fork database
   * @param {Object} job - Job data from fork database
   * @returns {Promise<Object>} Results with certification score and analysis
   */
  async analyze(resume, job) {
    this.log('🏆 Starting certification analysis...');

    try {
      // Extract certifications
      const candidateCerts = this.extractCertifications(resume);
      const requiredCerts = this.extractRequiredCertifications(job);

      this.log(`Candidate certs: ${candidateCerts.length}, Required certs: ${requiredCerts.length}`);

      // Calculate match
      const { score, matchedCerts, missingCerts, analysis } = this.calculateCertificationMatch(
        candidateCerts,
        requiredCerts
      );

      const results = {
        score: this.normalizeScore(score),
        candidateCertifications: candidateCerts,
        requiredCertifications: requiredCerts,
        matchedCertifications: matchedCerts,
        missingCertifications: missingCerts,
        matchPercentage: requiredCerts.length > 0
          ? Math.round((matchedCerts.length / requiredCerts.length) * 100)
          : 100,
        hasCriticalCerts: this.hasCriticalCertifications(matchedCerts),
        certificationValue: this.calculateCertificationValue(candidateCerts),
        analysis: analysis,
        scoreReason: this.getCertificationScoreReason(matchedCerts, missingCerts),
        processingTimeMs: this.getDuration()
      };

      this.log(`✅ Certification analysis complete: ${results.score}%`, results);

      return results;

    } catch (error) {
      this.log(`❌ Error in certification analysis: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract certifications from resume
   *
   * @private
   */
  extractCertifications(resume) {
    if (!resume) return [];

    const certs = [];

    // Try to get from certifications field
    if (resume.certifications) {
      if (typeof resume.certifications === 'string') {
        return this.parseCertificationsFromText(resume.certifications);
      }

      if (Array.isArray(resume.certifications)) {
        for (const cert of resume.certifications) {
          if (typeof cert === 'string') {
            const parsed = this.matchCertification(cert);
            if (parsed) certs.push(parsed);
          }
        }
      }
    }

    // Also search raw text
    if (resume.raw_text && typeof resume.raw_text === 'string') {
      const textCerts = this.parseCertificationsFromText(resume.raw_text);
      for (const textCert of textCerts) {
        if (!certs.find(c => c.name.toLowerCase() === textCert.name.toLowerCase())) {
          certs.push(textCert);
        }
      }
    }

    return certs;
  }

  /**
   * Extract required certifications from job
   *
   * @private
   */
  extractRequiredCertifications(job) {
    if (!job) return [];

    const certs = [];

    // Check specific field
    if (job.required_certifications) {
      if (typeof job.required_certifications === 'string') {
        return this.parseCertificationsFromText(job.required_certifications);
      }

      if (Array.isArray(job.required_certifications)) {
        for (const cert of job.required_certifications) {
          if (typeof cert === 'string') {
            const parsed = this.matchCertification(cert);
            if (parsed) certs.push(parsed);
          }
        }
      }
    }

    // Search description
    if (job.description && typeof job.description === 'string') {
      const descCerts = this.parseCertificationsFromText(job.description);
      for (const cert of descCerts) {
        if (!certs.find(c => c.name.toLowerCase() === cert.name.toLowerCase())) {
          certs.push(cert);
        }
      }
    }

    // Search requirements
    if (job.requirements && typeof job.requirements === 'string') {
      const reqCerts = this.parseCertificationsFromText(job.requirements);
      for (const cert of reqCerts) {
        if (!certs.find(c => c.name.toLowerCase() === cert.name.toLowerCase())) {
          certs.push(cert);
        }
      }
    }

    return certs;
  }

  /**
   * Parse certifications from text
   *
   * @private
   */
  parseCertificationsFromText(text) {
    if (!text || typeof text !== 'string') return [];

    const certs = [];

    // Look for certification patterns
    const patterns = [
      /(?:certified|holds|earned|has)\s+(?:the\s+)?([a-z0-9\+\-\.\s]+?)(?:\s+(?:certification|certified|cert))?[.,;]/gi,
      /([a-z0-9\+\-\.]+?)\s+(?:certification|certified|cert)(?:ed)?/gi,
      /(?:certifications?)[:\s]+([^,;.]+)/gi
    ];

    const found = new Set();

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const certName = match[1] ? match[1].trim() : '';
        if (certName && certName.length > 2 && !found.has(certName.toLowerCase())) {
          found.add(certName.toLowerCase());
          const parsed = this.matchCertification(certName);
          if (parsed) certs.push(parsed);
        }
      }
    }

    return certs;
  }

  /**
   * Match certification to database
   *
   * @private
   */
  matchCertification(certName) {
    if (!certName || typeof certName !== 'string') return null;

    const certLower = certName.toLowerCase().trim();

    // Try exact match
    for (const [dbCert, data] of Object.entries(CERT_DATABASE)) {
      if (certLower.includes(dbCert) || dbCert.includes(certLower)) {
        return {
          name: this.formatCertName(dbCert),
          category: data.category,
          value: data.value,
          vendor: data.vendor,
          confidence: 0.95
        };
      }
    }

    // If not in database, still track it
    if (certName.length > 3) {
      return {
        name: certName,
        category: 'other',
        value: 5, // Default mid-tier value
        vendor: 'Unknown',
        confidence: 0.7
      };
    }

    return null;
  }

  /**
   * Format certification name for display
   *
   * @private
   */
  formatCertName(cert) {
    const formatted = {
      'aws solutions architect': 'AWS Solutions Architect',
      'aws developer': 'AWS Developer',
      'azure architect': 'Azure Solutions Architect',
      'cissp': 'CISSP',
      'cism': 'CISM',
      'oscp': 'OSCP',
      'pmp': 'PMP',
      'csm': 'Certified Scrum Master',
      'ckad': 'CKAD',
      'cka': 'CKA'
    };

    return formatted[cert.toLowerCase()] || cert;
  }

  /**
   * Calculate certification match
   *
   * @private
   */
  calculateCertificationMatch(candidateCerts, requiredCerts) {
    const candidateMap = new Map(
      candidateCerts.map(c => [c.name.toLowerCase(), c])
    );

    const matchedCerts = [];
    const missingCerts = [];

    // Check each required cert
    for (const reqCert of requiredCerts) {
      const found = candidateMap.get(reqCert.name.toLowerCase());
      if (found) {
        matchedCerts.push({
          cert: reqCert.name,
          match: found,
          confidence: Math.min(found.confidence, reqCert.confidence || 0.8)
        });
      } else {
        missingCerts.push(reqCert);
      }
    }

    // Calculate score
    let score = 100;

    if (requiredCerts.length > 0) {
      // Job has specific cert requirements
      const matchRatio = matchedCerts.length / requiredCerts.length;
      score = matchRatio * 100;

      // Bonus if exceeds requirement
      if (candidateCerts.length > requiredCerts.length) {
        const extraCerts = candidateCerts.length - requiredCerts.length;
        const bonus = Math.min(extraCerts * 5, 15); // Max 15% bonus
        score = Math.min(100, score + bonus);
      }
    } else if (candidateCerts.length > 0) {
      // No specific requirement in job AND candidate has certs
      // Can't validate relevance, so penalize (don't assume they're relevant)
      // Score based on confidence that these certs are relevant
      // Default low confidence for unvalidated certs = 30-40% base
      let baseScore = 30;

      // High confidence certs in database get slight boost
      const avgConfidence = candidateCerts.reduce((sum, cert) => sum + (cert.confidence || 0.7), 0) / candidateCerts.length;
      const confidenceBoost = Math.round((avgConfidence - 0.7) * 50); // -25 to +25 boost based on confidence

      score = Math.max(10, Math.min(50, baseScore + confidenceBoost));
    } else {
      // No requirement and no certs: neutral score (not penalized)
      score = 50;
    }

    const analysis = {
      totalCandidateCerts: candidateCerts.length,
      totalRequiredCerts: requiredCerts.length,
      matchedCount: matchedCerts.length,
      coverage: requiredCerts.length > 0
        ? `${Math.round((matchedCerts.length / requiredCerts.length) * 100)}%`
        : '100%'
    };

    return {
      score: Math.max(0, Math.min(100, score)),
      matchedCerts,
      missingCerts,
      analysis
    };
  }

  /**
   * Check if candidate has critical/prestigious certifications
   *
   * @private
   */
  hasCriticalCertifications(matchedCerts) {
    const criticalCerts = ['CISSP', 'CISM', 'OSCP', 'PMP', 'CKAD', 'CKA', 'AWS Solutions Architect'];

    return matchedCerts.some(matched =>
      criticalCerts.some(critical =>
        matched.cert.toLowerCase().includes(critical.toLowerCase())
      )
    );
  }

  /**
   * Calculate total value of certifications held
   *
   * @private
   */
  calculateCertificationValue(certs) {
    if (certs.length === 0) return 0;

    const totalValue = certs.reduce((sum, cert) => sum + (cert.value || 5), 0);
    const maxValue = certs.length * 10;

    return Math.round((totalValue / maxValue) * 100);
  }

  /**
   * Get explanation for certification score
   *
   * @private
   */
  getCertificationScoreReason(matchedCerts, missingCerts) {
    if (missingCerts.length === 0 && matchedCerts.length > 0) {
      return `All required certifications matched (${matchedCerts.length} found)`;
    }

    if (matchedCerts.length === 0 && missingCerts.length > 0) {
      return `No required certifications found (${missingCerts.length} missing)`;
    }

    if (matchedCerts.length > 0 && missingCerts.length > 0) {
      return `Partial match: ${matchedCerts.length} of ${matchedCerts.length + missingCerts.length} required`;
    }

    return 'No certification requirements';
  }

  /**
   * Define required result fields for validation
   *
   * @protected
   */
  getRequiredResultFields() {
    return ['score', 'matchedCertifications', 'missingCertifications'];
  }
}

export default CertificationAgent;
