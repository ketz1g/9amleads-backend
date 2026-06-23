const https = require('https');
const fs = require('fs');
const key = 'YOUR_BREVO_API_KEY';
const BASE = 'https://www.9amleads.com';

const btData = [
  {
    id: 'moving', name: 'MovingLeads', c: '#ff6b35',
    img: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600&q=80',
    page: '/movingleadsdaily/',
    businesses: 'Removal Companies, Man &amp; Van Operators, Storage Providers, Packing Services, House Clearance Specialists, Office Relocation Companies, Shipping Providers, Furniture Removals',
    bizList: ['Removal Companies', 'Man & Van', 'Storage Providers', 'Packing Services', 'House Clearance', 'Office Relocation', 'Shipping', 'Furniture Removals'],
    source: 'Rightmove &amp; Zoopla',
    details: 'property address, move date, bedrooms, property value, estate agent details, SSTC status',
    problem: 'expensive pay-per-lead platforms, inconsistent booking volumes, competing with other removal companies for the same customers, unpredictable monthly revenue'
  },
  {
    id: 'probate', name: 'ProbateLeads', c: '#a855f7',
    img: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600&q=80',
    page: '/probateleads/',
    businesses: 'Solicitors, Probate Practitioners, Will Writers, Estate Agents, Trust Lawyers, Conveyancers, Tax Advisers, Estate Executors',
    bizList: ['Solicitors', 'Probate Practitioners', 'Will Writers', 'Estate Agents', 'Trust Lawyers', 'Conveyancers', 'Tax Advisers', 'Probate Researchers'],
    source: 'Official Gov.uk Probate Register',
    details: 'deceased name, estate value, executor details, grant type, registry location',
    problem: 'inconsistent referral flow, relying on local networking, competing with multiple firms for instructions, struggling to find families needing probate help'
  },
  {
    id: 'newbusiness', name: 'NewBusinessAlerts', c: '#06b6d4',
    img: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=600&q=80',
    page: '/newbusinessalert/',
    businesses: 'Accountants, Web Designers, Marketing Agencies, Insurance Brokers, IT Consultants, SEO Agencies, Recruiters, Financial Advisers, Copywriters, Bookkeepers',
    bizList: ['Accountants', 'Web Designers', 'Marketing Agencies', 'Insurance Brokers', 'IT Consultants', 'SEO Agencies', 'Recruiters', 'Financial Advisers', 'Copywriters', 'Bookkeepers'],
    source: 'Companies House Daily Register',
    details: 'company name, director details, SIC code, registered address, incorporation date, website',
    problem: 'cold calling outdated lists, wasting time on unqualified prospects, inconsistent new business pipeline, missing newly incorporated companies'
  },
  {
    id: 'planning', name: 'PlanningPermission', c: '#10b981',
    img: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=600&q=80',
    page: '/planningleads/',
    businesses: 'Builders, Architects, Electricians, Plumbers, Roofers, Landscapers, Kitchen Fitters, Structural Engineers, Surveyors, Painters, Plasterers, Loft Conversion Specialists',
    bizList: ['Builders', 'Architects', 'Electricians', 'Plumbers', 'Roofers', 'Landscapers', 'Kitchen Fitters', 'Structural Engineers', 'Surveyors', 'Painters', 'Plasterers'],
    source: '350+ UK Council Planning Portals',
    details: 'property address, application type, applicant details, project description, council reference',
    problem: 'inconsistent project pipeline, relying on word of mouth, expensive advertising, competing with other trades for the same jobs'
  },
  {
    id: 'tenders', name: 'PublicTenders', c: '#6366f1',
    img: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=600&q=80',
    page: '/tenders/',
    businesses: 'IT Services, Cybersecurity, Construction, Cleaning, Security, Facilities Management, Catering, Consultancy, Healthcare, Training, Legal, HR',
    bizList: ['IT Services', 'Cybersecurity', 'Construction', 'Cleaning', 'Security', 'Facilities Management', 'Catering', 'Consultancy', 'Healthcare', 'Training', 'Legal', 'HR'],
    source: 'Gov.uk Contracts Finder API &amp; Find a Tender Service',
    details: 'tender title, buyer name, contract value, submission deadline, CPV code, full documentation link',
    problem: 'missing government contract opportunities, not knowing about tenders, struggling to find suitable contracts, competing with larger firms'
  }
];

function quickLinks(bt) {
  return '<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="text-align:center;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px">' +
    '<p style="color:#8890a8;font-size:11px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;font-weight:600">Quick Links</p>' +
    '<a href="' + BASE + '" style="color:' + bt.c + ';font-size:13px;font-weight:600;text-decoration:none;margin:0 8px">Visit 9amLeads.com</a>' +
    '<span style="color:#333;margin:0 4px">|</span>' +
    '<a href="' + BASE + bt.page + '" style="color:' + bt.c + ';font-size:13px;font-weight:600;text-decoration:none;margin:0 8px">' + bt.name + ' Page</a>' +
    '<span style="color:#333;margin:0 4px">|</span>' +
    '<a href="' + BASE + '/pricing" style="color:' + bt.c + ';font-size:13px;font-weight:600;text-decoration:none;margin:0 8px">Pricing</a>' +
    '<span style="color:#333;margin:0 4px">|</span>' +
    '<a href="mailto:hello@9amleads.com" style="color:' + bt.c + ';font-size:13px;font-weight:600;text-decoration:none;margin:0 8px">Contact Us</a>' +
    '</td></tr></table>';
}

function wrap(bt, subject, body) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Outfit:wght@700;800&display=swap" rel="stylesheet"></head><body style="margin:0;padding:0;background:#000;font-family:Inter,Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%"><tr><td style="background:#0a0a0a;padding:28px 28px 20px;border-bottom:3px solid ' + bt.c + ';text-align:center"><div style="font-family:Outfit,sans-serif;font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px"><span style="color:' + bt.c + '">9am</span>Leads</div><p style="color:#666;font-size:11px;margin:4px 0 0;letter-spacing:1px;text-transform:uppercase">' + bt.name.toUpperCase() + '</p></td></tr><tr><td style="background:#0a0a0a;padding:28px 32px">' + body + '</td></tr><tr><td style="background:#0a0a0a;padding:24px 32px;border-top:1px solid #1a1a1a;text-align:center"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding-bottom:12px"><a href="' + BASE + '" style="color:#888;text-decoration:none;font-size:12px;margin:0 8px">Website</a><span style="color:#333">|</span><a href="' + BASE + '/portal/dashboard.html" style="color:#888;text-decoration:none;font-size:12px;margin:0 8px">Dashboard</a><span style="color:#333">|</span><a href="' + BASE + '/pricing" style="color:#888;text-decoration:none;font-size:12px;margin:0 8px">Pricing</a><span style="color:#333">|</span><a href="mailto:hello@9amleads.com" style="color:#888;text-decoration:none;font-size:12px;margin:0 8px">Contact</a></td></tr><tr><td><p style="color:#555;font-size:11px;margin:0;line-height:1.6">9am Leads Ltd &bull; <p style="margin:14px 0 8px">
<a href="https://www.facebook.com/share/1SBwDAUuxh/?mibextid=wwXIfr" style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:50%;background:rgba(255,255,255,0.04);color:#666;text-decoration:none;margin:0 3px;font-size:13px">f</a>
<a href="https://www.tiktok.com/@9amleads.com" style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:50%;background:rgba(255,255,255,0.04);color:#666;text-decoration:none;margin:0 3px;font-size:13px">T</a>
<a href="https://www.instagram.com/9amleads/" style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:50%;background:rgba(255,255,255,0.04);color:#666;text-decoration:none;margin:0 3px;font-size:13px">Ig</a>
</p>
    Company No. 17168176 &bull; hello@9amleads.com<br>You received this email because you showed interest in ' + bt.name + '.<br><a href="#" style="color:#555">Unsubscribe</a> &bull; <a href="' + BASE + '/privacy.html" style="color:#555">Privacy Policy</a></p></td></tr></table></td></tr></table></td></tr></table></body></html>';
}

function businessesBlock(bt) {
  const tags = bt.bizList.map(b => '<span style="display:inline-block;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:4px 10px;margin:3px;font-size:12px;color:#ccc">' + b + '</span>').join('');
  return '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#8890a8;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;font-weight:600">Who can use this lead type</p><div style="line-height:2">' + tags + '</div></div>';
}

function button(url, text, c) {
  return '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0"><a href="' + url + '" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,' + c + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px">' + text + '</a></td></tr></table>';
}

const dir = 'C:\\Users\\ketzm\\nurture-campaigns';
if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });

const sharedImages = [
  'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80',
  'https://images.unsplash.com/photo-1552581234-26160f608093?w=600&q=80',
  'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80',
  'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=600&q=80',
  'https://images.unsplash.com/photo-1573497620053-e61932e1b1c9?w=600&q=80',
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=80',
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=600&q=80',
  'https://images.unsplash.com/photo-1504307651254-84280e29209d?w=600&q=80',
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&q=80'
];

function img(url, alt) {
  return '<img src="' + url + '" alt="' + alt + '" style="width:100%;max-width:560px;height:auto;border-radius:8px;margin:16px 0;display:block">';
}

for (const bt of btData) {
  const btDir = dir + '/' + bt.name;
  fs.mkdirSync(btDir, { recursive: true });

  const day1 = '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:' + bt.c + ';margin:0 0 6px;text-align:center">Welcome to 9amLeads ' + bt.name + '</h2>' +
    img(bt.img, bt.name) +
    '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">Your journey to a consistent pipeline of exclusive leads starts here.</p>' +
    '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Welcome to the <strong style="color:' + bt.c + '">' + bt.name + '</strong> email series. Over the next 16 days, we will show you how exclusive leads in this category can transform your business pipeline.</p>' +
    '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">What is 9amLeads?</strong> We deliver exclusive business leads directly to your email at 9am every morning. Unlike shared platforms, every lead we generate is sent to you alone. No competition. No bidding wars. No price eroding.</p>' +
    businessesBlock(bt) +
    '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Our ' + bt.name.toLowerCase() + ' are sourced from ' + bt.source + ' and include ' + bt.details + '. Every lead is exclusive to you and delivered at 9am ready to action.</p>' +
    quickLinks(bt) +
    '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Over the next few weeks we will share conversion strategies, real success stories, and show you exactly how to turn these leads into paying customers.</p>' +
    button(BASE + bt.page, 'Learn More About ' + bt.name, bt.c);

  const day2 = '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:' + bt.c + ';margin:0 0 6px;text-align:center">The Hidden Cost of Shared Leads</h2>' +
    img(sharedImages[0], 'Strategy') +
    '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">Why shared lead platforms cost ' + bt.name.toLowerCase() + ' professionals more than they think.</p>' +
    '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">If you have used platforms like Bark, Checkatrade, RatedPeople, or similar services, you already know the pain: you pay for a lead, but so do three to ten of your competitors. The customer receives multiple quotes and picks the cheapest.</p>' +
    '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">This is especially damaging for ' + bt.name.toLowerCase() + ' professionals because ' + bt.problem + '.</p>' +
    '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#ccc;font-size:13px;line-height:1.8;margin:0">&#128200; <strong style="color:#fff">Lower conversion rates</strong> because you are one of many<br>&#128176; <strong style="color:#fff">Price wars</strong> that erode your profit margins<br>&#9200; <strong style="color:#fff">Slow response times</strong> because you are notified late<br>&#128683; <strong style="color:#fff">Wasted time</strong> quoting for leads who never buy<br>&#128200; <strong style="color:#fff">Unpredictable costs</strong> with no fixed pricing</p></div>' +
    businessesBlock(bt) +
    '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">At 9amLeads, every lead we generate goes to one customer only: you. No competitors see the same opportunity. No price wars. You build the relationship and win on your terms.</p>' +
    quickLinks(bt) +
    '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Our customers report 20-30% conversion rates compared to 2-5% on shared platforms.</p>' +
    button(BASE + bt.page, 'See How Exclusive Leads Work', bt.c);

  const restDays = [
    ['How Our System Works', sharedImages[0], 'Step 1: We scan ' + bt.source + ' for new opportunities daily. Step 2: Our system matches them to your business based on your selected areas and preferences. Step 3: Your exclusive leads arrive in your inbox at 9am every morning ready to call. Simple, automated, effective. No dashboard to check. No apps to open.'],
    ['Real Success Story', sharedImages[1], 'Businesses using 9amLeads ' + bt.name.toLowerCase() + ' consistently report conversion rates of 20-30%. One customer won deals worth thousands in their first week. The secret is calling within 30 minutes and personalising every pitch to the lead\'s specific situation. Speed plus exclusivity is a powerful combination. Your leads can also be sent directly to your CRM (HubSpot, Salesforce, Pipedrive, Zoho and more) via our automatic webhook integration.'],
    ['Why This Lead Type Works For Your Business', bt.img, 'This lead type is specifically designed for ' + bt.businesses + '. Every lead includes detailed, actionable information including ' + bt.details + '. You get everything you need to qualify, contact, and convert without wasting time on poor quality data.'],
    ['Who Uses ' + bt.name, sharedImages[2], bt.name + ' is ideal for a wide range of businesses including ' + bt.businesses + '. Whatever your specific niche within this market, our system can be tailored to deliver leads that match your ideal customer profile. You choose the postcode areas, we deliver the opportunities. You can also apply custom filters such as bedroom range, price bracket, property type, industry category, and more to ensure every lead matches your exact requirements.'],
    ['The 30 Minute Rule', sharedImages[1], 'Calling within 30 minutes of receiving a lead triples your conversion rate. Set your alarm for 9am, keep your script ready, and make the call immediately. Speed is your biggest competitive advantage and with exclusive leads you control the timing.'],
    ['A Script That Converts', sharedImages[2], 'Opening: Reference their specific situation from the lead data. Hook: Share relevant social proof from similar businesses. Close: Ask for the next step directly. Personalised and confident pitches consistently outperform generic scripts.'],
    ['Track Your Results', sharedImages[3], 'Track three key metrics: calls made (aim for 100%), conversations had (aim for 60%+), and conversions closed (industry average 20-30% with exclusive leads). Use your dashboard to identify which postcodes and areas perform best.'],
    ['9amLeads vs The Competition', sharedImages[4], 'Exclusive leads vs shared leads. Fixed pricing vs pay per lead. Delivered at 9am vs random timing. CRM integration (direct to your CRM via webhook) vs no integration. Custom lead filters (bedrooms, price, industry, keywords) vs no filters. 7 day free trial vs no trial. For ' + bt.name.toLowerCase() + ', the choice is clear.'],
    ['Another Success Story', sharedImages[5], 'One of our ' + bt.name.toLowerCase() + ' customers picked up 4 new clients in their first month. Their annual subscription paid for itself 10 times over. Exclusive access means you build relationships before competitors even know the opportunity exists.'],
    ['CRM Integration & Automation', sharedImages[3], 'Push your ' + bt.name.toLowerCase() + ' directly to your CRM via webhook. Connect with HubSpot, Salesforce, Pipedrive, Zoho, Freshsales and hundreds more via Zapier and Make. All plans include CSV and JSON exports. Enterprise plans include dedicated API access.'],
    ['Is This Right For Your Business?', sharedImages[7], 'If you actively call leads, operate in specific areas, want exclusivity, value predictable costs, and can call within 30 minutes then 9amLeads ' + bt.name.toLowerCase() + ' is built for you. Suitable for ' + bt.businesses + '. Still unsure? Try the free trial with no card required.',
     BASE + '/pricing', 'Start Your Free Trial'],
    ['Start Your Free Trial', sharedImages[6], 'Sign up in under 2 minutes. No credit card required. Your exclusive ' + bt.name.toLowerCase() + ' arrive at 9am tomorrow morning. Cancel anytime during your 7 day trial and keep all leads you received.',
     BASE + '/portal', 'Start Your Free Trial Now'],
    ['Final Success Story', sharedImages[8], 'Businesses using 9amLeads ' + bt.name.toLowerCase() + ' consistently win new clients. One customer won contracts worth over £100,000 in their first quarter. Consistent, exclusive leads delivered daily at 9am is the foundation of their success. Suitable for ' + bt.businesses + '.'],
    ['Join 500+ UK Businesses', sharedImages[9], 'Over 500 UK businesses trust 9amLeads to deliver exclusive leads every morning. Your ' + bt.name.toLowerCase() + ' are waiting. Sign up now and receive your first batch at 9am tomorrow. No card required. Cancel anytime.',
     BASE + '/portal', 'Start Your Free Trial Now']
  ];

  // Write Day 1
  fs.writeFileSync(btDir + '/Day_01_Welcome.html', wrap(bt, 'Day 1: Welcome to 9amLeads ' + bt.name, day1));
  
  // Write Day 2
  fs.writeFileSync(btDir + '/Day_02_Hidden_Cost_Shared_Leads.html', wrap(bt, 'Day 2: The Hidden Cost of Shared Leads', day2));

  // Write Days 3-16
  for (let i = 0; i < restDays.length; i++) {
    const d = restDays[i];
    const dayNum = i + 3;
    let bodyContent = '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:' + bt.c + ';margin:0 0 6px;text-align:center">' + d[0] + '</h2>' +
      img(d[1], d[0]) +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">' + d[2] + '</p>';
    
    if (i >= 0 && i < 9) { // Days 3-11: standard content with business block
      bodyContent += businessesBlock(bt);
      bodyContent += quickLinks(bt);
      bodyContent += button(BASE + bt.page, 'Learn More About ' + bt.name, bt.c);
    }
    if (i >= 9) { // Days 12-16: CTA content
      bodyContent += businessesBlock(bt);
      bodyContent += quickLinks(bt);
      bodyContent += button(d[3], d[4], bt.c);
    }

    const filename = btDir + '/Day_' + String(dayNum).padStart(2, '0') + '_' + d[0].replace(/[^a-zA-Z0-9]/g, '_') + '.html';
    fs.writeFileSync(filename, wrap(bt, 'Day ' + dayNum + ': ' + d[0], bodyContent));
  }

  console.log('Generated 16 emails for ' + bt.name);
}

console.log('\nAll complete. ' + (btData.length * 16) + ' total emails in: ' + dir);





