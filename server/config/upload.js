const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Sanitize: strip any path components from the original name and only keep the extension.
    const originalExt = path.extname(path.basename(file.originalname)).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `attachment-${uniqueSuffix}${originalExt}`);
  },
});

const ALLOWED_EXTENSIONS = new Set([
  '.jpeg', '.jpg', '.png', '.gif', '.pdf', '.doc', '.docx',
  '.xls', '.xlsx', '.txt', '.csv', '.zip', '.mp4', '.mp3',
]);

const MIME_TO_EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
  'application/pdf': '.pdf', 'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt', 'text/csv': '.csv',
  'application/zip': '.zip', 'video/mp4': '.mp4', 'audio/mpeg': '.mp3',
};

const fileFilter = (req, file, cb) => {
  const ext = path.extname(path.basename(file.originalname)).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  const expectedExt = MIME_TO_EXT[mime];
  const extOk = ALLOWED_EXTENSIONS.has(ext);
  const mimeOk = !!expectedExt;

  if (extOk && mimeOk) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = upload;
