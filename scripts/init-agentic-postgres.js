#!/usr/bin/env node

/**
 * Initialize Agentic Postgres Infrastructure
 *
 * This script sets up:
 * 1. Database migrations for agent coordination
 * 2. Fork manager instance
 * 3. MCP client instance
 * 4. Periodic cleanup tasks
 *
 * Usage: node scripts/init-agentic-postgres.js
 */

import dotenv from 'dotenv';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ForkManager from '../lib/fork-manager.js';
import MCPClient from '../lib/mcp-client.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../migrations');

/**
 * Main initialization function
 */
async function initialize() {
  console.log('\n' + '='.repeat(70));
  console.log(' AGENTIC POSTGRES INITIALIZATION');
  console.log('='.repeat(70) + '\n');

  let mainPool = null;

  try {
    // Step 1: Verify database connection
    console.log(' Step 1: Verifying database connection...');
    mainPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    const result = await mainPool.query('SELECT NOW() as time, version()');
    console.log(`    Connected to PostgreSQL: ${result.rows[0].time}`);
    console.log(`   Version: ${result.rows[0].version.split(',')[0]}`);

    // Step 2: Check for required extensions
    console.log('\n Step 2: Checking required extensions...');
    await checkExtensions(mainPool);

    // Step 3: Run migrations
    console.log('\n Step 3: Running database migrations...');
    await runMigrations(mainPool);

    // Step 4: Initialize Fork Manager
    console.log('\n Step 4: Initializing Fork Manager...');
    const forkManager = new ForkManager(process.env.DATABASE_URL);
    const forkHealth = await forkManager.healthCheck();
    console.log(`    Fork Manager: ${forkHealth.status}`);

    // Step 5: Initialize MCP Client
    console.log('\n Step 5: Initializing MCP Client...');
    const mcpClient = new MCPClient({
      apiKey: process.env.TIGER_MCP_KEY,
      workspace: 'resume-analyzer'
    });
    const mcpHealth = mcpClient.getHealthStatus();
    console.log(`    MCP Client: ${mcpHealth.status}`);
    console.log(`   Workspace: ${mcpHealth.workspace}`);

    // Step 6: Schedule cleanup tasks
    console.log('\n Step 6: Scheduling maintenance tasks...');
    forkManager.scheduleCleanup(30); // Cleanup every 30 minutes
    console.log('    Fork cleanup scheduled every 30 minutes');

    // Step 7: Verify schema
    console.log('\n Step 7: Verifying schema...');
    await verifySchema(mainPool);

    // Step 8: Summary
    console.log('\n' + '='.repeat(70));
    console.log(' INITIALIZATION COMPLETE');
    console.log('='.repeat(70));

    console.log(`
 System Status:
  • Database: Connected
  • Fork Manager: Ready
  • MCP Client: Ready
  • Migrations: Applied
  • Cleanup: Scheduled

 Next Steps:
  1. Create specialized agent classes (skill, experience, education, etc.)
  2. Implement agent analysis logic
  3. Set up agent coordinator
  4. Test with sample resumes

 Files Created:
  • migrations/004_agent_coordination.sql
  • lib/fork-manager.js
  • lib/mcp-client.js
  • lib/agents/base-agent.js
  • scripts/init-agentic-postgres.js (this file)

 Documentation:
  • AGENTIC_POSTGRES_ENHANCEMENTS.md - Architecture guide
  • See start.md for project context

`);

    // Step 9: Save configuration
    console.log(' Step 9: Saving configuration...');
    await saveConfiguration({
      database: process.env.DATABASE_URL.split('@')[1] || 'local',
      forkManager: forkHealth,
      mcp: mcpHealth,
      timestamp: new Date().toISOString()
    });

    process.exit(0);

  } catch (error) {
    console.error('\n INITIALIZATION FAILED');
    console.error(`Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);

  } finally {
    if (mainPool) {
      await mainPool.end();
    }
  }
}

/**
 * Check for required PostgreSQL extensions
 */
async function checkExtensions(pool) {
  const requiredExtensions = ['vector', 'pg_trgm', 'uuid-ossp'];

  for (const ext of requiredExtensions) {
    try {
      const result = await pool.query(
        'SELECT extname FROM pg_extension WHERE extname = $1',
        [ext]
      );

      if (result.rows.length > 0) {
        console.log(`    ${ext}: Installed`);
      } else {
        console.log(`   ⏳ ${ext}: Installing...`);
        try {
          await pool.query(`CREATE EXTENSION IF NOT EXISTS ${ext}`);
          console.log(`    ${ext}: Installed`);
        } catch (e) {
          console.warn(`     ${ext}: Could not install (may require superuser): ${e.message}`);
        }
      }
    } catch (error) {
      console.warn(`     ${ext}: Check failed - ${error.message}`);
    }
  }
}

/**
 * Run migration files
 */
async function runMigrations(pool) {
  try {
    // Check if migrations table exists
    const tableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'schema_migrations'
      )`
    );

    if (!tableCheck.rows[0].exists) {
      await pool.query(`
        CREATE TABLE schema_migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          applied_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('   Created migrations table');
    }

    // Get applied migrations
    const appliedResult = await pool.query(
      'SELECT name FROM schema_migrations'
    );
    const applied = new Set(appliedResult.rows.map(r => r.name));

    // Find migration files
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // Run new migrations
    for (const file of files) {
      if (!applied.has(file)) {
        console.log(`   Applying: ${file}`);

        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        await pool.query(sql);

        // Record migration
        await pool.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)',
          [file]
        );

        console.log(`    ${file}`);
      }
    }

    if (applied.size === files.length) {
      console.log('    All migrations applied');
    }

  } catch (error) {
    console.error(`    Migration error: ${error.message}`);
    throw error;
  }
}

/**
 * Verify schema tables exist
 */
async function verifySchema(pool) {
  // Phase 1 & 2 tables
  const requiredTables = [
    'agent_forks',
    'agent_channels',
    'agent_messages',
    'skill_agent_results',
    'experience_agent_results',
    'education_agent_results',
    'certification_agent_results',
    'semantic_agent_results',
    'multi_agent_scores'
  ];

  // Phase 3 tables (optional - may not exist in all environments)
  const phase3Tables = [
    'agent_execution_metrics',
    'batch_jobs',
    'hiring_outcomes',
    'weight_adjustments',
    'api_audit_log',
    'compliance_events'
  ];

  let missingTables = [];

  // Check Phase 1 & 2 tables (required)
  for (const table of requiredTables) {
    const result = await pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = $1
      )`,
      [table]
    );

    if (result.rows[0].exists) {
      console.log(`    ${table}`);
    } else {
      console.log(`    ${table}`);
      missingTables.push(table);
    }
  }

  if (missingTables.length > 0) {
    throw new Error(`Missing tables: ${missingTables.join(', ')}`);
  }

  // Check Phase 3 tables (optional)
  console.log('\n   Phase 3 Analytics Tables:');
  for (const table of phase3Tables) {
    const result = await pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = $1
      )`,
      [table]
    );

    if (result.rows[0].exists) {
      console.log(`    ${table}`);
    } else {
      console.log(`   ℹ  ${table} (not yet created - Phase 3 optional)`);
    }
  }

  // Verify views exist
  const views = ['active_agent_forks', 'completed_agent_work', 'agent_performance'];
  console.log('\n   Views:');
  for (const view of views) {
    const result = await pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_name = $1
      )`,
      [view]
    );

    if (result.rows[0].exists) {
      console.log(`    View: ${view}`);
    }
  }

  // Check for Phase 3 views if tables exist
  const phase3Views = ['agent_performance_24h', 'batch_processing_summary', 'hiring_accuracy_metrics'];
  const phase3TableExists = await pool.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'agent_execution_metrics'
    )`
  );

  if (phase3TableExists.rows[0].exists) {
    console.log('\n   Phase 3 Views:');
    for (const view of phase3Views) {
      const result = await pool.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.views
          WHERE table_name = $1
        )`,
        [view]
      );

      if (result.rows[0].exists) {
        console.log(`    ${view}`);
      }
    }
  }
}

/**
 * Save initialization configuration
 */
async function saveConfiguration(config) {
  const configFile = path.join(__dirname, '../.agentic-postgres-init.json');

  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  console.log(`    Configuration saved to .agentic-postgres-init.json`);
}

// Run initialization
initialize().catch(console.error);
