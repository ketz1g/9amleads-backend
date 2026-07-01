// ===== OPPORTUNITY SCORE ENGINE =====
// Scores leads 0-100 based on multiple factors
// Hot: 80-100 | Warm: 50-79 | Cold: 0-49

function scoreLead(lead, customerProduct) {
  var product = customerProduct || lead.product || 'moving';
  var score = 0;
  var reasons = [];
  var data = typeof lead.data === 'string' ? JSON.parse(lead.data || '{}') : (lead.data || lead);
  var now = new Date();

  // 1. LEAD FRESHNESS (0-20 points)
  var scrapedAt = data.scrapedAt || data.created_at || data.createdAt || data.delivered_at;
  if (scrapedAt) {
    var ageHours = (now - new Date(scrapedAt)) / (1000 * 60 * 60);
    if (ageHours < 1) { score += 20; reasons.push('Less than 1 hour old'); }
    else if (ageHours < 6) { score += 18; reasons.push('Less than 6 hours old'); }
    else if (ageHours < 24) { score += 14; reasons.push('Less than 24 hours old'); }
    else if (ageHours < 72) { score += 8; reasons.push('Less than 3 days old'); }
    else { score += 3; reasons.push('Older lead'); }
  } else {
    score += 10; reasons.push('Fresh lead');
  }

  // 2. BUSINESS TYPE MATCH (0-15 points)
  if (product === 'moving') {
    var beds = parseInt(data.bedrooms) || 0;
    if (beds >= 3) { score += 15; reasons.push(beds + '-bedroom property (high value move)'); }
    else if (beds >= 2) { score += 12; reasons.push(beds + '-bedroom property'); }
    else if (beds >= 1) { score += 8; reasons.push(beds + '-bedroom property'); }
    else { score += 5; reasons.push('Property lead'); }

    // Price indicator
    var price = parseInt(data.price) || 0;
    if (price > 750000) { score += 3; reasons.push('Premium property value'); }
    else if (price > 300000) { score += 1; }
  } else if (product === 'probate') {
    var estateVal = parseInt(data.estateValue) || 0;
    if (estateVal > 500000) { score += 15; reasons.push('High value estate (£' + (estateVal/1000).toFixed(0) + 'k)'); }
    else if (estateVal > 100000) { score += 12; reasons.push('Established estate'); }
    else if (estateVal > 0) { score += 8; reasons.push('Estate lead'); }
    else { score += 5; }

    if (data.deceasedName) { score += 3; reasons.push('Named executor identified'); }
  } else if (product === 'newbusiness') {
    if (data.companyName || data.company) { score += 15; reasons.push('Named company: ' + (data.companyName || data.company)); }
    else { score += 8; reasons.push('New business lead'); }

    if (data.ownerEmail) { score += 3; reasons.push('Decision-maker email available'); }
  } else if (product === 'planning') {
    if (data.applicant) { score += 15; reasons.push('Named applicant: ' + data.applicant); }
    else { score += 8; reasons.push('Planning application lead'); }

    var estVal = parseInt(data.estimatedValue || data.value) || 0;
    if (estVal > 100000) { score += 3; reasons.push('High value project'); }
  } else if (product === 'tenders') {
    var contractVal = parseInt(data.contractValue || data.value) || 0;
    if (contractVal > 500000) { score += 15; reasons.push('Major contract opportunity'); }
    else if (contractVal > 100000) { score += 12; reasons.push('Substantial contract'); }
    else if (contractVal > 0) { score += 8; reasons.push('Contract opportunity'); }
    else { score += 5; }

    var closingDate = data.closingDate || data.closing_date;
    if (closingDate) {
      var daysToClose = Math.max(0, Math.floor((new Date(closingDate) - now) / (1000 * 60 * 60 * 24)));
      if (daysToClose < 14) { score += 5; reasons.push('Closing soon (' + daysToClose + ' days)'); }
      else { score += 2; }
    }
  }

  // 3. LOCATION MATCH (0-15 points)
  if (data.address || data.postcode) {
    score += 10;
    if (data.city) { score += 3; reasons.push('Located in ' + data.city); }
    else if (data.postcode) { score += 2; }
    score += 2;
  } else {
    score += 5;
  }

  // 4. ESTIMATED VALUE (0-15 points)
  var valueIndicators = [data.price, data.estateValue, data.contractValue, data.estimatedValue, data.value];
  var hasValue = valueIndicators.some(function(v) { return parseInt(v) > 0; });
  if (hasValue) { score += 15; reasons.push('Estimated value available'); }
  else { score += 5; reasons.push('No value estimate'); }

  // 5. MISSING WEBSITE (0-10 points - HIGH VALUE if present)
  if (product === 'newbusiness' || product === 'tenders') {
    if (data.website) { score += 10; reasons.push('Website available'); }
    else if (data.ownerEmail) { score += 7; reasons.push('Contact email available'); }
    else { score += 3; reasons.push('No website found — opportunity to build'); }
  } else if (product === 'moving' || product === 'probate') {
    if (data.address) { score += 10; reasons.push('Full address available'); }
    else { score += 4; }
  } else {
    score += 10;
  }

  // 6. MISSING SOCIAL MEDIA (0-10 points - opportunity signal)
  if (product === 'moving' || product === 'newbusiness') {
    // No social media data available from scrapers — score as opportunity
    score += 8; reasons.push('Social media presence unknown — engagement opportunity');
  } else {
    score += 5;
  }

  // 7. MISSING GOOGLE BUSINESS PROFILE (0-5 points)
  score += 4; reasons.push('Google Business Profile status unknown — verification opportunity');

  // 8. PUBLIC DATA QUALITY (0-5 points)
  var fieldCount = 0;
  for (var key in data) {
    if (data.hasOwnProperty(key) && data[key] && typeof data[key] !== 'object') {
      fieldCount++;
    }
  }
  if (fieldCount > 8) { score += 5; reasons.push('Rich data set (' + fieldCount + ' fields)'); }
  else if (fieldCount > 4) { score += 3; reasons.push('Adequate data (' + fieldCount + ' fields)'); }
  else { score += 1; reasons.push('Limited data available'); }

  // 9. URGENCY (0-5 points)
  // For moving leads: SSTC/Under Offer status indicates urgency
  if (product === 'moving' && data.status) {
    var status = (data.status || '').toLowerCase();
    if (status.includes('sstc') || status.includes('sold')) { score += 5; reasons.push('SSTC — high urgency'); }
    else if (status.includes('offer')) { score += 4; reasons.push('Under offer — urgent'); }
    else { score += 2; }
  } else if (product === 'tenders' && data.closingDate) {
    var closeDate = new Date(data.closingDate);
    var daysLeft = Math.max(0, Math.floor((closeDate - now) / (1000 * 60 * 60 * 24)));
    if (daysLeft < 7) { score += 5; reasons.push('Deadline within ' + daysLeft + ' days'); }
    else if (daysLeft < 30) { score += 3; }
    else { score += 1; }
  } else if (product === 'probate') {
    score += 3; reasons.push('Probate — time-sensitive opportunity');
  } else {
    score += 3;
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Deduplicate reasons
  var seen = {};
  var uniqueReasons = [];
  for (var i = 0; i < reasons.length; i++) {
    if (!seen[reasons[i]]) {
      seen[reasons[i]] = true;
      uniqueReasons.push(reasons[i]);
    }
  }

  // Limit to top 5 reasons
  var topReasons = uniqueReasons.slice(0, 5);

  // Determine category
  var category = 'cold';
  var label = 'Cold Lead';
  if (score >= 80) { category = 'hot'; label = 'Hot Lead'; }
  else if (score >= 50) { category = 'warm'; label = 'Warm Lead'; }

  return {
    score: score,
    category: category,
    label: label,
    reasons: topReasons
  };
}

// Attach score to a lead object
function attachScore(lead, customerProduct) {
  var result = scoreLead(lead, customerProduct);
  lead.opportunityScore = result.score;
  lead.opportunityCategory = result.category;
  lead.opportunityLabel = result.label;
  lead.opportunityReasons = result.reasons;
  return lead;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { scoreLead: scoreLead, attachScore: attachScore };
}

// Export for browser
if (typeof window !== 'undefined') {
  window.OpportunityScore = { scoreLead: scoreLead, attachScore: attachScore };
}
