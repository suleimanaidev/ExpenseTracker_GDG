import mongoose from 'mongoose';

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'default', immutable: true },
    allowNewSignups: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
    defaultAiDailyLimit: { type: Number, min: 0, max: 10000, default: 10 },
    maxUploadSizeBytes: { type: Number, min: 1, max: 50 * 1024 * 1024, default: 8 * 1024 * 1024 },
  },
  { timestamps: true }
);

export const PlatformSettings = mongoose.model('PlatformSettings', platformSettingsSchema);
