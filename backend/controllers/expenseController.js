import mongoose from 'mongoose';
import { Expense } from '../models/Expense.js';
import { amountToMinor, calculateBudgetStatus } from '../utils/financeCalculations.js';

// Helper: Calculate total spent for the current month and compare with user budget
export const checkUserBudget = async (userId, monthlyBudget) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const result = await Expense.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        date: { $gte: startOfMonth, $lte: endOfMonth },
      },
    },
    {
      $group: {
        _id: null,
        totalMinor: { $sum: '$amountMinor' },
      },
    },
  ]);

  const totalSpent = result.length > 0 ? result[0].totalMinor / 100 : 0;
  return calculateBudgetStatus(totalSpent, monthlyBudget);
};

export const getExpenses = async (req, res, next) => {
  try {
    const { dateFrom, dateTo, category, search, sortBy, page, limit } = req.query;

    const query = { user: req.user._id };

    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) {
        query.date.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Include full day if only date is passed
        const end = new Date(dateTo);
        if (dateTo.length <= 10) {
          end.setHours(23, 59, 59, 999);
        }
        query.date.$lte = end;
      }
    }

    if (category && category !== 'All') {
      query.category = category;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ note: regex }, { category: regex }];
    }

    // Sort order
    let sortObj = { date: -1, createdAt: -1 };
    if (sortBy === 'date-asc') {
      sortObj = { date: 1, createdAt: 1 };
    } else if (sortBy === 'date-desc') {
      sortObj = { date: -1, createdAt: -1 };
    } else if (sortBy === 'amount-asc') {
      sortObj = { amountMinor: 1 };
    } else if (sortBy === 'amount-desc') {
      sortObj = { amountMinor: -1 };
    }

    let expensesQuery = Expense.find(query).sort(sortObj);

    // Optional pagination
    if (page && limit) {
      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = Math.max(1, parseInt(limit, 10));
      expensesQuery = expensesQuery.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const expenses = await expensesQuery.exec();

    // Map to JSON ensuring contract shape with `id`, `spent_at`, `amount`
    return res.json(expenses.map((e) => e.toJSON()));
  } catch (err) {
    next(err);
  }
};

export const createExpense = async (req, res, next) => {
  try {
    const { amount, category, category_id, note, spent_at, date } = req.body;

    const amountMinor = amountToMinor(amount);
    const expenseDate = spent_at ? new Date(spent_at) : date ? new Date(date) : new Date();

    let validCatRef = null;
    if (category_id && mongoose.Types.ObjectId.isValid(category_id)) {
      validCatRef = new mongoose.Types.ObjectId(category_id);
    }

    const expense = await Expense.create({
      user: req.user._id,
      category: category.trim(),
      categoryRef: validCatRef,
      amountMinor,
      note: (note || '').trim(),
      date: expenseDate,
    });

    const budgetStatus = await checkUserBudget(req.user._id, req.user.monthlyBudget);

    return res.status(201).json({
      expense: expense.toJSON(),
      ...budgetStatus,
    });
  } catch (err) {
    next(err);
  }
};

export const updateExpense = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Scoped by req.user._id to prevent horizontal privilege escalation
    const expense = await Expense.findOne({ _id: id, user: req.user._id });
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const { amount, category, category_id, note, spent_at, date } = req.body;

    if (amount !== undefined) {
      expense.amountMinor = amountToMinor(amount);
    }
    if (category !== undefined) {
      expense.category = category.trim();
    }
    if (category_id !== undefined) {
      expense.categoryRef = mongoose.Types.ObjectId.isValid(category_id)
        ? new mongoose.Types.ObjectId(category_id)
        : null;
    }
    if (note !== undefined) {
      expense.note = (note || '').trim();
    }
    if (spent_at !== undefined || date !== undefined) {
      expense.date = new Date(spent_at || date);
    }

    await expense.save();

    const budgetStatus = await checkUserBudget(req.user._id, req.user.monthlyBudget);

    return res.json({
      expense: expense.toJSON(),
      ...budgetStatus,
    });
  } catch (err) {
    next(err);
  }
};

export const deleteExpense = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Scoped by req.user._id
    const expense = await Expense.findOneAndDelete({ _id: id, user: req.user._id });
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    return res.json({
      message: 'Expense deleted successfully',
      data: expense.toJSON(),
    });
  } catch (err) {
    next(err);
  }
};
