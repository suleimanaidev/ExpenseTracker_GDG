/**
 * File type detection based on magic bytes (file signatures).
 *
 * Extension and client-supplied MIME types are attacker-controlled and are
 * therefore never trusted. Every uploaded bill is identified by inspecting the
 * leading bytes of its buffer, which is what is finally forwarded to Gemini.
 */

export const MAX_BILL_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Accepted bill formats, keyed by the canonical MIME type we forward upstream.
 * `signatures` are compared against the start of the file buffer.
 */
export const BILL_FORMATS = {
  'image/jpeg': {
    extension: 'jpg',
    label: 'JPEG image',
    signatures: [
      [0xff, 0xd8, 0xff],
    ],
  },
  'image/png': {
    extension: 'png',
    label: 'PNG image',
    signatures: [
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ],
  },
  'image/webp': {
    extension: 'webp',
    label: 'WEBP image',
    signatures: [
      // "RIFF" .... "WEBP"
      [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
    ],
  },
  'application/pdf': {
    extension: 'pdf',
    label: 'PDF document',
    signatures: [
      [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
    ],
  },
};

export const ACCEPTED_BILL_MIME_TYPES = Object.keys(BILL_FORMATS);

const matchesSignature = (buffer, signature) => {
  if (!buffer || buffer.length < signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    const expected = signature[i];
    // `null` marks a "don't care" byte, used for the RIFF container offset.
    if (expected === null) continue;
    if (buffer[i] !== expected) return false;
  }
  return true;
};

/**
 * Identifies a buffer as one of the accepted bill formats.
 *
 * @param {Buffer} buffer Raw file bytes.
 * @returns {{ ok: boolean, mimeType?: string, extension?: string, label?: string, reason?: string }}
 */
export const detectBillFormat = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, reason: 'File is empty.' };
  }

  for (const [mimeType, format] of Object.entries(BILL_FORMATS)) {
    if (format.signatures.some((sig) => matchesSignature(buffer, sig))) {
      return {
        ok: true,
        mimeType,
        extension: format.extension,
        label: format.label,
      };
    }
  }

  return {
    ok: false,
    reason: `Unsupported file content. Accepted formats: ${ACCEPTED_BILL_MIME_TYPES.join(', ')}.`,
  };
};

/**
 * Validates both size and true file type.
 *
 * @param {Buffer} buffer Raw file bytes.
 * @returns {{ ok: boolean, mimeType?: string, extension?: string, size?: number, reason?: string, code?: string }}
 */
export const validateBillBuffer = (buffer) => {
  const size = Buffer.isBuffer(buffer) ? buffer.length : 0;

  if (size === 0) {
    return { ok: false, code: 'EMPTY_FILE', reason: 'Uploaded file is empty.' };
  }

  if (size > MAX_BILL_BYTES) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      reason: `File is ${(size / (1024 * 1024)).toFixed(1)} MB. Maximum allowed size is 8 MB.`,
    };
  }

  const detected = detectBillFormat(buffer);
  if (!detected.ok) {
    return { ok: false, code: 'INVALID_FILE_TYPE', reason: detected.reason };
  }

  return {
    ok: true,
    mimeType: detected.mimeType,
    extension: detected.extension,
    label: detected.label,
    size,
  };
};