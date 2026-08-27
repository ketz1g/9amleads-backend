// Companies House Streaming API — Persistent Background Worker
// Long-running HTTP connection that processes real-time company incorporation events.
// Starts without a timepoint to receive live events immediately from the moment of connection.
// Saves timepoints continuously and reconnects with exponential backoff after any interruption.
//
// Usage:
//   const worker = require('./streaming_worker');
//   worker.start(apiKey);        // Start background worker
//   worker.getStatus();          // { connected, connectedSince, lastEventAt, lastTimepoint,
//                                 //   eventsToday, companiesToday, duplicates, stale, reconnects, lag }
//   worker.getRecentCompanies(); // Array of companies queued since last delivery

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TIMEPOINT_FILE = path.join(DATA_DIR, 'stream-timepoint.json');
const SEEN_FILE = path.join(DATA_DIR, 'stream-seen-companies.json');
const QUEUE_FILE = path.join(DATA_DIR, 'stream-queue.json');
const LAG_WARN_SECONDS = 300; // Alert if no event for 5 minutes

// Worker state
var state = {
  connected: false,
  connectedSince: null,
  lastEventAt: null,
  lastTimepoint: null,
  eventsToday: 0,
  companiesToday: 0,
  duplicates: 0,
  stale: 0,
  reconnects: 0,
  lag: 0,
  lastError: null,
  workerActive: false,
  req: null
};

var recentCompanies = [];
var eventTypeLog = []; // diagnostic: last event types seen (kind:type)

function loadTimepoint() {
  try { return JSON.parse(fs.readFileSync(TIMEPOINT_FILE, 'utf-8')); } catch(e) { return null; }
}
function saveTimepoint(tp) {
  fs.writeFileSync(TIMEPOINT_FILE, JSON.stringify(tp));
  state.lastTimepoint = tp;
}

function loadSeenCompanies() {
  try { return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf-8'))); } catch(e) { return new Set(); }
}
function saveSeenCompanies(set) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...set]));
}

function loadQueue() {
  try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8')); } catch(e) { return []; }
}
function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue.slice(-5000)));
}

function extractPostcodeArea(pc) {
  if (!pc) return '';
  return pc.toUpperCase().replace(/[^A-Z].*$/, '');
}

function fetchCompanyProfile(companyNumber, apiKey) {
  return new Promise((resolve) => {
    // Company profile comes from the REST API, which uses the REST key
    // (COMPANIES_HOUSE_API_KEY) — NOT the stream key. The stream key only works on
    // stream.companieshouse.gov.uk; using it here 401s and drops every company.
    var restKey = process.env.COMPANIES_HOUSE_API_KEY || apiKey;
    var req = https.get({ hostname: 'api.company-information.service.gov.uk', path: '/company/' + encodeURIComponent(companyNumber), headers: { 'Authorization': 'Basic ' + Buffer.from(restKey + ':').toString('base64') }, timeout: 15000 }, (res) => {
      var body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch(e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
  });
}

// Check if today is a working day
function isWorkingDay() {
  var d = new Date();
  return d.getDay() !== 0 && d.getDay() !== 6; // Mon-Fri
}

// Connect to the stream and process events continuously
function connect(apiKey) {
  if (state.req) { try { state.req.destroy(); } catch(e) {} }

  var savedTp = loadTimepoint();
  var streamPath = '/companies';
  // Only send timepoint if we have a previously saved one (not on first ever connection)
  if (savedTp !== null && savedTp > 0) {
    streamPath += '?timepoint=' + savedTp;
    console.log('[STREAM] Resuming from timepoint ' + savedTp);
  } else {
    console.log('[STREAM] Starting fresh — receiving live events from now (no timepoint)');
  }

  var opts = {
    hostname: 'stream.companieshouse.gov.uk',
    path: streamPath,
    headers: { 'Authorization': 'Basic ' + Buffer.from(apiKey + ':').toString('base64') },
    timeout: 0 // No timeout — long-lived connection
  };

  state.connected = false;
  state.connectedSince = null;

  var req = https.get(opts, (res) => {
    if (res.statusCode !== 200) {
      console.log('[STREAM] Connection returned status ' + res.statusCode);
      state.lastError = 'HTTP ' + res.statusCode;
      state.req = null;
      scheduleReconnect(apiKey);
      return;
    }

    state.connected = true;
    state.connectedSince = new Date().toISOString();
    state.reconnects = 0;
    var buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      var lines = buffer.split('\n');
      buffer = lines.pop();

      var now = new Date();
      state.lastEventAt = now.toISOString();

      // Reset today's counters if day changed
      var todayStr = now.toISOString().split('T')[0];
      if (state._todayRef && state._todayRef !== todayStr) {
        state.eventsToday = 0;
        state.companiesToday = 0;
        state.duplicates = 0;
        state.stale = 0;
      }
      state._todayRef = todayStr;

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        state.eventsToday++;

        try {
          var event = JSON.parse(line);
          if (!event.resource_kind || !event.resource_id) continue;
          // DIAGNOSTIC (temp): log the event type + resource_kind so we can see what
          // the /companies stream actually delivers (is it 'incorporated' or something else?).
          if (state.eventsToday <= 30 || (state.eventsToday % 50 === 0)) {
            console.log('[STREAM-DIAG] kind=' + event.resource_kind + ' type=' + (event.event ? event.event.type : 'none') + ' id=' + event.resource_id + ' t=' + (event.event ? event.event.timepoint : ''));
          }
          eventTypeLog.push((event.resource_kind || '?') + ':' + (event.event ? event.event.type : 'none'));
          if (eventTypeLog.length > 20) eventTypeLog.shift();

          var companyNumber = event.resource_id;
          var tp = event.event ? event.event.timepoint : null;
          if (tp) saveTimepoint(tp);

          // Only process incorporated events
          if (!event.event || event.event.type !== 'incorporated') continue;

          var seen = loadSeenCompanies();
          if (seen.has(companyNumber)) { state.duplicates++; continue; }
          seen.add(companyNumber);
          saveSeenCompanies(seen);

          state.companiesToday++;

          // Fetch profile asynchronously
          fetchCompanyProfile(companyNumber, apiKey).then((profile) => {
            if (!profile) return;
            var incDate = profile.date_of_creation || '';
            var cutoff = new Date(Date.now() - 48 * 3600000).toISOString().split('T')[0];
            if (incDate && incDate < cutoff) { state.stale++; return; }
            if (profile.company_status !== 'active') { state.stale++; return; }
            if (!profile.company_name || !profile.company_number) { state.stale++; return; }

            var a = profile.registered_office_address || {};
            if (!a.postal_code && !a.address_line_1) { state.stale++; return; }
            var addr = [a.address_line_1, a.address_line_2, a.locality, a.postal_code].filter(Boolean).join(', ');
            var blacklist = ['corner chambers','c/o ','care of','po box','p.o. box','suite','flat ','unit ','office ','business centre','business park','registered office','virtual office','formation agent','company formation','the company','company registered','no fixed address'];
            var isBad = blacklist.some((b) => (addr || '').toLowerCase().includes(b));
            if (isBad) { state.stale++; return; }

            var company = {
              id: 'STREAM_' + profile.company_number,
              name: (profile.company_name || '').trim(),
              companyNumber: profile.company_number || '',
              companyName: profile.company_name || '',
              address: addr,
              postcode: a.postal_code || '',
              city: a.locality || '',
              incorporationDate: incDate,
              companyStatus: profile.company_status || '',
              companyType: profile.type || '',
              sicCodes: (profile.sic_codes || []).join(', '),
              source: 'Companies House Stream',
              enrichment: 'address only',
              streamTimepoint: tp,
              streamTimestamp: event.event ? event.event.timepoint : '',
              ingestedAt: new Date().toISOString(),
              firstSeenAt: new Date().toISOString(),
              lastUpdatedAt: new Date().toISOString()
            };

            // Dedup within the queue by company number
            var queue = loadQueue();
            var alreadyQueued = queue.some((q) => q.companyNumber === company.companyNumber);
            if (!alreadyQueued) {
              queue.push(company);
              saveQueue(queue);
            }
          });
        } catch(e) { /* skip malformed lines */ }
      }
    });

    res.on('end', () => {
      console.log('[STREAM] Connection closed by server');
      state.connected = false;
      state.req = null;
      scheduleReconnect(apiKey);
    });

    res.on('error', (e) => {
      console.log('[STREAM] Connection error: ' + e.message);
      state.lastError = e.message;
      state.connected = false;
      state.req = null;
      scheduleReconnect(apiKey);
    });
  });

  req.on('error', (e) => {
    console.log('[STREAM] Request error: ' + e.message);
    state.lastError = e.message;
    state.connected = false;
    state.req = null;
    scheduleReconnect(apiKey);
  });

  state.req = req;
}

// Exponential backoff reconnection
function scheduleReconnect(apiKey) {
  state.reconnects++;
  state.req = null;
  var delay = Math.min(30000 * Math.pow(2, Math.min(state.reconnects - 1, 5)), 3600000);
  console.log('[STREAM] Reconnecting in ' + Math.round(delay / 1000) + 's (attempt ' + state.reconnects + ')');
  setTimeout(() => connect(apiKey), delay);
}

// Health check — runs every 30s to detect stale connections
function startHealthCheck(apiKey) {
  setInterval(() => {
    var now = new Date();
    if (!state.lastEventAt) return;
    var secondsSinceLastEvent = (now - new Date(state.lastEventAt)) / 1000;
    state.lag = Math.round(secondsSinceLastEvent);
    if (secondsSinceLastEvent > LAG_WARN_SECONDS && state.connected) {
      console.log('[STREAM] WARNING: No event for ' + Math.round(secondsSinceLastEvent) + 's — reconnecting');
      state.lastError = 'stale — reconnecting';
      if (state.req) { try { state.req.destroy(); } catch(e) {} state.req = null; }
      connect(apiKey);
    }
  }, 30000);
}

// Public API
function start(apiKey) {
  if (state.workerActive) {
    console.log('[STREAM] Worker already active');
    return;
  }
  state.workerActive = true;
  console.log('[STREAM] Starting background worker');
  connect(apiKey);
  startHealthCheck(apiKey);
}

function getStatus() {
  return {
    connected: state.connected,
    connectedSince: state.connectedSince,
    lastEventAt: state.lastEventAt,
    lastTimepoint: state.lastTimepoint,
    eventsToday: state.eventsToday,
    companiesToday: state.companiesToday,
    duplicates: state.duplicates,
    stale: state.stale,
    reconnects: state.reconnects,
    lag: state.lag,
    lastError: state.lastError,
    workerActive: state.workerActive,
    recentEventTypes: eventTypeLog.slice(-10)
  };
}

function getRecentCompanies() {
  var queue = loadQueue();
  var companies = queue.splice(0, queue.length);
  saveQueue(queue);
  return companies;
}

function getQueuedCount() {
  return loadQueue().length;
}

module.exports = { start, getStatus, getRecentCompanies, getQueuedCount };
