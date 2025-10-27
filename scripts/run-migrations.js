#!/usr/bin/env node

/**
 * Run Database Migrations
 * Sets up Tiger Database schema with pgvector support
 * Usage: node scripts/run-migrations.js
 */

import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ============================================================================
// Migration Runner
// ============================================================================

async function runMigrations() {
  try {
    console.log(' Running database migrations...\n');

    // Step 1: Enable pgvector extension
    console.log('1⃣  Enabling pgvector extension...');
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
      console.log('    pgvector enabled\n');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('   ℹ  pgvector already enabled\n');
      } else {
        throw error;
      }
    }

    // Step 2: Enable fuzzy search (for similarity)
    console.log('2⃣  Enabling fuzzy search extension...');
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      console.log('    pg_trgm enabled\n');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('   ℹ  pg_trgm already enabled\n');
      } else {
        throw error;
      }
    }

    // Step 3: Enable full-text search
    console.log('3⃣  Enabling full-text search...');
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS unaccent');
      console.log('    unaccent enabled\n');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('   ℹ  unaccent already enabled\n');
      } else {
        throw error;
      }
    }

    // Step 4: Run main schema migration
    console.log('4⃣  Creating tables and indexes...');
    const schemaPath = path.join(__dirname, '../migrations/001_create_skills_certifications_schema.sql');

    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Migration file not found: ${schemaPath}`);
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    await pool.query(schemaSql);
    console.log('    Tables and indexes created\n');

    // Step 5: Verify tables exist
    console.log('5⃣  Verifying schema...');
    const tables = ['skills', 'certifications', 'education_levels', 'job_titles'];

    for (const table of tables) {
      const result = await pool.query(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)",
        [table]
      );

      if (result.rows[0].exists) {
        console.log(`    ${table} table exists`);
      } else {
        throw new Error(`Table ${table} was not created`);
      }
    }

    console.log('\n All migrations completed successfully!\n');

    // Step 6: Display schema info
    console.log(' Schema Information:');
    const tableInfo = await pool.query(`
      SELECT
        table_name,
        (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t.table_name) as column_count,
        (SELECT count(*) FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = t.table_name) as constraint_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
      AND table_name IN ('skills', 'certifications', 'education_levels', 'job_titles', 'skill_relationships')
      ORDER BY table_name
    `);

    for (const row of tableInfo.rows) {
      console.log(
        `   - ${row.table_name}: ${row.column_count} columns, ${row.constraint_count} constraints`
      );
    }

    console.log('\n Next steps:');
    console.log('   1. Seed initial data: node scripts/seed-database.js');
    console.log('   2. Update .env with database configuration');
    console.log('   3. Start server: npm start\n');

    process.exit(0);
  } catch (error) {
    console.error(' Migration failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('   - Ensure DATABASE_URL is set in .env');
    console.error('   - Ensure pgvector extension is available on Tiger Cloud');
    console.error('   - Check database permissions');
    console.error(`\nError details: ${error.stack}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migrations
runMigrations();
