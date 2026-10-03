import mongoose from 'mongoose';

const aiUsageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['scan', 'insight', 'chat'], required: true },
    model: { type: String, default: 'gemini-2.5-flash', maxlength: 100 },
    tokens: { type: Number, min: 0, default: null },
    success: { type: Boolean, required: true },
    latencyMs: { type: Number, min: 0, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

aiUsageSchema.index({ createdAt: -1 });
aiUsageSchema.index({ user: 1, createdAt: -1 });

export const AiUsage = mongoose.model('AiUsage', aiUsageSchema);
