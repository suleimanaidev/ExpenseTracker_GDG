import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';

dotenv.config();

const email = process.argv[2]?.trim().toLowerCase();

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node scripts/create-admin.js user@example.com');
  process.exitCode = 1;
} else {
  try {
    await connectDB();
    const user = await User.findOneAndUpdate({ email }, { $set: { isAdmin: true } }, { new: true });
    if (!user) {
      throw new Error(`No user found for ${email}`);
    }
    console.log(`Admin privileges granted to ${user.email}`);
  } catch (error) {
    console.error(`Unable to grant admin privileges: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
