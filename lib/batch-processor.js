/**
 * BatchProcessor: Process multiple resumes/jobs in parallel with smart scheduling
 * Enables high-volume candidate batch processing with progress tracking
 */

export class BatchProcessor {
  constructor(coordinator, forkManager, maxConcurrent = 10) {
    this.coordinator = coordinator;
    this.forkManager = forkManager;
    this.maxConcurrent = maxConcurrent;
    this.queue = [];
    this.processing = false;
    this.completedBatches = new Map(); // Store completed batches for later retrieval
    this.stats = {
      totalProcessed: 0,
      totalFailed: 0,
      averageTime: 0,
      startTime: null
    };

    console.log(`[BatchProcessor] Initialized with max ${maxConcurrent} concurrent jobs`);
  }

  /**
   * Add batch job to queue
   */
  addBatchJob(batchId, resumeIds, jobIds) {
    // Validate inputs
    if (!Array.isArray(resumeIds) || !Array.isArray(jobIds)) {
      throw new Error('resumeIds and jobIds must be arrays');
    }
    if (resumeIds.length === 0 || jobIds.length === 0) {
      throw new Error('resumeIds and jobIds cannot be empty');
    }

    const job = {
      batchId,
      resumeIds,
      jobIds,
      pairs: resumeIds.flatMap(rId => jobIds.map(jId => ({ resumeId: rId, jobId: jId }))),
      status: 'queued',
      createdAt: new Date(),
      results: [],
      failed: [],
      startTime: null,
      completionTime: null,
      duration: null
    };

    console.log(`[BatchProcessor] Batch ${batchId} queued with ${job.pairs.length} pairs`);
    this.queue.push(job);
    this.processBatch(); // Start processing if not already running
    return job;
  }

  /**
   * Process batch with smart concurrency control
   */
  async processBatch() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const job = this.queue[0];
    job.status = 'processing';
    job.startTime = Date.now();

    console.log(`[Batch ${job.batchId}] Starting: ${job.pairs.length} pairs to process`);

    try {
      const results = [];
      const failed = [];

      // Process in chunks to respect maxConcurrent limit
      for (let i = 0; i < job.pairs.length; i += this.maxConcurrent) {
        const chunk = job.pairs.slice(i, i + this.maxConcurrent);
        const chunkStartTime = Date.now();

        try {
          const chunkResults = await Promise.allSettled(
            chunk.map(pair =>
              this.coordinator.scoreResume(pair.resumeId, pair.jobId)
                .catch(error => {
                  throw new Error(`Failed to score ${pair.resumeId} vs ${pair.jobId}: ${error.message}`);
                })
            )
          );

          for (let j = 0; j < chunkResults.length; j++) {
            const result = chunkResults[j];
            const pair = chunk[j];

            if (result.status === 'fulfilled') {
              results.push({
                ...pair,
                result: result.value,
                processedAt: new Date()
              });
            } else {
              failed.push({
                ...pair,
                error: result.reason?.message || 'Unknown error',
                failedAt: new Date()
              });
            }
          }

          // Report progress
          const processed = Math.min(i + this.maxConcurrent, job.pairs.length);
          const chunkDuration = Date.now() - chunkStartTime;
          console.log(`[Batch ${job.batchId}] Progress: ${processed}/${job.pairs.length} (chunk took ${chunkDuration}ms)`);

        } catch (chunkError) {
          console.error(`[Batch ${job.batchId}] Chunk error at position ${i}:`, chunkError.message);
          // Continue with next chunk even if one fails
        }
      }

      job.results = results;
      job.failed = failed;
      job.status = 'completed';
      job.completionTime = Date.now();
      job.duration = job.completionTime - job.startTime;

      // Update stats
      this.stats.totalProcessed += results.length;
      this.stats.totalFailed += failed.length;
      if (this.stats.totalProcessed > 0) {
        this.stats.averageTime =
          (this.stats.averageTime * (this.stats.totalProcessed - results.length) + job.duration) /
          this.stats.totalProcessed;
      }

      // Store completed batch
      this.completedBatches.set(job.batchId, job);

      console.log(`[Batch ${job.batchId}] ✅ Complete: ${results.length} succeeded, ${failed.length} failed (${job.duration}ms total)`);

    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      job.completionTime = Date.now();
      job.duration = job.completionTime - job.startTime;
      this.stats.totalFailed += job.pairs.length;

      // Store failed batch
      this.completedBatches.set(job.batchId, job);

      console.error(`[Batch ${job.batchId}] ❌ Error: ${error.message}`);
    }

    // Remove from queue and process next
    this.queue.shift();
    this.processing = false;

    if (this.queue.length > 0) {
      // Process next batch after a small delay to prevent CPU saturation
      setTimeout(() => this.processBatch(), 100);
    }
  }

  /**
   * Get batch status (from queue or completed)
   */
  getBatchStatus(batchId) {
    // Check active queue first
    const queuedJob = this.queue.find(j => j.batchId === batchId);
    if (queuedJob) return queuedJob;

    // Check completed batches
    const completedJob = this.completedBatches.get(batchId);
    if (completedJob) return completedJob;

    return null;
  }

  /**
   * Get batch results with pagination
   */
  getBatchResults(batchId, page = 1, pageSize = 100) {
    const batch = this.getBatchStatus(batchId);
    if (!batch) return null;

    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      batchId: batch.batchId,
      status: batch.status,
      totalPairs: batch.pairs.length,
      totalSucceeded: batch.results.length,
      totalFailed: batch.failed.length,
      results: batch.results.slice(start, end),
      failed: batch.failed.slice(start, end),
      pagination: {
        page,
        pageSize,
        totalPages: Math.ceil(batch.results.length / pageSize)
      },
      duration: batch.duration,
      createdAt: batch.createdAt,
      startTime: batch.startTime,
      completionTime: batch.completionTime
    };
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    const totalQueued = this.queue.length;
    const totalPairs = this.queue.reduce((sum, job) => sum + job.pairs.length, 0);

    return {
      totalBatches: totalQueued,
      totalPairs: totalPairs,
      currentlyProcessing: this.processing,
      stats: this.stats
    };
  }

  /**
   * Get all completed batches
   */
  getCompletedBatches(limit = 100) {
    return Array.from(this.completedBatches.values())
      .sort((a, b) => (b.completionTime || 0) - (a.completionTime || 0))
      .slice(0, limit)
      .map(batch => ({
        batchId: batch.batchId,
        status: batch.status,
        totalPairs: batch.pairs.length,
        succeeded: batch.results.length,
        failed: batch.failed.length,
        duration: batch.duration,
        completedAt: batch.completionTime
      }));
  }

  /**
   * Get batch statistics
   */
  getStatistics() {
    return {
      totalProcessed: this.stats.totalProcessed,
      totalFailed: this.stats.totalFailed,
      successRate: this.stats.totalProcessed + this.stats.totalFailed > 0
        ? (this.stats.totalProcessed / (this.stats.totalProcessed + this.stats.totalFailed) * 100).toFixed(2) + '%'
        : 'N/A',
      averageTimePerBatch: this.stats.averageTime ? Math.round(this.stats.averageTime) + 'ms' : 'N/A',
      completedBatches: this.completedBatches.size,
      queuedBatches: this.queue.length,
      currentlyProcessing: this.processing
    };
  }

  /**
   * Clear old completed batches to free memory
   */
  clearCompletedBatches(olderThanMinutes = 60) {
    const cutoff = Date.now() - (olderThanMinutes * 60 * 1000);
    let removed = 0;

    for (const [batchId, batch] of this.completedBatches.entries()) {
      if ((batch.completionTime || 0) < cutoff) {
        this.completedBatches.delete(batchId);
        removed++;
      }
    }

    console.log(`[BatchProcessor] Cleared ${removed} old batches from completed list`);
    return removed;
  }
}

export default BatchProcessor;
