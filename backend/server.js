import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

// Configure CORS with local fallback and dynamic origin validation
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  FRONTEND_ORIGIN
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const isLocal = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1 || isLocal) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Initialize Supabase Admin client
const supabaseUrl = process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Middleware: Authenticate requests using Supabase JWT
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }
    const token = authHeader.split(' ')[1];
    
    // Verify user token with Supabase Auth
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized: ' + (error?.message || 'Invalid token') });
    }
    
    req.user = user;
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
};

// Middleware: Authorize request for Admin only
const requireAdmin = async (req, res, next) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', req.user.id)
      .single();

    if (error || !profile) {
      return res.status(403).json({ error: 'Access denied: Profile not found' });
    }

    if (!profile.is_admin) {
      return res.status(403).json({ error: 'Access denied: Administrator privileges required' });
    }

    next();
  } catch (err) {
    console.error('Admin authorization error:', err);
    return res.status(500).json({ error: 'Internal server error during authorization' });
  }
};

// Default Categories for fallback seeding
const DEFAULT_CATEGORIES = [
  { name: 'Food & Dining',  color: '#E07A5F', emoji: '🍕' },
  { name: 'Drinks & Milk',  color: '#4EA8DE', emoji: '🥛' },
  { name: 'Shopping',       color: '#F2CC8F', emoji: '🛍️' },
  { name: 'Housing',        color: '#81B29A', emoji: '🏠' },
  { name: 'Utilities',      color: '#3D405B', emoji: '⚡' },
  { name: 'Transport',      color: '#6B705C', emoji: '🚗' },
  { name: 'Entertainment',  color: '#9B5DE5', emoji: '🎬' },
  { name: 'Health',         color: '#00A19B', emoji: '💊' },
  { name: 'Other',          color: '#747982', emoji: '📦' }
];

// Helper: Calculate total spent for current month & check if it exceeds budget
const checkBudgetExceeded = async (userId, userBudget) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const { data: expenses, error } = await supabaseAdmin
      .from('expenses')
      .select('amount')
      .eq('user_id', userId)
      .gte('spent_at', startOfMonth)
      .lte('spent_at', endOfMonth);

    if (error) throw error;

    const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
    return {
      exceeded: totalSpent > userBudget,
      totalSpent,
      budget: userBudget,
      warning: totalSpent > userBudget ? `Warning: You have exceeded your monthly budget! Spent: ${totalSpent}, Budget: ${userBudget}` : null
    };
  } catch (err) {
    console.error('Error calculating budget:', err);
    return { exceeded: false, totalSpent: 0, budget: userBudget, warning: null };
  }
};

// ─── ROUTES ───

// Index Route
app.get('/', async (req, res) => {
  let supabaseConnected = false;
  let errorMsg = null;
  try {
    const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
    if (!error) {
      supabaseConnected = true;
    } else {
      errorMsg = error.message;
    }
  } catch (err) {
    errorMsg = err.message;
  }

  res.json({
    status: 'online',
    server: 'Ledger API Backend (Express)',
    supabase: {
      connected: supabaseConnected,
      projectUrl: supabaseUrl,
      error: errorMsg
    },
    endpoints: {
      health: '/api/health',
      config: '/api/config'
    }
  });
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: 'Ledger Backend (Express)', port: PORT });
});

// Expose public Supabase credentials for the frontend
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
  });
});

// Profile endpoints
app.get('/api/profile', authenticate, async (req, res) => {
  try {
    let { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // Profile not found - create it
      const { data: newProfile, error: createError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: req.user.id,
          email: req.user.email,
          monthly_budget: 50000,
          currency: 'PKR',
          joined_at: req.user.created_at || new Date().toISOString()
        })
        .select()
        .single();

      if (createError) throw createError;
      profile = newProfile;
      
      // Also seed default categories for the user just in case
      const seedData = DEFAULT_CATEGORIES.map(c => ({
        user_id: req.user.id,
        name: c.name,
        color: c.color,
        emoji: c.emoji
      }));
      await supabaseAdmin.from('categories').insert(seedData);
    } else if (error) {
      throw error;
    }

    res.json(profile);
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

app.put('/api/profile', authenticate, async (req, res) => {
  try {
    const { monthly_budget, currency } = req.body;
    const updateData = {};
    if (monthly_budget !== undefined) updateData.monthly_budget = parseFloat(monthly_budget);
    if (currency !== undefined) updateData.currency = currency;

    const { data: updatedProfile, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(updatedProfile);
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// Update Monthly Budget Specific Endpoint
app.put('/api/settings/budget', authenticate, async (req, res) => {
  try {
    const { monthly_budget } = req.body;
    if (monthly_budget === undefined || isNaN(parseFloat(monthly_budget))) {
      return res.status(400).json({ error: 'Valid budget limit required' });
    }

    const budgetVal = parseFloat(monthly_budget);
    const { data: updatedProfile, error } = await supabaseAdmin
      .from('profiles')
      .update({ monthly_budget: budgetVal })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    // Trigger check on budget exceeded status
    const budgetCheck = await checkBudgetExceeded(req.user.id, budgetVal);

    res.json({ profile: updatedProfile, ...budgetCheck });
  } catch (err) {
    console.error('Error setting budget:', err);
    res.status(500).json({ error: 'Failed to update monthly budget' });
  }
});

// Categories endpoints
app.get('/api/categories', authenticate, async (req, res) => {
  try {
    const { data: categories, error } = await supabaseAdmin
      .from('categories')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Fallback seed categories if list is empty
    if (!categories || categories.length === 0) {
      const seedData = DEFAULT_CATEGORIES.map(c => ({
        user_id: req.user.id,
        name: c.name,
        color: c.color,
        emoji: c.emoji
      }));
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('categories')
        .insert(seedData)
        .select();

      if (insertError) throw insertError;
      return res.json(inserted);
    }

    res.json(categories);
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.post('/api/categories', authenticate, async (req, res) => {
  try {
    const { name, color, emoji } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    // Insert custom category
    const { data, error } = await supabaseAdmin
      .from('categories')
      .insert({
        user_id: req.user.id,
        name,
        color: color || '#00A19B',
        emoji: emoji || '📌'
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating category:', err);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

app.delete('/api/categories/:name', authenticate, async (req, res) => {
  try {
    const { name } = req.params;
    const { data, error } = await supabaseAdmin
      .from('categories')
      .delete()
      .eq('user_id', req.user.id)
      .eq('name', name)
      .select();

    if (error) throw error;
    res.json({ message: 'Category removed successfully', data });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Expenses endpoints
app.get('/api/expenses', authenticate, async (req, res) => {
  try {
    const { dateFrom, dateTo, category } = req.query;

    let query = supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('user_id', req.user.id);

    if (dateFrom) query = query.gte('spent_at', dateFrom);
    if (dateTo) query = query.lte('spent_at', dateTo);
    if (category && category !== 'All') query = query.eq('category', category);

    const { data: expenses, error } = await query.order('spent_at', { ascending: false });

    if (error) throw error;
    res.json(expenses);
  } catch (err) {
    console.error('Error fetching expenses:', err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

app.post('/api/expenses', authenticate, async (req, res) => {
  try {
    const { amount, category, category_id, note, spent_at } = req.body;
    if (!amount || isNaN(parseFloat(amount))) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }
    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    const { data: expense, error } = await supabaseAdmin
      .from('expenses')
      .insert({
        user_id: req.user.id,
        amount: parseFloat(amount),
        category,
        category_id: category_id || null,
        note: note || '',
        spent_at: spent_at || new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Get current budget to calculate budget check
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('monthly_budget')
      .eq('id', req.user.id)
      .single();

    const budgetLimit = profile ? parseFloat(profile.monthly_budget) : 50000;
    const budgetCheck = await checkBudgetExceeded(req.user.id, budgetLimit);

    res.status(201).json({
      expense,
      ...budgetCheck
    });
  } catch (err) {
    console.error('Error creating expense:', err);
    res.status(500).json({ error: 'Failed to record expense' });
  }
});

app.put('/api/expenses/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, category, category_id, note, spent_at } = req.body;
    
    const updateData = {};
    if (amount !== undefined) updateData.amount = parseFloat(amount);
    if (category !== undefined) updateData.category = category;
    if (category_id !== undefined) updateData.category_id = category_id;
    if (note !== undefined) updateData.note = note;
    if (spent_at !== undefined) updateData.spent_at = spent_at;

    const { data: expense, error } = await supabaseAdmin
      .from('expenses')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('monthly_budget')
      .eq('id', req.user.id)
      .single();

    const budgetLimit = profile ? parseFloat(profile.monthly_budget) : 50000;
    const budgetCheck = await checkBudgetExceeded(req.user.id, budgetLimit);

    res.json({
      expense,
      ...budgetCheck
    });
  } catch (err) {
    console.error('Error updating expense:', err);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

app.delete('/api/expenses/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select();

    if (error) throw error;
    res.json({ message: 'Expense deleted successfully', data });
  } catch (err) {
    console.error('Error deleting expense:', err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// AI Insights endpoint
app.post('/api/insight', authenticate, async (req, res) => {
  try {
    const { clientData } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.json({
        insight: "Gemini API key is not configured on the backend server. Please set GEMINI_API_KEY in your .env file to enable spending insights.",
        runwayDate: "N/A"
      });
    }

    let budget = clientData?.budget || 50000;
    let currency = clientData?.currency || 'PKR';
    let transactions = clientData?.entries || [];

    const totalSpent = transactions.reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);
    const categoryTotals = {};
    transactions.forEach(t => {
      const cat = t.category || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(t.amount || 0);
    });

    const contextPrompt = `
You are Ledger AI, an expert personal finance assistant.
User's Financial Profile:
- Monthly Budget: ${currency} ${budget.toLocaleString()}
- Total Spent This Month: ${currency} ${totalSpent.toLocaleString()}
- Remaining Budget: ${currency} ${(budget - totalSpent).toLocaleString()}
- Spending Breakdown by Category: ${JSON.stringify(categoryTotals)}
- Recent Transactions (Count: ${transactions.length}): ${JSON.stringify(transactions.slice(0, 15))}
`;

    const systemInstruction = `${contextPrompt}\nGenerate a concise 3 to 4 sentence natural-language spending analysis.
Include:
1. Top spending category and total spent.
2. On-track status relative to monthly budget.
3. One specific actionable money-saving tip based on their spending.
4. Estimate a predicted "budget runway" date when the monthly budget will run out if current rate continues. Format runway date clearly.`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: `${systemInstruction}\n\nUser Question: Provide my monthly financial analysis and spending insight.` }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    const insight = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Unable to generate financial analysis.";

    res.json({
      insight,
      totalSpent,
      remaining: budget - totalSpent
    });
  } catch (err) {
    console.error('Error generating insight:', err);
    res.status(500).json({ error: 'Failed to generate spending insight' });
  }
});

// AI Chat endpoint
app.post('/api/insight/chat', authenticate, async (req, res) => {
  try {
    const { question, history, clientData } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.json({
        answers: "Gemini API key is not configured on the backend server. Please set GEMINI_API_KEY in your .env file to enable spending insights."
      });
    }

    let budget = clientData?.budget || 50000;
    let currency = clientData?.currency || 'PKR';
    let transactions = clientData?.entries || [];

    const totalSpent = transactions.reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);
    const categoryTotals = {};
    transactions.forEach(t => {
      const cat = t.category || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(t.amount || 0);
    });

    const contextPrompt = `
You are Ledger AI, an expert personal finance assistant.
User's Financial Profile:
- Monthly Budget: ${currency} ${budget.toLocaleString()}
- Total Spent This Month: ${currency} ${totalSpent.toLocaleString()}
- Remaining Budget: ${currency} ${(budget - totalSpent).toLocaleString()}
- Spending Breakdown by Category: ${JSON.stringify(categoryTotals)}
- Recent Transactions (Count: ${transactions.length}): ${JSON.stringify(transactions.slice(0, 15))}
`;

    const systemInstruction = `${contextPrompt}\nAnswer the user's spending question accurately, concisely, and helpfully based on their financial data.`;

    const formattedHistory = (history || []).map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }]
    }));

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          ...formattedHistory,
          {
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\nUser Question: ${question}` }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    const answers = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Unable to generate response.";

    res.json({ answers });
  } catch (err) {
    console.error('Error generating chat response:', err);
    res.status(500).json({ error: 'Failed to answer financial question' });
  }
});

// Admin Platform Stats
app.get('/api/admin/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    // 1. Total users
    const { count: totalUsers, error: uError } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (uError) throw uError;

    // 2. Total transactions & amount
    const { data: expenses, error: eError } = await supabaseAdmin
      .from('expenses')
      .select('amount');

    if (eError) throw eError;

    const totalTransactions = expenses.length;
    const totalAmountTracked = expenses.reduce((s, e) => s + Number(e.amount), 0);

    // 3. Users signed up in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { count: recentUsersCount, error: rError } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('joined_at', sevenDaysAgo.toISOString());

    if (rError) throw rError;

    res.json({
      totalUsers: totalUsers || 0,
      totalTransactions,
      totalAmountTracked,
      recentUsersCount: recentUsersCount || 0
    });
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    res.status(500).json({ error: 'Failed to fetch platform metrics' });
  }
});

// Admin User list with individual aggregates
app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const { data: profiles, error: pError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, joined_at')
      .order('joined_at', { ascending: false });

    if (pError) throw pError;

    const { data: expenses, error: eError } = await supabaseAdmin
      .from('expenses')
      .select('user_id, amount');

    if (eError) throw eError;

    const userMap = {};
    profiles.forEach(p => {
      userMap[p.id] = {
        id: p.id,
        email: p.email || 'N/A',
        full_name: p.full_name || 'N/A',
        joined_at: p.joined_at,
        txCount: 0,
        totalSpent: 0
      };
    });

    expenses.forEach(e => {
      if (userMap[e.user_id]) {
        userMap[e.user_id].txCount += 1;
        userMap[e.user_id].totalSpent += Number(e.amount);
      }
    });

    res.json({ users: Object.values(userMap) });
  } catch (err) {
    console.error('Error listing platform users:', err);
    res.status(500).json({ error: 'Failed to list registered platform users' });
  }
});

// Admin User specific transactions summary (read-only)
app.get('/api/admin/users/:userId/expenses', authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { data: expenses, error } = await supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .order('spent_at', { ascending: false });

    if (error) throw error;
    res.json({ expenses });
  } catch (err) {
    console.error(`Error listing expenses for user ${req.params.userId}:`, err);
    res.status(500).json({ error: 'Failed to fetch user transaction summary' });
  }
});

// Clear User Data
app.delete('/api/profile/clear', authenticate, async (req, res) => {
  try {
    await supabaseAdmin.from('expenses').delete().eq('user_id', req.user.id);
    await supabaseAdmin.from('categories').delete().eq('user_id', req.user.id);
    await supabaseAdmin.from('monthly_summaries').delete().eq('user_id', req.user.id);
    await supabaseAdmin.from('profiles').update({ monthly_budget: 50000, currency: 'PKR' }).eq('id', req.user.id);
    res.json({ message: 'User database cleared successfully' });
  } catch (err) {
    console.error('Error clearing data:', err);
    res.status(500).json({ error: 'Failed to clear database data' });
  }
});

// Start Server
app.listen(PORT, async () => {
  console.log(`🚀 Ledger Backend Express Server running on port ${PORT}`);
  
  // Run Supabase Connection Check on startup
  try {
    const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
    if (error) {
      console.log(`⚠️ Supabase connection test returned error: ${error.message}`);
    } else {
      console.log('⚡ Supabase connection test successful! Database is reachable.');
    }
  } catch (err) {
    console.log(`⚠️ Supabase connection test failed to execute: ${err.message}`);
  }
});
