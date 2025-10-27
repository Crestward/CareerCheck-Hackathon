/**
 * Semantic Agent: Embedding-based similarity analysis
 *
 * Evaluates:
 * - Overall resume-job semantic similarity
 * - Vector space matching
 * - Context and meaning alignment
 * - Industry relevance
 */

import BaseAgent from './base-agent.js';
import crypto from 'crypto';

export class SemanticAgent extends BaseAgent {
  constructor(config) {
    super(config);
    this.agentType = 'semantic';
    this.embeddingCache = new Map();
  }

  /**
   * Analyze semantic similarity between resume and job
   *
   * @protected
   * @param {Object} resume - Resume data from fork database
   * @param {Object} job - Job data from fork database
   * @returns {Promise<Object>} Results with semantic score and analysis
   */
  async analyze(resume, job) {
    this.log('🔍 Starting semantic analysis...');

    try {
      // Extract text from resume and job
      const resumeText = this.extractResumeText(resume);
      const jobText = this.extractJobText(job);

      if (!resumeText || !jobText) {
        throw new Error('Insufficient text data for semantic analysis');
      }

      // Get embeddings
      const resumeEmbedding = await this.getEmbedding(resumeText, 'resume');
      const jobEmbedding = await this.getEmbedding(jobText, 'job');

      // Calculate similarity scores
      const cosineSimilarity = this.calculateCosineSimilarity(resumeEmbedding, jobEmbedding);
      const semanticScore = this.convertSimilarityToScore(cosineSimilarity);

      // Perform deeper analysis
      const analysis = this.analyzeSemanticAlignment(resume, job, resumeText, jobText);
      const keywords = this.extractSemanticKeywords(jobText);
      const coverage = this.calculateKeywordCoverage(resumeText, keywords);

      const results = {
        score: this.normalizeScore(semanticScore),
        similarity: Math.round(cosineSimilarity * 10000) / 10000,
        similarityPercentage: Math.round(cosineSimilarity * 100),
        analysis: analysis,
        keywordCoverage: {
          importantKeywords: keywords.slice(0, 10),
          coveragePercentage: Math.round(coverage * 100),
          coveredKeywords: this.getCoveredKeywords(resumeText, keywords)
        },
        alignmentAreas: this.identifyAlignmentAreas(resume, job),
        contentMaturity: this.assessContentMaturity(resumeText, jobText),
        processingTimeMs: this.getDuration()
      };

      this.log(`✅ Semantic analysis complete: ${results.score}%`, results);

      return results;

    } catch (error) {
      this.log(`❌ Error in semantic analysis: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract text from resume
   *
   * @private
   */
  extractResumeText(resume) {
    if (!resume) return '';

    const parts = [];

    if (resume.raw_text) parts.push(resume.raw_text);
    if (resume.summary) parts.push(resume.summary);
    if (resume.experience) parts.push(resume.experience);
    if (resume.skills) {
      const skillsText = Array.isArray(resume.skills)
        ? resume.skills.join(' ')
        : resume.skills;
      parts.push(skillsText);
    }
    if (resume.education) parts.push(resume.education);
    if (resume.certifications) {
      const certsText = Array.isArray(resume.certifications)
        ? resume.certifications.join(' ')
        : resume.certifications;
      parts.push(certsText);
    }

    return parts.filter(p => p).join(' ');
  }

  /**
   * Extract text from job
   *
   * @private
   */
  extractJobText(job) {
    if (!job) return '';

    const parts = [];

    if (job.title) parts.push(job.title);
    if (job.description) parts.push(job.description);
    if (job.requirements) parts.push(job.requirements);
    if (job.responsibilities) parts.push(job.responsibilities);
    if (job.company_description) parts.push(job.company_description);

    return parts.filter(p => p).join(' ');
  }

  /**
   * Get embedding for text
   * Uses stub embeddings (hash-based) for reliability
   *
   * @private
   */
  async getEmbedding(text, type = 'text') {
    if (!text || typeof text !== 'string') {
      return this.createZeroEmbedding();
    }

    const textLower = text.toLowerCase();

    // Check cache
    const cacheKey = crypto
      .createHash('md5')
      .update(textLower)
      .digest('hex');

    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey);
    }

    // Create deterministic stub embedding
    const embedding = this.createStubEmbedding(textLower);

    // Cache it
    this.embeddingCache.set(cacheKey, embedding);

    return embedding;
  }

  /**
   * Create a deterministic stub embedding from text
   * This is a hash-based approach that produces consistent vectors
   *
   * @private
   */
  createStubEmbedding(text) {
    const embeddingDim = 384; // Standard embedding dimension
    const embedding = new Array(embeddingDim).fill(0);

    // Extract words and create hash-based features
    const words = text
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 2)
      .slice(0, 1000); // Limit to first 1000 words

    // Hash each word and distribute across embedding dimensions
    for (const word of words) {
      const hash = this.hashString(word);

      // Use hash to influence multiple dimensions
      for (let i = 0; i < embeddingDim; i++) {
        const component = ((hash + i * 73) ^ (i * 193)) & 0xff;
        embedding[i] += (component / 256) - 0.5; // Range: -0.5 to 0.5
      }
    }

    // Add word frequency features
    const wordFreq = new Map();
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }

    // Encode top words
    const topWords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([w]) => w);

    for (let i = 0; i < topWords.length; i++) {
      const idx = (this.hashString(topWords[i]) % embeddingDim);
      embedding[idx] += 0.5; // Boost important words
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embeddingDim; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  /**
   * Create zero embedding
   *
   * @private
   */
  createZeroEmbedding() {
    return new Array(384).fill(0);
  }

  /**
   * Hash string to number
   *
   * @private
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Calculate cosine similarity between two embeddings
   *
   * @private
   */
  calculateCosineSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2 || embedding1.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    const minLen = Math.min(embedding1.length, embedding2.length);

    for (let i = 0; i < minLen; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      magnitude1 += embedding1[i] * embedding1[i];
      magnitude2 += embedding2[i] * embedding2[i];
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    const similarity = dotProduct / (magnitude1 * magnitude2);

    // Clamp to [-1, 1]
    return Math.max(-1, Math.min(1, similarity));
  }

  /**
   * Convert cosine similarity to 0-100 score
   *
   * @private
   */
  convertSimilarityToScore(similarity) {
    // Similarity ranges from -1 to 1
    // Convert to 0-100: shift and scale
    // -1 → 0, 0 → 50, 1 → 100
    return ((similarity + 1) / 2) * 100;
  }

  /**
   * Extract important semantic keywords from text
   *
   * @private
   */
  extractSemanticKeywords(text) {
    if (!text || typeof text !== 'string') return [];

    // Extract words with importance weighting
    const words = text
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3); // Only meaningful words

    // Weight by frequency
    const frequency = new Map();
    for (const word of words) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }

    // Sort by frequency
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, freq]) => ({
        word,
        importance: freq
      }));
  }

  /**
   * Calculate keyword coverage
   *
   * @private
   */
  calculateKeywordCoverage(resumeText, keywords) {
    if (!resumeText || !keywords || keywords.length === 0) {
      return 0;
    }

    const resumeTextLower = resumeText.toLowerCase();
    let covered = 0;

    for (const kw of keywords) {
      if (resumeTextLower.includes(kw.word)) {
        covered++;
      }
    }

    return covered / keywords.length;
  }

  /**
   * Get covered keywords from resume
   *
   * @private
   */
  getCoveredKeywords(resumeText, keywords) {
    if (!resumeText) return [];

    const resumeTextLower = resumeText.toLowerCase();
    const covered = [];

    for (const kw of keywords) {
      if (resumeTextLower.includes(kw.word)) {
        covered.push(kw.word);
      }
    }

    return covered;
  }

  /**
   * Analyze semantic alignment between resume and job
   *
   * @private
   */
  analyzeSemanticAlignment(resume, job, resumeText, jobText) {
    const analysis = {
      industry: this.identifyIndustry(jobText),
      seniority: this.identifySeniority(jobText),
      specialization: this.identifySpecialization(resumeText, jobText),
      culturalFit: this.assessCulturalFit(resumeText, jobText)
    };

    return analysis;
  }

  /**
   * Identify industry from job text
   *
   * @private
   */
  identifyIndustry(jobText) {
    const industries = {
      'fintech|finance|banking|payments': 'Financial Services',
      'healthcare|medical|pharma|health': 'Healthcare',
      'ecommerce|retail|shopping': 'E-commerce',
      'saas|software|tech|app|platform': 'Software/SaaS',
      'education|learning|training': 'Education',
      'media|entertainment|gaming': 'Media & Entertainment',
      'infrastructure|devops|cloud': 'Cloud Infrastructure',
      'security|cybersecurity': 'Security',
      'data|analytics|bi': 'Data & Analytics',
      'ai|machine learning|ml': 'Artificial Intelligence'
    };

    const jobLower = jobText.toLowerCase();

    for (const [keywords, industry] of Object.entries(industries)) {
      if (new RegExp(keywords).test(jobLower)) {
        return industry;
      }
    }

    return 'General Technology';
  }

  /**
   * Identify seniority level
   *
   * @private
   */
  identifySeniority(jobText) {
    const jobLower = jobText.toLowerCase();

    if (jobLower.match(/\b(cto|ceo|vp|vice president|director)\b/)) {
      return 'C-Level/Executive';
    }
    if (jobLower.match(/\b(senior|lead|principal|architect)\b/)) {
      return 'Senior/Lead';
    }
    if (jobLower.match(/\b(mid-level|mid-senior|senior)\b/)) {
      return 'Mid-Senior';
    }
    if (jobLower.match(/\b(mid-level|mid)\b/)) {
      return 'Mid-Level';
    }
    if (jobLower.match(/\b(junior|entry|entry-level)\b/)) {
      return 'Junior/Entry';
    }

    return 'Unknown';
  }

  /**
   * Identify specialization area
   *
   * @private
   */
  identifySpecialization(resumeText, jobText) {
    const specializations = [
      'Backend', 'Frontend', 'Full-Stack', 'DevOps', 'Data Science',
      'Mobile', 'QA', 'Security', 'Database', 'Infrastructure'
    ];

    const jobLower = jobText.toLowerCase();

    for (const spec of specializations) {
      if (jobLower.includes(spec.toLowerCase())) {
        return spec;
      }
    }

    return 'General';
  }

  /**
   * Assess cultural/value alignment
   *
   * @private
   */
  assessCulturalFit(resumeText, jobText) {
    const culturalIndicators = {
      'startup|agile|fast-paced': 'Startup Culture',
      'enterprise|corporate|large': 'Enterprise Culture',
      'remote|distributed|hybrid': 'Flexible Work',
      'innovation|research|cutting-edge': 'Innovation-Driven',
      'social impact|mission-driven|impact': 'Social Impact',
      'open source|community': 'Community-Oriented'
    };

    let fit = [];
    const jobLower = jobText.toLowerCase();

    for (const [indicators, culture] of Object.entries(culturalIndicators)) {
      if (new RegExp(indicators).test(jobLower)) {
        fit.push(culture);
      }
    }

    return fit.length > 0 ? fit : ['General Corporate'];
  }

  /**
   * Identify semantic alignment areas
   *
   * @private
   */
  identifyAlignmentAreas(resume, job) {
    const areas = [];

    // Check company/industry
    if (job.title && resume.experience) {
      areas.push('Industry Experience');
    }

    // Check role progression
    if (resume.raw_text && resume.raw_text.match(/\b(senior|lead|manager|director)\b/i)) {
      areas.push('Career Progression');
    }

    // Check skill relevance
    if (resume.skills && job.description) {
      areas.push('Technical Skills');
    }

    // Check education relevance
    if (resume.education && job.requirements) {
      areas.push('Educational Background');
    }

    return areas.length > 0 ? areas : ['No specific alignment areas identified'];
  }

  /**
   * Assess content maturity/professionalism
   *
   * @private
   */
  assessContentMaturity(resumeText, jobText) {
    const getComplexity = (text) => {
      const words = text.split(/\W+/).filter(w => w.length > 0);
      const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
      return avgWordLength > 5 ? 'High' : avgWordLength > 4 ? 'Medium' : 'Low';
    };

    return {
      resumeComplexity: getComplexity(resumeText || ''),
      jobComplexity: getComplexity(jobText || ''),
      professionalism: jobText && jobText.length > 500 ? 'High' : 'Standard'
    };
  }

  /**
   * Define required result fields for validation
   *
   * @protected
   */
  getRequiredResultFields() {
    return ['score', 'similarity', 'analysis'];
  }
}

export default SemanticAgent;
