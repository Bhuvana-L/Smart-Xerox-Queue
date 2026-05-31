/**
 * Notification Service
 * Manages Socket.IO event emission for order lifecycle events.
 */

/**
 * Notify owner room of a new order
 * @param {import('socket.io').Server} io - Socket.IO server instance
 * @param {Object} order - The newly created order document
 */
function notifyNewOrder(io, order) {
  io.to('owner-room').emit('new-order', {
    token: order.token,
    studentName: order.studentName,
    totalPages: order.printSettings.totalPages,
    cost: order.cost.total,
    status: order.status
  });
}

/**
 * Notify student of a status change and owner room of the update
 * @param {import('socket.io').Server} io - Socket.IO server instance
 * @param {Object} order - The order document
 * @param {string} newStatus - The new status value
 */
function notifyStatusChange(io, order, newStatus) {
  // Emit status-update to the order-specific room
  io.to(`order-${order.token}`).emit('status-update', {
    token: order.token,
    status: newStatus,
    estimatedTime: order.estimatedTime
  });

  // Emit order-updated to owner-room on any status change
  io.to('owner-room').emit('order-updated', {
    orderId: order._id,
    status: newStatus,
    token: order.token
  });
}

/**
 * Notify all affected students of queue position updates
 * @param {import('socket.io').Server} io - Socket.IO server instance
 * @param {Array<{token: string, position: number, estimatedTime: number}>} updates - Array of queue updates
 */
function notifyQueueUpdate(io, updates) {
  for (const update of updates) {
    io.to(`order-${update.token}`).emit('queue-update', {
      position: update.position,
      estimatedTime: update.estimatedTime
    });
  }
}

/**
 * Notify owner room of an order update (any status change)
 * @param {import('socket.io').Server} io - Socket.IO server instance
 * @param {Object} order - The order document
 */
function notifyOrderUpdated(io, order) {
  io.to('owner-room').emit('order-updated', {
    orderId: order._id,
    status: order.status,
    token: order.token
  });
}

module.exports = {
  notifyNewOrder,
  notifyStatusChange,
  notifyQueueUpdate,
  notifyOrderUpdated
};
