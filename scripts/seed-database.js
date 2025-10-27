#!/usr/bin/env node

/**
 * Seed Database with Skills & Certifications
 *
 * This script populates Tiger Database with skills and certifications
 * Run once: node scripts/seed-database.js
 */

import pkg from 'pg';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ============================================================================
// Initial Skills & Certifications Data
// ============================================================================

const INITIAL_SKILLS = [
  // Programming Languages
  { name: 'Python', category: 'programming', subcategory: 'language', demand: 'high', salary: 15000, difficulty: 'beginner', trending: true },
  { name: 'JavaScript', category: 'programming', subcategory: 'language', demand: 'high', salary: 12000, difficulty: 'beginner', trending: true },
  { name: 'TypeScript', category: 'programming', subcategory: 'language', demand: 'high', salary: 8000, difficulty: 'intermediate', trending: true },
  { name: 'Java', category: 'programming', subcategory: 'language', demand: 'high', salary: 10000, difficulty: 'intermediate', trending: false },
  { name: 'Go', category: 'programming', subcategory: 'language', demand: 'medium', salary: 12000, difficulty: 'intermediate', trending: true },
  { name: 'Rust', category: 'programming', subcategory: 'language', demand: 'medium', salary: 14000, difficulty: 'advanced', trending: true },
  { name: 'C++', category: 'programming', subcategory: 'language', demand: 'medium', salary: 8000, difficulty: 'advanced', trending: false },
  { name: 'C#', category: 'programming', subcategory: 'language', demand: 'high', salary: 9000, difficulty: 'intermediate', trending: false },
  { name: 'PHP', category: 'programming', subcategory: 'language', demand: 'medium', salary: 3000, difficulty: 'beginner', trending: false },
  { name: 'Ruby', category: 'programming', subcategory: 'language', demand: 'low', salary: 2000, difficulty: 'beginner', trending: false },
  { name: 'Swift', category: 'programming', subcategory: 'language', demand: 'medium', salary: 5000, difficulty: 'intermediate', trending: false },
  { name: 'Kotlin', category: 'programming', subcategory: 'language', demand: 'low', salary: 3000, difficulty: 'intermediate', trending: false },

  // Frontend Frameworks
  { name: 'React', category: 'frontend', subcategory: 'framework', demand: 'high', salary: 10000, difficulty: 'intermediate', trending: true },
  { name: 'Vue.js', category: 'frontend', subcategory: 'framework', demand: 'medium', salary: 6000, difficulty: 'intermediate', trending: true },
  { name: 'Angular', category: 'frontend', subcategory: 'framework', demand: 'medium', salary: 5000, difficulty: 'advanced', trending: false },
  { name: 'Next.js', category: 'frontend', subcategory: 'framework', demand: 'high', salary: 9000, difficulty: 'advanced', trending: true },
  { name: 'Svelte', category: 'frontend', subcategory: 'framework', demand: 'low', salary: 4000, difficulty: 'intermediate', trending: true },

  // Backend Frameworks
  { name: 'Express.js', category: 'backend', subcategory: 'framework', demand: 'high', salary: 8000, difficulty: 'intermediate', trending: true },
  { name: 'Django', category: 'backend', subcategory: 'framework', demand: 'high', salary: 9000, difficulty: 'intermediate', trending: true },
  { name: 'Flask', category: 'backend', subcategory: 'framework', demand: 'medium', salary: 7000, difficulty: 'beginner', trending: true },
  { name: 'Spring Boot', category: 'backend', subcategory: 'framework', demand: 'high', salary: 11000, difficulty: 'advanced', trending: true },
  { name: 'FastAPI', category: 'backend', subcategory: 'framework', demand: 'high', salary: 10000, difficulty: 'intermediate', trending: true },
  { name: 'Nest.js', category: 'backend', subcategory: 'framework', demand: 'medium', salary: 8000, difficulty: 'intermediate', trending: true },

  // Databases
  { name: 'PostgreSQL', category: 'database', subcategory: 'sql', demand: 'high', salary: 8000, difficulty: 'intermediate', trending: true },
  { name: 'MySQL', category: 'database', subcategory: 'sql', demand: 'high', salary: 5000, difficulty: 'beginner', trending: false },
  { name: 'MongoDB', category: 'database', subcategory: 'nosql', demand: 'high', salary: 7000, difficulty: 'intermediate', trending: true },
  { name: 'Redis', category: 'database', subcategory: 'cache', demand: 'high', salary: 6000, difficulty: 'intermediate', trending: true },
  { name: 'Elasticsearch', category: 'database', subcategory: 'search', demand: 'medium', salary: 8000, difficulty: 'advanced', trending: true },
  { name: 'Firebase', category: 'database', subcategory: 'cloud', demand: 'medium', salary: 4000, difficulty: 'beginner', trending: true },

  // Cloud & DevOps
  { name: 'AWS', category: 'cloud', subcategory: 'provider', demand: 'high', salary: 12000, difficulty: 'advanced', trending: true },
  { name: 'Azure', category: 'cloud', subcategory: 'provider', demand: 'high', salary: 11000, difficulty: 'advanced', trending: true },
  { name: 'Google Cloud', category: 'cloud', subcategory: 'provider', demand: 'medium', salary: 10000, difficulty: 'advanced', trending: true },
  { name: 'Docker', category: 'devops', subcategory: 'container', demand: 'high', salary: 9000, difficulty: 'intermediate', trending: true },
  { name: 'Kubernetes', category: 'devops', subcategory: 'orchestration', demand: 'high', salary: 12000, difficulty: 'advanced', trending: true },
  { name: 'Terraform', category: 'devops', subcategory: 'iac', demand: 'high', salary: 9000, difficulty: 'intermediate', trending: true },
  { name: 'Jenkins', category: 'devops', subcategory: 'ci-cd', demand: 'high', salary: 7000, difficulty: 'intermediate', trending: false },
  { name: 'GitHub Actions', category: 'devops', subcategory: 'ci-cd', demand: 'high', salary: 5000, difficulty: 'beginner', trending: true },
  { name: 'GitLab CI', category: 'devops', subcategory: 'ci-cd', demand: 'medium', salary: 5000, difficulty: 'beginner', trending: true },

  // Data & ML
  { name: 'Machine Learning', category: 'data', subcategory: 'ml', demand: 'high', salary: 20000, difficulty: 'advanced', trending: true },
  { name: 'TensorFlow', category: 'data', subcategory: 'ml-framework', demand: 'high', salary: 15000, difficulty: 'advanced', trending: true },
  { name: 'PyTorch', category: 'data', subcategory: 'ml-framework', demand: 'high', salary: 15000, difficulty: 'advanced', trending: true },
  { name: 'Pandas', category: 'data', subcategory: 'data-processing', demand: 'high', salary: 8000, difficulty: 'intermediate', trending: true },
  { name: 'NumPy', category: 'data', subcategory: 'data-processing', demand: 'high', salary: 7000, difficulty: 'intermediate', trending: true },
  { name: 'Apache Spark', category: 'data', subcategory: 'big-data', demand: 'high', salary: 14000, difficulty: 'advanced', trending: true },

  // Other Important Skills
  { name: 'Git', category: 'tools', subcategory: 'version-control', demand: 'high', salary: 0, difficulty: 'beginner', trending: false },
  { name: 'REST API', category: 'architecture', subcategory: 'api', demand: 'high', salary: 5000, difficulty: 'intermediate', trending: true },
  { name: 'GraphQL', category: 'architecture', subcategory: 'api', demand: 'medium', salary: 6000, difficulty: 'intermediate', trending: true },
  { name: 'Microservices', category: 'architecture', subcategory: 'design', demand: 'high', salary: 8000, difficulty: 'advanced', trending: true },
  { name: 'CI/CD', category: 'devops', subcategory: 'automation', demand: 'high', salary: 6000, difficulty: 'intermediate', trending: true },
  { name: 'Linux', category: 'os', subcategory: 'operating-system', demand: 'high', salary: 3000, difficulty: 'intermediate', trending: true }
];

const INITIAL_CERTIFICATIONS = [
  // AWS
  { name: 'AWS Certified Solutions Architect', issuer: 'AWS', category: 'cloud', salary: 5000, difficulty: 'advanced' },
  { name: 'AWS Certified Developer Associate', issuer: 'AWS', category: 'cloud', salary: 3000, difficulty: 'intermediate' },
  { name: 'AWS Certified Cloud Practitioner', issuer: 'AWS', category: 'cloud', salary: 2000, difficulty: 'beginner' },

  // Azure
  { name: 'Azure Administrator Certified', issuer: 'Microsoft', category: 'cloud', salary: 4000, difficulty: 'intermediate' },
  { name: 'Azure Solutions Architect', issuer: 'Microsoft', category: 'cloud', salary: 5000, difficulty: 'advanced' },

  // Google Cloud
  { name: 'Google Cloud Professional Data Engineer', issuer: 'Google', category: 'cloud', salary: 4000, difficulty: 'advanced' },
  { name: 'Google Cloud Associate Cloud Engineer', issuer: 'Google', category: 'cloud', salary: 3000, difficulty: 'intermediate' },

  // Kubernetes
  { name: 'Certified Kubernetes Administrator', issuer: 'CNCF', category: 'devops', salary: 6000, difficulty: 'advanced' },
  { name: 'Certified Kubernetes Developer', issuer: 'CNCF', category: 'devops', salary: 4000, difficulty: 'advanced' },

  // Security
  { name: 'CISSP', issuer: 'ISC', category: 'security', salary: 8000, difficulty: 'advanced' },
  { name: 'Certified Ethical Hacker', issuer: 'EC-Council', category: 'security', salary: 3000, difficulty: 'advanced' },
  { name: 'CompTIA Security+', issuer: 'CompTIA', category: 'security', salary: 2000, difficulty: 'intermediate' },

  // Project Management
  { name: 'PMP - Project Management Professional', issuer: 'PMI', category: 'management', salary: 4000, difficulty: 'advanced' },
  { name: 'PRINCE2 Certified', issuer: 'APMG', category: 'management', salary: 3000, difficulty: 'intermediate' },

  // Agile & Scrum
  { name: 'Certified Scrum Master', issuer: 'Scrum Alliance', category: 'agile', salary: 2000, difficulty: 'beginner' },
  { name: 'Certified Scrum Product Owner', issuer: 'Scrum Alliance', category: 'agile', salary: 2000, difficulty: 'intermediate' },

  // Data & Analytics
  { name: 'Tableau Desktop Specialist', issuer: 'Tableau', category: 'data', salary: 2000, difficulty: 'intermediate' },
  { name: 'Google Data Analytics Certificate', issuer: 'Google', category: 'data', salary: 1000, difficulty: 'beginner' },

  // Java & Programming
  { name: 'Oracle Certified Associate Java Programmer', issuer: 'Oracle', category: 'programming', salary: 2000, difficulty: 'intermediate' },
  { name: 'Oracle Certified Professional Java Programmer', issuer: 'Oracle', category: 'programming', salary: 3000, difficulty: 'advanced' },

  // Linux
  { name: 'Red Hat Certified System Administrator', issuer: 'Red Hat', category: 'devops', salary: 3000, difficulty: 'advanced' },
  { name: 'Red Hat Certified Engineer', issuer: 'Red Hat', category: 'devops', salary: 4000, difficulty: 'advanced' }
];

// ============================================================================
// Seeding Functions
// ============================================================================

async function seedSkills() {
  console.log('\n📚 Seeding skills...');

  for (const skill of INITIAL_SKILLS) {
    try {
      // For now, use null embeddings - they can be generated later
      const result = await pool.query(
        `INSERT INTO skills (
          name, category, subcategory, demand_level,
          salary_impact_usd, difficulty_level, trending
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (name) DO UPDATE SET
          updated_at = NOW()
        RETURNING id`,
        [
          skill.name,
          skill.category,
          skill.subcategory,
          skill.demand,
          skill.salary,
          skill.difficulty,
          skill.trending
        ]
      );

      if (result.rows.length > 0) {
        console.log(`  ✅ ${skill.name} (ID: ${result.rows[0].id})`);
      }
    } catch (error) {
      console.warn(`  ❌ Error seeding ${skill.name}:`, error.message);
    }
  }

  console.log(`✅ Seeded ${INITIAL_SKILLS.length} skills`);
}

async function seedCertifications() {
  console.log('\n📜 Seeding certifications...');

  for (const cert of INITIAL_CERTIFICATIONS) {
    try {
      const result = await pool.query(
        `INSERT INTO certifications (
          name, issuer, category,
          salary_impact_usd, difficulty_level, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (name) DO UPDATE SET
          updated_at = NOW()
        RETURNING id`,
        [
          cert.name,
          cert.issuer,
          cert.category,
          cert.salary,
          cert.difficulty,
          true
        ]
      );

      if (result.rows.length > 0) {
        console.log(`  ✅ ${cert.name} (ID: ${result.rows[0].id})`);
      }
    } catch (error) {
      console.warn(`  ❌ Error seeding ${cert.name}:`, error.message);
    }
  }

  console.log(`✅ Seeded ${INITIAL_CERTIFICATIONS.length} certifications`);
}

async function seedEducationLevels() {
  console.log('\n🎓 Education levels already seeded via migration');
}

async function createSkillRelationships() {
  console.log('\n🔗 Creating skill relationships...');

  const relationships = [
    { skill: 'React', related: 'JavaScript', type: 'prerequisite' },
    { skill: 'Vue.js', related: 'JavaScript', type: 'prerequisite' },
    { skill: 'Angular', related: 'TypeScript', type: 'prerequisite' },
    { skill: 'Next.js', related: 'React', type: 'advanced' },
    { skill: 'Express.js', related: 'JavaScript', type: 'prerequisite' },
    { skill: 'Django', related: 'Python', type: 'prerequisite' },
    { skill: 'Flask', related: 'Python', type: 'prerequisite' },
    { skill: 'Spring Boot', related: 'Java', type: 'prerequisite' },
    { skill: 'FastAPI', related: 'Python', type: 'prerequisite' },
    { skill: 'Docker', related: 'Linux', type: 'complementary' },
    { skill: 'Kubernetes', related: 'Docker', type: 'advanced' },
    { skill: 'AWS', related: 'Linux', type: 'complementary' },
    { skill: 'Machine Learning', related: 'Python', type: 'advanced' },
    { skill: 'TensorFlow', related: 'Machine Learning', type: 'prerequisite' },
    { skill: 'PyTorch', related: 'Machine Learning', type: 'prerequisite' }
  ];

  for (const rel of relationships) {
    try {
      // Get skill IDs
      const skillResult = await pool.query(
        'SELECT id FROM skills WHERE LOWER(name) = LOWER($1)',
        [rel.skill]
      );
      const relatedResult = await pool.query(
        'SELECT id FROM skills WHERE LOWER(name) = LOWER($1)',
        [rel.related]
      );

      if (skillResult.rows.length > 0 && relatedResult.rows.length > 0) {
        await pool.query(
          `INSERT INTO skill_relationships (skill_id, related_skill_id, relationship_type, relevance_score)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [skillResult.rows[0].id, relatedResult.rows[0].id, rel.type, 0.8]
        );

        console.log(`  ✅ ${rel.skill} → ${rel.related} (${rel.type})`);
      }
    } catch (error) {
      console.warn(`  ❌ Error creating relationship:`, error.message);
    }
  }

  console.log(`✅ Created skill relationships`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    console.log('🌱 Starting database seed...');

    // Check if skills table exists
    const checkTable = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skills')"
    );

    if (!checkTable.rows[0].exists) {
      console.error('❌ Skills table does not exist. Run migrations first:');
      console.error('   node scripts/run-migrations.js');
      process.exit(1);
    }

    // Seed data
    await seedSkills();
    await seedCertifications();
    await seedEducationLevels();
    await createSkillRelationships();

    console.log('\n✅ Database seeding complete!');
    console.log('\n📊 Summary:');
    console.log(`   - ${INITIAL_SKILLS.length} skills added`);
    console.log(`   - ${INITIAL_CERTIFICATIONS.length} certifications added`);
    console.log('   - Education levels configured');
    console.log('   - Skill relationships created');

    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (process.argv[1].includes('seed-database.js')) {
  main();
}

export { seedSkills, seedCertifications, createSkillRelationships };
