import { Category, DEFAULT_CATEGORIES } from '../models/Category.js';

export const getCategories = async (req, res, next) => {
  try {
    let categories = await Category.find({ user: req.user._id }).sort({ createdAt: 1 });

    // Fallback seed categories if empty
    if (!categories || categories.length === 0) {
      const seedData = DEFAULT_CATEGORIES.map((c) => ({
        user: req.user._id,
        name: c.name,
        color: c.color,
        icon: c.icon,
      }));
      categories = await Category.insertMany(seedData);
    }

    return res.json(categories.map((c) => c.toJSON()));
  } catch (err) {
    next(err);
  }
};

export const createCategory = async (req, res, next) => {
  try {
    const { name, color, emoji } = req.body;

    const existing = await Category.findOne({
      user: req.user._id,
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    });

    if (existing) {
      return res.status(400).json({ error: 'A category with this name already exists' });
    }

    const category = await Category.create({
      user: req.user._id,
      name: name.trim(),
      color: color || '#00A19B',
      icon: emoji || '📌',
    });

    return res.status(201).json(category.toJSON());
  } catch (err) {
    next(err);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const { name } = req.params;

    const category = await Category.findOneAndDelete({
      user: req.user._id,
      name: { $regex: new RegExp(`^${decodeURIComponent(name).trim()}$`, 'i') },
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    return res.json({
      message: 'Category removed successfully',
      data: category.toJSON(),
    });
  } catch (err) {
    next(err);
  }
};
