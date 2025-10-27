// Knowledge Base Manager
// Handles discovery, storage, and retrieval of learned items
// Automatically updates source_count for items seen multiple times

// ============================================================================
// DISCOVERY PHASE: Identify Unknown Items
// ============================================================================

/**
 * Check which items are new (not in knowledge_base)
 */
export async function findNewItems(extractedSkills, database) {
  if (!extractedSkills || extractedSkills.length === 0 || !database) {
    console.log('[KnowledgeBase] No skills or database connection');
    return [];
  }

  try {
    const newItems = [];
    console.log(`[KnowledgeBase] Checking ${extractedSkills.length} extracted skills for unknown items`);

    for (const skill of extractedSkills) {
      const skillName = typeof skill === 'string' ? skill : (skill.name || skill);
      if (!skillName || typeof skillName !== 'string') {
        console.warn(`[KnowledgeBase] Skipping invalid skill:`, skill);
        continue;
      }

      try {
        // Check if item exists in knowledge_base
        const result = await database.query(
          'SELECT id FROM knowledge_base WHERE LOWER(item_name) = LOWER($1)',
          [skillName]
        );

        if (result.rows.length === 0) {
          // Item is new!
          console.log(`[KnowledgeBase] Found new item: ${skillName}`);
          newItems.push({
            name: skillName,
            type: 'skill',
            confidence: (typeof skill === 'object' && skill.confidence) ? skill.confidence : 0.75
          });
        }
      } catch (queryError) {
        console.error(`[KnowledgeBase] Error checking skill "${skillName}":`, queryError.message);
      }
    }

    console.log(`[KnowledgeBase] Found ${newItems.length} new items to learn`);
    return newItems;
  } catch (error) {
    console.error('[KnowledgeBase] Error finding new items:', error.message);
    return [];
  }
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

// ============================================================================
// ANALYTICS & MONITORING
// ============================================================================

/**
 * Get statistics about knowledge base
 */
export async function getKnowledgeStats(database) {
  if (!database) return null;

  try {
    const result = await database.query(
      `SELECT
        (SELECT COUNT(*) FROM knowledge_base kb1) as total_items,
        (SELECT COUNT(DISTINCT kb2.item_type) FROM knowledge_base kb2) as item_types,
        (SELECT AVG(kb3.source_count) FROM knowledge_base kb3) as avg_mentions,
        (SELECT MAX(kb4.source_count) FROM knowledge_base kb4) as max_mentions,
        (SELECT COUNT(*) FROM knowledge_base kb5 WHERE kb5.source_count > 5) as popular_items`
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error('[KnowledgeBase] Error getting stats:', error.message);
    return null;
  }
}

/**
 * Get most frequently discovered items
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
  learnFromResume,
  findNewItems,
  storeNewItems,
  getKnowledgeBaseItems,
  getAllKnowledgeItems,
  getKnowledgeStats,
  getTopDiscoveries,
  itemExists
};
