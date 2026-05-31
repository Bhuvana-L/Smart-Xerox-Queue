const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');
const FileStore = require('../models/FileStore');

const router = express.Router();

// Use memory storage - file stays in RAM, then we save to MongoDB
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.docx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.zip'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('File type not supported. Allowed: PDF, DOCX, PPT, PPTX, JPG, JPEG, PNG, ZIP'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * Extract page count from PDF buffer
 */
async function getPageCount(buffer, ext) {
  try {
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.numpages || 1;
    }
    if (['.jpg', '.jpeg', '.png'].includes(ext)) return 1;
    return 0;
  } catch (e) {
    console.error('Page count extraction failed:', e.message);
    return 0;
  }
}

// Upload file - stores in MongoDB
router.post('/', protect, (req, res) => {
  upload.single('document')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File size exceeds 50MB limit' });
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    const fileName = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    const pageCount = await getPageCount(req.file.buffer, ext);

    // Store file in MongoDB
    try {
      await FileStore.create({
        fileName: fileName,
        originalName: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
        data: req.file.buffer
      });
      console.log('[Upload] File stored in MongoDB:', fileName);
    } catch (dbErr) {
      console.error('[Upload] MongoDB store failed:', dbErr.message);
      return res.status(500).json({ error: 'Failed to store file' });
    }

    res.json({
      fileName: fileName,
      originalName: req.file.originalname,
      fileUrl: '/api/files/' + fileName,
      fileType: ext,
      size: req.file.size,
      pageCount: pageCount
    });
  });
});

module.exports = router;
