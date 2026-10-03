import mongoose from 'mongoose';

/**
 * A payable bill or issued invoice.
 *
 * Money is stored exclusively as integer minor units (rupees/piastres x100).
 * Floating point currency is never persisted anywhere in this schema.
 *
 * `status` is stored as paid/unpaid only. `overdue` is a *derived* state
 * computed by `resolveBillStatus()` from `dueDate` — persisting it would let it
 * silently rot into a lie the moment a due date passes or the clock moves.
 * The enum still lists `overdue` so the documented contract is honoured on the
 * way in; writes normalize it to `unpaid`.
 */

const billItemSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: [true, 'Item description is required'],
      trim: true,
      maxlength: 300,
    },
    quantity: { type: Number, default: 1 },
    // Minor units, consistent with the bill totals.
    unitPriceMinor: { type: Number, default: 0 },
    lineTotalMinor: { type: Number, default: 0 },
  },
  { _id: false }
);

const fileSchema = new mongoose.Schema(
  {
    // GridFS ObjectId (or Cloudinary asset id). Never exposed as a public URL.
    storageKey: { type: String, default: null },
    mimeType: { type: String, default: null },
    size: { type: Number, default: null },
    // Sanitized on write; never trusted from the client.
    originalName: { type: String, default: null },
  },
  { _id: false }
);

const billSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // The linked spending transaction. Exactly one Expense per Bill.
    expense: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expense',
      default: null,
    },

    vendor: {
      type: String,
      required: [true, 'Vendor is required'],
      trim: true,
      maxlength: 200,
    },

    // Normalized to `undefined` whenever there is no usable number, so the
    // partial unique index below ignores unnumbered bills entirely.
    //
    // Every "no invoice number" spelling a client can send — the field omitted,
    // `null`, `''` or whitespace — collapses to the same absent path. Mongoose
    // omits `undefined` on save, which is the only way to keep the field out of
    // the index; an explicit `null` would still be indexed and would make every
    // unnumbered bill collide with every other one.
    invoiceNumber: {
      type: String,
      trim: true,
      maxlength: 120,
      set: (value) => {
        if (value === null || value === undefined) return undefined;
        const trimmed = String(value).trim();
        return trimmed === '' ? undefined : trimmed;
      },
    },

    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, default: null },

    currency: {
      type: String,
      enum: ['PKR', 'USD', 'EUR', 'GBP', 'INR'],
      default: 'PKR',
    },

    subtotalMinor: { type: Number, default: null },
    taxMinor: { type: Number, default: 0 },
    // Percentage retained for manual invoices; informational only.
    taxRatePercent: { type: Number, default: null, min: 0, max: 100 },
    discountMinor: { type: Number, default: 0 },
    totalMinor: {
      type: Number,
      required: [true, 'Total is required'],
      validate: {
        validator: function (v) {
          return Number.isInteger(v) && v >= 0;
        },
        message: 'Total must be a non-negative integer in minor units',
      },
    },

    items: {
      type: [billItemSchema],
      default: [],
    },

    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      maxlength: 50,
    },
    categoryRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },

    status: {
      type: String,
      enum: ['paid', 'unpaid', 'overdue'],
      default: 'unpaid',
      index: true,
    },
    paidAt: { type: Date, default: null },

    file: { type: fileSchema, default: () => ({}) },

    source: {
      type: String,
      enum: ['scanned', 'manual'],
      default: 'manual',
    },

    // Self-reported confidence from the AI reader, shown during review.
    confidence: { type: Number, default: null, min: 0, max: 1 },

    notes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        const major = (m) => (m === null || m === undefined ? null : m / 100);

        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;

        ret.total = major(ret.totalMinor);
        ret.subtotal = major(ret.subtotalMinor);
        ret.tax = major(ret.taxMinor);
        ret.discount = major(ret.discountMinor);
        ret.amount = major(ret.totalMinor);

        ret.items = (ret.items || []).map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: major(i.unitPriceMinor),
          lineTotal: major(i.lineTotalMinor),
        }));

        // Calendar days, rendered in local terms. `toISOString()` would convert
        // local midnight to UTC and roll the date back one day east of UTC,
        // making the stored document, the JSON and the date input disagree.
        const dateOnly = (value) => {
          if (!value) return null;
          const d = new Date(value);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };

        ret.issue_date = dateOnly(ret.issueDate);
        ret.due_date = dateOnly(ret.dueDate);
        // The field is deliberately absent in storage when there is no invoice
        // number, so the API reports it as an explicit null — a client can rely
        // on the key being present either way.
        ret.invoice_number = ret.invoiceNumber ?? null;
        ret.expense_id = ret.expense ? ret.expense.toString() : null;
        ret.category_id = ret.categoryRef ? ret.categoryRef.toString() : null;
        ret.user_id = ret.user.toString();
        // Signals whether an attachment preview should be offered.
        ret.hasFile = Boolean(ret.file?.storageKey);

        return ret;
      },
    },
  }
);

// Statement and list queries: "all bills for this user in this month".
billSchema.index({ user: 1, issueDate: -1 });

// One bill per vendor+invoice number per user.
//
// A *partial* index over documents where `invoiceNumber` is actually a string,
// rather than a `sparse` one. Sparse only skips documents whose field is
// entirely missing, so a stored `null` or `''` would still be indexed and would
// collide with the next unnumbered bill from the same vendor. Matching on the
// type makes "has a usable invoice number" the literal indexing condition, so
// the rule holds no matter how the field arrived.
billSchema.index(
  { user: 1, vendor: 1, invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { invoiceNumber: { $type: 'string' } } }
);

export const Bill = mongoose.model('Bill', billSchema);