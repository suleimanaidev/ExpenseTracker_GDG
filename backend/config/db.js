import mongoose from 'mongoose';

let isConnected = false;

export const connectDB = async (uri) => {
  const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ledger';

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`⚡ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    isConnected = false;
    console.warn(`⚠️ MongoDB connection warning: ${error.message}`);
    // Do not terminate process immediately so health/demo endpoints can remain responsive
    return null;
  }
};

export const isDBConnected = () => {
  return mongoose.connection.readyState === 1;
};

export const pingDB = async () => {
  if (!isDBConnected()) {
    return { ok: false, error: 'Database disconnected' };
  }
  try {
    await mongoose.connection.db.admin().ping();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};
