// Moving Lead deduplication + listing-event identity + postcode territory matching.
// Dedup primarily by UPRN, then exact verified address, then
// (postcode + house number + sub-building), then source property ID.
// A property and its listing event are treated separately; default event = NEWLY_LISTED.

const VERIFICATION_STATUS = require('./moving_source_provider.js').VERIFICATION_STATUS || {};

// Normalise postcode area: returns the outcode letters (e.g. "HA" for "HA3 5AB",
// "B" for "B61 0BH", "N" for "N1 5PX"). Handles one/two-letter + one/two-digit formats.
function postcodeArea(pc) {
  if (!pc) return '';
  const s = String(pc).toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^([A-Z]{1,2})(\d)/);
  return m ? m[1] : '';
}

// Full postcode area code (e.g. "HA3" or "B61" or "N1"). Used for fine territory match.
// Parses the natural "outcode inward" form (with a space) so "N1 5PX" -> "N1".
function outcode(pc) {
  if (!pc) return '';
  const s = String(pc).toUpperCase().trim();
  // Prefer the spaced form: "N1 5PX" -> "N1".
  const spaced = s.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)\s+\d/);
  if (spaced) return spaced[1];
  // Fallback: concatenated "N15PX" -> letters + 1-2 digits, but cap digits so
  // London single-letter areas (N) don't swallow the inward "15" -> take "N1".
  const concat = s.replace(/\s+/g, '');
  const m = concat.match(/^([A-Z]{1,2})(\d{1,2})/);
  if (!m) return '';
  const letters = m[1];
  let digits = m[2];
  // For single-letter London areas (N, E, W, SE, SW, NW, etc.) the outcode is
  // letters + 1-2 digits, but "N15PX" (N1 5PX) must parse as "N1" not "N15".
  // Heuristic: if 2+ digits follow a single letter AND there is an inward (letter
  // after digits beyond the 2), trim to first digit for N/E/W to avoid N15.
  if (letters.length === 1 && digits.length >= 2 && /[A-Z]/.test(concat.substring(1 + digits.length))) {
    digits = digits.substring(0, 1);
  }
  return letters + digits;
}

// Does a lead's postcode fall within a customer's selected territory?
// Territories are supplied as postcode AREA codes (e.g. "B", "HA", "N", "NW").
// IMPORTANT: "B" must NOT match "BT" (Belfast); "N" must not over-match.
function matchesTerritory(leadPostcode, territories) {
  const area = postcodeArea(leadPostcode);
  if (!area) return false;
  return (territories || []).some(function(t) {
    const want = String(t).toUpperCase().replace(/\s+/g, '');
    if (!want) return false;
    // Exact area match (e.g. "HA" == "HA", "B" == "B").
    if (area === want) return true;
    // A multi-letter territory ("NW") is a strict prefix of the lead area ("NW1").
    // A single-letter territory ("B") matches only leads whose AREA is exactly "B"
    // (Birmingham), NOT "BT" (Belfast) — because "BT".slice(0,1) === "B" would be a
    // false positive. So single-letter territories require the full area equality above.
    if (want.length === 2 && area.indexOf(want) === 0) return true;
    return false;
  });
}

// Build a stable identity key for a lead for dedup.
function identityKey(lead) {
  const parts = [];
  // 1) UPRN is the strongest identity.
  if (lead.uprn) parts.push('uprn:' + String(lead.uprn));
  // 2) Normalised verified/full address.
  const addr = normaliseAddress(lead.verifiedAddress || lead.fullAddress || lead.address || lead.street || '');
  if (addr) parts.push('addr:' + addr);
  // 3) postcode + houseNumber + subBuilding.
  if (lead.postcode) {
    parts.push('pc:' + String(lead.postcode).toUpperCase().replace(/\s+/g, ''));
    if (lead.houseNumber) parts.push('hn:' + String(lead.houseNumber).replace(/[^0-9A-Za-z]/g, ''));
    if (lead.subBuilding) parts.push('sb:' + normaliseAddress(lead.subBuilding));
  }
  return parts.join('|');
}

function normaliseAddress(addr) {
  return String(addr || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Deduplicate a batch of records. Returns { unique, duplicates }.
// Prefers records with higher addressConfidence / UPRN when a conflict arises.
// Also matches by verified address alone so a Homedata record (with UPRN) and a
// Rightmove record (no UPRN, same address) are treated as the same property.
function dedupe(records) {
  const unique = [];
  const seen = {};      // full identityKey -> index
  const seenAddr = {};  // address-only key -> index
  const duplicates = [];
  for (const rec of records) {
    const key = identityKey(rec);
    const addrKey = 'addr:' + normaliseAddress(rec.verifiedAddress || rec.fullAddress || rec.address || rec.street || '');
    let dup = null;
    if (key && seen[key] !== undefined) dup = seen[key];
    else if (addrKey !== 'addr:' && seenAddr[addrKey] !== undefined) dup = seenAddr[addrKey];
    if (dup !== null) {
      duplicates.push(rec);
      continue;
    }
    if (key) seen[key] = unique.length;
    if (addrKey !== 'addr:') seenAddr[addrKey] = unique.length;
    unique.push(rec);
  }
  return { unique, duplicates };
}

// Build the listing event identity: UPRN + eventType + sourceEventDate.
// Prevents re-sending the same property every day just because the listing exists.
function eventIdentity(rec) {
  const evType = rec.listingEventType || 'NEWLY_LISTED';
  const date = (rec.firstListedAt || rec.sourceEventDate || '').split('T')[0] || '';
  const uprn = rec.uprn ? 'uprn:' + rec.uprn : '';
  const sourceId = rec.sourceEventId || rec.sourcePropertyId ? 'src:' + (rec.sourceEventId || rec.sourcePropertyId) : '';
  const addr = rec.verifiedAddress ? 'addr:' + normaliseAddress(rec.verifiedAddress) : identityKey(rec);
  return (uprn || sourceId || addr) + '|' + evType + '|' + date;
}

module.exports = {
  postcodeArea,
  outcode,
  matchesTerritory,
  identityKey,
  normaliseAddress,
  dedupe,
  eventIdentity,
  VERIFICATION_STATUS
};
