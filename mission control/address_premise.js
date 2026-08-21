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
  // Multi-unit building indicators: if the address names a block/tower/wharf/etc.
  // the street number points to the BUILDING, not a specific flat — it must have a
  // "Flat X"/"Apartment X" number to be mailable ("Landmark East Tower, 24 Marsh
  // Wall" without a flat number cannot be posted to a specific flat).
  var MULTI_UNIT_RE = /(?:tower|towers|apartments|block|court|courts|wharf|point|heights|mansions|residence|residences|quarters|villas|suites|studios|flats)\b/i;
  // 1) Door number before a street word (incl. ranges): "12 High St", "39-47 Wedmore St"
  var hasDoorNumber = /\b\d{1,5}[A-Za-z]?(?:[-\u2013]\d{1,5}[A-Za-z]?)?\s+[A-Z][A-Za-z'-]+\b/.test(a);
  // 2) Flat/apartment/unit/suite/maisonette/penthouse/room + number: "Flat 12, Eaton Mansions"
  var hasFlatNumber = /(?:flat|apartment|unit|suite|maisonette|penthouse|room)\s*\d{1,5}[A-Za-z]?\b/i.test(a);
  if (hasFlatNumber) return true;
  if (hasDoorNumber && MULTI_UNIT_RE.test(a)) return false;
  if (hasDoorNumber) return true;
  // 3) BARE STREET: the first comma segment ends in a street suffix -> no premise
  //    identifier (the town/area after the comma must not mask it).
  var seg = a.split(',')[0].trim();
  var words = seg.split(/[\s,]+/).filter(Boolean);
  if (!words.length) return false;
  var last = words[words.length - 1].replace(/\.$/, '');
  if (STREET_SUFFIX_RE.test(last)) return false;
  // 4) NAMED PROPERTY — must STILL have a door/flat/apartment number to be
  //    deliverable. A bare building name ("Camille House, Beulah Hill",
  //    "Prospect House, Coombe Wood Rd") does NOT identify a specific premise a
  //    removals company can act on, so it is REJECTED unless a number appears
  //    elsewhere in the address (sections 1-2 already accepted those).
  //    (Business rule 2026-08-21: named building => needs door/flat/apartment number.)
  var BLOCK_WORDS_RE = /^(?:apartments?|block|tower|towers|court|courts|mansions|flats|wharf|point|heights|residence|residences|villas|chambers|studios?|suites?|place|square)$/i;
  if (BLOCK_WORDS_RE.test(last)) return false;
  // 5) No numeric premise identifier found anywhere -> reject (no usable premise).
  return false;
}

module.exports = { STREET_SUFFIX_RE: STREET_SUFFIX_RE, hasUsablePremiseAddress: hasUsablePremiseAddress };
