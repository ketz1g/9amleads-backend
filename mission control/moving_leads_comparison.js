// Moving Leads Provider Comparison Test
// Compares the production design: fresh Rightmove listings resolved to a UPRN +
// exact address via the address resolver (Propalt primary, then Homedata, then
// Postcoder), producing objective statistics before switching to Propalt resolution.
//
// Usage: node moving_leads_comparison.js [count]
// Requires PROPALT_API_KEY + HOMEDATA_API_KEY + POSTCODER_API_KEY in env.

process.env.MOVING_PRIMARY_SOURCE = process.env.MOVING_PRIMARY_SOURCE || 'rightmove';
process.env.MOVING_FALLBACK_SOURCE = process.env.MOVING_FALLBACK_SOURCE || 'propalt';

const msp = require('./moving_source_provider.js');
const fs = require('fs');
const path = require('path');

async function run(count) {
  count = count || 100;
  const stats = {
    totalRecords: 0,
    exactUprnMatches: 0,
    exactAddressMatches: 0,
    fullDoorNumbersFound: 0,
    unresolved: 0,
    conflicts: 0,
    coveragePercent: 0,
    fullAddressSuccessPercent: 0,
    uprnMatchPercent: 0,
    errors: 0
  };
  const rows = [];

  // 1) Fetch fresh listings from the primary source (Rightmove for freshness).
  const res = await msp.fetchNewListings({ limit: count, sinceDate: new Date().toISOString().split('T')[0] });
  let records = res.records || [];
  console.log('[COMPARE] Fetched ' + records.length + ' fresh listings from ' + res.source);

  // 2) Enrich Rightmove list leads with FULL postcodes via their detail pages
  //    (matches the production pipeline: enrichMovingLeads fetches the full
  //    postcode that the list view hides). Resolution needs a full postcode.
  const rm = require('./rightmove_scraper_v2.js');
  if (res.source === 'rightmove') {
    records = await rm.enrichMovingLeads(records.filter(function(l){ return l.url; }), 8);
    const withFullPc = records.filter(function(l){ return l.postcode && /[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(l.postcode); }).length;
    console.log('[COMPARE] Enriched: ' + records.length + ' leads, ' + withFullPc + ' with full postcodes');
  }

  for (let i = 0; i < records.length && i < count; i++) {
    const rec = records[i];
    stats.totalRecords++;
    const row = {
      rightmoveId: rec.sourcePropertyId || '',
      rightmoveAddress: rec.address || '',
      rightmovePostcode: rec.postcode || '',
      homedataUprn: '',
      homedataAddress: rec.address || '',
      verifiedAddress: '',
      doorNumberFound: '',
      exactMatch: false,
      confidence: 0,
      status: 'PENDING',
      reason: '',
      failure: ''
    };
    try {
      const resolved = await msp.resolveAddress(rec);
      row.homedataUprn = resolved.uprn || '';
      row.verifiedAddress = resolved.verifiedAddress || resolved.fullAddress || '';
      row.doorNumberFound = resolved.houseNumber || '';
      row.confidence = resolved.addressConfidence || 0;
      row.status = resolved.addressVerificationStatus || 'UNRESOLVED';
      if (resolved.uprn) { stats.exactUprnMatches++; }
      if (resolved.addressVerificationStatus === 'EXACT_ADDRESS') { stats.exactAddressMatches++; }
      if (resolved.houseNumber) { stats.fullDoorNumbersFound++; }
      if (resolved.addressVerificationStatus === 'UNRESOLVED') { stats.unresolved++; }
      if (resolved.addressVerificationStatus === 'CONFLICT') { stats.conflicts++; }
      row.reason = (resolved.addressVerificationStatus || '') + ' confidence=' + (resolved.addressConfidence || 0);
    } catch(e) {
      stats.errors++;
      row.failure = e.message;
      row.status = 'ERROR';
      stats.unresolved++;
    }
    rows.push(row);
  }

  // Compute percentages.
  const n = stats.totalRecords || 1;
  stats.coveragePercent = Math.round((stats.exactUprnMatches / n) * 1000) / 10;
  stats.fullAddressSuccessPercent = Math.round((stats.fullDoorNumbersFound / n) * 1000) / 10;
  stats.uprnMatchPercent = Math.round((stats.exactUprnMatches / n) * 1000) / 10;

  console.log('\n================ COMPARISON RESULT ================');
  console.log(JSON.stringify(stats, null, 2));

  // Save detail rows for debugging.
  const outFile = path.join(process.env.DATA_DIR || 'data', 'moving-comparison-' + new Date().toISOString().split('T')[0] + '.json');
  fs.writeFileSync(outFile, JSON.stringify(rows, null, 2));
  console.log('\nDetail rows saved to ' + outFile);
  return stats;
}

const count = parseInt(process.argv[2] || '100', 10);
run(count).then(function(s){ process.exit(0); }).catch(function(e){ console.error('FATAL', e); process.exit(1); });
