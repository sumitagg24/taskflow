const mongoose = require('mongoose');

/**
 * Upload ownership record.
 *
 * POST /api/upload stores a file on disk and the client re-sends its
 * descriptor when mutating a task. Without a server-side record there is no
 * way to prove who uploaded a file — anyone who can guess (or intercept) a
 * path could attach it to their own task, and orphaned files could never be
 * garbage-collected. This collection is the authoritative link between a
 * stored file and its uploader.
 * `storage`:
 *  - 'local' : file on the host disk, served from /uploads (durable only
 *    with a persistent volume; see deploy/oracle/docker-compose.yml).
 *  - 's3'    : durable object storage; `key` is the object key and `url` the
 *    public HTTPS URL. No filesystem path exists in this mode.
 *
 * `state`:
 *  - 'orphan'  : uploaded, not yet attached to any task (default)
 *  - 'attached': referenced by at least one live task's attachments array
 *  - 'removed' : detached from every task; the file may be swept
 */
const uploadSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true, index: true },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    storage: {
      type: String,
      enum: ['local', 's3'],
      default: 'local',
      index: true,
    },
    key: { type: String, default: '' },
    url: { type: String, default: '' },
    state: {
      type: String,
      enum: ['orphan', 'attached', 'removed'],
      default: 'orphan',
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Upload', uploadSchema);
