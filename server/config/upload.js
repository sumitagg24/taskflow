// Backward-compatible shim — new code should import ./storage directly.
// Preserves the previous `require('./upload')` (multer instance) and
// `require('./upload').validateFileSignature` call sites.
const storage = require('./storage');

const upload = storage.getMulterUpload();

module.exports = upload;
module.exports.validateFileSignature = storage.validateFileSignature;
module.exports.validateBufferSignature = storage.validateBufferSignature;
module.exports.default = upload;
