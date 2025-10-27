# Resume-Job Fit Analyzer

A simple application that analyzes how well a resume matches a job description using keyword matching and semantic embeddings.

## Features

- **Resume Upload** - Upload PDF or text resumes
- **Job Description** - Enter job requirements
- **Fit Score** - Get a composite score based on three metrics:
  - **Keyword Matching** (35%) - Skills matching
  - **Semantic Similarity** (45%) - Embedding-based similarity
  - **Experience Match** (20%) - Years of experience validation
- **Zero Setup** - No database password or complex configuration needed

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Server
```bash
npm start
```

The server will start on `http://localhost:8080`

### 3. Open in Browser
Navigate to: `http://localhost:8080`

## API Endpoints

### Upload Resume
```
POST /api/upload-resume
Content-Type: multipart/form-data

Body: resume (file)
Returns: { resume_id, candidate_name, skills, years_experience }
```

### Create Job Description
```
POST /api/job-description
Content-Type: application/json

Body: { title, description, required_years }
Returns: { job_id, title, required_years }
```

### Calculate Fit Score
```
GET /api/score/:resume_id/:job_id

Returns: {
  scores: { keyword, semantic, structured, composite },
  resume: { candidate_name, skills, years_experience },
  job: { title, description, required_years }
}
```

### Health Check
```
GET /api/health

Returns: { status, database, embedding_method, storage_size }
```

## Configuration

Edit `.env` to customize:

```
PORT=8080                           # Server port
EMBEDDING_METHOD=stub               # stub or openai
WEIGHT_KEYWORD=0.35                 # Keyword matching weight
WEIGHT_SEMANTIC=0.45                # Semantic similarity weight
WEIGHT_STRUCTURED=0.20              # Experience match weight
OPENAI_API_KEY=sk-...              # (optional) For better embeddings
```

## How It Works

1. **Resume Upload**
   - Extract text from PDF or text files
   - Parse resume to extract: name, skills, experience
   - Generate embedding vector (1536 dimensions)

2. **Job Description**
   - Store job title, description, required years
   - Generate embedding vector

3. **Scoring**
   - Keyword Score: Count matching skills in job description
   - Semantic Score: Cosine similarity between embeddings
   - Structured Score: Compare years of experience
   - Composite: Weighted average of three scores

4. **Result**
   - Display fit percentage (0-100%)
   - Show breakdown by component
   - List matching skills

## Embedding Methods

### Stub (Default)
- Uses hash-based deterministic embeddings
- No API key required
- Fast but less semantically rich
- Good for MVP/testing

### OpenAI (Optional)
- Uses OpenAI's text-embedding-3-small model
- Better semantic understanding
- Requires `OPENAI_API_KEY` environment variable
- Recommended for production

## Storage

Data is stored in-memory during runtime. This means:
- ✅ No database setup required
- ✅ No password management
- ✅ Fast performance
- ⚠️ Data lost on server restart

For persistence, upgrade to file system or database storage.

## Project Structure

```
.
├── server.js              # Express backend
├── package.json           # Dependencies
├── .env                   # Configuration
├── .env.example           # Config template
├── public/
│   ├── index.html         # Web interface
│   ├── style.css          # Styling
│   └── app.js             # Client logic
└── README.md              # This file
```

## Next Steps

1. **Database Integration** - Add PostgreSQL for persistence
2. **OpenAI Embeddings** - Use real embeddings for better matching
3. **Batch Upload** - Support multiple resumes at once
4. **Ranking** - Rank multiple candidates
5. **Auth** - Add user authentication
6. **Deploy** - Deploy to cloud (Heroku, Render, etc.)

## License

MIT

## Support

For issues or questions:
1. Check that dependencies are installed: `npm install`
2. Verify server is running: `npm start`
3. Test API health: `http://localhost:8080/api/health`
