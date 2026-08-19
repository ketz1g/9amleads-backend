// Shared UK address premise-identifier logic.
//
// Used by the delivery gate, the dashboard/leads filter and the email builder to
// guarantee a delivered moving/probate lead ALWAYS carries a real premise
// identifier: a door number ("12 High St", "39-47 Wedmore St"), a flat/apartment
// number ("Flat 12, Eaton Mansions"), or a named house/building ("The Old
// Rectory", "Blandford House"). A bare street/place name with no identifier
// ("St. Davids Square", "Lamb Court", "Park Road") is rejected so it is either
// resolved to an exact number by PAF or dropped — never emailed as an address
// without a door number, flat number, street number or house name.

// Comprehensive UK street-suffix words (Royal Mail / AMU standard set). Without
// these, bare names like "St. Davids Square" or "Lamb Court" slipped through the
// old "2+ words = named property" fallback.
var STREET_SUFFIX_RE = /^(?:alley|approach|arcade|avenue|bank|bay|beach|boulevard|brae|bridge|broadway|brook|byway|causeway|chase|circus|close|common|coppice|corner|court|cove|crescent|croft|cross|crossing|dale|dell|down|downs|drive|drove|east|end|esplanade|field|fields|front|garden|gardens|gate|glade|glen|green|grove|hamlet|harbour|head|heath|heights|hill|hold|holm|ing|inlet|island|knoll|lane|la|law|links|little|loch|lodge|manor|market|marsh|mead|meadow|mews|moor|mount|north|nook|park|parkway|parade|passage|path|paddock|place|plain|platt|plaza|point|quay|ridge|rise|road|row|shaw|side|slope|south|spinney|spring|springs|square|st|station|steps|street|terrace|tops|towers|vale|view|villas|vista|walk|walkway|warren|way|west|wharf|wood|woods|yard)$/i;

function hasUsablePremiseAddress(addr, pc) {
  var a = String(addr || '').replace(new RegExp(String(pc || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
  if (!a) return false;
  // Drop trailing area tags baked in by the area-targeted scraper (", E area").
  a = a.replace(/,?\s*[A-Z]{1,2}\s+area$/i, '').trim();
  a = a.replace(/^[,\s]+/, '').replace(/[\s,]+$/, '');
  if (!a) return false;
  // 1) Door number before a street word (incl. ranges): "12 High St", "39-47 Wedmore St"
  if (/\b\d{1,5}[A-Za-z]?(?:[-\u2013]\d{1,5}[A-Za-z]?)?\s+[A-Z][A-Za-z'-]+\b/.test(a)) return true;
  // 2) Flat/apartment/unit/suite/maisonette/penthouse/room + number: "Flat 12, Eaton Mansions"
  if (/^(?:flat|apartment|unit|suite|maisonette|penthouse|room)\s*\d{1,5}[A-Za-z]?\b/i.test(a)) return true;
  // 3) BARE STREET: the first comma segment ends in a street suffix -> no premise
  //    identifier (the town/area after the comma must not mask it).
  var seg = a.split(',')[0].trim();
  var words = seg.split(/[\s,]+/).filter(Boolean);
  if (!words.length) return false;
  var last = words[words.length - 1].replace(/\.$/, '');
  if (STREET_SUFFIX_RE.test(last)) return false;
  // 4) NAMED PROPERTY — accepted ONLY when the last word is a SINGLE-PREMISE type
  //    a postman can deliver to: a house, cottage, lodge, grange, rectory, manor,
  //    farm, hall, barn, oast, school, church, hotel, inn, pub, bungalow, etc.
  //    Multi-unit block words (apartments, tower, mansions, block, court, wharf,
  //    point, heights, chambers, villas) and generic development names
  //    ("The HiLight", "The Founding", "Bendon Valley") have NO flat number and are
  //    rejected — PAF must resolve them to "Flat N, ..." or they're replaced.
  var BLOCK_WORDS_RE = /^(?:apartments?|block|tower|towers|court|courts|mansions|flats|wharf|point|heights|residence|residences|villas|chambers|studios?|suites?|place|square)$/i;
  if (BLOCK_WORDS_RE.test(last)) return false;
  var SINGLE_PREMISE_RE = /(?:house|cottage|cottages|lodge|grange|rectory|manor|farm|hall|barn|oast|school|church|chapel|hotel|inn|pub|bungalow|nursery|clinic|surgery|forge|bothy|stable|studio)$/i;
  if (words.length >= 2 && SINGLE_PREMISE_RE.test(last)) return true;
  // 5) Not a bare street, not a block, and not a single-premise name -> reject
  //    (no usable premise identifier).
  return false;
}

module.exports = { STREET_SUFFIX_RE: STREET_SUFFIX_RE, hasUsablePremiseAddress: hasUsablePremiseAddress };
