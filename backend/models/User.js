import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    fullName: {
      type: String,
      default: '',
      trim: true,
    },
    isAdmin: {
      type: Boolean,
      default: false,
      index: true,
    },
    isSuspended: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
      index: true,
    },
    passwordResetTokenHash: {
      type: String,
      select: false,
      default: null,
    },
    passwordResetExpiresAt: {
      type: Date,
      select: false,
      default: null,
    },
    aiDailyLimit: {
      type: Number,
      min: 0,
      max: 10000,
      default: 10,
    },
    monthlyBudget: {
      type: Number,
      default: 50000,
      min: [0, 'Budget must be non-negative'],
    },
    currency: {
      type: String,
      enum: ['PKR', 'USD', 'EUR', 'GBP', 'INR'],
      default: 'PKR',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        // Frontend compatibility aliases
        ret.full_name = ret.fullName;
        ret.monthly_budget = ret.monthlyBudget;
        ret.is_admin = ret.isAdmin;
        ret.joined_at = ret.createdAt;
        return ret;
      },
    },
  }
);

// Method to verify password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.passwordHash);
};

userSchema.index({ createdAt: -1 });

// Static helper to hash password with cost factor 12
userSchema.statics.hashPassword = async function (password) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

export const User = mongoose.model('User', userSchema);
