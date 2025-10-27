// Knowledge Base Manager
// Handles discovery, storage, and retrieval of learned items
// Automatically updates source_count for items seen multiple times

// ============================================================================
// DISCOVERY PHASE: Identify Unknown Items
// ============================================================================

/**
 * Check which items are new (not in knowledge_base)
 * Generic function for any item type
 */
export async function findNewItems(extractedItems, database, itemType = 'skill') {
  if (!extractedItems || extractedItems.length === 0 || !database) {
    console.log(`[KnowledgeBase] No ${itemType}s or database connection`);
    return [];
  }

  try {
    const newItems = [];
    console.log(`[KnowledgeBase] Checking ${extractedItems.length} extracted ${itemType}s for unknown items`);

    for (const item of extractedItems) {
      const itemName = typeof item === 'string' ? item : (item.name || item);
      if (!itemName || typeof itemName !== 'string') {
        console.warn(`[KnowledgeBase] Skipping invalid ${itemType}:`, item);
        continue;
      }

      try {
        // Check if item exists in knowledge_base
        const result = await database.query(
          'SELECT id FROM knowledge_base WHERE LOWER(item_name) = LOWER($1) AND item_type = $2',
          [itemName, itemType]
        );

        if (result.rows.length === 0) {
          // Item is new!
          console.log(`[KnowledgeBase] Found new ${itemType}: ${itemName}`);
          newItems.push({
            name: itemName,
            type: itemType,
            confidence: (typeof item === 'object' && item.confidence) ? item.confidence : 0.75,
            issuer: (typeof item === 'object' && item.issuer) ? item.issuer : null,
            category: (typeof item === 'object' && item.category) ? item.category : null
          });
        }
      } catch (queryError) {
        console.error(`[KnowledgeBase] Error checking ${itemType} "${itemName}":`, queryError.message);
      }
    }

    console.log(`[KnowledgeBase] Found ${newItems.length} new ${itemType} items to learn`);
    return newItems;
  } catch (error) {
    console.error('[KnowledgeBase] Error finding new items:', error.message);
    return [];
  }
}

/**
 * Find new skills specifically
 */
export async function findNewSkills(extractedSkills, database) {
  return findNewItems(extractedSkills, database, 'skill');
}

/**
 * Find new certifications specifically
 */
export async function findNewCertifications(extractedCerts, database) {
  return findNewItems(extractedCerts, database, 'certification');
}

/**
 * Find new education entries specifically
 */
export async function findNewEducation(extractedEducation, database) {
  return findNewItems(extractedEducation, database, 'education');
}

// ============================================================================
// STORAGE PHASE: Save to Knowledge Base
// ============================================================================

/**
 * Store new items to knowledge_base table
 * Returns count of items stored
 */
export async function storeNewItems(newItems, database, resumeId) {
  if (newItems.length === 0 || !database) {
    console.log('[KnowledgeBase] No items to store or no database connection');
    return 0;
  }

  try {
    let storedCount = 0;
    console.log(`[KnowledgeBase] Storing ${newItems.length} new items to knowledge base`);

    for (const item of newItems) {
      try {
        console.log(`[KnowledgeBase] Storing item: ${item.name} (${item.type})`);
        // Use function to add or increment
        const result = await database.query(
          'SELECT add_to_knowledge_base($1, $2, $3)',
          [item.name, item.type, item.confidence || 0.75]
        );
        console.log(`[KnowledgeBase] Successfully stored: ${item.name}`);
        storedCount++;
      } catch (error) {
        // Continue even if one fails
        console.error(`[KnowledgeBase] Failed to store "${item.name}":`, error.message);
      }
    }

    console.log(`[KnowledgeBase] Stored ${storedCount} items total`);

    // Log the discovery event
    if (storedCount > 0) {
      await logDiscoveryEvent(
        resumeId,
        newItems.map(i => i.name),
        storedCount,
        database
      );
    }

    return storedCount;
  } catch (error) {
    console.error('[KnowledgeBase] Error storing new items:', error.message);
    return 0;
  }
}

/**
 * Log discovery event for audit trail
 */
async function logDiscoveryEvent(resumeId, itemNames, count, database) {
  try {
    await database.query(
      'INSERT INTO discovery_audit_log (resume_id, discovered_items, discovery_count) VALUES ($1, $2, $3)',
      [resumeId, JSON.stringify(itemNames), count]
    );
  } catch (error) {
    // Don't fail on logging error
    console.warn('[KnowledgeBase] Logging failed:', error.message);
  }
}

// ============================================================================
// RETRIEVAL PHASE: Get All Known Items
// ============================================================================

/**
 * Get all items from knowledge_base
 * Used to supplement skill list for scoring
 */
export async function getKnowledgeBaseItems(database, itemType = 'skill') {
  if (!database) {
    console.log('[KnowledgeBase] No database connection for retrieval');
    return [];
  }

  try {
    console.log(`[KnowledgeBase] Retrieving ${itemType} items from knowledge base`);
    const result = await database.query(
      `SELECT item_name, item_type, source_count, confidence_estimate
       FROM knowledge_base
       WHERE item_type = $1
       ORDER BY source_count DESC`,
      [itemType]
    );

    const items = (result.rows || []).map(row => ({
      name: row.item_name,
      confidence: Math.min(row.confidence_estimate || 0.75, 0.95),
      source: 'knowledge_base',
      source_count: row.source_count
    }));

    console.log(`[KnowledgeBase] Retrieved ${items.length} ${itemType} items from knowledge base`);
    return items;
  } catch (error) {
    console.error('[KnowledgeBase] Error retrieving items:', error.message);
    return [];
  }
}

/**
 * Get all learned items (all types)
 */
export async function getAllKnowledgeItems(database) {
  if (!database) return [];

  try {
    const result = await database.query(
      `SELECT item_name, item_type, source_count, confidence_estimate
       FROM knowledge_base
       ORDER BY source_count DESC`
    );

    return result.rows || [];
  } catch (error) {
    console.error('[KnowledgeBase] Error retrieving all items:', error.message);
    return [];
  }
}

// ============================================================================
// MAIN ORCHESTRATION: Learn From Resume
// ============================================================================

/**
 * Main function: Discover new items, store them, return for scoring
 */
export async function learnFromResume(extractedSkills, resumeId, database) {
  if (!database || !extractedSkills) {
    return {
      newItems: [],
      learningCount: 0,
      success: false
    };
  }

  try {
    // Phase 1: Find what's new
    const newItems = await findNewItems(extractedSkills, database);

    if (newItems.length === 0) {
      return {
        newItems: [],
        learningCount: 0,
        success: true
      };
    }

    // Phase 2: Store new items
    const storedCount = await storeNewItems(newItems, database, resumeId);

    return {
      newItems: newItems.map(i => i.name),
      learningCount: storedCount,
      success: true
    };
  } catch (error) {
    console.error('[KnowledgeBase] Error in learnFromResume:', error.message);
    return {
      newItems: [],
      learningCount: 0,
      success: false
    };
  }
}

/**
 * Learn from certifications found in a resume
 */
export async function learnFromCertifications(extractedCerts, resumeId, database) {
  if (!database || !extractedCerts) {
    return {
      newItems: [],
      learningCount: 0,
      success: false
    };
  }

  try {
    // Find new certifications
    const newItems = await findNewCertifications(extractedCerts, database);

    if (newItems.length === 0) {
      return {
        newItems: [],
        learningCount: 0,
        success: true
      };
    }

    // Store new certifications
    const storedCount = await storeNewItems(newItems, database, resumeId);

    return {
      newItems: newItems.map(i => i.name),
      learningCount: storedCount,
      success: true
    };
  } catch (error) {
    console.error('[KnowledgeBase] Error in learnFromCertifications:', error.message);
    return {
      newItems: [],
      learningCount: 0,
      success: false
    };
  }
}

/**
 * Learn from education entries found in a resume
 */
export async function learnFromEducation(extractedEducation, resumeId, database) {
  if (!database || !extractedEducation) {
    return {
      newItems: [],
      learningCount: 0,
      success: false
    };
  }

  try {
    // Find new education entries
    const newItems = await findNewEducation(extractedEducation, database);

    if (newItems.length === 0) {
      return {
        newItems: [],
        learningCount: 0,
        success: true
      };
    }

    // Store new education entries
    const storedCount = await storeNewItems(newItems, database, resumeId);

    return {
      newItems: newItems.map(i => i.name),
      learningCount: storedCount,
      success: true
    };
  } catch (error) {
    console.error('[KnowledgeBase] Error in learnFromEducation:', error.message);
    return {
      newItems: [],
      learningCount: 0,
      success: false
    };
  }
}

/**
 * Comprehensive learning: Process skills, certifications, and education from resume
 */
export async function learnComprehensiveFromResume(resume, resumeId, database) {
  if (!database) {
    return {
      skills: { count: 0, items: [] },
      certifications: { count: 0, items: [] },
      education: { count: 0, items: [] },
      totalLearned: 0,
      success: false
    };
  }

  try {
    // Learn from all dimensions in parallel
    const [skillsResult, certsResult, eduResult] = await Promise.all([
      learnFromResume(resume.skills || [], resumeId, database),
      learnFromCertifications(resume.certifications || [], resumeId, database),
      learnFromEducation(resume.education || [], resumeId, database)
    ]);

    const totalLearned = skillsResult.learningCount + certsResult.learningCount + eduResult.learningCount;

    return {
      skills: { count: skillsResult.learningCount, items: skillsResult.newItems },
      certifications: { count: certsResult.learningCount, items: certsResult.newItems },
      education: { count: eduResult.learningCount, items: eduResult.newItems },
      totalLearned,
      success: true
    };
  } catch (error) {
    console.error('[KnowledgeBase] Error in comprehensive learning:', error.message);
    return {
      skills: { count: 0, items: [] },
      certifications: { count: 0, items: [] },
      education: { count: 0, items: [] },
      totalLearned: 0,
      success: false
    };
  }
}

// ============================================================================
// ANALYTICS & MONITORING
// ============================================================================

/**
 * Get comprehensive statistics about knowledge base
 */
export async function getKnowledgeStats(database) {
  if (!database) return null;

  try {
    const result = await database.query(
      `SELECT
        (SELECT COUNT(*) FROM knowledge_base kb1) as total_items,
        (SELECT COUNT(*) FROM knowledge_base kb2 WHERE kb2.item_type = 'skill') as total_skills,
        (SELECT COUNT(*) FROM knowledge_base kb3 WHERE kb3.item_type = 'certification') as total_certifications,
        (SELECT COUNT(*) FROM knowledge_base kb4 WHERE kb4.item_type = 'education') as total_education,
        (SELECT COUNT(DISTINCT kb5.item_type) FROM knowledge_base kb5) as item_types,
        (SELECT AVG(kb6.source_count) FROM knowledge_base kb6) as avg_mentions,
        (SELECT MAX(kb7.source_count) FROM knowledge_base kb7) as max_mentions,
        (SELECT COUNT(*) FROM knowledge_base kb8 WHERE kb8.source_count > 5) as popular_items,
        (SELECT AVG(kb9.source_count) FROM knowledge_base kb9 WHERE kb9.item_type = 'skill') as avg_skill_mentions,
        (SELECT AVG(kb10.source_count) FROM knowledge_base kb10 WHERE kb10.item_type = 'certification') as avg_cert_mentions,
        (SELECT AVG(kb11.source_count) FROM knowledge_base kb11 WHERE kb11.item_type = 'education') as avg_edu_mentions`
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error('[KnowledgeBase] Error getting stats:', error.message);
    return null;
  }
}

/**
 * Get statistics for a specific item type
 */
export async function getStatsByType(database, itemType) {
  if (!database) return null;

  try {
    const result = await database.query(
      `SELECT
        COUNT(*) as total_items,
        AVG(source_count) as avg_mentions,
        MAX(source_count) as max_mentions,
        MIN(source_count) as min_mentions,
        COUNT(*) FILTER (WHERE source_count > 5) as popular_items,
        COUNT(*) FILTER (WHERE confidence_estimate >= 0.8) as high_confidence_items
       FROM knowledge_base
       WHERE item_type = $1`,
      [itemType]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error(`[KnowledgeBase] Error getting ${itemType} stats:`, error.message);
    return null;
  }
}

/**
 * Get most frequently discovered items (all types)
 */
export async function getTopDiscoveries(database, limit = 20) {
  if (!database) return [];

  try {
    const result = await database.query(
      `SELECT item_name, item_type, source_count, confidence_estimate
       FROM knowledge_base
       ORDER BY source_count DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows || [];
  } catch (error) {
    console.error('[KnowledgeBase] Error getting top discoveries:', error.message);
    return [];
  }
}

/**
 * Get trending skills
 */
export async function getTrendingSkills(database, limit = 15) {
  if (!database) return [];

  try {
    const result = await database.query(
      `SELECT item_name, source_count, confidence_estimate
       FROM knowledge_base
       WHERE item_type = 'skill'
       ORDER BY source_count DESC, confidence_estimate DESC
       LIMIT $1`,
      [limit]
    );

    return (result.rows || []).map(row => ({
      name: row.item_name,
      mentions: row.source_count,
      confidence: row.confidence_estimate
    }));
  } catch (error) {
    console.error('[KnowledgeBase] Error getting trending skills:', error.message);
    return [];
  }
}

/**
 * Get trending certifications
 */
export async function getTrendingCertifications(database, limit = 15) {
  if (!database) return [];

  try {
    const result = await database.query(
      `SELECT item_name, source_count, confidence_estimate
       FROM knowledge_base
       WHERE item_type = 'certification'
       ORDER BY source_count DESC, confidence_estimate DESC
       LIMIT $1`,
      [limit]
    );

    return (result.rows || []).map(row => ({
      name: row.item_name,
      mentions: row.source_count,
      confidence: row.confidence_estimate
    }));
  } catch (error) {
    console.error('[KnowledgeBase] Error getting trending certifications:', error.message);
    return [];
  }
}

/**
 * Get trending education entries
 */
export async function getTrendingEducation(database, limit = 15) {
  if (!database) return [];

  try {
    const result = await database.query(
      `SELECT item_name, source_count, confidence_estimate
       FROM knowledge_base
       WHERE item_type = 'education'
       ORDER BY source_count DESC, confidence_estimate DESC
       LIMIT $1`,
      [limit]
    );

    return (result.rows || []).map(row => ({
      name: row.item_name,
      mentions: row.source_count,
      confidence: row.confidence_estimate
    }));
  } catch (error) {
    console.error('[KnowledgeBase] Error getting trending education:', error.message);
    return [];
  }
}

/**
 * Check if item exists in knowledge base
 */
export async function itemExists(itemName, database) {
  if (!database) return false;

  try {
    const result = await database.query(
      'SELECT id FROM knowledge_base WHERE LOWER(item_name) = LOWER($1)',
      [itemName]
    );

    return result.rows.length > 0;
  } catch (error) {
    console.error('[KnowledgeBase] Error checking item:', error.message);
    return false;
  }
}

export default {
  // Discovery & Storage
  findNewItems,
  findNewSkills,
  findNewCertifications,
  findNewEducation,
  storeNewItems,

  // Learning Functions
  learnFromResume,
  learnFromCertifications,
  learnFromEducation,
  learnComprehensiveFromResume,

  // Retrieval
  getKnowledgeBaseItems,
  getAllKnowledgeItems,
  itemExists,

  // Analytics
  getKnowledgeStats,
  getStatsByType,
  getTopDiscoveries,
  getTrendingSkills,
  getTrendingCertifications,
  getTrendingEducation
};
