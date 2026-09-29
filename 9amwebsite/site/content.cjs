// Public-facing copy and allowances, shared by the static pages and their controls.
// Matches the current /pricing/ offer. Billing remains owned by the existing API.
const products = [
  {
    id: 'moving', slug: 'movingleadsdaily', name: 'Moving leads', short: 'Moving',
    colour: '#c65324', tint: '#fff1e9', icon: 'truck', art: 'moving',
    headline: 'Be part of their next move.',
    intro: 'Find newly listed properties in the areas you work. Introduce your removal, storage or clearance business earlier in the moving journey.',
    description: 'New property listings. Your next moving opportunity.',
    audience: ['Removal companies', 'Man & van', 'House clearance', 'Storage & packing'],
    source: 'Public property listings', signal: 'A property has been newly listed for sale. It is a moving signal, rather than a request for a quote or a confirmed moving date.',
    fields: ['Property address and postcode', 'Listing information and property details', 'Source link and date identified', 'Opportunity score and follow-up tools'],
    allowances: [5, 10, 15], qualifier: '', trial: 5,
    sample: { title: 'A new chapter in Manchester', type: 'New property listing', area: 'Manchester · M20', detail: 'Three-bedroom semi-detached property', source: 'Property listing', next: 'Introduce your removals service with a local moving checklist.' },
    benefits: [['Start the conversation earlier', 'Introduce your services while a household is considering its next move.'], ['Focus on your working area', 'Choose the postcode areas that make sense for your team and vehicles.'], ['Make your next step simple', 'Review the source, save a note and send a branded introduction.']],
    faq: ['Is this a confirmed moving date?', 'No. A new listing indicates a potential move. Review the property signal and make a helpful introduction; the timing and eventual service needs will vary.']
  },
  {
    id: 'probate', slug: 'probateleads', name: 'Probate leads', short: 'Probate',
    colour: '#7950b1', tint: '#f4edfc', icon: 'file', art: 'probate',
    headline: 'New estate opportunities. A considered approach.',
    intro: 'Receive newly published probate grants in your selected areas. Review the record and identify where your legal, property or estate services may be useful.',
    description: 'Published probate grants, organised for your practice.',
    audience: ['Estate administration', 'Solicitors', 'Estate agents', 'House clearance'],
    source: 'Public probate records', signal: 'A published grant can indicate estate administration, valuation, property or clearance work. A professional may already be appointed.',
    fields: ['Name and address recorded on the grant', 'Executor information where published', 'Grant date, county and source', 'Notes and follow-up tools'],
    allowances: [1, 3, 5], qualifier: '', trial: 1,
    sample: { title: 'An estate record in Essex', type: 'Published probate grant', area: 'Essex', detail: 'Grant record with published executor information', source: 'Probate register', next: 'Review the record and assess whether your services are relevant.' },
    benefits: [['Less time checking registers', 'Bring new records into a consistent morning review.'], ['Understand the opportunity', 'Read the published details and source before deciding whether to make contact.'], ['Follow up thoughtfully', 'Use clear, respectful correspondence tailored to your professional service.']],
    faq: ['Are probate records exclusive?', 'No. Probate grants are public records and other firms or subscribers may see the same record. The service helps you find, organise and act on relevant information.']
  },
  {
    id: 'newbusiness', slug: 'newbusinessalert', name: 'New business leads', short: 'New business',
    colour: '#087d93', tint: '#e7f7fa', icon: 'building', art: 'business',
    headline: 'Meet the businesses just getting started.',
    intro: 'Discover newly incorporated companies in your target industries and areas. Find relevant prospects for your accounting, web, marketing or business services.',
    description: 'New company registrations. New conversations to start.',
    audience: ['Accountants', 'Web & marketing', 'IT services', 'Insurance & recruitment'],
    source: 'Companies House', signal: 'A company has recently incorporated. Use its industry and location to judge the fit; incorporation does not mean it is actively looking for every service.',
    fields: ['Company name and registration details', 'Registered address and industry codes', 'Director names where published', 'Incorporation date and source link'],
    allowances: [5, 10, 15], qualifier: '', trial: 5,
    sample: { title: 'North & Field Studio Ltd', type: 'New company registration', area: 'Leeds · LS1', detail: 'Design services · newly incorporated', source: 'Companies House', next: 'Make a relevant introduction to your business support services.' },
    benefits: [['Find a better fit', 'Use industry information to focus on companies your services can help.'], ['A repeatable morning routine', 'Review new registrations without manually searching the register.'], ['Keep the conversation organised', 'Save your notes, export your opportunities and track your follow-ups.']],
    faq: ['Does every record include a phone number or email?', 'No. Published company records typically include company details, a registered address and director names. Additional contact information is only available where supplied; review the fields in each opportunity.']
  },
  {
    id: 'planning', slug: 'planningleads', name: 'Planning leads', short: 'Planning',
    colour: '#14765a', tint: '#e9f7ef', icon: 'ruler', art: 'planning',
    headline: 'Find the projects taking shape near you.',
    intro: 'Discover planning applications relevant to your trade and working area. See what is proposed, check the source and decide which projects deserve a closer look.',
    description: 'Local planning applications, ready for your review.',
    audience: ['Builders', 'Roofers', 'Architects & surveyors', 'Landscapers'],
    source: 'Public planning portals', signal: 'A planning application describes proposed work. Applications can change, be refused or be withdrawn, so always check the current status and suitability.',
    fields: ['Project address and council', 'Application description and reference', 'Published status and source link', 'Relevant project details where available'],
    allowances: [1, 3, 5], qualifier: 'Up to ', trial: 1,
    sample: { title: 'A little more room to grow', type: 'Planning application', area: 'Bristol · BS9', detail: 'Proposed single-storey rear extension', source: 'Council planning portal', next: 'Review the application and identify the work that suits your trade.' },
    benefits: [['See the project behind the lead', 'Understand the proposed work before spending time on outreach.'], ['Keep your work local', 'Choose relevant areas and project types for your team.'], ['Build a longer-term pipeline', 'Track promising applications and follow up as projects progress.']],
    faq: ['Are these approved projects?', 'Not necessarily. A planning lead may concern a submitted application. Check the source and current status; permission does not guarantee that work will go ahead.']
  },
  {
    id: 'tenders', slug: 'tenders', name: 'Public tenders', short: 'Tenders',
    colour: '#515ac3', tint: '#eef0ff', icon: 'clipboard', art: 'tenders',
    headline: 'Your next contract could be out there.',
    intro: 'Bring relevant public-sector tender notices into your morning routine. Review the buyer, scope and deadline, then decide where to invest your bidding time.',
    description: 'Public-sector opportunities matched to your business.',
    audience: ['Construction', 'IT & digital', 'Cleaning & facilities', 'Care & transport'],
    source: 'Public procurement notices', signal: 'A buyer has published a contract opportunity. Check eligibility, scope and submission requirements before preparing a response.',
    fields: ['Buyer and contract description', 'Published value where available', 'Submission deadline and location', 'Notice link and bid information'],
    allowances: [1, 3, 5], qualifier: 'Up to ', trial: 1,
    sample: { title: 'A contract worth a closer look', type: 'Public tender notice', area: 'West Midlands', detail: 'Facilities maintenance · submission deadline included', source: 'Public procurement notice', next: 'Check eligibility and the complete specification before bidding.' },
    benefits: [['Spend less time searching', 'Bring matching notices from public sources into one routine.'], ['Prioritise your bidding effort', 'Check the scope, location and deadline before making a decision.'], ['Stay organised', 'Keep source links, notes and next actions with each opportunity.']],
    faq: ['Does early delivery guarantee a contract?', 'No. Public contracts are awarded through the buyer’s procurement process. Delivery helps you discover and assess notices; success depends on suitability and your response.']
  }
];

const plans = [
  { id: 'starter', name: 'Starter', price: 25, description: 'Build your morning routine.', features: ['Selected local areas', '9am working-day delivery', 'Source links and opportunity details', 'Outreach templates', 'Lead management'] },
  { id: 'pro', name: 'Pro', price: 49, description: 'Make room for more opportunity.', features: ['Expanded area targeting', '9am working-day delivery', 'Source links and opportunity details', 'Exports and priority support', 'Access to bulk packs'] },
  { id: 'enterprise', name: 'Enterprise', price: 99, description: 'Support a wider-reaching team.', features: ['UK-wide area selection', '9am working-day delivery', 'Source links and opportunity details', 'CRM-ready exports', 'Access to bulk packs'] }
];

const faqs = [
  ['What exactly is an opportunity?', 'An opportunity is a relevant signal from a public source, such as a property listing, company registration, planning application, probate grant or tender notice. It is not a customer who has asked you for a quote. You review the details and choose how to follow up.'],
  ['When will I receive my first delivery?', 'Complete your account setup and choose your target areas. Your first scheduled delivery is at 9am UK time on the next working day. Deliveries run Monday to Friday.'],
  ['How does the free trial work?', 'Start with a 7-day trial, with no card required. Your trial allocation depends on your selected lead type. You can choose a paid weekly plan when you are ready to continue.'],
  ['What happens if my area is quiet?', 'Availability depends on public data activity. We prioritise recent matching opportunities; when exact-area supply is limited, the latest suitable opportunities in nearby areas may be used. Review each record’s date and location before taking action.'],
  ['Are the opportunities exclusive?', 'These opportunities are sourced from public records and listings, which other businesses can also find. Your account receives its own daily allocation. Sharing rules can differ by lead type; probate records may be supplied to other subscribers.'],
  ['Is Print & Post included in my subscription?', 'Print & Post is optional and charged separately. Choose your letter or leaflet, review the price and approve your mailing in the dashboard. Auto Send lets you configure future mailings with a spend limit.']
];

module.exports = { products, plans, faqs };

// ---- Editorial depth: pain points, platform depth and per-product guidance.
const painPoints = [
  ['search', 'The online market is crowded', 'Your competitors are fighting for the same inbox, the same advert and the same cold-call list. Standing out online gets harder every year.'],
  ['user', 'Cold calling puts people off', 'Nobody answers an unknown number. An interruption has to be handled there and then; a letter can wait until they are ready.'],
  ['clock', 'Digital messages get skipped', 'Emails are deleted and notifications are swiped past in a second. A moment of real attention is hard to win.'],
  ['mail', 'A letter is kept, not scrolled', 'Something physical sits on the side, gets passed to a partner and is acted on when the time is right for them.']
];
const platformFeatures = [
  ['clock', 'Opportunity scoring', 'Each record is scored by freshness and value, so you can decide what to look at first rather than guessing.'],
  ['link', 'CRM & webhook sync', 'Send your daily opportunities into HubSpot, Salesforce, Pipedrive or your own system automatically.'],
  ['mail', '9am email delivery', 'A formatted morning delivery with the details, the source and a clear next action. No login required.'],
  ['pin', 'Postcode & county targeting', 'Choose the areas you cover and change them whenever your work takes you somewhere new.'],
  ['spark', 'Outreach templates', 'Ready-to-use messages, letters and leaflets help you know what to say and how to say it.'],
  ['grid', 'Lead timeline & history', 'A searchable record of every opportunity you have received, with notes and status attached.'],
  ['chart', 'Performance dashboard', 'Track opportunities received, contacted, quoted and won, by lead type and by area.'],
  ['file', 'CSV & Excel exports', 'Download clean, structured data for your team, your CRM or offline follow-up.'],
  ['clock', 'Follow-up reminders', 'Mark an opportunity for follow-up and keep your next actions in one place.'],
  ['search', 'Saved searches & filters', 'Filter by area, value or sector so your preferences are applied to every delivery.'],
  ['check', 'Your own daily allocation', 'A subscription data feed, not a marketplace. You receive your own allocation of fresh records.'],
  ['mail', 'Print & Post', 'Turn any opportunity into a letter or leaflet and track every mailing from your dashboard.']
];
const differentiators = [
  ['link', 'See the source of each lead', 'Every opportunity shows where it originated, so you are never handed an unexplained list.'],
  ['shield', 'Verify it for yourself', 'Open the source and check the record is real and current before you spend a penny.'],
  ['clock', 'Fresh opportunities daily', 'New records land every working day, not a stale list bought months ago.'],
  ['mail', 'Track every Print & Post lead', 'See each mailing you send and its available status from your own dashboard.'],
  ['check', 'See who you have already mailed', 'Avoid double-posting the same address and wasting your marketing budget.'],
  ['grid', 'One dashboard', 'No spreadsheets and scattered notes. Manage notes, status and follow-ups in one place.']
];
const sources = [
  ['pin', 'Property listing portals', 'Newly listed homes in your chosen areas'],
  ['building', 'Companies House', 'New company registrations'],
  ['ruler', 'Planning portals', 'Applications from 350+ UK councils'],
  ['file', 'Probate register', 'Newly published grants'],
  ['clipboard', 'Public procurement', 'Notices from data.gov.uk and Contracts Finder'],
  ['map', 'Your chosen coverage', 'Postcode areas and counties you work in']
];
const integrations = ['HubSpot', 'Salesforce', 'Pipedrive', 'Zoho CRM', 'Removals Manager', 'Tradify', 'Clio / LEAP', 'Xero / QuickBooks', 'Zapier & Make', 'CSV / Excel', 'Email delivery', 'Custom webhooks'];
const reasonsToTry = [
  ['gift', 'Try before you commit', 'Most lead platforms will not let you try before you buy. Start with a full week of fresh records, with no card.'],
  ['shield', 'No long-term contract', 'Plans are billed weekly and you can cancel from your account, so the decision stays yours.'],
  ['shield', 'GDPR & official sources', 'Opportunities come from public records and listings, with the source shown on every record.']
];
const productDetails = {
  moving: {
    pain: [
      ['search', 'Waiting for quote requests is expensive', 'By the time a homeowner requests quotes, several removal firms are already comparing prices with them.'],
      ['clock', 'Moving decisions happen quickly', 'A household moving soon compares options over a few days, so the first credible introduction matters.'],
      ['user', 'Cold calls rarely land', 'A call can go to voicemail. A letter or leaflet can sit on the side until the decision is made.'],
      ['pin', 'Distance wastes time', 'Records outside your working radius cost fuel and hours before you even quote.']
    ],
    why: [
      ['clock', 'Introduce yourself earlier', 'New listings land in your morning delivery, so you can make contact before quotes are compared.'],
      ['pin', 'A real address in your area', 'Every record is a property in your chosen postcodes, so your team can actually reach it.'],
      ['chart', 'One move leads to more', 'A single booking can lead to packing, storage, furniture assembly and future referrals.'],
      ['mail', 'Reach the doormat', 'When a call goes unanswered, a branded letter keeps your name in the home.']
    ],
    tactics: [
      ['clock', 'Follow up while it is fresh', 'Use the drafted message and follow up promptly, before competing quotes are in.'],
      ['clipboard', 'Quote a clear plan', 'A fixed date, clear price and named crew feel safer than the cheapest number.'],
      ['mail', 'Add a letter to the call', 'One call can go to voicemail; a letter can stay on the kitchen table.'],
      ['user', 'Offer local proof', 'Mention nearby moves you have completed to build instant trust.']
    ]
  },
  probate: {
    pain: [
      ['search', 'Firms wait for referrals', 'Many practices rely on word of mouth and reach new estates long after the family has chosen.'],
      ['clock', 'Timing matters', 'A grant is published once, and the executor often decides who to appoint within the first days.'],
      ['user', 'Sensitivity is essential', 'A grieving family ignores a generic sales approach and responds to a respectful, human one.'],
      ['file', 'Manual register checks take time', 'Searching the register by hand across several counties is slow and easy to miss.']
    ],
    why: [
      ['user', 'The executor must act', 'A published grant means the estate must be administered, and executors are actively looking for help.'],
      ['chart', 'Long-tail value', 'Estate work can include legal, property, tax, valuation and clearance work over many months.'],
      ['search', 'Quiet competition', 'Fewer firms actively follow new grants, so a timely introduction stands out.'],
      ['file', 'One estate, several instructions', 'Administration can open the property sale, the clearance and other matters in time.']
    ],
    tactics: [
      ['clock', 'Contact thoughtfully and promptly', 'A respectful introduction in the first days after publication works best.'],
      ['clipboard', 'Offer a defined first step', 'A clear, fixed-fee first meeting reassures a family worried about open-ended fees.'],
      ['file', 'Ask about the wider estate', 'The property, accounts and clearance can each become further work.'],
      ['clock', 'Keep in touch', 'Administration takes months; regular, useful contact keeps you front of mind.']
    ]
  },
  newbusiness: {
    pain: [
      ['clock', 'New businesses are hard to spot early', 'By the time a new company appears in a directory, other suppliers have already made contact.'],
      ['search', 'Generic lists waste time', 'Unfiltered lists include businesses that will never need your service.'],
      ['user', 'Good timing is rare', 'A brand-new company is making decisions about accounts, insurance, IT and marketing right now.'],
      ['pin', 'Location still matters', 'A local introduction lands better than a national mailshot.']
    ],
    why: [
      ['clock', 'Reach them while they are deciding', 'New registrations arrive in your morning delivery, close to the moment decisions are made.'],
      ['search', 'Filter by industry', 'Use the SIC code and location to focus on companies your service actually fits.'],
      ['pin', 'Keep it local', 'Choose the areas where you can meet, deliver or support in person.'],
      ['chart', 'Build a repeatable routine', 'A daily list of new companies turns prospecting into a simple habit.']
    ],
    tactics: [
      ['user', 'Lead with a specific benefit', 'Explain the one thing you do for businesses like theirs and why it matters now.'],
      ['clipboard', 'Offer a simple first step', 'A short, no-obligation consultation converts better than a hard pitch.'],
      ['chart', 'Track your best-fit sectors', 'Notice which industries respond and refine your filters over time.'],
      ['mail', 'Add a letter for reach', 'Some owners ignore email but read a well-written letter.']
    ]
  },
  planning: {
    pain: [
      ['clock', 'Projects move before you know it', 'By the time work is advertised, the homeowner may already have a builder.'],
      ['search', 'Applications are scattered', 'Checking many council portals by hand is slow and inconsistent.'],
      ['pin', 'Not every project is nearby', 'Work outside your area wastes travel and quote time.'],
      ['user', 'Fit matters', 'An extension is not the same job as a loft conversion or a new build.']
    ],
    why: [
      ['clock', 'See projects as they are proposed', 'Applications arrive in your morning delivery, earlier in the project journey.'],
      ['ruler', 'Match the work to your trade', 'Review the proposed work and decide whether it suits your skills.'],
      ['pin', 'Stay local', 'Choose the areas and councils where you want to work.'],
      ['chart', 'Build a longer pipeline', 'Track promising projects and follow up as they progress.']
    ],
    tactics: [
      ['clipboard', 'Read the application first', 'Understand the scope before you make contact.'],
      ['user', 'Approach the right person', 'Reach the applicant or their agent with a relevant, specific offer.'],
      ['clock', 'Time your follow-up', 'Check the current status and follow up as the project moves forward.'],
      ['mail', 'Introduce your trade', 'A short letter can explain exactly what you do and what you have done locally.']
    ]
  },
  tenders: {
    pain: [
      ['clock', 'Deadlines are easy to miss', 'Public notices are spread across portals and change quickly.'],
      ['search', 'Many notices are irrelevant', 'Sifting through contracts you cannot deliver wastes bidding time.'],
      ['file', 'Bid preparation is a real cost', 'Preparing a response takes people and hours, so it should be worth it.'],
      ['user', 'Eligibility is not always obvious', 'Turnover, insurance and accreditation requirements decide whether a notice is worth pursuing.']
    ],
    why: [
      ['clock', 'See notices earlier', 'Relevant tenders arrive in your morning delivery, leaving more time to prepare.'],
      ['clipboard', 'Review the detail first', 'Check the buyer, value, location and deadline before investing time.'],
      ['pin', 'Focus your effort', 'Filter by area and sector so you spend time on contracts you can win.'],
      ['chart', 'A steadier pipeline', 'A consistent routine helps you spot public-sector work as it appears.']
    ],
    tactics: [
      ['clipboard', 'Check eligibility early', 'Confirm the requirements before committing to a full response.'],
      ['file', 'Prepare a reusable pack', 'Keep company policies, references and case studies ready to adapt.'],
      ['clock', 'Work back from the deadline', 'Plan the clarification, drafting and approval time you will need.'],
      ['user', 'Ask the buyer', 'Use the clarification window to confirm anything the notice leaves unclear.']
    ]
  }
};
module.exports.painPoints = painPoints;
module.exports.platformFeatures = platformFeatures;
module.exports.differentiators = differentiators;
module.exports.sources = sources;
module.exports.integrations = integrations;
module.exports.reasonsToTry = reasonsToTry;
module.exports.productDetails = productDetails;
