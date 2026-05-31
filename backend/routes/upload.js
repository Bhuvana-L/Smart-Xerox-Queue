const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const { Readable } = require('stream');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Memory storage - file in RAM then saved to GridFS
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.docx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.zip'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('File type not supported. Allowed: PDF, DOCX, PPT, PPTX, JPG, JPEG, PNG, ZIP'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * Get GridFS bucket
 */
function getBucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
}

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

// Upload file - stores in MongoDB GridFS (supports files > 16MB)
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

    // Store in GridFS
    try {
      const bucket = getBucket();
      const uploadStream = bucket.openUploadStream(fileName, {
        contentType: req.file.mimetype,
        metadata: { originalName: req.file.originalname, size: req.file.size }
      });

      const readStream = new Readable();
      readStream.push(req.file.buffer);
      readStream.push(null);
      
      await new Promise((resolve, reject) => {
        readStream.pipe(uploadStream)
          .on('finish', resolve)
          .on('error', reject);
      });

      console.log('[Upload] File stored in GridFS:', fileName, '(' + (req.file.size / 1024 / 1024).toFixed(2) + ' MB)');
    } catch (dbErr) {
      console.error('[Upload] GridFS store failed:', dbErr.message);
      return res.status(500).json({ error: 'Failed to store file: ' + dbErr.message });
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
