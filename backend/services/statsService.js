import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Expense } from '../models/Expense.js';

/**
 * Aggregates platform-wide statistical metrics using MongoDB aggregation pipelines.
 */
export const getPlatformStats = async () => {
  const totalUsers = await User.countDocuments();

  const expenseAgg = await Expense.aggregate([
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        totalAmountMinor: { $sum: '$amountMinor' },
      },
    },
  ]);

  const totalTransactions = expenseAgg.length > 0 ? expenseAgg[0].totalTransactions : 0;
  const totalAmountTracked = expenseAgg.length > 0 ? expenseAgg[0].totalAmountMinor / 100 : 0;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentUsersCount = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

  return {
    totalUsers,
    totalTransactions,
    totalAmountTracked,
    recentUsersCount,
  };
};

/**
 * Retrieves all registered users with their individual transaction count and spend total
 * using an optimized MongoDB $lookup aggregation pipeline.
 */
export const getUsersWithMetrics = async () => {
  const users = await User.aggregate([
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: 'expenses',
        localField: '_id',
        foreignField: 'user',
        as: 'userExpenses',
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: '$_id' },
        email: '$email',
        full_name: { $ifNull: ['$fullName', ''] },
        joined_at: '$createdAt',
        txCount: { $size: '$userExpenses' },
        totalSpent: {
          $divide: [
            { $sum: '$userExpenses.amountMinor' },
            100,
          ],
        },
      },
    },
  ]);

  return users;
};
