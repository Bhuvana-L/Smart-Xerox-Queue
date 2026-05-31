const Order = require('../models/Order');

const AVG_MINUTES_PER_ORDER = 5;
const ACTIVE_STATUSES = ['waiting', 'processing', 'printing'];

/**
 * Assigns a queue position and estimated time to a newly created order.
 * Position = count of existing active orders (excluding this one) + 1
 * Estimated time = position * 5 minutes
 *
 * @param {string} orderId - The ID of the order to enqueue
 * @returns {Promise<{ queuePosition: number, estimatedTime: number }>}
 */
async function enqueue(orderId) {
  const activeCount = await Order.countDocuments({
    status: { $in: ACTIVE_STATUSES },
    _id: { $ne: orderId }
  });

  const queuePosition = activeCount + 1;
  const estimatedTime = queuePosition * AVG_MINUTES_PER_ORDER;

  await Order.findByIdAndUpdate(orderId, { queuePosition, estimatedTime });

  return { queuePosition, estimatedTime };
}

/**
 * Recalculates queue positions for all active orders in FIFO order (createdAt ascending).
 * Assigns sequential positions starting from 1 with no gaps.
 * Uses bulkWrite for efficient batch updates.
 *
 * @returns {Promise<Array<{ token: string, position: number, estimatedTime: number }>>}
 */
async function recalculatePositions() {
  const activeOrders = await Order.find({
    status: { $in: ACTIVE_STATUSES }
  }).sort({ createdAt: 1 });

  if (activeOrders.length === 0) {
    return [];
  }

  const bulkOps = activeOrders.map((order, index) => ({
    updateOne: {
      filter: { _id: order._id },
      update: {
        queuePosition: index + 1,
        estimatedTime: (index + 1) * AVG_MINUTES_PER_ORDER
      }
    }
  }));

  await Order.bulkWrite(bulkOps);

  return activeOrders.map((order, index) => ({
    token: order.token,
    position: index + 1,
    estimatedTime: (index + 1) * AVG_MINUTES_PER_ORDER
  }));
}

/**
 * Returns the current queue status including active order count and estimated wait time.
 *
 * @returns {Promise<{ activeCount: number, estimatedWait: number }>}
 */
async function getQueueStatus() {
  const activeCount = await Order.countDocuments({
    status: { $in: ACTIVE_STATUSES }
  });

  const estimatedWait = activeCount * AVG_MINUTES_PER_ORDER;

  return { activeCount, estimatedWait };
}

module.exports = {
  enqueue,
  recalculatePositions,
  getQueueStatus,
  AVG_MINUTES_PER_ORDER,
  ACTIVE_STATUSES
};
