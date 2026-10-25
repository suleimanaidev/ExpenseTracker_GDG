import mongoose from 'mongoose';

/**
 * A saved Ledger AI conversation. Messages keep only role and text: a bill draft's
 * attachment and confirmation card are not stored, so reopening an old chat shows
 * what was said, not a stale "Add bill" button.
 */
const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'ai'], required: true },
    text: { type: String, required: true, maxlength: 4000 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120, default: 'New chat' },
    messages: { type: [messageSchema], default: [] },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

conversationSchema.index({ user: 1, lastMessageAt: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
