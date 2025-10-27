#!/usr/bin/env node
// Initialize Tiger Database schema for Resume-Job Fit Analyzer

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not set in .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function initializeDatabase() {
  const client = await pool.connect();

  try {
    console.log('\n' + '='.repeat(70));
    console.log('🗄️  Initializing Tiger Database Schema');
    console.log('='.repeat(70));
    console.log(`[${new Date().toISOString()}] 🔄 Creating tables...\n`);

    // Create resumes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS resumes (
        id SERIAL PRIMARY KEY,
        resume_id VARCHAR(255) UNIQUE NOT NULL,
        candidate_name VARCHAR(255),
        raw_text TEXT,
        skills TEXT[],
        years_experience INT,
        email VARCHAR(255),
        phone VARCHAR(20),
        embedding JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Table "resumes" created');

    // Create jobs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        job_id VARCHAR(255) UNIQUE NOT NULL,
        title VARCHAR(255),
        description TEXT,
        required_years INT,
        embedding JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Table "jobs" created');

    // Create fit_scores table
    await client.query(`
      CREATE TABLE IF NOT EXISTS fit_scores (
        id SERIAL PRIMARY KEY,
        resume_id VARCHAR(255),
        job_id VARCHAR(255),
        keyword_score FLOAT,
        semantic_score FLOAT,
        experience_score FLOAT,
        composite_score FLOAT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Table "fit_scores" created');

    // Check table status
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log(`\n📊 Database Tables (${tables.rowCount}):`);
    tables.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. ${row.table_name}`);
    });

    console.log(`\n[${new Date().toISOString()}] ✅ Database initialization complete`);
    console.log('='.repeat(70));
    console.log('\n🚀 Ready to use Tiger Database!\n');

  } catch (error) {
    console.error(`\n❌ Error during initialization:`, error.message);
    if (error.detail) {
      console.error(`   Detail: ${error.detail}`);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

initializeDatabase();
