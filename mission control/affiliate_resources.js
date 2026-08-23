// Affiliate sales toolkit: ready-to-use scripts and templates per business type.
// Served to affiliates via /api/affiliate/resources so they can promote 9amLeads
// and convert their referrals into trial sign-ups.

module.exports = [
  {
    key: 'moving', name: 'Moving Leads', emoji: '🚚',
    target: 'Removal companies & estate agents',
    phone: [
      '[Opener] "Hi [name], it\u2019s [your name] here from 9amLeads. I\u2019m calling removal companies in the [area] area \u2014 do you have two minutes, or is now a bad time?"',
      '[Qualify] "How busy are your vans at the moment? Do you mostly work local moves or long distance?"',
      '[Pitch \u2014 1-week free trial] "The reason I\u2019m calling: every morning at 9am we send removal companies fresh moving leads for properties that have just gone under offer or SSTC \u2014 the exact moment homeowners are comparing removal quotes. We\u2019re giving removal companies a free 1-week trial to try it, no card needed. I can set yours up in about 30 seconds."',
      '[Objection \u2014 \u201cWe already get leads\u201d] "Great \u2014 most companies have a mix. These are daily, in your postcode, and you\u2019re not paying per lead. The trial is free, so you can just see how many real moving jobs come through before deciding."',
      '[Objection \u2014 \u201cHow much?\u201d] "The trial is completely free for a week. After that it\u2019s from £25 a week \u2014 roughly the price of one small local move, and one won job usually covers months of leads."',
      '[Objection \u2014 \u201cI\u2019m too busy\u201d] "That\u2019s exactly why it works \u2014 it takes minutes each morning. Start the free trial now and you can cancel in one click if it\u2019s not for you."',
      '[Close] "Let me get you set up. What\u2019s the best email to send your login to? I\u2019ll have your first batch ready for 9am tomorrow."'
    ],
    emails: [
      { subject: 'Fresh moving leads in [area] — free 1-week trial', body: 'Hi [name],\n\nI noticed [company] handles moves across [area]. I\u2019m with 9amLeads, and every morning at 9am we send removal companies moving leads for homes that have just gone under offer or SSTC in their chosen postcodes.\n\nThe timing is everything \u2014 that\u2019s the moment homeowners are comparing removal quotes, and the first company to call usually wins the job.\n\nYou can try it free for 1 week, no card required:\n\n\u2192 https://9amleads.com/portal/#signup\n\nIf it\u2019s not a fit, cancel in one click. Want me to set up your free week now?' },
      { subject: 'Reminder: your free moving-leads week', body: 'Hi [name],\n\nJust following up on the free 1-week trial of daily moving leads for [area]. It takes about 30 seconds to start, and your first batch would land at 9am tomorrow:\n\n\u2192 https://9amleads.com/portal/#signup\n\nNo card needed, cancel anytime. If a single new booking pays for months of leads, it\u2019s worth a look. Reply if you\u2019d like me to talk you through it.' }
    ],
    sms: [
      'Hi [name] \u2014 9amLeads here. We send removal companies fresh moving leads every morning (homes just gone under offer in [area]). Free 1-week trial, no card: https://9amleads.com/portal/#signup',
      'Quick one [name] \u2014 your free week of daily moving leads is waiting: https://9amleads.com/portal/#signup. One new booking usually covers months. Happy to answer any questions.'
    ],
    social: [
      'Every morning at 9am, removal companies on our list get fresh moving leads \u2014 homes that just went under offer in their postcode. 🚚 First to call usually wins the job. Free 1-week trial, no card: https://9amleads.com/portal/#signup #movingleads #removals',
      'The #1 reason removal quotes get won? Speed. ⏱️ We deliver moving leads the moment they\u2019re hot. Try 1 week free \u2192 https://9amleads.com/portal/#signup #removalcompany #moving',
      'Want more removals without spending on ads? Daily moving leads + a good morning routine = a fuller calendar. 📅 Free week: https://9amleads.com/portal/#signup'
    ],
    followup: [
      { day: 'Day 0', action: 'Call with the script above. Goal: get them to start the free trial on the call.' },
      { day: 'Day 1', action: 'If no trial yet, send email #1 or the first SMS. If they trialed, check it landed at 9am.' },
      { day: 'Day 3', action: 'Send email #2 or second SMS as a light follow-up.' },
      { day: 'Day 7', action: 'Call once more. Ask what they thought of the week\u2019s leads \u2014 most who used it sign up.' },
      { day: 'Day 14', action: 'Final touch: ask if they want to keep the leads going before the trial/conversation ends.' }
    ]
  },
  {
    key: 'probate', name: 'Probate Leads', emoji: '⚖️',
    target: 'Solicitors & probate practitioners',
    phone: [
      '[Opener] "Hi [name], it\u2019s [your name] from 9amLeads. I\u2019m calling probate practitioners in [area] \u2014 do you have two minutes, or is now a bad time?"',
      '[Qualify] "How does your firm currently find probate and estate work \u2014 referrals, or do you market for it?"',
      '[Pitch \u2014 1-week free trial] "Every morning at 9am we send probate practitioners notifications of newly granted probate from the official register \u2014 the moment a family needs estate help. First contact within 48 hours wins most instructions. We\u2019re giving firms a free 1-week trial, no card. I can set it up in 30 seconds."',
      '[Objection \u2014 \u201cWe rely on referrals\u201d] "Referrals are great \u2014 this adds to them. It\u2019s daily, from the official register, and the trial is free. See how many new files it surfaces in a week."',
      '[Objection \u2014 \u201cHow much?\u201d] "Free for the first week. After that it\u2019s from £25 a week \u2014 and one estate instruction usually covers many months."',
      '[Close] "What email should I send the login to? I\u2019ll have your first probate leads ready for 9am tomorrow."'
    ],
    emails: [
      { subject: 'New probate leads in your area \u2014 free week', body: 'Hi [name],\n\nI\u2019m with 9amLeads. Every morning at 9am we send probate practitioners notifications of newly granted probate from the official Gov.uk register \u2014 in the postcodes they choose.\n\nThe firms that contact executors within 48 hours win most instructions. It\u2019s a simple way to add a steady stream of new probate files alongside referrals.\n\nTry it free for 1 week, no card:\n\n\u2192 https://9amleads.com/portal/#signup\n\nWant me to set up your free week?' },
      { subject: 'Your free week of probate leads', body: 'Hi [name],\n\nQuick follow-up on the free 1-week trial of daily probate leads for [area]. Takes 30 seconds to start and your first batch lands at 9am tomorrow:\n\n\u2192 https://9amleads.com/portal/#signup\n\nNo card, cancel anytime. If one instruction covers months of leads, it\u2019s worth the week to find out.' }
    ],
    sms: [
      'Hi [name] \u2014 9amLeads here. We send probate practitioners daily notifications of new grants from the official register (your postcode areas). Free 1-week trial, no card: https://9amleads.com/portal/#signup',
      'Your free week of daily probate leads is ready, [name]: https://9amleads.com/portal/#signup. First contact within 48h wins most instructions. Any questions, just reply.'
    ],
    social: [
      'Probate instructions usually go to the first firm that contacts the executor. ⚖️ We deliver daily notifications of newly granted probate \u2014 try 1 week free: https://9amleads.com/portal/#signup #probate #solicitors',
      'Referrals are great. So is a daily stream of new probate opportunities from the official register. Free week \u2192 https://9amleads.com/portal/#signup #probateleads #legal',
      'How solicitors fill their pipeline without cold-calling: daily probate leads + a fast, respectful first contact. 📩 Free 1-week trial: https://9amleads.com/portal/#signup'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script. Goal: start the free trial on the call.' },
      { day: 'Day 1', action: 'Send email #1 or first SMS if no trial yet. If trialed, confirm the 9am batch arrived.' },
      { day: 'Day 3', action: 'Light follow-up with email #2 or second SMS.' },
      { day: 'Day 7', action: 'Call: ask how many new probate enquiries the week surfaced.' },
      { day: 'Day 14', action: 'Final touch \u2014 ask if they want to keep the daily probate feed going.' }
    ]
  },
  {
    key: 'newbusiness', name: 'New Business Leads', emoji: '💼',
    target: 'Accountants, web designers & B2B services',
    phone: [
      '[Opener] "Hi [name], it\u2019s [your name] from 9amLeads. I\u2019m calling accountancy/B2B firms in [area] \u2014 have you got two minutes, or should I call back?"',
      '[Qualify] "How do you currently find new clients \u2014 referrals, or are you actively prospecting?"',
      '[Pitch \u2014 1-week free trial] "Every morning at 9am we send firms newly registered companies from Companies House \u2014 businesses that incorporated in the last 24 hours and need an accountant/website/IT before anyone else talks to them. First contact in the first fortnight wins most of these. Free 1-week trial, no card \u2014 I can set you up in 30 seconds."',
      '[Objection \u2014 \u201cWe have enough clients\u201d] "Then this is free growth. The trial is a week, no card \u2014 see how many brand-new companies in your sector appear that you\u2019d never have seen otherwise."',
      '[Objection \u2014 \u201cHow much?\u201d] "Free for the first week, then from £25 a week \u2014 one new retained client usually pays for a year."',
      '[Close] "Best email for your login? Your first new-company leads will be there at 9am tomorrow."'
    ],
    emails: [
      { subject: 'New companies in [sector] every morning \u2014 free week', body: 'Hi [name],\n\nI\u2019m with 9amLeads. Every morning at 9am we send B2B firms newly registered companies from Companies House \u2014 filtered by the SIC codes and locations they choose.\n\nA company incorporated today needs an accountant, a website, insurance and IT within weeks \u2014 and whoever contacts them first usually wins the account. There\u2019s no incumbent supplier yet.\n\nTry it free for 1 week, no card:\n\n\u2192 https://9amleads.com/portal/#signup\n\nSet up your free week?' },
      { subject: 'Your free week of new-business leads', body: 'Hi [name],\n\nFollowing up on the free 1-week trial of daily new company leads. 30 seconds to start, first batch at 9am tomorrow:\n\n\u2192 https://9amleads.com/portal/#signup\n\nNo card, cancel anytime. One new client usually covers a year of it \u2014 worth a week to find out.' }
    ],
    sms: [
      'Hi [name] \u2014 9amLeads here. We send B2B firms newly registered companies from Companies House every morning (filtered to your sector). Free 1-week trial, no card: https://9amleads.com/portal/#signup',
      'Your free week of daily new-company leads is ready: https://9amleads.com/portal/#signup. First to a brand-new company = no incumbent supplier. Reply with any questions.'
    ],
    social: [
      'A company incorporated today needs an accountant, a website, insurance \u2014 and whoever contacts them first usually wins. 💼 Get new Companies House registrations daily, free week: https://9amleads.com/portal/#signup #b2bleads #accountants',
      'Why chase established firms with loyal suppliers? New companies have none. Fresh registrations, delivered daily \u2192 https://9amleads.com/portal/#signup #newwords #businessgrowth',
      'The B2B lead nobody is paying attention to: newly registered companies. Try 1 week free: https://9amleads.com/portal/#signup #companieshouse'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script \u2014 get the free trial started.' },
      { day: 'Day 1', action: 'Email #1 or first SMS if no trial yet. Confirm the 9am batch if trialed.' },
      { day: 'Day 3', action: 'Follow up with email #2 or second SMS.' },
      { day: 'Day 7', action: 'Call: how many new company enquiries did they get in a week?' },
      { day: 'Day 14', action: 'Final check \u2014 keep the daily feed going?' }
    ]
  },
  {
    key: 'planning', name: 'Planning Permission Leads', emoji: '🏗️',
    target: 'Builders, architects & trades',
    phone: [
      '[Opener] "Hi [name], it\u2019s [your name] from 9amLeads. I\u2019m calling builders/trades in [area] \u2014 do you have two minutes, or is now a bad time?"',
      '[Qualify] "How\u2019s the order book looking? Do you mainly do extensions, conversions, or new builds?"',
      '[Pitch \u2014 1-week free trial] "Every morning at 9am we send builders newly submitted planning applications \u2014 homeowners in their postcode areas who\u2019ve just applied for an extension or conversion and are ready to spend. Contacting them while it\u2019s being decided means you quote before another builder. Free 1-week trial, no card \u2014 set it up in 30 seconds."',
      '[Objection \u2014 \u201cWe work on referrals\u201d] "This adds to referrals \u2014 it\u2019s a daily stream of local homeowners who are actively planning a build. Try the free week and see the pipeline it adds."',
      '[Objection \u2014 \u201cHow much?\u201d] "Free for the first week, then from £25 a week \u2014 one extension job covers it for months."',
      '[Close] "What email should I use for the login? First planning leads at 9am tomorrow."'
    ],
    emails: [
      { subject: 'Local planning leads \u2014 free 1-week trial', body: 'Hi [name],\n\nI\u2019m with 9amLeads. Every morning at 9am we send builders newly submitted planning applications in their chosen postcode areas \u2014 homeowners who\u2019ve just applied for an extension, loft conversion or new build.\n\nA planning application is a homeowner ready to spend. Contact them while it\u2019s being decided and you quote before the competition.\n\nFree for 1 week, no card:\n\n\u2192 https://9amleads.com/portal/#signup\n\nWant me to set up your free week?' },
      { subject: 'Your free week of planning leads', body: 'Hi [name],\n\nQuick follow-up on the free 1-week trial of daily planning leads for [area]. 30 seconds to start, first batch at 9am tomorrow:\n\n\u2192 https://9amleads.com/portal/#signup\n\nNo card, cancel anytime. One extension job covers it for months.' }
    ],
    sms: [
      'Hi [name] \u2014 9amLeads here. We send builders newly submitted planning applications every morning (your postcode areas). Free 1-week trial, no card: https://9amleads.com/portal/#signup',
      'Your free week of daily planning leads is ready, [name]: https://9amleads.com/portal/#signup. Applications = homeowners ready to spend. Any questions, just reply.'
    ],
    social: [
      'A planning application means a homeowner is ready to spend. 🏗️ We deliver newly submitted applications every morning \u2014 free 1-week trial: https://9amleads.com/portal/#signup #planningleads #builders',
      'Quote before the other builders: daily planning leads for your postcodes. Try it free \u2192 https://9amleads.com/portal/#signup #extensions #construction',
      'Your next extension job is on the planning portal right now. Get it delivered at 9am daily \u2192 https://9amleads.com/portal/#signup #tradesmen'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script \u2014 start the free trial.' },
      { day: 'Day 1', action: 'Email #1 or first SMS if no trial. Confirm 9am batch if trialed.' },
      { day: 'Day 3', action: 'Follow up with email #2 or second SMS.' },
      { day: 'Day 7', action: 'Call: how many quotes have they sent from planning leads?' },
      { day: 'Day 14', action: 'Final check \u2014 keep the pipeline going?' }
    ]
  },
  {
    key: 'tenders', name: 'Tender Opportunities', emoji: '📋',
    target: 'Cleaning, IT, construction & FM firms',
    phone: [
      '[Opener] "Hi [name], it\u2019s [your name] from 9amLeads. I\u2019m calling companies in [sector] that work with public sector clients \u2014 have you got two minutes?"',
      '[Qualify] "Do you currently bid for public sector or council work, or is that something you\u2019d like to grow?"',
      '[Pitch \u2014 1-week free trial] "Every morning at 9am we send firms public sector tender opportunities matched to their sector and region \u2014 cleaning, IT, construction, whatever they do. One won contract usually covers years of leads. Free 1-week trial, no card \u2014 30 seconds to set up."',
      '[Objection \u2014 \u201cBidding is too hard\u201d] "It gets easier with practice, and these are matched to your sector. Start with the free week \u2014 you\u2019ll see the opportunities that are out there."',
      '[Objection \u2014 \u201cHow much?\u201d] "Free for the first week, then from £25 a week \u2014 a fraction of one public sector contract."',
      '[Close] "Best email for the login? Your first matched tenders will be there tomorrow."'
    ],
    emails: [
      { subject: 'Public sector tenders matched to [sector] \u2014 free week', body: 'Hi [name],\n\nI\u2019m with 9amLeads. Every morning at 9am we send firms public sector tender opportunities matched to their sector and region \u2014 from Contracts Finder and the other official platforms.\n\nPublic buyers pay reliably and often prefer small, local suppliers. One won contract usually covers years of the subscription.\n\nFree for 1 week, no card:\n\n\u2192 https://9amleads.com/portal/#signup\n\nSet up your free week?' },
      { subject: 'Your free week of matched tenders', body: 'Hi [name],\n\nQuick follow-up on the free 1-week trial of daily tender opportunities for [sector]. 30 seconds to start:\n\n\u2192 https://9amleads.com/portal/#signup\n\nNo card, cancel anytime. Worth a week to see what\u2019s out there.' }
    ],
    sms: [
      'Hi [name] \u2014 9amLeads here. We send public sector tenders matched to your sector every morning. Free 1-week trial, no card: https://9amleads.com/portal/#signup',
      'Your free week of matched tenders is ready, [name]: https://9amleads.com/portal/#signup. One contract can cover years. Reply with questions.'
    ],
    social: [
      'Public sector buyers pay reliably and prefer local SMEs. 📋 Get tenders matched to your sector delivered daily \u2014 free week: https://9amleads.com/portal/#signup #tenders #sme',
      'The opportunities are out there \u2014 most firms just never see them. Daily matched tenders \u2192 https://9amleads.com/portal/#signup #publicsector #cleaning #it',
      'Win your first public sector contract with tenders you actually fit. Free 1-week trial: https://9amleads.com/portal/#signup #bids'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script \u2014 start the free trial.' },
      { day: 'Day 1', action: 'Email #1 or first SMS if no trial. Confirm batch if trialed.' },
      { day: 'Day 3', action: 'Follow up with email #2 or second SMS.' },
      { day: 'Day 7', action: 'Call: which opportunities did they see that fit their business?' },
      { day: 'Day 14', action: 'Final check \u2014 keep the tender feed going?' }
    ]
  },
  {
    key: 'general', name: 'Any Business / General', emoji: '📈',
    target: 'Anyone who needs more customers',
    phone: [
      '[Opener] "Hi [name], it\u2019s [your name] from 9amLeads. I\u2019m calling businesses in [area] that want more customers \u2014 do you have two minutes?"',
      '[Qualify] "What does your business do, and where does most of your work come from at the moment?"',
      '[Pitch \u2014 1-week free trial] "9amLeads sends fresh business leads every morning \u2014 moving, probate, new business, planning or tenders, matched to your trade and area. Every lead type has a free 1-week trial, no card. I can set you up in 30 seconds."',
      '[Objection \u2014 \u201cWhat type of leads do I get?\u201d] "You pick the type that fits how you win work \u2014 e.g. moving leads for removals, planning leads for builders, tenders for cleaning/IT. We\u2019ll match it to your business."',
      '[Objection \u2014 \u201cHow much?\u201d] "Free for the first week, then from £25 a week. One extra customer usually covers it."',
      '[Close] "What email should I use? I\u2019ll match your lead type and have it ready at 9am tomorrow."'
    ],
    emails: [
      { subject: 'Fresh leads for [business] \u2014 free 1-week trial', body: 'Hi [name],\n\nI\u2019m with 9amLeads. We deliver fresh business leads every morning at 9am \u2014 moving, probate, new business, planning or tenders \u2014 matched to your trade and chosen postcode areas.\n\nYou\u2019re not paying per lead, and there\u2019s a free 1-week trial with no card:\n\n\u2192 https://9amleads.com/portal/#signup\n\nWant me to match the right lead type for your business?' },
      { subject: 'Your free week of leads is ready', body: 'Hi [name],\n\nQuick follow-up on the free 1-week trial of daily business leads. 30 seconds to start, first batch at 9am tomorrow:\n\n\u2192 https://9amleads.com/portal/#signup\n\nNo card, cancel anytime. One extra customer usually covers it.' }
    ],
    sms: [
      'Hi [name] \u2014 9amLeads here. Fresh business leads delivered every morning, matched to your trade and area. Free 1-week trial, no card: https://9amleads.com/portal/#signup',
      'Your free week of daily leads is ready, [name]: https://9amleads.com/portal/#signup. We\u2019ll match the right lead type for you. Reply with questions.'
    ],
    social: [
      'Fresh business leads, delivered every morning at 9am. 📈 Moving, probate, planning, new business or tenders \u2014 matched to your trade. Free week: https://9amleads.com/portal/#signup #businessleads',
      'Stop paying per lead. Get your own daily allocation instead \u2014 free 1-week trial: https://9amleads.com/portal/#signup #leads #growth',
      'Your competitors get their leads at 9am. Get yours too \u2014 https://9amleads.com/portal/#signup #smallbusiness #ukbusiness'
    ],
    followup: [
      { day: 'Day 0', action: 'Call using the script \u2014 match their lead type and start the free trial.' },
      { day: 'Day 1', action: 'Email #1 or first SMS if no trial. Confirm 9am batch if trialed.' },
      { day: 'Day 3', action: 'Follow up with email #2 or second SMS.' },
      { day: 'Day 7', action: 'Call: how did the first week of leads look?' },
      { day: 'Day 14', action: 'Final check \u2014 keep the leads going?' }
    ]
  }
];
