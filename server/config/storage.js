/**
 * Upload storage abstraction: local disk (development / single-process VM
 * with a persistent volume) vs durable object storage (S3-compatible) for
 * any ephemeral runtime (Vercel functions, multi-replica, serverless).
 *
 * - STORAGE_MODE=local (default): multer diskStorage into server/uploads,
 *   served as attachments via express.static (see app.js). Durable ONLY when
 *   the host mounts a persistent volume (deploy/oracle/docker-compose.yml).
 * - STORAGE_MODE=s3: multer memoryStorage, bytes validated in memory, then
 *   PutObject to S3. Returns a durable HTTPS URL / object key — never a
 *   filesystem path. Required for serverless (Vercel functions have an
 *   ephemeral, read-only filesystem outside /tmp and no shared disk).
 *
 * Validation is identical in both modes: extension allowlist + MIME/extension
 * consistency + magic-number sniffing + 10 MB cap. S3 objects are stored with
 * ContentDisposition=attachment so a smuggled HTML/SVG can't execute.
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('../utils/logger');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB — matches previous behaviour

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

function storageMode() {
  return (process.env.STORAGE_MODE || 'local').toLowerCase();
}

function isServerless() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function isS3Mode() {
  return storageMode() === 's3';
}

function s3Config() {
  return {
    bucket: process.env.S3_BUCKET || '',
    region: process.env.S3_REGION || '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    publicBaseUrl: (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
    endpoint: process.env.S3_ENDPOINT || undefined, // R2 / MinIO compatible
  };
}

function isS3Configured() {
  const c = s3Config();
  return Boolean(c.bucket && c.region && c.accessKeyId && c.secretAccessKey);
}

// ── Shared validation ──────────────────────────────────────────────────────

const fileFilter = (req, file, cb) => {
  const ext = path.extname(path.basename(file.originalname)).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  const expectedExt = MIME_TO_EXT[mime];
  const extOk = ALLOWED_EXTENSIONS.has(ext);
  const mimeOk = !!expectedExt;
  const extMatches = expectedExt === ext || (mime === 'image/jpeg' && ext === '.jpeg');

  if (extOk && mimeOk && extMatches) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

/** Magic-number check over a Buffer (S3 path: bytes never touch disk). */
function validateBufferSignature(buf, ext) {
  const e = String(ext || '').toLowerCase();
  if (['.txt', '.csv', '.doc', '.xls'].includes(e)) return true;
  if (!buf || buf.length === 0) return false;

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

/** Magic-number check over a file on disk (local path). Fail closed. */
function validateFileSignature(filepath, ext) {
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
  return validateBufferSignature(buf, ext);
}

function sanitizedFilename(originalname) {
  const originalExt = path.extname(path.basename(originalname || '')).toLowerCase();
  const uniqueSuffix = `${Date.now()}-${crypto.randomInt(1e9)}`;
  return `attachment-${uniqueSuffix}${originalExt}`;
}

// ── Local disk ─────────────────────────────────────────────────────────────

function localUploadDir() {
  // Serverless filesystems are read-only outside /tmp — and /tmp is still
  // ephemeral. Local mode on serverless is a configuration error (fail fast
  // in the route, not here).
  if (isServerless()) return path.join('/tmp', 'taskflow-uploads');
  return path.join(__dirname, '..', 'uploads');
}

function ensureLocalDir() {
  const dir = localUploadDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      cb(null, ensureLocalDir());
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => cb(null, sanitizedFilename(file.originalname)),
});

// ── S3 ─────────────────────────────────────────────────────────────────────

function s3KeyFor(filename) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const rand = crypto.randomBytes(8).toString('hex');
  const safe = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
  return `attachments/${y}/${m}/${Date.now()}-${rand}-${safe}`;
}

function buildPublicUrl(key) {
  const c = s3Config();
  if (c.publicBaseUrl) return `${c.publicBaseUrl}/${key}`;
  return `https://${c.bucket}.s3.${c.region}.amazonaws.com/${key}`;
}

async function uploadBufferToS3({ buffer, filename, mimeType }) {
  const c = s3Config();
  if (!isS3Configured()) {
    throw new Error(
      'STORAGE_MODE=s3 but S3_BUCKET/S3_REGION/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY are not all set'
    );
  }
  let S3Client, PutObjectCommand;
  try {
    ({ S3Client, PutObjectCommand } = require('@aws-sdk/client-s3'));
  } catch {
    throw new Error(
      '@aws-sdk/client-s3 is not installed — run `npm install --prefix server` (it is a declared dependency)'
    );
  }
  const client = new S3Client({
    region: c.region,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    ...(c.endpoint ? { endpoint: c.endpoint, forcePathStyle: true } : {}),
  });
  const key = s3KeyFor(filename);
  await client.send(
    new PutObjectCommand({
      Bucket: c.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream',
      ContentDisposition: 'attachment',
    })
  );
  return { key, url: buildPublicUrl(key) };
}

function s3Client() {
  const c = s3Config();
  if (!isS3Configured()) {
    throw new Error(
      'STORAGE_MODE=s3 but S3_BUCKET/S3_REGION/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY are not all set'
    );
  }
  let S3Client;
  try {
    ({ S3Client } = require('@aws-sdk/client-s3'));
  } catch {
    throw new Error(
      '@aws-sdk/client-s3 is not installed — run `npm install --prefix server` (it is a declared dependency)'
    );
  }
  return new S3Client({
    region: c.region,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    ...(c.endpoint ? { endpoint: c.endpoint, forcePathStyle: true } : {}),
  });
}

/**
 * Short-lived, owner-scoped download URL for private buckets. The response
 * is a 302 to this URL (never proxied through the function — no byte
 * copying, no memory pressure). Public-bucket deploys may keep using the
 * durable `url` from the upload response directly.
 */
async function getPresignedDownloadUrl(key, expiresInSec = 300) {
  const client = s3Client();
  let GetObjectCommand, getSignedUrl;
  try {
    ({ GetObjectCommand } = require('@aws-sdk/client-s3'));
    ({ getSignedUrl } = require('@aws-sdk/s3-request-presigner'));
  } catch {
    throw new Error(
      '@aws-sdk/s3-request-presigner is not installed — run `npm install --prefix server` (it is a declared dependency)'
    );
  }
  const c = s3Config();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: c.bucket,
      Key: key,
      ResponseContentDisposition: 'attachment',
    }),
    { expiresIn: expiresInSec }
  );
}

async function deleteS3Object(key) {
  const client = s3Client();
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await client.send(
    new DeleteObjectCommand({ Bucket: s3Config().bucket, Key: key })
  );
}

// ── Local disk deletion (path-traversal safe) ──────────────────────────────

/** Resolve an Upload filename to an absolute path inside the upload dir, or null. */
function resolveLocalPath(filename) {
  const base = path.basename(String(filename || ''));
  if (!base || base === '.' || base === '..') return null;
  return path.join(localUploadDir(), base);
}

function deleteLocalFile(filename) {
  const abs = resolveLocalPath(filename);
  if (!abs) return false;
  try {
    if (!fs.existsSync(abs)) return false;
    fs.unlinkSync(abs);
    return true;
  } catch {
    return false;
  }
}

/** Delete stored bytes for an Upload record (either backend). No-op false on failure. */
async function deleteStoredFile(record) {
  try {
    if (record.storage === 's3') {
      await deleteS3Object(record.key || record.filename);
      return true;
    }
    return deleteLocalFile(record.filename);
  } catch {
    return false;
  }
}

// ── Multer instance per mode ───────────────────────────────────────────────

function getMulterUpload() {
  if (isS3Mode()) {
    return multer({
      storage: multer.memoryStorage(),
      fileFilter,
      limits: { fileSize: MAX_FILE_SIZE },
    });
  }
  return multer({ storage: localStorage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } });
}

module.exports = {
  storageMode,
  isS3Mode,
  isServerless,
  isS3Configured,
  s3Config,
  buildPublicUrl,
  uploadBufferToS3,
  getPresignedDownloadUrl,
  deleteS3Object,
  resolveLocalPath,
  deleteLocalFile,
  deleteStoredFile,
  validateBufferSignature,
  validateFileSignature,
  getMulterUpload,
  localUploadDir,
  MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS,
};
