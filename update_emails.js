var fs = require('fs');
var f = 'C:\\Users\\ketzm\\mission control\\production_api_server.js';
var c = fs.readFileSync(f, 'utf-8');

// Update lead delivery email
c = c.replace(
  'Good morning! Your daily lead sheet has arrived. Below are the new opportunities we\'ve found for you. Pick up the phone and start calling \u2014 you\'re the first to see these leads.',
  'Good morning! Your daily opportunity sheet is here. Every lead has been scored Hot/Warm/Cold based on freshness, value, and urgency. AI-drafted outreach messages are ready in your dashboard. You are the first to see these opportunities \u2014 call them now.'
);

// Update paid_welcome to mention new features
c = c.replace(
  'Over the coming weeks we\'ll send you weekly tips and strategies : everything from calling scripts to follow-up sequences : to help you convert as many leads as possible.',
  'Over the coming weeks we\'ll send you weekly tips and strategies: everything from calling scripts to follow-up sequences. You also have access to AI-drafted email, WhatsApp, and phone scripts for every lead, CSV and Excel exports, and a weekly report showing your contact rate, win rate, and best performing postcode areas.'
);

// Update welcome email
c = c.replace(
  'Your free 7-day trial has started. You\'ll receive your first leads at 9am tomorrow.',
  'Your free 7-day trial has started. You\'ll receive your first scored opportunities at 9am tomorrow with AI-drafted outreach messages, CRM exports, and weekly reporting.'
);

// Update "30% off your first month" to weekly wording
c = c.replace('30% off your first month', "30% off your first month's subscription");

// Update paid_welcome to include new features in benefits list
c = c.replace(
  '<strong style="color:#fff">Your Premium Benefits:</strong><br>\u{1F4E5} <strong style="color:#fff">Daily leads</strong> at 9am every morning : consistently<br>\u{1F512} <strong style="color:#fff">Exclusive access</strong> : no one else receives these leads<br>\u{1F4CA} <strong style="color:#fff">Dashboard</strong> : full lead history, analytics, and management<br>\u{1F50C} <strong style="color:#fff">CRM integration</strong> : leads pushed straight to your CRM<br>\u{1F4DE} <strong style="color:#fff">Priority support</strong> : reply anytime and we\'ll help',
  '<strong style="color:#fff">Your Premium Benefits:</strong><br>\u{1F4E5} <strong style="color:#fff">Daily leads</strong> at 9am every morning : consistently<br>\u{1F512} <strong style="color:#fff">Exclusive access</strong> : no one else receives these leads<br>\u{1F525} <strong style="color:#fff">Opportunity scoring</strong> : Hot/Warm/Cold on every lead<br>\u{1F4AC} <strong style="color:#fff">AI outreach</strong> : email, WhatsApp & phone scripts included<br>\u{1F4CA} <strong style="color:#fff">Dashboard</strong> : full lead history, analytics, and weekly reports<br>\u{1F5D1} <strong style="color:#fff">CRM exports</strong> : CSV, Excel, and CRM integration<br>\u{1F4DE} <strong style="color:#fff">Priority support</strong> : reply anytime and we\'ll help'
);

console.log('Email templates updated');
fs.writeFileSync(f, c);
