import { User } from '../models/User.js';
import { Expense } from '../models/Expense.js';
import { Category, DEFAULT_CATEGORIES } from '../models/Category.js';
import { checkUserBudget } from './expenseController.js';

export const getProfile = async (req, res) => {
  return res.json(req.user.toJSON());
};

export const updateProfile = async (req, res, next) => {
  try {
    const { fullName, full_name, monthlyBudget, monthly_budget, currency } = req.body;

    // Strict allowlist: isAdmin and email can NEVER be changed through this endpoint
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resolvedName = fullName !== undefined ? fullName : full_name;
    const resolvedBudget = monthlyBudget !== undefined ? monthlyBudget : monthly_budget;

    if (resolvedName !== undefined) {
      user.fullName = resolvedName.trim();
    }
    if (resolvedBudget !== undefined) {
      const b = parseFloat(resolvedBudget);
      if (!isNaN(b) && b >= 0) user.monthlyBudget = b;
    }
    if (currency !== undefined) {
      const allowedCurrencies = ['PKR', 'USD', 'EUR', 'GBP', 'INR'];
      if (allowedCurrencies.includes(currency)) {
        user.currency = currency;
      }
    }

    await user.save();
    return res.json(user.toJSON());
  } catch (err) {
    next(err);
  }
};

export const updateBudget = async (req, res, next) => {
  try {
    const { monthly_budget, monthlyBudget } = req.body;
    const val = monthly_budget !== undefined ? monthly_budget : monthlyBudget;

    if (val === undefined || isNaN(parseFloat(val)) || parseFloat(val) < 0) {
      return res.status(400).json({ error: 'Valid budget limit required' });
    }

    const budgetVal = parseFloat(val);
    const user = await User.findById(req.user._id);
    user.monthlyBudget = budgetVal;
    await user.save();

    const budgetCheck = await checkUserBudget(user._id, budgetVal);

    return res.json({
      profile: user.toJSON(),
      ...budgetCheck,
    });
  } catch (err) {
    next(err);
  }
};

export const clearUserData = async (req, res, next) => {
  try {
    const { confirm, confirmation } = req.body || {};
    if (confirm !== true && confirmation !== true && confirmation !== 'CLEAR') {
      return res.status(400).json({
        error: 'Confirmation required in request body: { "confirm": true }',
      });
    }

    const userId = req.user._id;

    // Remove expenses and categories scoped to this user only
    await Expense.deleteMany({ user: userId });
    await Category.deleteMany({ user: userId });

    // Reset user profile settings
    const user = await User.findById(userId);
    user.monthlyBudget = 50000;
    user.currency = 'PKR';
    await user.save();

    // Re-seed default categories for immediate usability
    const defaultData = DEFAULT_CATEGORIES.map((c) => ({
      user: userId,
      name: c.name,
      color: c.color,
      icon: c.icon,
    }));
    await Category.insertMany(defaultData);

    return res.json({ message: 'User database cleared successfully' });
  } catch (err) {
    next(err);
  }
};
