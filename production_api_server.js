/**
 * 9amLeads Production API Server
 * Handles: Auth, Customers, Leads, Delivery, Subscriptions
 * Database: SQLite (upgrade to PostgreSQL via .env)
 * 
 * Run: node production_api_server.js
 * Port: 8012
 */

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');

// ===== CONFIG =====
const PORT = process.env.PORT || process.env.API_PORT || 8012;
const JWT_SECRET = process.env.JWT_SECRET || '9amleads-prod-secret-2026';
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Ensure data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true });

// ===== JSON DATABASE (drop-in replacement for better-sqlite3) =====
let _dbData = null;
function getDb() {
  if (!_dbData) { _dbData = loadDb(); saveDb(); }
  return _dbData;
}
function loadDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); }
  catch { return { customers: [], leads: [], deliveries: [], scraper_logs: [], subscriptions: [] }; }
}
function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(_dbData, null, 2));
}
function _q(sql, params) {
  // Parse SQL to determine operation
  const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
  const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
  const isUpdate = sql.trim().toUpperCase().startsWith('UPDATE');
  const isDelete = sql.trim().toUpperCase().startsWith('DELETE');
  
  // Extract table name
  const tableMatch = sql.match(/(?:FROM|INTO|UPDATE|DELETE FROM)\s+(\w+)/i);
  const table = tableMatch ? tableMatch[1] : null;
  
  return { table, isSelect, isInsert, isUpdate, isDelete, sql, params: params || [] };
}

function _exec(sql) {
  // Used for CREATE TABLE statements
  return { sql };
}

// Shims to match better-sqlite3 API
const db_shim = {
  prepare: (sql) => ({
    run: (...p) => _run(sql, p),
    get: (...p) => _get(sql, p),
    all: (...p) => _all(sql, p),
    raw: () => ({ all: (...p) => _all(sql, p).map(r => Object.values(r)) })
  }),
  exec: (sql) => _exec(sql),
  pragma: () => {}
};

function _run(sql, params) {
  const q = _q(sql, params);
  if (q.isInsert) {
    const row = {};
    // Extract column names and values from INSERT INTO table (col1, col2) VALUES (v1, v2)
    const colsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
    const valsMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
    if (colsMatch && valsMatch) {
      const cols = colsMatch[1].split(',').map(c => c.trim());
      const vals = valsMatch[1].split(',').map(v => v.trim().replace(/'/g, ''));
      cols.forEach((c, i) => { row[c] = params[i] !== undefined ? params[i] : vals[i]; });
    }
    if (row.id) getDb()[q.table].push(row);
    saveDb(); return { changes: 1 };
  }
  if (q.isUpdate) {
    const setMatch = sql.match(/SET\s+(.+?)(?:\s+WHERE|$)/i);
    const whereMatch = sql.match(/WHERE\s+(.+?)$/i);
    if (setMatch) {
      const sets = setMatch[1].split(',').map(s => {
        const [k, v] = s.trim().split('=').map(x => x.trim());
        return { key: k.replace(/['"]/g,''), val: v };
      });
      let idField = 'id', idVal = null;
      if (whereMatch) {
        const w = whereMatch[1].trim();
        const wParts = w.split('=');
        idField = wParts[0].trim();
        idVal = wParts[1] ? wParts[1].replace(/'/g,'') : null;
      }
      idVal = idVal || params[params.length - 1];
      const changes = {};
      sets.forEach((s, i) => { changes[s.key] = s.val.replace(/\?/g, params[i]); });
      const idx = getDb()[q.table].findIndex(r => r[idField] == idVal);
      if (idx !== -1) { getDb()[q.table][idx] = { ...getDb()[q.table][idx], ...changes }; saveDb(); return { changes: 1 }; }
    }
    return { changes: 0 };
  }
  return { changes: 0 };
}

function _get(sql, params) {
  const q = _q(sql, params);
  if (q.table && getDb()[q.table]) {
    // Handle simple WHERE field = ? queries
    const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
    const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)\s+(DESC|ASC)/i);
    let results = getDb()[q.table];
    if (whereMatch) {
      const field = whereMatch[1];
      const val = params[0];
      results = results.filter(r => r[field] == val);
    }
    if (orderMatch) {
      const field = orderMatch[1];
      const dir = orderMatch[2];
      results.sort((a, b) => dir === 'DESC' ? (b[field]||'').localeCompare(a[field]||'') : (a[field]||'').localeCompare(b[field]||''));
    }
    // Handle COUNT(*)
    if (sql.includes('COUNT(*)')) {
      return { count: results.length };
    }
// Handle LIMIT
    if (limitMatch) results = results.slice(0, parseInt(limitMatch[1]));
    return results[0] || null;
  }
  return null;
}

function _all(sql, params) {
  const q = _q(sql, params);
  if (q.table && getDb()[q.table]) {
    let results = getDb()[q.table];
    // Handle WHERE field = ?
    const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/gi);
    if (whereMatch) {
      // Simple case: single WHERE
      const w = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
      if (w) {
        const field = w[1];
        // Find which param index this corresponds to
        const paramIdx = params.length > 1 ? 1 : 0;
        if (paramIdx < params.length) results = results.filter(r => r[field] == params[paramIdx]);
      }
    }
    // Handle AND conditions
    if (sql.includes('AND')) {
      const ands = sql.match(/(\w+)\s*=\s*\?/g);
      if (ands) {
        ands.forEach((a, i) => {
          const field = a.split('=')[0].trim();
          if (i < params.length) results = results.filter(r => r[field] == params[i]);
        });
      }
    }
    // Handle ORDER BY
    const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)\s+(DESC|ASC)/i);
    if (orderMatch) {
      const field = orderMatch[1];
      const dir = orderMatch[2];
      results.sort((a, b) => dir === 'DESC' ? (b[field]||'').localeCompare(a[field]||'') : (a[field]||'').localeCompare(b[field]||''));
    }
    // Handle LIMIT
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) results = results.slice(0, parseInt(limitMatch[1]));
    // Handle OFFSET
    const offsetMatch = sql.match(/OFFSET\s+(\d+)/i);
    if (offsetMatch) results = results.slice(parseInt(offsetMatch[1]));
    return results;
  }
  return [];
}

const db = db_shim;
console.log('JSON database ready at: ' + DB_FILE);

// ===== HELPERS =====
function generateToken(customer) {
  return jwt.sign(
    { id: customer.id, email: customer.email, product: customer.product },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ===== APP =====
const app = express();
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// Serve static frontend files
const FRONTEND_DIR = path.join(__dirname, '9amleads');
const ROOT_DIR = __dirname;
app.use(express.static(FRONTEND_DIR, { index: 'index.html' }));
app.use(express.static(ROOT_DIR));
app.use(express.static(path.join(ROOT_DIR, '9amleads')));
// SPA fallback - serve index.html for unknown routes (but not API routes)
app.get(/^\/(?!api\/).*$/, (req, res) => {
  const paths = [
    path.join(FRONTEND_DIR, req.path === '/' ? 'index.html' : req.path),
    path.join(FRONTEND_DIR, req.path, 'index.html'),
    path.join(ROOT_DIR, req.path),
    path.join(ROOT_DIR, req.path, 'index.html'),
    path.join(FRONTEND_DIR, 'index.html')
  ];
  for (const p of paths) {
    try { if (fs.existsSync(p)) { res.sendFile(p); return; } } catch(e) {}
  }
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ===== AUTH ENDPOINTS =====

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { company, name, email, phone, password, product, targetAreas, bizField2, bizField3, source, marketingConsent } = req.body;

    if (!company || !email || !password) {
      return res.status(400).json({ error: 'Company, email and password are required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = db.prepare('SELECT id FROM customers WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);
    const trial_ends = new Date(Date.now() + 7 * 86400000).toISOString();

    const PRODUCT_MAP = {
      moving: { lead_type: 'Moving Leads', business_type: 'Removal Company' },
      probate: { lead_type: 'Probate Leads', business_type: 'Solicitor & Estate Agent' },
      newbusiness: { lead_type: 'New Business Alerts', business_type: 'Accountant & B2B Service' },
      planning: { lead_type: 'Planning Permissions', business_type: 'Architect & Builder' },
      tenders: { lead_type: 'Public Tenders', business_type: 'IT, Construction, Cleaning & More' },
    };
    const productInfo = PRODUCT_MAP[product] || PRODUCT_MAP.moving;

    db.prepare(`INSERT INTO customers (id, email, company, contact_name, phone, password_hash, product, lead_type, business_type, target_areas, biz_field2, biz_field3, source, plan, trial_ends, marketing_consent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'free_trial', ?, ?, datetime('now'))`).run(
      id, email.toLowerCase(), company, name || '', phone || '', password_hash,
      product, productInfo.lead_type, productInfo.business_type,
      JSON.stringify(targetAreas || []), bizField2 || '', bizField3 || '',
      source || 'direct', trial_ends, marketingConsent ? 1 : 0
    );

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    const token = generateToken(customer);

    // Save to Brevo contact list
    try {
      await addBrevoContact(customer);
    } catch (e) {
      console.log('Brevo contact add skipped:', e.message);
    }

    res.status(201).json({
      token,
      customer: {
        id: customer.id,
        company: customer.company,
        name: customer.contact_name,
        email: customer.email,
        phone: customer.phone,
        product: customer.product,
        lead_type: customer.lead_type,
        business_type: customer.business_type,
        plan: customer.plan,
        trial_ends: customer.trial_ends,
        target_areas: JSON.parse(customer.target_areas || '[]')
      }
    });
  } catch (e) {
    console.error('Signup error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email.toLowerCase());
    if (!customer) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, customer.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    db.prepare('UPDATE customers SET last_login = datetime(\'now\') WHERE id = ?').run(customer.id);
    const token = generateToken(customer);

    res.json({
      token,
      customer: {
        id: customer.id,
        company: customer.company,
        name: customer.contact_name,
        email: customer.email,
        phone: customer.phone,
        product: customer.product,
        lead_type: customer.lead_type,
        business_type: customer.business_type,
        plan: customer.plan,
        trial_ends: customer.trial_ends,
        target_areas: JSON.parse(customer.target_areas || '[]')
      }
    });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'User not found' });

  res.json({
    id: customer.id,
    company: customer.company,
    name: customer.contact_name,
    email: customer.email,
    phone: customer.phone,
    product: customer.product,
    lead_type: customer.lead_type,
    business_type: customer.business_type,
    plan: customer.plan,
    trial_ends: customer.trial_ends,
    leads_per_day: customer.leads_per_day,
    target_areas: JSON.parse(customer.target_areas || '[]'),
    biz_field2: customer.biz_field2,
    biz_field3: customer.biz_field3,
    source: customer.source,
    marketing_consent: customer.marketing_consent === 1,
    created_at: customer.created_at,
    last_login: customer.last_login
  });
});

// ===== LEAD ENDPOINTS =====

// GET /api/leads
app.get('/api/leads', authMiddleware, (req, res) => {
  const leads = db.prepare(
    'SELECT * FROM leads WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.user.id);

  res.json(leads.map(l => ({
    ...l,
    data: JSON.parse(l.data || '{}')
  })));
});

// GET /api/leads/today
app.get('/api/leads/today', authMiddleware, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const leads = db.prepare(
    'SELECT * FROM leads WHERE customer_id = ? AND date(created_at) = ? ORDER BY created_at DESC'
  ).all(req.user.id, today);

  res.json(leads.map(l => ({
    ...l,
    data: JSON.parse(l.data || '{}')
  })));
});

// PATCH /api/leads/:id/status
app.patch('/api/leads/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  const valid = ['new', 'contacted', 'booked', 'closed', 'lost'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// ===== STATS ENDPOINT =====

// GET /api/stats
app.get('/api/stats', authMiddleware, (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'User not found' });

  const total = db.prepare('SELECT COUNT(*) as count FROM leads WHERE customer_id = ?').get(req.user.id);
  const today = db.prepare('SELECT COUNT(*) as count FROM leads WHERE customer_id = ? AND date(created_at) = date(\'now\')').get(req.user.id);
  const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM leads WHERE customer_id = ? GROUP BY status').all(req.user.id);
  const lastDelivery = db.prepare('SELECT delivered_at FROM deliveries WHERE customer_id = ? AND email_status = \'sent\' ORDER BY delivered_at DESC LIMIT 1').get(req.user.id);
  const deliveriesSent = db.prepare('SELECT COUNT(*) as count FROM deliveries WHERE customer_id = ?').get(req.user.id);

  const statusMap = {};
  byStatus.forEach(s => statusMap[s.status] = s.count);

  const trialEnds = new Date(customer.trial_ends);
  const daysLeft = Math.ceil((trialEnds - new Date()) / 86400000);

  res.json({
    total_leads: total.count,
    today_leads: today.count,
    new: statusMap.new || 0,
    contacted: statusMap.contacted || 0,
    booked: statusMap.booked || 0,
    conversion_rate: total.count > 0 ? Math.round(((statusMap.booked || 0) / total.count) * 100) : 0,
    deliveries_sent: deliveriesSent.count,
    last_delivery: lastDelivery ? lastDelivery.delivered_at : null,
    plan: customer.plan,
    trial_days_left: Math.max(0, daysLeft),
    trial_ended: daysLeft <= 0,
    campaign_stage: customer.plan === 'free_trial' && daysLeft <= 0 ? 'trial_ended' : (customer.plan === 'free_trial' ? 'active_trial' : 'paid'),
    leads_per_day: customer.leads_per_day,
  });
});

// ===== SETTINGS ENDPOINT =====

// PUT /api/settings
app.put('/api/settings', authMiddleware, (req, res) => {
  const { company, name, phone, target_areas, notifications } = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'User not found' });

  if (company) db.prepare('UPDATE customers SET company = ? WHERE id = ?').run(company, req.user.id);
  if (name) db.prepare('UPDATE customers SET contact_name = ? WHERE id = ?').run(name, req.user.id);
  if (phone) db.prepare('UPDATE customers SET phone = ? WHERE id = ?').run(phone, req.user.id);
  if (target_areas) db.prepare('UPDATE customers SET target_areas = ? WHERE id = ?').run(JSON.stringify(target_areas), req.user.id);

  res.json({ success: true });
});

// ===== ADMIN ENDPOINTS =====

// GET /api/admin/stats â€” overall system stats
app.get('/api/admin/stats', (req, res) => {
  const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get();
  const freeTrials = db.prepare('SELECT COUNT(*) as count FROM customers WHERE plan = \'free_trial\'').get();
  const paidCustomers = db.prepare('SELECT COUNT(*) as count FROM customers WHERE plan != \'free_trial\'').get();
  const totalLeads = db.prepare('SELECT COUNT(*) as count FROM leads').get();
  const todayLeads = db.prepare('SELECT COUNT(*) as count FROM leads WHERE date(created_at) = date(\'now\')').get();
  const deliveriesToday = db.prepare('SELECT COUNT(*) as count FROM deliveries WHERE date(delivered_at) = date(\'now\')').get();
  const bounced = db.prepare('SELECT COUNT(*) as count FROM customers WHERE bounced > 0').get();

  const byProduct = db.prepare('SELECT product, COUNT(*) as count FROM customers GROUP BY product').all();
  const bySource = db.prepare('SELECT source, COUNT(*) as count FROM customers GROUP BY source').all();
  const recentSignups = db.prepare('SELECT date(created_at) as day, COUNT(*) as count FROM customers GROUP BY date(created_at) ORDER BY day DESC LIMIT 7').all();

  res.json({
    total_customers: totalCustomers.count,
    free_trials: freeTrials.count,
    paid_customers: paidCustomers.count,
    total_leads: totalLeads.count,
    today_leads: todayLeads.count,
    deliveries_today: deliveriesToday.count,
    bounced_emails: bounced.count,
    by_product: byProduct,
    by_source: bySource,
    recent_signups: recentSignups
  });
});

// GET /api/admin/customers â€” list all customers (paginated)
app.get('/api/admin/customers', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  const customers = db.prepare('SELECT id, email, company, contact_name, phone, product, plan, source, marketing_consent, bounced, created_at, last_login FROM customers ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) as count FROM customers').get();

  // Get lead counts for each customer
  const result = customers.map(c => {
    const leadCount = db.prepare('SELECT COUNT(*) as count FROM leads WHERE customer_id = ?').get(c.id);
    return { ...c, lead_count: leadCount.count };
  });

  res.json({
    customers: result,
    total: total.count,
    page,
    total_pages: Math.ceil(total.count / limit)
  });
});

// ===== BREVO EMAIL INTEGRATION =====
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';

async function addBrevoContact(customer) {
  if (!BREVO_API_KEY) return;
  const https = require('https');
  const data = JSON.stringify({
    email: customer.email,
    attributes: {
      COMPANY: customer.company,
      FIRSTNAME: customer.contact_name || '',
      PHONE: customer.phone || '',
      PRODUCT: customer.product,
      LEAD_TYPE: customer.lead_type,
      PLAN: customer.plan,
      SOURCE: customer.source || 'direct',
      SIGNUP_DATE: customer.created_at
    },
    listIds: [2], // 9amLeads contacts list
    updateEnabled: true
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/contacts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode < 300) resolve();
        else reject(new Error(body));
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendBrevoEmail(to, subject, htmlContent) {
  if (!BREVO_API_KEY) return;
  const https = require('https');
  const data = JSON.stringify({
    sender: { name: '9amLeads', email: 'hello@9amleads.com' },
    to: [{ email: to.email, name: to.name }],
    subject,
    htmlContent
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode < 300) resolve(JSON.parse(body));
        else reject(new Error(body));
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ===== 9AM DAILY DELIVERY SCHEDULER =====
// Runs at 8:30 AM every day to prepare and send lead sheets
// ===== LEAD LIMITS PER PLAN =====
const PLAN_LIMITS = {
  'free_trial': { leads_per_day: 5, max_days: 7 },
  'starter': { leads_per_day: 5 },
  'pro': { leads_per_day: 15 },
  'enterprise': { leads_per_day: 40 },
};

// ===== TRIAL / CAMPAIGN CAMPAIGN EMAIL TEMPLATES =====
const CAMPAIGN_EMAILS = [
  { day: 1, subject: 'Your leads start tomorrow at 9am \u2705', template: 'trial_day1' },
  { day: 3, subject: 'How are your first leads looking?', template: 'trial_day3' },
  { day: 5, subject: '3 tips to convert more leads', template: 'trial_day5' },
  { day: 7, subject: 'Your free trial ends tomorrow', template: 'trial_day7' },
  { day: 9, subject: 'Your leads have stopped \u23f8\ufe0f', template: 'trial_day9' },
  { day: 12, subject: 'Still not sure? Let us help.', template: 'trial_day12' },
  { day: 16, subject: '3 businesses that transformed their pipeline', template: 'trial_day16' },
  { day: 21, subject: 'Come back \u2014 30% off your first month', template: 'trial_day21' },
  { day: 30, subject: 'Your account is still waiting', template: 'trial_day30' },
  { day: 60, subject: 'Last chance to reactivate your account', template: 'trial_day60' },
];

function getCampaignEmailHTML(customer, template) {
  const accent = { moving: '#ff6b35', probate: '#a855f7', newbusiness: '#06b6d4', planning: '#10b981', tenders: '#6366f1' }[customer.product] || '#0ea5e9';
  const bizType = customer.business_type || 'business';
  const productName = customer.lead_type || 'leads';
  
  const templates = {
    trial_day1: '<div style="padding:24px;text-align:center"><div style="font-size:48px;margin-bottom:12px">âœ…</div><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">Your Free Trial Is Active</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:20px">Your first ' + productName + ' will land in your inbox at <strong style="color:' + accent + '">9am tomorrow morning</strong>. Here\'s your daily routine for the next 7 days:</p><div style="display:inline-block;text-align:left;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 24px;margin-bottom:16px"><p style="color:#ccc;font-size:13px;line-height:2;margin:0">ðŸ“¥ <strong>9:00am</strong> â€” Lead sheet arrives in your inbox<br>ðŸ“ž <strong>9:01am</strong> â€” You start calling hot leads<br>ðŸ’° <strong>9:30am</strong> â€” First quotes going out<br>âœ… <strong>By noon</strong> â€” Bookings coming in</p></div><p style="color:#888;font-size:12px">No commitment. Cancel anytime. Your leads are exclusive to you.</p></div>',
    trial_day3: '<div style="padding:24px;text-align:center"><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">How Are Your Leads Looking?</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:16px">You\'re 3 days in. Quick check-in:</p><div style="display:inline-block;text-align:left;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 24px;margin-bottom:12px"><p style="color:#ccc;font-size:13px;line-height:1.8;margin:0">âœ” Are the leads relevant to your business?<br>âœ” Is the volume what you expected?<br>âœ” Have you called any yet?</p></div><p style="color:#888;font-size:13px;line-height:1.6">Reply to this email and let us know. Good or bad â€” we\'re here to help you get the most out of 9amLeads.<br><br><span style="color:' + accent + ';font-weight:600">ðŸ’¡ Tip:</span> Call within 30 minutes of receiving your leads. Speed is your biggest advantage.</p></div>',
    trial_day5: '<div style="padding:24px;text-align:center"><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:16px">3 Tips to Convert More Leads</h2><div style="display:inline-block;text-align:left;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px 24px;margin-bottom:12px"><div style="margin-bottom:14px"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;margin-right:8px;float:left">1</div><div style="margin-left:40px"><strong style="color:#fff;font-size:14px">Call within 30 minutes</strong><br><span style="color:#888;font-size:13px">Speed is everything. Our data shows calling within 30 minutes triples your conversion rate.</span></div></div><div style="margin-bottom:14px;clear:both"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;margin-right:8px;float:left">2</div><div style="margin-left:40px"><strong style="color:#fff;font-size:14px">Mention their specific situation</strong><br><span style="color:#888;font-size:13px">Reference their property, industry, or tender number. Generic pitches lose. Personalised pitches win.</span></div></div><div style="clear:both"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;margin-right:8px;float:left">3</div><div style="margin-left:40px"><strong style="color:#fff;font-size:14px">Ask for the next step</strong><br><span style="color:#888;font-size:13px">Don\'t just send a quote. Book a call, schedule a visit, ask for the business. Close starts with asking.</span></div></div></div></div>',
    trial_day7: '<div style="padding:24px;text-align:center"><div style="font-size:48px;margin-bottom:12px">â³</div><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">Your Free Trial Ends Tomorrow</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:20px">After tomorrow, your daily ' + productName + ' delivery will pause. Upgrade now to keep them flowing without interruption.</p><a href="http://localhost:8006/dashboard.html" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,' + accent + ',#e85d26);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:16px;box-shadow:0 4px 20px ' + accent + '40">Upgrade Now â€” Keep Your Leads â†’</a><p style="color:#888;font-size:12px;margin-top:12px">Plans from just Â£29/month Â· Cancel anytime</p></div>',
    trial_day9: '<div style="padding:24px;text-align:center"><div style="font-size:48px;margin-bottom:12px">â¸ï¸</div><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">Your Daily Leads Have Paused</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:12px">Your 7-day free trial has ended and your daily ' + productName + ' delivery has been paused.</p><div style="display:inline-block;text-align:left;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 24px;margin-bottom:16px"><p style="color:#ccc;font-size:13px;line-height:1.8;margin:0"><strong style="color:#fff">To restart:</strong><br>1. Log into your dashboard<br>2. Choose your plan<br>3. Leads restart at 9am tomorrow</p></div><p style="color:#888;font-size:12px">Your lead history is still there. Nothing has been lost.</p></div>',
    trial_day12: '<div style="padding:24px;text-align:center"><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">Still Not Sure?</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:16px">We understand. Every business is different. Maybe the leads weren\'t quite right, or the timing wasn\'t perfect.</p><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:12px">Reply to this email and tell us what\'s holding you back. We\'ll help you figure out if 9amLeads is right for your ' + bizType + '.</p><p style="color:#888;font-size:12px">No sales pitch. Just honest, helpful advice.</p></div>',
    trial_day16: '<div style="padding:24px;text-align:center"><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:16px">3 Businesses That Transformed Their Pipeline</h2><div style="display:inline-block;text-align:left;max-width:400px"><div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 18px;margin-bottom:10px"><p style="color:#ccc;font-size:13px;line-height:1.6;margin:0">"Got 12 leads in my first week using 9amLeads. Converted 3. Made <strong style="color:' + accent + '">Â£3,600</strong> in additional revenue."</p></div><div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 18px;margin-bottom:10px"><p style="color:#ccc;font-size:13px;line-height:1.6;margin:0">"We\'ve picked up <strong style="color:' + accent + '">4 new clients</strong> in our first month using 9amLeads. Already covered our annual subscription 10x over."</p></div><div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 18px"><p style="color:#ccc;font-size:13px;line-height:1.6;margin:0">"Won 2 contracts worth <strong style="color:' + accent + '">Â£1.4M</strong> in our first quarter. Best business decision we\'ve made."</p></div></div><p style="color:#888;font-size:13px;margin-top:16px">Your success story could be next. Your account is still waiting.</p></div>',
    trial_day21: '<div style="padding:24px;text-align:center"><div style="font-size:48px;margin-bottom:12px">ðŸ’</div><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">Come Back â€” 30% Off Your First Month</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:12px">Use code <strong style="color:' + accent + ';font-size:24px;letter-spacing:2px">WELCOME30</strong> at checkout for 30% off your first month.</p><p style="color:#888;font-size:13px">No commitment. Cancel anytime. Your ' + productName + ' restart at 9am tomorrow.</p></div>',
    trial_day30: '<div style="padding:24px;text-align:center"><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">Your Account Is Still Waiting</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:12px">Your account and lead history are still here. Nothing has been deleted. Upgrade anytime to reactivate your daily ' + productName + ' delivery at 9am.</p><p style="color:#888;font-size:13px">It takes 30 seconds. Your leads restart tomorrow.</p></div>',
    trial_day60: '<div style="padding:24px;text-align:center"><div style="font-size:48px;margin-bottom:12px">â°</div><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">Last Chance â€” Account Will Be Archived</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:12px">Your account will be archived in 30 days. All your lead history will be preserved â€” but you\'ll need to contact us to reactivate.</p><p style="color:#888;font-size:13px">Upgrade now to keep everything active and your ' + productName + ' flowing at 9am every morning. This is your final notice.</p></div>',
  };
  
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#000;font-family:Inter,Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%"><tr><td style="background:#0a0a0a;padding:28px;border-bottom:3px solid ' + accent + ';text-align:center"><div style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff"><span style="color:' + accent + '">9am</span>Leads</div><p style="color:#888;font-size:12px;margin-top:4px">' + customer.company + '</p></td></tr><tr><td style="background:#0a0a0a;padding:24px 28px">' + (templates[template] || templates.trial_day1) + '</td></tr><tr><td style="background:#0a0a0a;padding:20px 28px;border-top:1px solid #1a1a1a;text-align:center"><p style="color:#888;font-size:11px;margin:0">9am Leads Ltd \u00b7 Company No. 17168176 \u00b7 <a href="#" style="color:#888">Unsubscribe</a></p></td></tr></table></td></tr></table></body></html>';
}

// ===== MAIN SCHEDULER: Daily at 8:30 AM =====
cron.schedule('30 8 * * *', async () => {
  console.log('[SCHEDULER] Starting daily lead delivery...');
  
  const customers = db.prepare('SELECT * FROM customers WHERE plan != \'cancelled\' AND bounced < 3').all();
  console.log('[SCHEDULER] Found ' + customers.length + ' customers to process');

  let leads_sent = 0, campaign_sent = 0, trial_ended = 0, errors = 0;
  const today = new Date().toISOString().split('T')[0];
  const BATCH_SIZE = 100;
  const BATCH_DELAY = 60000;

  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const batch = customers.slice(i, i + BATCH_SIZE);
    
    for (const customer of batch) {
      try {
        const trialEnds = customer.trial_ends ? new Date(customer.trial_ends) : null;
        const isExpired = trialEnds && new Date() > trialEnds;
        const daysSinceTrialEnd = trialEnds ? Math.floor((new Date() - trialEnds) / 86400000) : 999;
        
        // ---- CASE 1: Active trial or paid plan â†’ send leads ----
        if (!isExpired || customer.plan !== 'free_trial') {
          const limit = PLAN_LIMITS[customer.plan] ? PLAN_LIMITS[customer.plan].leads_per_day : (customer.leads_per_day || 20);
          
          const leads = db.prepare(
            'SELECT * FROM leads WHERE customer_id = ? AND delivered = 0 AND date(created_at) = date(\'now\') LIMIT ?'
          ).all(customer.id, limit);

          if (leads.length > 0) {
            const htmlContent = generateLeadEmailHTML(customer, leads);
            const result = await sendBrevoEmail(
              { email: customer.email, name: customer.company },
              customer.lead_type + ' for ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
              htmlContent
            );

            db.prepare('UPDATE leads SET delivered = 1, delivered_at = datetime(\'now\') WHERE customer_id = ? AND delivered = 0').run(customer.id);
            db.prepare('INSERT INTO deliveries (id, customer_id, product, lead_count, email_status, email_id) VALUES (?, ?, ?, ?, ?, ?)').run(
              uuidv4(), customer.id, customer.product, leads.length, 'sent', result.messageId || ''
            );
            leads_sent++;
          }
        }
        
        // ---- CASE 2: Trial just expired â†’ send campaign email + mark ----
        if (customer.plan === 'free_trial' && isExpired && daysSinceTrialEnd < 65) {
          // Find which campaign email to send based on days since trial ended
          let emailTemplate = null;
          for (const ce of CAMPAIGN_EMAILS) {
            // Day 7 email is sent on day 9 (2 days after trial ends), day 9 on day 9+2, etc.
            const campaignDay = ce.day;
            const adjustedDay = campaignDay - 7; // Trial is 7 days, campaign starts after
            if (adjustedDay === daysSinceTrialEnd || (campaignDay === 60 && daysSinceTrialEnd >= 58)) {
              emailTemplate = ce;
              break;
            }
          }
          
          if (emailTemplate) {
            const htmlContent = getCampaignEmailHTML(customer, emailTemplate.template);
            await sendBrevoEmail(
              { email: customer.email, name: customer.company },
              emailTemplate.subject,
              htmlContent
            );
            campaign_sent++;
          }
          
          if (daysSinceTrialEnd === 0) {
            trial_ended++;
          }
        }
      } catch (e) {
        errors++;
        db.prepare('INSERT INTO deliveries (id, customer_id, product, lead_count, email_status, error) VALUES (?, ?, ?, ?, ?, ?)').run(
          uuidv4(), customer.id, customer.product || 'unknown', 0, 'failed', e.message
        );
        if (e.message && e.message.includes('bounce')) {
          db.prepare('UPDATE customers SET bounced = bounced + 1 WHERE id = ?').run(customer.id);
        }
      }
    }

    if (i + BATCH_SIZE < customers.length) {
      console.log('[SCHEDULER] Batch complete, waiting 1 minute...');
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }

  console.log('[SCHEDULER] Complete: ' + leads_sent + ' lead sheets sent, ' + campaign_sent + ' campaign emails, ' + trial_ended + ' trials ended, ' + errors + ' errors');
});

// ===== STRIPE PAYMENTS =====
const STRIPE_PRICE_IDS = {};
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Load Stripe config from file (supports both env var and config file)
let STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
try {
  const stripeConfig = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stripe-config.json'), 'utf-8'));
  if (!STRIPE_SECRET_KEY && stripeConfig.apiKey) {
    STRIPE_SECRET_KEY = stripeConfig.apiKey;
  }
  if (stripeConfig.priceIds) {
    Object.assign(STRIPE_PRICE_IDS, stripeConfig.priceIds);
  }
  if (stripeConfig.webhookSecret) {
    STRIPE_WEBHOOK_SECRET ||= stripeConfig.webhookSecret;
  }
} catch(e) {}

function stripeApiRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const params = data ? Object.entries(data).map(([k, v]) =>
      encodeURIComponent(k) + '=' + encodeURIComponent(v)
    ).join('&') : '';
    const req = require('https').request({
      hostname: 'api.stripe.com',
      path: '/v1/' + path,
      method,
      headers: {
        'Authorization': 'Basic ' + Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(params)
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error(body)); }
      });
    });
    req.on('error', reject);
    req.write(params);
    req.end();
  });
}

// POST /api/create-checkout â€” create Stripe Checkout Session
app.post('/api/create-checkout', authMiddleware, async (req, res) => {
  try {
    if (!STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe not configured. Add keys in Settings â†’ Stripe Payments.' });
    }

    const { plan } = req.body;
    const validPlans = ['starter', 'pro', 'enterprise'];
    if (!plan || !validPlans.includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Choose: starter, pro, or enterprise' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });

    // Map plan names: config uses 'essential' for non-moving starter plans
    const effectivePlan = (customer.product !== 'moving' && plan === 'starter') ? 'essential' : plan;
    const productKey = { moving: 'moving', probate: 'prob', newbusiness: 'nb', planning: 'plan', tenders: 'tend' }[customer.product] || customer.product;
    const planKey = productKey + '-' + effectivePlan;
    const priceIdMap = STRIPE_PRICE_IDS[customer.product] || {};
    const priceId = priceIdMap[planKey];

    if (!priceId) {
      return res.status(400).json({ error: 'Pricing not found for this plan (' + planKey + '). Run node stripe_handler.js --setup first.' });
    }

    const successUrl = (process.env.PUBLIC_URL || 'http://localhost:8006') + '/portal/dashboard.html?checkout=success&session_id={CHECKOUT_SESSION_ID}';
    const cancelUrl = (process.env.PUBLIC_URL || 'http://localhost:8006') + '/portal/dashboard.html?checkout=cancel';

    const session = await stripeApiRequest('POST', 'checkout/sessions', {
      mode: 'subscription',
      customer_email: customer.email,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'metadata[customer_id]': customer.id,
      'metadata[product]': customer.product,
      'metadata[plan]': plan
    });

    if (session.url) {
      res.json({ url: session.url, session_id: session.id });
    } else {
      res.status(400).json({ error: session.error?.message || 'Checkout creation failed' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stripe webhook â€” receives checkout.session.completed events
// IMPORTANT: This route uses raw body parser for Stripe signature verification
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    let event;
    if (STRIPE_WEBHOOK_SECRET) {
      const crypto = require('crypto');
      const sig = req.headers['stripe-signature'];
      if (!sig) return res.status(400).json({ error: 'No signature' });
      const payload = req.body.toString();
      const parts = sig.split(',').reduce((acc, p) => {
        const [k, v] = p.trim().split('=');
        acc[k] = v; return acc;
      }, {});
      const timestamp = parts['t'];
      const expectedSig = parts['v1'];
      const signedPayload = timestamp + '.' + payload;
      const computedSig = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(signedPayload).digest('hex');
      if (computedSig !== expectedSig) {
        return res.status(400).json({ error: 'Invalid signature' });
      }
      event = JSON.parse(payload);
    } else {
      event = req.body;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const customerId = session.metadata?.customer_id;
      const plan = session.metadata?.plan;
      const product = session.metadata?.product;
      const stripeCustomerId = session.customer;
      const subscriptionId = session.subscription;

      if (!customerId || !plan) {
        console.log('[WEBHOOK] Missing metadata:', JSON.stringify(session.metadata));
        return res.json({ received: true });
      }

      const validPlans = ['starter', 'pro', 'enterprise'];
      if (!validPlans.includes(plan)) {
        console.log('[WEBHOOK] Invalid plan:', plan);
        return res.json({ received: true });
      }

      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
      if (!customer) {
        console.log('[WEBHOOK] Customer not found:', customerId);
        return res.json({ received: true });
      }

      const limit = PLAN_LIMITS[plan]?.leads_per_day || 40;

      // Update customer plan
      db.prepare('UPDATE customers SET plan = ?, leads_per_day = ?, trial_ends = NULL WHERE id = ?')
        .run(plan, limit, customerId);

      // Create or update subscription record
      const existingSub = db.prepare('SELECT id FROM subscriptions WHERE customer_id = ?').get(customerId);
      if (existingSub) {
        db.prepare(`UPDATE subscriptions SET stripe_id = ?, plan = ?, status = 'active',
          current_period_start = datetime('now'), current_period_end = datetime('now', '+1 month') WHERE customer_id = ?`)
          .run(subscriptionId || '', customerId);
      } else {
        db.prepare(`INSERT INTO subscriptions (id, customer_id, stripe_id, plan, status, current_period_start, current_period_end)
          VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now', '+1 month'))`)
          .run(uuidv4(), customerId, subscriptionId || '', plan);
      }

      console.log('[WEBHOOK] Payment confirmed:', customer.email, 'â†’', plan, '(product:', product + ')');
    }

    res.json({ received: true });
  } catch (e) {
    console.error('[WEBHOOK] Error:', e.message);
    res.status(200).json({ received: true });
  }
});

// POST /api/subscribe â€” upgrade current user's plan (after Stripe payment confirmed)
app.post('/api/subscribe', authMiddleware, async (req, res) => {
  const { plan, session_id } = req.body;
  const validPlans = ['starter', 'pro', 'enterprise'];
  if (!plan || !validPlans.includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan. Choose: starter, pro, or enterprise' });
  }

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'User not found' });

  // If session_id provided, verify with Stripe that payment succeeded
  if (session_id) {
    try {
      const session = await stripeApiRequest('GET', 'checkout/sessions/' + session_id, null);
      if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
        return res.status(402).json({ error: 'Payment not completed. Status: ' + session.payment_status });
      }
    } catch (e) {
      return res.status(500).json({ error: 'Could not verify payment: ' + e.message });
    }
  } else {
    // Fallback: check if there's already an active subscription in DB
    const sub = db.prepare('SELECT * FROM subscriptions WHERE customer_id = ? AND status = ?').get(req.user.id, 'active');
    if (!sub || sub.plan !== plan) {
      return res.status(402).json({ error: 'Payment not confirmed. Please complete checkout first.' });
    }
  }

  const limit = PLAN_LIMITS[plan].leads_per_day;
  db.prepare('UPDATE customers SET plan = ?, leads_per_day = ?, trial_ends = NULL WHERE id = ?').run(plan, limit, req.user.id);

  console.log('[UPGRADE] Customer ' + customer.email + ' upgraded to ' + plan);

  res.json({
    success: true,
    message: 'Upgraded to ' + plan + ' plan. Your daily leads will resume at 9am tomorrow.',
    plan,
    leads_per_day: limit
  });
});

// GET /api/subscription â€” check current subscription status
app.get('/api/subscription', authMiddleware, (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'User not found' });

  const sub = db.prepare('SELECT * FROM subscriptions WHERE customer_id = ?').get(req.user.id);

  res.json({
    plan: customer.plan,
    leads_per_day: customer.leads_per_day,
    trial_ends: customer.trial_ends,
    subscription: sub ? {
      stripe_id: sub.stripe_id,
      plan: sub.plan,
      status: sub.status,
      current_period_start: sub.current_period_start,
      current_period_end: sub.current_period_end,
      created_at: sub.created_at
    } : null
  });
});

// ===== DEDUPLICATION DATABASE =====
const SCRAPED_BIZ_FILE = path.join(DATA_DIR, 'scraped-businesses.json');

function loadScrapedBusinesses() {
  try { return JSON.parse(fs.readFileSync(SCRAPED_BIZ_FILE, 'utf-8')); } catch { return []; }
}

function saveScrapedBusinesses(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SCRAPED_BIZ_FILE, JSON.stringify(list, null, 2));
}

function normalizeDomain(url) {
  if (!url) return '';
  let d = url.toLowerCase().replace(/https?:\/\//, '').replace(/^www\./, '').replace(/\/.*/, '').trim();
  return d;
}

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

// GET /api/scraped-businesses â€” return all known businesses (for dedup client-side)
app.get('/api/scraped-businesses', (req, res) => {
  const { product } = req.query;
  let list = loadScrapedBusinesses();
  if (product) list = list.filter(b => b.product === product || !b.product);
  res.json(list);
});

// POST /api/scraped-businesses/check â€” check which of the submitted businesses are new
app.post('/api/scraped-businesses/check', (req, res) => {
  try {
    const { candidates } = req.body;
    if (!Array.isArray(candidates)) return res.status(400).json({ error: 'candidates array required' });

    const existing = loadScrapedBusinesses();
    const existingDomains = new Set(existing.map(b => normalizeDomain(b.website)).filter(Boolean));
    const existingNames = new Set(existing.map(b => normalizeName(b.name)).filter(Boolean));
    const existingEmails = new Set(existing.map(b => (b.email || '').toLowerCase()).filter(Boolean));
    // Also include general/owner/marketing/sales emails
    existing.forEach(b => {
      if (b.ownerEmail) existingEmails.add(b.ownerEmail.toLowerCase());
      if (b.marketingEmail) existingEmails.add(b.marketingEmail.toLowerCase());
      if (b.salesEmail) existingEmails.add(b.salesEmail.toLowerCase());
      if (b.generalEmail) existingEmails.add(b.generalEmail.toLowerCase());
    });

    const deduped = candidates.filter(c => {
      const domain = normalizeDomain(c.website);
      const name = normalizeName(c.name);
      const email = (c.email || c.generalEmail || '').toLowerCase();
      if (domain && existingDomains.has(domain)) return false;
      if (name && existingNames.has(name)) return false;
      if (email && existingEmails.has(email)) return false;
      return true;
    });

    res.json({
      total: candidates.length,
      unique: deduped.length,
      duplicates: candidates.length - deduped.length,
      candidates: deduped
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/scraped-businesses/add â€” save newly scraped businesses
app.post('/api/scraped-businesses/add', (req, res) => {
  try {
    const { businesses, product, query } = req.body;
    if (!Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });

    const existing = loadScrapedBusinesses();
    const existingDomains = new Set(existing.map(b => normalizeDomain(b.website)).filter(Boolean));
    const existingNames = new Set(existing.map(b => normalizeName(b.name)).filter(Boolean));
    const existingEmails = new Set(existing.map(b => (b.email || b.generalEmail || '').toLowerCase()).filter(Boolean));

    let added = 0;
    const now = new Date().toISOString();
    for (const biz of businesses) {
      const domain = normalizeDomain(biz.website);
      const name = normalizeName(biz.name);
      const email = (biz.email || biz.generalEmail || '').toLowerCase();
      if (domain && existingDomains.has(domain)) continue;
      if (name && existingNames.has(name)) continue;
      if (email && existingEmails.has(email)) continue;

      existing.push({
        name: biz.name || '',
        website: biz.website || '',
        email: biz.email || biz.generalEmail || '',
        ownerEmail: biz.ownerEmail || '',
        marketingEmail: biz.marketingEmail || '',
        salesEmail: biz.salesEmail || '',
        phone: biz.phone || '',
        address: biz.address || '',
        industry: biz.industry || '',
        product: product || 'unknown',
        searchQuery: query || '',
        scrapedAt: now
      });
      existingDomains.add(domain);
      existingNames.add(name);
      existingEmails.add(email);
      added++;
    }

    saveScrapedBusinesses(existing);
    res.json({ success: true, added, total: existing.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/scraped-businesses/stats â€” dedup statistics
app.get('/api/scraped-businesses/stats', (req, res) => {
  const list = loadScrapedBusinesses();
  const byProduct = {};
  list.forEach(b => {
    const p = b.product || 'unknown';
    byProduct[p] = (byProduct[p] || 0) + 1;
  });
  res.json({
    total: list.length,
    byProduct,
    lastScraped: list.length > 0 ? list[list.length - 1].scrapedAt : null
  });
});

// ===== SCRAPER ENDPOINTS =====

// POST /api/scrape-run â€” execute a scraper for a given product and store results
app.post('/api/scrape-run', async (req, res) => {
  try {
    const { product, query, location, instructions, maxResults, emails } = req.body;
    if (!product || !query) {
      return res.status(400).json({ error: 'Product and query are required' });
    }

    const validProducts = ['moving', 'probate', 'newbusiness', 'planning', 'tenders'];
    if (!validProducts.includes(product)) {
      return res.status(400).json({ error: 'Invalid product. Choose: ' + validProducts.join(', ') });
    }

    // Log the scrape run
    const runId = uuidv4();
    db.prepare(`INSERT INTO scraper_logs (id, product, customer_count, leads_found, errors, started_at, status)
      VALUES (?, ?, 0, 0, 0, datetime('now'), 'running')`).run(runId, product);

    // Build enriched search terms
    const searchTerms = instructions
      ? [query + ' ' + (location || 'UK') + ' ' + instructions.substring(0, 100)]
      : [query + ' ' + (location || 'UK')];

    // Store the scrape config
    const scrapeConfig = {
      id: runId,
      product,
      query,
      location: location || 'UK',
      instructions: instructions || '',
      maxResults: maxResults || 50,
      emails: emails || { owner: true, marketing: true, sales: true, general: true },
      searchTerms,
      status: 'running',
      created_at: new Date().toISOString()
    };

    const configDir = path.join(DATA_DIR, 'scrape-runs');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, runId + '.json'), JSON.stringify(scrapeConfig, null, 2));

    res.json({
      success: true,
      run_id: runId,
      message: 'Scrape queued. Check /api/scrape-results/' + runId + ' for status.',
      config: scrapeConfig
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/scrape-results â€” list all scrape runs
app.get('/api/scrape-results', (req, res) => {
  const configDir = path.join(DATA_DIR, 'scrape-runs');
  try {
    const files = fs.readdirSync(configDir).filter(f => f.endsWith('.json'));
    const runs = files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(configDir, f), 'utf-8'));
      } catch { return null; }
    }).filter(Boolean);
    runs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(runs.slice(0, 50));
  } catch {
    res.json([]);
  }
});

// GET /api/scrape-results/:id â€” get a specific scrape run
app.get('/api/scrape-results/:id', (req, res) => {
  const filePath = path.join(DATA_DIR, 'scrape-runs', req.params.id + '.json');
  try {
    const config = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    // Also load leads if any were saved
    const leadsFile = path.join(DATA_DIR, 'scrape-runs', req.params.id + '-leads.json');
    let leads = [];
    try { leads = JSON.parse(fs.readFileSync(leadsFile, 'utf-8')); } catch {}
    res.json({ ...config, leads });
  } catch {
    res.status(404).json({ error: 'Run not found' });
  }
});

// POST /api/scrape-save â€” save scraped leads to customer records
app.post('/api/scrape-save', async (req, res) => {
  try {
    const { product, leads } = req.body;
    if (!product || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'Product and leads array required' });
    }

    let saved = 0;
    for (const lead of leads) {
      if (!lead.name && !lead.email) continue;
      const id = uuidv4();
      db.prepare(`INSERT INTO leads (id, customer_id, product, data, status, created_at)
        VALUES (?, 'scraper', ?, ?, 'new', datetime('now'))`).run(
        id, product, JSON.stringify(lead)
      );
      saved++;
    }

    res.json({ success: true, saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add this to the health endpoint response
const originalHealth = app.get;
app.get('/api/health', (req, res) => {
  const customerCount = db.prepare('SELECT COUNT(*) as count FROM customers').get();
  const leadCount = db.prepare('SELECT COUNT(*) as count FROM leads').get();
  const activeTrials = db.prepare('SELECT COUNT(*) as count FROM customers WHERE plan = \'free_trial\' AND trial_ends > datetime(\'now\')').get();
  const expiredTrials = db.prepare('SELECT COUNT(*) as count FROM customers WHERE plan = \'free_trial\' AND trial_ends <= datetime(\'now\')').get();
  const paidCustomers = db.prepare('SELECT COUNT(*) as count FROM customers WHERE plan != \'free_trial\'').get();
  
  res.json({
    status: 'running',
    domain: 'www.9amleads.com',
    email: 'hello@9amleads.com',
    database: DB_FILE,
    customers: customerCount.count,
    active_trials: activeTrials.count,
    expired_trials: expiredTrials.count,
    paid_customers: paidCustomers.count,
    leads: leadCount.count,
    brevo_configured: !!BREVO_API_KEY,
    stripe_configured: !!STRIPE_SECRET_KEY,
    scheduler: 'Active (8:30 AM daily)',
    campaign: 'Active (10 automated emails per trial)'
  });
});

// Generate lead email HTML (reuses existing template pattern)
function generateLeadEmailHTML(customer, leads) {
  const accent = { moving: '#ff6b35', probate: '#a855f7', newbusiness: '#06b6d4', planning: '#10b981', tenders: '#6366f1' }[customer.product] || '#0ea5e9';
  const icon = { moving: 'fa-truck', probate: 'fa-scale-balanced', newbusiness: 'fa-building', planning: 'fa-draw-polygon', tenders: 'fa-gavel' }[customer.product] || 'fa-clock';

  const leadsHTML = leads.map(l => {
    const data = JSON.parse(l.data || '{}');
    return '<tr><td style="padding:10px 12px;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px">' + (data.address || data.name || data.company || data.tenderTitle || 'Lead') + '</td><td style="padding:10px 12px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px">' + (data.priceLabel || data.estateValueLabel || data.location || data.authority || '') + '</td></tr>';
  }).join('');

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#000;font-family:Inter,Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td style="background:#0a0a0a;padding:32px;border-bottom:3px solid ' + accent + ';text-align:center"><div style="font-family:Outfit,sans-serif;font-size:24px;font-weight:800;color:#fff"><span style="color:' + accent + '">9am</span>Leads</div><p style="color:#888;font-size:13px;margin-top:4px">' + customer.lead_type + ' â€” ' + new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '</p></td></tr><tr><td style="background:#0a0a0a;padding:24px 32px"><div style="font-size:36px;font-weight:800;color:' + accent + ';font-family:Outfit,sans-serif">' + leads.length + '</div><div style="font-size:13px;color:#888;margin-bottom:16px">new leads today for ' + customer.company + '</div><p style="font-size:14px;color:#ccc;line-height:1.7">Good morning! Your daily lead sheet has arrived. Below are the new opportunities we\'ve found for you. Pick up the phone and start calling â€” you\'re the first to see these leads.</p></td></tr><tr><td style="background:#000;padding:0 32px"><table width="100%" cellpadding="0" cellspacing="0"><tr><th style="padding:10px 12px;border-bottom:1px solid #1a1a1a;color:#888;font-size:11px;text-transform:uppercase;text-align:left;letter-spacing:.5px">Details</th><th style="padding:10px 12px;border-bottom:1px solid #1a1a1a;color:#888;font-size:11px;text-transform:uppercase;text-align:left;letter-spacing:.5px">Value</th></tr>' + leadsHTML + '</table></td></tr><tr><td style="background:#0a0a0a;padding:24px 32px;border-top:1px solid #1a1a1a;text-align:center"><p style="color:#888;font-size:12px;margin:0">Delivered at 9am by 9amLeads Â· <a href="http://localhost:' + (8004 + ['moving','probate','newbusiness','planning','tenders'].indexOf(customer.product)) + '/dashboard.html" style="color:' + accent + '">View in Dashboard</a></p><p style="color:#555;font-size:11px;margin-top:6px">If you no longer wish to receive these emails, <a href="#" style="color:#888">unsubscribe here</a></p></td></tr></table></td></tr></table></body></html>';
}

// POST /api/test/delivery â€” manually trigger delivery for one customer
app.post('/api/test/delivery', authMiddleware, async (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'User not found' });

  const leads = db.prepare('SELECT * FROM leads WHERE customer_id = ? AND delivered = 0 LIMIT ?').all(req.user.id, customer.leads_per_day || 20);
  
  if (leads.length === 0) {
    return res.json({ message: 'No undelivered leads', leads: 0 });
  }

  const htmlContent = generateLeadEmailHTML(customer, leads);
  
  try {
    if (BREVO_API_KEY) {
      await sendBrevoEmail(
        { email: customer.email, name: customer.company },
        'TEST: ' + customer.lead_type + ' for ' + new Date().toLocaleDateString(),
        htmlContent
      );
    }
    // Save HTML to file for preview
    const filePath = path.join(DATA_DIR, 'delivery-' + customer.id + '-' + new Date().toISOString().split('T')[0] + '.html');
    fs.writeFileSync(filePath, htmlContent);

    res.json({ message: 'Delivery prepared', leads: leads.length, email_preview: filePath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/export â€” export customers for marketing
app.get('/api/admin/export', (req, res) => {
  const customers = db.prepare(`
    SELECT email, company, contact_name, phone, product, lead_type, business_type, 
           source, plan, marketing_consent, bounced, created_at, last_login
    FROM customers ORDER BY created_at DESC
  `).all();

  // CSV format
  const headers = 'Email,Company,Contact Name,Phone,Product,Lead Type,Business Type,Source,Plan,Marketing Consent,Bounced,Created At,Last Login\n';
  const rows = customers.map(c =>
    [c.email, c.company, c.contact_name, c.phone, c.product, c.lead_type, c.business_type,
     c.source, c.plan, c.marketing_consent, c.bounced, c.created_at, c.last_login].map(v => '"' + (v || '') + '"').join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=9amleads-customers.csv');
  res.send(headers + rows);
});

// GET /api/health
app.get('/api/health', (req, res) => {
  const customerCount = db.prepare('SELECT COUNT(*) as count FROM customers').get();
  const leadCount = db.prepare('SELECT COUNT(*) as count FROM leads').get();
  res.json({
    status: 'running',
    domain: 'www.9amleads.com',
    email: 'hello@9amleads.com',
    database: DB_FILE,
    customers: customerCount.count,
    leads: leadCount.count,
    brevo_configured: !!BREVO_API_KEY,
    scheduler: 'Active (8:30 AM daily)'
  });
});

// ===== WEBSITE ANALYTICS =====
const analytics = { visits: [], pages: {} };

app.post('/api/track', (req, res) => {
  const { page, referrer } = req.body;
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const visit = { page: page || '/', referrer: referrer || '', ip, time: Date.now(), ua: req.headers['user-agent'] || '' };
  analytics.visits.push(visit);
  if (analytics.visits.length > 10000) analytics.visits.splice(0, 5000);
  if (!analytics.pages[visit.page]) analytics.pages[visit.page] = 0;
  analytics.pages[visit.page]++;
  res.json({ ok: true });
});

app.get('/api/analytics/live', (req, res) => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  const live = analytics.visits.filter(v => v.time > cutoff);
  const uniqueIps = new Set(live.map(v => v.ip));
  res.json({ live: uniqueIps.size, visits5min: live.length, total: analytics.visits.length });
});

app.get('/api/analytics/pages', (req, res) => {
  const sorted = Object.entries(analytics.pages).sort((a, b) => b[1] - a[1]).slice(0, 20);
  res.json(sorted.map(([page, count]) => ({ page, count })));
});

// Tracking snippet to inject into HTML pages
const TRACKING_SNIPPET = `<script>
(function(){var i=new Image();i.src='https://nineamleads-api.onrender.com/api/track?p='+encodeURIComponent(window.location.pathname)+'&r='+encodeURIComponent(document.referrer||'')})();
</script>`;

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log('\n========================================');
  console.log('  9amLeads Production API Server');
  console.log('  Domain: www.9amleads.com');
  console.log('  Email: hello@9amleads.com');
  console.log('  Port: ' + PORT);
  console.log('  Database: ' + DB_FILE);
  console.log('  Brevo: ' + (BREVO_API_KEY ? 'CONFIGURED' : 'NOT SET'));
  console.log('  Scheduler: Active (8:30 AM daily)');
  console.log('========================================\n');
  console.log('Endpoints:');
  console.log('  POST /api/auth/signup   - Create account');
  console.log('  POST /api/auth/login    - Sign in');
  console.log('  GET  /api/auth/me       - Get profile');
  console.log('  GET  /api/leads         - Get leads');
  console.log('  GET  /api/leads/today   - Today\'s leads');
  console.log('  PATCH /api/leads/:id/status - Update lead status');
  console.log('  GET  /api/stats         - Dashboard stats');
  console.log('  PUT  /api/settings      - Update settings');
  console.log('  GET  /api/health        - Server health');
  console.log('  GET  /api/admin/stats   - System-wide stats');
  console.log('  GET  /api/admin/customers - All customers');
  console.log('  GET  /api/admin/export  - CSV export');
  console.log('  Stripe endpoints:');
  console.log('  POST /api/create-checkout - Create Stripe checkout session');
  console.log('  POST /api/stripe/webhook - Stripe webhook (payment confirmations)');
  console.log('  POST /api/subscribe    - Confirm subscription upgrade');
  console.log('  GET  /api/subscription  - Check subscription status');
  console.log('  Scraper endpoints:');
  console.log('  POST /api/scrape-run    - Queue a scraper run');
  console.log('  GET  /api/scrape-results - List/all scrape runs');
  console.log('  POST /api/scrape-save   - Save scraper leads to DB');
  console.log('========================================\n');
});
