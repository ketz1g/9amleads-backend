// Affiliate sales toolkit: ready-to-use, professional scripts and templates per
// business type. Served to affiliates via /api/affiliate/resources.

module.exports = [
  {
    key: 'moving', name: 'Moving Leads', emoji: '🚚',
    target: 'Removal companies & estate agents',
    precall: [
      'Know the lead: company name, area, and what they do (local moves / long-distance) before you dial.',
      'Set your goal: get them to START the 14-day free trial on this call: nothing more.',
      'Get them talking early. Ask about their vans and how busy they are before you pitch.'
    ],
    facts: [
      'Moving leads arrive every morning at 9am: homes that just went under offer or SSTC.',
      'The first company to call the homeowner usually wins the move.',
      'One won local move typically covers a month of leads (from £25/week).',
      'Their referral gets a 14-day free trial. No card needed, so starting is easy.'
    ],
    phone: [
      '[Opener] "Hi [name], it\u2019s [your name] here from 9amLeads. I\u2019m calling removal companies in [area]. Am I catching you at a bad time, or have you got two minutes?"',
      '[Hook] "The reason I\u2019m calling: every morning at 9am we send removal companies moving leads. Homes that have literally just gone under offer in their postcode, which is the exact moment homeowners are comparing removal quotes."',
      '[Qualify] "Before I explain. How busy are your vans at the moment, and do you mostly do local moves or long-distance?"',
      '[Pitch] "Here\u2019s what we\u2019re offering: a 14-day free trial, no card needed. Every morning at 9am you get fresh moving leads in your chosen postcode areas. The first company to call usually wins the job. So you\u2019d be getting there before your competitors."',
      '[Objection: "We get enough work from referrals"] "That\u2019s great. Most successful removal companies run referrals AND a daily lead feed. This is extra, on top, and it\u2019s free for 14 days. You can see exactly what it brings you before spending a penny."',
      '[Objection: "How much does it cost?"] "The 14-day trial is completely free, no card required. After that it\u2019s from £25 a week. Roughly the price of one small local move. If one extra booking covers a month of leads, that\u2019s a no-brainer."',
      '[Objection: "I\u2019m too busy to try it"] "That\u2019s exactly why it works. It takes five minutes each morning. You open your leads at 9am, call the strongest two, and you\u2019re done. I can have you set up right now, and you can cancel in one click if it\u2019s not for you."',
      '[Close] "Let me get you set up. It takes 30 seconds. What email should I send your login to? I\u2019ll have your first batch of moving leads ready for 9am tomorrow."'
    ],
    emails: [
      { subject: 'Fresh moving leads in [area]: 14 days free', body: 'Hi [name],\n\nI\u2019m [your name] from 9amLeads. Every morning at 9am we send removal companies moving leads. Homes that have just gone under offer or SSTC in their chosen postcode areas.\n\nThat timing is everything. It\u2019s the moment homeowners are comparing removal quotes, and the first company to call usually wins the move.\n\nYou can try it completely free for 14 days, no card required:\n\n\u2192 https://9amleads.com/portal/#signup\n\nA single extra booking usually covers a month of leads. Want me to set up your free 14 days now?' },
      { subject: 'Your free 14-day moving-leads trial', body: 'Hi [name],\n\nQuick follow-up on the free 14-day trial of daily moving leads for [area]. It takes about 30 seconds to start, and your first batch would land at 9am tomorrow:\n\n\u2192 https://9amleads.com/portal/#signup\n\nNo card needed, cancel anytime in one click. If one new move covers a month of leads, it\u2019s worth the two minutes to try.\n\nHappy to answer any questions. Just reply to this email.' },
      { subject: 'Your trial is waiting: first leads at 9am', body: 'Hi [name],\n\nJust making sure you didn\u2019t miss it. Your free 14-day trial of daily moving leads is still waiting:\n\n\u2192 https://9amleads.com/portal/#signup\n\nSet it up now and your first batch arrives tomorrow morning. First to the homeowner wins the move. Don\u2019t let another removal company get there first.' }
    ],
    sms: [
      'Hi [name]. 9amLeads here. We send removal companies fresh moving leads every morning (homes just gone under offer in [area]). 14-day free trial, no card: https://9amleads.com/portal/#signup',
      'Quick one [name]. Your free 14 days of daily moving leads is waiting: https://9amleads.com/portal/#signup. First to call usually wins the move. Happy to answer any questions.',
      'Reminder [name]: your free 14-day moving-leads trial. First batch tomorrow at 9am. https://9amleads.com/portal/#signup'
    ],
    social: [
      'Every morning at 9am, removal companies on our list get fresh moving leads: homes that just went under offer in their postcode. 🚚 First to call usually wins the job. 14-day free trial, no card: https://9amleads.com/portal/#signup #movingleads #removals',
      'The #1 reason removal quotes get won? Speed. ⏱️ We deliver moving leads the moment they\u2019re hot. Try 14 days free \u2192 https://9amleads.com/portal/#signup #removalcompany #moving',
      'Want more removals without spending on ads? Daily moving leads + a fast morning routine = a fuller calendar. 📅 14 days free: https://9amleads.com/portal/#signup',
      'Most moves go to the FIRST removal company that calls. Be first \u2192 https://9amleads.com/portal/#signup 🚚 #removals #leads'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script. Goal: start the 14-day free trial on the call.' },
      { day: 'Day 1', action: 'No trial yet? Send email #1 or the first SMS. If they trialed, check their first 9am batch landed.' },
      { day: 'Day 3', action: 'Send email #2 / second SMS: a light, value-led nudge.' },
      { day: 'Day 7', action: 'Call again. Ask how the week\u2019s leads looked. Most who used it stay.' },
      { day: 'Day 12', action: 'Trial is ending. Email #3: "your trial is waiting / first leads at 9am." Strongest conversion moment.' },
      { day: 'Day 14', action: 'Final call: help them pick a plan (£25/£49/£99 per week) before they lose the daily leads.' }
    ]
  },
  {
    key: 'probate', name: 'Probate Leads', emoji: '⚖️',
    target: 'Solicitors & probate practitioners',
    precall: [
      'Know the lead: firm name, size, and whether they already do probate/estate work.',
      'Set your goal: get the 14-day free trial started on this call.',
      'Position yourself as adding a steady stream of work, not selling them something.'
    ],
    facts: [
      'Probate leads come from the official Gov.uk register: newly granted probate, daily.',
      'The firms that contact executors within 48 hours win most instructions.',
      'One estate instruction usually covers many months of leads (from £25/week).',
      'Their referrals get a 14-day free trial. No card, easy to start.'
    ],
    phone: [
      '[Opener] "Hi [name], it\u2019s [your name] from 9amLeads. I\u2019m calling probate practitioners in [area]. Have you got two minutes, or should I call back?"',
      '[Hook] "The reason I\u2019m calling: every morning at 9am we send probate practitioners notifications of newly granted probate from the official register. In the postcode areas they choose."',
      '[Qualify] "How does your firm currently find probate and estate work. Is it mostly referrals, or do you actively market for it?"',
      '[Pitch] "We\u2019re offering a 14-day free trial, no card needed. Every morning you\u2019d receive new grants. The exact moment a family needs estate help. First contact within 48 hours wins most instructions, so you\u2019d be ahead of firms that wait for referrals."',
      '[Objection: "We rely on referrals"] "Referrals are brilliant. This adds to them. It\u2019s daily, from the official register, and it\u2019s free for 14 days. You\u2019ll see exactly how many new probate files it surfaces before you decide."',
      '[Objection: "How much does it cost?"] "The 14-day trial is free, no card. After that it\u2019s from £25 a week. And one estate instruction typically covers many months of that."',
      '[Objection: "I\u2019m worried about volume"] "Start with the free trial and choose postcode areas to match your capacity. You can set it to exactly the volume you can handle. No pressure."',
      '[Close] "Let me get you set up. 30 seconds. What email should I use for your login? Your first probate leads will be ready at 9am tomorrow."'
    ],
    emails: [
      { subject: 'New probate leads in [area]: 14 days free', body: 'Hi [name],\n\nI\u2019m [your name] from 9amLeads. Every morning at 9am we send probate practitioners notifications of newly granted probate from the official Gov.uk register, in the postcodes they choose.\n\nThe firms that contact executors within 48 hours win most instructions. It\u2019s a simple way to add a steady stream of new files alongside referrals.\n\nTry it free for 14 days, no card:\n\n\u2192 https://9amleads.com/portal/#signup\n\nWant me to set up your free weeks now?' },
      { subject: 'Your free 14-day probate-leads trial', body: 'Hi [name],\n\nQuick follow-up on the free 14-day trial of daily probate leads for [area]. It takes 30 seconds to start, and your first batch lands at 9am tomorrow:\n\n\u2192 https://9amleads.com/portal/#signup\n\nNo card, cancel anytime. If one instruction covers months of leads, it\u2019s worth the week to see for yourself.' },
      { subject: 'Still open: your 14 days of probate leads', body: 'Hi [name],\n\nYour free 14-day trial of daily probate leads is still waiting:\n\n\u2192 https://9amleads.com/portal/#signup\n\nStart today and your first notifications arrive tomorrow at 9am. Being early to the executor is the difference between winning the file and missing it.' }
    ],
    sms: [
      'Hi [name]. 9amLeads here. We send probate practitioners daily notifications of new grants from the official register (your areas). 14-day free trial, no card: https://9amleads.com/portal/#signup',
      'Your free 14 days of daily probate leads is ready, [name]: https://9amleads.com/portal/#signup. First contact within 48h wins most instructions. Reply with any questions.',
      'Reminder [name]: free 14-day probate-leads trial. First batch tomorrow 9am. https://9amleads.com/portal/#signup'
    ],
    social: [
      'Probate instructions usually go to the first firm that contacts the executor. ⚖️ We deliver daily notifications of newly granted probate: 14 days free: https://9amleads.com/portal/#signup #probate #solicitors',
      'Referrals are great. So is a daily stream of new probate opportunities from the official register. 14 days free \u2192 https://9amleads.com/portal/#signup #probateleads #legal',
      'How solicitors fill their pipeline without cold-calling: daily probate leads + a fast, respectful first contact. 📩 14-day free trial: https://9amleads.com/portal/#signup',
      'New grants are published every day. Be the firm that calls first \u2192 https://9amleads.com/portal/#signup ⚖️ #probate'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script. Goal: start the free trial on the call.' },
      { day: 'Day 1', action: 'No trial? Email #1 or first SMS. If trialed, confirm the 9am batch arrived.' },
      { day: 'Day 3', action: 'Light follow-up: email #2 or second SMS.' },
      { day: 'Day 7', action: 'Call: how many new probate enquiries did the week surface?' },
      { day: 'Day 12', action: 'Email #3. Trial ending, keep the daily feed going.' },
      { day: 'Day 14', action: 'Final call. Help them choose a plan.' }
    ]
  },
  {
    key: 'newbusiness', name: 'New Business Leads', emoji: '💼',
    target: 'Accountants, web designers & B2B services',
    precall: [
      'Know the lead: what they sell, who their ideal client is, and the sector (SIC) they serve.',
      'Set your goal: start the 14-day free trial on this call.',
      'Emphasise "brand-new companies with no supplier yet": that\u2019s the killer point.'
    ],
    facts: [
      'New business leads are freshly registered Companies House companies: daily.',
      'A new company has no incumbent supplier. The first to call usually wins the account.',
      'One new retained client usually pays for a year of leads (from £25/week).',
      'Their referrals get a 14-day free trial. No card needed.'
    ],
    phone: [
      '[Opener] "Hi [name], it\u2019s [your name] from 9amLeads. I\u2019m calling [accountancy/B2B] firms in [area]. Have you got two minutes, or should I call back?"',
      '[Hook] "The reason I\u2019m calling: every morning at 9am we send B2B firms newly registered companies from Companies House. Filtered by the exact sectors and locations they choose."',
      '[Qualify] "How do you currently find new clients. Is it referrals, or are you actively prospecting?"',
      '[Pitch] "Here\u2019s what we\u2019re offering: a 14-day free trial, no card. Every morning you\u2019d see brand-new companies in your sector. Businesses that incorporated in the last 24 hours and need an accountant / website / IT before anyone else talks to them. There\u2019s no incumbent supplier yet, so the first firm to make contact usually wins."',
      '[Objection: "We have enough clients"] "That\u2019s the best position to be in. This is free growth. Take the 14-day trial and just see how many brand-new companies in your sector appear that you\u2019d never have known about."',
      '[Objection: "How much does it cost?"] "Free for 14 days, no card. After that from £25 a week. One new retained client usually pays for a year of it."',
      '[Objection: "I\u2019m too busy prospecting"] "Then let the leads come to you. Five minutes each morning, contact the strongest two, done. I can have you set up right now."',
      '[Close] "What email should I send your login to? I\u2019ll have your first new-company leads ready at 9am tomorrow."'
    ],
    emails: [
      { subject: 'New companies in [sector] every morning: 14 days free', body: 'Hi [name],\n\nI\u2019m [your name] from 9amLeads. Every morning at 9am we send B2B firms newly registered companies from Companies House. Filtered by the SIC codes and locations they choose.\n\nA company incorporated today needs an accountant, a website, insurance and IT within weeks. And whoever contacts them first usually wins the account, because there\u2019s no incumbent supplier yet.\n\nTry it free for 14 days, no card:\n\n\u2192 https://9amleads.com/portal/#signup\n\nSet up your free weeks now?' },
      { subject: 'Your free 14-day new-business-leads trial', body: 'Hi [name],\n\nQuick follow-up on the free 14-day trial of daily new-company leads. 30 seconds to start, first batch at 9am tomorrow:\n\n\u2192 https://9amleads.com/portal/#signup\n\nNo card, cancel anytime. One new client usually covers a year of it. Worth a fortnight to find out.' },
      { subject: 'Your new-business leads are ready', body: 'Hi [name],\n\nJust making sure you didn\u2019t miss it. Your free 14-day trial of new company leads is still waiting:\n\n\u2192 https://9amleads.com/portal/#signup\n\nStart now and your first batch of brand-new companies arrives at 9am tomorrow. First to a new company means no competition.' }
    ],
    sms: [
      'Hi [name]. 9amLeads here. We send B2B firms newly registered Companies House companies every morning (your sector). 14-day free trial, no card: https://9amleads.com/portal/#signup',
      'Your free 14 days of daily new-company leads is ready, [name]: https://9amleads.com/portal/#signup. New company = no supplier yet. First contact usually wins.',
      'Reminder [name]: free 14-day new-business-leads trial. First batch tomorrow 9am. https://9amleads.com/portal/#signup'
    ],
    social: [
      'A company incorporated today needs an accountant, a website, insurance: and whoever contacts them first usually wins. 💼 Get new Companies House registrations daily, 14 days free: https://9amleads.com/portal/#signup #b2bleads #accountants',
      'Why chase established firms with loyal suppliers? New companies have none. Fresh registrations, delivered daily \u2192 https://9amleads.com/portal/#signup #businessgrowth',
      'The B2B lead nobody\u2019s paying attention to: newly registered companies. 14 days free: https://9amleads.com/portal/#signup #companieshouse',
      'Your next client might have incorporated this morning. Get them before anyone else \u2192 https://9amleads.com/portal/#signup 💼'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script: get the free trial started.' },
      { day: 'Day 1', action: 'Email #1 or first SMS if no trial yet. Confirm the 9am batch if trialed.' },
      { day: 'Day 3', action: 'Follow up with email #2 or second SMS.' },
      { day: 'Day 7', action: 'Call: how many new company enquiries did they get in a week?' },
      { day: 'Day 12', action: 'Email #3. Trial ending, keep the daily feed going.' },
      { day: 'Day 14', action: 'Final check. Keep the feed going?' }
    ]
  },
  {
    key: 'planning', name: 'Planning Permission Leads', emoji: '🏗️',
    target: 'Builders, architects & trades',
    precall: [
      'Know the lead: are they builders, architects, or a specific trade? What area do they cover?',
      'Set your goal: start the 14-day free trial on this call.',
      'Lead with "a planning application means a homeowner is ready to spend."'
    ],
    facts: [
      'Planning leads are newly submitted planning applications: daily, in their postcode areas.',
      'A homeowner who has applied is ready to spend on the build.',
      'Contacting them while the application is being decided means you quote before other builders.',
      'Their referrals get a 14-day free trial. No card needed.'
    ],
    phone: [
      '[Opener] "Hi [name], it\u2019s [your name] from 9amLeads. I\u2019m calling builders and trades in [area]. Have you got two minutes, or should I call back?"',
      '[Hook] "The reason I\u2019m calling: every morning at 9am we send builders newly submitted planning applications. Homeowners in their postcode who have just applied for an extension, conversion or new build and are ready to spend."',
      '[Qualify] "How\u2019s the order book looking at the moment. Do you mainly do extensions, conversions, or new builds?"',
      '[Pitch] "We\u2019re offering a 14-day free trial, no card. Every morning you\u2019d get fresh planning applications in your areas. A homeowner who\u2019s applied for planning is ready to spend. And if you contact them while it\u2019s being decided, you quote before another builder even knows about it."',
      '[Objection: "We work on referrals"] "Referrals are great. This adds to them. It\u2019s a daily stream of local homeowners actively planning a build. Try the free 14 days and see the pipeline it adds."',
      '[Objection: "How much does it cost?"] "Free for 14 days, no card. After that from £25 a week. One extension job usually covers it for months."',
      '[Objection: "I don\u2019t have time to chase"] "That\u2019s the point. It takes five minutes a morning. You pick the applications that fit your trade, contact the ones worth quoting, done."',
      '[Close] "Let me get you set up. What email should I use? Your first planning leads will be there at 9am tomorrow."'
    ],
    emails: [
      { subject: 'Local planning leads: 14 days free', body: 'Hi [name],\n\nI\u2019m [your name] from 9amLeads. Every morning at 9am we send builders newly submitted planning applications in their chosen postcode areas. Homeowners who have just applied for an extension, loft conversion or new build.\n\nA planning application is a homeowner ready to spend. Contact them while it\u2019s being decided and you quote before the competition.\n\nFree for 14 days, no card:\n\n\u2192 https://9amleads.com/portal/#signup\n\nWant me to set up your free weeks now?' },
      { subject: 'Your free 14-day planning-leads trial', body: 'Hi [name],\n\nQuick follow-up on the free 14-day trial of daily planning leads for [area]. 30 seconds to start, first batch at 9am tomorrow:\n\n\u2192 https://9amleads.com/portal/#signup\n\nNo card, cancel anytime. One extension job usually covers it for months.' },
      { subject: 'Applications are waiting for you', body: 'Hi [name],\n\nYour free 14-day trial of planning leads is still waiting:\n\n\u2192 https://9amleads.com/portal/#signup\n\nStart today and you\u2019ll see new applications tomorrow morning. Homeowners ready to spend on their build. Be the builder who quotes first.' }
    ],
    sms: [
      'Hi [name]. 9amLeads here. We send builders newly submitted planning applications every morning (your postcode areas). 14-day free trial, no card: https://9amleads.com/portal/#signup',
      'Your free 14 days of daily planning leads is ready, [name]: https://9amleads.com/portal/#signup. Applications = homeowners ready to spend. Reply with questions.',
      'Reminder [name]: free 14-day planning-leads trial. First batch tomorrow 9am. https://9amleads.com/portal/#signup'
    ],
    social: [
      'A planning application means a homeowner is ready to spend. 🏗️ We deliver newly submitted applications every morning: 14 days free: https://9amleads.com/portal/#signup #planningleads #builders',
      'Quote before the other builders: daily planning leads for your postcodes. Try it free \u2192 https://9amleads.com/portal/#signup #extensions #construction',
      'Your next extension job is on the planning portal right now. Get it delivered at 9am daily \u2192 https://9amleads.com/portal/#signup #tradesmen',
      'Homeowners who apply for planning are ready to spend. Be the builder who calls first \u2192 https://9amleads.com/portal/#signup 🏗️'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script: start the free trial.' },
      { day: 'Day 1', action: 'Email #1 or first SMS if no trial. Confirm 9am batch if trialed.' },
      { day: 'Day 3', action: 'Follow up with email #2 or second SMS.' },
      { day: 'Day 7', action: 'Call: how many quotes have they sent from planning leads?' },
      { day: 'Day 12', action: 'Email #3. Applications are waiting, keep the pipeline going.' },
      { day: 'Day 14', action: 'Final check. Keep the pipeline going?' }
    ]
  },
  {
    key: 'tenders', name: 'Tender Opportunities', emoji: '📋',
    target: 'Cleaning, IT, construction & FM firms',
    precall: [
      'Know the lead: what sector they\u2019re in and whether they\u2019ve bid for public sector work before.',
      'Set your goal: start the 14-day free trial on this call.',
      'Lead with "public buyers pay reliably and often prefer local SMEs."'
    ],
    facts: [
      'Tender opportunities are matched to their sector and region, delivered daily.',
      'Public sector buyers pay reliably and prefer local, specialist suppliers.',
      'One won contract usually covers years of leads (from £25/week).',
      'Their referrals get a 14-day free trial: no card needed, and you earn £25 about a month later once they pay their second invoice.'
    ],
    phone: [
      '[Opener] "Hi [name], it\u2019s [your name] from 9amLeads. I\u2019m calling [sector] companies that could win public sector work. Have you got two minutes, or should I call back?"',
      '[Hook] "The reason I\u2019m calling: every morning at 9am we send firms public sector tender opportunities matched to their sector and region. From Contracts Finder and the official platforms."',
      '[Qualify] "Do you currently bid for public sector or council work, or is that something you\u2019d like to grow?"',
      '[Pitch] "We\u2019re offering a 14-day free trial, no card. Every morning you\u2019d see the tender opportunities that actually fit your business. Cleaning, IT, construction, whatever you do. One won contract usually covers years of leads, and public buyers genuinely prefer local SMEs."',
      '[Objection: "Bidding is too complicated"] "It gets easier with practice, and these are matched to your sector so you\u2019re not wading through hundreds of irrelevant notices. Start with the free 14 days. You\u2019ll see the opportunities that are out there."',
      '[Objection: "How much does it cost?"] "Free for 14 days, no card. After that from £25 a week. A fraction of one public sector contract."',
      '[Objection: "We\u2019re too small"] "Some of the best public sector success stories are small local firms. Buyers are often required to consider them. The trial is free; just see what\u2019s out there."',
      '[Close] "What email should I send your login to? Your first matched tenders will be there tomorrow morning."'
    ],
    emails: [
      { subject: 'Public sector tenders matched to [sector]: 14 days free', body: 'Hi [name],\n\nI\u2019m [your name] from 9amLeads. Every morning at 9am we send firms public sector tender opportunities matched to their sector and region. From Contracts Finder and the other official platforms.\n\nPublic buyers pay reliably, and they often prefer small, local suppliers. One won contract usually covers years of the subscription.\n\nFree for 14 days, no card:\n\n\u2192 https://9amleads.com/portal/#signup\n\nSet up your free weeks now?' },
      { subject: 'Your free 14-day matched-tenders trial', body: 'Hi [name],\n\nQuick follow-up on the free 14-day trial of daily tender opportunities for [sector]. 30 seconds to start:\n\n\u2192 https://9amleads.com/portal/#signup\n\nNo card, cancel anytime. Worth a fortnight to see what\u2019s actually out there for your business.' },
      { subject: 'Tenders are waiting for you', body: 'Hi [name],\n\nYour free 14-day trial of matched tender opportunities is still waiting:\n\n\u2192 https://9amleads.com/portal/#signup\n\nStart today and your first matched opportunities arrive tomorrow morning. The right contract can cover years of leads.' }
    ],
    sms: [
      'Hi [name]. 9amLeads here. We send public sector tenders matched to your sector every morning. 14-day free trial, no card: https://9amleads.com/portal/#signup',
      'Your free 14 days of matched tenders is ready, [name]: https://9amleads.com/portal/#signup. One contract can cover years. Reply with questions.',
      'Reminder [name]: free 14-day tender trial. Matched opportunities tomorrow 9am. https://9amleads.com/portal/#signup'
    ],
    social: [
      'Public sector buyers pay reliably and prefer local SMEs. 📋 Get tenders matched to your sector delivered daily: 14 days free: https://9amleads.com/portal/#signup #tenders #sme',
      'The opportunities are out there. Most firms just never see them. Daily matched tenders \u2192 https://9amleads.com/portal/#signup #publicsector #cleaning #it',
      'Win your first public sector contract with tenders you actually fit. 14-day free trial: https://9amleads.com/portal/#signup #bids',
      'Your next public sector contract might be published today. See it first \u2192 https://9amleads.com/portal/#signup 📋'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script: start the free trial.' },
      { day: 'Day 1', action: 'Email #1 or first SMS if no trial. Confirm batch if trialed.' },
      { day: 'Day 3', action: 'Follow up with email #2 or second SMS.' },
      { day: 'Day 7', action: 'Call: which opportunities did they see that fit their business?' },
      { day: 'Day 12', action: 'Email #3. Tenders are waiting, don\u2019t miss them.' },
      { day: 'Day 14', action: 'Final check. Keep the tender feed going?' }
    ]
  },
  {
    key: 'general', name: 'Any Business / General', emoji: '📈',
    target: 'Anyone who needs more customers',
    precall: [
      'Know the lead: what they do and where their work comes from today.',
      'Set your goal: match them to the right lead type and start the free trial.',
      'Keep it consultative: you\u2019re solving "we need more customers", not selling a product.'
    ],
    facts: [
      'Fresh business leads delivered every morning at 9am, matched to their trade and area.',
      'Choose the lead type that fits how they win work: moving, probate, planning, new business or tenders.',
      'Fixed weekly price from £25. No paying per lead, no auctions.',
      'Their referrals get a 14-day free trial. No card needed.'
    ],
    phone: [
      '[Opener] "Hi [name], it\u2019s [your name] from 9amLeads. I\u2019m calling businesses in [area] that want more customers. Do you have two minutes?"',
      '[Qualify] "First. What does your business do, and where does most of your work come from at the moment?"',
      '[Match] "Based on that, we\u2019d set you up with [moving/probate/new business/planning/tenders] leads. Delivered every morning at 9am in your postcode areas."',
      '[Pitch] "Here\u2019s what we\u2019re offering: a 14-day free trial, no card. Every morning you\u2019d get fresh leads matched to your trade. You\u2019re not paying per lead. It\u2019s a fixed weekly price, and one extra customer usually covers it."',
      '[Objection: "What type of leads do I get?"] "You pick the type that fits how you win work. For example moving leads for removals, planning leads for builders, tenders for cleaning or IT. We\u2019ll match it to your business on the call."',
      '[Objection: "How much does it cost?"] "Free for 14 days, no card. After that from £25 a week. One extra customer usually pays for the whole month."',
      '[Objection: "I\u2019ll think about it"] "Completely understand. The free trial is the easiest way to see it with zero risk. Let me set you up now so you can look at real leads tomorrow at 9am, and if it\u2019s not for you, cancel in one click."',
      '[Close] "What email should I use? I\u2019ll match your lead type and have your first batch ready at 9am tomorrow."'
    ],
    emails: [
      { subject: 'Fresh leads for [business]: 14 days free', body: 'Hi [name],\n\nI\u2019m [your name] from 9amLeads. We deliver fresh business leads every morning at 9am. Moving, probate, new business, planning or tenders. Matched to your trade and chosen postcode areas.\n\nYou\u2019re not paying per lead, and there\u2019s a free 14-day trial with no card:\n\n\u2192 https://9amleads.com/portal/#signup\n\nWant me to match the right lead type for your business?' },
      { subject: 'Your free 14-day leads trial', body: 'Hi [name],\n\nQuick follow-up on the free 14-day trial of daily business leads. 30 seconds to start, first batch at 9am tomorrow:\n\n\u2192 https://9amleads.com/portal/#signup\n\nNo card, cancel anytime. One extra customer usually covers it.' },
      { subject: 'Still open: your free 14 days of leads', body: 'Hi [name],\n\nYour free 14-day trial of daily business leads is still waiting:\n\n\u2192 https://9amleads.com/portal/#signup\n\nStart now and your first batch arrives at 9am tomorrow. Matched to how you win work.' }
    ],
    sms: [
      'Hi [name]. 9amLeads here. Fresh business leads delivered every morning, matched to your trade and area. 14-day free trial, no card: https://9amleads.com/portal/#signup',
      'Your free 14 days of daily leads is ready, [name]: https://9amleads.com/portal/#signup. We\u2019ll match the right lead type for you. Reply with questions.',
      'Reminder [name]: free 14-day business-leads trial. First batch tomorrow 9am. https://9amleads.com/portal/#signup'
    ],
    social: [
      'Fresh business leads, delivered every morning at 9am. 📈 Moving, probate, planning, new business or tenders: matched to your trade. 14 days free: https://9amleads.com/portal/#signup #businessleads',
      'Stop paying per lead. Get your own daily allocation instead. 14-day free trial: https://9amleads.com/portal/#signup #leads #growth',
      'Your competitors get their leads at 9am. Get yours too \u2192 https://9amleads.com/portal/#signup #smallbusiness #ukbusiness',
      'More customers without spending on ads. Fresh leads every morning \u2192 https://9amleads.com/portal/#signup 📈'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script: match their lead type and start the free trial.' },
      { day: 'Day 1', action: 'Email #1 or first SMS if no trial. Confirm 9am batch if trialed.' },
      { day: 'Day 3', action: 'Follow up with email #2 or second SMS.' },
      { day: 'Day 7', action: 'Call: how did the first week of leads look?' },
      { day: 'Day 12', action: 'Email #3. Trial ending, don\u2019t lose the daily leads.' },
      { day: 'Day 14', action: 'Final check. Keep the leads going?' }
    ]
  }
];
