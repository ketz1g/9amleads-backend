// ===== AI OUTREACH MESSAGE GENERATOR =====
// Generates personalised first-contact messages for each lead

function generateOutreachMessages(lead) {
  var data = typeof lead.data === 'string' ? JSON.parse(lead.data || '{}') : (lead.data || {});
  var product = lead.product || 'moving';
  var name = data.deceasedName || data.applicant || data.name || data.companyName || data.company || '';
  var company = data.company || data.companyName || data.buyer || data.council || data.agent || '';
  var address = data.address || '';
  var postcode = data.postcode || '';
  var price = data.price || data.estateValue || data.contractValue || data.value || '';
  var bedrooms = data.bedrooms || '';
  var status = data.status || '';
  var url = data.url || '';
  var email = data.ownerEmail || data.legalAdvisorEmail || data.buyerEmail || '';
  var applicationType = data.applicationType || '';
  var description = data.description || '';
  var closingDate = data.closingDate || data.closing_date || '';
  var deceasedName = data.deceasedName || '';
  var estateValue = data.estateValue || '';
  var companyNumber = data.companyNumber || '';
  var sicCode = data.sicCode || data.sic_description || '';
  var tenderTitle = data.tenderTitle || data.title || '';
  var buyer = data.buyer || data.authority || '';
  var contractValue = data.contractValue || data.value || '';

  // Build trigger event based on product type
  var triggerEvent = '';
  var service = '';

  if (product === 'moving') {
    var bedText = bedrooms ? bedrooms + '-bedroom ' : '';
    var statusText = status.includes('sstc') || status.includes('sold') ? 'gone Sold Subject to Contract' : status.includes('offer') ? 'received an offer' : 'been listed';
    triggerEvent = 'your property at ' + address + ' has ' + statusText;
    service = 'removals, packing, and logistics services';
    if (!address) triggerEvent = 'your property has ' + statusText;
  } else if (product === 'probate') {
    triggerEvent = 'a probate grant has been issued for the estate of ' + (deceasedName || 'a recently deceased person');
    service = 'probate, estate administration, and legal services';
    if (estateValue) triggerEvent += ' (estate value: £' + (parseInt(estateValue).toLocaleString()) + ')';
  } else if (product === 'newbusiness') {
    triggerEvent = (company || 'your company') + ' recently registered with Companies House';
    service = 'accounting, website design, insurance, IT support, and marketing services';
    if (sicCode) triggerEvent += ' in the ' + sicCode + ' sector';
    if (companyNumber) triggerEvent += ' (No. ' + companyNumber + ')';
  } else if (product === 'planning') {
    var appType = applicationType || 'a planning application';
    triggerEvent = appType + ' has been submitted for ' + (address || 'your property');
    service = 'building, architectural, and construction services';
    if (description) triggerEvent += ' — ' + description.substring(0, 80);
  } else if (product === 'tenders') {
    triggerEvent = (tenderTitle || 'a new contract opportunity') + ' has been published by ' + (buyer || 'a public sector organisation');
    service = 'bid support, tender writing, and submission services';
    if (contractValue) triggerEvent += ' (estimated value: £' + (parseInt(contractValue).toLocaleString()) + ')';
    if (closingDate) {
      var daysLeft = Math.max(0, Math.floor((new Date(closingDate) - new Date()) / 86400000));
      triggerEvent += ' — deadline in ' + daysLeft + ' days';
    }
  }

  var greeting = name ? 'Hi ' + name : (company ? 'Hi there' : 'Hello');
  var companyRef = company || 'your business';

  var shortEmail = greeting + ',\n\nI noticed ' + triggerEvent + '. We help ' + (product === 'tenders' ? 'businesses' : 'businesses like ' + companyRef) + ' with ' + service + '.\n\nWould you be open to a quick chat this week?';

  var whatsapp = greeting + ' 👋\n\nI just saw that ' + triggerEvent + '.\nWe specialise in helping ' + (product === 'tenders' ? 'organisations win public sector contracts' : 'businesses like yours with ' + service) + '.\n\nWould you be free for a quick 5-minute call?';

  var phoneOpener = greeting + ', my name is [Your Name] from [Your Company]. I was just looking at some updates and noticed that ' + triggerEvent + '. We actually help ' + (product === 'tenders' ? 'organisations bid on contracts like this one' : 'businesses with ' + service) + '. I\'d love to see if we can help you too. Do you have a couple of minutes to chat?';

  return {
    lead_id: lead.id || '',
    product: product,
    address: address,
    name: name,
    company: company,
    email: shortEmail,
    whatsapp: whatsapp,
    phone: phoneOpener,
    triggerEvent: triggerEvent,
    generated: new Date().toISOString()
  };
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateOutreachMessages: generateOutreachMessages };
}

// Export for browser
if (typeof window !== 'undefined') {
  window.OutreachGenerator = { generateOutreachMessages: generateOutreachMessages };
}
