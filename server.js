// Resume-Job Fit Backend Server
// Real implementation with Tiger Database and proper resume parsing

import express from 'express';
import multer from 'multer';
import pkg from 'pg';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import cors from 'cors';
import bodyParser from 'body-parser';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// NLP and improved scoring modules
import {
  initializeNLPPipelines,
  extractSkillsFromResume,
  extractCertificationsFromResume,
  findRelatedSkills
} from './lib/nlp-skill-extractor.js';

import { extractAllSkills } from './lib/skill-matcher.js';

import { learnFromResume, getKnowledgeBaseItems } from './lib/knowledge-base.js';

import * as scoring from './lib/improved-scoring.js';

// Multi-agent system
import ForkManager from './lib/fork-manager.js';
import AgentCoordinator from './lib/agents/coordinator.js';

// Phase 3: Advanced Features
import WeightOptimizer from './lib/weight-optimizer.js';
import AgentAnalytics from './lib/agent-analytics.js';
import { BatchProcessor } from './lib/batch-processor.js';

dotenv.config();

const { Pool } = pkg;
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const PORT = process.env.PORT || 8080;
const DB_CONNECTION_STRING = process.env.DATABASE_URL;
const EMBEDDING_METHOD = process.env.EMBEDDING_METHOD || 'stub';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEBUG = process.env.DEBUG === 'true';

// Scoring weights
const SCORING_WEIGHTS = {
  keyword: parseFloat(process.env.WEIGHT_KEYWORD || 0.35),
  semantic: parseFloat(process.env.WEIGHT_SEMANTIC || 0.45),
  structured: parseFloat(process.env.WEIGHT_STRUCTURED || 0.20)
};

console.log('\n' + '='.repeat(70));
console.log('RESUME-JOB FIT ANALYZER - SERVER STARTING');
console.log('='.repeat(70));
console.log(`[${new Date().toISOString()}] Configuration:`);
console.log(`  PORT: ${PORT}`);
console.log(`  EMBEDDING_METHOD: ${EMBEDDING_METHOD}`);
console.log(`  DATABASE: ${DB_CONNECTION_STRING ? 'Tiger Cloud (PostgreSQL)' : 'In-Memory (fallback)'}`);
console.log(`  WEIGHTS - Keyword: ${SCORING_WEIGHTS.keyword}, Semantic: ${SCORING_WEIGHTS.semantic}, Structured: ${SCORING_WEIGHTS.structured}`);

// ============================================================================
// Database Connection
// ============================================================================

let pool = null;
let usingDatabase = false;

if (DB_CONNECTION_STRING) {
  console.log(`\n[${new Date().toISOString()}] Connecting to Tiger Database...`);

  pool = new Pool({
    connectionString: DB_CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Database pool error:`, err.message);
  });

  // Test connection
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.error(`[${new Date().toISOString()}] DATABASE CONNECTION FAILED:`, err.message);
      console.error(`    Code: ${err.code}`);
      console.error(`    Details: ${err.detail || 'See above'}`);
      console.log(`\nFalling back to IN-MEMORY storage\n`);
      pool = null;
      usingDatabase = false;
    } else {
      console.log(`[${new Date().toISOString()}] DATABASE CONNECTED`);
      console.log(`    Server: ${res.rows[0].now}`);
      usingDatabase = true;
      // Initialize multi-agent system after database is confirmed
      initializeMultiAgentSystem();
    }
  });
} else {
  console.log(`[${new Date().toISOString()}] No DATABASE_URL provided, using IN-MEMORY storage`);
}

// ============================================================================
// Multi-Agent System Initialization (Phase 1 & 2)
// ============================================================================

let forkManager = null;
let agentCoordinator = null;
let multiAgentEnabled = false;

// Phase 3 Advanced Features
let batchProcessor = null;
let agentAnalytics = null;
let weightOptimizer = null;

/**
 * Initialize multi-agent system after database connection is confirmed
 */
function initializeMultiAgentSystem() {
  if (!DB_CONNECTION_STRING || !usingDatabase) {
    return; // Skip if no database or not connected
  }

  try {
    console.log(`\n[${new Date().toISOString()}] Initializing Multi-Agent System...`);
    forkManager = new ForkManager(DB_CONNECTION_STRING);
    agentCoordinator = new AgentCoordinator({
      forkManager: forkManager,
      databaseUrl: DB_CONNECTION_STRING,
      database: pool, // Phase 3: Pass database connection for analytics
      timeout: 120000
    });

    // Phase 3: Initialize advanced features
    console.log(`[${new Date().toISOString()}] Initializing Phase 3 Advanced Features...`);
    weightOptimizer = new WeightOptimizer();
    agentAnalytics = new AgentAnalytics(pool);
    batchProcessor = new BatchProcessor(agentCoordinator, forkManager, 10); // Max 10 concurrent jobs

    multiAgentEnabled = true;
    console.log(`[${new Date().toISOString()}] Multi-Agent System + Phase 3 Features ready`);
  } catch (error) {
    console.warn(`[${new Date().toISOString()}] Multi-Agent System initialization failed:`, error.message);
    console.log(`[${new Date().toISOString()}] Single-agent scoring still available`);
    // Ensure clean state even if initialization partially succeeded
    forkManager = null;
    agentCoordinator = null;
    batchProcessor = null;
    agentAnalytics = null;
    weightOptimizer = null;
    multiAgentEnabled = false;
  }
}

// Fallback in-memory storage
const resumes = new Map();
const jobs = new Map();
const fitScores = new Map();

// ============================================================================
// Memory Cleanup for In-Memory Storage
// ============================================================================
// Clean up old entries from in-memory storage to prevent unbounded growth
// Runs every 30 minutes and removes entries older than 1 hour

function cleanupInMemoryStorage() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  let resumeCount = 0;
  let jobCount = 0;

  // Clean up old resumes
  for (const [id, resume] of resumes.entries()) {
    if (resume.created_at && new Date(resume.created_at).getTime() < oneHourAgo) {
      resumes.delete(id);
      resumeCount++;
    }
  }

  // Clean up old jobs
  for (const [id, job] of jobs.entries()) {
    if (job.created_at && new Date(job.created_at).getTime() < oneHourAgo) {
      jobs.delete(id);
      jobCount++;
    }
  }

  // Clean up old fit scores
  for (const [id, score] of fitScores.entries()) {
    if (score.created_at && new Date(score.created_at).getTime() < oneHourAgo) {
      fitScores.delete(id);
    }
  }

  if (resumeCount > 0 || jobCount > 0) {
    console.log(`[${new Date().toISOString()}]  Memory cleanup: Removed ${resumeCount} old resumes, ${jobCount} old jobs`);
  }
}

// Schedule cleanup to run every 30 minutes
setInterval(cleanupInMemoryStorage, 30 * 60 * 1000);

// UUID generator
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Debug logging function
function debugLog(...args) {
  if (DEBUG) {
    console.log('[DEBUG]', ...args);
  }
}

// ============================================================================
// Middleware Setup
// ============================================================================

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for documents
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Only PDF, TXT, DOC, and DOCX files allowed. Got: ${file.mimetype}`));
    }
  }
});

// ============================================================================
// Rate Limiting Setup
// ============================================================================
// Prevent abuse and DOS attacks on API endpoints

// General API rate limit: 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skip: (req) => req.path === '/api/health' // Don't count health checks
});

// Strict rate limit for upload endpoint: 10 uploads per 15 minutes
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many resume uploads, please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip // Use IP for rate limiting
});

// Strict rate limit for job description endpoint: 20 jobs per 15 minutes
const jobLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: 'Too many job descriptions, please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false
});

// Strict rate limit for scoring: 50 scores per 15 minutes
const scoreLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: 'Too many scoring requests, please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false
});

// Apply general API limiter to all /api routes
app.use('/api/', apiLimiter);

app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// Resume Parsing - PROPER IMPLEMENTATION
// ============================================================================

/**
 * Extract text from various document formats
 */
async function extractTextFromDocument(buffer, mimetype, filename) {
  console.log(`[${new Date().toISOString()}]  Extracting text from: ${filename} (${mimetype})`);

  try {
    if (mimetype === 'application/pdf') {
      const pdfData = await pdfParse(buffer);
      console.log(`[${new Date().toISOString()}]  PDF extracted: ${pdfData.numpages} pages`);
      return pdfData.text;
    } else if (mimetype.includes('wordprocessingml') || mimetype === 'application/msword') {
      // DOCX/DOC file
      const result = await mammoth.extractRawText({ buffer });
      console.log(`[${new Date().toISOString()}]  DOCX extracted: ${result.value.length} characters`);
      return result.value;
    } else {
      // Plain text
      const text = buffer.toString('utf-8');
      console.log(`[${new Date().toISOString()}]  Text file read: ${text.length} characters`);
      return text;
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}]  Text extraction error:`, error.message);
    throw error;
  }
}

/**
 * Extract years of experience from employment date ranges
 * Handles formats like: 2020-2024, Jan 2020 - Dec 2024, etc.
 */
function extractYearsFromEmploymentDates(text) {
  if (!text || typeof text !== 'string') return 0;

  // Patterns for date ranges
  const dateRangePatterns = [
    // YYYY-YYYY format (e.g., 2020-2024)
    /(\d{4})\s*[-–]\s*(\d{4})/g,
    // Month Year - Month Year (e.g., Jan 2020 - Dec 2024, January 2020 - Present)
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]?\s+(\d{4})\s*[-–]\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Present|Current)[a-z]?\s+(\d{4})?/gi,
    // MM/YYYY - MM/YYYY format
    /(\d{1,2})\/(\d{4})\s*[-–]\s*(\d{1,2})\/(\d{4})/g
  ];

  let totalYears = 0;
  let dateRangesFound = [];

  // Pattern 1: YYYY-YYYY
  let match;
  const pattern1 = /(\d{4})\s*[-–]\s*(\d{4})/g;
  while ((match = pattern1.exec(text)) !== null) {
    const startYear = parseInt(match[1], 10);
    const endYear = parseInt(match[2], 10);
    if (startYear < endYear && endYear <= new Date().getFullYear() + 1) {
      const yearsInRole = endYear - startYear;
      dateRangesFound.push(yearsInRole);
      totalYears += yearsInRole;
    }
  }

  // Pattern 2: Month Year - Month Year or Present
  const pattern2 = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]?\s+(\d{4})\s*[-–]\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Present|Current)[a-z]?\s+(\d{4})?/gi;
  while ((match = pattern2.exec(text)) !== null) {
    const startYear = parseInt(match[1], 10);
    const endYear = match[2] ? parseInt(match[2], 10) : new Date().getFullYear();
    if (startYear <= endYear) {
      const yearsInRole = endYear - startYear;
      if (yearsInRole > 0 && yearsInRole < 80) { // Sanity check
        dateRangesFound.push(yearsInRole);
        totalYears += yearsInRole;
      }
    }
  }

  // Pattern 3: MM/YYYY - MM/YYYY
  const pattern3 = /(\d{1,2})\/(\d{4})\s*[-–]\s*(\d{1,2})\/(\d{4})/g;
  while ((match = pattern3.exec(text)) !== null) {
    const startMonth = parseInt(match[1], 10);
    const startYear = parseInt(match[2], 10);
    const endMonth = parseInt(match[3], 10);
    const endYear = parseInt(match[4], 10);

    if (startYear < endYear || (startYear === endYear && startMonth < endMonth)) {
      // Calculate exact years with decimal (e.g., 1.5 years)
      const startDate = new Date(startYear, startMonth - 1, 1);
      const endDate = new Date(endYear, endMonth - 1, 1);
      const yearsInRole = (endDate - startDate) / (1000 * 60 * 60 * 24 * 365.25);
      if (yearsInRole > 0 && yearsInRole < 80) {
        dateRangesFound.push(yearsInRole);
        totalYears += yearsInRole;
      }
    }
  }

  // Return rounded total
  return Math.round(totalYears * 10) / 10;
}

/**
 * Parse resume with comprehensive skill extraction
 */
function parseResume(text) {
  console.log(`[${new Date().toISOString()}]  Parsing resume text...`);

  const resume = {
    candidate_name: '',
    email: '',
    phone: '',
    skills: [],
    years_experience: 0,
    education: [],
    certifications: [],
    job_titles: [],
    companies: []
  };

  // Extract candidate name - multiple flexible patterns
  let nameMatch = null;

  // Pattern 1: "Name: ..." or "Name:" followed by name
  nameMatch = text.match(/^[^\n]*Name\s*:?\s*([A-Z][A-Za-z\s\-'.]+)/im);

  // Pattern 2: First line that looks like a name (multiple capitalized words)
  if (!nameMatch) {
    const firstLine = text.split('\n')[0].trim();
    if (firstLine && firstLine.match(/^[A-Z][A-Za-z\s\-'.]{2,}$/)) {
      nameMatch = { 1: firstLine };
    }
  }

  // Pattern 3: Capitalized words at the beginning
  if (!nameMatch) {
    nameMatch = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/m);
  }

  // Pattern 4: Name before email
  if (!nameMatch) {
    nameMatch = text.match(/([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z\-'.]+)*)\s*[\n\r]+.*@/);
  }

  // Pattern 5: Between "Contact" and email
  if (!nameMatch) {
    nameMatch = text.match(/(?:Contact|Profile)\s*:?\s*([A-Z][A-Za-z\s\-'.]+?)(?:[\n\r]|Email|Phone)/i);
  }

  if (nameMatch) {
    const extractedName = nameMatch[1].trim().split(/\s{2,}|\n/)[0].trim();
    if (extractedName && extractedName.length > 2 && extractedName.length < 60) {
      resume.candidate_name = extractedName;
      console.log(`   Name: ${resume.candidate_name}`);
    }
  }

  // Extract email
  const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  if (emailMatch) {
    resume.email = emailMatch[1];
    console.log(`   Email: ${resume.email}`);
  }

  // Extract phone
  const phoneMatch = text.match(/(\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9})/);
  if (phoneMatch) {
    resume.phone = phoneMatch[1];
    console.log(`   Phone: ${resume.phone}`);
  }

  // COMPREHENSIVE SKILL LIST - 200+ technologies
  const allSkills = [
    // Programming Languages (30+)
    'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C#', 'Go', 'Rust', 'PHP', 'Ruby', 'Swift', 'Kotlin',
    'Scala', 'R', 'MATLAB', 'Perl', 'Bash', 'Shell', 'Groovy', 'Clojure', 'Haskell', 'Elixir', 'Lua', 'D',
    'Julia', 'Scheme', 'Lisp', 'Objective-C', 'VB.NET', 'PowerShell', 'F#', 'Dart',

    // Frontend Frameworks & Libraries (25+)
    'React', 'Vue.js', 'Vue', 'Angular', 'Next.js', 'Next', 'Svelte', 'Ember', 'Backbone', 'jQuery',
    'Nuxt', 'Gatsby', 'Remix', 'SvelteKit', 'Qwik', 'Astro', 'Alpine.js', 'Lit', 'Preact', 'Inferno',
    'MobX', 'Redux', 'Zustand', 'Jotai', 'Recoil', 'Valtio',

    // Frontend Styling (15+)
    'HTML', 'CSS', 'SASS', 'SCSS', 'LESS', 'Stylus', 'PostCSS', 'CSS-in-JS', 'Styled Components',
    'Emotion', 'Tailwind', 'Bootstrap', 'Material UI', 'Chakra UI', 'Ant Design',

    // Build & Module Tools (15+)
    'Webpack', 'Vite', 'Babel', 'Parcel', 'Rollup', 'esbuild', 'Turbopack', 'SWC', 'TypeScript Compiler',
    'Gulp', 'Grunt', 'npm', 'yarn', 'pnpm', 'bun',

    // Backend Frameworks (25+)
    'Node.js', 'Node', 'Express', 'Django', 'Flask', 'FastAPI', 'Spring', 'Spring Boot', 'ASP.NET',
    'ASP.NET Core', 'Ruby on Rails', 'Sinatra', 'Laravel', 'Symfony', 'Gin', 'Echo', 'Fiber', 'Nest.js',
    'Fastify', 'Hapi', 'Koa', 'Adonis', 'Feathers', 'Strapi',

    // Databases (30+)
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'Cassandra', 'DynamoDB', 'MariaDB',
    'Oracle', 'SQL Server', 'SQLite', 'Firebase', 'Firestore', 'Cosmos DB', 'Neo4j', 'ClickHouse',
    'Memcached', 'RethinkDB', 'CouchDB', 'DGraph', 'Meilisearch', 'Solr', 'Sphinx', 'Druid', 'InfluxDB',
    'TimescaleDB', 'Supabase', 'SurrealDB', 'Tarantool',

    // Cloud Platforms (20+)
    'AWS', 'Azure', 'Google Cloud', 'GCP', 'Oracle Cloud', 'IBM Cloud', 'DigitalOcean', 'Linode',
    'Vultr', 'Heroku', 'Railway', 'Fly.io', 'Vercel', 'Netlify', 'AWS Lambda', 'AWS EC2', 'AWS RDS',
    'AWS S3', 'AWS DynamoDB', 'AWS AppSync',

    // Container & Orchestration (15+)
    'Docker', 'Kubernetes', 'Docker Compose', 'Docker Swarm', 'Helm', 'Podman', 'Containerd',
    'OpenShift', 'Rancher', 'Amazon ECS', 'Amazon EKS', 'Google GKE', 'Azure AKS', 'Nomad',

    // Infrastructure as Code (12+)
    'Terraform', 'CloudFormation', 'Ansible', 'Puppet', 'Chef', 'SaltStack', 'Pulumi', 'CDK',
    'Bicep', 'ARM Templates', 'Heat', 'Packer',

    // CI/CD Platforms (12+)
    'Jenkins', 'GitLab CI', 'GitHub Actions', 'CircleCI', 'Travis CI', 'Azure Pipelines', 'AWS CodePipeline',
    'TeamCity', 'Bamboo', 'GoCD', 'Harness', 'Drone',

    // API & Protocols (15+)
    'REST', 'GraphQL', 'gRPC', 'SOAP', 'WebSocket', 'MQTT', 'HTTP', 'HTTPS', 'API Gateway', 'OpenAPI',
    'Swagger', 'AsyncAPI', 'RPC', 'Protocol Buffers', 'Apache Thrift',

    // Data & ML (30+)
    'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Keras', 'Scikit-learn', 'OpenCV',
    'Pandas', 'NumPy', 'SciPy', 'Matplotlib', 'Plotly', 'Seaborn', 'Scikit-image', 'XGBoost', 'LightGBM',
    'CatBoost', 'Hugging Face', 'NLTK', 'spaCy', 'FastAI', 'Pytorch Lightning', 'Optuna', 'Ray',
    'Dask', 'Spark', 'Apache Spark', 'Hadoop', 'Data Science', 'Analytics',

    // Data Visualization (15+)
    'Tableau', 'Power BI', 'Looker', 'Superset', 'Metabase', 'Grafana', 'Kibana', 'DataStudio',
    'Qlik', 'Sisense', 'Microstrategy', 'Perforce', 'Perforce Helix', 'Plotly Dash',

    // Version Control (10+)
    'Git', 'GitHub', 'GitLab', 'Bitbucket', 'Gitea', 'Gitpod', 'SVN', 'Mercurial', 'Perforce',

    // Testing Frameworks (20+)
    'Jest', 'Mocha', 'Cypress', 'Playwright', 'Selenium', 'WebdriverIO', 'JUnit', 'TestNG', 'pytest',
    'RSpec', 'Jasmine', 'Vitest', 'Testing Library', 'React Testing Library', 'Enzyme', 'Puppeteer',
    'Nightwatch', 'Cucumber', 'Gherkin', 'BDD',

    // Message Queues & Streaming (12+)
    'RabbitMQ', 'Kafka', 'ActiveMQ', 'AWS SQS', 'Google Pub/Sub', 'Redis Streams', 'NATS',
    'Celery', 'Bull Queue', 'Apache Pulsar', 'AMQP', 'JMS',

    // Monitoring & Observability (15+)
    'Prometheus', 'Grafana', 'ELK Stack', 'Datadog', 'New Relic', 'Splunk', 'Sumologic',
    'CloudWatch', 'Stackdriver', 'Jaeger', 'Zipkin', 'Sentry', 'Rollbar', 'APM', 'OpenTelemetry',

    // Security & Auth (12+)
    'OAuth', 'OpenID Connect', 'JWT', 'SAML', 'Two-Factor Authentication', 'MFA', 'SSL/TLS',
    'Keycloak', 'Auth0', 'Okta', 'AWS Cognito', 'Azure AD', 'LDAP',

    // Other Tools & Concepts (30+)
    'Jira', 'Confluence', 'Linear', 'Asana', 'Monday.com', 'Slack', 'Discord', 'Agile', 'Scrum',
    'Kanban', 'Linux', 'Unix', 'Windows', 'macOS', 'Microservices', 'Monolith', 'Serverless',
    'SOLID', 'Design Patterns', 'CI/CD', 'DevOps', 'SRE', 'NoSQL', 'SQL', 'ACID', 'CAP', 'PACELC',
    'Multithreading', 'Concurrency', 'Async', 'Synchronous', 'Event-Driven', 'Message-Driven',
    'WebAssembly', 'WASM', 'Docker Compose', 'Nginx', 'Apache', 'HAProxy'
  ];

  // Extract skills
  allSkills.forEach(skill => {
    // Properly escape all regex special characters
    const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedSkill}\\b`, 'gi');
    if (regex.test(text)) {
      if (!resume.skills.includes(skill)) {
        resume.skills.push(skill);
      }
    }
  });

  console.log(`    Skills found: ${resume.skills.length}`);
  if (resume.skills.length > 0) {
    console.log(`      ${resume.skills.slice(0, 5).join(', ')}${resume.skills.length > 5 ? '...' : ''}`);
  }

  // Extract years of experience - try multiple methods
  // Method 1: Calculate from employment history (date ranges)
  resume.years_experience = extractYearsFromEmploymentDates(text);

  // Method 2: Look for explicit mention like "5 years of experience"
  if (resume.years_experience === 0) {
    let yearsMatch = text.match(/(\d+)\s+(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)/i);
    if (!yearsMatch) {
      yearsMatch = text.match(/(?:experience|exp)\s*:?\s*(\d+)\s+(?:years?|yrs?)/i);
    }
    if (yearsMatch) {
      resume.years_experience = parseInt(yearsMatch[1], 10);
    }
  }

  if (resume.years_experience > 0) {
    console.log(`   Experience: ${resume.years_experience} years (calculated from dates)`);
  } else {
    console.log(`   Experience: Not found in resume`);
  }

  // Extract job titles
  const jobTitlePatterns = [
    /(?:Title|Position)\s*:?\s*([^\n]+)/i,
    /(?:Senior|Junior|Lead|Staff)\s+([A-Za-z\s]+?)(?:\n|,|at)/i
  ];
  jobTitlePatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      resume.job_titles.push(matches[1].trim());
    }
  });

  // Extract companies
  const companyPatterns = [
    /(?:Company|Organization|Employer)\s*:?\s*([^\n]+)/i,
    /(?:at|@)\s*([A-Z][A-Za-z\s&]+?)(?:\n|,|–|-)/
  ];
  companyPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      resume.companies.push(matches[1].trim());
    }
  });

  // Extract education degrees
  const educationPatterns = [
    /(?:Bachelor|B\.?S\.?|B\.?A\.?|Master|M\.?S\.?|M\.?A\.?|PhD|Ph\.?D\.?|MBA|Associate|A\.?S\.?)/i,
    /(?:Diploma|Certificate|Bootcamp)/i
  ];
  const educationMatches = text.match(/(?:education|degree|university|college)\s*:?\s*([^\n]+(?:\n[^\n]*)*)/gi);
  if (educationMatches) {
    educationMatches.forEach(match => {
      // Extract just the first line or key education info
      const lines = match.split('\n');
      lines.forEach(line => {
        const cleaned = line.replace(/^education\s*:?\s*/i, '').trim();
        if (cleaned && cleaned.length > 0 && !resume.education.includes(cleaned)) {
          resume.education.push(cleaned);
        }
      });
    });
  }

  // Extract certifications - comprehensive list of common certs
  const certificationKeywords = [
    'AWS Certified', 'AWS Solutions Architect', 'AWS Developer',
    'Google Cloud Certified', 'Azure Certified', 'Microsoft Certified',
    'Certified Kubernetes Administrator', 'CKA',
    'CISSP', 'CEH', 'Certified Ethical Hacker',
    'PMP', 'Project Management Professional',
    'Scrum Master', 'CSPO', 'Product Owner',
    'CompTIA', 'Security+', 'Network+', 'A+',
    'PRINCE2', 'TOGAF', 'COBIT',
    'Oracle Certified', 'Oracle Database',
    'Salesforce Certified', 'Salesforce',
    'Tableau Desktop', 'Tableau Server',
    'Databricks Certified',
    'Coursera', 'Udacity', 'edX',
    'Certification', 'Certified'
  ];

  certificationKeywords.forEach(cert => {
    const escapedCert = cert.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedCert}[^\n]*`, 'gi');
    const matches = text.match(regex);
    if (matches) {
      matches.forEach(match => {
        const cleaned = match.trim();
        if (cleaned && !resume.certifications.includes(cleaned)) {
          resume.certifications.push(cleaned);
        }
      });
    }
  });

  console.log(`   Education: ${resume.education.length > 0 ? resume.education.join(', ') : 'Not found'}`);
  console.log(`   Certifications: ${resume.certifications.length > 0 ? resume.certifications.slice(0, 3).join(', ') : 'Not found'}`);
  console.log(`[${new Date().toISOString()}]  Resume parsed successfully`);

  return resume;
}

// ============================================================================
// Embeddings
// ============================================================================

async function generateEmbedding(text) {
  if (EMBEDDING_METHOD === 'openai' && OPENAI_API_KEY) {
    return await generateOpenAIEmbedding(text);
  } else {
    return generateStubEmbedding(text);
  }
}

function generateStubEmbedding(text) {
  const dimension = 1536;
  const vector = new Array(dimension).fill(0);

  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  let seed = Math.abs(hash);
  for (let i = 0; i < dimension; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    vector[i] = (seed / 233280) * 2 - 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? vector.map(v => v / magnitude) : vector;
}

async function generateOpenAIEmbedding(text) {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small'
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.warn('OpenAI embedding failed, falling back to stub:', error.message);
    return generateStubEmbedding(text);
  }
}

// ============================================================================
// Database Helpers
// ============================================================================

async function saveResumeToDB(resumeData) {
  if (!pool || !usingDatabase) {
    // Use in-memory storage
    resumes.set(resumeData.resume_id, resumeData);
    console.log(`[${new Date().toISOString()}]  Resume saved to memory: ${resumeData.resume_id}`);
    return;
  }

  const client = await pool.connect();
  try {
    const query = `
      INSERT INTO resumes (resume_id, candidate_name, raw_text, skills, years_experience, embedding)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING resume_id
    `;

    // Round years_experience to integer for database storage
    const yearsExperience = Math.round(resumeData.years_experience || 0);

    const result = await client.query(query, [
      resumeData.resume_id,
      resumeData.candidate_name,
      resumeData.raw_text,
      resumeData.skills,
      yearsExperience,
      JSON.stringify(resumeData.embedding)
    ]);

    console.log(`[${new Date().toISOString()}]  Resume saved to Tiger Database: ${result.rows[0].resume_id}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}]  Database insert error:`, error.message);
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// API Endpoints
// ============================================================================

/**
 * POST /api/upload-resume - REAL RESUME PARSING
 */
app.post('/api/upload-resume', uploadLimiter, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`\n[${new Date().toISOString()}]  RESUME UPLOAD REQUEST`);
    console.log(`  File: ${req.file.originalname}`);
    console.log(`  Size: ${(req.file.size / 1024).toFixed(2)} KB`);
    console.log(`  Type: ${req.file.mimetype}`);

    // Extract text
    const resumeText = await extractTextFromDocument(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    // Parse resume (for name, email, phone, years_experience, education)
    const parsedData = parseResume(resumeText);

    // Extract skills and certifications
    let nlpSkills = [];
    let nlpCertifications = [];

    // PRIMARY: Use new skill matcher (regex-based, no BERT tokens)
    console.log(`[${new Date().toISOString()}]  Extracting skills using regex-based matcher...`);
    try {
      nlpSkills = extractAllSkills(resumeText);
      console.log(`[${new Date().toISOString()}]  Regex extraction: ${nlpSkills.length} skills found`);

      // Optional: Enrich with database data
      if (pool && usingDatabase && nlpSkills.length > 0) {
        try {
          // Try to enrich with database metadata (salary impact, demand, category)
          const client = await pool.connect();
          try {
            // Skills are already formatted, just return them
            // Database enrichment happens in improved-scoring.js if needed
            console.log(`[${new Date().toISOString()}] ℹ  Skills ready for database enrichment during scoring`);
          } finally {
            client.release();
          }
        } catch (enrichError) {
          console.warn(`[${new Date().toISOString()}]   Database enrichment skipped:`, enrichError.message);
        }
      }
    } catch (error) {
      console.warn(`[${new Date().toISOString()}]   Skill extraction error:`, error.message);
      nlpSkills = [];
    }

    // Extract certifications (pattern-based, from parseResume output)
    nlpCertifications = parsedData.certifications.map(c => ({ name: c, confidence: 0.7 }));
    if (nlpCertifications.length > 0) {
      console.log(`[${new Date().toISOString()}]  Certifications: ${nlpCertifications.length} found`);
    }

    // Generate embedding
    const embedding = await generateEmbedding(resumeText);
    const resumeId = generateUUID();

    // Prepare data
    const resumeData = {
      resume_id: resumeId,
      candidate_name: parsedData.candidate_name,
      raw_text: resumeText,
      skills: nlpSkills,
      years_experience: parsedData.years_experience,
      education: parsedData.education,
      certifications: nlpCertifications,
      email: parsedData.email,
      phone: parsedData.phone,
      embedding: embedding,
      created_at: new Date().toISOString()
    };

    // Save to database or memory
    if (usingDatabase && pool) {
      await saveResumeToDB(resumeData);
    } else {
      resumes.set(resumeId, resumeData);
      console.log(`[${new Date().toISOString()}]  Resume saved to in-memory storage: ${resumeId}`);
    }

    console.log(`[${new Date().toISOString()}]  Resume processed successfully\n`);

    res.json({
      success: true,
      resume_id: resumeId,
      candidate_name: parsedData.candidate_name,
      email: parsedData.email,
      phone: parsedData.phone,
      skills: parsedData.skills,
      years_experience: parsedData.years_experience,
      education: parsedData.education,
      certifications: parsedData.certifications,
      message: 'Resume uploaded and parsed successfully'
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}]  Upload error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/job-description
 */
app.post('/api/job-description', jobLimiter, async (req, res) => {
  try {
    const { title, description, required_years } = req.body;

    // ============================================================================
    // INPUT VALIDATION FOR JOB DESCRIPTIONS
    // ============================================================================

    // Validate that required fields exist
    if (!title || !description) {
      return res.status(400).json({
        error: 'Title and description are required',
        details: {
          title: !title ? 'Missing job title' : 'OK',
          description: !description ? 'Missing job description' : 'OK'
        }
      });
    }

    // Validate title
    if (typeof title !== 'string') {
      return res.status(400).json({ error: 'Job title must be a string' });
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      return res.status(400).json({
        error: 'Job title must be at least 2 characters long',
        received: trimmedTitle.length
      });
    }

    if (trimmedTitle.length > 300) {
      return res.status(400).json({
        error: 'Job title must be less than 300 characters',
        received: trimmedTitle.length
      });
    }

    // Validate description
    if (typeof description !== 'string') {
      return res.status(400).json({ error: 'Job description must be a string' });
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription.length < 10) {
      return res.status(400).json({
        error: 'Job description must be at least 10 characters long',
        received: trimmedDescription.length
      });
    }

    if (trimmedDescription.length > 50000) {
      return res.status(400).json({
        error: 'Job description must be less than 50,000 characters (too long)',
        received: trimmedDescription.length
      });
    }

    // Validate required_years if provided
    if (required_years !== undefined) {
      const years = parseInt(required_years, 10);
      if (isNaN(years) || years < 0) {
        return res.status(400).json({
          error: 'Required years must be a non-negative number',
          received: required_years
        });
      }
      if (years > 100) {
        return res.status(400).json({
          error: 'Required years must be 100 or less',
          received: years
        });
      }
    }

    // Check for suspicious content (basic checks)
    const suspiciousPatterns = [
      /<script/i, // JavaScript tags
      /javascript:/i, // JavaScript protocol
      /on\w+\s*=/i, // Event handlers (onclick=, onload=, etc.)
      /sql\s+injection/i // SQL injection attempts
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(trimmedDescription) || pattern.test(trimmedTitle)) {
        return res.status(400).json({
          error: 'Job description contains suspicious content',
          reason: 'Potential script injection or malicious content detected'
        });
      }
    }

    console.log(`[${new Date().toISOString()}]  JOB DESCRIPTION RECEIVED`);
    console.log(`  Title: ${title}`);
    console.log(`  Description length: ${description.length} characters`);

    // Smart estimation of required years if not provided
    let estimatedYears = required_years !== undefined ? parseInt(required_years, 10) : null;

    if (estimatedYears === null || estimatedYears === undefined) {
      estimatedYears = estimateRequiredExperienceFromJob({
        title: title,
        description: description
      });
      console.log(`  Estimated required years: ${estimatedYears} (smart estimation from job details)`);
    } else {
      console.log(`  Required years: ${estimatedYears} (provided explicitly)`);
    }

    const embedding = await generateEmbedding(description);
    const jobId = generateUUID();

    const jobData = {
      job_id: jobId,
      title: title,
      description: description,
      required_years: estimatedYears,
      embedding: embedding,
      created_at: new Date().toISOString()
    };

    // Save to database or memory
    if (usingDatabase && pool) {
      const client = await pool.connect();
      try {
        const query = `
          INSERT INTO jobs (job_id, title, description, required_years, embedding)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING job_id
        `;

        const result = await client.query(query, [
          jobId,
          title,
          description,
          required_years || 0,
          JSON.stringify(embedding)
        ]);

        console.log(`[${new Date().toISOString()}]  Job saved to Tiger Database: ${result.rows[0].job_id}`);
      } finally {
        client.release();
      }
    } else {
      jobs.set(jobId, jobData);
      console.log(`[${new Date().toISOString()}]  Job saved to in-memory storage: ${jobId}`);
    }

    console.log(`[${new Date().toISOString()}]  Job description processed\n`);

    res.json({
      success: true,
      job_id: jobId,
      title: title,
      required_years: required_years || 0,
      message: 'Job description created successfully'
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}]  Job error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/score/:resume_id/:job_id
 */
app.get('/api/score/:resume_id/:job_id', scoreLimiter, async (req, res) => {
  try {
    const { resume_id, job_id } = req.params;

    console.log(`[${new Date().toISOString()}]  SCORING REQUEST`);
    console.log(`  Resume ID: ${resume_id}`);
    console.log(`  Job ID: ${job_id}`);

    let resume, job;

    if (usingDatabase && pool) {
      const client = await pool.connect();
      try {
        const resumeResult = await client.query('SELECT * FROM resumes WHERE resume_id = $1', [resume_id]);
        const jobResult = await client.query('SELECT * FROM jobs WHERE job_id = $1', [job_id]);

        if (resumeResult.rows.length === 0 || jobResult.rows.length === 0) {
          return res.status(404).json({ error: 'Resume or job not found' });
        }

        resume = resumeResult.rows[0];
        job = jobResult.rows[0];

        // CRITICAL FIX: Parse skills if they come back as JSON string from database
        if (resume.skills && typeof resume.skills === 'string') {
          try {
            resume.skills = JSON.parse(resume.skills);
            console.log(`[${new Date().toISOString()}]  Parsed skills from JSON string`);
          } catch (parseError) {
            console.warn(`[${new Date().toISOString()}]   Could not parse skills JSON:`, parseError.message);
            resume.skills = [];
          }
        }

        // Parse other fields if they come back as JSON strings
        if (resume.education && typeof resume.education === 'string') {
          try {
            resume.education = JSON.parse(resume.education);
          } catch (e) {
            resume.education = [];
          }
        }

        if (resume.certifications && typeof resume.certifications === 'string') {
          try {
            resume.certifications = JSON.parse(resume.certifications);
          } catch (e) {
            resume.certifications = [];
          }
        }
      } finally {
        client.release();
      }
    } else {
      if (!resumes.has(resume_id) || !jobs.has(job_id)) {
        return res.status(404).json({ error: 'Resume or job not found' });
      }
      resume = resumes.get(resume_id);
      job = jobs.get(job_id);
    }

    // ===== NEW: LEARNING PHASE =====
    // Discover unknown items and store them to knowledge base
    let learningResult = { learningCount: 0, newItems: [] };

    if (pool && usingDatabase) {
      try {
        learningResult = await learnFromResume(
          resume.skills,
          resume_id,
          pool
        );
        if (learningResult.learningCount > 0) {
          console.log(`[${new Date().toISOString()}]  Learned ${learningResult.learningCount} new items: ${learningResult.newItems.join(', ')}`);
        }
      } catch (error) {
        console.warn(`[${new Date().toISOString()}]   Learning phase error:`, error.message);
      }
    }

    // ===== NEW: GET KNOWLEDGE BASE ITEMS =====
    // ALWAYS retrieve previously learned items for scoring (not just when learning now)
    let knowledgeItems = [];
    if (pool && usingDatabase) {
      try {
        knowledgeItems = await getKnowledgeBaseItems(pool, 'skill');
        if (knowledgeItems.length > 0) {
          console.log(`[${new Date().toISOString()}]  Retrieved ${knowledgeItems.length} learned items from knowledge base`);
        }
      } catch (error) {
        console.warn(`[${new Date().toISOString()}]   Knowledge base retrieval error:`, error.message);
      }
    }

    // ===== SKILL SCORING =====
    // IMPORTANT: Use ONLY skills from the current resume, NOT knowledge base!
    // Knowledge base is for learning trends, not for skill matching on individual resumes.
    // Using knowledge base skills would unfairly boost unrelated candidates.

    const allSkills = resume.skills;  // Only this resume's actual skills

    // Compute improved 5-factor scores using database-driven approach
    console.log(`[${new Date().toISOString()}]  Computing 5-factor improved scores...`);

    // Convert skill objects to names (if they're objects from NLP)
    const skillNames = Array.isArray(allSkills)
      ? allSkills.map(skill => typeof skill === 'string' ? skill : skill.name || skill)
      : [];

    // Skill match score (using database if available)
    // Use ONLY this resume's extracted skills, not knowledge base
    let skillScore = 0;
    try {
      const skillScoreResult = pool && usingDatabase
        ? await scoring.computeSkillMatchScore(allSkills, job.description, pool)
        : computeKeywordScore(skillNames, job.description);

      // Extract score properly - handle both object and numeric returns
      if (typeof skillScoreResult === 'object' && skillScoreResult !== null) {
        skillScore = skillScoreResult.score || 0;
      } else {
        skillScore = skillScoreResult || 0;
      }

      // Validate the score is a valid number between 0 and 1
      if (!Number.isFinite(skillScore)) {
        console.warn('[SCORE] Skill score is invalid, using fallback');
        skillScore = computeKeywordScore(skillNames, job.description);
      }
      skillScore = Math.max(0, Math.min(1, skillScore));
    } catch (error) {
      console.warn('[SCORE] Skill scoring error:', error.message);
      skillScore = computeKeywordScore(skillNames, job.description);
      skillScore = Math.max(0, Math.min(1, skillScore));
    }

    // Semantic score (with validation) - Domain-aware relevance
    let semanticScore = 0;
    try {
      const resumeEmb = JSON.parse(typeof resume.embedding === 'string' ? resume.embedding : JSON.stringify(resume.embedding || []));
      const jobEmb = JSON.parse(typeof job.embedding === 'string' ? job.embedding : JSON.stringify(job.embedding || []));

      // Validate embeddings exist and are arrays
      if (!Array.isArray(resumeEmb) || !Array.isArray(jobEmb) || resumeEmb.length === 0 || jobEmb.length === 0) {
        console.warn('[SCORE] Invalid embeddings, using fallback');
        semanticScore = 0.5;
      } else {
        // Pass context for domain-aware relevance calculation
        semanticScore = computeSemanticScore(resumeEmb, jobEmb, {
          resumeSkills: resume.skills,
          jobDescription: job.description,
          jobTitle: job.title,
          resumeText: resume.raw_text,
          resumeEducation: resume.education,
          skillScore: skillScore  // Use actual skill match as reference for validation
        });
      }

      // Validate the score is a valid number between 0 and 1
      if (!Number.isFinite(semanticScore)) {
        console.warn('[SCORE] Semantic score is invalid, using fallback');
        semanticScore = 0.5;
      }
      semanticScore = Math.max(0, Math.min(1, semanticScore));
    } catch (error) {
      console.warn('[SCORE] Semantic scoring error:', error.message);
      semanticScore = 0.5;
    }

    // Experience score (with validation)
    let experienceScore = 0;
    try {
      experienceScore = computeStructuredScore(resume.years_experience, job.required_years);
      if (!Number.isFinite(experienceScore)) {
        console.warn('[SCORE] Experience score is invalid, using fallback');
        experienceScore = resume.years_experience && job.required_years ?
          Math.min(1.0, resume.years_experience / job.required_years) : 1.0;
      }
      experienceScore = Math.max(0, Math.min(1, experienceScore));
    } catch (error) {
      console.warn('[SCORE] Experience scoring error:', error.message);
      experienceScore = 1.0;
    }

    // Education score (with robust fallback)
    let educationScore = 0;
    try {
      if (pool && usingDatabase && scoring.computeEducationScore) {
        const result = await scoring.computeEducationScore(resume.education || [], job.description, pool);
        // Handle both object and numeric returns
        educationScore = typeof result === 'object' && result !== null ? result.score : result;
      } else {
        educationScore = computeEducationScore(resume.education || [], job.description);
      }

      // Ensure valid number
      if (!Number.isFinite(educationScore)) {
        console.warn('[SCORE] Education score is invalid, using fallback');
        educationScore = computeEducationScore(resume.education || [], job.description);
      }
      educationScore = Math.max(0, Math.min(1, educationScore || 0));
    } catch (error) {
      console.warn('[SCORE] Education scoring error, using fallback:', error.message);
      educationScore = computeEducationScore(resume.education || [], job.description);
      educationScore = Math.max(0, Math.min(1, educationScore || 0));
    }

    // Certification score (with robust fallback)
    let certificationScore = 0;
    try {
      const certNames = Array.isArray(resume.certifications)
        ? resume.certifications.map(c => typeof c === 'string' ? c : c.name || c)
        : [];

      if (pool && usingDatabase && scoring.computeCertificationScore) {
        const result = await scoring.computeCertificationScore(resume.certifications || [], job.description, pool);
        // Handle both object and numeric returns
        certificationScore = typeof result === 'object' && result !== null ? result.score : result;
      } else {
        certificationScore = computeCertificationScore(certNames, job.description);
      }

      // Ensure valid number
      if (!Number.isFinite(certificationScore)) {
        console.warn('[SCORE] Certification score is invalid, using fallback');
        certificationScore = computeCertificationScore(certNames, job.description);
      }
      certificationScore = Math.max(0, Math.min(1, certificationScore || 0));
    } catch (error) {
      console.warn('[SCORE] Certification scoring error, using fallback:', error.message);
      const certNames = Array.isArray(resume.certifications)
        ? resume.certifications.map(c => typeof c === 'string' ? c : c.name || c)
        : [];
      certificationScore = computeCertificationScore(certNames, job.description);
      certificationScore = Math.max(0, Math.min(1, certificationScore || 0));
    }

    // Composite score calculation with dynamic weights based on job type
    let compositeScore = 0;
    let usedWeights = null;
    try {
      // Get dynamic weights based on job title and description
      usedWeights = getWeightsForJobType(job.title, job.description);

      // Try database-driven composite first
      if (pool && usingDatabase && scoring.computeCompositeScore) {
        const result = await scoring.computeCompositeScore(skillScore, semanticScore, experienceScore, educationScore, certificationScore);
        // Handle both object and numeric returns
        if (typeof result === 'object' && result !== null && result.composite !== undefined) {
          compositeScore = result.composite;
        } else if (typeof result === 'number') {
          compositeScore = result;
        } else {
          throw new Error('Invalid composite score result');
        }
      }

      // Validate composite score
      if (!Number.isFinite(compositeScore)) {
        throw new Error('Composite score is not finite');
      }
    } catch (error) {
      console.warn('[SCORE] Composite scoring error, computing locally:', error.message);
      // Manual composite calculation with dynamic weights
      if (!usedWeights) {
        usedWeights = getWeightsForJobType(job.title, job.description);
      }
      compositeScore = (skillScore * usedWeights.keyword) +
                      (semanticScore * usedWeights.semantic) +
                      (experienceScore * usedWeights.structured) +
                      (educationScore * usedWeights.education) +
                      (certificationScore * usedWeights.certification);
    }

    // Final safeguard - ensure composite is always a valid number between 0 and 1
    compositeScore = Math.max(0, Math.min(1.0, compositeScore || 0));

    // Ensure we have weights for logging
    if (!usedWeights) {
      usedWeights = getWeightsForJobType(job.title, job.description);
    }

    console.log(`  Skill Match Score: ${(skillScore * 100).toFixed(1)}% (${(usedWeights.keyword * 100).toFixed(0)}% weight)`);
    console.log(`  Semantic Score: ${(semanticScore * 100).toFixed(1)}% (${(usedWeights.semantic * 100).toFixed(0)}% weight)`);
    console.log(`  Experience Score: ${(experienceScore * 100).toFixed(1)}% (${(usedWeights.structured * 100).toFixed(0)}% weight)`);
    console.log(`  Education Score: ${(educationScore * 100).toFixed(1)}% (${(usedWeights.education * 100).toFixed(0)}% weight)`);
    console.log(`  Certification Score: ${(certificationScore * 100).toFixed(1)}% (${(usedWeights.certification * 100).toFixed(0)}% weight)`);
    console.log(`   COMPOSITE (5-FACTOR): ${(compositeScore * 100).toFixed(1)}%`);
    console.log(`  Job Type: ${job.title} → ${Object.entries(usedWeights).map(([k, v]) => `${k}: ${(v*100).toFixed(0)}%`).join(', ')}\n`);

    res.json({
      success: true,
      resume_id: resume_id,
      job_id: job_id,
      scores: {
        skill_match: Math.round(skillScore * 100) / 100,
        semantic: Math.round(semanticScore * 100) / 100,
        experience: Math.round(experienceScore * 100) / 100,
        education: Math.round(educationScore * 100) / 100,
        certification: Math.round(certificationScore * 100) / 100,
        composite: Math.round(compositeScore * 100) / 100
      },
      weights: {
        skill_match: Math.round(usedWeights.keyword * 100) / 100,
        semantic: Math.round(usedWeights.semantic * 100) / 100,
        experience: Math.round(usedWeights.structured * 100) / 100,
        education: Math.round(usedWeights.education * 100) / 100,
        certification: Math.round(usedWeights.certification * 100) / 100,
        total: 1.0,
        weight_type: getWeightTypeForJob(job.title, job.description)
      },
      breakdown: {
        skill_match: { score: Math.round(skillScore * 100) / 100, weight: Math.round(usedWeights.keyword * 100) / 100 },
        semantic: { score: Math.round(semanticScore * 100) / 100, weight: Math.round(usedWeights.semantic * 100) / 100 },
        experience: { score: Math.round(experienceScore * 100) / 100, weight: Math.round(usedWeights.structured * 100) / 100 },
        education: { score: Math.round(educationScore * 100) / 100, weight: Math.round(usedWeights.education * 100) / 100 },
        certification: { score: Math.round(certificationScore * 100) / 100, weight: Math.round(usedWeights.certification * 100) / 100 }
      },
      resume: {
        candidate_name: resume.candidate_name,
        email: resume.email,
        skills: resume.skills,
        years_experience: resume.years_experience,
        education: resume.education,
        certifications: resume.certifications
      },
      job: {
        title: job.title,
        description: job.description,
        required_years: job.required_years
      },
      // NEW: Comprehensive Fit Analysis merging resume and job
      fit_analysis: {
        overall_summary: {
          composite_score: Math.round(compositeScore * 100) / 100,
          fit_rating: compositeScore >= 0.80 ? 'Excellent' : compositeScore >= 0.70 ? 'Good' : compositeScore >= 0.60 ? 'Moderate' : 'Below Average',
          recommendation: skillScore < 0.40 ? 'DO NOT INTERVIEW - Critical skill gap (less than 40% match)' :
                        compositeScore >= 0.80 ? 'Strong candidate - highly recommended for interview' :
                        compositeScore >= 0.70 ? 'Good candidate - consider for interview' :
                        compositeScore >= 0.60 ? 'Moderate candidate - review carefully' :
                        'Weak candidate - significant concerns',
          skill_gate_check: skillScore < 0.40 ? 'FAILED: Technical skills below 40% threshold' : 'PASSED: Adequate technical skills'
        },
        skills_fit: {
          score: Math.round(skillScore * 100) / 100,
          weight: Math.round(usedWeights.keyword * 100) / 100,
          candidate_skills_count: Array.isArray(resume.skills) ? resume.skills.length : 0,
          analysis: skillScore >= 0.80 ? 'Excellent skill match' :
                   skillScore >= 0.60 ? 'Good skill coverage' :
                   'Limited skill overlap'
        },
        experience_fit: {
          score: Math.round(experienceScore * 100) / 100,
          weight: Math.round(usedWeights.structured * 100) / 100,
          candidate_years: resume.years_experience || 0,
          required_years: job.required_years || 0,
          analysis: experienceScore >= 0.90 ? 'Exceeds experience requirements' :
                   experienceScore >= 0.70 ? 'Meets experience requirements' :
                   experienceScore >= 0.50 ? 'Some experience gap' :
                   'Significant experience gap'
        },
        education_fit: {
          score: Math.round(educationScore * 100) / 100,
          weight: Math.round(usedWeights.education * 100) / 100,
          candidate_education: resume.education || 'Not specified',
          analysis: educationScore >= 0.85 ? 'Education level matches job requirements' :
                   educationScore >= 0.65 ? 'Education is adequate' :
                   'Education gap present'
        },
        certification_fit: {
          score: Math.round(certificationScore * 100) / 100,
          weight: Math.round(usedWeights.certification * 100) / 100,
          candidate_certifications_count: Array.isArray(resume.certifications) ? resume.certifications.length : 0,
          analysis: certificationScore >= 0.70 ? 'Relevant certifications present' :
                   certificationScore >= 0.40 ? 'Some relevant certifications' :
                   'Limited or no relevant certifications'
        },
        semantic_alignment: {
          score: Math.round(semanticScore * 100) / 100,
          weight: Math.round(usedWeights.semantic * 100) / 100,
          analysis: semanticScore >= 0.75 ? 'Strong conceptual alignment with role' :
                   semanticScore >= 0.55 ? 'Moderate alignment with role requirements' :
                   'Limited alignment with role'
        },
        strengths: getStrengthsSummary(skillScore, experienceScore, educationScore, certificationScore, semanticScore),
        areas_for_development: getWeaknessesSummary(skillScore, experienceScore, educationScore, certificationScore, semanticScore),
        weight_profile: getWeightTypeForJob(job.title, job.description)
      },
      // NEW: Learning information for frontend
      learning: {
        discovered: learningResult.newItems,
        discoveryCount: learningResult.learningCount,
        learned: learningResult.learningCount > 0
      },
      embedding_method: EMBEDDING_METHOD,
      scoring_version: 'improved-5-factor',
      actions: {
        delete_resume: `/api/resume/${resume_id}/delete`,
        delete_job: `/api/job/${job_id}/delete`,
        message: 'Use DELETE request to /api/resume/:resume_id to remove this resume, or click delete button in UI'
      }
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}]  Score error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/score-multi-agent/:resume_id/:job_id
 * Multi-agent parallel scoring using specialized agents
 */
app.get('/api/score-multi-agent/:resume_id/:job_id', scoreLimiter, async (req, res) => {
  const { resume_id, job_id } = req.params;

  console.log(`\n[${new Date().toISOString()}]  MULTI-AGENT SCORING REQUEST`);
  console.log(`  Resume ID: ${resume_id}`);
  console.log(`  Job ID: ${job_id}`);

  try {
    // Check if multi-agent system is available
    if (!multiAgentEnabled || !agentCoordinator || !forkManager) {
      return res.status(503).json({
        error: 'Multi-agent system not available',
        message: 'Database connection required for multi-agent scoring',
        fallback: 'Use /api/score/:resume_id/:job_id for single-agent scoring'
      });
    }

    // Get resume and job from storage
    let resume, job;

    if (usingDatabase && pool) {
      try {
        const [resumeResult, jobResult] = await Promise.all([
          pool.query('SELECT * FROM resumes WHERE resume_id = $1', [resume_id]),
          pool.query('SELECT * FROM jobs WHERE job_id = $1', [job_id])
        ]);

        if (resumeResult.rows.length === 0) {
          return res.status(404).json({ error: 'Resume not found' });
        }

        if (jobResult.rows.length === 0) {
          return res.status(404).json({ error: 'Job not found' });
        }

        resume = resumeResult.rows[0];
        job = jobResult.rows[0];
      } catch (dbError) {
        console.error('[MULTI-AGENT] Database error:', dbError.message);
        return res.status(500).json({ error: 'Database error: ' + dbError.message });
      }
    } else {
      // Fallback to in-memory storage
      resume = resumes.get(resume_id);
      job = jobs.get(job_id);

      if (!resume) {
        return res.status(404).json({ error: 'Resume not found (in-memory)' });
      }

      if (!job) {
        return res.status(404).json({ error: 'Job not found (in-memory)' });
      }
    }

    // Run multi-agent analysis
    const results = await agentCoordinator.scoreResume(resume_id, job_id);

    console.log(`   Multi-agent scoring complete`);
    console.log(`  Composite Score: ${results.composite_score}%`);
    console.log(`  Agents Completed: ${results.agents_completed}/${results.agents_completed + (5 - results.agents_completed)}`);
    console.log(`  Processing Time: ${results.processing_time_ms}ms\n`);

    // Store results if using database
    if (usingDatabase && pool) {
      try {
        await pool.query(
          `INSERT INTO multi_agent_scores (
            resume_id, job_id, skill_score, experience_score, education_score,
            certification_score, semantic_score, composite_score, agents_used,
            total_processing_time_ms, processing_method
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (resume_id, job_id) DO UPDATE SET
            composite_score = EXCLUDED.composite_score,
            total_processing_time_ms = EXCLUDED.total_processing_time_ms,
            created_at = NOW()`,
          [
            resume_id, job_id,
            results.scores.skill,
            results.scores.experience,
            results.scores.education,
            results.scores.certification,
            results.scores.semantic,
            results.composite_score,
            results.agents_completed,
            results.processing_time_ms,
            'parallel_agents'
          ]
        );
      } catch (storeError) {
        console.warn('[MULTI-AGENT] Failed to store results:', storeError.message);
        // Continue anyway - scoring was successful
      }
    }

    // Return response in same format as single-agent endpoint for frontend compatibility
    // All scores MUST be in 0-1 decimal format for frontend to display correctly
    res.json({
      success: true,
      resume_id: resume_id,
      job_id: job_id,
      scores: {
        skill_match: (results.scores.skill || 0) / 100,        // Convert 0-100 to 0-1 decimal
        semantic: (results.scores.semantic || 0) / 100,        // Convert 0-100 to 0-1 decimal
        experience: (results.scores.experience || 0) / 100,    // Convert 0-100 to 0-1 decimal
        education: (results.scores.education || 0) / 100,      // Convert 0-100 to 0-1 decimal
        certification: (results.scores.certification || 0) / 100, // Convert 0-100 to 0-1 decimal
        composite: (results.composite_score / 100) || 0        // Already 0-100, convert to 0-1
      },
      weights: results.weights,
      breakdown: results.breakdown,
      resume: {
        candidate_name: resume.candidate_name,
        email: resume.email,
        skills: resume.skills,
        years_experience: resume.years_experience,
        education: resume.education,
        certifications: resume.certifications
      },
      job: {
        title: job.title,
        description: job.description,
        required_years: job.required_years
      },
      // Multi-agent specific data
      embedding_method: 'multi-agent',
      scoring_version: 'multi-agent-parallel',
      multi_agent_data: {
        composite_score: results.composite_score,
        agent_statuses: results.agent_statuses,
        processing_method: 'multi_agent_parallel',
        processing_time_ms: results.processing_time_ms,
        agents_completed: results.agents_completed,
        timestamp: results.timestamp
      },
      learning: {
        discovered: [],
        discoveryCount: 0,
        learned: false
      },
      actions: {
        delete_resume: `/api/resume/${resume_id}/delete`,
        delete_job: `/api/job/${job_id}/delete`,
        message: 'Use DELETE request to /api/resume/:resume_id to remove this resume, or click delete button in UI'
      }
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}]  Multi-agent score error:`, error.message);
    console.error(error.stack);
    res.status(500).json({
      error: error.message,
      type: 'multi_agent_error'
    });
  }
});

/**
 * DELETE /api/resume/:resume_id
 * Delete a resume and all associated data
 */
app.delete('/api/resume/:resume_id', async (req, res) => {
  const { resume_id } = req.params;

  console.log(`[${new Date().toISOString()}]   DELETE RESUME REQUEST: ${resume_id}`);

  try {
    let deleted = false;

    // Try database first
    if (usingDatabase && pool) {
      try {
        const client = await pool.connect();
        try {
          // Delete from multi_agent_scores first (foreign key)
          await client.query('DELETE FROM multi_agent_scores WHERE resume_id = $1', [resume_id]);

          // Delete from fit_scores (if exists)
          await client.query('DELETE FROM fit_scores WHERE resume_id = $1', [resume_id]);

          // Delete the resume
          const result = await client.query('DELETE FROM resumes WHERE resume_id = $1 RETURNING resume_id', [resume_id]);

          if (result.rows.length > 0) {
            deleted = true;
            console.log(`[${new Date().toISOString()}]  Resume deleted from database: ${resume_id}`);
          }
        } finally {
          client.release();
        }
      } catch (dbError) {
        console.warn(`[${new Date().toISOString()}]   Database delete error:`, dbError.message);
        // Continue to try in-memory deletion
      }
    }

    // Try in-memory storage
    if (resumes.has(resume_id)) {
      resumes.delete(resume_id);
      deleted = true;
      console.log(`[${new Date().toISOString()}]  Resume deleted from memory: ${resume_id}`);
    }

    if (deleted) {
      res.json({
        success: true,
        message: `Resume ${resume_id} has been successfully deleted`,
        resume_id: resume_id,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Resume ${resume_id} not found`,
        resume_id: resume_id
      });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}]  Delete resume error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/job/:job_id
 * Delete a job and all associated data
 */
app.delete('/api/job/:job_id', async (req, res) => {
  const { job_id } = req.params;

  console.log(`[${new Date().toISOString()}]   DELETE JOB REQUEST: ${job_id}`);

  try {
    let deleted = false;

    // Try database first
    if (usingDatabase && pool) {
      try {
        const client = await pool.connect();
        try {
          // Delete from multi_agent_scores first (foreign key)
          await client.query('DELETE FROM multi_agent_scores WHERE job_id = $1', [job_id]);

          // Delete from fit_scores (if exists)
          await client.query('DELETE FROM fit_scores WHERE job_id = $1', [job_id]);

          // Delete the job
          const result = await client.query('DELETE FROM jobs WHERE job_id = $1 RETURNING job_id', [job_id]);

          if (result.rows.length > 0) {
            deleted = true;
            console.log(`[${new Date().toISOString()}]  Job deleted from database: ${job_id}`);
          }
        } finally {
          client.release();
        }
      } catch (dbError) {
        console.warn(`[${new Date().toISOString()}]   Database delete error:`, dbError.message);
        // Continue to try in-memory deletion
      }
    }

    // Try in-memory storage
    if (jobs.has(job_id)) {
      jobs.delete(job_id);
      deleted = true;
      console.log(`[${new Date().toISOString()}]  Job deleted from memory: ${job_id}`);
    }

    if (deleted) {
      res.json({
        success: true,
        message: `Job ${job_id} has been successfully deleted`,
        job_id: job_id,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Job ${job_id} not found`,
        job_id: job_id
      });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}]  Delete job error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/resume/:resume_id
 * Get resume details (for verification)
 */
app.get('/api/resume/:resume_id', async (req, res) => {
  const { resume_id } = req.params;

  try {
    let resume = null;

    // Try database first
    if (usingDatabase && pool) {
      try {
        const result = await pool.query('SELECT * FROM resumes WHERE resume_id = $1', [resume_id]);
        if (result.rows.length > 0) {
          resume = result.rows[0];
        }
      } catch (dbError) {
        console.warn('[GET Resume] Database query error:', dbError.message);
      }
    }

    // Try in-memory storage
    if (!resume && resumes.has(resume_id)) {
      resume = resumes.get(resume_id);
    }

    if (resume) {
      res.json({
        success: true,
        resume: {
          resume_id: resume.resume_id,
          candidate_name: resume.candidate_name,
          email: resume.email,
          skills: resume.skills,
          years_experience: resume.years_experience,
          education: resume.education,
          certifications: resume.certifications
        },
        actions: {
          delete: `/api/resume/${resume_id}`,
          method: 'DELETE'
        }
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Resume ${resume_id} not found`
      });
    }
  } catch (error) {
    console.error('[GET Resume] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: usingDatabase ? 'Tiger Cloud Connected' : 'In-Memory (Fallback)',
    timestamp: new Date().toISOString(),
    embedding_method: EMBEDDING_METHOD,
    resumes_in_storage: resumes.size,
    jobs_in_storage: jobs.size,
    deletion_endpoints: {
      delete_resume: 'DELETE /api/resume/:resume_id',
      delete_job: 'DELETE /api/job/:job_id',
      get_resume: 'GET /api/resume/:resume_id'
    }
  });
});

/**
 * GET /
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================================
// Scoring Functions
// ============================================================================

function computeKeywordScore(resumeSkills, jobDescription) {
  if (!resumeSkills || resumeSkills.length === 0) return 0;

  const jobLower = (jobDescription || '').toLowerCase();
  let matches = 0;
  let skillMatchScores = 0;
  let validSkillCount = 0;

  resumeSkills.forEach(skill => {
    // Handle both string and object formats
    let skillName = '';
    if (typeof skill === 'string') {
      skillName = skill;
    } else if (skill && typeof skill === 'object' && skill.name) {
      skillName = String(skill.name);
    } else {
      return; // Skip invalid skills
    }

    const skillLower = skillName.toLowerCase().trim();
    if (!skillLower || skillLower.length === 0) return;

    validSkillCount++;

    // Use word boundary matching to avoid false positives (Java ≠ JavaScript)
    try {
      const wordBoundaryRegex = new RegExp(`\\b${skillLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const skillMatches = jobLower.match(wordBoundaryRegex);

      if (skillMatches && skillMatches.length > 0) {
        matches++;
        // Score: 1.0 for first match + 0.2 for each additional mention (diminishing returns)
        const matchCount = Math.min(skillMatches.length, 5); // Cap at 5
        const matchScore = 1.0 + (Math.min(matchCount - 1, 3) * 0.15);
        skillMatchScores += Math.min(matchScore, 1.5);
      }
    } catch (e) {
      // Skip if regex fails
      console.warn(`[SCORE] Error matching skill "${skillName}":`, e.message);
    }
  });

  // Return average skill match score, capped at 1.0
  if (validSkillCount === 0) return 0;
  const averageScore = skillMatchScores / validSkillCount;
  return Math.min(1.0, Math.max(0, averageScore));
}

/**
 * Domain-aware semantic scoring
 * Combines embedding similarity with domain relevance checks
 * to prevent false positives from generic term overlap
 */
function computeSemanticScore(resumeEmbedding, jobEmbedding, context = {}) {
  if (!resumeEmbedding || !jobEmbedding) return 0.5;
  if (!Array.isArray(resumeEmbedding) || !Array.isArray(jobEmbedding)) return 0.5;
  if (resumeEmbedding.length === 0 || jobEmbedding.length === 0) return 0.5;
  if (resumeEmbedding.length !== jobEmbedding.length) return 0.5;

  // Calculate raw cosine similarity
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < resumeEmbedding.length; i++) {
    const a = resumeEmbedding[i];
    const b = jobEmbedding[i];

    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      continue;
    }

    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (!Number.isFinite(dotProduct) || !Number.isFinite(normA) || !Number.isFinite(normB)) {
    return 0.5;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0.5;
  }

  const cosineScore = dotProduct / denominator;
  const rawEmbeddingScore = (cosineScore + 1) / 2;  // Normalize to 0-1

  // If no context provided, return raw embedding score
  if (!context || Object.keys(context).length === 0) {
    return Math.max(0, Math.min(1, rawEmbeddingScore));
  }

  // Calculate domain relevance score
  let domainRelevance = 0.5;  // Default neutral
  try {
    domainRelevance = calculateDomainRelevance(context);
  } catch (e) {
    // Fallback to neutral if domain relevance calculation fails
    domainRelevance = 0.5;
  }

  // Detect if job is tech-oriented
  const isJobTechOriented = detectTechJob(context.jobTitle, context.jobDescription);

  // Apply skill-semantic alignment validation
  let skillSemanticAlignment = 0.5;  // Neutral default
  const skillScore = context.skillScore || 0;

  if (isJobTechOriented && skillScore < 0.4) {
    // Tech job but candidate has very low skill match
    // High embedding similarity + low actual skill match = generic overlap
    // Penalize this heavily
    skillSemanticAlignment = 0.2;  // Strong penalty for misleading semantic overlap
  } else if (skillScore > 0.7) {
    // Good skill match - embedding score is more reliable
    skillSemanticAlignment = Math.min(1, skillScore);
  } else {
    // Medium skill match - use embedding as-is
    skillSemanticAlignment = rawEmbeddingScore;
  }

  // Composite semantic score with domain awareness:
  // - 40% raw embedding similarity (broad semantic relatedness)
  // - 30% domain relevance (field-specific fit)
  // - 30% skill-semantic alignment (actual skills matching job needs)
  const compositeScore = (
    rawEmbeddingScore * 0.4 +
    domainRelevance * 0.3 +
    skillSemanticAlignment * 0.3
  );

  return Math.max(0, Math.min(1, compositeScore));
}

/**
 * Detect if a job is tech-oriented based on title and description
 */
function detectTechJob(jobTitle, jobDescription) {
  const techKeywords = [
    'engineer', 'developer', 'programmer', 'architect', 'devops', 'sre',
    'cloud', 'data', 'ai', 'ml', 'machine learning', 'database', 'sql',
    'python', 'javascript', 'java', 'c++', '.net', 'react', 'node',
    'kubernetes', 'docker', 'aws', 'azure', 'gcp', 'infrastructure',
    'software', 'tech', 'it ', 'cybersecurity', 'security', 'network',
    'analyst', 'admin', 'devp', 'backend', 'frontend', 'fullstack'
  ];

  let titleLower = (jobTitle || '').toLowerCase();
  let descLower = (jobDescription || '').toLowerCase();

  const titleHasTech = techKeywords.some(keyword => titleLower.includes(keyword));
  const descHasTech = techKeywords.filter(kw => kw.length > 4).some(keyword => {
    // For longer keywords, require multiple mentions in description
    const matches = (descLower.match(new RegExp(keyword, 'g')) || []).length;
    return matches >= 2;
  });

  return titleHasTech || descHasTech;
}

/**
 * Calculate domain relevance score based on field alignment
 */
function calculateDomainRelevance(context) {
  let relevanceScore = 0.5;  // Neutral default

  const jobDesc = (context.jobDescription || '').toLowerCase();
  const jobTitle = (context.jobTitle || '').toLowerCase();
  const resumeText = (context.resumeText || '').toLowerCase();
  const resumeSkills = context.resumeSkills || [];
  const resumeEducation = context.resumeEducation || [];

  // Tech job indicators
  const isTechJob = detectTechJob(context.jobTitle, context.jobDescription);

  if (!isTechJob) {
    // Non-tech job - use raw semantic relevance
    return 0.6;  // Generic jobs have broader relevance
  }

  // Tech job - check if resume shows tech background
  let techIndicators = 0;
  const maxIndicators = 5;

  // 1. Check if resume mentions relevant tech keywords
  const techKeywords = [
    'software', 'development', 'engineering', 'system', 'data', 'cloud',
    'database', 'api', 'code', 'program', 'javascript', 'python', 'java',
    'deployment', 'infrastructure', 'kubernetes', 'docker', 'agile'
  ];

  const techKeywordMatches = techKeywords.filter(kw => resumeText.includes(kw)).length;
  if (techKeywordMatches >= 3) techIndicators += 2;
  else if (techKeywordMatches >= 1) techIndicators += 1;

  // 2. Check if extracted skills match job description keywords
  if (resumeSkills && resumeSkills.length > 0) {
    const skillMatches = resumeSkills.filter(skill => {
      const skillStr = typeof skill === 'string' ? skill : (skill.name || '');
      return jobDesc.includes(skillStr.toLowerCase());
    }).length;
    if (skillMatches >= 2) techIndicators += 2;
    else if (skillMatches >= 1) techIndicators += 1;
  }

  // 3. Check job title matches resume job history
  const titleKeywords = jobTitle.split(/\s+/).filter(w => w.length > 4);
  const titleMatches = titleKeywords.filter(keyword => resumeText.includes(keyword)).length;
  if (titleMatches >= 2) techIndicators += 1;

  // 4. Check education field (if available)
  let hasRelevantEducation = false;
  const techFields = ['computer science', 'engineering', 'information technology', 'data science', 'software'];
  if (resumeEducation) {
    const eduStr = typeof resumeEducation === 'string' ? resumeEducation : JSON.stringify(resumeEducation);
    hasRelevantEducation = techFields.some(field => eduStr.toLowerCase().includes(field));
  }
  if (hasRelevantEducation) techIndicators += 1;

  // 5. Significant experience in tech (if available)
  if (context.skillScore && context.skillScore > 0.5) {
    techIndicators += 1;
  }

  // Calculate relevance: higher indicators = higher relevance
  relevanceScore = Math.min(1, 0.3 + (techIndicators / maxIndicators) * 0.7);

  return relevanceScore;
}

function computeStructuredScore(resumeYears, jobYears) {
  if (!jobYears) return 1.0;
  if (!resumeYears) return 0;

  if (resumeYears >= jobYears) {
    return 1.0;
  } else {
    return Math.max(0, resumeYears / jobYears);
  }
}

function computeEducationScore(resumeEducation, jobDescription) {
  if (!resumeEducation || resumeEducation.length === 0) return 0;

  // Keywords indicating education requirements in job description
  const educationKeywords = [
    'Bachelor', 'B.S.', 'B.A.', 'Bachelor degree',
    'Master', 'M.S.', 'M.A.', 'Master degree',
    'PhD', 'Ph.D.', 'Doctorate',
    'MBA', 'Master of Business',
    'Associate', 'Associate degree',
    'Diploma', 'High school', 'Secondary',
    'College', 'University', 'Bootcamp'
  ];

  const jobLower = jobDescription.toLowerCase();
  let requiredEducationLevel = 0; // 0=none, 1=HS, 2=Associate, 3=Bachelor, 4=Master, 5=PhD

  educationKeywords.forEach(keyword => {
    if (jobLower.includes(keyword.toLowerCase())) {
      if (keyword.toLowerCase().includes('phd') || keyword.toLowerCase().includes('doctorate')) requiredEducationLevel = 5;
      else if (keyword.toLowerCase().includes('master') || keyword.toLowerCase().includes('m.s.') || keyword.toLowerCase().includes('m.a.')) requiredEducationLevel = Math.max(requiredEducationLevel, 4);
      else if (keyword.toLowerCase().includes('bachelor') || keyword.toLowerCase().includes('b.s.') || keyword.toLowerCase().includes('b.a.')) requiredEducationLevel = Math.max(requiredEducationLevel, 3);
      else if (keyword.toLowerCase().includes('associate')) requiredEducationLevel = Math.max(requiredEducationLevel, 2);
    }
  });

  if (requiredEducationLevel === 0) return 1.0; // No education requirement specified

  // Check resume education level
  let resumeEducationLevel = 0;
  const resumeEducationText = resumeEducation.join(' ').toLowerCase();

  if (resumeEducationText.includes('phd') || resumeEducationText.includes('doctorate')) resumeEducationLevel = 5;
  else if (resumeEducationText.includes('master') || resumeEducationText.includes('m.s.') || resumeEducationText.includes('m.a.')) resumeEducationLevel = 4;
  else if (resumeEducationText.includes('bachelor') || resumeEducationText.includes('b.s.') || resumeEducationText.includes('b.a.')) resumeEducationLevel = 3;
  else if (resumeEducationText.includes('associate')) resumeEducationLevel = 2;
  else if (resumeEducationText.includes('bootcamp') || resumeEducationText.length > 0) resumeEducationLevel = 1;

  if (resumeEducationLevel === 0) return 0;
  if (resumeEducationLevel >= requiredEducationLevel) return 1.0;
  return resumeEducationLevel / requiredEducationLevel;
}

function computeCertificationScore(resumeCertifications, jobDescription) {
  if (!resumeCertifications || resumeCertifications.length === 0) return 0.3; // Neutral score for missing certs

  // Comprehensive certification keywords in job descriptions
  const certificationKeywords = [
    // Cloud Certifications
    'AWS Certified', 'AWS Solutions Architect', 'AWS Developer Associate', 'AWS SysOps',
    'AWS Cloud Practitioner', 'AWS DevOps Engineer', 'AWS Security Specialty',
    'Google Cloud Certified', 'Google Cloud Professional', 'Google Cloud Associate',
    'Azure Certified', 'Azure Administrator', 'Azure Solutions Architect', 'Microsoft Certified',
    'Oracle Cloud Certified', 'Oracle Certified Associate', 'OCA',

    // Kubernetes & Container
    'Kubernetes', 'CKA', 'Certified Kubernetes Administrator', 'CKAD', 'Kubernetes Developer',
    'Docker Certified',

    // Security Certifications
    'CISSP', 'Certified Information Systems Security Professional',
    'CEH', 'Certified Ethical Hacker',
    'CompTIA', 'Security+', 'CompTIA Security',
    'Certified Information Security Manager', 'CISM',
    'OSCP', 'Offensive Security',
    'Certified Secure Software Developer', 'CSSD',

    // Project Management
    'PMP', 'Project Management Professional',
    'PRINCE2', 'PRINCE2 Certified',
    'Certified Associate Project Manager', 'CAPM',
    'PMI', 'Project Management Institute',

    // Agile & Scrum
    'Scrum Master', 'CSM', 'Certified Scrum Master',
    'Product Owner', 'CSPO', 'Certified Scrum Product Owner',
    'SAFe', 'Scaled Agile',
    'Kanban', 'LeSS', 'Disciplined Agile', 'DAD',

    // Data & Analytics
    'Tableau Desktop', 'Tableau Server', 'Tableau Certified',
    'Google Data Analytics', 'Google Data Studio',
    'Databricks Certified', 'Databricks',
    'Certified Associate Data Analyst',
    'Microsoft Certified Data Analyst',
    'Snowflake University',

    // Database Certifications
    'Oracle Database', 'Oracle Certified Associate', 'OCA',
    'Oracle Certified Professional', 'OCP',
    'MySQL Certified', 'MySQL Associate',
    'PostgreSQL', 'PostgreSQL Certified',
    'MongoDB Certified',

    // Salesforce
    'Salesforce Certified', 'Salesforce Administrator', 'Salesforce Developer',
    'Salesforce Solutions Architect', 'Salesforce Service Cloud',
    'Salesforce Commerce Cloud', 'Salesforce Marketing Cloud',

    // Java & Programming
    'Java Certified Associate', 'Java Certified Professional', 'OCAJP', 'OCPJP',
    'Oracle Certified Associate Java',
    'Python Institute', 'PCEP', 'PCAP', 'PCPP',

    // Cloud Platforms - General
    'Cloud Practitioner', 'Cloud Associate', 'Cloud Professional',
    'Multi-Cloud Certified',

    // Linux
    'Linux Foundation Certified', 'LFCA', 'LFCE',
    'CompTIA Linux+',
    'Red Hat Certified', 'RHCSA', 'RHCE',

    // AI/ML
    'TensorFlow Certified', 'AI Practitioner',
    'Machine Learning Specialist', 'ML Specialist',
    'Certified AI Practitioner', 'Certified Machine Learning',

    // Other Professional Certifications
    'Certified', 'Certification', 'Credential',
    'Coursera', 'Coursera Professional Certificate',
    'Udacity Nanodegree', 'Nanodegree',
    'edX Verified',
    'LinkedIn Learning Certified',
    'ISO', 'ISO Certified', 'ISO 27001'
  ];

  const jobLower = jobDescription.toLowerCase();
  const resumeCertLower = resumeCertifications.join(' ').toLowerCase();

  let certMatches = 0;
  let requiredCerts = 0;

  // Count how many certifications are mentioned in job description
  certificationKeywords.forEach(cert => {
    const certLower = cert.toLowerCase();
    if (jobLower.includes(certLower)) {
      requiredCerts++;
      if (resumeCertLower.includes(certLower)) {
        certMatches++;
      }
    }
  });

  if (requiredCerts === 0) return 0.5; // No specific certs required, but candidate has some
  if (resumeCertifications.length === 0) return 0;

  return Math.min(1.0, certMatches / requiredCerts);
}

/**
 * Determine the weight type/category for a job
 * Returns a human-readable description of which weight profile is being used
 */
function getWeightTypeForJob(jobTitle, jobDescription) {
  const title = (jobTitle || '').toLowerCase();
  const desc = (jobDescription || '').toLowerCase();

  if (title.includes('senior') || title.includes('lead') || title.includes('principal')) {
    return 'Senior/Leadership (Experience-Heavy)';
  }
  if (desc.includes('certification') || desc.includes('certified') || title.includes('security') || title.includes('compliance')) {
    return 'Security/Compliance (Cert-Heavy)';
  }
  if (title.includes('data') || title.includes('machine learning') || title.includes('ml') ||
      desc.includes('machine learning') || desc.includes('tensorflow') || desc.includes('pytorch')) {
    return 'Data Science/ML (Skills-Heavy)';
  }
  return 'Default (Balanced)';
}

/**
 * Calculate dynamic weights based on job title and description
 * Adjusts weight distribution to match job type characteristics
 */
function getWeightsForJobType(jobTitle, jobDescription) {
  const title = (jobTitle || '').toLowerCase();
  const desc = (jobDescription || '').toLowerCase();

  // Senior/Leadership roles: Experience and skills matter most
  if (title.includes('senior') || title.includes('lead') || title.includes('principal')) {
    return {
      keyword: 0.30,         // Skills: 30%
      semantic: 0.15,        // Semantic: 15%
      structured: 0.35,      // Experience: 35% (high priority)
      education: 0.15,       // Education: 15%
      certification: 0.05    // Certification: 5%
    };
  }

  // Security/Compliance roles: Certifications and experience matter more
  if (desc.includes('certification') || desc.includes('certified') || title.includes('security') || title.includes('compliance')) {
    return {
      keyword: 0.30,         // Skills: 30%
      semantic: 0.20,        // Semantic: 20%
      structured: 0.20,      // Experience: 20%
      education: 0.15,       // Education: 15%
      certification: 0.15    // Certification: 15% (higher weight)
    };
  }

  // Data Science/ML roles: Skills and semantic understanding critical
  if (title.includes('data') || title.includes('machine learning') || title.includes('ml') ||
      desc.includes('machine learning') || desc.includes('tensorflow') || desc.includes('pytorch')) {
    return {
      keyword: 0.40,         // Skills: 40% (very important)
      semantic: 0.25,        // Semantic: 25% (understanding matters)
      structured: 0.15,      // Experience: 15%
      education: 0.15,       // Education: 15%
      certification: 0.05    // Certification: 5%
    };
  }

  // Default balanced weights for general tech roles
  return {
    keyword: 0.25,         // Skills keyword matching (25%)
    semantic: 0.15,        // Semantic similarity of descriptions (15%)
    structured: 0.10,      // Years of experience match (10%)
    education: 0.30,       // Education level match (30%)
    certification: 0.20    // Certification match (20%)
  };
}

function computeCompositeScore(keywordScore, semanticScore, structuredScore, educationScore, certificationScore, jobTitle = '', jobDescription = '') {
  // Get dynamic weights based on job type
  const weights = getWeightsForJobType(jobTitle, jobDescription);

  // Verify weights sum to 1.0 (for debugging)
  const totalWeight = weights.keyword + weights.semantic + weights.structured +
                     weights.education + weights.certification;
  if (Math.abs(totalWeight - 1.0) > 0.001) {
    console.warn(`  Weight normalization issue: total = ${totalWeight}, should be 1.0`);
  }

  // Calculate composite score as weighted average
  const composite =
    (keywordScore * weights.keyword) +
    (semanticScore * weights.semantic) +
    (structuredScore * weights.structured) +
    (educationScore * weights.education) +
    (certificationScore * weights.certification);

  return Math.min(1, Math.max(0, composite));
}

/**
 * Generate strengths summary based on dimension scores
 */
function getStrengthsSummary(skillScore, experienceScore, educationScore, certificationScore, semanticScore) {
  const strengths = [];

  if (skillScore >= 0.80) strengths.push('Strong technical skills match');
  if (skillScore >= 0.70) strengths.push('Solid skill alignment');

  if (experienceScore >= 0.90) strengths.push('Exceeds experience requirements');
  if (experienceScore >= 0.80 && experienceScore < 0.90) strengths.push('Well-matched experience level');

  if (educationScore >= 0.85) strengths.push('Education level matches requirements');

  if (certificationScore >= 0.75) strengths.push('Relevant certifications on file');

  if (semanticScore >= 0.80) strengths.push('Strong conceptual fit with role');
  if (semanticScore >= 0.70 && semanticScore < 0.80) strengths.push('Good alignment with role');

  // Ensure at least one strength is listed
  if (strengths.length === 0) {
    strengths.push('Candidate shows some promise');
  }

  return strengths;
}

/**
 * Generate weaknesses/areas for development based on dimension scores
 */
function getWeaknessesSummary(skillScore, experienceScore, educationScore, certificationScore, semanticScore) {
  const weaknesses = [];

  if (skillScore < 0.60) weaknesses.push('Limited technical skill overlap - may require training');
  else if (skillScore < 0.75) weaknesses.push('Some skill gaps present');

  if (experienceScore < 0.50) weaknesses.push('Significant experience gap - may need mentoring');
  else if (experienceScore < 0.70) weaknesses.push('Experience below requirements');

  if (educationScore < 0.65) weaknesses.push('Education level below requirements');

  if (certificationScore < 0.40) weaknesses.push('Missing relevant certifications');
  else if (certificationScore < 0.70) weaknesses.push('Limited relevant certifications');

  if (semanticScore < 0.55) weaknesses.push('Limited conceptual alignment with role');

  // Return "No major concerns" if no weaknesses identified
  if (weaknesses.length === 0) {
    return ['No major concerns identified'];
  }

  return weaknesses;
}

/**
 * Smart estimation of required experience from job details
 * Uses job title, description keywords, and complexity indicators
 */
function estimateRequiredExperienceFromJob(job) {
  if (!job) return 0;

  let estimatedYears = 0;

  // Method 1: Check for explicit year mentions
  if (job.description || job.requirements) {
    const fullText = `${job.description || ''} ${job.requirements || ''}`;
    const patterns = [
      /(\d+)\s*(?:\+)\s*years?/i,  // 5+ years
      /(\d+)\s*-\s*(\d+)\s*years?/i, // 5-7 years
      /(\d+)\s+years?/i  // 5 years
    ];

    for (const pattern of patterns) {
      const match = fullText.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  }

  // Method 2: Estimate from job title seniority
  const titleEstimate = estimateYearsFromJobTitle(job.title);
  if (titleEstimate > 0) {
    estimatedYears = titleEstimate;
  }

  // Method 3: Estimate from job complexity
  const complexityEstimate = estimateYearsFromJobComplexity(job);
  if (complexityEstimate > titleEstimate) {
    estimatedYears = complexityEstimate;
  }

  return estimatedYears;
}

/**
 * Estimate required years from job title seniority
 */
function estimateYearsFromJobTitle(title) {
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
 * Estimate required years from job description complexity
 */
function estimateYearsFromJobComplexity(job) {
  const fullText = `${job.title || ''} ${job.description || ''} ${job.requirements || ''}`.toLowerCase();

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

  let estimatedYears = 0;

  // Count management indicators
  let managementCount = managementKeywords.filter(kw => fullText.includes(kw)).length;
  if (managementCount >= 2) {
    estimatedYears = Math.max(estimatedYears, 8);
  } else if (managementCount >= 1) {
    estimatedYears = Math.max(estimatedYears, 5);
  }

  // Count seniority indicators
  let seniorityCount = seniorityKeywords.filter(kw => fullText.includes(kw)).length;
  if (seniorityCount >= 3) {
    estimatedYears = Math.max(estimatedYears, 10);
  } else if (seniorityCount >= 2) {
    estimatedYears = Math.max(estimatedYears, 6);
  } else if (seniorityCount >= 1) {
    estimatedYears = Math.max(estimatedYears, 4);
  }

  // Count advanced tech
  let advancedTechCount = advancedTechKeywords.filter(kw => fullText.includes(kw)).length;
  if (advancedTechCount >= 4) {
    estimatedYears = Math.max(estimatedYears, 8);
  } else if (advancedTechCount >= 2) {
    estimatedYears = Math.max(estimatedYears, 5);
  } else if (advancedTechCount >= 1) {
    estimatedYears = Math.max(estimatedYears, 3);
  }

  // Count required skills
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

// ============================================================================
// Admin Middleware - Authentication
// ============================================================================

function authenticateAdmin(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const adminKey = process.env.ADMIN_API_KEY || 'admin-secret-key';

  if (!apiKey || apiKey !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized - Invalid or missing X-API-Key header' });
  }

  next();
}

// ============================================================================
// Phase 3: Admin Analytics & Monitoring Endpoints
// ============================================================================

/**
 * GET /api/admin/analytics/agent-performance
 * Get comprehensive agent performance metrics
 */
app.get('/api/admin/analytics/agent-performance', authenticateAdmin, async (req, res) => {
  if (!agentAnalytics || !multiAgentEnabled) {
    return res.status(503).json({ error: 'Analytics not available' });
  }

  try {
    const timeframe = parseInt(req.query.hours) || 24;
    const metrics = {};

    // Get metrics for each agent
    const agentTypes = ['skill', 'experience', 'education', 'certification', 'semantic'];
    for (const agent of agentTypes) {
      metrics[agent] = await agentAnalytics.getAgentPerformanceSummary(agent, timeframe);
    }

    // Get system health score
    const systemHealth = await agentAnalytics.getSystemHealthScore(timeframe);

    res.json({
      timeframe: `${timeframe} hours`,
      timestamp: new Date().toISOString(),
      system_health: systemHealth,
      agent_metrics: metrics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/batch/submit
 * Submit a batch processing job
 */
app.post('/api/admin/batch/submit', authenticateAdmin, async (req, res) => {
  if (!batchProcessor || !multiAgentEnabled) {
    return res.status(503).json({ error: 'Batch processing not available' });
  }

  try {
    const { batchId, resumeIds, jobIds } = req.body;

    if (!batchId || !Array.isArray(resumeIds) || !Array.isArray(jobIds)) {
      return res.status(400).json({
        error: 'Invalid request',
        required: ['batchId (string)', 'resumeIds (array)', 'jobIds (array)']
      });
    }

    if (resumeIds.length === 0 || jobIds.length === 0) {
      return res.status(400).json({ error: 'resumeIds and jobIds cannot be empty' });
    }

    const batch = batchProcessor.addBatchJob(batchId, resumeIds, jobIds);

    res.json({
      success: true,
      batchId: batch.batchId,
      totalPairs: batch.pairs.length,
      status: batch.status,
      message: `Batch queued for processing (${batch.pairs.length} resume-job pairs)`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/batch/:batchId
 * Get batch job status and results
 */
app.get('/api/admin/batch/:batchId', authenticateAdmin, async (req, res) => {
  if (!batchProcessor || !multiAgentEnabled) {
    return res.status(503).json({ error: 'Batch processing not available' });
  }

  try {
    const batchId = req.params.batchId;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 100;

    const batchResults = batchProcessor.getBatchResults(batchId, page, pageSize);

    if (!batchResults) {
      return res.status(404).json({ error: `Batch ${batchId} not found` });
    }

    res.json(batchResults);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/batch
 * Get all active and completed batch jobs
 */
app.get('/api/admin/batch', authenticateAdmin, async (req, res) => {
  if (!batchProcessor || !multiAgentEnabled) {
    return res.status(503).json({ error: 'Batch processing not available' });
  }

  try {
    const queueStatus = batchProcessor.getQueueStatus();
    const completedBatches = batchProcessor.getCompletedBatches(20);

    res.json({
      queue: queueStatus,
      completed: completedBatches,
      statistics: batchProcessor.getStatistics()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/analytics/slowest-agents
 * Get slowest performing agents
 */
app.get('/api/admin/analytics/slowest-agents', authenticateAdmin, async (req, res) => {
  if (!agentAnalytics || !multiAgentEnabled) {
    return res.status(503).json({ error: 'Analytics not available' });
  }

  try {
    const limit = parseInt(req.query.limit) || 10;
    const slowest = await agentAnalytics.getSlowestAgents(limit);

    res.json({
      timestamp: new Date().toISOString(),
      slowest_agents: slowest
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/analytics/agent/:agentType/trend
 * Get agent performance trend over time
 */
app.get('/api/admin/analytics/agent/:agentType/trend', authenticateAdmin, async (req, res) => {
  if (!agentAnalytics || !multiAgentEnabled) {
    return res.status(503).json({ error: 'Analytics not available' });
  }

  try {
    const agentType = req.params.agentType;
    const hours = parseInt(req.query.hours) || 24;

    const trend = await agentAnalytics.getAgentTrend(agentType, hours);

    res.json({
      agentType,
      timeframe: `${hours} hours`,
      trend
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/health/system
 * Get overall system health
 */
app.get('/api/admin/health/system', authenticateAdmin, async (req, res) => {
  try {
    const health = {
      timestamp: new Date().toISOString(),
      database: usingDatabase && pool ? 'connected' : 'not configured',
      multiAgent: multiAgentEnabled ? 'ready' : 'disabled',
      components: {
        forkManager: forkManager ? 'ready' : 'not initialized',
        agentCoordinator: agentCoordinator ? 'ready' : 'not initialized',
        batchProcessor: batchProcessor ? 'ready' : 'not initialized',
        agentAnalytics: agentAnalytics ? 'ready' : 'not initialized',
        weightOptimizer: weightOptimizer ? 'ready' : 'not initialized'
      }
    };

    if (agentAnalytics) {
      health.system_health = await agentAnalytics.getSystemHealthScore(24);
    }

    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Error Handling
// ============================================================================

app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}]  Error:`, err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ============================================================================
// Fork Results Display - Startup Information
// ============================================================================

/**
 * Display recent fork results and agent findings from the database
 * Called during startup to show system state
 */
async function displayForkResultsOnStartup() {
  if (!pool || !multiAgentEnabled) {
    return; // Skip if no database or multi-agent disabled
  }

  try {
    console.log(`\n[${new Date().toISOString()}]  FORK RESULTS & AGENT FINDINGS`);
    console.log('='.repeat(70));

    // Query recent forks (last 24 hours)
    const forksResult = await pool.query(`
      SELECT
        fork_id,
        agent_type,
        resume_id,
        job_id,
        status,
        created_at,
        completed_at,
        EXTRACT(EPOCH FROM (completed_at - created_at)) as duration_seconds
      FROM agent_forks
      WHERE created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 20
    `);

    if (forksResult.rows.length === 0) {
      console.log(' No recent fork activity (no forks created in last 24 hours)');
    } else {
      console.log(`\n Recent Forks (${forksResult.rows.length} found):`);

      // Group by status
      const byStatus = {};
      forksResult.rows.forEach(fork => {
        if (!byStatus[fork.status]) byStatus[fork.status] = [];
        byStatus[fork.status].push(fork);
      });

      for (const [status, forks] of Object.entries(byStatus)) {
        const statusIcon = status === 'completed' ? '' : status === 'failed' ? '' : '⏳';
        console.log(`\n  ${statusIcon} ${status.toUpperCase()} (${forks.length}):`);

        forks.forEach(fork => {
          const duration = fork.duration_seconds && typeof fork.duration_seconds === 'number' ? `${fork.duration_seconds.toFixed(2)}s` : '—';
          const time = new Date(fork.created_at).toLocaleTimeString();
          const errorInfo = fork.error_message ? ` | Error: ${fork.error_message.substring(0, 30)}...` : '';
          console.log(`    • ${fork.agent_type.padEnd(12)} | Resume: ${fork.resume_id?.substring(0, 8)}... Job: ${fork.job_id?.substring(0, 8)}... | ${duration.padEnd(7)} | ${time}${errorInfo}`);
        });
      }
    }

    // Query agent results
    console.log(`\n AGENT FINDINGS:`);
    console.log('  Available Agents:');

    const agentTypes = ['skill', 'experience', 'education', 'certification', 'semantic'];
    let totalResults = 0;

    for (const agentType of agentTypes) {
      const tableName = `${agentType}_agent_results`;
      let scoreColumn = '';

      switch(agentType) {
        case 'skill':
          scoreColumn = 'skill_score';
          break;
        case 'semantic':
          scoreColumn = 'semantic_score';
          break;
        case 'experience':
          scoreColumn = 'experience_score';
          break;
        case 'education':
          scoreColumn = 'education_score';
          break;
        case 'certification':
          scoreColumn = 'certification_score';
          break;
      }

      try {
        const resultsResult = await pool.query(`
          SELECT
            resume_id,
            job_id,
            ${scoreColumn} as score,
            processing_time_ms,
            created_at
          FROM ${tableName}
          WHERE created_at > NOW() - INTERVAL '24 hours'
          ORDER BY created_at DESC
          LIMIT 5
        `);

        const resultCount = resultsResult.rows.length;
        totalResults += resultCount;

        if (resultCount > 0) {
          console.log(`\n   ${agentType.toUpperCase()} Agent - ${resultCount} recent results:`);

          resultsResult.rows.slice(0, 3).forEach(result => {
            console.log(`     • Score: ${result.score ? result.score.toFixed(1) : 'N/A'}% | Time: ${result.processing_time_ms}ms | ${new Date(result.created_at).toLocaleTimeString()}`);
          });

          if (resultCount > 3) {
            console.log(`     ... and ${resultCount - 3} more`);
          }

          // Show average score
          const avgScore = resultsResult.rows.reduce((sum, r) => sum + (r.score || 0), 0) / resultCount;
          console.log(`     Average Score: ${avgScore.toFixed(1)}%`);
        } else {
          console.log(`    ⏳ ${agentType.padEnd(12)} - Waiting for first analysis`);
        }
      } catch (err) {
        // Table might not exist yet (tables created during first agent run)
        if (err.code === '42P01') {
          // Table doesn't exist - expected on first run
          console.log(`    ⏳ ${agentType.padEnd(12)} - Ready (table not yet created)`);
        } else {
          console.log(`      ${agentType.padEnd(12)} - Error: ${err.message.substring(0, 40)}`);
        }
      }
    }

    console.log(`\n  Total Results Across All Agents: ${totalResults}`);
    if (totalResults === 0) {
      console.log('   Run /api/score-multi-agent/:resume_id/:job_id to generate results');
    }
    console.log('\n' + '='.repeat(70));
  } catch (error) {
    console.warn(`[${new Date().toISOString()}]   Could not display fork results:`, error.message);
  }
}

// ============================================================================
// Server Startup
// ============================================================================

app.listen(PORT, async () => {
  try {
    // Initialize NLP pipelines on startup
    console.log(`\n[${new Date().toISOString()}]  Initializing NLP pipelines...`);
    await initializeNLPPipelines();
    console.log(`[${new Date().toISOString()}]  NLP pipelines ready\n`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}]  NLP initialization failed:`, error.message);
    console.log(`[${new Date().toISOString()}]   Continuing without NLP support\n`);
  }

  // Display fork results and agent findings
  await displayForkResultsOnStartup();

  console.log(`\n[${new Date().toISOString()}]  SERVER STARTED`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
  console.log(`  Storage: ${usingDatabase && pool ? '  Tiger Database' : ' In-Memory'}`);
  console.log(`  Multi-Agent: ${multiAgentEnabled ? ' Ready +  Phase 3 Features' : '  Disabled (DB connection required)'}`);
  console.log('\n API Endpoints:');
  console.log('  POST   /api/upload-resume - Upload resume file');
  console.log('  POST   /api/job-description - Create job description');
  console.log('  GET    /api/score/:resume_id/:job_id - Get fit score');
  console.log('  GET    /api/resume/:resume_id - Get resume details');
  console.log('  DELETE /api/resume/:resume_id - Delete resume ');
  console.log('  DELETE /api/job/:job_id - Delete job ');
  if (multiAgentEnabled) {
    console.log('  GET    /api/score-multi-agent/:resume_id/:job_id ( Multi-Agent Scoring)');
    console.log('\n Phase 3 Admin Endpoints (require X-API-Key header):');
    console.log('  GET    /api/admin/analytics/agent-performance');
    console.log('  POST   /api/admin/batch/submit');
    console.log('  GET    /api/admin/batch/:batchId');
    console.log('  GET    /api/admin/batch');
    console.log('  GET    /api/admin/analytics/slowest-agents');
    console.log('  GET    /api/admin/analytics/agent/:agentType/trend');
    console.log('  GET    /api/admin/health/system');
  }
  console.log('  GET    /api/health - System health');
  console.log('\n Ready to accept requests');
  console.log('='.repeat(70) + '\n');
});
