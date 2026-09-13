/**
 * /api/upload — upload lifecycle on both storage backends.
 *
 * - POST /          single file upload (see below per backend)
 * - GET /<key>      owner-scoped download: local → streamed attachment,
 *                   s3 → 302 to a short-lived presigned URL (private-bucket
 *                   safe; public-bucket clients may keep using `url` directly)
 * - DELETE /<key>   owner-only delete: stored bytes + Upload record +
 *                   descriptor pull from the owner's tasks
 *
 * - local (STORAGE_MODE=local): file lands on disk, response carries the
 *   same `/uploads/<file>` path as before (single-process / volume deploys).
 *   REFUSED on serverless runtimes (ephemeral disk) — 503, never a silent
 *   /tmp write.
 * - s3 (STORAGE_MODE=s3): bytes are validated in memory and PutObject'd;
 *   the response carries a durable `url` + `key` and NO filesystem path.
 *
 * Ownership, validation and limits are identical in both modes: auth +
 * rate limit (mounted in app.js), extension/MIME consistency, magic-number
 * sniffing, 10 MB cap. Every accepted file mints an Upload record so task
 * attachment mutations can scope to the uploader (see taskController), and
 * every read/delete re-checks that record (no record, or another uploader
 * → 404/403, fail closed).
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const storage = require('../config/storage');
const Upload = require('../models/Upload');
const Task = require('../models/Task');
const logger = require('../utils/logger');

const router = express.Router();
const upload = storage.getMulterUpload();

/** Serverless + local disk = ephemeral: refuse loudly instead of writing /tmp. */
function requireDurableStorage(req, res, next) {
  if (!storage.isS3Mode() && storage.isServerless()) {
    return res.status(503).json({
      message: 'Upload storage unavailable: STORAGE_MODE=s3 with S3_* configuration is required on ephemeral runtimes',
    });
  }
  return next();
}

router.post('/', requireDurableStorage, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (storage.isS3Mode()) {
      const ext = path.extname(path.basename(req.file.originalname)).toLowerCase();
      if (!storage.validateBufferSignature(req.file.buffer, ext)) {
        return res.status(400).json({ message: 'File content does not match its type' });
      }
      const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      let stored;
      try {
        stored = await storage.uploadBufferToS3({
          buffer: req.file.buffer,
          filename,
          mimeType: req.file.mimetype,
        });
      } catch (err) {
        logger.error('S3 upload failed:', err.message);
        return res.status(502).json({ message: 'Upload storage unavailable' });
      }
      await Upload.create({
        filename: stored.key,
        originalName: String(req.file.originalname || '').slice(0, 255),
        mimeType: String(req.file.mimetype || '').slice(0, 128),
        size: req.file.size,
        uploadedBy: req.user._id,
        state: 'orphan',
        storage: 's3',
        key: stored.key,
        url: stored.url,
      });
      return res.json({
        filename: stored.key,
        originalName: req.file.originalname,
        path: stored.url,
        url: stored.url,
        key: stored.key,
        storage: 's3',
        size: req.file.size,
        mimeType: req.file.mimetype,
      });
    }

    // ── local disk path (unchanged behaviour) ─────────────────────────────
    const ext = path.extname(req.file.filename).toLowerCase();
    if (!storage.validateFileSignature(req.file.path, ext)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // Best-effort cleanup; the rejection below is what matters.
      }
      return res.status(400).json({ message: 'File content does not match its type' });
    }
    await Upload.create({
      filename: req.file.filename,
      originalName: String(req.file.originalname || '').slice(0, 255),
      mimeType: String(req.file.mimetype || '').slice(0, 128),
      size: req.file.size,
      uploadedBy: req.user._id,
      state: 'orphan',
      storage: 'local',
    });
    return res.json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: `/uploads/${req.file.filename}`,
      storage: 'local',
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Owner-scoped download. S3 keys contain slashes
 * (`attachments/<yyyy>/<mm>/…`), so the wildcard captures the full remainder
 * and the Upload record — keyed by the exact stored filename — is the
 * authority for who may read it.
 */
async function findOwnedRecord(key, userId) {
  const filename = decodeURIComponent(key);
  return Upload.findOne({ filename, uploadedBy: userId });
}

router.get('/*', async (req, res, next) => {
  try {
    const record = await findOwnedRecord(req.params[0], req.user._id);
    if (!record) return res.status(404).json({ message: 'File not found' });

    if (record.storage === 's3') {
      try {
        const url = await storage.getPresignedDownloadUrl(record.key || record.filename);
        return res.redirect(302, url);
      } catch (err) {
        logger.error('Presigned download failed:', err.message);
        return res.status(502).json({ message: 'Upload storage unavailable' });
      }
    }

    const abs = storage.resolveLocalPath(record.filename);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).json({ message: 'File not found' });
    }
    return res.sendFile(abs, {
      headers: {
        'Content-Disposition': `attachment; filename="${String(record.originalName || record.filename).replace(/"/g, '')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': 'sandbox',
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Owner-only delete: bytes + record + descriptor references on owned tasks. */
router.delete('/*', async (req, res, next) => {
  try {
    const record = await findOwnedRecord(req.params[0], req.user._id);
    if (!record) return res.status(404).json({ message: 'File not found' });

    const bytesGone = await storage.deleteStoredFile(record);
    if (!bytesGone) {
      logger.warn(`Upload bytes missing for ${record.filename}; removing record anyway`);
    }
    await Upload.deleteOne({ _id: record._id });
    await Task.updateMany(
      { userId: req.user._id },
      { $pull: { attachments: { filename: record.filename } } }
    );
    return res.json({ message: 'File deleted', filename: record.filename });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
