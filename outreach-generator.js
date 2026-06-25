// ===== AI OUTREACH MESSAGE GENERATOR =====
// Generates personalised first-contact messages for each lead

function getBestContactMethod(lead) {
  var data = typeof lead.data === 'string' ? JSON.parse(lead.data || '{}') : (lead.data || {});
  var product = lead.product || 'moving';

  var contact = {
    email: data.ownerEmail || data.legalAdvisorEmail || data.buyerEmail || '',
    phone: data.phone || data.legalAdvisorPhone || data.buyerPhone || '',
    website: data.website || data.url || '',
    linkedin: '',
    postal: data.address || data.applicantAddress || '',
    recommended: 'Email first, then call after 48 hours.'
  };

  // Build LinkedIn URL from company name
  if (data.company || data.companyName) {
    var companyName = (data.company || data.companyName).toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
    if (companyName) contact.linkedin = 'https://www.linkedin.com/company/' + companyName + '/about/';
  }

  return contact;
}

function renderContactMethods(leadId) {
  var lead = typeof leadId === 'object' ? leadId : null;
  if (!lead) lead = (typeof leads !== 'undefined' ? leads.find(function(l) { return l.id === leadId; }) : null);
  if (!lead) return '<p style="color:var(--muted);font-size:11px">Contact data not available.</p>';
  
  var contact = getBestContactMethod(lead);
  var items = [];
  var hasAny = false;

  if (contact.email) { items.push('<div style="display:flex;align-items:center;gap:6px"><i class="fas fa-envelope" style="color:var(--accent);width:14px;font-size:11px"></i><span style="font-size:11px;color:var(--text);word-break:break-all">' + contact.email + '</span></div>'); hasAny = true; }
  if (contact.phone) { items.push('<div style="display:flex;align-items:center;gap:6px"><i class="fas fa-phone" style="color:var(--accent);width:14px;font-size:11px"></i><span style="font-size:11px;color:var(--text)">' + contact.phone + '</span></div>'); hasAny = true; }
  if (contact.website) { items.push('<div style="display:flex;align-items:center;gap:6px"><i class="fas fa-globe" style="color:var(--accent);width:14px;font-size:11px"></i><a href="' + contact.website + '" target="_blank" style="font-size:11px;color:var(--accent);text-decoration:underline;word-break:break-all">' + contact.website.substring(0, 40) + '...</a></div>'); hasAny = true; }
  if (contact.linkedin) { items.push('<div style="display:flex;align-items:center;gap:6px"><i class="fab fa-linkedin" style="color:#0a66c2;width:14px;font-size:11px"></i><a href="' + contact.linkedin + '" target="_blank" style="font-size:11px;color:var(--accent);text-decoration:underline">LinkedIn Profile</a></div>'); hasAny = true; }
  if (contact.postal) { items.push('<div style="display:flex;align-items:center;gap:6px"><i class="fas fa-map-marker-alt" style="color:var(--accent);width:14px;font-size:11px"></i><span style="font-size:11px;color:var(--text2)">' + contact.postal.substring(0, 50) + '</span></div>'); hasAny = true; }

  // Add "not found" for missing methods
  if (!contact.email) items.push('<div style="display:flex;align-items:center;gap:6px"><i class="fas fa-envelope" style="color:var(--muted);width:14px;font-size:11px"></i><span style="font-size:11px;color:var(--muted);font-style:italic">Not found yet</span></div>');
  if (!contact.phone) items.push('<div style="display:flex;align-items:center;gap:6px"><i class="fas fa-phone" style="color:var(--muted);width:14px;font-size:11px"></i><span style="font-size:11px;color:var(--muted);font-style:italic">Not found yet</span></div>');
  if (!contact.website) items.push('<div style="display:flex;align-items:center;gap:6px"><i class="fas fa-globe" style="color:var(--muted);width:14px;font-size:11px"></i><span style="font-size:11px;color:var(--muted);font-style:italic">Not found yet</span></div>');
  if (!contact.linkedin) items.push('<div style="display:flex;align-items:center;gap:6px"><i class="fab fa-linkedin" style="color:var(--muted);width:14px;font-size:11px"></i><span style="font-size:11px;color:var(--muted);font-style:italic">Not found yet</span></div>');
  if (!contact.postal) items.push('<div style="display:flex;align-items:center;gap:6px"><i class="fas fa-map-marker-alt" style="color:var(--muted);width:14px;font-size:11px"></i><span style="font-size:11px;color:var(--muted);font-style:italic">Not found yet</span></div>');

  items.push('<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)"><i class="fas fa-lightbulb" style="color:var(--warning);font-size:11px;margin-right:4px"></i><span style="font-size:11px;color:var(--text2)">' + contact.recommended + '</span></div>');

  return '<div style="display:flex;flex-direction:column;gap:4px">' + items.join('') + '</div>';
}

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
