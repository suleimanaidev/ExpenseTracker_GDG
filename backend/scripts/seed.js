import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Category, DEFAULT_CATEGORIES } from '../models/Category.js';
import { Expense } from '../models/Expense.js';
import { amountToMinor } from '../utils/financeCalculations.js';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ledger';

async function seed() {
  console.log(`Connecting to MongoDB: ${mongoUri}...`);
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  console.log('Cleaning up existing demo users and records...');
  const demoEmails = ['admin@ledger.app', 'user@ledger.app', 'demo@ledger.app'];
  const existingUsers = await User.find({ email: { $in: demoEmails } });
  const userIds = existingUsers.map((u) => u._id);

  if (userIds.length > 0) {
    await Expense.deleteMany({ user: { $in: userIds } });
    await Category.deleteMany({ user: { $in: userIds } });
    await User.deleteMany({ _id: { $in: userIds } });
  }

  // 1. Create Admin User
  console.log('Creating Admin User: admin@ledger.app / AdminPassword123!');
  const adminPasswordHash = await User.hashPassword('AdminPassword123!');
  const admin = await User.create({
    email: 'admin@ledger.app',
    passwordHash: adminPasswordHash,
    fullName: 'System Administrator',
    isAdmin: true,
    monthlyBudget: 150000,
    currency: 'PKR',
  });

  const adminCategories = await Category.insertMany(
    DEFAULT_CATEGORIES.map((c) => ({
      user: admin._id,
      name: c.name,
      color: c.color,
      icon: c.icon,
    }))
  );

  // 2. Create Standard Demo User
  console.log('Creating Demo User: user@ledger.app / UserPassword123!');
  const userPasswordHash = await User.hashPassword('UserPassword123!');
  const user = await User.create({
    email: 'user@ledger.app',
    passwordHash: userPasswordHash,
    fullName: 'Suleiman Ahmed',
    isAdmin: false,
    monthlyBudget: 50000,
    currency: 'PKR',
  });

  const userCategories = await Category.insertMany(
    DEFAULT_CATEGORIES.map((c) => ({
      user: user._id,
      name: c.name,
      color: c.color,
      icon: c.icon,
    }))
  );

  // 3. Create Sample Expenses for Demo User
  console.log('Seeding sample expenses for demo user...');
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const foodCat = userCategories.find((c) => c.name.includes('Food')) || userCategories[0];
  const drinksCat = userCategories.find((c) => c.name.includes('Drinks')) || userCategories[1];
  const transportCat = userCategories.find((c) => c.name.includes('Transport')) || userCategories[5];
  const shoppingCat = userCategories.find((c) => c.name.includes('Shopping')) || userCategories[2];
  const billsCat = userCategories.find((c) => c.name.includes('Utilities')) || userCategories[4];

  const sampleExpenses = [
    {
      user: user._id,
      category: foodCat.name,
      categoryRef: foodCat._id,
      amountMinor: amountToMinor(1450),
      note: 'Dinner at Italian bistro',
      date: new Date(year, month, Math.max(1, now.getDate() - 1)),
    },
    {
      user: user._id,
      category: drinksCat.name,
      categoryRef: drinksCat._id,
      amountMinor: amountToMinor(650),
      note: 'Iced Latte & fresh milk',
      date: new Date(year, month, Math.max(1, now.getDate() - 2)),
    },
    {
      user: user._id,
      category: transportCat.name,
      categoryRef: transportCat._id,
      amountMinor: amountToMinor(2100),
      note: 'Fuel refill',
      date: new Date(year, month, Math.max(1, now.getDate() - 3)),
    },
    {
      user: user._id,
      category: shoppingCat.name,
      categoryRef: shoppingCat._id,
      amountMinor: amountToMinor(8900),
      note: 'Noise cancelling headphones',
      date: new Date(year, month, Math.max(1, now.getDate() - 4)),
    },
    {
      user: user._id,
      category: billsCat.name,
      categoryRef: billsCat._id,
      amountMinor: amountToMinor(14200),
      note: 'High-speed fiber internet bill',
      date: new Date(year, month, Math.max(1, now.getDate() - 5)),
    },
  ];

  await Expense.insertMany(sampleExpenses);

  console.log('✅ Seeding completed successfully!');
  console.log('\n--- Test Credentials ---');
  console.log('Admin: admin@ledger.app / AdminPassword123!');
  console.log('User:  user@ledger.app  / UserPassword123!');
  console.log('------------------------\n');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seeding error:', err);
  process.exit(1);
});
