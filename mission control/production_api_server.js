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

require('dotenv').config();

// ===== CONFIG =====
const PORT = process.env.PORT || process.env.API_PORT || 8012;
const JWT_SECRET = process.env.JWT_SECRET || '9amleads-prod-secret';
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:' + PORT;

// Postcode district data
const POSTCODE_DISTRICTS_FILE = path.join(DATA_DIR, 'uk-postcode-districts.json');
const POSTCODE_AREAS_FILE = path.join(DATA_DIR, 'uk-postcode-areas.json');
const POSTCODE_ASSIGNMENTS_FILE = path.join(DATA_DIR, 'postcode-assignments.json');

// Postcode district limits per plan (districts are granular, so higher limits)
const POSTCODE_LIMITS = {
  free_trial: 5,
  essential: 5,
  starter: 5,
  pro: 10,
  enterprise: 50
};

function loadPostcodeDistricts() {
  try { return JSON.parse(fs.readFileSync(POSTCODE_DISTRICTS_FILE, 'utf-8')); }
  catch { return {}; }
}

function loadPostcodeAreas() {
  try { return JSON.parse(fs.readFileSync(POSTCODE_AREAS_FILE, 'utf-8')); }
  catch { return {}; }
}

function loadAssignments() {
  try { return JSON.parse(fs.readFileSync(POSTCODE_ASSIGNMENTS_FILE, 'utf-8')); }
  catch { return { assignments: {} }; }
}

function saveAssignments(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(POSTCODE_ASSIGNMENTS_FILE, JSON.stringify(data, null, 2));
}

function getPostcodeLimit(plan, extraPostcodes) {
  const base = POSTCODE_LIMITS[plan] || POSTCODE_LIMITS.free_trial;
  const extra = parseInt(extraPostcodes) || 0;
  return base + extra;
}

const EXTRAS_PRICE = 2000; // £20 per extra 5 postcode districts

function validatePostcodes(postcodes, customerPlan, customerProduct, customerId, extraPostcodes) {
  const districts = loadPostcodeDistricts();
  const areas = loadPostcodeAreas();
  const assignments = loadAssignments();
  const maxLimit = getPostcodeLimit(customerPlan, extraPostcodes);
  const errors = [];

  if (!Array.isArray(postcodes)) {
    return { valid: false, errors: ['Postcodes must be an array'] };
  }

  if (postcodes.length > maxLimit) {
    const limitLabel = maxLimit >= 999 ? 'unlimited' : maxLimit;
    errors.push('Your ' + customerPlan + ' plan allows ' + limitLabel + ' postcode district' + (maxLimit !== 1 ? 's' : '') + '. You selected ' + postcodes.length + '.');
  }

  for (const pc of postcodes) {
    const upper = pc.toUpperCase();
    if (!districts[upper]) {
      errors.push('"' + pc + '" is not a valid UK postcode district. Please pick a specific district like "' + (upper + '1') + '", not just the area code.');
      continue;
    }
    const existing = assignments.assignments[upper];
    if (existing && existing.customer_id !== customerId) {
      errors.push('"' + upper + '" (' + districts[upper].name + ') is already taken by another customer.');
    }
  }

  return { valid: errors.length === 0, errors };
}

function claimPostcodes(postcodes, customerId, product) {
  const assignments = loadAssignments();
  for (const pc of postcodes) {
    const upper = pc.toUpperCase();
    if (!assignments.assignments[upper]) {
      assignments.assignments[upper] = {
        customer_id: customerId,
        product: product,
        assigned_at: new Date().toISOString(),
        status: 'active'
      };
    }
  }
  saveAssignments(assignments);
}

function releasePostcodes(customerId) {
  const assignments = loadAssignments();
  let changed = false;
  for (const [code, assignment] of Object.entries(assignments.assignments)) {
    if (assignment.customer_id === customerId) {
      delete assignments.assignments[code];
      changed = true;
    }
  }
  if (changed) saveAssignments(assignments);
}

// Ensure data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true });

// ===== JSON DATABASE (drop-in replacement for better-sqlite3) =====
let _dbData = null;
let _dbLock = Promise.resolve();
function getDb() {
  if (!_dbData) { _dbData = loadDb(); saveDb(); }
  return _dbData;
}
function loadDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); }
  catch { return { customers: [], leads: [], deliveries: [], scraper_logs: [], subscriptions: [] }; }
}
function saveDb() {
  _dbLock = _dbLock.then(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(_dbData, null, 2));
  });
  return _dbLock;
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
    const colsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
    const valsMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
    if (colsMatch && valsMatch) {
      const cols = colsMatch[1].split(',').map(c => c.trim());
      const vals = valsMatch[1].split(',').map(v => v.trim());
      let paramIdx = 0;
      cols.forEach((c, i) => {
        const raw = vals[i];
        if (raw === '?') {
          row[c] = params[paramIdx++];
        } else {
          row[c] = raw.replace(/^'(.*)'$/, '$1');
        }
      });
    }
    if (row.id) getDb()[q.table].push(row);
    saveDb(); return { changes: 1 };
  }
  if (q.isUpdate) {
    const setMatch = sql.match(/SET\s+(.+?)(?:\s+WHERE|$)/i);
    const whereMatch = sql.match(/WHERE\s+(.+?)$/i);
    if (setMatch) {
      const clauses = setMatch[1].split(',');
      let paramIdx = 0;
      const updates = {};
      for (const clause of clauses) {
        const eqIdx = clause.indexOf('=');
        const key = clause.substring(0, eqIdx).trim().replace(/['"]/g, '');
        let val = clause.substring(eqIdx + 1).trim();
        if (val === '?') {
          val = params[paramIdx++];
        } else {
          val = val.replace(/^'(.*)'$/, '$1');
        }
        updates[key] = val;
      }
      let idVal = null;
      let idField = 'id';
      if (whereMatch) {
        const whereStr = whereMatch[1].trim();
        const eqIdx = whereStr.indexOf('=');
        idField = whereStr.substring(0, eqIdx).trim();
        let whereVal = whereStr.substring(eqIdx + 1).trim();
        if (whereVal === '?') {
          idVal = params[paramIdx++];
        } else {
          idVal = whereVal.replace(/^'(.*)'$/, '$1');
        }
      }
      if (idVal === null || idVal === undefined) idVal = params[params.length - 1];
      const idx = getDb()[q.table].findIndex(r => r[idField] == idVal);
      if (idx !== -1) { getDb()[q.table][idx] = { ...getDb()[q.table][idx], ...updates }; saveDb(); return { changes: 1 }; }
    }
    return { changes: 0 };
  }
  return { changes: 0 };
}

function _get(sql, params) {
  const q = _q(sql, params);
  if (q.table && getDb()[q.table]) {
    const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)\s+(DESC|ASC)/i);
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    let results = _filterWhere(getDb()[q.table], sql, params);
    if (orderMatch) {
      const field = orderMatch[1];
      const dir = orderMatch[2];
      results.sort((a, b) => dir === 'DESC' ? (b[field]||'').localeCompare(a[field]||'') : (a[field]||'').localeCompare(b[field]||''));
    }
    if (sql.includes('COUNT(*)')) {
      return { count: results.length };
    }
    if (limitMatch) results = results.slice(0, parseInt(limitMatch[1]));
    return results[0] || null;
  }
  return null;
}

function _filterWhere(rows, sql, params) {
  const whereIdx = sql.toUpperCase().indexOf('WHERE');
  if (whereIdx === -1) return rows;
  const whereClause = sql.substring(whereIdx + 5).replace(/\bORDER\s+BY\s+.+/i, '').replace(/\bLIMIT\s+\d+/i, '').replace(/\bOFFSET\s+\d+/i, '').trim();
  const conditions = whereClause.split(/\bAND\b/i).map(c => c.trim()).filter(Boolean);
  const ops = ['!=', '<=', '>=', '<>', '=', '<', '>'];
  let paramIdx = 0;
  for (const cond of conditions) {
    let op = '=', opIdx = -1;
    const upper = cond.toUpperCase();
    if (upper.startsWith('DATE(')) {
      const dateStr = new Date().toISOString().split('T')[0];
      const match = cond.match(/DATE\(\s*(\w+)\s*\)\s*=\s*DATE\(\s*'now'\s*\)/i);
      if (match) {
        const field = match[1];
        rows = rows.filter(r => { const rv = r[field]; return rv && rv.startsWith(dateStr); });
      }
      continue;
    }
    for (const o of ops) {
      const idx = cond.indexOf(o);
      if (idx !== -1) { op = o; opIdx = idx; break; }
    }
    if (opIdx === -1) continue;
    const field = cond.substring(0, opIdx).trim();
    let val = cond.substring(opIdx + op.length).trim();
    if (val === '?') {
      val = params[paramIdx++];
    } else {
      val = val.replace(/^'(.*)'$/, '$1');
    }
    if (op === '!=' || op === '<>') {
      rows = rows.filter(r => r[field] != val);
    } else if (op === '<') {
      rows = rows.filter(r => Number(r[field]) < Number(val));
    } else if (op === '>') {
      rows = rows.filter(r => Number(r[field]) > Number(val));
    } else if (op === '<=') {
      rows = rows.filter(r => Number(r[field]) <= Number(val));
    } else if (op === '>=') {
      rows = rows.filter(r => Number(r[field]) >= Number(val));
    } else {
      rows = rows.filter(r => r[field] == val);
    }
  }
  return rows;
}

function _all(sql, params) {
  const q = _q(sql, params);
  if (q.table && getDb()[q.table]) {
    let results = _filterWhere(getDb()[q.table], sql, params);
    const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)\s+(DESC|ASC)/i);
    if (orderMatch) {
      const field = orderMatch[1];
      const dir = orderMatch[2];
      results.sort((a, b) => dir === 'DESC' ? (b[field]||'').localeCompare(a[field]||'') : (a[field]||'').localeCompare(b[field]||''));
    }
    // Count how many params were consumed by _filterWhere
    const consumed = (sql.match(/\?/g) || []).length - (params || []).length;
    const remaining = Math.max(0, (params || []).length - Math.abs(consumed));
    const limitMatch = sql.match(/LIMIT\s+(?:(\d+)|(\?))/i);
    const offsetMatch = sql.match(/OFFSET\s+(?:(\d+)|(\?))/i);
    let offset = 0;
    if (offsetMatch) {
      offset = offsetMatch[1] ? parseInt(offsetMatch[1]) : (params[params.length - (limitMatch ? 2 : 1)] || 0);
    }
    if (limitMatch) {
      const limit = limitMatch[1] ? parseInt(limitMatch[1]) : (params[params.length - (offsetMatch ? 2 : 1)] || 50);
      if (offset > 0) results = results.slice(offset, offset + limit);
      else results = results.slice(0, limit);
    } else if (offset > 0) {
      results = results.slice(offset);
    }
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
// Only serve specific public directories from root
app.use('/portal', express.static(path.join(ROOT_DIR, 'portal')));
app.use('/movingleadsdaily', express.static(path.join(ROOT_DIR, 'movingleadsdaily')));
app.use('/probateleads', express.static(path.join(ROOT_DIR, 'probateleads')));
app.use('/newbusinessalert', express.static(path.join(ROOT_DIR, 'newbusinessalert')));
app.use('/planningleads', express.static(path.join(ROOT_DIR, 'planningleads')));
app.use('/tenders', express.static(path.join(ROOT_DIR, 'tenders')));
app.use('/assets', express.static(path.join(ROOT_DIR, 'assets')));
app.use('/css', express.static(path.join(ROOT_DIR, 'css')));
app.use(express.static(FRONTEND_DIR, { index: 'index.html' }));
// SPA fallback - serve index.html for unknown routes (but not API routes)
app.get(/^\/(?!api\/).*$/, (req, res) => {
  const paths = [
    path.join(FRONTEND_DIR, req.path === '/' ? 'index.html' : req.path),
    path.join(FRONTEND_DIR, req.path, 'index.html'),
    path.join(ROOT_DIR, req.path === '/' ? '' : req.path.substring(1)),
    path.join(ROOT_DIR, req.path.substring(1), 'index.html'),
    path.join(FRONTEND_DIR, 'index.html')
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      // Block serving sensitive files
      const ext = path.extname(p).toLowerCase();
      if (ext === '.json' || ext === '.md' || ext === '.env' || ext === '.py' || path.basename(p) === 'node_modules') continue;
      res.sendFile(p); return;
    }
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
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = db.prepare('SELECT id FROM customers WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);
    const trial_ends = new Date(Date.now() + 7 * 86400000).toISOString();
    const verification_token = require('crypto').randomBytes(32).toString('hex');

    const PRODUCT_MAP = {
      moving: { lead_type: 'Moving Leads', business_type: 'Removal Company' },
      probate: { lead_type: 'Probate Leads', business_type: 'Solicitor & Estate Agent' },
      newbusiness: { lead_type: 'New Business Alerts', business_type: 'Accountant & B2B Service' },
      planning: { lead_type: 'Planning Permissions', business_type: 'Architect & Builder' },
      tenders: { lead_type: 'Public Tenders', business_type: 'IT, Construction, Cleaning & More' },
    };
    const productInfo = PRODUCT_MAP[product] || PRODUCT_MAP.moving;
    const areas = Array.isArray(targetAreas) ? targetAreas : [];

    // Validate postcode district availability
    if (areas.length > 0) {
      const validation = validatePostcodes(areas, 'free_trial', product, id);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors.join(' ') });
      }
    }

    db.prepare(`INSERT INTO customers (id, email, company, contact_name, phone, password_hash, product, lead_type, business_type, target_areas, biz_field2, biz_field3, source, plan, trial_ends, marketing_consent, created_at, extra_postcodes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, email.toLowerCase(), company, name || '', phone || '', password_hash,
      product, productInfo.lead_type, productInfo.business_type,
      JSON.stringify(targetAreas || []), bizField2 || '', bizField3 || '',
      source || 'direct', 'free_trial', trial_ends, marketingConsent ? 1 : 0,
      new Date().toISOString(), '0'
    );

    // Claim postcodes
    if (areas.length > 0) {
      claimPostcodes(areas, id, product);
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    customer.verification_token = verification_token;
    customer.email_verified = 0;
    saveDb();

    // Send verification email
    try {
      const verifyUrl = PUBLIC_URL.replace(/\/+$/, '') + '/api/auth/verify-email?token=' + verification_token;
      await sendBrevoEmail(
        { email: customer.email, name: customer.contact_name || customer.company },
        'Verify your 9amLeads account',
        '<h2>Welcome to 9amLeads!</h2><p>Please verify your email address by clicking the link below:</p><p><a href="' + verifyUrl + '">Verify Email</a></p><p>Your free 7-day trial has started. You\'ll receive your first leads at 9am tomorrow.</p>'
      );
    } catch (e) {
      console.log('Verification email skipped:', e.message);
    }

    // Save to Brevo contact list
    try {
      await addBrevoContact(customer);
    } catch (e) {
      console.log('Brevo contact add skipped:', e.message);
    }

    const token = generateToken(customer);

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
        target_areas: JSON.parse(customer.target_areas || '[]'),
        email_verified: 0
      }
    });
  } catch (e) {
    console.error('Signup error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/verify-email — Verify email address
app.get('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Verification token required' });

    const customer = db.prepare('SELECT * FROM customers WHERE verification_token = ?').get(token);
    if (!customer) return res.status(400).json({ error: 'Invalid or expired verification token' });

    db.prepare('UPDATE customers SET email_verified = 1, verification_token = NULL WHERE id = ?').run(customer.id);
    saveDb();

    res.json({ message: 'Email verified successfully. You can now log in.' });
  } catch (e) {
    console.error('Verification error:', e);
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
        target_areas: JSON.parse(customer.target_areas || '[]'),
        email_verified: customer.email_verified || 0
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
    extra_postcodes: parseInt(customer.extra_postcodes) || 0,
    biz_field2: customer.biz_field2,
    biz_field3: customer.biz_field3,
    source: customer.source,
    marketing_consent: customer.marketing_consent === 1,
    email_verified: customer.email_verified || 0,
    created_at: customer.created_at,
    last_login: customer.last_login
  });
});

// ===== PASSWORD RESET =====

// POST /api/auth/forgot-password — send reset link
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email.toLowerCase());
    // Always return success to prevent email enumeration
    if (!customer) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000).toISOString(); // 1 hour

    db.prepare('UPDATE customers SET reset_token = ?, reset_expires = ? WHERE id = ?').run(resetToken, resetExpires, customer.id);
    saveDb();

    const resetUrl = PUBLIC_URL.replace(/\/+$/, '') + '/portal/reset-password.html?token=' + resetToken;

    try {
      await sendBrevoEmail(
        { email: customer.email, name: customer.contact_name || customer.company },
        'Reset your 9amLeads password',
        '<h2>Password Reset</h2><p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="' + resetUrl + '">Reset Password</a></p><p>If you did not request this, please ignore this email.</p>'
      );
    } catch (e) {
      console.log('Reset email skipped:', e.message);
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (e) {
    console.error('Forgot password error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/reset-password — reset password with token
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const customer = db.prepare('SELECT * FROM customers WHERE reset_token = ?').get(token);
    if (!customer) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const expires = new Date(customer.reset_expires);
    if (new Date() > expires) return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });

    const password_hash = await bcrypt.hash(password, 10);
    db.prepare('UPDATE customers SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?').run(password_hash, customer.id);
    saveDb();

    res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (e) {
    console.error('Reset password error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
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

// ===== POSTCODE ENDPOINTS =====

// GET /api/postcodes — List all UK postcode districts grouped by area with availability
app.get('/api/postcodes', (req, res) => {
  const districts = loadPostcodeDistricts();
  const areas = loadPostcodeAreas();
  const assignments = loadAssignments();
  const product = req.query.product || 'moving';

  // Group districts by area
  const areaMap = {};
  for (const [code, info] of Object.entries(districts)) {
    const areaCode = info.area;
    if (!areaMap[areaCode]) {
      areaMap[areaCode] = {
        area_code: areaCode,
        area_name: (areas[areaCode] || {}).name || areaCode,
        region: info.region,
        districts: []
      };
    }
    const assignment = assignments.assignments[code];
    areaMap[areaCode].districts.push({
      code,
      name: info.name,
      available: !assignment,
      taken_by: assignment ? assignment.customer_id : null
    });
  }

  const result = Object.values(areaMap);
  const regions = [...new Set(Object.values(districts).map(d => d.region))];

  res.json({ areas: result, districts: Object.keys(districts).length, regions });
});

// GET /api/postcodes/mine — Get current customer's assigned postcode districts with limits
app.get('/api/postcodes/mine', authMiddleware, (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'User not found' });

  const districts = loadPostcodeDistricts();
  const areas = loadPostcodeAreas();
  const currentDistricts = JSON.parse(customer.target_areas || '[]');
  const extraPostcodes = parseInt(customer.extra_postcodes) || 0;
  const maxLimit = getPostcodeLimit(customer.plan, extraPostcodes);

  const withDetails = currentDistricts.map(code => {
    const upper = code.toUpperCase();
    const info = districts[upper];
    if (info) {
      return { code: upper, name: info.name, area: info.area, area_name: (areas[info.area] || {}).name || info.area, region: info.region };
    }
    // Fallback: treat as area code
    const areaInfo = areas[upper];
    return { code: upper, name: areaInfo ? areaInfo.name : upper, area: upper, area_name: areaInfo ? areaInfo.name : '', region: areaInfo ? areaInfo.region : '' };
  });

  res.json({
    postcodes: withDetails,
    count: withDetails.length,
    max_limit: maxLimit,
    plan: customer.plan,
    can_add_more: withDetails.length < maxLimit,
    limit_label: maxLimit >= 999 ? 'Unlimited' : String(maxLimit),
    base_limit: getPostcodeLimit(customer.plan, 0),
    extra_postcodes: extraPostcodes,
    can_extra: customer.plan !== 'free_trial' && customer.plan !== 'cancelled'
  });
});

// PUT /api/postcodes/update — Update the customer's selected postcodes
app.put('/api/postcodes/update', authMiddleware, (req, res) => {
  const { postcodes } = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'User not found' });

  const validation = validatePostcodes(postcodes, customer.plan, customer.product, req.user.id);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.errors.join(' ') });
  }

  // Release old postcodes, claim new ones
  releasePostcodes(req.user.id);
  claimPostcodes(postcodes, req.user.id, customer.product);

  db.prepare('UPDATE customers SET target_areas = ? WHERE id = ?').run(JSON.stringify(postcodes), req.user.id);
  saveDb();

  res.json({ success: true, postcodes, count: postcodes.length, max_limit: getPostcodeLimit(customer.plan) });
});

// POST /api/postcodes/extra — Purchase extra postcode districts
app.post('/api/postcodes/extra', authMiddleware, async (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    if (customer.plan === 'free_trial' || customer.plan === 'cancelled') {
      return res.status(400).json({ error: 'Upgrade to a paid plan first' });
    }

    const currentExtra = parseInt(customer.extra_postcodes) || 0;
    const newExtra = currentExtra + 5;

    db.prepare('UPDATE customers SET extra_postcodes = ? WHERE id = ?').run(String(newExtra), req.user.id);
    saveDb();

    const newLimit = getPostcodeLimit(customer.plan, newExtra);
    res.json({
      success: true,
      extra_postcodes: newExtra,
      total_postcode_limit: newLimit,
      message: 'Added 5 extra postcode districts (£20/mo). Your limit is now ' + newLimit + ' districts.'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
  if (target_areas) {
    const validation = validatePostcodes(target_areas, customer.plan, customer.product, req.user.id);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(' ') });
    }
    releasePostcodes(req.user.id);
    claimPostcodes(target_areas, req.user.id, customer.product);
    db.prepare('UPDATE customers SET target_areas = ? WHERE id = ?').run(JSON.stringify(target_areas), req.user.id);
  }

  res.json({ success: true });
});

// ===== ADMIN ENDPOINTS =====

// GET /api/admin/stats — overall system stats
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

// GET /api/admin/customers — list all customers (paginated)
app.get('/api/admin/customers', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  const allCustomers = db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all();
  const total = db.prepare('SELECT COUNT(*) as count FROM customers').get();
  const customers = allCustomers.slice((page - 1) * limit, page * limit);

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
// Runs at 9:00 AM every day to prepare and send lead sheets
// ===== LEAD LIMITS PER PLAN PER PRODUCT =====
// Realistic daily lead volumes based on available UK data supply
const PRODUCT_LEAD_FILES = {
  moving: { file: 'moving-leads.json', key: 'customerId' },
  probate: { file: 'probate-leads.json', key: 'customerId' },
  newbusiness: { file: 'newbusiness-leads.json', key: 'customerId' },
  planning: { file: 'planning-leads.json', key: 'customerId' },
  tenders: { file: 'tenders-leads.json', key: 'customerId' },
};

const PLAN_LIMITS = {
  // Flat leads per day across ALL products
  '*': { free_trial: 5, starter: 5, pro: 15, enterprise: 50 },
  moving: { free_trial: 5, starter: 5, pro: 15, enterprise: 50 },
  probate: { free_trial: 5, starter: 5, pro: 15, enterprise: 50 },
  newbusiness: { free_trial: 5, starter: 5, pro: 15, enterprise: 50 },
  planning: { free_trial: 5, starter: 5, pro: 15, enterprise: 50 },
  tenders: { free_trial: 5, starter: 5, pro: 15, enterprise: 50 },
};

const PLAN_NAMES = {
  free_trial: 'Free Trial',
  starter: 'Starter',
  essential: 'Essential',
  pro: 'Professional',
  enterprise: 'Enterprise',
};

function getPlanLimit(product, plan) {
  const productLimits = PLAN_LIMITS[product] || PLAN_LIMITS['*'];
  // Map 'essential' -> 'starter' since they share the same level
  const planKey = plan === 'essential' ? 'starter' : plan;
  return productLimits[planKey] || productLimits['free_trial'] || 5;
}

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
    trial_day1: '<div style="padding:24px;text-align:center"><div style="font-size:48px;margin-bottom:12px">✅</div><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">Your Free Trial Is Active</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:20px">Your first ' + productName + ' will land in your inbox at <strong style="color:' + accent + '">9am tomorrow morning</strong>. Here\'s your daily routine for the next 7 days:</p><div style="display:inline-block;text-align:left;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 24px;margin-bottom:16px"><p style="color:#ccc;font-size:13px;line-height:2;margin:0">📥 <strong>9:00am</strong> — Lead sheet arrives in your inbox<br>📞 <strong>9:01am</strong> — You start calling hot leads<br>💰 <strong>9:30am</strong> — First quotes going out<br>✅ <strong>By noon</strong> — Bookings coming in</p></div><p style="color:#888;font-size:12px">No commitment. Cancel anytime. Your leads are exclusive to you.</p></div>',
    trial_day3: '<div style="padding:24px;text-align:center"><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">How Are Your Leads Looking?</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:16px">You\'re 3 days in. Quick check-in:</p><div style="display:inline-block;text-align:left;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 24px;margin-bottom:12px"><p style="color:#ccc;font-size:13px;line-height:1.8;margin:0">✔ Are the leads relevant to your business?<br>✔ Is the volume what you expected?<br>✔ Have you called any yet?</p></div><p style="color:#888;font-size:13px;line-height:1.6">Reply to this email and let us know. Good or bad — we\'re here to help you get the most out of 9amLeads.<br><br><span style="color:' + accent + ';font-weight:600">💡 Tip:</span> Call within 30 minutes of receiving your leads. Speed is your biggest advantage.</p></div>',
    trial_day5: '<div style="padding:24px;text-align:center"><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:16px">3 Tips to Convert More Leads</h2><div style="display:inline-block;text-align:left;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px 24px;margin-bottom:12px"><div style="margin-bottom:14px"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;margin-right:8px;float:left">1</div><div style="margin-left:40px"><strong style="color:#fff;font-size:14px">Call within 30 minutes</strong><br><span style="color:#888;font-size:13px">Speed is everything. Our data shows calling within 30 minutes triples your conversion rate.</span></div></div><div style="margin-bottom:14px;clear:both"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;margin-right:8px;float:left">2</div><div style="margin-left:40px"><strong style="color:#fff;font-size:14px">Mention their specific situation</strong><br><span style="color:#888;font-size:13px">Reference their property, industry, or tender number. Generic pitches lose. Personalised pitches win.</span></div></div><div style="clear:both"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;margin-right:8px;float:left">3</div><div style="margin-left:40px"><strong style="color:#fff;font-size:14px">Ask for the next step</strong><br><span style="color:#888;font-size:13px">Don\'t just send a quote. Book a call, schedule a visit, ask for the business. Close starts with asking.</span></div></div></div></div>',
    trial_day7: '<div style="padding:24px;text-align:center"><div style="font-size:48px;margin-bottom:12px">⏳</div><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">Your Free Trial Ends Tomorrow</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:20px">After tomorrow, your daily ' + productName + ' delivery will pause. Upgrade now to keep them flowing without interruption.</p><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,' + accent + ',#e85d26);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:16px;box-shadow:0 4px 20px ' + accent + '40">Upgrade Now — Keep Your Leads →</a><p style="color:#888;font-size:12px;margin-top:12px">Plans from just £49/month · Cancel anytime</p></div>',
    trial_day9: '<div style="padding:24px;text-align:center"><div style="font-size:48px;margin-bottom:12px">⏸️</div><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">Your Daily Leads Have Paused</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:12px">Your 7-day free trial has ended and your daily ' + productName + ' delivery has been paused.</p><div style="display:inline-block;text-align:left;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 24px;margin-bottom:16px"><p style="color:#ccc;font-size:13px;line-height:1.8;margin:0"><strong style="color:#fff">To restart:</strong><br>1. Log into your dashboard<br>2. Choose your plan<br>3. Leads restart at 9am tomorrow</p></div><p style="color:#888;font-size:12px">Your lead history is still there. Nothing has been lost.</p></div>',
    trial_day12: '<div style="padding:24px;text-align:center"><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">Still Not Sure?</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:16px">We understand. Every business is different. Maybe the leads weren\'t quite right, or the timing wasn\'t perfect.</p><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:12px">Reply to this email and tell us what\'s holding you back. We\'ll help you figure out if 9amLeads is right for your ' + bizType + '.</p><p style="color:#888;font-size:12px">No sales pitch. Just honest, helpful advice.</p></div>',
    trial_day16: '<div style="padding:24px;text-align:center"><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:16px">3 Businesses That Transformed Their Pipeline</h2><div style="display:inline-block;text-align:left;max-width:400px"><div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 18px;margin-bottom:10px"><p style="color:#ccc;font-size:13px;line-height:1.6;margin:0">"Got 12 leads in my first week using 9amLeads. Converted 3. Made <strong style="color:' + accent + '">£3,600</strong> in additional revenue."</p></div><div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 18px;margin-bottom:10px"><p style="color:#ccc;font-size:13px;line-height:1.6;margin:0">"We\'ve picked up <strong style="color:' + accent + '">4 new clients</strong> in our first month using 9amLeads. Already covered our annual subscription 10x over."</p></div><div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 18px"><p style="color:#ccc;font-size:13px;line-height:1.6;margin:0">"Won 2 contracts worth <strong style="color:' + accent + '">£1.4M</strong> in our first quarter. Best business decision we\'ve made."</p></div></div><p style="color:#888;font-size:13px;margin-top:16px">Your success story could be next. Your account is still waiting.</p></div>',
    trial_day21: '<div style="padding:24px;text-align:center"><div style="font-size:48px;margin-bottom:12px">💝</div><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">Come Back — 30% Off Your First Month</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:12px">Use code <strong style="color:' + accent + ';font-size:24px;letter-spacing:2px">WELCOME30</strong> at checkout for 30% off your first month.</p><p style="color:#888;font-size:13px">No commitment. Cancel anytime. Your ' + productName + ' restart at 9am tomorrow.</p></div>',
    trial_day30: '<div style="padding:24px;text-align:center"><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">Your Account Is Still Waiting</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:12px">Your account and lead history are still here. Nothing has been deleted. Upgrade anytime to reactivate your daily ' + productName + ' delivery at 9am.</p><p style="color:#888;font-size:13px">It takes 30 seconds. Your leads restart tomorrow.</p></div>',
    trial_day60: '<div style="padding:24px;text-align:center"><div style="font-size:48px;margin-bottom:12px">⏰</div><h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px">Last Chance — Account Will Be Archived</h2><p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:12px">Your account will be archived in 30 days. All your lead history will be preserved — but you\'ll need to contact us to reactivate.</p><p style="color:#888;font-size:13px">Upgrade now to keep everything active and your ' + productName + ' flowing at 9am every morning. This is your final notice.</p></div>',
  };
  
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#000;font-family:Inter,Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%"><tr><td style="background:#0a0a0a;padding:28px;border-bottom:3px solid ' + accent + ';text-align:center"><div style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff"><span style="color:' + accent + '">9am</span>Leads</div><p style="color:#888;font-size:12px;margin-top:4px">' + customer.company + '</p></td></tr><tr><td style="background:#0a0a0a;padding:24px 28px">' + (templates[template] || templates.trial_day1) + '</td></tr><tr><td style="background:#0a0a0a;padding:20px 28px;border-top:1px solid #1a1a1a;text-align:center"><p style="color:#888;font-size:11px;margin:0">9am Leads Ltd \u00b7 Company No. 17168176 \u00b7 <a href="#" style="color:#888">Unsubscribe</a></p></td></tr></table></td></tr></table></body></html>';
}

// ===== SCRAPER SCHEDULER: Daily at 5:30 AM =====
// Generates fresh leads from real APIs (Apify, Gov.uk, etc.) or demo data.
// Leads are saved to data/{product}-leads.json for the distributor at 9am.
cron.schedule('30 5 * * *', async () => {
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 0) { console.log('[SCRAPER] Sunday — no scraping. Skipping.'); return; }

  console.log('[SCRAPER] Starting daily lead generation (' + Object.keys(PRODUCT_LEAD_FILES).length + ' products)...');

  for (const [product, config] of Object.entries(PRODUCT_LEAD_FILES)) {
    try {
      console.log('[SCRAPER] Generating ' + product + ' leads...');
      
      // Try to run the standalone scraper if it exists (uses Apify, Gov.uk APIs, etc.)
      // Try both naming conventions: {product}_leads_scraper.js and {product}_scraper.js
      let scraperFile = path.join(__dirname, product + '_leads_scraper.js');
      if (!fs.existsSync(scraperFile)) {
        scraperFile = path.join(__dirname, product + '_scraper.js');
      }
      if (fs.existsSync(scraperFile)) {
        try {
          const { execSync } = require('child_process');
          execSync('node ' + path.basename(scraperFile) + ' --all', { cwd: __dirname, timeout: 120000, stdio: 'pipe' });
          console.log('[SCRAPER] ' + product + ' scraper completed');
          continue;
        } catch (e) {
          console.log('[SCRAPER] ' + product + ' scraper failed, using demo data: ' + (e.stderr || e.message).substring(0, 100));
        }
      }

      // Fallback: generate demo leads so the pipeline always works
      const leads = generateDemoLeads(product, 30);
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(path.join(DATA_DIR, config.file), JSON.stringify(leads, null, 2));
      console.log('[SCRAPER] ' + product + ': ' + leads.length + ' demo leads saved');
    } catch (e) {
      console.error('[SCRAPER] ' + product + ' generation failed:', e.message);
    }
  }
  console.log('[SCRAPER] Daily lead generation complete');
});

// Generate realistic-looking demo leads for any product
function generateDemoLeads(product, count) {
  const now = new Date().toISOString();
  const leads = [];
  const areas = [
    { city: 'London', pc: 'SW1A', pcPrefix: 'SW' },
    { city: 'London', pc: 'SW3', pcPrefix: 'SW' },
    { city: 'London', pc: 'W8', pcPrefix: 'W' },
    { city: 'London', pc: 'N1', pcPrefix: 'N' },
    { city: 'London', pc: 'SE1', pcPrefix: 'SE' },
    { city: 'London', pc: 'EC2', pcPrefix: 'EC' },
    { city: 'Manchester', pc: 'M1', pcPrefix: 'M' },
    { city: 'Birmingham', pc: 'B1', pcPrefix: 'B' },
    { city: 'Leeds', pc: 'LS1', pcPrefix: 'LS' },
    { city: 'Bristol', pc: 'BS1', pcPrefix: 'BS' },
    { city: 'Glasgow', pc: 'G1', pcPrefix: 'G' },
    { city: 'Cardiff', pc: 'CF1', pcPrefix: 'CF' },
  ];
  const streets = ['High Street', 'Station Road', 'London Road', 'Park Lane', 'Church Road', 'Victoria Street', 'Green Lane', 'Market Street', 'Oak Avenue', 'The Crescent', 'Manor Road', 'Queen Street', 'King Street', 'Mill Lane', 'New Road'];

  if (product === 'moving') {
    const types = ['House', 'Flat', 'Maisonette', 'Bungalow', 'Townhouse'];
    const agents = ['Savills', 'Foxtons', 'Knight Frank', 'Hamptons', 'Dexters'];
    const statuses = ['SSTC', 'Under Offer', 'Sold STC'];
    for (let i = 0; i < count; i++) {
      const area = areas[i % areas.length];
      const beds = Math.floor(Math.random() * 4) + 1;
      const price = beds <= 2 ? Math.floor(Math.random() * 200000) + 250000 : Math.floor(Math.random() * 500000) + 500000;
      leads.push({
        id: 'ML_' + Date.now() + '_' + i, address: Math.floor(Math.random() * 200) + 1 + ' ' + streets[i % streets.length] + ', ' + area.city + ' ' + area.pc,
        postcode: area.pc, city: area.city, bedrooms: beds, propertyType: types[i % types.length],
        price: price, status: statuses[i % statuses.length], agent: agents[i % agents.length],
        listedDate: new Date(Date.now() - Math.floor(Math.random() * 14) * 86400000).toISOString().split('T')[0],
        estimatedMoveWindow: (Math.floor(Math.random() * 8) + 4) + ' weeks', source: 'Rightmove', scrapedAt: now
      });
    }
  } else if (product === 'probate') {
    const surnames = ['Smith', 'Jones', 'Williams', 'Taylor', 'Brown', 'Davies', 'Wilson', 'Evans', 'Thomas', 'Roberts'];
    const registries = ['Birmingham', 'Manchester', 'Leeds', 'London', 'Cardiff', 'Edinburgh', 'Bristol', 'Liverpool'];
    for (let i = 0; i < count; i++) {
      const value = Math.floor(Math.random() * 900000) + 100000;
      const surname = surnames[i % surnames.length];
      const area = areas[i % areas.length];
      leads.push({
        id: 'PR_' + Date.now() + '_' + i, name: 'Estate of ' + surname,
        deceasedName: surname, estateValue: value, estateValueLabel: '\u00a3' + value.toLocaleString(),
        registry: registries[i % registries.length],
        address: Math.floor(Math.random() * 100) + 1 + ' ' + streets[i % streets.length] + ', ' + area.city + ' ' + area.pc,
        postcode: area.pc, city: area.city,
        legalAdvisor: surname + ' & Co Solicitors', source: 'Gov.uk Probate Register', scrapedAt: now
      });
    }
  } else if (product === 'newbusiness') {
    const bizTypes = ['Retail', 'Consulting', 'Tech', 'Hospitality', 'Construction', 'Healthcare', 'Marketing', 'Property'];
    for (let i = 0; i < count; i++) {
      const bizType = bizTypes[i % bizTypes.length];
      const area = areas[i % areas.length];
      leads.push({
        id: 'NB_' + Date.now() + '_' + i, name: streets[i % streets.length] + ' ' + bizType + ' Ltd',
        companyNumber: 'NI' + (Math.floor(Math.random() * 900000) + 100000),
        address: Math.floor(Math.random() * 50) + 1 + ' ' + streets[i % streets.length] + ', ' + area.city + ' ' + area.pc,
        postcode: area.pc, city: area.city,
        sicCode: (Math.floor(Math.random() * 90000) + 10000).toString(), ownerEmail: 'info@' + streets[i % streets.length].toLowerCase().replace(/\s/g, '') + '.co.uk',
        website: 'www.' + streets[i % streets.length].toLowerCase().replace(/\s/g, '') + '.co.uk',
        incorporationDate: new Date(Date.now() - Math.floor(Math.random() * 365) * 86400000).toISOString(), source: 'Companies House', scrapedAt: now
      });
    }
  } else if (product === 'planning') {
    const councils = ['Westminster City Council', 'Camden Council', 'Manchester City Council', 'Birmingham City Council', 'Leeds City Council', 'Bristol City Council'];
    const appTypes = ['Full Planning', 'Householder', 'Listed Building', 'Change of Use', 'Outline Planning'];
    for (let i = 0; i < count; i++) {
      const area = areas[i % areas.length];
      leads.push({
        id: 'PL_' + Date.now() + '_' + i, address: Math.floor(Math.random() * 200) + 1 + ' ' + streets[i % streets.length] + ', ' + area.city + ' ' + area.pc,
        postcode: area.pc, city: area.city, applicationType: appTypes[i % appTypes.length],
        description: 'Proposed ' + (['residential', 'commercial', 'mixed-use', 'retail', 'office'][i % 5]) + ' development',
        applicant: 'Applicant at ' + streets[i % streets.length], council: councils[i % councils.length],
        applicationRef: 'APP/' + new Date().getFullYear() + '/' + (Math.floor(Math.random() * 90000) + 10000),
        targetDecisionDate: new Date(Date.now() + Math.floor(Math.random() * 60) * 86400000).toISOString().split('T')[0],
        source: 'Planning Portal', scrapedAt: now
      });
    }
  } else if (product === 'tenders') {
    const authorities = ['NHS England', 'Ministry of Justice', 'Surrey County Council', 'Transport for London', 'Home Office', 'Environment Agency', 'Manchester City Council'];
    const categories = ['IT Services', 'Construction', 'Consulting', 'Facilities Management', 'Professional Services'];
    for (let i = 0; i < count; i++) {
      const val = Math.floor(Math.random() * 5000000) + 25000;
      const daysLeft = Math.floor(Math.random() * 30) + 5;
      leads.push({
        id: 'TD_' + Date.now() + '_' + i, title: categories[i % categories.length] + ' Contract - ' + authorities[i % authorities.length],
        buyer: authorities[i % authorities.length], contractValue: val,
        contractValueLabel: '\u00a3' + val.toLocaleString(),
        description: 'Opportunity for ' + categories[i % categories.length].toLowerCase() + ' services',
        publishedDate: new Date().toISOString().split('T')[0],
        closingDate: new Date(Date.now() + daysLeft * 86400000).toISOString().split('T')[0],
        deadlineDaysRemaining: daysLeft, cpvCode: String(Math.floor(Math.random() * 900000) + 100000),
        source: 'Contracts Finder', scrapedAt: now
      });
    }
  }

  return leads;
}

// ===== MAIN SCHEDULER: Daily at 9:00 AM (sharp) =====
// Lead distributor must run before this (scrapers → match → insert → email)
cron.schedule('0 9 * * *', async () => {
  console.log('[SCHEDULER] Starting daily lead delivery...');

  // Sunday check — no lead delivery on Sundays
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 0) {
    console.log('[SCHEDULER] Sunday — no lead delivery (Mon-Sat only). Skipping.');
    return;
  }

  // Run lead distributor before delivery (matches scraped leads to customers)
  try {
    console.log('[SCHEDULER] Running lead distributor...');
    const distributor = require('./lead_distributor.js');
    await distributor.distributeAll(false);
    console.log('[SCHEDULER] Lead distribution complete');
  } catch (e) {
    console.error('[SCHEDULER] Lead distributor error (non-fatal):', e.message);
  }

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
        
        // ---- CASE 1: Active trial or paid plan → send leads ----
        if (!isExpired || customer.plan !== 'free_trial') {
          const limit = getPlanLimit(customer.product, customer.plan);
          
          const allLeads = db.prepare(
            'SELECT * FROM leads WHERE customer_id = ? AND delivered = 0'
          ).all(customer.id);
          const todayStr = new Date().toISOString().split('T')[0];
          const leads = allLeads.filter(l => l.created_at && l.created_at.startsWith(todayStr)).slice(0, limit);

          if (leads.length > 0) {
            const htmlContent = generateLeadEmailHTML(customer, leads);
            const result = await sendBrevoEmail(
              { email: customer.email, name: customer.company },
              customer.lead_type + ' for ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
              htmlContent
            );

            // Mark ONLY the sent leads as delivered (not all undelivered leads)
            const leadIds = leads.map(l => "'" + l.id + "'");
            db.prepare('UPDATE leads SET delivered = 1, delivered_at = datetime(\'now\') WHERE id IN (' + leadIds.join(',') + ')').run();
            db.prepare('INSERT INTO deliveries (id, customer_id, product, lead_count, email_status, email_id) VALUES (?, ?, ?, ?, ?, ?)').run(
              uuidv4(), customer.id, customer.product, leads.length, 'sent', result.messageId || ''
            );
            leads_sent++;
          }
        }
        
        // ---- CASE 2: Trial just expired → send campaign email + mark ----
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

// POST /api/create-checkout — create Stripe Checkout Session
app.post('/api/create-checkout', authMiddleware, async (req, res) => {
  try {
    if (!STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe not configured. Add keys in Settings → Stripe Payments.' });
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

    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:' + PORT;
    const successUrl = baseUrl + '/portal/dashboard.html?checkout=success&session_id={CHECKOUT_SESSION_ID}';
    const cancelUrl = baseUrl + '/portal/dashboard.html?checkout=cancel';

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

// Stripe webhook — receives checkout.session.completed events
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

      const limit = getPlanLimit(product, plan);

      // Update customer plan
      db.prepare('UPDATE customers SET plan = ?, leads_per_day = ?, trial_ends = NULL WHERE id = ?')
        .run(plan, limit, customerId);

      // Create or update subscription record
      const existingSub = db.prepare('SELECT id FROM subscriptions WHERE customer_id = ?').get(customerId);
      const now = new Date().toISOString();
      const monthEnd = new Date(Date.now() + 30 * 86400000).toISOString();
      if (existingSub) {
        db.prepare(`UPDATE subscriptions SET stripe_id = ?, plan = ?, status = 'active',
          current_period_start = ?, current_period_end = ?, updated_at = ? WHERE customer_id = ?`)
          .run(subscriptionId || '', plan, now, monthEnd, now, customerId);
      } else {
        db.prepare(`INSERT INTO subscriptions (id, customer_id, stripe_id, plan, status, current_period_start, current_period_end, created_at)
          VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`)
          .run(uuidv4(), customerId, subscriptionId || '', plan, now, monthEnd, now);
      }

      console.log('[WEBHOOK] Payment confirmed:', customer.email, '→', plan, '(product:', product + ')');
    }

    // Handle subscription updates (upgrades, downgrades, cancellation at period end)
    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      const subId = sub.id;
      const status = sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : sub.status === 'canceled' ? 'canceled' : sub.status === 'trialing' ? 'trialing' : 'inactive';

      const existingSub = db.prepare('SELECT * FROM subscriptions WHERE stripe_id = ?').get(subId);
      if (existingSub) {
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : existingSub.current_period_end;
        db.prepare(`UPDATE subscriptions SET status = ?, current_period_start = ?, current_period_end = ?,
          cancel_at_period_end = ?, updated_at = datetime('now') WHERE stripe_id = ?`)
          .run(status, sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : existingSub.current_period_start,
            periodEnd, sub.cancel_at_period_end || false, subId);

        // If cancelled at period end, let customer finish the month
        if (status === 'canceled' || (sub.cancel_at_period_end && sub.status === 'active')) {
          db.prepare('UPDATE customers SET plan = ? WHERE id = ?')
            .run(sub.cancel_at_period_end ? existingSub.plan : 'cancelled', existingSub.customer_id);
          if (!sub.cancel_at_period_end) {
            db.prepare('UPDATE customers SET leads_per_day = 0 WHERE id = ?').run(existingSub.customer_id);
          }
        }
        console.log('[WEBHOOK] Subscription updated:', subId, '→', status);
      }
    }

    // Handle subscription deletion (immediate cancellation)
    if (event.type === 'customer.subscription.deleted') {
      const delSub = event.data.object;
      const delSubId = delSub.id;
      const existingSub = db.prepare('SELECT * FROM subscriptions WHERE stripe_id = ?').get(delSubId);
      if (existingSub) {
        db.prepare('UPDATE subscriptions SET status = \'canceled\', canceled_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE stripe_id = ?').run(delSubId);
        db.prepare('UPDATE customers SET plan = \'cancelled\', leads_per_day = 0 WHERE id = ?').run(existingSub.customer_id);
        console.log('[WEBHOOK] Subscription cancelled for customer', existingSub.customer_id);
      }
    }

    // Handle successful invoice payment (monthly renewal)
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      const invSubId = invoice.subscription;
      if (invSubId) {
        const invSub = db.prepare('SELECT * FROM subscriptions WHERE stripe_id = ?').get(invSubId);
        if (invSub) {
          const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString();
          const amount = invoice.total ? '£' + (invoice.total / 100).toFixed(2) : 'unknown';
          // Reset fail_count on successful payment
          db.prepare('UPDATE subscriptions SET current_period_end = ?, status = \'active\', fail_count = 0, updated_at = datetime(\'now\') WHERE stripe_id = ?').run(periodEnd, invSubId);
          // Reactivate customer if they were in cancelled state
          db.prepare('UPDATE customers SET plan = ?, leads_per_day = ? WHERE id = ? AND plan = \'cancelled\'')
            .run(invSub.plan, getPlanLimit(invSub.product || 'moving', invSub.plan), invSub.customer_id);
          console.log('[WEBHOOK] Payment succeeded:', invSub.customer_id, '-', invSub.plan, '-', amount);
        }
      }
    }

    // Handle failed invoice payment
    if (event.type === 'invoice.payment_failed') {
      const failInvoice = event.data.object;
      const failSubId = failInvoice.subscription;
      if (failSubId) {
        const failSub = db.prepare('SELECT * FROM subscriptions WHERE stripe_id = ?').get(failSubId);
        if (failSub) {
          db.prepare('UPDATE subscriptions SET status = \'past_due\', updated_at = datetime(\'now\') WHERE stripe_id = ?').run(failSubId);
          const failCount = (failSub.fail_count || 0) + 1;
          db.prepare('UPDATE subscriptions SET fail_count = ? WHERE stripe_id = ?').run(failCount, failSubId);
          if (failCount >= 3) {
            db.prepare('UPDATE customers SET plan = \'cancelled\', leads_per_day = 0 WHERE id = ?').run(failSub.customer_id);
            console.log('[WEBHOOK] Payment failed 3 times - disabled customer', failSub.customer_id);
          }
          console.log('[WEBHOOK] Payment failed for', failSub.customer_id, '(attempt ' + failCount + ')');
        }
      }
    }

    res.json({ received: true });
  } catch (e) {
    console.error('[WEBHOOK] Error:', e.message);
    res.status(200).json({ received: true });
  }
});

// POST /api/subscribe — upgrade current user's plan (after Stripe payment confirmed)
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

  const customerDb = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  const limit = getPlanLimit(customerDb?.product || 'moving', plan);
  db.prepare('UPDATE customers SET plan = ?, leads_per_day = ?, trial_ends = NULL WHERE id = ?').run(plan, limit, req.user.id);

  console.log('[UPGRADE] Customer ' + customer.email + ' upgraded to ' + plan);

  res.json({
    success: true,
    message: 'Upgraded to ' + plan + ' plan. Your daily leads will resume at 9am tomorrow.',
    plan,
    leads_per_day: limit
  });
});

// GET /api/subscription — check current subscription status
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

// POST /api/subscription/cancel — cancel subscription at period end
app.post('/api/subscription/cancel', authMiddleware, async (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    if (customer.plan === 'free_trial') {
      db.prepare('UPDATE customers SET plan = \'cancelled\', leads_per_day = 0 WHERE id = ?').run(req.user.id);
      releasePostcodes(req.user.id);
      return res.json({ success: true, message: 'Your free trial has been cancelled.' });
    }

    const sub = db.prepare('SELECT * FROM subscriptions WHERE customer_id = ? AND status = \'active\'').get(req.user.id);
    if (!sub || !sub.stripe_id) {
      // No active Stripe subscription -- cancel locally
      db.prepare('UPDATE customers SET plan = \'cancelled\', leads_per_day = 0 WHERE id = ?').run(req.user.id);
      releasePostcodes(req.user.id);
      return res.json({ success: true, message: 'Your subscription has been cancelled.' });
    }

    // Cancel at Stripe (period end so they keep access until month finishes)
    try {
      const result = await stripeApiRequest('POST', 'subscriptions/' + sub.stripe_id, { cancel_at_period_end: 'true' });
      db.prepare('UPDATE subscriptions SET cancel_at_period_end = 1, updated_at = datetime(\'now\') WHERE id = ?').run(sub.id);
      db.prepare('UPDATE customers SET plan = \'cancelled\', leads_per_day = 0 WHERE id = ?').run(req.user.id);
      releasePostcodes(req.user.id);
      console.log('[CANCEL] Customer ' + customer.email + ' cancelled (end of period)');
      res.json({ success: true, message: 'Your subscription has been cancelled. Access continues until the end of your billing period.' });
    } catch {
      // If Stripe call fails, cancel locally at least
      db.prepare('UPDATE customers SET plan = \'cancelled\', leads_per_day = 0 WHERE id = ?').run(req.user.id);
      db.prepare('UPDATE subscriptions SET status = \'canceled\', updated_at = datetime(\'now\') WHERE id = ?').run(sub.id);
      releasePostcodes(req.user.id);
      res.json({ success: true, message: 'Your subscription has been cancelled locally. Please contact hello@9amleads.com to confirm.' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/subscription/update — change plan (upgrade or downgrade)
app.post('/api/subscription/update', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    const validPlans = ['starter', 'pro', 'enterprise'];
    if (!plan || !validPlans.includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Choose: starter, pro, or enterprise' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });

    // Create Stripe checkout for the new plan (Stripe handles proration)
    const result = await stripeApiRequest('POST', 'checkout/sessions', {
      mode: 'subscription',
      customer_email: customer.email,
      'line_items[0][price]': STRIPE_PRICE_IDS[customer.product]?.[customer.product + '-' + plan] || '',
      'line_items[0][quantity]': '1',
      success_url: PUBLIC_URL + '/portal/dashboard.html?checkout=success',
      cancel_url: PUBLIC_URL + '/portal/dashboard.html?checkout=cancel',
      'metadata[customer_id]': customer.id,
      'metadata[product]': customer.product,
      'metadata[plan]': plan,
      'subscription_data[proration_behavior]': 'create_prorations',
    });

    if (result.url) {
      res.json({ url: result.url });
    } else {
      res.status(400).json({ error: result.error?.message || 'Plan change failed' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

// GET /api/scraped-businesses — return all known businesses (for dedup client-side)
app.get('/api/scraped-businesses', (req, res) => {
  const { product } = req.query;
  let list = loadScrapedBusinesses();
  if (product) list = list.filter(b => b.product === product || !b.product);
  res.json(list);
});

// POST /api/scraped-businesses/check — check which of the submitted businesses are new
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

// POST /api/scraped-businesses/add — save newly scraped businesses
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

// GET /api/scraped-businesses/stats — dedup statistics
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

// POST /api/scrape-run — execute a scraper for a given product and store results
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

// GET /api/scrape-results — list all scrape runs
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

// GET /api/scrape-results/:id — get a specific scrape run
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

// POST /api/scrape-save — save scraped leads to customer records
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

// ===== LEAD DISTRIBUTION ENDPOINTS =====
// POST /api/distribute — trigger lead distributor (match scraped leads to customers)
app.post('/api/distribute', async (req, res) => {
  try {
    const { product } = req.body || {};
    const distributor = require('./lead_distributor.js');
    let result;
    if (product) {
      result = await distributor.distributeProduct(product);
    } else {
      result = await distributor.distributeAll(false);
    }
    res.json({ success: true, result });
  } catch (e) {
    console.error('[DISTRIBUTE] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/distribute/status — distribution summary
app.get('/api/distribute/status', (req, res) => {
  try {
    const db = getDb();
    const customers = db.customers || [];
    const leads = db.leads || [];
    const undelivered = leads.filter(l => !l.delivered);
    const today = new Date().toISOString().split('T')[0];
    const todayLeads = leads.filter(l => l.created_at && l.created_at.startsWith(today));

    const byProduct = {};
    leads.forEach(l => { byProduct[l.product] = (byProduct[l.product] || 0) + 1; });
    const byCustomer = {};
    leads.forEach(l => { byCustomer[l.customer_id] = (byCustomer[l.customer_id] || 0) + 1; });

    res.json({
      customers: customers.length,
      total_leads: leads.length,
      undelivered: undelivered.length,
      today_leads: todayLeads.length,
      by_product: byProduct,
      by_customer: byCustomer,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
    scheduler: 'Active (9:00 AM daily)',
    campaign: 'Active (10 automated emails per trial)'
  });
});

// Generate lead email HTML (reuses existing template pattern)
function generateLeadEmailHTML(customer, leads) {
  const accent = { moving: '#ff6b35', probate: '#a855f7', newbusiness: '#06b6d4', planning: '#10b981', tenders: '#6366f1' }[customer.product] || '#0ea5e9';
  const dashboardUrl = PUBLIC_URL + '/portal/dashboard.html';

  const leadsHTML = leads.map(l => {
    const data = JSON.parse(l.data || '{}');
    let line = data.address || data.name || data.company || data.tenderTitle || data.tenderTitle || 'Lead';
    let value = data.priceLabel || data.estateValueLabel || data.price || data.location || data.authority || data.value || '';
    return '<tr><td style="padding:10px 12px;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px">' + line + '</td><td style="padding:10px 12px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px">' + value + '</td></tr>';
  }).join('');

  let body = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#000;font-family:Inter,Arial,sans-serif">';
  body += '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">';
  body += '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">';
  body += '<tr><td style="background:#0a0a0a;padding:32px;border-bottom:3px solid ' + accent + ';text-align:center">';
  body += '<div style="font-family:Outfit,sans-serif;font-size:24px;font-weight:800;color:#fff"><span style="color:' + accent + '">9am</span>Leads</div>';
  body += '<p style="color:#888;font-size:13px;margin-top:4px">' + customer.lead_type + ' — ' + new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '</p>';
  body += '</td></tr>';
  body += '<tr><td style="background:#0a0a0a;padding:24px 32px">';
  body += '<div style="font-size:36px;font-weight:800;color:' + accent + ';font-family:Outfit,sans-serif">' + leads.length + '</div>';
  body += '<div style="font-size:13px;color:#888;margin-bottom:16px">new leads today for ' + customer.company + '</div>';
  body += '<p style="font-size:14px;color:#ccc;line-height:1.7">Good morning! Your daily lead sheet has arrived. Below are the new opportunities we\'ve found for you. Pick up the phone and start calling \u2014 you\'re the first to see these leads.</p>';
  body += '</td></tr>';
  body += '<tr><td style="background:#000;padding:0 32px"><table width="100%" cellpadding="0" cellspacing="0">';
  body += '<tr><th style="padding:10px 12px;border-bottom:1px solid #1a1a1a;color:#888;font-size:11px;text-transform:uppercase;text-align:left;letter-spacing:.5px">Details</th>';
  body += '<th style="padding:10px 12px;border-bottom:1px solid #1a1a1a;color:#888;font-size:11px;text-transform:uppercase;text-align:left;letter-spacing:.5px">Value</th></tr>';
  body += leadsHTML;
  body += '</table></td></tr>';
  body += '<tr><td style="background:#0a0a0a;padding:24px 32px;border-top:1px solid #1a1a1a;text-align:center">';
  body += '<p style="color:#888;font-size:12px;margin:0">Delivered at 9am by 9amLeads \u00b7 <a href="' + dashboardUrl + '" style="color:' + accent + '">View in Dashboard \u2192</a></p>';
  body += '</td></tr></table></td></tr></table></body></html>';
  return body;
}

// POST /api/test/delivery — manually trigger delivery for one customer
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

// POST /api/admin/impersonate — generate login token for any customer (admin access)
app.post('/api/admin/impersonate', async (req, res) => {
  try {
    const { customer_id } = req.body;
    if (!customer_id) return res.status(400).json({ error: 'customer_id required' });

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const token = generateToken(customer);
    res.json({ token, customer: { id: customer.id, name: customer.contact_name, email: customer.email, plan: customer.plan, product: customer.product } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/export — export customers for marketing
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
  console.log('  Stripe: ' + (STRIPE_SECRET_KEY ? 'CONFIGURED' : 'NOT SET'));
  console.log('  Scheduler: Active (9:00 AM daily, Mon-Sat)');
  console.log('========================================\n');
  console.log('Endpoints:');
  console.log('  POST /api/auth/signup   - Create account');
  console.log('  GET  /api/auth/verify-email - Verify email address');
  console.log('  POST /api/auth/login    - Sign in');
  console.log('  GET  /api/auth/me       - Get profile');
  console.log('  GET  /api/leads         - Get leads');
  console.log('  GET  /api/leads/today   - Today\'s leads');
  console.log('  PATCH /api/leads/:id/status - Update lead status');
  console.log('  GET  /api/stats         - Dashboard stats');
  console.log('  GET  /api/postcodes     - List UK postcode areas with availability');
  console.log('  GET  /api/postcodes/mine - Your assigned postcode territories');
  console.log('  PUT  /api/postcodes/update - Update your postcode selections');
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
  console.log('  Lead Distribution:');
  console.log('  POST /api/distribute   - Run lead distributor (match scraped leads to customers)');
  console.log('  GET  /api/distribute/status - Distribution status');
  console.log('========================================\n');
});
