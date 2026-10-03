import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Category name is stored directly to preserve historical transaction records
    // even if a custom category is renamed or deleted.
    category: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
    },
    // Optional reference to Category document
    categoryRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    // Stored as integer minor units (paisa / cents: amount * 100) to eliminate
    // float rounding errors and enable fast aggregation in MongoDB.
    amountMinor: {
      type: Number,
      required: [true, 'Amount is required'],
      validate: {
        validator: function (v) {
          return Number.isInteger(v) && v >= 0;
        },
        message: 'Amount in minor units must be a non-negative integer',
      },
    },
    note: {
      type: String,
      default: '',
      trim: true,
      maxLength: [500, 'Note cannot exceed 500 characters'],
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        ret.amount = ret.amountMinor / 100;
        ret.spent_at = ret.date ? ret.date.toISOString() : ret.createdAt?.toISOString();
        ret.user_id = ret.user.toString();
        ret.category_id = ret.categoryRef ? ret.categoryRef.toString() : null;
        delete ret._id;
        delete ret.__v;
        delete ret.amountMinor;
        delete ret.categoryRef;
        return ret;
      },
    },
  }
);

// Compound index for user queries sorted by date
expenseSchema.index({ user: 1, date: -1 });
expenseSchema.index({ createdAt: -1 });

export const Expense = mongoose.model('Expense', expenseSchema);
