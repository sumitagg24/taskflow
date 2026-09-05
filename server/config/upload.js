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
  // The extension must match the MIME-implied extension — otherwise a
  // renamed script (e.g. shell.php relabelled image/png) sails through.
  // `.jpeg` is the same format as `.jpg`, so accept it for image/jpeg.
  const extMatches = expectedExt === ext || (mime === 'image/jpeg' && ext === '.jpeg');

  if (extOk && mimeOk && extMatches) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

// Magic-number sniffing: ext and mime are both client-supplied, so verify the
// actual bytes on disk after multer writes the file. Returns true when the
// content matches the claimed extension, false otherwise (fail closed).
// TXT/CSV/DOC/XLS (legacy OLE/plain-text) have no reliable magic numbers, so
// sniffing is skipped for them.
function validateFileSignature(filepath, ext) {
  const e = String(ext || '').toLowerCase();
  if (['.txt', '.csv', '.doc', '.xls'].includes(e)) return true;

  let buf;
  try {
    const fd = fs.openSync(filepath, 'r');
    try {
      const tmp = Buffer.alloc(12);
      const bytesRead = fs.readSync(fd, tmp, 0, 12, 0);
      buf = tmp.subarray(0, bytesRead);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }

  switch (e) {
    case '.png':
      return (
        buf.length >= 8 &&
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
        buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
      );
    case '.jpg':
    case '.jpeg':
      return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case '.gif':
      return (
        buf.length >= 6 &&
        (buf.subarray(0, 6).toString('ascii') === 'GIF87a' ||
          buf.subarray(0, 6).toString('ascii') === 'GIF89a')
      );
    case '.pdf':
      return buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === '%PDF';
    case '.zip':
    case '.docx':
    case '.xlsx':
      // OOXML (.docx/.xlsx) are ZIP containers, so one signature covers all three.
      return (
        buf.length >= 4 &&
        buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
      );
    case '.mp4':
      return buf.length >= 8 && buf.subarray(4, 8).toString('ascii') === 'ftyp';
    case '.mp3':
      return (
        buf.length >= 3 &&
        (buf.subarray(0, 3).toString('ascii') === 'ID3' ||
          (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0))
      );
    default:
      return false;
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = upload;
module.exports.validateFileSignature = validateFileSignature;
