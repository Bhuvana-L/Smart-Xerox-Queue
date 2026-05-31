const express = require('express');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');
const Order = require('../models/Order');

const router = express.Router();
const uploadDir = path.join(__dirname, '../uploads');

router.get('/:fileName', protect, async (req, res) => {
  try {
    const fileName = req.params.fileName;
    const filePath = path.join(uploadDir, fileName);
    const ext = path.extname(fileName).toLowerCase();

    // Check if file exists locally
    if (fs.existsSync(filePath)) {
      if (ext === '.pdf') return res.json({ type: 'pdf', url: '/uploads/' + fileName });
      if (['.jpg', '.jpeg', '.png'].includes(ext)) return res.json({ type: 'image', url: '/uploads/' + fileName });
      if (ext === '.docx') {
        const mammoth = require('mammoth');
        const result = await mammoth.convertToHtml({ path: filePath });
        return res.json({ type: 'html', content: result.value });
      }
      return res.json({ type: 'unsupported', message: 'Preview not available for ' + ext });
    }

    // File not local — check if order has a cloud URL
    const order = await Order.findOne({ fileName: fileName });
    if (order && order.fileUrl && order.fileUrl.startsWith('http')) {
      if (ext === '.pdf') return res.json({ type: 'pdf', url: order.fileUrl });
      if (['.jpg', '.jpeg', '.png'].includes(ext)) return res.json({ type: 'image', url: order.fileUrl });
      return res.json({ type: 'unsupported', message: 'Preview available via cloud URL', url: order.fileUrl });
    }

    return res.status(404).json({ error: 'File not found locally or in cloud' });
  } catch (err) {
    res.status(500).json({ error: 'Preview failed: ' + err.message });
  }
});

module.exports = router;
