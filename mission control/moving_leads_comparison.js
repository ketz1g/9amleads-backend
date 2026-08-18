// Moving Leads Provider Comparison Test
// Compares Rightmove vs Homedata vs Postcoder verification across N properties,
// producing objective statistics before switching Homedata to production.
//
// Usage: node moving_leads_comparison.js [count]
// Requires HOMEDATA_API_KEY + APIFY_API_KEY + POSTCODER_API_KEY in env.

process.env.MOVING_PRIMARY_SOURCE = process.env.MOVING_PRIMARY_SOURCE || 'homedata';
process.env.MOVING_FALLBACK_SOURCE = process.env.MOVING_FALLBACK_SOURCE || 'rightmove';

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
    homedataCoveragePercent: 0,
    fullAddressSuccessPercent: 0,
    uprnMatchPercent: 0,
    errors: 0
  };
  const rows = [];

  // 1) Fetch listings (Homedata primary).
  const res = await msp.fetchNewListings({ limit: count, sinceDate: new Date().toISOString().split('T')[0] });
  const records = res.records || [];
  console.log('[COMPARE] Fetched ' + records.length + ' fresh listings from ' + res.source);

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
  stats.homedataCoveragePercent = Math.round((stats.exactUprnMatches / n) * 1000) / 10;
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
