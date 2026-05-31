const express = require('express');
const Order = require('../models/Order');
const { protect } = require('../middleware/auth');
const validateOrder = require('../middleware/validateOrder');
const { calculateCost, buildPageMap, detectConflicts } = require('../controllers/costController');
const queueManager = require('../services/queueManager');
const notificationService = require('../services/notificationService');

const router = express.Router();

router.post('/', protect, validateOrder, async (req, res) => {
  try {
    const { fileName, originalName, fileUrl, fileType, printSettings, paymentMethod, pdfUrl } = req.body;
    if (!fileName || !fileUrl || !printSettings)
      return res.status(400).json({ message: 'Missing required fields' });

    const cost = calculateCost(printSettings);

    const order = await Order.create({
      student: req.user._id,
      studentName: req.user.name,
      studentUSN: req.user.usn || '',
      fileName,
      originalName,
      fileUrl,
      pdfUrl: pdfUrl || fileUrl,
      fileType: fileType || 'PDF',
      printSettings,
      cost,
      paymentMethod: paymentMethod || 'counter',
      paymentStatus: paymentMethod === 'counter' ? 'unpaid' : 'pending',
      smartHeader: `${req.user.name} | ${req.user.usn || 'N/A'} | ${printSettings.copies} cop. | ₹${cost.total}`
    });

    // Assign queue position and estimated time via queueManager
    const { queuePosition, estimatedTime } = await queueManager.enqueue(order._id);
    order.queuePosition = queuePosition;
    order.estimatedTime = estimatedTime;

    // Notify owner room via notificationService
    const io = req.app.get('io');
    notificationService.notifyNewOrder(io, order);

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/my', protect, async (req, res) => {
  try {
    const orders = await Order.find({ student: req.user._id })
      .sort({ createdAt: -1 })
      .select('-fileUrl -fileName');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/track/:token', protect, async (req, res) => {
  try {
    const order = await Order.findOne({ token: req.params.token })
      .select('-fileUrl -fileName');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/calculate-cost', protect, (req, res) => {
  try {
    const { printSettings } = req.body;
    if (!printSettings) {
      return res.status(400).json({ message: 'printSettings is required' });
    }

    const cost = calculateCost(printSettings);
    const pageMap = buildPageMap(printSettings.pageRanges || [], printSettings.totalPages);
    const conflicts = detectConflicts(printSettings.pageRanges || [], printSettings.totalPages);

    res.json({ cost, pageMap, conflicts });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Cancel order (student can cancel only before printing starts)
router.delete('/:orderId', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.student.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Not your order' });
    if (!['waiting', 'processing'].includes(order.status)) return res.status(400).json({ message: 'Cannot cancel order that is already printing or completed' });
    
    // Delete file
    const path = require('path');
    const fs = require('fs').promises;
    if (order.fileName) {
      const filePath = path.join(__dirname, '../uploads', order.fileName);
      try { await fs.unlink(filePath); } catch(e) {}
    }
    
    await Order.findByIdAndDelete(req.params.orderId);
    await queueManager.recalculatePositions();
    
    res.json({ message: 'Order cancelled and deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
