/**
 * Failure Logger Service - Track sync failures in database
 *
 * Persists sync operation failures for review and debugging.
 * Supports bulk_scan, bulk_sync_plex, and bulk_sync_files operations.
 */

import pkg from "@prisma/client";
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

/**
 * Log a sync failure to the database
 *
 * @param {string} albumId - Album ID that failed
 * @param {string} operation - Operation type: "bulk_scan" | "bulk_sync_plex" | "bulk_sync_files"
 * @param {Error|string} error - Error object or message
 * @param {Object} details - Additional context (file path, API response, etc.)
 * @returns {Promise<Object>} Created failure record
 */
export async function logSyncFailure(albumId, operation, error, details = null) {
  try {
    return await prisma.syncFailure.create({
      data: {
        albumId,
        operation,
        error: error.message || String(error),
        details: details ? JSON.stringify(details) : null,
      },
    });
  } catch (dbError) {
    // Don't let logging failure break the main operation
    console.error("Failed to log sync failure to database:", dbError.message);
    return null;
  }
}

/**
 * Get recent sync failures
 *
 * @param {string|null} operation - Filter by operation type, or null for all
 * @param {number} limit - Maximum number of failures to return
 * @returns {Promise<Array>} Array of failure records with album info
 */
export async function getRecentFailures(operation = null, limit = 50) {
  return prisma.syncFailure.findMany({
    where: operation ? { operation } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      album: {
        select: {
          title: true,
          artist: true,
          filePath: true,
          plexRatingKey: true,
        },
      },
    },
  });
}

/**
 * Get failure count by operation type
 *
 * @returns {Promise<Object>} Counts by operation type
 */
export async function getFailureCounts() {
  const counts = await prisma.syncFailure.groupBy({
    by: ["operation"],
    _count: { id: true },
  });

  return counts.reduce((acc, item) => {
    acc[item.operation] = item._count.id;
    return acc;
  }, {});
}

/**
 * Clear sync failures
 *
 * @param {string|null} operation - Operation type to clear, or null for all
 * @returns {Promise<Object>} Delete result with count
 */
export async function clearFailures(operation = null) {
  return prisma.syncFailure.deleteMany({
    where: operation ? { operation } : {},
  });
}

/**
 * Get failure by ID
 *
 * @param {number} id - Failure record ID
 * @returns {Promise<Object|null>} Failure record or null
 */
export async function getFailureById(id) {
  return prisma.syncFailure.findUnique({
    where: { id },
    include: {
      album: {
        select: {
          title: true,
          artist: true,
          filePath: true,
          plexRatingKey: true,
        },
      },
    },
  });
}
