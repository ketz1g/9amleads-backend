// Central Moving Lead property inventory.
//
// One canonical record per PROPERTY (keyed by UPRN where available), shared across
// all customers — NOT a copy per customer. Also tracks listing events so the same
// property is not re-sent unchanged every day, and future event types
// (NEW_LISTING, RELISTED, PRICE_REDUCED, SOLD_STC, UNDER_OFFER, WITHDRAWN) are
// supported.
//
// This module is persistence-agnostic: it operates on plain arrays/objects so it
// can be unit-tested and wired to the app's JSON DB (db.inventory / db.lead_events)
// by the caller.

const dedup = require('./moving_lead_dedup.js');

// Extract the postcode DISTRICT (outcode) from a postcode, e.g. "HA1 1ZZ" -> "HA1",
// "N1 5PX" -> "N1", "B61 0BH" -> "B61". Parses the natural spaced form so single
// letter London areas (N, E, W) do not swallow the inward code.
function extractDistrict(postcode) {
  if (!postcode) return '';
  const s = String(postcode).toUpperCase().trim();
  const spaced = s.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)\s+\d/);
  if (spaced) return spaced[1];
  const concat = s.replace(/\s+/g, '');
  const m = concat.match(/^([A-Z]{1,2})(\d{1,2})/);
  if (!m) return '';
  const letters = m[1], digits = m[2];
  if (letters.length === 1 && digits.length >= 2 && /[A-Z]/.test(concat.substring(1 + digits.length))) {
    return letters + digits.substring(0, 1);
  }
  return letters + digits;
}


// Address quality levels (Stage 8).
const ADDRESS_QUALITY = { FULL: 'FULL', PARTIAL: 'PARTIAL', NO_NUMBER: 'NO_NUMBER', INVALID: 'INVALID' };

// Future event types (Stage 9) - current Moving Leads focus on NEW_LISTING.
const EVENT_TYPES = ['NEW_LISTING','RELISTED','PRICE_REDUCED','SOLD_STC','UNDER_OFFER','WITHDRAWN'];

// ---------------------------------------------------------------------------
// Stage 8: full address processing + quality classification.
// ---------------------------------------------------------------------------
// Build a canonical address record from raw parts. Never guesses missing data.
function canonicalAddress(parts) {
  parts = parts || {};
  const flat = String(parts.flat_number || parts.sub_building || '').trim();
  const house = String(parts.house_number || parts.building_number || '').trim();
  const bld = String(parts.building_name || '').trim();
  const street = String(parts.street || parts.thoroughfare || '').trim();
  const town = String(parts.town || '').trim();
  const postcode = String(parts.postcode || '').toUpperCase().replace(/\s+/g, ' ');
  const pcClean = String(postcode || '').replace(/\s+/g, '');

  const lines = [];
  if (flat) lines.push(flat);
  if (house && street) lines.push(house + ' ' + street);
  else if (bld) lines.push(bld);
  else if (street) lines.push(street);
  if (town) lines.push(town);
  if (postcode) lines.push(postcode);
  const fullAddress = lines.join(', ');

  // Quality classification.
  let quality;
  const hasStreet = !!street;
  const hasTown = !!town;
  const hasPc = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(pcClean);
  if (!hasStreet && !hasTown && !hasPc) quality = ADDRESS_QUALITY.INVALID;
  else if (!hasStreet) quality = ADDRESS_QUALITY.PARTIAL;
  else if (hasStreet && (house || bld) && hasPc) quality = ADDRESS_QUALITY.FULL;
  else if (hasStreet && hasPc) quality = ADDRESS_QUALITY.NO_NUMBER; // street+pc but no number
  else quality = ADDRESS_QUALITY.PARTIAL;

  return {
    flatNumber: flat,
    subBuilding: flat,
    houseNumber: house,
    buildingName: bld,
    street: street,
    town: town,
    postcode: postcode,
    postcodeDistrict: extractDistrict(postcode),
    postcodeArea: extractDistrict(postcode) ? extractDistrict(postcode).match(/^([A-Z]{1,2})/)[1] : '',
    fullAddress: fullAddress,
    addressQuality: quality
  };
}

// ---------------------------------------------------------------------------
// Stage 6: canonical inventory record.
// ---------------------------------------------------------------------------
// Build a canonical property record from a source listing. Idempotent by UPRN.
function toInventoryRecord(source) {
  const addr = canonicalAddress(source);
  const uprn = source.uprn ? String(source.uprn) : '';
  return {
    id: uprn ? ('UPRN_' + uprn) : ('SRC_' + (source.sourceEventId || source.sourcePropertyId || source.listingId || source.id || Math.random().toString(36).slice(2))),
    uprn: uprn,
    udprn: source.udprn ? String(source.udprn) : '',
    usrn: source.usrn || '',
    sourceProvider: source.sourceProvider || 'unknown',
    sourcePropertyId: source.sourcePropertyId || source.property_id || '',
    sourceEventId: source.sourceEventId || source.listing_id || '',
    portalSource: source.portal_source || source.portalSource || '',
    listingEventType: source.listingEventType || 'NEW_LISTING',
    flatNumber: addr.flatNumber,
    subBuilding: addr.subBuilding,
    houseNumber: addr.houseNumber,
    buildingName: addr.buildingName,
    street: addr.street,
    town: addr.town,
    postcode: addr.postcode,
    postcodeDistrict: addr.postcodeDistrict,
    postcodeArea: addr.postcodeArea,
    fullAddress: addr.fullAddress,
    sourceAddress: source.sourceAddress || source.address || source.fullAddress || '',
    verifiedAddress: source.verifiedAddress || addr.fullAddress || '',
    addressQuality: addr.addressQuality,
    latitude: source.latitude || null,
    longitude: source.longitude || null,
    propertyType: source.propertyType || source.property_type || '',
    bedrooms: source.bedrooms || source.num_beds || 0,
    askingPrice: source.price || source.asking_price || 0,
    estateAgent: source.estateAgent || source.brand_name || '',
    firstListedAt: source.firstListedAt || source.listed_date || source.first_listed_date || null,
    sourceDetectedAt: source.sourceDetectedAt || new Date().toISOString(),
    ingestedAt: new Date().toISOString(),
    ageHours: source.ageHours || 0,
    addressConfidence: source.addressConfidence || 0,
    addressVerificationStatus: source.addressVerificationStatus || 'UNRESOLVED',
    addressVerificationSource: source.addressVerificationSource || '',
    rawSourceData: source.rawSourceData || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// Stage 9: dedup into inventory + event tracking.
// ---------------------------------------------------------------------------
// Insert/update a batch of source records into the canonical inventory.
// Returns { inserted, updated, duplicates, events }.
function ingest(records, existingInventory, eventLog) {
  const inv = existingInventory || [];   // array of canonical records
  const events = eventLog || [];          // array of {inventory_id, listing_event_type, event_date, event_key}
  const invByUprn = {};
  inv.forEach(function(r){ if (r.uprn) invByUprn[r.uprn] = r; });
  const result = { inserted: [], updated: [], duplicates: [], events: [] };

  for (const src of records || []) {
    const rec = toInventoryRecord(src);
    const uprn = rec.uprn;
    let existing = null;
    if (uprn && invByUprn[uprn]) existing = invByUprn[uprn];
    if (!existing) {
      // Fallback dedup by source event id / listing id.
      existing = inv.find(function(r){ return r.sourceEventId && rec.sourceEventId && r.sourceEventId === rec.sourceEventId; });
    }
    // Dedup by exact normalised address (UPRN unknown).
    if (!existing && (uprn || rec.fullAddress)) {
      const addrKey = dedup.normaliseAddress(rec.verifiedAddress || rec.fullAddress);
      existing = inv.find(function(r){ return r.id !== rec.id && dedup.normaliseAddress(r.verifiedAddress || r.fullAddress) === addrKey; });
    }
    // Dedup by house/flat + postcode.
    if (!existing && (rec.houseNumber || rec.flatNumber) && rec.postcode) {
      const pcKey = String(rec.postcode).replace(/\s+/g,'');
      const hKey = String(rec.houseNumber || rec.flatNumber).replace(/[^0-9A-Za-z]/g,'');
      existing = inv.find(function(r){ return String(r.postcode||'').replace(/\s+/g,'') === pcKey && String(r.houseNumber || r.flatNumber || '').replace(/[^0-9A-Za-z]/g,'') === hKey; });
    }

    if (existing) {
      // Property already known. Record the event (avoid duplicate same-event).
      const evKey = eventKey(existing.id || rec.id, rec.listingEventType, rec.firstListedAt);
      if (!events.some(function(e){ return e.event_key === evKey; })) {
        events.push({ inventory_id: existing.id || rec.id, listing_event_type: rec.listingEventType, event_date: rec.firstListedAt, event_key: evKey });
        result.events.push(rec.listingEventType);
      }
      // Refresh mutable fields (price, status, address) but keep the same id.
      const merged = Object.assign({}, existing, rec, { id: existing.id || rec.id, created_at: existing.created_at || rec.created_at, updated_at: new Date().toISOString() });
      result.updated.push(merged.id);
      // Update in place.
      Object.keys(merged).forEach(function(k){ existing[k] = merged[k]; });
      if (uprn) invByUprn[uprn] = existing;
    } else {
      inv.push(rec);
      if (uprn) invByUprn[uprn] = rec;
      result.inserted.push(rec.id);
      const evKey = eventKey(rec.id, rec.listingEventType, rec.firstListedAt);
      if (!events.some(function(e){ return e.event_key === evKey; })) {
        events.push({ inventory_id: rec.id, listing_event_type: rec.listingEventType, event_date: rec.firstListedAt, event_key: evKey });
        result.events.push(rec.listingEventType);
      }
    }
  }
  result.duplicates = result.updated.filter(function(id, i){ return result.updated.indexOf(id) === i; });
  return result;
}

function eventKey(id, eventType, dateStr) {
  const d = String(dateStr || '').split('T')[0] || '';
  return id + '|' + (eventType || 'NEW_LISTING') + '|' + d;
}

// Query eligible PRIMARY (0-24h) / FALLBACK (24-48h) inventory for a district set.
// If districts is null/empty, consider ALL districts.
function eligibleInventory(inventory, districts, nowMs) {
  const primary = [], fallback = [];
  const all = !districts || districts.length === 0;
  const dcodes = {};
  (districts || []).forEach(function(d){ dcodes[d] = true; });
  for (const r of inventory || []) {
    if (!all && !dcodes[r.postcodeDistrict]) continue;
    const cat = freshnessCat(r.firstListedAt, nowMs);
    if (cat === 'PRIMARY') primary.push(r);
    else if (cat === 'FALLBACK') fallback.push(r);
  }
  return { PRIMARY: primary, FALLBACK: fallback };
}

function freshnessCat(firstListedAt, nowMs) {
  const t = new Date(firstListedAt).getTime();
  if (isNaN(t)) return 'EXPIRED';
  const h = (nowMs - t) / 3600000;
  if (h <= 24) return 'PRIMARY';
  if (h <= 48) return 'FALLBACK';
  return 'EXPIRED';
}

module.exports = {
  ADDRESS_QUALITY,
  EVENT_TYPES,
  canonicalAddress,
  toInventoryRecord,
  ingest,
  eventKey,
  eligibleInventory,
  freshnessCat
};
