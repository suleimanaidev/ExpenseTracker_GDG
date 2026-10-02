import mongoose from 'mongoose';

export const DEFAULT_CATEGORIES = [
  { name: 'Food & Dining',  color: '#E07A5F', icon: '🍕' },
  { name: 'Drinks & Milk',  color: '#4EA8DE', icon: '🥛' },
  { name: 'Shopping',       color: '#F2CC8F', icon: '🛍️' },
  { name: 'Housing',        color: '#81B29A', icon: '🏠' },
  { name: 'Utilities',      color: '#3D405B', icon: '⚡' },
  { name: 'Transport',      color: '#6B705C', icon: '🚗' },
  { name: 'Entertainment',  color: '#9B5DE5', icon: '🎬' },
  { name: 'Health',         color: '#00A19B', icon: '💊' },
  { name: 'Other',          color: '#747982', icon: '📦' }
];

const categorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
    },
    color: {
      type: String,
      default: '#00A19B',
      match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Must be a valid hex color'],
    },
    icon: {
      type: String,
      default: '📦',
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
        // Frontend compatibility
        ret.emoji = ret.icon;
        ret.user_id = ret.user.toString();
        return ret;
      },
    },
  }
);

// Compound unique index so a user cannot have duplicate categories with the same name
categorySchema.index({ user: 1, name: 1 }, { unique: true });

export const Category = mongoose.model('Category', categorySchema);
