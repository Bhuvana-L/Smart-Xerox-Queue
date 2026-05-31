const Order = require('../models/Order');
const queueManager = require('./queueManager');

// Gracefully handle fileCleanup not yet existing
let fileCleanup;
try {
  fileCleanup = require('./fileCleanup');
} catch (err) {
  fileCleanup = null;
}

// Gracefully handle notificationService not yet existing
let notificationService;
try {
  notificationService = require('./notificationService');
} catch (err) {
  notificationService = null;
}

/**
 * Valid state transitions for the order status machine.
 * Each key maps to an array of allowed target statuses.
 */
const VALID_TRANSITIONS = {
  waiting: ['processing', 'cancelled'],
  processing: ['printing', 'cancelled'],
  printing: ['ready', 'processing', 'cancelled'],
  ready: ['completed', 'processing', 'cancelled'],
  completed: [],
  cancelled: []
};

/**
 * Updates an order's status, enforcing valid state transitions and
 * optimistic concurrency control via Mongoose document versioning (__v).
 *
 * @param {string} orderId - The ID of the order to update
 * @param {string} newStatus - The target status
 * @param {string} [note] - Optional note (max 500 chars) to attach to the status history entry
 * @param {object} [io] - Socket.IO server instance for real-time notifications
 * @returns {Promise<object>} The updated order document
 * @throws {object} Error object with statusCode and message/data properties
 */
async function updateOrderStatus(orderId, newStatus, note, io) {
  // Find the order by ID
  const order = await Order.findById(orderId);

  if (!order) {
    const error = new Error('Order not found');
    error.statusCode = 404;
    throw error;
  }

  // Validate the transition
  const allowed = VALID_TRANSITIONS[order.status];
  if (!allowed || !allowed.includes(newStatus)) {
    const error = new Error(
      `Invalid transition from '${order.status}' to '${newStatus}'. Valid transitions: [${(allowed || []).join(', ')}]`
    );
    error.statusCode = 400;
    error.validTransitions = allowed || [];
    throw error;
  }

  // Truncate note to 500 characters
  const sanitizedNote = note ? String(note).slice(0, 500) : '';

  // Record the version before modification for optimistic concurrency
  const expectedVersion = order.__v;

  // Apply changes to the order document
  order.status = newStatus;
  order.statusHistory.push({
    status: newStatus,
    timestamp: new Date(),
    note: sanitizedNote
  });

  if (newStatus === 'completed') {
    order.completedAt = new Date();
  }

  // Use optimistic concurrency control: increment __v on save
  // If another process modified the document, the version won't match
  try {
    // Use findOneAndUpdate with version check for atomic update
    const updatedOrder = await Order.findOneAndUpdate(
      { _id: orderId, __v: expectedVersion },
      {
        $set: {
          status: order.status,
          ...(newStatus === 'completed' ? { completedAt: order.completedAt } : {})
        },
        $push: {
          statusHistory: {
            status: newStatus,
            timestamp: new Date(),
            note: sanitizedNote
          }
        },
        $inc: { __v: 1 }
      },
      { new: true }
    );

    if (!updatedOrder) {
      // Version mismatch - another process modified the document
      const currentOrder = await Order.findById(orderId);
      const error = new Error('Conflict: order was modified by another process');
      error.statusCode = 409;
      error.currentState = currentOrder;
      throw error;
    }

    // Trigger file deletion scheduling on 'completed' or 'cancelled'
    if (newStatus === 'completed' || newStatus === 'cancelled') {
      if (fileCleanup && typeof fileCleanup.scheduleFileDeletion === 'function') {
        try {
          // File stays for 1 hour (default) for reprinting, then auto-deletes
          fileCleanup.scheduleFileDeletion(updatedOrder);
        } catch (cleanupErr) {
          // Log but don't fail the status update
          console.error('File cleanup scheduling failed:', cleanupErr.message);
        }
      }
    }

    // Trigger queue recalculation when order leaves active queue
    if (newStatus === 'completed' || newStatus === 'cancelled') {
      try {
        const updates = await queueManager.recalculatePositions();

        // Notify queue updates via Socket.IO
        if (io && notificationService && typeof notificationService.notifyQueueUpdate === 'function') {
          notificationService.notifyQueueUpdate(io, updates);
        }
      } catch (queueErr) {
        console.error('Queue recalculation failed:', queueErr.message);
      }
    }

    // Notify status change via Socket.IO
    if (io && notificationService) {
      if (typeof notificationService.notifyStatusChange === 'function') {
        notificationService.notifyStatusChange(io, updatedOrder, newStatus);
      }
      if (typeof notificationService.notifyOrderUpdated === 'function') {
        notificationService.notifyOrderUpdated(io, updatedOrder);
      }
    }

    return updatedOrder;
  } catch (err) {
    // Re-throw our custom errors
    if (err.statusCode) {
      throw err;
    }
    // Handle unexpected errors
    throw err;
  }
}

module.exports = {
  VALID_TRANSITIONS,
  updateOrderStatus
};
