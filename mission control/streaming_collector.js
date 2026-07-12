// Companies House Streaming API — New Business Lead Collector
// Connects to the official company-profile stream, captures newly incorporated
// companies within the configured freshness window, and queues them for delivery.
//
// Stream docs: https://developer.company-information.service.gov.uk/api/docs/stream/company_profile/companyProfile.html
//
// Usage:
//   const collector = require('./streaming_collector');
//   await collector.collectFreshLeads(CH_API_KEY, freshnessHours);
//   // Returns array of lead objects ready for the distributor.

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TIMEPOINT_FILE = path.join(DATA_DIR, 'stream-timepoint.json');
const SEEN_FILE = path.join(DATA_DIR, 'stream-seen-companies.json');

// Load / save the stream timepoint (resume position)
function loadTimepoint() {
  try { return JSON.parse(fs.readFileSync(TIMEPOINT_FILE, 'utf-8')); } catch(e) { return 0; }
}
function saveTimepoint(tp) {
  fs.writeFileSync(TIMEPOINT_FILE, JSON.stringify(tp));
}

// Load / save dedup set (company numbers already seen)
function loadSeenCompanies() {
  try { return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf-8'))); } catch(e) { return new Set(); }
}
function saveSeenCompanies(set) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...set]));
}

// Extract postcode area from a UK postcode
function extractPostcodeArea(pc) {
  if (!pc) return '';
  return pc.toUpperCase().replace(/[^A-Z].*$/, '');
}

// Fetch a single company profile for enrichment
function fetchCompanyProfile(companyNumber, apiKey) {
  return new Promise((resolve) => {
    var req = https.get({ hostname: 'api.company-information.service.gov.uk', path: '/company/' + encodeURIComponent(companyNumber), headers: { 'Authorization': 'Basic ' + Buffer.from(apiKey + ':').toString('base64') }, timeout: 10000 }, (res) => {
      var body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch(e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

// Main collector: connect to stream, read events, return fresh leads
async function collectFreshLeads(apiKey, freshnessHours = 48) {
  const seen = loadSeenCompanies();
  let timepoint = loadTimepoint();
  const freshCutoff = new Date(Date.now() - freshnessHours * 3600000).toISOString().split('T')[0];
  const leads = [];

  console.log('[STREAM] Connecting at timepoint ' + timepoint + ' (freshness: ' + freshnessHours + 'h, cutoff: ' + freshCutoff + ')');

  return new Promise((resolve, reject) => {
    var streamUrl = '/companies?timepoint=' + timepoint;
    var req = https.get({ hostname: 'stream.companieshouse.gov.uk', path: streamUrl, headers: { 'Authorization': 'Basic ' + Buffer.from(apiKey + ':').toString('base64') }, timeout: 600000 }, (res) => {
      if (res.statusCode !== 200) {
        console.log('[STREAM] Connection failed with status ' + res.statusCode);
        resolve(leads);
        return;
      }

      var buffer = '';
      var eventCount = 0;
      var keptCount = 0;

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        var lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line) continue;
          try {
            var event = JSON.parse(line);
            if (!event.resource_kind || !event.resource_id) continue;

            eventCount++;
            var companyNumber = event.resource_id;
            var tp = event.timepoint;

            // Update timepoint to latest seen
            if (tp && tp > timepoint) { timepoint = tp; }

            // Dedup by company number
            if (seen.has(companyNumber)) continue;

            // Check if this is a new incorporation event
            if (event.event && event.event.type === 'incorporated') {
              seen.add(companyNumber);
              keptCount++;

              // Enqueue profile fetch (we need date_of_creation)
              leads.push({ companyNumber, timepoint: tp, event });
            }
          } catch(e) { /* skip malformed lines */ }
        }

        // Periodically save timepoint and seen set
        if (eventCount % 50 === 0) {
          saveTimepoint(timepoint);
          saveSeenCompanies(seen);
        }
      });

      res.on('end', async () => {
        console.log('[STREAM] Connection ended. Events: ' + eventCount + ', new incorporations: ' + keptCount);
        saveTimepoint(timepoint);
        saveSeenCompanies(seen);

        // Enrich — fetch profiles for each new incorporation
        if (keptCount > 0) {
          console.log('[STREAM] Enriching ' + leads.length + ' companies...');
          var enrichedLeads = [];
          for (var li = 0; li < leads.length; li++) {
            var l = leads[li];
            var profile = await fetchCompanyProfile(l.companyNumber, apiKey);
            if (!profile) continue;

            var incDate = profile.date_of_creation || '';
            if (incDate && incDate < freshCutoff) continue; // too old

            var a = profile.registered_office_address || {};
            var postcode = a.postal_code || '';
            var addr = [a.address_line_1, a.address_line_2, a.locality, a.postal_code].filter(Boolean).join(', ');

            // Skip formation agent addresses
            var addrLower = (addr || '').toLowerCase();
            var blacklist = ['corner chambers','c/o ','care of','po box','p.o. box','suite','flat ','unit ','office ','business centre','business park','registered office','virtual office','formation agent','company formation','the company','company registered','no fixed address'];
            var isBlacklisted = blacklist.some(function(b) { return addrLower.includes(b); });
            if (isBlacklisted) continue;

            enrichedLeads.push({
              id: 'STREAM_' + profile.company_number,
              name: (profile.company_name || '').trim(),
              companyName: profile.company_name || '',
              companyNumber: profile.company_number || '',
              address: addr,
              postcode: postcode,
              city: a.locality || '',
              incorporationDate: incDate,
              companyStatus: profile.company_status || '',
              companyType: profile.type || '',
              sicCodes: (profile.sic_codes || []).join(', '),
              source: 'Companies House Stream',
              enrichment: 'address only',
              scrapedAt: new Date().toISOString()
            });
          }
          console.log('[STREAM] After enrichment + freshness filter: ' + enrichedLeads.length + ' leads');
        }

        resolve(enrichedLeads || []);
      });

      res.on('error', (e) => {
        console.log('[STREAM] Stream error: ' + e.message);
        saveTimepoint(timepoint);
        resolve(enrichedLeads || []);
      });
    });

    req.on('error', (e) => {
      console.log('[STREAM] Request error: ' + e.message);
      saveTimepoint(timepoint);
      resolve([]);
    });
    req.setTimeout(610000, () => {
      console.log('[STREAM] Timeout — closing');
      req.destroy();
      saveTimepoint(timepoint);
      resolve([]);
    });
  });
}

module.exports = { collectFreshLeads, loadTimepoint, loadSeenCompanies };
