import mongoose from 'mongoose';
import { Expense } from '../models/Expense.js';
import { getPlatformStats, getUsersWithMetrics } from '../services/statsService.js';

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
    const users = await getUsersWithMetrics();
    return res.json({ users });
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
