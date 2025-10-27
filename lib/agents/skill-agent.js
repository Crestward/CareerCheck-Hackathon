/**
 * Skill Agent: Analyzes technical skill match between resume and job
 *
 * Evaluates:
 * - Skills found in resume
 * - Skills required by job description
 * - Match percentage
 * - Coverage of critical skills
 */

import BaseAgent from './base-agent.js';
import { extractAllSkills, findFuzzyMatch, SKILL_DATABASE } from '../skill-matcher.js';

export class SkillAgent extends BaseAgent {
  constructor(config) {
    super(config);
    this.agentType = 'skill';
  }

  /**
   * Analyze skill match between resume and job
   *
   * @protected
   * @param {Object} resume - Resume data from fork database
   * @param {Object} job - Job data from fork database
   * @returns {Promise<Object>} Results with score and breakdown
   */
  async analyze(resume, job) {
    this.log('📊 Starting skill analysis...');

    try {
      // Extract resume text (handle different formats)
      const resumeText = this.extractResumeText(resume);
      const jobText = this.extractJobText(job);

      if (!resumeText) {
        throw new Error('No resume text available for skill extraction');
      }

      if (!jobText) {
        throw new Error('No job description available for skill analysis');
      }

      // Extract skills from both resume and job
      const resumeSkills = extractAllSkills(resumeText);
      const jobSkills = this.extractJobSkills(jobText);

      this.log(`Found ${resumeSkills.length} skills in resume`);
      this.log(`Found ${jobSkills.length} skills required in job`);

      // Calculate match metrics
      const { matchedSkills, score, matchPercentage, coverageAnalysis } = this.calculateSkillMatch(
        resumeSkills,
        jobSkills
      );

      // Store in knowledge base if configured
      await this.storeNewSkillsInKnowledgeBase(matchedSkills);

      const results = {
        score: this.normalizeScore(score),
        matchedSkillsCount: matchedSkills.length,
        totalJobSkillsRequired: jobSkills.length,
        matchPercentage: Math.round(matchPercentage * 100) / 100,
        matchedSkills: matchedSkills.slice(0, 10), // Top 10 matched skills
        missingSkills: this.findMissingSkills(resumeSkills, jobSkills).slice(0, 5),
        coverageAnalysis,
        strengths: this.identifyStrengths(resumeSkills, jobSkills),
        gaps: this.identifyGaps(resumeSkills, jobSkills),
        processingTimeMs: this.getDuration()
      };

      this.log(`✅ Skill analysis complete: ${results.score}%`, results);

      return results;

    } catch (error) {
      this.log(`❌ Error in skill analysis: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract text from resume object
   *
   * @private
   */
  extractResumeText(resume) {
    if (!resume) return '';

    // Try to get raw resume text or reconstruct from fields
    if (resume.raw_text) {
      return resume.raw_text;
    }

    // Reconstruct from parsed fields
    const parts = [];
    if (resume.skills) {
      const skillsText = Array.isArray(resume.skills)
        ? resume.skills.join(' ')
        : resume.skills;
      parts.push(skillsText);
    }
    if (resume.experience) parts.push(resume.experience);
    if (resume.education) parts.push(resume.education);
    if (resume.certifications) {
      const certsText = Array.isArray(resume.certifications)
        ? resume.certifications.join(' ')
        : resume.certifications;
      parts.push(certsText);
    }

    return parts.join(' ');
  }

  /**
   * Extract text from job object
   *
   * @private
   */
  extractJobText(job) {
    if (!job) return '';

    const parts = [];
    if (job.title) parts.push(job.title);
    if (job.description) parts.push(job.description);
    if (job.requirements) parts.push(job.requirements);

    return parts.join(' ');
  }

  /**
   * Extract skills specifically mentioned in job description
   *
   * @private
   */
  extractJobSkills(jobText) {
    const jobSkillsText = extractAllSkills(jobText);

    // Also try direct keyword matching for common job skill requirements
    const jobSkillKeywords = [
      'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C#', 'Go', 'Rust',
      'React', 'Vue.js', 'Angular', 'Node.js', 'Express',
      'PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch',
      'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes',
      'REST', 'GraphQL', 'gRPC',
      'Machine Learning', 'TensorFlow', 'PyTorch', 'Scikit-learn',
      'Git', 'GitHub', 'GitLab',
      'Agile', 'Scrum', 'DevOps'
    ];

    const jobTextLower = jobText.toLowerCase();
    const additionalSkills = jobSkillKeywords.filter(skill => {
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(jobTextLower) && !jobSkillsText.some(s => s.name.toLowerCase() === skill.toLowerCase());
    });

    return [
      ...jobSkillsText,
      ...additionalSkills.map(s => ({ name: s, confidence: 0.8, source: 'keyword' }))
    ];
  }

  /**
   * Calculate skill match between resume and job
   *
   * @private
   */
  calculateSkillMatch(resumeSkills, jobSkills) {
    const resumeSkillsMap = new Map(
      resumeSkills.map(s => [s.name.toLowerCase(), s])
    );
    const jobSkillsMap = new Map(
      jobSkills.map(s => [s.name.toLowerCase(), s])
    );

    // Find exact matches
    const matchedSkills = [];
    const unmatchedJobSkills = [];

    for (const [skillName, jobSkill] of jobSkillsMap) {
      if (resumeSkillsMap.has(skillName)) {
        matchedSkills.push({
          skill: jobSkill.name || skillName,
          resumeConfidence: resumeSkillsMap.get(skillName).confidence || 0.9,
          jobConfidence: jobSkill.confidence || 0.8
        });
      } else {
        // Try fuzzy matching for variations
        const fuzzyResult = findFuzzyMatch(skillName, 1);
        if (fuzzyResult && resumeSkillsMap.has(fuzzyResult.skill.toLowerCase())) {
          matchedSkills.push({
            skill: fuzzyResult.skill,
            variant: skillName,
            resumeConfidence: resumeSkillsMap.get(fuzzyResult.skill.toLowerCase()).confidence || 0.9,
            jobConfidence: jobSkill.confidence || 0.8
          });
        } else {
          unmatchedJobSkills.push(skillName);
        }
      }
    }

    // Calculate score
    const matchPercentage = jobSkillsMap.size > 0
      ? matchedSkills.length / jobSkillsMap.size
      : 0;

    const score = matchPercentage * 100;

    // Coverage analysis
    const coverageAnalysis = {
      exactMatches: matchedSkills.length,
      requiredSkills: jobSkillsMap.size,
      coverage: `${Math.round(matchPercentage * 100)}%`
    };

    return {
      matchedSkills,
      score: Math.min(100, score),
      matchPercentage,
      coverageAnalysis
    };
  }

  /**
   * Find skills in job but not in resume
   *
   * @private
   */
  findMissingSkills(resumeSkills, jobSkills) {
    const resumeSkillsLower = new Set(
      resumeSkills.map(s => s.name.toLowerCase())
    );

    return jobSkills
      .filter(jobSkill => !resumeSkillsLower.has(jobSkill.name.toLowerCase()))
      .map(s => ({
        skill: s.name,
        importance: s.confidence || 0.8
      }));
  }

  /**
   * Identify skill strength areas
   *
   * @private
   */
  identifyStrengths(resumeSkills, jobSkills) {
    // Find skills the candidate has that are highly valued in the job
    const jobSkillsMap = new Map(
      jobSkills.map(s => [s.name.toLowerCase(), s])
    );

    const strengths = [];

    for (const resumeSkill of resumeSkills) {
      const jobSkill = jobSkillsMap.get(resumeSkill.name.toLowerCase());
      if (jobSkill) {
        strengths.push({
          skill: resumeSkill.name,
          confidence: resumeSkill.confidence || 0.9
        });
      }
    }

    return strengths
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  }

  /**
   * Identify skill gaps to address
   *
   * @private
   */
  identifyGaps(resumeSkills, jobSkills) {
    const resumeSkillsLower = new Set(
      resumeSkills.map(s => s.name.toLowerCase())
    );

    return jobSkills
      .filter(jobSkill => !resumeSkillsLower.has(jobSkill.name.toLowerCase()))
      .sort((a, b) => (b.confidence || 0.8) - (a.confidence || 0.8))
      .slice(0, 5)
      .map(s => ({
        skill: s.name,
        priority: s.confidence || 0.8
      }));
  }

  /**
   * Store newly discovered skills in knowledge base
   *
   * @private
   */
  async storeNewSkillsInKnowledgeBase(matchedSkills) {
    try {
      // Try to store in knowledge_base if it exists
      const skillNames = matchedSkills.map(m => m.skill);

      for (const skillName of skillNames) {
        try {
          // Use the proper add_to_knowledge_base function which handles upserts correctly
          await this.query(
            `SELECT add_to_knowledge_base($1, $2, $3)`,
            [skillName, 'skill', 0.85]
          );
        } catch (e) {
          // Knowledge base might not exist, continue silently
        }
      }
    } catch (error) {
      // Optional feature, don't fail if not available
      this.log(`⚠️  Could not update knowledge base: ${error.message}`);
    }
  }

  /**
   * Define required result fields for validation
   *
   * @protected
   */
  getRequiredResultFields() {
    return ['score', 'matchedSkillsCount', 'totalJobSkillsRequired'];
  }
}

export default SkillAgent;
