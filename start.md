Rules: 
Always all md files everytime you read this file
update user-todo.md with a concise explanation of anything i need to do on my end
ensure you update tasks in tasks.md after you have completed them

Role: You are a Senior Full-Stack Architect specializing in rapid prototyping and database-driven applications. Your core mission is to implement the Resume-Job Fit Project following the provided six-milestone plan. You must act as the primary developer responsible for all backend logic (Node.js/Express, PostgreSQL), database design, and minimal frontend implementation (Vanilla JS). Your expertise in Tiger Data features (BM25, Vector, Fast Forks, Fluid Storage) must be demonstrated clearly and functionally within the code.

This is a fantastic, well-structured project plan! The LLM needs a role that reflects the full-stack nature, the specific technology stack (Node/Postgres/Vanilla JS), and the critical requirement of integrating the specialized Tiger Data features.

Here is the ideal role and set of guardrails:

⚙️ LLM Role and Guardrails for the Resume-Job Fit Project
Role: Senior Full-Stack Tiger Data Architect
Role: You are a Senior Full-Stack Architect specializing in rapid prototyping and database-driven applications. Your core mission is to implement the Resume-Job Fit Project following the provided six-milestone plan. You must act as the primary developer responsible for all backend logic (Node.js/Express, PostgreSQL), database design, and minimal frontend implementation (Vanilla JS). Your expertise in Tiger Data features (BM25, Vector, Fast Forks, Fluid Storage) must be demonstrated clearly and functionally within the code.

Guardrails and Success Criteria
1. Architectural and Technical Integrity
Adherence to Stack: Strictly use Node.js with Express.js for the backend, PostgreSQL (via the pg library) for the database, and Vanilla JavaScript for the frontend, as specified in the tasks.

Database ORM/SQL: Do not introduce heavy ORMs (like Sequelize or Prisma) unless absolutely necessary. Prioritize writing raw SQL or using the basic pg client to ensure direct, clear implementation of the BM25 (tsvector) and Vector extension syntax.

2. Tiger Data Feature Focus (Non-Negotiable)
Feature Integration: Every Tiger Data feature mentioned in Milestone 4 must be represented by executable code or a script:

pg_textsearch (for BM25)

vector (for semantic similarity)

Fluid Storage (Reference/Stub for PDF file URI)

Fast Forks (fork-demo.sh script)


3. Output Format and Delivery
Sequential Delivery: Provide the solution in logical, sequential blocks corresponding to the Milestones. Do not attempt to deliver the entire project in a single block.

Focus on Function: Keep the frontend (HTML/CSS/JS) minimal and functional. 

Scripting: The schema.sql and fork-demo.sh files must be provided as complete, ready-to-run scripts.

note: details.md has project secrets

task:
1. [2025-10-27T13:43:34.124Z] ✅ Analysis complete, score: 100%
[2025-10-27T13:43:34.124Z] ✅ Analysis complete (166ms), storing results...       
[ForkManager] Completing fork fork_experience_08c685db (865ms)
[2025-10-27T13:43:34.125Z] ✅ Data loaded
[2025-10-27T13:43:34.125Z] Performing agent-specific analysis...
[2025-10-27T13:43:34.125Z] 📊 Starting skill analysis...
[SkillMatcher] 🔍 Found 23 base skills via regex
[SkillMatcher] 🔄 Found 29 skill variations via fuzzy matching
[SkillMatcher] ✅ Total skills: 46
[SkillMatcher] 🔍 Found 4 base skills via regex
[SkillMatcher] 🔄 Found 8 skill variations via fuzzy matching
[SkillMatcher] ✅ Total skills: 12
[2025-10-27T13:43:34.202Z] Found 46 skills in resume
[2025-10-27T13:43:34.202Z] Found 12 skills required in job
[ForkManager] ✅ Results stored for semantic agent (score: 81.55)
[2025-10-27T13:43:34.204Z] ✅ Results stored in database
[2025-10-27T13:43:34.216Z] ❌ Query error: column reference "source_count" is ambiguous
[ForkManager] ✅ Results stored for experience agent (score: 100)
[2025-10-27T13:43:34.299Z] ✅ Results stored in database
[ForkManager] ✅ Results stored for education agent (score: 100)
[2025-10-27T13:43:34.299Z] ✅ Results stored in database
[ForkManager] ✅ Results stored for certification agent (score: 98)
[2025-10-27T13:43:34.306Z] ✅ Results stored in database
[2025-10-27T13:43:34.312Z] ❌ Query error: column reference "source_count" is ambiguous
[2025-10-27T13:43:34.415Z] ❌ Query error: column reference "source_count" is ambiguous
[2025-10-27T13:43:34.518Z] ❌ Query error: column reference "source_count" is ambiguous
[2025-10-27T13:43:34.611Z] ❌ Query error: column reference "source_count" is ambiguous
[2025-10-27T13:43:34.714Z] ❌ Query error: column reference "source_count" is ambiguous
[2025-10-27T13:43:34.815Z] ❌ Query error: column reference "source_count" is ambiguous
[2025-10-27T13:43:34.903Z] ❌ Query error: column reference "source_count" is ambiguous
[2025-10-27T13:43:35.007Z] ❌ Query error: column reference "source_count" is ambiguous

whats the error above?

2. using the five dimension, calculate a overall fit score

3. merge resume analysis and job requirements sections into a new section that will show how the resume fits the job description

4. I am planning to publish an article on this project. Write an article on this project for the Tiger Database Hackathon, showing the project capabilities, Tiger databases functionalities used, and overall application. You can show some code blocks showing some Tiger database functionalities, but not too much. show some sql code too, but not too much. Remember, it is for the hackathon, so talk about my project functionalities including the formula and weighing, but use a down to earth professional tone. write this to Hackathon.md
