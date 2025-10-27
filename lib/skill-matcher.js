// Skill Matcher: Reliable, Scalable Skill Extraction
// Uses curated skill list + fuzzy matching, NO BERT NER for skills

// ============================================================================
// COMPREHENSIVE TECH SKILL LIST (200+ skills)
// ============================================================================

export const SKILL_DATABASE = [
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

// ============================================================================
// SKILL MATCHING ENGINE
// ============================================================================

/**
 * Calculate Levenshtein distance (edit distance) between two strings
 * Used for fuzzy matching skill variations
 */
function levenshteinDistance(a, b) {
  const aLower = String(a || '').toLowerCase();
  const bLower = String(b || '').toLowerCase();

  if (aLower.length === 0) return bLower.length;
  if (bLower.length === 0) return aLower.length;

  const matrix = Array(bLower.length + 1)
    .fill(null)
    .map(() => Array(aLower.length + 1).fill(0));

  for (let i = 0; i <= aLower.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= bLower.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= bLower.length; j++) {
    for (let i = 1; i <= aLower.length; i++) {
      const indicator = aLower[i - 1] === bLower[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,      // insertion
        matrix[j - 1][i] + 1,      // deletion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[bLower.length][aLower.length];
}

/**
 * Find fuzzy match for a skill in the database
 * Useful for typos and variations: "nodejs" → "Node.js"
 */
export function findFuzzyMatch(text, maxDistance = 2) {
  const textLower = String(text || '').toLowerCase().trim();

  if (!textLower || textLower.length < 2) return null;

  let bestMatch = null;
  let bestDistance = maxDistance;

  for (const skill of SKILL_DATABASE) {
    const skillLower = skill.toLowerCase();
    const distance = levenshteinDistance(textLower, skillLower);

    // Exact match (case-insensitive)
    if (distance === 0) {
      return { skill, distance: 0, matchType: 'exact' };
    }

    // Fuzzy match within threshold
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = skill;
    }
  }

  return bestMatch
    ? { skill: bestMatch, distance: bestDistance, matchType: 'fuzzy' }
    : null;
}

/**
 * Extract skills from resume text using regex-based matching
 * PRIMARY METHOD: 100% reliable, no BERT tokens
 */
export function extractSkillsByRegex(resumeText) {
  if (!resumeText || typeof resumeText !== 'string') return [];

  const textLower = resumeText.toLowerCase();
  const foundSkills = new Map(); // Track by lowercase name to avoid duplicates

  // Match each skill in the database
  for (const skill of SKILL_DATABASE) {
    // Escape special regex characters (e.g., C++, C#, .NET)
    const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Use word boundary matching to avoid false positives
    // Java ≠ JavaScript, Python ≠ Jython
    const regex = new RegExp(`\\b${escapedSkill}\\b`, 'gi');

    if (regex.test(textLower)) {
      const key = skill.toLowerCase();
      if (!foundSkills.has(key)) {
        foundSkills.set(key, {
          name: skill,
          confidence: 0.95, // High confidence for exact matches
          source: 'regex',
          matchType: 'exact'
        });
      }
    }
  }

  return Array.from(foundSkills.values());
}

/**
 * Extract skill variations not in the database
 * Uses fuzzy matching to find close alternatives
 * For candidate/resume unique terms
 */
export function extractSkillVariations(resumeText, baseSkills = []) {
  if (!resumeText || typeof resumeText !== 'string') return [];

  // Extract words that might be skills (3+ chars, capitalized or all-caps)
  const candidatePatterns = [
    /\b([A-Z][a-z]+(?:\.[a-z]+)?)\b/g,        // Capitalized words (Python, Flask)
    /\b([A-Z]{3,}(?:\s+[A-Z]{2,})?)\b/g,      // Acronyms (AWS, CI/CD)
  ];

  const candidates = new Set();
  const baseSkillsLower = new Set(baseSkills.map(s =>
    (typeof s === 'string' ? s : s.name || '').toLowerCase()
  ));

  for (const pattern of candidatePatterns) {
    let match;
    while ((match = pattern.exec(resumeText)) !== null) {
      const candidate = match[1].trim();
      // Only consider if not already found and not a stop word
      if (candidate.length >= 3 && !baseSkillsLower.has(candidate.toLowerCase())) {
        candidates.add(candidate);
      }
    }
  }

  // Try to find fuzzy matches for candidates
  const variations = [];
  for (const candidate of candidates) {
    const fuzzyResult = findFuzzyMatch(candidate, 3); // Allow larger distance
    if (fuzzyResult && fuzzyResult.distance <= 2) {
      variations.push({
        name: fuzzyResult.skill,
        candidate,
        distance: fuzzyResult.distance,
        confidence: 0.75 - (fuzzyResult.distance * 0.1),
        source: 'fuzzy',
        matchType: 'fuzzy_variant'
      });
    }
  }

  return variations;
}

/**
 * Main skill extraction function
 * Combines regex-based detection with fuzzy matching for variations
 */
export function extractAllSkills(resumeText) {
  if (!resumeText || typeof resumeText !== 'string') return [];

  try {
    // Phase 1: Primary detection using regex against skill database
    const baseSkills = extractSkillsByRegex(resumeText);
    console.log(`[SkillMatcher]  Found ${baseSkills.length} base skills via regex`);

    // Phase 2: Extract variations and fuzzy matches
    const variations = extractSkillVariations(resumeText, baseSkills);
    console.log(`[SkillMatcher]  Found ${variations.length} skill variations via fuzzy matching`);

    // Combine and deduplicate
    const combined = new Map();

    // Add base skills
    baseSkills.forEach(skill => {
      const key = skill.name.toLowerCase();
      combined.set(key, skill);
    });

    // Add variations (only if not already found)
    variations.forEach(variation => {
      const key = variation.name.toLowerCase();
      if (!combined.has(key)) {
        combined.set(key, variation);
      }
    });

    const result = Array.from(combined.values());
    console.log(`[SkillMatcher]  Total skills: ${result.length}`);
    return result;
  } catch (error) {
    console.error('[SkillMatcher]  Error extracting skills:', error.message);
    return [];
  }
}

export default {
  SKILL_DATABASE,
  findFuzzyMatch,
  extractSkillsByRegex,
  extractSkillVariations,
  extractAllSkills
};
