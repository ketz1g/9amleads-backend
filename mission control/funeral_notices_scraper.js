// funeral_notices_scraper.js
// Second probate source: funeral-notices.co.uk (free, no Apify). Scrapes
// county/town pages, extracts the deceased's name + funeral director from each
// notice (JSON-LD), and returns probate-style leads tagged with the county so
// the existing probate delivery can match them. Funeral notices lead probate by
// weeks, so customers get leads well before the Gazette publishes the grant.
const https = require('https');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// County/town -> representative postcode area (for the delivery's county match).
const COUNTY_AREA = {
  'bristol': 'BS', 'cambridgeshire': 'CB', 'buckinghamshire': 'HP', 'essex': 'CM',
  'kent': 'CT', 'surrey': 'GU', 'hampshire': 'SO', 'sussex': 'BN', 'london': 'SW',
  'hertfordshire': 'AL', 'bedfordshire': 'LU', 'oxfordshire': 'OX', 'berkshire': 'RG',
  'norfolk': 'NR', 'suffolk': 'IP', 'devon': 'EX', 'cornwall': 'TR', 'somerset': 'BA',
  'dorset': 'DT', 'wiltshire': 'SN', 'gloucestershire': 'GL', 'warwickshire': 'CV',
  'west-midlands': 'B', 'east-sussex': 'BN', 'west-sussex': 'RH', 'shropshire': 'SY',
  'staffordshire': 'ST', 'leicestershire': 'LE', 'nottinghamshire': 'NG', 'derbyshire': 'DE',
  'lincolnshire': 'LN', 'northamptonshire': 'NN', 'yorkshire': 'LS', 'lancashire': 'PR',
  'cheshire': 'CH', 'merseyside': 'L', 'greater-manchester': 'M', 'tyne-and-wear': 'NE',
  'durham': 'DH', 'northumberland': 'NE', 'cumbria': 'CA', 'scotland': 'G', 'wales': 'CF'
};

function httpGet(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'GET', headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-GB,en;q=0.9' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        let next = res.headers.location;
        if (next.startsWith('/')) next = 'https://funeral-notices.co.uk' + next;
        httpGet(next).then(resolve);
        return;
      }
      let b = ''; res.on('data', c => { if (b.length < 800000) b += c; }); res.on('end', () => resolve(b));
    });
    req.on('error', () => resolve(''));
    req.setTimeout(25000, () => { req.destroy(); resolve(''); });
    req.end();
  });
}

function parseNoticeLinks(html) {
  const links = html.match(/\/notice\/[A-Za-z0-9\-]+\/\d+/g) || [];
  return [...new Set(links)];
}

function parseNoticeJsonLd(url) {
  return new Promise(async (resolve) => {
    const html = await httpGet(url);
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!ld) { resolve(null); return; }
    try {
      const j = JSON.parse(ld[1]);
      const name = String(j.name || '').trim();
      const body = String(j.articleBody || '');
      // EXTRACT THE REAL POSTCODE + STREET ADDRESS from the notice body. The funeral
      // director's "All enquiries to <firm>, <street>, <town>, <postcode>" block is
      // the only reliably mailable address on the page. This gives us a genuine
      // full postcode + street (not the old fake "BS1 1AA" guess).
      let postcode = '';
      const pcMatch = body.match(/\b[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}\b/i);
      if (pcMatch) {
        const pcRaw = pcMatch[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
        postcode = pcRaw.slice(0, pcRaw.length - 3) + ' ' + pcRaw.slice(-3);
      }
      // Full funeral-director address: the sentence after "All enquiries to" (or
      // "Enquiries to") up to the phone number. Includes firm + street + town + postcode.
      let enquiriesAddr = '';
      const enqMatch = body.match(/(?:All\s+)?[Ee]nquiries?\s+to\s+([^.\n]*?)(?:\b(Tel|Phone|Mob)[:.]?\s*[\d\s\-()+]{6,})?[.\n]?$/i);
      if (enqMatch) enquiriesAddr = enqMatch[1].trim();
      if (!enquiriesAddr) {
        // fallback: grab the last ~3 lines containing the postcode
        const lines = body.split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
        for (var li = lines.length - 1; li >= 0; li--) {
          if (/\b[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}\b/i.test(lines[li])) {
            enquiriesAddr = lines.slice(Math.max(0, li - 2), li + 1).join(', ').replace(/\b(Tel|Phone|Mob)[:.]?\s*[\d\s\-()+]{6,}/ig, '').replace(/,\s*,/g, ',').trim();
            break;
          }
        }
      }
      // Funeral director firm name is the JSON-LD author (the organiser).
      const funeralDirector = (j.author && j.author.name) ? String(j.author.name).trim() : '';
      resolve({
        name: name,
        datePublished: j.datePublished || '',
        funeralDirector: funeralDirector,
        postcode: postcode,
        enquiriesAddress: enquiriesAddr,
        articleBody: body
      });
    } catch (e) { resolve(null); }
  });
}

async function collectFuneralLeads(params) {
  params = params || {};
  var counties = (params.counties && params.counties.length) ? params.counties : ['bristol'];
  var maxPerCounty = parseInt(params.maxPerCounty || 30, 10);
  var results = [];
  var today = new Date().toISOString();
  for (var i = 0; i < counties.length; i++) {
    var county = String(counties[i]).trim();
    var slug = county.toLowerCase().replace(/[\s]+/g, '+').replace(/[^a-z+]/g, '');
    if (!slug) continue;
    var area = COUNTY_AREA[slug] || 'BS';
    try {
      var html = await httpGet('https://funeral-notices.co.uk/' + slug + '/all-announcements/todays-notices');
      if (!html || html.length < 2000) html = await httpGet('https://funeral-notices.co.uk/' + slug + '/all-announcements');
      if (!html || html.length < 2000) continue;
      var links = parseNoticeLinks(html).slice(0, maxPerCounty);
      for (var l = 0; l < links.length; l++) {
        try {
          var info = await parseNoticeJsonLd('https://funeral-notices.co.uk' + links[l]);
          if (!info || !info.name) continue;
          var idMatch = links[l].match(/\/(\d+)$/);
          var leadUrl = 'https://funeral-notices.co.uk' + links[l];
          // EARLY ESTATE OPPORTUNITY (PRE-PROBATE): death notices are NOT confirmed
          // probate. They are tagged source=early-estate and must NEVER be delivered
          // as confirmed probate (the delivery filters this source out of probate).
          // When the notice gives the funeral director's real street+postcode, the
          // lead has a mailable address (good for house-clearance/removals/auction
          // buyers); otherwise we keep the town/area but no fake postcode.
          var pc = info.postcode || '';
          var addr = info.enquiriesAddress || (info.name + ', ' + county);
          results.push({
            id: 'FN_' + (idMatch ? idMatch[1] : Date.now() + '_' + l) + '_' + slug,
            name: info.name,
            deceasedName: info.name,
            deceasedAddress: addr,
            address: addr,
            postcode: pc,
            county: slug,
            town: county,
            grantDate: info.datePublished || today,
            publishedDate: info.datePublished || today,
            scrapedAt: today,
            firstVisibleDate: today,
            updateDate: today,
            estateValue: 0,
            funeralDirector: info.funeralDirector,
            preProbate: true,
            source: 'early-estate',
            url: leadUrl
          });
        } catch (e) { /* skip bad notice */ }
      }
    } catch (e) { /* skip bad county */ }
    // be polite between counties
    await new Promise(function(r) { setTimeout(r, 400); });
  }
  return results;
}

module.exports = { collectFuneralLeads };
