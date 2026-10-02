import multer from 'multer';
import { MAX_BILL_BYTES, ACCEPTED_BILL_MIME_TYPES, validateBillBuffer } from '../utils/fileSignature.js';

/**
 * Multipart upload handling for the bill scanner.
 *
 * Multer only buffers the upload and enforces a hard byte ceiling. It is NOT
 * trusted to decide the file's type: browsers and curl both let you claim any
 * Content-Type you like. Real type verification happens in `verifyBillFile`,
 * which inspects magic bytes and is the only thing that decides what gets sent
 * to Gemini.
 */

export const billUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_BILL_BYTES,
    files: 1,
    fields: 5,
  },
}).single('bill');

/**
 * Wraps multer so its own errors surface in the app's standard error shape.
 */
export const handleBillUpload = (req, res, next) => {
  billUpload(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'File is too large. Maximum allowed size is 8 MB.',
          code: 'FILE_TOO_LARGE',
        });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          error: 'Unexpected file field. Upload the bill as a single file under the "bill" field.',
          code: 'UNEXPECTED_FILE_FIELD',
        });
      }
      return res.status(400).json({ error: err.message, code: err.code });
    }

    return next(err);
  });
};

/**
 * Validates that exactly one readable, correctly-typed bill was uploaded and
 * normalizes it onto `req.billFile`.
 */
export const verifyBillFile = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'No bill file was uploaded. Attach one under the "bill" field.',
      code: 'NO_FILE',
    });
  }

  const result = validateBillBuffer(req.file.buffer);

  if (!result.ok) {
    return res.status(result.code === 'FILE_TOO_LARGE' ? 413 : 400).json({
      error: result.reason,
      code: result.code,
    });
  }

  req.billFile = {
    buffer: req.file.buffer,
    mimeType: result.mimeType,
    extension: result.extension,
    size: result.size,
    // Filenames are attacker-controlled; sanitize before echoing anywhere.
    originalName: String(req.file.originalname || 'bill').replace(/[^\w.\- ]+/g, '_').slice(0, 120),
  };

  return next();
};

export { MAX_BILL_BYTES, ACCEPTED_BILL_MIME_TYPES };