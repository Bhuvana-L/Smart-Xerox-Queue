const express = require('express');
const path = require('path');
const { protect } = require('../middleware/auth');
const FileStore = require('../models/FileStore');
const Order = require('../models/Order');

const router = express.Router();

router.get('/:fileName', protect, async (req, res) => {
  try {
    const fileName = req.params.fileName;
    const ext = path.extname(fileName).toLowerCase();

    // Check if file exists in MongoDB
    const file = await FileStore.findOne({ fileName: fileName });
    if (file) {
      if (ext === '.pdf') return res.json({ type: 'pdf', url: '/api/files/' + fileName });
      if (['.jpg', '.jpeg', '.png'].includes(ext)) return res.json({ type: 'image', url: '/api/files/' + fileName });
      if (ext === '.docx') {
        // Convert DOCX to HTML
        const mammoth = require('mammoth');
        const result = await mammoth.convertToHtml({ buffer: file.data });
        return res.json({ type: 'html', content: result.value });
      }
      return res.json({ type: 'unsupported', message: 'Preview not available for ' + ext + ' files' });
    }

    // Check order for cloud URL
    const order = await Order.findOne({ fileName: fileName });
    if (order && order.fileUrl) {
      if (ext === '.pdf') return res.json({ type: 'pdf', url: order.fileUrl });
      if (['.jpg', '.jpeg', '.png'].includes(ext)) return res.json({ type: 'image', url: order.fileUrl });
    }

    return res.status(404).json({ error: 'File not found' });
  } catch (err) {
    res.status(500).json({ error: 'Preview failed: ' + err.message });
  }
});

module.exports = router;
