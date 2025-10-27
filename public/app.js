// Resume-Job Fit Frontend Application
// Handles UI interactions and API communication

const API_BASE = window.location.origin;

// State
let resumeData = null;
let jobData = null;
let resumeId = null;
let jobId = null;

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const resumeFile = document.getElementById('resumeFile');
const resumeStatus = document.getElementById('resumeStatus');
const jobTitle = document.getElementById('jobTitle');
const jobDescription = document.getElementById('jobDescription');
const jobYears = document.getElementById('jobYears');
const jobStatus = document.getElementById('jobStatus');
const analyzeBtn = document.getElementById('analyzeBtn');
const resultsSection = document.getElementById('resultsSection');
const loadingSpinner = document.getElementById('loadingSpinner'); // Removed - using widget spinner instead
const errorMessage = document.getElementById('errorMessage');
const learningWidget = document.getElementById('learning-widget');

// ============================================================================
// Event Listeners
// ============================================================================

// Resume upload handling
uploadArea.addEventListener('click', () => resumeFile.click());
uploadArea.addEventListener('dragover', handleDragOver);
uploadArea.addEventListener('dragleave', handleDragLeave);
uploadArea.addEventListener('drop', handleDrop);
resumeFile.addEventListener('change', handleResumeUpload);

// Job description handling
jobTitle.addEventListener('input', validateInputs);
jobDescription.addEventListener('input', validateInputs);
jobYears.addEventListener('input', validateInputs);

// Analyze button
analyzeBtn.addEventListener('click', analyzeResume);

// Delete buttons (will be added after results are displayed)
// These are set up in displayResults() function

// ============================================================================
// File Upload Handlers
// ============================================================================

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        resumeFile.files = files;
        handleResumeUpload();
    }
}

async function handleResumeUpload() {
    const file = resumeFile.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
        showStatus(resumeStatus, 'error', '❌ Only PDF and TXT files are supported');
        return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
        showStatus(resumeStatus, 'error', '❌ File size must be less than 10MB');
        return;
    }

    showStatus(resumeStatus, 'loading', '📤 Uploading resume...');

    try {
        const formData = new FormData();
        formData.append('resume', file);

        const response = await fetch(`${API_BASE}/api/upload-resume`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
        }

        const data = await response.json();
        resumeId = data.resume_id;
        resumeData = data;

        showStatus(resumeStatus, 'success',
            `✅ Resume uploaded! Candidate: ${data.candidate_name || 'Unknown'}`);

        // Update upload area display
        updateUploadAreaDisplay(file.name);
        validateInputs();

    } catch (error) {
        console.error('Upload error:', error);
        showStatus(resumeStatus, 'error', `❌ Upload failed: ${error.message}`);
    }
}

function updateUploadAreaDisplay(fileName) {
    const placeholder = uploadArea.querySelector('.upload-placeholder');
    placeholder.innerHTML = `
        <p>📄 <strong>${fileName}</strong></p>
        <small>Click to change file</small>
    `;
}

// ============================================================================
// Job Description Handling
// ============================================================================

async function submitJobDescription() {
    const title = jobTitle.value.trim();
    const description = jobDescription.value.trim();
    const years = jobYears.value ? parseInt(jobYears.value) : 0;

    if (!title || !description) {
        showStatus(jobStatus, 'error', '❌ Job title and description are required');
        return false;
    }

    showStatus(jobStatus, 'loading', '📤 Creating job description...');

    try {
        const response = await fetch(`${API_BASE}/api/job-description`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                description,
                required_years: years
            })
        });

        if (!response.ok) {
            throw new Error(`Job creation failed: ${response.statusText}`);
        }

        const data = await response.json();
        jobId = data.job_id;
        jobData = data;

        showStatus(jobStatus, 'success', `✅ Job description created: ${data.title}`);
        return true;

    } catch (error) {
        console.error('Job creation error:', error);
        showStatus(jobStatus, 'error', `❌ Job creation failed: ${error.message}`);
        return false;
    }
}

// ============================================================================
// Resume Analysis & Scoring
// ============================================================================

async function analyzeResume() {
    if (!resumeId) {
        showError('Please upload a resume first');
        return;
    }

    // Submit job description if not already done
    if (!jobId) {
        const jobCreated = await submitJobDescription();
        if (!jobCreated) return;
    }

    showSpinner(true);
    hideError();
    resultsSection.style.display = 'none';

    try {
        // Use multi-agent endpoint to create forks and store agent results
        const response = await fetch(`${API_BASE}/api/score-multi-agent/${resumeId}/${jobId}`);

        if (!response.ok) {
            throw new Error(`Scoring failed: ${response.statusText}`);
        }

        const data = await response.json();

        // CRITICAL DIAGNOSTIC LOGGING
        console.log('✅ API Response received');
        console.log('   resume.skills type:', typeof data.resume.skills);
        console.log('   resume.skills is array:', Array.isArray(data.resume.skills));
        if (typeof data.resume.skills === 'string') {
            console.error('❌ CRITICAL: resume.skills is a STRING, not an array!');
            console.error('   First 100 chars:', data.resume.skills.substring(0, 100));
        } else if (Array.isArray(data.resume.skills)) {
            console.log('✅ resume.skills is an array of', data.resume.skills.length, 'items');
            if (data.resume.skills.length > 0) {
                console.log('   First item type:', typeof data.resume.skills[0]);
                console.log('   First item:', data.resume.skills[0]);
            }
        }
        console.log('✅ Full Scoring response:', data);

        // NEW: Show learning widget if discoveries made
        if (data.learning && data.learning.learned) {
            console.log('🧠 Learning detected, showing widget');
            if (learningWidget) {
                learningWidget.style.display = 'block';
                const discoveryCountElement = document.getElementById('discovery-count');
                if (discoveryCountElement) {
                    discoveryCountElement.textContent = data.learning.discoveryCount;
                    console.log('📊 Discovery count updated:', data.learning.discoveryCount);
                }

                // Hide widget after 2 seconds
                setTimeout(() => {
                    learningWidget.style.display = 'none';
                }, 2000);
            } else {
                console.warn('⚠️ Learning widget element not found');
            }
        } else {
            console.log('ℹ️ No learning data or learned flag is false:', data.learning);
        }

        displayResults(data);
        showSpinner(false);
        resultsSection.style.display = 'block';

    } catch (error) {
        console.error('❌ Analysis error:', error);
        showError(`Analysis failed: ${error.message}`);
        showSpinner(false);
    }
}

// ============================================================================
// Results Display
// ============================================================================

function displayResults(data) {
    const { scores, resume, job, embedding_method, resume_id, job_id } = data;

    if (!scores || !resume) {
        console.error('Invalid response data:', data);
        return;
    }

    // Store IDs for delete functionality
    window.currentResumeId = resume_id;
    window.currentJobId = job_id;

    console.log('📝 Stored IDs for deletion:', { resume_id, job_id });

    // Display composite score
    const compositePercent = Math.round(scores.composite * 100);
    document.getElementById('compositeScore').textContent = `${compositePercent}%`;

    // Update score bars and values
    // Map API field names to display field names
    updateScoreDisplay('keyword', scores.skill_match);
    updateScoreDisplay('semantic', scores.semantic);
    updateScoreDisplay('structured', scores.experience);
    updateScoreDisplay('education', scores.education);
    updateScoreDisplay('certification', scores.certification);

    // Helper function to convert any format to string array
    // Helper function to convert any format to string array
    function toStringArray(data, fieldName = 'field') {
        console.log(`[toStringArray] Processing ${fieldName}:`, {type: typeof data, length: data ? data.length : 'N/A', preview: typeof data === 'string' ? data.substring(0, 50) : data});

        if (!data) return [];

        // If it's a string, try to parse as JSON
        if (typeof data === 'string') {
            // Check if it looks like JSON
            const trimmed = data.trim();
            if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    console.log(`[toStringArray] Successfully parsed JSON for ${fieldName}`);
                    data = parsed;
                } catch (e) {
                    console.error(`[toStringArray] Failed to parse JSON for ${fieldName}:`, e.message);
                    return [data.trim()].filter(s => s && s.length > 0);
                }
            } else {
                // Treat as single skill name
                console.log(`[toStringArray] Treating as plain string for ${fieldName}`);
                return [data.trim()].filter(s => s && s.length > 0);
            }
        }

        // If it's an array, convert each element to string
        if (Array.isArray(data)) {
            const results = [];
            const seen = new Set(); // Track unique names

            for (const item of data) {
                let itemName = null;

                if (typeof item === 'string') {
                    // Direct string
                    itemName = item.trim();
                } else if (typeof item === 'object' && item !== null) {
                    // Try to extract name property (most common format)
                    itemName = item.name || item.title || item.skill;

                    // If no standard property, try to find any string property
                    if (!itemName) {
                        for (const key in item) {
                            if (typeof item[key] === 'string' &&
                                key !== 'source' &&
                                key !== 'matchType' &&
                                key !== 'candidate' &&
                                key !== 'confidence' &&
                                key !== 'distance') {
                                itemName = item[key];
                                break;
                            }
                        }
                    }

                    if (itemName && typeof itemName === 'string') {
                        itemName = itemName.trim();
                    }
                } else {
                    // Try to convert to string
                    itemName = String(item).trim();
                }

                // Only add if we have a valid, non-empty name that we haven't seen
                if (itemName && itemName.length > 0 && !seen.has(itemName.toLowerCase())) {
                    results.push(itemName);
                    seen.add(itemName.toLowerCase());
                }
            }

            console.log(`[toStringArray] Extracted ${results.length} items for ${fieldName}:`, results);
            return results;
        }

        // If it's an object, try to extract name field
        if (typeof data === 'object' && data !== null) {
            const name = data.name || data.title || data.skill;
            return name && typeof name === 'string' ? [name.trim()] : [];
        }

        return [];
    }

    // Convert to clean string arrays
    const skillsArray = toStringArray(resume.skills, 'skills');
    const certsArray = toStringArray(resume.certifications, 'certifications');
    const eduArray = toStringArray(resume.education, 'education');

    console.log('✅ Final arrays:');
    console.log('  Skills:', skillsArray);
    console.log('  Certifications:', certsArray);
    console.log('  Education:', eduArray);

    // Display resume information
    const resumeInfo = document.getElementById('resumeInfo');
    resumeInfo.innerHTML = `
        <p><strong>Candidate:</strong> ${escapeHtml(resume.candidate_name || 'Unknown')}</p>
        <p><strong>Experience:</strong> ${resume.years_experience || 0} years</p>
        ${eduArray.length > 0 ? `<p><strong>Education:</strong> ${eduArray.join(', ')}</p>` : ''}
        ${certsArray.length > 0 ? `<p><strong>Certifications:</strong> ${certsArray.slice(0, 3).join(', ')}${certsArray.length > 3 ? '...' : ''}</p>` : ''}
    `;

    // Display job information
    const jobInfo = document.getElementById('jobInfo');
    jobInfo.innerHTML = `
        <p><strong>Position:</strong> ${escapeHtml(job.title || 'N/A')}</p>
        <p><strong>Required Years:</strong> ${job.required_years || 0} years</p>
        <p><strong>Description:</strong> ${escapeHtml((job.description || '').substring(0, 200))}...</p>
    `;

    // Display technical details
    document.getElementById('embeddingMethod').textContent =
        embedding_method === 'openai' ? 'OpenAI API' : 'Stub (Hash-based)';

    // Setup delete button event listeners
    setupDeleteButtons();
}

// ============================================================================
// Delete Functionality
// ============================================================================

function setupDeleteButtons() {
    const deleteResumeBtn = document.getElementById('deleteResumeBtn');
    const deleteJobBtn = document.getElementById('deleteJobBtn');
    const resetBtn = document.getElementById('resetBtn');

    // Delete Resume button
    deleteResumeBtn.addEventListener('click', () => {
        if (confirm('⚠️ Are you sure you want to delete this resume?\n\nThis action cannot be undone.')) {
            deleteResume();
        }
    });

    // Delete Job button
    deleteJobBtn.addEventListener('click', () => {
        if (confirm('⚠️ Are you sure you want to delete this job?\n\nThis action cannot be undone.')) {
            deleteJob();
        }
    });

    // Reset button
    resetBtn.addEventListener('click', resetForm);
}

async function deleteResume() {
    if (!window.currentResumeId) {
        alert('❌ Resume ID not found');
        return;
    }

    const resumeId = window.currentResumeId;
    showStatus(resumeStatus, 'loading', '🗑️ Deleting resume...');

    try {
        const response = await fetch(`${API_BASE}/api/resume/${resumeId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showStatus(resumeStatus, 'success', `✅ Resume deleted successfully!`);
            console.log('✅ Resume deleted:', data.message);

            // Clear resume data
            resumeData = null;
            resumeId = null;
            window.currentResumeId = null;
            resumeFile.value = '';

            // Reset form after a short delay
            setTimeout(() => {
                resetForm();
                alert('✅ Resume deleted! Ready to upload a new one.');
            }, 1500);
        } else {
            showStatus(resumeStatus, 'error', `❌ Delete failed: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('❌ Delete error:', error);
        showStatus(resumeStatus, 'error', `❌ Error: ${error.message}`);
    }
}

async function deleteJob() {
    if (!window.currentJobId) {
        alert('❌ Job ID not found');
        return;
    }

    const jobIdToDelete = window.currentJobId;
    showStatus(jobStatus, 'loading', '🗑️ Deleting job...');

    try {
        const response = await fetch(`${API_BASE}/api/job/${jobIdToDelete}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showStatus(jobStatus, 'success', `✅ Job deleted successfully!`);
            console.log('✅ Job deleted:', data.message);

            // Clear job data
            jobData = null;
            jobId = null;
            window.currentJobId = null;
            jobTitle.value = '';
            jobDescription.value = '';
            jobYears.value = '';

            // Reset form after a short delay
            setTimeout(() => {
                resetForm();
                alert('✅ Job deleted! Ready to enter a new job.');
            }, 1500);
        } else {
            showStatus(jobStatus, 'error', `❌ Delete failed: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('❌ Delete error:', error);
        showStatus(jobStatus, 'error', `❌ Error: ${error.message}`);
    }
}

function resetForm() {
    // Hide results section
    resultsSection.style.display = 'none';

    // Clear all data
    resumeData = null;
    jobData = null;
    resumeId = null;
    jobId = null;
    window.currentResumeId = null;
    window.currentJobId = null;

    // Clear form inputs
    resumeFile.value = '';
    jobTitle.value = '';
    jobDescription.value = '';
    jobYears.value = '';

    // Clear status messages
    resumeStatus.innerHTML = '';
    jobStatus.innerHTML = '';
    errorMessage.style.display = 'none';

    // Clear upload area
    uploadArea.classList.remove('drag-over');

    // Reset upload area text
    uploadArea.innerHTML = `
        <input type="file" id="resumeFile" accept=".pdf,.txt,.doc,.docx" hidden>
        <div class="upload-placeholder">
            <p>📁 Click or drag resume file here</p>
            <small>PDF, TXT, or DOC files (max 10MB)</small>
        </div>
    `;

    // Re-attach file input event listener
    const newResumeFile = document.getElementById('resumeFile');
    newResumeFile.addEventListener('change', handleResumeUpload);

    // Disable analyze button
    analyzeBtn.disabled = true;

    // Show input section
    document.querySelector('.input-section').style.display = 'block';

    console.log('✅ Form reset and ready for new input');
}

// Helper function to escape HTML and prevent JSON display
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function updateScoreDisplay(type, score) {
    const scoreValue = Math.round(score * 100);
    const fillPercent = Math.round(score * 100);

    const scoreElement = document.getElementById(`${type}Score`);
    if (scoreElement) {
        scoreElement.textContent = scoreValue;
    }

    const fillElement = document.getElementById(`${type}Fill`);
    if (fillElement) {
        fillElement.style.width = `${fillPercent}%`;
    }
}

// ============================================================================
// Validation & UI Helpers
// ============================================================================

function validateInputs() {
    const hasResume = resumeId !== null;
    const hasJobTitle = jobTitle.value.trim().length > 0;
    const hasJobDesc = jobDescription.value.trim().length > 0;

    analyzeBtn.disabled = !(hasResume && hasJobTitle && hasJobDesc);
}

function showStatus(element, type, message) {
    element.className = `status-message ${type}`;
    element.textContent = message;
    element.style.display = 'block';
}

function showSpinner(show) {
    // Spinner removed from layout - using learning widget animation instead
    // if (loadingSpinner) loadingSpinner.style.display = show ? 'block' : 'none';
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function hideError() {
    errorMessage.style.display = 'none';
}

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check server health
        const response = await fetch(`${API_BASE}/api/health`);
        if (response.ok) {
            const health = await response.json();
            console.log('✅ Server connected:', health);
        }
    } catch (error) {
        console.warn('⚠️ Server connection failed:', error.message);
    }

    validateInputs();
});
