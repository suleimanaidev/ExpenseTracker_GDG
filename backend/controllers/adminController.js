import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { Expense } from '../models/Expense.js';
import { Bill } from '../models/Bill.js';
import { Category } from '../models/Category.js';
import { AuditLog } from '../models/AuditLog.js';
import { AiUsage } from '../models/AiUsage.js';
import { PlatformSettings } from '../models/PlatformSettings.js';
import { pingDB } from '../config/db.js';
import { openBillFile } from '../services/billStorageService.js';
import { getPlatformStats } from '../services/statsService.js';
import { writeAuditLog } from '../services/auditService.js';
import { deleteBillFile } from '../services/billStorageService.js';

const statsCache = new Map();
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toObjectId = (value) => new mongoose.Types.ObjectId(value);
const parsePage = (value) => Math.min(Math.max(Number.parseInt(value, 10) || 1, 1), 100000);
const parseLimit = (value) => Math.min(Math.max(Number.parseInt(value, 10) || 25, 1), 100);

const dateFromRange = (range = '30d') => {
  const now = new Date();
  const start = new Date(now);
  if (range === '7d') start.setDate(start.getDate() - 7);
  else if (range === '90d') start.setDate(start.getDate() - 90);
  else if (range === '12m') start.setMonth(start.getMonth() - 12);
  else start.setDate(start.getDate() - 30);
  return { start, end: now };
};

const dateFilter = (from, to, field) => ({
  [field]: { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) },
});

const userMetricsPipeline = (match, sort, skip, limit) => [
  { $match: match },
  { $sort: sort },
  {
    $lookup: {
      from: 'expenses',
      let: { userId: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$user', '$$userId'] } } },
        { $group: { _id: null, count: { $sum: 1 }, totalMinor: { $sum: '$amountMinor' } } },
      ],
      as: 'expenseMetrics',
    },
  },
  { $lookup: { from: 'bills', localField: '_id', foreignField: 'user', as: 'bills' } },
  {
    $facet: {
      rows: [
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            id: { $toString: '$_id' },
            fullName: 1,
            email: 1,
            isAdmin: 1,
            isSuspended: 1,
            createdAt: 1,
            lastLoginAt: 1,
            monthlyBudget: 1,
            currency: 1,
            expenseCount: { $ifNull: [{ $arrayElemAt: ['$expenseMetrics.count', 0] }, 0] },
            totalSpent: { $divide: [{ $ifNull: [{ $arrayElemAt: ['$expenseMetrics.totalMinor', 0] }, 0] }, 100] },
            billsCount: { $size: '$bills' },
          },
        },
      ],
      total: [{ $count: 'count' }],
    },
  },
];

export const getStats = async (req, res, next) => {
  try {
    const stats = await getPlatformStats();
    return res.json(stats);
  } catch (err) {
    next(err);
  }
};

export const getUsers = async (req, res, next) => {
  try {
    const {
      search = '',
      role = 'all',
      status = 'all',
      sort = '-createdAt',
      page = 1,
      limit = 25,
    } = req.query;
    const match = {};
    if (search.trim()) {
      const expression = new RegExp(escapeRegex(search.trim()), 'i');
      match.$or = [{ email: expression }, { fullName: expression }];
    }
    if (role === 'admin') match.isAdmin = true;
    if (role === 'user') match.isAdmin = false;
    if (status === 'active') match.isSuspended = { $ne: true };
    if (status === 'suspended') match.isSuspended = true;

    const sortField = ['createdAt', 'email', 'lastLoginAt', 'fullName'].includes(String(sort).replace(/^-/, ''))
      ? String(sort).replace(/^-/, '')
      : 'createdAt';
    const sortDirection = String(sort).startsWith('-') ? -1 : 1;
    const pageNumber = parsePage(page);
    const pageSize = parseLimit(limit);
    const [result] = await User.aggregate(userMetricsPipeline(
      match,
      { [sortField]: sortDirection },
      (pageNumber - 1) * pageSize,
      pageSize
    ));
    return res.json({
      users: result.rows,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total: result.total[0]?.count || 0,
        pages: Math.ceil((result.total[0]?.count || 0) / pageSize),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getCharts = async (req, res, next) => {
  try {
    const range = ['7d', '30d', '90d', '12m'].includes(req.query.range) ? req.query.range : '30d';
    const { start, end } = dateFromRange(range);
    const [signups, volume, categories, billsByStatus] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Expense.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, totalMinor: { $sum: '$amountMinor' } } },
        { $sort: { _id: 1 } },
      ]),
      Expense.aggregate([
        { $group: { _id: '$category', totalMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
        { $sort: { totalMinor: -1 } },
        { $limit: 10 },
      ]),
      Bill.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    ]);
    return res.json({
      signups,
      volume: volume.map((row) => ({ ...row, total: row.totalMinor / 100 })),
      categories: categories.map((row) => ({ ...row, total: row.totalMinor / 100 })),
      billsByStatus,
    });
  } catch (err) {
    next(err);
  }
};

export const getOverviewStats = async (req, res, next) => {
  try {
    const range = ['7d', '30d', '90d', '12m'].includes(req.query.range) ? req.query.range : '30d';
    const cached = statsCache.get(range);
    if (cached && cached.expiresAt > Date.now()) return res.json(cached.value);
    const { start, end } = dateFromRange(range);
    const [base, activeUsers, signups7, signups30, totalBills, scannedBills, unpaidBills] = await Promise.all([
      getPlatformStats(),
      User.countDocuments({ lastLoginAt: { $gte: new Date(Date.now() - 30 * 86400000) }, isSuspended: { $ne: true } }),
      User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
      User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } }),
      Bill.countDocuments(),
      Bill.countDocuments({ source: 'scanned' }),
      Bill.countDocuments({ $or: [{ status: 'unpaid' }, { status: 'overdue' }, { dueDate: { $lt: end }, status: 'unpaid' }] }),
    ]);
    const value = {
      ...base,
      activeUsers,
      newSignups7d: signups7,
      newSignups30d: signups30,
      totalBills,
      billsScannedByAi: scannedBills,
      unpaidOrOverdueBills: unpaidBills,
      rangeStart: start,
      rangeEnd: end,
    };
    statsCache.set(range, { value, expiresAt: Date.now() + 60000 });
    return res.json(value);
  } catch (err) {
    next(err);
  }
};

export const getUserDetail = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) return res.status(404).json({ error: 'User not found' });
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const [expenses, bills] = await Promise.all([
      Expense.find({ user: user._id }).sort({ date: -1 }).limit(20),
      Bill.find({ user: user._id }).sort({ issueDate: -1 }).limit(20).select('-file.storageKey'),
    ]);
    return res.json({
      user: user.toJSON(),
      expenses: expenses.map((item) => item.toJSON()),
      bills: bills.map((item) => item.toJSON()),
      aiUsage: [],
    });
  } catch (err) {
    next(err);
  }
};

const countAdmins = () => User.countDocuments({ isAdmin: true });

export const updateUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.isSuspended = req.body.suspended;
    await user.save();
    await writeAuditLog({ actor: req.user._id, action: user.isSuspended ? 'user.suspend' : 'user.unsuspend', targetType: 'User', targetId: user._id, metadata: { email: user.email }, req });
    return res.json({ user: user.toJSON() });
  } catch (err) {
    next(err);
  }
};

export const updateUserRole = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user._id.equals(req.user._id)) return res.status(400).json({ error: 'You cannot change your own admin role' });
    if (!req.body.isAdmin && user.isAdmin && (await countAdmins()) <= 1) {
      return res.status(400).json({ error: 'The last remaining admin cannot be demoted' });
    }
    user.isAdmin = req.body.isAdmin;
    await user.save();
    await writeAuditLog({ actor: req.user._id, action: user.isAdmin ? 'user.promote' : 'user.demote', targetType: 'User', targetId: user._id, metadata: { email: user.email }, req });
    return res.json({ user: user.toJSON() });
  } catch (err) {
    next(err);
  }
};

export const resetUserPassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const rawToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    await writeAuditLog({ actor: req.user._id, action: 'user.password_reset_requested', targetType: 'User', targetId: user._id, metadata: { email: user.email }, req });
    return res.json({ message: 'A one-time password reset token was generated and will be delivered through the configured reset channel.' });
  } catch (err) {
    next(err);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user._id.equals(req.user._id)) return res.status(400).json({ error: 'You cannot delete your own account' });
    if (user.isAdmin && (await countAdmins()) <= 1) return res.status(400).json({ error: 'The last remaining admin cannot be deleted' });
    if (req.body.confirmEmail !== user.email) return res.status(400).json({ error: 'Type the user email to confirm deletion' });
    const bills = await Bill.find({ user: user._id }).select('file.storageKey');
    await Promise.all(bills.map((bill) => deleteBillFile(bill.file?.storageKey)));
    await Promise.all([
      Expense.deleteMany({ user: user._id }),
      Category.deleteMany({ user: user._id }),
      Bill.deleteMany({ user: user._id }),
      User.deleteOne({ _id: user._id }),
    ]);
    await writeAuditLog({ actor: req.user._id, action: 'user.delete', targetType: 'User', targetId: user._id, metadata: { email: user.email }, req });
    return res.json({ message: 'User and related data deleted' });
  } catch (err) {
    next(err);
  }
};

export const getAiUsage = async (req, res, next) => {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const [rows, summary] = await Promise.all([
      AiUsage.find({})
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('user', 'email fullName')
        .lean(),
      AiUsage.aggregate([
        {
          $group: {
            _id: null,
            calls: { $sum: 1 },
            successes: { $sum: { $cond: ['$success', 1, 0] } },
            averageLatencyMs: { $avg: '$latencyMs' },
          },
        },
      ]),
    ]);
    return res.json({
      usage: rows,
      summary: summary[0] || { calls: 0, successes: 0, averageLatencyMs: 0 },
      pagination: { page, limit },
    });
  } catch (err) {
    next(err);
  }
};

export const getAuditLogs = async (req, res, next) => {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const filter = {};
    if (req.query.action) filter.action = new RegExp(`^${escapeRegex(req.query.action)}$`);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('actor', 'email fullName')
        .lean(),
      AuditLog.countDocuments(filter),
    ]);
    return res.json({ logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const sendCsv = (res, filename, headers, rows) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send([headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n'));
};

const parseDateFilters = (query, field) => {
  const filter = {};
  if (query.from || query.to) filter[field] = {};
  if (query.from) filter[field].$gte = new Date(query.from);
  if (query.to) filter[field].$lte = new Date(query.to);
  return filter;
};

export const getPlatformExpenses = async (req, res, next) => {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const filter = { ...parseDateFilters(req.query, 'date') };
    if (req.query.category) filter.category = new RegExp(`^${escapeRegex(req.query.category)}$`, 'i');
    if (mongoose.Types.ObjectId.isValid(req.query.user)) filter.user = req.query.user;
    const [expenses, total] = await Promise.all([
      Expense.find(filter).sort({ date: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'email fullName').lean(),
      Expense.countDocuments(filter),
    ]);
    return res.json({ expenses, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

export const getPlatformBills = async (req, res, next) => {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const filter = { ...parseDateFilters(req.query, 'issueDate') };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.vendor) filter.vendor = new RegExp(escapeRegex(req.query.vendor), 'i');
    if (mongoose.Types.ObjectId.isValid(req.query.user)) filter.user = req.query.user;
    const [bills, total] = await Promise.all([
      Bill.find(filter).sort({ issueDate: -1 }).skip((page - 1) * limit).limit(limit).select('-file.storageKey').populate('user', 'email fullName').lean(),
      Bill.countDocuments(filter),
    ]);
    return res.json({ bills, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

export const getAdminBillFile = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.billId)) return res.status(404).json({ error: 'Bill not found' });
    const bill = await Bill.findById(req.params.billId).select('file user');
    if (!bill?.file?.storageKey) return res.status(404).json({ error: 'Attachment not found' });
    const file = await openBillFile(bill.file.storageKey);
    await writeAuditLog({
      actor: req.user._id,
      action: 'private_file.view',
      targetType: 'Bill',
      targetId: bill._id,
      metadata: { ownerId: String(bill.user) },
      req,
    });
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.filename.replace(/["\r\n]/g, '_')}"`);
    return file.stream.pipe(res);
  } catch (err) {
    next(err);
  }
};

export const exportData = async (req, res, next) => {
  try {
    const type = req.params.type;
    const limit = 10000;
    if (type === 'users') {
      const users = await User.find({}).sort({ createdAt: -1 }).limit(limit).lean();
      return sendCsv(res, 'ledger-users.csv', ['id', 'email', 'fullName', 'role', 'status', 'joinedAt', 'lastLoginAt'], users.map((u) => [
        u._id, u.email, u.fullName, u.isAdmin ? 'admin' : 'user', u.isSuspended ? 'suspended' : 'active', u.createdAt, u.lastLoginAt,
      ]));
    }
    if (type === 'expenses') {
      const expenses = await Expense.find({}).sort({ date: -1 }).limit(limit).populate('user', 'email').lean();
      return sendCsv(res, 'ledger-expenses.csv', ['id', 'userEmail', 'category', 'amount', 'date', 'note'], expenses.map((e) => [
        e._id, e.user?.email, e.category, e.amountMinor / 100, e.date, e.note,
      ]));
    }
    if (type === 'bills') {
      const bills = await Bill.find({}).sort({ issueDate: -1 }).limit(limit).populate('user', 'email').lean();
      return sendCsv(res, 'ledger-bills.csv', ['id', 'userEmail', 'vendor', 'total', 'currency', 'status', 'issueDate'], bills.map((b) => [
        b._id, b.user?.email, b.vendor, b.totalMinor / 100, b.currency, b.status, b.issueDate,
      ]));
    }
    return res.status(400).json({ error: 'Export type must be users, expenses, or bills' });
  } catch (err) {
    next(err);
  }
};

export const getAdminHealth = async (req, res, next) => {
  try {
    const startedAt = Date.now();
    const database = await pingDB();
    return res.json({
      api: 'ok',
      database,
      databaseLatencyMs: Date.now() - startedAt,
      gemini: process.env.GEMINI_API_KEY ? 'configured' : 'not_configured',
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (err) {
    next(err);
  }
};

export const getAdminSettings = async (req, res, next) => {
  try {
    const settings = await PlatformSettings.findOneAndUpdate({ key: 'default' }, {}, { upsert: true, new: true, setDefaultsOnInsert: true });
    return res.json({ settings });
  } catch (err) {
    next(err);
  }
};

export const updateAdminSettings = async (req, res, next) => {
  try {
    const settings = await PlatformSettings.findOneAndUpdate(
      { key: 'default' },
      { $set: req.body },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await writeAuditLog({ actor: req.user._id, action: 'settings.update', targetType: 'PlatformSettings', targetId: settings._id, metadata: req.body, req });
    return res.json({ settings });
  } catch (err) {
    next(err);
  }
};

export const updateUserAiLimit = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $set: { aiDailyLimit: req.body.limit } },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    await writeAuditLog({
      actor: req.user._id,
      action: 'user.ai_limit.update',
      targetType: 'User',
      targetId: user._id,
      metadata: { limit: req.body.limit },
      req,
    });
    return res.json({ user: user.toJSON() });
  } catch (err) {
    next(err);
  }
};

export const getUserExpenses = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(404).json({ error: 'User not found' });
    }

    const expenses = await Expense.find({ user: userId }).sort({ date: -1 });

    return res.json({
      expenses: expenses.map((e) => e.toJSON()),
    });
  } catch (err) {
    next(err);
  }
};
