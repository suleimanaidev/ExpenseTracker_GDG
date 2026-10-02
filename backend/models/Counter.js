import mongoose from 'mongoose';

/**
 * Atomic per-user, per-year invoice sequence.
 *
 * Auto-generated invoice numbers (INV-2026-0001) must never collide, even when
 * two requests for the next number arrive at the same instant. A plain
 * read-then-write would race, so numbering goes through `findOneAndUpdate` with
 * `$inc` and `upsert`, which MongoDB applies atomically per document.
 */
const counterSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    seq: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

counterSchema.index({ user: 1, year: 1 }, { unique: true });

export const Counter = mongoose.model('Counter', counterSchema);

/**
 * Returns the next invoice number for a user, e.g. "INV-2026-0007".
 *
 * @param {string|object} userId
 * @param {Date} [at] Injected for deterministic tests.
 * @returns {Promise<string>}
 */
export const nextInvoiceNumber = async (userId, at = new Date()) => {
  const year = at.getFullYear();

  let doc;
  try {
    doc = await Counter.findOneAndUpdate(
      { user: userId, year },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    // Two concurrent upserts can race; the loser sees a duplicate key error and
    // the document is already there, so a plain increment resolves it.
    if (err.code === 11000) {
      doc = await Counter.findOneAndUpdate(
        { user: userId, year },
        { $inc: { seq: 1 } },
        { new: true }
      );
    } else {
      throw err;
    }
  }

  return `INV-${year}-${String(doc.seq).padStart(4, '0')}`;
};