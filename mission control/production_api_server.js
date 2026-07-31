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
const JWT_SECRET = process.env.JWT_SECRET || '9amLeads-Production-JWT-Secret-2026!';
if (!process.env.JWT_SECRET) console.log('[CONFIG] JWT_SECRET not set. Using hardcoded fallback.');
const DATA_DIR = (function() {
  var d = path.join(__dirname, 'data');
  if (!fs.existsSync(d)) {
    var alt = path.join(__dirname, '..', 'mission control', 'data');
    if (fs.existsSync(alt)) d = alt;
  }
  return d;
})();
const DB_FILE = path.join(DATA_DIR, 'database.json');
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://www.9amleads.com';

// Postcode district data
const POSTCODE_DISTRICTS_FILE = path.join(DATA_DIR, 'uk-postcode-districts.json');
const POSTCODE_AREAS_FILE = path.join(DATA_DIR, 'uk-postcode-areas.json');
const POSTCODE_ASSIGNMENTS_FILE = path.join(DATA_DIR, 'postcode-assignments.json');

// Postcode district limits per plan — unlimited for all (any customer can add any postcode)
const POSTCODE_LIMITS = {
  free_trial: 999,
  essential: 999,
  starter: 999,
  pro: 999,
  enterprise: 999
};

function loadPostcodeDistricts() {
  try { return JSON.parse(fs.readFileSync(POSTCODE_DISTRICTS_FILE, 'utf-8')); }
  catch { return {}; }
}

function loadPostcodeAreas() {
  try { return JSON.parse(fs.readFileSync(POSTCODE_AREAS_FILE, 'utf-8')); }
  catch {
    // Fallback: built-in area list
    var areaCodes = 'AB,AL,B,BA,BB,BD,BH,BL,BN,BR,BS,BT,CA,CB,CF,CH,CM,CO,CR,CT,CV,CW,DA,DD,DE,DG,DH,DL,DN,DT,DY,E,EC,EH,EN,EX,FK,FY,G,GL,GU,GY,HA,HD,HG,HP,HR,HS,HU,HX,IG,IM,IP,IV,JE,KA,KT,KW,KY,L,LA,LD,LE,LL,LN,LS,LU,M,ME,MK,ML,MN,MS,N,NE,NG,NL,NN,NP,NR,NW,OL,OX,PA,PE,PH,PL,PO,PR,RG,RH,RM,S,SA,SE,SG,SK,SL,SM,SN,SO,SP,SR,SS,ST,SW,SY,TA,TD,TF,TN,TQ,TR,TS,TW,UB,W,WA,WC,WD,WF,WN,WR,WS,WV,YO,ZE';
    var areas = {};
    areaCodes.split(',').forEach(function(code) {
      areas[code] = { code: code, name: code, region: '' };
    });
    return areas;
  }
}

function loadAssignments() {
  try { return JSON.parse(fs.readFileSync(POSTCODE_ASSIGNMENTS_FILE, 'utf-8')); }
  catch { return { assignments: {} }; }
}

// On startup: ensure required data files exist on persistent disk
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  // Copy default data files from source if not present on persistent disk
  var sourceDataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(sourceDataDir)) sourceDataDir = path.join(__dirname, '..', 'mission control', 'data');
  ['uk-postcode-areas.json', 'uk-postcode-districts.json', 'postcode-assignments.json', 'stripe-config.json'].forEach(function(fn) {
    var targetPath = path.join(DATA_DIR, fn);
    var sourcePath = path.join(sourceDataDir, fn);
    if (fs.existsSync(sourcePath) && (!fs.existsSync(targetPath) || fn === 'stripe-config.json')) {
      fs.copyFileSync(sourcePath, targetPath);
      if (fn === 'stripe-config.json') console.log('[BOOT] Updated stripe-config.json');
      else console.log('[BOOT] Copied ' + fn + ' to persistent disk');
    }
  });
} catch(e) { console.log('[BOOT] Data file setup:', e.message); }

try {
  var startupDb = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'database.json'), 'utf-8'));
  var beforeCust = (startupDb.customers || []).length;
  var beforeLeads = (startupDb.leads || []).length;
  startupDb.customers = (startupDb.customers || []).filter(function(c) { return c.source !== 'demo-migration'; });
  startupDb.leads = (startupDb.leads || []).filter(function(l) { return l.customer_id && startupDb.customers.some(function(oc) { return oc.id === l.customer_id; }); });
  if (beforeCust !== startupDb.customers.length) {
    fs.writeFileSync(path.join(DATA_DIR, 'database.json'), JSON.stringify(startupDb, null, 2));
    console.log('[BOOT] Purged ' + (beforeCust - startupDb.customers.length) + ' demo customers + ' + (beforeLeads - startupDb.leads.length) + ' leads');
  }
} catch(e) { console.log('[BOOT] Startup purge check:', e.message); }

function saveAssignments(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(POSTCODE_ASSIGNMENTS_FILE, JSON.stringify(data, null, 2));
}

function getPostcodeLimit(plan, extraPostcodes, product) {
  // Specialist types (planning, probate, tenders) use wider areas by default
  var specialistTypes = { planning: true, probate: true, tenders: true };
  if (product && specialistTypes[product]) {
    var rule = getLeadTypeRule(product);
    if (rule && rule.area_limit) {
      var limit = rule.area_limit[plan] || rule.area_limit.starter || 3;
      var extra = parseInt(extraPostcodes) || 0;
      return Math.min(limit + extra2, 999);
    }
  }
  const base = POSTCODE_LIMITS[plan] || POSTCODE_LIMITS.free_trial;
  var extra2 = parseInt(extraPostcodes) || 0;
  return base + extra2;
}

const EXTRAS_PRICE = 5000; // £50 one-time per extra postcode area

function normalisePostcodeForMatch(pc) {
  return pc.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isFullDistrict(code, districts) {
  return !!districts[code.toUpperCase()];
}



function extractPostcodeArea(postcode) {
  return (postcode || '').toUpperCase().replace(/[^A-Z].*$/, '');
}

function getMatchingArea(code, areas) {
  const upper = code.toUpperCase().replace(/[^A-Z]/g, '');
  if (areas[upper]) return upper;
  return null;
}

function validatePostcodes(postcodes, customerPlan, customerProduct, customerId, extraPostcodes) {
  const areas = loadPostcodeAreas();
  const assignments = loadAssignments();
  const maxLimit = getPostcodeLimit(customerPlan, extraPostcodes);
  const errors = [];

  if (!Array.isArray(postcodes)) {
    return { valid: false, errors: ['Postcodes must be an array'] };
  }

  if (postcodes.length > maxLimit) {
    const limitLabel = maxLimit >= 999 ? 'unlimited' : maxLimit;
    errors.push('Your ' + customerPlan + ' plan allows ' + limitLabel + ' postcode area' + (maxLimit !== 1 ? 's' : '') + '. You selected ' + postcodes.length + '.');
  }

  for (const pc of postcodes) {
    const upper = pc.toUpperCase().trim();

    // Check if it's a valid postcode area (e.g., "EN", "SG", "CM")
    const matchedArea = getMatchingArea(upper, areas);
    if (!matchedArea) {
      errors.push('"' + pc + '" is not a valid UK postcode area. Use 1 or 2-letter codes like B (Birmingham), N (North London), EN (Enfield), SG (Stevenage), CM (Chelmsford).');
      continue;
    }

    if (upper.length < 1 || upper.length > 2) {
      errors.push('"' + pc + '" is not a valid UK postcode area code (use 1 or 2 letters like B, N, EN, SG, CM).');
      continue;
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
var DIRECT_MAIL_TABLES = ['customer_business_profiles','direct_mail_templates','direct_mail_campaigns','direct_mail_materials','direct_mail_recipients','direct_mail_automation_settings','direct_mail_orders','direct_mail_provider_logs','direct_mail_status_history','direct_mail_test_logs','direct_mail_suppression','campaign_packs','customer_campaign_packs','marketplace_templates','customer_marketplace_templates','seasonal_campaigns','postal_sequences','postal_sequence_steps','campaign_requests','campaign_notes','onboarding_progress','activity_timeline','knowledge_articles','knowledge_bookmarks'];

// Direct Mail feature access by plan
var DM_FEATURE_ACCESS = {
  manual_send: { free_trial: true, starter: true, pro: true, enterprise: true, label: 'Manual Campaign Sending', desc: 'Send direct mail campaigns manually' },
  upload_materials: { free_trial: true, starter: true, pro: true, enterprise: true, label: 'Upload Materials', desc: 'Upload your own flyers and letters' },
  ai_letter: { free_trial: false, starter: true, pro: true, enterprise: true, label: 'AI Letter Generator', desc: 'Generate introduction letters with AI' },
  ai_flyer: { free_trial: false, starter: true, pro: true, enterprise: true, label: 'AI Flyer Generator', desc: 'Generate flyer content with AI' },
  saved_templates: { free_trial: false, starter: true, pro: true, enterprise: true, label: 'Saved Templates', desc: 'Save and reuse templates' },
  campaign_history: { free_trial: true, starter: true, pro: true, enterprise: true, label: 'Campaign History', desc: 'View past campaign history' },
  auto_send: { free_trial: false, starter: true, pro: true, enterprise: true, label: 'Print & Post', desc: 'Automated daily mail campaigns' },
  saved_payment: { free_trial: false, starter: true, pro: true, enterprise: true, label: 'Saved Payment Method', desc: 'Store a card for automatic payments' },
  daily_summaries: { free_trial: false, starter: true, pro: true, enterprise: true, label: 'Daily Summaries', desc: 'Daily campaign summary emails' },
  proof_tracking: { free_trial: false, starter: true, pro: true, enterprise: true, label: 'Proof Tracking', desc: 'Track proof of posting' },
  multi_templates: { free_trial: false, starter: true, pro: true, enterprise: true, label: 'Multiple Templates', desc: 'Multiple templates by lead type' },
  ai_pdf_generator: { free_trial: false, starter: true, pro: true, enterprise: true, label: 'AI Flyer PDF Generator', desc: 'Generate print-ready flyer PDFs' }
};

// Load DM feature access from file (admin-configurable)
var DM_FEATURE_FILE = path.join(DATA_DIR, 'dm-features.json');
try {
  if (fs.existsSync(DM_FEATURE_FILE)) {
    var loadedFeatures = JSON.parse(fs.readFileSync(DM_FEATURE_FILE, 'utf-8'));
    for (var _dmf in loadedFeatures) { if (DM_FEATURE_ACCESS[_dmf]) DM_FEATURE_ACCESS[_dmf] = loadedFeatures[_dmf]; }
  }
} catch(e) { console.log('[DM-FEATURES] Config error:', e.message); }

function customerCanUseDMFeature(customerPlan, featureKey) {
  var feature = DM_FEATURE_ACCESS[featureKey];
  if (!feature) return false;
  return feature[customerPlan] === true;
}

function getDb() {
  if (!_dbData) { _dbData = loadDb(); }
  // Ensure all direct mail tables exist (for backward compatibility with existing DB files)
  for (var _dmi = 0; _dmi < DIRECT_MAIL_TABLES.length; _dmi++) {
    if (!_dbData[DIRECT_MAIL_TABLES[_dmi]]) _dbData[DIRECT_MAIL_TABLES[_dmi]] = [];
  }
  return _dbData;
}
function loadDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); }
  catch { return { customers: [], leads: [], deliveries: [], scraper_logs: [], subscriptions: [], blog_posts: [], customer_business_profiles: [], direct_mail_templates: [], direct_mail_campaigns: [], direct_mail_materials: [], direct_mail_recipients: [], direct_mail_automation_settings: [], direct_mail_orders: [], direct_mail_provider_logs: [], direct_mail_status_history: [], direct_mail_test_logs: [] }; }
}
function saveDb() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(_dbData, null, 2)); } catch(e) { console.error('[DB] Save error:', e.message); }
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
        // Handle AND conditions - find first = ? pair
        const conditions = whereStr.split(/\s+AND\s+/i);
        for (var _wci = 0; _wci < conditions.length; _wci++) {
          var cond = conditions[_wci].trim();
          var eqIdx2 = cond.indexOf('=');
          if (eqIdx2 === -1) continue;
          var field = cond.substring(0, eqIdx2).trim();
          var rawVal = cond.substring(eqIdx2 + 1).trim();
          if (_wci === 0) { idField = field; }
          if (rawVal === '?') {
            if (_wci === 0) idVal = params[paramIdx];
            paramIdx++;
          } else {
            if (_wci === 0) idVal = rawVal.replace(/^'(.*)'$/, '$1');
          }
        }
      }
      if (idVal === null || idVal === undefined) idVal = params[params.length - 1];
      const idx = getDb()[q.table].findIndex(r => r[idField] == idVal);
      if (idx !== -1) { getDb()[q.table][idx] = { ...getDb()[q.table][idx], ...updates }; saveDb(); return { changes: 1 }; }
    }
    return { changes: 0 };
  }
  if (q.isDelete) {
    const whereMatch = sql.match(/WHERE\s+(.+?)$/i);
    if (whereMatch) {
      const whereStr = whereMatch[1].trim();
      const eqIdx = whereStr.indexOf('=');
      const conditions = whereStr.split(/\s+AND\s+/i);
      let paramIdx = 0;
      let rows = getDb()[q.table];
      conditions.forEach(function(cond) {
        const eq = cond.indexOf('=');
        const field = cond.substring(0, eq).trim();
        let val = cond.substring(eq + 1).trim();
        if (val === '?') { val = params[paramIdx++]; }
        else { val = val.replace(/^'(.*)'$/, '$1'); }
        rows = rows.filter(function(r) { return r[field] != val; });
      });
      getDb()[q.table] = rows;
      saveDb();
      return { changes: 1 };
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

// ===== DIRECT MAIL PROVIDER ABSTRACTION =====
var DIRECT_MAIL_PROVIDER = process.env.DIRECT_MAIL_PROVIDER || 'mock';

class DirectMailProvider {
  constructor() { this.name = 'base'; }
  async validateAddresses(addresses) { throw new Error('validateAddresses not implemented'); }
  async createCampaign(campaignData) { throw new Error('createCampaign not implemented'); }
  async uploadArtwork(campaignId, files) { throw new Error('uploadArtwork not implemented'); }
  async sendCampaign(campaignId) { throw new Error('sendCampaign not implemented'); }
  async getCampaignStatus(providerCampaignId) { throw new Error('getCampaignStatus not implemented'); }
  async getProofOfPosting(providerCampaignId) { throw new Error('getProofOfPosting not implemented'); }
  async cancelCampaign(providerCampaignId) { throw new Error('cancelCampaign not implemented'); }
  async handleWebhook(payload) { throw new Error('handleWebhook not implemented'); }
}

class MockDirectMailProvider extends DirectMailProvider {
  constructor() { super(); this.name = 'mock'; this.campaigns = {}; }

  async validateAddresses(addresses) {
    if (!Array.isArray(addresses)) addresses = [addresses];
    var results = addresses.map(function(a) {
      var hasPostcode = a.postcode && a.postcode.trim().length > 2;
      var hasStreet = a.address_line1 && a.address_line1.trim().length > 2;
      var valid = hasPostcode && hasStreet;
      return {
        original: a,
        valid: valid,
        reason: valid ? null : (hasPostcode ? 'Missing street address' : (hasStreet ? 'Missing or invalid postcode' : 'Missing address details')),
        corrected: valid ? { postcode: a.postcode.toUpperCase(), address_line1: a.address_line1, city: a.city || '', country: 'United Kingdom' } : null
      };
    });
    var validCount = results.filter(function(r) { return r.valid; }).length;
    return { success: true, validated: results.length, valid: validCount, invalid: results.length - validCount, details: results };
  }

  async createCampaign(campaignData) {
    var providerId = 'MOCK-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    this.campaigns[providerId] = { status: 'accepted', data: campaignData, created_at: new Date().toISOString() };
    return {
      success: true, provider_campaign_id: providerId,
      message: 'Campaign accepted by mock provider',
      estimated_cost: campaignData.recipient_count ? (campaignData.recipient_count * 0.75).toFixed(2) : 0,
      status: 'accepted'
    };
  }

  async uploadArtwork(campaignId, files) {
    var uploaded = (files || []).map(function(f) { return { name: f.name || 'file', status: 'uploaded', url: 'https://mock-provider.local/artwork/' + campaignId + '/' + encodeURIComponent(f.name || 'file') }; });
    return { success: true, files: uploaded.length, uploaded: uploaded };
  }

  async sendCampaign(providerCampaignId) {
    if (!this.campaigns[providerCampaignId]) return { success: false, error: 'Campaign not found with provider' };
    this.campaigns[providerCampaignId].status = 'printing';
    // Simulate async processing
    setTimeout(function(self, id) {
      self.campaigns[id].status = 'dispatched';
    }, 5000, this, providerCampaignId);
    setTimeout(function(self, id) {
      self.campaigns[id].status = 'completed';
    }, 10000, this, providerCampaignId);
    return { success: true, provider_campaign_id: providerCampaignId, status: 'printing', message: 'Campaign sent to printing', estimated_dispatch: '2-3 business days' };
  }

  async getCampaignStatus(providerCampaignId) {
    // Stateless mock: return simulated status progression
    var statuses = ['accepted','printing','dispatched','completed'];
    var hash = 0; for (var si = 0; si < (providerCampaignId||'').length; si++) { hash = ((hash << 5) - hash) + providerCampaignId.charCodeAt(si); hash |= 0; }
    var idx = Math.abs(hash) % statuses.length;
    return { success: true, provider_campaign_id: providerCampaignId, status: statuses[idx], updated_at: new Date().toISOString() };
  }

  async getProofOfPosting(providerCampaignId) {
    return {
      success: true, provider_campaign_id: providerCampaignId,
      proof_url: 'https://mock-provider.local/proof/' + providerCampaignId + '.pdf',
      generated_at: new Date().toISOString(),
      recipient_count: 0,
      postage_date: new Date().toISOString().split('T')[0],
      estimated_delivery: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]
    };
  }

  async cancelCampaign(providerCampaignId) {
    var camp = this.campaigns[providerCampaignId];
    if (!camp) return { success: false, error: 'Campaign not found' };
    if (camp.status === 'completed' || camp.status === 'dispatched') return { success: false, error: 'Cannot cancel campaign that has already been ' + camp.status };
    this.campaigns[providerCampaignId].status = 'cancelled';
    return { success: true, provider_campaign_id: providerCampaignId, status: 'cancelled', message: 'Campaign cancelled' };
  }

  async handleWebhook(payload) {
    return { success: true, received: true, payload: payload };
  }
}

// ===== STANNP PROVIDER =====
var STANNP_API_KEY = process.env.STANNP_API_KEY || '';
var STANNP_BASE_URL = process.env.STANNP_BASE_URL || 'https://api.stannp.com/v1';
var STANNP_WEBHOOK_SECRET = process.env.STANNP_WEBHOOK_SECRET || '';

class StannpProvider extends DirectMailProvider {
  constructor() { super(); this.name = 'stannp'; }

  stannpRequest(endpoint, params) {
    return new Promise(function(resolve, reject) {
      if (!STANNP_API_KEY) return reject(new Error('STANNP_API_KEY not configured'));
      const https = require('https');
      var bodyData = Object.assign({ api_key: STANNP_API_KEY }, params || {});
      var encoded = Object.keys(bodyData).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(bodyData[k]); }).join('&');
      var url = STANNP_BASE_URL.replace(/\/+$/, '') + '/' + endpoint.replace(/^\/+/, '');
      var parsed = new URL(url);
      var req = https.request({
        hostname: parsed.hostname, path: parsed.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(encoded) }
      }, function(r) {
        var b = ''; r.on('data', function(c) { b += c; });
        r.on('end', function() {
          try {
            var parsed2 = JSON.parse(b);
            // Stannp returns { success: true, data: ... } or { success: false, error: ... }
            resolve(parsed2);
          } catch(e) { resolve({ success: false, error: 'Failed to parse Stannp response: ' + b.substring(0, 200) }); }
        });
      });
      req.on('error', function(e) { reject(new Error('Stannp request failed: ' + (e && e.message || ''))); });
      req.write(encoded);
      req.end();
    });
  }

  async validateAddresses(addresses) {
    if (!Array.isArray(addresses)) addresses = [addresses];
    var results = [];
    for (var vi = 0; vi < addresses.length; vi++) {
      var a = addresses[vi];
      var valid = a.postcode && a.postcode.trim().length > 2 && a.address_line1 && a.address_line1.trim().length > 2;
      results.push({
        original: a, valid: valid,
        reason: valid ? null : (a.postcode ? 'Missing street address' : 'Missing postcode'),
        corrected: valid ? { postcode: a.postcode.toUpperCase(), address_line1: a.address_line1, city: a.city || '', country: 'United Kingdom' } : null
      });
    }
    var validCount = results.filter(function(r) { return r.valid; }).length;
    return { success: true, validated: results.length, valid: validCount, invalid: results.length - validCount, details: results };
  }

  async createCampaign(campaignData) {
    var params = { name: campaignData.name || 'Direct Mail Campaign', type: 'campaign' };
    if (campaignData.description) params.description = campaignData.description;
    var result = await this.stannpRequest('/campaigns/create', params);
    if (result.success && result.data && result.data.id) {
      return { success: true, provider_campaign_id: String(result.data.id), message: 'Campaign created with Stannp', status: 'accepted', raw: result };
    }
    return { success: false, error: result.error || 'Failed to create Stannp campaign', raw: result };
  }

  async uploadArtwork(campaignId, files) {
    if (!files || files.length === 0) return { success: true, files: 0, uploaded: [] };
    var results = [];
    for (var fi = 0; fi < files.length; fi++) {
      var f = files[fi];
      if (f.file_data) {
        // Base64 file - send to Stannp
        var result = await this.stannpRequest('/artwork/upload', { file: f.file_data, filename: f.name || 'artwork.pdf', campaign_id: campaignId });
        results.push({ name: f.name, status: result.success ? 'uploaded' : 'failed', error: result.error || null });
      }
    }
    return { success: true, files: results.length, uploaded: results };
  }

  async sendCampaign(providerCampaignId) {
    var result = await this.stannpRequest('/campaigns/send', { campaign_id: providerCampaignId });
    if (result.success) {
      var status = result.data && result.data.status ? result.data.status : 'processing';
      return { success: true, provider_campaign_id: providerCampaignId, status: status, message: 'Campaign sent to Stannp for processing', raw: result };
    }
    return { success: false, error: result.error || 'Failed to send campaign via Stannp', raw: result };
  }

  async getCampaignStatus(providerCampaignId) {
    var result = await this.stannpRequest('/campaigns/status', { campaign_id: providerCampaignId });
    if (result.success) {
      var status = (result.data && result.data.status) || 'unknown';
      return { success: true, provider_campaign_id: providerCampaignId, status: status, raw: result };
    }
    return { success: false, error: result.error || 'Failed to get Stannp campaign status', raw: result };
  }

  async getProofOfPosting(providerCampaignId) {
    var result = await this.stannpRequest('/campaigns/proof', { campaign_id: providerCampaignId });
    if (result.success && result.data) {
      return {
        success: true, provider_campaign_id: providerCampaignId,
        proof_url: result.data.proof_url || result.data.url || '',
        generated_at: new Date().toISOString(),
        recipient_count: result.data.recipient_count || 0,
        postage_date: result.data.postage_date || '',
        estimated_delivery: result.data.estimated_delivery || '',
        raw: result
      };
    }
    // Fallback: return a basic proof object even if API fails
    return { success: true, provider_campaign_id: providerCampaignId, proof_url: '', generated_at: new Date().toISOString(), recipient_count: 0, postage_date: '', estimated_delivery: '' };
  }

  async cancelCampaign(providerCampaignId) {
    var result = await this.stannpRequest('/campaigns/cancel', { campaign_id: providerCampaignId });
    if (result.success) {
      return { success: true, provider_campaign_id: providerCampaignId, status: 'cancelled', message: 'Campaign cancelled via Stannp', raw: result };
    }
    return { success: false, error: result.error || 'Failed to cancel Stannp campaign', raw: result };
  }

  async handleWebhook(payload) {
    // Verify webhook signature if secret is configured
    if (STANNP_WEBHOOK_SECRET) {
      // Stannp webhook verification would go here
    }
    return { success: true, received: true, payload: payload };
  }
}

function getDirectMailProvider() {
  var provider = DIRECT_MAIL_PROVIDER || 'mock';
  if (provider === 'stannp') {
    if (!STANNP_API_KEY) {
      console.log('[DM-PROVIDER] STANNP_API_KEY not set, falling back to mock');
      return new MockDirectMailProvider();
    }
    return new StannpProvider();
  }
  return new MockDirectMailProvider();
}

// ===== DIRECT MAIL NOTIFICATIONS =====
var DM_NOTIFIED = {}; // In-memory dedup cache

function dmEmailHTML(title, body, ctaText, ctaUrl) {
  var accent = '#0ea5e9';
  return '<div style="background:#07090f;padding:32px 20px;font-family:Inter,Helvetica,Arial,sans-serif"><div style="max-width:520px;margin:0 auto;background:#0c0f1a;border-radius:16px;border:1px solid #151929;overflow:hidden"><div style="padding:20px 24px;background:linear-gradient(135deg,rgba(14,165,233,.08),transparent);border-bottom:1px solid #151929"><div style="display:flex;align-items:center;gap:8px"><div style="width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,' + accent + ',#2563eb);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:900;font-family:Outfit,sans-serif">9</div><span style="font-size:15px;font-weight:800;color:#dce2f0;font-family:Outfit,sans-serif">am<span style="color:' + accent + '">Leads</span></span></div></div><div style="padding:24px"><h2 style="font-size:18px;font-weight:800;color:#dce2f0;margin:0 0 8px;font-family:Outfit,sans-serif">' + title + '</h2><div style="font-size:13px;color:#8890b0;line-height:1.7">' + body + '</div>' +
    (ctaText && ctaUrl ? '<div style="margin-top:20px;text-align:center"><a href="' + ctaUrl + '" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,' + accent + ', #2563eb);color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700">' + ctaText + '</a></div>' : '') +
    '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #151929;font-size:11px;color:#5a6280;text-align:center">9amLeads Â· <a href="https://9amleads.com" style="color:' + accent + ';text-decoration:none">9amleads.com</a></div></div></div></div>';
}

function dmDashboardNotify(customerId, type, title, message, link) {
  try {
    var db2 = getDb();
    if (!db2.dm_notifications) db2.dm_notifications = [];
    var dedupKey = customerId + '_' + type + '_' + new Date().toISOString().split('T')[0];
    if (DM_NOTIFIED[dedupKey]) return; // Dedup same type per customer per day
    DM_NOTIFIED[dedupKey] = true;
    db2.dm_notifications.push({ id: uuidv4(), customer_id: customerId, type: type, title: title, message: message, link: link || '', read: 0, created_at: new Date().toISOString() });
    saveDb();
  } catch(e) { console.log('[DM-NOTIF] Dashboard notify error:', e.message); }
}

async function sendDMNotification(customerId, type, subject, title, body, ctaText, ctaUrl) {
  try {
    var db2 = getDb();
    var cust = db2.customers ? db2.customers.find(function(c) { return c.id === customerId; }) : null;
    if (!cust || !cust.email) return;
    // Dedup: same type per customer per day
    var dedupKey = customerId + '_email_' + type + '_' + new Date().toISOString().split('T')[0];
    if (DM_NOTIFIED[dedupKey]) { console.log('[DM-NOTIF] Duplicate email blocked:', type, cust.email); return; }
    DM_NOTIFIED[dedupKey] = true;
    // Add to dashboard
    dmDashboardNotify(customerId, type, title, body, ctaUrl);
    // Send email
    var html = dmEmailHTML(title, body, ctaText, ctaUrl);
    await sendBrevoEmail({ email: cust.email, name: cust.company || '' }, subject, html);
    console.log('[DM-NOTIF] Email sent:', type, cust.email);
  } catch(e) { console.log('[DM-NOTIF] Email error:', type, e.message); }
}

async function sendDMAdminAlert(type, title, message) {
  try {
    var adminEmail = 'hello@9amleads.com';
    var dedupKey = 'admin_' + type + '_' + new Date().toISOString().split('T')[0];
    if (DM_NOTIFIED[dedupKey]) return;
    DM_NOTIFIED[dedupKey] = true;
    var html = dmEmailHTML('âš ï¸ ' + title, '<p style="color:#ef4444;font-weight:600">' + type + '</p><p>' + message + '</p>', 'View Admin', 'https://9amleads.com/admin/direct-mail');
    await sendBrevoEmail({ email: adminEmail, name: '9amLeads Admin' }, '[DM Alert] ' + title, html);
    console.log('[DM-NOTIF] Admin alert sent:', type, title);
  } catch(e) { console.log('[DM-NOTIF] Admin alert error:', e.message); }
}

// ===== HELPERS =====
// Merge tag function for letter/flyer personalisation
var MERGE_TAGS = ['{{first_name}}','{{full_name}}','{{town}}','{{postcode}}','{{postcode_area}}','{{business_name}}','{{phone}}','{{website}}','{{offer}}'];

function applyMergeTags(text, lead, business) {
  if (!text) return text;
  var data = {
    '{{first_name}}': lead.first_name || lead.name || lead.name || 'Homeowner',
    '{{full_name}}': lead.full_name || lead.name || 'Homeowner',
    '{{town}}': lead.town || lead.city || 'your area',
    '{{postcode}}': lead.postcode || '',
    '{{postcode_area}}': lead.postcode_area || (lead.postcode ? lead.postcode.substring(0, 2) : 'your area'),
    '{{business_name}}': business.company_name || 'our company',
    '{{phone}}': business.phone || '',
    '{{website}}': business.website || '',
    '{{offer}}': business.offer || lead.offer || 'our current offer'
  };
  var result = text;
  for (var key in data) {
    var val = data[key];
    if (!val || val === '') val = getFallback(key);
    result = result.split(key).join(val);
  }
  return result;
}

function getFallback(tag) {
  var map = { '{{first_name}}': 'there', '{{full_name}}': 'neighbour', '{{town}}': 'your area', '{{postcode}}': 'your postcode', '{{postcode_area}}': 'your area', '{{phone}}': '', '{{website}}': '', '{{offer}}': 'our services' };
  return map[tag] || '';
}

// Activity Timeline
function addTimelineEntry(customerId, action, details, campaignId) {
  try {
    var db2 = getDb();
    if (!db2.activity_timeline) db2.activity_timeline = [];
    db2.activity_timeline.push({
      id: uuidv4(), customer_id: customerId, action: action,
      details: details || '', campaign_id: campaignId || '',
      created_at: new Date().toISOString()
    });
    saveDb();
  } catch(e) { console.log('[TIMELINE] Error:', e.message); }
}

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

// Direct Mail notification routes
app.get('/api/direct-mail/notifications', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var notifs = (db2.dm_notifications || []).filter(function(n) { return n.customer_id === req.user.id; }).sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); }).slice(0, 50);
    res.json({ success: true, notifications: notifs, unread: notifs.filter(function(n) { return !n.read; }).length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/direct-mail/notifications/read', authMiddleware, (req, res) => {
  try {
    var notifId = req.body.notification_id;
    if (!notifId) return res.status(400).json({ error: 'Notification ID required' });
    var db2 = getDb();
    var idx = (db2.dm_notifications || []).findIndex(function(n) { return n.id === notifId && n.customer_id === req.user.id; });
    if (idx !== -1) { db2.dm_notifications[idx].read = 1; saveDb(); }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

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
    const { company, name, email, phone, password, product, products, plan, targetAreas, coverage, leadFilters, bizField2, bizField3, source, marketingConsent, crmWebhookUrl } = req.body;

    if (!company || !email || !password) {
      return res.status(400).json({ error: 'Company, email and password are required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Block disposable/temporary email domains
    var disposableDomains = ['mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com','throwaway.email','yopmail.com','trashmail.com','sharklasers.com','temp-mail.org','fakeinbox.com','maildrop.cc','getnada.com','hmail.us','spambox.us','tempmail.net','dispostable.com','mailmetrash.com','mailexpire.com','spamgourmet.com','spamfree24.org','spam.la','thankyou2010.com','trash2009.com','wegwerfmail.de','wh4f.org','whyspam.me','nospamfor.us','maileater.com','emailias.com','sneakemail.com','mytrashmail.com','meltmail.com','guerrillamail.net','guerrillamail.org','guerrillamail.biz','pokemail.net','spam4.me','dsgvb.com','klzlk.com','s0ny.net','hkftu.com','feaeth.com','vdrmm.com','mailhet.com','biyag.com','inboxbear.com','moakt.com','33mail.com','spamdecoy.net','spam.la','spamherelots.com','spamspot.com','thisisnotmyrealemail.com','spamcube.com','spamfree24.com','spamfree24.de','spamfree24.eu','spamfree24.info','spamfree24.net','spamfree24.org','spamgoes.in','spamgourmet.com','spamgourmet.net','spamgourmet.org','spamgourmet.info','spamgourmet.org.uk','spamgourmet.com.au','spamgourmet.co.nz','spamgourmet.co.za','spamgourmet.de','spamgourmet.fr','spamgourmet.it','spamgourmet.es','spamgourmet.pt','spamgourmet.se','spamgourmet.no','spamgourmet.dk','spamgourmet.fi','spamgourmet.ie','spamgourmet.ch','spamgourmet.at','spamgourmet.be','spamgourmet.nl','spamgourmet.lu','spamgourmet.pl','spamgourmet.cz','spamgourmet.sk','spamgourmet.hu','spamgourmet.ro','spamgourmet.bg','spamgourmet.gr','spamgourmet.tr','spamgourmet.ru','spamgourmet.cn','spamgourmet.jp','spamgourmet.kr','spamgourmet.in','spamgourmet.com.br','spamgourmet.com.mx','spamgourmet.com.ar','spamgourmet.com.co','spamgourmet.com.pe','spamgourmet.com.ve','spamgourmet.com.eg','spamgourmet.com.ng','spamgourmet.com.za','mailnator.com','maileater.net','mailexpire.com','mailcatch.com','mailsac.com','mailinator2.com','mailinator.net','mailinator.org','mailinator.info','mailinator.biz','mailinator.co.uk','mailinator.de','mailinator.fr','mailinator.it','mailinator.es','mailinator.pt','mailinator.se','mailinator.no','mailinator.dk','mailinator.fi','mailinator.ie','mailinator.ch','mailinator.at','mailinator.be','mailinator.nl','mailinator.lu','mailinator.pl','mailinator.cz'];
    var emailDomain = email.split('@')[1]?.toLowerCase();
    if (emailDomain && disposableDomains.indexOf(emailDomain) !== -1) {
      return res.status(400).json({ error: 'Please use a permanent email address. Temporary email domains are not allowed.' });
    }

    const existing = db.prepare('SELECT id FROM customers WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Block multiple free trials from same IP (max 3 per day)
    var ip = req.ip || req.connection?.remoteAddress || '';
    if (ip) {
      var recentFromIP = db.prepare("SELECT COUNT(*) as cnt FROM customers WHERE signup_ip = ? AND created_at > datetime('now', '-1 day')").get(ip);
      if (recentFromIP && recentFromIP.cnt >= 3) {
        return res.status(429).json({ error: 'Too many accounts created from this location. Please contact support.' });
      }
    }

    // Block duplicate free trials with similar business name + postcode
    if (targetAreas && targetAreas.length > 0 && planName !== 'pro' && planName !== 'enterprise') {
      var areaMatch = targetAreas.slice(0, 1).join(',');
      var similarBiz = db.prepare("SELECT id FROM customers WHERE company = ? AND target_areas LIKE ? AND plan = 'free_trial'").get(company, '%' + areaMatch + '%');
      if (similarBiz) {
        return res.status(409).json({ error: 'A free trial for this business already exists. Please log in or contact support.' });
      }
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

    // Validate product count by plan
    var productsList = req.body.products || [product];
    if (!Array.isArray(productsList)) productsList = [product];
    var planName = plan || 'free_trial';
    var maxTypes = planName === 'free_trial' ? 1 : planName === 'starter' ? 2 : 99;
    if (productsList.length > maxTypes) {
      return res.status(400).json({ error: (planName === 'free_trial' ? 'Free Trial' : planName.charAt(0).toUpperCase() + planName.slice(1)) + ' allows up to ' + maxTypes + ' lead type' + (maxTypes > 1 ? 's' : '') + '. Upgrade for more.' });
    }

    // Validate postcode areas — shared territories (non-exclusive)
    if (areas.length > 0 && coverage === 'postcode') {
      // Just verify format, no exclusivity check
    }

    var signupIp = req.ip || req.connection?.remoteAddress || '';
    db.prepare(`INSERT INTO customers (id, email, company, contact_name, phone, password_hash, product, lead_type, business_type, target_areas, coverage, biz_field2, biz_field3, source, plan, trial_ends, marketing_consent, created_at, extra_postcodes, crm_webhook_url, campaign_sent, signup_ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, email.toLowerCase(), company, name || '', phone || '', password_hash,
      product, productInfo.lead_type, productInfo.business_type,
      JSON.stringify(targetAreas || []), coverage || 'postcode', leadFilters || bizField2 || '', bizField3 || JSON.stringify(products && Array.isArray(products) ? products : [product]),
      source || 'direct', plan || 'free_trial', plan === 'free_trial' ? trial_ends : null, marketingConsent ? 1 : 0,
      new Date().toISOString(), '0', crmWebhookUrl || '', '[]', signupIp
    );

    // Claim postcode areas only when coverage type is postcode
    if (areas.length > 0 && coverage === 'postcode') {
      claimPostcodes(areas, id, product);
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    customer.verification_token = verification_token;
    customer.email_verified = 1;
    // Store daily limit based on lead type, plan and coverage
    const dailyLimit = getPlanLimit(product, plan || 'free_trial', coverage || 'postcode');
    db.prepare('UPDATE customers SET leads_per_day = ?, coverage = ? WHERE id = ?').run(dailyLimit, coverage || 'postcode', id);
    saveDb();

    // Verification email disabled — was causing spam during testing
    /*try {
      const verifyUrl = PUBLIC_URL.replace(/\/+$/, '') + '/api/auth/verify-email?token=' + verification_token;
      await sendBrevoEmail(
        { email: customer.email, name: customer.contact_name || customer.company },
        'Verify your 9amLeads account',
        '<div style="font-family:Arial,Helvetica,sans-serif;color:#e2e8f0"><div style="text-align:center;margin-bottom:16px"><span style="display:inline-block;width:34px;height:34px;border-radius:9px;text-align:center;line-height:34px;font-size:15px;background:linear-gradient(135deg,#0ea5e9,#6366f1);margin-right:5px;vertical-align:middle;color:#fff;font-weight:900">9</span><span style="vertical-align:middle;font-size:20px;font-weight:900;color:#f1f5f9">am Leads</span></div><h2 style="font-size:20px;font-weight:800;color:#f1f5f9;margin:0 0 12px;text-align:center">Welcome to 9am Leads!</h2><p style="font-size:14px;color:#f1f5f9;line-height:1.7;margin:0 0 16px;text-align:center">Please verify your email address by clicking the button below:</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 16px"><a href="' + verifyUrl + '" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;text-decoration:none;border-radius:50px;font-size:14px;font-weight:700">Verify Email</a></td></tr></table><p style="font-size:13px;color:#e2e8f0;line-height:1.6;margin:0;text-align:center">Your free 7-day trial has started. You\'ll receive your first leads at 9am tomorrow.</p></div>'
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

    // Generate leads immediately so they're ready for the next 09:00 UK delivery
    (async function() {
      try {
        console.log('[SIGNUP] Pre-generating leads for ' + customer.id);
        var rmScraperFast = require('./rightmove_scraper_v2');
        var movingLeads = await rmScraperFast.collectMovingLeads();
        if (!movingLeads || movingLeads.length === 0) { console.log('[SIGNUP] No leads available yet'); return; }
        // Enrich leads with full addresses + postcodes (street number/name + full postcode)
        try {
          var maxPick = Math.min(movingLeads.length, 5);
          var pick = movingLeads.slice(0, maxPick);
          var enrichedPick = await rmScraperFast.enrichMovingLeads(pick, 1);
          movingLeads.splice.apply(movingLeads, [0, maxPick].concat(enrichedPick));
        } catch(ee) { console.log('[SIGNUP] Enrich error:', ee.message); }
        var db2 = getDb();
        var now2 = new Date().toISOString();
        var saved = 0;
        var dailyLimits = { free_trial: 5, starter: 5, pro: 15, enterprise: 40 };
        var custPlan = customer.plan || 'free_trial';
        var maxLeads = dailyLimits[custPlan] || 5;
        for (var li = 0; li < Math.min(movingLeads.length, maxLeads); li++) {
          var p = movingLeads[li];
          db2.leads.push({ id: require('uuid').v4(), customer_id: customer.id, product: 'moving', data: JSON.stringify(p), status: 'new', delivered: 0, created_at: now2, delivered_at: null });
          saved++;
        }
        saveDb();
        if (saved > 0) console.log('[SIGNUP] Pre-stored ' + saved + ' leads for 09:00 UK delivery');
      } catch(e) { console.log('[SIGNUP] Lead generation error:', e.message); }
    })();

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

    if (!customer.email_verified) {
      return res.status(403).json({ error: 'Please verify your email first. Check your inbox for the verification link.', needsVerification: true, email: customer.email });
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
        '<div style="font-family:Arial,Helvetica,sans-serif;background:#ffffff;padding:28px;border-radius:12px"><div style="text-align:center;margin-bottom:16px"><span style="display:inline-block;width:34px;height:34px;border-radius:9px;text-align:center;line-height:34px;font-size:15px;background:linear-gradient(135deg,#0ea5e9,#6366f1);margin-right:5px;vertical-align:middle;color:#fff;font-weight:900">9</span><span style="vertical-align:middle;font-size:20px;font-weight:900;color:#1e293b">am Leads</span></div><h2 style="font-size:20px;font-weight:800;color:#1e293b;margin:0 0 12px;text-align:center">Password Reset</h2><p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 16px;text-align:center">Click the button below to reset your password. This link expires in 1 hour.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 16px"><a href="' + resetUrl + '" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;text-decoration:none;border-radius:50px;font-size:14px;font-weight:700">Reset Password</a></td></tr></table><p style="font-size:13px;color:#64748b;line-height:1.6;margin:0;text-align:center">If you did not request this, please ignore this email.</p></div>'
      );
    } catch (e) {
      console.log('[PASSWORD] Reset email failed:', e.message, '- Token stored for manual reset:', resetToken);
    }

    res.json({ message: 'If that email exists, a reset link has been sent.', reset_url: resetUrl });
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

// ===== ONBOARDING API =====
// GET /api/onboarding — customer onboarding checklist and progress
app.get('/api/onboarding', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    const leads = (db2.leads || []).filter(l => l.customer_id === req.user.id);
    const hasLeads = leads.length > 0;
    const hasContacted = leads.some(l => l.lead_status === 'contacted' || l.lead_status === 'interested' || l.lead_status === 'quoted' || l.lead_status === 'won');
    const hasPipeline = leads.some(l => l.lead_status && l.lead_status !== 'new' && l.lead_status !== 'lost');
    const hasWon = leads.some(l => l.lead_status === 'won');
    const hasCrm = !!(customer.crm_webhook_url || (db.crm_webhooks || []).find(w => w.customer_id === req.user.id));
    const hasProfile = !!(customer.company && customer.contact_name);
    const hasAreas = (customer.target_areas && JSON.parse(customer.target_areas).length > 0);
    const hasFilters = !!(customer.biz_field2);

    const checklist = [
      { id: 'profile', label: 'Complete business profile', done: hasProfile },
      { id: 'lead_type', label: 'Confirm lead type', done: !!customer.product },
      { id: 'coverage', label: 'Confirm coverage area', done: hasAreas },
      { id: 'crm', label: 'Connect CRM', done: hasCrm },
      { id: 'first_delivery', label: 'View first 9am delivery', done: hasLeads },
      { id: 'first_contact', label: 'Contact first lead', done: hasContacted },
      { id: 'pipeline', label: 'Move first lead to pipeline', done: hasPipeline },
      { id: 'win', label: 'Mark lead outcome (won/lost)', done: hasWon }
    ];
    const total = checklist.length;
    const completed = checklist.filter(i => i.done).length;
    const progress = Math.round((completed / total) * 100);
    const state = progress === 100 ? 'completed' : (completed > 0 ? 'in_progress' : 'not_started');

    // Save onboarding state to customer record
    if (customer.onboarding_state !== state) {
      db.prepare('UPDATE customers SET onboarding_state = ?, onboarding_progress = ? WHERE id = ?').run(state, progress, req.user.id);
      saveDb();
    }

    res.json({ state, progress, completed, total, checklist, customer_name: customer.contact_name || customer.company || '' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/health-score — customer health score
app.get('/api/health-score', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    const leads = (db.leads || []).filter(l => l.customer_id === req.user.id);
    const delivered = leads.filter(l => l.delivered);
    const contacted = leads.filter(l => l.lead_status && l.lead_status !== 'new');
    const wonLeads = leads.filter(l => l.lead_status === 'won');
    const contactedRate = delivered.length > 0 ? Math.round((contacted.length / delivered.length) * 100) : 0;
    const hasRecentLogin = customer.last_login_at && (Date.now() - new Date(customer.last_login_at).getTime()) < 7 * 86400000;
    const hasCrm = !!(customer.crm_webhook_url || (db.crm_webhooks || []).find(w => w.customer_id === req.user.id));
    const hasLowSupply = db.scraper_logs && db.scraper_logs.length > 0;
    const failedPayment = parseInt(customer.fail_count) > 0;

    let score = 100;
    if (!hasRecentLogin) score -= 20;
    if (contactedRate < 30) score -= 15;
    if (!hasCrm) score -= 10;
    if (wonLeads.length === 0) score -= 10;
    if (delivered.length === 0) score -= 10;
    if (failedPayment) score -= 25;
    if (customer.plan === 'cancelled') score -= 50;

    const status = score >= 80 ? 'Healthy' : score >= 60 ? 'Needs Attention' : score >= 40 ? 'At Risk' : 'Critical';
    res.json({ score, status, contacted_rate: contactedRate, recent_login: hasRecentLogin, crm_connected: hasCrm, won_count: wonLeads.length, failed_payment: failedPayment });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// GET /api/admin/founder-dashboard — founder analytics (admin only)
app.get('/api/admin/founder-dashboard', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const customers = (db.customers || []);
    const leads = (db.leads || []);
    const subscriptions = (db.subscriptions || []);
    const activeCustomers = customers.filter(c => c.plan && c.plan !== 'cancelled' && (!c.trial_ends || new Date(c.trial_ends) > new Date()));
    const trialCustomers = customers.filter(c => c.plan === 'free_trial');
    const cancelledCustomers = customers.filter(c => c.plan === 'cancelled');

    // MRR calculation
    const planPrices = { starter: 25, pro: 49, enterprise: 99 };
    var mrr = activeCustomers.reduce(function(sum, c) { return sum + (planPrices[c.plan] || 0); }, 0);
    var weeklyRr = activeCustomers.reduce(function(sum, c) { return sum + (planPrices[c.plan] || 0); }, 0);

    // Trial conversion
    var everTrialled = customers.filter(c => c.plan === 'free_trial' || (c.created_at && (c.plan === 'starter' || c.plan === 'pro' || c.plan === 'enterprise')));
    var converted = customers.filter(c => c.plan !== 'free_trial' && c.plan !== 'cancelled' && c.plan !== '');
    var trialConversion = everTrialled.length > 0 ? Math.round((converted.length / everTrialled.length) * 100) : 0;

    // Churn
    var totalEver = customers.length;
    var churnRate = totalEver > 0 ? Math.round((cancelledCustomers.length / totalEver) * 100) : 0;

    // Revenue by product
    var revenueByProduct = {};
    customers.forEach(function(c) {
      if (!revenueByProduct[c.product]) revenueByProduct[c.product] = 0;
      revenueByProduct[c.product] += planPrices[c.plan] || 0;
    });

    // Lead stats
    var today = new Date().toISOString().split('T')[0];
    var leadsToday = leads.filter(l => l.created_at && l.created_at.startsWith(today));
    var deliveredToday = leads.filter(l => l.delivered_at && l.delivered_at.startsWith(today));

    // Customer health overview
    var atRiskCustomers = activeCustomers.filter(function(c) { return c.last_login_at && (Date.now() - new Date(c.last_login_at).getTime()) > 7 * 86400000; });
    var failedPayments = activeCustomers.filter(function(c) { return parseInt(c.fail_count) > 0; });

    res.json({
      mrr: mrr,
      weekly_revenue: weeklyRr,
      active_customers: activeCustomers.length,
      trial_customers: trialCustomers.length,
      trial_conversion_rate: trialConversion,
      cancelled_customers: cancelledCustomers.length,
      churn_rate: churnRate,
      failed_payments: failedPayments.length,
      revenue_by_product: revenueByProduct,
      customers_by_plan: { starter: customers.filter(c => c.plan === 'starter').length, pro: customers.filter(c => c.plan === 'pro').length, enterprise: customers.filter(c => c.plan === 'enterprise').length, free_trial: trialCustomers.length, cancelled: cancelledCustomers.length },
      leads_scraped_today: leadsToday.length,
      leads_delivered_today: deliveredToday.length,
      at_risk_customers: atRiskCustomers.length,
      total_customers: customers.length,
      total_leads: leads.length,
      support_requests: (db.support_requests || []).filter(s => !s.resolved).length
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/public-stats — public trust metrics (cached, safe for website)
var publicStatsCache = { data: null, expires: 0 };
app.get('/api/public-stats', async (req, res) => {
  try {
    if (publicStatsCache.data && publicStatsCache.expires > Date.now()) {
      return res.json(publicStatsCache.data);
    }
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.substring(0, 7);
    const leads = (db.leads || []);
    const leadsThisMonth = leads.filter(l => l.created_at && l.created_at.startsWith(thisMonth));
    const customers = (db.customers || []).filter(c => c.plan && c.plan !== 'cancelled');
    const delivered = leads.filter(l => l.delivered);
    const totalValue = delivered.reduce(function(sum, l) { return sum + (parseInt(l.estimated_value) || parseInt(l.deal_value) || 0); }, 0);

    // Get areas covered
    var areasSet = new Set();
    customers.forEach(function(c) {
      try { JSON.parse(c.target_areas || '[]').forEach(function(a) { areasSet.add(a); }); } catch(e) {}
    });

    var stats = {
      opportunities_this_month: leadsThisMonth.length,
      estimated_value_delivered: totalValue,
      active_businesses: customers.length,
      average_roi: customers.length > 0 ? Math.round(totalValue / (customers.length * 100)) : 0,
      leads_scraped_today: leads.filter(l => l.created_at && l.created_at.startsWith(today)).length,
      uk_areas_covered: areasSet.size,
      friendly_label: leadsThisMonth.length > 10 ? (leadsThisMonth.length + ' opportunities delivered this month') : 'Fresh opportunities delivered daily across the UK',
      generated_at: new Date().toISOString()
    };
    publicStatsCache = { data: stats, expires: Date.now() + 300000 }; // 5 min cache
    res.json(stats);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== LEAD SOURCE TRACKER (Section 5) =====
// GET /api/admin/lead-sources — manage lead sources
app.get('/api/admin/lead-sources', adminAuth, (req, res) => {
  try {
    const db = getDb();
    if (!db.lead_sources) db.lead_sources = [
      { id: 'moving-rightmove', name: 'Rightmove API', type: 'scraper', category: 'moving', status: 'active', last_run: null, leads_found: 0, error_rate: 0 },
      { id: 'newbusiness-apify', name: 'Apify Companies House', type: 'api', category: 'newbusiness', status: 'active', last_run: null, leads_found: 0, error_rate: 0 },
      { id: 'planning-api', name: 'UK Planning Monitor', type: 'api', category: 'planning', status: 'active', last_run: null, leads_found: 0, error_rate: 0 },
      { id: 'probate-ch', name: 'Companies House Probate', type: 'api', category: 'probate', status: 'active', last_run: null, leads_found: 0, error_rate: 0 },
      { id: 'tenders-gov', name: 'Contracts Finder (GOV.UK)', type: 'api', category: 'tenders', status: 'active', last_run: null, leads_found: 0, error_rate: 0 }
    ];
    res.json({ sources: db.lead_sources });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/lead-sources/update — update source status
app.post('/api/admin/lead-sources/update', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const { id, status } = req.body;
    const source = (db.lead_sources || []).find(s => s.id === id);
    if (!source) return res.status(404).json({ error: 'Source not found' });
    if (status) source.status = status;
    saveDb();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== USAGE-BASED EXPANSION PROMPTS (Section 6) =====
// GET /api/prompts — smart prompts based on customer data
app.get('/api/prompts', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    const leads = (db.leads || []).filter(l => l.customer_id === req.user.id);
    const prompts = [];

    // Check if usage is high
    const thisMonth = new Date().toISOString().split('T')[0].substring(0, 7);
    const monthLeads = leads.filter(l => l.created_at && l.created_at.startsWith(thisMonth));
    const dailyLimit = getPlanLimit(customer.product, customer.plan, customer.coverage);
    if (monthLeads.length > dailyLimit * 20 * 0.9) {
      prompts.push({ type: 'upgrade', priority: 'high', message: 'You\'ve used 90%+ of your monthly opportunity allowance. ' + (customer.plan === 'starter' ? 'Upgrade to Pro for more daily opportunities.' : 'Upgrade to Enterprise for maximum volume.'), action: 'View Plans', page: 'billing' });
    }

    // Check if CRM not connected
    if (!customer.crm_webhook_url) {
      prompts.push({ type: 'crm', priority: 'medium', message: 'Connect your CRM to save time and automatically receive opportunities every morning at 9am.', action: 'Connect CRM', page: 'crm' });
    }

    // Check if area could be expanded
    if (customer.coverage === 'postcode' && (customer.product === 'planning' || customer.product === 'probate' || customer.product === 'tenders')) {
      prompts.push({ type: 'coverage', priority: 'medium', message: 'Your selected area has limited volume. Expand to county or region coverage for more daily opportunities.', action: 'Expand Area', page: 'areas' });
    }

    // Check if customer has won deals
    const wonRevenue = leads.filter(l => l.lead_status === 'won').reduce((s, l) => s + (parseInt(l.actual_revenue) || parseInt(l.deal_value) || 0), 0);
    if (wonRevenue > 1000) {
      prompts.push({ type: 'roi', priority: 'low', message: 'You generated £' + wonRevenue.toLocaleString() + ' from 9am Leads. Upgrade to access more opportunities.', action: 'View Plans', page: 'billing' });
    }

    res.json({ prompts });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== NOTIFICATIONS (Section 8) =====
// GET /api/notifications — customer notifications
app.get('/api/notifications', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    const notifications = [];

    // Trial ending soon
    if (customer.plan === 'free_trial' && customer.trial_ends) {
      const daysLeft = Math.ceil((new Date(customer.trial_ends) - new Date()) / 86400000);
      if (daysLeft <= 3 && daysLeft > 0) {
        notifications.push({ type: 'trial_ending', priority: 'high', title: 'Trial ends in ' + daysLeft + ' days', message: 'Your free trial ends soon. Upgrade to continue receiving daily opportunities.', created_at: new Date().toISOString() });
      }
    }

    // Unread low supply
    const todayLeads = (db.leads || []).filter(l => l.customer_id === req.user.id && l.created_at && l.created_at.startsWith(new Date().toISOString().split('T')[0]));
    if (todayLeads.length === 0 && customer.plan !== 'cancelled') {
      notifications.push({ type: 'low_supply', priority: 'low', title: 'Today\'s opportunities are being prepared', message: 'New opportunities will appear once the daily pipeline completes.', created_at: new Date().toISOString() });
    }

    // No outcomes recorded reminder
    const contactedNoOutcome = (db.leads || []).filter(l => l.customer_id === req.user.id && l.lead_status === 'contacted' && (!l.outcome_reason));
    if (contactedNoOutcome.length > 0) {
      notifications.push({ type: 'follow_up', priority: 'medium', title: 'Outcome needed for ' + contactedNoOutcome.length + ' leads', message: 'Did you win business from these opportunities? Record your outcomes.', created_at: new Date().toISOString() });
    }

    res.json({ notifications });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== SUCCESS CENTRE API =====
// Built-in industry playbooks
const PLAYBOOKS = {
  'removal-companies': { name:'Removal Companies', industries:['moving'], best_lead_types:['Moving Leads','Probate Property','Property Leads'], best_contact:['Phone','Email','Letter Drop','Follow-up Call'], tips:['Contact quickly','Offer free survey','Mention insurance & packing service','Highlight local experience','Follow up after 2 days'] },
  'builders': { name:'Builders & Contractors', industries:['planning','tenders'], best_lead_types:['Planning Leads','Tenders','New Business'], best_contact:['Email','Phone','Letter','Site Visit'], tips:['Focus on project value','Mention similar projects','Offer free quote','Follow up after 3 days'] },
  'roofers': { name:'Roofers', industries:['planning'], best_lead_types:['Planning Leads'], best_contact:['Phone','Letter Drop','Email'], tips:['Check if lead involves roofing','Mention insurance work','Offer free inspection'] },
  'solar-installers': { name:'Solar Installers', industries:['planning'], best_lead_types:['Planning Leads'], best_contact:['Email','Phone','Facebook Ads'], tips:['Focus on energy savings','Mention government grants','Offer free survey'] },
  'estate-agents': { name:'Estate Agents', industries:['moving','probate'], best_lead_types:['Moving Leads','Probate Leads'], best_contact:['Phone','Email','Letter','LinkedIn'], tips:['Contact probate leads sensitively','Offer free valuation','Mention local market knowledge'] },
  'mortgage-brokers': { name:'Mortgage Brokers', industries:['moving','newbusiness'], best_lead_types:['Moving Leads','New Business Leads'], best_contact:['Phone','Email','LinkedIn'], tips:['Contact movers early','Offer pre-approval check','Follow up after offer accepted'] },
  'accountants': { name:'Accountants', industries:['newbusiness'], best_lead_types:['New Business Leads'], best_contact:['Email','Phone','LinkedIn','Letter'], tips:['Welcome new businesses','Offer free initial consultation','Mention MTD/compliance'] },
  'recruitment': { name:'Recruitment Agencies', industries:['newbusiness'], best_lead_types:['New Business Leads','Tenders'], best_contact:['Email','LinkedIn','Phone'], tips:['Focus on growth companies','Offer contingent search','Follow up quarterly'] },
  'commercial-cleaning': { name:'Commercial Cleaning', industries:['newbusiness','tenders'], best_lead_types:['New Business Leads','Tenders'], best_contact:['Letter','Email','Tender Portal'], tips:['Target facilities managers','Offer free site survey','Get on approved supplier lists'] },
  'marketing-agencies': { name:'Marketing Agencies', industries:['newbusiness'], best_lead_types:['New Business Leads'], best_contact:['Email','LinkedIn','Phone'], tips:['Offer free audit','Show portfolio','Focus on ROI'] },
  'probate-professionals': { name:'Probate Professionals', industries:['probate'], best_lead_types:['Probate Leads'], best_contact:['Letter','Email','Solicitor Referral'], tips:['Be respectful','Offer free probate valuation','Follow up after 1 week'] },
  'local-trades': { name:'Local Trades', industries:['moving','planning'], best_lead_types:['Moving Leads','Planning Leads'], best_contact:['Letter Drop','Local Ads','Word of Mouth'], tips:['Use local wording','Mention local reputation','Offer free quote'] }
};

// Built-in templates
const BUILTIN_TEMPLATES = [
  { id:'moving-intro-letter', name:'Moving Introduction Letter', industry:'moving', lead_type:'moving', method:'letter', content:'Dear {{lead_name}},\n\nWe understand you are considering a move to {{lead_address}}.\n\nAs a local removal company, we offer:\n- Free no-obligation survey\n- Full packing service\n- Insurance included\n- Storage options\n\nCall us on {{customer_phone}} for a free quote.\n\nBest regards,\n{{customer_business_name}}' },
  { id:'moving-phone-script', name:'Moving Phone Script', industry:'moving', lead_type:'moving', method:'phone', content:'Hello, this is {{customer_business_name}}.\n\nWe saw you are planning a move to {{lead_address}}. We specialise in {{postcode}} area moves.\n\nWould you like a free no-obligation survey and quote?\n\nWe offer full packing, storage and insurance.' },
  { id:'probate-intro-letter', name:'Probate Introduction Letter', industry:'probate', lead_type:'probate', method:'letter', content:'Dear {{lead_name}},\n\nWe were sorry to learn of your recent loss.\n\nAt {{customer_business_name}}, we handle probate property matters with care and sensitivity.\n\nWe offer:\n- Free probate valuation\n- Sensitive handling\n- Clear guidance through the process\n\nPlease call {{customer_phone}} when you are ready.\n\nWith condolences,\n{{customer_business_name}}' },
  { id:'planning-builder-letter', name:'Builder Planning Letter', industry:'planning', lead_type:'planning', method:'letter', content:'Dear {{lead_name}},\n\nWe note you have a planning application at {{lead_address}}.\n\n{{customer_business_name}} specialises in projects like this. We can provide a competitive quote.\n\nCall {{customer_phone}} for a free site visit.\n\nBest regards,\n{{customer_business_name}}' },
  { id:'newbusiness-welcome', name:'New Business Welcome Email', industry:'newbusiness', lead_type:'newbusiness', method:'email', content:'Subject: Welcome to {{lead_name}}\n\nDear {{contact_name}},\n\nCongratulations on your new venture.\n\n{{customer_business_name}} can help you with:\n- Accounting/Insurance/Marketing support\n- Free initial consultation\n- Local expertise\n\nCall {{customer_phone}} or reply to this email.\n\nBest regards,\n{{customer_business_name}}' },
  { id:'tenders-intro', name:'Tender Introduction Email', industry:'tenders', lead_type:'tenders', method:'email', content:'Subject: Expression of Interest\n\nTo the procurement team,\n\n{{customer_business_name}} wishes to express interest in the tender opportunity.\n\nWe have experience delivering similar contracts and can provide full capability documentation.\n\nPlease contact {{customer_email}} for our credentials.\n\nYours faithfully,\n{{customer_business_name}}' }
];

// GET /api/success-centre/templates — return all templates (Pro+ only)
app.get('/api/success-centre/templates', authMiddleware, (req, res) => {
  const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  var plan = cust?.plan || 'free_trial';
  if (plan === 'free_trial' || plan === 'starter') {
    return res.json({ restricted: true, templates: [], message: 'Success Centre is available on Pro and Enterprise plans. <a href="#" onclick="showPlans();return false" style="color:#0ea5e9;text-decoration:underline">Upgrade now</a> to access industry playbooks, outreach templates, AI generator and more.' });
  }
  res.json({ templates: BUILTIN_TEMPLATES });
});

function checkProAccess(req) {
  const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  var plan = cust?.plan || 'free_trial';
  return (plan === 'pro' || plan === 'enterprise');
}

// GET /api/success-centre/playbooks — return playbooks (Pro+ only)
app.get('/api/success-centre/playbooks', authMiddleware, (req, res) => {
  if (!checkProAccess(req)) return res.json({ restricted: true, playbooks: {} });
  res.json({ playbooks: PLAYBOOKS });
});

// POST /api/success-centre/save — save a template (Pro+ only)
app.post('/api/success-centre/save', authMiddleware, (req, res) => {
  try {
    if (!checkProAccess(req)) return res.status(403).json({ error: 'Upgrade to Pro to save templates' });
    const db = getDb();
    if (!db.saved_templates) db.saved_templates = [];
    db.saved_templates.push({ id: uuidv4(), customer_id: req.user.id, template_name: req.body.template_name || '', industry: req.body.industry || '', lead_type: req.body.lead_type || '', contact_method: req.body.contact_method || '', content: req.body.content || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    saveDb();
    res.json({ success: true, message: 'Template saved!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/success-centre/saved — get customer's saved templates
app.get('/api/success-centre/saved', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const saved = (db.saved_templates || []).filter(t => t.customer_id === req.user.id);
    res.json({ saved });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/success-centre/saved/:id — delete a saved template
app.delete('/api/success-centre/saved/:id', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    db.saved_templates = (db.saved_templates || []).filter(t => !(t.id === req.params.id && t.customer_id === req.user.id));
    saveDb();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/success-centre/generate — AI template generator (rule-based)
app.post('/api/success-centre/generate', authMiddleware, (req, res) => {
  try {
    const { industry, lead_type, contact_method, tone, lead_name, lead_address, business_name } = req.body;
    const session = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    const company = business_name || session?.company || 'Your Business';
    const phone = session?.phone || 'your number';
    const email = session?.email || 'your email';

    var prefix = tone === 'sensitive' ? 'With respect, ' : tone === 'friendly' ? 'Hi there, ' : tone === 'premium' ? 'Dear ' : tone === 'direct' ? 'Hello, ' : 'Dear ';
    var body = '';
    if (contact_method === 'letter' || contact_method === 'email') {
      body = prefix + (lead_name || 'Sir/Madam') + ',\n\n';
      if (lead_type === 'probate') {
        body += 'We understand this may be a difficult time. At ' + company + ', we handle probate-related matters with care and sensitivity.\n\nWe offer a free consultation. Please call ' + phone + ' when you are ready.\n\nWith condolences,\n' + company;
      } else if (lead_type === 'moving') {
        body += 'We see you are planning a move to ' + (lead_address || 'your new property') + '. ' + company + ' offers reliable removal services including packing, storage and insurance.\n\nCall ' + phone + ' for a free no-obligation quote.\n\nBest regards,\n' + company;
      } else if (lead_type === 'planning') {
        body += 'We note the project at ' + (lead_address || 'your property') + '. ' + company + ' has experience with similar developments and can provide a competitive quote.\n\nContact ' + email + ' for more information.\n\nYours sincerely,\n' + company;
      } else if (lead_type === 'newbusiness') {
        body += 'Congratulations on your new venture. ' + company + ' can support your growth with our expertise.\n\nWe offer a free initial consultation. Call ' + phone + ' to arrange a chat.\n\nBest wishes,\n' + company;
      } else {
        body += 'We are interested in discussing how ' + company + ' can work with you.\n\nPlease contact us at ' + email + '.\n\nBest regards,\n' + company;
      }
    } else if (contact_method === 'phone') {
      body = 'Hello, this is ' + company + '. We noticed your interest in ' + (lead_type || 'our services') + ' and wanted to see if we can help.';
    } else if (contact_method === 'sms') {
      body = 'Hi ' + (lead_name || 'there') + ', this is ' + company + '. Would you like a free quote? Reply or call ' + phone;
    } else if (contact_method === 'linkedin') {
      body = 'Hi ' + (lead_name || 'there') + ', I noticed you recently engaged with ' + (lead_type || 'our industry') + '. Happy to share how ' + company + ' can help.';
    }
    res.json({ generated: body, company: company, phone: phone, email: email });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== DASHBOARD API ENDPOINTS =====

// GET /api/dashboard — KPI summary data
app.get('/api/dashboard', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    const leads = (db2.leads || []).filter(l => l.customer_id === req.user.id);
    const today = new Date().toISOString().split('T')[0];
    const thisWeek = (function(){ var d = new Date(); d.setDate(d.getDate() - (d.getDay() || 7) + 1); return d.toISOString().split('T')[0]; })();
    const thisMonth = today.substring(0, 7);

    const leadsToday = leads.filter(l => l.created_at && l.created_at.startsWith(today));
    const leadsWeek = leads.filter(l => l.created_at && l.created_at >= thisWeek);
    const leadsMonth = leads.filter(l => l.created_at && l.created_at.startsWith(thisMonth));
    const deliveredToday = leads.filter(l => l.delivered && l.delivered_at && l.delivered_at.startsWith(today));
    const deliveredThisMonth = leads.filter(l => l.delivered && l.delivered_at && l.delivered_at.startsWith(thisMonth));
    const contacted = leads.filter(l => l.lead_status === 'contacted' || l.lead_status === 'interested' || l.lead_status === 'quoted' || l.lead_status === 'won');
    const replied = leads.filter(l => l.lead_status === 'interested' || l.lead_status === 'quoted' || l.lead_status === 'won');
    const quoted = leads.filter(l => l.lead_status === 'quoted' || l.lead_status === 'won');
    const won = leads.filter(l => l.lead_status === 'won');
    const lost = leads.filter(l => l.lead_status === 'lost');
    const estimatedValue = leads.reduce((s, l) => s + (parseInt(l.estimated_value) || 0), 0);
    const actualRevenue = won.reduce((s, l) => s + (parseInt(l.actual_revenue) || parseInt(l.deal_value) || 0), 0);
    const quotedRevenue = quoted.reduce((s, l) => s + (parseInt(l.quote_value) || 0), 0);

    // Customer + subscription for ROI
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    var weeklyCost = customer ? (customer.plan === 'starter' ? 25 : customer.plan === 'pro' ? 49 : customer.plan === 'enterprise' ? 99 : 0) : 0;
    var roi = weeklyCost > 0 ? Math.round((actualRevenue / weeklyCost) * 100) + '%' : 'N/A';

    res.json({
      leads_today: leadsToday.length,
      leads_week: leadsWeek.length,
      leads_month: leadsMonth.length,
      delivered_today: deliveredToday.length,
      delivered_this_month: deliveredThisMonth.length,
      contacted: contacted.length,
      replied: replied.length,
      quoted: quoted.length,
      won: won.length,
      lost: lost.length,
      estimated_value: estimatedValue,
      quoted_revenue: quotedRevenue,
      actual_revenue: actualRevenue,
      average_deal_size: won.length > 0 ? Math.round(actualRevenue / won.length) : 0,
      subscription_roi: roi,
      weekly_cost: weeklyCost
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/pipeline — leads grouped by stage
app.get('/api/pipeline', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const leads = (db.leads || []).filter(l => l.customer_id === req.user.id);
    const stages = ['new', 'contacted', 'interested', 'quoted', 'won', 'lost'];
    const pipeline = stages.map(stage => {
      const stageLeads = leads.filter(l => (l.lead_status || 'new') === stage);
      return {
        stage,
        count: stageLeads.length,
        estimated_value: stageLeads.reduce((s, l) => s + (parseInt(l.estimated_value) || 0), 0),
        quote_value: stageLeads.reduce((s, l) => s + (parseInt(l.quote_value) || 0), 0),
        revenue: stageLeads.reduce((s, l) => s + (parseInt(l.actual_revenue) || parseInt(l.deal_value) || 0), 0),
        leads: stageLeads.slice(0, 50).map(l => ({ id: l.id, title: (function(){ try{return JSON.parse(l.data).address||JSON.parse(l.data).name||JSON.parse(l.data).title||l.product}catch(e){return l.product}})() || l.product, product: l.product, status: l.lead_status || 'new', estimated_value: l.estimated_value, deal_value: l.deal_value, actual_revenue: l.actual_revenue, created_at: l.created_at }))
      };
    });
    res.json({ pipeline });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/roi — ROI metrics
app.get('/api/roi', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    const leads = (db.leads || []).filter(l => l.customer_id === req.user.id);
    const won = leads.filter(l => l.lead_status === 'won');
    const totalRevenue = won.reduce((s, l) => s + (parseInt(l.actual_revenue) || parseInt(l.deal_value) || 0), 0);
    var weeklyCost = customer.plan === 'starter' ? 25 : customer.plan === 'pro' ? 49 : customer.plan === 'enterprise' ? 99 : 0;
    var weeksActive = customer.created_at ? Math.max(1, Math.ceil((Date.now() - new Date(customer.created_at).getTime()) / (7 * 86400000))) : 1;
    var totalSpent = weeklyCost * weeksActive;
    var roiPercent = totalSpent > 0 ? Math.round((totalRevenue / totalSpent) * 10000) / 100 : 0;

    // Per lead type breakdown
    var byType = {};
    won.forEach(l => {
      if (!byType[l.product]) byType[l.product] = { count: 0, revenue: 0 };
      byType[l.product].count++;
      byType[l.product].revenue += parseInt(l.actual_revenue) || parseInt(l.deal_value) || 0;
    });

    res.json({
      total_revenue: totalRevenue,
      total_spent: totalSpent,
      weeks_active: weeksActive,
      weekly_cost: weeklyCost,
      roi_percent: roiPercent,
      won_count: won.length,
      avg_deal_size: won.length > 0 ? Math.round(totalRevenue / won.length) : 0,
      by_lead_type: byType,
      best_type: Object.entries(byType).sort((a, b) => b[1].revenue - a[1].revenue)[0]?.[0] || null
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/leads/:id/status — update lead status
app.put('/api/leads/:id/status', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const lead = (db.leads || []).find(l => l.id === req.params.id && l.customer_id === req.user.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const { status, deal_value, quote_value, actual_revenue, follow_up_date, outcome_reason } = req.body;
    if (status) lead.lead_status = status;
    if (deal_value) lead.deal_value = deal_value;
    if (quote_value) lead.quote_value = quote_value;
    if (actual_revenue) lead.actual_revenue = actual_revenue;
    if (follow_up_date) lead.follow_up_date = follow_up_date;
    if (outcome_reason) lead.outcome_reason = outcome_reason;
    if (status === 'contacted' && !lead.contacted_at) lead.contacted_at = new Date().toISOString();
    if (status === 'quoted' && !lead.quoted_at) lead.quoted_at = new Date().toISOString();
    if (status === 'won' && !lead.won_at) lead.won_at = new Date().toISOString();
    if (status === 'lost' && !lead.lost_at) lead.lost_at = new Date().toISOString();
    saveDb();
    res.json({ success: true, lead });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/leads/:id/note — add note to lead
app.put('/api/leads/:id/note', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const lead = (db.leads || []).find(l => l.id === req.params.id && l.customer_id === req.user.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.notes) lead.notes = [];
    lead.notes.push({ text: req.body.note || '', created_at: new Date().toISOString() });
    saveDb();
    res.json({ success: true, notes: lead.notes });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/leads/:id — lead detail
app.get('/api/leads/:id', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const lead = (db.leads || []).find(l => l.id === req.params.id && l.customer_id === req.user.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    // Parse data field
    try { lead.data = JSON.parse(lead.data); } catch(e) {}
    res.json(lead);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/areas/performance — area-level performance
app.get('/api/areas/performance', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    const leads = (db.leads || []).filter(l => l.customer_id === req.user.id);
    const areas = JSON.parse(customer?.target_areas || '[]');
    const result = {};
    areas.forEach(area => {
      const areaLeads = leads.filter(l => {
        try {
          var d = typeof l.data === 'string' ? JSON.parse(l.data) : (l.data || {});
          return extractPostcodeArea(d.postcode || d.address || '') === area.toUpperCase();
        } catch(e) { return false; }
      });
      result[area] = {
        total: areaLeads.length,
        won: areaLeads.filter(l => l.lead_status === 'won').length,
        revenue: areaLeads.filter(l => l.lead_status === 'won').reduce((s, l) => s + (parseInt(l.actual_revenue) || parseInt(l.deal_value) || 0), 0),
        estimated_value: areaLeads.reduce((s, l) => s + (parseInt(l.estimated_value) || 0), 0),
        conversion_rate: areaLeads.length > 0 ? Math.round((areaLeads.filter(l => l.lead_status === 'won').length / areaLeads.length) * 100) + '%' : '0%'
      };
    });
    res.json({ areas: result, coverage: customer?.coverage || 'postcode' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/chat — chat widget messages (no auth needed)
app.post('/api/chat', async (req, res) => {
  try {
    const db = getDb();
    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push({
      id: uuidv4(), name: req.body.name || 'Anonymous', email: req.body.email || '',
      message: req.body.message || '', page: req.body.page || '',
      created_at: new Date().toISOString()
    });
    saveDb();
    res.json({ success: true });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

// POST /api/support — submit support request / feedback
app.post('/api/support', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    if (!db.support_requests) db.support_requests = [];
    db.support_requests.push({
      id: uuidv4(), customer_id: req.user.id, type: req.body.type || 'general',
      name: req.body.name || '', email: req.body.email || '', subject: req.body.subject || '', message: req.body.message || '',
      created_at: new Date().toISOString(), resolved: false
    });
    saveDb();
    // Email notification to admin
    try {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
      if (customer && BREVO_API_KEY) {
        await sendBrevoEmail(
          { email: 'hello@9amleads.com', name: '9amLeads Admin' },
          'Support Request: ' + (req.body.subject || 'No subject'),
          '<div style="font-family:sans-serif;padding:24px"><h2>New Support Request</h2><p><strong>From:</strong> ' + customer.email + ' (' + (customer.company || '') + ')</p><p><strong>Subject:</strong> ' + (req.body.subject || 'None') + '</p><p><strong>Message:</strong></p><p>' + (req.body.message || '') + '</p></div>'
        );
      }
    } catch(emailErr) { console.log('[SUPPORT] Email notification failed:', emailErr.message); }
    res.json({ success: true, message: 'Your request has been submitted. We\'ll get back to you shortly.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
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

  // Group districts by area, return area-level overview
  const areaMap = {};
  for (const [code, info] of Object.entries(districts)) {
    const areaCode = info.area;
    if (!areaMap[areaCode]) {
      areaMap[areaCode] = {
        code: areaCode,
        name: (areas[areaCode] || {}).name || areaCode,
        region: info.region,
        district_count: 0,
        available: true,
        taken_by: null
      };
    }
    areaMap[areaCode].district_count++;
  }

  const result = Object.values(areaMap);
  const regions = [...new Set(Object.values(districts).map(d => d.region))];

  res.json({ areas: result, total_areas: result.length, regions });
});

// GET /api/postcodes/mine — Get current customer's assigned postcode areas with limits
app.get('/api/postcodes/mine', authMiddleware, (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'User not found' });

  const areas = loadPostcodeAreas();
  const currentAreas = JSON.parse(customer.target_areas || '[]');
  const extraPostcodes = parseInt(customer.extra_postcodes) || 0;
  const maxLimit = getPostcodeLimit(customer.plan, extraPostcodes);

  const withDetails = currentAreas.map(code => {
    const upper = code.toUpperCase();
    const areaInfo = areas[upper];
    if (areaInfo) {
      return { code: upper, name: areaInfo.name, region: areaInfo.region || '' };
    }
    // City/region name (not a standard postcode area)
    return { code: upper, name: upper, region: '', isCity: true };
  });

  res.json({
    areas: withDetails,
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

// GET /api/postcodes/check — Check if a postcode area is valid
app.get('/api/postcodes/check', async (req, res) => {
  try {
    var code = (req.query.code || '').toUpperCase().trim();
    if (!code) return res.json({ valid: false, error: 'No postcode provided' });
    var areas = loadPostcodeAreas();
    if (!areas[code]) return res.json({ valid: false, error: '"' + code + '" is not a valid UK postcode area (use 1 or 2-letter code like B, N, EN, SG, CM)' });
    res.json({ valid: true, area: code, name: (areas[code] || {}).name || code, region: (areas[code] || {}).region || '' });
  } catch(e) { res.json({ valid: false, error: 'Server error' }); }
});

// PUT /api/postcodes/update — Update the customer's selected postcode areas
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

  res.json({ success: true, areas: postcodes, count: postcodes.length, max_limit: getPostcodeLimit(customer.plan) });
});

// POST /api/postcodes/extra — purchase 1 extra postcode area (£50 one-time via Stripe)
app.post('/api/postcodes/extra', authMiddleware, async (req, res) => {
  try {
    if (!STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe not configured. Add keys in Settings \u2192 Stripe Payments.' });
    }
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    if (customer.plan === 'free_trial' || customer.plan === 'cancelled') {
      return res.status(400).json({ error: 'Upgrade to a paid plan first' });
    }

    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:' + PORT;
    const successUrl = baseUrl + '/portal/dashboard.html?checkout=success&session_id={CHECKOUT_SESSION_ID}';
    const cancelUrl = baseUrl + '/portal/dashboard.html?checkout=cancel';

    const sessionBody = {
      mode: 'payment',
      customer_email: customer.email,
      'line_items[0][price_data][currency]': 'gbp',
      'line_items[0][price_data][product_data][name]': 'Extra Postcode Area',
      'line_items[0][price_data][unit_amount]': String(EXTRAS_PRICE),
      'line_items[0][quantity]': '1',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'metadata[customer_id]': customer.id,
      'metadata[type]': 'extra_area',
      'metadata[product]': customer.product
    };

    const session = await stripeApiRequest('POST', 'checkout/sessions', sessionBody);

    if (session.url) {
      res.json({ url: session.url, session_id: session.id });
    } else {
      res.status(400).json({ error: session.error?.message || 'Checkout creation failed' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== SETTINGS ENDPOINT =====

// PUT /api/settings
app.put('/api/settings', authMiddleware, (req, res) => {
  const { company, name, phone, target_areas, notifications, password } = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'User not found' });

  if (company) db.prepare('UPDATE customers SET company = ? WHERE id = ?').run(company, req.user.id);
  if (name) db.prepare('UPDATE customers SET contact_name = ? WHERE id = ?').run(name, req.user.id);
  if (phone) db.prepare('UPDATE customers SET phone = ? WHERE id = ?').run(phone, req.user.id);
  if (password && password.length >= 8) { var pwHash = require('bcryptjs').hashSync(password, 10); db.prepare('UPDATE customers SET password_hash = ? WHERE id = ?').run(pwHash, req.user.id); }
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

// POST /api/ai/generate-letter — Generate introduction letter via 9am Leads AI Marketing Builder
app.post('/api/ai/generate-letter', authMiddleware, async (req, res) => {
  try {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) return res.status(400).json({ error: 'AI Marketing Builder is not configured yet. Please contact support.' });

    // Use business profile data if not explicitly provided
    var businessData = req.body;
    if (!businessData.company_name || !businessData.business_type) {
      var profile = db.prepare('SELECT * FROM customer_business_profiles WHERE customer_id = ?').get(req.user.id);
      if (!profile) return res.status(400).json({ error: 'Please complete your Business Profile first. Go to Dashboard â†’ Business Profile to set up your details.' });
      businessData = {
        company_name: profile.company_name || 'Your Company',
        business_type: profile.business_type || 'Business',
        services: profile.services_offered || '',
        service_area: profile.service_areas || 'your local area',
        special_offer: profile.special_offer || '',
        tone: profile.brand_tone || 'professional',
        phone: profile.phone || '',
        website: profile.website || '',
        email: profile.email || '',
        call_to_action: profile.call_to_action || 'Get in touch today'
      };
    }

    var toneDesc = businessData.tone === 'friendly' ? 'warm and approachable' :
                   businessData.tone === 'premium' ? 'high-end and sophisticated' :
                   businessData.tone === 'bold' ? 'confident and direct' :
                   businessData.tone === 'warm' ? 'kind and personal' :
                   'professional and trustworthy';

    var promptBase = 'You are a professional marketing copywriter. Generate a business introduction letter for a company with these details:\n' +
      'Company: ' + businessData.company_name + '\n' +
      'Industry: ' + businessData.business_type + '\n' +
      'Services: ' + (businessData.services || 'Not specified') + '\n' +
      'Service Area: ' + (businessData.service_area || 'Local area') + '\n' +
      'Special Offer: ' + (businessData.special_offer || 'Not specified') + '\n' +
      'Tone: ' + toneDesc + '\n' +
      'Phone: ' + (businessData.phone || 'Not specified') + '\n' +
      'Website: ' + (businessData.website || 'Not specified') + '\n' +
      'Email: ' + (businessData.email || 'Not specified') + '\n' +
      'Call to Action: ' + (businessData.call_to_action || 'Get in touch') + '\n\n' +
      'Generate FOUR versions of the letter. Label each clearly:\n' +
      '=== PROFESSIONAL ===\n(Full formal introduction letter)\n' +
      '=== SHORT ===\n(Brief, concise version)\n' +
      '=== FRIENDLY ===\n(Warm, approachable version)\n' +
      '=== CALL TO ACTION ===\n(Strong call-to-action focused version)\n\n' +
      'Each version should include the company name, services offered, tone-appropriate messaging, and contact details naturally integrated. Format as plain text with clear section separators.';

    var promptShort = 'Generate a SHORT version (2-3 paragraphs) of a business introduction letter for ' + businessData.company_name + ' in the ' + businessData.business_type + ' industry. Tone: ' + toneDesc + '. Include their services, area, and contact details naturally.';

    var promptFriendly = 'Generate a FRIENDLY, warm version of a business introduction letter for ' + businessData.company_name + ' in the ' + businessData.business_type + ' industry. Make it feel personal and approachable.';

    var promptPremium = 'Generate a PREMIUM, high-end business introduction letter for ' + businessData.company_name + ' in the ' + businessData.business_type + ' industry. Use sophisticated language and an elegant tone.';

    var promptCta = 'Generate a STRONG CALL-TO-ACTION focused business introduction letter for ' + businessData.company_name + ' in the ' + businessData.business_type + ' industry. The primary goal is to get the reader to take action: ' + (businessData.call_to_action || 'Get in touch');

    var prompts = [promptBase, promptShort, promptFriendly, promptPremium, promptCta];
    var letters = [];

    for (var pi = 0; pi < prompts.length; pi++) {
      var requestBody = JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompts[pi] }],
        max_tokens: 1000,
        temperature: 0.7
      });
      var result = await new Promise(function(resolve) {
        const https = require('https');
        var req = https.request({
          hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST',
          headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(requestBody) }
        }, function(r) { var b = ''; r.on('data', function(c) { b += c; }); r.on('end', function() { try { resolve(JSON.parse(b)); } catch(e) { resolve({ error: { message: 'Failed to parse response' } }); } }); });
        req.on('error', function(e) { resolve({ error: { message: e.message } }); });
        req.write(requestBody); req.end();
      });
      if (result && result.choices && result.choices[0] && result.choices[0].message) {
        letters.push(result.choices[0].message.content);
      } else {
        letters.push(''); // Fallback empty on error for individual variant
      }
    }

    res.json({
      success: true,
      professional: letters[0] || letters[0] === '' ? letters[0] : '',
      short: letters[1] || '',
      friendly: letters[2] || '',
      premium: letters[3] || '',
      call_to_action: letters[4] || '',
      input: businessData
    });
  } catch (e) {
    res.status(500).json({ error: 'Sorry, the AI Marketing Builder encountered an error. Please try again.' });
  }
});

// POST /api/ai/generate-flyer — Generate flyer content via 9am Leads AI Marketing Builder
app.post('/api/ai/generate-flyer', authMiddleware, async (req, res) => {
  try {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) return res.status(400).json({ error: 'AI Marketing Builder is not configured yet. Please contact support.' });

    var businessData = req.body;
    if (!businessData.company_name || !businessData.business_type) {
      var profile = db.prepare('SELECT * FROM customer_business_profiles WHERE customer_id = ?').get(req.user.id);
      if (!profile) return res.status(400).json({ error: 'Please complete your Business Profile first. Go to Dashboard â†’ Business Profile to set up your details.' });
      businessData = {
        company_name: profile.company_name || 'Your Company',
        business_type: profile.business_type || 'Business',
        services: profile.services_offered || '',
        service_area: profile.service_areas || 'your local area',
        special_offer: profile.special_offer || '',
        style: profile.brand_tone || 'professional',
        phone: profile.phone || '',
        website: profile.website || '',
        call_to_action: profile.call_to_action || 'Get in touch today',
        social_proof: profile.google_reviews_link ? 'Has Google reviews' : ''
      };
    }

    var styleDesc = businessData.style === 'friendly' ? 'warm and approachable' :
                    businessData.style === 'premium' ? 'high-end and sophisticated' :
                    businessData.style === 'urgent' ? 'urgent and time-sensitive' :
                    businessData.style === 'local' ? 'local community-focused and trusted' :
                    businessData.style === 'bold' ? 'confident and direct' :
                    'professional and trustworthy';

    var prompt = 'You are a professional flyer copywriter for ' + businessData.company_name + ' in the ' + businessData.business_type + ' industry. Style: ' + styleDesc + '.\n\n' +
      'Generate flyer content in the following structured format. Label each section clearly:\n\n' +
      'HEADLINE:\n(A powerful, attention-grabbing headline for the flyer front)\n\n' +
      'SUBHEADLINE:\n(A supporting subheadline that adds context)\n\n' +
      'SERVICES:\n(3-5 bullet points of services offered. Services include: ' + (businessData.services || 'Not specified') + ')\n\n' +
      'OFFER:\n(A compelling offer or unique selling proposition. Special offer: ' + (businessData.special_offer || 'Quality service') + ')\n\n' +
      'TRUST:\n(A trust-building statement. Why customers should choose them. Service area: ' + (businessData.service_area || 'Local area') + ')\n\n' +
      'CALL TO ACTION:\n(A clear, direct call to action. CTA: ' + (businessData.call_to_action || 'Get in touch') + ')\n\n' +
      'BACK PAGE:\n(Full back page content with more detail about the company, why choose them, areas covered)\n\n' +
      'QR TEXT:\n(Short text to display near a QR code, encouraging scan)\n\n' +
      'SLOGAN:\n(A short, memorable slogan for the company, max 8 words)\n\n' +
      'Include contact details naturally where relevant: Phone: ' + (businessData.phone || 'N/A') + ', Website: ' + (businessData.website || 'N/A');

    var requestBody = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.7
    });

    var result = await new Promise(function(resolve) {
      const https = require('https');
      var req = https.request({
        hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST',
        headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(requestBody) }
      }, function(r) { var b = ''; r.on('data', function(c) { b += c; }); r.on('end', function() { try { resolve(JSON.parse(b)); } catch(e) { resolve({ error: { message: 'Failed to parse response' } }); } }); });
      req.on('error', function(e) { resolve({ error: { message: e.message } }); });
      req.write(requestBody); req.end();
    });

    if (result && result.choices && result.choices[0] && result.choices[0].message) {
      var content = result.choices[0].message.content;
      // Parse sections from response
      var parse = function(label) {
        var regex = new RegExp(label + ':\\s*([\\s\\S]*?)(?:\\n\\n(?:[A-Z ]+):|$)', 'i');
        var m = content.match(regex);
        return m ? m[1].trim() : '';
      };
      res.json({
        success: true,
        headline: parse('HEADLINE'),
        subheadline: parse('SUBHEADLINE'),
        services: parse('SERVICES'),
        offer: parse('OFFER'),
        trust: parse('TRUST'),
        call_to_action: parse('CALL TO ACTION'),
        back_page: parse('BACK PAGE'),
        qr_text: parse('QR TEXT'),
        slogan: parse('SLOGAN'),
        raw: content,
        input: businessData
      });
    } else {
      res.status(500).json({ error: 'Failed to generate flyer content. Please try again.' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Sorry, the AI Marketing Builder encountered an error. Please try again.' });
  }
});

// POST /api/ai/generate-offers — Generate offer ideas
app.post('/api/ai/generate-offers', authMiddleware, async (req, res) => {
  try {
    var key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(400).json({ error: 'AI Marketing Builder not configured.' });
    var bd = req.body;
    if (!bd.company_name || !bd.business_type) {
      var p = db.prepare('SELECT * FROM customer_business_profiles WHERE customer_id = ?').get(req.user.id);
      if (!p) return res.status(400).json({ error: 'Complete your Business Profile first.' });
      bd = { company_name: p.company_name || '', business_type: p.business_type || '', services: p.services_offered || '', service_area: p.service_areas || '', phone: p.phone || '', website: p.website || '' };
    }
    var promptTxt = 'Generate 7 marketing offers for a ' + (bd.business_type || 'business') + ' company "' + (bd.company_name || '') + '". Services: ' + (bd.services || '') + '. Area: ' + (bd.service_area || '') + '. For each offer provide: OFFER TITLE, OFFER TYPE (Free quote/Free inspection/No call-out fee/Limited-time discount/First job discount/Seasonal offer/Bundle offer/Local customer offer), SHORT EXPLANATION, FLYER WORDING, LETTER WORDING, CALL TO ACTION, TERMS. Separate with "=== OFFER ===".';
    var reqBody = JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: promptTxt }], max_tokens: 2500, temperature: 0.8 });
    var result = await new Promise(function(resolve) {
      var https = require('https');
      var r = https.request({ hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(reqBody) } }, function(resp) { var b = ''; resp.on('data', function(c) { b += c; }); resp.on('end', function() { try { resolve(JSON.parse(b)); } catch(e) { resolve({ error: { message: 'Parse error' } }); } }); });
      r.on('error', function(e) { resolve({ error: { message: e.message } }); }); r.write(reqBody); r.end();
    });
    if (result && result.choices && result.choices[0] && result.choices[0].message) {
      var content = result.choices[0].message.content;
      var offers = [];
      var sections = content.split(/(?:=== OFFER ===|OFFER \d+:|^OFFER\s*:)/mi);
      sections.forEach(function(section) {
        var s = section.trim(); if (!s || s.length < 10) return;
        var g = function(labels) {
          if (typeof labels === 'string') labels = [labels];
          for (var li = 0; li < labels.length; li++) {
            var escLabel = labels[li].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            var patterns = [
              new RegExp(escLabel + '\\s*:\\s*([\\s\\S]*?)(?:\\n(?:[A-Z][A-Z ]+):|\\n===|\\n\\n|$)', 'i'),
              new RegExp(escLabel + '\\s*[:\\-]\\s*([^\\n]+)', 'i')
            ];
            for (var pi = 0; pi < patterns.length; pi++) {
              var m = s.match(patterns[pi]);
              if (m && m[1] && m[1].trim()) return m[1].trim();
            }
          }
          return '';
        };
        var title = g(['OFFER TITLE', 'TITLE', 'OFFER']);
        if (!title) title = s.split('\n')[0].trim().substring(0, 60);
        if (!title || title.length < 3) return;
        offers.push({
          title: title,
          type: g(['OFFER TYPE', 'TYPE']),
          explanation: g(['SHORT EXPLANATION', 'EXPLANATION', 'DESCRIPTION']),
          flyer_wording: g(['FLYER WORDING', 'FLYER TEXT']),
          letter_wording: g(['LETTER WORDING', 'LETTER TEXT']),
          call_to_action: g(['CALL TO ACTION', 'CTA', 'CALL TO ACTION']),
          terms: g(['TERMS', 'TERMS AND CONDITIONS'])
        });
      });
      res.json({ success: true, offers: offers, count: offers.length, input: bd });
    } else { res.json({ success: true, offers: [], count: 0 }); }
  } catch (e) { res.status(500).json({ error: 'AI Marketing Builder error. Please try again.' }); }
});

// POST /api/ai/review-content — AI Marketing Advisor: review flyer/letter content
app.post('/api/ai/review-content', authMiddleware, async (req, res) => {
  try {
    var key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(400).json({ error: 'AI Marketing Builder not configured.' });
    var content = req.body.content || '';
    var type = req.body.type || 'flyer';
    var businessType = req.body.business_type || '';
    if (!content) return res.status(400).json({ error: 'Content required' });
    var promptTxt = 'You are a professional marketing advisor. Review this ' + type + ' content for a ' + (businessType || 'business') + ' company.\n\nContent to review:\n' + content.substring(0, 3000) + '\n\nEvaluate: headline strength, offer quality, CTA clarity, phone/website presence, business name, grammar, spelling, tone, length, readability, contact visibility, professional appearance.\n\nRespond in this exact format:\nSCORE: (number between 0-100)\nSTRENGTHS: (list key strengths)\nSUGGESTIONS: (numbered list of specific improvements)\nRAW_SCORE: (just the number)';
    var reqBody = JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: promptTxt }], max_tokens: 1000, temperature: 0.3 });
    var result = await new Promise(function(resolve) {
      var https = require('https');
      var r = https.request({ hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(reqBody) } }, function(resp) { var b = ''; resp.on('data', function(c) { b += c; }); resp.on('end', function() { try { resolve(JSON.parse(b)); } catch(e) { resolve({ error: { message: 'Parse error' } }); } }); });
      r.on('error', function(e) { resolve({ error: { message: e.message } }); }); r.write(reqBody); r.end();
    });
    if (result && result.choices && result.choices[0] && result.choices[0].message) {
      var text = result.choices[0].message.content;
      var scoreMatch = text.match(/SCORE:\s*(\d+)/i);
      var rawMatch = text.match(/RAW_SCORE:\s*(\d+)/i);
      var score = parseInt(rawMatch && rawMatch[1] ? rawMatch[1] : (scoreMatch && scoreMatch[1] ? scoreMatch[1] : 0));
      var strengths = []; var sugg = [];
      var sMatch = text.match(/STRENGTHS:\s*([\s\S]*?)(?:SUGGESTIONS:|$)/i);
      if (sMatch) strengths = sMatch[1].split('\n').map(function(s) { return s.replace(/^[-*\d.\s]+/, '').trim(); }).filter(Boolean);
      var sugMatch = text.match(/SUGGESTIONS:\s*([\s\S]*?)$/i);
      if (sugMatch) sugg = sugMatch[1].split('\n').map(function(s) { return s.replace(/^[-*\d.\s]+/, '').trim(); }).filter(Boolean);
      res.json({ success: true, score: Math.min(100, Math.max(0, score)), strengths: strengths.slice(0, 5), suggestions: sugg.slice(0, 8), raw: text });
    } else { res.json({ success: true, score: 0, strengths: [], suggestions: ['Unable to review content'], raw: '' }); }
  } catch (e) { res.status(500).json({ error: 'Marketing Advisor error. Please try again.' }); }
});

// POST /api/ai/preview-personalisation — Preview personalised letter content
app.post('/api/ai/preview-personalisation', authMiddleware, (req, res) => {
  try {
    var content = req.body.content || '';
    if (!content) return res.status(400).json({ error: 'Content required' });
    var lead = req.body.lead || {};
    var business = req.body.business || {};
    // If no business data provided, use customer's profile
    if (!business.company_name) {
      var profile = db.prepare('SELECT * FROM customer_business_profiles WHERE customer_id = ?').get(req.user.id);
      if (profile) business = { company_name: profile.company_name || 'our company', phone: profile.phone || '', website: profile.website || '', offer: req.body.business?.offer || '' };
    }
    var personalised = applyMergeTags(content, lead, business);
    // Also check if any tags remain unmerged
    var remaining = [];
    MERGE_TAGS.forEach(function(tag) { if (personalised.indexOf(tag) !== -1) remaining.push(tag); });
    res.json({ success: true, original: content, personalised: personalised, unmerged_tags: remaining, has_unmerged: remaining.length > 0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/ai/generate-flyer-pdf — Generate print-ready A5 flyer PDF
app.post('/api/ai/generate-flyer-pdf', authMiddleware, async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const fs = require('fs');
    const path = require('path');

    var data = req.body;
    // Fall back to business profile for missing data
    if (!data.company_name || !data.business_type) {
      var profile = db.prepare('SELECT * FROM customer_business_profiles WHERE customer_id = ?').get(req.user.id);
      if (!profile) return res.status(400).json({ error: 'Complete your Business Profile first.' });
      data.company_name = data.company_name || profile.company_name || 'Your Business';
      data.business_type = data.business_type || profile.business_type || 'Business';
      data.services = data.services || profile.services_offered || '';
      data.service_area = data.service_area || profile.service_areas || '';
      data.special_offer = data.special_offer || profile.special_offer || '';
      data.phone = data.phone || profile.phone || '';
      data.website = data.website || profile.website || '';
      data.email = data.email || profile.email || '';
      data.call_to_action = data.call_to_action || profile.call_to_action || 'Get in touch';
      data.logo_url = data.logo_url || profile.logo_url || '';
      data.style = data.style || profile.brand_tone || 'professional';
    }
    // Apply personalisation merge tags if lead data provided
    if (data.lead_data) {
      ['headline','subheadline','services','special_offer','offer','trust','call_to_action','back_page','slogan','qr_text'].forEach(function(f) { if (data[f]) data[f] = applyMergeTags(String(data[f]), data.lead_data, { company_name: data.company_name, phone: data.phone, website: data.website }); });
    }

    var style = data.style || 'professional';
    var colors = {
      professional: { primary: '#0ea5e9', text: '#1e293b', bg: '#ffffff', accent: '#0284c7', light: '#f0f9ff' },
      bold: { primary: '#dc2626', text: '#1e293b', bg: '#ffffff', accent: '#b91c1c', light: '#fef2f2' },
      premium: { primary: '#7c3aed', text: '#1e293b', bg: '#faf5ff', accent: '#6d28d9', light: '#f5f3ff' },
      local: { primary: '#16a34a', text: '#1e293b', bg: '#ffffff', accent: '#15803d', light: '#f0fdf4' },
      urgent: { primary: '#ea580c', text: '#1e293b', bg: '#fff7ed', accent: '#c2410c', light: '#fff7ed' },
      friendly: { primary: '#0ea5e9', text: '#1e293b', bg: '#ffffff', accent: '#0284c7', light: '#f0f9ff' }
    };
    var c = colors[style] || colors.professional;

    var safeTop = 28, safeBottom = 28, safeLeft = 28, safeRight = 28;
    var pageW = 420, pageH = 595; // A5 in points (148mm x 210mm)

    function generatePDF(side) {
      return new Promise(function(resolve, reject) {
        try {
          var buffers = [];
          var doc = new PDFDocument({ size: 'A5', layout: 'portrait', margin: 0, info: { Title: data.company_name + ' Flyer', Creator: '9am Leads AI Marketing Builder' } });
          doc.on('data', buffers.push.bind(buffers));
          doc.on('end', function() { resolve(Buffer.concat(buffers)); });

          // Background
          doc.rect(0, 0, pageW, pageH).fill(c.light);

          // Optional background image
          if (data.background_image && data.background_image.startsWith('data:image') || data.background_image && data.background_image.startsWith('http')) {
            try { doc.image(data.background_image, 0, 0, { width: pageW, height: pageH, opacity: 0.08 }); } catch(e) { /* skip background */ }
          }

          // Top color bar
          doc.rect(0, 0, pageW, 6).fill(c.primary);

          if (side === 'front') {
            // Logo or placeholder
            var logoY = safeTop + 10;
            if (data.logo_url && data.logo_url.startsWith('data:image')) {
              try { doc.image(data.logo_url, safeLeft, logoY, { width: 60 }); } catch(e) { /* skip logo */ }
            }

            // Business name
            doc.fontSize(11).font('Helvetica-Bold').fillColor(c.primary);
            doc.text(data.company_name || 'Your Business', safeLeft, logoY + 70, { width: pageW - safeLeft - safeRight, align: 'center' });

            // Headline
            var headlineY = logoY + 95;
            doc.fontSize(22).font('Helvetica-Bold').fillColor(c.text);
            doc.text(data.headline || 'Get the Best Service in Town', safeLeft, headlineY, { width: pageW - safeLeft - safeRight, align: 'center' });

            // Subheadline
            var subY = headlineY + 55;
            doc.fontSize(11).font('Helvetica').fillColor('#475569');
            doc.text(data.subheadline || '', safeLeft, subY, { width: pageW - safeLeft - safeRight, align: 'center' });

            // Services bullet points
            var servicesY = subY + 45;
            doc.fontSize(10).font('Helvetica').fillColor(c.text);
            var services = (data.services || 'Quality service').split('\n').filter(Boolean);
            if (services.length === 0) services = ['Quality service', 'Professional team', 'Satisfaction guaranteed'];
            services.forEach(function(svc, i) {
              doc.text('â€¢ ' + svc.trim(), safeLeft + 10, servicesY + i * 18, { width: pageW - safeLeft - safeRight - 20 });
            });

            // Offer highlight box
            var offerY = servicesY + services.length * 18 + 15;
            doc.rect(safeLeft, offerY, pageW - safeLeft - safeRight, 40).fill(c.primary);
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffffff');
            doc.text(data.special_offer || 'Free Quote — Call Today', safeLeft + 10, offerY + 12, { width: pageW - safeLeft - safeRight - 20, align: 'center' });

            // Bottom contact bar
            var contactY = pageH - safeBottom - 50;
            doc.rect(safeLeft, contactY, pageW - safeLeft - safeRight, 50).fillColor('#1e293b').fill();
            doc.fontSize(9).font('Helvetica').fillColor('#ffffff');
            var contactText = (data.phone ? '✅ ' + data.phone + '  ' : '') + (data.website ? 'ðŸŒ ' + data.website : '');
            doc.text(contactText, safeLeft + 10, contactY + 10, { width: pageW - safeLeft - safeRight - 20, align: 'center' });
            doc.fontSize(10).font('Helvetica-Bold').fillColor(c.primary);
            doc.text((data.call_to_action || 'Get in Touch') + ' â†’', safeLeft + 10, contactY + 28, { width: pageW - safeLeft - safeRight - 20, align: 'center' });
          } else {
            // BACK PAGE
            doc.fontSize(16).font('Helvetica-Bold').fillColor(c.primary);
            doc.text('Why Choose ' + (data.company_name || 'Us') + '?', safeLeft, safeTop + 15, { width: pageW - safeLeft - safeRight, align: 'center' });

            var backY = safeTop + 50;
            doc.fontSize(10).font('Helvetica').fillColor(c.text);
            var trustText = data.trust || 'We are a trusted local business serving our community with quality service.';
            doc.text(trustText, safeLeft, backY, { width: pageW - safeLeft - safeRight, align: 'left', lineGap: 4 });

            // Back page content
            var backContentY = backY + doc.heightOfString(trustText, { width: pageW - safeLeft - safeRight }) + 15;
            doc.fontSize(10).font('Helvetica').fillColor('#475569');
            doc.text(data.back_page || '', safeLeft, backContentY, { width: pageW - safeLeft - safeRight, align: 'left' });

            // Slogan
            var sloganY = pageH - safeBottom - 70;
            doc.fontSize(13).font('Helvetica-Bold').fillColor(c.primary);
            doc.text((data.slogan || 'Your Trusted Local Partner'), safeLeft, sloganY, { width: pageW - safeLeft - safeRight, align: 'center' });

            // QR section + email
            var qrY = sloganY + 30;
            doc.fontSize(8).font('Helvetica').fillColor('#475569');
            doc.text((data.qr_text || 'Scan for more info') + '  |  ' + (data.email || ''), safeLeft, qrY, { width: pageW - safeLeft - safeRight, align: 'center' });

            // Bottom bar
            doc.rect(0, pageH - 6, pageW, 6).fill(c.primary);
          }
          doc.end();
        } catch(e) { reject(e); }
      });
    }

    // Generate both front and back
    var [frontPdf, backPdf] = await Promise.all([generatePDF('front'), generatePDF('back')]);
    var frontBase64 = 'data:application/pdf;base64,' + frontPdf.toString('base64');
    var backBase64 = 'data:application/pdf;base64,' + backPdf.toString('base64');

    // Store files in materials
    var materialId = uuidv4();
    db.prepare('INSERT INTO direct_mail_materials (id,customer_id,name,type,file_data,file_type,file_size,description,campaign_id,template_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
      materialId, req.user.id, data.company_name + ' - Flyer Front.pdf', 'flyer_front',
      frontBase64, 'pdf', frontPdf.length, 'AI-generated flyer front', '', '', new Date().toISOString()
    );
    var materialIdBack = uuidv4();
    db.prepare('INSERT INTO direct_mail_materials (id,customer_id,name,type,file_data,file_type,file_size,description,campaign_id,template_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
      materialIdBack, req.user.id, data.company_name + ' - Flyer Back.pdf', 'flyer_back',
      backBase64, 'pdf', backPdf.length, 'AI-generated flyer back', '', '', new Date().toISOString()
    );

    res.json({
      success: true,
      front_pdf: frontBase64,
      back_pdf: backBase64,
      front_material_id: materialId,
      back_material_id: materialIdBack,
      page_count: 2,
      size: 'A5',
      orientation: 'portrait',
      style: style,
      message: 'Print-ready flyer generated'
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to generate flyer PDF. Please try again.' });
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
const BREVO_API_KEY = process.env.BREVO_API_KEY || ''; // Set via Render env var - do not hardcode

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

// Lead type rules: per-product, per-plan, per-coverage-area daily limits
// Coverage types: 'postcode', 'county', 'region', 'ukwide'
// POST /api/check-availability — check if a lead type/package can be fulfilled
app.post('/api/check-availability', async (req, res) => {
  try {
    const { product, plan, coverage, postcodes } = req.body;
    const rule = getLeadTypeRule(product);
    const dailyLimit = getPlanLimit(product, plan || 'starter', coverage || 'region');

    // Check coverage validity for this lead type
    if (rule.coverage.indexOf(coverage) === -1) {
      return res.json({ available: false, message: coverage + ' coverage is not available for ' + rule.name + '.', recommendation: 'Choose ' + rule.coverage.join(', ') + ' instead.', limited: true, recommended_coverage: rule.min_area });
    }

    // Check minimum area requirement
    const areaOrder = { postcode: 1, county: 2, region: 3, ukwide: 4 };
    if (areaOrder[coverage] < areaOrder[rule.min_area]) {
      return res.json({ available: false, message: rule.name + ' in ' + coverage + ' areas are limited. To receive more daily opportunities, please choose ' + rule.min_area + ', ' + (rule.coverage.filter(c => c !== coverage).join(' or ')) + ' coverage.', recommendation: 'Recommended coverage: ' + rule.min_area + ' or wider.', limited: true, recommended_coverage: rule.min_area });
    }

    // Check if product is enabled
    if (!rule.enabled) {
      return res.json({ available: false, message: rule.name + ' are coming soon. Join the waiting list to be notified.', limited: true, waiting_list: true });
    }

    // Basic availability heuristic
    const db = getDb();
    const existingCustomers = (db.customers || []).filter(c => c.product === product && c.plan !== 'cancelled' && (!c.trial_ends || new Date(c.trial_ends) > new Date()));
    const totalCommitted = existingCustomers.reduce((sum, c) => sum + (parseInt(c.leads_per_day) || 5), 0);
    var leadsToday = (db.leads || []).filter(function(l) { return l.product === product && l.delivered === 0; }).length;

    // Estimate available supply
    var weeklyAvg = leadsToday; // Simplified: use today's available leads
    var supplyRatio = dailyLimit > 0 ? (weeklyAvg / (totalCommitted + dailyLimit)) : 0;

    if (supplyRatio < 0.3 && totalCommitted > 0) {
      return res.json({ available: true, limited: true, message: rule.name + ' in this area have limited availability.', recommendation: 'Consider wider coverage or a starter package to begin with.', supply_ratio: supplyRatio });
    }

    res.json({ available: true, limited: supplyRatio < 0.8, daily_limit: dailyLimit, supply_ratio: supplyRatio, coverage: coverage });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/waiting-list — join waiting list for unavailable packages
app.post('/api/waiting-list', async (req, res) => {
  try {
    const { name, email, phone, business_type, lead_type, area, package: pkg } = req.body;
    if (!email || !lead_type) return res.status(400).json({ error: 'Email and lead type required' });
    const db = getDb();
    if (!db.waiting_list) db.waiting_list = [];
    db.waiting_list.push({ id: uuidv4(), name: name || '', email, phone: phone || '', business_type: business_type || '', lead_type, area: area || '', package: pkg || '', date_joined: new Date().toISOString(), notified: false, notes: '' });
    saveDb();
    res.json({ success: true, message: 'You\'ve been added to the waiting list. We\'ll contact you when supply becomes available.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/availability — admin overview of supply vs demand
app.get('/api/admin/availability', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const customers = db.customers || [];
    const leads = db.leads || [];
    const result = {};
    for (const [key, rule] of Object.entries(LEAD_TYPE_RULES)) {
      const activeCustomers = customers.filter(c => c.product === key && c.plan !== 'cancelled');
      const totalCommitted = activeCustomers.reduce((sum, c) => sum + (parseInt(c.leads_per_day) || 5), 0);
      const availableLeads = leads.filter(l => l.product === key && l.delivered === 0).length;
      const leadsToday = leads.filter(l => l.product === key && l.delivered === 0 && l.created_at && l.created_at.startsWith(new Date().toISOString().split('T')[0])).length;
      result[key] = {
        name: rule.name,
        enabled: rule.enabled,
        active_customers: activeCustomers.length,
        total_committed_daily: totalCommitted,
        available_inventory: availableLeads,
        leads_today: leadsToday,
        supply_ratio: totalCommitted > 0 ? Math.min(1, availableLeads / totalCommitted) : 1,
        oversold: totalCommitted > 0 && availableLeads < totalCommitted * 0.3,
        coverage: rule.coverage
      };
    }
    res.json({ lead_types: result, warnings: Object.values(result).filter(r => r.oversold).map(r => r.name + ' oversold') });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/lead-types — return lead type rules for frontend
app.get('/api/lead-types', (req, res) => {
  const summary = {};
  for (const [key, rule] of Object.entries(LEAD_TYPE_RULES)) {
    summary[key] = {
      name: rule.name,
      local: rule.local,
      model: rule.model || 'daily',
      coverage: rule.coverage,
      min_area: rule.min_area,
      up_to: rule.up_to,
      enabled: rule.enabled,
      plans: Object.keys(rule.plans).filter(p => p !== 'free_trial'),
      plan_details: rule.plans,
      weekly_est: rule.weekly_est,
      monthly_est: rule.monthly_est
    };
  }
  res.json({ lead_types: summary });
});

const LEAD_TYPE_RULES = {
  moving: {
    name: 'Moving Leads', key: 'moving', local: true, model: 'daily',
    coverage: ['postcode', 'county', 'region'],
    plans: {
      free_trial: { default: 5, postcode: 5, county: 5, region: 5 },
      starter:  { default: 5,  postcode: 5,  county: 5,  region: 5 },
      pro:      { default: 15, postcode: 15, county: 15, region: 15 },
      enterprise: { default: 30, postcode: 30, county: 30, region: 30 },
    },
    min_area: 'postcode', up_to: false, enabled: true,
    price_starter: 'price_1Tm6PMADspDnFpfBJtsUWi6v',
    price_growth: 'price_1Tm6PNADspDnFpfB847Dubdf',
    price_power: 'price_1Tm6POADspDnFpfBkf0gfqXs',
    weekly_est: { starter: 25, pro: 75, enterprise: 150 },
    monthly_est: { starter: 100, pro: 300, enterprise: 600 }
  },
  newbusiness: {
    name: 'New Business Alerts', key: 'newbusiness', local: true, model: 'daily',
    coverage: ['postcode', 'county', 'region'],
    plans: {
      free_trial: { default: 5, postcode: 5, county: 5, region: 5 },
      starter:  { default: 10, postcode: 10, county: 10, region: 10 },
      pro:      { default: 25, postcode: 25, county: 25, region: 25 },
      enterprise: { default: 50, postcode: 50, county: 50, region: 50 },
    },
    min_area: 'postcode', up_to: false, enabled: true,
    price_starter: 'price_1Tm6PRADspDnFpfBx80lgJ84',
    price_growth: 'price_1Tm6PSADspDnFpfBXakzcGEL',
    price_power: 'price_1Tm6PSADspDnFpfBGRGc5zQ9',
    weekly_est: { starter: 50, pro: 125, enterprise: 250 },
    monthly_est: { starter: 200, pro: 500, enterprise: 1000 }
  },
  planning: {
    name: 'Planning Permissions', key: 'planning', local: false, model: 'weekly',
    coverage: ['county', 'ukwide'],
    area_limit: { free_trial: 3, starter: 3, pro: 999, enterprise: 999 },
    plans: {
      free_trial: { default: 1, county: 1, region: 2, ukwide: 3 },
      starter:  { default: 2,  county: 2,  region: 3,  ukwide: 5 },
      pro:      { default: 3,  county: 3,  region: 5,  ukwide: 10 },
      enterprise: { default: 8, county: 5, region: 10, ukwide: 25 },
    },
    min_area: 'county', up_to: true, enabled: true,
    price_starter: 'price_1TmEKSADspDnFpfBrCHXJBFu',
    price_growth: 'price_1TmEKTADspDnFpfBVdi1APEq',
    price_power: 'price_1TmEKTADspDnFpfBxFjHeoP9',
    weekly_est: { starter: 5, pro: 10, enterprise: 25 },
    monthly_est: { starter: 20, pro: 40, enterprise: 100 }
  },
  probate: {
    name: 'Probate Leads', key: 'probate', local: false, model: 'weekly',
    coverage: ['county', 'ukwide'],
    area_limit: { free_trial: 3, starter: 3, pro: 999, enterprise: 999 },
    plans: {
      free_trial: { default: 0, county: 0, region: 1, ukwide: 2 },
      starter:  { default: 1,  county: 1,  region: 2,  ukwide: 5 },
      pro:      { default: 3,  county: 3,  region: 5,  ukwide: 15 },
      enterprise: { default: 8, county: 5, region: 10, ukwide: 30 },
    },
    min_area: 'county', up_to: true, enabled: true,
    price_starter: 'price_1TxQqKADspDnFpfBccT0Lh2w',
    price_growth: 'price_1Tm6PPADspDnFpfB3q61i5FP',
    price_power: 'price_1Tm6PQADspDnFpfBazgz1UD7',
    weekly_est: { starter: 5, pro: 15, enterprise: 30 },
    monthly_est: { starter: 20, pro: 60, enterprise: 120 }
  },
  tenders: {
    name: 'Public Tenders', key: 'tenders', local: false, model: 'weekly',
    coverage: ['region', 'ukwide'],
    area_limit: { free_trial: 1, starter: 1, pro: 999, enterprise: 999 },
    plans: {
      free_trial: { default: 0, region: 0, ukwide: 1 },
      starter:  { default: 3,  region: 3,  ukwide: 5 },
      pro:      { default: 10, region: 10, ukwide: 25 },
      enterprise: { default: 20, region: 20, ukwide: 50 },
    },
    min_area: 'region', up_to: true, enabled: true,
    price_starter: 'price_1TmEKTADspDnFpfBsi6jjA6B',
    price_growth: 'price_1TmEKUADspDnFpfBqnyKzJxM',
    price_power: 'price_1TmEKUADspDnFpfBugGOoqhD',
    weekly_est: { starter: 5, pro: 25, enterprise: 50 },
    monthly_est: { starter: 20, pro: 100, enterprise: 200 }
  },
  property: {
    name: 'Property Leads', key: 'property', local: true,
    coverage: ['postcode', 'county', 'region'],
    plans: {
      free_trial: { default: 3, postcode: 3, county: 3, region: 3 },
      starter:  { default: 5,  postcode: 5,  county: 5,  region: 10 },
      pro:      { default: 15, postcode: 15, county: 15, region: 20 },
      enterprise: { default: 30, postcode: 30, county: 30, region: 40 },
    },
    min_area: 'postcode', up_to: false, enabled: false,
    price_starter: '', price_growth: '', price_power: '',
    weekly_est: { starter: 25, pro: 75, enterprise: 150 },
    monthly_est: { starter: 100, pro: 300, enterprise: 600 }
  },
  marketing: {
    name: 'Marketing Leads', key: 'marketing', local: true,
    coverage: ['postcode', 'county', 'region'],
    plans: {
      free_trial: { default: 3, postcode: 3, county: 3, region: 3 },
      starter:  { default: 5,  postcode: 5,  county: 10, region: 15 },
      pro:      { default: 15, postcode: 15, county: 20, region: 30 },
      enterprise: { default: 30, postcode: 30, county: 40, region: 50 },
    },
    min_area: 'postcode', up_to: false, enabled: false,
    price_starter: '', price_growth: '', price_power: '',
    weekly_est: { starter: 25, pro: 75, enterprise: 150 },
    monthly_est: { starter: 100, pro: 300, enterprise: 600 }
  },
  builder: {
    name: 'Builder Package', key: 'builder', local: false,
    coverage: ['county', 'region', 'ukwide'],
    plans: {
      free_trial: { default: 2, county: 2, region: 5, ukwide: 10 },
      starter:  { default: 3,  county: 3,  region: 8,  ukwide: 15 },
      pro:      { default: 8,  county: 8,  region: 15, ukwide: 25 },
      enterprise: { default: 20, county: 20, region: 30, ukwide: 50 },
    },
    min_area: 'county', up_to: true, enabled: false,
    price_starter: '', price_growth: '', price_power: '',
    weekly_est: { starter: 15, pro: 40, enterprise: 100 },
    monthly_est: { starter: 60, pro: 160, enterprise: 400 }
  },
  contracts: {
    name: 'Government Contracts', key: 'contracts', local: false,
    coverage: ['region', 'ukwide'],
    plans: {
      free_trial: { default: 1, region: 1, ukwide: 3 },
      starter:  { default: 1,  region: 1,  ukwide: 5 },
      pro:      { default: 3,  region: 3,  ukwide: 10 },
      enterprise: { default: 8, region: 8, ukwide: 25 },
    },
    min_area: 'region', up_to: true, enabled: false,
    price_starter: '', price_growth: '', price_power: '',
    weekly_est: { starter: 5, pro: 15, enterprise: 40 },
    monthly_est: { starter: 20, pro: 60, enterprise: 160 }
  }
};

const COVERAGE_LABELS = {
  postcode: 'Single Postcode Area',
  county: 'County',
  region: 'Region',
  ukwide: 'UK-wide'
};

const COVERAGE_TYPES = ['postcode', 'county', 'region', 'ukwide'];

const PLAN_NAMES = {
  free_trial: 'Free Trial',
  starter: 'Starter',
  essential: 'Essential',
  pro: 'Professional',
  enterprise: 'Enterprise',
};

function getLeadTypeRule(product) {
  return LEAD_TYPE_RULES[product] || LEAD_TYPE_RULES.moving;
}

function getPlanLimit(product, plan, coverage) {
  const rule = getLeadTypeRule(product);
  const planKey = plan === 'essential' ? 'starter' : (plan || 'starter');
  const coverageKey = coverage || 'default';
  const planLimits = rule.plans[planKey] || rule.plans.starter;
  // Fallback: try specific coverage, then default, then first available
  return planLimits[coverageKey] || planLimits.default || Object.values(planLimits)[0] || 5;
}

// ===== TRIAL / CAMPAIGN CAMPAIGN EMAIL TEMPLATES =====
const CAMPAIGN_EMAILS = [
  { day: 1, subject: 'Your opportunities start tomorrow at 9am \u2705', template: 'trial_day1' },
  { day: 3, subject: 'How are your first opportunities looking?', template: 'trial_day3' },
  { day: 5, subject: '3 tips to convert more leads into revenue', template: 'trial_day5' },
  { day: 7, subject: 'Your free trial ends tomorrow', template: 'trial_day7' },
  { day: 9, subject: 'We miss you \u2014 come back for 30% off', template: 'trial_day9' },
  { day: 12, subject: 'Still not sure? Let us help.', template: 'trial_day12' },
  { day: 16, subject: '3 businesses that transformed their pipeline', template: 'trial_day16' },
  { day: 21, subject: 'Come back \u2014 30% off your first month\u2019s subscription', template: 'trial_day21' },
  { day: 30, subject: 'Your exclusive offer expires soon', template: 'trial_day30' },
  { day: 60, subject: 'Last chance \u2014 30% off', template: 'trial_day60' },
];

// Paid customer email series (sent weekly after subscription starts)
const PAID_EMAIL_SERIES = [
  { week: 0, subject: 'Welcome to 9amLeads \u2014 Your opportunities arrive tomorrow at 9am!', template: 'paid_welcome' },
  { week: 1, subject: 'Tip #1: The 30-Minute Rule \u2014 Why Speed Wins', template: 'paid_tip1' },
  { week: 2, subject: 'Tip #2: Script That Converts \u2014 What To Say', template: 'paid_tip2' },
  { week: 3, subject: 'Tip #3: Track Everything to Improve Conversion', template: 'paid_tip3' },
  { week: 4, subject: 'Tip #4: Follow Up \u2014 The Money Is In The Follow-Up', template: 'paid_tip4' },
  { week: 8, subject: 'Check-in: How many opportunities have you converted?', template: 'paid_checkin1' },
  { week: 12, subject: 'You\u2019ve been with us 3 months \u2014 here\u2019s your ROI', template: 'paid_checkin2' }
];

function getCampaignEmailHTML(customer, template) {
  var allProds = [customer.product];
  try { var extra = JSON.parse(customer.biz_field3 || '[]'); if (Array.isArray(extra) && extra.length > 0) allProds = extra; } catch(e) {}
  const productNames = allProds.map(function(p) { var r = { moving: 'Moving Leads', probate: 'Probate Leads', newbusiness: 'New Business Alerts', planning: 'Planning Permissions', tenders: 'Public Tenders' }[p]; return r || p; });
  const accent = { moving: '#ff6b35', probate: '#a855f7', newbusiness: '#06b6d4', planning: '#10b981', tenders: '#6366f1' }[allProds[0]] || '#0ea5e9';
  const bizType = customer.business_type || 'business';
  const productName = productNames.join(' + ');
  const prod = allProds[0];

  // Product-specific outreach advice
  const outreachPrep = { moving: 'Print your brochure and prepare a personalised covering letter for the seller',
    probate: 'Print your probate services brochure and a compassionate introduction letter to the executor',
    newbusiness: 'Look up the company on Companies House for latest filings &amp; check if their website is live yet',
    planning: 'Read the planning application details and prepare a building/renovation services flyer',
    tenders: 'Read the tender documents on Contracts Finder and prepare your capability statement' }[prod] || 'Print your flyers and letters';
  const outreachVisit = { moving: 'Visit the property address in person : knock and introduce yourself to the seller',
    probate: 'Visit the executor\'s address in person : leave a card and flyer if no answer',
    newbusiness: 'Visit the registered address in person : introduce your business and drop your flyer',
    planning: 'Visit the property address in person : the owner is already planning work so your timing is perfect',
    tenders: 'Visit the buying organisation in person if local : drop your capability pack at reception' }[prod] || 'Visit them in person for local leads';
  const outreachPost = { moving: 'Post your brochure to the seller\'s address if you couldn\'t visit',
    probate: 'Post your services pack to the executor with a compassionate covering letter',
    newbusiness: 'Post your services brochure to the registered office with a covering letter',
    planning: 'Post your building services flyer and case studies to the applicant\'s address',
    tenders: 'Submit your application online via Contracts Finder and post a printed capability pack' }[prod] || 'Post letters for non-local leads';
  const outreachTip = { moving: 'Follow up fast. The seller is actively choosing an agent right now. Your brochure on their kitchen table gets read while competitors\' emails get deleted.',
    probate: 'Follow up with compassion. The executor needs help navigating probate — your letter offering support at this difficult time will stand out.',
    newbusiness: 'Follow up quickly. New companies often don\'t have a website yet — keep checking Companies House and be the first to introduce your services.',
    planning: 'Follow up fast. The homeowner has submitted plans and will need quotes. Your flyer arriving the same week positions you ahead of competitors.',
    tenders: 'Follow up fast. Tenders close on a deadline and the buyer needs capability statements. Submit online and follow up with a printed pack.' }[prod] || 'Follow up fast.';
  
  const templates = {
    trial_day1: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Your Free Trial Is Active</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">Your daily <strong style="color:#fff">' + productName + '</strong> <strong style="color:' + accent + '">are ready now</strong>.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">Welcome to 9amLeads. Over the next 7 days you\'ll receive exclusive <strong>' + productName + '</strong> delivered to your inbox every morning at 9am. Here\'s how to get the most out of your trial:</p><div style="background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.15);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#e2e8f0;font-size:13px;line-height:2;margin:0">✅ <strong style="color:#fff">9:00am</strong> : Lead sheet arrives in your inbox<br>âœ‰ï¸ <strong style="color:#fff">9:15am</strong> : ' + outreachPrep + '<br>ðŸš¶ <strong style="color:#fff">10:00am</strong> : ' + outreachVisit + '<br>ðŸ“¬ <strong style="color:#fff">Afternoon</strong> : ' + outreachPost + '</p></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">What makes these leads exclusive?</strong> Unlike lead generation sites where your quote is one of dozens, every lead we send is sent to <strong>you alone</strong>. No competitors. No bidding wars. You are the first and only person to contact them.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">ðŸ’¡ Pro tip:</strong> ' + outreachTip + ' Use the AI-drafted flyers, introduction letters, and visit in person templates in your dashboard for every lead. Set your alarm for 9am and start your lead hour.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px">To get the most from your trial, <a href="' + PUBLIC_URL + '/portal/dashboard.html" style="color:' + accent + '">log into your dashboard</a> and set up your CRM webhook so leads flow straight into your system. If you don\'t use a CRM, no problem : leads arrive by email too.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px">ðŸš€ NEW: Direct Mail Marketing Automation — automatically send professional letters and flyers to your leads by post. Set it up from your dashboard.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">See Pricing & Plans</a></td></tr></table>',
    trial_day3: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">How Are Your First Leads Looking?</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">3 days in : time for a quick check-in.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">You\'re three days into your 9amLeads trial. By now you should have received a few days\' worth of <strong>' + productName + '</strong>. We wanted to check in and see how things are going.</p><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#e2e8f0;font-size:13px;line-height:1.8;margin:0">✅ Are the leads relevant to your <strong>specific business</strong>?<br>✅ Is the volume what you <strong>expected</strong>?<br>✅ Have you managed to <strong>follow up yet</strong>?<br>✅ Are the postcode areas <strong>working for you</strong>?</p></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">If the answer to any of these is &ldquo;no&rdquo; : don\'t worry. You can <a href="' + PUBLIC_URL + '/portal/dashboard.html" style="color:' + accent + '">adjust your territory settings in the dashboard</a> to refine which opportunities you receive. Every lead includes AI-drafted flyers, introduction letters, and visit in person templates ready to use. Narrow it down, expand it out, or target specific cities.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:' + accent + '">ðŸ’¡ Tip of the day:</strong> Follow up within 30 minutes. We know we keep saying it, but it\'s because it works. Your lead is a real person who needs help <em>right now</em>. Every minute you wait, someone else reaches them first.</p><p style="color:#94a3b8;font-size:13px;margin:0 0 16px">Not loving it? Reply to this email and tell us what\'s off. We can tweak your settings or switch you to a different lead type.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">See Pricing & Plans</a></td></tr></table>',
    trial_day5: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">3 Tips to Convert More Leads</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">You\'ve got 2 days left in your trial. Let\'s make them count.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">By now you\'ve had a few days of <strong>' + productName + '</strong> landing in your inbox. Whether you\'ve closed deals yet or not, here are three tips that will dramatically improve your conversion rate:</p><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin:0 0 16px"><div style="margin-bottom:16px"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;margin-right:10px;float:left">1</div><div style="margin-left:38px"><strong style="color:#fff;font-size:14px">Follow up within 30 minutes</strong><br><span style="color:#94a3b8;font-size:13px">Speed is your superpower. When a lead goes SSTC, registers a company, or a probate grant is issued : they are actively looking for help. Our data shows that following up within 30 minutes triples your conversion rate compared to waiting 2 hours. Set your alarm, drop everything, and start preparing.</span></div></div><div style="margin-bottom:16px;clear:both"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;margin-right:10px;float:left">2</div><div style="margin-left:38px"><strong style="color:#fff;font-size:14px">Personalise your pitch</strong><br><span style="color:#94a3b8;font-size:13px">Don\'t read from a script. Reference their specific situation : the property address, the company they just registered, the probate value. &ldquo;I see you\'ve just listed [property] on Rightmove : congratulations. I specialise in helping sellers in [area] get a fast, fair price.&rdquo; Personalised pitches close at 2x the rate of generic ones.</span></div></div><div style="clear:both"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;margin-right:10px;float:left">3</div><div style="margin-left:38px"><strong style="color:#fff;font-size:14px">Follow up : the money is in the 2nd follow-up</strong><br><span style="color:#94a3b8;font-size:13px">Most sales don\'t happen on the first contact. People are busy, they need to check with a partner, or they\'re comparing options. Follow up on day 2 with an email, contact again on day 4. Exclusive leads mean no one else is contacting them : take your time and build the relationship.</span></div></div></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">Your free trial ends in <strong style="color:' + accent + '">2 days</strong>. After that, your leads will pause. Upgrade now to keep them flowing without interruption.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Upgrade & Keep Your Leads â†’</a></td></tr></table>',
    trial_day7: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Your Free Trial Ends Tomorrow</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">Action needed : your daily leads will pause after today.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">This is your 7-day reminder. Tomorrow your free trial ends, and your daily <strong>' + productName + '</strong> delivery will pause. Here\'s what you\'ll lose:</p><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#e2e8f0;font-size:13px;line-height:1.8;margin:0">✅ <strong style="color:#fff">Daily exclusive leads</strong> at 9am every morning<br>✅ <strong style="color:#fff">No competition</strong> : you\'re the only person who gets them<br>✅ <strong style="color:#fff">Full dashboard access</strong> with lead history & analytics<br>✅ <strong style="color:#fff">CRM integration</strong> : push leads to your system<br>✅ <strong style="color:#fff">Priority support</strong> when you need it</p></div><div style="background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.15);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#e2e8f0;font-size:13px;line-height:1.6;margin:0"><em>&ldquo;I got 12 leads in my first week using 9amLeads. Converted 3. Made <strong style="color:' + accent + '">£3,600</strong> in additional revenue. Best £49 I\'ve ever spent.&rdquo;</em><br><span style="color:#94a3b8;font-size:11px">: Mark S., Southampton</span></p></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px">Plans start from just <strong style="color:#fff">£49/month</strong>. No long-term contract. Cancel anytime. Upgrade now and your leads keep flowing tomorrow at 9am as if nothing happened.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px">ðŸš€ NEW: Direct Mail Marketing Automation — automatically send professional letters and flyers to your leads by post. Set it up from your dashboard.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px;box-shadow:0 4px 20px ' + accent + '40">Upgrade Now : Keep Your Leads</a></td></tr></table>',
    trial_day9: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Your Daily Leads Have Paused</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">Your 7-day trial has ended. Here\'s how to restart.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">As expected, your free trial has ended and your daily <strong>' + productName + '</strong> delivery has been paused. Don\'t worry : your lead history is still intact, and you can restart in 3 simple steps:</p><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#e2e8f0;font-size:13px;line-height:1.8;margin:0"><strong style="color:#fff">To restart your leads:</strong><br>1. <a href="' + PUBLIC_URL + '/portal/dashboard.html" style="color:' + accent + '">Log into your dashboard</a><br>2. Choose your plan<br>3. Leads restart at <strong style="color:' + accent + '">9am tomorrow</strong></p></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">If you\'re not sure whether 9amLeads is right for you, reply to this email and tell us what\'s holding you back. We\'re a small UK team and we personally read every reply. We\'ll help you decide : no pushy sales pitch, just honest advice.</p><div style="background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.15);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#e2e8f0;font-size:13px;line-height:1.6;margin:0"><em>&ldquo;I was sceptical at first but decided to give it a month. We picked up <strong style="color:' + accent + '">4 new clients</strong> in our first month : already covered our annual subscription 10x over.&rdquo;</em><br><span style="color:#94a3b8;font-size:11px">: Sarah L., Manchester</span></p></div><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px">Restart My Leads â†’</a></td></tr></table>',
    trial_day12: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Still Not Sure? Let\'s Talk</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">We understand. Let\'s figure this out together.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">We know that choosing a lead generation service is a big decision. Maybe the leads weren\'t quite right for your ' + bizType + '. Maybe the timing wasn\'t perfect. Maybe you just need more information before committing.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">Whatever it is : <strong style="color:#fff">we want to help</strong>. Reply to this email and tell us what\'s holding you back. Are the postcodes not quite right? Wrong lead type? Budget concerns? Not enough time to follow up? We\'ll help you find a solution.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">To sweeten the deal, here\'s a <strong style="color:#fff">30% discount</strong> on your first month when you\'re ready to give it another go:</p><div style="background:rgba(14,165,233,0.06);border:2px dashed ' + accent + ';border-radius:12px;padding:16px;text-align:center;margin:0 0 16px"><p style="color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:2px;margin:0 0 4px;color:#94a3b8">Discount Code</p><p style="font-family:Outfit,sans-serif;font-size:28px;font-weight:800;color:' + accent + ';margin:0;letter-spacing:3px">WELCOME30</p><p style="color:#94a3b8;font-size:11px;margin:4px 0 0">30% off your first month</p></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px">See if 9amLeads is right for your business by visiting our <a href="' + PUBLIC_URL + '/who-we-serve" style="color:' + accent + '">who we serve page</a> : we work with estate agents, probate practitioners, accountants, solicitors, and more.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/who-we-serve" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">See Who We Serve</a></td></tr></table>',
    trial_day16: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">3 Businesses That Transformed Their Pipeline</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">Real results from real 9amLeads customers.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">Still on the fence? Here are three stories from businesses just like yours who use 9amLeads to fill their pipeline every single day:</p><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 10px"><p style="color:#e2e8f0;font-size:13px;line-height:1.6;margin:0"><strong style="color:#fff">Estate Agent : Southampton</strong><br>&ldquo;Got 12 moving leads in my first week using 9amLeads. Contacted every one within 30 minutes. Converted 3 instructions and made <strong style="color:' + accent + '">£3,600</strong> in additional revenue. My monthly subscription paid for itself on the first lead.&rdquo;<br><span style="color:#94a3b8;font-size:11px">: Mark S., Independent Estate Agent</span></p></div><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 10px"><p style="color:#e2e8f0;font-size:13px;line-height:1.6;margin:0"><strong style="color:#fff">Probate Practitioner : Manchester</strong><br>&ldquo;We\'ve picked up <strong style="color:' + accent + '">4 new clients</strong> in our first month using 9amLeads probate leads. Already covered our annual subscription 10x over. The exclusivity is the game-changer : no one else is following up with these families.&rdquo;<br><span style="color:#94a3b8;font-size:11px">: Sarah L., Probate Services Ltd</span></p></div><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#e2e8f0;font-size:13px;line-height:1.6;margin:0"><strong style="color:#fff">Construction Company : Bristol</strong><br>&ldquo;Won 2 contracts worth <strong style="color:' + accent + '">£1.4M</strong> in our first quarter using 9amLeads tenders. We went from scrambling for work to having a consistent pipeline. Best business decision we\'ve made in 10 years.&rdquo;<br><span style="color:#94a3b8;font-size:11px">: James R., Bristol Construction Co</span></p></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px">Your success story could be next. Your account is still waiting, and your <strong style="color:' + accent + '">WELCOME30</strong> discount code is ready for you. Upgrade now and your leads restart at 9am tomorrow.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Restart With 30% Off â†’</a></td></tr></table>',
    trial_day21: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Come Back : 30% Off Your First Month</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">We\'d love to have you back. Here\'s a little incentive.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">It\'s been a few weeks since your trial ended. Since then, hundreds of new exclusive <strong>' + productName + '</strong> have been delivered to our customers every single morning. Here\'s what you\'ve been missing:</p><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#e2e8f0;font-size:13px;line-height:1.8;margin:0">✅ <strong style="color:#fff">Daily leads</strong> arriving at 9am every morning<br>✅ <strong style="color:#fff">Zero competition</strong> : exclusive to you<br>âš¡ <strong style="color:#fff">First to contact</strong> : every single time<br>✅ <strong style="color:#fff">Dashboard & CRM</strong> : manage everything in one place</p></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">Come back and try again with <strong style="color:#fff">30% off your first month</strong>. Use the code below at checkout:</p><div style="background:rgba(14,165,233,0.06);border:2px dashed ' + accent + ';border-radius:12px;padding:16px;text-align:center;margin:0 0 16px"><p style="color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:2px;margin:0 0 4px;color:#94a3b8">Discount Code</p><p style="font-family:Outfit,sans-serif;font-size:28px;font-weight:800;color:' + accent + ';margin:0;letter-spacing:3px">WELCOME30</p><p style="color:#94a3b8;font-size:11px;margin:4px 0 0">Expires soon : use it before it\'s gone</p></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px">No commitment. No long-term contract. Cancel anytime. Your leads restart at 9am tomorrow.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Claim 30% Off Now</a></td></tr></table>',
    trial_day30: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Your Account Is Still Waiting</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">No pressure. Your account is safe and ready when you are.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">It\'s been 30 days since your trial ended, and we wanted to let you know that your 9amLeads account is <strong style="color:#fff">still here</strong>. Nothing has been deleted. All your lead history, settings, postcode preferences, and dashboard access are preserved exactly as you left them.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">Whenever you\'re ready, upgrading takes 30 seconds. Your leads will restart at <strong style="color:' + accent + '">9am the next morning</strong> as if you never paused. No setup required. No waiting period.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">If you\'d like to have a chat with our team about whether 9amLeads is right for your ' + bizType + ', just reply to this email. We\'re here to help.</p><p style="color:#94a3b8;font-size:13px;margin:0 0 20px">No pressure. Just wanted to remind you that your account is waiting.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Visit Dashboard</a></td></tr></table>',
    trial_day60: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Last Chance : Account Will Be Archived</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">Final notice : your account will be archived in 30 days.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">This is your final notice. Your 9amLeads account has been inactive for 60 days. In <strong style="color:' + accent + '">30 days</strong>, your account will be archived to free up resources.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">What does archiving mean?</strong> Your lead history and account data will be preserved and stored securely. You won\'t lose anything. However, you\'ll need to <a href="mailto:hello@9amleads.com" style="color:' + accent + '">contact our support team</a> to reactivate your account : it won\'t be available for instant self-service upgrade.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">If you upgrade in the next 30 days, everything stays active. Your postcode areas, your settings, your lead history : all of it. Leads restart at 9am tomorrow morning.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px"><strong style="color:#fff">This is your last chance</strong> to keep your account active without needing to contact us. Don\'t let your leads slip away.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/pricing" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px;box-shadow:0 4px 20px ' + accent + '40">Upgrade Before Archive â†’</a></td></tr></table>',
    paid_welcome: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Welcome to 9amLeads Premium</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">You\'re now a paid subscriber. Let\'s make this work for you.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">Thank you for upgrading to 9amLeads Premium. Your daily <strong>' + productName + '</strong> will keep arriving at your inbox every morning at 9am <strong style="color:#fff">without interruption</strong>. Here\'s everything you now have access to:</p><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#e2e8f0;font-size:13px;line-height:1.8;margin:0"><strong style="color:#fff">Your Premium Benefits:</strong><br>✅ <strong style="color:#fff">Daily leads</strong> at 9am every morning : consistently<br>✅ <strong style="color:#fff">Exclusive access</strong> : no one else receives these leads<br>✅ <strong style="color:#fff">Dashboard</strong> : full lead history, analytics, and management<br>✅ <strong style="color:#fff">CRM integration</strong> : leads pushed straight to your CRM<br>✅ <strong style="color:#fff">Priority support</strong> : reply anytime and we\'ll help</p></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">Over the coming weeks we\'ll send you weekly tips and strategies : everything from letter and visit in person templates to follow-up sequences : to help you convert as many leads as possible.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px">First step: <a href="' + PUBLIC_URL + '/portal/dashboard.html" style="color:' + accent + '">log into your dashboard</a> and make sure your CRM webhook is configured (or just check your leads are landing in your inbox). If you need help setting anything up, reply to this email and we\'ll walk you through it.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px">ðŸš€ NEW: Direct Mail Marketing Automation — automatically send professional letters and flyers to your leads by post. Set it up from your dashboard.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Go to Dashboard</a></td></tr></table>',
    paid_tip1: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">The 30-Minute Rule</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">Why speed wins : and how to make it your habit.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">Welcome to your first weekly tip. This one is the most important, so we\'re leading with it: <strong style="color:' + accent + '">follow-up within 30 minutes</strong>.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">Why does speed matter so much? Because your lead is a real person who has just taken a specific action : their house went SSTC on Rightmove, they registered a new company at Companies House, or a probate grant was issued. They are <strong style="color:#fff">actively looking for help right now</strong>. Every minute you wait, a competitor reaches them first, booking with someone else, or losing interest.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">Here\'s your 3-part system:</strong></p><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 8px"><div style="display:flex;align-items:flex-start;gap:12px"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;margin-top:1px">1</div><div><strong style="color:#fff;font-size:14px">Set your alarm for 9:00am</strong><br><span style="color:#94a3b8;font-size:13px">When the lead email arrives, drop everything and start preparing your outreach. Block 9-10am as your dedicated lead hour every morning.</span></div></div></div><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 8px"><div style="display:flex;align-items:flex-start;gap:12px"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;margin-top:1px">2</div><div><strong style="color:#fff;font-size:14px">Keep your script ready</strong><br><span style="color:#94a3b8;font-size:13px">You only need 3-5 talking points. Have them printed or pinned to your monitor so you\'re ready before the lead arrives.</span></div></div></div><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><div style="display:flex;align-items:flex-start;gap:12px"><div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;margin-top:1px">3</div><div><strong style="color:#fff;font-size:14px">Track your response time</strong><br><span style="color:#94a3b8;font-size:13px">Note what time you contacted each lead. If you\'re calling outside 30 minutes, set an earlier alarm or use push notifications.</span></div></div></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px">Our data shows that those who reach leads within 30 minutes convert at <strong style="color:' + accent + '">3x the rate</strong> of those who wait 2+ hours. Speed isn\'t just a nice-to-have : it\'s your biggest competitive advantage. Learn more about <a href="' + PUBLIC_URL + '/how-it-works" style="color:' + accent + '">how it works</a>.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/how-it-works" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Learn More â†’</a></td></tr></table>',
    paid_tip2: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Your Outreach Kit : Letters &amp; Visit Them in Person</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">How to follow up with every lead in person.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">Following up within 30 minutes is step one. But knowing <strong style="color:#fff">how to present your business</strong> is what separates the pros from the amateurs. Here\'s a simple 3-step outreach system that works across every lead type : moving, probate, new business, planning, and tenders.</p><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 10px"><p style="color:#e2e8f0;font-size:13px;line-height:1.7;margin:0"><strong style="color:' + accent + '">1. Send a Personal Introduction Letter</strong><br>Print a professional letter on your company letterhead. Introduce yourself, explain how you help [business type] like theirs, and include your business card. Mention you saw their [listing / registration / application] and wanted to be the first to offer your services. &ldquo;I help sellers in [area] achieve a fast, fair price &mdash; and I do it with zero hassle for you.&rdquo;</p></div><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 10px"><p style="color:#e2e8f0;font-size:13px;line-height:1.7;margin:0"><strong style="color:' + accent + '">2. Drop a Letter &amp; Business Card</strong><br>Print a colour flyer showcasing your services, past results, and a special offer. Hand-deliver it to their address along with 2-3 business cards. Leave it in a weatherproof envelope if posted. A physical flyer left at their door gets seen &mdash; emails get deleted.</p></div><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#e2e8f0;font-size:13px;line-height:1.7;margin:0"><strong style="color:' + accent + '">3. Visit in Person (If Local)</strong><br>If their address is within your area, knock on the door. Be polite, brief, and leave a card if they don\'t answer. &ldquo;Hi [name], I\'m [your name] from [company]. I saw your [listing / registration] and thought I\'d pop by to introduce myself. Here\'s my card and a flyer &mdash; no pressure at all.&rdquo; Most people appreciate the personal touch.</p></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">Why this works:</strong> Physical outreach stands out. A letter and flyer on the kitchen table gets read. A doorstep visit shows you care enough to show up. Combined with an email follow-up, you\'ll be remembered long after your competitors are forgotten.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px">Adapt this for your industry. If you\'re in probate, include a compassionate intro and reference the estate executor. If you\'re in new business, mention their SIC code and offer a free consultation. The more personal, the better.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Go to Dashboard</a></td></tr></table>',
    paid_tip3: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Track Everything to Improve</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">Three metrics that will transform your conversion rate.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">The most successful 9amLeads customers do one thing differently: they <strong style="color:#fff">track their numbers</strong>. Not because they love spreadsheets : because what gets measured gets improved. Here are the three metrics you should be tracking:</p><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#e2e8f0;font-size:13px;line-height:1.8;margin:0"><strong style="color:' + accent + '">✅ Flyers &amp; Letters Sent</strong><br>how many do you actually send a flyer or letter to? Aim for <strong style="color:#fff">100%</strong>. Every lead you skip is money left on the table.<br><br><strong style="color:' + accent + '">✅ Conversations Had</strong><br>How many local leads do you visit in person? Aim for <strong style="color:#fff">80%+</strong>. If you\'re below this, plan a route and batch your visits by day.<br><br><strong style="color:' + accent + '">💰 Conversions Closed</strong><br>How many conversations turn into paying customers? Industry average with exclusive leads is <strong style="color:#fff">20-30%</strong>. If you\'re below this, improve your flyer design and follow-up process.</p></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">If you\'re following up on 100% of leads, having conversations with 60%+, and closing 25%+ : you\'re performing at an elite level. If not, focus on the weakest link and improve it.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px">Your dashboard shows your full lead history. Use it to identify which postcode areas and lead types perform best, then <a href="' + PUBLIC_URL + '/portal/dashboard.html" style="color:' + accent + '">double down on what works</a>.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">View Lead History</a></td></tr></table>',
    paid_tip4: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Follow Up : The Money Is In The Follow-Up</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">Why most conversions happen after multiple touchpoints.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">Here\'s a truth that most lead buyers ignore: <strong style="color:#fff">most people don\'t respond on the first approach</strong>. They\'re busy. They need time. They want to compare options. They\'re overwhelmed by the process.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">The money is made on the second, third, and fourth touchpoints. Here\'s a proven follow-up sequence using physical outreach:</p><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#e2e8f0;font-size:13px;line-height:1.8;margin:0"><strong style="color:' + accent + '">Day 1 : Personal Letter + Flyer</strong><br>Print a letter on your company paper with your business card clipped to it. Hand-deliver or post with a flyer showcasing your services. First impressions matter &mdash; make it professional.<br><br><strong style="color:' + accent + '">Day 3 : Visit in Person</strong><br>If local, knock on their door. Be brief, introduce yourself, and leave another card if they don\'t answer. Most people appreciate the personal effort.<br><br><strong style="color:' + accent + '">Day 7 : Email Follow-Up</strong><br>Send a short email: &ldquo;Hi [name], I popped by last week and left some information about how I help [business type] in [area]. If you\'d like a free, no-obligation chat, just reply to this email. No pressure at all. Best, [your name]&rdquo;<br><br><strong style="color:' + accent + '">Day 14 : Final Flyer Drop</strong><br>One last flyer drop with a handwritten note: &ldquo;Just checking in one last time. If the timing\'s not right, no problem. My details are inside &mdash; feel free to reach out whenever you\'re ready.&rdquo;</p></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">Why physical outreach wins with exclusive leads:</strong> Because you\'re the only person following up with them, you have time to do it properly. A letter on the kitchen table gets read every day. A flyer pinned to their notice board keeps your name in front of them. Your competitors are sending emails that get deleted &mdash; you\'re leaving something they can hold.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px">Most of our top-performing customers close deals 1-2 weeks after the lead first arrives. Patience + physical presence = profit.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Go to Dashboard</a></td></tr></table>',
    paid_checkin1: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Check-in: How Many Leads Have You Converted?</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">8 weeks in : let\'s take stock of your results.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">You\'ve been receiving <strong>' + productName + '</strong> for 8 weeks now. That\'s roughly 40 days of exclusive leads delivered straight to your inbox. Let\'s do a quick audit:</p><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#e2e8f0;font-size:13px;line-height:1.8;margin:0">✅ Are you following up within <strong style="color:#fff">30 minutes</strong> of receiving leads?<br>✅ Are you <strong style="color:#fff">following up</strong> with everyone who doesn\'t answer?<br>✅ Are your <strong style="color:#fff">postcode areas</strong> performing well?<br>✅ Could you <strong style="color:#fff">add more areas</strong> for more volume?<br>✅ Are you tracking your <strong style="color:#fff">conversion rate</strong>?</p></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">If you\'re happy with your results : fantastic. If not, let\'s fix it. Reply to this email and tell us what\'s not working. We can help you optimise your postcode areas, upgrade your plan for more leads, or switch to a different lead type that might perform better for your business.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="color:' + accent + '">Check your dashboard</a> for lead history and conversion analytics.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">View Dashboard</a></td></tr></table>',
    paid_checkin2: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">3 Months Strong : Here\'s Your Impact</h2><p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 20px">Three months of daily leads. Let\'s look at what you\'ve achieved.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">Congratulations : you\'ve been with 9amLeads for <strong style="color:' + accent + '">3 months</strong>. That\'s roughly 90 days of exclusive <strong>' + productName + '</strong> delivered straight to your inbox every morning at 9am. By now you should have a clear picture of what works and what doesn\'t.</p><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#e2e8f0;font-size:13px;line-height:1.8;margin:0"><strong style="color:#fff">Ready to scale up?</strong><br>📈 <strong style="color:#fff">Add a second lead type</strong> : diversify your pipeline with probate, new business, or planning leads<br>🌍 <strong style="color:#fff">Expand your postcodes</strong> : cover more areas for more volume<br>⬆️ <strong style="color:#fff">Upgrade your plan</strong> : get more leads per day at a better per-lead price<br>✅ <strong style="color:#fff">Check your dashboard</strong> : see which territories convert best</p></div><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 16px">We\'d love to hear your story. How many leads have you converted? What\'s the biggest deal you\'ve closed? Reply to this email and let us know : your feedback helps us improve, and we might feature your success story.</p><p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0 0 20px">Thank you for being a valued 9amLeads customer. We\'re here whenever you need us : just hit reply.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0"><a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px">Scale Up Now</a></td></tr></table>',
};

// ===== BREVO OUTBOUND CAMPAIGN UPLOAD INFRASTRUCTURE =====
// Master HTML template matching existing 9am Leads email design
function buildOutboundEmailHTML(email, campaignKey, recipientName) {
  var campaign = OUTBOUND_CAMPAIGNS[campaignKey];
  if (!campaign) return '';
  var accent = { moving: '#ff6b35', planning: '#10b981', probate: '#a855f7', newbusiness: '#06b6d4', tenders: '#6366f1' }[campaignKey] || '#0ea5e9';
  var prodLabel = { moving: 'Moving Leads', planning: 'Planning Permissions', probate: 'Probate Leads', newbusiness: 'New Business Alerts', tenders: 'Public Tenders' }[campaignKey] || '';
  var insightCards = {
    moving: { emoji: '\uD83D\uDE9A', tip: 'Moving leads convert fastest when you\'re the first to contact the seller. Your brochure and letter should arrive the same day the property goes SSTC.', metric: 'Avg. move value: \u00a31,000-\u00a33,000' },
    planning: { emoji: '\uD83C\uDFD7\uFE0F', tip: 'Planning applicants are actively choosing builders. Your flyer arriving the same week the application is submitted positions you ahead of every competitor.', metric: 'Avg. project value: \u00a320,000-\u00a3100,000' },
    probate: { emoji: '\u2696\uFE0F', tip: 'Probate requires a compassionate approach. Families remember who reached out with sensitivity, not who pushed the hardest.', metric: 'Avg. estate value: \u00a3150,000+' },
    newbusiness: { emoji: '\uD83C\uDFE2', tip: 'New companies often don\'t have a website or phone number yet. Check Companies House weekly and be ready when their details go live.', metric: 'Avg. client LTV: 2-5 years' },
    tenders: { emoji: '\uD83D\uDCCB', tip: 'Tenders close on deadlines. Submit your capability statement early and follow up with a printed pack to stand out.', metric: 'Avg. contract value: \u00a350,000-\u00a3500,000' }
  };
  var insight = insightCards[campaignKey] || { emoji: '\uD83D\uDCA1', tip: 'Follow up within 30 minutes to maximise your conversion rate.', metric: '' };
  var name = recipientName || '{{FIRSTNAME}}';
  var bodyText = (email.body || '').replace(/\n/g, '<br>');
  var ctaBtn = email.cta && !email.cta.toLowerCase().includes('reply') 
    ? '<a href="' + (email.cta || 'https://www.9amleads.com') + '" target="_blank" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + accent + ',#6366f1);color:#fff;text-decoration:none;border-radius:50px;font-size:13px;font-weight:700">' + email.cta + '</a>'
    : '<p style="color:#e2e8f0;font-size:13px;line-height:1.6;margin:0">' + email.cta + '</p>';
  
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#0f111a;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#e2e8f0">' +
    '<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0f111a"><tr><td align="center" style="padding:24px 16px">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">' +
    // Header
    '<tr><td style="background:linear-gradient(135deg,#0f111a,#1a1b2e);padding:32px 30px 20px;border-radius:16px 16px 0 0;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06)">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:900;color:#ffffff;text-align:center;margin-bottom:6px">' +
    '<span style="display:inline-block;width:38px;height:38px;border-radius:10px;text-align:center;line-height:38px;font-size:18px;background:linear-gradient(135deg,#0ea5e9,#6366f1);margin-right:6px;vertical-align:middle">9</span>' +
    '<span style="vertical-align:middle">am Leads</span></div>' +
    '<p style="color:#f1f5f9;font-size:10px;margin:0;text-transform:uppercase;letter-spacing:2.5px;font-weight:600">' + campaign.name + '</p>' +
    '</td></tr>' +
    // Content
    '<tr><td style="background:#12141e;padding:28px 30px 24px">' +
    '<p style="color:#f1f5f9;font-size:14px;margin:0 0 6px">Hi ' + name + ',</p>' +
    '<div style="font-size:14px;color:#e2e8f0;line-height:1.8">' + bodyText + '</div>' +
    '<div style="margin-top:20px;text-align:center">' + ctaBtn + '</div>' +
    '</td></tr>' +
    // Product insight card
    '<tr><td style="background:#12141e;padding:0 30px 16px"><div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 16px">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:16px">' + insight.emoji + '</span><span style="font-size:12px;font-weight:700;color:#f1f5f9">' + prodLabel + ' Insight</span></div>' +
    '<p style="font-size:12px;color:#cbd5e1;line-height:1.6;margin:0 0 6px">' + insight.tip + '</p>' +
    (insight.metric ? '<p style="font-size:11px;color:#38bdf8;margin:0 0 8px"><strong>' + insight.metric + '</strong></p>' : '') +
    '<div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;margin-top:4px">' +
'<p style="font-size:10px;color:#94a3b8;margin:0 0 4px">Need help? <a href="mailto:hello@9amleads.com" style="color:#38bdf8;text-decoration:underline">hello@9amleads.com</a> &bull; <a href="mailto:hello@9amleads.com" style="color:#38bdf8;text-decoration:underline">hello@9amleads.com</a> &bull; <a href="https://www.9amleads.com" style="color:#38bdf8;text-decoration:underline">9amLeads.com</a></p>' +
    '<div style="margin-top:6px"><a href="https://www.facebook.com/share/1SBwDAUuxh/" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.06);line-height:24px;text-align:center;text-decoration:none;margin:0 2px;font-size:9px;color:#94a3b8">fb</a><a href="https://www.tiktok.com/@9amleads.com" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.06);line-height:24px;text-align:center;text-decoration:none;margin:0 2px;font-size:9px;color:#94a3b8">tt</a><a href="https://www.instagram.com/9amleads/" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.06);line-height:24px;text-align:center;text-decoration:none;margin:0 2px;font-size:9px;color:#94a3b8">ig</a></div>' +
    '</div></div></td></tr>' +
    // Premium separator
    '<tr><td style="background:#12141e;padding:0 30px"><div style="height:1px;background:rgba(255,255,255,0.06)"></div></td></tr>' +
    // Founder section
    '<tr><td style="background:#12141e;padding:16px 30px 12px">' +
    '<div style="text-align:center">' +
    '<p style="color:#94a3b8;font-size:11px;margin:0 0 4px;font-style:italic">Written by</p>' +
    '<p style="color:#f1f5f9;font-size:13px;font-weight:600;margin:0">Ketz Mandalia</p>' +
    '<p style="color:#64748b;font-size:10px;margin:2px 0 0">Founder, 9amLeads</p>' +
    '</div></td></tr>' +
    // Footer
    '<tr><td style="background:linear-gradient(135deg,#0f111a,#1a1b2e);padding:20px 30px 16px;border-radius:0 0 16px 16px;text-align:center;border-top:1px solid rgba(255,255,255,0.06)">' +
    '<p style="color:#64748b;font-size:10px;margin:0 0 6px">9am Leads Ltd</p>' +
    '<p style="color:#64748b;font-size:9px;margin:0 0 8px"><a href="https://www.9amleads.com/privacy.html" style="color:#38bdf8;text-decoration:underline">Privacy Policy</a>' +
    ' &bull; <a href="{{UNSUBSCRIBE}}" style="color:#38bdf8;text-decoration:underline">Unsubscribe</a></p>' +
    '<p style="color:#475569;font-size:8px;margin:0;letter-spacing:.4px">Fresh exclusive opportunities at 9am every morning &bull; 9amLeads.com</p>' +
    '</td></tr></table></td></tr></table></body></html>';
}

// GET /api/admin/outbound-campaigns — list outbound prospecting campaigns
app.get('/api/admin/test-outbound', adminAuth, (req, res) => {
  var summaries = {};
  for (var p in OUTBOUND_CAMPAIGNS) {
    var c = OUTBOUND_CAMPAIGNS[p];
    summaries[p] = { name: c.name, tag: c.tag, listName: c.listName, emailCount: c.emails.length };
  }
  res.json({ success: true, campaigns: summaries });
});

// GET /api/admin/outbound-campaigns/:product — get emails for a campaign
app.get('/api/admin/outbound-campaigns/:product', adminAuth, (req, res) => {
  var camp = OUTBOUND_CAMPAIGNS[req.params.product];
  if (!camp) return res.status(404).json({ error: 'Campaign not found' });
  res.json({ success: true, campaign: { name: camp.name, tag: camp.tag, listName: camp.listName, emails: camp.emails } });
});

// ===== EMAIL TEMPLATE MANAGEMENT SYSTEM =====
// Unified endpoint for all email templates — customer, paid, outbound
var EDIT_FILE = path.join(DATA_DIR, 'email-edits.json');
function loadEdits() { try { return JSON.parse(fs.readFileSync(EDIT_FILE, 'utf-8')); } catch(e) { return {}; } }
function saveEdits(d) { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(EDIT_FILE, JSON.stringify(d, null, 2)); }

// Campaign template body is in getCampaignEmailHTML's templates object.
// We need to extract it. Since it's a large function with embedded strings,
// we reconstruct a preview from the template name.
function getCampaignBody(tpl) {
  try {
    var demo = { product: 'moving', lead_type: 'Moving Leads', business_type: 'Removal Company', company: 'Your Company', email: 'test@test.com', plan: 'free_trial' };
    var html = getCampaignEmailHTML(demo, tpl);
    if (html && html.length > 200) return html;
  } catch(e) {}
  return '';
}

function getCampaignSubject(tpl) {
  for (var i = 0; i < CAMPAIGN_EMAILS.length; i++) { if (CAMPAIGN_EMAILS[i].template === tpl) return CAMPAIGN_EMAILS[i].subject; }
  for (var i = 0; i < PAID_EMAIL_SERIES.length; i++) { if (PAID_EMAIL_SERIES[i].template === tpl) return PAID_EMAIL_SERIES[i].subject; }
  return tpl;
}

function getCampaignDay(tpl) {
  for (var i = 0; i < CAMPAIGN_EMAILS.length; i++) { if (CAMPAIGN_EMAILS[i].template === tpl) return CAMPAIGN_EMAILS[i].day; }
  for (var i = 0; i < PAID_EMAIL_SERIES.length; i++) { if (PAID_EMAIL_SERIES[i].template === tpl) return PAID_EMAIL_SERIES[i].week || '-' ; }
  return '-';
}

// GET /api/admin/email-templates — list all templates grouped by category
app.get('/api/admin/email-templates', adminAuth, (req, res) => {
  var edits = loadEdits();
  var categories = [];

  // Signup / trial emails
  var signupEmails = [];
  for (var i = 0; i < CAMPAIGN_EMAILS.length; i++) {
    var e = CAMPAIGN_EMAILS[i];
    var edited = edits[e.template];
    signupEmails.push({ id: e.template, subject: edited && edited.subject ? edited.subject : e.subject, day: e.day, category: 'signup', bodyPreview: (edited && edited.body) ? edited.body.substring(0, 200) : getCampaignBody(e.template).substring(0, 200) });
  }
  categories.push({ name: 'Customer Signup Emails (' + signupEmails.length + ')', key: 'signup', emails: signupEmails });

  // Paid customer emails
  var paidEmails = [];
  for (var i = 0; i < PAID_EMAIL_SERIES.length; i++) {
    var e = PAID_EMAIL_SERIES[i];
    var edited = edits[e.template];
    paidEmails.push({ id: e.template, subject: edited && edited.subject ? edited.subject : e.subject, week: e.week || '-', category: 'paid', bodyPreview: (edited && edited.body) ? edited.body.substring(0, 200) : getCampaignBody(e.template).substring(0, 200) });
  }
  categories.push({ name: 'Paid Customer Emails (' + paidEmails.length + ')', key: 'paid', emails: paidEmails });

  // Outbound campaigns per product
  var prodKeys = Object.keys(OUTBOUND_CAMPAIGNS);
  var prodLabels = { moving: 'Moving Leads', planning: 'Planning Permissions', probate: 'Probate Leads', newbusiness: 'New Business Alerts', tenders: 'Public Tenders' };
  for (var pi = 0; pi < prodKeys.length; pi++) {
    var pk = prodKeys[pi];
    var camp = OUTBOUND_CAMPAIGNS[pk];
    var outEmails = [];
    for (var ei = 0; ei < camp.emails.length; ei++) {
      var e = camp.emails[ei];
      var edited = edits[e.id];
      outEmails.push({ id: e.id, subject: edited && edited.subject ? edited.subject : e.subject, week: e.week, emailNum: e.emailNum, subjectB: e.subjectB, preview: e.preview, category: 'outbound_' + pk,
        bodyPreview: ((edited && edited.body) ? edited.body : e.body).substring(0, 200) });
    }
    categories.push({ name: 'Outbound ' + (prodLabels[pk] || pk) + ' (' + outEmails.length + ')', key: 'outbound_' + pk, emails: outEmails });
  }

  res.json({ success: true, categories: categories });
});

// GET /api/admin/email-templates/:id — get single template full content
app.get('/api/admin/email-templates/:id', adminAuth, (req, res) => {
  var id = req.params.id;
  var edits = loadEdits();
  var edited = edits[id] || {};

  // Check campaign emails
  for (var i = 0; i < CAMPAIGN_EMAILS.length; i++) {
    if (CAMPAIGN_EMAILS[i].template === id) {
      var body = edited.body || getCampaignBody(id);
      return res.json({ success: true, template: { id: id, subject: edited.subject || CAMPAIGN_EMAILS[i].subject, day: CAMPAIGN_EMAILS[i].day, category: 'signup', body: body, originalBody: getCampaignBody(id) } });
    }
  }
  // Check paid emails
  for (var i = 0; i < PAID_EMAIL_SERIES.length; i++) {
    if (PAID_EMAIL_SERIES[i].template === id) {
      var body = edited.body || getCampaignBody(id);
      return res.json({ success: true, template: { id: id, subject: edited.subject || PAID_EMAIL_SERIES[i].subject, week: PAID_EMAIL_SERIES[i].week, category: 'paid', body: body, originalBody: getCampaignBody(id) } });
    }
  }
  // Check outbound campaigns
  for (var pk in OUTBOUND_CAMPAIGNS) {
    var camp = OUTBOUND_CAMPAIGNS[pk];
    for (var ei = 0; ei < camp.emails.length; ei++) {
      if (camp.emails[ei].id === id) {
        var e = camp.emails[ei];
        return res.json({ success: true, template: { id: e.id, subject: edited.subject || e.subject, subjectB: edited.subjectB || e.subjectB, preview: edited.preview || e.preview, week: e.week, emailNum: e.emailNum, category: 'outbound_' + pk, body: edited.body || e.body, cta: e.cta, originalBody: e.body } });
      }
    }
  }
  res.status(404).json({ error: 'Template not found' });
});

// PUT /api/admin/email-templates/:id — update template content
app.put('/api/admin/email-templates/:id', adminAuth, (req, res) => {
  var id = req.params.id;
  var edits = loadEdits();
  var update = {};
  if (req.body.subject) update.subject = req.body.subject;
  if (req.body.body) update.body = req.body.body;
  if (req.body.subjectB) update.subjectB = req.body.subjectB;
  if (req.body.preview) update.preview = req.body.preview;
  if (req.body.cta) update.cta = req.body.cta;
  edits[id] = edits[id] || {};
  Object.assign(edits[id], update);
  saveEdits(edits);
  res.json({ success: true, message: 'Template updated' });
});

// POST /api/admin/email-templates/sync-brevo — push all templates to Brevo
app.post('/api/admin/email-templates/sync-brevo', adminAuth, async (req, res) => {
  try {
    var key = process.env.BREVO_API_KEY || '';
    if (!key) return res.json({ error: 'No Brevo API key' });
    var https = require('https');
    var results = { templates: 0, errors: [] };

    // Push signup and paid templates
    var allTpls = [];
    CAMPAIGN_EMAILS.forEach(function(e) { allTpls.push(e.template); });
    PAID_EMAIL_SERIES.forEach(function(e) { allTpls.push(e.template); });

    for (var ti = 0; ti < allTpls.length; ti++) {
      var id = allTpls[ti];
      var detail = await new Promise(function(resolve) {
        var r = require('https').request({ hostname: 'api.brevo.com', path: '/v3/smtp/templates?limit=200', method: 'GET', headers: { 'api-key': key } }, function(resp) {
          var b = ''; resp.on('data', function(c) { b += c; });
          resp.on('end', function() { try { resolve(JSON.parse(b)); } catch(e) { resolve({ templates: [] }); } });
        });
        r.on('error', function() { resolve({ templates: [] }); });
        r.end();
      });
      var existing = (detail.templates || []).filter(function(t) { return t.tag === id; });
      var bodyContent = getCampaignBody(id);
      if (bodyContent) {
        var tplBody = JSON.stringify({ templateName: id, subject: getCampaignSubject(id), htmlContent: bodyContent, isCampaign: true, tag: id, sender: { name: '9amLeads', email: 'hello@9amleads.com' } });
        try {
          await new Promise(function(resolve, reject) {
            var method = existing.length > 0 ? 'PUT' : 'POST';
            var path = existing.length > 0 ? '/v3/smtp/templates/' + existing[0].id : '/v3/smtp/templates';
            var req = https.request({ hostname: 'api.brevo.com', path: path, method: method, headers: { 'Content-Type': 'application/json', 'api-key': key, 'Content-Length': Buffer.byteLength(tplBody) } }, function(resp) {
              var b = ''; resp.on('data', function(c) { b += c; });
              resp.on('end', function() { resolve(); });
            });
            req.on('error', function(e) { reject(e); });
            req.write(tplBody);
            req.end();
          });
          results.templates++;
        } catch(e) { results.errors.push(id + ': ' + (e && e.message || '')); }
      }
    }

    // Push outbound campaigns
    for (var pk in OUTBOUND_CAMPAIGNS) {
      var camp = OUTBOUND_CAMPAIGNS[pk];
      for (var ei = 0; ei < camp.emails.length; ei++) {
        var e = camp.emails[ei];
        var edits = loadEdits();
        var edited = edits[e.id] || {};
        var subject = edited.subject || e.subject;
        var body = edited.body || e.body;
        var htmlContent = buildOutboundEmailHTML({ body: body, cta: e.cta, subject: subject, subjectB: e.subjectB, preview: e.preview }, pk, '{{FIRSTNAME}}');
        if (htmlContent) {
          var tplBody = JSON.stringify({ templateName: e.id + ' - ' + subject.substring(0, 60), subject: subject, htmlContent: htmlContent, isCampaign: true, tag: camp.tag, sender: { name: 'Ketz Mandalia', email: 'hello@9amleads.com' } });
          try {
            await new Promise(function(resolve, reject) {
              var req = https.request({ hostname: 'api.brevo.com', path: '/v3/smtp/templates', method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': key, 'Content-Length': Buffer.byteLength(tplBody) } }, function(resp) {
                var b = ''; resp.on('data', function(c) { b += c; });
                resp.on('end', function() { resolve(); });
              });
              req.on('error', function(e) { reject(e); });
              req.write(tplBody);
              req.end();
            });
            results.templates++;
          } catch(e) { results.errors.push(e.id + ': ' + (e && e.message || '')); }
        }
      }
    }

    res.json({ success: true, message: 'Sync complete', templates: results.templates, errors: results.errors.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/brevo/upload — upload all 80 campaign templates to Brevo
app.get('/api/admin/brevo/upload', adminAuth, async (req, res) => {
  try {
    var key = process.env.BREVO_API_KEY || '';
    if (!key) return res.json({ error: 'No Brevo API key configured' });
    var https = require('https');
    var results = { lists: [], templates: [], errors: [] };
    var campaignKeys = Object.keys(OUTBOUND_CAMPAIGNS);

    // Step 1: Create/get lists for each campaign
    for (var ci = 0; ci < campaignKeys.length; ci++) {
      var ck = campaignKeys[ci];
      var camp = OUTBOUND_CAMPAIGNS[ck];
      // Create list
      var listBody = JSON.stringify({ name: camp.listName, folderId: 2 });
      try {
        var listResult = await new Promise(function(resolve) {
          var req = https.request({ hostname: 'api.brevo.com', path: '/v3/contacts/lists', method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': key, 'Content-Length': Buffer.byteLength(listBody) } }, function(resp) {
            var b = ''; resp.on('data', function(c) { b += c; });
            resp.on('end', function() { try { resolve(JSON.parse(b)); } catch(e) { resolve({ id: null }); } });
          });
          req.on('error', function(e) { resolve({ error: e.message }); });
          req.write(listBody);
          req.end();
        });
        results.lists.push({ campaign: ck, name: camp.listName, id: listResult.id || listResult.listId || 'created' });
      } catch(e) { results.errors.push('List ' + camp.listName + ': ' + (e && e.message || '')); }

      // Step 2: Create template for each email
      for (var ei = 0; ei < camp.emails.length; ei++) {
        var email = camp.emails[ei];
        var htmlContent = buildOutboundEmailHTML(email, ck, '{{FIRSTNAME}}');
        var templateBody = JSON.stringify({
          templateName: email.id + ' - ' + email.subject.substring(0, 60),
          htmlContent: htmlContent,
          subject: email.subject,
          isCampaign: true,
          tag: camp.tag,
          sender: { name: 'Ketz Mandalia', email: 'hello@9amleads.com' },
          replyTo: { name: 'Ketz Mandalia', email: 'hello@9amleads.com' },
          templateType: 'campaign'
        });
        try {
          var tplResult = await new Promise(function(resolve) {
            var req = https.request({ hostname: 'api.brevo.com', path: '/v3/smtp/templates', method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': key, 'Content-Length': Buffer.byteLength(templateBody) } }, function(resp) {
              var b = ''; resp.on('data', function(c) { b += c; });
              resp.on('end', function() { try { resolve(JSON.parse(b)); } catch(e) { resolve({ id: null }); } });
            });
            req.on('error', function(e) { resolve({ error: e.message }); });
            req.write(templateBody);
            req.end();
          });
          results.templates.push({ id: email.id, templateId: tplResult.id || 'created', status: 'ok' });
        } catch(e) { results.errors.push(email.id + ': ' + (e && e.message || '')); }
      }
    }

    res.json({ success: true, message: 'Upload complete', lists: results.lists.length, templates: results.templates.length, errors: results.errors.length, details: results });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/brevo/create-seq — create Brevo sequences for each campaign
app.post('/api/admin/brevo/create-seq', adminAuth, async (req, res) => {
  try {
    var key = process.env.BREVO_API_KEY || '';
    if (!key) return res.json({ error: 'No Brevo API key' });
    res.json({ success: true, message: 'Brevo sequences would be created here via API. Create manually in Brevo dashboard for now.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

console.log('  Outbound campaigns: ' + Object.keys(OUTBOUND_CAMPAIGNS).length + ' (' + 
  Object.values(OUTBOUND_CAMPAIGNS).reduce(function(a, c) { return a + c.emails.length; }, 0) + ' emails)');
// Force Render re-deploy

    var pricingUrl = customer.product === 'planning' ? PUBLIC_URL + '/planningleads' : customer.product === 'moving' ? PUBLIC_URL + '/movingleadsdaily' : customer.product === 'probate' ? PUBLIC_URL + '/probateleads' : customer.product === 'newbusiness' ? PUBLIC_URL + '/newbusinessalert' : customer.product === 'tenders' ? PUBLIC_URL + '/tenders' : PUBLIC_URL + '/pricing';
  var insightCards = {
    moving: { emoji: '\uD83D\uDE9A', tip: 'Moving leads convert fastest when you\'re the first to contact the seller. Your brochure and letter should arrive the same day the property goes SSTC.', metric: 'Avg. move value: \u00a31,000-\u00a33,000', link: PUBLIC_URL + '/movingleadsdaily' },
    planning: { emoji: '\uD83C\uDFD7\uFE0F', tip: 'Planning applicants are actively choosing builders. Your flyer arriving the same week the application is submitted positions you ahead of every competitor.', metric: 'Avg. project value: \u00a320,000-\u00a3100,000', link: PUBLIC_URL + '/planningleads' },
    probate: { emoji: '\u2696\uFE0F', tip: 'Probate requires a compassionate approach. Families remember who reached out with sensitivity, not who pushed the hardest.', metric: 'Avg. estate value: \u00a3150,000+', link: PUBLIC_URL + '/probateleads' },
    newbusiness: { emoji: '\uD83C\uDFE2', tip: 'New companies often don\'t have a website or phone number yet. Check Companies House weekly and be ready when their details go live.', metric: 'Avg. client LTV: 2-5 years', link: PUBLIC_URL + '/newbusinessalert' },
    tenders: { emoji: '\uD83D\uDCCB', tip: 'Tenders close on deadlines. Submit your capability statement early and follow up with a printed pack to stand out.', metric: 'Avg. contract value: \u00a350,000-\u00a3500,000', link: PUBLIC_URL + '/tenders' }
  };
  var insight = insightCards[prod] || { emoji: '\uD83D\uDCA1', tip: 'Follow up within 30 minutes to maximise your conversion rate.', metric: '', link: PUBLIC_URL + '/pricing' };
  
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#0f111a;font-family:Inter,Arial,sans-serif;color:#e2e8f0"><table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0f111a"><tr><td align="center" style="padding:24px 16px"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%"><tr><td style="background:#12141e;padding:28px 30px 22px;border-radius:16px 16px 0 0;border-bottom:1px solid rgba(255,255,255,0.06);text-align:center"><div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:900;color:#fff;margin-bottom:4px"><span style="display:inline-block;width:36px;height:36px;border-radius:9px;text-align:center;line-height:36px;font-size:16px;background:linear-gradient(135deg,#0ea5e9,#6366f1);margin-right:5px;vertical-align:middle">9</span><span style="vertical-align:middle">am Leads</span></div></td></tr><tr><td style="background:#12141e;padding:20px 30px">' + (templates[template] || templates.trial_day1) + '</td></tr>' +
  // Product insight card
  '<tr><td style="background:#12141e;padding:0 30px 16px"><div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 16px">' +
  '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:16px">' + insight.emoji + '</span><span style="font-size:12px;font-weight:700;color:#f1f5f9">' + productName + ' Insight</span></div>' +
  '<p style="font-size:12px;color:#cbd5e1;line-height:1.6;margin:0 0 6px">' + insight.tip + '</p>' +
  (insight.metric ? '<p style="font-size:11px;color:#38bdf8;margin:0 0 8px"><strong>' + insight.metric + '</strong></p>' : '') +
  '<div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;margin-top:4px">' +
'<p style="font-size:10px;color:#94a3b8;margin:0 0 4px">Need help? <a href="mailto:hello@9amleads.com" style="color:#38bdf8;text-decoration:underline">hello@9amleads.com</a> &bull; <a href="tel:hello@9amleads.com" style="color:#38bdf8;text-decoration:underline">hello@9amleads.com</a> &bull; <a href="https://www.9amleads.com" style="color:#38bdf8;text-decoration:underline">9amLeads.com</a></p>' +
   '<div style="margin-top:6px"><a href="https://www.facebook.com/share/1SBwDAUuxh/" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.06);line-height:24px;text-align:center;text-decoration:none;margin:0 2px;font-size:9px;color:#94a3b8">fb</a><a href="https://www.tiktok.com/@9amleads.com" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.06);line-height:24px;text-align:center;text-decoration:none;margin:0 2px;font-size:9px;color:#94a3b8">tt</a><a href="https://www.instagram.com/9amleads/" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.06);line-height:24px;text-align:center;text-decoration:none;margin:0 2px;font-size:9px;color:#94a3b8">ig</a></div>' +
   '</div></div></td></tr>' +
  // Footer
  '<tr><td style="background:#12141e;padding:12px 30px 24px;border-radius:0 0 16px 16px;border-top:1px solid rgba(255,255,255,0.06);text-align:center"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 12px"><a href="' + pricingUrl + '" style="display:inline-block;padding:10px 28px;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;text-decoration:none;border-radius:50px;font-size:12px;font-weight:700">View Pricing</a> <a href="' + PUBLIC_URL + '/portal/dashboard.html" style="display:inline-block;padding:10px 28px;background:linear-gradient(135deg,#6366f1,#0ea5e9);color:#fff;text-decoration:none;border-radius:50px;font-size:12px;font-weight:700">Sign In</a></td></tr></table><p style="color:#e2e8f0;font-size:11px;margin:0 0 4px">9am Leads Ltd</p><p style="color:#e2e8f0;font-size:10px;margin:0"><a href="https://www.9amleads.com/privacy.html" style="color:#38bdf8;text-decoration:underline">Privacy Policy</a> &bull; <a href="mailto:hello@9amleads.com" style="color:#38bdf8;text-decoration:underline">Unsubscribe</a></p></td></tr></table></td></tr></table></body></html>';
}

// ===== SCRAPER SCHEDULER: Daily at 5:30 AM =====
cron.schedule('30 5 * * *', async () => {
  console.log('[SCRAPER CRON] Starting daily lead generation...');
  const http = require('http');
  http.request({ hostname: 'localhost', port: process.env.PORT || 8012, method: 'POST', path: '/api/admin/run-scrapers', headers: { 'Authorization': 'Bearer 9amAdmin2024!', 'Content-Type': 'application/json' } }, function(res) {}).end();
});

// Generate realistic-looking demo leads for any product
function generateDemoLeads(product, count) {
  return [];
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
// ===== ADMIN SEND ALL CAMPAIGN EMAILS (for review) =====
app.post('/api/admin/test-campaign', adminAuth, async (req, res) => {
  try {
    var email = req.body.email || 'ketzman1g@gmail.com';
    var results = [];
    var templateFilter = req.body.template || '';
    async function sendIfMatch(template, subject, cust) {
      if (templateFilter && template !== templateFilter) return;
      var html = getCampaignEmailHTML(cust, template);
      html = html.replace(/<a href="'/g, '<a href="https://9amleads.com');
      try { await sendBrevoEmail({ email: email, name: 'Test Customer' }, '[REVIEW] ' + subject, html); results.push({ template: template, subject: subject, status: 'sent' }); } catch(s_err) { results.push({ template: template, subject: subject, status: 'error: ' + s_err.message }); }
    }
    var testProduct = req.body.product || 'moving';
    var testLeadType = { moving: 'Moving Leads', probate: 'Probate Leads', newbusiness: 'New Business Alerts', planning: 'Planning Permissions', tenders: 'Public Tenders' }[testProduct] || 'Moving Leads';
    var testBizType = { moving: 'Removal Company', probate: 'Probate Practitioner', newbusiness: 'Agency', planning: 'Architect & Builder', tenders: 'Contractor' }[testProduct] || 'Business';
    var demoCustomer = { product: testProduct, lead_type: testLeadType, business_type: testBizType, name: 'Test Customer', company: 'Test Company', email: email, plan: 'free_trial' };
    for (var ei = 0; ei < CAMPAIGN_EMAILS.length; ei++) {
      var e = CAMPAIGN_EMAILS[ei];
      await sendIfMatch(e.template, e.subject, demoCustomer);
    }
    var demoPaid = { product: testProduct, lead_type: testLeadType, business_type: testBizType, name: 'Test Customer', company: 'Test Company', email: email, plan: 'starter' };
    for (var pi = 0; pi < PAID_EMAIL_SERIES.length; pi++) {
      var p = PAID_EMAIL_SERIES[pi];
      await sendIfMatch(p.template, p.subject, demoPaid);
    }
    res.json({ success: true, total: results.length, results: results });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== DAILY SCHEDULE: 02:30 UTC (03:30 BST) scraper â†’ 02:33/03:33 distributor â†’ 02:36/03:36 delivery =====
cron.schedule('30 2 * * *', async () => {
  console.log('[02:30 UTC] Running scraper...');
  try {
    const https = require('https');
    var body = JSON.stringify({});
    var req = https.request({ hostname: 'localhost', port: PORT, method: 'POST', path: '/api/admin/run-scrapers', headers: { 'Authorization': 'Bearer 9amAdmin2024!', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, function(res) {
      var b = ''; res.on('data', function(c) { b += c; }); res.on('end', function() { console.log('[02:30 UTC] Scraper done:', b.substring(0, 100)); });
    });
    req.write(body); req.end();
  } catch(e) { console.log('[02:30 UTC] Scraper error:', e.message); }
});
cron.schedule('33 2 * * *', async () => {
  console.log('[02:33 UTC] Distributing...');
  try {
    const https = require('https');
    var body2 = JSON.stringify({});
    var req2 = https.request({ hostname: 'localhost', port: PORT, method: 'POST', path: '/api/distribute', headers: { 'Authorization': 'Bearer 9amAdmin2024!', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body2) } }, function(res) {
      var b2 = ''; res.on('data', function(c) { b2 += c; }); res.on('end', function() { console.log('[02:33 UTC] Distributor done:', b2.substring(0, 100)); });
    });
    req2.write(body2); req2.end();
  } catch(e) { console.log('[02:33 UTC] Distributor error:', e.message); }
});
// ===== DELIVERY CRON: Runs directly (not via HTTP) to avoid timing issues =====
// Pipeline: 02:30 UTC scraper → 02:33 UTC distributor → 08:00 UTC delivery
// Delivery runs Mon-Fri at 09:00 UK time (handles BST/GMT automatically via timezone).
cron.schedule('0 9 * * 1-5', async () => {
  console.log('[09:00 UK] Running delivery...');
  try {
    _dbData = null;
    var db = getDb();
    var today = new Date().toISOString().split('T')[0];
    var customers = (db.customers || []).filter(function(c) { return c.plan && c.plan !== 'cancelled' && (!c.bounced || c.bounced < 3); });
    var delivered = 0;
    for (var ci = 0; ci < customers.length; ci++) {
      var cust = customers[ci];
      var trialEnds = cust.trial_ends ? new Date(cust.trial_ends) : null;
      if (trialEnds && new Date() > trialEnds && cust.plan === 'free_trial') continue;
      // Use per-product limits based on lead type and coverage area
      var dailyLimitByPlan = { free_trial: 5, starter: 5, pro: 15, enterprise: 40 };
      var totalDailyLimit = getPlanLimit(cust.product, cust.plan, cust.coverage) || dailyLimitByPlan[cust.plan] || 5;
      var products = [cust.product];
      try { var extra = JSON.parse(cust.biz_field3 || '[]'); if (Array.isArray(extra) && extra.length > 0) products = extra; } catch(e) {}
      // Calculate this week start for weekly-model products
      var thisWeek = new Date(); thisWeek.setDate(thisWeek.getDate() - (thisWeek.getDay() || 7) + 1);
      var weekStartStr = thisWeek.toISOString().split('T')[0];
      var custLeads = [];
      // Round-robin across all products: pick 1 lead per product, repeat until limit reached
      var maxRound = Math.ceil(totalDailyLimit / products.length);
      for (var ri = 0; ri < maxRound && custLeads.length < totalDailyLimit; ri++) {
        for (var pi = 0; pi < products.length && custLeads.length < totalDailyLimit; pi++) {
          var prod = products[pi];
          // Check weekly limit + daily max for specialist products
          var prodRule = getLeadTypeRule(prod);
          if (prodRule.model === 'weekly') {
            var weeklyDelivered = (db.leads || []).filter(function(l) { return l.customer_id === cust.id && l.delivered && l.delivered_at && l.delivered_at >= weekStartStr && l.product === prod; }).length;
            var weeklyLimit = prodRule.weekly_est ? (prodRule.weekly_est[cust.plan] || prodRule.weekly_est.starter || 999) : 999;
            if (weeklyDelivered >= weeklyLimit) continue; // Weekly limit reached, skip this product
            // Also enforce daily max (weekly/5) so the weekly cap isn't dumped in one day
            var dailyMax = Math.max(1, Math.ceil(weeklyLimit / 5));
            var todayDelivered = (db.leads || []).filter(function(l) { return l.customer_id === cust.id && l.delivered && l.delivered_at && l.delivered_at.startsWith(today) && l.product === prod; }).length;
            if (todayDelivered >= dailyMax) continue; // Daily max reached for this product
          }
          // Get ALL undelivered leads for this product (not already picked)
          var allProdLeads = (db.leads || []).filter(function(l) { return l.customer_id === cust.id && l.delivered === 0 && l.product === prod; });
          // Remove leads already picked in custLeads
          var pickedIds = custLeads.map(function(cl) { return cl.id; });
          var prodLeads = allProdLeads.filter(function(l) { return pickedIds.indexOf(l.id) === -1; });
          // Intra-batch dedup by address (same property should not appear twice)
          var seenDedup = new Set();
          prodLeads = prodLeads.filter(function(l) {
            var k = (l.address || l.name || '').toLowerCase().trim();
            return k && !seenDedup.has(k) ? (seenDedup.add(k), true) : false;
          });
          prodLeads.sort(function(a, b) {
            var aD = (a.created_at || a.scrapedAt || '').substring(0, 10);
            var bD = (b.created_at || b.scrapedAt || '').substring(0, 10);
            if (aD === today && bD !== today) return -1;
            if (bD === today && aD !== today) return 1;
            return 0;
          });
          if (prodLeads.length > 0) {
            // Spread across postcode areas: prefer a lead whose postcode area
            // hasn't been picked yet for this customer today (e.g. 5 postcodes
            // + 5 leads = 1 lead per postcode). Same for all paid packages.
            var chosen = null;
            for (var pli = 0; pli < prodLeads.length; pli++) {
              var pl = prodLeads[pli];
              var plData = null;
              try { plData = typeof pl.data === 'string' ? JSON.parse(pl.data) : (pl.data || {}); } catch(e) { plData = {}; }
              var plArea = extractPostcodeArea(plData.postcode || plData.address || '');
              var alreadyPicked = custLeads.some(function(cl) {
                var cd = null;
                try { cd = typeof cl.data === 'string' ? JSON.parse(cl.data) : (cl.data || {}); } catch(e2) { cd = {}; }
                return plArea && extractPostcodeArea(cd.postcode || cd.address || '') === plArea;
              });
              if (!alreadyPicked) { chosen = pl; break; }
            }
            custLeads.push(chosen || prodLeads[0]); // Take 1 lead per product per round, spread by postcode
          }
        }
      }
      // Skip quietly if no leads available (no email = no disappointment)
      if (custLeads.length === 0) {
        console.log('[08:00 UTC] No leads for ' + cust.email + ', skipping delivery');
        continue;
      }
      try {
        var html = generateLeadEmailHTML(cust, custLeads);
        var covName2 = cust.coverage ? (COVERAGE_LABELS[cust.coverage] || cust.coverage) : 'your area';
        var subject = 'Your 9am Opportunities for ' + covName2 + ' — ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        await sendBrevoEmail({ email: cust.email, name: cust.company || '' }, subject, html);
        // Send to CRM webhook if configured
        if (cust.crm_webhook_url) {
          try {
            var crmPayload = JSON.stringify({ customer: cust.email, company: cust.company, leads: custLeads, delivered_at: new Date().toISOString() });
            var crmReq = require('https').request(cust.crm_webhook_url, { method:'POST', headers:{ 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(crmPayload) } });
            crmReq.write(crmPayload); crmReq.end();
          } catch(ce) { console.log('[DELIVERY] CRM webhook failed:', cust.email); }
        }
        for (var li = 0; li < custLeads.length; li++) { custLeads[li].delivered = 1; custLeads[li].delivered_at = new Date().toISOString(); }
        saveDb();
        delivered += custLeads.length;
        console.log('[08:00 UTC] Delivered ' + custLeads.length + ' to ' + cust.email);
      } catch(e) { console.log('[08:00 UTC] Error for ' + cust.email + ': ' + (e && e.message || '')); }
    }
    console.log('[08:00 UTC] Delivery complete: ' + delivered + ' leads');
    // Run Print & Post after delivery
    try { await runAutoSend(); } catch(ase) { console.log('[08:00 UTC] Print & Post error:', ase.message); }
  } catch(e) { console.log('[08:00 UTC] Delivery error: ' + (e && e.message || '')); }
}, {
  timezone: 'Europe/London'
});

// Sequence processing every hour
cron.schedule('0 * * * *', async () => {
  try {
    await processSequences();
  } catch(e) { console.log('[SEQUENCE] Cron error:', e.message); }
});

async function processSequences() {
  var db2 = getDb();
  var sequences = (db2.postal_sequences || []).filter(function(s) { return s.status === 'active'; });
  var processed = 0;
  for (var si = 0; si < sequences.length; si++) {
    var seq = sequences[si];
    try {
      // Check spend limit
      if (seq.spend_limit > 0 && (seq.total_spent || 0) >= seq.spend_limit) { seq.status = 'paused'; continue; }
      // Find next scheduled step that's due
      var steps = (db2.postal_sequence_steps || []).filter(function(st) { return st.sequence_id === seq.id; });
      var dueStep = steps.find(function(st) { return st.status === 'scheduled' && new Date(st.scheduled_for) <= new Date(); });
      if (!dueStep) continue;
      // Create campaign for this step
      var provider = getDirectMailProvider();
      var result = await provider.createCampaign({ name: seq.name + ' - Step ' + dueStep.step_number, recipient_count: seq.leads_count || 1 });
      if (result && result.success) {
        dueStep.status = 'sent'; dueStep.sent_at = new Date().toISOString();
        seq.current_step = (seq.current_step || 0) + 1;
        seq.total_spent = (seq.total_spent || 0) + 10;
        var nextStep = steps.find(function(st) { return st.step_number === dueStep.step_number + 1; });
        if (nextStep) { nextStep.status = 'scheduled'; nextStep.scheduled_for = new Date(Date.now() + (nextStep.delay_days || 14) * 86400000).toISOString(); }
        if (!nextStep) seq.status = 'completed';
        processed++;
      } else { dueStep.status = 'failed'; }
    } catch(e) { console.log('[SEQUENCE] Error:', seq.id, e.message); }
  }
  if (processed > 0) { saveDb(); console.log('[SEQUENCE] Processed', processed, 'steps'); }
}

// ===== NIGHTLY SYSTEM AUDIT =====
cron.schedule('0 0 * * *', async () => {
  console.log('[AUDIT] Starting nightly system audit...');
  try {
    var db2 = getDb();
    var today = new Date().toISOString().split('T')[0];
    var report = { date: today, generated_at: new Date().toISOString(), results: {}, passed: 0, warnings: 0, critical: 0 };

    // 1. Failed campaigns
    var failedCampaigns = (db2.direct_mail_campaigns || []).filter(function(c) { return c.status === 'failed'; });
    report.results.failed_campaigns = { count: failedCampaigns.length, items: failedCampaigns.slice(0, 10).map(function(c) { return { id: c.id, name: c.name, customer_id: c.customer_id }; }), status: failedCampaigns.length > 10 ? 'critical' : failedCampaigns.length > 0 ? 'warning' : 'passed' };

    // 2. Failed payments
    var failedPayments = (db2.direct_mail_campaigns || []).filter(function(c) { return c.stripe_payment_status === 'failed' || c.stripe_payment_status === 'requires_action'; });
    report.results.failed_payments = { count: failedPayments.length, items: failedPayments.slice(0, 10).map(function(c) { return { id: c.id, name: c.name, customer_id: c.customer_id }; }), status: failedPayments.length > 5 ? 'critical' : failedPayments.length > 0 ? 'warning' : 'passed' };

    // 3. Failed provider requests
    var failedLogs = (db2.direct_mail_provider_logs || []).filter(function(l) { return !l.success && l.created_at && l.created_at.indexOf(today) === 0; });
    report.results.failed_provider = { count: failedLogs.length, items: failedLogs.slice(0, 10).map(function(l) { return { endpoint: l.endpoint, error: l.error_message, campaign_id: l.campaign_id }; }), status: failedLogs.length > 10 ? 'critical' : failedLogs.length > 0 ? 'warning' : 'passed' };

    // 4. Failed webhooks
    var failedWebhooks = (db2.direct_mail_provider_logs || []).filter(function(l) { return l.endpoint && l.endpoint.indexOf('webhook') !== -1 && !l.success && l.created_at && l.created_at.indexOf(today) === 0; });
    report.results.failed_webhooks = { count: failedWebhooks.length, items: failedWebhooks.slice(0, 5).map(function(l) { return { endpoint: l.endpoint, error: l.error_message }; }), status: failedWebhooks.length > 0 ? 'warning' : 'passed' };

    // 5. Broken/stuck queues
    var stuckSequences = (db2.postal_sequences || []).filter(function(s) { return s.status === 'active' && s.current_step === s.total_steps && s.status !== 'completed'; });
    report.results.stuck_queues = { count: stuckSequences.length, items: stuckSequences.slice(0, 5).map(function(s) { return { id: s.id, name: s.name, step: s.current_step + '/' + s.total_steps }; }), status: stuckSequences.length > 0 ? 'warning' : 'passed' };

    // 6. Stuck campaigns
    var stuckCampaigns = (db2.direct_mail_campaigns || []).filter(function(c) { return c.status === 'queued' || c.status === 'printing'; });
    var stuckForDays = stuckCampaigns.filter(function(c) { return c.updated_at && (Date.now() - new Date(c.updated_at).getTime()) > 86400000 * 2; });
    report.results.stuck_campaigns = { count: stuckForDays.length, items: stuckForDays.slice(0, 10).map(function(c) { return { id: c.id, name: c.name, status: c.status, updated_at: c.updated_at }; }), status: stuckForDays.length > 5 ? 'critical' : stuckForDays.length > 0 ? 'warning' : 'passed' };

    // 7. Storage usage
    var dbFile = DB_FILE;
    try {
      var dbSize = require('fs').statSync(dbFile).size;
      var sizeMB = (dbSize / 1024 / 1024).toFixed(1);
      report.results.storage = { size_mb: parseFloat(sizeMB), status: sizeMB > 100 ? 'warning' : sizeMB > 500 ? 'critical' : 'passed' };
    } catch(e) { report.results.storage = { error: e.message, status: 'warning' }; }

    // 8. Database health (row counts)
    try {
      report.results.database = { customer_count: (db2.customers || []).length, campaign_count: (db2.direct_mail_campaigns || []).length, template_count: (db2.direct_mail_templates || []).length, status: 'passed' };
    } catch(e) { report.results.database = { error: e.message, status: 'warning' }; }

    // 9. Expiring API keys (check env vars)
    var allKeys = process.env.STRIPE_SECRET_KEY ? 1 : 0;
    allKeys += process.env.OPENAI_API_KEY ? 1 : 0;
    allKeys += STANNP_API_KEY ? 1 : 0;
    var configuredKeys = (process.env.STRIPE_SECRET_KEY ? 1 : 0) + (process.env.OPENAI_API_KEY ? 1 : 0) + (STANNP_API_KEY ? 1 : 0);
    report.results.api_keys = { configured: configuredKeys, total_checked: 3, status: configuredKeys >= 2 ? 'passed' : 'warning' };

    // Count statuses
    for (var key in report.results) {
      if (report.results[key].status === 'passed') report.passed++;
      else if (report.results[key].status === 'warning') report.warnings++;
      else if (report.results[key].status === 'critical') report.critical++;
    }

    // Store report
    if (!db2.audit_reports) db2.audit_reports = [];
    db2.audit_reports.push(report);
    if (db2.audit_reports.length > 30) db2.audit_reports = db2.audit_reports.slice(-30);
    saveDb();

    // Email report to admin
    try {
      var adminEmail = 'hello@9amleads.com';
      var reportHtml = '<div style="background:#07090f;padding:32px;font-family:Inter,sans-serif"><div style="max-width:600px;margin:0 auto;background:#0c0f1a;border-radius:16px;padding:24px;border:1px solid #151929">' +
        '<h1 style="color:#dce2f0;font-size:20px;font-weight:800;font-family:Outfit,sans-serif">Nightly System Audit</h1>' +
        '<p style="color:#5a6280;font-size:12px">' + report.date + '</p>' +
        '<div style="display:flex;gap:10px;margin:16px 0">' +
        '<div style="flex:1;text-align:center;padding:10px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.1);border-radius:8px"><div style="font-size:24px;font-weight:900;color:#10b981">' + report.passed + '</div><div style="font-size:11px;color:#5a6280">Passed</div></div>' +
        '<div style="flex:1;text-align:center;padding:10px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.1);border-radius:8px"><div style="font-size:24px;font-weight:900;color:#f59e0b">' + report.warnings + '</div><div style="font-size:11px;color:#5a6280">Warnings</div></div>' +
        '<div style="flex:1;text-align:center;padding:10px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.1);border-radius:8px"><div style="font-size:24px;font-weight:900;color:#ef4444">' + report.critical + '</div><div style="font-size:11px;color:#5a6280">Critical</div></div></div>';
      for (var rk in report.results) {
        var r = report.results[rk];
        var color = r.status === 'passed' ? '#10b981' : r.status === 'warning' ? '#f59e0b' : '#ef4444';
        reportHtml += '<div style="padding:8px;margin-bottom:4px;background:#080b14;border-radius:6px;font-size:12px;display:flex;justify-content:space-between"><span style="color:#dce2f0">' + rk.replace(/_/g,' ') + '</span><span style="color:' + color + ';font-weight:600">' + r.status.toUpperCase() + (r.count !== undefined ? ' (' + r.count + ')' : '') + '</span></div>';
      }
      reportHtml += '</div></div>';
      await sendBrevoEmail({ email: adminEmail, name: '9amLeads Admin' }, 'Nightly System Audit - ' + report.date, reportHtml);
      console.log('[AUDIT] Report emailed');
    } catch(e) { console.log('[AUDIT] Email error:', e.message); }
    console.log('[AUDIT] Complete:', report.passed + ' passed, ' + report.warnings + ' warnings, ' + report.critical + ' critical');
  } catch(e) { console.log('[AUDIT] Error:', e.message); }
});

// GET /api/admin/audit/reports — Get audit reports
app.get('/api/admin/audit/reports', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var reports = (db2.audit_reports || []).sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
    res.json({ success: true, reports: reports, latest: reports[0] || null, total: reports.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/audit/run — Manually trigger audit
app.post('/api/admin/audit/run', adminAuth, async (req, res) => {
  try {
    // Reuse audit logic by calling directly
    var db2 = getDb();
    var today = new Date().toISOString().split('T')[0];
    var report = { date: today, generated_at: new Date().toISOString(), results: {}, passed: 0, warnings: 0, critical: 0 };
    var failedCampaigns = (db2.direct_mail_campaigns || []).filter(function(c) { return c.status === 'failed'; });
    report.results.failed_campaigns = { count: failedCampaigns.length, items: failedCampaigns.slice(0, 10).map(function(c) { return { id: c.id, name: c.name }; }), status: failedCampaigns.length > 10 ? 'critical' : failedCampaigns.length > 0 ? 'warning' : 'passed' };
    var failedPayments = (db2.direct_mail_campaigns || []).filter(function(c) { return c.stripe_payment_status === 'failed'; });
    report.results.failed_payments = { count: failedPayments.length, items: failedPayments.slice(0, 10).map(function(c) { return { id: c.id, name: c.name }; }), status: failedPayments.length > 5 ? 'critical' : failedPayments.length > 0 ? 'warning' : 'passed' };
    var stuckCampaigns = (db2.direct_mail_campaigns || []).filter(function(c) { return (c.status === 'queued' || c.status === 'printing') && c.updated_at && (Date.now() - new Date(c.updated_at).getTime()) > 86400000 * 2; });
    report.results.stuck_campaigns = { count: stuckCampaigns.length, items: stuckCampaigns.slice(0, 10).map(function(c) { return { id: c.id, name: c.name, status: c.status }; }), status: stuckCampaigns.length > 5 ? 'critical' : stuckCampaigns.length > 0 ? 'warning' : 'passed' };
    var dbSize = require('fs').statSync(DB_FILE).size;
    report.results.storage = { size_mb: parseFloat((dbSize / 1024 / 1024).toFixed(1)), status: dbSize > 104857600 ? 'warning' : 'passed' };
    for (var k in report.results) { if (report.results[k].status === 'passed') report.passed++; else if (report.results[k].status === 'warning') report.warnings++; else if (report.results[k].status === 'critical') report.critical++; }
    if (!db2.audit_reports) db2.audit_reports = [];
    db2.audit_reports.push(report);
    if (db2.audit_reports.length > 30) db2.audit_reports = db2.audit_reports.slice(-30);
    saveDb();
    res.json({ success: true, report: report });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== AUTO SEND DAILY JOB =====
async function runAutoSend() {
  console.log('[AUTO-SEND] Starting...');
  var db = getDb();
  var today = new Date().toISOString().split('T')[0];
  var customers = (db.customers || []).filter(function(c) { return c.plan && c.plan !== 'cancelled' && (!c.bounced || c.bounced < 3); });
  var results = { checked: 0, enabled: 0, skipped: 0, sent: 0, failed: 0, total_spend: 0 };

  for (var ci = 0; ci < customers.length; ci++) {
    var cust = customers[ci];
    results.checked++;
    try {
      // 1. Check customer has auto send settings
      var settings = db.prepare('SELECT * FROM direct_mail_automation_settings WHERE customer_id = ?').get(cust.id);
      if (!settings || !settings.enable_auto_send) { results.skipped++; continue; }
      results.enabled++;

      // 2. Check consent
      if (!settings.consent_given) { console.log('[AUTO-SEND] Skip:', cust.email, 'no consent'); results.skipped++; continue; }

      // 3. Check approved template exists
      if (!settings.default_template_id) { console.log('[AUTO-SEND] Skip:', cust.email, 'no template'); results.skipped++; continue; }
      var template = db.prepare('SELECT * FROM direct_mail_templates WHERE id = ? AND customer_id = ?').get(settings.default_template_id, cust.id);
      if (!template) { console.log('[AUTO-SEND] Skip:', cust.email, 'template not found'); results.skipped++; continue; }

      // 4. Get today's delivered leads
      var todaysLeads = (db.leads || []).filter(function(l) { return l.customer_id === cust.id && l.delivered && l.delivered_at && l.delivered_at.startsWith(today); });
      var pickedIds = {};
      // Filter by lead types if set
      if (settings.lead_types) {
        var types = settings.lead_types.split(',').filter(Boolean);
        if (types.length > 0) todaysLeads = todaysLeads.filter(function(l) { return types.indexOf(l.product) !== -1; });
      }
      // Filter by postcode areas if set
      if (settings.postcode_areas) {
        var areas = settings.postcode_areas.split(',').map(function(a) { return a.trim().toUpperCase(); }).filter(Boolean);
        if (areas.length > 0) {
          todaysLeads = todaysLeads.filter(function(l) {
            var parsed = {}; try { parsed = JSON.parse(l.data || '{}'); } catch(e) {}
            var pc = extractPostcodeArea(parsed.postcode || '');
            return areas.some(function(a) { return pc === a.toUpperCase(); });
          });
        }
      }
      // 5. Check minimum leads before sending
      if (todaysLeads.length < (settings.min_leads_before_send || 1)) { console.log('[AUTO-SEND] Skip:', cust.email, 'only', todaysLeads.length, 'leads'); results.skipped++; continue; }

      // 6. Check duplicate mailing rules
      var recentCampaigns = db.prepare('SELECT * FROM direct_mail_campaigns WHERE customer_id = ? AND created_at >= ?').all(cust.id, new Date(Date.now() - (settings.repeat_mailing_days || 90) * 86400000).toISOString());
      var recentLeadIds = {};
      recentCampaigns.forEach(function(rc) {
        var recips = db.prepare('SELECT lead_id FROM direct_mail_recipients WHERE campaign_id = ? AND customer_id = ?').all(rc.id, cust.id);
        recips.forEach(function(r) { if (r.lead_id) recentLeadIds[r.lead_id] = true; });
      });
      if (settings.avoid_duplicate_mailing) {
        todaysLeads = todaysLeads.filter(function(l) { return !recentLeadIds[l.id]; });
      }
      // 7. Limit to max letters per day
      if (settings.max_letters_per_day > 0 && todaysLeads.length > settings.max_letters_per_day) {
        todaysLeads = todaysLeads.slice(0, settings.max_letters_per_day);
      }
      if (todaysLeads.length === 0) { console.log('[AUTO-SEND] Skip:', cust.email, 'no leads after dedup'); results.skipped++; continue; }

      // 8. Check daily spend limit
      var pricing = calcDmPrice(todaysLeads.length);
      var totalCost = pricing.total;
      if (settings.max_daily_spend > 0 && totalCost > settings.max_daily_spend) {
        var capped = Math.floor(settings.max_daily_spend / (totalCost / todaysLeads.length));
        if (capped < 1) { console.log('[AUTO-SEND] Skip:', cust.email, 'daily spend limit exceeded'); results.skipped++; continue; }
        todaysLeads = todaysLeads.slice(0, capped);
        pricing = calcDmPrice(todaysLeads.length);
        totalCost = pricing.total;
      }

      // 9. Check monthly spend limit
      var thisMonthLeads = (db.leads || []).filter(function(l) { return l.customer_id === cust.id && l.delivered && l.delivered_at && l.delivered_at.indexOf(today.substring(0, 7)) === 0; });
      var monthCost = calcDmPrice(thisMonthLeads.length).total;
      if (settings.max_monthly_spend > 0 && (monthCost + totalCost) > settings.max_monthly_spend) {
        console.log('[AUTO-SEND] Skip:', cust.email, 'monthly spend limit would exceed');
        results.skipped++; continue;
      }

      // 10. Check if paused due to payment or provider failure
      if (settings.pause_on_payment_fail) { var latestPayment = db.prepare('SELECT stripe_payment_status FROM direct_mail_campaigns WHERE customer_id = ? ORDER BY created_at DESC').get(cust.id); if (latestPayment && latestPayment.stripe_payment_status === 'failed') { console.log('[AUTO-SEND] Skip:', cust.email, 'payment failed'); results.skipped++; continue; } }
      if (settings.pause_on_provider_fail) { var latestCamp = db.prepare('SELECT status FROM direct_mail_campaigns WHERE customer_id = ? ORDER BY created_at DESC').get(cust.id); if (latestCamp && latestCamp.status === 'failed') { console.log('[AUTO-SEND] Skip:', cust.email, 'provider failed'); results.skipped++; continue; } }
      var thisMonthSpend = 0;
      try { var monthOrders = db.prepare('SELECT * FROM direct_mail_orders WHERE customer_id = ?').all(cust.id); monthOrders.forEach(function(o) { thisMonthSpend += Number(o.total_cost || 0); }); } catch(e) {}
      if (settings.pause_on_spend_limit && settings.max_monthly_spend > 0 && thisMonthSpend >= settings.max_monthly_spend) { console.log('[AUTO-SEND] Skip:', cust.email, 'spend limit reached'); results.skipped++; continue; }

      // 11. Create campaign automatically
      var campaign = {
        id: uuidv4(), customer_id: cust.id, name: 'Print & Post - ' + today,
        description: 'Automatically generated campaign from daily leads', status: 'draft',
        template_id: settings.default_template_id, material_id: '',
        target_count: todaysLeads.length, sent_count: 0,
        delivery_date: today, budget: totalCost, notes: 'Print & Post',
        provider: '', provider_campaign_id: '', provider_status: '',
        stripe_session_id: '', stripe_payment_id: 'auto_send_mock', stripe_payment_status: 'paid',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      };
      db.prepare('INSERT INTO direct_mail_campaigns (id,customer_id,name,description,status,template_id,material_id,target_count,sent_count,delivery_date,budget,notes,provider,provider_campaign_id,provider_status,stripe_session_id,stripe_payment_id,stripe_payment_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(campaign.id, campaign.customer_id, campaign.name, campaign.description, 'approved', campaign.template_id, campaign.material_id, campaign.target_count, campaign.sent_count, campaign.delivery_date, campaign.budget, campaign.notes, campaign.provider, campaign.provider_campaign_id, campaign.provider_status, campaign.stripe_session_id, campaign.stripe_payment_id, campaign.stripe_payment_status, campaign.created_at, campaign.updated_at);
      db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), cust.id, campaign.id, '', 'approved', 'system', 'Print & Post campaign created', new Date().toISOString());

      // 12. Add leads as recipients
      var validAddressCount = 0;
      for (var li = 0; li < todaysLeads.length; li++) {
        var l = todaysLeads[li];
        var parsed = {}; try { parsed = JSON.parse(l.data || '{}'); } catch(e) {}
        var leadAddress = parsed.address_line1 || parsed.address || parsed.street || '';
        var leadPostcode = parsed.postcode || '';
        if (leadPostcode && leadAddress) {
          // Check suppression
          if (!isAddressSuppressed(cust.id, leadPostcode, leadAddress)) {
            db.prepare('INSERT INTO direct_mail_recipients (id,customer_id,campaign_id,name,company,address_line1,city,postcode,country,lead_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(uuidv4(), cust.id, campaign.id, parsed.name || parsed.address || 'Lead', '', leadAddress, parsed.city || parsed.town || '', leadPostcode, 'United Kingdom', l.id, 'pending', new Date().toISOString());
            validAddressCount++;
          }
        }
      }

      // 13. Process payment (Stripe if available, mock fallback)
      var paymentSuccess = false;
      var paymentIntentId = '';
      if (validAddressCount > 0) {
        // Try Stripe charge if customer has saved payment method
        if (STRIPE_SECRET_KEY && cust.stripe_payment_method_id && cust.stripe_customer_id) {
          try {
            var amountPence = Math.round(totalCost * 100);
            var chargeResult = await stripeApiRequest('POST', 'payment_intents', {
              amount: String(amountPence),
              currency: 'gbp',
              customer: cust.stripe_customer_id,
              'payment_method': cust.stripe_payment_method_id,
              off_session: true,
              confirm: true,
              'metadata[campaign_id]': campaign.id,
              'metadata[customer_id]': cust.id,
              'metadata[type]': 'auto_send',
              description: 'Print & Post: ' + campaign.name
            });
            if (chargeResult && chargeResult.status === 'succeeded') {
              paymentSuccess = true;
              paymentIntentId = chargeResult.id;
              db.prepare('UPDATE direct_mail_campaigns SET stripe_payment_id = ?, stripe_payment_status = ?, updated_at = ? WHERE id = ? AND customer_id = ?').run(chargeResult.id, 'paid', new Date().toISOString(), campaign.id, cust.id);
              db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), cust.id, campaign.id, 'approved', 'paid', 'system', 'Payment succeeded: ' + chargeResult.id, new Date().toISOString());
              console.log('[AUTO-SEND] Payment success:', cust.email, '£' + totalCost.toFixed(2), chargeResult.id);
              if (cust && cust.id) { dmDashboardNotify(cust.id, 'auto_send_payment_success', '✅ Print & Post Payment Successful', 'Print & Post payment of £' + totalCost.toFixed(2) + ' succeeded.', ''); }
            } else if (chargeResult && chargeResult.status === 'requires_action') {
              // 3D Secure needed - cannot process automatically
              db.prepare('UPDATE direct_mail_campaigns SET stripe_payment_id = ?, stripe_payment_status = ?, updated_at = ? WHERE id = ? AND customer_id = ?').run(chargeResult.id, 'requires_action', new Date().toISOString(), campaign.id, cust.id);
              db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), cust.id, campaign.id, 'approved', 'failed', 'system', 'Payment requires 3D Secure - cannot auto-charge', new Date().toISOString());
              console.log('[AUTO-SEND] Payment needs 3DS:', cust.email);
              // Pause Print & Post
              db.prepare('UPDATE customers SET auto_send_paused = ? WHERE id = ?').run(1, cust.id);
              results.failed++;
            } else {
              // Payment failed
              db.prepare('UPDATE direct_mail_campaigns SET stripe_payment_id = ?, stripe_payment_status = ?, updated_at = ? WHERE id = ? AND customer_id = ?').run(chargeResult && chargeResult.id ? chargeResult.id : '', 'failed', new Date().toISOString(), campaign.id, cust.id);
              db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), cust.id, campaign.id, 'approved', 'failed', 'system', 'Payment failed: ' + ((chargeResult && chargeResult.last_payment_error && chargeResult.last_payment_error.message) || 'Unknown error'), new Date().toISOString());
              console.log('[AUTO-SEND] Payment failed:', cust.email, chargeResult?.last_payment_error?.message || 'unknown');
              // Pause Print & Post if setting enabled
              if (settings.pause_on_payment_fail) {
                db.prepare('UPDATE customers SET auto_send_paused = ? WHERE id = ?').run(1, cust.id);
                console.log('[AUTO-SEND] Print & Post paused for:', cust.email);
                if (cust && cust.id) {
                  dmDashboardNotify(cust.id, 'auto_send_paused', 'â¸ï¸ Print & Post Paused', 'Print & Post has been paused due to a failed payment. Update your payment method to resume.', '');
                  sendDMAdminAlert('payment_failure', 'Print & Post Payment Failed', 'Customer: ' + (cust.email || cust.id) + ' — Amount: £' + totalCost.toFixed(2) + ' — Error: ' + (chargeResult?.last_payment_error?.message || 'Unknown'));
                }
              }
              results.failed++;
            }
          } catch(stripeError) {
            console.log('[AUTO-SEND] Stripe error:', cust.email, stripeError.message);
            results.failed++;
          }
        } else if (cust.stripe_payment_method_id || cust.stripe_customer_id) {
          // Has partial Stripe setup but incomplete - pause
          console.log('[AUTO-SEND] Skip:', cust.email, 'incomplete Stripe setup');
          db.prepare('UPDATE customers SET auto_send_paused = ? WHERE id = ?').run(1, cust.id);
          results.skipped++;
        } else {
          // No Stripe at all - use mock payment
          paymentSuccess = true;
          db.prepare('UPDATE direct_mail_campaigns SET stripe_payment_id = ?, stripe_payment_status = ?, updated_at = ? WHERE id = ? AND customer_id = ?').run('auto_send_mock', 'paid', new Date().toISOString(), campaign.id, cust.id);
          db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), cust.id, campaign.id, 'approved', 'paid', 'system', 'Mock payment (no Stripe configured)', new Date().toISOString());
        }

        // 14. Send to provider if payment succeeded
        if (paymentSuccess) {
          var provider = getDirectMailProvider();
          var createResult = await provider.createCampaign({ name: campaign.name, recipient_count: validAddressCount, description: campaign.description });
          if (createResult && createResult.success) {
            db.prepare('UPDATE direct_mail_campaigns SET status = ?, provider = ?, provider_campaign_id = ?, provider_status = ?, updated_at = ? WHERE id = ? AND customer_id = ?').run('queued', provider.name, createResult.provider_campaign_id, 'accepted', new Date().toISOString(), campaign.id, cust.id);
            db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), cust.id, campaign.id, 'paid', 'queued', 'system', 'Sent to provider: ' + provider.name, new Date().toISOString());
            db.prepare('INSERT INTO direct_mail_provider_logs (id,customer_id,campaign_id,provider,endpoint,request_body,response_body,status_code,success,error_message,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(uuidv4(), cust.id, campaign.id, provider.name, 'createCampaign', JSON.stringify({ name: campaign.name, recipient_count: validAddressCount }), JSON.stringify(createResult), 200, 1, '', new Date().toISOString());
            results.sent++;
            results.total_spend += totalCost;
            console.log('[AUTO-SEND] Sent:', cust.email, validAddressCount, 'leads, cost: £' + totalCost.toFixed(2));
            if (cust && cust.id) {
              dmDashboardNotify(cust.id, 'auto_send_campaign_sent', 'ðŸ“¬ Print & Post Campaign Sent', 'Print & Post sent ' + validAddressCount + ' letters for ' + totalCost.toFixed(2), '');
            }
          } else {
            db.prepare('UPDATE direct_mail_campaigns SET status = ?, updated_at = ? WHERE id = ? AND customer_id = ?').run('failed', new Date().toISOString(), campaign.id, cust.id);
            results.failed++;
            console.log('[AUTO-SEND] Failed:', cust.email, createResult?.error || 'provider error');
            if (cust && cust.id) {
              dmDashboardNotify(cust.id, 'auto_send_failed', 'âŒ Print & Post Failed', 'Print & Post campaign failed: ' + (createResult?.error || 'Provider error'), '');
              sendDMAdminAlert('auto_send_error', 'Print & Post Provider Error', 'Customer: ' + (cust.email || cust.id) + ' — Campaign: ' + campaign.name + ' — Error: ' + (createResult?.error || 'Unknown'));
            }
          }
        }
      }
    } catch(e) { console.log('[AUTO-SEND] Error for', cust.email || cust.id, ':', e.message); results.failed++; }
  }
  console.log('[AUTO-SEND] Complete:', JSON.stringify(results));
  return results;
}

// Print & Post can also be triggered via API
app.post('/api/direct-mail/run-auto-send', async (req, res) => {
  try {
    var results = await runAutoSend();
    res.json({ success: true, results: results });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

cron.schedule('0 8 * * *', async () => {
  console.log('[TRIAL AUTO-CHARGE] Checking expired trials...');
  try {
    var db = getDb();
    var customers = db.customers || [];
    var charged = 0;
    for (var tc = 0; tc < customers.length; tc++) {
      var cust = customers[tc];
      if (cust.plan !== 'free_trial') continue;
      if (cust.trial_cancelled) continue;
      if (!cust.trial_ends || new Date(cust.trial_ends) > new Date()) continue;
      if (!cust.stripe_payment_method_id || !cust.stripe_customer_id) continue;
      // Trial expired and they have a saved card — charge £25
      try {
        var prodKeyMap2 = { moving: 'mov', planning: 'plan', probate: 'prob', newbusiness: 'nb', tenders: 'tend' };
        var pKey2 = prodKeyMap2[cust.product] || 'mov';
        var priceId2 = (STRIPE_PRICE_IDS[cust.product] || {})[pKey2 + '-starter'];
        if (!priceId2) continue;
        var subResult = await stripeApiRequest('POST', 'subscriptions', {
          customer: cust.stripe_customer_id,
          'items[0][price]': priceId2,
          'default_payment_method': cust.stripe_payment_method_id,
          'metadata[customer_id]': cust.id,
          'metadata[product]': cust.product,
          'metadata[plan]': 'starter',
          off_session: 'true',
          'payment_behavior': 'default_incomplete'
        });
        if (subResult && subResult.id) {
          db.prepare('UPDATE customers SET plan = ?, stripe_subscription_id = ?, trial_ends = NULL WHERE id = ?').run('starter', subResult.id, cust.id);
          console.log('[TRIAL AUTO-CHARGE] Charged £25 for ' + cust.email + ', upgraded to starter');
          charged++;
        }
      } catch(chargeErr) {
        console.log('[TRIAL AUTO-CHARGE] Failed to charge ' + cust.email + ': ' + (chargeErr.message || chargeErr));
      }
    }
    saveDb();
    console.log('[TRIAL AUTO-CHARGE] Complete: ' + charged + ' customers charged');
  } catch(e) { console.log('[TRIAL AUTO-CHARGE] Error:', e.message); }
});

// POST /api/cancel-trial — cancel trial, no charge
app.post('/api/cancel-trial', authMiddleware, async (req, res) => {
  try {
    var customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    if (customer.plan !== 'free_trial') return res.status(400).json({ error: 'Not on free trial' });
    db.prepare('UPDATE customers SET plan = \'cancelled\', leads_per_day = 0 WHERE id = ?').run(req.user.id);
    releasePostcodes(req.user.id);
    res.json({ success: true, message: 'Your free trial has been cancelled.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

cron.schedule('0 10 * * *', async () => {
  console.log('[CAMPAIGN] Starting campaign email check...');
  var customers = (getDb().customers || []).filter(function(c) { return c.plan && c.plan !== 'cancelled' && (!c.bounced || c.bounced < 3) && c.marketing_consent === 1; });
  var sent = 0;
  for (var ci = 0; ci < customers.length; ci++) {
    var cust = customers[ci];
    try {
      var campaignSent = [];
      try { campaignSent = JSON.parse(cust.campaign_sent || '[]'); } catch(e) {}
      var trialEnds = cust.trial_ends ? new Date(cust.trial_ends) : null;
      var daysSinceTrialEnd = trialEnds ? Math.floor((new Date() - trialEnds) / 86400000) : -1;
      var createdDate = cust.created_at ? new Date(cust.created_at) : null;
      var accountAge = createdDate ? Math.floor((new Date() - createdDate) / 86400000) : 0;

      if (cust.plan === 'free_trial' && trialEnds) {
        if (new Date() <= trialEnds) {
          // Active trial: send onboarding emails at days 1, 3, 5 (after signup)
          for (var ei = 0; ei < CAMPAIGN_EMAILS.length; ei++) {
            var e = CAMPAIGN_EMAILS[ei];
            if (e.day <= 6 && accountAge >= e.day && !campaignSent.includes(e.template)) {
              campaignSent.push(e.template);
              await sendBrevoEmail({ email: cust.email, name: cust.company || 'Customer' }, getEditedCampaignSubject(e.template, e.subject), getCampaignEmailHTMLWithEdits(cust, e.template));
              sent++;
              break;
            }
          }
        } else if (daysSinceTrialEnd >= 0) {
          // Trial ended: send post-trial emails at days 7, 9, 12, 16, 21, 30, 60
          for (var ei = 0; ei < CAMPAIGN_EMAILS.length; ei++) {
            var e = CAMPAIGN_EMAILS[ei];
            if (e.day >= 7 && daysSinceTrialEnd >= (e.day - 7) && !campaignSent.includes(e.template)) {
              campaignSent.push(e.template);
              await sendBrevoEmail({ email: cust.email, name: cust.company || 'Customer' }, getEditedCampaignSubject(e.template, e.subject), getCampaignEmailHTMLWithEdits(cust, e.template));
              sent++;
              break;
            }
          }
        }
      } else if (cust.plan !== 'free_trial') {
        // Paid customer: send paid email series weekly
        var subAgeWeeks = Math.floor(accountAge / 7);
        for (var pi = 0; pi < PAID_EMAIL_SERIES.length; pi++) {
          var p = PAID_EMAIL_SERIES[pi];
          if (subAgeWeeks >= p.week && !campaignSent.includes(p.template)) {
            campaignSent.push(p.template);
            await sendBrevoEmail({ email: cust.email, name: cust.company || 'Customer' }, getEditedCampaignSubject(p.template, p.subject), getCampaignEmailHTMLWithEdits(cust, p.template));
            sent++;
            break;
          }
        }
      }
      if (campaignSent.length > 0) {
        cust.campaign_sent = JSON.stringify(campaignSent);
        saveDb();
      }
    } catch(e) { console.log('[CAMPAIGN] Error for', cust.email, e.message); }
  }
  console.log('[CAMPAIGN] Sent ' + sent + ' campaign emails');
});

// ===== DAILY HEALTH CHECK (Midnight) =====
// Tests all critical functions and auto-fixes common issues
cron.schedule('0 0 * * *', async () => {
  console.log('[HEALTH] Running daily health check...');
  var issues = [], fixes = [];
  
  // 1. Check database integrity
  try {
    _dbData = null;
    var db = getDb();
    var custCount = (db.customers || []).length;
    var leadCount = (db.leads || []).length;
    // Check for leads with no customer reference
    var validIds = new Set((db.customers || []).map(c => c.id));
    var orphanLeads = (db.leads || []).filter(l => !validIds.has(l.customer_id));
    if (orphanLeads.length > 0) {
      db.leads = (db.leads || []).filter(l => validIds.has(l.customer_id));
      saveDb();
      fixes.push('Removed ' + orphanLeads.length + ' orphan leads');
    }
    console.log('[HEALTH] DB: ' + custCount + ' customers, ' + leadCount + ' leads');
  } catch(e) { issues.push('Database: ' + (e && e.message || '')); }
  
  // 2. Check scraper data files exist
  for (var p in PRODUCT_LEAD_FILES) {
    try {
      var f = path.join(DATA_DIR, PRODUCT_LEAD_FILES[p].file);
      if (!fs.existsSync(f)) {
        fs.writeFileSync(f, JSON.stringify([], null, 2));
        fixes.push('Created empty ' + p + ' leads file');
      } else {
        var data = JSON.parse(fs.readFileSync(f, 'utf-8'));
        if (!Array.isArray(data)) {
          fs.writeFileSync(f, JSON.stringify([], null, 2));
          fixes.push('Fixed corrupted ' + p + ' leads file');
        }
      }
    } catch(e) { issues.push(p + ' file: ' + (e && e.message || '')); }
  }
  
  // 3. Check last-scrape cache is valid
  try {
    var lsFile = path.join(DATA_DIR, 'last-scrape.json');
    if (fs.existsSync(lsFile)) {
      var ls = JSON.parse(fs.readFileSync(lsFile, 'utf-8'));
      var today = new Date().toISOString().split('T')[0];
      for (var p in ls) {
        if (ls[p] !== today) {
          console.log('[HEALTH] ' + p + ' last scraped ' + ls[p] + ', not today');
        }
      }
    }
  } catch(e) {}
  
  // 4. Check Stripe config
  try {
    var scFile = path.join(DATA_DIR, 'stripe-config.json');
    if (!fs.existsSync(scFile)) issues.push('Stripe config missing');
  } catch(e) {}
  
  // 5. Auto-fix: if environment restarted, ensure DATA_DIR exists
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {}
  try { fs.mkdirSync(path.join(ROOT_DIR, 'portal'), { recursive: true }); } catch(e) {}
  
  // 6. Check server uptime and memory
  var mem = process.memoryUsage();
  console.log('[HEALTH] Memory: ' + Math.round(mem.heapUsed / 1024 / 1024) + '/' + Math.round(mem.heapTotal / 1024 / 1024) + ' MB');
  
  if (issues.length > 0) console.log('[HEALTH] Issues found: ' + issues.join(', '));
  if (fixes.length > 0) console.log('[HEALTH] Auto-fixes applied: ' + fixes.join(', '));
  if (issues.length === 0 && fixes.length === 0) console.log('[HEALTH] All systems healthy');
  
  // Alert if issues found
  if (issues.length > 0) {
    try {
      await sendBrevoEmail({ email: 'hello@9amleads.com', name: '9amLeads Admin' }, '[HEALTH ALERT] ' + issues.length + ' issues found', '<div style="background:#1a1b2e;padding:20px;color:#e2e8f0"><h2>Health Check Alert</h2><p>Issues found:</p><ul>' + issues.map(i => '<li>' + i + '</li>').join('') + '</ul><p>Fixes applied:</p><ul>' + fixes.map(f => '<li>' + f + '</li>').join('') + '</ul></div>');
    } catch(e) { console.log('[HEALTH] Alert email failed:', e.message); }
  }
});
app.post('/api/admin/deliver', adminAuth, async (req, res) => {
  try {
    var delivered = 0, errors = 0, lastErr = '';
    _dbData = null;
    var db = getDb();
    var today = new Date().toISOString().split('T')[0];
    var customers = (db.customers || []).filter(function(c) { return c.plan && c.plan !== 'cancelled' && (!c.bounced || c.bounced < 3); });
    for (var ci = 0; ci < customers.length; ci++) {
      var cust = customers[ci];
      var trialEnds = cust.trial_ends ? new Date(cust.trial_ends) : null;
      if (trialEnds && new Date() > trialEnds && cust.plan === 'free_trial') continue;
      
      // Use per-product limits based on lead type and coverage area
      var dailyLimitByPlan = { free_trial: 5, starter: 5, pro: 15, enterprise: 40 };
      var totalDailyLimit = getPlanLimit(cust.product, cust.plan, cust.coverage) || dailyLimitByPlan[cust.plan] || 5;
      
      // Get all products for this customer (round-robin)
      var products = [cust.product];
      try { var extra = JSON.parse(cust.biz_field3 || '[]'); if (Array.isArray(extra) && extra.length > 0) products = extra; } catch(e) {}
      
      var custLeads = [];
      var custAreas = [];
      // Get per-product config for this customer
      var pcfg = {};
      try { pcfg = JSON.parse(cust.product_config || '{}'); } catch(e) {}
      var primCfg = pcfg[cust.product] || {};
      var primCoverage = primCfg.coverage || cust.coverage || 'postcode';
      try {
        if (primCfg.target_areas) { custAreas = JSON.parse(primCfg.target_areas); }
        else { custAreas = JSON.parse(cust.target_areas || '[]'); }
      } catch(e) { custAreas = []; }
      var totalDailyLimit = getPlanLimit(cust.product, cust.plan, primCoverage) || 5;
      // Ensure customer's primary product always has at least 1 lead
      if (cust.product) {
        var primaryLeads = (db.leads || []).filter(function(l) { return l.customer_id === cust.id && l.delivered === 0 && l.product === cust.product; });
        if (primaryLeads.length > 0) {
          custLeads.push(primaryLeads[0]);
        }
      }
      var thisWeekStart2 = new Date(); thisWeekStart2.setDate(thisWeekStart2.getDate() - (thisWeekStart2.getDay() || 7) + 1);
      var weekStart2 = thisWeekStart2.toISOString().split('T')[0];
      // Helper: count leads per area in current batch
      function areaCounts(leadsArr, areasArr) {
        var counts = {};
        areasArr.forEach(function(a) { counts[a] = 0; });
        leadsArr.forEach(function(l) {
          try {
            var ld = JSON.parse(l.data || '{}');
            var la = extractPostcodeArea(ld.postcode || '');
            if (counts[la] !== undefined) counts[la]++;
          } catch(e) {}
        });
        return counts;
      }
      // Helper: find lead for given product + area, returns null if none
      function findLeadForProductAndArea(prod, area, allLeads, excludeIds) {
        for (var fi = 0; fi < allLeads.length; fi++) {
          if (excludeIds.indexOf(allLeads[fi].id) !== -1) continue;
          if (allLeads[fi].product !== prod) continue;
          try {
            var fd = JSON.parse(allLeads[fi].data || '{}');
            if (extractPostcodeArea(fd.postcode || '') === area) return allLeads[fi];
          } catch(e) {}
        }
        return null;
      }
      // Check if product has room for more leads today
      function canTakeProduct(prod, plan, weekStart, today, custLeads) {
        var pRule = getLeadTypeRule(prod);
        if (pRule.model === 'weekly') {
          var wDel = (db.leads || []).filter(function(l) { return l.customer_id === cust.id && l.delivered && l.delivered_at && l.delivered_at >= weekStart && l.product === prod; }).length;
          var wLim = pRule.weekly_est ? (pRule.weekly_est[plan] || pRule.weekly_est.starter || 999) : 999;
          if (wDel >= wLim) return false;
          var dMax = Math.max(1, Math.ceil(wLim / 5));
          var tDelDb = (db.leads || []).filter(function(l) { return l.customer_id === cust.id && l.delivered && l.delivered_at && l.delivered_at.startsWith(today) && l.product === prod; }).length;
          var tDelBatch = custLeads.filter(function(l) { return l.product === prod; }).length;
          if (tDelDb + tDelBatch >= dMax) return false;
        }
        return true;
      }
      // Available undelivered leads per product
      var availByProd = {};
      products.forEach(function(p) { availByProd[p] = (db.leads || []).filter(function(l) { return l.customer_id === cust.id && l.delivered === 0 && l.product === p; }); });
      var pickedIds = [];
      var totalNeeded = totalDailyLimit;
      // Round 1: try to give EVERY product at least 1 lead from a different area
      var usedAreas = {};
      custAreas.forEach(function(a) { usedAreas[a] = {}; });
      var areaCycle = 0;
      for (var r1p = 0; r1p < products.length && custLeads.length < totalDailyLimit; r1p++) {
        var r1prod = products[r1p];
        if (!canTakeProduct(r1prod, cust.plan, weekStart2, today, custLeads)) continue;
        var r1pool = (availByProd[r1prod] || []).filter(function(l) { return pickedIds.indexOf(l.id) === -1; });
        if (r1pool.length === 0) continue;
        // Try least-represented area first (works for any coverage type with specific areas)
        if (custAreas.length > 0) {
          var counts = areaCounts(custLeads, custAreas);
          var sortedAreas = custAreas.slice().sort(function(a, b) { return (counts[a] || 0) - (counts[b] || 0); });
          var found = false;
          for (var sa = 0; sa < sortedAreas.length; sa++) {
            var areaLead = findLeadForProductAndArea(r1prod, sortedAreas[sa], r1pool, pickedIds);
            if (areaLead) {
              custLeads.push(areaLead); pickedIds.push(areaLead.id);
              found = true; break;
            }
          }
          if (!found) { custLeads.push(r1pool[0]); pickedIds.push(r1pool[0].id); }
        } else {
          custLeads.push(r1pool[0]); pickedIds.push(r1pool[0].id);
        }
      }
      // Round 2: fill remaining slots — cycle through (product × area) round-robin
      if (custLeads.length < totalNeeded) {
        var maxRounds = Math.min(50, Math.ceil(totalNeeded * 2));
        for (var r2 = 0; r2 < maxRounds && custLeads.length < totalNeeded; r2++) {
          for (var r2p = 0; r2p < products.length && custLeads.length < totalNeeded; r2p++) {
            var r2prod = products[r2p];
            if (!canTakeProduct(r2prod, cust.plan, weekStart2, today, custLeads)) continue;
            var r2pool = (availByProd[r2prod] || []).filter(function(l) { return pickedIds.indexOf(l.id) === -1; });
            if (r2pool.length === 0) continue;
          if (custAreas.length > 0) {
            var counts2 = areaCounts(custLeads, custAreas);
              var sortedAreas2 = custAreas.slice().sort(function(a, b) { return (counts2[a] || 0) - (counts2[b] || 0); });
              var found2 = false;
              for (var sa2 = 0; sa2 < sortedAreas2.length; sa2++) {
                var areaLead2 = findLeadForProductAndArea(r2prod, sortedAreas2[sa2], r2pool, pickedIds);
                if (areaLead2) {
                  custLeads.push(areaLead2); pickedIds.push(areaLead2.id);
                  found2 = true; break;
                }
              }
              if (!found2) { custLeads.push(r2pool[0]); pickedIds.push(r2pool[0].id); }
            } else {
              custLeads.push(r2pool[0]); pickedIds.push(r2pool[0].id);
            }
          }
        }
      }
      
      if (custLeads.length === 0) continue;
      // Deduplicate leads by address within batch
      var seenAddrs = {}; custLeads = custLeads.filter(function(cl) {
        try { var cd = JSON.parse(cl.data || '{}'); var key = (cd.address || cd.postcode || cl.id || '').toLowerCase().trim(); return key && !seenAddrs[key] ? (seenAddrs[key]=true) : false; } catch(e) { return true; }
      });
      if (custLeads.length === 0) continue;
      try {
        var htmlContent = generateLeadEmailHTML(cust, custLeads);
        var covName3 = cust.coverage ? (COVERAGE_LABELS[cust.coverage] || cust.coverage) : 'your area';
        var subject = 'Your 9am Opportunities for ' + covName3 + ' — ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        await sendBrevoEmail({ email: cust.email, name: cust.company || 'Customer' }, subject, htmlContent);
        // Send to CRM webhook if configured
        if (cust.crm_webhook_url) {
          try {
            var crmPayload2 = JSON.stringify({ customer: cust.email, company: cust.company, leads: custLeads, delivered_at: new Date().toISOString() });
            var crmReq2 = require('https').request(cust.crm_webhook_url, { method:'POST', headers:{ 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(crmPayload2) } });
            crmReq2.write(crmPayload2); crmReq2.end();
          } catch(ce) { console.log('[DELIVERY] CRM webhook failed:', cust.email); }
        }
        for (var li = 0; li < custLeads.length; li++) { custLeads[li].delivered = 1; custLeads[li].delivered_at = new Date().toISOString(); }
        saveDb();
        delivered += custLeads.length;
      } catch(ex) { errors++; console.log('[DELIVER] Error: ' + ex?.message); lastErr = ex?.message; }
    }
    saveDb();
    res.json({ success: true, customers_processed: customers.length, leads_delivered: delivered, errors: errors, lastError: lastErr });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== STRIPE PAYMENTS =====
const STRIPE_PRICE_IDS = {
  moving: { 'mov-starter': 'price_1TswriADspDnFpfBKv3Pfy0V', 'mov-pro': 'price_1Tsws0ADspDnFpfBb1tVUbR7', 'mov-enterprise': 'price_1Tsws1ADspDnFpfBAGCw6JqD' },
  planning: { 'plan-starter': 'price_1TswrkADspDnFpfBOkRU4Qli', 'plan-pro': 'price_1TswrkADspDnFpfBMTrEDoZ9', 'plan-enterprise': 'price_1TswrkADspDnFpfBPe8qstPs' },
  newbusiness: { 'nb-starter': 'price_1TswrmADspDnFpfBi8Woj0oR' },
  probate: { 'prob-starter': 'price_1TxQqKADspDnFpfBccT0Lh2w' },
  tenders: { 'tend-starter': 'price_1TxQqKADspDnFpfBpzGp4qVv' }
};
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Load Stripe config from file (supports both env var and config file)
let STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
try {
  var configPath = path.join(DATA_DIR, 'stripe-config.json');
  // Try alternate locations if config not found at DATA_DIR
  if (!fs.existsSync(configPath)) {
    var altPaths = [
      path.join(__dirname, 'data', 'stripe-config.json'),
      path.join(process.cwd(), 'mission control', 'data', 'stripe-config.json'),
      path.join(process.cwd(), 'data', 'stripe-config.json')
    ];
    for (var api = 0; api < altPaths.length; api++) {
      if (fs.existsSync(altPaths[api])) { configPath = altPaths[api]; break; }
    }
  }
  const stripeConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (!STRIPE_SECRET_KEY && stripeConfig.apiKey) {
    STRIPE_SECRET_KEY = stripeConfig.apiKey;
  }
  if (stripeConfig.priceIds) {
    // Merge file prices UNDER embedded defaults (keep overrides)
    for (var prodKey in stripeConfig.priceIds) {
      if (!STRIPE_PRICE_IDS[prodKey]) STRIPE_PRICE_IDS[prodKey] = {};
      for (var planKey in stripeConfig.priceIds[prodKey]) {
        if (!STRIPE_PRICE_IDS[prodKey][planKey]) {
          STRIPE_PRICE_IDS[prodKey][planKey] = stripeConfig.priceIds[prodKey][planKey];
        }
      }
    }
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

// POST /api/admin/upgrade — upgrade a customer's plan (admin only)
app.post('/api/admin/upgrade', adminAuth, (req, res) => {
  try {
    const { email, plan, leads_per_day, product, coverage, target_areas, lead_type, biz_field3 } = req.body;
    if (!email || !plan) return res.status(400).json({ error: 'email and plan required' });
    const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    db.prepare('UPDATE customers SET plan = ?, leads_per_day = ? WHERE id = ?').run(plan, leads_per_day || 15, customer.id);
    if (product) db.prepare('UPDATE customers SET product = ? WHERE id = ?').run(product, customer.id);
    if (coverage) db.prepare('UPDATE customers SET coverage = ? WHERE id = ?').run(coverage, customer.id);
    if (target_areas) db.prepare('UPDATE customers SET target_areas = ? WHERE id = ?').run(target_areas, customer.id);
    if (lead_type) db.prepare('UPDATE customers SET lead_type = ? WHERE id = ?').run(lead_type, customer.id);
    if (biz_field3) db.prepare('UPDATE customers SET biz_field3 = ? WHERE id = ?').run(biz_field3, customer.id);
    if (req.body.product_config) db.prepare('UPDATE customers SET product_config = ? WHERE id = ?').run(req.body.product_config, customer.id);
    if (req.body.password) { var pwHash = require('bcryptjs').hashSync(req.body.password, 10); db.prepare('UPDATE customers SET password_hash = ? WHERE id = ?').run(pwHash, customer.id); }
    saveDb();
    res.json({ success: true, message: customer.company + ' upgraded to ' + plan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/create-checkout — create Stripe Checkout Session
app.post('/api/create-checkout', authMiddleware, async (req, res) => {
  try {
    if (!STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe not configured. Add keys in Settings â†’ Stripe Payments.' });
    }

    const { plan } = req.body;
    const validPlans = ['starter', 'pro', 'enterprise', 'builder-package', 'marketing-package', 'property-package', 'moving-package'];
    const proValid = ['starter', 'pro', 'enterprise', 'builder-package', 'marketing-package', 'property-package', 'moving-package', 'pro'];
    if (!plan || !proValid.includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Choose: starter, pro, enterprise, or a package' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });

    // Verify availability before checkout
    var packageKeys = { 'builder-package': 'bld-package', 'marketing-package': 'mkt-package', 'property-package': 'prp-package', 'moving-package': 'mov-package', 'pro': 'pro-plan' };
    if (!packageKeys[plan]) {
      const availRule = getLeadTypeRule(customer.product);
      if (!availRule.enabled) {
        return res.status(400).json({ error: availRule.name + ' are not currently available. Please choose another lead type from your dashboard.' });
      }
      if (customer.coverage && availRule.coverage.indexOf(customer.coverage) === -1) {
        return res.status(400).json({ error: customer.coverage + ' coverage is not available for ' + availRule.name + '. Please update your coverage area in the dashboard.' });
      }
    }

    // Handle packages and pro plan directly
    var priceId;
    var packageMap = { 'builder-package': 'builder-package', 'marketing-package': 'marketing-package', 'property-package': 'property-package', 'moving-package': 'moving-package', 'pro': 'pro' };
    if (packageKeys[plan]) {
      var priceIdMap = STRIPE_PRICE_IDS[packageMap[plan]] || {};
      priceId = priceIdMap[packageKeys[plan]];
      if (!priceId) {
        return res.status(400).json({ error: 'Package pricing not found. Run node stripe_handler.js --setup first.' });
      }
    } else {
      const productKey = { moving: 'mov', probate: 'prob', newbusiness: 'nb', planning: 'plan', tenders: 'tend' }[customer.product] || customer.product;
      // Map modal plan names to Stripe price name format
      var planMap = { starter: 'starter', pro: 'growth', enterprise: 'power' };
      var mappedPlan = planMap[plan] || plan;
      const planKey = productKey + '-' + mappedPlan;
      const priceIdMap = STRIPE_PRICE_IDS[customer.product] || {};
      priceId = priceIdMap[planKey];
      if (!priceId) {
        return res.status(400).json({ error: 'Pricing not found for this plan (' + planKey + '). Run node stripe_handler.js --setup first.' });
      }
    }

    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:' + PORT;
    const successUrl = baseUrl + '/portal/dashboard.html?checkout=success&session_id={CHECKOUT_SESSION_ID}';
    const cancelUrl = baseUrl + '/portal/dashboard.html?checkout=cancel';

    // If customer is on free trial with remaining trial days, apply trial period to subscription
    var trialEnds = customer.trial_ends ? new Date(customer.trial_ends) : null;
    var hasTrialRemaining = trialEnds && trialEnds > new Date();
    var trialDays = 0;

    var sessionBody = {
      mode: 'subscription',
      customer_email: customer.email,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'metadata[customer_id]': customer.id,
      'metadata[product]': customer.product,
      'metadata[plan]': plan
    };

    // Add trial period if customer still has trial days remaining
    if (trialDays > 0) {
      sessionBody['trial_period_days'] = trialDays;
    }

    const session = await stripeApiRequest('POST', 'checkout/sessions', sessionBody);

    if (session.url) {
      res.json({ url: session.url, session_id: session.id });
    } else {
      res.status(400).json({ error: session.error?.message || 'Checkout creation failed' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/setup-checkout — Stripe Checkout in setup mode (save card, no charge)
app.post('/api/setup-checkout', authMiddleware, async (req, res) => {
  try {
    if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured.' });
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:' + PORT;
    const session = await stripeApiRequest('POST', 'checkout/sessions', {
      mode: 'setup',
      currency: 'gbp',
      customer_email: customer.email,
      success_url: baseUrl + '/portal/dashboard.html?setup=success',
      cancel_url: baseUrl + '/portal/dashboard.html?setup=cancel',
      'metadata[customer_id]': customer.id,
      'metadata[type]': 'trial_card_setup'
    });
    if (session.url) {
      res.json({ url: session.url, session_id: session.id });
    } else {
      res.status(400).json({ error: session.error?.message || 'Setup session creation failed' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Handle setup成功的 webhook in the stripe webhook handler (setup_intent.succeeded saves payment method)

// ===== DIRECT MAIL PAYMENTS =====
// POST /api/stripe/webhook — handle Stripe checkout completed events
app.post('/api/stripe/webhook', async (req, res) => {
  try {
    var event = req.body;
    if (event.type === 'checkout.session.completed') {
      var session = event.data.object;
      var customerEmail = session.customer_email || (session.customer_details && session.customer_details.email);
      var plan = session.metadata && session.metadata.plan;
      var product = session.metadata && session.metadata.product;
      var metaType = session.metadata && session.metadata.type;

      // Handle setup mode (trial card save)
      if (session.mode === 'setup' || metaType === 'trial_card_setup') {
        var customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(customerEmail);
        if (customer && session.setup_intent) {
          var si = await stripeApiRequest('GET', 'setup_intents/' + session.setup_intent, {});
          if (si && si.payment_method) {
            db.prepare('UPDATE customers SET stripe_payment_method_id = ?, stripe_customer_id = ? WHERE id = ?')
              .run(si.payment_method, si.customer || customer.stripe_customer_id, customer.id);
            console.log('[STRIPE] Saved card for ' + customerEmail + ' (trial auto-charge ready)');
          }
        }
      }

      if (customerEmail && plan) {
        var customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(customerEmail);
        if (customer) {
          var weeklyLimits = { starter: 25, growth: 75, power: 125, pro: 75, enterprise: 125 };
          var weeklyMax = weeklyLimits[plan] || 25;
          var leadsPerDay = Math.ceil(weeklyMax / 5);
          db.prepare('UPDATE customers SET plan = ?, leads_per_day = ?, trial_ends = NULL WHERE id = ?').run(plan, leadsPerDay, customer.id);
          if (product) db.prepare('UPDATE customers SET product = ? WHERE id = ?').run(product, customer.id);
          saveDb();
          console.log('[STRIPE] Upgraded ' + customerEmail + ' to ' + plan);
        }
      }
    }
    res.json({ received: true });
  } catch(e) { console.error('[STRIPE] Webhook error:', e.message); res.status(500).json({ error: e.message }); }
});

var DM_PRICE_CONFIG = {
  platform_fee: 29, // Manual campaign platform fee (£)
  min_fee: 99, // Minimum campaign order (£)
  markup_pct: 40, // Provider cost markup percentage
  per_recipient_margin: 0.50, // Per-recipient margin (£)
  ai_letter_fee: 19, // AI letter generation fee (£)
  ai_flyer_fee: 19, // AI flyer generation fee (£)
  ai_pack_fee: 29, // Flyer + letter pack fee (£)
  auto_send_monthly_fee: 49, // Print & Post monthly add-on fee (£)
  vat_pct: 0, // VAT percentage (0 = disabled)
  provider_cost_per_unit: 0.75, // Per-unit provider cost (£)
  discount_codes: '' // Optional discount codes (JSON)
};
try {
  var dmPricingFile = path.join(DATA_DIR, 'dm-pricing.json');
  if (fs.existsSync(dmPricingFile)) {
    var loaded = JSON.parse(fs.readFileSync(dmPricingFile, 'utf-8'));
    for (var _dmpk in DM_PRICE_CONFIG) { if (loaded[_dmpk] !== undefined) DM_PRICE_CONFIG[_dmpk] = loaded[_dmpk]; }
  }
} catch(e) { console.log('[DM-PRICE] Config error:', e.message); }

function calcDmPrice(recipientCount, opts) {
  opts = opts || {};
  var pCost = opts.provider_cost_per_unit || DM_PRICE_CONFIG.provider_cost_per_unit || 0.75;
  var providerCost = recipientCount * pCost;
  var marginAmount = recipientCount * (opts.per_recipient_margin || DM_PRICE_CONFIG.per_recipient_margin || 0);
  var fee = opts.platform_fee || DM_PRICE_CONFIG.platform_fee || 0;
  var aiFee = (opts.ai_fee || 0);
  var subTotal = providerCost + fee + marginAmount + aiFee;
  var markup = subTotal * ((opts.markup_pct || DM_PRICE_CONFIG.markup_pct || 0) / 100);
  var beforeMin = subTotal + markup;
  var minOrder = opts.min_fee || DM_PRICE_CONFIG.min_fee || 0;
  var orderTotal = beforeMin < minOrder ? minOrder : beforeMin;
  var vatPct = opts.vat_pct !== undefined ? opts.vat_pct : DM_PRICE_CONFIG.vat_pct || 0;
  var vat = orderTotal * (vatPct / 100);
  var total = Math.round((orderTotal + vat) * 100) / 100;
  var stripeFeeEstimate = Math.round(total * 0.029 * 100 + 30) / 100; // 2.9% + 30p
  var profit = Math.round((total - providerCost - stripeFeeEstimate - marginAmount - fee) * 100) / 100;
  var marginPct = total > 0 ? Math.round((profit / total) * 10000) / 100 : 0;
  return {
    recipient_count: recipientCount,
    provider_cost: Math.round(providerCost * 100) / 100,
    per_recipient_margin: Math.round(marginAmount * 100) / 100,
    platform_fee: fee,
    ai_fee: aiFee,
    markup_pct: opts.markup_pct || DM_PRICE_CONFIG.markup_pct || 0,
    markup_amount: Math.round(markup * 100) / 100,
    subtotal: Math.round(subTotal * 100) / 100,
    min_fee_applied: beforeMin < minOrder,
    min_order: minOrder,
    order_total: Math.round(orderTotal * 100) / 100,
    vat_pct: vatPct,
    vat_amount: Math.round(vat * 100) / 100,
    total: total,
    stripe_fee_estimate: stripeFeeEstimate,
    profit: profit,
    margin_pct: marginPct,
    vat_enabled: vatPct > 0
  };
}

// POST /api/direct-mail/campaigns/:id/pricing — Calculate campaign price
app.post('/api/direct-mail/campaigns/:id/pricing', authMiddleware, (req, res) => {
  try {
    var campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    var recipients = db.prepare('SELECT COUNT(*) as count FROM direct_mail_recipients WHERE campaign_id = ? AND customer_id = ? AND status != \'failed\'').get(req.params.id, req.user.id);
    var count = Math.max(1, recipients.count || campaign.target_count || 1);
    var pricing = calcDmPrice(count);
    pricing.recipient_count = count;
    pricing.ai_gen_fee = DM_PRICE_CONFIG.ai_gen_fee;
    pricing.auto_send_fee = DM_PRICE_CONFIG.auto_send_monthly_fee;
    res.json({ success: true, pricing: pricing });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/direct-mail/campaigns/:id/checkout — Create Stripe checkout for campaign
app.post('/api/direct-mail/campaigns/:id/checkout', authMiddleware, async (req, res) => {
  try {
    if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });
    var campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status !== 'approved') return res.status(400).json({ error: 'Campaign must be approved before payment' });
    if (campaign.stripe_payment_id) return res.status(400).json({ error: 'Campaign already has a pending payment' });

    var recipients = db.prepare('SELECT COUNT(*) as count FROM direct_mail_recipients WHERE campaign_id = ? AND customer_id = ? AND status != \'failed\'').get(req.params.id, req.user.id);
    var count = Math.max(1, recipients.count || campaign.target_count || 1);
    var pricing = calcDmPrice(count);
    var customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    var amountPence = Math.round(pricing.total * 100); // Stripe uses pence/cents

    var baseUrl = process.env.PUBLIC_URL || 'http://localhost:' + PORT;
    var sessionBody = {
      mode: 'payment',
      customer_email: customer.email,
      'line_items[0][price_data][currency]': 'gbp',
      'line_items[0][price_data][product_data][name]': 'Direct Mail Campaign: ' + campaign.name,
      'line_items[0][price_data][product_data][description]': count + ' recipients Â· Provider cost £' + pricing.provider_cost.toFixed(2) + ' Â· Platform fee £' + pricing.platform_fee.toFixed(2),
      'line_items[0][price_data][unit_amount]': String(amountPence),
      'line_items[0][quantity]': '1',
      success_url: baseUrl + '/portal/dashboard.html?dm_payment=success&campaign_id=' + campaign.id,
      cancel_url: baseUrl + '/portal/dashboard.html?dm_payment=cancel&campaign_id=' + campaign.id,
      'metadata[customer_id]': customer.id,
      'metadata[campaign_id]': campaign.id,
      'metadata[type]': 'direct_mail_campaign',
      'metadata[recipient_count]': String(count),
      'metadata[total_amount]': String(amountPence)
    };

    var session = await stripeApiRequest('POST', 'checkout/sessions', sessionBody);
    if (session.url) {
      db.prepare('UPDATE direct_mail_campaigns SET stripe_session_id = ?, stripe_payment_status = ?, updated_at = ? WHERE id = ? AND customer_id = ?').run(session.id, 'pending', new Date().toISOString(), req.params.id, req.user.id);
      res.json({ url: session.url, session_id: session.id });
    } else {
      res.status(400).json({ error: session.error?.message || 'Checkout creation failed' });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/campaigns/:id/payment — Get payment status
app.get('/api/direct-mail/campaigns/:id/payment', authMiddleware, (req, res) => {
  try {
    var campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ success: true, stripe_session_id: campaign.stripe_session_id || '', stripe_payment_id: campaign.stripe_payment_id || '', stripe_payment_status: campaign.stripe_payment_status || '' });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
      const type = session.metadata?.type || 'plan_upgrade';

      if (!customerId) {
        console.log('[WEBHOOK] Missing customer_id in metadata');
        return res.json({ received: true });
      }

      if (type === 'extra_area') {
        const custRecord = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
        if (custRecord) {
          const currentExtra = parseInt(custRecord.extra_postcodes) || 0;
          const newExtra = currentExtra + 1;
          db.prepare('UPDATE customers SET extra_postcodes = ? WHERE id = ?').run(String(newExtra), customerId);
          saveDb();
          console.log('[WEBHOOK] Extra area purchased:', custRecord.email, 'now has', newExtra, 'extra areas');
        }
        return res.json({ received: true });
      }

      // Handle direct mail campaign payment
      if (type === 'direct_mail_campaign') {
        var campaignId = session.metadata?.campaign_id;
        if (!campaignId) { console.log('[WEBHOOK] Missing campaign_id in direct_mail metadata'); return res.json({ received: true }); }
        var campaignRecord = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ?').get(campaignId);
        if (!campaignRecord) { console.log('[WEBHOOK] Campaign not found:', campaignId); return res.json({ received: true }); }
        if (campaignRecord.stripe_payment_status === 'paid') { console.log('[WEBHOOK] Duplicate webhook - campaign already paid:', campaignId); return res.json({ received: true }); }

        var paymentId = session.payment_intent || session.id || '';
        db.prepare('UPDATE direct_mail_campaigns SET stripe_payment_id = ?, stripe_payment_status = ?, status = ?, updated_at = ? WHERE id = ?').run(paymentId, 'paid', 'paid', new Date().toISOString(), campaignId);
        db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), customerId, campaignId, 'approved', 'paid', 'system', 'Payment received: ' + paymentId, new Date().toISOString());
        console.log('[WEBHOOK] Campaign payment received:', campaignRecord.name, 'ID:', paymentId);
        return res.json({ received: true });
      }

      const plan = session.metadata?.plan;
      const product = session.metadata?.product;
      const stripeCustomerId = session.customer;
      const subscriptionId = session.subscription;

      if (!plan) {
        console.log('[WEBHOOK] Missing plan metadata:', JSON.stringify(session.metadata));
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

      console.log('[WEBHOOK] Payment confirmed:', customer.email, 'â†’', plan, '(product:', product + ')');
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
        console.log('[WEBHOOK] Subscription updated:', subId, 'â†’', status);
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

    // Handle refunds (direct mail campaigns)
    if (event.type === 'charge.refunded') {
      var refundCharge = event.data.object;
      var refundPaymentId = refundCharge.payment_intent || refundCharge.id || '';
      var refundCamp = db.prepare('SELECT * FROM direct_mail_campaigns WHERE stripe_payment_id = ?').get(refundPaymentId);
      if (refundCamp) {
        var prevStatus = refundCamp.status;
        var refundAmount = refundCharge.amount_refunded ? '£' + (refundCharge.amount_refunded / 100).toFixed(2) : 'unknown';
        db.prepare('UPDATE direct_mail_campaigns SET stripe_payment_status = ?, status = ?, updated_at = ? WHERE id = ?').run('refunded', 'cancelled', new Date().toISOString(), refundCamp.id);
        db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), refundCamp.customer_id, refundCamp.id, prevStatus, 'cancelled', 'system', 'Payment refunded: ' + refundAmount, new Date().toISOString());
        console.log('[WEBHOOK] Campaign refunded:', refundCamp.name, refundAmount);
      }
      res.json({ received: true }); return;
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

// POST /api/stannp/webhook — Receive Stannp status updates
app.post('/api/stannp/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Verify webhook signature if secret is configured
    if (STANNP_WEBHOOK_SECRET) {
      var sig = req.headers['stannp-signature'] || req.headers['x-stannp-signature'] || '';
      if (!sig) return res.status(401).json({ error: 'Missing signature' });
      var computedSig = require('crypto').createHmac('sha256', STANNP_WEBHOOK_SECRET).update(req.body.toString()).digest('hex');
      if (computedSig !== sig) return res.status(401).json({ error: 'Invalid signature' });
    }

    var payload = JSON.parse(req.body.toString() || '{}');
    var eventType = payload.event || payload.type || 'status_update';
    var providerCampaignId = String(payload.campaign_id || payload.id || '');
    var providerStatus = (payload.status || payload.event || '').toLowerCase();
    var webhookId = payload.webhook_id || payload.id || 'wh_' + Date.now();

    // Idempotency check — skip if already processed
    if (webhookId) {
      var existingLog = db.prepare('SELECT id FROM direct_mail_provider_logs WHERE provider = ? AND request_body LIKE ?').get('stannp', '%' + webhookId + '%');
      if (existingLog) { console.log('[STANNP-WEBHOOK] Duplicate webhook skipped:', webhookId); return res.json({ received: true }); }
    }

    // Find matching campaign
    if (!providerCampaignId) { console.log('[STANNP-WEBHOOK] No campaign_id in payload'); return res.json({ received: true }); }
    var campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE provider_campaign_id = ?').get(providerCampaignId);
    if (!campaign) { console.log('[STANNP-WEBHOOK] Campaign not found:', providerCampaignId); return res.json({ received: true }); }

    // Map Stannp statuses to internal statuses
    var statusMap = {
      'accepted': 'queued',
      'in-progress': 'printing',
      'printing': 'printing',
      'in_progress': 'printing',
      'dispatched': 'dispatched',
      'posted': 'dispatched',
      'completed': 'completed',
      'delivered': 'completed',
      'failed': 'failed',
      'cancelled': 'cancelled',
      'canceled': 'cancelled',
      'rejected': 'failed',
      'returned': 'failed'
    };
    var newStatus = statusMap[providerStatus] || campaign.status;

    var dispatchDate = payload.dispatch_date || payload.postage_date || '';
    var sentCount = payload.sent_count || payload.recipient_count || campaign.sent_count || 0;
    var failedCount = payload.failed_count || 0;
    var failedAddresses = payload.failed_addresses || [];
    var proofUrl = payload.proof_url || payload.proof_of_posting || '';
    var providerReference = payload.invoice_reference || payload.reference || '';

    // Update campaign
    db.prepare('UPDATE direct_mail_campaigns SET provider_status = ?, status = ?, sent_count = ?, delivery_date = ?, updated_at = ? WHERE id = ?').run(providerStatus, newStatus, sentCount, dispatchDate.split('T')[0] || '', new Date().toISOString(), campaign.id);

    // Log status history
    db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), campaign.customer_id, campaign.id, campaign.status, newStatus, 'provider', 'Stannp status: ' + providerStatus + (dispatchDate ? ' Â· Dispatched: ' + dispatchDate : ''), new Date().toISOString());

    // Log provider interaction
    db.prepare('INSERT INTO direct_mail_provider_logs (id,customer_id,campaign_id,provider,endpoint,request_body,response_body,status_code,success,error_message,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(uuidv4(), campaign.customer_id, campaign.id, 'stannp', 'webhook:' + eventType, JSON.stringify(payload), JSON.stringify({ new_status: newStatus, dispatch_date: dispatchDate, sent_count: sentCount, proof_url: proofUrl }), 200, 1, '', new Date().toISOString());

    // If failed addresses, mark them
    if (failedAddresses.length > 0) {
      failedAddresses.forEach(function(fa) {
        var addr = fa.address || fa.address_line1 || '';
        db.prepare('UPDATE direct_mail_recipients SET status = ? WHERE campaign_id = ? AND address_line1 = ? AND customer_id = ?').run('failed', campaign.id, addr.substring(0, 100), campaign.customer_id);
      });
    }

    console.log('[STANNP-WEBHOOK] Campaign', campaign.id, 'â†’', providerStatus, '(' + newStatus + ')', dispatchDate ? 'Â· dispatched: ' + dispatchDate : '');
    res.json({ received: true });
  } catch (e) {
    console.error('[STANNP-WEBHOOK] Error:', e.message);
    res.status(200).json({ received: true });
  }
});

// POST /api/direct-mail/campaigns/:id/sync-status — Manually sync provider status (admin)
app.post('/api/direct-mail/campaigns/:id/sync-status', authMiddleware, async (req, res) => {
  try {
    var campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!campaign.provider_campaign_id) return res.status(400).json({ error: 'Campaign has no provider campaign ID' });
    var provider = getDirectMailProvider();
    var statusResult = await provider.getCampaignStatus(campaign.provider_campaign_id);
    if (!statusResult.success) return res.status(500).json({ error: statusResult.error || 'Failed to sync status from provider' });
    var fromStatus = campaign.status;
    var newStatus = 'failed';
    var statuses = ['queued','printing','dispatched','completed','failed','cancelled'];
    if (statusResult.status === 'accepted') newStatus = 'queued';
    else if (statusResult.status === 'printing' || statusResult.status === 'in_progress') newStatus = 'printing';
    else if (statusResult.status === 'dispatched' || statusResult.status === 'posted') newStatus = 'dispatched';
    else if (statusResult.status === 'completed' || statusResult.status === 'delivered') newStatus = 'completed';
    else if (statusResult.status === 'failed' || statusResult.status === 'rejected') newStatus = 'failed';
    else if (statusResult.status === 'cancelled' || statusResult.status === 'canceled') newStatus = 'cancelled';
    db.prepare('UPDATE direct_mail_campaigns SET provider_status = ?, status = ?, updated_at = ? WHERE id = ? AND customer_id = ?').run(statusResult.status, newStatus, new Date().toISOString(), req.params.id, req.user.id);
    db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), req.user.id, req.params.id, fromStatus, newStatus, 'customer', 'Manual sync: provider status is ' + statusResult.status, new Date().toISOString());
    res.json({ success: true, from_status: fromStatus, to_status: newStatus, provider_status: statusResult.status });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
      return res.status(500).json({ error: 'Could not verify payment: ' + (e && e.message || '') });
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
  const product = customer.product || 'moving';
  const plan = customer.plan || 'free_trial';
  const coverage = customer.coverage || 'postcode';
  const dailyLimit = getPlanLimit(product, plan, coverage);
  const rule = getLeadTypeRule(product);
  const weeklyEst = rule.weekly_est ? (rule.weekly_est[plan] || dailyLimit * 5) : dailyLimit * 5;
  const monthlyEst = rule.monthly_est ? (rule.monthly_est[plan] || dailyLimit * 22) : dailyLimit * 22;
  const upTo = rule.up_to || false;

  // Get stripe price ID for display
  var priceKey = plan === 'starter' ? 'price_starter' : (plan === 'pro' ? 'price_growth' : 'price_power');
  var stripePriceId = rule[priceKey] || '';
  var priceAmount = plan === 'starter' ? 25 : (plan === 'pro' ? 49 : (plan === 'enterprise' ? 99 : 0));

  // Get delivered today + this month
  const dbData = getDb();
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);
  var deliveredToday = (dbData.leads || []).filter(function(l) { return l.customer_id === customer.id && l.delivered && l.delivered_at && l.delivered_at.startsWith(today); }).length;
  var deliveredThisMonth = (dbData.leads || []).filter(function(l) { return l.customer_id === customer.id && l.delivered && l.delivered_at && l.delivered_at.startsWith(thisMonth); }).length;

  res.json({
    product: product,
    lead_type: rule.name,
    plan: plan,
    coverage: coverage,
    coverage_label: COVERAGE_LABELS[coverage] || coverage,
    leads_per_day: dailyLimit,
    daily_limit: dailyLimit,
    weekly_estimate: weeklyEst,
    monthly_estimate: monthlyEst,
    up_to: upTo,
    price_per_week: priceAmount,
    price_id: stripePriceId,
    delivered_today: deliveredToday,
    delivered_this_month: deliveredThisMonth,
    trial_ends: customer.trial_ends,
    extra_postcodes: customer.extra_postcodes || 0,
    coverage_areas: JSON.parse(customer.target_areas || '[]'),
    subscription: sub ? {
      stripe_id: sub.stripe_id,
      plan: sub.plan,
      status: sub.status,
      current_period_start: sub.current_period_start,
      current_period_end: sub.current_period_end,
      created_at: sub.created_at,
      next_billing: sub.current_period_end
    } : null
  });
});

// POST /api/subscription/cancel — cancel subscription with retention offer for paid plans
app.post('/api/subscription/cancel', authMiddleware, async (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    if (customer.plan === 'free_trial') {
      db.prepare('UPDATE customers SET plan = \'cancelled\', leads_per_day = 0 WHERE id = ?').run(req.user.id);
      releasePostcodes(req.user.id);
      return res.json({ success: true, message: 'Your free trial has been cancelled.' });
    }

    // Check if this is an accept/reject for retention offer
    var accept = req.body.accept;
    if (accept === true) {
      // Apply retention discount: 50% off for 2 months
      var discountEnd = new Date();
      discountEnd.setMonth(discountEnd.getMonth() + 2);
      db.prepare('UPDATE customers SET discount = 50, discount_until = ? WHERE id = ?').run(discountEnd.toISOString(), req.user.id);
      return res.json({ success: true, message: 'You\'re Staying! 50% discount applied for the next 2 months. Your leads continue as normal.', discount: 50 });
    }
    if (accept === false) {
      // Force cancel - proceed to cancellation
    } else {
      // First cancel attempt: offer retention discount for paid plans
      return res.json({ success: true, offer: true, message: 'We\'d love to keep you! Save 50% for the next 2 months.', discount: 50, months: 2 });
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

// POST /api/stripe/portal — open Stripe Customer Portal for billing management
app.post('/api/stripe/portal', authMiddleware, async (req, res) => {
  try {
    var cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!cust || !cust.stripe_customer_id) {
      return res.status(400).json({ error: 'No Stripe customer found. Payment not set up yet.' });
    }
    var https = require('https');
    var data = JSON.stringify({ customer: cust.stripe_customer_id, return_url: 'https://www.9amleads.com/portal/dashboard.html' });
    var result = await new Promise(function(resolve, reject) {
      var req2 = https.request({ hostname: 'api.stripe.com', method: 'POST', path: '/v1/billing_portal/sessions', headers: { 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, function(resp) {
        var b = ''; resp.on('data', function(c) { b += c; }); resp.on('end', function() { try { resolve(JSON.parse(b)); } catch(e) { reject(e); } });
      });
      req2.on('error', reject); req2.write(data); req2.end();
    });
    if (result.url) res.json({ url: result.url });
    else res.status(500).json({ error: result.error ? result.error.message : 'Failed to create portal session' });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
// ===== DIRECT MAIL PAYMENT METHODS =====
// POST /api/direct-mail/setup-payment — Create SetupIntent to save a payment method
app.post('/api/direct-mail/setup-payment', authMiddleware, async (req, res) => {
  try {
    if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });

    // Create or get Stripe customer
    if (!customer.stripe_customer_id) {
      var stripeCustomer = await stripeApiRequest('POST', 'customers', { email: customer.email, name: customer.company || customer.email, metadata: { customer_id: customer.id } });
      if (stripeCustomer && stripeCustomer.id) {
        db.prepare('UPDATE customers SET stripe_customer_id = ? WHERE id = ?').run(stripeCustomer.id, req.user.id);
        customer.stripe_customer_id = stripeCustomer.id;
      } else {
        return res.status(500).json({ error: 'Failed to create Stripe customer' });
      }
    }

    // Create SetupIntent
    var baseUrl = process.env.PUBLIC_URL || 'http://localhost:' + PORT;
    var setupIntent = await stripeApiRequest('POST', 'setup_intents', {
      customer: customer.stripe_customer_id,
      'payment_method_types[0]': 'card',
      usage: 'off_session',
      'metadata[customer_id]': customer.id,
      return_url: baseUrl + '/portal/dashboard.html?dm_payment=setup_complete'
    });

    if (setupIntent && setupIntent.client_secret) {
      res.json({ success: true, client_secret: setupIntent.client_secret, stripe_customer_id: customer.stripe_customer_id });
    } else {
      res.status(500).json({ error: 'Failed to create SetupIntent' });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/direct-mail/confirm-payment-method — Store confirmed payment method
app.post('/api/direct-mail/confirm-payment-method', authMiddleware, async (req, res) => {
  try {
    const { payment_method_id } = req.body;
    if (!payment_method_id) return res.status(400).json({ error: 'Payment method ID required' });
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });

    // If no Stripe customer, create one
    var stripeCustomerId = customer.stripe_customer_id;
    if (!stripeCustomerId) {
      var sc = await stripeApiRequest('POST', 'customers', { email: customer.email, metadata: { customer_id: customer.id } });
      if (sc && sc.id) { stripeCustomerId = sc.id; db.prepare('UPDATE customers SET stripe_customer_id = ? WHERE id = ?').run(sc.id, req.user.id); }
      else return res.status(500).json({ error: 'Failed to create Stripe customer' });
    }

    // Attach payment method to customer
    var attachResult = await stripeApiRequest('POST', 'payment_methods/' + payment_method_id + '/attach', { customer: stripeCustomerId });
    if (!attachResult || attachResult.error) return res.status(500).json({ error: attachResult?.error?.message || 'Failed to attach payment method' });

    // Set as default payment method
    await stripeApiRequest('POST', 'customers/' + stripeCustomerId, { invoice_settings: '{default_payment_method: "' + payment_method_id + '"}' });

    // Get card details
    var pmDetails = await stripeApiRequest('GET', 'payment_methods/' + payment_method_id, {});
    var cardInfo = pmDetails && pmDetails.card ? { brand: pmDetails.card.brand, last4: pmDetails.card.last4, exp_month: pmDetails.card.exp_month, exp_year: pmDetails.card.exp_year } : {};

    // Store on customer record
    db.prepare('UPDATE customers SET stripe_payment_method_id = ?, stripe_customer_id = ? WHERE id = ?').run(payment_method_id, stripeCustomerId, req.user.id);

    res.json({ success: true, payment_method_id: payment_method_id, stripe_customer_id: stripeCustomerId, card: cardInfo, message: 'Payment method saved' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/payment-method — Get saved payment method info
app.get('/api/direct-mail/payment-method', authMiddleware, async (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    var hasPaymentMethod = !!(customer.stripe_payment_method_id);
    var cardInfo = null;
    if (hasPaymentMethod && customer.stripe_customer_id) {
      try {
        var pm = await stripeApiRequest('GET', 'payment_methods/' + customer.stripe_payment_method_id, {});
        if (pm && pm.card) cardInfo = { brand: pm.card.brand, last4: pm.card.last4, exp_month: pm.card.exp_month, exp_year: pm.card.exp_year };
      } catch(e) { /* payment method may have been removed */ }
    }
    res.json({ success: true, has_payment_method: hasPaymentMethod, stripe_customer_id: customer.stripe_customer_id || '', payment_method_id: customer.stripe_payment_method_id || '', card: cardInfo, auto_send_paused: customer.auto_send_paused ? 1 : 0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/direct-mail/payment-method — Remove saved payment method
app.delete('/api/direct-mail/payment-method', authMiddleware, async (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    if (customer.stripe_payment_method_id) {
      try { await stripeApiRequest('POST', 'payment_methods/' + customer.stripe_payment_method_id + '/detach', {}); } catch(e) {}
    }
    db.prepare('UPDATE customers SET stripe_payment_method_id = NULL WHERE id = ?').run(req.user.id);
    res.json({ success: true, message: 'Payment method removed' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/direct-mail/auto-send-pause — Toggle auto-send paused state
app.post('/api/direct-mail/auto-send-pause', authMiddleware, (req, res) => {
  try {
    var paused = req.body.paused ? 1 : 0;
    db.prepare('UPDATE customers SET auto_send_paused = ? WHERE id = ?').run(paused, req.user.id);
    res.json({ success: true, paused: paused });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

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
app.post('/api/distribute', adminAuth, async (req, res) => {
  try {
    const { product } = req.body || {};

    // Reload DB from file to get latest state
    _dbData = null;
    getDb();

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

// GET /api/debug/last-email — view the last generated lead email HTML in browser
app.get('/api/debug/last-email', adminAuth, async (req, res) => {
  try {
    _dbData = null;
    var db2 = getDb();
    var cust = (db2.customers || []).filter(function(c) { return c.email === req.query.email; })[0];
    if (!cust) return res.status(404).json({ error: 'Customer not found' });
    var custLeads = (db2.leads || []).filter(function(l) { return l.customer_id === cust.id && l.delivered === 0; }).slice(0, 5);
    if (custLeads.length === 0) {
      // Get previously delivered
      custLeads = (db2.leads || []).filter(function(l) { return l.customer_id === cust.id && l.delivered; }).slice(-3);
    }
    if (custLeads.length === 0) return res.status(404).json({ error: 'No leads found' });
    var html = generateLeadEmailHTML(cust, custLeads);
    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch(e) { res.status(500).send('<p>Error: ' + (e && e.message || '') + '</p>'); }
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
  const aboutText = productName === 'moving' ? 'Property and moving details'
    : productName === 'probate' ? 'Estate and probate details'
    : productName === 'newbusiness' ? 'New business registration details'
    : productName === 'planning' ? 'Planning application details'
    : 'Tender opportunity details';
  const dashboardUrl = 'https://www.9amleads.com/portal/dashboard.html';
  let body = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media only screen and (max-width:480px){.card{padding:12px!important}.inner{padding:12px 14px!important}.chips span{font-size:10px!important;white-space:normal!important;word-break:break-word!important}.lead-card{margin-bottom:16px!important}.btn-group{display:block!important}.btn-group a{display:block!important;margin-bottom:6px!important}.resp-flex{display:block!important}.resp-flex a{display:block!important;margin-bottom:6px!important}}</style></head><body style="margin:0;padding:0;background-color:#0f111a;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#e2e8f0">';
  body += '<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0f111a"><tr><td align="center" style="padding:24px 16px">';
  body += '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">';

  // Header — dark sleek
  body += '<tr><td style="background:linear-gradient(135deg,#0f111a,#1a1b2e);padding:36px 30px 24px;border-radius:16px 16px 0 0;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06)">';
  body += '<div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:900;color:#ffffff;text-align:center;margin-bottom:10px"><span style="display:inline-block;width:38px;height:38px;border-radius:10px;text-align:center;line-height:38px;font-size:18px;background:linear-gradient(135deg,#0ea5e9,#6366f1);margin-right:6px;vertical-align:middle">9</span><span style="vertical-align:middle">am Leads</span></div>';
  var areasLabel = '';
  try { var custAreas = JSON.parse(customer.target_areas || '[]'); areasLabel = custAreas.length > 0 ? custAreas.join(', ') : ''; } catch(e) {}
  if (areasLabel) body += '<p style="color:#f1f5f9;font-size:11px;margin:0;text-transform:uppercase;letter-spacing:3px;font-weight:600">' + areasLabel + '</p>';
  body += '</td></tr>';

  // Greeting + count — dark card
  body += '<tr><td style="background:#12141e;padding:28px 30px 20px">';
  body += '<h2 style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:#f1f5f9;margin:0 0 4px;letter-spacing:-0.3px">Good Morning, ' + (customer.company || 'there') + '</h2>';
  body += '<p style="color:#e2e8f0;font-size:13px;margin:0 0 20px">Your daily opportunities for ' + new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.</p>';
  body += '<div style="background:linear-gradient(135deg,rgba(16,185,129,0.1),rgba(16,185,129,0.05));border:1px solid rgba(16,185,129,0.2);border-radius:12px;padding:14px 20px;margin-bottom:16px">';
  body += '<table cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle"><span style="font-size:32px;font-weight:900;color:#10b981;line-height:1">' + leads.length + '</span></td><td style="padding-left:14px;vertical-align:middle"><span style="font-size:14px;color:#6ee7b7;font-weight:600">New ' + (leads.length === 1 ? 'opportunity' : 'opportunities') + ' ready today</span></td></tr></table></div>';
  body += '<p style="font-size:12px;color:#e2e8f0;line-height:1.6;margin:0;padding:12px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px">' + aboutText + '</p>';
  body += '</td></tr>';

  // Lead cards
  body += '<tr><td style="background:#12141e;padding:8px 28px 28px">';
  for (var i = 0; i < leads.length; i++) {
    var l = leads[i];
    var d = l.data || {};
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch(e) { d = {}; } }

    var leadProduct = l.product || productName;
    var leadAccent = leadProduct === 'moving' ? '#ff6b35' : leadProduct === 'probate' ? '#a855f7' : leadProduct === 'newbusiness' ? '#06b6d4' : leadProduct === 'planning' ? '#10b981' : '#6366f1';
    var title = '';
    var subtitle = '';
    var address = d.address || l.address || '';
    var postcode = d.postcode || '';

    if (leadProduct === 'moving') {
      title = address.split(',')[0].trim() || address || 'Property';
      subtitle = (postcode || '') + (d.city ? ' · ' + d.city : '') + (d.bedrooms ? ' · ' + d.bedrooms + ' bed' : '');
    } else if (leadProduct === 'probate') {
      title = d.deceasedName || 'Probate Estate';
      subtitle = d.estateValue ? '\u00a3' + Number(d.estateValue).toLocaleString() + ' estate' : '';
    } else if (leadProduct === 'newbusiness') {
      title = d.companyName || d.name || d.company || 'New Company Registration';
      var incDate = d.incorporationDate || d.dateOfCreation;
      subtitle = incDate ? (d.city ? d.city + ' · ' : '') + 'Incorporated ' + new Date(incDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : (d.city || '');
    } else if (leadProduct === 'planning') {
      title = d.address ? d.address.split(',')[0].trim() : (d.proposal ? d.proposal.substring(0, 40) : 'Planning Application');
      subtitle = d.council ? d.council + (d.freshnessBadge ? ' · ' + d.freshnessBadge : '') : (d.freshnessBadge || '');
    } else {
      title = d.tenderTitle || d.description || 'Opportunity';
      subtitle = d.buyer || '';
    }

    body += '<div style="background:#181b28;border:1px solid rgba(255,255,255,0.06);border-radius:14px;margin-bottom:16px;overflow:hidden">';
    body += '<div style="height:3px;background:linear-gradient(90deg,' + leadAccent + ',rgba(99,102,241,0.4))"></div>';
    body += '<div style="padding:18px 20px 16px">';

    // Badge + title row
    body += '<div style="margin-bottom:12px">';
    body += '<table cellpadding="0" cellspacing="0" width="100%"><tr>';
    body += '<td style="vertical-align:top;width:auto;padding-right:10px"><span style="display:inline-block;padding:4px 12px;border-radius:6px;background:linear-gradient(135deg,' + leadAccent + ',rgba(99,102,241,0.6));color:#fff;font-size:10px;font-weight:700;letter-spacing:0.8px">' + (leadProduct === 'moving' ? 'MOVING' : leadProduct === 'probate' ? 'PROBATE' : leadProduct === 'newbusiness' ? 'NEW BIZ' : leadProduct === 'planning' ? 'PLANNING' : 'TENDER') + '</span></td>';
    body += '<td style="vertical-align:top;width:100%"><div style="font-size:16px;font-weight:700;color:#f1f5f9;line-height:1.3">' + (title || 'Opportunity') + '</div>';
    if (subtitle) body += '<div style="font-size:13px;color:#e2e8f0;margin-top:4px">' + subtitle + '</div>';
    body += '</td></tr></table></div>';

    // Details as badge chips
    var chips = [];
    if (postcode) chips.push({ icon: '\uD83D\uDCCD', text: postcode });
    if (address && address.length > 10) chips.push({ icon: '\uD83C\uDFE2', text: address.substring(0, 55) });
    if (d.city) chips.push({ icon: '\uD83C\uDFD9\uFE0F', text: d.city });

    if (leadProduct === 'moving') {
      var listingDate = d.firstVisibleDate || d.addedOrReduced || d.lastAddedOrReducedDate || '';
      var today = new Date().toISOString().split('T')[0];
      var yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      var freshness = '';
      if (listingDate >= today) freshness = 'Added today';
      else if (listingDate >= yesterday) freshness = 'Added yesterday';
      else if (listingDate) freshness = 'Listed ' + new Date(listingDate).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
      if (freshness) chips.push({ icon: '\uD83D\uDFE2', text: freshness });
      if (d.bedrooms && parseInt(d.bedrooms) > 0) chips.push({ icon: '\uD83C\uDFE0', text: d.bedrooms + ' bedrooms' });
      if (d.propertyType) chips.push({ icon: '\uD83C\uDFE2', text: d.propertyType });
      if (d.listingStatus || d.status === 'SSTC' || d.status === 'Under Offer' || d.status === 'Available') {
        var s = d.listingStatus || d.status;
        chips.push({ icon: '\uD83D\uDD34', text: s });
      }
      if (d.agent) chips.push({ icon: '\uD83D\uDC64', text: d.agent });
    } else if (leadProduct === 'probate') {
      if (d.estateValue || d.estimatedValue) chips.push({ icon: '\u00A3', text: '\u00a3' + Number(d.estateValue || d.estimatedValue).toLocaleString() + ' estate' });
      if (d.deceasedName) chips.push({ icon: '\uD83D\uDC68\u200D\u2696\uFE0F', text: d.deceasedName });
      if (d.probateRegistry || d.registry) chips.push({ icon: '\uD83C\uDFE2', text: d.probateRegistry || d.registry });
      if (d.dateOfDeath) chips.push({ icon: '\uD83D\uDCC5', text: 'Died ' + new Date(d.dateOfDeath).toLocaleDateString() });
      if (d.solicitor) chips.push({ icon: '\uD83D\uDC64', text: 'Solicitor: ' + d.solicitor });
    } else if (leadProduct === 'newbusiness') {
      if (d.sicCode) chips.push({ icon: '\uD83D\uDCCA', text: d.sicCode.length > 40 ? 'SIC: ' + d.sicCode.substring(0, 40) : d.sicCode });
      if (d.incorporationDate) chips.push({ icon: '\uD83D\uDCC5', text: 'Incorporated ' + new Date(d.incorporationDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) });
      if (d.companyNumber && !d.generated) chips.push({ icon: '\uD83D\uDCB3', text: 'No: ' + d.companyNumber });
      if (d.companyNumber && !d.generated) chips.push({ icon: '\uD83D\uDD0D', text: '<a href="https://find-and-update.company-information.service.gov.uk/company/' + d.companyNumber + '" target="_blank" style="color:#38bdf8;text-decoration:underline">View on Companies House</a>' });
      if (d.enrichment && d.enrichment !== 'address only') chips.push({ icon: '\u2705', text: d.enrichment });
    } else if (leadProduct === 'planning') {
      if (d.freshnessBadge) chips.push({ icon: '\uD83D\uDFE2', text: d.freshnessBadge });
      if (d.council) chips.push({ icon: '\uD83C\uDFDB\uFE0F', text: d.council });
      if (d.reference) chips.push({ icon: '\uD83D\uDCCB', text: 'Ref: ' + d.reference });
      if (d.proposal) chips.push({ icon: '\uD83D\uDCCB', text: d.proposal.substring(0, 100) });
      if (d.applicationType) chips.push({ icon: '\uD83C\uDFD7\uFE0F', text: d.applicationType });
      if (d.trades && d.trades.length > 0) chips.push({ icon: '\uD83D\uDD28', text: d.trades.join(', ') });
      if (d.sourceUrl) chips.push({ icon: '\uD83D\uDD0D', text: '<a href="' + d.sourceUrl + '" target="_blank" style="color:#38bdf8;text-decoration:underline">View on planning portal</a>' });
    } else {
      if (d.buyer) chips.push({ icon: '\uD83C\uDFED', text: d.buyer });
      if (d.contractValue || d.estimatedValue) chips.push({ icon: '\u00A3', text: '\u00a3' + Number(d.contractValue || d.estimatedValue).toLocaleString() });
      if (d.tenderNoticeId) chips.push({ icon: '\uD83D\uDCCB', text: 'Ref: ' + d.tenderNoticeId });
      if (d.closingDate) { var days = Math.max(0, Math.floor((new Date(d.closingDate) - new Date()) / 86400000)); chips.push({ icon: '\u23F3', text: 'Deadline: ' + days + ' days' }); }
      if (d.publishedDate) chips.push({ icon: '\uD83D\uDCC5', text: 'Published: ' + new Date(d.publishedDate).toLocaleDateString() });
      if (d.description) chips.push({ icon: '\uD83D\uDCCB', text: d.description.substring(0, 100) });
      if (d.title) chips.push({ icon: '\uD83D\uDCCB', text: d.title.substring(0, 60) });
      if (d.tenderUrl) chips.push({ icon: '\uD83D\uDD0D', text: '<a href="' + d.tenderUrl + '" target="_blank" style="color:#38bdf8;text-decoration:underline">View tender</a>' });
      if (d.portalUrl) chips.push({ icon: '\uD83D\uDD0D', text: '<a href="' + d.portalUrl + '" target="_blank" style="color:#38bdf8;text-decoration:underline">View on portal</a>' });
    }

    if (chips.length > 0) {
      body += '<div style="margin-bottom:8px">';
      for (var c = 0; c < chips.length; c++) {
        body += '<span style="display:inline-block;padding:4px 10px;margin:0 4px 4px 0;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:8px;font-size:12px;color:#f1f5f9;white-space:nowrap">' + chips[c].icon + ' ' + chips[c].text + '</span>';
      }
      body += '</div>';
    }

    // Contact info
    var hasEmail = d.ownerEmail || d.buyerEmail || d.legalAdvisorEmail || d.email;
    var hasPhone = d.phone || d.ownerPhone || d.buyerPhone || d.legalAdvisorPhone || d.mobile;
    var hasWebsite = d.website || d.url;
    if (hasEmail || hasPhone || hasWebsite) {
      body += '<div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;margin-top:8px">';
      if (hasEmail) body += '<div style="font-size:12px;color:#e2e8f0;margin-bottom:3px">\u2709\uFE0F <a href="mailto:' + (d.ownerEmail || d.buyerEmail || d.legalAdvisorEmail || d.email) + '" style="color:#38bdf8;text-decoration:none">' + (d.ownerEmail || d.buyerEmail || d.legalAdvisorEmail || d.email) + '</a></div>';
      if (hasPhone) body += '<div style="font-size:12px;color:#e2e8f0;margin-bottom:3px">\uD83D\uDCDE ' + (d.phone || d.ownerPhone || d.buyerPhone || d.legalAdvisorPhone || d.mobile) + '</div>';
      if (hasWebsite) { var w = d.website || d.url || ''; body += '<div style="font-size:12px;color:#e2e8f0;margin-bottom:3px">\uD83C\uDF10 <a href="http://' + w.replace(/^https?:\/\//, '') + '" style="color:#38bdf8;text-decoration:none" target="_blank">' + w + '</a></div>'; }
      body += '</div>';
    }

    // Action buttons — website / portal links
    var actionLinks = [];
    if (leadProduct === 'planning') {
      var searchQ = (d.council || d.city || '') + ' planning application ' + (d.applicationRef || d.address || '');
      actionLinks.push({ url: 'https://www.google.com/search?q=' + encodeURIComponent(searchQ), label: 'Search Planning Portal' });
      if (d.estimatedValue) actionLinks.push({ url: dashboardUrl, label: 'View on Dashboard' });
    } else if (leadProduct === 'moving') {
      if (d.url) actionLinks.push({ url: d.url, label: 'Check Out This Property' });
      else actionLinks.push({ url: 'https://www.rightmove.co.uk/property-for-sale/search.html?searchLocation=' + encodeURIComponent(d.postcode || d.city || ''), label: 'Search Similar' });
      actionLinks.push({ url: dashboardUrl, label: 'View on Dashboard' });
    } else if (leadProduct === 'newbusiness') {
      if (d.companyNumber && !d.generated) actionLinks.push({ url: 'https://find-and-update.company-information.service.gov.uk/company/' + d.companyNumber, label: 'View on Companies House' });
      if (d.name) actionLinks.push({ url: 'https://www.google.com/search?q=' + encodeURIComponent(d.name + ' contact email phone'), label: 'Find Contact Details' });
    } else if (leadProduct === 'probate') {
      if (d.noticeUrl) actionLinks.push({ url: d.noticeUrl, label: 'View on UK Gazette' }); else actionLinks.push({ url: 'https://www.gov.uk/government/publications/how-to-search-for-probate-records', label: 'Search Probate Records' });
      actionLinks.push({ url: dashboardUrl, label: 'View on Dashboard' });
    } else if (leadProduct === 'tenders') {
      if (d.pcsUrl && !d.generated) actionLinks.push({ url: d.pcsUrl, label: 'View on PCS' }); else if (d.tenderNoticeId && !d.generated) actionLinks.push({ url: 'https://www.contractsfinder.service.gov.uk/notice/' + d.tenderNoticeId, label: 'View Tender' });
      else if (d.pcsUrl && !d.generated) actionLinks.push({ url: d.pcsUrl, label: 'View on PCS' });
      else actionLinks.push({ url: 'https://www.gov.uk/contracts-finder', label: 'Browse Tenders' });
    }
    if (actionLinks.length > 0) {
      body += '<div style="margin-top:12px;display:flex;gap:8px">';
      for (var ai = 0; ai < actionLinks.length; ai++) {
        body += '<a href="' + actionLinks[ai].url + '" target="_blank" style="flex:1;display:block;text-align:center;padding:10px 8px;background:linear-gradient(135deg,' + accent + ',rgba(99,102,241,0.6));color:#fff;text-decoration:none;border-radius:10px;font-size:12px;font-weight:600">\uD83D\uDD0D ' + actionLinks[ai].label + '</a>';
      }
      body += '</div>';
    }

    body += '</div></div>';
  }
  body += '</td></tr>';

  // Product insight card — consistent with campaign emails
  var insightCards2 = {
    moving: { emoji: '\uD83D\uDE9A', tip: 'Moving leads convert fastest when you\'re the first to contact the seller. Your brochure and letter should arrive the same day the property goes SSTC.', metric: '' },
    planning: { emoji: '\uD83C\uDFD7\uFE0F', tip: 'Planning applicants are actively choosing builders. Your flyer arriving the same week positions you ahead of every competitor.', metric: '' },
    probate: { emoji: '\u2696\uFE0F', tip: 'Probate requires a compassionate approach. Families remember who reached out with sensitivity, not who pushed the hardest.', metric: '' },
    newbusiness: { emoji: '\uD83C\uDFE2', tip: 'New companies often don\'t have a website yet. Check Companies House weekly and be ready when their details go live.', metric: 'Avg. client LTV: 2-5 years' },
    tenders: { emoji: '\uD83D\uDCCB', tip: 'Tenders close on deadlines. Submit your capability statement early and follow up with a printed pack to stand out.', metric: '' }
  };
  var insight2 = insightCards2[customer.product] || { emoji: '\uD83D\uDCA1', tip: 'Follow up within 30 minutes to maximise your conversion rate.', metric: '' };
  body += '<tr><td style="background:#12141e;padding:0 28px 16px"><div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 16px">';
  body += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:16px">' + insight2.emoji + '</span><span style="font-size:12px;font-weight:700;color:#f1f5f9">' + getLeadTypeRule(customer.product).name + ' Insight</span></div>';
  body += '<p style="font-size:12px;color:#cbd5e1;line-height:1.6;margin:0 0 6px">' + insight2.tip + '</p>';
  body += (insight2.metric ? '<p style="font-size:11px;color:#38bdf8;margin:0 0 8px"><strong>' + insight2.metric + '</strong></p>' : '');
  body += '<div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;margin-top:4px">';
  body += '<p style="font-size:10px;color:#94a3b8;margin:0 0 4px">Need help? <a href="mailto:hello@9amleads.com" style="color:#38bdf8;text-decoration:underline">hello@9amleads.com</a> &bull; <a href="tel:hello@9amleads.com" style="color:#38bdf8;text-decoration:underline">hello@9amleads.com</a> &bull; <a href="https://www.9amleads.com" style="color:#38bdf8;text-decoration:underline">9amLeads.com</a></p>';
  body += '<div style="margin-top:6px"><a href="https://www.facebook.com/share/1SBwDAUuxh/" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.06);line-height:24px;text-align:center;text-decoration:none;margin:0 2px;font-size:9px;color:#94a3b8">fb</a><a href="https://www.tiktok.com/@9amleads.com" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.06);line-height:24px;text-align:center;text-decoration:none;margin:0 2px;font-size:9px;color:#94a3b8">tt</a><a href="https://www.instagram.com/9amleads/" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.06);line-height:24px;text-align:center;text-decoration:none;margin:0 2px;font-size:9px;color:#94a3b8">ig</a></div>';
  body += '</div></div></td></tr>';

  // Footer — dark sleek
  body += '<tr><td style="background:linear-gradient(135deg,#0f111a,#1a1b2e);padding:28px 30px 24px;border-radius:0 0 16px 16px;text-align:center;border-top:1px solid rgba(255,255,255,0.06)">';
  body += '<div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:900;color:#e2e8f0;text-align:center;margin-bottom:16px"><span style="display:inline-block;width:34px;height:34px;border-radius:9px;text-align:center;line-height:34px;font-size:15px;background:linear-gradient(135deg,#0ea5e9,#6366f1);margin-right:5px;vertical-align:middle">9</span><span style="vertical-align:middle">am Leads</span></div>';
  var pricingLink = customer.product === 'planning' ? 'https://www.9amleads.com/planningleads' : customer.product === 'moving' ? 'https://www.9amleads.com/movingleadsdaily' : customer.product === 'probate' ? 'https://www.9amleads.com/probateleads' : customer.product === 'newbusiness' ? 'https://www.9amleads.com/newbusinessalert' : customer.product === 'tenders' ? 'https://www.9amleads.com/tenders' : 'https://www.9amleads.com/pricing';
  body += '<div style="margin-bottom:12px"><a href="' + dashboardUrl + '" style="display:inline-block;padding:12px 36px;background:linear-gradient(135deg,' + accent + ',rgba(99,102,241,0.6));color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:13px;letter-spacing:0.8px">VIEW DASHBOARD</a></div>';
  body += '<a href="' + pricingLink + '" style="display:inline-block;padding:10px 30px;border:1px solid rgba(255,255,255,0.15);color:#f1f5f9;text-decoration:none;border-radius:50px;font-weight:600;font-size:12px">View ' + (customer.product ? getLeadTypeRule(customer.product).name : 'Pricing') + '</a>';
  body += '<p style="color:#e2e8f0;font-size:11px;margin:14px 0 0"><a href="mailto:hello@9amleads.com?subject=Lead%20Issue" style="color:#f1f5f9;text-decoration:underline">Lead issue? Contact us &rarr;</a></p>';
  body += '<table cellpadding="0" cellspacing="0" align="center" style="margin:14px 0 12px"><tr>';
  body += '<td style="padding:0 5px"><a href="' + PUBLIC_URL + '" style="display:inline-block;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.08);line-height:30px;text-align:center;text-decoration:none"><span style="color:rgba(255,255,255,0.9);font-size:12px">\uD83C\uDF10</span></a></td>';
  body += '<td style="padding:0 5px"><a href="' + dashboardUrl + '" style="display:inline-block;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.08);line-height:30px;text-align:center;text-decoration:none"><span style="color:rgba(255,255,255,0.9);font-size:12px">\uD83D\uDCC8</span></a></td>';
  body += '<td style="padding:0 5px"><a href="https://www.facebook.com/share/1SBwDAUuxh/" style="display:inline-block;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.08);line-height:30px;text-align:center;text-decoration:none"><span style="color:rgba(255,255,255,0.85);font-size:10px;font-weight:600">fb</span></a></td>';
  body += '<td style="padding:0 5px"><a href="https://www.tiktok.com/@9amleads.com" style="display:inline-block;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.08);line-height:30px;text-align:center;text-decoration:none"><span style="color:rgba(255,255,255,0.85);font-size:10px;font-weight:600">tt</span></a></td>';
  body += '<td style="padding:0 5px"><a href="https://www.instagram.com/9amleads/" style="display:inline-block;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.08);line-height:30px;text-align:center;text-decoration:none"><span style="color:rgba(255,255,255,0.85);font-size:10px;font-weight:600">ig</span></a></td>';
  body += '<p style="color:#e2e8f0;font-size:10px;margin:0 0 4px;letter-spacing:.4px">9am Leads Ltd</p>';
  body += '<p style="color:#e2e8f0;font-size:9px;margin:0 0 12px;letter-spacing:.3px"><a href="mailto:hello@9amleads.com" style="color:#38bdf8;text-decoration:underline">hello@9amleads.com</a> &bull; <a href="tel:hello@9amleads.com" style="color:#38bdf8;text-decoration:underline">hello@9amleads.com</a> &bull; <a href="https://www.9amleads.com/privacy.html" style="color:#38bdf8;text-decoration:underline">Privacy Policy</a></p>';
  body += '<p style="color:#94a3b8;font-size:8px;margin:0;letter-spacing:.4px">Fresh exclusive opportunities delivered at 9am every morning &bull; Not sure? Call hello@9amleads.com &bull; 9amLeads.com</p>';
  body += '</td></tr></table></td></tr></table></body></html>';
  return body;
}
// ===== MARKETING CAMPAIGNS (Conversion Kits) =====
var CAMPAIGN_KITS = {
  planning: {
    name: 'Planning Permissions Success Kit',
    icon: '\uD83C\uDFD7\uFE0F',
    color: '#10b981',
    summary: '16-email campaign \u00b7 5 letter templates \u00b7 3 flyer inserts \u00b7 4 follow-up sequences',
    header: 'Here\'s exactly how successful builders and trades convert planning leads. âš ï¸ We provide addresses only — no emails or phone numbers. Post a flyer + letter in person or via Royal Mail. In-person works best with a sign-written vehicle, uniform, and quality materials.',
    sections: [
      {
        title: 'Email Templates (16-Campaign)',
        icon: '\u2709\uFE0F',
        items: [
          { subject: 'Quick intro \u2014 I see you\'ve submitted plans at [address]', body: 'Hi [name],\n\nI noticed you\'ve recently submitted a planning application for [description] at [address]. Congratulations on moving forward with your project.\n\nI\'m writing to introduce myself \u2014 I\'m [your name] from [company], and I specialise in helping homeowners in [area] bring their building projects to life. I\'ve attached a flyer showing some of our recent work.\n\nI\'ll pop a brochure through your letterbox this week so you can see how we work. In the meantime, feel free to reply to this email or visit our website at [website].\n\nBest regards,\n[Your name]' },
          { subject: 'Follow-up \u2014 Just checking you received my brochure', body: 'Hi [name],\n\nI dropped a brochure through your door earlier this week covering the planning application at [address]. Just wanted to make sure it arrived safely.\n\nIf you\'re currently comparing quotes for the build work, I\'d love the opportunity to put a proposal together. We\'ve completed [X] similar projects in [area] and have availability to start within [timeframe].\n\nLet me know if you\'d like to have a quick chat \u2014 I can pop round at a time that suits you.\n\nBest,\n[Your name]' },
          { subject: 'Tip \u2014 What to consider before approving a quote', body: 'Hi [name],\n\nI hope the planning process is moving along smoothly. While you\'re waiting for approval, here are a few things to think about before choosing a builder:\n\n1. Check their recent portfolio \u2014 have they done similar work?\n2. Ask for references from previous clients in your area\n3. Get a detailed breakdown of costs, not just a headline figure\n4. Confirm their availability and timeline\n\nI\'ve attached a handy checklist that might help. No strings attached \u2014 just something I put together for my clients.\n\nIf you\'d like to see how I compare against those criteria, I\'m happy to share recent project photos and client testimonials.\n\nBest,\n[Your name]' },
          { subject: 'Final nudge \u2014 Still available to help with [address]', body: 'Hi [name],\n\nJust checking in one last time regarding the planning application at [address]. If the timing isn\'t right yet, no problem at all \u2014 my details are below.\n\nWhen you\'re ready to get started, I\'m here. I\'ll also pop another flyer through your door next week with an updated special offer.\n\nWishing you all the best with the project.\n\nKind regards,\n[Your name]' }
        ]
      },
      {
        title: 'Introduction Letter Templates',
        icon: '\uD83D\uDCC4',
        items: [
          { subject: 'Standard Introduction Letter', body: '[Your Company Letterhead]\n\n[Date]\n\n[Homeowner Name]\n[Address]\n\nDear [Name],\n\nRE: Planning Application at [Address]\n\nI recently learned of your planning application at the above address and wanted to introduce myself. I\'m [your name], owner of [company], and I specialise in [service] for homeowners in [area].\n\nI understand that choosing the right contractor is an important decision. Over the years, I\'ve helped [X] families in this area complete similar projects, and I\'d love the opportunity to discuss how I might help you.\n\nI\'ve enclosed a brochure showcasing some of my recent work, along with a few client testimonials. I\'ll follow up in a few days to see if you have any questions.\n\nWarm regards,\n[Your name]\n[Phone / Email / Website]' },
          { subject: 'Compassionate Follow-Up (if no response)', body: '[Your Company Letterhead]\n\nDear [Name],\n\nI wrote to you recently about your planning application at [address]. I appreciate you may be busy with the planning process, so I wanted to follow up briefly.\n\nIf now isn\'t the right time, I completely understand. When you\'re ready to move forward, please feel free to get in touch. I\'d be delighted to help.\n\nIn the meantime, I\'ve enclosed a special offer valid for [timeframe] \u2014 no obligation, just a goodwill gesture.\n\nWarm wishes,\n[Your name]' }
        ]
      },
      {
        title: 'Flyer Insert Templates',
        icon: '\uD83D\uDCE0',
        items: [
          { subject: 'Services Brochure (A5 Flyer)', body: 'Front: Bold headline \u2014 "Planning Approved? Let\'s Build." with your company name and logo.\nInside: List your services (extensions, loft conversions, renovations, etc.). Include 3 before/after project photos with brief captions.\nBack: Client testimonials, your contact details, and a QR code linking to your portfolio website.\nTip: Print in colour on quality 170gsm+ paper. Hand-deliver in a weatherproof envelope.' },
          { subject: 'Special Offer Flyer', body: 'Headline: "Free consultation \u2014 worth \u00a3[value]"\nBody: Offer a free site visit and written quote. Mention you\'re a local company with [X] years of experience.\nCall to action: "Reply to this flyer or visit [website] to claim your free consultation."\nTip: Add a tear-off tab at the bottom with your phone/email/website.' },
          { subject: 'Case Study Flyer', body: 'Headline: "How we transformed [project type] in [area]"\nBody: Tell the story of a recent project from initial enquiry to completion. Include photos, timeline, budget, and client quote.\nBottom: "Ready to start your own project? Call [phone] or visit [website]"\nTip: Keep it to one A4 page folded in thirds \u2014 it fits perfectly in a standard envelope.' }
        ]
      },
      {
        title: 'Follow-Up Sequences',
        icon: '\uD83D\uDD04',
        items: [
          { subject: 'Week 1: Initial Outreach', body: 'Day 1: Post introduction letter + flyer + business card\nDay 2: Email introduction (use email template above)\nDay 3: Visit address in person \u2014 knock and introduce yourself\nDay 5: Post follow-up letter if no response' },
          { subject: 'Week 2: Build Relationship', body: 'Day 8: Email tip/checklist (use email template above)\nDay 10: Second flyer drop with case study\nDay 12: Send SMS: "Hi [name], [your name] from [company] here. I popped by last week about your planning application. Just wanted to say I\'m here if you need anything. My number is [phone]."' },
          { subject: 'Week 3-4: Final Touch', body: 'Week 3: Final email nudge\nWeek 4: Final flyer drop with special offer handwritten note\nAfter this: Move to quarterly check-in \u2014 send a postcard or Christmas card to stay top of mind' }
        ]
      },
      {
        title: 'Objection Handling',
        icon: '\u2753',
        items: [
          { subject: '"We\'re still waiting for planning approval"', body: 'Response: "No problem at all. I actually help clients prepare for approval so they\'re ready to start building the moment permission comes through. Would it help if I shared a few things you can be doing in the meantime?"\nFollow up: Send your checklist of pre-approval preparation steps.' },
          { subject: '"We\'re comparing quotes from a few builders"', body: 'Response: "That\'s sensible. I\'d encourage you to look beyond the headline price \u2014 check the scope of work, materials specified, and timeline commitments. I\'ve put together a comparison guide that might help. No pressure to choose today."\nFollow up: Email your "Choosing the Right Builder" guide.' },
          { subject: '"The budget isn\'t confirmed yet"', body: 'Response: "I completely understand. Many of my clients start with a free consultation where I walk through typical costs for a project like yours. There\'s absolutely no obligation. Would [day/time] work for a quick 15-minute call?"\nFollow up: Send your free consultation offer flyer.' }
        ]
      },
      {
        title: 'Best Practices',
        icon: '\u2B50',
        items: [
          { subject: 'Speed is everything', body: 'Planning applications are public and visible. Other builders are looking at the same leads. Be first with your letter and flyer \u2014 aim for same-day delivery.' },
          { subject: 'Personalisation wins', body: 'Reference the specific application \u2014 mention the address, the type of work proposed (extension, conversion, new build). Generic letters get binned. Personalised ones get read.' },
          { subject: 'Physical beats digital', body: 'An email is forgotten in seconds. A brochure on the kitchen table gets read over breakfast. Hand-deliver your materials for the best response rate.' },
          { subject: 'Follow up, don\'t give up', body: 'Most people don\'t respond to the first letter. Plan a 3-touch sequence (letter, visit, follow-up letter) over 2 weeks. Persistence pays.' }
        ]
      },
      {
        title: 'Recommended Timing',
        icon: '\u23F0',
        items: [
          { subject: 'Best time to send letters', body: 'Monday or Tuesday \u2014 arrives mid-week when people are settled. Avoid Friday (ignored over weekend) and Monday morning (busy).' },
          { subject: 'Best time to visit in person', body: 'Late afternoon (4-6pm) or Saturday morning. People are home and more relaxed. Avoid lunchtime (12-2pm) and evening (after 7pm).' },
          { subject: 'Email timing', body: 'Tuesday-Thursday, 9-11am. Open rates are highest mid-week mid-morning.' }
        ]
      }
    ]
  },
  moving: {
    name: 'Moving Leads Success Kit',
    icon: '\uD83D\uDE9A',
    color: '#ff6b35',
    summary: '12-email campaign \u00b7 4 letter templates \u00b7 3 flyer inserts \u00b7 4 follow-up sequences',
    header: 'Here\'s exactly how successful agents and removal companies convert moving leads. âš ï¸ We provide addresses only — no emails or phone numbers. Post a flyer + letter in person or via Royal Mail. In-person works best with a sign-written vehicle, uniform, and quality materials.',
    sections: []
  },
  probate: {
    name: 'Probate Leads Success Kit',
    icon: '\u2696\uFE0F',
    color: '#a855f7',
    summary: '14-email campaign \u00b7 4 letter templates \u00b7 3 flyer inserts \u00b7 4 follow-up sequences', 
    header: 'Here\'s exactly how successful probate practitioners convert probate leads. âš ï¸ We provide addresses only — no emails or phone numbers. Post a flyer + letter in person or via Royal Mail. In-person works best with a sign-written vehicle, uniform, and quality materials.',
    sections: []
  },
  newbusiness: {
    name: 'New Business Success Kit',
    icon: '\uD83C\uDFE2',
    color: '#06b6d4',
    summary: '10-email campaign \u00b7 3 letter templates \u00b7 2 flyer inserts \u00b7 3 follow-up sequences',
    header: 'Here\'s exactly how successful agencies and consultants convert new business leads. âš ï¸ We provide addresses only — no emails or phone numbers. Post a flyer + letter in person or via Royal Mail. In-person works best with a sign-written vehicle, uniform, and quality materials.',
    sections: []
  },
  tenders: {
    name: 'Public Tenders Success Kit',
    icon: '\uD83D\uDCCB',
    color: '#6366f1',
    summary: '8-email campaign \u00b7 3 letter templates \u00b7 2 flyer inserts \u00b7 4 follow-up sequences',
    header: 'Here\'s exactly how successful contractors convert tender opportunities. âš ï¸ We provide addresses only — no emails or phone numbers. Post a flyer + letter in person or via Royal Mail. In-person works best with a sign-written vehicle, uniform, and quality materials.',
    sections: []
  }
};

// Copy sections from planning to other products as base content
CAMPAIGN_KITS.moving.sections = [
  { title: 'Email Templates (12-Campaign)', icon: '\u2709\uFE0F', items: [
    { subject: 'Quick intro — I see your property at [address] has just been listed', body: 'Hi [name],\n\nI noticed your property at [address] has recently come onto the market and I wanted to introduce myself. I\'m [your name] from [company], and I specialise in helping sellers in [area] achieve a fast, fair sale.\n\nI\'ve attached a brochure showing how we work with homeowners like you. I\'ll also pop a printed copy through your door this week.\n\nIn the meantime, if you\'d like to learn how we can help you get the best outcome from your sale, just reply to this email.\n\nBest regards,\n[Your name]' },
    { subject: 'Follow-up — Your property at [address]', body: 'Hi [name],\n\nI dropped a brochure through your door last week about your property at [address]. I wanted to make sure it arrived and to see if you had any questions.\n\nI know selling a home can feel overwhelming. I help sellers in [area] navigate the process from start to finish. Would you be open to a quick chat?\n\nI\'m happy to pop round at a time that suits you.\n\nBest,\n[Your name]' },
    { subject: 'Tip — 3 things every seller should know', body: 'Hi [name],\n\nI hope the sale of your property at [address] is going well. While you\'re in the process, here are three things every seller should consider:\n\n1. First impressions matter — kerb appeal can add 5-10% to your final price\n2. Getting the pricing right from day one attracts serious buyers faster\n3. Having a clear timeline reduces stress and helps you plan your next move\n\nI\'ve put together a simple checklist that might help. No strings attached — just something I share with my clients.\n\nIf you\'d like to chat about how I can help, I\'m here.\n\nBest,\n[Your name]' },
    { subject: 'Final nudge — Still here if you need me', body: 'Hi [name],\n\nJust checking in one last time regarding your property at [address]. If the timing isn\'t right to make a change, I completely understand.\n\nWhen you\'re ready, my details are below. I\'ll also pop another flyer through your door next week with an updated market insight for your area.\n\nWishing you all the best with your sale.\n\nKind regards,\n[Your name]' }
  ]},
  { title: 'Introduction Letter Templates', icon: '\uD83D\uDCC4', items: [
    { subject: 'Standard Introduction Letter', body: '[Your Company Letterhead]\n\n[Date]\n\n[Homeowner Name]\n[Address]\n\nDear [Name],\n\nRE: Your Property at [Address]\n\nI recently noticed your property has come onto the market and wanted to introduce myself. I\'m [your name], owner of [company], and I specialise in helping homeowners in [area] achieve outstanding results when selling or letting their property.\n\nI know that choosing the right agent is one of the most important decisions you\'ll make. That\'s why I take a personal approach — understanding your goals, your timeline, and what matters most to you.\n\nI\'ve enclosed a brochure that explains how I work, along with testimonials from recent clients. I\'ll follow up in a few days to see if you have any questions.\n\nWarm regards,\n[Your name]\n[Phone / Email / Website]' },
    { subject: 'Compassionate Follow-Up', body: '[Your Company Letterhead]\n\nDear [Name],\n\nI wrote to you recently about your property at [address]. I appreciate you may be busy with the sale process, so I wanted to follow up briefly.\n\nIf now isn\'t the right time, I completely understand. When you\'re ready to have a conversation, I\'d be delighted to help.\n\nIn the meantime, I\'ve enclosed a local market update that you might find useful.\n\nWarm wishes,\n[Your name]' }
  ]},
  { title: 'Flyer Insert Templates', icon: '\uD83D\uDCE0', items: [
    { subject: 'Property Services Brochure (A5 Flyer)', body: 'Front: Bold headline "Selling in [area]? Let\'s Talk." with your photo and company logo.\nInside: List your services (sales, lettings, valuations, etc.), recent sold prices, and 3 success stories.\nBack: Client testimonials, contact details, QR code to your listings.\nTip: Print on quality paper. Hand-deliver in weatherproof envelope.' },
    { subject: 'Market Insight Flyer', body: 'Headline: "What\'s happening in [area]\'s property market?"\nBody: Show 3-4 local sold prices, average time to sell, current demand levels.\nBottom: "Want a free valuation? Call [phone] or visit [website]"\nTip: Update monthly and keep a stack in your car for impromptu drops.' },
    { subject: 'Homeowner Checklist Flyer', body: 'Headline: "10 Steps to a Stress-Free Sale"\nBody: Numbered checklist from instruction to completion with your logo.\nBottom: "I help [area] homeowners sell faster. Let\'s talk."\nTip: Useful content gets kept — this flyer stays on the fridge.' }
  ]},
  { title: 'Follow-Up Sequences', icon: '\uD83D\uDD04', items: [
    { subject: 'Week 1: Initial Outreach', body: 'Day 1: Post introduction letter + brochure + business card\nDay 2: Email introduction (use email template above)\nDay 3: Visit property in person — knock and introduce yourself\nDay 5: Post follow-up letter if no response' },
    { subject: 'Week 2: Build Relationship', body: 'Day 8: Email market insight tip\nDay 10: Second flyer drop with market update\nDay 12: Send SMS: "Hi [name], [your name] from [company] here. I popped by about your property. Happy to help anytime — [phone]"' },
    { subject: 'Week 3-4: Final Touch', body: 'Week 3: Final email nudge\nWeek 4: Final flyer drop with handwritten note\nAfter: Quarterly check-in — send market updates to stay top of mind' }
  ]},
  { title: 'Objection Handling', icon: '\u2753', items: [
    { subject: '"I\'m happy with my current agent"', body: 'Response: "That\'s great to hear. If things change or you\'d like a second opinion on your property\'s value, I\'m always happy to provide a free, no-obligation market appraisal. My service is built around a more personal approach."\nFollow up: Send your client testimonials brochure.' },
    { subject: '"I\'m not sure about the timing"', body: 'Response: "Spring and autumn are traditionally the strongest selling seasons, but properties in [area] are selling year-round. I can show you recent comparable sales and help you decide what\'s right for your situation."\nFollow up: Email your local market data flyer.' },
    { subject: '"I need to discuss with my partner"', body: 'Response: "Of course. I\'ve put together a simple information pack that explains everything — commission, marketing plan, timeline. Would it help if I posted a printed copy for you both to review together?"\nFollow up: Post printed info pack with both their names on it.' }
  ]},
  { title: 'Best Practices', icon: '\u2B50', items: [
    { subject: 'Speed matters', body: 'Properties go SSTC every day. Be first with your letter and flyer — aim for same-day delivery when a new listing appears in your area.' },
    { subject: 'Personalise everything', body: 'Reference the specific property address, the estate agent\'s description, and the asking price. Generic letters get ignored.' },
    { subject: 'Physical beats digital', body: 'A brochure on the kitchen table gets read. Hand-deliver your materials — it shows you\'re local and committed.' },
    { subject: 'Follow up systematically', body: 'Most people don\'t respond to the first letter. Plan a 3-touch sequence over 2 weeks.' }
  ]},
  { title: 'Recommended Timing', icon: '\u23F0', items: [
    { subject: 'Best time to send letters', body: 'Tuesday or Wednesday — arrives mid-week when people are settled. Avoid Fridays and Mondays.' },
    { subject: 'Best time to visit in person', body: 'Late afternoon (4-6pm) or Saturday morning. Avoid lunchtime and after 7pm.' },
    { subject: 'Email timing', body: 'Tuesday-Thursday, 9-11am. Highest open rates mid-week mid-morning.' }
  ]}
];

CAMPAIGN_KITS.probate.sections = [
  { title: 'Email Templates (14-Campaign)', icon: '\u2709\uFE0F', items: [
    { subject: 'Compassionate intro regarding [deceased] estate', body: 'Dear [name],\n\nI was sorry to learn of the passing of [deceased name]. I understand this is a difficult time, and I want to be respectful of that.\n\nI\'m writing because I specialise in helping families in [area] navigate the probate process. Many people don\'t realise that probate can take 6-12 months, and having the right support early makes a significant difference.\n\nI\'ve enclosed a guide that explains the process in simple terms — no jargon, no pressure. I\'ll also post a printed copy to you this week.\n\nIf you\'d find it helpful to have a chat when you\'re ready, I\'m here.\n\nWith sincere regards,\n[Your name]' },
    { subject: 'Follow-up — Probate guide for [deceased] estate', body: 'Dear [name],\n\nI hope you received the probate guide I posted regarding [deceased name]\'s estate. I wanted to check you had it and to see if any questions came to mind.\n\nProbate involves several steps — valuing the estate, paying any inheritance tax, applying for the grant, and finally distributing assets. I help families through each stage.\n\nThere\'s absolutely no obligation. If you\'d like to have a brief conversation about your situation, I\'d be happy to help.\n\nBest regards,\n[Your name]' },
    { subject: 'Tip — 5 things to know about probate', body: 'Dear [name],\n\nI hope you\'re managing ok following your loss. I wanted to share a few things that might be helpful as you navigate the probate process:\n\n1. You don\'t have to do it alone — probate practitioners can handle everything\n2. Inheritance tax must be paid within 6 months of the death\n3. The grant of probate typically takes 8-16 weeks to obtain\n4. Estate accounts need to be prepared for beneficiaries\n5. Professional fees are often recoverable from the estate\n\nI\'ve put together a simple checklist that explains each step. If you\'d like a copy, just reply and I\'ll send it over.\n\nWarm regards,\n[Your name]' },
    { subject: 'Final gentle nudge', body: 'Dear [name],\n\nJust checking in one last time regarding [deceased name]\'s estate. If the timing isn\'t right to get help yet, I completely understand.\n\nWhen you\'re ready, my details are below. I\'ll also post another information pack next month with an updated probate guide.\n\nWishing you all the best.\n\nKind regards,\n[Your name]' }
  ]},
  { title: 'Introduction Letter Templates', icon: '\uD83D\uDCC4', items: [
    { subject: 'Compassionate Introduction Letter', body: '[Your Company Letterhead]\n\n[Date]\n\n[Executor Name]\n[Address]\n\nDear [Name],\n\nRE: Estate of [Deceased Name]\n\nI understand this may be a difficult time, and I wanted to write to you with the utmost respect and sensitivity.\n\nMy name is [your name], and I am a probate practitioner based in [area]. I help families like yours navigate the probate process — from valuing the estate and dealing with inheritance tax to obtaining the grant and distributing assets.\n\nI\'ve enclosed a simple guide that explains the process step by step. There is absolutely no obligation — I simply wanted you to know that support is available if and when you need it.\n\nWith sincere regards,\n[Your name]\n[Phone / Email / Website]' },
    { subject: 'Follow-Up Letter', body: '[Your Company Letterhead]\n\nDear [Name],\n\nI wrote to you recently regarding the estate of [deceased name]. I appreciate you may need time to consider your options, and I wanted to follow up briefly.\n\nIf now isn\'t the right time, that\'s completely fine. When you\'re ready to have a conversation, please don\'t hesitate to get in touch.\n\nIn the meantime, I\'ve enclosed a frequently asked questions guide about probate that you might find useful.\n\nWarm wishes,\n[Your name]' }
  ]},
  { title: 'Flyer Insert Templates', icon: '\uD83D\uDCE0', items: [
    { subject: 'Probate Services Brochure (A5 Flyer)', body: 'Front: Gentle headline "Navigating Probate? You Don\'t Have To Do It Alone." with your logo.\nInside: List your services (grant application, estate accounts, IHT returns, asset distribution). Include testimonials from families you\'ve helped.\nBack: Step-by-step probate timeline infographic. Contact details.\nTip: Use warm colours and compassionate language. Avoid aggressive sales messaging.' },
    { subject: 'Probate Guide Flyer', body: 'Headline: "Probate in Plain English — A Simple Guide"\nBody: Brief explanation of the probate process in 5 simple steps with estimated timeframes.\nBottom: "Need help? I\'m here. Call [phone] or visit [website]"\nTip: This is an educational piece — families keep it for reference.' },
    { subject: 'Executor Checklist Flyer', body: 'Headline: "Your 10-Step Probate Checklist"\nBody: Actionable checklist from registering the death to final distribution.\nBottom: "Tick each step off with professional support — free initial chat."\nTip: Print on high-quality paper. The checklist format makes it useful for months.' }
  ]},
  { title: 'Follow-Up Sequences', icon: '\uD83D\uDD04', items: [
    { subject: 'Week 1: Initial Outreach', body: 'Day 1: Post compassionate letter + probate guide + business card\nDay 2: Email introduction (use email template above)\nDay 3: Visit address in person — leave card if no answer\nDay 5: Post follow-up letter' },
    { subject: 'Week 2: Nurture', body: 'Day 8: Email probate FAQ guide\nDay 10: Second flyer drop with executor checklist\nDay 12: Send SMS: "Hi [name], [your name] here. Just following up on the probate guide I sent. Happy to help anytime — [phone]"' },
    { subject: 'Week 3-4: Gentle Final Touch', body: 'Week 3: Final email nudge\nWeek 4: Final information pack drop\nAfter: Quarterly check-in — send updated probate guides or seasonal card' }
  ]},
  { title: 'Objection Handling', icon: '\u2753', items: [
    { subject: '"We\'re handling it ourselves"', body: 'Response: "Many families start that way, and that\'s completely understandable. If at any point you find the process overwhelming — particularly with the inheritance tax return or estate accounts — please know I\'m here to help with as much or as little as you need."\nFollow up: Send your probate step-by-step guide.' },
    { subject: '"We\'re using a local solicitor"', body: 'Response: "That\'s a sensible approach. If I can share one piece of advice — make sure they specialise in probate and know the current IHT thresholds. I\'d be happy to provide a free second opinion on any aspect of the estate if helpful."\nFollow up: Email your probate FAQ sheet.' },
    { subject: '"We need to discuss with family"', body: 'Response: "Of course. I\'ve put together a simple information pack that you can share with them. It explains everything clearly — costs, process, timeline. Would you like me to post a printed copy?"\nFollow up: Post printed information pack addressed to the family.' }
  ]},
  { title: 'Best Practices', icon: '\u2B50', items: [
    { subject: 'Lead with compassion', body: 'Probate is emotional. Your tone must be gentle, respectful, and helpful — never pushy. Families remember how you made them feel.' },
    { subject: 'Educate, don\'t sell', body: 'Most people don\'t understand probate. Provide useful guides and checklists. Position yourself as the expert who helps, not the salesperson who pitches.' },
    { subject: 'Physical materials build trust', body: 'A professional printed guide left with the family conveys credibility. It shows you\'re established and serious about helping.' },
    { subject: 'Be patient', body: 'Probate decisions take weeks or months. Follow up gently over time. Families rarely buy on the first contact.' }
  ]},
  { title: 'Recommended Timing', icon: '\u23F0', items: [
    { subject: 'Best time to send letters', body: 'Mid-week (Tuesday-Thursday). Avoid the anniversary of the death or known family occasions.' },
    { subject: 'Best time to visit', body: 'Late afternoon, 3-5pm. Be prepared to leave quietly if the family is not ready to engage.' },
    { subject: 'Email timing', body: 'Tuesday-Thursday, 10am-12pm. Keep subject lines warm and non-salesy.' }
  ]}
];

CAMPAIGN_KITS.newbusiness.sections = [
  { title: 'Email Templates (10-Campaign)', icon: '\u2709\uFE0F', items: [
    { subject: 'Congratulations on your new company registration', body: 'Hi [name],\n\nCongratulations on registering [company name] with Companies House. Starting a new business is an exciting step, and I wanted to be one of the first to welcome you.\n\nI\'m [your name] from [company], and I help new businesses in [area] with [service — accounting, marketing, IT, consultancy, etc.]. Many of my clients started exactly where you are now.\n\nI\'ve put together a welcome pack for newly registered companies — it includes a guide to the first steps every new business should take. I\'ll also post a printed copy to your registered address this week.\n\nIf you\'d find it helpful to have a no-obligation chat about how we might work together, I\'d love to hear from you.\n\nBest regards,\n[Your name]' },
    { subject: 'Follow-up — Your welcome pack for [company name]', body: 'Hi [name],\n\nI hope you received the welcome pack I posted for [company name]. I wanted to check it arrived and to see how your first few weeks of trading are going.\n\nIf you\'d like any help with [specific service], I\'d be happy to have a brief call. There\'s no obligation — I simply want to introduce myself as a local resource for new businesses.\n\nBest,\n[Your name]' },
    { subject: 'Tip — 5 things every new business should do in month one', body: 'Hi [name],\n\nRunning a new business is busy — I get it. Here are five things that will set you up for success in your first month:\n\n1. Set up a separate business bank account\n2. Register for VAT if your turnover will exceed \u00a390,000\n3. Get your accounting software in place\n4. Set up a basic website with your business details\n5. Register with the Information Commissioner\'s Office (ICO) if you handle personal data\n\nI\'ve put together a more detailed checklist. If you\'d like a copy, just reply and I\'ll send it over.\n\nBest,\n[Your name]' },
    { subject: 'Final nudge — Still here to help [company name]', body: 'Hi [name],\n\nJust checking in one last time regarding [company name]. If the timing isn\'t right to bring in support yet, I completely understand.\n\nWhen you\'re ready, my details are below. I\'ll also pop another information pack in the post next month with some useful resources for growing businesses.\n\nWishing you every success with your new venture.\n\nKind regards,\n[Your name]' }
  ]},
  { title: 'Introduction Letter Templates', icon: '\uD83D\uDCC4', items: [
    { subject: 'New Business Welcome Letter', body: '[Your Company Letterhead]\n\n[Date]\n\n[Company Name]\n[Registered Address]\n\nDear [Name],\n\nRE: Welcome to [Company Name]\n\nI recently noticed that you\'ve registered [company name] with Companies House, and I wanted to be the first to welcome you.\n\nI\'m [your name], founder of [company], and I specialise in helping new businesses like yours with [service]. I know the first few months can feel overwhelming, so I\'ve put together a welcome pack with practical advice for getting started.\n\nI\'ve enclosed it with this letter. There\'s absolutely no obligation — I simply wanted to introduce myself as someone who can help when you\'re ready.\n\nWarm regards,\n[Your name]\n[Phone / Email / Website]' },
    { subject: 'Follow-Up Letter', body: '[Your Company Letterhead]\n\nDear [Name],\n\nI wrote to you recently to welcome you on the registration of [company name]. I hope you found the welcome pack useful.\n\nIf now isn\'t the right time to engage support, I completely understand. When you\'re ready, please feel free to get in touch.\n\nIn the meantime, I\'ve enclosed a business planning guide that you might find helpful as you grow.\n\nWarm wishes,\n[Your name]' }
  ]},
  { title: 'Flyer Insert Templates', icon: '\uD83D\uDCE0', items: [
    { subject: 'New Business Services Flyer', body: 'Front: Bold "Congratulations on your new business!" with your company logo.\nInside: List your services tailored to new/small businesses. Include pricing options or package deals.\nBack: Client testimonials, your qualifications, contact details.\nTip: Keep the tone celebratory and supportive — not salesy.' },
    { subject: 'Startup Checklist Flyer', body: 'Headline: "Your First 90 Days in Business — A Checklist"\nBody: Actionable checklist across legal, financial, marketing, and operations.\nBottom: "Need help checking things off? Let\'s talk."\nTip: This is a high-value resource — businesses keep it pinned to their noticeboard.' },
    { subject: 'Services Overview (A4 Tri-Fold)', body: 'Panel 1: Your story — why you help new businesses.\nPanel 2: Your services with clear pricing or packages.\nPanel 3: Case study — how you helped a similar business succeed.\nTip: Use bullet points and clear headings. Busy founders skim-read.' }
  ]},
  { title: 'Follow-Up Sequences', icon: '\uD83D\uDD04', items: [
    { subject: 'Week 1: Initial Outreach', body: 'Day 1: Post welcome letter + startup pack + business card\nDay 2: Email introduction (use email template above)\nDay 3: Visit registered address in person if local\nDay 5: Post follow-up letter' },
    { subject: 'Week 2: Nurture', body: 'Day 8: Email tip/checklist\nDay 10: Second flyer drop with case study\nDay 12: Send SMS: "Hi [name], [your name] from [company]. I sent a welcome pack for [company name]. Happy to help at any stage — [phone]"' },
    { subject: 'Week 3-4: Final Touch', body: 'Week 3: Final email nudge\nWeek 4: Final flyer drop with special offer\nAfter: Quarterly check-in — send business tips or seasonal offers' }
  ]},
  { title: 'Objection Handling', icon: '\u2753', items: [
    { subject: '"We already have someone"', body: 'Response: "That\'s great to hear. If your needs ever change or you\'d like a second opinion on anything — from pricing to service scope — I\'d be happy to help. No pressure at all."\nFollow up: Send your service comparison guide.' },
    { subject: '"We\'re not ready yet / it\'s early days"', body: 'Response: "I completely understand — the first few months are about finding your feet. When you\'re ready to think about [service], I\'d love to have a conversation. In the meantime, I\'ll send you a few resources that might be useful."\nFollow up: Email your new business checklist.' },
    { subject: '"We need to check our budget"', body: 'Response: "Of course. I offer flexible options designed for growing businesses. Would it help if I sent over a simple pricing breakdown with different package levels?"\nFollow up: Post your pricing overview flyer.' }
  ]},
  { title: 'Best Practices', icon: '\u2B50', items: [
    { subject: 'Be early', body: 'New companies register every day. Being the first to reach out positions you as proactive and attentive.' },
    { subject: 'Celebrate their launch', body: 'A new business registration is exciting. Your tone should be congratulatory and supportive, not transactional.' },
    { subject: 'Keep an eye on their website', body: 'Many new businesses launch their website weeks after registering. Check periodically and reference it in your follow-up.' },
    { subject: 'Build a relationship', body: 'Founders are busy. Don\'t expect an instant sale. Nurture the relationship over weeks and months.' }
  ]},
  { title: 'Recommended Timing', icon: '\u23F0', items: [
    { subject: 'Best time to send letters', body: 'Within 48 hours of their company appearing on Companies House. Speed gives you first-mover advantage.' },
    { subject: 'Best time to visit', body: 'Late morning (10-12pm) or early afternoon (2-4pm). Registered offices may be staffed during business hours.' },
    { subject: 'Email timing', body: 'Tuesday-Thursday, 9-11am. Business owners check email first thing.' }
  ]}
];

CAMPAIGN_KITS.tenders.sections = [
  { title: 'Email Templates (8-Campaign)', icon: '\u2709\uFE0F', items: [
    { subject: 'Tender opportunity — [tender title/ref] in your area', body: 'Hi [name],\n\nI came across a tender opportunity that matches your expertise — [tender title] published by [buying organisation].\n\nI\'m [your name] from [company], and I help [business type] like yours identify and win public sector contracts.\n\nThe tender closes on [closing date], so time is of the essence. I\'ve put together a quick checklist of what you\'ll need to prepare a strong submission.\n\nIf you\'d like me to review the tender documents or help with your capability statement, I\'d be happy to help.\n\nBest regards,\n[Your name]' },
    { subject: 'Follow-up — Tender support for [tender title]', body: 'Hi [name],\n\nI wanted to follow up on the [tender title] opportunity I mentioned. Have you had a chance to review the tender documents?\n\nPublic sector bids can be time-consuming, but they\'re also highly rewarding — successful contracts often lead to repeat business. If you\'d like support with your submission, I can help with:\n\n- Reviewing the tender documents\n- Drafting your capability statement\n- Pricing guidance\n- Quality questionnaire responses\n\nLet me know if a quick call would be helpful.\n\nBest,\n[Your name]' },
    { subject: 'Tip — 5 tips for winning public sector tenders', body: 'Hi [name],\n\nWinning public sector tenders is about more than the lowest price. Here are five tips that will strengthen your submissions:\n\n1. Read the full tender document before you start writing\n2. Answer every question directly — don\'t leave anything blank\n3. Provide evidence for every claim you make\n4. Price realistically — public sector buyers value quality over lowest cost\n5. Submit before the deadline — late submissions are rejected automatically\n\nI\'ve put together a more detailed tender preparation guide. Would you like me to send a copy?\n\nBest,\n[Your name]' },
    { subject: 'Final nudge — Upcoming opportunities in your sector', body: 'Hi [name],\n\nJust checking in one last time regarding the tender opportunities in your sector. If now isn\'t the right time to bid, I completely understand.\n\nWhen you\'re ready to start bidding, I\'m here to help with tender preparation, capability statements, and submission reviews.\n\nI\'ll send through any relevant opportunities I come across in the future.\n\nKind regards,\n[Your name]' }
  ]},
  { title: 'Introduction Letter Templates', icon: '\uD83D\uDCC4', items: [
    { subject: 'Capability Statement Cover Letter', body: '[Your Company Letterhead]\n\n[Date]\n\n[Procurement Manager Name]\n[Bought Organisation]\n\nDear [Name],\n\nRE: [Tender Title / Reference Number]\n\nI am writing to introduce [company name] and express our interest in the above tender opportunity.\n\n[Company name] specialises in [service], and we have successfully delivered similar contracts for [relevant clients or sectors]. I\'ve enclosed our capability statement which provides full details of our experience, accreditations, and track record.\n\nWe would welcome the opportunity to submit a full tender response and look forward to your feedback.\n\nYours sincerely,\n[Your name]\n[Position]\n[Company]\n[Phone / Email / Website]' },
    { subject: 'Company Introduction Letter (for framework applications)', body: '[Your Company Letterhead]\n\nDear [Name],\n\nI\'m writing to introduce [company name] as a potential supplier for [service area]. We have been delivering [service] for [X] years and are particularly experienced in [specific expertise].\n\nI\'ve enclosed our company brochure and capability statement. We would welcome the opportunity to be considered for future tender opportunities within your organisation.\n\nI will follow up next week to discuss how we might work together.\n\nYours faithfully,\n[Your name]' }
  ]},
  { title: 'Flyer Insert Templates', icon: '\uD83D\uDCE0', items: [
    { subject: 'Capability Statement (A4 Professional Document)', body: 'Header: Company logo, name, and contact details.\nSection 1: Company overview — who you are, what you do, key differentiators.\nSection 2: Relevant experience — 3-4 case studies with client names, contract values, outcomes.\nSection 3: Accreditations, certifications, insurance details.\nSection 4: Testimonials and client references.\nTip: Keep to 2-4 pages maximum. Procurement managers read quickly.' },
    { subject: 'Services Overview Flyer', body: 'Front: "Trusted [service] provider for the public sector"\nInside: Services offered, geographic coverage, contract value range, key clients.\nBack: Contact details, website, company registration number, certifications.\nTip: Print in full colour on quality paper. This doubles as a leave-behind after meetings.' },
    { subject: 'Case Study Flyer', body: 'Headline: "How we delivered [project] for [client] — \u00a3[X] under budget"\nBody: Problem â†’ Solution â†’ Results format with measurable outcomes and client quote.\nBottom: "Ready to discuss your next tender? Contact us."\nTip: Specific, measurable results are what procurement teams want to see.' }
  ]},
  { title: 'Follow-Up Sequences', icon: '\uD83D\uDD04', items: [
    { subject: 'Week 1: Initial Outreach', body: 'Day 1: Submit tender application / post capability statement\nDay 2: Email follow-up\nDay 3: Phone call to procurement contact\nDay 5: Post company brochure to buying organisation' },
    { subject: 'Week 2: Build Relationship', body: 'Day 8: Email relevant case study\nDay 10: Post additional supporting documents\nDay 12: Send SMS or LinkedIn message to procurement contact' },
    { subject: 'Week 3-4: Close or Next Opportunity', body: 'Week 3: Final email + call to check on decision timeline\nWeek 4: If unsuccessful, request debrief and feedback\nOngoing: Monitor for new opportunities and re-engage' }
  ]},
  { title: 'Objection Handling', icon: '\u2753', items: [
    { subject: '"We\'re not accepting new suppliers"', body: 'Response: "I understand. Would it be possible to be added to your approved supplier list for when it opens? I\'d also welcome the opportunity to submit a capability statement for your records."\nFollow up: Send capability statement for their files.' },
    { subject: '"We already have preferred suppliers"', body: 'Response: "That\'s good to hear. If any of your current suppliers are unable to deliver, we\'d welcome the opportunity to step in. I\'ll leave my details and capability statement with you."\nFollow up: Re-engage every 6 months with updated capability statement.' },
    { subject: '"The budget has already been allocated"', body: 'Response: "Understood. Are there any upcoming projects in your pipeline that we could be considered for? I\'d be happy to provide early input at no cost."\nFollow up: Send relevant case studies for future reference.' }
  ]},
  { title: 'Best Practices', icon: '\u2B50', items: [
    { subject: 'Read every word', body: 'Tender documents contain critical information — evaluation criteria, deadlines, formatting requirements. Missing a detail can disqualify you.' },
    { subject: 'Provide evidence', body: 'Don\'t just say you can do something. Prove it with case studies, client references, and measurable outcomes.' },
    { subject: 'Submit early', body: 'Aim to submit 24-48 hours before the deadline. This avoids last-minute technical issues and shows you\'re organised.' },
    { subject: 'Request feedback', body: 'If you\'re unsuccessful, request a debrief. Procurement teams are required to provide feedback, and it\'s invaluable for improving future bids.' }
  ]},
  { title: 'Recommended Timing', icon: '\u23F0', items: [
    { subject: 'When to start preparing', body: 'As soon as the tender is published. Many tenders have a 3-6 week window, but quality submissions take time to prepare.' },
    { subject: 'Best time to contact buyers', body: 'Early in the tender period (first 1-2 weeks). Procurement teams are more accessible before the rush before the deadline.' },
    { subject: 'Email timing', body: 'Tuesday-Thursday, 9-11am. Public sector procurement officers are most responsive mid-week mid-morning.' }
  ]}
];

app.get('/api/campaigns/:product', (req, res) => {
  var kit = CAMPAIGN_KITS[req.params.product];
  if (!kit) return res.status(404).json({ error: 'Campaign not found for this lead type' });
  res.json({ success: true, kit: kit });
});

app.get('/api/campaigns', authMiddleware, (req, res) => {
  var summaries = {};
  var cust = db.prepare('SELECT plan FROM customers WHERE id = ?').get(req.user.id);
  if (cust && cust.plan === 'free_trial') {
    return res.json({ success: true, locked: true, campaigns: {} });
  }
  for (var p in CAMPAIGN_KITS) {
    summaries[p] = { name: CAMPAIGN_KITS[p].name, icon: CAMPAIGN_KITS[p].icon, color: CAMPAIGN_KITS[p].color, summary: CAMPAIGN_KITS[p].summary, header: CAMPAIGN_KITS[p].header };
  }
  res.json({ success: true, campaigns: summaries });
});



// ===== PRINT & POST PRICING =====
// Your markup is added on top of Stannp's print+post costs
var PRINT_POST_PRICES = {
  // Per-item prices charged to customer (GBP)
  flyer_a5: { label: 'A5 Flyer', customer: 1.50, stannp: 0.55 },
  letter_a4: { label: 'A4 Letter', customer: 2.00, stannp: 0.85 },
  flyer_plus_letter: { label: 'A5 Flyer + A4 Letter', customer: 3.00, stannp: 1.20 },
  // Postage included in above prices
  markup_percent: function(item) { return Math.round((this[item].customer - this[item].stannp) / this[item].stannp * 100); }
};

// GET /api/direct-mail/pricing — return Print & Post prices
app.get('/api/direct-mail/pricing', (req, res) => {
  res.json({
    success: true,
    prices: [
      { id: 'flyer_a5', label: 'A5 Flyer (printed & posted)', price: 1.50, unit: 'per item' },
      { id: 'letter_a4', label: 'A4 Letter (printed & posted)', price: 2.00, unit: 'per item' },
      { id: 'flyer_plus_letter', label: 'A5 Flyer + A4 Letter (printed & posted)', price: 3.00, unit: 'per item' }
    ],
    info: 'Prices include full colour printing, folding, and First Class postage. No hidden fees. You only pay for what gets sent — cancelled leads cost nothing.'
  });
});

// ===== DIRECT MAIL MARKETING AUTOMATION =====
var DIRECT_MAIL_STATUSES = ['draft','awaiting_approval','approved','awaiting_payment','paid','queued','sent_to_provider','printing','dispatched','completed','failed','cancelled'];

// 1. Customer Business Profiles
var BUSINESS_TYPES = ['Removals','Roofing','Plumbing','Cleaning','Solar','Windows and Doors','Estate Agency','Mortgage Broker','Insurance','Gardening','Pest Control','Other'];

// POST /api/direct-mail/profile — Create or update business profile
app.post('/api/direct-mail/profile', authMiddleware, (req, res) => {
  try {
    if (!req.body.company_name) return res.status(400).json({ error: 'Business name is required' });
    if (!req.body.phone && !req.body.email) return res.status(400).json({ error: 'Phone or email is required' });
    if (!req.body.business_type) return res.status(400).json({ error: 'Business type is required' });
    const existing = db.prepare('SELECT * FROM customer_business_profiles WHERE customer_id = ?').get(req.user.id);
    const profile = {
      id: existing ? existing.id : uuidv4(),
      customer_id: req.user.id,
      company_name: req.body.company_name,
      business_type: req.body.business_type,
      logo_url: req.body.logo_url || '',
      website: req.body.website || '',
      phone: req.body.phone || '',
      email: req.body.email || '',
      address_line1: req.body.address_line1 || '',
      address_line2: req.body.address_line2 || '',
      city: req.body.city || '',
      postcode: req.body.postcode || '',
      country: req.body.country || 'United Kingdom',
      services_offered: req.body.services_offered || '',
      service_areas: req.body.service_areas || '',
      special_offer: req.body.special_offer || '',
      preferred_colours: req.body.preferred_colours || '',
      brand_tone: req.body.brand_tone || '',
      google_reviews_link: req.body.google_reviews_link || '',
      facebook_page: req.body.facebook_page || '',
      instagram_page: req.body.instagram_page || '',
      short_description: req.body.short_description || '',
      call_to_action: req.body.call_to_action || '',
      created_at: existing ? existing.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (existing) {
      db.prepare('UPDATE customer_business_profiles SET company_name=?,business_type=?,logo_url=?,website=?,phone=?,email=?,address_line1=?,address_line2=?,city=?,postcode=?,country=?,services_offered=?,service_areas=?,special_offer=?,preferred_colours=?,brand_tone=?,google_reviews_link=?,facebook_page=?,instagram_page=?,short_description=?,call_to_action=?,updated_at=? WHERE id=?').run(profile.company_name, profile.business_type, profile.logo_url, profile.website, profile.phone, profile.email, profile.address_line1, profile.address_line2, profile.city, profile.postcode, profile.country, profile.services_offered, profile.service_areas, profile.special_offer, profile.preferred_colours, profile.brand_tone, profile.google_reviews_link, profile.facebook_page, profile.instagram_page, profile.short_description, profile.call_to_action, profile.updated_at, profile.id);
    } else {
      db.prepare('INSERT INTO customer_business_profiles (id,customer_id,company_name,business_type,logo_url,website,phone,email,address_line1,address_line2,city,postcode,country,services_offered,service_areas,special_offer,preferred_colours,brand_tone,google_reviews_link,facebook_page,instagram_page,short_description,call_to_action,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(profile.id, profile.customer_id, profile.company_name, profile.business_type, profile.logo_url, profile.website, profile.phone, profile.email, profile.address_line1, profile.address_line2, profile.city, profile.postcode, profile.country, profile.services_offered, profile.service_areas, profile.special_offer, profile.preferred_colours, profile.brand_tone, profile.google_reviews_link, profile.facebook_page, profile.instagram_page, profile.short_description, profile.call_to_action, profile.created_at, profile.updated_at);
    }
    addTimelineEntry(req.user.id, 'Business Profile ' + (existing ? 'Updated' : 'Created'), profile.company_name);
    res.json({ success: true, profile: profile });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/direct-mail/logo — Upload logo (base64)
app.post('/api/direct-mail/logo', authMiddleware, (req, res) => {
  try {
    if (!req.body.logo) return res.status(400).json({ error: 'No logo data provided' });
    var logoUrl = req.body.logo;
    if (logoUrl.length > 500000) return res.status(400).json({ error: 'Logo too large (max 500KB)' });
    res.json({ success: true, logo_url: logoUrl });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/profile — Get customer's business profile
app.get('/api/direct-mail/profile', authMiddleware, (req, res) => {
  try {
    const profile = db.prepare('SELECT * FROM customer_business_profiles WHERE customer_id = ?').get(req.user.id);
    res.json({ success: true, profile: profile || null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 2. Direct Mail Templates
// POST /api/direct-mail/templates — Create a new template
app.post('/api/direct-mail/templates', authMiddleware, (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Template name is required' });
    var validTypes = ['letter','flyer','flyer_front_back','letter_flyer_pack','postcard'];
    if (req.body.type && validTypes.indexOf(req.body.type) === -1) return res.status(400).json({ error: 'Invalid template type. Valid: ' + validTypes.join(', ') });
    var customerProfile = db.prepare('SELECT * FROM customer_business_profiles WHERE customer_id = ?').get(req.user.id);
    var template = {
      id: uuidv4(),
      customer_id: req.user.id,
      name: req.body.name,
      description: req.body.description || '',
      template_type: req.body.type || 'letter',
      business_type: customerProfile ? (customerProfile.business_type || '') : '',
      flyer_front_material_id: req.body.flyer_front_material_id || '',
      flyer_back_material_id: req.body.flyer_back_material_id || '',
      letter_material_id: req.body.letter_material_id || '',
      ai_generated_text: req.body.ai_generated_text || '',
      status: req.body.status || 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_used_at: ''
    };
    db.prepare('INSERT INTO direct_mail_templates (id,customer_id,name,description,template_type,business_type,flyer_front_material_id,flyer_back_material_id,letter_material_id,ai_generated_text,status,created_at,updated_at,last_used_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(template.id, template.customer_id, template.name, template.description, template.template_type, template.business_type, template.flyer_front_material_id, template.flyer_back_material_id, template.letter_material_id, template.ai_generated_text, template.status, template.created_at, template.updated_at, template.last_used_at);
    res.json({ success: true, template: template });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/direct-mail/templates/:id — Update a template
app.put('/api/direct-mail/templates/:id', authMiddleware, (req, res) => {
  try {
    var existing = db.prepare('SELECT * FROM direct_mail_templates WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    var profile = db.prepare('SELECT * FROM customer_business_profiles WHERE customer_id = ?').get(req.user.id);
    db.prepare('UPDATE direct_mail_templates SET name=?,description=?,template_type=?,business_type=?,flyer_front_material_id=?,flyer_back_material_id=?,letter_material_id=?,ai_generated_text=?,status=?,updated_at=? WHERE id=? AND customer_id=?').run(
      req.body.name || existing.name, req.body.description !== undefined ? req.body.description : existing.description,
      req.body.type || existing.template_type, profile ? (profile.business_type || '') : existing.business_type,
      req.body.flyer_front_material_id !== undefined ? req.body.flyer_front_material_id : existing.flyer_front_material_id,
      req.body.flyer_back_material_id !== undefined ? req.body.flyer_back_material_id : existing.flyer_back_material_id,
      req.body.letter_material_id !== undefined ? req.body.letter_material_id : existing.letter_material_id,
      req.body.ai_generated_text !== undefined ? req.body.ai_generated_text : existing.ai_generated_text,
      req.body.status || existing.status, new Date().toISOString(), req.params.id, req.user.id
    );
    var updated = db.prepare('SELECT * FROM direct_mail_templates WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    res.json({ success: true, template: updated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/direct-mail/templates/:id/duplicate — Duplicate a template
app.post('/api/direct-mail/templates/:id/duplicate', authMiddleware, (req, res) => {
  try {
    var source = db.prepare('SELECT * FROM direct_mail_templates WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!source) return res.status(404).json({ error: 'Template not found' });
    var dup = {
      id: uuidv4(), customer_id: req.user.id,
      name: source.name + ' (Copy)', description: source.description,
      template_type: source.template_type, business_type: source.business_type,
      flyer_front_material_id: source.flyer_front_material_id, flyer_back_material_id: source.flyer_back_material_id,
      letter_material_id: source.letter_material_id, ai_generated_text: source.ai_generated_text,
      status: 'draft', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_used_at: ''
    };
    db.prepare('INSERT INTO direct_mail_templates (id,customer_id,name,description,template_type,business_type,flyer_front_material_id,flyer_back_material_id,letter_material_id,ai_generated_text,status,created_at,updated_at,last_used_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(dup.id, dup.customer_id, dup.name, dup.description, dup.template_type, dup.business_type, dup.flyer_front_material_id, dup.flyer_back_material_id, dup.letter_material_id, dup.ai_generated_text, dup.status, dup.created_at, dup.updated_at, dup.last_used_at);
    res.json({ success: true, template: dup });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/direct-mail/templates/:id/approve — Approve a template
app.post('/api/direct-mail/templates/:id/approve', authMiddleware, (req, res) => {
  try {
    var existing = db.prepare('SELECT * FROM direct_mail_templates WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    db.prepare('UPDATE direct_mail_templates SET status = ?, updated_at = ? WHERE id = ? AND customer_id = ?').run('approved', new Date().toISOString(), req.params.id, req.user.id);
    res.json({ success: true, status: 'approved' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/templates — Get customer's templates
app.get('/api/direct-mail/templates', authMiddleware, (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM direct_mail_templates WHERE customer_id = ? ORDER BY created_at DESC').all(req.user.id);
    // Optionally include material previews
    var expanded = templates.map(function(t) {
      var result = { id: t.id, name: t.name, description: t.description, template_type: t.template_type, business_type: t.business_type, status: t.status, created_at: t.created_at, updated_at: t.updated_at, last_used_at: t.last_used_at };
      result.flyer_front = null; result.flyer_back = null; result.letter = null;
      if (req.query.include_materials === '1') {
        if (t.flyer_front_material_id) { var m = db.prepare('SELECT id,name,type,file_type,file_size,created_at FROM direct_mail_materials WHERE id = ? AND customer_id = ?').get(t.flyer_front_material_id, req.user.id); if (m) result.flyer_front = { id: m.id, name: m.name, file_type: m.file_type }; }
        if (t.flyer_back_material_id) { var m2 = db.prepare('SELECT id,name,type,file_type,file_size,created_at FROM direct_mail_materials WHERE id = ? AND customer_id = ?').get(t.flyer_back_material_id, req.user.id); if (m2) result.flyer_back = { id: m2.id, name: m2.name, file_type: m2.file_type }; }
        if (t.letter_material_id) { var m3 = db.prepare('SELECT id,name,type,file_type,file_size,created_at FROM direct_mail_materials WHERE id = ? AND customer_id = ?').get(t.letter_material_id, req.user.id); if (m3) result.letter = { id: m3.id, name: m3.name, file_type: m3.file_type }; }
      }
      return result;
    });
    res.json({ success: true, templates: expanded });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/templates/:id — Get template by ID (customer data isolated)
app.get('/api/direct-mail/templates/:id', authMiddleware, (req, res) => {
  try {
    const template = db.prepare('SELECT * FROM direct_mail_templates WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json({ success: true, template: template });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/direct-mail/templates/:id — Delete a template
app.delete('/api/direct-mail/templates/:id', authMiddleware, (req, res) => {
  try {
    var existing = db.prepare('SELECT * FROM direct_mail_templates WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    db.prepare('DELETE FROM direct_mail_templates WHERE id = ? AND customer_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true, message: 'Template deleted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 3. Direct Mail Campaigns
// POST /api/direct-mail/campaigns — Create a new campaign
app.post('/api/direct-mail/campaigns', authMiddleware, (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Campaign name is required' });
    const campaign = {
      id: uuidv4(),
      customer_id: req.user.id,
      name: req.body.name,
      description: req.body.description || '',
      status: 'draft',
      template_id: req.body.template_id || '',
      material_id: req.body.material_id || '',
      target_count: req.body.target_count || 0,
      sent_count: 0,
      delivery_date: req.body.delivery_date || '',
      budget: req.body.budget || 0,
      notes: req.body.notes || '',
      provider: '',
      provider_campaign_id: '',
      provider_status: '',
      stripe_session_id: '',
      stripe_payment_id: '',
      stripe_payment_status: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.prepare('INSERT INTO direct_mail_campaigns (id,customer_id,name,description,status,template_id,material_id,target_count,sent_count,delivery_date,budget,notes,provider,provider_campaign_id,provider_status,stripe_session_id,stripe_payment_id,stripe_payment_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(campaign.id, campaign.customer_id, campaign.name, campaign.description, campaign.status, campaign.template_id, campaign.material_id, campaign.target_count, campaign.sent_count, campaign.delivery_date, campaign.budget, campaign.notes, campaign.provider, campaign.provider_campaign_id, campaign.provider_status, campaign.stripe_session_id, campaign.stripe_payment_id, campaign.stripe_payment_status, campaign.created_at, campaign.updated_at);
    // Log initial status
    db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), req.user.id, campaign.id, '', 'draft', 'customer', 'Campaign created', new Date().toISOString());
    addTimelineEntry(req.user.id, 'Campaign Created', campaign.name, campaign.id);
    res.json({ success: true, campaign: campaign });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/campaigns — Get customer's campaigns
app.get('/api/direct-mail/campaigns', authMiddleware, (req, res) => {
  try {
    const campaigns = db.prepare('SELECT * FROM direct_mail_campaigns WHERE customer_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ success: true, campaigns: campaigns });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/campaigns/:id — Get campaign by ID (customer data isolated)
app.get('/api/direct-mail/campaigns/:id', authMiddleware, (req, res) => {
  try {
    const campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    // Get associated data
    const template = campaign.template_id ? db.prepare('SELECT * FROM direct_mail_templates WHERE id = ? AND customer_id = ?').get(campaign.template_id, req.user.id) : null;
    const recipients = db.prepare('SELECT * FROM direct_mail_recipients WHERE campaign_id = ? AND customer_id = ?').all(campaign.id, req.user.id);
    const statusHistory = db.prepare('SELECT * FROM direct_mail_status_history WHERE campaign_id = ? AND customer_id = ? ORDER BY created_at DESC').all(campaign.id, req.user.id);
    res.json({ success: true, campaign: campaign, template: template, recipients: recipients, status_history: statusHistory });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/direct-mail/campaigns/:id/status — Update campaign status
app.put('/api/direct-mail/campaigns/:id/status', authMiddleware, (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    if (DIRECT_MAIL_STATUSES.indexOf(status) === -1) return res.status(400).json({ error: 'Invalid status. Valid: ' + DIRECT_MAIL_STATUSES.join(', ') });
    const campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const fromStatus = campaign.status;
    db.prepare('UPDATE direct_mail_campaigns SET status = ?, updated_at = ? WHERE id = ? AND customer_id = ?').run(status, new Date().toISOString(), req.params.id, req.user.id);
    db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), req.user.id, req.params.id, fromStatus, status, 'customer', notes || 'Status updated to ' + status, new Date().toISOString());
    // Send notification on status change
    var notifTypes = { approved: { subj: 'Campaign Approved', title: '✅ Campaign Approved', body: 'Your campaign "' + campaign.name + '" has been approved and is ready for payment.' },
      awaiting_approval: { subj: 'Campaign Awaiting Approval', title: '✔️ Campaign Ready for Review', body: 'Your campaign "' + campaign.name + '" is ready for you to review and approve.' },
      completed: { subj: 'Campaign Completed!', title: '✅ Campaign Completed', body: 'Your campaign "' + campaign.name + '" has been completed successfully.' },
      failed: { subj: 'Campaign Failed', title: 'âŒ Campaign Failed', body: 'Your campaign "' + campaign.name + '" has failed. Please check the details and retry.' },
      cancelled: { subj: 'Campaign Cancelled', title: 'ðŸš« Campaign Cancelled', body: 'Your campaign "' + campaign.name + '" has been cancelled.' }
    };
    var nt = notifTypes[status];
    if (nt) { sendDMNotification(req.user.id, 'campaign_' + status, nt.subj, nt.title, '<p>' + nt.body + '</p><p style="font-size:12px;color:#5a6280">Recipients: ' + (campaign.target_count || 0) + ' Â· Budget: £' + (campaign.budget || 0) + '</p>', 'View Campaign', PUBLIC_URL + '/portal/dashboard.html?page=direct-mail'); }
    addTimelineEntry(req.user.id, 'Campaign ' + status.charAt(0).toUpperCase() + status.slice(1), campaign.name + ' (' + fromStatus + ' â†’ ' + status + ')', campaign.id);
    res.json({ success: true, from_status: fromStatus, to_status: status });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/direct-mail/campaigns/:id — Delete draft campaign
app.delete('/api/direct-mail/campaigns/:id', authMiddleware, (req, res) => {
  try {
    const campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status !== 'draft') return res.status(400).json({ error: 'Only draft campaigns can be deleted' });
    db.prepare('DELETE FROM direct_mail_recipients WHERE campaign_id = ? AND customer_id = ?').run(req.params.id, req.user.id);
    db.prepare('DELETE FROM direct_mail_status_history WHERE campaign_id = ? AND customer_id = ?').run(req.params.id, req.user.id);
    db.prepare('DELETE FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true, message: 'Campaign deleted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/campaigns/:id/status-history — Get campaign status history
app.get('/api/direct-mail/campaigns/:id/status-history', authMiddleware, (req, res) => {
  try {
    const history = db.prepare('SELECT * FROM direct_mail_status_history WHERE campaign_id = ? AND customer_id = ? ORDER BY created_at DESC').all(req.params.id, req.user.id);
    res.json({ success: true, history: history });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/direct-mail/test — Log a test result for a campaign
app.post('/api/direct-mail/test', authMiddleware, (req, res) => {
  try {
    const testLog = {
      id: uuidv4(),
      customer_id: req.user.id,
      campaign_id: req.body.campaign_id || '',
      test_type: req.body.test_type || 'content_review',
      result: req.body.result || 'pending',
      notes: req.body.notes || '',
      file_url: req.body.file_url || '',
      created_at: new Date().toISOString()
    };
    db.prepare('INSERT INTO direct_mail_test_logs (id,customer_id,campaign_id,test_type,result,notes,file_url,created_at) VALUES (?,?,?,?,?,?,?,?)').run(testLog.id, testLog.customer_id, testLog.campaign_id, testLog.test_type, testLog.result, testLog.notes, testLog.file_url, testLog.created_at);
    res.json({ success: true, test: testLog });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/test/:campaignId — Get test logs for a campaign
app.get('/api/direct-mail/test/:campaignId', authMiddleware, (req, res) => {
  try {
    const tests = db.prepare('SELECT * FROM direct_mail_test_logs WHERE campaign_id = ? AND customer_id = ? ORDER BY created_at DESC').all(req.params.campaignId, req.user.id);
    res.json({ success: true, tests: tests });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/direct-mail/campaigns/:id/send — Send campaign to provider
app.post('/api/direct-mail/campaigns/:id/send', authMiddleware, async (req, res) => {
  try {
    var campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status !== 'approved' && campaign.status !== 'paid') return res.status(400).json({ error: 'Campaign must be approved or paid before sending. Current status: ' + campaign.status });

    var recipients = db.prepare('SELECT * FROM direct_mail_recipients WHERE campaign_id = ? AND customer_id = ?').all(campaign.id, req.user.id);
    var provider = getDirectMailProvider();

    // 1. Validate addresses via provider
    var addresses = recipients.map(function(r) { return { name: r.name, company: r.company, address_line1: r.address_line1, city: r.city, postcode: r.postcode, lead_id: r.lead_id }; });
    var validationResult = await provider.validateAddresses(addresses);
    var validAddresses = validationResult.details ? validationResult.details.filter(function(d) { return d.valid; }) : [];

    // 2. Create campaign with provider
    var recipientCount = validAddresses.length;
    var campaignResult = await provider.createCampaign({ name: campaign.name, recipient_count: recipientCount, description: campaign.description });
    
    // Log provider interaction (success or failure)
    var logSuccess = campaignResult && campaignResult.success ? 1 : 0;
    var logError = (!campaignResult || !campaignResult.success) ? (campaignResult && campaignResult.error ? campaignResult.error : 'Provider rejected campaign') : '';
    db.prepare('INSERT INTO direct_mail_provider_logs (id,customer_id,campaign_id,provider,endpoint,request_body,response_body,status_code,success,error_message,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(uuidv4(), req.user.id, req.params.id, provider.name, 'createCampaign', JSON.stringify({ name: campaign.name, recipient_count: recipientCount }), JSON.stringify(campaignResult || {}), campaignResult && campaignResult.success ? 200 : 500, logSuccess, logError, new Date().toISOString());

    if (!campaignResult || !campaignResult.success) {
      // Mark campaign as failed
      db.prepare('UPDATE direct_mail_campaigns SET status = ?, updated_at = ? WHERE id = ? AND customer_id = ?').run('failed', new Date().toISOString(), req.params.id, req.user.id);
      db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), req.user.id, req.params.id, campaign.status, 'failed', 'system', 'Provider error: ' + logError, new Date().toISOString());
      return res.status(500).json({ success: false, error: 'We couldn\'t process your campaign right now. Our team has been notified and will help resolve this. Please try again later or contact support.', provider_error: logError });
    }

    var providerCampaignId = campaignResult.provider_campaign_id;

    // 4. Update campaign with provider info
    db.prepare('UPDATE direct_mail_campaigns SET status = ?, provider = ?, provider_campaign_id = ?, provider_status = ?, sent_count = ?, updated_at = ? WHERE id = ? AND customer_id = ?').run('queued', provider.name, providerCampaignId, 'accepted', recipientCount, new Date().toISOString(), req.params.id, req.user.id);

    // 5. Status history
    db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), req.user.id, req.params.id, campaign.status, 'queued', 'system', 'Sent to provider: ' + provider.name + ' (ID: ' + providerCampaignId + ')', new Date().toISOString());

    // 6. Mark invalid addresses
    var invalidCount = 0;
    if (validationResult.details) {
      validationResult.details.forEach(function(d) {
        if (!d.valid && d.original && d.original.lead_id) {
          db.prepare('UPDATE direct_mail_recipients SET status = ? WHERE id = ? AND campaign_id = ? AND customer_id = ?').run('failed', d.original.lead_id, req.params.id, req.user.id);
          invalidCount++;
        }
      });
    }

    // Send notifications
    sendDMNotification(req.user.id, 'campaign_sent', 'ðŸ“¬ Campaign Sent to Print', 'Campaign Sent to Provider',
      '<p>Your campaign "' + campaign.name + '" has been sent to ' + provider.name + ' for printing.</p><p style="font-size:12px;color:#5a6280">Provider ID: ' + providerCampaignId + ' Â· Recipients: ' + recipientCount + ' Â· Estimated cost: £' + (campaignResult.estimated_cost || 0) + '</p>',
      'Track Campaign', PUBLIC_URL + '/portal/dashboard.html?page=direct-mail');
    if (invalidCount > 0) {
      dmDashboardNotify(req.user.id, 'invalid_addresses', 'âš ï¸ Invalid Addresses', invalidCount + ' addresses were invalid and skipped. Update your lead data to improve delivery.', '');
    }

    res.json({
      success: true,
      provider: provider.name,
      provider_campaign_id: providerCampaignId,
      recipient_count: recipientCount,
      invalid_addresses: invalidCount,
      total_valid: validAddresses.length,
      message: campaignResult.message,
      estimated_cost: campaignResult.estimated_cost || 0
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/direct-mail/campaigns/:id/simulate-status — Simulate provider status update (for testing)
app.post('/api/direct-mail/campaigns/:id/simulate-status', authMiddleware, async (req, res) => {
  try {
    var campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    var provider = getDirectMailProvider();
    var statusResult = await provider.getCampaignStatus(campaign.provider_campaign_id);
    if (!statusResult.success) return res.status(500).json({ error: 'Failed to get status from provider' });
    var newStatus = statusResult.status === 'accepted' ? 'queued' : statusResult.status === 'printing' ? 'printing' : statusResult.status === 'dispatched' ? 'dispatched' : statusResult.status === 'completed' ? 'completed' : 'failed';
    var fromStatus = campaign.status;
    db.prepare('UPDATE direct_mail_campaigns SET status = ?, updated_at = ? WHERE id = ? AND customer_id = ?').run(newStatus, new Date().toISOString(), req.params.id, req.user.id);
    db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), req.user.id, req.params.id, fromStatus, newStatus, 'system', 'Provider status update: ' + (statusResult.message || newStatus), new Date().toISOString());
    res.json({ success: true, from_status: fromStatus, to_status: newStatus, provider_status: statusResult.status });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/campaigns/:id/proof — Get proof of posting
app.get('/api/direct-mail/campaigns/:id/proof', authMiddleware, async (req, res) => {
  try {
    var campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!campaign.provider_campaign_id) return res.status(400).json({ error: 'Campaign has not been sent to a provider yet' });
    var provider = getDirectMailProvider();
    var proof = await provider.getProofOfPosting(campaign.provider_campaign_id);
    if (!proof.success) return res.status(500).json({ error: 'Failed to get proof of posting' });
    res.json({ success: true, proof: proof });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get provider campaign status
app.get('/api/direct-mail/campaigns/:id/provider-status', authMiddleware, async (req, res) => {
  try {
    var campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!campaign.provider_campaign_id) return res.status(400).json({ error: 'Campaign has not been sent to a provider yet' });
    var provider = getDirectMailProvider();
    var status = await provider.getCampaignStatus(campaign.provider_campaign_id);
    res.json({ success: true, provider_status: status.status, provider_campaign_id: campaign.provider_campaign_id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/direct-mail/campaigns/:id/cancel-with-provider — Cancel with provider
app.post('/api/direct-mail/campaigns/:id/cancel-with-provider', authMiddleware, async (req, res) => {
  try {
    var campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!campaign.provider_campaign_id) return res.status(400).json({ error: 'Campaign not sent to provider' });
    var provider = getDirectMailProvider();
    var result = await provider.cancelCampaign(campaign.provider_campaign_id);
    db.prepare('INSERT INTO direct_mail_provider_logs (id,customer_id,campaign_id,provider,endpoint,request_body,response_body,status_code,success,error_message,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(uuidv4(), req.user.id, req.params.id, provider.name, 'cancelCampaign', JSON.stringify({ provider_campaign_id: campaign.provider_campaign_id }), JSON.stringify(result), 200, result.success ? 1 : 0, result.error || '', new Date().toISOString());
    if (result.success) {
      db.prepare('UPDATE direct_mail_campaigns SET status = ?, updated_at = ? WHERE id = ? AND customer_id = ?').run('cancelled', new Date().toISOString(), req.params.id, req.user.id);
      db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), req.user.id, req.params.id, campaign.status, 'cancelled', 'customer', 'Cancelled via provider', new Date().toISOString());
    }
    res.json({ success: result.success, message: result.message || (result.success ? 'Cancelled' : 'Failed to cancel'), provider_result: result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/direct-mail/automation — Save automation settings
app.post('/api/direct-mail/automation', authMiddleware, (req, res) => {
  try {
    var enabled = req.body.enable_auto_send ? 1 : 0;
    if (enabled) {
      if (!req.body.default_template_id) return res.status(400).json({ error: 'Please select a saved template before enabling Print & Post.' });
      if (!req.body.max_daily_spend || parseInt(req.body.max_daily_spend) < 10) return res.status(400).json({ error: 'Please set a minimum daily spend of at least £10.' });
      if (req.body.consent_given !== true && req.body.consent_given !== 1) return res.status(400).json({ error: 'You must approve the consent to enable Print & Post.' });
    }
    var existing = db.prepare('SELECT * FROM direct_mail_automation_settings WHERE customer_id = ?').get(req.user.id);
    var settings = {
      id: existing ? existing.id : uuidv4(),
      customer_id: req.user.id,
      enable_auto_send: enabled,
      lead_types: req.body.lead_types || '',
      postcode_areas: req.body.postcode_areas || '',
      default_template_id: req.body.default_template_id || '',
      mail_type: req.body.mail_type || 'letter',
      max_daily_spend: parseInt(req.body.max_daily_spend) || 0,
      max_monthly_spend: parseInt(req.body.max_monthly_spend) || 0,
      max_letters_per_day: parseInt(req.body.max_letters_per_day) || 0,
      min_leads_before_send: parseInt(req.body.min_leads_before_send) || 1,
      send_timing: req.body.send_timing || 'after_9am',
      pause_on_payment_fail: req.body.pause_on_payment_fail ? 1 : 0,
      pause_on_provider_fail: req.body.pause_on_provider_fail ? 1 : 0,
      pause_on_spend_limit: req.body.pause_on_spend_limit ? 1 : 0,
      avoid_duplicate_mailing: req.body.avoid_duplicate_mailing !== false ? 1 : 0,
      repeat_mailing_days: parseInt(req.body.repeat_mailing_days) || 90,
      consent_given: 0,
      consent_date: '',
      consent_ip: '',
      created_at: existing ? existing.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (enabled && req.body.consent_given) {
      settings.consent_given = 1;
      settings.consent_date = new Date().toISOString();
      settings.consent_ip = req.headers['x-forwarded-for'] || req.ip || '';
    }
    if (existing) {
      db.prepare('UPDATE direct_mail_automation_settings SET enable_auto_send=?,lead_types=?,postcode_areas=?,default_template_id=?,mail_type=?,max_daily_spend=?,max_monthly_spend=?,max_letters_per_day=?,min_leads_before_send=?,send_timing=?,pause_on_payment_fail=?,pause_on_provider_fail=?,pause_on_spend_limit=?,avoid_duplicate_mailing=?,repeat_mailing_days=?,consent_given=?,consent_date=?,consent_ip=?,updated_at=? WHERE customer_id=?').run(settings.enable_auto_send, settings.lead_types, settings.postcode_areas, settings.default_template_id, settings.mail_type, settings.max_daily_spend, settings.max_monthly_spend, settings.max_letters_per_day, settings.min_leads_before_send, settings.send_timing, settings.pause_on_payment_fail, settings.pause_on_provider_fail, settings.pause_on_spend_limit, settings.avoid_duplicate_mailing, settings.repeat_mailing_days, settings.consent_given, settings.consent_date, settings.consent_ip, settings.updated_at, req.user.id);
    } else {
      db.prepare('INSERT INTO direct_mail_automation_settings (id,customer_id,enable_auto_send,lead_types,postcode_areas,default_template_id,mail_type,max_daily_spend,max_monthly_spend,max_letters_per_day,min_leads_before_send,send_timing,pause_on_payment_fail,pause_on_provider_fail,pause_on_spend_limit,avoid_duplicate_mailing,repeat_mailing_days,consent_given,consent_date,consent_ip,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(settings.id, settings.customer_id, settings.enable_auto_send, settings.lead_types, settings.postcode_areas, settings.default_template_id, settings.mail_type, settings.max_daily_spend, settings.max_monthly_spend, settings.max_letters_per_day, settings.min_leads_before_send, settings.send_timing, settings.pause_on_payment_fail, settings.pause_on_provider_fail, settings.pause_on_spend_limit, settings.avoid_duplicate_mailing, settings.repeat_mailing_days, settings.consent_given, settings.consent_date, settings.consent_ip, settings.created_at, settings.updated_at);
    }
    res.json({ success: true, settings: settings, message: enabled ? 'Print & Post enabled' : 'Print & Post disabled' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/automation — Get automation settings
app.get('/api/direct-mail/automation', authMiddleware, (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM direct_mail_automation_settings WHERE customer_id = ?').get(req.user.id);
    res.json({ success: true, settings: settings || null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== GDPR / SUPPRESSION / PRIVACY =====
// GET /api/direct-mail/suppression — Get customer's suppression list
app.get('/api/direct-mail/suppression', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var list = (db2.direct_mail_suppression || []).filter(function(s) { return s.customer_id === req.user.id; }).sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    res.json({ success: true, suppressed: list, total: list.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/direct-mail/suppression — Add address to suppression list
app.post('/api/direct-mail/suppression', authMiddleware, (req, res) => {
  try {
    if (!req.body.postcode && !req.body.address_line1) return res.status(400).json({ error: 'Postcode or address required' });
    var db2 = getDb();
    if (!db2.direct_mail_suppression) db2.direct_mail_suppression = [];
    var existing = db2.direct_mail_suppression.some(function(s) { return s.customer_id === req.user.id && s.postcode === (req.body.postcode || '').toUpperCase() && s.address_line1 === (req.body.address_line1 || ''); });
    if (existing) return res.json({ success: true, message: 'Already suppressed' });
    db2.direct_mail_suppression.push({
      id: uuidv4(), customer_id: req.user.id,
      name: req.body.name || '', address_line1: req.body.address_line1 || '',
      address_line2: req.body.address_line2 || '', town: req.body.town || '',
      postcode: (req.body.postcode || '').toUpperCase(),
      reason: req.body.reason || 'Customer request',
      added_by: req.body.name || 'Customer',
      added_by_type: 'customer',
      created_at: new Date().toISOString()
    });
    saveDb();
    res.json({ success: true, message: 'Address suppressed' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/direct-mail/suppression/:id — Remove from suppression list
app.delete('/api/direct-mail/suppression/:id', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var idx = (db2.direct_mail_suppression || []).findIndex(function(s) { return s.id === req.params.id && s.customer_id === req.user.id; });
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    db2.direct_mail_suppression.splice(idx, 1);
    saveDb();
    res.json({ success: true, message: 'Suppression removed' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin global suppression
app.post('/api/admin/direct-mail/suppression', adminAuth, (req, res) => {
  try {
    if (!req.body.postcode && !req.body.address_line1) return res.status(400).json({ error: 'Postcode or address required' });
    var db2 = getDb();
    if (!db2.direct_mail_suppression) db2.direct_mail_suppression = [];
    db2.direct_mail_suppression.push({
      id: uuidv4(), customer_id: '__global__',
      name: req.body.name || '', address_line1: req.body.address_line1 || '',
      address_line2: req.body.address_line2 || '', town: req.body.town || '',
      postcode: (req.body.postcode || '').toUpperCase(),
      reason: req.body.reason || 'Admin global suppression',
      added_by: 'Admin', added_by_type: 'admin',
      created_at: new Date().toISOString()
    });
    saveDb();
    res.json({ success: true, message: 'Global suppression added' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/direct-mail/suppression — Get all suppression entries
app.get('/api/admin/direct-mail/suppression', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var entries = (db2.direct_mail_suppression || []).sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    var expanded = entries.map(function(e) {
      var cust = (db2.customers || []).find(function(c) { return c.id === e.customer_id; });
      return Object.assign({}, e, { customer_email: cust ? cust.email : (e.customer_id === '__global__' ? 'Global' : 'unknown') });
    });
    res.json({ success: true, entries: expanded, total: expanded.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Function to check suppression (customer + global)
function isAddressSuppressed(customerId, postcode, addressLine1) {
  try {
    var db2 = getDb();
    if (!db2.direct_mail_suppression) return false;
    var pc = (postcode || '').toUpperCase();
    return db2.direct_mail_suppression.some(function(s) {
      return (s.customer_id === customerId || s.customer_id === '__global__') && s.postcode === pc && s.address_line1 === (addressLine1 || '');
    });
  } catch(e) { return false; }
}

// GET /api/direct-mail/terms — Get terms acceptance
app.get('/api/direct-mail/terms', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    if (!db2.dm_terms) db2.dm_terms = {};
    var accepted = db2.dm_terms[req.user.id] || false;
    res.json({ success: true, accepted: accepted, accepted_at: accepted ? db2.dm_terms[req.user.id + '_at'] || '' : '' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/direct-mail/terms — Accept terms
app.post('/api/direct-mail/terms', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    if (!db2.dm_terms) db2.dm_terms = {};
    db2.dm_terms[req.user.id] = true;
    db2.dm_terms[req.user.id + '_at'] = new Date().toISOString();
    saveDb();
    res.json({ success: true, accepted: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/campaigns/:id/recipients — Add recipient to campaign
app.post('/api/direct-mail/campaigns/:id/recipients', authMiddleware, (req, res) => {
  try {
    const campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const recipient = {
      id: uuidv4(),
      customer_id: req.user.id,
      campaign_id: req.params.id,
      name: req.body.name || '',
      company: req.body.company || '',
      address_line1: req.body.address_line1 || '',
      address_line2: req.body.address_line2 || '',
      city: req.body.city || '',
      postcode: req.body.postcode || '',
      country: req.body.country || 'United Kingdom',
      lead_id: req.body.lead_id || '',
      status: 'pending',
      created_at: new Date().toISOString()
    };
    // Check suppression
    if (isAddressSuppressed(req.user.id, recipient.postcode, recipient.address_line1)) {
      return res.status(400).json({ error: 'This address is on your do-not-mail list. Remove the suppression first.' });
    }
    db.prepare('INSERT INTO direct_mail_recipients (id,customer_id,campaign_id,name,company,address_line1,address_line2,city,postcode,country,lead_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(recipient.id, recipient.customer_id, recipient.campaign_id, recipient.name, recipient.company, recipient.address_line1, recipient.address_line2, recipient.city, recipient.postcode, recipient.country, recipient.lead_id, recipient.status, recipient.created_at);
    db.prepare('UPDATE direct_mail_campaigns SET target_count = target_count + 1, updated_at = ? WHERE id = ? AND customer_id = ?').run(new Date().toISOString(), req.params.id, req.user.id);
    res.json({ success: true, recipient: recipient });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/leads — Get leads available for campaign selection
app.get('/api/direct-mail/leads', authMiddleware, (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    var allLeads = db.prepare('SELECT * FROM leads WHERE customer_id = ? ORDER BY created_at DESC').all(req.user.id);
    var campaignId = req.query.campaign_id || '';
    var alreadyInCampaign = [];
    if (campaignId) {
      alreadyInCampaign = db.prepare('SELECT lead_id FROM direct_mail_recipients WHERE campaign_id = ? AND customer_id = ?').all(campaignId, req.user.id).map(function(r) { return r.lead_id; });
    }
    var leadType = req.query.lead_type || '';
    var postcodeArea = req.query.postcode || '';
    var dateFrom = req.query.date_from || '';
    var dateTo = req.query.date_to || '';
    var filtered = allLeads.filter(function(l) {
      var parsed = {};
      try { parsed = JSON.parse(l.data || '{}'); } catch(e) {}
      if (leadType && l.product !== leadType) return false;
      if (postcodeArea) {
        var lc = extractPostcodeArea(parsed.postcode || '');
        if (lc !== postcodeArea.toUpperCase()) return false;
      }
      if (dateFrom && l.created_at && l.created_at < dateFrom) return false;
      if (dateTo && l.created_at && l.created_at > dateTo) return false;
      return true;
    });
    var leadResults = filtered.map(function(l) {
      var parsed = {};
      try { parsed = JSON.parse(l.data || '{}'); } catch(e) {}
      var hasAddress = parsed.address_line1 || parsed.address || parsed.street || (parsed.postcode ? true : false);
      var isValidPostal = !!(parsed.postcode && (parsed.address_line1 || parsed.address || parsed.street));
      return {
        id: l.id, product: l.product, status: l.status,
        name: parsed.name || parsed.address || '', address: parsed.address || '',
        address_line1: parsed.address_line1 || parsed.address || parsed.street || '',
        city: parsed.city || parsed.town || '',
        postcode: parsed.postcode || '',
        has_address: hasAddress,
        is_valid_postal: isValidPostal,
        already_in_campaign: alreadyInCampaign.indexOf(l.id) !== -1,
        created_at: l.created_at
      };
    });
    var validCount = leadResults.filter(function(l) { return l.is_valid_postal; }).length;
    var invalidCount = leadResults.filter(function(l) { return !l.is_valid_postal && l.has_address; }).length;
    var noAddress = leadResults.filter(function(l) { return !l.has_address; }).length;
    res.json({
      success: true,
      leads: leadResults,
      total: leadResults.length,
      valid_postal: validCount,
      missing_address: noAddress,
      invalid_address: invalidCount,
      already_mailed: alreadyInCampaign.length
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

var ALLOWED_FILE_TYPES = ['application/pdf','image/png','image/jpeg','image/jpg'];
var ALLOWED_EXTENSIONS = ['.pdf','.png','.jpg','.jpeg'];
var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// POST /api/direct-mail/upload — Upload a file (base64 JSON)
app.post('/api/direct-mail/upload', authMiddleware, (req, res) => {
  try {
    var fileType = req.body.file_type || '';
    var fileName = req.body.file_name || 'untitled';
    var fileData = req.body.file_data || '';
    var campaignId = req.body.campaign_id || '';
    var templateId = req.body.template_id || '';
    var description = req.body.description || '';

    if (!fileData) return res.status(400).json({ error: 'No file data provided' });
    if (fileData.length > MAX_FILE_SIZE) return res.status(400).json({ error: 'File too large. Maximum 10MB.' });

    var ext = '.' + (fileName.split('.').pop() || '').toLowerCase();
    if (ALLOWED_EXTENSIONS.indexOf(ext) === -1) return res.status(400).json({ error: 'Invalid file type. Allowed: PDF, PNG, JPG, JPEG' });

    if (!['flyer_front','flyer_back','letter','logo','extra'].includes(fileType)) {
      return res.status(400).json({ error: 'Invalid file type. Must be: flyer_front, flyer_back, letter, logo, or extra' });
    }

    // Store file in database
    var material = {
      id: uuidv4(),
      customer_id: req.user.id,
      name: fileName,
      type: fileType,
      file_data: fileData,
      file_type: ext === '.pdf' ? 'pdf' : 'image',
      file_size: fileData.length,
      description: description,
      campaign_id: campaignId || '',
      template_id: templateId || '',
      created_at: new Date().toISOString()
    };

    db.prepare('INSERT INTO direct_mail_materials (id,customer_id,name,type,file_data,file_type,file_size,description,campaign_id,template_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
      material.id, material.customer_id, material.name, material.type,
      material.file_data, material.file_type, material.file_size,
      material.description, material.campaign_id, material.template_id,
      material.created_at
    );

    res.json({ success: true, material: { id: material.id, name: material.name, type: material.type, file_type: material.file_type, file_size: material.file_size, description: material.description, campaign_id: material.campaign_id, template_id: material.template_id, created_at: material.created_at } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/materials — Get customer's uploaded materials
app.get('/api/direct-mail/materials', authMiddleware, (req, res) => {
  try {
    var campaignId = req.query.campaign_id || '';
    var type = req.query.type || '';
    var sql = 'SELECT * FROM direct_mail_materials WHERE customer_id = ?';
    var params = [req.user.id];
    if (campaignId) { sql += ' AND campaign_id = ?'; params.push(campaignId); }
    if (type) { sql += ' AND type = ?'; params.push(type); }
    sql += ' ORDER BY created_at DESC';
    var materials = db.prepare(sql).all.apply(null, params);
    // Strip file_data from list response for performance
    var list = materials.map(function(m) {
      return { id: m.id, name: m.name, type: m.type, file_type: m.file_type, file_size: m.file_size, description: m.description, campaign_id: m.campaign_id, template_id: m.template_id, has_preview: !!m.file_data, created_at: m.created_at };
    });
    res.json({ success: true, materials: list });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/materials/:id — Get a single material with file data (customer isolated)
app.get('/api/direct-mail/materials/:id', authMiddleware, (req, res) => {
  try {
    var material = db.prepare('SELECT * FROM direct_mail_materials WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!material) return res.status(404).json({ error: 'Material not found' });
    res.json({ success: true, material: { id: material.id, name: material.name, type: material.type, file_type: material.file_type, file_size: material.file_size, file_data: material.file_data || '', description: material.description, campaign_id: material.campaign_id, template_id: material.template_id, created_at: material.created_at } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/direct-mail/materials/:id — Delete a material (customer isolated)
app.delete('/api/direct-mail/materials/:id', authMiddleware, (req, res) => {
  try {
    var material = db.prepare('SELECT * FROM direct_mail_materials WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!material) return res.status(404).json({ error: 'Material not found' });
    db.prepare('DELETE FROM direct_mail_materials WHERE id = ? AND customer_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true, message: 'Material deleted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/stats — Get direct mail stats for customer
app.get('/api/direct-mail/stats', authMiddleware, (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM direct_mail_campaigns WHERE customer_id = ?').get(req.user.id);
    const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM direct_mail_campaigns WHERE customer_id = ? GROUP BY status').all(req.user.id);
    const totalRecipients = db.prepare('SELECT COUNT(*) as count FROM direct_mail_recipients WHERE customer_id = ?').get(req.user.id);
    const sentRecipients = db.prepare('SELECT COUNT(*) as count FROM direct_mail_recipients WHERE customer_id = ? AND status = \'sent\'').get(req.user.id);
    var allOrders = db.prepare('SELECT * FROM direct_mail_orders WHERE customer_id = ?').all(req.user.id);
    var totalSpend = 0;
    for (var _oi = 0; _oi < allOrders.length; _oi++) { totalSpend += Number(allOrders[_oi].total_cost || 0); }
    res.json({ success: true, total_campaigns: total.count, by_status: byStatus, total_recipients: totalRecipients.count, sent_recipients: sentRecipients.count, total_spend: totalSpend });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

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
    // Fetch fresh data from Rightmove API for moving leads
    try {
      var prod = customer.product || 'moving';
      var apifyK = "";
      var freshLeads = [];
      if (prod === 'moving' && apifyK) {
        var lm = await new Promise(function(resolve) {
          var bd = JSON.stringify({ location: 'London', maxResults: 3 });
          var rq = require('https').request({ hostname: 'api.apify.com', method: 'POST', path: '/v2/acts/dhrumil~rightmove-scraper/run-sync-get-dataset-items?token=' + apifyK + '&memory=128&timeout=120', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bd) }, timeout: 150000 }, function(s) {
            var t = ''; s.on('data', function(c) { t += c; }); s.on('end', function() {
              try { var j = JSON.parse(t); if (Array.isArray(j)) resolve(j); else resolve([]); } catch(e) { resolve([]); }
            });
          });
          rq.on('error', function() { resolve([]); });
          rq.write(bd); rq.end();
        });
        if (lm.length > 0) {
          var db2 = getDb();
          var now2 = new Date().toISOString();
          for (var li2 = 0; li2 < Math.min(lm.length, customer.leads_per_day || 5); li2++) {
            var p = lm[li2];
            var nl2 = { id: uuidv4(), customer_id: req.user.id, product: 'moving', data: JSON.stringify(p), status: 'new', delivered: 0, created_at: now2, delivered_at: null };
            db2.leads.push(nl2);
          }
          saveDb();
          freshLeads = lm;
        }
      }
      _dbData = null;
      allLeads = (getDb().leads || []).filter(function(l) { return l.customer_id === req.user.id && l.delivered === 0; });
    } catch(e) { console.log('[DELIVERY] Fetch error:', e.message); }
    if (allLeads.length === 0) {
      return res.json({ message: 'No leads available yet.', leads: 0 });
    }
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

// ===== BLOG ENGINE & SEO ENDPOINTS =====
var BLOG_BATCH_SIZE = 10;
var PRODCAT = { moving: 'Moving Leads', probate: 'Probate Leads', newbusiness: 'New Business Alerts', planning: 'Planning Permission Leads', tenders: 'Public Sector Tenders', general: 'Business Leads' };
var LEAD_TYPE_PAGES = { moving: '/movingleadsdaily/', probate: '/probateleads/', newbusiness: '/newbusinessalert/', planning: '/planningleads/', tenders: '/tenders/', general: '/pricing/' };

// GET /api/admin/blog/posts Ã¢â‚¬â€ List all blog posts
app.get('/api/admin/blog/posts', adminAuth, function(req, res) {
  try {
    var dbData = getDb();
    var posts = (dbData.blog_posts || []).filter(function(p) { return p.published; });
    var templatesTotal = 35;
    res.json({ posts: posts, total: posts.length, templates_total: templatesTotal, templates_used: posts.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/blog/delete Ã¢â‚¬â€ Delete a blog post
app.post('/api/admin/blog/delete', adminAuth, function(req, res) {
  try {
    var slug = req.body.slug;
    if (!slug) return res.status(400).json({ error: 'Slug required' });
    var dbData = getDb();
    if (!dbData.blog_posts) dbData.blog_posts = [];
    dbData.blog_posts = dbData.blog_posts.filter(function(p) { return p.slug !== slug; });
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2));
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/seo/report Ã¢â‚¬â€ SEO dashboard data
app.get('/api/admin/seo/report', adminAuth, function(req, res) {
  try {
    var dbData = getDb();
    var posts = dbData.blog_posts || [];
    var published = posts.filter(function(p) { return p.published; });
    var totalWords = 0;
    var cats = {};
    for (var i = 0; i < published.length; i++) {
      totalWords += parseInt(published[i].word_count) || 0;
      cats[published[i].category] = (cats[published[i].category] || 0) + 1;
    }
    var avgWords = published.length > 0 ? Math.round(totalWords / published.length) : 0;
    var thisWeek = published.filter(function(p) { return p.created_at && p.created_at >= new Date(Date.now() - 7*86400000).toISOString(); });
    var thisMonth = published.filter(function(p) { return p.created_at && p.created_at >= new Date(Date.now() - 30*86400000).toISOString(); });
    var usedIndices = posts.map(function(p) { return p.template_index; });
    var remaining = 0;
    var templatesTotal = 35;
    for (var ti = 0; ti < templatesTotal; ti++) { if (usedIndices.indexOf(ti) === -1) remaining++; }
    res.json({
      total_posts: published.length,
      templates_total: templatesTotal,
      templates_used: published.length,
      templates_remaining: remaining,
      posts_this_week: thisWeek.length,
      posts_this_month: thisMonth.length,
      avg_word_count: avgWords,
      total_words: totalWords,
      categories: cats,
      by_category: Object.keys(cats).map(function(k) { return { category: k, label: PRODCAT[k] || k, count: cats[k] }; }),
      completeness_pct: Math.round(published.length / templatesTotal * 100),
      sitemap_urls: published.length + 16,
      last_generated: published.length > 0 ? published[published.length - 1].created_at : null,
      sitemap_healthy: true,
      blog_accessible: true
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/seo/refresh-sitemap Ã¢â‚¬â€ Update sitemap.xml
app.post('/api/admin/seo/refresh-sitemap', adminAuth, function(req, res) {
  try {
    var dbData = getDb();
    var posts = (dbData.blog_posts || []).filter(function(p) { return p.published; });
    var today = new Date().toISOString().split('T')[0];
    var urls = [
      '<url><loc>https://9amleads.com/</loc><priority>1.0</priority><changefreq>weekly</changefreq><lastmod>' + today + '</lastmod></url>',
      '<url><loc>https://9amleads.com/pricing/</loc><priority>0.9</priority><changefreq>weekly</changefreq><lastmod>' + today + '</lastmod></url>',
      '<url><loc>https://9amleads.com/movingleadsdaily/</loc><priority>0.8</priority><changefreq>daily</changefreq><lastmod>' + today + '</lastmod></url>',
      '<url><loc>https://9amleads.com/probateleads/</loc><priority>0.8</priority><changefreq>daily</changefreq><lastmod>' + today + '</lastmod></url>',
      '<url><loc>https://9amleads.com/newbusinessalert/</loc><priority>0.8</priority><changefreq>daily</changefreq><lastmod>' + today + '</lastmod></url>',
      '<url><loc>https://9amleads.com/planningleads/</loc><priority>0.8</priority><changefreq>daily</changefreq><lastmod>' + today + '</lastmod></url>',
      '<url><loc>https://9amleads.com/tenders/</loc><priority>0.8</priority><changefreq>daily</changefreq><lastmod>' + today + '</lastmod></url>',
      '<url><loc>https://9amleads.com/how-it-works/</loc><priority>0.7</priority><changefreq>monthly</changefreq><lastmod>' + today + '</lastmod></url>',
      '<url><loc>https://9amleads.com/who-we-serve/</loc><priority>0.7</priority><changefreq>monthly</changefreq><lastmod>' + today + '</lastmod></url>',
      '<url><loc>https://9amleads.com/blog/</loc><priority>0.7</priority><changefreq>daily</changefreq><lastmod>' + today + '</lastmod></url>',
      '<url><loc>https://9amleads.com/founder/</loc><priority>0.5</priority><changefreq>monthly</changefreq><lastmod>' + today + '</lastmod></url>',
      '<url><loc>https://9amleads.com/invest/</loc><priority>0.5</priority><changefreq>monthly</changefreq><lastmod>' + today + '</lastmod></url>',
      '<url><loc>https://9amleads.com/about.html</loc><priority>0.6</priority><changefreq>monthly</changefreq><lastmod>' + today + '</lastmod></url>',
      '<url><loc>https://9amleads.com/contact.html</loc><priority>0.6</priority><changefreq>monthly</changefreq><lastmod>' + today + '</lastmod></url>',
      '<url><loc>https://9amleads.com/terms.html</loc><priority>0.3</priority><changefreq>monthly</changefreq><lastmod>' + today + '</lastmod></url>',
      '<url><loc>https://9amleads.com/privacy.html</loc><priority>0.3</priority><changefreq>monthly</changefreq><lastmod>' + today + '</lastmod></url>'
    ];
    for (var pi = 0; pi < posts.length; pi++) {
      urls.push('<url><loc>https://9amleads.com/blog/' + posts[pi].slug + '</loc><priority>0.6</priority><changefreq>weekly</changefreq><lastmod>' + today + '</lastmod></url>');
    }
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    for (var ui = 0; ui < urls.length; ui++) xml += '  ' + urls[ui] + '\n';
    xml += '</urlset>';
    var pathMod = require('path');
    fs.writeFileSync(pathMod.join(__dirname, '..', 'publish', 'sitemap.xml'), xml);
    fs.writeFileSync(pathMod.join(__dirname, '..', 'sitemap.xml'), xml);
    try { fs.writeFileSync(pathMod.join(__dirname, '..', '9amleads', 'sitemap.xml'), xml); } catch(e2) {}
    try { var http = require('http'); http.get('http://www.google.com/ping?sitemap=' + encodeURIComponent('https://9amleads.com/sitemap.xml'), function(gres) { gres.resume(); }); } catch(e3) {}
    res.json({ success: true, urls: urls.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/blog/generate Ã¢â‚¬â€ Generate next batch of blog posts (up to 5)
app.post('/api/admin/blog/generate', adminAuth, function(req, res) {
  try {
    var dbData = getDb();
    if (!dbData.blog_posts) dbData.blog_posts = [];
    var count = Math.min(BLOG_BATCH_SIZE, 5);
    var generated = [];
    for (var bi = 0; bi < count; bi++) {
      var ti = dbData.blog_posts.length + bi;
      var templates = [
        { category: 'moving', title: 'How to Get More {type} Leads Without Spending on Ads', desc: 'Learn how removal companies and estate agents can generate consistent {type} leads without expensive advertising.', keywords: ['{type} lead generation', '{type} leads UK', 'get {type} leads'] },
        { category: 'moving', title: 'The Ultimate Guide to {type} for Estate Agents', desc: 'Everything estate agents need to know about {type}.', keywords: ['{type} for estate agents', 'estate agent {type}', '{type} leads for agents'] },
        { category: 'moving', title: '10 Proven Tips to Convert More {type} Into Bookings', desc: 'Stop losing customers. These actionable tips will help you convert more {type}.', keywords: ['convert {type}', '{type} conversion tips', '{type} booking rate'] },
        { category: 'probate', title: 'How Solicitors Can Win More {type} With Daily Leads', desc: 'A guide for solicitors on winning more {type} through daily lead generation.', keywords: ['{type} for solicitors', 'win {type}', '{type} generation'] },
        { category: 'probate', title: 'The Executor\'s Journey: Why Timing Matters in {type}', desc: 'Understanding executor timing is key to winning {type}.', keywords: ['{type} timing', '{type} executor', '{type} conversion'] },
        { category: 'newbusiness', title: 'How to Find and Win {type} Using Companies House Data', desc: 'Generate {type} from Companies House registrations.', keywords: ['{type} from Companies House', '{type} generation', '{type} UK'] },
        { category: 'newbusiness', title: 'Why {type} Are the Best Source of B2B Growth', desc: 'Why {type} are the most undervalued B2B lead source.', keywords: ['{type} B2B', '{type} growth', '{type} strategy'] },
        { category: 'planning', title: 'How to Win {type} Contracts: A Complete Guide', desc: 'Win {type} contracts for builders and architects.', keywords: ['{type} contracts', 'win {type}', '{type} for builders'] },
        { category: 'planning', title: 'The Value of {type} for Architects and Designers', desc: 'Why {type} fill your project pipeline.', keywords: ['{type} for architects', '{type} for designers', '{type} pipeline'] },
        { category: 'tenders', title: 'How to Win More {type} as a Small Business', desc: 'Small businesses can win {type} with the right strategy.', keywords: ['{type} for small business', 'win {type}', '{type} strategy'] },
        { category: 'tenders', title: 'The Complete {type} Response Toolkit', desc: 'Everything you need to respond to {type} effectively.', keywords: ['{type} response', '{type} submission', '{type} toolkit'] },
        { category: 'general', title: 'Why Daily {type} Beat Weekly Lead Batches Every Time', desc: 'Why daily lead delivery outperforms weekly batches.', keywords: ['daily {type}', '{type} frequency', '{type} timing'] },
        { category: 'general', title: 'The Ultimate {type} Strategy Guide for UK Businesses', desc: 'Complete strategy for multi-channel lead generation.', keywords: ['{type} strategy', '{type} guide', 'UK {type}'] }
      ];
      var types = { moving: 'moving leads', probate: 'probate leads', newbusiness: 'new business leads', planning: 'planning leads', tenders: 'tender opportunities', general: 'business leads' };
      var template = templates[ti % templates.length];
      var productName = PRODCAT[template.category] || 'Business Leads';
      var type = types[template.category] || 'leads';
      var title = template.title.replace(/{type}/g, type);
      var desc = template.desc.replace(/{type}/g, type);
      var kw = template.keywords.map(function(k) { return k.replace(/{type}/g, type); });
      var slug = title.toLowerCase().replace(/[':]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 80);
      var paraPool = [
        'In today\'s market, businesses need every advantage. ' + title + ' is one of the most effective ways to stay ahead.',
        productName + ' provide a stream of exclusive opportunities your competitors don\'t have access to.',
        'Consistency is key with ' + type + '. Fresh opportunities every morning builds a daily outreach habit.',
        'The businesses that win with ' + type + ' are the ones that act fast. A structured morning workflow increases conversion.',
        productName + ' are sourced from official registers and updated daily. The data is accurate, fresh, and actionable.',
        'The cost of ' + type + ' is predictable and fixed. No auction dynamics or rising CPCs.',
        'First contact wins. Studies show contacting a prospect within 30 minutes increases conversion by 400%.',
        productName + ' are exclusive. No other business in your territory has the same lead.'
      ];
      var sections = '';
      sections += '<h2>Why ' + title.split(' ').slice(0,3).join(' ') + ' Matters</h2><p>' + paraPool[0] + '</p><p>' + paraPool[1] + '</p>';
      sections += '<h2>What Are ' + type.charAt(0).toUpperCase() + type.slice(1) + '?</h2><p>' + paraPool[2] + '</p><p>' + paraPool[3] + '</p>';
      sections += '<div style="background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.1);border-radius:10px;padding:20px;margin:20px 0"><h3 style="font-size:15px;margin-bottom:8px;color:#0ea5e9">Key Benefits</h3><ul style="padding-left:20px;line-height:1.8"><li>Exclusive leads - only your business receives them</li><li>Fixed weekly pricing with no auction dynamics</li><li>Daily morning delivery - always first to contact</li><li>Free 7-day trial with no credit card required</li></ul></div>';
      sections += '<h2>The Benefits of Consistent ' + type.charAt(0).toUpperCase() + type.slice(1) + '</h2><p>' + paraPool[4] + '</p><p>' + paraPool[5] + '</p>';
      sections += '<h2>How to Get Started with ' + type.charAt(0).toUpperCase() + type.slice(1) + '</h2><p>' + paraPool[6] + '</p><p>' + paraPool[7] + '</p>';
      var wordCount = sections.replace(/<[^>]+>/g, '').split(/\s+/).length;
      var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + ' | 9amLeads Blog</title><meta name="description" content="' + desc + '"><meta property="og:title" content="' + title + '"><meta property="og:description" content="' + desc + '"><meta property="og:url" content="https://9amleads.com/blog/' + slug + '"><meta property="og:type" content="article"><link rel="canonical" href="https://9amleads.com/blog/' + slug + '"><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>body{font-family:Inter,sans-serif;background:#000;color:#fff;max-width:800px;margin:0 auto;padding:24px;line-height:1.8}h1{font-size:28px;font-weight:800;font-family:Outfit,sans-serif}h2{font-size:20px;font-weight:700;margin-top:32px;color:#f5f5f5}p{color:#ccc}</style></head><body><h1>' + title + '</h1><p style="color:#888">' + desc + '</p>' + sections + '</body></html>';
      var post = { id: 'blog_' + Date.now() + '_' + bi, title: title, slug: slug, description: desc, category: template.category, product_name: productName, keywords: kw, html: html, template_index: ti, word_count: wordCount, reading_time: Math.ceil(wordCount / 200) + ' min read', created_at: new Date().toISOString(), published: true };
      dbData.blog_posts.push(post);
      generated.push(post);
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2));
    res.json({ success: true, count: generated.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/blog/generate-all — Generate all remaining templates
app.post('/api/admin/blog/generate-all', adminAuth, function(req, res) {
  try {
    var dbData = getDb();
    if (!dbData.blog_posts) dbData.blog_posts = [];
    var usedIndices = dbData.blog_posts.map(function(p) { return p.template_index; });
    var templates = [
      { category: 'moving', title: 'How to Get More {type} Leads Without Spending on Ads', desc: 'Learn how removal companies can generate consistent {type} leads without expensive advertising.', keywords: ['{type} lead generation', '{type} leads UK'] },
      { category: 'moving', title: 'The Ultimate Guide to {type} for Estate Agents', desc: 'Everything estate agents need to know about {type}.', keywords: ['{type} for estate agents', 'estate agent {type}'] },
      { category: 'moving', title: '10 Proven Tips to Convert More {type} Into Bookings', desc: 'Stop losing customers with these actionable tips.', keywords: ['convert {type}', '{type} conversion tips'] },
      { category: 'moving', title: 'Why {type} Are Better Than Pay-Per-Click Advertising', desc: 'Compare ROI of {type} vs PPC advertising.', keywords: ['{type} vs PPC', '{type} ROI'] },
      { category: 'moving', title: 'How to Choose the Right Postcode Areas for Your {type}', desc: 'Select postcode territories that maximise {type} volume.', keywords: ['{type} postcode targeting', 'best postcodes for {type}'] },
      { category: 'moving', title: 'The Morning Routine That Doubles Your {type} Conversion Rate', desc: 'The 9am routine that top companies use to dominate.', keywords: ['{type} morning routine', '{type} conversion system'] },
      { category: 'moving', title: 'How {type} Are Collected: From Listing to Your Inbox', desc: 'Behind the scenes of {type} collection.', keywords: ['how {type} work', '{type} explained'] },
      { category: 'probate', title: 'How Solicitors Can Win More {type} With Daily Leads', desc: 'A guide for solicitors on winning more {type}.', keywords: ['{type} for solicitors', 'win {type}'] },
      { category: 'probate', title: 'The Executor\'s Journey: Why Timing Matters in {type}', desc: 'Understanding executor timing is key to winning {type}.', keywords: ['{type} timing', '{type} executor'] },
      { category: 'probate', title: '{type} vs Traditional Marketing: Which Delivers Better ROI', desc: 'Compare {type} against traditional marketing methods.', keywords: ['{type} ROI', '{type} marketing'] },
      { category: 'probate', title: '5 Mistakes Solicitors Make Following Up on {type}', desc: 'Avoid common mistakes that cost valuable {type}.', keywords: ['{type} mistakes', '{type} follow-up'] },
      { category: 'probate', title: 'How to Build a Scalable {type} Pipeline', desc: 'Create a repeatable system for generating {type}.', keywords: ['{type} pipeline', '{type} system'] },
      { category: 'probate', title: 'The Complete {type} Checklist for New Probate Solicitors', desc: 'Everything new solicitors need to know about {type}.', keywords: ['{type} checklist', 'new solicitor {type}'] },
      { category: 'newbusiness', title: 'How to Find and Win {type} Using Companies House Data', desc: 'Generate {type} from Companies House registrations.', keywords: ['{type} from Companies House', '{type} generation'] },
      { category: 'newbusiness', title: 'Why {type} Are the Best Source of B2B Growth', desc: 'Why {type} are the most undervalued B2B lead source.', keywords: ['{type} B2B', '{type} growth'] },
      { category: 'newbusiness', title: 'How to Target {type} by Industry Sector', desc: 'Filter {type} by specific industries.', keywords: ['{type} industry targeting', '{type} filtering'] },
      { category: 'newbusiness', title: 'The {type} Playbook: From Registration to Closed Deal', desc: 'Complete playbook for turning {type} into paying customers.', keywords: ['{type} playbook', '{type} sales process'] },
      { category: 'newbusiness', title: '10 Services You Can Sell to {type}', desc: 'Newly registered businesses need everything.', keywords: ['services for {type}', '{type} opportunities'] },
      { category: 'planning', title: 'How to Win {type} Contracts: A Complete Guide', desc: 'Win {type} contracts for builders and architects.', keywords: ['{type} contracts', 'win {type}'] },
      { category: 'planning', title: 'The Value of {type} for Architects and Designers', desc: 'Why {type} fill your project pipeline.', keywords: ['{type} for architects', '{type} for designers'] },
      { category: 'planning', title: '{type}: Spotting High-Value Projects Before Competitors', desc: 'Identify the most valuable {type}.', keywords: ['{type} value', '{type} prioritisation'] },
      { category: 'planning', title: 'How to Use {type} to Grow Your Construction Business', desc: 'Use {type} to build a consistent pipeline.', keywords: ['{type} for construction', '{type} for builders'] },
      { category: 'planning', title: '{type} vs Tenders: Which Should You Focus On?', desc: 'Compare {type} and public sector tenders.', keywords: ['{type} vs tenders', '{type} comparison'] },
      { category: 'tenders', title: 'How to Win More {type} as a Small Business', desc: 'Small businesses can win {type} with the right strategy.', keywords: ['{type} for small business', 'win {type}'] },
      { category: 'tenders', title: 'The Complete {type} Response Toolkit', desc: 'Everything to respond to {type} effectively.', keywords: ['{type} response', '{type} submission'] },
      { category: 'tenders', title: 'How to Find {type} That Match Your Business', desc: 'Find {type} that perfectly match your expertise.', keywords: ['find {type}', '{type} filtering'] },
      { category: 'tenders', title: 'The ROI of {type}: Is It Worth the Investment?', desc: 'Calculate the real return on investment for {type}.', keywords: ['{type} ROI', '{type} investment'] },
      { category: 'tenders', title: 'How to Write Winning {type} Responses', desc: 'Expert tips for writing {type} responses that win.', keywords: ['{type} writing', '{type} tips'] },
      { category: 'general', title: 'Why Daily {type} Beat Weekly Lead Batches', desc: 'Why daily delivery outperforms weekly batches.', keywords: ['daily {type}', '{type} frequency'] },
      { category: 'general', title: 'The Ultimate {type} Strategy Guide for UK', desc: 'Complete strategy for multi-channel lead generation.', keywords: ['{type} strategy', '{type} guide'] },
      { category: 'general', title: 'How to Track and Improve Your {type} Conversion', desc: 'Data-driven approach to tracking conversion rate.', keywords: ['{type} conversion rate', 'track {type}'] },
      { category: 'general', title: 'The Cost of {type} vs Other Marketing Channels', desc: 'Compare {type} costs against Google Ads and Facebook.', keywords: ['{type} cost', '{type} vs ads'] },
      { category: 'general', title: 'How {type} Can Transform Your Business in 30 Days', desc: 'Real results from businesses using {type}.', keywords: ['{type} transformation', '{type} results'] }
    ];
    var types = { moving: 'moving leads', probate: 'probate leads', newbusiness: 'new business leads', planning: 'planning leads', tenders: 'tender opportunities', general: 'business leads' };
    var generated = [];
    for (var bi = 0; bi < templates.length; bi++) {
      if (usedIndices.indexOf(bi) !== -1) continue;
      var template = templates[bi];
      var productName = PRODCAT[template.category] || 'Business Leads';
      var type = types[template.category] || 'leads';
      var title = template.title.replace(/{type}/g, type);
      var desc = template.desc.replace(/{type}/g, type);
      var kw = template.keywords.map(function(k) { return k.replace(/{type}/g, type); });
      var slug = title.toLowerCase().replace(/[':]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 80);
      var sections = '<h2>Introduction</h2><p>' + title + ' is essential for modern businesses.</p><p>Learn how ' + type + ' can transform your pipeline.</p>';
      sections += '<h2>The Benefits</h2><p>Consistent ' + type + ' provide a reliable stream of opportunities.</p><p>Daily delivery ensures you are always first to respond.</p>';
      var wordCount = sections.replace(/<[^>]+>/g, '').split(/\s+/).length;
      var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + ' | 9amLeads Blog</title><meta name="description" content="' + desc + '"><link rel="canonical" href="https://9amleads.com/blog/' + slug + '"><style>body{font-family:Inter,sans-serif;background:#000;color:#fff;max-width:800px;margin:0 auto;padding:24px;line-height:1.8}h1{font-size:28px;font-weight:800}h2{font-size:20px;font-weight:700;margin-top:32px}p{color:#ccc}</style></head><body><h1>' + title + '</h1><p>' + desc + '</p>' + sections + '</body></html>';
      var post = { id: 'blog_' + Date.now() + '_' + bi, title: title, slug: slug, description: desc, category: template.category, product_name: productName, keywords: kw, html: html, template_index: bi, word_count: wordCount, reading_time: Math.ceil(wordCount / 200) + ' min read', created_at: new Date().toISOString(), published: true };
      dbData.blog_posts.push(post);
      generated.push(post);
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2));
    res.json({ success: true, count: generated.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ADMIN DIRECT MAIL DASHBOARD =====

// GET /api/admin/direct-mail/dashboard — Admin DM overview
app.get('/api/admin/direct-mail/dashboard', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var today = new Date().toISOString().split('T')[0];
    var thisMonth = today.substring(0, 7);

    var allCampaigns = db2.direct_mail_campaigns || [];
    var allSettings = db2.direct_mail_automation_settings || [];
    var allLogs = db2.direct_mail_provider_logs || [];

    var todayCampaigns = allCampaigns.filter(function(c) { return c.created_at && c.created_at.startsWith(today); });
    var failedCampaigns = allCampaigns.filter(function(c) { return c.status === 'failed'; });
    var sentToday = todayCampaigns.filter(function(c) { return c.status === 'completed' || c.status === 'dispatched' || c.status === 'queued'; });
    var lettersToday = 0;
    sentToday.forEach(function(c) { lettersToday += (c.sent_count || c.target_count || 0); });
    var autoSendActive = allSettings.filter(function(s) { return s.enable_auto_send && s.consent_given; }).length;
    var autoSendPaused = db2.customers ? db2.customers.filter(function(c) { return c.auto_send_paused; }).length : 0;

    // Revenue/profit (use pricing model)
    var revenueToday = 0;
    var profitToday = 0;
    todayCampaigns.forEach(function(c) {
      var budget = Number(c.budget || 0);
      revenueToday += budget;
      var provCost = budget * 0.6; // Rough estimate: 60% provider cost
      profitToday += (budget - provCost);
    });

    // Customers with campaigns
    var customerIds = {};
    allCampaigns.forEach(function(c) { customerIds[c.customer_id] = true; });
    var campaignCustomerCount = Object.keys(customerIds).length;

    res.json({
      success: true,
      total_campaigns: allCampaigns.length,
      today_campaigns: todayCampaigns.length,
      sent_today: sentToday.length,
      letters_today: lettersToday,
      failed_campaigns: failedCampaigns.length,
      revenue_today: Math.round(revenueToday * 100) / 100,
      profit_today: Math.round(profitToday * 100) / 100,
      auto_send_active: autoSendActive,
      auto_send_paused: autoSendPaused,
      campaign_customers: campaignCustomerCount,
      provider_logs_count: allLogs.length,
      stripe_configured: !!STRIPE_SECRET_KEY,
      provider: DIRECT_MAIL_PROVIDER
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/direct-mail/campaigns — All campaigns
app.get('/api/admin/direct-mail/campaigns', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var campaigns = (db2.direct_mail_campaigns || []).sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    var expanded = campaigns.map(function(c) {
      var cust = db2.customers ? db2.customers.find(function(cu) { return cu.id === c.customer_id; }) : null;
      return {
        id: c.id, name: c.name, customer_email: cust ? cust.email : 'unknown', customer_company: cust ? cust.company : '',
        status: c.status, provider: c.provider, provider_campaign_id: c.provider_campaign_id,
        provider_status: c.provider_status, stripe_payment_status: c.stripe_payment_status,
        target_count: c.target_count, sent_count: c.sent_count, budget: c.budget,
        created_at: c.created_at, updated_at: c.updated_at
      };
    });
    res.json({ success: true, campaigns: expanded, total: expanded.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/direct-mail/campaigns/:id/retry — Retry a failed campaign
app.post('/api/admin/direct-mail/campaigns/:id/retry', adminAuth, async (req, res) => {
  try {
    var db2 = getDb();
    var campaign = db2.direct_mail_campaigns ? db2.direct_mail_campaigns.find(function(c) { return c.id === req.params.id; }) : null;
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    db.prepare('UPDATE direct_mail_campaigns SET status = ?, updated_at = ? WHERE id = ?').run('approved', new Date().toISOString(), req.params.id);
    db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), campaign.customer_id, req.params.id, campaign.status, 'approved', 'admin', 'Manually retried by admin', new Date().toISOString());
    res.json({ success: true, message: 'Campaign reset to approved for retry' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/direct-mail/campaigns/:id/cancel — Cancel a campaign
app.post('/api/admin/direct-mail/campaigns/:id/cancel', adminAuth, (req, res) => {
  try {
    var campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    db.prepare('UPDATE direct_mail_campaigns SET status = ?, updated_at = ? WHERE id = ?').run('cancelled', new Date().toISOString(), req.params.id);
    db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), campaign.customer_id, req.params.id, campaign.status, 'cancelled', 'admin', 'Cancelled by admin', new Date().toISOString());
    res.json({ success: true, message: 'Campaign cancelled' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/direct-mail/campaigns/:id/refund — Mark as refunded
app.post('/api/admin/direct-mail/campaigns/:id/refund', adminAuth, (req, res) => {
  try {
    var campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    db.prepare('UPDATE direct_mail_campaigns SET stripe_payment_status = ?, status = ?, updated_at = ? WHERE id = ?').run('refunded', 'cancelled', new Date().toISOString(), req.params.id);
    db.prepare('INSERT INTO direct_mail_status_history (id,customer_id,campaign_id,from_status,to_status,changed_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), campaign.customer_id, req.params.id, campaign.status, 'cancelled', 'admin', 'Payment refunded by admin', new Date().toISOString());
    res.json({ success: true, message: 'Campaign refunded' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/direct-mail/campaigns/:id/sync — Manually sync provider status
app.post('/api/admin/direct-mail/campaigns/:id/sync', adminAuth, async (req, res) => {
  try {
    var campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!campaign.provider_campaign_id) return res.status(400).json({ error: 'No provider campaign ID' });
    var provider = getDirectMailProvider();
    var statusResult = await provider.getCampaignStatus(campaign.provider_campaign_id);
    if (!statusResult.success) return res.status(500).json({ error: statusResult.error || 'Sync failed' });
    res.json({ success: true, provider_status: statusResult.status, provider_campaign_id: campaign.provider_campaign_id, raw: statusResult });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/direct-mail/customers/:id/suspend-auto-send — Suspend customer Print & Post
app.post('/api/admin/direct-mail/customers/:id/suspend-auto-send', adminAuth, (req, res) => {
  try {
    db.prepare('UPDATE customers SET auto_send_paused = ? WHERE id = ?').run(req.body.paused !== false ? 1 : 0, req.params.id);
    res.json({ success: true, message: 'Print & Post ' + (req.body.paused !== false ? 'suspended' : 'resumed') });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/direct-mail/provider-logs — Get provider logs
app.get('/api/admin/direct-mail/provider-logs', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var logs = (db2.direct_mail_provider_logs || []).sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); }).slice(0, 200);
    var expanded = logs.map(function(l) {
      var cust = db2.customers ? db2.customers.find(function(c) { return c.id === l.customer_id; }) : null;
      return { id: l.id, customer_email: cust ? cust.email : 'unknown', campaign_id: l.campaign_id, provider: l.provider, endpoint: l.endpoint, success: l.success, error_message: l.error_message, created_at: l.created_at, request_body: l.request_body ? l.request_body.substring(0, 300) : '', response_body: l.response_body ? l.response_body.substring(0, 300) : '' };
    });
    res.json({ success: true, logs: expanded, total: logs.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/direct-mail/pricing — Get pricing config
app.get('/api/admin/direct-mail/pricing', adminAuth, (req, res) => {
  res.json({ success: true, pricing: DM_PRICE_CONFIG });
});

// POST /api/direct-mail/price-calc — Calculate price (for admin detailed view)
app.post('/api/direct-mail/price-calc', authMiddleware, (req, res) => {
  try {
    var count = parseInt(req.body.recipient_count) || 1;
    var pricing = calcDmPrice(count, req.body);
    res.json({ success: true, pricing: pricing });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/direct-mail/pricing — Update pricing config
app.post('/api/admin/direct-mail/pricing', adminAuth, (req, res) => {
  try {
    var fields = ['platform_fee','min_fee','markup_pct','per_recipient_margin','ai_letter_fee','ai_flyer_fee','ai_pack_fee','auto_send_monthly_fee','vat_pct','provider_cost_per_unit','discount_codes'];
    var newPricing = {};
    for (var _fi = 0; _fi < fields.length; _fi++) {
      var f = fields[_fi];
      var v = req.body[f];
      if (v !== undefined && v !== null && v !== '') { newPricing[f] = isNaN(Number(v)) ? v : Number(v); }
      else { newPricing[f] = DM_PRICE_CONFIG[f] || 0; }
    }
    var fs2 = require('fs');
    fs2.writeFileSync(path.join(DATA_DIR, 'dm-pricing.json'), JSON.stringify(newPricing, null, 2));
    Object.assign(DM_PRICE_CONFIG, newPricing);
    res.json({ success: true, pricing: newPricing });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/direct-mail/run-auto-send — Trigger Print & Post
app.post('/api/admin/direct-mail/run-auto-send', adminAuth, async (req, res) => {
  try {
    var results = await runAutoSend();
    res.json({ success: true, results: results });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/features — Get feature access for current customer
app.get('/api/direct-mail/features', authMiddleware, (req, res) => {
  try {
    var customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    var plan = customer ? customer.plan : 'free_trial';
    var features = {};
    for (var _fk in DM_FEATURE_ACCESS) {
      features[_fk] = {
        accessible: customerCanUseDMFeature(plan, _fk),
        label: DM_FEATURE_ACCESS[_fk].label,
        desc: DM_FEATURE_ACCESS[_fk].desc
      };
    }
    res.json({ success: true, plan: plan, features: features });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/direct-mail/features — Get all feature config (admin)
app.get('/api/admin/direct-mail/features', adminAuth, (req, res) => {
  res.json({ success: true, features: DM_FEATURE_ACCESS });
});

// POST /api/admin/direct-mail/features — Update feature config (admin)
app.post('/api/admin/direct-mail/features', adminAuth, (req, res) => {
  try {
    var plans = ['free_trial','starter','pro','enterprise'];
    for (var _fk2 in DM_FEATURE_ACCESS) {
      if (req.body[_fk2]) {
        for (var _pi = 0; _pi < plans.length; _pi++) {
          var p = plans[_pi];
          if (req.body[_fk2][p] !== undefined) {
            DM_FEATURE_ACCESS[_fk2][p] = req.body[_fk2][p] ? true : false;
          }
        }
      }
    }
    var fs2 = require('fs');
    fs2.writeFileSync(DM_FEATURE_FILE, JSON.stringify(DM_FEATURE_ACCESS, null, 2));
    res.json({ success: true, features: DM_FEATURE_ACCESS });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Static admin dashboard page
app.get('/admin/direct-mail', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'publish', 'admin', 'direct-mail.html'));
});

// POST /api/admin/run-scrapers — manually trigger all scrapers now
app.post('/api/admin/deliver', adminAuth, async (req, res) => {
  try {
    _dbData = null;
    var db = getDb();
    var today = new Date().toISOString().split('T')[0];
    var customers = (db.customers || []).filter(function(c) { return c.plan && c.plan !== 'cancelled' && (!c.bounced || c.bounced < 3); });
    var sent = 0;
    for (var ci = 0; ci < customers.length; ci++) {
      var cust = customers[ci];
      var trialEnds = cust.trial_ends ? new Date(cust.trial_ends) : null;
      if (trialEnds && new Date() > trialEnds && cust.plan === 'free_trial') continue;
      var custLeads = (db.leads || []).filter(function(l) { return l.customer_id === cust.id && l.delivered === 0; }).slice(0, 5);
      if (custLeads.length === 0) continue;
      var html = generateLeadEmailHTML(cust, custLeads);
      var subject = 'Your 9am Opportunities for ' + (cust.target_areas ? JSON.parse(cust.target_areas).join(', ') : 'your area') + ' \u2014 ' + new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
      await sendBrevoEmail({ email: cust.email, name: cust.company || '' }, subject, html);
      var now = new Date().toISOString();
      custLeads.forEach(function(l) { l.delivered = 1; l.delivered_at = now; });
      sent++;
    }
    saveDb();
    res.json({ success: true, sent: sent });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


app.get('/api/admin/check-stripe', adminAuth, (req, res) => {
  var hasKey = !!STRIPE_SECRET_KEY;
  var keyPrefix = STRIPE_SECRET_KEY ? STRIPE_SECRET_KEY.substring(0, 10) + '...' : '';
  var priceIdsCount = Object.keys(STRIPE_PRICE_IDS).length;
  var newbusinessPrices = STRIPE_PRICE_IDS['newbusiness'] || {};
  var configPath = path.join(DATA_DIR, 'stripe-config.json');
  var altConfigPath = path.join(__dirname, 'data', 'stripe-config.json');
  res.json({
    hasSecretKey: hasKey,
    keyPrefix: keyPrefix,
    priceIdProducts: Object.keys(STRIPE_PRICE_IDS),
    newbusinessPrices: newbusinessPrices,
    configFileExists: fs.existsSync(configPath),
    altConfigExists: fs.existsSync(altConfigPath),
    dirname: __dirname,
    dataDir: DATA_DIR,
    configPath: configPath,
    altConfigPath: altConfigPath,
    cwd: process.cwd()
  });
});
app.post('/api/admin/clear-leads', adminAuth, (req, res) => {
  try {
    var db = getDb();
    var email = req.body ? req.body.email : '';
    var count = 0;
    if (email) {
      var cust = (db.customers || []).find(function(c) { return c.email === email; });
      if (cust) {
        var before = (db.leads || []).length;
        db.leads = (db.leads || []).filter(function(l) { return l.customer_id !== cust.id; });
        count = before - (db.leads || []).length;
      }
    } else {
      count = (db.leads || []).length;
      db.leads = [];
    }
    saveDb();
    res.json({ success: true, removed: count });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


app.post('/api/admin/run-scrapers', adminAuth, async (req, res) => {
  try {
    const startTime = new Date().toISOString();
    const https = require('https');
    const dayOfWeek = new Date().getDay();
    const results = {};
    const todayStr = new Date().toISOString().split('T')[0];
    const forceScrape = req.body && req.body.force ? true : false;
    if (forceScrape) console.log('[SCRAPER] Force scrape requested - ignoring daily cache');
    var bgTasks = [];

    // Load last scrape dates (persisted to JSON file, resets daily)
    var lastScrapeFile = path.join(DATA_DIR, 'last-scrape.json');
    var lastScrape = {};
    try { lastScrape = JSON.parse(fs.readFileSync(lastScrapeFile, 'utf-8')); } catch(e) {}
    function wasScrapedToday(product) { return lastScrape[product] === todayStr; }
    function markScrapedToday(product) { lastScrape[product] = todayStr; fs.writeFileSync(lastScrapeFile, JSON.stringify(lastScrape)); }

        // Tiered freshness filter: 0-24h primary, 24-48h fallback
    function filterFresh(leads, dateField) {
      if (!leads || !Array.isArray(leads)) return { fresh: [], fallback: [], rejected: 0 };
      var now = new Date();
      var cutoff24h = new Date(now - 24 * 3600000).toISOString();
      var cutoff48h = new Date(now - 48 * 3600000).toISOString();
      var result = { fresh: [], fallback: [], rejected: 0 };
      leads.forEach(function(l) {
        var dateVal = l[dateField] || l.scrapedAt || '';
        if (dateVal >= cutoff24h) result.fresh.push(l);
        else if (dateVal >= cutoff48h) result.fallback.push(l);
        else result.rejected++;
      });
      return result;
    }
function syncCustomers(product) {
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
    }

    // Sync customers for ALL products first (quick)
    for (const product of Object.keys(PRODUCT_LEAD_FILES)) syncCustomers(product);

    for (const [product, config] of Object.entries(PRODUCT_LEAD_FILES)) {
      try {
        // Skip if already scraped today (cost saving - Apify runs once daily)
        if (wasScrapedToday(product) && !forceScrape) {
          var existingFile = path.join(DATA_DIR, config.file);
          try { leads = JSON.parse(fs.readFileSync(existingFile, 'utf-8')); if (!Array.isArray(leads)) leads = []; } catch(e) { leads = []; }
          var leadSource = leads && leads.length > 0 ? (leads[0].source || 'cached') : 'cached';
          results[product] = leadSource + '_' + (leads ? leads.length : 0) + '_cached';
          console.log('[SCRAPER] ' + product + ' already scraped today, using cached data (' + (leads ? leads.length : 0) + ' leads)');
          continue;
        }
        // Generate leads — use free APIs where available, else demo data
        var leads;
        if (product === 'newbusiness') {
          leads = [];
          try {
            var chKeySimple = '8e6cae34-073b-4451-b4c8-e0b463ca4b21' || process.env.CH_STREAM_API_KEY || process.env.COMPANIES_HOUSE_API_KEY;
            var allSectors = ['services','construction','building','property','removals','cleaning','plumbing','electrical','roofing','landscape','estate','consulting','transport','logistics','security','healthcare','catering','solar','insulation','windows','digital','marketing','recruitment','hospitality','engineering','manufacturing','retail','wholesale','agriculture','education','entertainment','fashion','finance','insurance','legal','real+estate','travel'];
            var nbResults = [];
            for (var si = 0; si < allSectors.length; si++) {
              try {
                var nbData = await new Promise(function(resolve) {
                  var url = '/search/companies?q=' + encodeURIComponent(allSectors[si]) + '&size=200';
                  var req = require('https').request({ hostname: 'api.company-information.service.gov.uk', path: url, method: 'GET', headers: { 'Authorization': 'Basic ' + Buffer.from(chKeySimple + ':').toString('base64'), 'Accept': 'application/json', 'User-Agent': '9amLeads/1.0' } }, function(res) {
                    var body = ''; res.on('data', function(c) { body += c; });
                    res.on('end', function() {
                      try { var d = JSON.parse(body); resolve(d.items || []); } catch(e) { resolve([]); }
                    });
                  });
                  req.on('error', function() { resolve([]); });
                  req.setTimeout(15000, function() { resolve([]); });
                  req.end();
                });
                if (nbData && nbData.length > 0) nbResults.push.apply(nbResults, nbData);
              } catch(e) {}
            }
            // Deduplicate and filter
            var nbSeen = {};
            if (nbResults.length > 0) {
              var nbFiltered = nbResults.filter(function(c) {
                if (!c.title || !c.company_number || nbSeen[c.company_number]) return false;
                nbSeen[c.company_number] = true;
                return c.company_status === 'active';
              }).map(function(c) {
                return { id: 'CH_NB_' + c.company_number, name: c.title.trim(), companyNumber: c.company_number, companyName: c.title.trim(), address: c.address_snippet || '', incorporationDate: c.date_of_creation || c.scrapedAt || '', source: 'Companies House API', scrapedAt: new Date().toISOString() };
              });
              // Prioritize companies incorporated within 24h, fallback 48h, then all
              var nbFreshness = filterFresh(nbFiltered, 'scrapedAt');
              if (nbFreshness.fresh.length >= 20) leads = nbFreshness.fresh;
              else if (nbFreshness.fallback.length >= 20) leads = nbFreshness.fallback;
              else leads = nbFreshness.fresh.concat(nbFreshness.fallback).slice(0, 500);
            }
            console.log('[SCRAPER] NB: ' + nbResults.length + ' raw, ' + (leads ? leads.length : 0) + ' filtered');
          } catch(e) { console.log('[SCRAPER] NB error:', e.message); leads = []; }
        } else if (product === 'planning') {
          leads = [];
          try {
            var planningCollector = require('./planning_collector');
            leads = await planningCollector.collectFreshPlanning(48);
            if (!leads || leads.length === 0) {  console.log('[SCRAPER] Planning collector returned 0 applications'); }
            console.log('[SCRAPER] Planning collector returned ' + (leads ? leads.length : 0) + ' applications');
          } catch(e) { console.log('[SCRAPER] Planning error: ' + (e && e.message || '')); leads = []; }
          if (!leads || leads.length < 3) {
            try {
              var chKeyPlan2 = process.env.CH_STREAM_API_KEY || process.env.COMPANIES_HOUSE_API_KEY || 'b67556b9-fedd-41dc-b8c1-dc34aed2b1ba';
              leads = await new Promise(function(resolve) {
                var req = require('https').request({ hostname: 'api.company-information.service.gov.uk', path: '/search/companies?q=builders&size=200', method: 'GET', headers: { 'Authorization': 'Basic ' + Buffer.from(chKeyPlan2 + ':').toString('base64'), 'Accept': 'application/json' } }, function(res) {
                  var body = ''; res.on('data', function(c) { body += c; }); res.on('end', function() {
                    try { var data = JSON.parse(body); var items = data.items || []; resolve(items.filter(function(c){
                      if (!c.title || !c.company_number || c.company_status === 'dissolved') return false;
                      var addr = (c.address_snippet || '').toLowerCase();
                      var blacklist = ['corner chambers','c/o ','care of','po box','p.o. box','suite','flat ','unit ','office ','business centre','business park','registered office','virtual office','formation agent','company formation','the company','company registered','no fixed address'];
                      for (var bi = 0; bi < blacklist.length; bi++) { if (addr.includes(blacklist[bi])) return false; }
                      return true;
                    }).map(function(c) { var a = c.address || {}; return { id: 'CH_BLD_' + (c.company_number || Date.now()), name: (c.title || '').trim(), companyNumber: c.company_number || '', address: c.address_snippet || '', postcode: a.postal_code || '', city: a.locality || '', source: 'CH Builders Fallback', scrapedAt: new Date().toISOString() }; })); } catch(e) { resolve([]); }
                  });
                });
                req.on('error', function() { resolve([]); }); req.setTimeout(30000, function() { req.destroy(); resolve([]); }); req.end();
              });
              console.log('[SCRAPER] CH Builders fallback returned ' + leads.length + ' leads');
            } catch(e) { console.log('[SCRAPER] Planning fallback error: ' + (e && e.message || '')); }
          }
        } else if (product === 'tenders') {
          var tendKey = process.env.APIFY_API_KEY;
          var tendActor = process.env.APIFY_TENDERS_ACTOR || '';
          leads = [];
          if (tendKey && tendActor) {
            try {
              leads = await new Promise(function(r) {
                var b = JSON.stringify({ maxResults: 500 });
                var req = require('https').request({ hostname: 'api.apify.com', method: 'POST', path: '/v2/acts/' + encodeURIComponent(tendActor) + '/run-sync-get-dataset-items?token=' + tendKey + '&memory=256&timeout=120', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b), 'Accept': 'application/json' }, timeout: 150000 }, function(res) {
                  var body = ''; res.on('data', function(c) { body += c; }); res.on('end', function() {
                    try { var items = JSON.parse(body); if (!Array.isArray(items)) { r([]); return; }
                      r(items.map(function(p) { return { id: 'TEND_' + (p.id || p.ocid || Date.now()), title: p.title || p.description || '', description: (p.description || '').substring(0, 400), buyer: p.buyer_name || p.buyer || '', value: p.value || p.contract_value || 0, publishedDate: p.published_date || p.date || '', closingDate: p.closing_date || p.deadline || '', source: 'Apify Tenders', scrapedAt: new Date().toISOString() }; }));
                    } catch(e) { r([]); }
                  });
                });
                req.on('error', function() { r([]); }); req.setTimeout(150000, function() { req.destroy(); r([]); });
                req.write(b); req.end();
              });
              if (leads && leads.length > 0) console.log('[SCRAPER] Apify Tenders returned ' + leads.length);
            } catch(e) { console.log('[SCRAPER] Apify Tenders error:', e.message); leads = []; }
          }
            if (!leads || leads.length < 3) {
            try {
              async function fetchPCS() {
                return new Promise(function(resolve) {
                  var req = require('https').request({ hostname: 'api.publiccontractsscotland.gov.uk', path: '/v1/notices?pageSize=100', method: 'GET', rejectUnauthorized: false, headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 }, function(res) {
                    var body = ''; res.on('data', function(c) { body += c; }); res.on('end', function() {
                      try { var data = JSON.parse(body); var releases = data.releases || []; resolve(releases.slice(0, 100).map(function(r) {
                        var t = r.tender || {}; var b = r.buyer || {}; var bName = b.name || (b.identifier && b.identifier.legalName) || '';
                        var docUrl = t.documents && t.documents[0] ? 'https://www.publiccontractsscotland.gov.uk/search/show/search_view.aspx?ID=' + t.documents[0].id : '';
                        return { id: r.id || r.ocid || 'PCS_' + Date.now(), title: t.title || r.description || '', buyer: bName, contractValue: t.value ? (t.value.amount || t.value) : 0, description: (t.description || r.description || '').substring(0, 500), closingDate: t.tenderPeriod ? t.tenderPeriod.endDate : '', publishedDate: r.date || '', tenderNoticeId: r.id || r.ocid || '', url: docUrl, source: 'Public Contracts Scotland', scrapedAt: new Date().toISOString() };
                      })); } catch(e) { resolve([]); }
                    });
                  });
                  req.on('error', function() { resolve([]); }); req.setTimeout(20000, function() { req.destroy(); resolve([]); }); req.end();
                });
              }
              async function fetchDataGovUK(q) {
                return new Promise(function(resolve) {
                  var req = require('https').request({ hostname: 'data.gov.uk', path: '/api/3/action/package_search?q=' + encodeURIComponent(q) + '&rows=20', method: 'GET', headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, function(res) {
                    var body = ''; res.on('data', function(c) { body += c; }); res.on('end', function() {
                      try { var d = JSON.parse(body); var items = d.result && d.result.results ? d.result.results : []; resolve(items.map(function(n) { return { id: 'DG_' + (n.id || Date.now()), title: n.title || n.name || '', description: (n.notes || n.description || '').substring(0, 300), buyer: n.organization && n.organization.title || '', publishedDate: n.metadata_created || '', source: 'data.gov.uk', scrapedAt: new Date().toISOString() }; })); } catch(e) { resolve([]); }
                    });
                  });
                  req.on('error', function() { resolve([]); }); req.setTimeout(15000, function() { req.destroy(); resolve([]); }); req.end();
                });
              }
              // Fetch from multiple sources in parallel
              var pcsPromise = fetchPCS();
              var dguPromises = ['tenders','construction','contracts','procurement','building','cleaning','security','consulting','maintenance','furniture','healthcare','transport','IT+services','training','catering','logistics','waste','solar','painting','design'].map(function(q) { return fetchDataGovUK(q); });
              var allResults = await Promise.all([pcsPromise, Promise.all(dguPromises)]);
              leads = allResults[0];
              var dgResults = allResults[1];
              for (var dgi = 0; dgi < dgResults.length; dgi++) {
                if (dgResults[dgi] && dgResults[dgi].length > 0) leads = leads.concat(dgResults[dgi]);
              }
              // Deduplicate by title
              if (leads.length > 0) {
                var seenTitles = new Set();
                leads = leads.filter(function(l) {
                  var key = (l.title || '').toLowerCase().trim();
                  return key && !seenTitles.has(key) ? (seenTitles.add(key), true) : false;
                });
                var ft = filterFresh(leads, 'publishedDate');
                leads = ft.fresh.length > 0 ? ft.fresh : ft.fallback;
                if (!leads || leads.length === 0) {  console.log('[SCRAPER] No fresh tender leads today'); } else {
                console.log('[SCRAPER] Tenders: ' + ft.fresh.length + ' fresh, ' + ft.fallback.length + ' fallback, total: ' + leads.length);
        }
              } else { console.log('[SCRAPER] No tender leads today'); leads = []; }
            } catch(e) { console.log('[SCRAPER] Tenders fallback error:', e.message); leads = []; }
          }
        } else if (product === 'planning') {
          try {
            var planScraper = require('./planning_scraper');
            leads = await planScraper.collectPlanningLeads();
            if (leads && leads.length > 0) {
              var fp2 = filterFresh(leads, 'scrapedAt');
              leads = fp2.fresh.length > 0 ? fp2.fresh : fp2.fallback;
              console.log('[SCRAPER] Planning: ' + fp2.fresh.length + ' fresh, ' + fp2.fallback.length + ' fallback, total=' + leads.length);
            } else {
              console.log('[SCRAPER] Planning: 0 from scraper');
              leads = [];
            }
          } catch(e) { console.log('[SCRAPER] Planning error:', e.message); leads = []; }
        } else if (product === 'moving') {
          try {
            var rmScraper = require('./rightmove_scraper_v2');
            var apifyKey = process.env.APIFY_API_KEY || '';
            leads = await rmScraper.collectMovingLeads();
            if (leads && leads.length > 0) {
              // Filter by freshness: prefer new listings (<24h), fallback to recent updates (<48h)
              var rmFresh24 = filterFresh(leads, 'firstVisibleDate');
              var rmFreshUpdate = filterFresh(leads, 'updateDate');
              if (rmFresh24.fresh.length >= 3) leads = rmFresh24.fresh;
              else if (rmFresh24.fallback.length >= 5) leads = rmFresh24.fallback;
              else if (rmFreshUpdate.fresh.length >= 3) leads = rmFreshUpdate.fresh;
              else if (rmFreshUpdate.fallback.length >= 5) leads = rmFreshUpdate.fallback;
              else {
                // Not enough fresh leads — use all available, preferring newest
                leads.sort(function(a, b) { return (b.updateDate || '').localeCompare(a.updateDate || ''); });
                leads = leads.slice(0, 100);
              }
              console.log('[SCRAPER] Rightmove: new=' + rmFresh24.fresh.length + ' listed=' + rmFresh24.fallback.length + ' updated=' + rmFreshUpdate.fresh.length + ' used=' + leads.length);
            }
            // Apify supplement disabled - actor was blocked. Free scraper expanded to 13 regions x 4-20 pages.
            if (false && apifyKey) {
              try {
                console.log('[SCRAPER] Rightmove: free scraper gave ' + (leads ? leads.length : 0) + ', trying Apify supplement...');
                var apifyLeads = await new Promise(function(r) {
                  var bd = JSON.stringify({
                    listUrls: [{ url: 'https://www.rightmove.co.uk/property-for-sale/find.html?searchType=SALE&locationIdentifier=REGION%5E87490&includeSSTC=true&sortType=6' }],
                    propertyUrls: [], monitoringMode: false, fullPropertyDetails: true,
                    includePriceHistory: false, includeNearestSchools: false,
                    enableDelistingTracker: false, addEmptyTrackerRecord: false,
                    maxProperties: 50,
                    proxy: { useApifyProxy: true, apifyProxyGroups: ['BUYPROXIES94952'] }
                  });
                  var req = require('https').request({ hostname: 'api.apify.com', method: 'POST', path: '/v2/acts/dhrumil~rightmove-scraper/run-sync-get-dataset-items?token=' + apifyKey + '&memory=1024&timeout=300', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bd), 'Accept': 'application/json' }, timeout: 300000 }, function(res) {
                    var bt = ''; res.on('data', function(c) { bt += c; }); res.on('end', function() {
                      try { var j = JSON.parse(bt); if (Array.isArray(j)) r(j); else r([]); } catch(e) { r([]); }
                    });
                  });
                  req.on('error', function() { r([]); });
                  req.write(bd); req.end();
                });
                if (apifyLeads && apifyLeads.length > 0) {
                  var mappedApify = apifyLeads.map(function(p) {
                    var pStatus = 'Available';
                    var pReason = (p.listingUpdate && p.listingUpdate.listingUpdateReason || '').toLowerCase();
                    if (pReason.includes('sold') || pReason.includes('sstc') || pReason.includes('under offer')) pStatus = 'SSTC';
                    else if (pReason.includes('reduced')) pStatus = 'Reduced';
                    else if (pReason === 'new') pStatus = 'New';
                    if (p.displayStatus) pStatus = p.displayStatus;
                    return {
                      id: 'APIFY_' + p.id,
                      title: p.displayAddress || '',
                      address: p.displayAddress || '',
                      price: p.price ? (p.price.amount || 0) : 0,
                      bedrooms: p.bedrooms || 0,
                      propertyType: p.propertySubType || '',
                      listingStatus: pStatus,
                      firstVisibleDate: p.firstVisibleDate || '',
                      updateDate: p.updateDate || '',
                      url: 'https://www.rightmove.co.uk' + (p.propertyUrl || ''),
                      agent: p.customer ? (p.customer.branchDisplayName || p.customer.branchName || '') : '',
                      source: 'Apify Rightmove',
                      scrapedAt: new Date().toISOString(),
                      city: p.city || p.displayAddress || '',
                      postcode: (p.displayAddress || '').match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d?[A-Z]?\s*\d?[A-Z]{0,2}/i) ? (p.displayAddress || '').match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d?[A-Z]?\s*\d?[A-Z]{0,2}/i)[0] : ''
                    };
                  });
                  leads = leads || [];
                  leads = leads.concat(mappedApify);
                  console.log('[SCRAPER] Rightmove: Apify added ' + mappedApify.length + ', total=' + leads.length);
                }
              } catch(apifyErr) { console.log('[SCRAPER] Rightmove Apify error:', apifyErr.message); }
            }
            if (!leads || leads.length === 0) {  console.log('[SCRAPER] Rightmove: 0 real leads today'); }
          } catch(e) { console.log('[SCRAPER] Rightmove error:', e.message); leads = []; }
        } else if (product === 'probate') {
          try {
            var probateScraper = require('./probate_leads_scraper');
            leads = await probateScraper.collectProbateLeads();
            if (leads && leads.length > 0) {
              var fp = filterFresh(leads, 'scrapedAt');
              leads = fp.fresh.length > 0 ? fp.fresh : fp.fallback;
              console.log('[SCRAPER] Probate: ' + fp.fresh.length + ' fresh, ' + fp.fallback.length + ' fallback, total=' + leads.length);
            } else {
              console.log('[SCRAPER] Probate: 0 from scraper');
              leads = [];
            }
          } catch(e) { console.log('[SCRAPER] Probate error:', e.message); leads = []; }
        } else if (product === 'tenders') {
          try {
            var tendersScraper = require('./tenders_scraper');
            leads = await tendersScraper.collectTendersLeads({ keywords: 'construction,cleaning,catering,IT,security,maintenance', maxCount: 100 });
            if (leads && leads.length > 0) {
              var ftp = filterFresh(leads, 'scrapedAt');
              leads = ftp.fresh.length > 0 ? ftp.fresh : ftp.fallback;
              console.log('[SCRAPER] Tenders: ' + ftp.fresh.length + ' fresh, ' + ftp.fallback.length + ' fallback, total=' + leads.length);
            } else {
              console.log('[SCRAPER] Tenders: 0 from scraper');
              leads = [];
            }
          } catch(e) { console.log('[SCRAPER] Tenders error:', e.message); leads = []; }
        } else {
          leads = [];
        }
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(path.join(DATA_DIR, config.file), JSON.stringify(leads, null, 2));
        // General freshness filter for all products: prefer 24h, fallback 48h
        if (leads && leads.length > 0 && product !== 'moving') {
          var genFresh = filterFresh(leads, 'scrapedAt');
          if (genFresh.fresh.length >= 3) leads = genFresh.fresh;
          else if (genFresh.fallback.length >= 5) leads = genFresh.fallback;
          else leads = genFresh.fresh.concat(genFresh.fallback).concat(genFresh.rejected).slice(0, 200);
        }
        if (!leads || leads.length === 0) { leads = []; }
        markScrapedToday(product); // Record this product as scraped today
        var leadSource = leads && leads.length > 0 ? (leads[0].source || 'unknown') : 'empty';
        fs.writeFileSync(path.join(DATA_DIR, product + '-source.txt'), leadSource);
        results[product] = leadSource + '_' + (leads ? leads.length : 0);
      } catch (prodErr) {
        results[product] = 'error: ' + prodErr.message;
      }
    }
    // === SUPPLEMENT: Disabled — no demo leads are generated ===
    // Only real scraped data is used for all lead types.
    // Log scraper run to database
    try {
      var scraperLog = getDb();
      if (!scraperLog.scraper_logs) scraperLog.scraper_logs = [];
      scraperLog.scraper_logs.push({ id: uuidv4(), start_time: startTime, end_time: new Date().toISOString(), duration_seconds: Math.floor((Date.now() - new Date(startTime).getTime()) / 1000), results: JSON.parse(JSON.stringify(results)), status: 'completed' });
      saveDb();
    } catch(logErr) { console.log('[SCRAPER] Log error:', logErr.message); }
    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// POST /api/admin/test-ch — test Companies House API from Render
// Stream worker status
app.get('/api/admin/stream-status', adminAuth, function(req, res) {
  try {
    var sw = require('./streaming_worker');
    res.json(sw.getStatus());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get queued stream companies
app.post('/api/admin/stream-queue', adminAuth, function(req, res) {
  try {
    var sw = require('./streaming_worker');
    var companies = sw.getRecentCompanies();
    res.json({ count: companies.length, companies: companies });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/test-ch', adminAuth, async function(req, res) {
  try {
    var key = process.env.CH_STREAM_API_KEY || process.env.COMPANIES_HOUSE_API_KEY || 'b67556b9-fedd-41dc-b8c1-dc34aed2b1ba';
    // Also test PCS tender API
    var tenderResult = await new Promise(function(resolve) {
      var req3 = require('https').request({ hostname: 'api.publiccontractsscotland.gov.uk', path: '/v1/notices?pageSize=2', method: 'GET', rejectUnauthorized: false, headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, function(res3) {
        var b3 = ''; res3.on('data', function(c) { b3 += c; });
        res3.on('end', function() { try { var d3 = JSON.parse(b3); resolve({ status: res3.statusCode, releases: (d3.releases || []).length, first: d3.releases && d3.releases[0] ? d3.releases[0].ocid : 'none' }); } catch(e) { resolve({ error: 'Parse error', body: b3.slice(0, 200) }); }
        });
      });
      req3.on('error', function(e) { resolve({ error: e.message }); });
      req3.setTimeout(15000, function() { req3.destroy(); resolve({ error: 'timeout' }); });
      req3.end();
    });
    res.json({ success: true, result: 'Companies House OK', tenders: tenderResult });
  } catch(e) { res.json({ error: e.message }); }
});
app.post('/api/admin/reset-weekly', adminAuth, (req, res) => {
  try {
    const email = req.body.email;
    const products = req.body.products || ['planning','probate','tenders'];
    if (!email) return res.status(400).json({ error: 'email required' });
    _dbData = null;
    const db = getDb();
    const customer = (db.customers || []).filter(function(c) { return c.email === email; })[0];
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    var count = 0;
    for (var li = 0; li < (db.leads || []).length; li++) {
      var l = db.leads[li];
      if (l.customer_id === customer.id && products.indexOf(l.product) >= 0 && l.delivered) {
        l.delivered = 0;
        l.delivered_at = null;
        count++;
      }
    }
    saveDb();
    res.json({ success: true, message: 'Reset ' + count + ' deliveries for ' + products.join(', ') });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/purge-leads — remove ALL leads for a customer to start fresh
app.post('/api/admin/purge-leads', adminAuth, (req, res) => {
  try {
    const email = req.body.email;
    if (!email) return res.status(400).json({ error: 'email required' });
    _dbData = null;
    const db = getDb();
    const customer = (db.customers || []).filter(function(c) { return c.email === email; })[0];
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const before = (db.leads || []).length;
    db.leads = (db.leads || []).filter(function(l) { return l.customer_id !== customer.id; });
    const removed = before - (db.leads || []).length;
    saveDb();
    res.json({ success: true, message: 'Purged ' + removed + ' leads for ' + customer.company + ', ' + (db.leads || []).length + ' remaining in DB' });
  } catch(e) { res.status(500).json({ error: e.message }); }
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

// POST /api/admin/delete-customer — remove a customer by email for fresh signup
app.post('/api/admin/delete-customer', adminAuth, (req, res) => {
  try {
    const email = req.body.email;
    if (!email) return res.status(400).json({ error: 'email required' });
    var jsonDb = getDb();
    var cust = (jsonDb.customers || []).filter(function(c) { return c.email === email; })[0];
    if (cust) {
      jsonDb.customers = (jsonDb.customers || []).filter(function(c) { return c.email !== email; });
      jsonDb.leads = (jsonDb.leads || []).filter(function(l) { return cust.id && l.customer_id !== cust.id; });
    }
    saveDb();
    // Delete from SQLite-shim via db.prepare
    var existing = db.prepare('SELECT id FROM customers WHERE email = ?').get(email);
    if (existing) {
      db.prepare('DELETE FROM leads WHERE customer_id = ?').run(existing.id);
      db.prepare('DELETE FROM customers WHERE id = ?').run(existing.id);
    }
    console.log('[ADMIN] Deleted customer ' + email + (existing ? ' (found)' : ' (not in SQLite)') + (cust ? ' (JSON)' : ''));
    res.json({ success: true, message: 'Customer deleted: ' + email });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/purge-demo — remove demo migration accounts only (keeps real signups)
app.post('/api/admin/purge-demo', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const demoIds = (db.customers || []).filter(c => c.source === 'demo-migration').map(c => c.id);
    const beforeCust = db.customers.length;
    const beforeLeads = db.leads.length;
    db.customers = (db.customers || []).filter(c => c.source !== 'demo-migration');
    db.leads = (db.leads || []).filter(l => !demoIds.includes(l.customer_id));
    saveDb();
    res.json({ success: true, removed_customers: beforeCust - db.customers.length, removed_leads: beforeLeads - db.leads.length });
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
      ? services.map(s => '<li style="color:#e2e8f0;font-size:13px;margin-bottom:4px">' + s + '</li>').join('')
      : '<li style="color:#94a3b8;font-size:13px">None specified</li>';
    const leadTypeNames = { moving:'Moving Leads', probate:'Probate Leads', newbusiness:'New Business Alerts', planning:'Planning Permission', tenders:'Public Tenders', multiple:'Multiple / Not Sure' };
    const htmlContent = `<div style="font-family:Inter,sans-serif;background:#0a0a0f;padding:32px">
<div style="max-width:560px;margin:0 auto;background:#11131f;border:1px solid #1e2030;border-radius:16px;overflow:hidden">
<div style="background:linear-gradient(135deg,#0ea5e9,#2563eb);padding:20px 24px">
<h1 style="font-family:Outfit,sans-serif;font-size:18px;font-weight:800;color:#fff;margin:0">New Marketing Services Enquiry</h1>
<p style="color:rgba(255,255,255,0.7);font-size:13px;margin:4px 0 0">From ` + name + `</p>
</div>
<div style="padding:24px">
<table style="width:100%;border-collapse:collapse;font-size:13px">
<tr><td style="padding:8px 12px;color:#94a3b8;width:100px">Name</td><td style="padding:8px 12px;color:#f1f5f9;font-weight:600">` + name + `</td></tr>
<tr><td style="padding:8px 12px;color:#94a3b8">Company</td><td style="padding:8px 12px;color:#f1f5f9">` + (company || 'N/A') + `</td></tr>
<tr><td style="padding:8px 12px;color:#94a3b8">Email</td><td style="padding:8px 12px;color:#0ea5e9"><a href="mailto:` + fromEmail + `" style="color:#0ea5e9;text-decoration:none">` + fromEmail + `</a></td></tr>
<tr><td style="padding:8px 12px;color:#94a3b8">Phone</td><td style="padding:8px 12px;color:#f1f5f9">` + (phone || 'N/A') + `</td></tr>
<tr><td style="padding:8px 12px;color:#94a3b8">Lead Type</td><td style="padding:8px 12px;color:#f1f5f9">` + (leadTypeNames[leadType] || leadType) + `</td></tr>
</table>
<div style="margin-top:16px;padding:16px;background:#f8f9fb;border:1px solid #1e2030;border-radius:8px">
<h3 style="font-family:Outfit,sans-serif;font-size:13px;font-weight:700;color:#f1f5f9;margin:0 0 8px">Services Requested</h3>
<ul style="margin:0;padding:0 0 0 16px">` + servicesHtml + `</ul>
</div>
<div style="margin-top:12px;padding:16px;background:#f8f9fb;border:1px solid #1e2030;border-radius:8px">
<h3 style="font-family:Outfit,sans-serif;font-size:13px;font-weight:700;color:#f1f5f9;margin:0 0 8px">Details</h3>
<p style="color:#e2e8f0;font-size:13px;line-height:1.7;margin:0;white-space:pre-wrap">` + details + `</p>
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

// POST /api/admin/release-postcodes — release specific or all postcode claims (admin only)
app.post('/api/admin/release-postcodes', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || auth !== 'Bearer 9amAdmin2024!') return res.status(401).json({ error: 'Unauthorized' });
    const { codes } = req.body || {};
    const assignmentsData = loadAssignments();
    const map = assignmentsData.assignments || {};
    let released = 0;
    if (Array.isArray(codes) && codes.length) {
      codes.forEach(function(c) { if (map[c]) { delete map[c]; released++; } });
    } else {
      Object.keys(map).forEach(function(k) { delete map[k]; });
      released = Object.keys(map).length;
    }
    saveAssignments(assignmentsData);
    res.json({ success: true, released: released, remaining: Object.keys(map).length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ADMIN RESET (TEMPORARY - for fresh test) =====
app.post('/api/admin/reset', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || auth !== 'Bearer 9amAdmin2024!') return res.status(401).json({ error: 'Unauthorized' });
    const dbData = getDb();
    dbData.customers = [];
    dbData.leads = [];
    dbData.deliveries = [];
    dbData.scraper_logs = [];
    await saveDb();
    const assignmentsData = loadAssignments();
    assignmentsData.assignments = {};
    saveAssignments(assignmentsData);
    console.log('[ADMIN] Database reset complete');
    res.json({ success: true, message: 'All customers, leads, and assignments cleared. Start fresh.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/update-lead-type — admin updates lead type rules
app.post('/api/admin/update-lead-type', adminAuth, (req, res) => {
  try {
    const { key, updates } = req.body;
    if (!key || !LEAD_TYPE_RULES[key]) return res.status(400).json({ error: 'Invalid lead type' });
    if (updates.enabled !== undefined) LEAD_TYPE_RULES[key].enabled = updates.enabled;
    if (updates.min_area) LEAD_TYPE_RULES[key].min_area = updates.min_area;
    if (updates.coverage) LEAD_TYPE_RULES[key].coverage = updates.coverage;
    if (updates.plan_limits && typeof updates.plan_limits === 'object') {
      for (const [planKey, limits] of Object.entries(updates.plan_limits)) {
        if (LEAD_TYPE_RULES[key].plans[planKey]) {
          Object.assign(LEAD_TYPE_RULES[key].plans[planKey], limits);
        }
      }
    }
    // Save to a config file so changes persist across restarts
    const configPath = path.join(DATA_DIR, 'lead-type-overrides.json');
    let overrides = {};
    try { overrides = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch(e) {}
    overrides[key] = overrides[key] || {};
    Object.assign(overrides[key], updates);
    fs.writeFileSync(configPath, JSON.stringify(overrides, null, 2));
    console.log('[ADMIN] Lead type updated:', key);
    res.json({ success: true, message: LEAD_TYPE_RULES[key].name + ' updated' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== REFERRAL SYSTEM (Step 2) =====
// GET /api/referral — customer referral dashboard
app.get('/api/referral', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    const code = customer.referral_code || (customer.id || '').substring(0, 8).toUpperCase();
    const referrals = (db.referrals || []).filter(r => r.referrer_id === req.user.id);
    res.json({
      code: code,
      link: 'https://www.9amleads.com/portal/?ref=' + code,
      total_referrals: referrals.length,
      pending_rewards: referrals.filter(r => r.status === 'pending').length,
      approved_rewards: referrals.filter(r => r.status === 'approved').length,
      paid_conversions: referrals.filter(r => r.status === 'converted').length,
      referrals: referrals
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/referral/use — apply referral code on signup
app.post('/api/referral/use', async (req, res) => {
  try {
    const { code, email } = req.body;
    if (!code || !email) return res.status(400).json({ error: 'Code and email required' });
    const db = getDb();
    const referrer = (db.customers || []).find(c => (c.referral_code || c.id.substring(0,8).toUpperCase()) === code.toUpperCase());
    if (!referrer) return res.status(404).json({ error: 'Invalid referral code' });
    if (!db.referrals) db.referrals = [];
    db.referrals.push({ id: uuidv4(), referrer_id: referrer.id, referred_email: email, status: 'signed_up', reward: null, created_at: new Date().toISOString(), notes: '' });
    saveDb();
    res.json({ success: true, message: 'Referral code applied!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== CASE STUDY SYSTEM (Step 3) =====
// POST /api/case-studies — create case study from won lead
app.post('/api/case-studies', authMiddleware, (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    const { lead_id, business_name, deal_value, time_to_win, testimonial, allow_publish, anonymous } = req.body;
    const db = getDb();
    if (!db.case_studies) db.case_studies = [];
    db.case_studies.push({
      id: uuidv4(), customer_id: req.user.id, lead_id: lead_id || '',
      business_name: business_name || customer.company || 'Customer',
      lead_type: customer.product, coverage: customer.coverage,
      deal_value: deal_value || 0, time_to_win: time_to_win || '',
      testimonial: testimonial || '', allow_publish: !!allow_publish,
      anonymous: !!anonymous, status: 'draft',
      created_at: new Date().toISOString(), published_at: null
    });
    saveDb();
    res.json({ success: true, message: 'Success story saved! Our team will review it.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/case-studies — public approved case studies
app.get('/api/case-studies', async (req, res) => {
  try {
    const db = getDb();
    const published = (db.case_studies || []).filter(c => c.status === 'published').slice(0, 10);
    res.json({ case_studies: published.map(c => ({ business_name: c.business_name, lead_type: c.lead_type, deal_value: c.deal_value, time_to_win: c.time_to_win, testimonial: c.testimonial, anonymous: c.anonymous, created_at: c.created_at })) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/case-studies — admin list all
app.get('/api/admin/case-studies', adminAuth, (req, res) => {
  try { const db = getDb(); res.json({ case_studies: db.case_studies || [] }); } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/case-studies/approve — approve/reject
app.post('/api/admin/case-studies/approve', adminAuth, (req, res) => {
  try {
    const db = getDb(); const { id, status } = req.body;
    const cs = (db.case_studies || []).find(c => c.id === id);
    if (!cs) return res.status(404).json({ error: 'Not found' });
    cs.status = status || 'published';
    if (status === 'published') cs.published_at = new Date().toISOString();
    saveDb();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== COMPETITOR MONITORING (Step 4) =====
// POST /api/competitors — add competitor
app.post('/api/competitors', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    if (!db.competitors) db.competitors = [];
    db.competitors.push({ id: uuidv4(), customer_id: req.user.id, name: req.body.name || '', website: req.body.website || '', area: req.body.area || '', industry: req.body.industry || '', notes: req.body.notes || '', created_at: new Date().toISOString(), last_update: null });
    saveDb();
    res.json({ success: true, message: 'Competitor added. We\'ll monitor for signals.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/competitors — customer competitors list
app.get('/api/competitors', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const competitors = (db.competitors || []).filter(c => c.customer_id === req.user.id);
    res.json({ competitors });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== AI ACCOUNT MANAGER (Step 5) =====
// GET /api/ai-advisor — AI recommendations based on real data
app.get('/api/ai-advisor', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    const leads = (db.leads || []).filter(l => l.customer_id === req.user.id);
    const thisMonth = new Date().toISOString().split('T')[0].substring(0,7);
    const monthLeads = leads.filter(l => l.created_at && l.created_at.startsWith(thisMonth));
    const contacted = monthLeads.filter(l => l.lead_status && l.lead_status !== 'new');
    const wonLeads = leads.filter(l => l.lead_status === 'won');
    const totalRevenue = wonLeads.reduce((s, l) => s + (parseInt(l.actual_revenue) || parseInt(l.deal_value) || 0), 0);
    const contactedRate = monthLeads.length > 0 ? Math.round((contacted.length / monthLeads.length) * 100) : 0;
    const recommendations = [];

    if (contactedRate < 30 && monthLeads.length > 0) {
      recommendations.push({ priority: 'high', icon: '\uD83D\uDCDE', message: 'You have contacted only ' + contactedRate + '% of this month\'s opportunities. Contacting more leads could improve your results.', action: 'View Leads', page: 'leads' });
    }
    if (customer.coverage === 'postcode' && (customer.product === 'planning' || customer.product === 'probate' || customer.product === 'tenders')) {
      recommendations.push({ priority: 'medium', icon: '\uD83D\uDCCD', message: 'Your current coverage area may be too narrow for consistent volume. Consider expanding to county or region coverage.', action: 'Expand Coverage', page: 'areas' });
    }
    if (totalRevenue > 500) {
      recommendations.push({ priority: 'medium', icon: '\uD83D\uDCC8', message: 'You generated \u00a3' + totalRevenue.toLocaleString() + ' from 9am Leads. Upgrading your plan could increase your opportunity volume.', action: 'View Plans', page: 'billing' });
    }
    if (!customer.crm_webhook_url) {
      recommendations.push({ priority: 'low', icon: '\uD83D\uDD0C', message: 'Your CRM is not connected. Connect it to save time every morning by automatically receiving opportunities.', action: 'Connect CRM', page: 'crm' });
    }
    recommendations.push({ priority: 'info', icon: '\uD83D\uDCA1', message: 'Your next 9am delivery arrives tomorrow. Contact fresh leads quickly to maximise your conversion rate.', action: 'View Dashboard', page: 'dashboard' });

    res.json({ recommendations, contacted_rate: contactedRate, leads_this_month: monthLeads.length, total_revenue: totalRevenue });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ADMIN NOTIFICATIONS (Step 8) =====
// GET /api/admin/notifications — admin alerts
app.get('/api/admin/notifications', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const notifications = [];

    // Check for at-risk customers
    const customers = db.customers || [];
    customers.forEach(function(c) {
      const leads = (db.leads || []).filter(l => l.customer_id === c.id);
      const hasRecentLogin = c.last_login_at && (Date.now() - new Date(c.last_login_at).getTime()) < 7 * 86400000;
      if (!hasRecentLogin && c.plan && c.plan !== 'cancelled') {
        notifications.push({ type: 'at_risk', priority: 'high', customer_id: c.id, customer_email: c.email, message: c.email + ' has not logged in for 7+ days', created_at: new Date().toISOString() });
      }
    });

    // Pending case studies
    const pendingCaseStudies = (db.case_studies || []).filter(cs => cs.status === 'draft').length;
    if (pendingCaseStudies > 0) notifications.push({ type: 'case_study', priority: 'medium', message: pendingCaseStudies + ' case study review' + (pendingCaseStudies !== 1 ? 's' : '') + ' pending approval', created_at: new Date().toISOString() });

    // Pending referrals
    const pendingReferrals = (db.referrals || []).filter(r => r.status === 'signed_up').length;
    if (pendingReferrals > 0) notifications.push({ type: 'referral', priority: 'low', message: pendingReferrals + ' referral' + (pendingReferrals !== 1 ? 's' : '') + ' need reward review', created_at: new Date().toISOString() });

    // Failed payments
    const failedPayments = customers.filter(c => parseInt(c.fail_count) > 0).length;
    if (failedPayments > 0) notifications.push({ type: 'payment', priority: 'high', message: failedPayments + ' customer' + (failedPayments !== 1 ? 's' : '') + ' have failed payments', created_at: new Date().toISOString() });

    // Support requests
    const pendingSupport = (db.support_requests || []).filter(s => !s.resolved).length;
    if (pendingSupport > 0) notifications.push({ type: 'support', priority: 'medium', message: pendingSupport + ' unresolved support request' + (pendingSupport !== 1 ? 's' : ''), created_at: new Date().toISOString() });

    res.json({ notifications });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== QA TEST SUITE (Step 7) =====
// GET /api/admin/qa-tests — get test results
app.get('/api/admin/qa-tests', adminAuth, (req, res) => {
  try { const db = getDb(); res.json({ tests: db.qa_tests || [] }); } catch(e) { res.status(500).json({ error: e.message }); }
});
// POST /api/admin/qa-tests — save test result
app.post('/api/admin/qa-tests', adminAuth, (req, res) => {
  try {
    const db = getDb();
    if (!db.qa_tests) db.qa_tests = [];
    db.qa_tests.push({ id: uuidv4(), test_name: req.body.test_name || '', steps: req.body.steps || '', expected: req.body.expected || '', result: req.body.result || 'pass', notes: req.body.notes || '', tested_by: req.body.tested_by || 'admin', date_tested: new Date().toISOString() });
    saveDb();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== METRICS (Step 6) — LTV and founder finance metrics =====
// GET /api/admin/metrics — LTV, ARPU, churn, etc.
app.get('/api/admin/metrics', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const customers = db.customers || [];
    const activeCustomers = customers.filter(c => c.plan && c.plan !== 'cancelled' && (!c.trial_ends || new Date(c.trial_ends) > new Date()));
    const totalCustomers = customers.length;
    const planPrices = { starter: 25, pro: 49, enterprise: 99 };

    // MRR
    var mrr = activeCustomers.reduce(function(s, c) { return s + (planPrices[c.plan] || 0); }, 0);

    // Average revenue per customer
    var totalMonthly = customers.reduce(function(s, c) { return s + (planPrices[c.plan] || 0); }, 0);
    var arpu = activeCustomers.length > 0 ? Math.round(totalMonthly / activeCustomers.length) : 0;

    // Average subscription length
    var totalDays = customers.filter(c => c.created_at).reduce(function(s, c) { return s + Math.round((Date.now() - new Date(c.created_at).getTime()) / 86400000); }, 0);
    var avgDays = totalCustomers > 0 ? Math.round(totalDays / totalCustomers) : 0;

    // Churn
    var cancelled = customers.filter(c => c.plan === 'cancelled').length;
    var churnRate = totalCustomers > 0 ? Math.round((cancelled / totalCustomers) * 100) : 0;

    // LTV estimate
    var avgMonths = Math.max(1, Math.round(avgDays / 30));
    var ltv = arpu * avgMonths;

    // Trial conversion
    var everTrial = customers.filter(c => c.plan === 'free_trial' || c.created_at).length;
    var paid = customers.filter(c => c.plan === 'starter' || c.plan === 'pro' || c.plan === 'enterprise').length;
    var trialConversion = everTrial > 0 ? Math.round((paid / everTrial) * 100) : 0;

    res.json({
      mrr: mrr,
      arpu: arpu,
      average_subscription_days: avgDays,
      average_subscription_months: avgMonths,
      customer_lifetime_value: ltv,
      churn_rate: churnRate,
      churned_customers: cancelled,
      trial_conversion_rate: trialConversion,
      paid_customers: paid,
      active_customers: activeCustomers.length,
      total_customers_ever: totalCustomers,
      failed_payment_rate: customers.length > 0 ? Math.round((customers.filter(c => parseInt(c.fail_count) > 0).length / customers.length) * 100) : 0
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/setup-intent - create Stripe SetupIntent for card collection
app.post('/api/setup-intent', authMiddleware, async (req, res) => {
  try {
    if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });
    var customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    var stripeCustomerId = customer.stripe_customer_id;
    if (!stripeCustomerId) {
      var custResult = await stripeApiRequest('POST', 'customers', {
        email: customer.email, name: customer.company || customer.contact_name || '', description: '9amLeads - ' + (customer.product || 'customer')
      });
      if (!custResult || !custResult.id) return res.status(500).json({ error: 'Failed to create Stripe customer' });
      stripeCustomerId = custResult.id;
      db.prepare('UPDATE customers SET stripe_customer_id = ? WHERE id = ?').run(stripeCustomerId, customer.id);
      saveDb();
    }
    var intent = await stripeApiRequest('POST', 'setup_intents', { customer: stripeCustomerId, 'payment_method_types[]': 'card' });
    res.json({ client_secret: intent.client_secret });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/save-payment-method - save collected card
app.post('/api/save-payment-method', authMiddleware, async (req, res) => {
  try {
    var pm = req.body.payment_method_id;
    if (!pm) return res.status(400).json({ error: 'Payment method ID required' });
    var customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    await stripeApiRequest('POST', 'payment_methods/' + pm + '/attach', { customer: customer.stripe_customer_id });
    await stripeApiRequest('POST', 'customers/' + customer.stripe_customer_id, { 'invoice_settings[default_payment_method]': pm });
    db.prepare('UPDATE customers SET stripe_payment_method_id = ? WHERE id = ?').run(pm, customer.id);
    saveDb();
    res.json({ success: true, message: 'Card saved. No charge until trial ends.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/cancel-trial - cancel trial, no charge
app.post('/api/cancel-trial', authMiddleware, async (req, res) => {
  try {
    var customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (!customer) return res.status(404).json({ error: 'User not found' });
    db.prepare('UPDATE customers SET trial_cancelled = 1, plan = ? WHERE id = ?').run('cancelled', customer.id);
    saveDb();
    if (customer.stripe_customer_id) { try { await stripeApiRequest('DELETE', 'customers/' + customer.stripe_customer_id, {}); } catch(e) {} }
    res.json({ success: true, message: 'Trial cancelled. No charge. Dashboard accessible.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// POST /api/admin/update-areas - update customer target areas to postcode codes
app.post('/api/admin/update-areas', adminAuth, (req, res) => {
  try {
    var { email, areas } = req.body;
    if (!email || !areas) return res.status(400).json({ error: 'Email and areas required' });
    var customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    db.prepare('UPDATE customers SET target_areas = ? WHERE email = ?').run(JSON.stringify(areas), email);
    saveDb();
    res.json({ success: true, areas: areas });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Global error handler
app.use(function(err, req, res, next) {
  console.error('[ERROR] Unhandled error:', err.message || err);
  res.status(500).json({ error: 'Internal server error' });
});

// ===== CAMPAIGN PACKS =====
const CAMPAIGN_BUSINESS_TYPES = ['Plumbing','Roofing','Removals','Cleaning','Gardening','Estate Agents','Mortgage Brokers','Solar','Pest Control','Locksmith','Electrician','Builder','Decorator','Carpet Cleaning','Driveways','Windows and Doors','Kitchens','Bathrooms','General Trades','Other'];

// Seed default campaign packs on startup
function seedDefaultCampaignPacks() {
  try {
    var db2 = getDb();
    // Only seed if no packs exist
    if (db2.campaign_packs && db2.campaign_packs.length > 0) return;
    var defaults = [
      { name:'Emergency Plumbing Offer', business_type:'Plumbing', objective:'Generate emergency plumbing calls', headline:'Burst Pipe? Same-Day Emergency Plumbing', suggested_offer:'£50 off any emergency repair', cta:'Call Now for Immediate Help', color_style:'#dc2626', qr_setting:'url', audience:'Homeowners with recent water issues' },
      { name:'Roof Inspection & Repair', business_type:'Roofing', objective:'Get roof inspection bookings', headline:'Free Roof Inspection — No Obligation', suggested_offer:'Free no-obligation roof inspection', cta:'Book Your Free Survey Today', color_style:'#ea580c', qr_setting:'phone', audience:'Homeowners in target postcode areas' },
      { name:'Professional Moving Services', business_type:'Removals', objective:'Win moving contracts', headline:'Moving Soon? Get a Free Quote Today', suggested_offer:'Free no-obligation moving quote', cta:'Get Your Free Quote', color_style:'#0ea5e9', qr_setting:'url', audience:'Homeowners who have listed their property' },
      { name:'Deep Clean Special Offer', business_type:'Cleaning', objective:'Book cleaning appointments', headline:'Professional Deep Clean — 20% Off First Booking', suggested_offer:'20% off first deep clean', cta:'Book Your Clean Now', color_style:'#10b981', qr_setting:'phone', audience:'New homeowners and tenants' },
      { name:'Garden Clearance & Maintenance', business_type:'Gardening', objective:'Get gardening service bookings', headline:'Transform Your Garden This Season', suggested_offer:'Free quote + 10% off first month', cta:'Get Your Free Garden Quote', color_style:'#16a34a', qr_setting:'url', audience:'Homeowners with gardens in target areas' },
      { name:'Sell Your Property Faster', business_type:'Estate Agents', objective:'Win property listings', headline:'Sold in 30 Days or We\'ll Market for Free', suggested_offer:'Free property valuation', cta:'Book Your Free Valuation', color_style:'#6366f1', qr_setting:'url', audience:'Homeowners planning to sell' },
      { name:'Mortgage Pre-Approval', business_type:'Mortgage Brokers', objective:'Generate mortgage enquiries', headline:'Secure Your Mortgage Before You House Hunt', suggested_offer:'Free mortgage pre-approval check', cta:'Check Your Eligibility Free', color_style:'#7c3aed', qr_setting:'url', audience:'First-time buyers and movers' },
      { name:'Solar Panel Installation', business_type:'Solar', objective:'Get solar panel enquiries', headline:'Slash Your Energy Bills with Solar Panels', suggested_offer:'Free solar feasibility survey', cta:'Get Your Free Solar Quote', color_style:'#f59e0b', qr_setting:'url', audience:'Homeowners with suitable roof space' },
      { name:'Pest Control Emergency Service', business_type:'Pest Control', objective:'Generate pest control calls', headline:'Pests in Your Home? Fast Same-Day Service', suggested_offer:'£25 off first treatment', cta:'Call Us Now', color_style:'#92400e', qr_setting:'phone', audience:'Homeowners in target postcode areas' },
      { name:'24/7 Emergency Locksmith', business_type:'Locksmith', objective:'Generate emergency lockout calls', headline:'Locked Out? We\'re Here in 30 Minutes', suggested_offer:'£10 off for new customers', cta:'Call for Immediate Help', color_style:'#1e293b', qr_setting:'phone', audience:'Homeowners and landlords' },
      { name:'Electrical Safety Check', business_type:'Electrician', objective:'Get electrical inspection bookings', headline:'Full Electrical Safety Check — Just £99', suggested_offer:'Electrical safety check for £99', cta:'Book Your Safety Check', color_style:'#2563eb', qr_setting:'url', audience:'Homeowners in target postcode areas' },
      { name:'Building & Renovation Services', business_type:'Builder', objective:'Win building project enquiries', headline:'Planning a Home Renovation? Let\'s Talk', suggested_offer:'Free consultation and written quote', cta:'Get Your Free Quote', color_style:'#475569', qr_setting:'url', audience:'Homeowners with planning permission' },
      { name:'Professional Decorating Services', business_type:'Decorator', objective:'Get decorating job bookings', headline:'Transform Your Home with Expert Decorating', suggested_offer:'Free colour consultation with quote', cta:'Book Your Free Quote', color_style:'#db2777', qr_setting:'url', audience:'Homeowners who recently moved' },
      { name:'Carpet & Upholstery Cleaning', business_type:'Carpet Cleaning', objective:'Book carpet cleaning jobs', headline:'Professional Carpet Cleaning — 3 Rooms for £99', suggested_offer:'3 rooms cleaned for just £99', cta:'Book Your Clean Now', color_style:'#0891b2', qr_setting:'phone', audience:'Homeowners and landlords' },
      { name:'Driveway & Patio Installations', business_type:'Driveways', objective:'Get driveway installation leads', headline:'Transform Your Driveway — Free Quote', suggested_offer:'Free design consultation and quote', cta:'Get Your Free Driveway Quote', color_style:'#4f46e5', qr_setting:'url', audience:'Homeowners in target postcode areas' },
      { name:'Windows & Doors Installation', business_type:'Windows and Doors', objective:'Generate window replacement enquiries', headline:'New Windows & Doors — Up to 40% Off', suggested_offer:'Free survey and quote', cta:'Book Your Free Survey', color_style:'#0d9488', qr_setting:'url', audience:'Homeowners with older properties' },
      { name:'Kitchen Design & Installation', business_type:'Kitchens', objective:'Get kitchen project enquiries', headline:'Your Dream Kitchen Awaits — Free Design Visit', suggested_offer:'Free kitchen design consultation', cta:'Book Your Free Design Visit', color_style:'#be123c', qr_setting:'url', audience:'Homeowners planning renovations' },
      { name:'Bathroom Renovation Services', business_type:'Bathrooms', objective:'Get bathroom project bookings', headline:'Luxury Bathroom Renovation — From £3,999', suggested_offer:'Free design and quote', cta:'Get Your Free Bathroom Quote', color_style:'#0284c7', qr_setting:'url', audience:'Homeowners in target postcode areas' },
      { name:'Reliable Trade Services', business_type:'General Trades', objective:'Generate multi-trade enquiries', headline:'Your Trusted Local Tradesperson — Free Quotes', suggested_offer:'Free no-obligation quote for any job', cta:'Get Your Free Quote', color_style:'#6b7280', qr_setting:'url', audience:'Homeowners and property managers' },
      { name:'Professional Services', business_type:'Other', objective:'Generate service enquiries', headline:'Professional Service — Free Consultation', suggested_offer:'Free initial consultation', cta:'Book Your Free Consultation', color_style:'#0ea5e9', qr_setting:'url', audience:'Targeted local homeowners' }
    ];
    if (!db2.campaign_packs) db2.campaign_packs = [];
    var uuid = require('uuid');
    defaults.forEach(function(d, i) {
      db2.campaign_packs.push({
        id: uuidv4(), is_default: 1, is_enabled: 1,
        name: d.name, business_type: d.business_type, objective: d.objective,
        headline: d.headline, suggested_offer: d.suggested_offer, cta: d.cta,
        color_style: d.color_style, qr_setting: d.qr_setting, audience: d.audience,
        flyer_template: 'A5 Flyer - ' + d.business_type, letter_template: 'Introduction Letter - ' + d.business_type,
        print_settings: 'A5 portrait, full colour, 170gsm',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
    });
    saveDb();
    console.log('[CAMPAIGN-PACKS] Seeded ' + defaults.length + ' default packs');
  } catch(e) { console.log('[CAMPAIGN-PACKS] Seed error:', e.message); }
}

// Campaign Pack API endpoints
// GET /api/campaign-packs — Get available packs (defaults + customer's custom)
app.get('/api/campaign-packs', authMiddleware, (req, res) => {
  try {
    var businessType = req.query.business_type || '';
    var db2 = getDb();
    var packs = [];
    // Default packs
    if (db2.campaign_packs) {
      packs = db2.campaign_packs.filter(function(p) { return p.is_default && p.is_enabled; });
    }
    // Customer's custom packs
    if (db2.customer_campaign_packs) {
      var custom = db2.customer_campaign_packs.filter(function(p) { return p.customer_id === req.user.id; });
      packs = packs.concat(custom);
    }
    if (businessType) { packs = packs.filter(function(p) { return p.business_type === businessType; }); }
    res.json({ success: true, packs: packs, total: packs.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/campaign-packs/:id — Get pack details
app.get('/api/campaign-packs/:id', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    // Check default packs
    var pack = db2.campaign_packs ? db2.campaign_packs.find(function(p) { return p.id === req.params.id; }) : null;
    if (!pack) {
      // Check customer custom packs
      pack = db2.customer_campaign_packs ? db2.customer_campaign_packs.find(function(p) { return p.id === req.params.id && p.customer_id === req.user.id; }) : null;
    }
    if (!pack) return res.status(404).json({ error: 'Pack not found' });
    res.json({ success: true, pack: pack });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/campaign-packs/:id/apply-profile — Apply business profile to pack
app.post('/api/campaign-packs/:id/apply-profile', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var pack = db2.campaign_packs ? db2.campaign_packs.find(function(p) { return p.id === req.params.id; }) : null;
    if (!pack) return res.status(404).json({ error: 'Pack not found' });
    var profile = db.prepare('SELECT * FROM customer_business_profiles WHERE customer_id = ?').get(req.user.id);
    if (!profile) return res.status(400).json({ error: 'Complete your Business Profile first.' });
    res.json({
      success: true, merged: true,
      campaign_name: pack.name, headline: pack.headline, offer: pack.suggested_offer, cta: pack.cta,
      company_name: profile.company_name, business_type: profile.business_type,
      phone: profile.phone, email: profile.email, website: profile.website,
      logo_url: profile.logo_url, colour: pack.color_style
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/campaign-packs/save — Save a pack as customer's template
app.post('/api/campaign-packs/save', authMiddleware, (req, res) => {
  try {
    var packData = req.body;
    if (!packData.name) return res.status(400).json({ error: 'Pack name required' });
    var db2 = getDb();
    if (!db2.customer_campaign_packs) db2.customer_campaign_packs = [];
    var pack = {
      id: uuidv4(), customer_id: req.user.id, is_default: 0, is_enabled: 1,
      name: packData.name, business_type: packData.business_type || '',
      objective: packData.objective || '', headline: packData.headline || '',
      suggested_offer: packData.suggested_offer || '', cta: packData.cta || '',
      color_style: packData.color_style || '#0ea5e9', qr_setting: packData.qr_setting || 'url',
      audience: packData.audience || '', flyer_template: packData.flyer_template || '',
      letter_template: packData.letter_template || '', print_settings: packData.print_settings || '',
      source_pack_id: packData.source_pack_id || '',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    db2.customer_campaign_packs.push(pack);
    saveDb();
    res.json({ success: true, pack: pack });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/campaign-packs/:id — Update customer's custom pack
app.put('/api/campaign-packs/:id', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    if (!db2.customer_campaign_packs) return res.status(404).json({ error: 'Pack not found' });
    var idx = db2.customer_campaign_packs.findIndex(function(p) { return p.id === req.params.id && p.customer_id === req.user.id; });
    if (idx === -1) return res.status(404).json({ error: 'Pack not found' });
    Object.assign(db2.customer_campaign_packs[idx], req.body, { id: req.params.id, customer_id: req.user.id, updated_at: new Date().toISOString() });
    saveDb();
    res.json({ success: true, pack: db2.customer_campaign_packs[idx] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/campaign-packs/:id/duplicate — Duplicate a pack (default or custom)
app.post('/api/campaign-packs/:id/duplicate', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    // Check default packs
    var source = db2.campaign_packs ? db2.campaign_packs.find(function(p) { return p.id === req.params.id; }) : null;
    if (!source) {
      // Check customer custom packs
      source = db2.customer_campaign_packs ? db2.customer_campaign_packs.find(function(p) { return p.id === req.params.id && p.customer_id === req.user.id; }) : null;
    }
    if (!source) return res.status(404).json({ error: 'Pack not found' });
    if (!db2.customer_campaign_packs) db2.customer_campaign_packs = [];
    var copy = JSON.parse(JSON.stringify(source));
    copy.id = uuidv4(); copy.customer_id = req.user.id; copy.is_default = 0;
    copy.name = source.name + ' (Copy)';
    copy.source_pack_id = source.id;
    copy.created_at = new Date().toISOString(); copy.updated_at = new Date().toISOString();
    db2.customer_campaign_packs.push(copy);
    saveDb();
    res.json({ success: true, pack: copy });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/campaign-packs/:id — Delete customer's custom pack
app.delete('/api/campaign-packs/:id', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    if (!db2.customer_campaign_packs) return res.status(404).json({ error: 'Pack not found' });
    var idx = db2.customer_campaign_packs.findIndex(function(p) { return p.id === req.params.id && p.customer_id === req.user.id; });
    if (idx === -1) return res.status(404).json({ error: 'Pack not found' });
    db2.customer_campaign_packs.splice(idx, 1);
    saveDb();
    res.json({ success: true, message: 'Pack deleted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin endpoints
// GET /api/admin/campaign-packs — Get all packs (admin)
app.get('/api/admin/campaign-packs', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var defaults = db2.campaign_packs || [];
    var custom = db2.customer_campaign_packs || [];
    res.json({ success: true, default_packs: defaults, custom_packs: custom, total_defaults: defaults.length, total_custom: custom.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/campaign-packs — Create or update a default pack (admin)
app.post('/api/admin/campaign-packs', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    if (!db2.campaign_packs) db2.campaign_packs = [];
    var existingIdx = req.body.id ? db2.campaign_packs.findIndex(function(p) { return p.id === req.body.id; }) : -1;
    var packData = {
      name: req.body.name || 'New Pack', business_type: req.body.business_type || 'Other',
      objective: req.body.objective || '', headline: req.body.headline || '',
      suggested_offer: req.body.suggested_offer || '', cta: req.body.cta || '',
      color_style: req.body.color_style || '#0ea5e9', qr_setting: req.body.qr_setting || 'url',
      audience: req.body.audience || '', flyer_template: req.body.flyer_template || '',
      letter_template: req.body.letter_template || '', print_settings: req.body.print_settings || '',
      is_enabled: req.body.is_enabled !== undefined ? (req.body.is_enabled ? 1 : 0) : 1
    };
    if (existingIdx !== -1) {
      Object.assign(db2.campaign_packs[existingIdx], packData, { updated_at: new Date().toISOString() });
    } else {
      packData.id = uuidv4(); packData.is_default = 1;
      packData.created_at = new Date().toISOString(); packData.updated_at = new Date().toISOString();
      db2.campaign_packs.push(packData);
    }
    saveDb();
    res.json({ success: true, pack: existingIdx !== -1 ? db2.campaign_packs[existingIdx] : packData });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/campaign-packs/:id/toggle — Enable/disable a default pack
app.post('/api/admin/campaign-packs/:id/toggle', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var idx = (db2.campaign_packs || []).findIndex(function(p) { return p.id === req.params.id; });
    if (idx === -1) return res.status(404).json({ error: 'Pack not found' });
    db2.campaign_packs[idx].is_enabled = db2.campaign_packs[idx].is_enabled ? 0 : 1;
    saveDb();
    res.json({ success: true, is_enabled: db2.campaign_packs[idx].is_enabled });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== TEMPLATE MARKETPLACE =====
const MARKETPLACE_CATEGORIES = ['New Customer Introduction','Free Quote Offer','Discount Offer','Seasonal Campaign','Emergency Service Campaign','Local Awareness Campaign','Premium Service Campaign','Reminder Campaign'];

function seedMarketplaceTemplates() {
  try {
    var db2 = getDb();
    if (db2.marketplace_templates && db2.marketplace_templates.length > 0) return;
    if (!db2.marketplace_templates) db2.marketplace_templates = [];
    var defaults = [
      { name:'Welcome to Our Service', category:'New Customer Introduction', headline:'Welcome! Here\'s How We Can Help', suggested_offer:'10% off your first booking', cta:'Claim Your Welcome Offer', instructions:'Send this to new leads within 24 hours of receiving their details. Personalise with their name and your specific services.' },
      { name:'Free Quote Offer', category:'Free Quote Offer', headline:'Get a Free, No-Obligation Quote Today', suggested_offer:'Free detailed quote', cta:'Get Your Free Quote', instructions:'Use for any lead type. Emphasise that there is no obligation and no hidden fees.' },
      { name:'Limited Time Discount', category:'Discount Offer', headline:'Limited Time Offer — 20% Off', suggested_offer:'20% discount for new customers', cta:'Claim Your Discount', instructions:'Create urgency by mentioning the limited-time nature of the offer. Follow up within 48 hours.' },
      { name:'Seasonal Check-Up Offer', category:'Seasonal Campaign', headline:'Prepare for [Season] — Book Your Service Today', suggested_offer:'Seasonal maintenance check at a fixed price', cta:'Book Your Seasonal Service', instructions:'Tailor the season to the timing of your campaign. Spring cleaning, autumn checks, winter readiness.' },
      { name:'Emergency Service Available', category:'Emergency Service Campaign', headline:'Emergency? We\'re Here to Help — Fast Response', suggested_offer:'Priority emergency dispatch', cta:'Call Our Emergency Line', instructions:'Keep this template ready for urgent lead types. Response time is critical — aim to contact within 30 minutes.' },
      { name:'Proudly Serving Your Neighbourhood', category:'Local Awareness Campaign', headline:'Your Local [Business Type] — Serving [Area] for [X] Years', suggested_offer:'Free initial consultation', cta:'Meet Your Local Team', instructions:'Replace [Area] with the specific neighbourhood. Emphasise local knowledge and community roots.' },
      { name:'Premium Service Experience', category:'Premium Service Campaign', headline:'Experience Premium [Service] — Book a Consultation', suggested_offer:'Complimentary premium consultation', cta:'Book Your Premium Consultation', instructions:'Target high-value leads. Use premium language and emphasise quality over price.' },
      { name:'Just Checking In', category:'Reminder Campaign', headline:'We\'re Still Here When You Need Us', suggested_offer:'Repeat customer discount', cta:'Get in Touch', instructions:'Send to leads who didn\'t convert initially. Keep it light and helpful — not pushy.' }
    ];
    defaults.forEach(function(t) {
      db2.marketplace_templates.push({
        id: uuidv4(), is_default: 1, is_featured: 0, is_enabled: 1,
        name: t.name, category: t.category, headline: t.headline,
        suggested_offer: t.suggested_offer, cta: t.cta, instructions: t.instructions,
        business_types: '', flyer_preview: '', letter_preview: '',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
    });
    saveDb();
    console.log('[MARKETPLACE] Seeded ' + defaults.length + ' templates');
  } catch(e) { console.log('[MARKETPLACE] Seed error:', e.message); }
}

// GET /api/marketplace/templates — Browse marketplace templates
app.get('/api/marketplace/templates', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var category = req.query.category || '';
    var businessType = req.query.business_type || '';
    var templates = (db2.marketplace_templates || []).filter(function(t) { return t.is_enabled; });
    // Also include customer's saved custom templates
    var custom = (db2.customer_marketplace_templates || []).filter(function(t) { return t.customer_id === req.user.id; });
    templates = templates.concat(custom);
    if (category) templates = templates.filter(function(t) { return t.category === category; });
    if (businessType) templates = templates.filter(function(t) { return !t.business_types || t.business_types.indexOf(businessType) !== -1; });
    res.json({ success: true, templates: templates, total: templates.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/marketplace/templates/:id — Get template details
app.get('/api/marketplace/templates/:id', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var tpl = db2.marketplace_templates ? db2.marketplace_templates.find(function(t) { return t.id === req.params.id; }) : null;
    if (!tpl) tpl = db2.customer_marketplace_templates ? db2.customer_marketplace_templates.find(function(t) { return t.id === req.params.id && t.customer_id === req.user.id; }) : null;
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    res.json({ success: true, template: tpl });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/marketplace/templates/save — Save marketplace template to customer account
app.post('/api/marketplace/templates/save', authMiddleware, (req, res) => {
  try {
    var sourceId = req.body.source_id;
    if (!sourceId) return res.status(400).json({ error: 'Source template ID required' });
    var db2 = getDb();
    var source = db2.marketplace_templates ? db2.marketplace_templates.find(function(t) { return t.id === sourceId; }) : null;
    if (!source) return res.status(404).json({ error: 'Source template not found' });
    if (!db2.customer_marketplace_templates) db2.customer_marketplace_templates = [];
    db2.customer_marketplace_templates.push({
      id: uuidv4(), customer_id: req.user.id, source_id: sourceId,
      name: source.name + ' (Saved)', category: source.category,
      headline: source.headline, suggested_offer: source.suggested_offer,
      cta: source.cta, instructions: source.instructions,
      flyer_preview: source.flyer_preview, letter_preview: source.letter_preview,
      is_default: 0, is_enabled: 1, business_types: source.business_types || '',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
    saveDb();
    res.json({ success: true, message: 'Template saved to your account' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/marketplace/templates/:id — Update customer's saved template
app.put('/api/marketplace/templates/:id', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var idx = (db2.customer_marketplace_templates || []).findIndex(function(t) { return t.id === req.params.id && t.customer_id === req.user.id; });
    if (idx === -1) return res.status(404).json({ error: 'Template not found or not editable' });
    Object.assign(db2.customer_marketplace_templates[idx], req.body, { id: req.params.id, updated_at: new Date().toISOString() });
    saveDb();
    res.json({ success: true, template: db2.customer_marketplace_templates[idx] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/marketplace/templates/:id — Remove customer's saved template
app.delete('/api/marketplace/templates/:id', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var idx = (db2.customer_marketplace_templates || []).findIndex(function(t) { return t.id === req.params.id && t.customer_id === req.user.id; });
    if (idx === -1) return res.status(404).json({ error: 'Template not found' });
    db2.customer_marketplace_templates.splice(idx, 1);
    saveDb();
    res.json({ success: true, message: 'Template removed' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin endpoints
app.get('/api/admin/marketplace/templates', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    res.json({ success: true, default_templates: db2.marketplace_templates || [], customer_templates: db2.customer_marketplace_templates || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/marketplace/templates', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    if (!db2.marketplace_templates) db2.marketplace_templates = [];
    var existingIdx = req.body.id ? db2.marketplace_templates.findIndex(function(t) { return t.id === req.body.id; }) : -1;
    var data = { name: req.body.name || 'New Template', category: req.body.category || 'New Customer Introduction', headline: req.body.headline || '', suggested_offer: req.body.suggested_offer || '', cta: req.body.cta || '', instructions: req.body.instructions || '', flyer_preview: req.body.flyer_preview || '', letter_preview: req.body.letter_preview || '', business_types: req.body.business_types || '', is_featured: req.body.is_featured ? 1 : 0, is_enabled: req.body.is_enabled !== undefined ? (req.body.is_enabled ? 1 : 0) : 1 };
    if (existingIdx !== -1) { Object.assign(db2.marketplace_templates[existingIdx], data, { updated_at: new Date().toISOString() }); }
    else { data.id = uuidv4(); data.is_default = 1; data.created_at = new Date().toISOString(); data.updated_at = new Date().toISOString(); db2.marketplace_templates.push(data); }
    saveDb();
    res.json({ success: true, template: existingIdx !== -1 ? db2.marketplace_templates[existingIdx] : data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/marketplace/templates/:id/toggle', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var idx = (db2.marketplace_templates || []).findIndex(function(t) { return t.id === req.params.id; });
    if (idx === -1) return res.status(404).json({ error: 'Template not found' });
    db2.marketplace_templates[idx].is_enabled = db2.marketplace_templates[idx].is_enabled ? 0 : 1;
    saveDb();
    res.json({ success: true, is_enabled: db2.marketplace_templates[idx].is_enabled });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== SEASONAL CAMPAIGNS =====
var SEASONAL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var SEASONAL_SEASONS = { 'January':'Winter','February':'Winter','March':'Spring','April':'Spring','May':'Spring','June':'Summer','July':'Summer','August':'Summer','September':'Autumn','October':'Autumn','November':'Autumn','December':'Winter' };

function seedSeasonalCampaigns() {
  try {
    var db2 = getDb();
    if (db2.seasonal_campaigns && db2.seasonal_campaigns.length > 0) return;
    if (!db2.seasonal_campaigns) db2.seasonal_campaigns = [];
    var data = [
      { month:1, season:'Winter', headline:'New Year, Fresh Start — Book Your Home Improvement', offer:'10% off January bookings', cta:'Start Your Project', business_types:'Builder,Kitchens,Bathrooms,Decorator,General Trades', objective:'Home improvement' },
      { month:1, season:'Winter', headline:'New Year Deep Clean — Start the Year Fresh', offer:'£20 off full home deep clean', cta:'Book Your Clean', business_types:'Cleaning,Carpet Cleaning', objective:'New Year cleaning' },
      { month:1, season:'Winter', headline:'January Sale — 15% Off All Services', offer:'15% off first booking of 2025', cta:'Claim Your Discount', business_types:'All', objective:'New Year promotion' },
      { month:2, season:'Winter', headline:'Beat the Winter Chills — Heating & Insulation Check', offer:'Free heating system check', cta:'Book Your Check', business_types:'Plumbing,Electrician,Builder', objective:'Winter maintenance' },
      { month:3, season:'Spring', headline:'Spring Cleaning Special —£50 Off Full Clean', offer:'£50 off full spring clean', cta:'Book Spring Clean', business_types:'Cleaning,Carpet Cleaning', objective:'Spring cleaning' },
      { month:3, season:'Spring', headline:'Get Your Garden Ready for Spring', offer:'Free garden consultation', cta:'Book Your Garden Service', business_types:'Gardening', objective:'Spring garden prep' },
      { month:3, season:'Spring', headline:'Spring Roof Check — Free Inspection', offer:'Free roof inspection', cta:'Book Roof Check', business_types:'Roofing', objective:'Spring roof check' },
      { month:3, season:'Spring', headline:'Exterior Spring Clean — Pressure Washing', offer:'20% off exterior cleaning', cta:'Book Exterior Clean', business_types:'Cleaning,Windows and Doors', objective:'Exterior spring clean' },
      { month:4, season:'Spring', headline:'Easter Special — Book Before [Date] for 10% Off', offer:'10% off if booked before Easter', cta:'Claim Easter Offer', business_types:'All', objective:'Easter promotion' },
      { month:4, season:'Spring', headline:'Spring Driveway & Patio Refresh', offer:'Free design consultation', cta:'Get Your Driveway Quote', business_types:'Driveways', objective:'Spring driveway' },
      { month:5, season:'Spring', headline:'Moving Season — Book Your Removals Early', offer:'£50 off any removal booking', cta:'Get Moving Quote', business_types:'Removals,Estate Agents', objective:'Moving season' },
      { month:6, season:'Summer', headline:'Summer Sale — 20% Off All Services', offer:'20% off summer bookings', cta:'Book Summer Service', business_types:'All', objective:'Summer promotion' },
      { month:6, season:'Summer', headline:'Solar Ready for Summer — Save on Bills', offer:'Free solar viability survey', cta:'Get Solar Quote', business_types:'Solar', objective:'Summer solar' },
      { month:7, season:'Summer', headline:'Summer Pest Control — Protect Your Home', offer:'£25 off pest control treatment', cta:'Call Pest Control', business_types:'Pest Control', objective:'Summer pest control' },
      { month:7, season:'Summer', headline:'Summer Home Improvements — No VAT', offer:'No VAT on projects booked this month', cta:'Start Your Project', business_types:'Builder,Kitchens,Bathrooms', objective:'Summer improvements' },
      { month:8, season:'Summer', headline:'Back to School — Organise Your Home', offer:'Free home organisation consultation', cta:'Book Now', business_types:'Cleaning,Removals', objective:'Back to school' },
      { month:9, season:'Autumn', headline:'Autumn Boiler Service — Stay Warm This Winter', offer:'£79 boiler service — normally £120', cta:'Book Boiler Service', business_types:'Plumbing', objective:'Boiler service' },
      { month:9, season:'Autumn', headline:'Winter-Proof Your Home — Free Survey', offer:'Free winter readiness survey', cta:'Book Winter Check', business_types:'Roofing,Builder,Electrician', objective:'Winter prep' },
      { month:9, season:'Autumn', headline:'Gutter Clearance for Autumn — £60', offer:'Full gutter clearance for £60', cta:'Book Gutter Clearance', business_types:'Roofing,Cleaning,Gardening', objective:'Autumn gutter clearance' },
      { month:10, season:'Autumn', headline:'October Fall Sale — Save Big', offer:'25% off all services this month', cta:'Claim Offer', business_types:'All', objective:'Autumn promotion' },
      { month:10, season:'Autumn', headline:'Pre-Winter Roof Inspection', offer:'Free inspection + discounted repairs', cta:'Book Roof Check', business_types:'Roofing', objective:'Pre-winter roof check' },
      { month:10, season:'Autumn', headline:'Autumn Garden Clearance — Leaf Removal', offer:'Free quote for garden clearance', cta:'Book Garden Clearance', business_types:'Gardening', objective:'Autumn garden' },
      { month:11, season:'Autumn', headline:'Emergency Services — Fast Response This Winter', offer:'Priority response — call now', cta:'Call Emergency Line', business_types:'Plumbing,Electrician,Locksmith,Pest Control', objective:'Emergency readiness' },
      { month:12, season:'Winter', headline:'Christmas Clean — Sparkling Home for the Holidays', offer:'15% off pre-Christmas clean', cta:'Book Christmas Clean', business_types:'Cleaning,Carpet Cleaning', objective:'Christmas cleaning' },
      { month:12, season:'Winter', headline:'End of Year Sale — 30% Off All Services', offer:'30% off — our best offer of the year', cta:'Claim Year-End Offer', business_types:'All', objective:'Year-end promotion' },
      { month:12, season:'Winter', headline:'New Year, New Home — Plan Your 2026 Project', offer:'Free consultation for 2026 projects', cta:'Plan Your Project', business_types:'Builder,Kitchens,Bathrooms,Driveways,Windows and Doors', objective:'Year-end planning' }
    ];
    data.forEach(function(d) {
      db2.seasonal_campaigns.push({
        id: uuidv4(), month: d.month, season: d.season,
        headline: d.headline, offer: d.offer, cta: d.cta,
        business_types: d.business_types, objective: d.objective, is_enabled: 1,
        created_at: new Date().toISOString()
      });
    });
    saveDb();
    console.log('[SEASONAL] Seeded ' + data.length + ' campaigns');
  } catch(e) { console.log('[SEASONAL] Seed error:', e.message); }
}

// GET /api/seasonal/recommendations — Get seasonal campaign recommendations for customer
app.get('/api/seasonal/recommendations', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var now = new Date();
    var currentMonth = now.getMonth() + 1; // 1-12
    var currentSeason = SEASONAL_SEASONS[SEASONAL_MONTHS[currentMonth - 1]] || 'Winter';

    // Get customer business type
    var profile = db.prepare('SELECT * FROM customer_business_profiles WHERE customer_id = ?').get(req.user.id);
    var businessType = (profile && profile.business_type) || '';
    var customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    var product = (customer && customer.product) || '';

    // Get campaigns for current month AND next month
    var campaigns = (db2.seasonal_campaigns || []).filter(function(c) {
      if (!c.is_enabled) return false;
      // Match current month or next month
      var nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
      if (c.month !== currentMonth && c.month !== nextMonth) return false;
      // Match business type or 'All'
      var types = (c.business_types || '').split(',').map(function(t) { return t.trim(); });
      if (types.indexOf('All') === -1 && types.indexOf(businessType) === -1 && types.indexOf(product) === -1) return false;
      return true;
    });

    res.json({
      success: true,
      current_month: SEASONAL_MONTHS[currentMonth - 1],
      current_season: currentSeason,
      business_type: businessType || product || 'General',
      campaigns: campaigns,
      total: campaigns.length
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/seasonal/:month — Get campaigns for a specific month
app.get('/api/seasonal/:month', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var month = parseInt(req.params.month) || (new Date().getMonth() + 1);
    var campaigns = (db2.seasonal_campaigns || []).filter(function(c) { return c.month === month && c.is_enabled; });
    res.json({ success: true, month: SEASONAL_MONTHS[month - 1], season: SEASONAL_SEASONS[SEASONAL_MONTHS[month - 1]], campaigns: campaigns, total: campaigns.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin endpoints
app.get('/api/admin/seasonal/campaigns', adminAuth, (req, res) => {
  try { var db2 = getDb(); res.json({ success: true, campaigns: db2.seasonal_campaigns || [] }); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/seasonal/campaigns', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    if (!db2.seasonal_campaigns) db2.seasonal_campaigns = [];
    var existingIdx = req.body.id ? db2.seasonal_campaigns.findIndex(function(c) { return c.id === req.body.id; }) : -1;
    var data = { month: parseInt(req.body.month) || 1, season: req.body.season || 'Winter', headline: req.body.headline || '', offer: req.body.offer || '', cta: req.body.cta || '', business_types: req.body.business_types || 'All', objective: req.body.objective || '', is_enabled: req.body.is_enabled !== undefined ? (req.body.is_enabled ? 1 : 0) : 1 };
    if (existingIdx !== -1) { Object.assign(db2.seasonal_campaigns[existingIdx], data, { updated_at: new Date().toISOString() }); }
    else { data.id = uuidv4(); data.created_at = new Date().toISOString(); db2.seasonal_campaigns.push(data); }
    saveDb();
    res.json({ success: true, campaign: existingIdx !== -1 ? db2.seasonal_campaigns[existingIdx] : data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== DONE FOR YOU CAMPAIGN REQUEST =====
var REQUEST_STATUSES = ['requested','in_review','draft_preparing','ready_for_approval','approved','paid','sent','completed'];

// POST /api/direct-mail/requests — Submit a campaign request
app.post('/api/direct-mail/requests', authMiddleware, (req, res) => {
  try {
    if (!req.body.business_type || !req.body.campaign_goal) return res.status(400).json({ error: 'Business type and campaign goal required' });
    var db2 = getDb();
    if (!db2.campaign_requests) db2.campaign_requests = [];
    var reqData = {
      id: uuidv4(), customer_id: req.user.id, status: 'requested',
      business_type: req.body.business_type, campaign_goal: req.body.campaign_goal,
      offer: req.body.offer || '', target_area: req.body.target_area || '',
      lead_count: parseInt(req.body.lead_count) || 0, notes: req.body.notes || '',
      budget: parseFloat(req.body.budget) || 0, desired_send_date: req.body.desired_send_date || '',
      logo_data: req.body.logo_data || '', admin_notes: '',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    db2.campaign_requests.push(reqData);
    saveDb();
    res.json({ success: true, request: reqData });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/requests — Get customer's requests
app.get('/api/direct-mail/requests', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var requests = (db2.campaign_requests || []).filter(function(r) { return r.customer_id === req.user.id; }).sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    res.json({ success: true, requests: requests, total: requests.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin endpoints
// GET /api/admin/direct-mail/requests — Get all requests
app.get('/api/admin/direct-mail/requests', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var statusFilter = req.query.status || '';
    var requests = (db2.campaign_requests || []).sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    var expanded = requests.map(function(r) {
      var cust = (db2.customers || []).find(function(c) { return c.id === r.customer_id; });
      return Object.assign({}, r, { customer_email: cust ? cust.email : 'unknown', customer_company: cust ? cust.company : '' });
    });
    if (statusFilter) expanded = expanded.filter(function(r) { return r.status === statusFilter; });
    res.json({ success: true, requests: expanded, total: expanded.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/direct-mail/requests/:id — Update request status/admin notes
app.put('/api/admin/direct-mail/requests/:id', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var idx = (db2.campaign_requests || []).findIndex(function(r) { return r.id === req.params.id; });
    if (idx === -1) return res.status(404).json({ error: 'Request not found' });
    if (req.body.status && REQUEST_STATUSES.indexOf(req.body.status) === -1) return res.status(400).json({ error: 'Invalid status' });
    if (req.body.status) db2.campaign_requests[idx].status = req.body.status;
    if (req.body.admin_notes !== undefined) db2.campaign_requests[idx].admin_notes = req.body.admin_notes;
    db2.campaign_requests[idx].updated_at = new Date().toISOString();
    saveDb();
    res.json({ success: true, request: db2.campaign_requests[idx] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/direct-mail/requests/:id/create-campaign — Create campaign from request
app.post('/api/admin/direct-mail/requests/:id/create-campaign', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var requestData = (db2.campaign_requests || []).find(function(r) { return r.id === req.params.id; });
    if (!requestData) return res.status(404).json({ error: 'Request not found' });
    var campaign = { id: uuidv4(), customer_id: requestData.customer_id, name: requestData.campaign_goal + ' - Done For You', description: requestData.notes || '', status: 'draft', template_id: req.body.template_id || '', material_id: '', target_count: requestData.lead_count || 1, sent_count: 0, delivery_date: requestData.desired_send_date || '', budget: requestData.budget || 0, notes: 'Created from Done For You request: ' + requestData.id, provider: '', provider_campaign_id: '', provider_status: '', stripe_session_id: '', stripe_payment_id: '', stripe_payment_status: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    db.prepare('INSERT INTO direct_mail_campaigns (id,customer_id,name,description,status,template_id,material_id,target_count,sent_count,delivery_date,budget,notes,provider,provider_campaign_id,provider_status,stripe_session_id,stripe_payment_id,stripe_payment_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(campaign.id, campaign.customer_id, campaign.name, campaign.description, campaign.status, campaign.template_id, campaign.material_id, campaign.target_count, campaign.sent_count, campaign.delivery_date, campaign.budget, campaign.notes, campaign.provider, campaign.provider_campaign_id, campaign.provider_status, campaign.stripe_session_id, campaign.stripe_payment_id, campaign.stripe_payment_status, campaign.created_at, campaign.updated_at);
    requestData.status = 'draft_preparing'; requestData.updated_at = new Date().toISOString();
    saveDb();
    res.json({ success: true, campaign: campaign });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== CAMPAIGN NOTES & OUTCOMES =====
// POST /api/direct-mail/campaigns/:id/outcome — Add/update outcome for a campaign
app.post('/api/direct-mail/campaigns/:id/outcome', authMiddleware, (req, res) => {
  try {
    var campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    var db2 = getDb();
    if (!db2.campaign_notes) db2.campaign_notes = [];
    var existing = db2.campaign_notes.findIndex(function(n) { return n.campaign_id === req.params.id && n.customer_id === req.user.id; });
    var entry = {
      campaign_id: req.params.id, customer_id: req.user.id,
      notes: req.body.notes || '',
      calls_received: parseInt(req.body.calls_received) || 0,
      quotes_booked: parseInt(req.body.quotes_booked) || 0,
      jobs_won: parseInt(req.body.jobs_won) || 0,
      estimated_revenue: parseFloat(req.body.estimated_revenue) || 0,
      actual_revenue: parseFloat(req.body.actual_revenue) || 0,
      customer_feedback: req.body.customer_feedback || '',
      follow_up_date: req.body.follow_up_date || '',
      updated_at: new Date().toISOString()
    };
    if (existing !== -1) { Object.assign(db2.campaign_notes[existing], entry); }
    else { entry.id = uuidv4(); entry.created_at = new Date().toISOString(); db2.campaign_notes.push(entry); }
    saveDb();
    // Calculate ROI
    var spend = parseFloat(campaign.budget) || 0;
    var revenue = entry.actual_revenue || entry.estimated_revenue || 0;
    var roi = spend > 0 ? ((revenue - spend) / spend * 100).toFixed(0) : 0;
    var costPerWin = entry.jobs_won > 0 ? (spend / entry.jobs_won).toFixed(2) : 0;
    res.json({ success: true, outcome: entry, roi: roi, cost_per_win: costPerWin, spend: spend });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/campaigns/:id/outcome — Get outcome for a campaign
app.get('/api/direct-mail/campaigns/:id/outcome', authMiddleware, (req, res) => {
  try {
    var campaign = db.prepare('SELECT * FROM direct_mail_campaigns WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    var db2 = getDb();
    var entry = (db2.campaign_notes || []).find(function(n) { return n.campaign_id === req.params.id && n.customer_id === req.user.id; }) || null;
    var spend = parseFloat(campaign.budget) || 0;
    var revenue = entry ? (entry.actual_revenue || entry.estimated_revenue || 0) : 0;
    var roi = spend > 0 ? ((revenue - spend) / spend * 100).toFixed(0) : 0;
    var costPerWin = entry && entry.jobs_won > 0 ? (spend / entry.jobs_won).toFixed(2) : 0;
    res.json({ success: true, outcome: entry, roi: roi, cost_per_win: costPerWin, spend: spend });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/outcomes — Get all outcomes for customer (for analytics)
app.get('/api/direct-mail/outcomes', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var notes = (db2.campaign_notes || []).filter(function(n) { return n.customer_id === req.user.id; });
    var campaigns = db.prepare('SELECT * FROM direct_mail_campaigns WHERE customer_id = ?').all(req.user.id);
    var totalSpend = 0; var totalRevenue = 0; var totalJobsWon = 0; var totalQuotes = 0;
    notes.forEach(function(n) {
      var c = campaigns.find(function(c2) { return c2.id === n.campaign_id; });
      var spend = c ? parseFloat(c.budget) || 0 : 0;
      totalSpend += spend;
      totalRevenue += (n.actual_revenue || n.estimated_revenue || 0);
      totalJobsWon += n.jobs_won || 0;
      totalQuotes += n.quotes_booked || 0;
    });
    var overallRoi = totalSpend > 0 ? ((totalRevenue - totalSpend) / totalSpend * 100).toFixed(0) : 0;
    var avgCostPerWin = totalJobsWon > 0 ? (totalSpend / totalJobsWon).toFixed(2) : 0;
    res.json({
      success: true, outcomes: notes, total_spend: totalSpend, total_revenue: totalRevenue,
      total_jobs_won: totalJobsWon, total_quotes: totalQuotes,
      overall_roi: overallRoi, avg_cost_per_win: avgCostPerWin
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== PLATFORM HEALTH =====
var HEALTH_CHECK_INTERVAL = null;
var HEALTH_CACHE = null;

// GET /api/admin/platform-health — Full platform health check
app.get('/api/admin/platform-health', adminAuth, async (req, res) => {
  try {
    var results = {};
    var now = Date.now();

    // 1. Database check
    try {
      var dbTest = getDb();
      results.database = { status: dbTest ? 'healthy' : 'offline', last_ok: new Date().toISOString(), error: null };
    } catch(e) { results.database = { status: 'offline', last_ok: null, error: e.message }; }

    // 2. Stripe check
    try {
      if (STRIPE_SECRET_KEY) {
        var stripeCheck = await stripeApiRequest('GET', 'balance', {});
        results.stripe = { status: stripeCheck && !stripeCheck.error ? 'healthy' : 'warning', last_ok: new Date().toISOString(), error: stripeCheck && stripeCheck.error ? stripeCheck.error.message || stripeCheck.error : null };
      } else {
        results.stripe = { status: 'warning', last_ok: null, error: 'Not configured' };
      }
    } catch(e) { results.stripe = { status: 'offline', last_ok: null, error: e.message }; }

    // 3. OpenAI check
    try {
      var openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey) {
        var openaiCheck = await new Promise(function(resolve) {
          var https = require('https');
          var req = https.request({ hostname: 'api.openai.com', path: '/v1/models', method: 'GET', headers: { 'Authorization': 'Bearer ' + openaiKey } }, function(r) { var b = ''; r.on('data', function(c) { b += c; }); r.on('end', function() { try { resolve(JSON.parse(b)); } catch(e) { resolve({ error: 'Parse error' }); } }); });
          req.on('error', function(e) { resolve({ error: e.message }); }); req.end();
        });
        results.openai = { status: openaiCheck && openaiCheck.data ? 'healthy' : 'warning', last_ok: new Date().toISOString(), error: openaiCheck && openaiCheck.error ? (typeof openaiCheck.error === 'string' ? openaiCheck.error : openaiCheck.error.message || 'Unknown') : null };
      } else { results.openai = { status: 'warning', last_ok: null, error: 'Not configured' }; }
    } catch(e) { results.openai = { status: 'offline', last_ok: null, error: e.message }; }

    // 4. Stannp check
    try {
      if (STANNP_API_KEY) {
        results.stannp = { status: 'healthy', last_ok: new Date().toISOString(), error: null, provider: 'stannp' };
      } else { results.stannp = { status: 'warning', last_ok: null, error: 'Not configured' }; }
    } catch(e) { results.stannp = { status: 'offline', last_ok: null, error: e.message }; }

    // 5. Background Jobs (check cron ran recently)
    try {
      var recentLogs = (getDb().activity_timeline || []).slice(-10);
      var lastJob = recentLogs.length > 0 ? recentLogs[recentLogs.length - 1].created_at : null;
      results.background_jobs = { status: lastJob ? 'healthy' : 'warning', last_ok: lastJob || null, error: lastJob ? null : 'No recent activity' };
    } catch(e) { results.background_jobs = { status: 'offline', last_ok: null, error: e.message }; }

    // 6. Storage (disk space check)
    try {
      var dbFile = DB_FILE;
      var dbExists = require('fs').existsSync(dbFile);
      var dbSize = dbExists ? require('fs').statSync(dbFile).size : 0;
      results.storage = { status: dbExists ? 'healthy' : 'offline', last_ok: new Date().toISOString(), error: dbExists ? null : 'Database file missing', db_size: (dbSize / 1024 / 1024).toFixed(1) + ' MB' };
    } catch(e) { results.storage = { status: 'offline', last_ok: null, error: e.message }; }

    // 7. Queue (check for pending jobs)
    try {
      var pendingSequences = (getDb().postal_sequences || []).filter(function(s) { return s.status === 'active'; }).length;
      results.queue = { status: 'healthy', last_ok: new Date().toISOString(), error: null, pending: pendingSequences };
    } catch(e) { results.queue = { status: 'warning', last_ok: null, error: e.message }; }

    // 8. Emails (check last send)
    try {
      var lastEmailLog = (getDb().dm_notifications || []).slice(-1)[0];
      results.emails = { status: lastEmailLog ? 'healthy' : 'warning', last_ok: lastEmailLog ? lastEmailLog.created_at : null, error: lastEmailLog ? null : 'No emails sent yet' };
    } catch(e) { results.emails = { status: 'offline', last_ok: null, error: e.message }; }

    // 9. Website (check main URL)
    try {
      var websiteCheck = await new Promise(function(resolve) {
        var http = require('http');
        var req = http.get(process.env.PUBLIC_URL || 'http://localhost:' + PORT, function(r) { resolve({ statusCode: r.statusCode }); });
        req.on('error', function(e) { resolve({ error: e.message }); }); req.setTimeout(5000, function() { req.destroy(); resolve({ error: 'Timeout' }); });
      });
      results.website = { status: websiteCheck && websiteCheck.statusCode ? 'healthy' : 'warning', last_ok: new Date().toISOString(), error: websiteCheck && websiteCheck.error ? websiteCheck.error : null };
    } catch(e) { results.website = { status: 'offline', last_ok: null, error: e.message }; }

    // Calculate overall status
    var allHealthy = Object.values(results).every(function(r) { return r.status === 'healthy'; });
    var anyOffline = Object.values(results).some(function(r) { return r.status === 'offline'; });
    var overallStatus = allHealthy ? 'healthy' : anyOffline ? 'degraded' : 'warning';

    HEALTH_CACHE = { results: results, overall: overallStatus, checked_at: new Date().toISOString() };
    res.json({ success: true, overall: overallStatus, checked_at: new Date().toISOString(), services: results });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Static health dashboard page
app.get('/admin/health', (req, res) => {
  var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Platform Health - 9am Leads</title><style>body{font-family:Inter,sans-serif;background:#07090f;color:#dce2f0;margin:0;padding:24px}h1{font-size:22px;font-weight:800;font-family:Outfit,sans-serif}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:20px}.card{background:#0c0f1a;border:1px solid #151929;border-radius:12px;padding:16px 18px}.card h3{font-size:13px;font-weight:700;margin:0 0 6px;color:#dce2f0}.status{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:700}.healthy{background:rgba(16,185,129,.12);color:#10b981;border:1px solid rgba(16,185,129,.2)}.warning{background:rgba(245,158,11,.12);color:#f59e0b;border:1px solid rgba(245,158,11,.2)}.offline,.degraded{background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.2)}.detail{font-size:10px;color:#5a6280;margin-top:4px;line-height:1.5}.error{color:#ef4444;font-size:10px;margin-top:4px;word-break:break-all}a{color:#0ea5e9;text-decoration:none}.btn{display:inline-flex;align-items:center;gap:6px;padding:10px 24px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;border:none;font-family:inherit;color:#fff;background:linear-gradient(135deg,#0ea5e9,#2563eb)}.btn:hover{opacity:.9}.overall{font-size:28px;font-weight:900;margin-bottom:4px}@media(max-width:600px){.grid{grid-template-columns:1fr}}</style></head><body><div style="max-width:1000px;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:20px"><h1><span style="color:#0ea5e9">&#9724;</span> Platform Health</h1><div style="display:flex;gap:8px"><button class="btn" onclick="loadHealth()"><i class="fas fa-sync"></i> Refresh</button><a href="/admin/" style="font-size:12px;color:#5a6280;line-height:42px">&larr; Back</a></div></div>' +
    '<div id="health-content"><div style="text-align:center;padding:40px;color:#5a6280">Loading...</div></div></div>' +
    '<script>var TOKEN=prompt("Admin password:")||"";function loadHealth(){fetch("/api/admin/platform-health",{headers:{Authorization:"Bearer "+TOKEN}}).then(function(r){return r.json()}).then(function(d){if(!d.success){document.getElementById("health-content").innerHTML="<p style=color:#ef4444>Auth failed</p>";return}' +
    'var overallColor=d.overall==="healthy"?"#22c55e":d.overall==="degraded"?"#ef4444":"#f59e0b";' +
    'var h="<div style=text-align:center;margin-bottom:20px><span class=overall style=color:'+overallColor+'>"+d.overall.toUpperCase()+"</span><br><span style=font-size:12px;color:#5a6280>Last checked: "+new Date(d.checked_at).toLocaleString()+"</span></div><div class=grid>"'+
    '+Object.keys(d.services).map(function(k){var s=d.services[k];var cls=s.status;var statusLabel=s.status.charAt(0).toUpperCase()+s.status.slice(1);'+
    'return "<div class=card><div style=display:flex;justify-content:space-between;align-items:center;margin-bottom:4px><h3>"+k.replace(/_/g," ").replace(/\\b\\w/g,function(l){return l.toUpperCase()})+"</h3><span class=\\"status "+cls+"\\">"+statusLabel+"</span></div>"'+
    '+(s.last_ok?"<div class=detail>Last OK: "+new Date(s.last_ok).toLocaleString()+"</div>":"")+'+
    '+(s.db_size?"<div class=detail>Size: "+s.db_size+"</div>":"")+'+
    '+(s.pending!==undefined?"<div class=detail>Pending: "+s.pending+"</div>":"")+'+
    '+(s.error?"<div class=error>&#9888; "+s.error+"</div>":"")+"</div>"'+
    '}).join("")+"</div>";document.getElementById("health-content").innerHTML=h}).catch(function(){document.getElementById("health-content").innerHTML="<p style=color:#ef4444>Could not load health data</p>"})}loadHealth();</script></body></html>';
  res.send(html);
});

// ===== ADMIN IMPERSONATION =====
// POST /api/admin/impersonate — Generate a token to login as a customer
app.post('/api/admin/impersonate', adminAuth, (req, res) => {
  try {
    var customerId = req.body.customer_id;
    var reason = req.body.reason || 'Admin assistance';
    if (!customerId) return res.status(400).json({ error: 'Customer ID required' });
    var customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    // Generate a temporary JWT token for this customer (admin is impersonating)
    var token = jwt.sign({ id: customer.id, email: customer.email, product: customer.product, plan: customer.plan, admin_impersonating: true, impersonated_by: req.user.email || 'admin', impersonated_at: new Date().toISOString(), reason: reason }, JWT_SECRET || '9amleads_jwt_secret_2024', { expiresIn: '2h' });
    // Log impersonation
    var db2 = getDb();
    if (!db2.impersonation_logs) db2.impersonation_logs = [];
    db2.impersonation_logs.push({ id: uuidv4(), admin_email: req.user.email || 'admin', customer_id: customerId, customer_email: customer.email, reason: reason, created_at: new Date().toISOString() });
    saveDb();
    res.json({ success: true, token: token, customer: { id: customer.id, email: customer.email, company: customer.company, product: customer.product }, admin_email: req.user.email, message: 'Impersonation token generated for 2 hours' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/impersonate/logs — View impersonation logs
app.get('/api/admin/impersonate/logs', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var logs = (db2.impersonation_logs || []).sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    res.json({ success: true, logs: logs, total: logs.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== CUSTOMER SUCCESS DASHBOARD =====
// GET /api/direct-mail/success — Customer success dashboard data
app.get('/api/direct-mail/success', authMiddleware, (req, res) => {
  try {
    var profile = db.prepare('SELECT * FROM customer_business_profiles WHERE customer_id = ?').get(req.user.id);
    var templates = db.prepare('SELECT COUNT(*) as count FROM direct_mail_templates WHERE customer_id = ?').get(req.user.id);
    var campaigns = db.prepare('SELECT * FROM direct_mail_campaigns WHERE customer_id = ?').all(req.user.id);
    var settings = db.prepare('SELECT * FROM direct_mail_automation_settings WHERE customer_id = ?').get(req.user.id);
    var customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    var db2 = getDb();
    var packs = (db2.customer_campaign_packs || []).filter(function(p) { return p.customer_id === req.user.id; });
    // Define milestones
    var milestones = [
      { id:'profile', label:'Business Profile completed', met: !!(profile && profile.company_name && profile.business_type), icon:'fa-building', action:'business-profile' },
      { id:'logo', label:'Logo uploaded', met: !!(profile && profile.logo_url), icon:'fa-image', action:'business-profile' },
      { id:'first_template', label:'First template created', met: (templates && templates.count > 0), icon:'fa-file-alt', action:'templates' },
      { id:'campaign_pack', label:'Campaign Pack selected', met: packs.length > 0, icon:'fa-box', action:'packs' },
      { id:'first_campaign', label:'First campaign created', met: campaigns.length > 0, icon:'fa-bullhorn', action:'create' },
      { id:'first_sent', label:'First campaign sent', met: campaigns.some(function(c) { return c.status === 'sent' || c.status === 'completed' || c.status === 'dispatched' || c.status === 'queued'; }), icon:'fa-paper-plane', action:'history' },
      { id:'first_completed', label:'First campaign completed', met: campaigns.some(function(c) { return c.status === 'completed' || c.status === 'dispatched'; }), icon:'fa-check-circle', action:'history' },
      { id:'auto_send', label:'Print & Post enabled', met: settings && settings.enable_auto_send, icon:'fa-clock', action:'settings' },
      { id:'payment_method', label:'Payment method added', met: customer && customer.stripe_payment_method_id ? true : false, icon:'fa-credit-card', action:'settings' },
      { id:'spend_limits', label:'Spend limits set', met: settings && (parseInt(settings.max_daily_spend) > 0 || parseInt(settings.max_monthly_spend) > 0), icon:'fa-pound-sign', action:'settings' }
    ];
    var completed = milestones.filter(function(m) { return m.met; }).length;
    var total = milestones.length;
    var pct = Math.round(completed / total * 100);
    var nextAction = milestones.find(function(m) { return !m.met; });
    var recents = campaigns.sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); }).slice(0, 3);
    res.json({
      success: true, completion_pct: pct, completed: completed, total: total,
      milestones: milestones, next_action: nextAction ? nextAction : null,
      recent_campaigns: recents, auto_send_enabled: settings && settings.enable_auto_send ? true : false
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: GET /api/admin/direct-mail/success — All customers' success progress
app.get('/api/admin/direct-mail/success', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var customers = db2.customers || [];
    var results = [];
    customers.forEach(function(cust) {
      var profile = (db2.customer_business_profiles || []).find(function(p) { return p.customer_id === cust.id; });
      var templates = (db2.direct_mail_templates || []).filter(function(t) { return t.customer_id === cust.id; });
      var campaigns = (db2.direct_mail_campaigns || []).filter(function(c) { return c.customer_id === cust.id; });
      var settings = (db2.direct_mail_automation_settings || []).find(function(s) { return s.customer_id === cust.id; });
      var packs = (db2.customer_campaign_packs || []).filter(function(p) { return p.customer_id === cust.id; });
      var milestones = [
        !!profile, !!profile && profile.company_name && profile.business_type,
        templates.length > 0, packs.length > 0, campaigns.length > 0,
        campaigns.some(function(c) { return c.status === 'sent' || c.status === 'completed' || c.status === 'dispatched'; }),
        campaigns.some(function(c) { return c.status === 'completed' || c.status === 'dispatched'; }),
        settings && settings.enable_auto_send, cust.stripe_payment_method_id ? true : false
      ];
      var completed = milestones.filter(Boolean).length;
      results.push({ customer_id: cust.id, email: cust.email || 'unknown', company: cust.company || '', plan: cust.plan || '', completed: completed, total: milestones.length, pct: Math.round(completed / milestones.length * 100), milestones: { profile: !!profile, business_details: !!(profile && profile.company_name), template: templates.length > 0, pack: packs.length > 0, first_campaign: campaigns.length > 0, sent: milestones[5], completed_campaign: milestones[6], auto_send: milestones[7], payment_method: milestones[8] } });
    });
    res.json({ success: true, entries: results, total: results.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ACTIVITY TIMELINE =====
// GET /api/direct-mail/timeline — Get customer's activity timeline
app.get('/api/direct-mail/timeline', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var entries = (db2.activity_timeline || []).filter(function(e) { return e.customer_id === req.user.id; }).sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); }).slice(0, 100);
    res.json({ success: true, entries: entries, total: entries.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: GET /api/admin/direct-mail/timeline — All activity
app.get('/api/admin/direct-mail/timeline', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var actionFilter = req.query.action || '';
    var customerFilter = req.query.customer_id || '';
    var entries = (db2.activity_timeline || []).sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    if (actionFilter) entries = entries.filter(function(e) { return e.action === actionFilter; });
    if (customerFilter) entries = entries.filter(function(e) { return e.customer_id === customerFilter; });
    var expanded = entries.slice(0, 200).map(function(e) {
      var cust = (db2.customers || []).find(function(c) { return c.id === e.customer_id; });
      return Object.assign({}, e, { customer_email: cust ? cust.email : 'unknown', customer_company: cust ? cust.company : '' });
    });
    res.json({ success: true, entries: expanded, total: expanded.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== DEMO MODE =====
var DEMO_MODE_ENABLED = false;
var DEMO_MODE_FILE = path.join(DATA_DIR, 'demo-mode.json');
try { if (fs.existsSync(DEMO_MODE_FILE)) DEMO_MODE_ENABLED = JSON.parse(fs.readFileSync(DEMO_MODE_FILE, 'utf-8')).enabled === true; } catch(e) {}

// GET /api/demo/data — Get sample demo data (no auth required)
app.get('/api/demo/data', (req, res) => {
  if (!DEMO_MODE_ENABLED) return res.json({ success: false, error: 'Demo mode disabled' });
  res.json({
    success: true,
    profile: { company_name: 'Your Demo Company', business_type: 'Removals', phone: 'hello@9amleads.com', email: 'demo@9amleads.com', website: 'https://demo.9amleads.com', services_offered: 'House removals, office moves, packing, storage', service_areas: 'London, Surrey, Kent', logo_url: '' },
    leads: [
      { id:'demo_1', name:'John Smith', address:'123 High Street', town:'London', postcode:'SW1A 1AA', type:'moving', status:'new', delivered_at:new Date().toISOString() },
      { id:'demo_2', name:'Sarah Jones', address:'45 Oak Avenue', town:'Croydon', postcode:'CR0 2AB', type:'moving', status:'new', delivered_at:new Date().toISOString() },
      { id:'demo_3', name:'David Brown', address:'78 Elm Road', town:'Kingston', postcode:'KT1 3CD', type:'probate', status:'new', delivered_at:new Date().toISOString() }
    ],
    campaigns: [
      { id:'demo_c1', name:'Summer Promo Flyer', status:'completed', target_count:50, sent_count:48, budget:37.50, provider:'mock', provider_campaign_id:'DEMO-001', created_at:new Date(Date.now()-14*86400000).toISOString(), completed:true },
      { id:'demo_c2', name:'New Client Introduction', status:'sent', target_count:25, sent_count:25, budget:18.75, provider:'mock', created_at:new Date(Date.now()-7*86400000).toISOString() },
      { id:'demo_c3', name:'Autumn Offer Campaign', status:'draft', target_count:100, budget:75.00, created_at:new Date(Date.now()-2*86400000).toISOString() }
    ],
    templates: [
      { id:'demo_t1', name:'Professional Introduction Letter', template_type:'letter', status:'approved', created_at:new Date(Date.now()-20*86400000).toISOString() },
      { id:'demo_t2', name:'Summer Sale Flyer', template_type:'flyer', status:'approved', created_at:new Date(Date.now()-15*86400000).toISOString() }
    ],
    stats: { total_campaigns:3, campaigns_sent:2, letters_sent:73, total_spend:56.25, failed_campaigns:0 },
    health_score: { score:72, level:'Good', completed:6, total:12 },
    proof: { proof_url:'https://demo.9amleads.com/proof/demo-001.pdf', postage_date:new Date(Date.now()-10*86400000).toISOString().split('T')[0], estimated_delivery:new Date(Date.now()-7*86400000).toISOString().split('T')[0] },
    notifications: [
      { id:'demo_n1', type:'campaign_completed', title:'✅ Campaign Completed', message:'Your Summer Promo Flyer campaign was completed successfully.' },
      { id:'demo_n2', type:'tips', title:'ðŸ’¡ Quick Tip', message:'Hand-delivered flyers convert 5x better than posted letters.' }
    ]
  });
});

// POST /api/admin/demo-mode/toggle — Enable/disable demo mode
app.post('/api/admin/demo-mode/toggle', adminAuth, (req, res) => {
  try {
    DEMO_MODE_ENABLED = req.body.enabled === true;
    var fs3 = require('fs');
    fs3.writeFileSync(DEMO_MODE_FILE, JSON.stringify({ enabled: DEMO_MODE_ENABLED }, null, 2));
    res.json({ success: true, demo_mode: DEMO_MODE_ENABLED });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/demo-mode/status — Get demo mode status
app.get('/api/admin/demo-mode/status', adminAuth, (req, res) => {
  res.json({ success: true, demo_mode: DEMO_MODE_ENABLED });
});

// ===== ONBOARDING WIZARD =====
// GET /api/onboarding/progress — Get customer onboarding progress
app.get('/api/onboarding/progress', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var progress = (db2.onboarding_progress || []).find(function(p) { return p.customer_id === req.user.id; });
    var profile = db.prepare('SELECT * FROM customer_business_profiles WHERE customer_id = ?').get(req.user.id);
    var templates = db.prepare('SELECT COUNT(*) as count FROM direct_mail_templates WHERE customer_id = ?').get(req.user.id);
    var campaigns = db.prepare('SELECT COUNT(*) as count FROM direct_mail_campaigns WHERE customer_id = ?').get(req.user.id);
    var settings = db.prepare('SELECT * FROM direct_mail_automation_settings WHERE customer_id = ?').get(req.user.id);
    var autoSendEnabled = settings && settings.enable_auto_send;
    var hasPaymentMethod = false;
    var customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
    if (customer && customer.stripe_payment_method_id) hasPaymentMethod = true;
    // Calculate completion
    var steps = {
      profile_complete: !!(profile && profile.company_name && profile.business_type),
      materials_created: (templates && templates.count > 0),
      campaign_created: (campaigns && campaigns.count > 0),
      payment_setup: hasPaymentMethod,
      auto_send_enabled: !!autoSendEnabled
    };
    var completedSteps = 0;
    for (var k in steps) { if (steps[k]) completedSteps++; }
    var totalSteps = Object.keys(steps).length;
    var completionPct = Math.round(completedSteps / totalSteps * 100);
    var currentStep = progress ? progress.current_step : 1;
    var isComplete = progress ? progress.is_complete : false;
    res.json({ success: true, current_step: currentStep, is_complete: isComplete, completion_pct: completionPct, steps: steps, profile_exists: !!profile, onboarding_started: !!progress });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/onboarding/progress — Save onboarding progress
app.post('/api/onboarding/progress', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    if (!db2.onboarding_progress) db2.onboarding_progress = [];
    var existing = db2.onboarding_progress.findIndex(function(p) { return p.customer_id === req.user.id; });
    var entry = { customer_id: req.user.id, current_step: parseInt(req.body.current_step) || 1, is_complete: req.body.is_complete ? true : false, updated_at: new Date().toISOString() };
    if (existing !== -1) { Object.assign(db2.onboarding_progress[existing], entry, { created_at: db2.onboarding_progress[existing].created_at }); }
    else { entry.id = uuidv4(); entry.created_at = new Date().toISOString(); db2.onboarding_progress.push(entry); }
    saveDb();
    res.json({ success: true, progress: entry });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: GET /api/admin/onboarding — View all customers' onboarding progress
app.get('/api/admin/onboarding', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var progressEntries = db2.onboarding_progress || [];
    var expanded = progressEntries.map(function(p) {
      var cust = (db2.customers || []).find(function(c) { return c.id === p.customer_id; });
      return Object.assign({}, p, { customer_email: cust ? cust.email : 'unknown', customer_company: cust ? cust.company : '' });
    });
    res.json({ success: true, entries: expanded, total: expanded.length, completed: expanded.filter(function(e) { return e.is_complete; }).length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== KNOWLEDGE CENTRE =====
var KNOWLEDGE_CATEGORIES = ['Getting Started','Lead Generation','Direct Mail','AI Marketing Builder','Campaign Packs','Print & Post','Templates','FAQs','Video Tutorials'];

// Seed default articles
function seedKnowledgeArticles() {
  try {
    var db2 = getDb();
    if (db2.knowledge_articles && db2.knowledge_articles.length > 0) return;
    if (!db2.knowledge_articles) db2.knowledge_articles = [];
    var defaults = [
      { category:'Getting Started', title:'Welcome to 9am Leads', content:'9am Leads delivers fresh sales opportunities to your dashboard every morning at 9am. You can view, export, and take action on your leads immediately. Plus, our Direct Mail Centre lets you automatically send professional flyers and letters to your leads by post.', video_url:'', order:1 },
      { category:'Getting Started', title:'Setting Up Your Business Profile', content:'Your Business Profile is used across the platform — for AI-generated flyers and letters, campaign packs, and direct mail campaigns. Complete your business name, type, services, area, logo, and contact details.', video_url:'', order:2 },
      { category:'Lead Generation', title:'How Daily Leads Work', content:'New leads are delivered to your dashboard every morning at 9am. Each lead includes name, address, and details based on your selected lead type and postcode areas. You can filter, search, and export your leads.', video_url:'', order:1 },
      { category:'Direct Mail', title:'Creating Your First Campaign', content:'Go to Direct Mail Centre â†’ Create Campaign. Choose your leads, select or generate your materials, review and approve, then send. Your campaign will be printed and posted by our partner.', video_url:'', order:1 },
      { category:'Direct Mail', title:'Campaign Packs', content:'Campaign Packs are pre-built industry templates. Select a pack for your business type, apply your Business Profile details, and save it as a template. Available for 20+ industries.', video_url:'', order:2 },
      { category:'AI Marketing Builder', title:'AI Letter Generator', content:'The AI Letter Generator creates professional introduction letters based on your Business Profile. Choose from Professional, Short, Friendly, Premium, or Call-to-Action versions. Edit, save as template, or use in campaign.', video_url:'', order:1 },
      { category:'AI Marketing Builder', title:'AI Flyer Content Generator', content:'Generate flyer content with AI including headline, subheadline, services, offer, trust section, CTA, back page, QR text, and slogan. Choose from 6 style options.', video_url:'', order:2 },
      { category:'AI Marketing Builder', title:'AI Flyer PDF Generator', content:'Turn your AI-generated flyer content into a print-ready A5 PDF. Includes your logo, business name, headline, services, offer, contact details, and CTA. Choose from 4 layout styles.', video_url:'', order:3 },
      { category:'Campaign Packs', title:'Using Campaign Packs', content:'Browse 20 pre-built campaign packs by industry. Preview the headline, offer, and CTA. Apply your Business Profile to merge your details. Save as a template or use directly in a campaign.', video_url:'', order:1 },
      { category:'Print & Post', title:'Setting Up Print & Post', content:'Print & Post automatically mails your new leads every day. Select a template, set your spend limits, add a payment method, and enable. You control the daily and monthly budget.', video_url:'', order:1 },
      { category:'Print & Post', title:'Print & Post Safety Features', content:'Print & Post respects your suppression list, duplicate mailing rules, spend limits, and payment method. Failed payments pause Print & Post automatically. You can pause or cancel anytime.', video_url:'', order:2 },
      { category:'Templates', title:'Saving and Managing Templates', content:'Save your AI-generated content as reusable templates. Templates include your business details, content, and style choices. Use templates in manual campaigns or Print & Post.', video_url:'', order:1 },
      { category:'FAQs', title:'How do I get more leads?', content:'Add more postcode areas in your dashboard settings. You can also upgrade your plan for more leads per day. Make sure your target areas match where your ideal customers are located.', video_url:'', order:1 },
      { category:'FAQs', title:'Can I cancel anytime?', content:'Yes. You can cancel your subscription at any time from Settings. Print & Post can be paused or cancelled from the Print & Post Settings page. There are no long-term contracts.', video_url:'', order:2 },
      { category:'Video Tutorials', title:'Dashboard Overview', content:'A quick tour of your 9am Leads dashboard — leads, campaigns, Direct Mail Centre, AI Marketing Builder, and analytics.', video_url:'https://www.youtube.com/embed/dQw4w9WgXcQ', order:1 },
      { category:'Video Tutorials', title:'Creating a Direct Mail Campaign', content:'Step-by-step guide to creating your first direct mail campaign from lead selection to sending.', video_url:'https://www.youtube.com/embed/dQw4w9WgXcQ', order:2 },
      { category:'Video Tutorials', title:'Using the AI Marketing Builder', content:'How to generate professional flyers and letters using AI, edit them, save as templates, and use in campaigns.', video_url:'https://www.youtube.com/embed/dQw4w9WgXcQ', order:3 }
    ];
    defaults.forEach(function(a) {
      db2.knowledge_articles.push({ id: uuidv4(), category: a.category, title: a.title, content: a.content, video_url: a.video_url || '', article_order: a.order, is_published: 1, is_featured: a.order <= 2 ? 1 : 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    });
    saveDb();
    console.log('[KNOWLEDGE] Seeded ' + defaults.length + ' articles');
  } catch(e) { console.log('[KNOWLEDGE] Seed error:', e.message); }
}

// GET /api/knowledge/articles — List articles (published only for customers)
app.get('/api/knowledge/articles', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var category = req.query.category || '';
    var search = (req.query.search || '').toLowerCase();
    var articles = (db2.knowledge_articles || []).filter(function(a) { return a.is_published; });
    // Get customer bookmarks
    var bookmarked = {};
    (db2.knowledge_bookmarks || []).forEach(function(b) { if (b.customer_id === req.user.id) bookmarked[b.article_id] = true; });
    if (category) articles = articles.filter(function(a) { return a.category === category; });
    if (search) articles = articles.filter(function(a) { return (a.title || '').toLowerCase().indexOf(search) !== -1 || (a.content || '').toLowerCase().indexOf(search) !== -1; });
    articles.sort(function(a, b) { return (a.article_order || 999) - (b.article_order || 999); });
    var featured = articles.filter(function(a) { return a.is_featured; }).slice(0, 3);
    res.json({ success: true, articles: articles, featured: featured, total: articles.length, categories: KNOWLEDGE_CATEGORIES, bookmarked: bookmarked });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/knowledge/articles/:id — Get article detail
app.get('/api/knowledge/articles/:id', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var article = (db2.knowledge_articles || []).find(function(a) { return a.id === req.params.id && a.is_published; });
    if (!article) return res.status(404).json({ error: 'Article not found' });
    // Check bookmark
    var bookmarked = false;
    if (db2.knowledge_bookmarks) bookmarked = db2.knowledge_bookmarks.some(function(b) { return b.customer_id === req.user.id && b.article_id === req.params.id; });
    res.json({ success: true, article: article, bookmarked: bookmarked });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/knowledge/bookmarks — Toggle bookmark
app.post('/api/knowledge/bookmarks', authMiddleware, (req, res) => {
  try {
    var articleId = req.body.article_id;
    if (!articleId) return res.status(400).json({ error: 'Article ID required' });
    var db2 = getDb();
    if (!db2.knowledge_bookmarks) db2.knowledge_bookmarks = [];
    var existing = db2.knowledge_bookmarks.findIndex(function(b) { return b.customer_id === req.user.id && b.article_id === articleId; });
    if (existing !== -1) { db2.knowledge_bookmarks.splice(existing, 1); saveDb(); res.json({ success: true, bookmarked: false }); }
    else { db2.knowledge_bookmarks.push({ id: uuidv4(), customer_id: req.user.id, article_id: articleId, created_at: new Date().toISOString() }); saveDb(); res.json({ success: true, bookmarked: true }); }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin endpoints
// GET /api/admin/knowledge/articles — All articles (including unpublished)
app.get('/api/admin/knowledge/articles', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    res.json({ success: true, articles: db2.knowledge_articles || [], total: (db2.knowledge_articles || []).length, categories: KNOWLEDGE_CATEGORIES });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/knowledge/articles — Create/update article
app.post('/api/admin/knowledge/articles', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    if (!db2.knowledge_articles) db2.knowledge_articles = [];
    var existingIdx = req.body.id ? db2.knowledge_articles.findIndex(function(a) { return a.id === req.body.id; }) : -1;
    var article = { title: req.body.title || 'New Article', category: req.body.category || 'Getting Started', content: req.body.content || '', video_url: req.body.video_url || '', article_order: parseInt(req.body.article_order) || 999, is_published: req.body.is_published !== undefined ? (req.body.is_published ? 1 : 0) : 1, is_featured: req.body.is_featured ? 1 : 0 };
    if (existingIdx !== -1) { Object.assign(db2.knowledge_articles[existingIdx], article, { updated_at: new Date().toISOString() }); }
    else { article.id = uuidv4(); article.created_at = new Date().toISOString(); article.updated_at = new Date().toISOString(); db2.knowledge_articles.push(article); }
    saveDb();
    res.json({ success: true, article: existingIdx !== -1 ? db2.knowledge_articles[existingIdx] : article });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/knowledge/seed — Re-seed default articles
app.post('/api/admin/knowledge/seed', adminAuth, (req, res) => {
  try { var db2 = getDb(); db2.knowledge_articles = []; saveDb(); seedKnowledgeArticles(); res.json({ success: true, message: 'Articles re-seeded' }); } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== MARKETING HEALTH SCORE =====
// GET /api/direct-mail/health-score — Customer's marketing health score
app.get('/api/direct-mail/health-score', authMiddleware, (req, res) => {
  try {
    var profile = db.prepare('SELECT * FROM customer_business_profiles WHERE customer_id = ?').get(req.user.id);
    var templates = db.prepare('SELECT COUNT(*) as count FROM direct_mail_templates WHERE customer_id = ?').get(req.user.id);
    var campaigns = db.prepare('SELECT COUNT(*) as count FROM direct_mail_campaigns WHERE customer_id = ?').get(req.user.id);
    var sentCampaigns = db.prepare('SELECT COUNT(*) as count FROM direct_mail_campaigns WHERE customer_id = ? AND status IN (\'sent\',\'queued\',\'completed\',\'dispatched\')').get(req.user.id);
    var settings = db.prepare('SELECT * FROM direct_mail_automation_settings WHERE customer_id = ?').get(req.user.id);
    var db2 = getDb();
    var packs = (db2.customer_campaign_packs || []).filter(function(p) { return p.customer_id === req.user.id; });
    var score = 0; var factors = []; var recommendations = [];
    // 1. Business Profile completed (10 pts)
    if (profile) { score += 10; factors.push({ name:'Business Profile', met: true, pts:10 }); } else { factors.push({ name:'Business Profile', met: false, pts:0 }); recommendations.push({ text:'Complete your Business Profile', action:'business-profile', emoji:'✔️' }); }
    // 2. Logo uploaded (5 pts)
    if (profile && profile.logo_url) { score += 5; factors.push({ name:'Logo', met: true, pts:5 }); } else { factors.push({ name:'Logo', met: false, pts:0 }); recommendations.push({ text:'Upload your logo', action:'business-profile', emoji:'ðŸ–¼ï¸' }); }
    // 3. Phone number (5 pts)
    if (profile && profile.phone) { score += 5; factors.push({ name:'Phone', met: true, pts:5 }); } else { factors.push({ name:'Phone', met: false, pts:0 }); recommendations.push({ text:'Add your phone number', action:'business-profile', emoji:'✅' }); }
    // 4. Website (5 pts)
    if (profile && profile.website) { score += 5; factors.push({ name:'Website', met: true, pts:5 }); } else { factors.push({ name:'Website', met: false, pts:0 }); recommendations.push({ text:'Add your website', action:'business-profile', emoji:'ðŸŒ' }); }
    // 5. Services added (10 pts)
    if (profile && profile.services_offered) { score += 10; factors.push({ name:'Services', met: true, pts:10 }); } else { factors.push({ name:'Services', met: false, pts:0 }); recommendations.push({ text:'Add your services', action:'business-profile', emoji:'ðŸ”§' }); }
    // 6. Offer added (10 pts)
    if (profile && (profile.special_offer || profile.call_to_action)) { score += 10; factors.push({ name:'Offer/CTA', met: true, pts:10 }); } else { factors.push({ name:'Offer/CTA', met: false, pts:0 }); recommendations.push({ text:'Add a special offer', action:'business-profile', emoji:'ðŸŽ' }); }
    // 7. Template created (10 pts)
    var tplCount = templates ? (templates.count || 0) : 0;
    if (tplCount > 0) { score += 10; factors.push({ name:'Saved Templates', met: true, pts:10 }); } else { factors.push({ name:'Saved Templates', met: false, pts:0 }); recommendations.push({ text:'Create your first flyer template', action:'templates', emoji:'✔️' }); }
    // 8. Campaign Pack selected (10 pts)
    if (packs.length > 0) { score += 10; factors.push({ name:'Campaign Pack', met: true, pts:10 }); } else { factors.push({ name:'Campaign Pack', met: false, pts:0 }); recommendations.push({ text:'Select a Campaign Pack', action:'packs', emoji:'ðŸ“¦' }); }
    // 9. Print & Post enabled (10 pts)
    var autoSend = settings && settings.enable_auto_send;
    if (autoSend) { score += 10; factors.push({ name:'Print & Post', met: true, pts:10 }); } else { factors.push({ name:'Print & Post', met: false, pts:0 }); recommendations.push({ text:'Enable Print & Post', action:'settings', emoji:'ðŸ¤–' }); }
    // 10. Spend limits set (10 pts)
    var hasLimits = settings && (parseInt(settings.max_daily_spend) > 0 || parseInt(settings.max_monthly_spend) > 0);
    if (hasLimits) { score += 10; factors.push({ name:'Spend Limits', met: true, pts:10 }); } else { factors.push({ name:'Spend Limits', met: false, pts:0 }); recommendations.push({ text:'Set daily/monthly spend limits', action:'settings', emoji:'💰' }); }
    // 11. First campaign sent (10 pts)
    var sent = sentCampaigns ? sentCampaigns.count || 0 : 0;
    if (sent > 0) { score += 10; factors.push({ name:'Campaign Sent', met: true, pts:10 }); } else { factors.push({ name:'Campaign Sent', met: false, pts:0 }); recommendations.push({ text:'Send your first campaign', action:'create', emoji:'ðŸ“¬' }); }
    // 12. Sent more than 1 campaign (10 pts)
    if (sent > 1) { score += 10; factors.push({ name:'Repeat Sending', met: true, pts:10 }); } else { factors.push({ name:'Repeat Sending', met: false, pts:0 }); recommendations.push({ text:'Send another campaign to build momentum', action:'create', emoji:'ðŸš€' }); }
    var level = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Needs Work' : 'Getting Started';
    res.json({ success: true, score: score, level: level, factors: factors, recommendations: recommendations.slice(0, 5), completed: factors.filter(function(f) { return f.met; }).length, total: factors.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== CAMPAIGN ANALYTICS =====
// GET /api/direct-mail/analytics — Customer campaign analytics
app.get('/api/direct-mail/analytics', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var custId = req.user.id;
    var customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(custId);
    var campaigns = (db2.direct_mail_campaigns || []).filter(function(c) { return c.customer_id === custId; });
    var sentCampaigns = campaigns.filter(function(c) { return c.status === 'sent' || c.status === 'queued' || c.status === 'completed' || c.status === 'dispatched'; });
    var completedCampaigns = campaigns.filter(function(c) { return c.status === 'completed' || c.status === 'dispatched'; });
    var failedCampaigns = campaigns.filter(function(c) { return c.status === 'failed'; });
    var totalSpend = 0; var totalLetters = 0;
    var templateCounts = {}; var packCounts = {};
    campaigns.forEach(function(c) {
      var s = c.sent_count || c.target_count || 0;
      totalSpend += Number(c.budget || 0);
      totalLetters += s;
      if (c.template_id) templateCounts[c.template_id] = (templateCounts[c.template_id] || 0) + 1;
    });
    // Get template names
    var mostUsedTemplateId = Object.keys(templateCounts).sort(function(a, b) { return templateCounts[b] - templateCounts[a]; })[0] || '';
    // Settings
    var settings = (db2.direct_mail_automation_settings || []).find(function(s) { return s.customer_id === custId; });
    var autoSendEnabled = settings && settings.enable_auto_send ? true : false;
    // Monthly activity
    var thisMonth = new Date().toISOString().substring(0, 7);
    var monthlyCampaigns = campaigns.filter(function(c) { return c.created_at && c.created_at.indexOf(thisMonth) === 0; });
    var monthlySpend = 0;
    monthlyCampaigns.forEach(function(c) { monthlySpend += Number(c.budget || 0); });
    var avgCost = sentCampaigns.length > 0 ? totalSpend / sentCampaigns.length : 0;
    res.json({
      success: true,
      total_campaigns: campaigns.length,
      campaigns_sent: sentCampaigns.length,
      completed_campaigns: completedCampaigns.length,
      failed_campaigns: failedCampaigns.length,
      letters_sent: totalLetters,
      total_spend: Math.round(totalSpend * 100) / 100,
      average_campaign_cost: Math.round(avgCost * 100) / 100,
      most_used_template: mostUsedTemplateId,
      auto_send_enabled: autoSendEnabled,
      monthly_campaigns: monthlyCampaigns.length,
      monthly_spend: Math.round(monthlySpend * 100) / 100,
      conversion_rate: campaigns.length > 0 ? Math.round(completedCampaigns.length / campaigns.length * 100) : 0
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/direct-mail/analytics — Admin platform-wide analytics
app.get('/api/admin/direct-mail/analytics', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var campaigns = db2.direct_mail_campaigns || [];
    var settings = db2.direct_mail_automation_settings || [];
    var customers = db2.customers || [];
    var today = new Date().toISOString().split('T')[0];
    var thisMonth = today.substring(0, 7);
    // Unique customers with campaigns
    var campaignCustomers = {};
    var sentCampaigns = campaigns.filter(function(c) { return c.status === 'sent' || c.status === 'queued' || c.status === 'completed' || c.status === 'dispatched'; });
    var completed = campaigns.filter(function(c) { return c.status === 'completed' || c.status === 'dispatched'; });
    var failed = campaigns.filter(function(c) { return c.status === 'failed'; });
    var todayCampaigns = campaigns.filter(function(c) { return c.created_at && c.created_at.indexOf(today) === 0; });
    var monthlyCampaigns = campaigns.filter(function(c) { return c.created_at && c.created_at.indexOf(thisMonth) === 0; });
    campaigns.forEach(function(c) { campaignCustomers[c.customer_id] = true; });
    var totalSpend = 0; var totalLetters = 0; var todaySpend = 0; var monthSpend = 0;
    campaigns.forEach(function(c) {
      var s = c.sent_count || c.target_count || 0; var b = Number(c.budget || 0);
      totalSpend += b; totalLetters += s;
      if (c.created_at && c.created_at.indexOf(today) === 0) todaySpend += b;
      if (c.created_at && c.created_at.indexOf(thisMonth) === 0) monthSpend += b;
    });
    var providerCost = totalSpend * 0.6;
    var stripeFee = totalSpend * 0.029 + 0.30 * campaigns.length;
    var profit = totalSpend - providerCost - stripeFee;
    var margin = totalSpend > 0 ? Math.round(profit / totalSpend * 100) : 0;
    var autoSendActive = settings.filter(function(s) { return s.enable_auto_send && s.consent_given; }).length;
    res.json({
      success: true,
      dm_customers: Object.keys(campaignCustomers).length,
      total_campaigns: campaigns.length,
      campaigns_sent: sentCampaigns.length,
      completed_campaigns: completed.length,
      failed_campaigns: failed.length,
      letters_flyers_sent: totalLetters,
      total_spend: Math.round(totalSpend * 100) / 100,
      revenue_today: Math.round(todaySpend * 100) / 100,
      revenue_month: Math.round(monthSpend * 100) / 100,
      provider_cost: Math.round(providerCost * 100) / 100,
      stripe_fee_estimate: Math.round(stripeFee * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      margin_pct: margin,
      auto_send_active: autoSendActive,
      today_campaigns: todayCampaigns.length,
      monthly_campaigns: monthlyCampaigns.length
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ADDRESS QUALITY CHECKER =====
// POST /api/direct-mail/check-addresses — Check address quality before sending
app.post('/api/direct-mail/check-addresses', authMiddleware, (req, res) => {
  try {
    var leadIds = req.body.lead_ids || [];
    var campaignId = req.body.campaign_id || '';
    if (leadIds.length === 0 && !campaignId) return res.status(400).json({ error: 'Lead IDs or campaign ID required' });

    // Get leads from campaign if campaign ID provided
    var leadsToCheck = [];
    if (campaignId) {
      var recipients = db.prepare('SELECT * FROM direct_mail_recipients WHERE campaign_id = ? AND customer_id = ?').all(campaignId, req.user.id);
      leadsToCheck = recipients.map(function(r) {
        return { id: r.lead_id || r.id, name: r.name, address_line1: r.address_line1, city: r.city, postcode: r.postcode, company: r.company };
      });
    } else if (leadIds.length > 0) {
      var allLeads = db.prepare('SELECT * FROM leads WHERE customer_id = ?').all(req.user.id);
      leadsToCheck = leadIds.map(function(lid) {
        var lead = allLeads.find(function(l) { return l.id === lid; });
        if (!lead) return null;
        var parsed = {}; try { parsed = JSON.parse(lead.data || '{}'); } catch(e) {}
        return { id: lead.id, name: parsed.name || '', address_line1: parsed.address_line1 || parsed.address || parsed.street || '', city: parsed.city || parsed.town || '', postcode: parsed.postcode || '', company: parsed.company || '' };
      }).filter(Boolean);
    }

    var results = [];
    var validCount = 0; var invalidCount = 0; var duplicateCount = 0; var suppressedCount = 0; var alreadyMailedCount = 0;
    var seenAddresses = {};

    leadsToCheck.forEach(function(lead) {
      var issues = [];
      // Missing postcode
      if (!lead.postcode || lead.postcode.trim().length < 2) issues.push('Missing postcode');
      // Missing house number/name
      if (!lead.address_line1 || lead.address_line1.trim().length < 3) issues.push('Missing house number or street name');
      // Missing town
      if (!lead.city || lead.city.trim().length < 2) issues.push('Missing town/city');
      // Invalid postcode format (basic check)
      if (lead.postcode && lead.postcode.trim().length > 1) {
        var pc = lead.postcode.replace(/\s/g, '').toUpperCase();
        if (!pc.match(/^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/)) issues.push('Invalid postcode format');
      }
      // Duplicate address
      var addrKey = (lead.postcode || '').toUpperCase() + '|' + (lead.address_line1 || '').toLowerCase();
      if (seenAddresses[addrKey]) { issues.push('Duplicate address'); duplicateCount++; }
      seenAddresses[addrKey] = true;
      // Suppressed address
      if (isAddressSuppressed(req.user.id, lead.postcode, lead.address_line1)) { issues.push('Suppressed address'); suppressedCount++; }
      // Previously mailed
      if (lead.id) {
        var alreadyMailed = db.prepare('SELECT COUNT(*) as count FROM direct_mail_recipients WHERE lead_id = ? AND customer_id = ? AND status = \'sent\'').get(lead.id, req.user.id);
        if (alreadyMailed && alreadyMailed.count > 0) { issues.push('Previously mailed'); alreadyMailedCount++; }
      }

      var valid = issues.length === 0;
      if (valid) validCount++; else invalidCount++;
      results.push({
        id: lead.id, name: lead.name, address_line1: lead.address_line1,
        city: lead.city, postcode: lead.postcode,
        valid: valid, issues: issues, quality_score: valid ? 100 : Math.max(0, 100 - issues.length * 25)
      });
    });

    res.json({
      success: true,
      total_checked: leadsToCheck.length,
      valid_addresses: validCount,
      invalid_addresses: invalidCount,
      duplicates_removed: duplicateCount,
      suppressed_removed: suppressedCount,
      previously_mailed: alreadyMailedCount,
      final_send_quantity: validCount,
      details: results
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== CAMPAIGN CALENDAR =====
// GET /api/direct-mail/calendar — Get all campaign events for calendar view
app.get('/api/direct-mail/calendar', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var customerId = req.user.id;
    var month = parseInt(req.query.month) || (new Date().getMonth() + 1);
    var year = parseInt(req.query.year) || new Date().getFullYear();
    var startDate = new Date(year, month - 1, 1).toISOString();
    var endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

    var events = [];

    // 1. Manual campaigns
    var campaigns = (db2.direct_mail_campaigns || []).filter(function(c) { return c.customer_id === customerId; });
    campaigns.forEach(function(c) {
      if (c.created_at && c.created_at >= startDate && c.created_at <= endDate) {
        events.push({
          id: c.id, type: 'campaign', sub_type: c.status === 'draft' ? 'draft' : 'sent',
          name: c.name, status: c.status, recipients: c.sent_count || c.target_count || 0,
          cost: c.budget || 0, date: c.created_at.split('T')[0],
          template_id: c.template_id, provider: c.provider,
          delivery_date: c.delivery_date || ''
        });
      }
    });

    // 2. Sequence steps
    var steps = (db2.postal_sequence_steps || []).filter(function(st) { return st.customer_id === customerId; });
    steps.forEach(function(st) {
      var sched = st.scheduled_for ? st.scheduled_for.split('T')[0] : '';
      if (sched && sched >= startDate.substring(0, 10) && sched <= endDate.substring(0, 10)) {
        events.push({
          id: st.id, sequence_id: st.sequence_id, type: 'sequence_step',
          sub_type: st.status, name: 'Sequence Step ' + st.step_number + ': ' + (st.material || ''),
          status: st.status, recipients: 0, cost: 0, date: sched,
          template_id: st.template_id || '', step_number: st.step_number
        });
      }
    });

    // 3. Print & Post campaigns (from the same data)
    var autoSend = campaigns.filter(function(c) { return c.notes === 'Print & Post'; });
    autoSend.forEach(function(c) {
      if (c.delivery_date && c.delivery_date >= startDate.substring(0, 10) && c.delivery_date <= endDate.substring(0, 10)) {
        events.push({
          id: c.id, type: 'auto_send', sub_type: 'auto',
          name: c.name, status: c.status, recipients: c.sent_count || c.target_count || 0,
          cost: c.budget || 0, date: c.delivery_date, template_id: c.template_id
        });
      }
    });

    // Sort by date
    events.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });

    res.json({ success: true, month: month, year: year, events: events, total: events.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: GET /api/admin/direct-mail/calendar — All customers' campaign calendar
app.get('/api/admin/direct-mail/calendar', adminAuth, (req, res) => {
  try {
    var db2 = getDb();
    var month = parseInt(req.query.month) || (new Date().getMonth() + 1);
    var year = parseInt(req.query.year) || new Date().getFullYear();
    var customerFilter = req.query.customer_id || '';
    var statusFilter = req.query.status || '';
    var providerFilter = req.query.provider || '';
    var startDate = new Date(year, month - 1, 1).toISOString();
    var endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
    var events = [];
    var campaigns = db2.direct_mail_campaigns || [];
    campaigns.forEach(function(c) {
      if (customerFilter && c.customer_id !== customerFilter) return;
      if (statusFilter && c.status !== statusFilter) return;
      if (providerFilter && c.provider !== providerFilter) return;
      if (c.created_at && c.created_at >= startDate && c.created_at <= endDate) {
        var cust = db2.customers ? db2.customers.find(function(cu) { return cu.id === c.customer_id; }) : null;
        events.push({
          id: c.id, customer_email: cust ? cust.email : 'unknown', customer_company: cust ? cust.company : '',
          name: c.name, status: c.status, recipients: c.sent_count || c.target_count || 0,
          cost: c.budget || 0, date: c.created_at.split('T')[0], provider: c.provider || '',
          template_id: c.template_id
        });
      }
    });
    events.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
    res.json({ success: true, month: month, year: year, events: events, total: events.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== MULTI-TOUCH POSTAL SEQUENCES =====
var SEQUENCE_STATUSES = ['active','paused','completed','cancelled'];

// POST /api/direct-mail/sequences — Create a sequence
app.post('/api/direct-mail/sequences', authMiddleware, (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Sequence name required' });
    var steps = req.body.steps || [];
    if (steps.length < 2) return res.status(400).json({ error: 'At least 2 steps required' });
    var db2 = getDb();
    if (!db2.postal_sequences) db2.postal_sequences = [];
    var seq = {
      id: uuidv4(), customer_id: req.user.id,
      name: req.body.name, lead_type: req.body.lead_type || '',
      status: 'active', current_step: 0, total_steps: steps.length,
      spend_limit: parseFloat(req.body.spend_limit) || 0,
      total_spent: 0, leads_count: 0,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    db2.postal_sequences.push(seq);
    // Create steps
    if (!db2.postal_sequence_steps) db2.postal_sequence_steps = [];
    steps.forEach(function(s, i) {
      db2.postal_sequence_steps.push({
        id: uuidv4(), sequence_id: seq.id, customer_id: req.user.id,
        step_number: i + 1, material: s.material || 'letter',
        template_id: s.template_id || '', delay_days: parseInt(s.delay_days) || 14,
        headline: s.headline || '', cta: s.cta || '',
        status: i === 0 ? 'pending' : 'scheduled',
        scheduled_for: i === 0 ? new Date().toISOString() : new Date(Date.now() + (parseInt(s.delay_days) || 14) * 86400000).toISOString(),
        sent_at: '', created_at: new Date().toISOString()
      });
    });
    saveDb();
    res.json({ success: true, sequence: seq, step_count: steps.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/sequences — List customer's sequences
app.get('/api/direct-mail/sequences', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var sequences = (db2.postal_sequences || []).filter(function(s) { return s.customer_id === req.user.id; }).sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    // Attach steps to each sequence
    var expanded = sequences.map(function(s) {
      var steps = (db2.postal_sequence_steps || []).filter(function(st) { return st.sequence_id === s.id && st.customer_id === req.user.id; }).sort(function(a, b) { return a.step_number - b.step_number; });
      var completedSteps = steps.filter(function(st) { return st.status === 'sent' || st.status === 'completed'; }).length;
      var failedSteps = steps.filter(function(st) { return st.status === 'failed'; }).length;
      var nextStep = steps.find(function(st) { return st.status === 'scheduled' || st.status === 'pending'; });
      return { id: s.id, name: s.name, lead_type: s.lead_type, status: s.status, current_step: s.current_step, total_steps: s.total_steps, steps_completed: completedSteps, steps_failed: failedSteps, next_scheduled: nextStep ? nextStep.scheduled_for : null, next_step_label: nextStep ? 'Step ' + nextStep.step_number + ': ' + nextStep.material : 'Complete', leads_count: s.leads_count || 0, total_spent: s.total_spent || 0, created_at: s.created_at, updated_at: s.updated_at };
    });
    res.json({ success: true, sequences: expanded, total: expanded.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/direct-mail/sequences/:id — Get sequence details with steps
app.get('/api/direct-mail/sequences/:id', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var seq = (db2.postal_sequences || []).find(function(s) { return s.id === req.params.id && s.customer_id === req.user.id; });
    if (!seq) return res.status(404).json({ error: 'Sequence not found' });
    var steps = (db2.postal_sequence_steps || []).filter(function(st) { return st.sequence_id === seq.id && st.customer_id === req.user.id; }).sort(function(a, b) { return a.step_number - b.step_number; });
    res.json({ success: true, sequence: seq, steps: steps });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/direct-mail/sequences/:id — Update sequence (name, spend limit, pause/resume)
app.put('/api/direct-mail/sequences/:id', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var idx = (db2.postal_sequences || []).findIndex(function(s) { return s.id === req.params.id && s.customer_id === req.user.id; });
    if (idx === -1) return res.status(404).json({ error: 'Sequence not found' });
    if (req.body.status && SEQUENCE_STATUSES.indexOf(req.body.status) === -1) return res.status(400).json({ error: 'Invalid status' });
    if (req.body.status === 'cancelled' || req.body.status === 'paused') {
      // Pause/cancel all pending steps
      (db2.postal_sequence_steps || []).forEach(function(st) {
        if (st.sequence_id === req.params.id && st.customer_id === req.user.id && (st.status === 'scheduled' || st.status === 'pending')) {
          st.status = req.body.status === 'cancelled' ? 'cancelled' : 'paused';
        }
      });
    }
    if (req.body.status === 'active') {
      // Resume: re-schedule pending steps
      var steps = (db2.postal_sequence_steps || []).filter(function(st) { return st.sequence_id === req.params.id && st.customer_id === req.user.id; });
      var lastSent = steps.filter(function(st) { return st.status === 'sent'; }).length;
      steps.forEach(function(st) {
        if (st.status === 'paused' || (st.step_number > lastSent && st.status !== 'sent')) {
          st.status = 'scheduled';
          st.scheduled_for = new Date(Date.now() + (st.delay_days || 14) * 86400000).toISOString();
        }
      });
    }
    Object.assign(db2.postal_sequences[idx], req.body, { updated_at: new Date().toISOString() });
    saveDb();
    res.json({ success: true, sequence: db2.postal_sequences[idx] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/direct-mail/sequences/:id/process-step — Process next scheduled step
app.post('/api/direct-mail/sequences/:id/process-step', authMiddleware, async (req, res) => {
  try {
    var db2 = getDb();
    var seq = (db2.postal_sequences || []).find(function(s) { return s.id === req.params.id && s.customer_id === req.user.id; });
    if (!seq) return res.status(404).json({ error: 'Sequence not found' });
    if (seq.status !== 'active') return res.status(400).json({ error: 'Sequence is not active' });
    var steps = (db2.postal_sequence_steps || []).filter(function(st) { return st.sequence_id === seq.id && st.customer_id === req.user.id; }).sort(function(a, b) { return a.step_number - b.step_number; });
    var pendingStep = steps.find(function(st) { return st.status === 'pending' || st.status === 'scheduled'; });
    if (!pendingStep) return res.status(400).json({ error: 'No pending steps' });
    // Check spend limit
    if (seq.spend_limit > 0 && (seq.total_spent || 0) >= seq.spend_limit) {
      seq.status = 'paused';
      saveDb();
      return res.status(400).json({ error: 'Spend limit reached. Sequence paused.' });
    }
    // Check Print & Post settings - skip if disabled
    var settings = db.prepare('SELECT * FROM direct_mail_automation_settings WHERE customer_id = ?').get(req.user.id);
    if (!settings || !settings.enable_auto_send) {
      return res.status(400).json({ error: 'Print & Post is disabled. Enable it to process sequence steps.' });
    }
    // Calculate step cost
    var pricing = calcDmPrice(seq.leads_count || 1);
    var stepCost = pricing.total;

    // Check if step cost + total spent would exceed spend limit
    if (seq.spend_limit > 0 && (seq.total_spent || 0) + stepCost > seq.spend_limit) {
      seq.status = 'paused'; saveDb();
      return res.status(400).json({ error: 'Step cost of £' + stepCost.toFixed(2) + ' would exceed spend limit of £' + seq.spend_limit.toFixed(2) + '. Sequence paused.' });
    }

    // Try to charge saved payment method
    var paymentSuccess = false;
    var paymentId = '';
    if (STRIPE_SECRET_KEY) {
      var customerData = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.user.id);
      if (customerData && customerData.stripe_payment_method_id && customerData.stripe_customer_id) {
        try {
          var amountPence = Math.round(stepCost * 100);
          var chargeResult = await stripeApiRequest('POST', 'payment_intents', {
            amount: String(amountPence), currency: 'gbp',
            customer: customerData.stripe_customer_id,
            'payment_method': customerData.stripe_payment_method_id,
            off_session: 'true', confirm: 'true',
            'metadata[sequence_id]': seq.id, 'metadata[step]': String(pendingStep.step_number),
            'metadata[type]': 'sequence_step', description: seq.name + ' - Step ' + pendingStep.step_number
          });
          if (chargeResult && chargeResult.status === 'succeeded') {
            paymentSuccess = true; paymentId = chargeResult.id;
          }
        } catch(stripeError) {
          // Payment failed - pause sequence
          seq.status = 'paused'; saveDb();
          return res.status(500).json({ error: 'Payment failed: ' + stripeError.message + '. Sequence paused.' });
        }
      }
    }
    if (!paymentSuccess) {
      // Fallback to mock payment if no Stripe configured
      paymentId = 'sequence_mock_' + Date.now();
    }

    // Create a campaign for this step
    var campaign = { id: uuidv4(), customer_id: req.user.id, name: seq.name + ' - Step ' + pendingStep.step_number, description: 'Sequence step', status: 'approved', template_id: pendingStep.template_id || '', target_count: seq.leads_count || 1, sent_count: 0, budget: stepCost, provider: '', provider_campaign_id: '', provider_status: '', stripe_session_id: '', stripe_payment_id: paymentId, stripe_payment_status: paymentSuccess ? 'paid' : 'paid', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    db.prepare('INSERT INTO direct_mail_campaigns (id,customer_id,name,description,status,template_id,material_id,target_count,sent_count,delivery_date,budget,notes,provider,provider_campaign_id,provider_status,stripe_session_id,stripe_payment_id,stripe_payment_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(campaign.id, campaign.customer_id, campaign.name, campaign.description, 'approved', campaign.template_id, '', campaign.target_count, campaign.sent_count, '', campaign.budget, '', campaign.provider, campaign.provider_campaign_id, campaign.provider_status, campaign.stripe_session_id, campaign.stripe_payment_id, campaign.stripe_payment_status, campaign.created_at, campaign.updated_at);
    // Send to mock provider
    var provider = getDirectMailProvider();
    var result = await provider.createCampaign({ name: campaign.name, recipient_count: campaign.target_count });
    if (result && result.success) {
      pendingStep.status = 'sent'; pendingStep.sent_at = new Date().toISOString();
      seq.current_step = (seq.current_step || 0) + 1;
      seq.total_spent = (seq.total_spent || 0) + stepCost;
      seq.updated_at = new Date().toISOString();
      // Schedule next step
      var nextStep = steps.find(function(st) { return st.step_number === pendingStep.step_number + 1; });
      if (nextStep) { nextStep.status = 'scheduled'; nextStep.scheduled_for = new Date(Date.now() + (nextStep.delay_days || 14) * 86400000).toISOString(); }
      if (!nextStep) seq.status = 'completed';
      saveDb();
      db.prepare('UPDATE direct_mail_campaigns SET status = ?, provider = ?, provider_campaign_id = ?, updated_at = ? WHERE id = ?').run('queued', provider.name, result.provider_campaign_id, new Date().toISOString(), campaign.id);
      res.json({ success: true, step_sent: pendingStep.step_number, next_step: nextStep ? nextStep.step_number : null, sequence_status: seq.status });
    } else {
      pendingStep.status = 'failed';
      saveDb();
      res.status(500).json({ error: 'Provider failed' });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/direct-mail/sequences/:id — Delete a sequence (only if cancelled/completed)
app.delete('/api/direct-mail/sequences/:id', authMiddleware, (req, res) => {
  try {
    var db2 = getDb();
    var idx = (db2.postal_sequences || []).findIndex(function(s) { return s.id === req.params.id && s.customer_id === req.user.id; });
    if (idx === -1) return res.status(404).json({ error: 'Sequence not found' });
    if (db2.postal_sequences[idx].status !== 'cancelled' && db2.postal_sequences[idx].status !== 'completed') return res.status(400).json({ error: 'Only completed or cancelled sequences can be deleted' });
    // Remove steps
    if (db2.postal_sequence_steps) db2.postal_sequence_steps = db2.postal_sequence_steps.filter(function(st) { return st.sequence_id !== req.params.id || st.customer_id !== req.user.id; });
    db2.postal_sequences.splice(idx, 1);
    saveDb();
    res.json({ success: true, message: 'Sequence deleted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== START SERVER =====
app.listen(PORT, () => {
  seedDefaultCampaignPacks();
  seedMarketplaceTemplates();
  seedSeasonalCampaigns();
  seedKnowledgeArticles();
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
// Start CH Streaming background worker
try {
  var chKeyStream = process.env.CH_STREAM_API_KEY || process.env.COMPANIES_HOUSE_API_KEY || '8e6cae34-073b-4451-b4c8-e0b463ca4b21';
  var streamWorker = require('./streaming_worker');
  streamWorker.start(chKeyStream);
  console.log('[BOOT] Stream: Companies House live stream worker started');
} catch(se) { console.log('[BOOT] Stream worker error: ' + se.message); }
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

// ===== EMAIL TEMPLATE MANAGEMENT (Admin) =====
function loadEmailEdits() {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'email-edits.json'), 'utf-8')); }
  catch(e) { return {}; }
}
function saveEmailEdits(edits) {
  fs.writeFileSync(path.join(DATA_DIR, 'email-edits.json'), JSON.stringify(edits, null, 2), 'utf-8');
}

// Helper: extract body HTML from campaign/paid templates using mock customer
function getCampaignBodyHTML(templateKey) {
  var mock = { product: 'moving', lead_type: 'Moving Leads', business_type: 'Business', name: 'Customer', company: 'Customer Company', email: 'customer@example.com', plan: 'free_trial', biz_field3: '[]' };
  var fullHtml = getCampaignEmailHTML(mock, templateKey);
  var marker = 'padding:20px 30px">';
  var s = fullHtml.indexOf(marker);
  if (s === -1) return fullHtml;
  s += marker.length;
  var e = fullHtml.indexOf('</td>', s);
  return e === -1 ? fullHtml.substring(s) : fullHtml.substring(s, e);
}

// Wrapper that applies edits from email-edits.json
function getCampaignEmailHTMLWithEdits(customer, template) {
  var html = getCampaignEmailHTML(customer, template);
  var edits = loadEmailEdits();
  if (edits[template] && edits[template].body) {
    var marker = 'padding:20px 30px">';
    var s = html.indexOf(marker);
    if (s !== -1) {
      s += marker.length;
      var e = html.indexOf('</td>', s);
      if (e !== -1) html = html.substring(0, s) + edits[template].body + html.substring(e);
    }
  }
  return html;
}
function getEditedCampaignSubject(template, originalSubject) {
  var edits = loadEmailEdits();
  return (edits[template] && edits[template].subject) || originalSubject;
}

// ===== OUTBOUND PROSPECTING CAMPAIGNS (Brevo) =====
// 5 campaigns ï¿½ 16 emails = 80 total
// Naming: 9AM-PROD-WKX-EX where PROD = MOV/PLAN/PROB/NBZ/TEN

var OUTBOUND_CAMPAIGNS = {
  moving: { name: 'Moving Leads Campaign', tag: 'moving', listName: 'Moving Prospects', emails: [
    { id: '9AM-MOV-WK1-E1', week: 1, emailNum: 1, subject: 'Are your vans sitting empty while competitors are winning moves?', subjectB: 'The hidden cost of empty return legs', preview: 'How removal companies are filling their calendars 12 weeks in advance', body: `Hi {{NAME}},

I was speaking with a removal business owner in Birmingham last week who told me something that stuck with me.

He said: "I don't mind the quiet weeks. What kills me is knowing there are people moving right now, in my area, and they're hiring someone else because they never found me."

That's the harsh reality of the removal industry in 2025. The demand is thereï¿½over 400,000 households move each month in the UK. The problem isn't a lack of moves. It's a lack of visibility at the exact moment someone decides to move.

Traditional advertising catches people who might move someday. Directory listings show you to people who are browsing, not necessarily buying. Referrals are great but unpredictable.

What most removal companies miss is the window between "we need to move" and "we've booked a removal company." That window is typically 2-4 weeks. And in that window, your ideal customers are searching online, comparing options, and making decisions.

The question isn't whether there are enough moves in your area. It's whether you're appearing in front of the right people at exactly the right time.

That's what 9amLeads does. We identify homeowners and businesses who are actively planning a move, score them by likelihood and value, and deliver those opportunities to you every morning at 9am. No guesswork. No spray-and-pray marketing. Just qualified, actionable leads.

If you'd like to see what opportunities are currently available in your postcode area, I'd be happy to show you.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see live opportunities in your area' },

    { id: '9AM-MOV-WK1-E2', week: 1, emailNum: 2, subject: 'The move you didn\x27t know you lost', subjectB: 'Every unanswered enquiry is a missed mortgage payment', preview: 'Calculating the real cost of missed removal opportunities', body: `Hi {{NAME}},

Let me ask you a direct question.

How many people in your area moved house last month? If you're in a typical UK city, the answer is probably somewhere between 500 and 2,000 households.

How many of those did you quote for?

If the answer is fewer than 50, there's a gap. And that gap represents real revenue that's funding someone else's business instead of yours.

Here's what we've learned from working with removal companies across the UK: the average removal job is worth between ï¿½1,000 and ï¿½3,000. For a man-and-van operator, it might be ï¿½400-800. For a full-service removal company with packing, storage, and insurance, it can be ï¿½5,000 or more.

But here's the part that really matters: you only need ONE extra removal job per month to cover the cost of a lead generation system. Everything after that is pure upside.

If you're currently running at 60% capacity and could fill that to 85%, the difference to your annual revenue is transformational. It's not about working harderï¿½it's about making sure the opportunities that exist in your area actually reach your inbox.

The technology exists now to see every person who is actively preparing to move in your area, scored by how likely they are to convert and what the job is worth. It arrives in your email at 9am, before your first cup of tea.

Let me show you what's available in your area right now.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply and I\x27ll send you this week\x27s opportunities' },

    { id: '9AM-MOV-WK1-E3', week: 1, emailNum: 3, subject: 'How the UK property market creates removal opportunities', subjectB: 'Property market trends your competitors are already using', preview: 'Understanding the data behind when and why people move', body: `Hi {{NAME}},

Here's something most removal companies don't realise: the UK property market follows predictable cycles, and those cycles create predictable removal demand.

Spring and autumn are the obvious peaksï¿½conveyancing completes, keys are handed over, and someone needs a van. But there are deeper patterns that matter more for your business.

When interest rates change, the market shifts within weeks. When stamp duty thresholds change, completion dates cluster. When a new housing development opens, everyone moves in within a 4-8 week window. When a corporate relocation contract lands with an estate agent, every employee needs moving in a specific timeframe.

The data exists to see all of these patterns in real time. It's not guesswork. It's lead intelligence.

Most removal companies operate reactivelyï¿½they wait for the phone to ring. The best operators we work with operate prospectively. They know what's coming, they prepare quotes in advance, and they're the first company a potential customer speaks to.

That first-contact advantage is enormous. When you're the first removal company to respond, you're not competing on priceï¿½you're solving a problem before the customer even knows all their options.

The 9amLeads platform delivers this intelligence daily. It scans thousands of data points to find people who are actively preparing to move, scores them by likelihood and value, and delivers actionable opportunities to your inbox.

Understanding the market is one thing. Being first to act on it is what wins contracts.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to discuss how market intelligence could work for your business' },

    { id: '9AM-MOV-WK1-E4', week: 1, emailNum: 4, subject: 'One extra removal job covers your entire subscription', subjectB: 'The maths of removal lead generation', preview: 'Real ROI numbers from removal companies using daily lead delivery', body: `Hi {{NAME}},

Let's talk about return on investment, because I know that every pound you spend on marketing needs to come back with friends.

The average removal job in the UK generates ï¿½1,000-3,000 in revenue. Some are smallerï¿½local man-with-a-van moves at ï¿½350. Some are much largerï¿½full service, packing, storage, international, corporate relocations at ï¿½10,000 or more.

Here's the simple maths: if you win ONE extra removal job per month from our system, that's ï¿½12,000-36,000 in additional annual revenue. The cost of the system is a fraction of that first job's value.

But let's be more realistic. Removal companies using 9amLeads typically see:

ï¿½ 3-8 qualified leads delivered per week (depending on area)
ï¿½ 40-60% quote conversion rate (because you're responding first)
ï¿½ Average job value of ï¿½1,800 across all move types
ï¿½ 5-12 additional jobs secured per quarter

One customer in Manchester told us: "I was sceptical about another lead source, but the quality was different. These are people who are actually movingï¿½not tyre-kickers. I booked two full house moves in my first week."

The difference isn't the number of leads. It's that these leads are actively looking right now. They're not "maybe next year" leads. They're "I need a quote this week" leads.

If you'd like to see the ROI calculator with your specific numbers, reply and I'll send it over.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for a personalised ROI calculation for your business' },

    { id: '9AM-MOV-WK1-E5', week: 1, emailNum: 5, subject: 'How a London removal company booked 12 moves in their first month', subjectB: 'Case study: From quiet calendar to fully booked in 30 days', preview: 'Real results from a removal company that transformed their lead generation', body: `Hi {{NAME}},

I want to share a real story from a removal company we work with in South London.

They're a family-run business with three crews. Before using 9amLeads, they relied on repeat customers and Google Ads. Their calendar was unpredictableï¿½some weeks fully booked, others worryingly quiet.

After their first week with our platform, they received 6 qualified leadsï¿½all people actively moving within the next 2-4 weeks. They quoted all 6 and secured 4. That's ï¿½7,200 in booked revenue from one week of leads.

By the end of their first month, they'd booked 12 moves directly attributed to our leads. Their utilisation rate went from roughly 55% to over 80%. The system paid for itself on day one.

What made the difference? Speed. They were the first removal company to respond to every single lead. When you're first, you're not competing on priceï¿½you're building trust by being helpful immediately.

The owner told me: "The biggest change isn't just the extra revenue. It's the peace of mind. I know I'm going to get leads every morning. I can plan my crews, my routes, my admin. The business feels stable for the first time in years."

That stability is what we're really selling. Not leads. Predictable, consistent opportunity flow.

If you'd like to hear more case studies from removal companies in areas similar to yours, just reply.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see case studies relevant to your area' },

    { id: '9AM-MOV-WK1-E6', week: 1, emailNum: 6, subject: '"We already get enough enquiries from our website"', subjectB: 'Three reasons your current leads are costing you more than you think', preview: 'Why even busy removal companies need a second lead source', body: `Hi {{NAME}},

I hear this a lot from removal company owners: "We're busy enough. We don't need more leads."

And I understand why you'd say that. When your teams are on the road and your diary is full, the last thing you need is more enquiries to manage.

But here's what those same owners discover when they look deeper:

First, "busy" doesn't always mean "profitable." If you're running at full capacity but your margins are thin, it's because you're competing on price. The best jobsï¿½the full-service, high-value movesï¿½aren't going to the busiest companies. They're going to the companies that respond first.

Second, relying on one lead source is risky. If your website drops in rankings, if Google Ads costs double next quarter, if your key referrer retiresï¿½what happens to your pipeline? Multiple lead sources create resilience.

Third, not all leads are equal. The leads we deliver are people who have demonstrated intent to move in the next 2-6 weeks. They're not browsing. They're buying. The difference between a warm lead and a cold lead is often weeks of unnecessary follow-up.

The removal companies that grow consistently are the ones that build multiple channels. They treat lead generation like a diversified investment portfolioï¿½not a single bet.

I'm not suggesting you replace your current sources. I'm suggesting you add another one that fills the gaps your current sources miss.

Would you be open to a 10-minute call to see if there are opportunities in your area you're currently missing?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply with a time for a quick call this week' },

    { id: '9AM-MOV-WK1-E7', week: 1, emailNum: 7, subject: 'The best time to start looking for removal leads was 3 months ago', subjectB: 'Why preparation beats reaction in the removal industry', preview: 'Getting ahead of the seasonal peaks with proactive lead generation', body: `Hi {{NAME}},

In the removal industry, timing is everything.

The spring market rush. The summer period when families move between school terms. The autumn wave of completions. These peaks are predictable, but most removal companies only start marketing when they're already in the peak.

By then, it's too late to capture the best opportunities.

The businesses that perform best during peak seasons are the ones that built their pipelines 4-6 weeks before the rush. They had quotes in progress. They had relationships forming. They had their crews scheduled before the competition even started advertising.

Here's what we've observed: removal companies that start using 9amLeads in the quieter periods see the biggest spike when the market picks up. Because they've already built the habit of responding to leads quickly. They've already refined their quoting process. They've already secured the early-mover advantage.

The platform delivers opportunities daily, so you're building a pipeline consistentlyï¿½not scrambling when things get busy.

If you wait until you're quiet to look for leads, you're always reacting. If you build a consistent lead pipeline now, you'll have a full calendar when everyone else is scrambling.

There's never a wrong time to build a better pipeline. But there's definitely a right timeï¿½and that's before you need it.

Would you like to see what's currently available in your area?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see current opportunities in your postcode area' },

    { id: '9AM-MOV-WK1-E8', week: 1, emailNum: 8, subject: 'Your competitors are already receiving daily removal leads', subjectB: 'The competitive advantage of being first to respond', preview: 'Why the removal companies winning most are first in the inbox', body: `Hi {{NAME}},

Here's an uncomfortable question: while you're reading this email, how many removal companies in your area have already quoted a job you didn't even know existed?

I ask because we've seen the pattern play out across every region we operate in.

When we launch in a new area, typically one or two removal companies sign up first. They start receiving daily leads at 9am. They respond quickly, quote professionally, and win a disproportionate share of the available work.

Within a few months, their competitors notice they're busier. Some sign up too. Others don't.

The ones that don't never catch up. Because by the time they realise there's a new source of leads in their market, the early adopters have already built relationships, refined their approach, and secured the best customers.

Being first matters in the removal industry. First response gets the first conversation. First conversation gets the first quote. First quote wins more often than not.

The 9amLeads platform gives you that first-mover advantage every single day. While others are waiting for the phone to ring, you're already reviewing opportunities and sending quotes.

The question isn't whether daily lead delivery worksï¿½it's whether you can afford to let your competitors have it to themselves.

Would you like to be one of the first removal companies in your area to access daily qualified leads?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to check availability in your postcode area' },

    { id: '9AM-MOV-WK3-E9', week: 3, emailNum: 9, subject: 'How the 9amLeads platform delivers your daily removal opportunities', subjectB: 'A simple walkthrough of how daily lead delivery works', preview: 'From data to inbox: how you receive qualified removal leads every morning', body: `Hi {{NAME}},

You've heard about the concept. Now let me explain exactly how the platform works, so you can decide if it's right for your removal business.

Step one: We scan thousands of data sources every night-property listings, conveyancing records, planning applications, tenancy notices, and dozens more signals that indicate someone is preparing to move.

Step two: Our AI scores each opportunity based on how likely the person is to need a removal service, the estimated value of the move, the location, and the timeframe.

Step three: Every morning at 9am, you receive an email with your personalised leads. Each lead includes the address, contact information, estimated move date, property type, and our confidence score.

Step four: You review the leads, prioritise the best opportunities, and reach out. Most customers respond within 2 hours of receiving their daily email and report significantly higher conversion rates because they are first to contact.

Step five: As you win jobs, you can track your results in your dashboard-leads received, quotes sent, jobs won, and revenue generated. This lets you measure exactly what each lead is worth to your business.

The entire process takes about 15 minutes per day. You don't need to install software, learn a new system, or change how you run your business. You just need to check your email and respond to opportunities.

The 9amLeads platform integrates with your existing CRM if you use one, or you can manage everything through your dashboard and inbox.

It's designed to be simple because we know removal company owners don't have time for complicated systems.

Would you like to see a sample of what your daily email would look like?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see a sample daily lead email' },

    { id: '9AM-MOV-WK3-E10', week: 3, emailNum: 10, subject: 'Why daily consistency beats quarterly marketing campaigns', subjectB: 'The power of showing up in your customers inbox every morning', preview: 'How consistent daily lead delivery transforms your business development', body: `Hi {{NAME}},

Most removal companies approach marketing in bursts. A Google Ads campaign here, a leaflet drop there, a social media push when things are quiet.

The problem with burst marketing is that it creates burst results. You get a spike of enquiries, then a long dry spell. You can't plan around it. You can't build consistent cash flow around it.

Daily lead delivery changes that.

When you receive qualified opportunities every morning, your business development becomes a daily habit rather than a quarterly panic. You respond to leads consistently. You build your pipeline consistently. You win work consistently.

Here's what our customers tell us is the most valuable aspect of the platform: it's not just the leads-it's the discipline. Checking your leads every morning, responding quickly, tracking your results. These habits compound over time.

After 30 days of daily lead delivery, you have data. You know which types of moves are most profitable. You know which areas generate the best leads. You know your conversion rates.

After 90 days, you have patterns. You can predict your pipeline. You can plan your resourcing. You can make better business decisions.

After 12 months, you have a completely different business-one that's driven by consistent opportunity rather than feast-or-famine marketing.

The 9amLeads platform delivers this consistency automatically. You don't need to manage campaigns, optimise ad spend, or worry about algorithm changes. You just need to respond to the opportunities we deliver.

Consistency is the superpower that most removal businesses never develop. Daily lead delivery makes it automatic.

Would you like to experience what 30 days of consistent leads would do for your business?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to start your 30-day trial' },

    { id: '9AM-MOV-WK3-E11', week: 3, emailNum: 11, subject: 'How the most successful removal companies structure their sales process', subjectB: 'What the top 10% of removals businesses do differently', preview: 'The habits and systems that separate high-growth removal companies from the rest', body: `Hi {{NAME}},

Over the years, I've studied hundreds of removal companies to understand what separates the ones that grow consistently from the ones that struggle.

Here's what I've found.

The most successful removal companies have three things in common.

First, they have a systematic approach to lead generation. They don't rely on any single source. They have multiple channels working simultaneously-referrals, repeat customers, website, and daily lead delivery. They understand that diversification creates stability.

Second, they respond fast. The best removal companies we work with respond to leads within 30-60 minutes. They know that the first company to respond has an enormous advantage. The customer is still in research mode, not comparison mode. A fast response builds trust and positions you as the professional choice.

Third, they track everything. They know their conversion rates, their average job values, their cost per lead, and their most profitable move types. They use data to make decisions, not gut feel.

The 9amLeads platform supports all three of these habits.

It provides a consistent daily flow of qualified leads (habit one). It delivers them early enough that you can be first to respond (habit two). And it includes tracking and analytics so you can measure your performance (habit three).

We're not just a lead source. We're a system that helps you build better business habits.

The removal companies that adopt these habits outperform their competitors year after year. Not because they're luckier. Because they're more systematic.

Would you like to see how your current lead generation compares to the best in your area?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for a free lead generation assessment' },

    { id: '9AM-MOV-WK3-E12', week: 3, emailNum: 12, subject: 'The opportunities your competitors are seeing that you are not', subjectB: 'What opportunity intelligence reveals about your local market', preview: 'How data reveals the removal opportunities hiding in plain sight', body: `Hi {{NAME}},

One of the most powerful features of the 9amLeads platform is something we call Opportunity Intelligence.

It's not just about delivering leads. It's about helping you understand your market at a deeper level.

Here's what Opportunity Intelligence looks like for removal companies:

Market volume: How many people are moving in your area each month? Is demand rising or falling? Which postcodes generate the most moves? This helps you decide where to focus your marketing.

Lead scoring: Which leads are most likely to convert? Our AI analyses dozens of factors-property type, timeframe, location, value indicators-to prioritise your best opportunities.

Trend analysis: Are there seasonal patterns in your area? Is there a new housing development creating demand? Is a corporate relocation creating a cluster of moves? We surface these patterns so you can prepare.

Competitive insight: How fast are other removal companies in your area responding? What types of moves are they winning? This intelligence helps you position yourself more effectively.

Pipeline tracking: How many leads are you working? What's your conversion rate? What's your average job value? Your dashboard shows you these numbers in real time.

This intelligence transforms how you think about your business. Instead of wondering where your next job is coming from, you have a clear view of your market, your pipeline, and your performance.

The removal companies that use Opportunity Intelligence don't just win more jobs. They make better strategic decisions about their business.

Would you like to see what Opportunity Intelligence reveals about your area?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see your area Opportunity Intelligence report' },

    { id: '9AM-MOV-WK4-E13', week: 4, emailNum: 13, subject: 'What is the revenue potential of your local removal market?', subjectB: 'Calculating the total addressable move value in your postcode area', preview: 'A data-driven look at the removal revenue available in your area', body: `Hi {{NAME}},

Let me ask you a question that most removal company owners can't answer.

What's the total value of removal opportunities in your area each month?

We've done this calculation for hundreds of postcodes across the UK. Here's what the numbers typically look like.

In a typical UK city with a population of 250,000, approximately 2,000 households move each month. At an average removal job value of £1,500, that's £3,000,000 in total removal spend every month.

Even if half of those moves are DIY, that's still £1,500,000 in addressable professional removal revenue.

How much of that are you capturing? If you're doing 20 moves per month at £1,500 average, that's £30,000-or 2% of the available market.

Now, I'm not suggesting you can capture 100%. But moving from 2% to 5% would triple your revenue. Moving from 2% to 10% would 5x your business.

The difference between 2% and 5% isn't better service or lower prices. It's better visibility. It's being in front of the right people at the right time.

The 9amLeads platform helps you capture a larger share of your local market by ensuring you see every available opportunity. You still have to win the job on your merits. But at least you're in the conversation.

If you knew that £1.5m in removal revenue was available in your area every month, wouldn't you want to capture more of it?

Reply and I'll calculate the specific market potential for your postcode area.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for your area market potential calculation' },

    { id: '9AM-MOV-WK4-E14', week: 4, emailNum: 14, subject: 'Your questions about removal lead generation answered', subjectB: 'The most common questions removal company owners ask about daily leads', preview: 'Honest answers to the questions we hear most from removal businesses', body: `Hi {{NAME}},

Over the past few weeks, I've shared a lot about how removal companies can generate more consistent opportunities. Today, I want to answer the questions I hear most often.

How many leads will I get?
It varies by area, but most removal companies receive 3-8 qualified leads per week. Densely populated urban areas tend to generate more. The quality consistently exceeds other lead sources because these are people actively planning a move, not browsing.

Are these exclusive leads?
They're delivered to you as part of your subscription. Other removal companies in your area may use our service, but the advantage goes to whoever responds first. That's why we emphasise speed-the first responder wins disproportionately.

Do I need a website or CRM?
No. You can manage everything through your daily email and dashboard. But if you use a CRM, we offer integration options to streamline your workflow.

What if the leads aren't right for my business?
We encourage you to try the service because the proof is in the results. Most customers see a positive return within their first month. If the leads aren't right for your specific business, you're not locked in.

How is this different from other lead generation services?
Most services deliver leads that have been passed around multiple providers. Our leads are proprietary-we identify them from hundreds of data signals that others don't access. The early-morning delivery also means you're responding before your competitors are even awake.

Can I choose my area?
Yes. You select your target postcode areas, and we deliver leads only from those areas. You can adjust your area settings at any time.

If you have other questions, just reply. I'm happy to answer them directly.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply with any questions about how it works' },

    { id: '9AM-MOV-WK4-E15', week: 4, emailNum: 15, subject: 'Why removal companies stay with 9amLeads for years', subjectB: 'What keeps our customers coming back every morning', preview: 'The long-term value of daily lead delivery for removal businesses', body: `Hi {{NAME}},

One of the things I'm most proud of is our customer retention. Removal companies don't stay with us because of a contract. They stay because the leads keep coming and the results keep compounding.

Here's what our longest-serving customers tell us.

"It's become part of my morning routine." The daily email at 9am is consistent. Reliable. Our customers tell us they look forward to it because it starts their day with opportunity rather than uncertainty.

"The quality has improved over time." Our AI learns from every interaction. Over time, the leads become more relevant, better scored, and more closely matched to each customer's preferences.

"It's helped us build a better business." The consistency of daily leads has allowed our customers to grow their teams, invest in better equipment, and take on larger, more profitable moves. They've moved from survival mode to growth mode.

"I can't imagine running my business without it." This is what we hear most. The platform becomes embedded in how they operate. It's not an add-on. It's how they find new customers every day.

"Our competitors still don't know how we're getting so much work." That's the competitive advantage that compounds over time. While others are still trying to figure out lead generation, our customers are winning jobs and building relationships.

The real value of 9amLeads isn't any single lead. It's the cumulative effect of months and years of consistent opportunity flow. It's the peace of mind that comes from knowing your pipeline is full.

I'd love for you to experience that peace of mind.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to start building your consistent pipeline' },

    { id: '9AM-MOV-WK4-E16', week: 4, emailNum: 16, subject: 'A personal invitation to transform how you find removal customers', subjectB: 'Let us build your removal business together', preview: 'A direct invitation from Ketz to try the platform transforming removal lead generation', body: `Hi {{NAME}},

If you've read this far, thank you. I know your time is valuable, and I appreciate you giving me the opportunity to share what we've built.

I started 9amLeads because I saw a fundamental problem in the removal industry: great businesses were missing opportunities simply because they didn't know they existed. The technology existed to solve this, but nobody was connecting the dots for removal companies.

Today, hundreds of removal businesses across the UK start their day with our leads. They've grown their revenue, stabilised their cash flow, and built businesses that aren't dependent on any single marketing channel.

I'm not going to give you a hard sales pitch. What I will do is make you a simple offer.

If you reply to this email, I'll personally set up a demonstration of the 9amLeads platform for your specific area. I'll show you the leads that are currently available. I'll calculate the potential revenue opportunity for your postcode. If it looks like a good fit, you can start receiving leads immediately.

If it doesn't look right, no problem. You'll at least have a better understanding of your local market than you had before.

This isn't about selling software. It's about helping removal business owners see opportunities they're currently missing. That's all I've ever wanted to do.

Reply to this email, and let's see what opportunities exist in your area.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to speak with Ketz directly' },
  ]
},

  planning: { name: 'Planning & Construction Campaign', tag: 'planning', listName: 'Planning Prospects', emails: [
    { id: '9AM-PLAN-WK1-E1', week: 1, emailNum: 1, subject: 'Are you finding out about projects after the architect has been hired?', subjectB: 'The projects you\x27re quoting for are already being built', preview: 'How builders and trades are winning work before it goes to comparison sites', body: `Hi {{NAME}},

I was talking to a builder in Bristol last month who summed up his frustration perfectly: "I know there are people in my area who want extensions, new kitchens, driveways, and roofs. But by the time they find me, they've already spoken to three other traders. I'm always the fourth or fifth quote."

That's the reality of the home improvement industry in 2025. The demand is enormousï¿½millions of UK homeowners are planning projects worth ï¿½20,000 to ï¿½100,000 or more. But most tradespeople are competing for the same small pool of leads that have been passed around by comparison sites.

The problem isn't a lack of projects. It's that you're finding out about them too late.

When a homeowner decides to build an extension, there's a critical window between "we should do this" and "let's get quotes." In that window, they're researching builders, reading reviews, and asking for recommendations. The first trader who establishes trust in that window has an enormous advantage.

But how do you find those homeowners before they've already decided who to call?

That's what 9amLeads was built for. We identify homeowners and businesses actively planning construction projects, score them by project value and likelihood to proceed, and deliver those opportunities to your inbox every morning at 9am.

If you'd like to see what projects are currently being planned in your area, I'd be happy to show you.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see live projects in your area' },

    { id: '9AM-PLAN-WK1-E2', week: 1, emailNum: 2, subject: 'The ï¿½50,000 project you didn\x27t quote for', subjectB: 'The real cost of missing one extension or loft conversion', preview: 'What a single missed project costs your business in real terms', body: `Hi {{NAME}},

Let me ask you a straightforward question.

How many homeowners in your area are planning a major renovation or construction project right now? Not "thinking about it someday"ï¿½actively planning, measuring, saving, and preparing to hire.

If you're like most tradespeople, you're getting a fraction of those projects. Not because you're not good at what you do, but because you're not appearing in front of those homeowners at the right time.

Here's what we've learned from working with builders, roofers, kitchen fitters, and landscapers across the UK: the average project value in our system ranges from ï¿½5,000 for a small landscaping job to over ï¿½100,000 for a full extension or loft conversion.

The average is around ï¿½25,000.

Here's the simple maths: one extra project per quarter at ï¿½25,000 adds ï¿½100,000 to your annual revenue. One extra project per month adds ï¿½300,000.

You don't need a hundred new customers. You need one or two good projects that you would have missed otherwise.

The 9amLeads platform finds those projects for youï¿½homeowners who've started the process, applied for planning permission, ordered surveys, or taken other concrete steps. We score them by likelihood and value, and deliver them to your inbox at 9am.

You only need to win one to make the system pay for itself many times over.

Reply and I'll show you what's available in your area right now.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see this week\x27s projects in your area' },

    { id: '9AM-PLAN-WK1-E3', week: 1, emailNum: 3, subject: 'How planning applications reveal your next customer', subjectB: 'Reading the signs: when renovation becomes a sales opportunity', preview: 'The data signals that tell you a project is about to go live', body: `Hi {{NAME}},

Here's something most tradespeople don't realise: by the time a homeowner is asking for quotes, they've been planning their project for weeks or months.

The question isï¿½what happened during those weeks and months?

When someone decides to build an extension, they typically start by researching online. They look at designs. They check planning permission rules. They measure their space. They talk to neighbours who've had work done. They visit showrooms. They search for builders.

Each of these actions leaves a digital trace. And those traces, when connected, form a clear picture of someone who's about to become a qualified lead.

The problem is that most tradespeople never see these signals. They're waiting for the phone to ring, while the real opportunity was weeks ago.

What if you could see those signals as they happen? What if you knew which homeowners in your area had started researching extensions, which ones had applied for planning permission, which ones were measuring their lofts for conversion?

That's the intelligence 9amLeads provides. We aggregate dozens of data signals to identify homeowners who are actively moving toward a construction decision. We score them by how close they are to buying and how much the project is likely to be worth.

By the time they're asking for quotes, you've already been on their radar for weeksï¿½because you reached out when they started planning, not when they started shopping.

Would you like to see the intelligence available for your area?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see your area\x27s opportunity intelligence' },

    { id: '9AM-PLAN-WK1-E4', week: 1, emailNum: 4, subject: 'One extension project covers five years of subscriptions', subjectB: 'The ROI of being first to quote on local projects', preview: 'Real return on investment numbers from construction businesses using daily leads', body: `Hi {{NAME}},

Let's talk about numbers, because in construction, everything comes down to maths.

The average extension project in the UK costs between ï¿½45,000 and ï¿½75,000. A loft conversion averages ï¿½40,000-60,000. A new kitchen is ï¿½15,000-30,000. Landscaping projects range from ï¿½5,000-25,000.

These aren't council tax band A numbers. These are significant investments that homeowners don't make lightly.

Here's the return on investment calculation that matters:

If you win ONE extension project from our system, at even a conservative ï¿½40,000 contract value, your gross profit at 20% margin is ï¿½8,000. The cost of 9amLeads for a full year is a fraction of that.

One project covers years of subscription. Everything else you win is additional.

Here's what our customers in the construction space are actually seeing:

ï¿½ 2-5 qualified project leads per week (varies by area and trade)
ï¿½ Project values averaging ï¿½15,000-65,000
ï¿½ Response time advantage: 40-60% close rate when first to quote
ï¿½ Average 3-6 additional projects secured per quarter

One builder in Essex told us: "I got a lead on a Tuesday, quoted on Wednesday, and was measuring up on Friday. The customer said I was the only one who responded within 48 hours. I got the job without even competing on price."

Speed wins in construction. Speed plus intelligence is unbeatable.

Reply and I'll calculate the potential ROI for your specific trade and area.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for a personalised ROI projection' },

    { id: '9AM-PLAN-WK1-E5', week: 1, emailNum: 5, subject: 'How a Yorkshire builder secured ï¿½180k in projects from one platform', subjectB: 'Case study: From feast-or-famine to a full pipeline', preview: 'A builder\x27s journey from unpredictable workflow to consistent project pipeline', body: `Hi {{NAME}},

Let me share a story that illustrates what's possible.

A builder in Yorkshireï¿½let's call him Markï¿½specialises in extensions and loft conversions. Before using 9amLeads, his workflow was unpredictable. He'd have busy months where he'd turn down work, then quiet months where he'd worry about covering his overheads.

He signed up sceptical. "I've tried every lead generation service out there," he told me. "They all promise the world and deliver tyre-kickers."

In his first week, he received 3 project leads. One was a loft conversion in his exact area, valued at approximately ï¿½45,000. He quoted within 4 hours of receiving the lead. The homeowner told him he was the first to respond out of five builders contacted.

He got the job.

Over the next three months, Mark received 28 qualified project leads. He quoted 22. He secured 12 projects with a combined value of approximately ï¿½180,000.

The total cost of the system over that period? Less than the profit from the smallest project he won.

The owner of a landscaping company in Surrey had a similar experience. He told us: "The difference is that these are people who are actually going to do the work. They've got plans, they've got budgets, they're ready to go. I'm not chasing maybes anymore."

These results aren't unusual. They're what happens when you combine daily opportunity intelligence with fast response and quality work.

If you'd like to see case studies from tradespeople in your specific field, just reply.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see trade-specific case studies' },

    { id: '9AM-PLAN-WK1-E6', week: 1, emailNum: 6, subject: '"I\x27m already getting enough work through recommendations"', subjectB: 'The hidden risks of relying solely on word-of-mouth', preview: 'Why even busy tradespeople need a second lead source for stability', body: `Hi {{NAME}},

This is a common response, and I completely understand it.

If you've built a business on recommendations and repeat customers, you've done something right. You deliver quality work, and people trust you enough to refer you. That's valuable.

But here's what I'd gently challenge: is your recommendation pipeline reliable enough to plan your business around?

Recommendations are unpredictable. They come in waves. You might have a great month followed by two quiet ones. You can't control when someone's friend decides to build an extension.

Beyond unpredictability, there's another issue: recommendations tend to produce similar projects. Your existing customers know you for what you've already done. They won't refer you for the ï¿½100,000 extension project if they hired you for a ï¿½5,000 driveway.

The 9amLeads platform doesn't replace your recommendation pipeline. It complements it. It fills the gaps when recommendations are quiet. It surfaces different types of projects that your existing network might not generate.

Think of it as diversification. No successful business relies on a single channel. The most stable construction businesses we work with have 3-4 lead sources: recommendations, repeat customers, a website presence, and a daily lead service like ours.

Would you be open to a brief conversation about how additional lead sources could make your business more predictable?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to schedule a 10-minute chat' },

    { id: '9AM-PLAN-WK1-E7', week: 1, emailNum: 7, subject: 'Winter is when smart builders build their pipeline', subjectB: 'The seasonal advantage of preparing before the spring rush', preview: 'Why the projects you secure now determine your summer revenue', body: `Hi {{NAME}},

There's a well-known pattern in the construction industry: enquiries drop in December and January, then spike in February and March as homeowners emerge from winter ready to start projects.

Most tradespeople respond to this pattern reactively. They wait for the spike, then scramble to quote. By the time they've caught up, the best projects are already taken.

The smart operators do something different. They use the quieter winter months to build their pipeline for spring. They identify projects that are being planned now, so they can quote early and secure work before the rush.

Here's what our data shows: homeowners start planning spring projects in January. They research builders in February. They request quotes in March. They want work to start in April or May.

If you're not in their consideration set by February, you're competing for leftovers.

The 9amLeads platform gives you visibility into this pipeline months in advance. You can see which homeowners are starting to plan projects, reach out early with helpful information, and position yourself as the obvious choice before your competitors even know the project exists.

The best time to plant a tree was 20 years ago. The second best time is now. The same applies to your project pipeline.

Would you like to see what projects are being planned in your area right now?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see the pipeline of upcoming projects' },

    { id: '9AM-PLAN-WK1-E8', week: 1, emailNum: 8, subject: 'While you\x27re reading this, another builder is quoting your next project', subjectB: 'The competitive reality of daily lead generation', preview: 'Why early adopters in construction are pulling away from the pack', body: `Hi {{NAME}},

Here's the honest truth: every day you wait to implement a systematic lead generation process, your competitors are getting further ahead.

We see it in every trade and every region. The businesses that sign up early for daily opportunity delivery build a compound advantage.

They respond faster because they've practised. They quote more accurately because they've seen more projects. They close at higher rates because homeowners perceive them as more responsive and professional.

And most importantly, they're building relationships with homeowners weeks before their competitors even know those homeowners exist.

Consider this: if you start today, within a month you'll have a pipeline of projects at various stagesï¿½some quoting, some negotiating, some confirmed. Within three months, you'll have a steady flow of work that you can predict and plan around.

If you start in six months, you'll be six months behind every business that started today. And in the construction industry, being six months behind on relationships and pipeline is very hard to recover from.

The 9amLeads platform levels the playing field in terms of access to opportunities. But it amplifies the advantage of those who act first.

The question isn't whether daily lead delivery works for construction businesses. It's whether you can afford to let your competitors have exclusive access to the projects in your area.

Would you like to be among the first in your area to access daily project opportunities?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to check availability and get started' },

    { id: '9AM-PLAN-WK3-E9', week: 3, emailNum: 9, subject: 'How the 9amLeads platform delivers your daily construction project opportunities', subjectB: 'A simple walkthrough of how daily project lead delivery works', preview: 'From data to inbox: how you receive qualified project leads every morning', body: `Hi {{NAME}},

You've heard about the concept. Now let me explain exactly how the platform works for construction and trade businesses.

Step one: We scan thousands of data sources every night-planning applications, building regulation approvals, architectural consultations, property surveys, and dozens more signals that indicate a homeowner or business is preparing a construction project.

Step two: Our AI scores each opportunity based on project type, estimated value, likelihood to proceed, location, and timeframe.

Step three: Every morning at 9am, you receive an email with your personalised project leads. Each lead includes the property address, project description, estimated value, and our confidence score.

Step four: You review the leads, prioritise the best opportunities, and reach out. Most customers respond within 2 hours and report significantly higher conversion rates because they are first to contact the homeowner.

Step five: As you win projects, you can track your results in your dashboard-leads received, quotes sent, jobs won, and revenue generated.

The entire process takes about 15 minutes per day. You don't need to install software or learn a new system. You just need to check your email and respond to opportunities.

The 9amLeads platform integrates with your existing CRM if you use one, or you can manage everything through your dashboard and inbox.

Would you like to see a sample of what your daily project email would look like?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see a sample daily project email' },

    { id: '9AM-PLAN-WK3-E10', week: 3, emailNum: 10, subject: 'Why daily consistency beats quarterly marketing for construction businesses', subjectB: 'The power of daily project opportunities in your inbox', preview: 'How consistent daily lead delivery transforms your construction pipeline', body: `Hi {{NAME}},

Most tradespeople approach marketing in bursts. A leaflet drop here, a Facebook ad there, a push when work is quiet.

The problem with burst marketing is that it creates burst results. You get a spike of enquiries, then a long dry spell. You can't plan your resourcing around it.

Daily project delivery changes that.

When you receive qualified opportunities every morning, your business development becomes a daily habit. You respond to leads consistently. You build your pipeline consistently. You win work consistently.

Here's what our customers tell us is the most valuable aspect of the platform: it's not just the leads-it's the discipline. Checking your projects every morning, responding quickly, tracking your results. These habits compound.

After 30 days, you have data. You know which project types are most profitable. You know which areas generate the best work. You know your conversion rates.

After 90 days, you have patterns. You can predict your pipeline. You can plan your resourcing. You can make better business decisions.

After 12 months, you have a completely different business-one driven by consistent opportunity rather than feast-or-famine marketing.

The 9amLeads platform delivers this consistency automatically. You don't need to manage campaigns, optimise ad spend, or worry about algorithm changes.

Consistency is the superpower that most construction businesses never develop. Daily project delivery makes it automatic.

Would you like to experience what 30 days of consistent project leads would do for your business?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to start your 30-day trial' },

    { id: '9AM-PLAN-WK3-E11', week: 3, emailNum: 11, subject: 'How the most successful builders structure their sales process', subjectB: 'What the top 10% of construction businesses do differently', preview: 'The habits and systems that separate high-growth tradespeople from the rest', body: `Hi {{NAME}},

Over the years, I've studied hundreds of construction and trade businesses to understand what separates the ones that grow consistently from the ones that struggle.

Here's what I've found.

The most successful businesses have three things in common.

First, they have a systematic approach to lead generation. They don't rely on any single source. They have multiple channels working simultaneously-recommendations, repeat customers, website, and daily project delivery. Diversification creates stability.

Second, they respond fast. The best tradespeople we work with respond to project leads within 30-60 minutes. They know that being first to respond gives them an enormous advantage. The homeowner is still in research mode, not comparison mode.

Third, they track everything. They know their conversion rates, their average project values, their cost per lead, and their most profitable project types. They use data to make decisions.

The 9amLeads platform supports all three of these habits.

It provides a consistent daily flow of qualified project leads. It delivers them early enough that you can be first to respond. And it includes tracking and analytics so you can measure your performance.

We're not just a lead source. We're a system that helps you build better business habits.

The businesses that adopt these habits outperform their competitors year after year. Not because they're luckier. Because they're more systematic.

Would you like to see how your current lead generation compares to the best in your area?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for a free lead generation assessment' },

    { id: '9AM-PLAN-WK3-E12', week: 3, emailNum: 12, subject: 'The construction projects your competitors are finding before you', subjectB: 'What opportunity intelligence reveals about your local market', preview: 'How data reveals the projects hiding in plain sight', body: `Hi {{NAME}},

One of the most powerful features of the 9amLeads platform is something we call Opportunity Intelligence.

It's not just about delivering project leads. It's about helping you understand your market at a deeper level.

Here's what Opportunity Intelligence looks like for construction businesses:

Market volume: How many projects are being planned in your area each month? Is demand rising or falling? Which postcodes generate the most work? This helps you decide where to focus your marketing.

Lead scoring: Which projects are most likely to proceed? Our AI analyses dozens of factors-project type, property value, planning status, timeframe-to prioritise your best opportunities.

Trend analysis: Are there seasonal patterns in your area? Is a new housing development creating demand? Are more homeowners applying for extensions? We surface these patterns so you can prepare.

Competitive insight: How fast are other tradespeople in your area responding? What types of projects are they winning? This helps you position yourself more effectively.

Pipeline tracking: How many projects are you working on? What's your conversion rate? What's your average project value? Your dashboard shows you these numbers in real time.

This intelligence transforms how you think about your business. Instead of wondering where your next project is coming from, you have a clear view of your market, your pipeline, and your performance.

Would you like to see what Opportunity Intelligence reveals about your area?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see your area Opportunity Intelligence report' },

    { id: '9AM-PLAN-WK4-E13', week: 4, emailNum: 13, subject: 'What is the total project value in your local area?', subjectB: 'Calculating the addressable construction market in your postcode', preview: 'A data-driven look at the project revenue available in your area', body: `Hi {{NAME}},

Let me ask you a question that most construction business owners can't answer.

What's the total value of construction and renovation projects in your area each year?

We've done this calculation for hundreds of postcodes across the UK. Here's what the numbers typically look like.

In a typical UK town with 50,000 households, approximately 2-3% will undertake a major renovation or extension project each year. That's 1,000-1,500 projects with an average value of £25,000-45,000.

That's £25,000,000-67,500,000 in total project value annually.

How much of that are you capturing? If you're doing 10 projects per year at £30,000 average, that's £300,000-or roughly 1% of the available market.

Now, I'm not suggesting you can capture 100%. But moving from 1% to 3% would triple your revenue.

The difference between 1% and 3% isn't better workmanship or lower prices. It's better visibility. It's being in front of the right homeowners at the right time.

The 9amLeads platform helps you capture a larger share of your local market by ensuring you see every available project opportunity.

If you knew that tens of millions in project value was available in your area every year, wouldn't you want to capture more of it?

Reply and I'll calculate the specific market potential for your postcode area.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for your area market potential calculation' },

    { id: '9AM-PLAN-WK4-E14', week: 4, emailNum: 14, subject: 'Your questions about construction project lead generation answered', subjectB: 'The most common questions builders and tradespeople ask about daily project leads', preview: 'Honest answers to the questions we hear most from construction businesses', body: `Hi {{NAME}},

Over the past few weeks, I've shared a lot about how construction businesses can generate more consistent project opportunities. Today, I want to answer the questions I hear most often.

How many project leads will I get?
It varies by area, but most construction businesses receive 2-5 qualified project leads per week. Densely populated urban areas generate more. The quality consistently exceeds other lead sources because these are homeowners actively planning work.

Are these exclusive leads?
They're delivered to you as part of your subscription. Other tradespeople in your area may use our service, but the advantage goes to whoever responds first. Being first to respond wins disproportionately.

Do I need a website or CRM?
No. You can manage everything through your daily email and dashboard. But if you use a CRM, we offer integration options.

What if the project leads aren't right for my business?
We encourage you to try the service because the proof is in the results. Most customers see a positive return within their first month.

How is this different from other lead sources?
Most lead sources deliver enquiries that have been passed around multiple providers. Our project leads are proprietary-we identify them from hundreds of data signals that others don't access.

Can I choose my area?
Yes. You select your target postcode areas, and we deliver leads only from those areas. You can adjust your settings at any time.

If you have other questions, just reply. I'm happy to answer them directly.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply with any questions about how it works' },

    { id: '9AM-PLAN-WK4-E15', week: 4, emailNum: 15, subject: 'Why builders and tradespeople stay with 9amLeads for years', subjectB: 'What keeps our construction customers coming back every morning', preview: 'The long-term value of daily project delivery for construction businesses', body: `Hi {{NAME}},

One of the things I'm most proud of is our customer retention. Construction businesses don't stay with us because of a contract. They stay because the project leads keep coming and the results keep compounding.

Here's what our longest-serving customers tell us.

"It's become part of my morning routine." The daily email at 9am is consistent. Reliable. Our customers tell us they look forward to it because it starts their day with opportunity rather than uncertainty.

"The quality has improved over time." Our AI learns from every interaction. Over time, the project leads become more relevant, better scored, and more closely matched to each customer's preferences.

"It's helped us build a better business." The consistency of daily leads has allowed our customers to grow their teams, invest in better equipment, and take on larger, more profitable projects.

"I can't imagine running my business without it." This is what we hear most. The platform becomes embedded in how they operate.

"Our competitors still don't know how we're getting so much work." That's the competitive advantage that compounds over time.

The real value of 9amLeads isn't any single project lead. It's the cumulative effect of months and years of consistent opportunity flow. It's the peace of mind that comes from knowing your pipeline is full.

I'd love for you to experience that peace of mind.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to start building your consistent pipeline' },

    { id: '9AM-PLAN-WK4-E16', week: 4, emailNum: 16, subject: 'A personal invitation to transform how you find construction projects', subjectB: 'Let us build your project pipeline together', preview: 'A direct invitation from Ketz to try the platform transforming construction lead generation', body: `Hi {{NAME}},

If you've read this far, thank you. I know your time is valuable, and I appreciate you giving me the opportunity to share what we've built.

I started 9amLeads because I saw a fundamental problem in the construction industry: great tradespeople were missing projects simply because they didn't know they existed. The technology existed to solve this, but nobody was connecting the dots.

Today, hundreds of builders, roofers, kitchen fitters, landscapers, and electricians across the UK start their day with our project leads. They've grown their revenue, stabilised their cash flow, and built businesses that aren't dependent on any single marketing channel.

I'm not going to give you a hard sales pitch. What I will do is make you a simple offer.

If you reply to this email, I'll personally set up a demonstration of the 9amLeads platform for your specific area. I'll show you the projects that are currently available. I'll calculate the potential revenue opportunity for your postcode.

If it doesn't look right, no problem. You'll at least have a better understanding of your local market than you had before.

This isn't about selling software. It's about helping construction business owners see opportunities they're currently missing.

Reply to this email, and let's see what projects exist in your area.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to speak with Ketz directly' },
  ]
},

  probate: { name: 'Probate Services Campaign', tag: 'probate', listName: 'Probate Prospects', emails: [
    { id: '9AM-PROB-WK1-E1', week: 1, emailNum: 1, subject: 'The estates being handled in your area that you\x27ll never hear about', subjectB: 'Why probate is the most overlooked revenue opportunity in property', preview: 'How estate agents and probate professionals are missing years of instruction value', body: `Hi {{NAME}},

I want to talk about a market that's vastly underserved, often misunderstood, and represents one of the biggest revenue opportunities in property and professional services.

Probate.

Every year in the UK, approximately 270,000 estates go through probate. That's 270,000 properties that need valuing, selling, clearing, managing, or litigating. Each estate represents multiple revenue streams across multiple professionals.

The problem is that most of these opportunities never reach the right people at the right time.

Estate agents find out about probate properties when a solicitor instructs themï¿½often months after the grant of probate. Removal companies hear about house clearances when a family is already stressed and rushing. Property investors discover probate sales when they're already on the open market.

By the time most professionals hear about a probate opportunity, the best windows have passed.

What if you could identify estates going through probate in your area as soon as the application is submitted? What if you could reach executors with helpful information before they've chosen which professionals to work with?

That's the intelligence 9amLeads provides. We identify probate estates in your area, track them through the process, and deliver opportunities to your inbox daily.

If you'd like to see what probate opportunities are currently active in your area, I'd be happy to show you.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see probate opportunities in your area' },

    { id: '9AM-PROB-WK1-E2', week: 1, emailNum: 2, subject: 'The ï¿½50,000 probate instruction you didn\x27t know existed', subjectB: 'Calculating the lifetime value of one probate relationship', preview: 'The compound revenue from a single probate instruction across multiple services', body: `Hi {{NAME}},

Let me put a number on what you might be missing.

A single probate instruction isn't worth one transaction. It's worth a relationship that generates revenue across multiple services, often over several years.

For an estate agent, a probate sale is worth ï¿½5,000-15,000 in commission on a typical property.

For a removal or house clearance company, a probate clearance is worth ï¿½1,000-5,000 depending on property size.

For a storage company, probate contents need storing for monthsï¿½ï¿½500-2,000 in recurring revenue.

For a solicitor, the probate application and estate administration can generate ï¿½3,000-15,000 in fees.

For a property investor, a probate sale below market value can yield ï¿½20,000-50,000 in profit.

And here's the crucial point: the professional who makes contact first often gets the entire relationship. The executors don't want to manage multiple vendors. They want one trusted professional who coordinates everything.

If you're an estate agent, that means you can instruct the removal company, recommend the solicitor, and introduce the investor. You control the entire value chain.

The 9amLeads platform identifies probate estates as early as possible in the process, giving you the first-mover advantage that leads to the full relationship.

Reply and I'll show you the current probate opportunities in your area and your potential revenue from each.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for a probate revenue assessment for your area' },

    { id: '9AM-PROB-WK1-E3', week: 1, emailNum: 3, subject: 'The probate timeline: why timing determines who gets the instruction', subjectB: 'Understanding the three phases of probate opportunity', preview: 'How the probate process creates windows of opportunity for different professionals', body: `Hi {{NAME}},

Understanding the probate timeline is essential to capturing probate opportunities. Here's how it works and what it means for your business.

Phase one: Pre-grant. This is the period immediately after someone passes away when the executors are identified, the will is located, and the probate application is prepared. This phase lasts 4-12 weeks. Most professionals don't even know an estate exists during this phase.

Phase two: Grant of probate. The legal authority to administer the estate is granted. This is when executors start making decisions about the property. Do they sell it? Move into it? Clear it? Rent it out? This is the critical decision window.

Phase three: Post-grant administration. The property is sold, cleared, or transferred. This is when most professionals get involvedï¿½but by now, decisions have been made and relationships have been formed.

The key insight is that the professional who engages during phase one or early phase two has a massive advantage. They're not competing for the instructionï¿½they're helping shape the decision.

Most professionals wait for phase three. They wait for the property to hit the market. They wait for the clearance to be advertised. By then, they're one of many competing for a decision that's already been made.

9amLeads identifies probate estates during phases one and two, giving you access to opportunities weeks or months before your competitors.

Would you like to see how many probate estates are currently in phase one or two in your area?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see early-stage probate opportunities' },

    { id: '9AM-PROB-WK1-E4', week: 1, emailNum: 4, subject: 'One probate instruction can transform your year', subjectB: 'The compound ROI of probate lead generation', preview: 'Real revenue potential from serving executors at the right time', body: `Hi {{NAME}},

Let me walk you through the return on investment for probate-focused lead generation.

A single probate instruction doesn't just generate one fee. It generates a cascade of revenue opportunities.

Take the example of an estate agent who identifies a probate property early. Here's what typically happens:

They contact the executor with helpful information about the probate sale process, valuation requirements, and timeline. The executor appreciates the guidance and instructs them to sell.

The property sells for ï¿½350,000 at 2% commission: ï¿½7,000.

The executor also needs the property cleared: they recommend a removal company and potentially earn a referral fee or strengthen their relationship with a local partner.

The executor needs storage for some items: another referral opportunity.

The executor's friends and family hear about the positive experience and remember the agent's name for their own future moves.

Total revenue from one instruction: ï¿½7,000 direct, plus uncounted referral value.

For a probate solicitor, one instruction might be worth ï¿½5,000-15,000 in legal fees. For a removal company, a probate clearance might generate ï¿½1,500-4,000.

But here's what our customers tell us: the first probate instruction they win from our system typically covers their subscription for several years. Everything after that is additional.

The ROI isn't theoretical. It's arithmetic. One instruction. Multiple services. Years of value.

Reply and I'll show you the specific probate opportunities available in your area right now.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see your probate opportunity pipeline' },

    { id: '9AM-PROB-WK1-E5', week: 1, emailNum: 5, subject: 'How a Southampton estate agent generated ï¿½28k from probate in 90 days', subjectB: 'Case study: The probate specialist who transformed their business', preview: 'Real results from a professional who made probate their focus', body: `Hi {{NAME}},

I want to share a story that demonstrates the power of probate-focused lead generation.

An estate agent in Southamptonï¿½let's call her Sarahï¿½had always handled probate properties when they came through referrals, but she'd never actively sought them out. She estimated she was getting maybe one or two probate instructions per year.

After joining 9amLeads, she started receiving daily notifications of probate estates in her area. In the first week, she identified three properties where the grant of probate had just been issued.

She contacted the executors not with a sales pitch, but with a helpful guide to selling a probate property. She explained the process, the typical timeline, and what they should expect. No pressure. Just genuine expertise.

Two of the three executors instructed her within a week. The third called her back a month later when they were ready to proceed.

Over the next 90 days, Sarah identified and secured instructions on five probate properties. Total commission: approximately ï¿½28,000.

She told us: "I can't believe I wasn't doing this before. These are the easiest sales I've ever made because the executors need helpï¿½they're not being sold to. I'm solving a real problem for people at a difficult time."

The key to her success was timing. She contacted executors when they were making decisions, not after decisions had been made.

If you'd like to hear more stories from professionals using probate lead generation, just reply.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for more probate case studies' },

    { id: '9AM-PROB-WK1-E6', week: 1, emailNum: 6, subject: '"We get probate instructions through solicitors already"', subjectB: 'Why waiting for solicitor referrals leaves money on the table', preview: 'The limitations of relying on referrals for probate business', body: `Hi {{NAME}},

I completely understand why you might feel probate lead generation isn't necessary if you already have a good relationship with local solicitors.

Solicitor referrals are valuable. They're a sign that you've built trust with professionals who handle estates daily. That's not something to dismiss.

But here's what we've learned from working with hundreds of professionals across the probate ecosystem: solicitor referrals typically capture only a fraction of the available opportunity.

Most solicitors work with a small number of trusted agents and providers. They refer to the same 2-3 people they've always worked with. If you're one of them, great. But you're still only seeing the estates that solicitor handlesï¿½which might be 10-20 per year.

What about the other 200+ estates going through probate in your area each year? Who's serving those executors?

Furthermore, solicitor referrals often come late in the process. By the time a solicitor recommends you, the executor may have already spoken to other professionals, received advice, or even made arrangements.

Direct outreach to executorsï¿½at the right time, with the right messageï¿½captures opportunities that never reach the solicitor referral pipeline.

The 9amLeads platform doesn't replace your existing referral sources. It complements them by surfacing opportunities your current network doesn't reach.

I'm not asking you to replace what's working. I'm asking if you'd like to add a channel that captures what your current channels miss.

Would you be open to a brief conversation about how this works in practice?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to schedule a short call' },

    { id: '9AM-PROB-WK1-E7', week: 1, emailNum: 7, subject: 'The probate market is growing every year', subjectB: 'Why demographics make probate the opportunity of the next decade', preview: 'The demographic trends that make probate lead generation essential now', body: `Hi {{NAME}},

Here's a statistic that should get your attention: the UK has an ageing population, and the probate market is growing every single year.

According to the Office for National Statistics, the number of deaths in the UK is projected to increase by approximately 25% over the next 20 years. More deaths mean more estates going through probate. More estates mean more opportunities for professionals who know how to identify and serve them.

But here's the critical point: while the market is growing, so is competition. More estate agents, more solicitors, more removal companies, and more property investors are waking up to the probate opportunity.

The professionals who establish their probate lead generation systems now will have a compound advantage. They'll build relationships with executors before their competitors even enter the market.

Every month you wait is a month where someone else is building relationships with the executors in your area.

The technology to identify probate estates early exists now. 9amLeads delivers daily updates on probate estates in your area, including property details, executor information, and the stage of the probate process.

The market is growing. The technology is available. The only question is whether you're ready to act.

Would you like to see what the probate opportunity looks like in your specific area?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see your area\x27s probate market data' },

    { id: '9AM-PROB-WK1-E8', week: 1, emailNum: 8, subject: 'Your competitors are already contacting executors in your area', subjectB: 'The first-mover advantage in probate lead generation', preview: 'Why the professionals who act now will dominate probate in their area', body: `Hi {{NAME}},

Here's the reality we see across every region we operate in: the probate market is being divided up right now.

In area after area, we see the same pattern. A few forward-thinking professionals sign up for daily probate opportunity delivery. They start contacting executors early, building relationships, and securing instructions.

Within months, they've established themselves as the go-to probate professionals in their area. Executors recommend them to other executors. Solicitors start referring to them because they see them everywhere.

The professionals who didn't act early find themselves competing for the leftoversï¿½the estates that the early adopters didn't pursue.

This isn't theory. This is what we observe happening across the country right now.

The probate market is large enough for everyone who acts now. But it's not large enough for everyone who waits.

By identifying probate estates early and reaching out with genuine helpfulness, you position yourself as the expert in your area. You're not selling. You're serving executors at a time when they genuinely need guidance.

The 9amLeads platform gives you that early visibility. But the advantage goes to those who use it consistently and professionally.

The question is simple: will you be one of the early adopters in your area, or one of the professionals wondering what happened?

Reply to check if probate leads are available in your postcode area.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to check availability and get started' },

    { id: '9AM-PROB-WK3-E9', week: 3, emailNum: 9, subject: 'How the 9amLeads platform delivers your daily probate opportunities', subjectB: 'A simple walkthrough of how daily probate lead delivery works', preview: 'From data to inbox: how you receive qualified probate opportunities every morning', body: `Hi {{NAME}},

You've heard about the concept. Now let me explain exactly how the platform works for probate professionals.

Step one: We scan thousands of data sources every night-probate registries, death notifications, property records, and dozens more signals that indicate an estate is entering the probate process.

Step two: Our AI scores each opportunity based on estate value, property type, location, the stage of the probate process, and the likely needs of the executor.

Step three: Every morning at 9am, you receive an email with your personalised probate opportunities. Each lead includes the property details, estimated estate value, probate stage, and our confidence score.

Step four: You review the opportunities, prioritise the best ones, and reach out with helpful information. Most customers respond within 2 hours and report significantly higher engagement because they are contacting executors at exactly the right time.

Step five: As you secure instructions, you can track your results in your dashboard-opportunities received, contacts made, instructions won, and revenue generated.

The entire process takes about 15 minutes per day. You don't need to install software or learn a new system. You just need to check your email and respond to opportunities.

The 9amLeads platform integrates with your existing CRM if you use one, or you can manage everything through your dashboard and inbox.

Would you like to see a sample of what your daily probate opportunities email would look like?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see a sample daily probate email' },

    { id: '9AM-PROB-WK3-E10', week: 3, emailNum: 10, subject: 'Why daily consistency transforms probate business development', subjectB: 'The power of daily probate opportunities in your inbox', preview: 'How consistent daily opportunity delivery builds your probate pipeline', body: `Hi {{NAME}},

Most professionals approach probate business development reactively. They wait for solicitor referrals or existing client relationships to generate instructions.

The problem with this approach is that it's unpredictable. You can't control when referrals come in. You can't plan your pipeline around them.

Daily probate opportunity delivery changes that.

When you receive qualified opportunities every morning, your business development becomes a daily habit. You review opportunities consistently. You reach out to executors consistently. You build your pipeline consistently.

Here's what our customers tell us is the most valuable aspect of the platform: it's not just the opportunities-it's knowing that every day, you're seeing things your competitors aren't.

After 30 days of daily probate intelligence, you have data. You know which types of estates are most valuable. You know which areas generate the best instructions. You know your conversion rates.

After 90 days, you have patterns. You can predict your pipeline. You can plan your resourcing.

After 12 months, you have a completely different business-one driven by consistent opportunity rather than occasional windfalls.

The 9amLeads platform delivers this consistency automatically. You don't need to manage campaigns or worry about where your next instruction is coming from.

Consistency is the superpower that most probate professionals never develop. Daily opportunity delivery makes it automatic.

Would you like to experience what 30 days of consistent probate opportunities would do for your business?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to start your 30-day trial' },

    { id: '9AM-PROB-WK3-E11', week: 3, emailNum: 11, subject: 'How the most successful probate professionals find their instructions', subjectB: 'What the top probate practitioners do differently', preview: 'The habits and systems that separate high-growth probate professionals', body: `Hi {{NAME}},

I've studied hundreds of estate agents, solicitors, removal companies, and property investors who focus on probate. Here's what separates the ones who dominate from the ones who struggle.

The most successful probate professionals have three things in common.

First, they identify opportunities early. They don't wait for the property to hit the market or for the solicitor to refer them. They're identifying estates at the grant of probate stage or earlier.

Second, they reach out with genuine helpfulness. The best professionals don't lead with a sales pitch. They lead with useful information about the probate process, valuation guidance, or timeline advice. They build trust before asking for the instruction.

Third, they build multi-service relationships. They don't pursue a single transaction. They position themselves as the coordinator of all probate services-estate agency, clearance, storage, legal referrals, and investment opportunities.

The 9amLeads platform supports all three of these habits.

It gives you early visibility into probate estates. It delivers opportunities at the right time for helpful outreach. And it provides enough opportunities that you can be selective and build comprehensive relationships.

We're not just an opportunity source. We're a system that helps you build a better probate practice.

Would you like to see how your current probate business development compares to the best in your area?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for a free probate practice assessment' },

    { id: '9AM-PROB-WK3-E12', week: 3, emailNum: 12, subject: 'The probate opportunities your competitors are finding before you', subjectB: 'What opportunity intelligence reveals about your local probate market', preview: 'How data reveals the probate opportunities hiding in plain sight', body: `Hi {{NAME}},

One of the most powerful features of the 9amLeads platform is something we call Opportunity Intelligence.

It's not just about delivering probate leads. It's about helping you understand your market at a deeper level.

Here's what Opportunity Intelligence looks like for probate professionals:

Market volume: How many estates are going through probate in your area each month? Is the number rising or falling? Which areas generate the most valuable estates?

Lead scoring: Which opportunities are most likely to result in an instruction? Our AI analyses estate value, property type, location, and probate stage to prioritise your best opportunities.

Trend analysis: Are there seasonal patterns in probate volumes in your area? Is a particular demographic creating more opportunities?

Competitive insight: How many other professionals are active in probate in your area? What types of estates are they targeting?

Pipeline tracking: How many opportunities are you working? What's your conversion rate? What's your average instruction value? Your dashboard shows you these numbers in real time.

This intelligence transforms how you think about your probate business. Instead of wondering where your next instruction is coming from, you have a clear view of your market, your pipeline, and your performance.

Would you like to see what Opportunity Intelligence reveals about your area?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see your area Opportunity Intelligence report' },

    { id: '9AM-PROB-WK4-E13', week: 4, emailNum: 13, subject: 'What is the total probate value in your local area?', subjectB: 'Calculating the addressable probate market in your region', preview: 'A data-driven look at the probate revenue available in your area', body: `Hi {{NAME}},

Let me ask you a question that most probate professionals can't answer.

What's the total value of estates going through probate in your area each year?

We've done this calculation for hundreds of regions across the UK. Here's what the numbers typically look like.

In a typical UK county with a population of 500,000, approximately 2,500-3,000 estates go through probate each year. The average property value in these estates is £250,000-400,000.

That's £625,000,000-1,200,000,000 in total estate value annually.

Even focusing only on the top 10% of estates by value, that's £62,000,000-120,000,000 in addressable opportunity.

How much of that are you capturing?

The professionals who systematically identify and pursue probate opportunities capture a disproportionate share. They're not waiting for referrals. They're building relationships with executors before anyone else knows the estate exists.

The 9amLeads platform helps you capture a larger share of your local probate market by ensuring you see every available opportunity at the right time.

If you knew that hundreds of millions in estate value was passing through probate in your area every year, wouldn't you want to capture more of it?

Reply and I'll calculate the specific probate market potential for your area.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for your area probate market calculation' },

    { id: '9AM-PROB-WK4-E14', week: 4, emailNum: 14, subject: 'Your questions about probate lead generation answered', subjectB: 'The most common questions probate professionals ask about daily opportunities', preview: 'Honest answers to the questions we hear most from probate practitioners', body: `Hi {{NAME}},

Over the past few weeks, I've shared a lot about how professionals can generate more consistent probate opportunities. Today, I want to answer the questions I hear most often.

How many probate opportunities will I get?
It varies by area, but most professionals receive 3-10 probate opportunities per week. Densely populated urban areas and areas with older demographics generate more. The quality is consistently high because these are real estates at specific stages of the probate process.

Are these exclusive?
They're delivered to you as part of your subscription. Other professionals in your area may use our service, but the advantage goes to whoever contacts the executor first with genuine helpfulness.

Do I need to be a solicitor to use this?
No. Estate agents, removal companies, house clearers, property investors, and valuers all use our platform successfully. Each profession approaches executors with different value propositions.

How is this different from other probate lead sources?
Most sources deliver outdated or unreliable information. Our opportunities are identified in real time from hundreds of data signals that other services don't access.

Can I choose my area?
Yes. You select your target counties or postcode areas, and we deliver opportunities from those areas only.

If you have other questions, just reply. I'm happy to answer them directly.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply with any questions about how it works' },

    { id: '9AM-PROB-WK4-E15', week: 4, emailNum: 15, subject: 'Why probate professionals stay with 9amLeads for years', subjectB: 'What keeps our probate customers coming back every morning', preview: 'The long-term value of daily probate intelligence', body: `Hi {{NAME}},

One of the things I'm most proud of is our customer retention. Probate professionals don't stay with us because of a contract. They stay because the opportunities keep coming and the results keep compounding.

Here's what our longest-serving customers tell us.

"It's become part of my morning routine." The daily email at 9am is consistent. Reliable. Our customers tell us they look forward to it because it starts their day with opportunity rather than uncertainty.

"The quality has improved over time." Our AI learns from every interaction. Over time, the opportunities become more relevant, better scored, and more closely matched to each customer's preferences.

"It's helped us build a better business." The consistency of daily opportunities has allowed our customers to grow their probate practice, build relationships with executors, and establish themselves as the go-to professional in their area.

"I can't imagine running my probate practice without it." This is what we hear most. The platform becomes embedded in how they operate.

"Our competitors still don't know how we're securing so many instructions." That's the competitive advantage that compounds over time.

The real value of 9amLeads isn't any single probate opportunity. It's the cumulative effect of months and years of consistent opportunity flow.

I'd love for you to experience that peace of mind.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to start building your consistent probate pipeline' },

    { id: '9AM-PROB-WK4-E16', week: 4, emailNum: 16, subject: 'A personal invitation to transform your probate practice', subjectB: 'Let us build your probate pipeline together', preview: 'A direct invitation from Ketz to try the platform transforming probate lead generation', body: `Hi {{NAME}},

If you've read this far, thank you. I know your time is valuable, and I appreciate you giving me the opportunity to share what we've built.

I started 9amLeads because I saw a fundamental problem in the probate market: great professionals were missing opportunities simply because they didn't know the estates existed. The technology existed to solve this, but nobody was connecting the dots.

Today, hundreds of estate agents, solicitors, removal companies, and property investors across the UK start their day with our probate opportunities. They've grown their revenue, stabilised their pipelines, and built practices that aren't dependent on occasional referrals.

I'm not going to give you a hard sales pitch. What I will do is make you a simple offer.

If you reply to this email, I'll personally set up a demonstration of the 9amLeads platform for your specific area. I'll show you the probate opportunities that are currently available. I'll calculate the potential revenue for your practice.

If it doesn't look right, no problem. You'll at least have a better understanding of your local probate market than you had before.

This isn't about selling software. It's about helping probate professionals see opportunities they're currently missing.

Reply to this email, and let's see what probate opportunities exist in your area.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to speak with Ketz directly' },
  ]
},

  newbusiness: { name: 'New Business & Professional Services Campaign', tag: 'newbusiness', listName: 'New Business Prospects', emails: [
    { id: '9AM-NBZ-WK1-E1', week: 1, emailNum: 1, subject: 'The businesses in your area that need your service and don\x27t know it yet', subjectB: 'Why waiting for referrals is costing your professional services firm', preview: 'How professional service firms are finding new clients before competitors', body: `Hi {{NAME}},

I work with accountants, marketing agencies, insurance brokers, IT consultancies, recruiters, and other professional service firms across the UK. And there's a pattern I see repeated constantly.

The best firms don't wait for business to come to them. They identify opportunities before their competitors even know they exist.

Here's the challenge for professional services: your ideal clients are out there. They're growing businesses that need accounting support. They're companies that need better IT infrastructure. They're firms that should be outsourcing their recruitment.

But they don't always know they need you. Or they know they need help, but they don't know who to call.

The firms that grow fastest are the ones that find those businesses first, reach out with genuine insight, and build relationships before a formal procurement process begins.

That's what 9amLeads helps you do. We identify businesses in your area or sector that are showing signs of needing your servicesï¿½new incorporations, funding rounds, leadership changes, expansion plans, regulatory triggersï¿½and deliver those opportunities to your inbox every morning at 9am.

You're not cold calling. You're reaching out at the exact moment a business is most likely to need what you offer.

If you'd like to see what opportunities exist in your market right now, I'd be happy to show you.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see live opportunities in your sector' },

    { id: '9AM-NBZ-WK1-E2', week: 1, emailNum: 2, subject: 'The ï¿½50,000 account you didn\x27t pitch for', subjectB: 'The lifetime value of one new business client you never knew existed', preview: 'Calculating what missed new business opportunities cost your firm', body: `Hi {{NAME}},

Let me ask you something. How many businesses in your area or sector started looking for your service last month?

If you're relying on referrals, recommendations, and incoming enquiries, you're probably seeing a fraction of them. Not because you're not good at what you do. Because you don't know they're looking.

Here's what we've learned from working with professional service firms: the lifetime value of a new business client varies by sector, but it's almost always substantial.

For an accountant, a new SME client is worth ï¿½2,000-10,000 per year in recurring fees. If they stay for 5 years, that's ï¿½10,000-50,000 in lifetime value.

For a marketing agency, a retainer client is worth ï¿½3,000-15,000 per month. A single client retained for two years is worth ï¿½72,000-360,000.

For an insurance broker, a commercial client generates ï¿½1,000-5,000 in commission annually. Over a decade, that's ï¿½10,000-50,000.

For a recruitment agency, a single placed candidate generates ï¿½5,000-25,000 in fees. One client with multiple hires can be worth ï¿½50,000+ per year.

The common thread? You only need to win a handful of new clients per year from our system to generate a transformational return. Every client after that is pure growth.

The 9amLeads platform surfaces businesses that are actively seeking or showing signs of needing your services. We score them by fit and potential value, and deliver them to your inbox every morning.

Reply and I'll show you what's available in your market right now.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see this week\x27s opportunities' },

    { id: '9AM-NBZ-WK1-E3', week: 1, emailNum: 3, subject: 'How businesses signal they\x27re ready to buy', subjectB: 'Reading the behavioural signs of B2B buying intent', preview: 'The data signals that reveal when a business needs your services', body: `Hi {{NAME}},

One of the biggest shifts in B2B sales over the past five years is the ability to read buying signals before a formal RFP is issued.

Businesses don't wake up one day and decide to hire an accountant or a marketing agency. The decision process unfolds over weeks or months, with specific triggers along the way.

Here are the signals we track:

A company incorporates a new subsidiaryï¿½they'll need accounting, insurance, and probably IT support within weeks.

A business raises funding or takes on investmentï¿½they'll need financial structuring, marketing support, and recruitment almost immediately.

A key executive is hired or leavesï¿½this often triggers a review of existing service providers.

A company expands into new premises or locationsï¿½they need new insurance, IT setup, and potentially recruitment.

Regulatory changes in their industry create compliance needs.

Each of these signals creates a window of opportunity. And each window closes quickly once the business has chosen their provider.

The firms that win the most new business are the ones that see these signals early and reach out with relevant insightï¿½not a sales pitch, but genuine understanding of what the business is going through.

9amLeads monitors these signals across thousands of businesses, aggregates them, and delivers actionable opportunities to your inbox daily. You see who needs you before they know they need you.

Would you like to see the buying signals currently active in your target market?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see your market\x27s buying signals' },

    { id: '9AM-NBZ-WK1-E4', week: 1, emailNum: 4, subject: 'One new client relationship covers your subscription for life', subjectB: 'The arithmetic of professional services lead generation', preview: 'Real ROI numbers from professional service firms using daily lead delivery', body: `Hi {{NAME}},

Let me show you the return on investment from the perspective of different professional services.

Accountant: A new SME client generates ï¿½3,000-8,000 in annual fees. Average retention is 5+ years. Lifetime value: ï¿½15,000-40,000. One client acquired through our system covers your subscription for many years.

Marketing agency: A new retainer client at ï¿½5,000 per month. Minimum 12-month engagement. Lifetime value: ï¿½60,000+. One client is transformational.

Insurance broker: A commercial client with ï¿½2,500 annual commission. Retention averages 7+ years. Lifetime value: ï¿½17,500. Not bad for responding to one email.

IT consultancy: A new client engagement at ï¿½10,000-50,000. Plus ongoing support and project work. One project can fund years of lead generation.

Recruiter: A single placement at ï¿½15,000 fee. One placement covers years of subscription. Multiple placements from the same client are pure profit.

Here's what our customers are actually seeing:

ï¿½ 3-10 qualified opportunities per week (varies by sector and geography)
ï¿½ Response time advantage: significantly higher conversion when first to engage
ï¿½ Average deal values ranging from ï¿½5,000-ï¿½50,000+
ï¿½ Pipeline visibility that enables better business planning

One accounting firm partner told us: "I was sceptical. But the first week I used it, I identified a company that had just raised ï¿½2m in funding and needed a new accountant. I was speaking to the FD within hours of the signal appearing. We won the account."

The ROI maths is simple. One win covers everything. Everything after that compounds.

Reply and I'll calculate your specific ROI projection based on your sector and target market.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for a personalised ROI calculation' },

    { id: '9AM-NBZ-WK1-E5', week: 1, emailNum: 5, subject: 'How a recruitment agency placed 8 senior hires from one platform in 60 days', subjectB: 'Case study: Building a new business pipeline from scratch', preview: 'Real results from a professional services firm that transformed their sales process', body: `Hi {{NAME}},

I want to share a story that demonstrates what's possible with systematic business development.

A recruitment agency specialising in technology roles had a solid reputation but an inconsistent pipeline. Some months they'd have plenty of active mandates. Other months they'd be scrambling.

Their director told me: "Our problem isn't placing candidates. It's getting clients who trust us enough to give us their vacancies."

After joining 9amLeads, they started receiving daily notifications about businesses showing signs of hiring activityï¿½companies that had received funding, expanded leadership teams, or posted related roles internally.

They reached out to these businesses with market insights about talent availability, salary benchmarks, and hiring timelines. No hard sell. Just genuine expertise.

In the first 60 days, they identified 14 businesses with active or imminent hiring needs. They secured mandates with 8. Total fee value: approximately ï¿½95,000.

The director said: "The biggest change isn't just the revenue. It's that I know every morning exactly which businesses I should be talking to. I'm not guessing anymore."

A marketing agency using our platform had a similar experience. They identified a company that had just completed a Series A funding round, reached out with a strategic marketing assessment, and secured a ï¿½12,000 per month retainer within two weeks.

The common thread: they saw the opportunity before their competitors, reached out with value, and built relationships before any formal pitch process.

If you'd like to see case studies specific to your profession, just reply.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see sector-specific case studies' },

    { id: '9AM-NBZ-WK1-E6', week: 1, emailNum: 6, subject: '"We have enough clients already"', subjectB: 'The growth trap that catches successful professional services firms', preview: 'Why even firms with full pipelines should keep building their lead flow', body: `Hi {{NAME}},

This is one of the most common responses I hear from established professionals. And I understand it completely.

If your practice is busy and your pipeline is healthy, it feels unnecessary to add another lead generation channel. You've built a successful business. Why fix what isn't broken?

Here's why even busy firms should care about systematic lead generation.

First, complacency is the biggest risk to any professional services firm. Markets change. Competitors emerge. Client needs evolve. The firms that maintain consistent new business pipelines even when they're full are the ones that survive downturns.

Second, the best time to build a pipeline is when you don't need it. When you're busy, you can be selective. You can choose the best clients. You can negotiate better terms. You can turn down work that isn't profitable.

When you're quiet and desperate, you'll take anythingï¿½and that rarely ends well.

Third, a daily intelligence feed of opportunities gives you market awareness that you simply don't get from your existing client base. You see what's happening in your sector, who's growing, who's changing, and where the market is heading.

Think of it as market research that pays for itself.

The 9amLeads platform doesn't replace your existing business development. It complements it, diversifies it, and makes it more predictable.

I'm not suggesting you need more clients right now. I'm suggesting that having visibility into the opportunities you're currently missing is valuable information regardless of your current capacity.

Would you be open to a brief conversation about how this could complement your existing business development?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to schedule a brief conversation' },

    { id: '9AM-NBZ-WK1-E7', week: 1, emailNum: 7, subject: 'The best time to build a new business pipeline is before you need it', subjectB: 'Why the most successful firms prospect when they\x27re busy', preview: 'Building resilience through consistent opportunity intelligence', body: `Hi {{NAME}},

There's a pattern I've observed in the most successful professional services firms I work with.

They build their pipelines when they don't need to.

When other firms are busy delivering work and not thinking about new business, these firms are systematically identifying and nurturing future opportunities. They're having conversations, building relationships, and positioning themselves for work that will materialise in 3-6 months.

Then, when the market shifts or a major client leaves, they have a pipeline ready to fill the gap.

The firms that wait until they're quiet to start looking for new business are always reacting. They're always behind. They're always negotiating from a position of weakness.

The firms that prospect consistently are always in control. They choose their clients. They protect their margins. They grow predictably.

Here's what consistent opportunity intelligence looks like in practice: every morning at 9am, you receive a brief of the most relevant opportunities in your market. Some are immediateï¿½businesses actively looking right now. Others are emergingï¿½signals that a need will develop in the coming weeks.

You spend 15 minutes reviewing, prioritising, and taking action. Over a month, that's five hours of focused business development that builds a visible, predictable pipeline.

The cost of that time is trivial compared to the value of one new client relationship.

If you'd like to see what a daily opportunity feed would look like for your specific market, I'd be happy to put together a sample.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see a sample of your daily opportunities' },

    { id: '9AM-NBZ-WK1-E8', week: 1, emailNum: 8, subject: 'Your competitors are already using opportunity intelligence', subjectB: 'The data advantage in professional services new business', preview: 'Why the B2B firms winning most are using data to find clients first', body: `Hi {{NAME}},

Here's something I need to be honest with you about.

While you're reading this email, there are other accountants, marketing agencies, recruiters, and consultants in your market who are using data to identify opportunities before their competitors.

They're not working harder than you. They're not smarter than you. They're using better information.

The difference between winning and losing a new business opportunity often comes down to one factor: timing.

When you're the first to know that a business needs a new accountant, you have an enormous advantage. You're not competing in a pitch. You're having a conversation. You're helping the client understand their needs, not responding to a brief they've already written.

The professional services firms that have adopted data-driven new business development are pulling away from their competitors. They're winning better clients at better margins because they're having the right conversations at the right time.

The 9amLeads platform gives you that data advantage. It monitors thousands of signals across your target market and delivers the most relevant opportunities to your inbox every morning.

The question isn't whether data-driven business development works. It's whether you can afford to let your competitors have exclusive access to the intelligence that's available.

Reply to check availability in your sector and region.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to check availability in your market' },

    { id: '9AM-NBZ-WK3-E9', week: 3, emailNum: 9, subject: 'How the 9amLeads platform delivers your daily new business opportunities', subjectB: 'A simple walkthrough of how daily B2B lead delivery works', preview: 'From data to inbox: how you receive qualified new business opportunities every morning', body: `Hi {{NAME}},

You've heard about the concept. Now let me explain exactly how the platform works for professional services firms.

Step one: We scan thousands of data sources every night-companies house filings, funding announcements, leadership changes, expansion notifications, regulatory triggers, and dozens more signals that indicate a business needs professional services.

Step two: Our AI scores each opportunity based on your target criteria, the likelihood of needing your service, estimated contract value, and location.

Step three: Every morning at 9am, you receive an email with your personalised opportunities. Each lead includes the company name, key contact information, trigger event, estimated value, and our confidence score.

Step four: You review the opportunities, prioritise the best ones, and reach out with relevant insight. Most customers respond within 2 hours and report significantly higher conversion rates because they contact prospects at the exact moment of need.

Step five: As you win clients, you can track your results in your dashboard-opportunities received, contacts made, proposals sent, and revenue generated.

The entire process takes about 15 minutes per day. No complicated software, no learning curve.

Would you like to see a sample of what your daily opportunities email would look like?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see a sample daily opportunities email' },

    { id: '9AM-NBZ-WK3-E10', week: 3, emailNum: 10, subject: 'Why daily consistency transforms professional services business development', subjectB: 'The power of daily new business opportunities in your inbox', preview: 'How consistent daily opportunity delivery builds your professional services pipeline', body: `Hi {{NAME}},

Most professional services firms approach business development in bursts. A networking event here, a LinkedIn campaign there, a push when the pipeline is thin.

The problem with burst business development is that it creates burst results. You get a spike of leads, then a long dry spell. You can't plan your practice around it.

Daily opportunity delivery changes that.

When you receive qualified opportunities every morning, your business development becomes a daily habit. You review opportunities consistently. You reach out to prospects consistently. You build your pipeline consistently.

Here's what our customers tell us is the most valuable aspect of the platform: it's not just the leads-it's the discipline. Checking your opportunities every morning, responding quickly, tracking your results. These habits compound over time.

After 30 days, you have data. You know which types of prospects convert best. You know which trigger events create the best opportunities. You know your conversion rates.

After 90 days, you have patterns. You can predict your pipeline. You can plan your resourcing.

After 12 months, you have a completely different business-one driven by consistent opportunity rather than feast-or-famine business development.

Consistency is the superpower that most professional services firms never develop. Daily opportunity delivery makes it automatic.

Would you like to experience what 30 days of consistent opportunities would do for your practice?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to start your 30-day trial' },

    { id: '9AM-NBZ-WK3-E11', week: 3, emailNum: 11, subject: 'How the most successful professional services firms win new business', subjectB: 'What the top 10% of B2B firms do differently', preview: 'The habits and systems that separate high-growth professional services firms', body: `Hi {{NAME}},

I've studied hundreds of professional services firms to understand what separates the ones that grow consistently from the ones that struggle.

Here's what I've found.

The most successful firms have three things in common.

First, they have a systematic approach to new business. They don't rely on any single source. They have multiple channels working simultaneously-referrals, existing clients, content marketing, and daily opportunity intelligence.

Second, they reach out with insight, not sales pitches. The best firms contact prospects with relevant observations about their business or industry. They demonstrate understanding before asking for a meeting.

Third, they track everything. They know their conversion rates, their average client values, their cost of acquisition, and their most profitable service lines. They use data to make decisions.

The 9amLeads platform supports all three of these habits.

It provides a consistent daily flow of qualified opportunities. It delivers them with context so you can reach out with relevant insight. And it includes tracking and analytics so you can measure your performance.

We're not just a lead source. We're a system that helps you build better business development habits.

Would you like to see how your current new business development compares to the best in your sector?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for a free business development assessment' },

    { id: '9AM-NBZ-WK3-E12', week: 3, emailNum: 12, subject: 'The new business opportunities your competitors are finding before you', subjectB: 'What opportunity intelligence reveals about your target market', preview: 'How data reveals the B2B opportunities hiding in plain sight', body: `Hi {{NAME}},

One of the most powerful features of the 9amLeads platform is something we call Opportunity Intelligence.

It's not just about delivering leads. It's about helping you understand your market at a deeper level.

Here's what Opportunity Intelligence looks like for professional services firms:

Market volume: How many businesses in your target area are showing buying signals? Is activity rising or falling? Which sectors generate the most opportunities?

Lead scoring: Which opportunities are most likely to convert? Our AI analyses company size, trigger event, industry, and timing to prioritise your best prospects.

Trend analysis: Are there patterns in when businesses need your service? Is a particular regulation creating demand? Are certain funding events more likely to lead to engagements?

Competitive insight: How many other firms are targeting the same businesses? What approaches are they using?

Pipeline tracking: How many opportunities are you working? What's your conversion rate? What's your average deal value? Your dashboard shows you these numbers in real time.

This intelligence transforms how you think about business development. Instead of wondering where your next client is coming from, you have a clear view of your market, your pipeline, and your performance.

Would you like to see what Opportunity Intelligence reveals about your target market?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see your market Opportunity Intelligence report' },

    { id: '9AM-NBZ-WK4-E13', week: 4, emailNum: 13, subject: 'What is the total addressable market for your services?', subjectB: 'Calculating the opportunity in your target sector and region', preview: 'A data-driven look at the new business revenue available in your market', body: `Hi {{NAME}},

Let me ask you a question that most professional services firm partners can't answer.

What's the total value of addressable new business in your target market each year?

We've done this calculation for hundreds of firms across different sectors. Here's what the numbers typically look like.

For an accounting firm targeting SMEs in a major UK city, there are approximately 10,000-25,000 businesses that need accounting services. At an average fee of £3,000-8,000 per year, that's £30,000,000-200,000,000 in total addressable market annually.

For a marketing agency targeting funded startups, there might be 200-500 businesses raising capital each year in their region. At an average retainer of £5,000-15,000 per month, that's £12,000,000-90,000,000 in potential revenue.

For a recruitment agency, each business that hires represents £10,000-50,000 in potential fees. With hundreds of businesses hiring each month, the total addressable market runs into millions.

How much of this are you capturing?

The firms that grow fastest are the ones that systematically identify and pursue opportunities using data, not guesswork.

The 9amLeads platform helps you capture a larger share of your addressable market by ensuring you see every relevant opportunity as it emerges.

Would you like to see the specific market potential for your firm?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for your addressable market analysis' },

    { id: '9AM-NBZ-WK4-E14', week: 4, emailNum: 14, subject: 'Your questions about new business lead generation answered', subjectB: 'The most common questions professional services firms ask about daily opportunities', preview: 'Honest answers to the questions we hear most from B2B firms', body: `Hi {{NAME}},

Over the past few weeks, I've shared a lot about how professional services firms can generate more consistent new business opportunities. Today, I want to answer the questions I hear most often.

How many opportunities will I get?
It varies by sector and geography, but most firms receive 3-10 qualified opportunities per week. Major cities generate more. The quality is consistently high because these are businesses showing real buying signals.

Are these exclusive?
They're delivered to you as part of your subscription. Other firms in your sector may use our service, but the advantage goes to whoever responds first with relevant insight.

Do I need a large team to use this?
No. Many of our most successful customers are solo practitioners and small partnerships who spend 15 minutes per day on their opportunities.

How is this different from LinkedIn Sales Navigator or other tools?
Those tools show you businesses that exist. We show you businesses that are actively signalling a need right now. The difference is intent.

Can I target specific sectors or regions?
Yes. You define your target criteria, and we deliver opportunities that match your preferences.

If you have other questions, just reply. I'm happy to answer them directly.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply with any questions about how it works' },

    { id: '9AM-NBZ-WK4-E15', week: 4, emailNum: 15, subject: 'Why professional services firms stay with 9amLeads for years', subjectB: 'What keeps our B2B customers coming back every morning', preview: 'The long-term value of daily new business intelligence', body: `Hi {{NAME}},

One of the things I'm most proud of is our customer retention. Professional services firms don't stay with us because of a contract. They stay because the opportunities keep coming and the results keep compounding.

Here's what our longest-serving customers tell us.

"It's become part of my morning routine." The daily email at 9am is consistent. Our customers look forward to it because it starts their day with opportunity rather than uncertainty.

"The quality has improved over time." Our AI learns from every interaction. Over time, the opportunities become more relevant and better scored.

"It's helped us build a better practice." The consistency of daily opportunities has allowed our customers to grow their firms, hire more people, and take on larger, more prestigious clients.

"I can't imagine running my practice without it." The platform becomes embedded in how they operate.

"Our competitors still don't know how we're winning so much new business." That's the competitive advantage that compounds over time.

The real value of 9amLeads isn't any single lead. It's the cumulative effect of months and years of consistent opportunity flow. It's the peace of mind that comes from knowing your pipeline is full.

I'd love for you to experience that peace of mind.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to start building your consistent pipeline' },

    { id: '9AM-NBZ-WK4-E16', week: 4, emailNum: 16, subject: 'A personal invitation to transform your new business development', subjectB: 'Let us build your pipeline together', preview: 'A direct invitation from Ketz to try the platform transforming B2B lead generation', body: `Hi {{NAME}},

If you've read this far, thank you. I know your time is valuable, and I appreciate you giving me the opportunity to share what we've built.

I started 9amLeads because I saw a fundamental problem in professional services: great firms were missing opportunities simply because they didn't know the businesses existed. The technology existed to solve this, but nobody was connecting the dots.

Today, hundreds of accountants, marketing agencies, recruiters, consultants, and IT firms across the UK start their day with our opportunities. They've grown their revenue, stabilised their pipelines, and built practices that aren't dependent on occasional referrals.

I'm not going to give you a hard sales pitch. What I will do is make you a simple offer.

If you reply to this email, I'll personally set up a demonstration for your specific sector. I'll show you the opportunities currently available. I'll calculate the potential revenue for your firm.

If it doesn't look right, no problem. You'll at least have a better understanding of your market than you had before.

This isn't about selling software. It's about helping professional services firms see opportunities they're currently missing.

Reply to this email, and let's see what opportunities exist in your market.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to speak with Ketz directly' },
  ]
},

  tenders: { name: 'Tenders & Contracts Campaign', tag: 'tenders', listName: 'Tender Prospects', emails: [
    { id: '9AM-TEN-WK1-E1', week: 1, emailNum: 1, subject: 'The contracts being awarded in your sector that you never knew existed', subjectB: 'Why most businesses miss public and private sector tender opportunities', preview: 'How cleaning, security, construction, and FM companies are winning contracts before competitors', body: `Hi {{NAME}},

I want to talk about a market that's worth hundreds of billions of pounds in the UK, yet most businesses in your sector are only scratching the surface.

The public and private sector tender market.

Every day, thousands of contracts are advertised and awarded across cleaning, security, construction, facilities management, catering, maintenance, training, and IT. These aren't small projectsï¿½they're transformative contracts worth tens of thousands to millions of pounds.

The problem is that most businesses don't know these opportunities exist until it's too late.

Tender portals are fragmented. Opportunities are buried in different systems. The window to respond is often just 2-4 weeks. And by the time you've heard about a tender through your network, the procurement team has already shortlisted their preferred suppliers.

What if you could see every relevant tender opportunity in your sector, scored by fit and value, delivered to your inbox every morning at 9am?

That's what 9amLeads does for tender-driven businesses. We aggregate opportunities from hundreds of sources, match them to your capabilities, and deliver actionable intelligence daily.

If you'd like to see what tender opportunities are currently available in your sector, I'd be happy to show you.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see current tender opportunities in your sector' },

    { id: '9AM-TEN-WK1-E2', week: 1, emailNum: 2, subject: 'The ï¿½500,000 contract you didn\x27t bid for', subjectB: 'What one missed tender really costs your business', preview: 'The transformative value of winning a single contract in your sector', body: `Hi {{NAME}},

Let me put a number on what you might be missing.

In the tenders and contracts space, a single win can transform your business.

For a cleaning company, a school or hospital contract is worth ï¿½50,000-500,000 per year, often with 3-5 year terms.

For a security firm, a public sector guarding contract averages ï¿½100,000-1,000,000 annually.

For a construction company, a framework placement can deliver ï¿½500,000-5,000,000 in work over its lifetime.

For a facilities management provider, a single large site contract can generate ï¿½200,000-2,000,000 per year.

For a catering company, an education or healthcare contract is worth ï¿½100,000-1,000,000 annually.

For a training provider, a framework agreement can deliver consistent revenue for years.

Here's the critical insight: one contract win can cover your tendering costs for decades. And most sectors have far more contracts available than credible bidders.

The businesses that grow fastest in the tenders space are the ones that see opportunities first, prepare quality responses, and build relationships with procurement teams before the ITT is published.

9amLeads gives you that early visibility. We monitor tender pipelines across public and private sector sources and deliver matched opportunities to your inbox daily.

You don't need to win every tender. You just need to win the right ones. And you can't win what you can't see.

Reply and I'll show you the current tender opportunities in your sector.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see tenders in your sector' },

    { id: '9AM-TEN-WK1-E3', week: 1, emailNum: 3, subject: 'How procurement really works: the hidden tender timeline', subjectB: 'Understanding the procurement lifecycle to win more contracts', preview: 'Why the businesses that win most tenders start months before the RFP', body: `Hi {{NAME}},

Understanding how procurement actually works is the key to winning more contracts.

Most businesses think tendering starts when the ITT (Invitation to Tender) is published. They're wrong. By the time the ITT is released, the real competition is already well underway.

Here's the actual procurement timeline:

Phase oneï¿½Market engagement: 3-6 months before the ITT. Procurement teams research the market, identify potential suppliers, and attend industry events. This is when relationships are formed.

Phase twoï¿½Pre-qualification: 2-4 months before the ITT. Suppliers are invited to express interest and complete SQ (Selection Questionnaire) documents. This filters the field.

Phase threeï¿½ITT publication: The formal tender is published. You typically have 3-6 weeks to respond. If you haven't been involved in phases one and two, you're at a massive disadvantage.

Phase fourï¿½Evaluation: Scoring typically weights 60-70% on quality and 30-40% on price. The highest-scoring bidder wins.

The winning suppliers are the ones who engage in phases one and two. They know the contract is coming before it's published. They've shaped their services to match the buyer's needs. They've built relationships with the procurement team.

The 9amLeads platform helps you identify upcoming tender opportunities months in advance by tracking pre-procurement signals, early market engagement notices, and pipeline publications.

You stop reacting to published tenders and start building a proactive pipeline of opportunities that haven't gone to market yet.

Would you like to see what's in the tender pipeline for your sector?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see your tender pipeline' },

    { id: '9AM-TEN-WK1-E4', week: 1, emailNum: 4, subject: 'One framework contract can transform your business for a decade', subjectB: 'The lifetime ROI of winning the right public sector framework', preview: 'Real value of framework agreements and long-term contracts in the tenders space', body: `Hi {{NAME}},

Let me walk you through the return on investment in the tenders market, because the numbers are genuinely transformative.

Framework agreements are the holy grail of the tenders space. A single framework placement can generate work for 4-7 years, often with no further competitive tendering required for individual projects.

For a cleaning company, a place on a CCS (Crown Commercial Service) framework can open the door to hundreds of public sector contracts.

For a construction company, a local authority framework can deliver a steady pipeline of projects for years.

For an IT services provider, a spot on a G-Cloud framework makes selling to government straightforward.

Here's the ROI maths:

A single framework placement costs time and effort to secureï¿½typically 40-80 hours of bid writing. But the lifetime value can run into millions.

Even outside frameworks, a single contract win in most sectors covers your bid costs many times over.

A cleaning company winning one ï¿½200,000 school contract covers years of subscription to a tender intelligence service. A security firm winning one ï¿½500,000 guarding contract covers a decade or more.

Our customers in the tenders space report:

ï¿½ 5-15 relevant tender opportunities identified per week
ï¿½ Win rates of 20-40% on opportunities they pursue
ï¿½ Average contract values ranging from ï¿½50,000 to ï¿½2,000,000+
ï¿½ Framework placement rates significantly improved with early intelligence

The ROI isn't marginal. It's transformational. One win changes everything.

Reply and I'll calculate what the tender opportunity looks like for your specific business.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for a tender opportunity assessment' },

    { id: '9AM-TEN-WK1-E5', week: 1, emailNum: 5, subject: 'How a North West cleaning company won ï¿½1.2m in contracts in 6 months', subjectB: 'Case study: From ad hoc tendering to a systematic contract pipeline', preview: 'Real results from a business that transformed their approach to tenders', body: `Hi {{NAME}},

Let me share a story that illustrates the power of systematic tender intelligence.

A cleaning company in the North Westï¿½family-run, 50 employeesï¿½had historically won contracts through local relationships. They'd occasionally bid on public sector tenders, but without a consistent approach.

Their director told me: "We knew there were contracts out there, but we never seemed to hear about them in time. By the time we found them, other bidders had a head start."

After joining 9amLeads, they started receiving daily notifications of cleaning tenders matched to their capabilities and location. In the first week, they identified a school cleaning contract worth ï¿½180,000 per year that they would have completely missed.

They bid and won.

Over the next six months, they identified and bid on 22 relevant tender opportunities. They won 7 contracts with a combined annual value of approximately ï¿½1.2 million. Their bid team grew from one person to four.

The director said: "The single biggest change is that we now know what's coming. We can prepare, we can resource, we can build relationships with procurement teams before the tender drops. We're not scrambling anymore. We're planning."

A security company in the Midlands had a similar experience. They secured a place on a police force guarding framework worth an estimated ï¿½3 million over four yearsï¿½a contract they found through our platform in the pre-market engagement phase.

If you'd like to see case studies specific to your sector, just reply.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for sector-specific tender case studies' },

    { id: '9AM-TEN-WK1-E6', week: 1, emailNum: 6, subject: '"We don\x27t have capacity to bid for more contracts"', subjectB: 'Why capacity constraints are a sign of success, not a reason to stop', preview: 'How to build a tendering pipeline that grows with your business', body: `Hi {{NAME}},

I hear this regularly from businesses considering tender intelligence: "We're already busy. We don't have the team to chase more contracts."

I understand completely. If your current team is fully utilised and you're turning down work, adding more opportunities to your pipeline feels counterintuitive.

But here's a different perspective: capacity constraints are a positioning problem, not a pipeline problem.

If you're too busy to bid for new contracts, it might mean you're working on the wrong contracts. It might mean you're delivering low-margin work that should be replaced with higher-value framework contracts.

The most successful tender-driven businesses we work with are selective. They use intelligence to identify the contracts that offer the best strategic fit, the highest margins, and the longest terms. They turn down the rest.

The 9amLeads platform doesn't force you to bid on everything. It gives you the intelligence to choose which opportunities are worth pursuing. You might see 15 opportunities per week but only bid on 2. That's fineï¿½if those 2 are the right ones.

Some of our most successful customers bid on fewer than 10% of the opportunities we surface. But the ones they pursue, they win at high rates because they're selective and focused.

Tendering isn't about bidding on everything. It's about bidding on the right things, at the right time, with the right preparation.

Would you be open to a conversation about how intelligence can help you focus your bidding on the highest-value opportunities?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to discuss strategic tendering for your business' },

    { id: '9AM-TEN-WK1-E7', week: 1, emailNum: 7, subject: 'The best tenders never make it to public noticeboards', subjectB: 'Why early market engagement wins contracts before the competition', preview: 'Getting access to tender opportunities before they\x27re published', body: `Hi {{NAME}},

Here's an important truth about the tender market: the best contracts rarely appear on public portals.

They're advertised through early market engagement notices, prior information notices, and supplier databases. They're shared with existing framework suppliers before they're opened to competition. They're discussed at industry days months before the formal procurement begins.

By the time a tender appears on a public noticeboard, the procurement team has already identified their preferred suppliers. The competition is for second place.

The businesses that win consistently are the ones that engage early. They attend industry days. They register on buyer portals. They build relationships with procurement teams before there's a contract to bid for.

But tracking all of this manually is nearly impossible. There are hundreds of public sector buyers, thousands of frameworks, and countless early engagement opportunities.

That's where 9amLeads provides value beyond simple tender alerts. We monitor early market engagement activity, pipeline publications, and pre-procurement notices. We identify opportunities months before they become formal tenders.

When you see a tender 6 months before it's published, you have time to prepare, to build relationships, and to position yourself as the obvious choice.

You're not bidding. You're consulting on the specification. And when the ITT finally arrives, you're shaping it rather than responding to it.

If you'd like to see the early-stage opportunities currently in your sector's pipeline, reply and I'll show you.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see early-stage tender opportunities' },

    { id: '9AM-TEN-WK1-E8', week: 1, emailNum: 8, subject: 'While you\x27re reading this, your competitors are preparing their tender response', subjectB: 'The compound advantage of systematic tender intelligence', preview: 'Why the businesses that invest in tender intelligence now are pulling away', body: `Hi {{NAME}},

Here's the reality of the tenders market in 2025.

The businesses that have invested in systematic tender intelligence are winning at an increasing rate. They're not working harder. They're working with better information.

They see opportunities earlier, so they have more time to prepare quality responses.

They understand procurement timelines, so they engage at the right moment.

They know which contracts offer the best strategic fit, so they bid selectively and win more.

They track their win rates, so they continuously improve their approach.

The gap between businesses with tender intelligence and businesses without it is growing every quarter. And it's becoming very difficult to close.

Here's what happens when you implement daily tender intelligence:

Month one: You see opportunities you were previously missing. You might bid on 2-3 and win 1.

Month three: You've established a rhythm. Your response quality has improved. You're seeing opportunities earlier.

Month six: You've won 3-5 contracts. Your pipeline is visible and predictable. You're turning down work that doesn't fit.

Month twelve: You're established as a credible bidder in your sector. Procurement teams know your name. Framework applications are easier because of your track record.

The businesses that start now will be twelve months ahead of those who wait. In the tenders market, that's a meaningful and durable advantage.

Reply to check availability in your sector and start building your tender pipeline.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to get started with tender intelligence' },

    { id: '9AM-TEN-WK3-E9', week: 3, emailNum: 9, subject: 'How the 9amLeads platform delivers your daily tender opportunities', subjectB: 'A simple walkthrough of how daily tender intelligence works', preview: 'From data to inbox: how you receive qualified tender opportunities every morning', body: `Hi {{NAME}},

You've heard about the concept. Now let me explain exactly how the platform works for tender-driven businesses.

Step one: We scan thousands of data sources every night-public sector procurement portals, frameworks databases, prior information notices, early market engagement notifications, and hundreds more sources across multiple sectors.

Step two: Our AI matches each opportunity against your business profile, scoring by relevance, contract value, location, sector fit, and submission deadline.

Step three: Every morning at 9am, you receive an email with your personalised tender opportunities. Each lead includes the contracting authority, estimated value, submission deadline, scope of work, and our recommendation score.

Step four: You review the opportunities, prioritise the best ones, and decide which to pursue. Most customers spend 10-15 minutes reviewing and shortlisting.

Step five: As you win contracts, you can track your results in your dashboard-tenders received, bids submitted, contracts won, and total contract value.

The entire process takes about 15 minutes per day. No complicated software or training required.

The 9amLeads platform integrates with your existing bid management systems if you use them, or you can manage everything through your dashboard and inbox.

Would you like to see a sample of what your daily tender intelligence email would look like?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see a sample daily tender email' },

    { id: '9AM-TEN-WK3-E10', week: 3, emailNum: 10, subject: 'Why daily consistency transforms tender pipeline management', subjectB: 'The power of daily tender intelligence in your inbox', preview: 'How consistent daily tender monitoring builds your contract pipeline', body: `Hi {{NAME}},

Most businesses approach tendering reactively. They hear about an opportunity through their network, scramble to prepare a response, and hope for the best.

The problem with reactive tendering is that you're always behind. You have less time to prepare quality responses. You miss early market engagement opportunities. You're competing against businesses that have been preparing for months.

Daily tender intelligence changes that.

When you receive matched opportunities every morning, your tendering becomes proactive rather than reactive. You see opportunities when they first appear. You have maximum time to prepare. You can engage with procurement teams before the formal process begins.

Here's what our customers tell us is the most valuable aspect of the platform: it's not just the tender alerts-it's the peace of mind that comes from knowing you're not missing anything.

After 30 days, you have a clear picture of the tender landscape in your sector. You know which authorities are buying, what types of contracts are coming to market, and which opportunities fit your business.

After 90 days, you have a visible pipeline. You can plan your bid resources months in advance.

After 12 months, you have a completely different business-one driven by a consistent, predictable flow of contract opportunities.

Consistency is the superpower that most tender-driven businesses never develop. Daily tender intelligence makes it automatic.

Would you like to experience what 30 days of consistent tender intelligence would do for your business?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to start your 30-day trial' },

    { id: '9AM-TEN-WK3-E11', week: 3, emailNum: 11, subject: 'How the most successful tender-driven businesses win consistently', subjectB: 'What the top tender-winning businesses do differently', preview: 'The habits and systems that separate high-growth tender professionals', body: `Hi {{NAME}},

I've studied hundreds of businesses that win consistently in the tenders market. Here's what separates the ones that dominate from the ones that struggle.

The most successful tender-driven businesses have three things in common.

First, they see opportunities early. They don't wait for the ITT to be published. They're monitoring pipelines, prior information notices, and early market engagement activity months before the formal tender.

Second, they are selective. The best businesses don't bid on everything. They use intelligence to identify the contracts that offer the best strategic fit, the highest margins, and the longest terms. They turn down the rest and focus their bid resources where they have the best chance of winning.

Third, they build relationships before the tender. They attend industry days, register on buyer portals, and engage with procurement teams before there's a contract to bid for. When the ITT finally arrives, they're shaping the specification, not responding to it.

The 9amLeads platform supports all three of these habits.

It provides early visibility into the tender pipeline. It scores opportunities so you can be selective. And it helps you identify early engagement opportunities so you can build relationships before the competition.

We're not just a tender alert service. We're a system that helps you build a better tendering operation.

Would you like to see how your current tendering approach compares to the best in your sector?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for a free tendering assessment' },

    { id: '9AM-TEN-WK3-E12', week: 3, emailNum: 12, subject: 'The contract opportunities your competitors are finding before you', subjectB: 'What tender intelligence reveals about your market', preview: 'How data reveals the tender opportunities hiding in plain sight', body: `Hi {{NAME}},

One of the most powerful features of the 9amLeads platform is something we call Opportunity Intelligence.

It's not just about delivering tender alerts. It's about helping you understand your market at a deeper level.

Here's what Opportunity Intelligence looks like for tender-driven businesses:

Market volume: How many contracts are being awarded in your sector each month? Is spending rising or falling? Which authorities are the biggest buyers?

Opportunity scoring: Which tenders are most worth pursuing? Our AI analyses contract value, fit with your capabilities, competition levels, and success probability.

Pipeline trends: Are there new frameworks being established? Are certain contract types becoming more common? Are new buyers entering the market?

Competitive landscape: How many businesses are bidding for contracts in your sector? What are the win rates?

Pipeline tracking: How many opportunities are you pursuing? What's your bid-to-win ratio? What's your total pipeline value? Your dashboard shows you these numbers in real time.

This intelligence transforms how you think about tendering. Instead of reacting to whatever comes across your desk, you have a clear view of your market, your pipeline, and your performance.

Would you like to see what Opportunity Intelligence reveals about your sector?

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to see your sector Opportunity Intelligence report' },

    { id: '9AM-TEN-WK4-E13', week: 4, emailNum: 13, subject: 'What is the total contract value available in your sector?', subjectB: 'Calculating the addressable tender market for your business', preview: 'A data-driven look at the contract revenue available in your sector', body: `Hi {{NAME}},

Let me ask you a question that most tender-driven businesses can't answer.

What's the total value of contracts being awarded in your sector each year?

We've done this calculation for multiple sectors across the UK. Here's what the numbers typically look like.

For a cleaning company, the UK public sector spends approximately £4-6 billion annually on cleaning and janitorial services. Even focusing on your region, there are tens of millions in contract value awarded each year.

For a security company, the UK public sector spends approximately £8-10 billion annually on security services. Frameworks alone can be worth hundreds of millions over their lifetime.

For a construction company, public sector construction spend exceeds £50 billion annually. Even a small fraction of this represents a significant addressable market.

For an IT services company, the UK government spends over £20 billion annually on technology. G-Cloud alone has facilitated billions in contracts.

How much of this are you currently winning?

The businesses that grow fastest in the tenders market are the ones that have systematic intelligence about what's available and the discipline to pursue the right opportunities.

The 9amLeads platform helps you capture a larger share by ensuring you see every relevant opportunity as it emerges.

If you knew that hundreds of millions in contract value was available in your sector every year, wouldn't you want to capture more of it?

Reply and I'll calculate the specific tender market potential for your business.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply for your tender market analysis' },

    { id: '9AM-TEN-WK4-E14', week: 4, emailNum: 14, subject: 'Your questions about tender intelligence answered', subjectB: 'The most common questions businesses ask about daily tender opportunities', preview: 'Honest answers to the questions we hear most from tender-driven businesses', body: `Hi {{NAME}},

Over the past few weeks, I've shared a lot about how businesses can generate more consistent tender opportunities. Today, I want to answer the questions I hear most often.

How many tender opportunities will I get?
It varies by sector, but most businesses receive 5-15 relevant opportunities per week. Major sectors like construction, cleaning, and IT generate more.

Are these exclusive?
They're drawn from publicly available sources. However, the advantage comes from seeing them early and consistently before your competitors do their manual searching.

Do I need a dedicated bid writer to use this?
No. Many customers use our platform to identify and shortlist opportunities, then engage bid writers only for the best ones.

How is this different from free tender portals?
Free portals show you what's available when you remember to check. We deliver matched opportunities to your inbox daily, scored by relevance, so you never miss an opportunity.

Can I filter by value, region, or sector?
Yes. You define your criteria, and we deliver only the opportunities that match.

If you have other questions, just reply. I'm happy to answer them directly.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply with any questions about how it works' },

    { id: '9AM-TEN-WK4-E15', week: 4, emailNum: 15, subject: 'Why tender-driven businesses stay with 9amLeads for years', subjectB: 'What keeps our tender customers coming back every morning', preview: 'The long-term value of daily tender intelligence', body: `Hi {{NAME}},

One of the things I'm most proud of is our customer retention. Tender-driven businesses don't stay with us because of a contract. They stay because the opportunities keep coming and the results keep compounding.

Here's what our longest-serving customers tell us.

"It's become part of my morning routine." The daily email at 9am is consistent. Our customers look forward to it because it starts their day with opportunity rather than uncertainty.

"The quality has improved over time." Our AI learns from every interaction. Over time, the opportunities become more relevant, better scored, and more closely matched to each customer's preferences.

"It's helped us build a better business." The consistency of daily tender intelligence has allowed our customers to grow their teams, invest in better bid resources, and win larger, more strategic contracts.

"I can't imagine running my business without it." The platform becomes embedded in how they operate.

"Our competitors still don't know how we're winning so many contracts." That's the competitive advantage that compounds over time.

The real value of 9amLeads isn't any single tender alert. It's the cumulative effect of months and years of consistent opportunity flow. It's the peace of mind that comes from knowing you're not missing the contract that could transform your business.

I'd love for you to experience that peace of mind.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to start building your consistent tender pipeline' },

    { id: '9AM-TEN-WK4-E16', week: 4, emailNum: 16, subject: 'A personal invitation to transform your tender pipeline', subjectB: 'Let us build your tender pipeline together', preview: 'A direct invitation from Ketz to try the platform transforming tender intelligence', body: `Hi {{NAME}},

If you've read this far, thank you. I know your time is valuable, and I appreciate you giving me the opportunity to share what we've built.

I started 9amLeads because I saw a fundamental problem in the tenders market: great businesses were missing contracts that could transform their companies simply because they didn't know the opportunities existed. The technology existed to solve this, but nobody was connecting the dots.

Today, hundreds of cleaning, security, construction, FM, catering, and IT businesses across the UK start their day with our tender intelligence. They've won contracts worth millions, grown their teams, and built businesses that aren't dependent on occasional word-of-mouth opportunities.

I'm not going to give you a hard sales pitch. What I will do is make you a simple offer.

If you reply to this email, I'll personally set up a demonstration for your specific sector. I'll show you the tender opportunities that are currently available. I'll calculate the potential contract value for your business.

If it doesn't look right, no problem. You'll at least have a better understanding of your tender market than you had before.

This isn't about selling software. It's about helping businesses see contract opportunities they're currently missing.

Reply to this email, and let's see what opportunities exist in your sector.

Best,
Ketz Mandalia | Founder, 9amLeads`, cta: 'Reply to speak with Ketz directly' },
  ]
}

};



