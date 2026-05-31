const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/:fileName', protect, async (req, res) => {
  try {
    const fileName = req.params.fileName;
    const ext = path.extname(fileName).toLowerCase();

    // Check if file exists in GridFS
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
    const files = await bucket.find({ filename: fileName }).toArray();

    if (files && files.length > 0) {
      if (ext === '.pdf') return res.json({ type: 'pdf', url: '/api/files/' + fileName });
      if (['.jpg', '.jpeg', '.png'].includes(ext)) return res.json({ type: 'image', url: '/api/files/' + fileName });
      if (ext === '.docx') {
        // Read file from GridFS into buffer for mammoth
        const chunks = [];
        const stream = bucket.openDownloadStreamByName(fileName);
        for await (const chunk of stream) { chunks.push(chunk); }
        const buffer = Buffer.concat(chunks);
        const mammoth = require('mammoth');
        const result = await mammoth.convertToHtml({ buffer: buffer });
        return res.json({ type: 'html', content: result.value });
      }
      return res.json({ type: 'unsupported', message: 'Preview not available for ' + ext + ' files' });
    }

    return res.status(404).json({ error: 'File not found' });
  } catch (err) {
    res.status(500).json({ error: 'Preview failed: ' + err.message });
  }
});

module.exports = router;
