const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Local storage (fallback)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.docx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.zip'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('File type not supported. Allowed: PDF, DOCX, PPT, PPTX, JPG, JPEG, PNG, ZIP'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * Extract page count from PDF
 */
async function getPageCount(filePath, ext) {
  try {
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
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

/**
 * Upload to Cloudinary if configured, otherwise keep local
 */
async function uploadToCloud(filePath, originalName) {
  if (!process.env.CLOUDINARY_CLOUD_NAME) return null;
  try {
    const cloudinary = require('../config/cloudinary');
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'raw',
      folder: 'xerox-queue',
      public_id: path.basename(filePath, path.extname(filePath)),
      use_filename: true
    });
    return result.secure_url;
  } catch (e) {
    console.error('[Upload] Cloudinary upload failed:', e.message);
    return null;
  }
}

router.post('/', protect, (req, res) => {
  upload.single('document')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File size exceeds 50MB limit' });
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    const pageCount = await getPageCount(req.file.path, ext);

    // Try cloud upload
    const cloudUrl = await uploadToCloud(req.file.path, req.file.originalname);
    const fileUrl = cloudUrl || ('/uploads/' + req.file.filename);

    res.json({
      fileName: req.file.filename,
      originalName: req.file.originalname,
      fileUrl: fileUrl,
      fileType: ext,
      size: req.file.size,
      pageCount: pageCount,
      isCloud: !!cloudUrl
    });
  });
});

module.exports = router;
