const fs = require('fs');
const dir = 'C:\\Users\\ketzm\\nurture-campaigns';
if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
fs.mkdirSync(dir);

const BASE = 'https://www.9amleads.com';

const btData = [
  { id: 'moving', name: 'MovingLeads', c: '#ff6b35', img: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600&q=80' },
  { id: 'probate', name: 'ProbateLeads', c: '#a855f7', img: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600&q=80' },
  { id: 'newbusiness', name: 'NewBusinessAlerts', c: '#06b6d4', img: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=600&q=80' },
  { id: 'planning', name: 'PlanningPermission', c: '#10b981', img: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=600&q=80' },
  { id: 'tenders', name: 'PublicTenders', c: '#6366f1', img: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=600&q=80' }
];

function wrap(bt, subject, body) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Outfit:wght@700;800&display=swap" rel="stylesheet"></head><body style="margin:0;padding:0;background:#000;font-family:Inter,Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%"><tr><td style="background:#0a0a0a;padding:28px 28px 20px;border-bottom:3px solid ' + bt.c + ';text-align:center"><div style="font-family:Outfit,sans-serif;font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px"><span style="color:' + bt.c + '">9am</span>Leads</div><p style="color:#666;font-size:11px;margin:4px 0 0;letter-spacing:1px;text-transform:uppercase">' + bt.name.toUpperCase() + '</p></td></tr><tr><td style="background:#0a0a0a;padding:28px 32px">' + body + '</td></tr><tr><td style="background:#0a0a0a;padding:24px 32px;border-top:1px solid #1a1a1a;text-align:center"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding-bottom:12px"><a href="' + BASE + '" style="color:#888;text-decoration:none;font-size:12px;margin:0 8px">Website</a><span style="color:#333">|</span><a href="' + BASE + '/portal/dashboard.html" style="color:#888;text-decoration:none;font-size:12px;margin:0 8px">Dashboard</a><span style="color:#333">|</span><a href="' + BASE + '/pricing" style="color:#888;text-decoration:none;font-size:12px;margin:0 8px">Pricing</a><span style="color:#333">|</span><a href="mailto:hello@9amleads.com" style="color:#888;text-decoration:none;font-size:12px;margin:0 8px">Contact</a></td></tr><tr><td><p style="color:#555;font-size:11px;margin:0;line-height:1.6">9am Leads Ltd &bull; Company No. 17168176 &bull; hello@9amleads.com<br>You received this email because you showed interest in ' + bt.name + '.<br><a href="#" style="color:#555">Unsubscribe</a> &bull; <a href="' + BASE + '/privacy.html" style="color:#555">Privacy Policy</a></p></td></tr></table></td></tr></table></td></tr></table></body></html>';
}

function generateDay(bt, dayNum, title, bodyContent) {
  return '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">' + title + '</h2>' + bodyContent;
}

const sharedImages = [
  'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=600&q=80',
  'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&q=80',
  'https://images.unsplash.com/photo-1523240795612-9a054b0e6441?w=600&q=80',
  'https://images.unsplash.com/photo-1521791136064-2b8711a1cfb9?w=600&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80',
  'https://images.unsplash.com/photo-1552581234-26160f608093?w=600&q=80',
  'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80',
  'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=600&q=80',
  'https://images.unsplash.com/photo-1573497620053-e61932e1b1c9?w=600&q=80',
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=80',
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=600&q=80',
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&q=80'
];

const dayTemplates = [
  {
    title: 'Welcome to 9amLeads',
    body: function(bt) {
      return '<img src="' + bt.img + '" alt="' + bt.name + '" style="width:100%;max-width:560px;height:auto;border-radius:8px;margin:16px 0;display:block">' +
        '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">Your journey to a consistent pipeline of exclusive leads starts here.</p>' +
        '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Welcome to the <strong style="color:' + bt.c + '">' + bt.name + '</strong> email series. Over the next 16 days, we will show you how exclusive ' + bt.name.toLowerCase() + ' can transform your business pipeline.</p>' +
        '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">What is 9amLeads?</strong> We deliver exclusive business leads directly to your email at 9am every morning. Unlike shared platforms, every lead we generate is sent to you alone. No competition. No bidding wars.</p>' +
        '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Our ' + bt.name.toLowerCase() + ' product is specifically designed for businesses in this space. Each lead includes detailed, actionable information sourced from official UK data sources.</p>' +
        '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Tomorrow we explore the real cost of shared leads and why exclusive access changes everything.</p>' +
        '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0"><a href="' + BASE + '/' + bt.id + '/" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,' + bt.c + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px">Learn More About ' + bt.name + '</a></td></tr></table>';
    }
  },
  {
    title: 'The Hidden Cost of Shared Leads',
    body: function(bt) {
      return '<img src="' + sharedImages[1] + '" alt="Strategy" style="width:100%;max-width:560px;height:auto;border-radius:8px;margin:16px 0;display:block">' +
        '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">Why shared lead platforms cost you more than you think.</p>' +
        '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">If you have used Bark, Checkatrade, RatedPeople, or similar services, you already know the pain: you pay for a lead, but so do three to ten of your competitors. The customer compares multiple quotes and picks the cheapest.</p>' +
        '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="color:#ccc;font-size:13px;line-height:1.8;margin:0">\u{1F4C8} <strong style="color:#fff">Lower conversion rates</strong> because you are one of many<br>\u{1F4B0} <strong style="color:#fff">Price wars</strong> that erode your profit margins<br>\u{23F0} <strong style="color:#fff">Slow response times</strong> because you are notified late<br>\u{1F6AB} <strong style="color:#fff">Wasted time</strong> quoting for leads who never buy<br>\u{1F4C8} <strong style="color:#fff">Unpredictable costs</strong> with no fixed pricing</p></div>' +
        '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">At 9amLeads, every lead we generate goes to one customer only: you. No competitors see the same opportunity. No price wars. You build the relationship and win on your terms.</p>' +
        '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Our customers report 20-30% conversion rates with exclusive leads compared to 2-5% on shared platforms.</p>';
    }
  }
];

// Generate remaining days generically
for (let d = 2; d < 16; d++) {
  dayTemplates.push({
    title: ['Shared Leads Cost You Money', 'How Our System Works', 'Real Success Story', 'Why This Lead Type Works', 'Industry Deep Dive', 'The 30 Minute Rule', 'Script That Converts', 'Track Your Results', '9amLeads vs The Competition', 'Another Success Story', 'CRM Integration', 'Is This Right For You?', 'Start Your Free Trial', 'Final Success Story', 'Join 500+ UK Businesses'][d - 2],
    body: function(bt) {
      const titles = ['Shared Leads Cost You Money', 'How Our System Works', 'Real Success Story', 'Why This Lead Type Works', 'Industry Deep Dive', 'The 30 Minute Rule', 'Script That Converts', 'Track Your Results', '9amLeads vs The Competition', 'Another Success Story', 'CRM Integration', 'Is This Right For You?', 'Start Your Free Trial', 'Final Success Story', 'Join 500+ UK Businesses'];
      const contents = [
        '<img src="' + sharedImages[1] + '" style="width:100%;border-radius:8px;margin:16px 0"><p style="color:#ccc;font-size:14px;line-height:1.7">Platforms like Bark and Checkatrade send your leads to multiple businesses. You compete on price and margins shrink. 9amLeads gives you exclusive access, better margins, and higher conversion rates for ' + bt.name.toLowerCase() + '.</p>',
        '<img src="' + sharedImages[0] + '" style="width:100%;border-radius:8px;margin:16px 0"><p style="color:#ccc;font-size:14px;line-height:1.7">Step 1: We scan official UK data sources for new opportunities in ' + bt.name.toLowerCase() + '. Step 2: We match them to your business based on your criteria. Step 3: Your exclusive leads arrive at 9am every morning. Simple and automated.</p>',
        '<img src="' + sharedImages[2] + '" style="width:100%;border-radius:8px;margin:16px 0"><p style="color:#ccc;font-size:14px;line-height:1.7">Businesses using 9amLeads ' + bt.name.toLowerCase() + ' consistently report conversion rates of 20-30%. One customer won deals worth thousands in their first week. The secret is calling within 30 minutes and personalising every pitch.</p>',
        '<img src="' + bt.img + '" style="width:100%;border-radius:8px;margin:16px 0"><p style="color:#ccc;font-size:14px;line-height:1.7">This lead type is specifically designed for ' + bt.name.toLowerCase() + ' professionals. Every lead includes detailed, actionable information that helps you qualify and convert quickly. No wasted time on poor quality data.</p>',
        '<img src="' + sharedImages[3] + '" style="width:100%;border-radius:8px;margin:16px 0"><p style="color:#ccc;font-size:14px;line-height:1.7">The businesses that succeed with exclusive ' + bt.name.toLowerCase() + ' share common traits: they call fast, personalise their approach, and follow up persistently. This is a lead type that rewards speed and professionalism.</p>',
        '<img src="' + sharedImages[4] + '" style="width:100%;border-radius:8px;margin:16px 0"><p style="color:#ccc;font-size:14px;line-height:1.7">Calling within 30 minutes of receiving a lead triples your conversion rate. Set your alarm for 9am, keep your script ready, and make the call immediately. Speed is your biggest competitive advantage with ' + bt.name.toLowerCase() + '.</p>',
        '<img src="' + sharedImages[5] + '" style="width:100%;border-radius:8px;margin:16px 0"><p style="color:#ccc;font-size:14px;line-height:1.7">Opening: Reference their specific situation from the lead data. Hook: Share relevant social proof. Close: Ask for the next step. Personalised, confident pitches consistently outperform generic scripts in ' + bt.name.toLowerCase() + '.</p>',
        '<img src="' + sharedImages[6] + '" style="width:100%;border-radius:8px;margin:16px 0"><p style="color:#ccc;font-size:14px;line-height:1.7">Track three metrics: calls made (aim for 100%), conversations had (aim for 60%+), and conversions closed (industry average 20-30%). Use your dashboard to see which postcodes and lead sources perform best for your ' + bt.name.toLowerCase() + ' business.</p>',
        '<img src="' + sharedImages[7] + '" style="width:100%;border-radius:8px;margin:16px 0"><p style="color:#ccc;font-size:14px;line-height:1.7">Exclusive leads vs shared leads. Fixed pricing vs pay per lead. Delivered at 9am vs random timing. CRM integration vs none. 7 day free trial vs no trial. For ' + bt.name.toLowerCase() + ', the choice is clear.</p>',
        '<img src="' + sharedImages[8] + '" style="width:100%;border-radius:8px;margin:16px 0"><p style="color:#ccc;font-size:14px;line-height:1.7">One of our ' + bt.name.toLowerCase() + ' customers picked up 4 new clients in their first month. Their annual subscription paid for itself 10 times over. Exclusive access means you build relationships before competitors even know the opportunity exists.</p>',
        '<img src="' + sharedImages[6] + '" style="width:100%;border-radius:8px;margin:16px 0"><p style="color:#ccc;font-size:14px;line-height:1.7">Push your ' + bt.name.toLowerCase() + ' directly to your CRM via webhook. Connect with HubSpot, Salesforce, Pipedrive, Zoho, Freshsales and hundreds more via Zapier and Make. All plans include CSV and JSON exports. Set it up in your dashboard.</p>',
        '<img src="' + sharedImages[10] + '" style="width:100%;border-radius:8px;margin:16px 0"><p style="color:#ccc;font-size:14px;line-height:1.7">If you actively call leads, operate in specific areas, want exclusivity, value predictable costs, and can call within 30 minutes then 9amLeads ' + bt.name.toLowerCase() + ' is built for you. Still unsure? Try the free trial with no card required.</p>' +
        '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0"><a href="' + BASE + '/pricing" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,' + bt.c + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px">Start Your Free Trial</a></td></tr></table>',
        '<img src="' + sharedImages[9] + '" style="width:100%;border-radius:8px;margin:16px 0"><p style="color:#ccc;font-size:14px;line-height:1.7">Sign up in under 2 minutes. No credit card required. Your exclusive ' + bt.name.toLowerCase() + ' arrive at 9am tomorrow morning. Cancel anytime during your 7 day trial. Keep all leads you received.</p>' +
        '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0"><a href="' + BASE + '/portal" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,' + bt.c + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:16px">Start Your Free Trial</a></td></tr></table>',
        '<img src="' + sharedImages[10] + '" style="width:100%;border-radius:8px;margin:16px 0"><p style="color:#ccc;font-size:14px;line-height:1.7">Businesses using 9amLeads ' + bt.name.toLowerCase() + ' consistently win new clients. One customer won contracts worth over £100k in their first quarter. Consistent, exclusive leads delivered daily at 9am is the foundation of their success.</p>',
        '<img src="' + sharedImages[11] + '" style="width:100%;border-radius:8px;margin:16px 0"><p style="color:#ccc;font-size:14px;line-height:1.7">Over 500 UK businesses trust 9amLeads to deliver exclusive leads every morning. Your ' + bt.name.toLowerCase() + ' are waiting. Sign up now and receive your first batch at 9am tomorrow. No card required. Cancel anytime.</p>' +
        '<div style="background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.15);border-radius:12px;padding:20px;margin:16px 0;text-align:center"><p style="color:#fff;font-size:16px;font-weight:700;margin:0 0 8px;font-family:Outfit,sans-serif">Start Your 7 Day Free Trial</p><p style="color:#8890a8;font-size:13px;margin:0">Your exclusive ' + bt.name.toLowerCase() + ' arrive at 9am tomorrow.</p></div>' +
        '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0"><a href="' + BASE + '/portal" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,' + bt.c + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:16px">Start Your Free Trial Now</a></td></tr></table>'
      ];
      return contents[d - 2] || '<p style="color:#ccc;font-size:14px;line-height:1.7">Tailored content for ' + bt.name.toLowerCase() + '.</p>';
    }
  });
}

for (const bt of btData) {
  const btDir = dir + '/' + bt.name;
  fs.mkdirSync(btDir, { recursive: true });
  
  for (let i = 0; i < dayTemplates.length; i++) {
    const dt = dayTemplates[i];
    const bodyContent = dt.body(bt);
    const heading = '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:' + bt.c + ';margin:0 0 6px;text-align:center">' + dt.title + '</h2>';
    const fullBody = heading + bodyContent;
    const html = wrap(bt, 'Day ' + (i + 1) + ': ' + dt.title, fullBody);
    const filename = btDir + '/Day_' + String(i + 1).padStart(2, '0') + '_' + dt.title.replace(/[^a-zA-Z0-9]/g, '_') + '.html';
    fs.writeFileSync(filename, html);
  }
  
  console.log('Generated ' + dayTemplates.length + ' emails for ' + bt.name);
}

console.log('\nAll complete. ' + (btData.length * dayTemplates.length) + ' total emails generated in: ' + dir);


