const fs = require('fs').promises;
const path = require('path');
const Order = require('../models/Order');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const DEFAULT_DELAY_MS = 3600000; // 1 hour
const RETRY_INTERVAL_MS = 300000; // 5 minutes
const MAX_RETRIES = 3;

/**
 * Deletes a file from the filesystem with retry logic.
 * Handles missing files gracefully (ENOENT).
 * Retries up to 3 times on failure with 5-minute intervals.
 *
 * @param {string} filePath - Absolute path to the file to delete
 * @param {number} [attempt=1] - Current attempt number (internal use)
 * @returns {Promise<boolean>} true if file was deleted or already missing
 */
async function deleteFile(filePath, attempt = 1) {
  try {
    await fs.unlink(filePath);
    console.log(`[FileCleanup] Deleted file: ${filePath}`);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      // File already deleted - log and return success
      console.log(`[FileCleanup] File already deleted (not found): ${filePath}`);
      return true;
    }

    console.error(`[FileCleanup] Error deleting file (attempt ${attempt}/${MAX_RETRIES}): ${filePath}`, err.message);

    if (attempt < MAX_RETRIES) {
      // Schedule retry with 5-minute interval
      return new Promise((resolve) => {
        setTimeout(async () => {
          const result = await deleteFile(filePath, attempt + 1);
          resolve(result);
        }, RETRY_INTERVAL_MS);
      });
    }

    console.error(`[FileCleanup] Failed to delete file after ${MAX_RETRIES} attempts: ${filePath}`);
    return false;
  }
}

/**
 * Schedules file deletion after a specified delay (default 1 hour).
 * After successful deletion, updates the order record with fileDeletedAt timestamp.
 *
 * @param {object} order - The order document containing fileName
 * @param {number} [delayMs=3600000] - Delay in milliseconds before deletion (default: 1 hour)
 */
function scheduleFileDeletion(order, delayMs = DEFAULT_DELAY_MS) {
  if (!order || !order.fileName) {
    console.warn('[FileCleanup] Cannot schedule deletion: order or fileName missing');
    return;
  }

  const filePath = path.join(UPLOADS_DIR, order.fileName);
  const orderId = order._id;

  console.log(`[FileCleanup] Scheduling deletion of ${order.fileName} in ${delayMs}ms`);

  setTimeout(async () => {
    try {
      const success = await deleteFile(filePath);

      // Also delete from Cloudinary if it was uploaded there
      if (order.fileUrl && order.fileUrl.startsWith('http') && order.fileUrl.includes('cloudinary')) {
        try {
          const cloudinary = require('../config/cloudinary');
          const publicId = 'xerox-queue/' + path.basename(order.fileName, path.extname(order.fileName));
          await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
          console.log(`[FileCleanup] Deleted from Cloudinary: ${publicId}`);
        } catch (cloudErr) {
          console.error('[FileCleanup] Cloudinary deletion failed:', cloudErr.message);
        }
      }

      if (success) {
        // Update order record with fileDeletedAt timestamp
        try {
          await Order.findByIdAndUpdate(orderId, {
            fileDeletedAt: new Date()
          });
          console.log(`[FileCleanup] Updated fileDeletedAt for order ${orderId}`);
        } catch (dbErr) {
          console.error(`[FileCleanup] Failed to update fileDeletedAt for order ${orderId}:`, dbErr.message);
        }
      }
    } catch (err) {
      console.error(`[FileCleanup] Unexpected error during scheduled deletion:`, err.message);
    }
  }, delayMs);
}

/**
 * Scans the uploads directory for orphaned files on server startup.
 * Deletes files that have no matching active order and whose associated
 * order was completed or cancelled more than 1 hour ago.
 */
async function cleanupOrphanedFiles() {
  console.log('[FileCleanup] Starting orphaned file cleanup...');

  let files;
  try {
    files = await fs.readdir(UPLOADS_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('[FileCleanup] Uploads directory does not exist, skipping cleanup');
      return;
    }
    console.error('[FileCleanup] Error reading uploads directory:', err.message);
    return;
  }

  if (files.length === 0) {
    console.log('[FileCleanup] No files in uploads directory');
    return;
  }

  const oneHourAgo = new Date(Date.now() - DEFAULT_DELAY_MS);
  let deletedCount = 0;

  for (const fileName of files) {
    try {
      // Check if there's a matching order that is still active
      const activeOrder = await Order.findOne({
        fileName: fileName,
        status: { $in: ['waiting', 'processing', 'printing', 'ready'] }
      });

      if (activeOrder) {
        // File has an active order, skip it
        continue;
      }

      // Check if there's a completed/cancelled order older than 1 hour
      const completedOrder = await Order.findOne({
        fileName: fileName,
        status: { $in: ['completed', 'cancelled'] },
        $or: [
          { completedAt: { $lte: oneHourAgo } },
          { updatedAt: { $lte: oneHourAgo } },
          { createdAt: { $lte: oneHourAgo } }
        ]
      });

      if (completedOrder) {
        const filePath = path.join(UPLOADS_DIR, fileName);
        const success = await deleteFile(filePath);

        if (success) {
          // Update order record with fileDeletedAt if not already set
          if (!completedOrder.fileDeletedAt) {
            await Order.findByIdAndUpdate(completedOrder._id, {
              fileDeletedAt: new Date()
            });
          }
          deletedCount++;
        }
      } else {
        // File has no matching order at all - only delete if file is old (>1 hour)
        const anyOrder = await Order.findOne({ fileName: fileName });
        if (!anyOrder) {
          // Check file age before deleting
          const filePath = path.join(UPLOADS_DIR, fileName);
          try {
            const stat = await fs.stat(filePath);
            if (stat.mtime < oneHourAgo) {
              const success = await deleteFile(filePath);
              if (success) deletedCount++;
            }
          } catch(e) { /* file stat failed, skip */ }
        }
      }
    } catch (err) {
      console.error(`[FileCleanup] Error processing file ${fileName}:`, err.message);
    }
  }

  console.log(`[FileCleanup] Orphaned file cleanup complete. Deleted ${deletedCount} file(s).`);
}

module.exports = {
  scheduleFileDeletion,
  cleanupOrphanedFiles,
  deleteFile
};
