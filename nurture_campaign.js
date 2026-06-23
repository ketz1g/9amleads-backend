const https = require('https');
const key = 'YOUR_BREVO_API_KEY';
const to = 'ketzman1g@gmail.com';
const URL = 'https://www.9amleads.com';
const accent = '#0ea5e9';

function wrap(subject, body) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Outfit:wght@700;800&display=swap" rel="stylesheet"></head><body style="margin:0;padding:0;background:#000;font-family:Inter,Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%"><tr><td style="background:#0a0a0a;padding:28px 28px 20px;border-bottom:3px solid ' + accent + ';text-align:center"><div style="font-family:Outfit,sans-serif;font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px"><span style="color:' + accent + '">9am</span>Leads</div><p style="color:#666;font-size:11px;margin:4px 0 0;letter-spacing:1px;text-transform:uppercase">UK Lead Generation</p></td></tr><tr><td style="background:#0a0a0a;padding:28px 32px">' + body + '</td></tr><tr><td style="background:#0a0a0a;padding:24px 32px;border-top:1px solid #1a1a1a;text-align:center"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding-bottom:12px"><a href="' + URL + '" style="color:#888;text-decoration:none;font-size:12px;margin:0 8px">Website</a><span style="color:#333">|</span><a href="' + URL + '/portal/dashboard.html" style="color:#888;text-decoration:none;font-size:12px;margin:0 8px">Dashboard</a><span style="color:#333">|</span><a href="' + URL + '/pricing" style="color:#888;text-decoration:none;font-size:12px;margin:0 8px">Pricing</a><span style="color:#333">|</span><a href="mailto:hello@9amleads.com" style="color:#888;text-decoration:none;font-size:12px;margin:0 8px">Contact</a></td></tr><tr><td><p style="color:#555;font-size:11px;margin:0;line-height:1.6">9am Leads Ltd &bull; Company No. 17168176 &bull; hello@9amleads.com<br>You received this email because you registered interest in 9amLeads.<br><a href="#" style="color:#555">Unsubscribe</a> &bull; <a href="' + URL + '/privacy.html" style="color:#555">Privacy Policy</a></p></td></tr></table></td></tr></table></td></tr></table></body></html>';
}

function button(url, text) {
  return '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0"><a href="' + url + '" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,' + accent + ',#0284c7);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px">' + text + '</a></td></tr></table>';
}

function img(url, alt) {
  return '<img src="' + url + '" alt="' + alt + '" style="width:100%;max-width:560px;height:auto;border-radius:8px;margin:16px 0;display:block">';
}

const campaign = [
  {
    subject: 'Day 1: Discover How 9amLeads Can Grow Your Business',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=80',
    alt: 'Bright modern office',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Welcome to 9amLeads</h2>' +
      img('https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=80', 'Bright modern office') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">Your journey to a consistent pipeline of exclusive leads starts here.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Hello and welcome. Over the next 16 days we will show you how 9amLeads can transform the way you generate new business. Each day you will receive a short email with practical insights, real success stories, and a clear picture of what it looks like to have exclusive leads landing in your inbox at 9am every morning.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">What is 9amLeads?</strong> We are a UK lead generation company that delivers exclusive business leads directly to your email at 9am every morning. Unlike lead generation websites where you compete with multiple businesses for the same customer, our leads are <strong style="color:#fff">sent to you alone</strong>. No competition. No bidding wars. No shared leads.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">We cover five lead types: Moving Leads, Probate Leads, New Business Alerts, Planning Permission Leads, and Public Sector Tenders. Whichever industry you are in, there is a lead type designed for your business.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Over the next few weeks we will dive deep into each lead type, share conversion strategies, and show you how our customers are winning millions in new business. By the end of this campaign, you will know exactly how 9amLeads can work for you.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Tomorrow we will look at the problem we solve: why most businesses are missing out on the best leads.</p>' +
      button(URL + '/how-it-works', 'Learn How It Works')
  },
  {
    subject: 'Day 2: The Hidden Cost of Shared Leads',
    image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&q=80',
    alt: 'Strategy discussion',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">The Hidden Cost of Shared Leads</h2>' +
      img('https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&q=80', 'Strategy discussion') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">Why most lead generation platforms are costing you more than you think.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">If you have used lead generation platforms like Bark, Checkatrade, RatedPeople, or similar services, you already know the pain: you pay for a lead, but so do three, five, or even ten of your competitors. The customer receives multiple quotes, compares prices, and the cheapest option usually wins. This is not lead generation. This is a bidding war.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">The real cost of shared leads:</strong></p>' +
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px">' +
      '<p style="color:#ccc;font-size:13px;line-height:1.8;margin:0">' +
      '&#128200; <strong style="color:#fff">Lower conversion rates</strong> because you are one of many<br>' +
      '&#128176; <strong style="color:#fff">Price wars</strong> that erode your profit margins<br>' +
      '&#9200; <strong style="color:#fff">Slow response times</strong> because you are notified late<br>' +
      '&#128683; <strong style="color:#fff">Wasted time</strong> quoting for customers who never intended to buy<br>' +
      '&#128200; <strong style="color:#fff">Unpredictable costs</strong> with no fixed monthly pricing</p></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">At 9amLeads, we take a different approach. Every lead we generate is sent to <strong style="color:#fff">one customer only</strong>: you. No competitors see the same lead. No price wars. No rushed quotes. You have the time and space to build a relationship and win the business on your terms.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:' + accent + '">The result?</strong> Our customers report conversion rates of 20-30% with exclusive leads, compared to 2-5% on shared platforms. That is a 5x to 10x improvement.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Tomorrow we will show you exactly how our system works to deliver these exclusive leads to your inbox every morning.</p>' +
      button(URL + '/how-it-works', 'See How Exclusive Leads Work')
  },
  {
    subject: 'Day 3: How 9amLeads Works: Your Daily Lead Machine',
    image: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=600&q=80',
    alt: 'Lead generation system',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">How 9amLeads Works</h2>' +
      img('https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=600&q=80', 'Lead generation system') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">A simple, automated system that delivers leads to your inbox at 9am every morning.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Our system is built on three principles: <strong style="color:#fff">exclusivity, speed, and simplicity</strong>. Here is exactly how it works:</p>' +
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin:0 0 16px">' +
      '<div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<div style="width:32px;height:32px;border-radius:50%;background:' + accent + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;margin-bottom:8px">1</div>' +
      '<h3 style="font-family:Outfit,sans-serif;font-size:15px;font-weight:700;color:#fff;margin:0 0 4px">We Source the Leads</h3>' +
      '<p style="color:#8890a8;font-size:13px;line-height:1.6;margin:0">Our automated system scans hundreds of data sources including Rightmove, Zoopla, Companies House, the Gov.uk Probate Register, 350+ council planning portals, and Contracts Finder. We identify new opportunities as they happen and compile them into clean, actionable lead sheets.</p></div>' +
      '<div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<div style="width:32px;height:32px;border-radius:50%;background:' + accent + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;margin-bottom:8px">2</div>' +
      '<h3 style="font-family:Outfit,sans-serif;font-size:15px;font-weight:700;color:#fff;margin:0 0 4px">We Match Them to You</h3>' +
      '<p style="color:#8890a8;font-size:13px;line-height:1.6;margin:0">Based on your selected postcode areas and lead type, the system assigns each lead exclusively to you. No one else receives it. You are the first and only person to contact the prospect.</p></div>' +
      '<div style="margin-bottom:4px">' +
      '<div style="width:32px;height:32px;border-radius:50%;background:' + accent + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;margin-bottom:8px">3</div>' +
      '<h3 style="font-family:Outfit,sans-serif;font-size:15px;font-weight:700;color:#fff;margin:0 0 4px">Delivered at 9am Every Morning</h3>' +
      '<p style="color:#8890a8;font-size:13px;line-height:1.6;margin:0">By 9:00am your lead sheet arrives in your inbox with full details: names, addresses, property information, valuation estimates, company registration data, and more. You open your email, pick up the phone, and start converting.</p></div></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">That is it. No dashboard to check. No apps to open. No complex software to learn. Just open your email at 9am and start calling.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Tomorrow we will share a real success story from one of our customers who transformed their business using this exact system.</p>' +
      button(URL + '/how-it-works', 'Explore the Full Process')
  },
  {
    subject: 'Day 4: Success Story: How One Removal Company Won 3 Contracts in Week One',
    image: 'https://images.unsplash.com/photo-1523240795612-9a054b0e6441?w=600&q=80',
    alt: 'Happy customer handshake',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Success Story: 3 Contracts in Week One</h2>' +
      img('https://images.unsplash.com/photo-1523240795612-9a054b0e6441?w=600&q=80', 'Happy customer handshake') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">How a Southampton removal company turned 12 leads into over £3,600 in additional revenue.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Mark runs an independent removal company in Southampton. Before 9amLeads, he was relying on Google Ads and word of mouth to generate business. Some months were great. Most months were inconsistent. He needed a reliable, predictable source of leads.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">He signed up for 9amLeads Moving Leads on a Monday. By Friday of that same week, here is what happened:</p>' +
      '<div style="background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.15);border-radius:12px;padding:20px;margin:0 0 16px">' +
      '<p style="color:#ccc;font-size:13px;line-height:1.7;margin:0"><em>"I got 12 leads in my first week. Called every one within 30 minutes. Converted 3 into paying jobs and made <strong style="color:' + accent + '">£3,600</strong> in additional revenue. My monthly subscription paid for itself on the very first call. The exclusivity is the game changer. No other removal companies are calling these homeowners. I am the only one."</em></p>' +
      '<p style="color:#666;font-size:11px;margin:8px 0 0">Mark S., Independent Removal Company, Southampton</p></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Mark has now been a customer for over 6 months. He upgraded to our Pro plan within the first month and tells us his business has never been more consistent. The key to his success? Calling within 30 minutes and personalising every pitch to the homeowner\'s specific situation.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">This is not a one-off. Stories like Mark\'s are common among our customers. When you are the first to call and the only one calling, the odds of winning the business shift dramatically in your favour.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Tomorrow we will take a closer look at our Moving Leads product and who it is perfect for.</p>' +
      button(URL + '/movingleadsdaily', 'Explore Moving Leads')
  },
  {
    subject: 'Day 5: Deep Dive: Moving Leads for Removal & Logistics Companies',
    image: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600&q=80',
    alt: 'Removal truck',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Moving Leads: Deep Dive</h2>' +
      img('https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600&q=80', 'Removal truck') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">For removal companies, man and van operators, storage providers, and packing services.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Every day, thousands of UK homeowners mark their property as Sold Subject to Contract on Rightmove and Zoopla. These homeowners urgently need removal services. They are actively looking for quotes. And with our system, you contact them <strong style="color:#fff">before anyone else</strong>.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">What you receive with each lead:</strong></p>' +
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px">' +
      '<p style="color:#ccc;font-size:13px;line-height:1.8;margin:0">' +
      '&#127968; Full property address and property type<br>' +
      '&#128205; Postcode, city, and region<br>' +
      '&#128119; Number of bedrooms<br>' +
      '&#128176; Estimated property value<br>' +
      '&#128222; Estate agent contact details<br>' +
      '&#9200; Estimated move window<br>' +
      '&#128200; SSTC status and listing history</p></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">Who it is for:</strong> Removal companies, man and van operators, storage providers, packing services, house clearance specialists, office relocation companies, and shipping providers. If you help people move, this product is built for you.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Two things make moving leads work exceptionally well: speed and exclusivity. Homeowners who have just sold want to move quickly. When you call them within 30 minutes of their lead arriving, you are often the first removal company they speak to. Couple that with the fact that no other removal company has their details, and you have a recipe for high conversion rates.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Tomorrow we will explore our Probate Leads product for legal and probate professionals.</p>' +
      button(URL + '/movingleadsdaily', 'Learn More About Moving Leads')
  },
  {
    subject: 'Day 6: Deep Dive: Probate Leads for Solicitors & Legal Professionals',
    image: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600&q=80',
    alt: 'Legal professional',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Probate Leads: Deep Dive</h2>' +
      img('https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600&q=80', 'Legal professional') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">For solicitors, probate practitioners, will writers, estate agents, and conveyancers.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">When someone passes away, a probate grant is issued by the official Gov.uk Probate Registry. This is a public record that signals a legal estate needs professional handling. Our system tracks these grants daily and delivers them to you within hours of being issued.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">What you receive with each lead:</strong></p>' +
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px">' +
      '<p style="color:#ccc;font-size:13px;line-height:1.8;margin:0">' +
      '&#128100; Deceased name and executor details<br>' +
      '&#128176; Gross estate value<br>' +
      '&#127974; Deceased address and postcode<br>' +
      '&#128220; Grant type and registry location<br>' +
      '&#128188; Legal adviser if already appointed<br>' +
      '&#128197; Date of grant issue</p></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">Who it is for:</strong> Solicitors, probate practitioners, will writers, estate agents offering probate services, trust lawyers, tax advisers, and conveyancers. If you help families navigate the probate process, these leads are your ideal client.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">The probate market is uniquely suited to exclusive lead generation. Families who have lost a loved one need guidance and support. They are not looking to compare prices across multiple solicitors. When you contact them early with empathy and professionalism, they are far more likely to instruct you. Our customers report that being the first and only solicitor to reach out doubles their instruction rate.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Tomorrow we will cover New Business Alerts for accountants, web designers, and B2B service providers.</p>' +
      button(URL + '/probateleads', 'Explore Probate Leads')
  },
  {
    subject: 'Day 7: Deep Dive: New Business Alerts for B2B Service Providers',
    image: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=600&q=80',
    alt: 'Business growth',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">New Business Alerts: Deep Dive</h2>' +
      img('https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=600&q=80', 'Business growth') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">For accountants, web designers, marketing agencies, insurance brokers, and every B2B service provider.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Hundreds of new companies register at Companies House every single day. Each new business needs a range of services: accounting, website design, insurance, IT support, marketing, SEO, and more. Our New Business Alerts deliver these opportunities to you within hours of incorporation.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">What you receive with each alert:</strong></p>' +
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px">' +
      '<p style="color:#ccc;font-size:13px;line-height:1.8;margin:0">' +
      '&#128188; Company name and company number<br>' +
      '&#128205; Registered address and postcode<br>' +
      '&#128100; Director name and contact details<br>' +
      '&#128228; Nature of business (SIC code)<br>' +
      '&#128197; Incorporation date<br>' +
      '&#127760; Company website and email</p></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">Who it is for:</strong> Accountants, bookkeepers, web designers, marketing agencies, SEO specialists, PR agencies, insurance brokers, IT consultants, recruiters, financial advisers, copywriters, and printers. If you sell services to businesses, every new company is a potential client.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">The magic of new business alerts is timing. A company that registered yesterday has not yet chosen their accountant, built their website, or arranged their insurance. Contact them within 24 hours and you have almost no competition. Our customers who call new businesses within the first week of incorporation report conversion rates above 30%.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Tomorrow we will cover Planning Permission Leads for builders and construction professionals.</p>' +
      button(URL + '/newbusinessalert', 'Learn About New Business Alerts')
  },
  {
    subject: 'Day 8: Deep Dive: Planning Permission Leads for Construction Trades',
    image: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=600&q=80',
    alt: 'Construction site',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Planning Permission Leads: Deep Dive</h2>' +
      img('https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=600&q=80', 'Construction site') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">For builders, architects, electricians, plumbers, and every construction trade professional.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Homeowners and developers submit planning applications to UK councils every single day. Each application represents a real construction project that needs professional tradespeople. Our system monitors over 350 council planning portals and delivers matching leads to you at 9am.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">What you receive with each lead:</strong></p>' +
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px">' +
      '<p style="color:#ccc;font-size:13px;line-height:1.8;margin:0">' +
      '&#127968; Property address and postcode<br>' +
      '&#128220; Application type (extension, new build, loft conversion, etc.)<br>' +
      '&#128100; Applicant name and contact details<br>' +
      '&#128196; Full project description<br>' +
      '&#127974; Council name and application reference<br>' +
      '&#128197; Application date and status</p></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">Who it is for:</strong> Builders, architects, surveyors, electricians, plumbers, roofers, landscapers, kitchen fitters, loft conversion specialists, structural engineers, painters, plasterers, and every trade involved in home improvement and construction.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">When a homeowner applies for planning permission, they are at the very beginning of their project journey. They need quotes from builders, advice from architects, and plans from surveyors. Being the first to contact them positions you as the trusted advisor from day one. Our customers in construction report that early contact converts at rates of 25-35%.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Tomorrow we will cover our Public Sector Tenders product for businesses that sell to the government.</p>' +
      button(URL + '/planningleads', 'Explore Planning Leads')
  },
  {
    subject: 'Day 9: Deep Dive: Public Sector Tenders for Government Contracts',
    image: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=600&q=80',
    alt: 'Government building',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Public Sector Tenders: Deep Dive</h2>' +
      img('https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=600&q=80', 'Government building') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">For IT services, construction, cleaning, security, consultancy, and every business that can sell to government.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">UK government organisations publish thousands of contract opportunities every month. From IT services to cleaning contracts, construction to consultancy, the public sector spends billions every year with external suppliers. Our system matches the right tenders to your business and delivers them at 9am.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">What you receive with each tender alert:</strong></p>' +
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px">' +
      '<p style="color:#ccc;font-size:13px;line-height:1.8;margin:0">' +
      '&#128196; Tender title and full description<br>' +
      '&#127970; Buyer name and contracting authority<br>' +
      '&#128176; Estimated contract value<br>' +
      '&#128197; Submission deadline date<br>' +
      '&#128220; CPV code and category classification<br>' +
      '&#127760; Link to full tender documentation</p></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">Who it is for:</strong> IT services, cybersecurity firms, construction companies, cleaning contractors, security firms, catering businesses, facilities management, transport and logistics, healthcare providers, training companies, legal firms, HR consultancies, and any business that can provide services to the public sector.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Public sector contracts offer stability and scale that private clients rarely match. A single framework agreement can be worth millions and last for years. Our tenders product ensures you never miss an opportunity that matches your business profile.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Tomorrow we will compare 9amLeads directly against the leading alternatives so you can see the difference for yourself.</p>' +
      button(URL + '/tenders', 'Explore Public Tenders')
  },
  {
    subject: 'Day 10: 9amLeads vs The Competition: An Honest Comparison',
    image: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=600&q=80',
    alt: 'Strategic analysis',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">9amLeads vs The Competition</h2>' +
      img('https://images.unsplash.com/photo-1553877522-43269d4ea984?w=600&q=80', 'Strategic analysis') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">An honest comparison of how 9amLeads stacks up against the alternatives.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">You have options when it comes to lead generation. Here is how we compare against the most common alternatives:</p>' +
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin:0 0 16px">' +
      '<table width="100%" cellpadding="6" cellspacing="0" style="font-size:12px">' +
      '<tr style="border-bottom:1px solid rgba(255,255,255,0.06)"><td style="color:#fff;font-weight:700;padding:8px 4px"></td><td style="color:' + accent + ';font-weight:700;padding:8px 4px;text-align:center">9amLeads</td><td style="color:#888;padding:8px 4px;text-align:center">Bark</td><td style="color:#888;padding:8px 4px;text-align:center">Checkatrade</td><td style="color:#888;padding:8px 4px;text-align:center">Google Ads</td></tr>' +
      '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)"><td style="color:#ccc;padding:6px 4px">Exclusive leads</td><td style="text-align:center;color:' + accent + '">Yes</td><td style="text-align:center;color:#ef4444">No</td><td style="text-align:center;color:#ef4444">No</td><td style="text-align:center;color:#ef4444">No</td></tr>' +
      '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)"><td style="color:#ccc;padding:6px 4px">Fixed pricing</td><td style="text-align:center;color:' + accent + '">Yes</td><td style="text-align:center;color:#ef4444">Pay per lead</td><td style="text-align:center;color:#f59e0b">Membership</td><td style="text-align:center;color:#ef4444">Pay per click</td></tr>' +
      '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)"><td style="color:#ccc;padding:6px 4px">Delivered at 9am</td><td style="text-align:center;color:' + accent + '">Yes</td><td style="text-align:center;color:#ef4444">Random</td><td style="text-align:center;color:#f59e0b">Varies</td><td style="text-align:center;color:#ef4444">None</td></tr>' +
      '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)"><td style="color:#ccc;padding:6px 4px">CRM integration</td><td style="text-align:center;color:' + accent + '">Yes</td><td style="text-align:center;color:#ef4444">Limited</td><td style="text-align:center;color:#ef4444">No</td><td style="text-align:center;color:' + accent + '">Yes</td></tr>' +
      '<tr><td style="color:#ccc;padding:6px 4px">Free trial</td><td style="text-align:center;color:' + accent + '">7 days</td><td style="text-align:center;color:#ef4444">No</td><td style="text-align:center;color:#f59e0b">Limited</td><td style="text-align:center;color:#ef4444">No</td></tr>' +
      '</table></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">The key difference is <strong style="color:#fff">exclusivity</strong>. When you generate a lead through Google Ads or Bark, that lead is shared with your competitors. The customer compares multiple quotes and often picks the cheapest. With 9amLeads, every lead is yours alone. You control the conversation, the relationship, and the pricing.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Our fixed pricing model means you know exactly what you will pay each month. No surprise costs. No per-click charges. No bidding against your competitors for the same customer. Just predictable, scalable lead generation.</p>' +
      button(URL + '/how-it-works', 'See the Full Comparison')
  },
  {
    subject: 'Day 11: Success Story: How a Probate Firm Won 4 Clients in Their First Month',
    image: 'https://images.unsplash.com/photo-1573497620053-e61932e1b1c9?w=600&q=80',
    alt: 'Professional meeting',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Success Story: 4 New Clients in One Month</h2>' +
      img('https://images.unsplash.com/photo-1573497620053-e61932e1b1c9?w=600&q=80', 'Professional meeting') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">How a Manchester probate practice turned a trial subscription into their most profitable month ever.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Sarah runs a probate practice in Manchester. Before 9amLeads, she relied on referrals and local networking to find clients. While her reputation was strong, the flow of new business was unpredictable. Some months were busy. Others were quiet. She needed a consistent source of new clients.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">She signed up for 9amLeads Probate Leads on a trial. Within 30 days, the results exceeded her expectations:</p>' +
      '<div style="background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.15);border-radius:12px;padding:20px;margin:0 0 16px">' +
      '<p style="color:#ccc;font-size:13px;line-height:1.7;margin:0"><em>"We picked up <strong style="color:' + accent + '">4 new clients</strong> in our first month using 9amLeads. The leads were accurate, the timing was perfect, and the exclusivity meant we were the only probate practice contacting these families. Our annual subscription paid for itself 10 times over in the first month alone."</em></p>' +
      '<p style="color:#666;font-size:11px;margin:8px 0 0">Sarah L., Probate Services Ltd, Manchester</p></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Sarah\'s approach was simple: she called every lead within 30 minutes of receiving it, she personalised her pitch by referencing the deceased\'s name and estate value, and she followed up with every single person who did not answer the first time. This combination of speed, personalisation, and persistence is the formula that consistently wins.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Sarah has now been a customer for over 8 months. She upgraded to our Enterprise plan and tells us that 9amLeads is now her primary source of new business.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Tomorrow we will explore one of our most powerful features: CRM Integration that pushes your leads directly into your existing systems.</p>' +
      button(URL + '/probateleads', 'Explore Probate Leads')
  },
  {
    subject: 'Day 12: Automate Your Workflow: CRM Integration & Lead Delivery Options',
    image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80',
    alt: 'CRM automation dashboard',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">CRM Integration & Automation</h2>' +
      img('https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80', 'CRM automation dashboard') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">How your leads flow automatically into the CRM your team already uses.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Your leads arrive by email at 9am every morning. But we know that many businesses need them to flow directly into their CRM, accounting software, or project management system. That is why every 9amLeads plan includes powerful integration options.</p>' +
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin:0 0 16px">' +
      '<div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<h3 style="font-family:Outfit,sans-serif;font-size:15px;font-weight:700;color:#fff;margin:0 0 4px">&#127760; Webhook Integration</h3>' +
      '<p style="color:#8890a8;font-size:13px;line-height:1.6;margin:0">Paste a webhook URL from Zapier, Make, n8n, or your CRM. Your daily leads are automatically pushed as structured JSON data. From there you can connect to HubSpot, Salesforce, Pipedrive, Google Sheets, and thousands of other apps.</p></div>' +
      '<div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<h3 style="font-family:Outfit,sans-serif;font-size:15px;font-weight:700;color:#fff;margin:0 0 4px">&#128230; CSV & JSON Exports</h3>' +
      '<p style="color:#8890a8;font-size:13px;line-height:1.6;margin:0">All your leads are available in your dashboard for manual export. Download CSV or JSON files compatible with every major CRM and spreadsheet application.</p></div>' +
      '<div>' +
      '<h3 style="font-family:Outfit,sans-serif;font-size:15px;font-weight:700;color:#fff;margin:0 0 4px">&#128231; Email Delivery</h3>' +
      '<p style="color:#8890a8;font-size:13px;line-height:1.6;margin:0">Prefer to keep things simple? Your leads arrive in your inbox at 9am every morning in a clean, readable format. No setup required. Just open your email and start calling.</p></div></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px"><strong style="color:#fff">Supported CRMs and platforms:</strong> HubSpot, Salesforce, Pipedrive, Zoho CRM, Freshsales, Tradify, Clio, LEAP, Xero, QuickBooks, and any system that accepts webhooks. If your CRM has an API, we can push leads to it.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">All plans include CSV and JSON exports. Enterprise plans include dedicated API access and custom integration support.</p>' +
      button(URL + '/portal/dashboard.html', 'Set Up Your CRM Integration')
  },
  {
    subject: 'Day 13: Is 9amLeads Right for Your Business?',
    image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=600&q=80',
    alt: 'Business decision',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Is 9amLeads Right for You?</h2>' +
      img('https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=600&q=80', 'Business decision') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">A practical guide to whether 9amLeads is the right fit for your business.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">By now you have seen how 9amLeads works, the types of leads we offer, the success stories, and how we compare to the competition. You might be wondering: <strong style="color:#fff">is this right for my business?</strong></p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">9amLeads works best for businesses that:</p>' +
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px">' +
      '<p style="color:#ccc;font-size:13px;line-height:1.8;margin:0">' +
      '&#9989; <strong style="color:#fff">Actively call leads</strong> and close deals over the phone or in person<br>' +
      '&#9989; <strong style="color:#fff">Operate in specific geographic areas</strong> (postcode districts)<br>' +
      '&#9989; <strong style="color:#fff">Want exclusive leads</strong> with no competition from other businesses<br>' +
      '&#9989; <strong style="color:#fff">Value predictability</strong> with fixed monthly pricing<br>' +
      '&#9989; <strong style="color:#fff">Can call within 30 minutes</strong> of receiving a lead<br>' +
      '&#9989; <strong style="color:#fff">Are in or serve</strong> the removal, probate, construction, B2B, or public sector markets</p></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">If this sounds like you, we would love to have you on board. If you are not sure, we offer a <strong style="color:#fff">7-day free trial</strong> with no card required. You will receive real, exclusive leads at 9am every morning during your trial. If you do not love the quality, cancel and keep everything you received. There is literally nothing to lose.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Still have questions? Reply to this email and we will personally answer them. We are a small UK team and we read every message.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px"><a href="' + URL + '/who-we-serve" style="color:' + accent + '">Visit our Who We Serve page</a> to see if your industry is listed.</p>' +
      button(URL + '/pricing', 'Start Your Free Trial')
  },
  {
    subject: 'Day 14: Limited Time: Start Your Free Trial and Get Exclusive Leads Tomorrow',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=80',
    alt: 'Growth opportunity',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Your Free Trial Awaits</h2>' +
      img('https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=80', 'Growth opportunity') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">Start your 7-day free trial today and receive exclusive leads at 9am tomorrow morning.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Over the past 13 days, we have shown you the problem with shared leads, how our system works, five different lead types in depth, real success stories, the comparison against competitors, and our powerful integration features. Now it is time to experience it for yourself.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Here is what happens when you start your free trial today:</p>' +
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px">' +
      '<p style="color:#ccc;font-size:13px;line-height:1.8;margin:0">' +
      '&#9989; <strong style="color:#fff">Sign up in under 2 minutes</strong> with just your name, email, and postcode areas<br>' +
      '&#9989; <strong style="color:#fff">No credit card required</strong> for your 7-day trial<br>' +
      '&#9989; <strong style="color:#fff">Exclusive leads</strong> arrive at 9am tomorrow morning<br>' +
      '&#9989; <strong style="color:#fff">Cancel anytime</strong> during the trial. Keep all leads you received<br>' +
      '&#9989; <strong style="color:#fff">No commitment</strong> after the trial. Upgrade only if you love it</p></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Your competitors are already using 9amLeads to fill their pipeline every single day. The question is not whether exclusive lead generation works. The question is whether you can afford to keep missing out.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Start your free trial today. Your first leads arrive at 9am tomorrow. Pick up the phone and start converting.</p>' +
      button(URL + '/portal', 'Start Your Free Trial Now')
  },
  {
    subject: 'Day 15: Success Story: How a Construction Company Won £1.4M in Contracts',
    image: 'https://images.unsplash.com/photo-1504307651254-84280e29209d?w=600&q=80',
    alt: 'Construction success',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Success Story: £1.4M in Contracts</h2>' +
      img('https://images.unsplash.com/photo-1504307651254-84280e29209d?w=600&q=80', 'Construction success') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">How a Bristol construction company transformed their pipeline using 9amLeads Tenders.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">James runs a construction company in Bristol. For years, his business relied on repeat contracts and local networking to win work. While the quality of his work was excellent, finding new opportunities was a constant struggle. He needed a way to access larger, more consistent contracts.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">He signed up for 9amLeads Public Sector Tenders. The results were transformative:</p>' +
      '<div style="background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.15);border-radius:12px;padding:20px;margin:0 0 16px">' +
      '<p style="color:#ccc;font-size:13px;line-height:1.7;margin:0"><em>"We won 2 contracts worth <strong style="color:' + accent + '">£1.4M</strong> in our first quarter using 9amLeads. The system found opportunities we would never have discovered on our own. We went from scrambling for work to having a consistent, predictable pipeline of high-value tenders. Best business decision we have made in 10 years."</em></p>' +
      '<p style="color:#666;font-size:11px;margin:8px 0 0">James R., Bristol Construction Co, Bristol</p></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">James\'s story is not unusual among our tender customers. The public sector offers contracts that private clients rarely match in scale or consistency. A single framework agreement can provide stable revenue for years. The challenge is finding the right opportunities and submitting competitive bids before the deadline.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">9amLeads solves this by delivering matched tender opportunities directly to your inbox at 9am every morning, with full documentation and submission deadlines included. You spend your time bidding, not searching.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px">Tomorrow is the final day of this campaign. We will share everything you need to take the next step.</p>' +
      button(URL + '/tenders', 'Explore Public Tenders')
  },
  {
    subject: 'Day 16: Your Next Step: Join 500+ UK Businesses Using 9amLeads',
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&q=80',
    alt: 'Team success',
    body: '<h2 style="font-family:Outfit,sans-serif;font-size:22px;font-weight:800;color:#fff;margin:0 0 6px;text-align:center">Your Next Step</h2>' +
      img('https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&q=80', 'Team success') +
      '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px">Over 500 UK businesses trust 9amLeads to deliver exclusive leads every morning. It is your turn now.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Over the past 16 days, we have covered everything you need to know about 9amLeads:</p>' +
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin:0 0 16px">' +
      '<p style="color:#ccc;font-size:13px;line-height:1.8;margin:0">' +
      '&#9989; Why shared leads are costing you money<br>' +
      '&#9989; How our exclusive lead system works<br>' +
      '&#9989; All five lead types explained in detail<br>' +
      '&#9989; Real success stories from real customers<br>' +
      '&#9989; How we compare against the competition<br>' +
      '&#9989; CRM integration and automation options<br>' +
      '&#9989; Whether 9amLeads is right for your business</p></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">Now there is only one thing left to do: <strong style="color:#fff">try it for yourself</strong>.</p>' +
      '<div style="background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.15);border-radius:12px;padding:20px;margin:0 0 16px;text-align:center">' +
      '<p style="color:#fff;font-size:16px;font-weight:700;margin:0 0 8px;font-family:Outfit,sans-serif">Start Your 7-Day Free Trial</p>' +
      '<p style="color:#8890a8;font-size:13px;margin:0">No credit card required. Cancel anytime. Your exclusive leads arrive at 9am tomorrow.</p></div>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">We are a small, UK-based team and we take your success personally. When you sign up, you are not just getting a lead generation service. You are getting a partner who genuinely wants to see your business grow.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px">If you have any questions at all, reply to this email. We read every reply and we will personally help you decide if 9amLeads is right for you. No pushy sales pitch. Just honest, helpful advice.</p>' +
      '<p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 20px"><strong style="color:#fff">Your leads are waiting.</strong> Sign up now and receive your first batch at 9am tomorrow.</p>' +
      button(URL + '/portal', 'Start Your Free Trial Now')
  }
];

async function sendPreview(email) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ sender: { name: '9amLeads', email: 'hello@9amleads.com' }, to: [{ email: to }], subject: email.subject, htmlContent: wrap(email.subject, email.body) });
    const req = https.request({ hostname: 'api.brevo.com', path: '/v3/smtp/email', method: 'POST', headers: { 'api-key': key, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

async function main() {
  console.log('Creating 16-day nurture campaign in Brevo and sending previews to ' + to + '...\n');
  for (let i = 0; i < campaign.length; i++) {
    const email = campaign[i];
    const code = await sendPreview(email);
    console.log('  ' + code + ' Day ' + (i + 1) + ': ' + email.subject);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('\nAll 16 emails sent! Check your inbox at ' + to);
  console.log('\nCampaign summary:');
  console.log('  Days 1-3: Introduction & education');
  console.log('  Days 4-9: Lead type deep dives + success stories');
  console.log('  Days 10-12: Competitive comparison + features');
  console.log('  Days 13-14: Objection handling + call to action');
  console.log('  Day 15: Final success story');
  console.log('  Day 16: Final CTA & free trial offer');
}
main().catch(e => console.error(e));

