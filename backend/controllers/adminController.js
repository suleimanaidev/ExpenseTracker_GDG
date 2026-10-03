import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { Expense } from '../models/Expense.js';
import { Bill } from '../models/Bill.js';
import { Category } from '../models/Category.js';
import { AuditLog } from '../models/AuditLog.js';
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
