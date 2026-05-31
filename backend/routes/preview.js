const express = require('express');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');

const router = express.Router();
const uploadDir = path.join(__dirname, '../uploads');

/**
 * GET /api/preview/:fileName
 * Returns rendered HTML content for any supported file type.
 * - PDF: returns a page-by-page render URL (handled client-side with PDF.js)
 * - DOCX: converts to HTML using mammoth
 * - Images: returns img tag
 * - PPT/PPTX: extracts text content
 */
router.get('/:fileName', protect, async (req, res) => {
  try {
    const fileName = req.params.fileName;
    const filePath = path.join(uploadDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const ext = path.extname(fileName).toLowerCase();

    if (ext === '.pdf') {
      // PDF handled client-side with PDF.js
      return res.json({ type: 'pdf', url: '/uploads/' + fileName });
    }

    if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      return res.json({ type: 'image', url: '/uploads/' + fileName });
    }

    if (ext === '.docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.convertToHtml({ path: filePath });
      return res.json({ type: 'html', content: result.value, messages: result.messages });
    }

    if (ext === '.ppt' || ext === '.pptx') {
      // For PPT files, read as binary and try basic text extraction
      // Since there's no pure JS PPT renderer, we'll show file info
      const stats = fs.statSync(filePath);
      return res.json({
        type: 'unsupported-render',
        message: 'PPT/PPTX preview: File will print with selected preferences.',
        fileName: fileName,
        size: stats.size
      });
    }

    // ZIP or other
    return res.json({ type: 'unsupported', message: 'Preview not available for this file type' });

  } catch (err) {
    console.error('Preview error:', err.message);
    res.status(500).json({ error: 'Preview generation failed: ' + err.message });
  }
});

module.exports = router;
