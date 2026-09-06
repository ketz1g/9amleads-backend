// Planning Data Collector
// Uses the planning provider interface to collect from Plota (primary) or other providers.
// Add new providers via planning_provider.js — no changes needed here.
//
// Usage:
//   const planner = require('./planning_collector');
//   const result = await planner.collectFreshPlanning(48);
//   // Returns { leads: [...], status: 'ok', message: '...' }

const fs = require('fs');
const path = require('path');
const planningProvider = require('./planning_provider');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SEEN_APPS_FILE = path.join(DATA_DIR, 'seen-planning-apps.json');

// Load the Plota provider
try { require('./plota_provider'); } catch(e) { console.log('[PLANNING] Plota provider not loaded:', e.message); }

// Load / save dedup set
function loadSeenApps() {
  try { return new Set(JSON.parse(fs.readFileSync(SEEN_APPS_FILE, 'utf-8'))); } catch(e) { return new Set(); }
}
function saveSeenApps(set) {
  fs.writeFileSync(SEEN_APPS_FILE, JSON.stringify([...set]));
}

// Load / save dedup set
function loadSeenApps() {
  try { return new Set(JSON.parse(fs.readFileSync(SEEN_APPS_FILE, 'utf-8'))); } catch(e) { return new Set(); }
}
function saveSeenApps(set) {
  fs.writeFileSync(SEEN_APPS_FILE, JSON.stringify([...set]));
}

// Extract postcode area
function extractPostcodeArea(pc) {
  if (!pc) return '';
  return pc.toUpperCase().replace(/[^A-Z].*$/, '');
}

// Categorise a planning application by trade based on proposal description
function categoriseTrade(proposal, description) {
  var text = ((proposal || '') + ' ' + (description || '')).toLowerCase();
  var categories = [];
  for (var trade in TRADE_KEYWORDS) {
    var keywords = TRADE_KEYWORDS[trade];
    for (var ki = 0; ki < keywords.length; ki++) {
      if (text.includes(keywords[ki])) { categories.push(trade); break; }
    }
  }
  return categories.length > 0 ? categories : ['other'];
}

// Main: collect fresh planning applications from the active provider
async function collectFreshPlanning(freshnessHours, areasHint) {
  var seen = loadSeenApps();
  var result = { leads: [], status: 'no_provider', message: 'No planning provider configured' };

  // Try each registered provider in order until one returns data
  var providerNames = planningProvider.list();
  for (var pi = 0; pi < providerNames.length; pi++) {
    var provider = planningProvider.get(providerNames[pi]);
    if (!provider || !provider.collectFresh) continue;
    try {
      var r = await provider.collectFresh({ freshnessHours: freshnessHours || 48, counties: areasHint, areas: areasHint });
      if (r && r.leads && r.leads.length > 0) {
        // Dedup by reference + council
        var deduped = [];
        for (var li = 0; li < r.leads.length; li++) {
          var l = r.leads[li];
          var dedupKey = l.council + ':' + l.reference;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
          deduped.push(l);
        }
        saveSeenApps(seen);
        console.log('[PLANNING] Provider "' + providerNames[pi] + '": ' + deduped.length + ' leads after dedup');
        return deduped;
      }
      result = r;
    } catch(e) {
      console.log('[PLANNING] Provider "' + providerNames[pi] + '" error:', e.message);
    }
  }

  console.log('[PLANNING] No leads from any provider. Last result:', result.status, result.message);
  return [];
}

module.exports = { collectFreshPlanning, categoriseTrade };
