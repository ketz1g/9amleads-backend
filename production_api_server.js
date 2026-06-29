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
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');

require('dotenv').config();

// ===== CONFIG =====
const PORT = process.env.PORT || process.env.API_PORT || 8012;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-' + Date.now();
if (!process.env.JWT_SECRET) console.warn('[WARN] JWT_SECRET not set. Using fallback. Set JWT_SECRET env var for production.');
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
      errors.push('"' + pc + '" is not a specific postcode district. Please pick individual districts like "' + (upper + '1') + '", not the whole area.');
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
  const whereClause = sql.substring(whereIdx + 5).replace(/\bORDER\s+BY\s+.+/i, '').replace(/\bLIMIT\s+(?:\d+|\?)/i, '').replace(/\bOFFSET\s+(?:\d+|\?)/i, '').trim();
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
    { expiresIn: '24h' }
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
app.use(cors({ origin: ['https://www.9amleads.com', 'https://9amleads.com', 'http://localhost:8012'], credentials: true }));
app.use(express.json());

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: { error: 'Too many requests. Please slow down.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many login attempts. Try again in 15 minutes.' } });
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

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
    const { company, name, email, phone, password, product, targetAreas, leadFilters, bizField2, bizField3, source, marketingConsent, crmWebhookUrl } = req.body;

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

    db.prepare(`INSERT INTO customers (id, email, company, contact_name, phone, password_hash, product, lead_type, business_type, target_areas, biz_field2, biz_field3, source, plan, trial_ends, marketing_consent, created_at, extra_postcodes, crm_webhook_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, email.toLowerCase(), company, name || '', phone || '', password_hash,
      product, productInfo.lead_type, productInfo.business_type,
      JSON.stringify(targetAreas || []), leadFilters || bizField2 || '', bizField3 || '',
      source || 'direct', 'free_trial', trial_ends, marketingConsent ? 1 : 0,
      new Date().toISOString(), '0', crmWebhookUrl || ''
    );

    // Claim postcodes
    if (areas.length > 0) {
      claimPostcodes(areas, id, product);
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    customer.verification_token = verification_token;
    customer.email_verified = 0;
    saveDb();

    // Verification email disabled — was causing spam during testing
    /*try {
      const verifyUrl = PUBLIC_URL.replace(/\/+$/, '') + '/api/auth/verify-email?token=' + verification_token;
      await sendBrevoEmail(
        { email: customer.email, name: customer.contact_name || customer.company },
        'Verify your 9amLeads account',
        '<h2>Welcome to 9amLeads!</h2><p>Please verify your email address by clicking the link below:</p><p><a href="' + verifyUrl + '">Verify Email</a></p><p>Your free 7-day trial has started. You\'ll receive your first leads at 9am tomorrow.</p>'
      );
    } catch (e) {
      console.log('Verification email skipped:', e.message);
    }*/

    // Save to Brevo contact list
    try {
      var addResult = await addBrevoContact(customer);
      if (addResult && addResult.error) console.log('[BREVO] Contact add error:', addResult.error);
      else if (addResult && addResult.id) console.log('[BREVO] Contact added to list, ID:', addResult.id);
    } catch (e) {
      console.log('[BREVO] Contact add failed:', e.message);
    }

    // Save to scraper customer file for lead generation
    try {
      var scraperProduct = product;
      var scraperDir = path.join(__dirname, 'data');
      var scraperFile = path.join(scraperDir, scraperProduct + '-leads-customers.json');
      var scraperCustomers = {};
      try { scraperCustomers = JSON.parse(fs.readFileSync(scraperFile, 'utf-8')); } catch(e) { scraperCustomers = {}; }
      var targetAreasParsed = targetAreas || [];
      var filters = {};
      try { filters = JSON.parse(leadFilters || '{}'); } catch(e) {}
      scraperCustomers[customer.id] = {
        company: company, email: email.toLowerCase(),
        postcodes: targetAreasParsed,
        minBedrooms: parseInt(filters.minBedrooms) || 0,
        maxBedrooms: parseInt(filters.maxBedrooms) || 99,
        maxPrice: parseInt(filters.maxPrice) || 0,
        propertyType: filters.propertyType || '',
        statusSSTC: filters.statusSSTC !== false,
        statusOffer: filters.statusOffer !== false,
        active: true, leadsPerDay: 5, created: new Date().toISOString(), plan: 'free_trial'
      };
      fs.writeFileSync(scraperFile, JSON.stringify(scraperCustomers, null, 2));
      console.log('[SCRAPER] Customer added to ' + scraperProduct + ' scraper file');
    } catch (e) {
      console.log('[SCRAPER] Failed to add customer:', e.message);
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
        crm_webhook_url: customer.crm_webhook_url || '',
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
    if (!token) return res.redirect(PUBLIC_URL + '/portal/?error=missing_token');

    const customer = db.prepare('SELECT * FROM customers WHERE verification_token = ?').get(token);
    if (!customer) return res.redirect(PUBLIC_URL + '/portal/?error=invalid_token');

    db.prepare('UPDATE customers SET email_verified = 1, verification_token = NULL WHERE id = ?').run(customer.id);
    saveDb();

    // Redirect to portal with success — user can now log in
    res.redirect(PUBLIC_URL + '/portal/?verified=true');
  } catch (e) {
    console.error('Verification error:', e);
    res.redirect(PUBLIC_URL + '/portal/?error=server_error');
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
    last_login: customer.last_login,
    crm_webhook_url: customer.crm_webhook_url || ''
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

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);

  res.json(leads.map(l => {
    const parsed = JSON.parse(l.data || '{}');
    const scored = attachOpportunityScore(parsed, customer?.product || l.product);
    return { ...l, data: parsed, opportunity_score: scored.score, opportunity_category: scored.category, opportunity_label: scored.label, opportunity_reasons: scored.reasons };
  }));
});

// GET /api/leads/today
app.get('/api/leads/today', authMiddleware, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const leads = db.prepare(
    'SELECT * FROM leads WHERE customer_id = ? AND date(created_at) = ? ORDER BY created_at DESC'
  ).all(req.user.id, today);

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);

  res.json(leads.map(l => {
    const parsed = JSON.parse(l.data || '{}');
    const scored = attachOpportunityScore(parsed, customer?.product || l.product);
    return { ...l, data: parsed, opportunity_score: scored.score, opportunity_category: scored.category, opportunity_label: scored.label, opportunity_reasons: scored.reasons };
  }));
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
    // Sync postcodes to scraper customer file
    try {
      var p2 = customer.product;
      var scraperFile2 = path.join(__dirname, 'data', p2 + '-leads-customers.json');
      var scrCusts2 = {};
      try { scrCusts2 = JSON.parse(fs.readFileSync(scraperFile2, 'utf-8')); } catch(e) {}
      if (scrCusts2[req.user.id]) {
        scrCusts2[req.user.id].postcodes = target_areas;
        fs.writeFileSync(scraperFile2, JSON.stringify(scrCusts2, null, 2));
        console.log('[SCRAPER] Postcodes synced for ' + req.user.id);
      }
    } catch(e) { console.log('[SCRAPER] Postcode sync error:', e.message); }
  }

  res.json({ success: true });
});

// PUT /api/settings/lead-filters — Update lead filters
app.put('/api/settings/lead-filters', authMiddleware, (req, res) => {
  const { leadFilters } = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE customers SET biz_field2 = ? WHERE id = ?').run(leadFilters || '', req.user.id);
  saveDb();

  // Sync updated filters to scraper customer file
  try {
    var p = customer.product;
    var scraperFile = path.join(__dirname, 'data', p + '-leads-customers.json');
    var scrCusts = {};
    try { scrCusts = JSON.parse(fs.readFileSync(scraperFile, 'utf-8')); } catch(e) {}
    if (scrCusts[req.user.id]) {
      var f = {};
      try { f = JSON.parse(leadFilters || '{}'); } catch(e) {}
      scrCusts[req.user.id].minBedrooms = parseInt(f.minBedrooms) || 0;
      scrCusts[req.user.id].maxBedrooms = parseInt(f.maxBedrooms) || 99;
      scrCusts[req.user.id].maxPrice = parseInt(f.maxPrice) || 0;
      scrCusts[req.user.id].propertyType = f.propertyType || '';
      scrCusts[req.user.id].statusSSTC = f.statusSSTC !== false;
      scrCusts[req.user.id].statusOffer = f.statusOffer !== false;
      fs.writeFileSync(scraperFile, JSON.stringify(scrCusts, null, 2));
      console.log('[SCRAPER] Filters synced for ' + req.user.id);
    }
  } catch(e) { console.log('[SCRAPER] Filter sync error:', e.message); }

  res.json({ success: true, biz_field2: leadFilters || '' });
});

// ===== CRM WEBHOOK ENDPOINTS =====

// GET /api/settings/crm - Get CRM webhook URL
app.get('/api/settings/crm', authMiddleware, (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'User not found' });
  res.json({ crm_webhook_url: customer.crm_webhook_url || '' });
});

// PUT /api/settings/crm - Update CRM webhook URL
app.put('/api/settings/crm', authMiddleware, (req, res) => {
  const { crm_webhook_url } = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE customers SET crm_webhook_url = ? WHERE id = ?').run(crm_webhook_url || '', req.user.id);
  saveDb();
  res.json({ success: true, crm_webhook_url: crm_webhook_url || '' });
});

// DELETE /api/settings/crm - Remove CRM webhook
app.delete('/api/settings/crm', authMiddleware, (req, res) => {
  db.prepare('UPDATE customers SET crm_webhook_url = ? WHERE id = ?').run('', req.user.id);
  saveDb();
  res.json({ success: true });
});

// POST /api/crm/test - Test CRM webhook connection
app.post('/api/crm/test', authMiddleware, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Webhook URL is required' });
    const testPayload = { test: true, message: '9amLeads CRM webhook test', timestamp: new Date().toISOString() };
    const response = await httpsPost(url, testPayload);
    res.json({ success: response.status >= 200 && response.status < 300, status: response.status, body: (response.body || '').substring(0, 200) });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// POST /api/crm/push - Manually push leads to CRM (for testing)
app.post('/api/crm/push', authMiddleware, async (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    const webhookUrl = customer.crm_webhook_url || req.body.url || '';
    if (!webhookUrl) return res.status(400).json({ error: 'No CRM webhook URL configured. Go to Settings to add one.' });
    const leads = db.prepare('SELECT * FROM leads WHERE customer_id = ? AND delivered = 1 ORDER BY created_at DESC LIMIT 10').all(customer.id);
    if (leads.length === 0) return res.json({ success: false, message: 'No delivered leads to push. Leads will be pushed automatically at 9am daily.' });
    const payload = { customer: { name: customer.company, email: customer.email, product: customer.lead_type }, leads: leads.map(formatLeadForCRM), source: '9amLeads', timestamp: new Date().toISOString() };
    const response = await httpsPost(webhookUrl, payload);
    res.json({ success: response.status >= 200 && response.status < 300, status: response.status, leads_pushed: leads.length, response: (response.body || '').substring(0, 500) });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ===== AI IMAGE GENERATION =====

// POST /api/ai/generate-image — Generate image via DALL-E 3
app.post('/api/ai/generate-image', async (req, res) => {
  try {
    const { prompt, size, quality } = req.body;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) return res.status(400).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY environment variable.' });
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const imageSize = size || '1024x1024';
    const imageQuality = quality || 'standard';
    const https = require('https');
    
    var requestBody = JSON.stringify({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: imageSize,
      quality: imageQuality
    });

    // Try available image models (GPT-Image series, falling back to DALL-E)
    const models = ['gpt-image-1', 'gpt-image-2', 'dall-e-3', 'dall-e-2'];
    let result = null;
    let lastError = null;
    for (const model of models) {
      const attemptData = JSON.stringify({
        model, prompt, n: 1,
        size: model.startsWith('gpt-image') ? '1024x1024' : (size || '1024x1024'),
        ...(model === 'dall-e-3' ? { quality: quality || 'standard' } : {})
      });
      result = await new Promise(function(resolve) {
        var req = https.request({
          hostname: 'api.openai.com', path: '/v1/images/generations', method: 'POST',
          headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(attemptData) }
        }, function(r) { var b = ''; r.on('data', function(c) { b += c; }); r.on('end', function() { try { var parsed = JSON.parse(b); resolve({ status: r.statusCode, body: parsed }); } catch(e) { resolve({ status: r.statusCode, body: b }); } }); });
        req.on('error', (e) => { lastError = e.message; resolve(null); });
        req.write(attemptData); req.end();
      });
      if (result && result.status === 200 && result.body && result.body.data && result.body.data.length > 0) break;
      if (result && result.body && result.body.error) lastError = result.body.error.message;
      result = null;
    }

    if (!result || !result.body) return res.status(500).json({ error: lastError || 'No response from OpenAI API' });
    if (result.body.error) return res.status(400).json({ error: result.body.error.message || 'OpenAI API error' });

    var imageData = result.body.data[0];
    // GPT-Image returns b64_json, DALL-E returns url
    if (imageData.url) return res.json({ url: imageData.url, revised_prompt: imageData.revised_prompt || null });
    if (imageData.b64_json) return res.json({ url: 'data:image/png;base64,' + imageData.b64_json, revised_prompt: imageData.revised_prompt || null });
    res.json({ url: null, error: 'Unexpected response format' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== ADMIN ENDPOINTS =====

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '9amAdmin2024!';
if (!process.env.ADMIN_PASSWORD) console.warn('[WARN] ADMIN_PASSWORD not set. Using default. Set ADMIN_PASSWORD env var for security.');

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || auth !== 'Bearer ' + ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/admin/stats — overall system stats
app.get('/api/admin/stats', adminAuth, (req, res) => {
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
app.get('/api/admin/customers', adminAuth, (req, res) => {
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
  
  // Map product to the correct Brevo list
  const LIST_IDS = {
    'moving': 44,
    'probate': 45,
    'newbusiness': 46,
    'planning': 47,
    'tenders': 48
  };
  const product = customer.product || customer.lead_type || 'moving';
  const listId = LIST_IDS[product] || 44;
  
  const data = JSON.stringify({
    email: customer.email,
    attributes: {
      COMPANY: customer.company || customer.business_name || '',
      FIRSTNAME: customer.contact_name || customer.name || '',
      PHONE: customer.phone || '',
      PRODUCT: product,
      LEAD_TYPE: customer.lead_type || product,
      PLAN: customer.plan || 'free_trial',
      SOURCE: customer.source || 'direct',
      SIGNUP_DATE: customer.created_at || new Date().toISOString()
    },
    listIds: [listId],
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
        if (res.statusCode < 300) try { resolve(JSON.parse(body)); } catch(e) { resolve({ id: 'ok' }); }
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
  { day: 21, subject: 'Come back \u2014 30% off your first month\u2019s subscription', template: 'trial_day21' },
  { day: 30, subject: 'Your account is still waiting', template: 'trial_day30' },
  { day: 60, subject: 'Last chance to reactivate your account', template: 'trial_day60' }
];

// Paid customer email series (sent weekly after subscription starts)
const PAID_EMAIL_SERIES = [
  { week: 0, subject: 'Welcome to 9amLeads Premium \u2014 Your Leads Keep Flowing', template: 'paid_welcome' },
  { week: 1, subject: 'Tip #1: The 30-Minute Rule \u2014 Why Speed Wins', template: 'paid_tip1' },
  { week: 2, subject: 'Tip #2: Script That Converts \u2014 What To Say', template: 'paid_tip2' },
  { week: 3, subject: 'Tip #3: Track Everything \u2014 Know What Works', template: 'paid_tip3' },
  { week: 4, subject: 'Tip #4: Follow Up \u2014 The Money Is In The Second Call', template: 'paid_tip4' },
  { week: 8, subject: 'Check-in: How many leads have you converted?', template: 'paid_checkin1' },
  { week: 12, subject: 'You\u2019ve been with us 3 months \u2014 here\u2019s your impact', template: 'paid_checkin2' }
];

function getCampaignEmailHTML(customer, template) {
  const accent = { moving: '#ff6b35', probate: '#a855f7', newbusiness: '#06b6d4', planning: '#10b981', tenders: '#6366f1' }[customer.product] || '#0ea5e9';
  const bizType = customer.business_type || 'business';
  const productName = customer.lead_type || 'leads';
  
  const templates = {
    trial_day1: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Your Free Trial Is Active</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">Your daily <strong style="color:#fff">' + productName + '</strong> land at <strong style="color:' + accent + '">9am tomorrow</strong>.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">Welcome to 9amLeads. Over the next 7 days you\'ll receive exclusive <strong>' + productName + '</strong> delivered to your inbox every morning at 9am. Here\'s how to get the most out of your trial:</p><div style="background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.15);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#555;font-size:13px;line-height:2;margin:0">📥 <strong style="color:#fff">9:00am</strong> : Lead sheet arrives in your inbox<br>📞 <strong style="color:#fff">9:01am</strong> : Start calling your hot leads<br>💰 <strong style="color:#fff">9:30am</strong> : First quotes going out<br>✅ <strong style="color:#fff">By noon</strong> : Bookings coming in</p></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">What makes these leads exclusive?</strong> Unlike lead generation sites where your quote is one of dozens, every lead we send is sent to <strong>you alone</strong>. No competitors. No bidding wars. You are the first and only person to call them.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">💡 Pro tip:</strong> Speed wins in this business. Call every lead within 30 minutes of receiving them and you\'ll convert at 3x the average rate. Use the AI-drafted email, WhatsApp, and phone scripts in your dashboard for every lead. Set your alarm for 9am and make it your lead hour.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px">To get the most from your trial, <a href="' + PUBLIC_URL + '/portal/dashboard.html" style="color:' + accent + '">log into your dashboard</a> and set up your CRM webhook so leads flow straight into your system. If you don\'t use a CRM, no problem : leads arrive by email too.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">See Pricing & Plans</a></td></tr></table>',
    trial_day3: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">How Are Your First Leads Looking?</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">3 days in : time for a quick check-in.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">You\'re three days into your 9amLeads trial. By now you should have received a few days\' worth of <strong>' + productName + '</strong>. We wanted to check in and see how things are going.</p><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#555;font-size:13px;line-height:1.8;margin:0">✅ Are the leads relevant to your <strong>specific business</strong>?<br>✅ Is the volume what you <strong>expected</strong>?<br>✅ Have you managed to <strong>call any yet</strong>?<br>✅ Are the postcode areas <strong>working for you</strong>?</p></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">If the answer to any of these is &ldquo;no&rdquo; : don\'t worry. You can <a href="' + PUBLIC_URL + '/portal/dashboard.html" style="color:' + accent + '">adjust your territory settings in the dashboard</a> to refine which opportunities you receive. Every lead includes AI-drafted email, WhatsApp, and phone scripts ready to use. Narrow it down, expand it out, or target specific cities.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:' + accent + '">💡 Tip of the day:</strong> Call within 30 minutes. We know we keep saying it, but it\'s because it works. Your lead is a real person who needs help <em>right now</em>. Every minute you wait, they\'re calling someone else. Be first.</p><p style="color:#666;font-size:13px;margin:0 0 16px">Not loving it? Reply to this email and tell us what\'s off. We can tweak your settings or switch you to a different lead type.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">See Pricing & Plans</a></td></tr></table>',
    trial_day5: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">3 Tips to Convert More Leads</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">You\'ve got 2 days left in your trial. Let\'s make them count.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">By now you\'ve had a few days of <strong>' + productName + '</strong> landing in your inbox. Whether you\'ve closed deals yet or not, here are three tips that will dramatically improve your conversion rate:</p><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:20px;margin:0 0 16px"><div style="margin-bottom:16px"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;margin-right:10px;float:left">1</div><div style="margin-left:38px"><strong style="color:#fff;font-size:14px">Call within 30 minutes</strong><br><span style="color:#666;font-size:13px">Speed is your superpower. When a lead goes SSTC, registers a company, or a probate grant is issued : they are actively looking for help. Our data shows that calling within 30 minutes triples your conversion rate compared to calling after 2 hours. Set your alarm, drop everything, and dial.</span></div></div><div style="margin-bottom:16px;clear:both"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;margin-right:10px;float:left">2</div><div style="margin-left:38px"><strong style="color:#fff;font-size:14px">Personalise your pitch</strong><br><span style="color:#666;font-size:13px">Don\'t read from a script. Reference their specific situation : the property address, the company they just registered, the probate value. &ldquo;I see you\'ve just listed [property] on Rightmove : congratulations. I specialise in helping sellers in [area] get a fast, fair price.&rdquo; Personalised pitches close at 2x the rate of generic ones.</span></div></div><div style="clear:both"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;margin-right:10px;float:left">3</div><div style="margin-left:38px"><strong style="color:#fff;font-size:14px">Follow up : the money is in the 2nd call</strong><br><span style="color:#666;font-size:13px">Most sales don\'t happen on the first call. People are busy, they need to check with a partner, or they\'re comparing options. Follow up on day 2 with an email, call again on day 4. Exclusive leads mean no one else is calling them : take your time and build the relationship.</span></div></div></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">Your free trial ends in <strong style="color:' + accent + '">2 days</strong>. After that, your leads will pause. Upgrade now to keep them flowing without interruption.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Upgrade & Keep Your Leads →</a></td></tr></table>',
    trial_day7: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Your Free Trial Ends Tomorrow</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">Action needed : your daily leads will pause after today.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">This is your 7-day reminder. Tomorrow your free trial ends, and your daily <strong>' + productName + '</strong> delivery will pause. Here\'s what you\'ll lose:</p><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#555;font-size:13px;line-height:1.8;margin:0">📥 <strong style="color:#fff">Daily exclusive leads</strong> at 9am every morning<br>🔒 <strong style="color:#fff">No competition</strong> : you\'re the only person who gets them<br>📊 <strong style="color:#fff">Full dashboard access</strong> with lead history & analytics<br>🔌 <strong style="color:#fff">CRM integration</strong> : push leads to your system<br>📞 <strong style="color:#fff">Priority support</strong> when you need it</p></div><div style="background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.15);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#555;font-size:13px;line-height:1.6;margin:0"><em>&ldquo;I got 12 leads in my first week using 9amLeads. Converted 3. Made <strong style="color:' + accent + '">£3,600</strong> in additional revenue. Best £49 I\'ve ever spent.&rdquo;</em><br><span style="color:#666;font-size:11px">: Mark S., Southampton</span></p></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px">Plans start from just <strong style="color:#fff">£49/month</strong>. No long-term contract. Cancel anytime. Upgrade now and your leads keep flowing tomorrow at 9am as if nothing happened.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px;box-shadow:0 4px 20px ' + accent + '40">Upgrade Now : Keep Your Leads</a></td></tr></table>',
    trial_day9: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Your Daily Leads Have Paused</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">Your 7-day trial has ended. Here\'s how to restart.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">As expected, your free trial has ended and your daily <strong>' + productName + '</strong> delivery has been paused. Don\'t worry : your lead history is still intact, and you can restart in 3 simple steps:</p><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#555;font-size:13px;line-height:1.8;margin:0"><strong style="color:#fff">To restart your leads:</strong><br>1. <a href="' + PUBLIC_URL + '/portal/dashboard.html" style="color:' + accent + '">Log into your dashboard</a><br>2. Choose your plan<br>3. Leads restart at <strong style="color:' + accent + '">9am tomorrow</strong></p></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">If you\'re not sure whether 9amLeads is right for you, reply to this email and tell us what\'s holding you back. We\'re a small UK team and we personally read every reply. We\'ll help you decide : no pushy sales pitch, just honest advice.</p><div style="background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.15);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#555;font-size:13px;line-height:1.6;margin:0"><em>&ldquo;I was sceptical at first but decided to give it a month. We picked up <strong style="color:' + accent + '">4 new clients</strong> in our first month : already covered our annual subscription 10x over.&rdquo;</em><br><span style="color:#666;font-size:11px">: Sarah L., Manchester</span></p></div><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px">Restart My Leads →</a></td></tr></table>',
    trial_day12: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Still Not Sure? Let\'s Talk</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">We understand. Let\'s figure this out together.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">We know that choosing a lead generation service is a big decision. Maybe the leads weren\'t quite right for your ' + bizType + '. Maybe the timing wasn\'t perfect. Maybe you just need more information before committing.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">Whatever it is : <strong style="color:#fff">we want to help</strong>. Reply to this email and tell us what\'s holding you back. Are the postcodes not quite right? Wrong lead type? Budget concerns? Not enough time to call? We\'ll help you find a solution.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">To sweeten the deal, here\'s a <strong style="color:#fff">30% discount</strong> on your first month when you\'re ready to give it another go:</p><div style="background:rgba(14,165,233,0.06);border:2px dashed ' + accent + ';border-radius:12px;padding:16px;text-align:center;margin:0 0 16px"><p style="color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:2px;margin:0 0 4px;color:#666">Discount Code</p><p style="font-family:Outfit,sans-serif;font-size:28px;font-weight:800;color:' + accent + ';margin:0;letter-spacing:3px">WELCOME30</p><p style="color:#666;font-size:11px;margin:4px 0 0">30% off your first month</p></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px">See if 9amLeads is right for your business by visiting our <a href="' + PUBLIC_URL + '/who-we-serve" style="color:' + accent + '">who we serve page</a> : we work with estate agents, probate practitioners, accountants, solicitors, and more.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/who-we-serve" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">See Who We Serve</a></td></tr></table>',
    trial_day16: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">3 Businesses That Transformed Their Pipeline</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">Real results from real 9amLeads customers.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">Still on the fence? Here are three stories from businesses just like yours who use 9amLeads to fill their pipeline every single day:</p><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 10px"><p style="color:#555;font-size:13px;line-height:1.6;margin:0"><strong style="color:#fff">Estate Agent : Southampton</strong><br>&ldquo;Got 12 moving leads in my first week using 9amLeads. Called every one within 30 minutes. Converted 3 instructions and made <strong style="color:' + accent + '">£3,600</strong> in additional revenue. My monthly subscription paid for itself on the first call.&rdquo;<br><span style="color:#666;font-size:11px">: Mark S., Independent Estate Agent</span></p></div><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 10px"><p style="color:#555;font-size:13px;line-height:1.6;margin:0"><strong style="color:#fff">Probate Practitioner : Manchester</strong><br>&ldquo;We\'ve picked up <strong style="color:' + accent + '">4 new clients</strong> in our first month using 9amLeads probate leads. Already covered our annual subscription 10x over. The exclusivity is the game-changer : no one else is calling these families.&rdquo;<br><span style="color:#666;font-size:11px">: Sarah L., Probate Services Ltd</span></p></div><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#555;font-size:13px;line-height:1.6;margin:0"><strong style="color:#fff">Construction Company : Bristol</strong><br>&ldquo;Won 2 contracts worth <strong style="color:' + accent + '">£1.4M</strong> in our first quarter using 9amLeads tenders. We went from scrambling for work to having a consistent pipeline. Best business decision we\'ve made in 10 years.&rdquo;<br><span style="color:#666;font-size:11px">: James R., Bristol Construction Co</span></p></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px">Your success story could be next. Your account is still waiting, and your <strong style="color:' + accent + '">WELCOME30</strong> discount code is ready for you. Upgrade now and your leads restart at 9am tomorrow.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Restart With 30% Off →</a></td></tr></table>',
    trial_day21: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Come Back : 30% Off Your First Month</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">We\'d love to have you back. Here\'s a little incentive.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">It\'s been a few weeks since your trial ended. Since then, hundreds of new exclusive <strong>' + productName + '</strong> have been delivered to our customers every single morning. Here\'s what you\'ve been missing:</p><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#555;font-size:13px;line-height:1.8;margin:0">📥 <strong style="color:#fff">Daily leads</strong> arriving at 9am every morning<br>🔒 <strong style="color:#fff">Zero competition</strong> : exclusive to you<br>⚡ <strong style="color:#fff">First to call</strong> : every single time<br>📊 <strong style="color:#fff">Dashboard & CRM</strong> : manage everything in one place</p></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">Come back and try again with <strong style="color:#fff">30% off your first month</strong>. Use the code below at checkout:</p><div style="background:rgba(14,165,233,0.06);border:2px dashed ' + accent + ';border-radius:12px;padding:16px;text-align:center;margin:0 0 16px"><p style="color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:2px;margin:0 0 4px;color:#666">Discount Code</p><p style="font-family:Outfit,sans-serif;font-size:28px;font-weight:800;color:' + accent + ';margin:0;letter-spacing:3px">WELCOME30</p><p style="color:#666;font-size:11px;margin:4px 0 0">Expires soon : use it before it\'s gone</p></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px">No commitment. No long-term contract. Cancel anytime. Your leads restart at 9am tomorrow.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Claim 30% Off Now</a></td></tr></table>',
    trial_day30: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Your Account Is Still Waiting</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">No pressure. Your account is safe and ready when you are.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">It\'s been 30 days since your trial ended, and we wanted to let you know that your 9amLeads account is <strong style="color:#fff">still here</strong>. Nothing has been deleted. All your lead history, settings, postcode preferences, and dashboard access are preserved exactly as you left them.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">Whenever you\'re ready, upgrading takes 30 seconds. Your leads will restart at <strong style="color:' + accent + '">9am the next morning</strong> as if you never paused. No setup required. No waiting period.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">If you\'d like to have a chat with our team about whether 9amLeads is right for your ' + bizType + ', just reply to this email. We\'re here to help.</p><p style="color:#666;font-size:13px;margin:0 0 20px">No pressure. Just wanted to remind you that your account is waiting.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Visit Dashboard</a></td></tr></table>',
    trial_day60: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Last Chance : Account Will Be Archived</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">Final notice : your account will be archived in 30 days.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">This is your final notice. Your 9amLeads account has been inactive for 60 days. In <strong style="color:' + accent + '">30 days</strong>, your account will be archived to free up resources.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">What does archiving mean?</strong> Your lead history and account data will be preserved and stored securely. You won\'t lose anything. However, you\'ll need to <a href="mailto:hello@9amleads.com" style="color:' + accent + '">contact our support team</a> to reactivate your account : it won\'t be available for instant self-service upgrade.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">If you upgrade in the next 30 days, everything stays active. Your postcode areas, your settings, your lead history : all of it. Leads restart at 9am tomorrow morning.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px"><strong style="color:#fff">This is your last chance</strong> to keep your account active without needing to contact us. Don\'t let your leads slip away.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px;box-shadow:0 4px 20px ' + accent + '40">Upgrade Before Archive →</a></td></tr></table>',
    paid_welcome: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Welcome to 9amLeads Premium</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">You\'re now a paid subscriber. Let\'s make this work for you.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">Thank you for upgrading to 9amLeads Premium. Your daily <strong>' + productName + '</strong> will keep arriving at your inbox every morning at 9am <strong style="color:#fff">without interruption</strong>. Here\'s everything you now have access to:</p><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#555;font-size:13px;line-height:1.8;margin:0"><strong style="color:#fff">Your Premium Benefits:</strong><br>📥 <strong style="color:#fff">Daily leads</strong> at 9am every morning : consistently<br>🔒 <strong style="color:#fff">Exclusive access</strong> : no one else receives these leads<br>📊 <strong style="color:#fff">Dashboard</strong> : full lead history, analytics, and management<br>🔌 <strong style="color:#fff">CRM integration</strong> : leads pushed straight to your CRM<br>📞 <strong style="color:#fff">Priority support</strong> : reply anytime and we\'ll help</p></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">Over the coming weeks we\'ll send you weekly tips and strategies : everything from calling scripts to follow-up sequences : to help you convert as many leads as possible.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px">First step: <a href="' + PUBLIC_URL + '/portal/dashboard.html" style="color:' + accent + '">log into your dashboard</a> and make sure your CRM webhook is configured (or just check your leads are landing in your inbox). If you need help setting anything up, reply to this email and we\'ll walk you through it.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Go to Dashboard</a></td></tr></table>',
    paid_tip1: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">The 30-Minute Rule</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">Why speed wins : and how to make it your habit.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">Welcome to your first weekly tip. This one is the most important, so we\'re leading with it: <strong style="color:' + accent + '">call every lead within 30 minutes of receiving them</strong>.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">Why does speed matter so much? Because your lead is a real person who has just taken a specific action : their house went SSTC on Rightmove, they registered a new company at Companies House, or a probate grant was issued. They are <strong style="color:#fff">actively looking for help right now</strong>. Every minute you wait, they\'re calling a competitor, booking with someone else, or losing interest.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">Here\'s your 3-part system:</strong></p><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 8px"><div style="display:flex;align-items:flex-start;gap:12px"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;margin-top:1px">1</div><div><strong style="color:#fff;font-size:14px">Set your alarm for 9:00am</strong><br><span style="color:#666;font-size:13px">When the lead email arrives, drop everything and make the call. Block 9-10am as your dedicated lead hour every morning.</span></div></div></div><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 8px"><div style="display:flex;align-items:flex-start;gap:12px"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;margin-top:1px">2</div><div><strong style="color:#fff;font-size:14px">Keep your script ready</strong><br><span style="color:#666;font-size:13px">You only need 3-5 talking points. Have them printed or pinned to your monitor so you\'re ready before the lead arrives.</span></div></div></div><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><div style="display:flex;align-items:flex-start;gap:12px"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;margin-top:1px">3</div><div><strong style="color:#fff;font-size:14px">Track your response time</strong><br><span style="color:#666;font-size:13px">Note what time you called each lead. If you\'re calling outside 30 minutes, set an earlier alarm or use push notifications.</span></div></div></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px">Our data shows that callers who reach leads within 30 minutes convert at <strong style="color:' + accent + '">3x the rate</strong> of those who wait 2+ hours. Speed isn\'t just a nice-to-have : it\'s your biggest competitive advantage. Learn more about <a href="' + PUBLIC_URL + '/how-it-works" style="color:' + accent + '">how it works</a>.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/how-it-works" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Learn More →</a></td></tr></table>',
    paid_tip2: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">A Script That Converts</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">What to say when your lead picks up the phone.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">Calling within 30 minutes is step one. But knowing <strong style="color:#fff">what to say</strong> when they answer is what separates the pros from the amateurs. Here\'s a full script template that works across every lead type : moving, probate, new business, planning, and tenders.</p><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 10px"><p style="color:#555;font-size:13px;line-height:1.7;margin:0"><strong style="color:' + accent + '">The Opening (15 seconds)</strong><br>&ldquo;Hi [name], this is [your name] from [company]. I see you\'ve [had your property go SSTC / registered a new company / applied for planning permission] : congratulations. The reason I\'m calling is we help [business type] with [specific service]. I\'m actually the first person to reach out to you : would it help if I sent over some info?&rdquo;</p></div><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 10px"><p style="color:#555;font-size:13px;line-height:1.7;margin:0"><strong style="color:' + accent + '">The Hook (30 seconds)</strong><br>&ldquo;I\'ve helped [X] other [business type] in your area this month alone. Most of them book within a week because we\'re fast and straightforward. I can have a quote ready in 10 minutes : shall we quickly run through what you need?&rdquo;</p></div><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#555;font-size:13px;line-height:1.7;margin:0"><strong style="color:' + accent + '">The Close (15 seconds)</strong><br>&ldquo;I\'ve got a slot at [time] today or [time] tomorrow. Which works better for you? Let me confirm that and I\'ll send everything over straight away.&rdquo;</p></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">Why this works:</strong> The opening establishes relevance and speed (&ldquo;first to reach out&rdquo;), the hook builds credibility with social proof, and the close assumes the sale : you\'re not asking &ldquo;if&rdquo;, you\'re asking &ldquo;when&rdquo;.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px">Adapt this for your industry. If you\'re in probate, reference the estate value and location. If you\'re in new business, mention their SIC code or recent incorporation date. The more specific, the better.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Go to Dashboard</a></td></tr></table>',
    paid_tip3: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Track Everything to Improve</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">Three metrics that will transform your conversion rate.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">The most successful 9amLeads customers do one thing differently: they <strong style="color:#fff">track their numbers</strong>. Not because they love spreadsheets : because what gets measured gets improved. Here are the three metrics you should be tracking:</p><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#555;font-size:13px;line-height:1.8;margin:0"><strong style="color:' + accent + '">📞 Calls Made</strong><br>Of the leads you receive, how many do you actually call? Aim for <strong style="color:#fff">100%</strong>. Every lead you don\'t call is money left on the table.<br><br><strong style="color:' + accent + '">✅ Conversations Had</strong><br>How many people actually answer the phone? Aim for <strong style="color:#fff">60%+</strong>. If you\'re below this, try calling at different times of day.<br><br><strong style="color:' + accent + '">💰 Conversions Closed</strong><br>How many conversations turn into paying customers? Industry average with exclusive leads is <strong style="color:#fff">20-30%</strong>. If you\'re below this, work on your script and follow-up process.</p></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">If you\'re calling 100% of leads, having conversations with 60%+, and closing 25%+ : you\'re performing at an elite level. If not, focus on the weakest link and improve it.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px">Your dashboard shows your full lead history. Use it to identify which postcode areas and lead types perform best, then <a href="' + PUBLIC_URL + '/portal/dashboard.html" style="color:' + accent + '">double down on what works</a>.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">View Lead History</a></td></tr></table>',
    paid_tip4: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Follow Up : The Money Is In The Second Call</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">Why most sales happen after the first conversation.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">Here\'s a truth that most lead buyers ignore: <strong style="color:#fff">most people don\'t buy on the first call</strong>. They\'re busy. They need to check with a partner. They want to compare options. They\'re overwhelmed by the process.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">The money is made on the second, third, and fourth touchpoints. Here\'s a proven follow-up sequence:</p><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#555;font-size:13px;line-height:1.8;margin:0"><strong style="color:' + accent + '">Day 1 : First call</strong><br>Introduction, quick pitch, offer to send information or a quote. Establish trust and relevance.<br><br><strong style="color:' + accent + '">Day 2 : Email or text follow-up</strong><br>&ldquo;Hi [name], just sending over that info I mentioned. No rush at all : happy to talk through it if that\'s helpful. Cheers, [your name]&rdquo;<br><br><strong style="color:' + accent + '">Day 4 : Second call</strong><br>&ldquo;Hey [name], following up on my email. Did you get a chance to look? I\'ve got a window at [time] if you want to run through it quickly.&rdquo;<br><br><strong style="color:' + accent + '">Day 7 : Final touch</strong><br>&ldquo;Just checking in one last time. If the timing\'s not right, no problem at all. My number is [number] : call me whenever you\'re ready.&rdquo;</p></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">Why this works with exclusive leads:</strong> Because you\'re the only person calling them, there\'s no urgency to rush. You can follow up professionally over a week without worrying that a competitor will swoop in. Take your time, build the relationship, and close on your terms.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px">Most of our top-performing customers close deals 4-10 days after the lead first arrives. Patience + persistence = profit.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Go to Dashboard</a></td></tr></table>',
    paid_checkin1: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Check-in: How Many Leads Have You Converted?</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">8 weeks in : let\'s take stock of your results.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">You\'ve been receiving <strong>' + productName + '</strong> for 8 weeks now. That\'s roughly 40 days of exclusive leads delivered straight to your inbox. Let\'s do a quick audit:</p><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#555;font-size:13px;line-height:1.8;margin:0">✅ Are you calling within <strong style="color:#fff">30 minutes</strong> of receiving leads?<br>✅ Are you <strong style="color:#fff">following up</strong> with everyone who doesn\'t answer?<br>✅ Are your <strong style="color:#fff">postcode areas</strong> performing well?<br>✅ Could you <strong style="color:#fff">add more areas</strong> for more volume?<br>✅ Are you tracking your <strong style="color:#fff">conversion rate</strong>?</p></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">If you\'re happy with your results : fantastic. If not, let\'s fix it. Reply to this email and tell us what\'s not working. We can help you optimise your postcode areas, upgrade your plan for more leads, or switch to a different lead type that might perform better for your ' + bizType + '.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="color:' + accent + '">Check your dashboard</a> for lead history and conversion analytics.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">View Dashboard</a></td></tr></table>',
    paid_checkin2: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">3 Months Strong : Here\'s Your Impact</h2><p style="color:#666;font-size:13px;text-align:center;margin:0 0 20px">Three months of daily leads. Let\'s look at what you\'ve achieved.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">Congratulations : you\'ve been with 9amLeads for <strong style="color:' + accent + '">3 months</strong>. That\'s roughly 90 days of exclusive <strong>' + productName + '</strong> delivered straight to your inbox every morning at 9am. By now you should have a clear picture of what works and what doesn\'t.</p><div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#555;font-size:13px;line-height:1.8;margin:0"><strong style="color:#fff">Ready to scale up?</strong><br>📈 <strong style="color:#fff">Add a second lead type</strong> : diversify your pipeline with probate, new business, or planning leads<br>🌍 <strong style="color:#fff">Expand your postcodes</strong> : cover more areas for more volume<br>⬆️ <strong style="color:#fff">Upgrade your plan</strong> : get more leads per day at a better per-lead price<br>📊 <strong style="color:#fff">Check your dashboard</strong> : see which territories convert best</p></div><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">We\'d love to hear your story. How many leads have you converted? What\'s the biggest deal you\'ve closed? Reply to this email and let us know : your feedback helps us improve, and we might feature your success story.</p><p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px">Thank you for being a valued 9amLeads customer. We\'re here whenever you need us : just hit reply.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Scale Up Now</a></td></tr></table>',
  };
  
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#000;font-family:Inter,Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%"><tr><td style="background:#0a0a0a;padding:28px;border-bottom:3px solid ' + accent + ';text-align:center"><div style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff"><span style="color:' + accent + '">9am</span>Leads</div><p style="color:#666;font-size:12px;margin-top:4px">' + customer.company + '</p></td></tr><tr><td style="background:#0a0a0a;padding:24px 28px">' + (templates[template] || templates.trial_day1) + '</td></tr><tr><td style="background:#0a0a0a;padding:20px 28px;border-top:1px solid #1a1a1a;text-align:center"><p style="color:#666;font-size:11px;margin:0">9am Leads Ltd \u00b7 Company No. 17168176 \u00b7 <a href="https://www.9amleads.com/privacy.html" style="color:#666">Unsubscribe</a></p></td></tr></table></td></tr></table></body></html>';
}

// ===== SCRAPER SCHEDULER: Daily at 5:30 AM =====
// Generates fresh leads from real APIs (Apify, Gov.uk, etc.) or demo data.
// Leads are saved to data/{product}-leads.json for the distributor at 9am.
// ===== SCRAPER SCHEDULER: DISABLED =====
// Cron was disabled to prevent automated runs until scraping is fixed.
// Scrapers can still be triggered manually via /api/admin/run-scrapers

// Generate realistic-looking demo leads for any product
function generateDemoLeads(product, count) {
  const now = new Date().toISOString();
  const leads = [];
  const fullPC = (area) => area.pc + ' ' + (Math.floor(Math.random() * 9) + 1) + String.fromCharCode(65 + Math.floor(Math.random() * 24)) + String.fromCharCode(65 + Math.floor(Math.random() * 24));
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
      const leadPC = fullPC(area);
      leads.push({
        id: 'ML_' + Date.now() + '_' + i, address: Math.floor(Math.random() * 200) + 1 + ' ' + streets[i % streets.length] + ', ' + area.city + ' ' + leadPC,
        postcode: leadPC, city: area.city, bedrooms: beds, propertyType: types[i % types.length],
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
      const leadPC = fullPC(area);
      leads.push({
        id: 'PR_' + Date.now() + '_' + i, name: 'Estate of ' + surname,
        deceasedName: surname, estateValue: value, estateValueLabel: '\u00a3' + value.toLocaleString(),
        registry: registries[i % registries.length],
        address: Math.floor(Math.random() * 100) + 1 + ' ' + streets[i % streets.length] + ', ' + area.city + ' ' + leadPC,
        postcode: leadPC, city: area.city,
        legalAdvisor: surname + ' & Co Solicitors', source: 'Gov.uk Probate Register', scrapedAt: now
      });
    }
  } else if (product === 'newbusiness') {
    const bizTypes = ['Retail', 'Consulting', 'Tech', 'Hospitality', 'Construction', 'Healthcare', 'Marketing', 'Property'];
    for (let i = 0; i < count; i++) {
      const bizType = bizTypes[i % bizTypes.length];
      const area = areas[i % areas.length];
      const leadPC = fullPC(area);
      leads.push({
        id: 'NB_' + Date.now() + '_' + i, name: streets[i % streets.length] + ' ' + bizType + ' Ltd',
        companyNumber: 'NI' + (Math.floor(Math.random() * 900000) + 100000),
        address: Math.floor(Math.random() * 50) + 1 + ' ' + streets[i % streets.length] + ', ' + area.city + ' ' + leadPC,
        postcode: leadPC, city: area.city,
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
      const leadPC = fullPC(area);
      leads.push({
        id: 'PL_' + Date.now() + '_' + i, address: Math.floor(Math.random() * 200) + 1 + ' ' + streets[i % streets.length] + ', ' + area.city + ' ' + leadPC,
        postcode: leadPC, city: area.city, applicationType: appTypes[i % appTypes.length],
        description: 'Proposed ' + (['residential', 'commercial', 'mixed-use', 'retail', 'office'][i % 5]) + ' development',
        applicant: 'Applicant at ' + streets[i % streets.length], council: councils[i % councils.length],
        applicationRef: 'APP/' + new Date().getFullYear() + '/' + (Math.floor(Math.random() * 90000) + 10000),
        planningKeyVal: String.fromCharCode(65 + Math.floor(Math.random() * 24)) + String.fromCharCode(65 + Math.floor(Math.random() * 24)) + Math.floor(Math.random() * 90000 + 10000),
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
        tenderNoticeId: 'CF-' + (Math.floor(Math.random() * 90000000) + 10000000),
        source: 'Contracts Finder', scrapedAt: now
      });
    }
  }

  return leads;
}

// ===== CRM HELPER: Format lead for CRM webhook =====
function formatLeadForCRM(lead) {
  const base = {
    lead_id: lead.id,
    source: lead.source || '9amLeads',
    delivered_at: lead.delivered_at || new Date().toISOString(),
    created_at: lead.created_at
  };
  // Moving leads
  if (lead.address) base.address = lead.address;
  if (lead.postcode) base.postcode = lead.postcode;
  if (lead.city) base.city = lead.city;
  if (lead.bedrooms) base.bedrooms = lead.bedrooms;
  if (lead.propertyType) base.property_type = lead.propertyType;
  if (lead.price) base.price = lead.price;
  if (lead.status) base.status = lead.status;
  if (lead.agent) base.agent = lead.agent;
  if (lead.estimatedMoveWindow) base.estimated_move_window = lead.estimatedMoveWindow;
  // Probate leads
  if (lead.deceasedName) base.deceased_name = lead.deceasedName;
  if (lead.estateValue) base.estate_value = lead.estateValue;
  if (lead.registry) base.registry = lead.registry;
  if (lead.legalAdvisor) base.legal_adviser = lead.legalAdvisor;
  // New business leads
  if (lead.companyNumber) base.company_number = lead.companyNumber;
  if (lead.ownerEmail) base.owner_email = lead.ownerEmail;
  if (lead.website) base.website = lead.website;
  if (lead.incorporationDate) base.incorporation_date = lead.incorporationDate;
  // Planning leads
  if (lead.applicationType) base.application_type = lead.applicationType;
  if (lead.description) base.description = lead.description;
  if (lead.applicant) base.applicant = lead.applicant;
  if (lead.council) base.council = lead.council;
  if (lead.applicationRef) base.application_ref = lead.applicationRef;
  // Tender leads
  if (lead.title) base.title = lead.title;
  if (lead.buyer) base.buyer = lead.buyer;
  if (lead.contractValue) base.contract_value = lead.contractValue;
  if (lead.closingDate) base.closing_date = lead.closingDate;
  if (lead.cpvCode) base.cpv_code = lead.cpvCode;
  // Any extra fields
  if (lead.name && !lead.address) base.name = lead.name;
  return base;
}

// ===== OPPORTUNITY SCORE ENGINE =====
function attachOpportunityScore(data, product) {
  if (!data) return { score: 0, category: 'cold', label: 'Cold Lead', reasons: ['No data available'] };
  product = product || 'moving';
  var score = 0;
  var reasons = [];
  var now = new Date();

  // 1. Freshness (0-20)
  var scrapedAt = data.scrapedAt || data.created_at || data.createdAt || data.delivered_at;
  if (scrapedAt) {
    var ageHours = (now - new Date(scrapedAt)) / (1000 * 60 * 60);
    if (ageHours < 1) { score += 20; reasons.push('Less than 1 hour old'); }
    else if (ageHours < 6) { score += 18; reasons.push('Less than 6 hours old'); }
    else if (ageHours < 24) { score += 14; reasons.push('Less than 24 hours old'); }
    else if (ageHours < 72) { score += 8; reasons.push('Less than 3 days old'); }
    else { score += 3; reasons.push('Older lead'); }
  } else { score += 10; reasons.push('Fresh lead'); }

  // 2. Business type match (0-15)
  if (product === 'moving') {
    var beds = parseInt(data.bedrooms) || 0;
    if (beds >= 3) { score += 15; reasons.push(beds + '-bedroom property (high value move)'); }
    else if (beds >= 2) { score += 12; reasons.push(beds + '-bedroom property'); }
    else if (beds >= 1) { score += 8; reasons.push(beds + '-bedroom property'); }
    else { score += 5; reasons.push('Property lead'); }
    var priceVal = parseInt(data.price) || 0;
    if (priceVal > 750000) { score += 3; reasons.push('Premium property'); }
  } else if (product === 'probate') {
    var estVal = parseInt(data.estateValue) || 0;
    if (estVal > 500000) { score += 15; reasons.push('High value estate'); }
    else if (estVal > 100000) { score += 12; reasons.push('Established estate'); }
    else if (estVal > 0) { score += 8; reasons.push('Estate lead'); }
    else { score += 5; }
    if (data.deceasedName) { score += 3; reasons.push('Named executor identified'); }
  } else if (product === 'newbusiness') {
    if (data.companyName || data.company) { score += 15; reasons.push('Named company: ' + (data.companyName || data.company)); }
    else { score += 8; reasons.push('New business lead'); }
    if (data.ownerEmail) { score += 3; reasons.push('Contact email available'); }
  } else if (product === 'planning') {
    if (data.applicant) { score += 15; reasons.push('Named applicant: ' + data.applicant); }
    else { score += 8; reasons.push('Planning application lead'); }
    var projVal = parseInt(data.estimatedValue || data.value) || 0;
    if (projVal > 100000) { score += 3; reasons.push('High value project'); }
  } else if (product === 'tenders') {
    var contractVal = parseInt(data.contractValue || data.value) || 0;
    if (contractVal > 500000) { score += 15; reasons.push('Major contract (£' + (contractVal/1000).toFixed(0) + 'k)'); }
    else if (contractVal > 100000) { score += 12; reasons.push('Substantial contract'); }
    else if (contractVal > 0) { score += 8; reasons.push('Contract opportunity'); }
    else { score += 5; }
    var closingDate = data.closingDate || data.closing_date;
    if (closingDate) {
      var daysLeft = Math.max(0, Math.floor((new Date(closingDate) - now) / 86400000));
      if (daysLeft < 14) { score += 5; reasons.push('Closing in ' + daysLeft + ' days'); }
      else { score += 2; }
    }
  }

  // 3. Location match (0-10)
  if (data.address || data.postcode) { score += 10; reasons.push('Location available'); }
  else { score += 4; }

  // 4. Estimated value (0-10)
  var vals = [data.price, data.estateValue, data.contractValue, data.estimatedValue, data.value];
  var hasVal = false;
  for (var vi = 0; vi < vals.length; vi++) { if (parseInt(vals[vi]) > 0) hasVal = true; }
  score += hasVal ? 10 : 4;
  if (hasVal) reasons.push('Value estimate available');

  // 5. Contact information (0-10)
  var hasContact = data.ownerEmail || data.legalAdvisorEmail || data.buyerEmail || data.applicant || data.name;
  if (hasContact) { score += 10; reasons.push('Contact information available'); }
  else { score += 3; }

  // 6-9. Data quality signals (0-20)
  var fieldCount = 0;
  for (var k in data) { if (data[k] && typeof data[k] !== 'object') fieldCount++; }
  if (fieldCount > 8) { score += 8; reasons.push('Rich data (' + fieldCount + ' fields)'); }
  else if (fieldCount > 4) { score += 5; }
  else { score += 2; }

  // Freshness bonus
  if (scrapedAt && ageHours < 1) score += 5;
  else if (data.status) {
    var st = (data.status || '').toLowerCase();
    if (st.includes('sstc') || st.includes('sold') || st.includes('offer')) { score += 7; reasons.push('Active status — urgent'); }
  }

  // Urgency for tenders
  if (product === 'tenders' && data.closingDate) {
    var dd = Math.max(0, Math.floor((new Date(data.closingDate) - now) / 86400000));
    if (dd < 7) { score += 5; reasons.push('Deadline within ' + dd + ' days'); }
  }

  // Deduplicate & limit to top 5 reasons
  var seen = {};
  var unique = [];
  for (var ri = 0; ri < reasons.length; ri++) {
    if (!seen[reasons[ri]]) { seen[reasons[ri]] = true; unique.push(reasons[ri]); }
  }
  var topReasons = unique.slice(0, 5);

  // Clamp
  score = Math.max(0, Math.min(100, score));

  var category = score >= 80 ? 'hot' : (score >= 50 ? 'warm' : 'cold');
  var label = score >= 80 ? 'Hot Lead' : (score >= 50 ? 'Warm Lead' : 'Cold Lead');

  return { score: score, category: category, label: label, reasons: topReasons };
}

// ===== HTTP HELPER: POST JSON via https =====
function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';
      const mod = require(isHttps ? 'https' : 'http');
      const body = JSON.stringify(data);
      const options = {
        hostname: parsed.hostname, port: parsed.port || (isHttps ? 443 : 80), path: parsed.pathname + parsed.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 15000
      };
      const req = mod.request(options, res => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => resolve({ status: res.statusCode, body: b, statusCode: res.statusCode }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
      req.write(body);
      req.end();
    } catch (e) { reject(e); }
  });
}
// ===== 9AM DAILY DELIVERY SCHEDULER: DISABLED =====
// Cron was disabled to prevent automated email delivery until scraping is fixed.
// Delivery can still be triggered manually via /api/test/delivery

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
} catch(e) { console.error('[STRIPE] Config load error:', e.message); }

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
    const validPlans = ['starter', 'growth', 'power', 'builder-package', 'marketing-package', 'property-package', 'moving-package'];
    const proValid = ['starter', 'growth', 'power', 'builder-package', 'marketing-package', 'property-package', 'moving-package', 'pro'];
    if (!plan || !proValid.includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Choose: starter, growth, power, or a package' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });

    // Handle packages and pro plan directly
    var packageKeys = { 'builder-package': 'bld-package', 'marketing-package': 'mkt-package', 'property-package': 'prp-package', 'moving-package': 'mov-package', 'pro': 'pro-plan' };
    var packageMap = { 'builder-package': 'builder-package', 'marketing-package': 'marketing-package', 'property-package': 'property-package', 'moving-package': 'moving-package', 'pro': 'pro' };
    
    var priceId;
    if (packageKeys[plan]) {
      // Package or pro plan
      var priceIdMap = STRIPE_PRICE_IDS[packageMap[plan]] || {};
      priceId = priceIdMap[packageKeys[plan]];
      if (!priceId) {
        return res.status(400).json({ error: 'Package pricing not found. Run node stripe_handler.js --setup first.' });
      }
    } else {
      // Standard plan
      const productKey = { moving: 'mov', probate: 'prob', newbusiness: 'nb', planning: 'plan', tenders: 'tend' }[customer.product] || customer.product;
      const planKey = productKey + '-' + plan;
      const priceIdMap = STRIPE_PRICE_IDS[customer.product] || {};
      priceId = priceIdMap[planKey];
      if (!priceId) {
        return res.status(400).json({ error: 'Pricing not found for this plan (' + planKey + '). Run node stripe_handler.js --setup first.' });
      }
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
  db.prepare('UPDATE customers SET plan = ?, leads_per_day = ?, trial_ends = NULL, subscription_start = COALESCE(subscription_start, datetime(\'now\')), paid_email_stage = COALESCE(paid_email_stage, \'0\') WHERE id = ?').run(plan, limit, req.user.id);

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
    const validPlans = ['starter', 'growth', 'power'];
    if (!plan || !validPlans.includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Choose: starter, growth, or power' });
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

// POST /api/scrape-generate — force generate demo leads for all products
app.post('/api/scrape-generate', async (req, res) => {
  try {
    let total = 0;
    for (const [product, config] of Object.entries(PRODUCT_LEAD_FILES)) {
      const count = req.body.count || 30;
      const leads = generateDemoLeads(product, count);
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(path.join(DATA_DIR, config.file), JSON.stringify(leads, null, 2));
      total += leads.length;
      console.log('[GENERATE] ' + product + ': ' + leads.length + ' demo leads saved');
    }
    res.json({ success: true, total_leads: total, message: 'Demo leads generated for all products' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== LEAD DISTRIBUTION ENDPOINTS =====
// POST /api/distribute — trigger lead distributor (match scraped leads to customers)
app.post('/api/distribute', async (req, res) => {
  try {
    const { product } = req.body || {};

    // Reload DB from file to get latest state
    _dbData = null;
    getDb();

    // Ensure demo leads exist if no real scrapers
    for (const [p, config] of Object.entries(PRODUCT_LEAD_FILES)) {
      const filePath = path.join(DATA_DIR, config.file);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 10) {
        console.log('[DISTRIBUTE] No leads for ' + p + ', generating demo data...');
        const leads = generateDemoLeads(p, 30);
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(leads, null, 2));
      }
    }

    const distributor = require('./lead_distributor.js');
    let result;
    if (product) {
      result = await distributor.distributeProduct(product);
    } else {
      result = await distributor.distributeAll(true);
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
    campaign: 'Active (10 trial + 7 paid emails)'
  });
});

// Generate lead email HTML (reuses existing template pattern)
function generateLeadEmailHTML(customer, leads) {
  const accent = customer.product === 'moving' ? '#ff6b35' : customer.product === 'probate' ? '#a855f7' : customer.product === 'newbusiness' ? '#06b6d4' : customer.product === 'planning' ? '#10b981' : '#6366f1';
  const productName = customer.product || 'opportunities';
  const aboutText = productName === 'moving' ? 'The address and property details are shown below. Contact the homeowner directly using the information provided.'
    : productName === 'probate' ? 'The deceased name, estate value and registry details are shown below. Contact the executor using the information provided.'
    : productName === 'newbusiness' ? 'The company name, SIC code and incorporation date are shown below. Contact the director using the information provided.'
    : productName === 'planning' ? 'The address, council and application reference are shown below for your records.'
    : 'The tender details, buyer and deadline are shown below. Apply using the reference number.';
  const dashboardUrl = 'https://www.9amleads.com/portal/dashboard.html';
  let body = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="only light"><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet"></head><body style="margin:0;padding:0;background-color:#ffffff;font-family:Inter,Arial,sans-serif;color:#111">';
  body += '<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff"><tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:24px 16px">';
  body += '<table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.04)">';

  // Header with homepage logo
  body += '<tr><td style="background:#ffffff;padding:28px 28px 20px;border-bottom:1px solid rgba(0,0,0,0.04);text-align:center">';
  body += '<div style="font-family:Outfit,sans-serif;font-size:22px;font-weight:900;color:#111;letter-spacing:-.5px">9am<span style="color:' + accent + '">Leads</span></div>';
  body += '<p style="color:#999;font-size:10px;margin:8px 0 0;text-transform:uppercase;letter-spacing:2px">' + (customer.lead_type || 'Daily Opportunities') + '</p>';
  body += '</td></tr>';

  // Greeting + stats
  body += '<tr><td style="background:#ffffff;padding:28px 28px 8px;text-align:center">';
  body += '<h2 style="font-family:Outfit,sans-serif;font-size:18px;font-weight:800;color:#111;margin:0 0 4px;line-height:1.2;text-align:center">Good Morning, ' + (customer.company || 'there') + '!</h2>';
  body += '<p style="color:#666;font-size:12px;margin:0 0 18px;line-height:1.5;text-align:center">Your daily opportunities for ' + new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.</p>';
  body += '<div style="display:inline-flex;gap:8px;margin-bottom:18px">';
  body += '<div style="background:#f8f9fb;border:1px solid rgba(0,0,0,0.06);border-radius:8px;padding:8px 18px;text-align:center"><div style="font-size:22px;font-weight:800;color:#22c55e">' + leads.length + '</div><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.5px">Today\'s Opportunities</div></div>';
  body += '</div>';
  body += '<p style="font-size:12px;color:#555;line-height:1.7;margin:0 0 4px;text-align:left;padding:14px 16px;background:#f8f9fb;border:1px solid rgba(0,0,0,0.04);border-radius:8px"><strong style="color:#111">About these leads:</strong><br>' + aboutText + '</p>';
  body += '</td></tr>';

  // Lead cards
  body += '<tr><td style="background:#ffffff;padding:16px 28px 20px">';
  for (var i = 0; i < leads.length; i++) {
    var l = leads[i];
    var d = l.data || {};
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch(e) { d = {}; } }

    var typeLabel = productName === 'moving' ? 'Moving Lead' : productName === 'probate' ? 'Probate Lead' : productName === 'newbusiness' ? 'New Business' : productName === 'planning' ? 'Planning Application' : 'Tender Opportunity';

    body += '<div style="background:#f0f2f5;border:1px solid rgba(0,0,0,0.08);border-radius:12px;margin-bottom:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04)">';

    // Accent top bar
    body += '<div style="height:4px;background:' + accent + '"></div>';

    // Card content
    body += '<div style="padding:16px 18px 14px">';

    // Title + badge row
    body += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">';
    body += '<span style="padding:3px 10px;border-radius:4px;background:' + accent + ';color:#fff;font-size:10px;font-weight:700;letter-spacing:.3px;white-space:nowrap;flex-shrink:0">' + typeLabel + '</span>';
    body += '<span style="font-size:15px;font-weight:700;color:#111;line-height:1.4">' + (d.title || d.tenderTitle || d.name || d.companyName || d.address || l.address || d.description || 'Opportunity') + '</span>';
    body += '</div>';

    // Key details as tagged chips
    var chips = [];
    if (d.postcode) chips.push({ icon: '\uD83D\uDCCD', text: d.postcode });
    if (d.city) chips.push({ icon: '\uD83C\uDFD9\uFE0F', text: d.city });
    if (d.bedrooms) chips.push({ icon: '\uD83C\uDFE0', text: d.bedrooms + ' bed' });
    if (d.status) chips.push({ icon: '\uD83D\uDD34', text: d.status });
    if (d.price) chips.push({ icon: '\u00A3', text: Number(d.price).toLocaleString() });
    if (d.estateValue) chips.push({ icon: '\u00A3', text: Number(d.estateValue).toLocaleString() + ' estate' });
    if (d.contractValue) chips.push({ icon: '\u00A3', text: Number(d.contractValue).toLocaleString() });
    if (d.estimatedMoveWindow) chips.push({ icon: '\uD83D\uDCC5', text: d.estimatedMoveWindow });
    if (d.council) chips.push({ icon: '\uD83C\uDFDB\uFE0F', text: d.council });
    if (d.applicationRef) chips.push({ icon: '\uD83D\uDCCB', text: 'Ref: ' + d.applicationRef });
    if (d.buyer) chips.push({ icon: '\uD83C\uDFED', text: d.buyer });
    if (d.deceasedName) chips.push({ icon: '\uD83D\uDC68\u200D\u2696\uFE0F', text: d.deceasedName });
    if (d.registry) chips.push({ icon: '\uD83C\uDFE2', text: d.registry });
    if (d.companyName) chips.push({ icon: '\uD83C\uDFE2', text: d.companyName });
    if (d.sicCode) chips.push({ icon: '\uD83D\uDCCA', text: 'SIC: ' + d.sicCode });
    if (d.incorporationDate) chips.push({ icon: '\uD83D\uDCC5', text: new Date(d.incorporationDate).toLocaleDateString() });
    if (d.companyNumber) chips.push({ icon: '\uD83D\uDCB3', text: 'No: ' + d.companyNumber });
    if (d.description) chips.push({ icon: '\uD83D\uDCCB', text: d.description.substring(0, 80) });
    if (d.publishedDate) chips.push({ icon: '\uD83D\uDCC5', text: 'Published: ' + new Date(d.publishedDate).toLocaleDateString() });
    if (d.tenderNoticeId) chips.push({ icon: '\uD83D\uDCCB', text: 'Ref: ' + d.tenderNoticeId });
    if (d.cpvCode) chips.push({ icon: '\uD83D\uDCCA', text: 'CPV: ' + d.cpvCode });
    if (d.closingDate) { var days = Math.max(0, Math.floor((new Date(d.closingDate) - new Date()) / 86400000)); chips.push({ icon: '\u23F3', text: 'Deadline: ' + days + ' days' }); }
    if (d.agent) chips.push({ icon: '\uD83D\uDC64', text: d.agent });

    if (chips.length > 0) {
      body += '<div style="margin-bottom:10px">';
      for (var c = 0; c < chips.length; c++) {
        body += '<span style="display:inline-block;padding:4px 10px;margin:0 4px 4px 0;background:#e4e7eb;border-radius:6px;font-size:12px;color:#333;white-space:nowrap">' + chips[c].icon + ' ' + chips[c].text + '</span>';
      }
      body += '</div>';
    }

    // Contact info
    var hasEmail = d.ownerEmail || d.buyerEmail || d.legalAdvisorEmail;
    var hasWebsite = d.website;
    var hasAddress = d.address;
    var hasPhone = d.phone || d.ownerPhone || d.buyerPhone || d.legalAdvisorPhone;
    if (hasEmail || hasWebsite || hasPhone || hasAddress) {
      body += '<div style="border-top:1px solid rgba(0,0,0,0.04);padding-top:10px;margin-bottom:8px">';
      if (hasEmail) body += '<div style="font-size:12px;color:#555;margin-bottom:3px">\u2709\uFE0F ' + (d.ownerEmail || d.buyerEmail || d.legalAdvisorEmail) + '</div>';
      if (hasPhone) body += '<div style="font-size:12px;color:#555;margin-bottom:3px">\uD83D\uDCDE ' + (d.phone || d.ownerPhone || d.buyerPhone || d.legalAdvisorPhone) + '</div>';
      if (hasWebsite) body += '<div style="font-size:12px;color:#555;margin-bottom:3px">\uD83C\uDF10 <a href="http://' + d.website.replace(/^https?:\/\//, '') + '" style="color:' + accent + ';text-decoration:none" target="_blank">' + d.website + '</a></div>';
      body += '</div>';
    }

    // Action button for tenders only
    if (productName === 'tenders') {
      var noticeUrl = d.tenderNoticeId ? 'https://www.gov.uk/contracts-finder/notice/' + d.tenderNoticeId : 'https://www.gov.uk/contracts-finder';
      body += '<div style="border-top:1px solid rgba(0,0,0,0.04);padding-top:10px;padding-bottom:2px"><a href="' + noticeUrl + '" target="_blank" style="display:block;text-align:center;padding:8px 0;background:' + accent + ';color:#fff;text-decoration:none;border-radius:8px;font-size:12px;font-weight:600">\uD83D\uDD0D Apply on Contracts Finder</a></div>';
      body += '<div style="font-size:11px;color:#888;margin-top:6px">Use the reference number shown above to apply for this opportunity.</div>';
    }

    body += '</div></div>';
  }
  body += '</td></tr>';

  // Footer
  body += '<tr><td style="padding:24px 32px;border-top:1px solid rgba(0,0,0,0.04);text-align:center">';
  body += '<p style="color:#666;font-size:11px;margin:0 0 10px;line-height:1.5">' + 
    (productName === 'planning' ? 'This information is provided for reference purposes only.' :
     productName === 'tenders' ? 'Apply using the reference number provided above. Visit the dashboard to track your applications.' :
     productName === 'newbusiness' ? 'Contact the company director using the information provided. Visit the dashboard to manage your leads.' :
     productName === 'probate' ? 'Contact the executor using the information provided. Visit the dashboard to manage your leads.' :
     'Contact the homeowner using the information provided. Visit the dashboard to manage your leads.') + '</p>';
  body += '<a href="' + dashboardUrl + '" style="display:inline-block;padding:10px 28px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:600;font-size:13px">View Full Dashboard</a>';
  body += '<p style="color:#999;font-size:9px;margin:12px 0 0;line-height:1.5;text-transform:uppercase;letter-spacing:.5px">9am Leads Ltd &bull; Company No. 17168176 &bull; Delivered at 9am by 9amLeads</p>';
  body += '</td></tr></table></td></tr></table></body></html>';
  return body;
}
// POST /api/test/delivery — manually trigger delivery for one customer
app.post('/api/test/delivery', authMiddleware, async (req, res) => {
  // Reload DB from file to get latest state
  _dbData = null;
  const db = getDb();
  const customer = (db.customers || []).find(function(c) { return c.id === req.user.id; });
  if (!customer) return res.status(404).json({ error: 'User not found' });

  // Generate leads for this customer's product if none exist
  var allLeads = (db.leads || []).filter(function(l) { return l.customer_id === req.user.id && l.delivered === 0; });
  if (allLeads.length === 0) {
    // Generate demo leads for all products and distribute
    for (const [prod, cfg] of Object.entries(PRODUCT_LEAD_FILES)) {
      const genLeads = generateDemoLeads(prod, 30);
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(path.join(DATA_DIR, cfg.file), JSON.stringify(genLeads, null, 2));
    }
    // Distribute to match leads to customers
    const distributor = require('./lead_distributor.js');
    await distributor.distributeAll(true);
    _dbData = null;
    allLeads = (getDb().leads || []).filter(function(l) { return l.customer_id === req.user.id && l.delivered === 0; });
  }

  const leads = allLeads.slice(0, customer.leads_per_day || 20);
  
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
app.post('/api/admin/impersonate', adminAuth, async (req, res) => {
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

// POST /api/admin/run-scrapers — manually trigger all scrapers now
app.post('/api/admin/run-scrapers', adminAuth, async (req, res) => {
  try {
    const https = require('https');
    const dayOfWeek = new Date().getDay();
    const results = {};
    for (const [product, config] of Object.entries(PRODUCT_LEAD_FILES)) {
      try {
        // Sync customers from main DB to scraper customer file
        const allCustomers = getDb().customers || [];
        const productCustomers = allCustomers.filter(c => c.product === product && c.trial_ends && new Date(c.trial_ends) > new Date());
        const customerFile = path.join(DATA_DIR, product + '-customers.json');
        const existing = (() => { try { return JSON.parse(fs.readFileSync(customerFile, 'utf-8')); } catch { return {}; } })();
        for (const c of productCustomers) {
          existing[c.id] = existing[c.id] || {};
          existing[c.id].active = true;
          existing[c.id].company = c.company || c.name || '';
          existing[c.id].email = c.email || '';
          existing[c.id].postcodeAreas = (c.target_areas || []);
          existing[c.id].leadsPerDay = c.leads_per_day || 5;
          existing[c.id].plan = c.plan || 'free_trial';
        }
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(customerFile, JSON.stringify(existing, null, 2));

        // Generate leads — use free APIs where available, else demo data
        var leads;
        if (product === 'newbusiness') {
          try {
            var chApiKey = process.env.COMPANIES_HOUSE_API_KEY || '8e6cae34-073b-4451-b4c8-e0b463ca4b21';
            var chUrl = '/advanced-search/companies?incorporatedFrom=' + new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0] + '&size=30';
            leads = await new Promise(function(resolve) {
              var req = require('https').request({ hostname: 'api.company-information.service.gov.uk', path: chUrl, method: 'GET', headers: { 'Authorization': 'Basic ' + Buffer.from(chApiKey + ':').toString('base64'), 'Accept': 'application/json' } }, function(res) {
                var body = '';
                res.on('data', function(c) { body += c; });
                res.on('end', function() {
                  try {
                    var data = JSON.parse(body);
                    var items = data.items || [];
                    resolve(items.map(function(c) { return {
                      id: 'CH_' + (c.company_number || Date.now()),
                      name: c.company_name || c.title || '',
                      companyNumber: c.company_number || '',
                      companyName: c.company_name || c.title || '',
                      address: [c.address_line_1 || '', c.address_line_2 || '', c.locality || '', c.postal_code || ''].filter(Boolean).join(', '),
                      postcode: c.postal_code || '',
                      city: c.locality || '',
                      sicCode: (c.sic_codes || [])[0] || '',
                      incorporationDate: c.date_of_creation || '',
                      ownerEmail: '', website: '',
                      source: 'Companies House', scrapedAt: new Date().toISOString()
                    }; }));
                  } catch(e) { resolve([]); }
                });
              });
              req.on('error', function() { resolve([]); });
              req.setTimeout(15000, function() { req.destroy(); resolve([]); });
              req.end();
            });
            if (!leads || leads.length === 0) { console.log('[SCRAPER] Companies House returned 0 results, using demo'); leads = generateDemoLeads(product, 30); }
          } catch(e) { console.log('[SCRAPER] Companies House error: ' + e.message); leads = generateDemoLeads(product, 30); }
        } else {
          leads = generateDemoLeads(product, 30);
        }
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(path.join(DATA_DIR, config.file), JSON.stringify(leads, null, 2));
        results[product] = leads && leads.length > 0 ? (leads[0].source || 'ok') + '_' + leads.length : 'empty';
      } catch (prodErr) {
        results[product] = 'error: ' + prodErr.message;
      }
    }
    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/admin/cleanup', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const before = (db.customers || []).length;
    const beforeLeads = (db.leads || []).length;
    db.customers = [];
    db.leads = [];
    db._cleanupAt = new Date().toISOString();
    saveDb();
    // Also clear postcode assignments
    const assignFile = path.join(DATA_DIR, 'postcode-assignments.json');
    fs.writeFileSync(assignFile, JSON.stringify({ assignments: {} }, null, 2));
    res.json({ success: true, removed_customers: before, removed_leads: beforeLeads, assignments_cleared: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/export — export customers for marketing
app.get('/api/admin/export', adminAuth, (req, res) => {
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
(function(){var i=new Image();i.src='https://nineamleads-backend.onrender.com/api/track?p='+encodeURIComponent(window.location.pathname)+'&r='+encodeURIComponent(document.referrer||'')})();
</script>`;

// ===== ENQUIRY FORM API =====
app.post('/api/send-enquiry', async (req, res) => {
  try {
    const { to, subject, name, company, fromEmail, phone, leadType, services, details } = req.body;
    if (!name || !fromEmail || !details) {
      return res.status(400).json({ error: 'Name, email and details are required' });
    }
    const servicesHtml = services && services.length
      ? services.map(s => '<li style="color:#555;font-size:13px;margin-bottom:4px">' + s + '</li>').join('')
      : '<li style="color:#666;font-size:13px">None specified</li>';
    const leadTypeNames = { moving:'Moving Leads', probate:'Probate Leads', newbusiness:'New Business Alerts', planning:'Planning Permission', tenders:'Public Tenders', multiple:'Multiple / Not Sure' };
    const htmlContent = `<div style="font-family:Inter,sans-serif;background:#0a0a0f;padding:32px">
<div style="max-width:560px;margin:0 auto;background:#11131f;border:1px solid #1e2030;border-radius:16px;overflow:hidden">
<div style="background:linear-gradient(135deg,#0ea5e9,#2563eb);padding:20px 24px">
<h1 style="font-family:Outfit,sans-serif;font-size:18px;font-weight:800;color:#fff;margin:0">New Marketing Services Enquiry</h1>
<p style="color:rgba(255,255,255,0.7);font-size:13px;margin:4px 0 0">From ` + name + `</p>
</div>
<div style="padding:24px">
<table style="width:100%;border-collapse:collapse;font-size:13px">
<tr><td style="padding:8px 12px;color:#666;width:100px">Name</td><td style="padding:8px 12px;color:#f1f5f9;font-weight:600">` + name + `</td></tr>
<tr><td style="padding:8px 12px;color:#666">Company</td><td style="padding:8px 12px;color:#f1f5f9">` + (company || 'N/A') + `</td></tr>
<tr><td style="padding:8px 12px;color:#666">Email</td><td style="padding:8px 12px;color:#0ea5e9"><a href="mailto:` + fromEmail + `" style="color:#0ea5e9;text-decoration:none">` + fromEmail + `</a></td></tr>
<tr><td style="padding:8px 12px;color:#666">Phone</td><td style="padding:8px 12px;color:#f1f5f9">` + (phone || 'N/A') + `</td></tr>
<tr><td style="padding:8px 12px;color:#666">Lead Type</td><td style="padding:8px 12px;color:#f1f5f9">` + (leadTypeNames[leadType] || leadType) + `</td></tr>
</table>
<div style="margin-top:16px;padding:16px;background:#f8f9fb;border:1px solid #1e2030;border-radius:8px">
<h3 style="font-family:Outfit,sans-serif;font-size:13px;font-weight:700;color:#f1f5f9;margin:0 0 8px">Services Requested</h3>
<ul style="margin:0;padding:0 0 0 16px">` + servicesHtml + `</ul>
</div>
<div style="margin-top:12px;padding:16px;background:#f8f9fb;border:1px solid #1e2030;border-radius:8px">
<h3 style="font-family:Outfit,sans-serif;font-size:13px;font-weight:700;color:#f1f5f9;margin:0 0 8px">Details</h3>
<p style="color:#555;font-size:13px;line-height:1.7;margin:0;white-space:pre-wrap">` + details + `</p>
</div>
</div>
<div style="padding:16px 24px;border-top:1px solid #1e2030;font-size:11px;color:#5c6480;text-align:center">Sent via 9amLeads Marketing Services Enquiry Form</div>
</div>
</div>`;
    await sendBrevoEmail({ email: 'hello@9amleads.com', name: '9amLeads Sales' }, subject || 'Marketing Services Enquiry - ' + name, htmlContent);
    res.json({ success: true, message: 'Enquiry sent' });
  } catch (err) {
    console.error('[ENQUIRY ERROR]', err.message);
    res.status(500).json({ error: 'Failed to send enquiry' });
  }
});

// Global error handler
app.use(function(err, req, res, next) {
  console.error('[ERROR] Unhandled error:', err.message || err);
  res.status(500).json({ error: 'Internal server error' });
});

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
  console.log('  CRM Endpoints:');
  console.log('  GET  /api/settings/crm  - Get CRM webhook URL');
  console.log('  PUT  /api/settings/crm  - Update CRM webhook URL');
  console.log('  DEL  /api/settings/crm  - Remove CRM webhook');
  console.log('  POST /api/crm/test      - Test CRM webhook connection');
  console.log('  POST /api/crm/push      - Manually push leads to CRM');
  console.log('  AI Image Generation:');
  console.log('  POST /api/ai/generate-image - Generate image via DALL-E 3 (requires OPENAI_API_KEY)');
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







// Temp Brevo audit endpoint
app.get('/api/admin/brevo-templates', adminAuth, async function(req, res) {
  try {
    var https = require('https');
    var key = process.env.BREVO_API_KEY || '';
    if (!key) return res.json({ error: 'No Brevo API key' });
    var r = await new Promise(function(resolve) {
      var req = https.request({ hostname:'api.brevo.com', path:'/v3/smtp/templates?limit=100', method:'GET', headers: { 'api-key': key } }, function(resp) {
        var b = ''; resp.on('data', function(c) { b += c; });
        resp.on('end', function() { try { resolve(JSON.parse(b)); } catch(e) { resolve({ error: 'Parse failed' }); } });
      });
      req.on('error', function(e) { resolve({ error: e.message }); });
      req.end();
    });
    res.json(r);
  } catch(e) { res.json({ error: e.message }); }
});
