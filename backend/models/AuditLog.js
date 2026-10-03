import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    targetType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ip: { type: String, default: null, maxlength: 100 },
    userAgent: { type: String, default: null, maxlength: 500 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    strict: true,
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
