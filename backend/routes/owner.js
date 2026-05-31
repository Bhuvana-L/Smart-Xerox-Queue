const express = require('express');
const Order = require('../models/Order');
const { protect, ownerOnly } = require('../middleware/auth');
const { updateOrderStatus, VALID_TRANSITIONS } = require('../services/statusManager');

const router = express.Router();

router.use(protect, ownerOnly);

router.get('/queue', async (req, res) => {
  try {
    const orders = await Order.find({
      status: { $in: ['waiting', 'processing', 'printing', 'ready'] }
    }).sort({ createdAt: 1 }).populate('student', 'name email usn phone');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/history', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const orders = await Order.find({ status: { $in: ['completed', 'cancelled'] } })
      .sort({ completedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('student', 'name usn');
    const total = await Order.countDocuments({ status: { $in: ['completed', 'cancelled'] } });
    res.json({ orders, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/status/:orderId', async (req, res) => {
  try {
    const { status, note } = req.body;
    const io = req.app.get('io');

    const updatedOrder = await updateOrderStatus(req.params.orderId, status, note, io);

    res.json({ message: 'Status updated', order: updatedOrder });
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({ error: err.message, currentState: err.currentState });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({ error: err.message, validTransitions: err.validTransitions });
    }
    if (err.statusCode === 404) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ message: err.message });
  }
});

router.put('/payment/:orderId', async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.orderId, { paymentStatus }, { new: true }
    );
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayOrders, totalRevenue, colorVsBw, peakHours] = await Promise.all([
      Order.find({ createdAt: { $gte: today } }),
      Order.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$cost.total' } } }
      ]),
      Order.aggregate([
        { $group: { _id: '$printSettings.colorType', count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ])
    ]);

    res.json({
      todayCount: todayOrders.length,
      todayRevenue: todayOrders.reduce((sum, o) => sum + o.cost.total, 0),
      totalRevenue: totalRevenue[0]?.total || 0,
      pendingPayments: await Order.countDocuments({ paymentStatus: 'unpaid' }),
      colorVsBw,
      peakHours
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PRINT order - send to printer
router.post('/print/:orderId', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    
    const { printService } = require('../services/printService');
    const { printerName, colorPrinterName } = req.body;
    
    const result = await printService.printOrder(order, { printerName, colorPrinterName });
    
    if (result.success) {
      // Auto-update status to 'printing'
      const io = req.app.get('io');
      const { updateOrderStatus } = require('../services/statusManager');
      try {
        await updateOrderStatus(order._id, 'printing', 'Sent to printer', io);
      } catch(e) { /* status might already be printing */ }
      
      res.json({ message: result.message, success: true });
    } else {
      res.status(500).json({ message: result.message, success: false });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET available printers
router.get('/printers', async (req, res) => {
  try {
    const { getAvailablePrinters } = require('../services/printService');
    const printers = await getAvailablePrinters();
    res.json(printers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE order (owner can delete any order)
router.delete('/order/:orderId', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    
    // Delete the uploaded file
    const path = require('path');
    const fs = require('fs').promises;
    if (order.fileName) {
      const filePath = require('path').join(__dirname, '../uploads', order.fileName);
      try { await fs.unlink(filePath); } catch(e) { /* file may not exist */ }
    }
    
    await Order.findByIdAndDelete(req.params.orderId);
    
    // Recalculate queue positions
    const queueManager = require('../services/queueManager');
    await queueManager.recalculatePositions();
    
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
