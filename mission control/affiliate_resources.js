// Affiliate sales toolkit: ready-to-use, professional scripts and templates per
// business type. Served to affiliates via /api/affiliate/resources.
// Every script carries the full value proposition: 14-day trial (my code vs the
// usual 7), no card, cancel anytime, proof on every lead, own daily allocation,
// and auto Print & Post with live tracking.

module.exports = [
  {
    key: 'moving', name: 'Moving Leads', emoji: '🚚',
    target: 'Removal companies, man & van, estate agents',
    precall: [
      'Know the lead: company name, whether they do local moves, long-distance or man & van.',
      'Set your goal: get them to START the 14-day free trial on this call.',
      'Lead with the code: "with my code you get 14 days free instead of the usual 7."'
    ],
    facts: [
      'Moving leads arrive every morning at 9am: homes that just went under offer in their postcode areas.',
      'The first company to call the homeowner usually wins the move.',
      'Normally we offer 7 days free. With my code they get 14 days free, no card required, cancel anytime.',
      'We have proof of every lead: full address and contact details on each one, so they know they are real.',
      'They get their own daily allocation, never the same lead twice.',
      'We also offer auto Print & Post: we send their leaflet and letter out for them, with live tracking.'
    ],
    phone: [
      '[Opener] "Hi [name], it’s [your name] from 9amLeads. I’m calling removal companies in [area]. Are you with me for two minutes?"',
      '[Hook] "We send removal companies fresh moving leads every morning at 9am: homes that just went under offer in their postcode. That is the exact moment homeowners are comparing removal quotes."',
      '[Code] "And here is the good part. Normally we only give a 7-day free trial, but with my code you get 14 days free, no card required, cancel anytime."',
      '[Proof] "Every lead has the full address and contact details, so you know they are real. And you get your own daily allocation, never the same lead twice."',
      '[Print&Post] "If you like, we can even auto print and post your leaflet or letter to the homeowner for you, tracked live. You literally just open your leads and call."',
      '[Objection: "We already get enough work from referrals"] "That is great. Referrals are the best work you get. This is extra, on top, and it is free for 14 days with my code. You can see exactly what it brings before spending a penny."',
      '[Objection: "How much does it cost?"] "Free for 14 days, no card. After that from £25 a week, roughly the price of one small local move. If one extra booking covers a month of leads, it is a no-brainer."',
      '[Objection: "I’m too busy"] "That is exactly why it works. It takes five minutes each morning: open your leads at 9am, call the strongest two, done. I can set you up right now."',
      '[Close] "Let me get you set up, it takes 30 seconds. What email should I send your login to? Your first batch of moving leads will be ready at 9am tomorrow."'
    ],
    emails: [
      { subject: 'Fresh moving leads in [area]: 14 days free', body: 'Hi [name],\n\nI’m [your name] from 9amLeads. Every morning at 9am we send removal companies moving leads: homes that have just gone under offer in their postcode areas.\n\nNormally we offer a 7-day free trial, but with my code you get 14 days free, no card required, cancel anytime:\n\n→ https://9amleads.com/portal/#signup\n\nEvery lead includes the full address and contact details, so you know they are real. You also get your own daily allocation, never the same lead twice.\n\nA single extra booking usually covers a month of leads. Want me to set up your free 14 days now?' },
      { subject: 'Your 14-day moving-leads trial: first batch tomorrow', body: 'Hi [name],\n\nQuick follow-up on the free 14-day trial of daily moving leads (my code gives you double the usual 7 days). It takes about 30 seconds to start:\n\n→ https://9amleads.com/portal/#signup\n\nNo card needed, cancel anytime in one click. You will see the full address on every lead, so you know exactly what you are working with. Happy to answer any questions.' },
      { subject: 'Still open: 14 days of fresh moving leads', body: 'Hi [name],\n\nJust making sure you did not miss it: your free 14-day trial of daily moving leads is still waiting:\n\n→ https://9amleads.com/portal/#signup\n\nSet it up now and your first batch arrives at 9am tomorrow. First to the homeowner wins the move. We can also auto print and post your leaflet for you if you prefer.' }
    ],
    sms: [
      'Hi [name]. 9amLeads here. We send removal companies fresh moving leads every morning (homes just gone under offer in [area]). My code gives you 14 days free instead of 7, no card: https://9amleads.com/portal/#signup',
      'Your free 14-day moving-leads trial is ready, [name]: https://9amleads.com/portal/#signup. Full address on every lead, your own daily allocation, cancel anytime. Reply with questions.'
    ],
    social: [
      'Every morning at 9am, removal companies on our list get fresh moving leads: homes that just went under offer in their postcode. 🚚 First to call usually wins the job. 14 days free with a code, no card: https://9amleads.com/portal/#signup #movingleads #removals',
      'The #1 reason removal quotes get won? Speed. ⏱️ We deliver moving leads the moment they are hot, with full contact details on every single one. 14-day free trial: https://9amleads.com/portal/#signup',
      'New to the area or quiet month? Get fresh moving leads delivered to your inbox at 9am. Your own daily allocation, never the same lead twice. https://9amleads.com/portal/#signup #removals #moving'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script. Goal: start the 14-day free trial (my code) on the call.' },
      { day: 'Day 1', action: 'No trial yet? Send email #1 or the first SMS. If they trialed, confirm their first 9am batch landed.' },
      { day: 'Day 3', action: 'Send email #2 or second SMS: a light, value-led nudge about double the trial.' },
      { day: 'Day 7', action: 'Call again. Ask how the week’s leads looked, remind them about auto Print & Post.' },
      { day: 'Day 12', action: 'Email #3: trial ending, do not lose the daily leads.' },
      { day: 'Day 14', action: 'Final check. Keep the leads going?' }
    ]
  },

  {
    key: 'probate', name: 'Probate Leads', emoji: '⚖️',
    target: 'Solicitors, will writers, estate admin, probate specialists',
    precall: [
      'Know the lead: do they handle probate, estates, wills or property for executors?',
      'Set your goal: start the 14-day free trial (double the usual 7) on this call.',
      'Lead with the code: "with my code you get 14 days free, no card required."'
    ],
    facts: [
      'Probate leads come from the official Gov.uk register: newly granted probate, daily.',
      'The firms that contact executors first usually win the instruction.',
      'Normally 7 days free. With my code they get 14 days free, no card, cancel anytime.',
      'Every lead has proof: the grant details, executor and estate info, so they know it is real.',
      'Their own daily allocation, never the same lead twice.',
      'Auto Print & Post available: we send their letter to the executor for them, tracked live.'
    ],
    phone: [
      '[Opener] "Hi [name], it’s [your name] from 9amLeads. I’m calling probate practitioners in [area]. Two minutes?"',
      '[Hook] "We deliver newly granted probate from the official register every morning at 9am, in the postcode areas they choose. Executors need help the moment a grant lands, and the first firm to reach them usually wins the instruction."',
      '[Code] "Normally we give a 7-day free trial, but with my code you get 14 days free, no card required, cancel anytime."',
      '[Proof] "Every lead comes with the grant and estate details, so you know it is real. And you get your own daily allocation, never the same lead twice."',
      '[Objection: "We rely on referrals"] "Referrals are brilliant. This adds to them. It is daily, from the official register, and free for 14 days with my code. See what it surfaces before you decide."',
      '[Objection: "How much does it cost?"] "Free for 14 days, no card. After that from £25 a week. One estate instruction typically covers many months of that."',
      '[Objection: "Worried about volume"] "Start with the free trial and set it to exactly the volume you can handle. No pressure."',
      '[Close] "Let me get you set up. What email should I use? Your first probate leads arrive at 9am tomorrow."'
    ],
    emails: [
      { subject: 'Fresh probate grants in [area]: 14 days free', body: 'Hi [name],\n\nI’m [your name] from 9amLeads. Every morning at 9am we deliver newly granted probate from the official Gov.uk register, matched to your chosen areas.\n\nNormally we offer a 7-day free trial, but with my code you get 14 days free, no card required:\n\n→ https://9amleads.com/portal/#signup\n\nEach lead includes the grant and estate details, so you know they are real. You also get your own daily allocation, never the same lead twice.\n\nOne estate instruction usually covers months of the subscription. Want me to set up your free 14 days?' },
      { subject: 'Your 14-day probate-leads trial', body: 'Hi [name],\n\nQuick follow-up on the free 14-day trial of daily probate leads (double the usual 7 days). 30 seconds to start:\n\n→ https://9amleads.com/portal/#signup\n\nNo card, cancel anytime. Executors decide fast, and first contact usually wins the file.' },
      { subject: 'Still open: fresh probate grants at 9am', body: 'Hi [name],\n\nYour free 14-day probate-leads trial is still waiting:\n\n→ https://9amleads.com/portal/#signup\n\nStart now and your first grants arrive tomorrow morning. We can also auto print and post your letter to executors for you.' }
    ],
    sms: [
      'Hi [name]. 9amLeads here: fresh probate grants from the official register, every morning. My code gives 14 days free instead of 7, no card: https://9amleads.com/portal/#signup',
      'Your free 14-day probate trial is ready, [name]: https://9amleads.com/portal/#signup. First to contact the executor usually wins the file. Reply with questions.'
    ],
    social: [
      'Newly granted probate, delivered every morning at 9am. ⚖️ The firms that contact executors first win the instruction. 14 days free with a code: https://9amleads.com/portal/#signup #probate #solicitors',
      'Estate work finds you, not the other way around. Fresh grants in your chosen areas, with full details on every lead. https://9amleads.com/portal/#signup #probateleads',
      'Your own daily allocation of probate grants, never the same lead twice. First contact wins the file. https://9amleads.com/portal/#signup'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script. Goal: start the 14-day free trial (my code).' },
      { day: 'Day 1', action: 'No trial yet? Email #1 or first SMS. If trialed, confirm the first grants landed.' },
      { day: 'Day 3', action: 'Send email #2 or second SMS: value-led nudge.' },
      { day: 'Day 7', action: 'Call: how did the week’s grants look? Mention executor outreach templates.' },
      { day: 'Day 12', action: 'Email #3: trial ending.' },
      { day: 'Day 14', action: 'Final check. Keep the leads going?' }
    ]
  },

  {
    key: 'newbusiness', name: 'New Business Leads', emoji: '🏭️',
    target: 'Accountants, bookkeepers, web designers, insurance, business services',
    precall: [
      'Know the lead: who they serve and whether new companies are their ideal client.',
      'Set your goal: start the 14-day free trial (double the usual 7) on this call.',
      'Lead with the code: "with my code you get 14 days free, no card required."'
    ],
    facts: [
      'New business leads are freshly registered UK companies, delivered daily at 9am.',
      'New companies need suppliers in their first days, and first contact wins the onboarding.',
      'Normally 7 days free. With my code they get 14 days free, no card, cancel anytime.',
      'Every lead has proof: the registered company details, so they know it is real.',
      'Their own daily allocation, never the same lead twice.',
      'Auto Print & Post available: we send their letter to new companies for them, tracked live.'
    ],
    phone: [
      '[Opener] "Hi [name], it’s [your name] from 9amLeads. I’m calling accountants and business services in [area]. Two minutes?"',
      '[Hook] "We deliver freshly registered UK companies every morning at 9am. A brand-new company has no accountant, no website, no insurance yet. The first to reach them wins the onboarding."',
      '[Code] "Normally we give a 7-day free trial, but with my code you get 14 days free, no card required, cancel anytime."',
      '[Proof] "Every lead has the registered company details, so you know it is real. And you get your own daily allocation, never the same lead twice."',
      '[Objection: "We get clients through referrals"] "Referrals are the best clients. This is extra, on top, and it is free for 14 days. A brand-new company is the easiest onboarding you will ever get."',
      '[Objection: "How much does it cost?"] "Free for 14 days, no card. After that from £25 a week. One new client covers it easily."',
      '[Close] "Let me get you set up. What email should I use? Your first new-company leads arrive at 9am tomorrow."'
    ],
    emails: [
      { subject: 'Fresh new companies in [area]: 14 days free', body: 'Hi [name],\n\nI’m [your name] from 9amLeads. Every morning at 9am we deliver freshly registered UK companies in your chosen areas.\n\nNormally we offer a 7-day free trial, but with my code you get 14 days free, no card required:\n\n→ https://9amleads.com/portal/#signup\n\nEach lead has the registered company details, so you know they are real, and you get your own daily allocation. First contact wins the onboarding. Want me to set you up?' },
      { subject: 'Your 14-day new-business trial', body: 'Hi [name],\n\nQuick follow-up on the free 14-day trial of daily new-business leads (double the usual 7 days):\n\n→ https://9amleads.com/portal/#signup\n\nNo card, cancel anytime. New companies decide in their first days, so the timing is everything.' },
      { subject: 'Still open: fresh new companies at 9am', body: 'Hi [name],\n\nYour free 14-day new-business trial is still waiting:\n\n→ https://9amleads.com/portal/#signup\n\nStart now and your first registered companies arrive tomorrow morning. We can also auto print and post your letter for you.' }
    ],
    sms: [
      'Hi [name]. 9amLeads here: freshly registered UK companies, every morning. My code gives 14 days free instead of 7, no card: https://9amleads.com/portal/#signup',
      'Your free 14-day new-business trial is ready, [name]: https://9amleads.com/portal/#signup. First to reach them wins the onboarding. Reply with questions.'
    ],
    social: [
      'New companies register every day. 🏭️ We deliver them to your inbox at 9am, before they pick a supplier. 14 days free: https://9amleads.com/portal/#signup #newbusiness #accountants',
      'The first accountant, web designer or insurer to contact a new company usually wins the account. Get them first: https://9amleads.com/portal/#signup',
      'Your own daily allocation of brand-new companies, never the same lead twice. First contact wins. https://9amleads.com/portal/#signup'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script. Goal: start the 14-day free trial (my code).' },
      { day: 'Day 1', action: 'No trial yet? Email #1 or first SMS. Confirm first batch if trialed.' },
      { day: 'Day 3', action: 'Email #2 or second SMS: value-led nudge.' },
      { day: 'Day 7', action: 'Call: how did the new companies look?' },
      { day: 'Day 12', action: 'Email #3: trial ending.' },
      { day: 'Day 14', action: 'Final check. Keep the leads going?' }
    ]
  },

  {
    key: 'planning', name: 'Planning Leads', emoji: '🗓️',
    target: 'Builders, extension specialists, architects, trades',
    precall: [
      'Know the lead: what they build and whether planning approvals suit them.',
      'Set your goal: start the 14-day free trial (double the usual 7) on this call.',
      'Lead with the code: "with my code you get 14 days free, no card required."'
    ],
    facts: [
      'Planning leads are planning approvals and applications, delivered daily at 9am.',
      'Approved homeowners have already paid for drawings and are ready to spend.',
      'Normally 7 days free. With my code they get 14 days free, no card, cancel anytime.',
      'Every lead has proof: the applicant and project details, so they know it is real.',
      'Their own daily allocation, never the same lead twice.',
      'Auto Print & Post available: we send their letter to the applicant for them, tracked live.'
    ],
    phone: [
      '[Opener] "Hi [name], it’s [your name] from 9amLeads. I’m calling builders and trades in [area]. Two minutes?"',
      '[Hook] "We deliver planning approvals and applications every morning at 9am. When consent lands, the homeowner is ready to build, and the first builder to quote usually gets the site visit."',
      '[Code] "Normally we give a 7-day free trial, but with my code you get 14 days free, no card required, cancel anytime."',
      '[Proof] "Every lead has the applicant and project details, so you know it is real. And you get your own daily allocation, never the same lead twice."',
      '[Objection: "We get work from word of mouth"] "Word of mouth is the best work. This is extra, on top, and it is free for 14 days. Approved projects are the easiest quotes to win."',
      '[Objection: "How much does it cost?"] "Free for 14 days, no card. After that from £25 a week. One extension quote covers it."',
      '[Close] "Let me get you set up. What email should I use? Your first planning leads arrive at 9am tomorrow."'
    ],
    emails: [
      { subject: 'Fresh planning approvals in [area]: 14 days free', body: 'Hi [name],\n\nI’m [your name] from 9amLeads. Every morning at 9am we deliver planning approvals and applications in your chosen areas.\n\nNormally we offer a 7-day free trial, but with my code you get 14 days free, no card required:\n\n→ https://9amleads.com/portal/#signup\n\nEach lead has the applicant and project details, so you know they are real. You also get your own daily allocation. Want me to set you up?' },
      { subject: 'Your 14-day planning-leads trial', body: 'Hi [name],\n\nQuick follow-up on the free 14-day trial of daily planning leads (double the usual 7 days):\n\n→ https://9amleads.com/portal/#signup\n\nNo card, cancel anytime. The first builder to quote usually gets the site visit.' },
      { subject: 'Still open: fresh planning approvals', body: 'Hi [name],\n\nYour free 14-day planning-leads trial is still waiting:\n\n→ https://9amleads.com/portal/#signup\n\nStart now and your first approvals arrive tomorrow morning. We can also auto print and post your letter for you.' }
    ],
    sms: [
      'Hi [name]. 9amLeads here: fresh planning approvals, every morning. My code gives 14 days free instead of 7, no card: https://9amleads.com/portal/#signup',
      'Your free 14-day planning trial is ready, [name]: https://9amleads.com/portal/#signup. First to quote usually wins the job. Reply with questions.'
    ],
    social: [
      'A planning approval means money ready to spend. 🗓️ We deliver them at 9am with the applicant details. 14 days free: https://9amleads.com/portal/#signup #builders #planning',
      'The first builder to quote an approved project usually wins the job. Get there first: https://9amleads.com/portal/#signup #construction',
      'Your own daily allocation of planning approvals, never the same lead twice. https://9amleads.com/portal/#signup'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script. Goal: start the 14-day free trial (my code).' },
      { day: 'Day 1', action: 'No trial yet? Email #1 or first SMS. Confirm first batch if trialed.' },
      { day: 'Day 3', action: 'Email #2 or second SMS.' },
      { day: 'Day 7', action: 'Call: how did the approvals look? Mention site-survey templates.' },
      { day: 'Day 12', action: 'Email #3: trial ending.' },
      { day: 'Day 14', action: 'Final check. Keep the leads going?' }
    ]
  },

  {
    key: 'tenders', name: 'Tenders Leads', emoji: '📄',
    target: 'Construction, cleaning, IT, facilities, any public-sector supplier',
    precall: [
      'Know the lead: which public tenders they could deliver.',
      'Set your goal: start the 14-day free trial (double the usual 7) on this call.',
      'Lead with the code: "with my code you get 14 days free, no card required."'
    ],
    facts: [
      'Tender leads are matched public-sector contract opportunities, delivered daily at 9am.',
      'Public contracts are recurring, reliable revenue, and far less competitive than the open market.',
      'Normally 7 days free. With my code they get 14 days free, no card, cancel anytime.',
      'Every tender has proof: the full contract details and deadlines, so they know it is real.',
      'Matched to their services, so they only see tenders they can actually deliver.',
      'Auto Print & Post available for supporting their bids.'
    ],
    phone: [
      '[Opener] "Hi [name], it’s [your name] from 9amLeads. I’m calling businesses that could win public-sector contracts. Two minutes?"',
      '[Hook] "We deliver matched public tenders every morning at 9am: councils, NHS, schools. Public contracts are recurring revenue, and far fewer firms bid on them than the open market."',
      '[Code] "Normally we give a 7-day free trial, but with my code you get 14 days free, no card required, cancel anytime."',
      '[Proof] "Every tender comes with the full contract details and deadlines, so you know it is real. And they are matched to your services."',
      '[Objection: "Tenders are too competitive"] "Most SMEs never bid. The tenders that match you see a handful of bidders, not dozens. That is why public work is worth chasing."',
      '[Objection: "How much does it cost?"] "Free for 14 days, no card. After that from £25 a week. One won contract covers it many times over."',
      '[Close] "Let me get you set up. What email should I use? Your first matched tenders arrive at 9am tomorrow."'
    ],
    emails: [
      { subject: 'Matched public tenders: 14 days free', body: 'Hi [name],\n\nI’m [your name] from 9amLeads. Every morning at 9am we deliver public-sector tender opportunities matched to your services.\n\nNormally we offer a 7-day free trial, but with my code you get 14 days free, no card required:\n\n→ https://9amleads.com/portal/#signup\n\nEach tender has the full contract details and deadlines, so you know they are real. Want me to set you up?' },
      { subject: 'Your 14-day tender-leads trial', body: 'Hi [name],\n\nQuick follow-up on the free 14-day trial of matched tender leads (double the usual 7 days):\n\n→ https://9amleads.com/portal/#signup\n\nNo card, cancel anytime. Early responders shortlist well, so the timing matters.' },
      { subject: 'Still open: fresh matched tenders', body: 'Hi [name],\n\nYour free 14-day tender-leads trial is still waiting:\n\n→ https://9amleads.com/portal/#signup\n\nStart now and your first matched opportunities arrive tomorrow morning.' }
    ],
    sms: [
      'Hi [name]. 9amLeads here: matched public tenders, every morning. My code gives 14 days free instead of 7, no card: https://9amleads.com/portal/#signup',
      'Your free 14-day tender trial is ready, [name]: https://9amleads.com/portal/#signup. Matched to your services. Reply with questions.'
    ],
    social: [
      'Councils and NHS let contracts every week. 📄 We deliver the ones matched to your services at 9am. 14 days free: https://9amleads.com/portal/#signup #tenders #publicsector',
      'Public contracts are recurring revenue, and far fewer firms bid than you think. Get matched tenders first: https://9amleads.com/portal/#signup',
      'Matched public tenders, delivered daily, never the same one twice. https://9amleads.com/portal/#signup'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script. Goal: start the 14-day free trial (my code).' },
      { day: 'Day 1', action: 'No trial yet? Email #1 or first SMS. Confirm first batch if trialed.' },
      { day: 'Day 3', action: 'Email #2 or second SMS.' },
      { day: 'Day 7', action: 'Call: how did the tenders look? Mention bid templates.' },
      { day: 'Day 12', action: 'Email #3: trial ending.' },
      { day: 'Day 14', action: 'Final check. Keep the leads going?' }
    ]
  },

  {
    key: 'general', name: 'Any Business / General', emoji: '📈',
    target: 'Anyone who needs more customers',
    precall: [
      'Know the lead: what they do and where their work comes from today.',
      'Set your goal: match them to the right lead type and start the free trial.',
      'Lead with the code: "with my code you get 14 days free instead of the usual 7."'
    ],
    facts: [
      'Fresh business leads delivered every morning at 9am, matched to their trade and area.',
      'Choose the lead type that fits how they win work: moving, probate, planning, new business or tenders.',
      'Normally 7 days free. With my code they get 14 days free, no card required, cancel anytime.',
      'We have proof of every lead: full contact details, so they know they are real.',
      'Their own daily allocation, never the same lead twice.',
      'Auto Print & Post available: we send their leaflet and letters out for them, tracked live.'
    ],
    phone: [
      '[Opener] "Hi [name], it’s [your name] from 9amLeads. I’m calling businesses in [area] that want more customers. Two minutes?"',
      '[Qualify] "First, what does your business do, and where does most of your work come from at the moment?"',
      '[Match] "Based on that we would set you up with [moving/probate/new business/planning/tenders] leads, delivered every morning at 9am in your postcode areas."',
      '[Code] "Normally we only give a 7-day free trial, but with my code you get 14 days free, no card required, cancel anytime."',
      '[Proof] "Every lead comes with full contact details, so you know it is real. You get your own daily allocation, never the same lead twice."',
      '[Objection: "What type of leads do I get?"] "You pick the type that fits how you win work: moving for removals, planning for builders, tenders for cleaning or IT. We match it on the call."',
      '[Objection: "How much does it cost?"] "Free for 14 days, no card. After that from £25 a week. One extra customer usually pays for the whole month."',
      '[Objection: "I’ll think about it"] "Completely understand. The free trial is the easiest way to see it with zero risk. Let me set you up now so you can look at real leads tomorrow at 9am."',
      '[Close] "What email should I use? I’ll match your lead type and have your first batch ready at 9am tomorrow."'
    ],
    emails: [
      { subject: 'Fresh leads for [business]: 14 days free', body: 'Hi [name],\n\nI’m [your name] from 9amLeads. We deliver fresh business leads every morning at 9am, matched to your trade and area: moving, probate, new business, planning or tenders.\n\nNormally we offer a 7-day free trial, but with my code you get 14 days free, no card required:\n\n→ https://9amleads.com/portal/#signup\n\nEvery lead has full contact details, so you know they are real. Want me to match the right lead type for your business?' },
      { subject: 'Your 14-day leads trial', body: 'Hi [name],\n\nQuick follow-up on the free 14-day trial of daily business leads (double the usual 7 days). 30 seconds to start, first batch at 9am tomorrow:\n\n→ https://9amleads.com/portal/#signup\n\nNo card, cancel anytime. One extra customer usually covers it.' },
      { subject: 'Still open: your free 14 days of leads', body: 'Hi [name],\n\nYour free 14-day trial of daily business leads is still waiting:\n\n→ https://9amleads.com/portal/#signup\n\nStart now and your first batch arrives at 9am tomorrow, matched to how you win work.' }
    ],
    sms: [
      'Hi [name]. 9amLeads here. Fresh business leads delivered every morning, matched to your trade. My code gives 14 days free instead of 7, no card: https://9amleads.com/portal/#signup',
      'Your free 14 days of daily leads is ready, [name]: https://9amleads.com/portal/#signup. We will match the right lead type for you. Reply with questions.'
    ],
    social: [
      'Fresh business leads, delivered every morning at 9am. 📈 Moving, probate, planning, new business or tenders, matched to your trade. 14 days free with a code: https://9amleads.com/portal/#signup #businessleads',
      'Stop paying per lead. Get your own daily allocation instead, with proof on every lead. 14-day free trial: https://9amleads.com/portal/#signup #growth',
      'More customers without spending on ads. Fresh leads every morning, never the same one twice. https://9amleads.com/portal/#signup'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script: match their lead type and start the 14-day free trial.' },
      { day: 'Day 1', action: 'Email #1 or first SMS if no trial. Confirm 9am batch if trialed.' },
      { day: 'Day 3', action: 'Follow up with email #2 or second SMS.' },
      { day: 'Day 7', action: 'Call: how did the first week of leads look?' },
      { day: 'Day 12', action: 'Email #3. Trial ending, do not lose the daily leads.' },
      { day: 'Day 14', action: 'Final check. Keep the leads going?' }
    ]
  }
];
