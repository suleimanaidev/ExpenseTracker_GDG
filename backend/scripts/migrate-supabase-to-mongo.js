import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Category } from '../models/Category.js';
import { Expense } from '../models/Expense.js';
import { amountToMinor } from '../utils/financeCalculations.js';

dotenv.config();

/**
 * Migration Script: Supabase (Postgres) -> MongoDB (Mongoose)
 *
 * Usage:
 *   node scripts/migrate-supabase-to-mongo.js [path-to-export.json]
 *
 * Expected JSON export format:
 * {
 *   "profiles": [
 *     { "id": "uuid-1", "email": "user@example.com", "full_name": "...", "monthly_budget": 50000, "currency": "PKR", "is_admin": false, "joined_at": "..." }
 *   ],
 *   "categories": [
 *     { "id": "cat-uuid-1", "user_id": "uuid-1", "name": "Food", "color": "#E07A5F", "emoji": "🍕" }
 *   ],
 *   "expenses": [
 *     { "id": "exp-uuid-1", "user_id": "uuid-1", "amount": 1200, "category": "Food", "category_id": "cat-uuid-1", "note": "Lunch", "spent_at": "..." }
 *   ]
 * }
 */

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ledger';

async function migrate(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`❌ Migration file not found: ${filePath}`);
    console.log('Provide a valid path to an exported JSON file.');
    process.exit(1);
  }

  const rawData = fs.readFileSync(filePath, 'utf-8');
  const exportData = JSON.parse(rawData);

  console.log(`Connecting to MongoDB at ${mongoUri}...`);
  await mongoose.connect(mongoUri);

  const uuidToMongoId = new Map();
  const catUuidToMongoId = new Map();

  // 1. Migrate Profiles -> Users
  console.log(`\n--- Migrating ${exportData.profiles?.length || 0} Profiles ---`);
  const defaultHash = await User.hashPassword('TemporaryPassword123!');

  for (const prof of exportData.profiles || []) {
    try {
      let user = await User.findOne({ email: prof.email.toLowerCase() });
      if (!user) {
        user = await User.create({
          email: prof.email.toLowerCase(),
          passwordHash: defaultHash,
          fullName: prof.full_name || '',
          isAdmin: Boolean(prof.is_admin),
          monthlyBudget: prof.monthly_budget ? parseFloat(prof.monthly_budget) : 50000,
          currency: prof.currency || 'PKR',
          createdAt: prof.joined_at ? new Date(prof.joined_at) : new Date(),
        });
        console.log(`Created user: ${user.email} (Temporary Password: TemporaryPassword123!)`);
      } else {
        console.log(`User already exists: ${user.email}, linking existing ObjectId`);
      }
      uuidToMongoId.set(prof.id, user._id);
    } catch (err) {
      console.error(`Error migrating profile for ${prof.email}:`, err.message);
    }
  }

  // 2. Migrate Categories
  console.log(`\n--- Migrating ${exportData.categories?.length || 0} Categories ---`);
  for (const cat of exportData.categories || []) {
    const mongoUserId = uuidToMongoId.get(cat.user_id);
    if (!mongoUserId) {
      console.warn(`Skipping category "${cat.name}": user UUID ${cat.user_id} not mapped`);
      continue;
    }

    try {
      const category = await Category.findOneAndUpdate(
        { user: mongoUserId, name: cat.name.trim() },
        {
          $setOnInsert: {
            user: mongoUserId,
            name: cat.name.trim(),
            color: cat.color || '#00A19B',
            icon: cat.emoji || '📦',
          },
        },
        { upsert: true, new: true }
      );
      catUuidToMongoId.set(cat.id, category._id);
    } catch (err) {
      console.error(`Error migrating category "${cat.name}":`, err.message);
    }
  }

  // 3. Migrate Expenses
  console.log(`\n--- Migrating ${exportData.expenses?.length || 0} Expenses ---`);
  let migratedCount = 0;
  for (const exp of exportData.expenses || []) {
    const mongoUserId = uuidToMongoId.get(exp.user_id);
    if (!mongoUserId) {
      console.warn(`Skipping expense: user UUID ${exp.user_id} not mapped`);
      continue;
    }

    const catRef = exp.category_id ? catUuidToMongoId.get(exp.category_id) || null : null;
    const expenseDate = exp.spent_at ? new Date(exp.spent_at) : exp.created_at ? new Date(exp.created_at) : new Date();

    try {
      await Expense.create({
        user: mongoUserId,
        category: exp.category || 'Other',
        categoryRef: catRef,
        amountMinor: amountToMinor(exp.amount),
        note: exp.note || '',
        date: expenseDate,
        createdAt: exp.created_at ? new Date(exp.created_at) : expenseDate,
      });
      migratedCount++;
    } catch (err) {
      console.error(`Error migrating expense:`, err.message);
    }
  }

  console.log(`\n✅ Migration Complete!`);
  console.log(`Migrated ${migratedCount} expenses successfully.`);
  console.log(`⚠️ Important: Supabase does not export password hashes. All imported users have been initialized with the temporary password: 'TemporaryPassword123!'. Users should be advised to log in and change their password.`);

  await mongoose.disconnect();
}

const targetPath = process.argv[2] || path.join(process.cwd(), 'supabase_export.json');
migrate(targetPath).catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
