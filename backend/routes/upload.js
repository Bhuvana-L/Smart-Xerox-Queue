const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

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
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('File type not supported. Allowed: PDF, DOCX, PPT, PPTX, JPG, JPEG, PNG, ZIP'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }
});

/**
 * Extract page count from uploaded file.
 * Supports PDF (exact count). For images = 1 page. Others = estimate.
 */
async function getPageCount(filePath, ext) {
  try {
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return data.numpages || 1;
    }
    if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      return 1;
    }
    // For DOCX, PPT, PPTX, ZIP — can't easily count, return 0 (user must enter)
    return 0;
  } catch (e) {
    console.error('Page count extraction failed:', e.message);
    return 0;
  }
}

/**
 * Convert non-PDF files to PDF for preview using LibreOffice.
 * Returns the PDF file path or null if conversion fails.
 */
async function convertToPdf(filePath, ext) {
  if (ext === '.pdf') return filePath; // already PDF
  if (['.jpg', '.jpeg', '.png'].includes(ext)) return null; // images handled separately

  try {
    const libre = require('libreoffice-convert');
    const { promisify } = require('util');
    const convert = promisify(libre.convert);
    const input = fs.readFileSync(filePath);
    const pdfBuffer = await convert(input, '.pdf', undefined);
    const pdfPath = filePath.replace(path.extname(filePath), '.pdf');
    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log('[Upload] Converted to PDF:', pdfPath);
    return pdfPath;
  } catch (e) {
    console.error('[Upload] PDF conversion failed (LibreOffice may not be installed):', e.message);
    return null;
  }
}

router.post('/', protect, (req, res) => {
  upload.single('document')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds 50MB limit' });
      }
      if (err.message === 'File type not supported. Allowed: PDF, DOCX, PPT, PPTX, JPG, JPEG, PNG, ZIP') {
        return res.status(400).json({ error: 'File type not supported. Allowed: PDF, DOCX, PPT, PPTX, JPG, JPEG, PNG, ZIP' });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const pageCount = await getPageCount(req.file.path, ext);

    // Try to convert to PDF for preview
    let pdfUrl = null;
    if (ext === '.pdf') {
      pdfUrl = '/uploads/' + req.file.filename;
    } else {
      const pdfPath = await convertToPdf(req.file.path, ext);
      if (pdfPath && pdfPath !== req.file.path) {
        pdfUrl = '/uploads/' + path.basename(pdfPath);
      }
    }

    res.json({
      fileName: req.file.filename,
      originalName: req.file.originalname,
      fileUrl: '/uploads/' + req.file.filename,
      fileType: ext,
      size: req.file.size,
      pageCount: pageCount,
      pdfUrl: pdfUrl
    });
  });
});

module.exports = router;
