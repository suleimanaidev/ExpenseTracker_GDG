import crypto from 'node:crypto';
import path from 'node:path';
import mongoose from 'mongoose';

/**
 * Bill attachment storage.
 *
 * GridFS is the default: it keeps files inside the same MongoDB deployment, so
 * there is no second service to secure, back up, or leak from. A Cloudinary
 * provider is supported when `CLOUDINARY_URL` is set, and is loaded lazily via
 * dynamic import so the optional dependency is not required otherwise.
 *
 * Attachments are never published. `storageKey` is meaningless outside an
 * authenticated request, and the only way to read bytes is through
 * `GET /api/bills/:id/file`, which resolves ownership first.
 */

const BUCKET_NAME = 'billFiles';

let gridFsBucket = null;

const getBucket = () => {
  if (!gridFsBucket) {
    // `mongoose.connection.db` is a raw Db instance, which is what GridFS wants.
    gridFsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: BUCKET_NAME,
    });
  }
  return gridFsBucket;
};

/** Forgets the cached bucket, e.g. after tests swap the connection. */
export const resetStorage = () => {
  gridFsBucket = null;
};

const useCloudinary = () =>
  Boolean(process.env.CLOUDINARY_URL) && (process.env.BILL_STORAGE || '').toLowerCase() === 'cloudinary';

let cloudinaryClient = null;
const getCloudinary = async () => {
  if (!cloudinaryClient) {
    const { v2 } = await import('cloudinary');
    v2.config({ secure: true });
    cloudinaryClient = v2;
  }
  return cloudinaryClient;
};

/**
 * Reduces an attacker-controlled filename to something safe to store.
 * Drops any directory component, control characters, and shell metacharacters.
 */
export const sanitizeFilename = (name, fallback = 'bill') => {
  const base = path.basename(String(name || '').replace(/\\/g, '/'));
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[^A-Za-z0-9._\- ]+/g, '_')
    .replace(/^\.+/, '')
    .trim();

  const safe = cleaned.slice(0, 100);
  return safe || fallback;
};

/**
 * Stores an attachment and returns the metadata to persist on the Bill.
 *
 * @param {object} params
 * @param {Buffer} params.buffer
 * @param {string} params.mimeType Verified MIME type (never client-declared).
 * @param {string} params.originalName
 * @param {string} params.userId Owner, used to namespace the stored filename.
 * @returns {Promise<{storageKey: string, mimeType: string, size: number, originalName: string}>}
 */
export const storeBillFile = async ({ buffer, mimeType, originalName, userId }) => {
  const safeName = sanitizeFilename(originalName);
  const size = buffer.length;

  if (useCloudinary()) {
    const cloudinary = await getCloudinary();
    const asset = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `ledger-bills/${userId}`,
          resource_type: 'auto',
          // private + authenticated delivery: no anonymous public URL
          type: 'authenticated',
          public_id: safeName,
          overwrite: false,
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(buffer);
    });

    return {
      storageKey: `cloudinary:${asset.asset_id}`,
      mimeType,
      size: asset.bytes || size,
      originalName: safeName,
    };
  }

  const filename = `${userId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeName}`;

  await new Promise((resolve, reject) => {
    const stream = getBucket().openUploadStream(filename, {
      metadata: { mimeType, userId: String(userId), originalName: safeName },
      contentType: mimeType,
    });

    stream.on('error', reject);
    stream.on('finish', () => resolve());

    stream.end(buffer);
  });

  // openUploadStream exposes the created file id once finished.
  const fileId = await findGridFsIdByFilename(filename);
  if (!fileId) throw new Error('Failed to store bill attachment');

  return { storageKey: fileId, mimeType, size, originalName: safeName };
};

/**
 * GridFS does not surface the new file id through `finish` in all driver
 * versions, so the newest chunk is read back. Small cost, avoids depending on
 * driver-specific internals.
 */
const findGridFsIdByFilename = async (filename) => {
  const collection = mongoose.connection.db.collection(`${BUCKET_NAME}.files`);
  const cursor = collection.find({ filename }).sort({ uploadDate: -1 }).limit(1);
  for await (const doc of cursor) {
    return doc._id.toString();
  }
  return null;
};

/**
 * Opens a stored attachment for streaming.
 *
 * @returns {Promise<{ stream: NodeJS.ReadableStream, mimeType: string, size: number, filename: string }>}
 * @throws when the key does not exist.
 */
export const openBillFile = async (storageKey) => {
  if (!storageKey) throw new Error('Attachment not found');

  if (String(storageKey).startsWith('cloudinary:')) {
    const cloudinary = await getCloudinary();
    const assetId = String(storageKey).slice('cloudinary:'.length);
    const result = await cloudinary.api.resource(assetId, { type: 'authenticated' });
    const buffer = Buffer.from(
      await cloudinary.utils.download_private_url(
        `${assetId}`,
        { resource_type: result.resource_type, type: 'authenticated' }
      )
    );
    const { Readable } = await import('node:stream');
    return {
      stream: Readable.from(buffer),
      mimeType: result.format === 'jpg' ? 'image/jpeg' : `image/${result.format}`,
      size: buffer.length,
      filename: result.original_filename || 'bill',
    };
  }

  if (!mongoose.Types.ObjectId.isValid(storageKey)) {
    throw new Error('Attachment not found');
  }

  const bucket = getBucket();
  const objectId = new mongoose.Types.ObjectId(storageKey);

  const exists = await bucket.find({ _id: objectId }).limit(1).toArray();
  if (!exists || exists.length === 0) throw new Error('Attachment not found');

  const meta = exists[0];
  const mimeType = meta.metadata?.mimeType || meta.contentType || 'application/octet-stream';
  const originalName = meta.metadata?.originalName || 'bill';

  return { stream: bucket.openDownloadStream(objectId), mimeType, size: meta.length, filename: originalName };
};

/**
 * Removes a stored attachment. Missing files are not an error — the Bill row is
 * the source of truth and may have been cleaned up already.
 */
export const deleteBillFile = async (storageKey) => {
  if (!storageKey) return;

  try {
    if (String(storageKey).startsWith('cloudinary:')) {
      const cloudinary = await getCloudinary();
      await cloudinary.uploader.destroy(String(storageKey).slice('cloudinary:'.length), {
        type: 'authenticated',
        resource_type: 'auto',
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(storageKey)) return;

    const bucket = getBucket();
    const objectId = new mongoose.Types.ObjectId(storageKey);

    const exists = await bucket.find({ _id: objectId }).limit(1).toArray();
    if (!exists || exists.length === 0) return;

    await bucket.delete(objectId);
  } catch (err) {
    // A leftover object is preferable to a failed delete of the Bill itself.
    console.warn('Failed to delete bill attachment:', err.message);
  }
};