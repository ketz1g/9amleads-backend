// buyer_taxonomy.js — source of truth for per-business-type cold outreach.
// One entry per business subtype a product is sold to. Each carries tailored
// industry copy used by build_buyer_emails.js to emit one HTML email per subtype.
const path = require('path');

const P = {
  moving:     { url: 'https://www.9amleads.com/movingleadsdaily/',   link: 'movingleadsdaily', color: '#0369a1', label: 'Moving Leads',  testimonial: 'Moving company, Manchester' },
  probate:    { url: 'https://www.9amleads.com/probateleads/',      link: 'probateleads', color: '#7c3aed', label: 'Probate Leads', testimonial: 'Estate planning company, Birmingham' },
  newbusiness:{ url: 'https://www.9amleads.com/newbusinessalert/',  link: 'newbusinessalert', color: '#0891b2', label: 'New Business Alerts', testimonial: 'Accountancy practice, Leeds' },
  planning:   { url: 'https://www.9amleads.com/planningleads/',     link: 'planningleads', color: '#059669', label: 'Planning Permission Leads', testimonial: 'Building company, Bristol' },
  tenders:    { url: 'https://www.9amleads.com/tenders/',           link: 'tenders', color: '#4f46e5', label: 'Public Sector Tenders', testimonial: 'B2B consultancy, UK-wide' }
};

// Each subtype: pains (Sound familiar? bullets), hook (benefit sentence),
// how (the fix line), feats (What you get bullets), ctaUrl
const SUBTYPES = {
  // ============ MOVING ============
  'moving-removal': {
    plural: 'removal companies',    product:'moving', slug:'removals', label:'Removal company', singular:'removal company',
    pains:[
      'Quotes going to whoever finds out about the move first - often not you',
      'Relying on the phone to ring or comparison sites where you fight 3-5 firms on price',
      'Quiet weeks with vans and crew sitting idle'
    ],
    hook:'Fresh moves in your chosen postcode areas, every weekday at 9am - so you can be first to quote and win.',
    how:'We spot people preparing to move in the areas you cover, with the full address, and email them to you before most firms even know. Your own allocation - not sold to three rivals at once.',
    feats:[
      'Your own allocation of fresh moves each morning at 9am - not shared with 3-5 firms',
      'Full address on every lead, so you can quote properly',
      'Replace any wrong or out-of-area lead instantly',
      'Print &amp; Post your flyer from \u00a31.49 while they compare firms',
      'Bulk packs to fill quiet weeks'
    ]
  },
  'moving-manvan': {
    plural: 'man &amp; van operators',    product:'moving', slug:'removals', alts:['moving-services'], label:'Man &amp; van', singular:'man and van operator',
    pains:[
      'Finding out about a local move after the customer has already booked someone',
      'Quiet spells between jobs with no idea where the next one is coming from',
      'No budget for the big lead sites'
    ],
    hook:'Local moves in your area delivered at 9am - full address, so you can quote before the job goes to someone else.',
    how:'We email you people preparing to move in the postcode areas you choose. The full address comes with each lead, so you can price it and call first.',
    feats:[
      'Fresh local moves at 9am every weekday',
      'The postcode areas you actually work',
      'Full address with each lead',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'moving-storage': {
    plural: 'storage companies',    product:'moving', slug:'self-storage', label:'Storage company', singular:'storage company',
    pains:[
      'Only hearing about a move when the removal is already booked and storage is an afterthought',
      'Customers choosing the storage firm the mover recommends',
      'Empty units that cost you money every month'
    ],
    hook:'Moves and relocations that may need storage - flagged early, before the removal company picks their own storage partner.',
    how:'We find people and businesses about to move in your area, so you can offer storage before the van is even booked. Contact them first, fill your units.',
    feats:[
      'Moves &amp; relocations near your sites, delivered at 9am',
      'The address on every lead',
      'Print &amp; Post letters from \u00a31.49',
      'Bulk packs to fill empty units',
      '7 days free - no card'
    ]
  },
  'moving-clearance': {
    plural: 'house clearance firms',    product:'moving', slug:'house-clearance', label:'House clearance', singular:'house clearance firm',
    pains:[
      'Clearance work arriving in fits and starts - never a steady pipeline',
      'Missing clearances because you only hear about them too late',
      'Wasting time on jobs miles out of your area'
    ],
    hook:'House clearances and probate clearances in your area, with the address - so you can scope and quote first.',
    how:'We flag homes being cleared and probate clearances near you. Full address included, so you know it is a real job in your patch before you pick up the phone.',
    feats:[
      'Clearance opportunities in your chosen areas',
      'Address so you can quote on the spot',
      'Probate clearances flagged too',
      'Print &amp; Post flyers from \u00a31.49',
      '7 days free - no card'
    ]
  },
  'moving-estateagent': {
    plural: 'estate agents',    product:'moving', slug:'estate-agents', label:'Estate agent', singular:'estate agent',
    pains:[
      'Finding out a seller has already chosen another agent',
      'Valuations going to whoever spots the move first',
      'No way to know who is thinking of selling until the board goes up'
    ],
    hook:'People preparing to move in your patch, flagged early - so you can ask for the instruction before a competitor does.',
    how:'We watch for homeowners about to move in the areas you cover and email you each morning. Approach them for the valuation while it is still yours to win.',
    feats:[
      'Potential sellers in your area, daily at 9am',
      'The address on every lead',
      'Print &amp; Post letters to win instructions',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'moving-packers': {
    plural: 'packing &amp; relocation services',    product:'moving', slug:'removals', alts:['moving-services'], label:'Packing &amp; relocation', singular:'packing and relocation service',
    pains:[
      'Customers never think to book packing until the removal is already arranged',
      'Work that comes only through referrals, so it dries up without warning',
      'No easy way to reach people at the moment they are moving'
    ],
    hook:'Home and office moves that need packing services - delivered before the customer has booked the removal.',
    how:'We find people and businesses preparing to move in your areas, so you can offer packing and relocation services while the move is still being planned.',
    feats:[
      'Moves needing packing, every weekday at 9am',
      'Full address with each lead',
      'Print &amp; Post your brochure from \u00a31.49',
      'Your chosen postcode areas',
      '7 days free - no card'
    ]
  },
  'moving-skipwaste': {
    plural: 'skip &amp; waste companies',    product:'moving', slug:'waste-management', alts:['skip-hire'], label:'Skip &amp; waste company', singular:'skip and waste company',
    pains:[
      'Skips ordered from whoever the builder or mover happens to call first',
      'Jobs coming in bursts with quiet weeks in between',
      'Hearing about clearance or refurb jobs only when they are done'
    ],
    hook:'The moves, clearances and refurbishments in your area that need a skip - flagged before the order goes elsewhere.',
    how:'We find the jobs near you that generate skip and waste work - clearances, house moves, renovations - and email them to you each morning with the address.',
    feats:[
      'Skip-ready jobs in your chosen areas',
      'Full address to check access first',
      'Print &amp; Post flyers from \u00a31.49',
      'Bulk packs for quiet months',
      '7 days free - no card'
    ]
  },

  // ============ PROBATE ============
  'probate-solicitor': {
    plural: 'solicitors',    product:'probate', slug:'solicitors', label:'Solicitor', singular:'solicitor',
    pains:[
      'Another firm has contacted the executor by the time you hear about the grant',
      'Hours lost manually checking where new grants have been published',
      'Competitors in your area getting instructions first'
    ],
    hook:'Fresh probate grants for your chosen areas, delivered at 9am - so you can make a considered approach before other firms.',
    how:'We track newly issued grants and email you the details with the property address. See at a glance if it is in your patch and act in the critical first days.',
    feats:[
      'Grants with the property address &amp; source link',
      'Your chosen areas only',
      'Print &amp; Post a letter for you from \u00a31.49',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'probate-estateagent': {
    plural: 'estate agents',    product:'probate', slug:'estate-agents', label:'Estate agent (probate)', singular:'estate agent',
    pains:[
      'Probate valuations going to agents who spot the grant first',
      'Missing instructions because the family has already chosen someone',
      'No pipeline of probate property to build on'
    ],
    hook:'Recent grants with the property address - so you can offer a probate valuation before a rival agent does.',
    how:'We deliver probate grants in your areas each morning. Contact the executor early with a helpful valuation approach and win the instruction.',
    feats:[
      'Grants in your area with the address',
      'First to approach the executor',
      'Print &amp; Post letters from \u00a31.49',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'probate-funeraldirector': {
    plural: 'funeral directors',    product:'probate', slug:'funeral-directors', label:'Funeral director', singular:'funeral director',
    pains:[
      'Families have often chosen a funeral director before anyone helpful reaches them',
      'Enquiries that are impossible to predict week to week',
      'Competition from national chains with bigger marketing'
    ],
    hook:'Probate grants in your area - so you can be a supportive local contact at the right time, without cold calling.',
    how:'We flag new grants near you so you can make a thoughtful, timely approach to families - the kind of care that builds trust and reputation.',
    feats:[
      'Grants in your area, weekday mornings',
      'The address so you can check suitability',
      'Print &amp; Post a respectful letter from \u00a31.49',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'probate-financial': {
    plural: 'financial advisers',    product:'probate', slug:'independent-financial-advisers', label:'Financial adviser', singular:'financial adviser',
    pains:[
      'IHT and estate-planning conversations happening after it is too late to help',
      'Relying on referrals that dry up without warning',
      'No reliable way to know who needs inheritance planning now'
    ],
    hook:'Probate grants in your areas - so you can offer inheritance and estate planning at the moment it matters.',
    how:'We find new grants near you each morning. Approach families with genuinely useful IHT and estate advice early, while they are making decisions.',
    feats:[
      'Grants near you with property details',
      'Be the helpful expert early',
      'Print &amp; Post intro letters from \u00a31.49',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'probate-willwriter': {
    plural: 'will writers',    product:'probate', slug:'will-writers', alts:['will-writers-and-probate'], label:'Will writer', singular:'will writer',
    pains:[
      'Work that relies on referrals, so it stops when the referrals stop',
      'Probate enquiries going to firms with bigger marketing',
      'No steady pipeline of estate and will work'
    ],
    hook:'Probate grants in your area - a reliable source of will and probate enquiries, delivered each morning.',
    how:'We email new grants near you with the address, so you can offer will and probate services while the family is sorting the estate.',
    feats:[
      'Daily probate grants in your areas',
      'Full address on each lead',
      'Print &amp; Post letters from \u00a31.49',
      'Bulk options for quiet periods',
      '7 days free - no card'
    ]
  },

  // ============ NEW BUSINESS ============
  'nb-accountant': {
    plural: 'accountants &amp; bookkeepers',    product:'newbusiness', slug:'accountants', label:'Accountant &amp; bookkeeper', singular:'accountant',
    pains:[
      'New companies register every day - and the first accountant they speak to usually wins the client',
      'Cold lists full of businesses that already have an accountant',
      'No way to know who incorporated yesterday in your area'
    ],
    hook:'Fresh new company registrations in your areas, each morning - so you are the accountant who calls first.',
    how:'We email newly incorporated companies near you, with the source link so you can verify. Be first to offer your services while they are still choosing.',
    feats:[
      'New registrations daily at 9am',
      'The areas you actually serve',
      'Source link on every lead',
      'Marketing templates included',
      '7 days free - no card'
    ]
  },
  'nb-webdesign': {
    plural: 'web designers &amp; developers',    product:'newbusiness', slug:'web-designers', label:'Web designer &amp; developer', singular:'web designer',
    pains:[
      'New businesses need a website in their first weeks - but you never hear about them in time',
      'Being the third designer they called instead of the first',
      'No steady flow of businesses that actually need a build'
    ],
    hook:'The moment a company incorporates in your area, we flag it - so you can offer web design while they are setting up.',
    how:'We track newly registered companies and email them to you each morning. Contact them early with a build and branding offer.',
    feats:[
      'New registrations every weekday at 9am',
      'Decision makers contactable early',
      'Print &amp; Post letters from \u00a31.49',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'nb-marketing': {
    plural: 'marketing &amp; SEO agencies',    product:'newbusiness', slug:'marketing-agencies', label:'Marketing &amp; SEO agency', singular:'marketing agency',
    pains:[
      'The businesses that need marketing most are the ones you hear about too late',
      'Pitching against three other agencies for the same account',
      'No pipeline of companies actively ready to buy'
    ],
    hook:'New companies and growing businesses in your area - delivered before they sign a retainer elsewhere.',
    how:'We flag new registrations and business activity near you each morning, so you can pitch SEO, ads and marketing while they are still comparing options.',
    feats:[
      'New companies &amp; business activity daily',
      'The areas and sectors you target',
      'Templates to speed outreach',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'nb-it': {
    plural: 'IT &amp; support providers',    product:'newbusiness', slug:'it-support', label:'IT &amp; support provider', singular:'IT support provider',
    pains:[
      'New businesses choose an IT provider in their first month - usually the first one that calls',
      'Finding out about new companies months after they have already signed',
      'Marketing to cold lists that never become clients'
    ],
    hook:'Newly formed companies in your area - so you can be their IT provider from day one.',
    how:'We email new registrations near you each morning. Be first to offer IT support and security while they are still setting up.',
    feats:[
      'Daily new registrations in your patch',
      'Contact before they pick a provider',
      'Print &amp; Post letters from \u00a31.49',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'nb-insurance': {
    plural: 'insurance brokers',    product:'newbusiness', slug:'insurance-brokers', label:'Insurance broker', singular:'insurance broker',
    pains:[
      'New businesses buy insurance in their first weeks - and give it to whoever calls first',
      'No way to know which new companies need cover now',
      'Wasted calls to businesses already sorted'
    ],
    hook:'Newly incorporated companies in your areas - so you can quote business insurance before a competitor does.',
    how:'We flag new registrations each morning with the type of business, so you can call with a relevant quote while they are still arranging cover.',
    feats:[
      'Fresh registrations daily at 9am',
      'See the type of business &amp; SIC',
      'Print &amp; Post letters from \u00a31.49',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'nb-recruitment': {
    plural: 'recruitment agencies',    product:'newbusiness', slug:'recruitment-agencies', label:'Recruitment agency', singular:'recruitment agency',
    pains:[
      'New and growing companies hire fast - but only if they know you when the need hits',
      'Competing with agencies that got there first',
      'No way to spot companies about to grow'
    ],
    hook:'Newly formed and growing businesses in your sector - so you build relationships before the vacancy exists.',
    how:'We watch new registrations and company growth in your area, so you can introduce yourself while they are still building the team.',
    feats:[
      'New &amp; growing companies daily',
      'Target sectors and areas',
      'Templates for first outreach',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'nb-businesssupport': {
    plural: 'business support &amp; consultancy firms',    product:'newbusiness', slug:'business-services', label:'Business support &amp; consultancy', singular:'business support provider',
    pains:[
      'Startups choose their first supplier early - bookkeeping, HR, admin, consultancy',
      'Finding businesses after they have already decided',
      'No reliable stream of companies setting up in your area'
    ],
    hook:'Newly formed companies delivered to your inbox each morning - so you offer your services while they are setting up.',
    how:'We flag new registrations near you daily. Be the helpful first call for bookkeeping, HR, admin or consultancy while they are still forming.',
    feats:[
      'Daily new company alerts',
      'Your chosen postcode areas',
      'Source links to verify each one',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },

  // ============ PLANNING ============
  'plan-builder': {
    plural: 'builders &amp; contractors',    product:'planning', slug:'builders', label:'Builder &amp; contractor', singular:'builder',
    pains:[
      'Driving past sites that got planning permission months ago - jobs you never knew existed',
      'Losing work to builders who quote before you even hear about the project',
      'Hours spent searching for new applications before they are picked up by bigger firms'
    ],
    hook:'New planning applications in your area, every weekday - so you quote the work before other builders.',
    how:'We spot new planning applications in your area and email them to you with the address and project type. Quote while it is still yours to win.',
    feats:[
      'New planning applications in your area',
      'Address &amp; application type on each lead',
      'Win projects before competitors quote',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'plan-roofing': {
    plural: 'roofers',    product:'planning', slug:'roofers', label:'Roofer', singular:'roofer',
    pains:[
      'Roofing and re-roofing work hidden inside planning applications you never see',
      'Being called in only after the main contractor has chosen someone',
      'No steady pipeline of projects needing roofing'
    ],
    hook:'The planning applications in your area that need roofing work - flagged so you can quote before the contractor is chosen.',
    how:'We find new applications and extensions near you that generate roofing work, and email them each morning with the address.',
    feats:[
      'Applications likely to need roofing',
      'Your chosen areas only',
      'Address to check before calling',
      'Print &amp; Post flyers from \u00a31.49',
      '7 days free - no card'
    ]
  },
  'plan-electrician': {
    plural: 'electricians',    product:'planning', slug:'electricians', label:'Electrician', singular:'electrician',
    pains:[
      'New builds and extensions need electricians - but the contractor is chosen before you hear',
      'No way to see the projects starting in your area',
      'Quotes going to whoever got there first'
    ],
    hook:'New planning applications and projects in your area - so you can get your quote in before the sparky is picked.',
    how:'We track new projects in your areas and email them to you with the address. Call with a quote while the customer is still choosing.',
    feats:[
      'New applications daily at 9am',
      'Filtered to your areas &amp; project types',
      'Print &amp; Post intro letters from \u00a31.49',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'plan-plumber': {
    plural: 'plumbers &amp; heating engineers',    product:'planning', slug:'plumbers', label:'Plumber &amp; heating engineer', singular:'plumber',
    pains:[
      'Extensions, bathrooms and new builds all need plumbing - but you find out after it is priced',
      'Competing with plumbers who heard about the job first',
      'No reliable view of projects starting near you'
    ],
    hook:'Planning activity in your area that generates plumbing and heating work - delivered before it is priced elsewhere.',
    how:'We email new applications and projects near you each morning, so you can offer heating and plumbing quotes early.',
    feats:[
      'Daily applications in your patch',
      'Spot bathrooms, extensions &amp; new builds',
      'Print &amp; Post flyers from \u00a31.49',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'plan-extensions': {
    plural: 'extension &amp; loft specialists',    product:'planning', slug:'loft-conversions', alts:['extensions'], label:'Extension &amp; loft specialist', singular:'extension and loft specialist',
    pains:[
      'Every extension starts with a planning application - and whoever quotes first usually builds it',
      'Being the second or third company the homeowner spoke to',
      'No way to spot extensions starting in your area'
    ],
    hook:'New extension and loft planning applications in your areas, the day they appear - so you are first to quote.',
    how:'We flag extension and loft applications near you each morning with the address, so you can visit and quote before competitors.',
    feats:[
      'Extension &amp; loft applications daily',
      'Address so you can visit before calling',
      'Your own exclusive allocation',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'plan-architect': {
    plural: 'architects',    product:'planning', slug:'architects', label:'Architect', singular:'architect',
    pains:[
      'Homeowners choose an architect early - if you do not know about the project you never get the brief',
      'Design work going to firms that heard about the project first',
      'No steady view of who is planning to build'
    ],
    hook:'Planning applications and new projects in your areas - so you offer design services before the drawings are done.',
    how:'We find new projects near you each morning, so you can introduce your design service while the homeowner is still choosing an architect.',
    feats:[
      'Projects in your chosen areas',
      'See what is being planned nearby',
      'Print &amp; Post your portfolio from \u00a31.49',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'plan-landscaper': {
    plural: 'landscapers &amp; gardeners',    product:'planning', slug:'gardeners', alts:['landscaping','driveways'], label:'Landscaper &amp; gardener', singular:'landscaper',
    pains:[
      'Garden and landscaping work is decided when planning is approved - a moment you rarely hear about',
      'Losing driveways and garden jobs to firms that heard first',
      'No pipeline of projects with outdoor work'
    ],
    hook:'Applications that involve garden, driveway and landscape work - flagged so you can quote first.',
    how:'We spot planning applications with outdoor work near you and email them each morning, with the address.',
    feats:[
      'Projects with garden, driveway or outdoor work',
      'Your chosen areas only',
      'Print &amp; Post letters from \u00a31.49',
      'Replace a wrong lead instantly',
      '7 days free - no card'
    ]
  },
  'plan-developer': {
    plural: 'property developers',    product:'planning', slug:'property-developers', label:'Property developer', singular:'property developer',
    pains:[
      'The best sites are snapped up by developers who hear about planning activity first',
      'Hours spent searching for development opportunities before they are gone',
      'No reliable way to track what is being proposed where'
    ],
    hook:'New planning activity in your areas - so you spot development opportunities before they are gone.',
    how:'We track planning activity and email you applications matched to your areas and project size, so you act early.',
    feats:[
      'New planning activity across your chosen areas',
      'Filter by area and project size',
      'Source links on every lead',
      'Bulk packs available',
      '7 days free - no card'
    ]
  },

  // ============ TENDERS ============
  'tend-construction': {
    plural: 'construction contractors',    product:'tenders', slug:'builders', label:'Construction &amp; building', singular:'construction contractor',
    pains:[
      'Public contracts come and go and you only hear about them after the deadline',
      'Manual hours on Contracts Finder that never quite cover everything',
      'Bids going to firms that saw the tender first'
    ],
    hook:'Public sector tender opportunities matched to your business - emailed the day they appear, before the deadline.',
    how:'We watch government procurement portals and send you the contracts that fit your specialisms each morning, so you bid while there is still time.',
    feats:[
      'Contracts matched to your specialisms',
      'Seen the day they are published',
      'Tenders from \u00a35k up',
      'Bid summaries to speed response',
      '7 days free - no card'
    ]
  },
  'tend-cleaning': {
    plural: 'cleaning companies',    product:'tenders', slug:'cleaning-services', label:'Cleaning company', singular:'cleaning company',
    pains:[
      'School, council and office cleaning contracts won by firms that see them first',
      'No time to check every portal every day',
      'Relying on a handful of private contracts that could vanish'
    ],
    hook:'Cleaning and facilities tender opportunities in your sector - delivered the day they are published.',
    how:'We monitor public sector cleaning and FM tenders and email you the matches each morning, with the deadline and scope at a glance.',
    feats:[
      'Cleaning contracts matched to you',
      'See them before the bid deadline',
      'Clear scope and value on each',
      'Replace an irrelevant tender instantly',
      '7 days free - no card'
    ]
  },
  'tend-security': {
    plural: 'security companies',    product:'tenders', slug:'security-services', label:'Security company', singular:'security company',
    pains:[
      'Public guarding and security contracts rarely advertised where you would see them',
      'Missing frameworks that could fill your calendar for years',
      'Bids going to companies that heard about the tender first'
    ],
    hook:'Security and guarding tenders from the public sector - delivered to your inbox at 9am.',
    how:'We watch government procurement for security, CCTV and guarding contracts and email the ones that fit you each morning.',
    feats:[
      'Manned guarding &amp; CCTV contracts',
      'Matched to your region &amp; size',
      'Deadline and value at a glance',
      'Bid summaries included',
      '7 days free - no card'
    ]
  },
  'tend-it': {
    plural: 'IT &amp; technology providers',    product:'tenders', slug:'it-services', label:'IT &amp; technology', singular:'IT company',
    pains:[
      'Government and council IT contracts published and awarded without you ever seeing them',
      'No time to monitor every procurement portal',
      'Competing with IT firms that spot tenders earlier'
    ],
    hook:'Public IT, software and telecoms tenders - matched to your capabilities and delivered at 9am.',
    how:'We monitor public procurement for IT and technology contracts and email you the relevant ones each morning, so you bid before competitors.',
    feats:[
      'IT &amp; tech contracts daily',
      'Value and deadline at a glance',
      'Matched to your capabilities',
      'Bid summaries to speed response',
      '7 days free - no card'
    ]
  },
  'tend-facilities': {
    plural: 'facilities management companies',    product:'tenders', slug:'facilities-management', label:'Facilities management', singular:'facilities management company',
    pains:[
      'FM contracts are steady revenue - but they go to firms that spot them first',
      'Missing maintenance frameworks for schools, councils and hospitals',
      'Hours of manual searching every week'
    ],
    hook:'Facilities management tender opportunities from public bodies - emailed the day they are released.',
    how:'We watch procurement portals for FM and maintenance contracts and deliver the matches each morning, scope and deadline included.',
    feats:[
      'FM &amp; maintenance contracts',
      'Clear scope and deadline',
      'Your chosen regions',
      'Replace an irrelevant tender instantly',
      '7 days free - no card'
    ]
  },
  'tend-catering': {
    plural: 'catering companies',    product:'tenders', slug:'catering', label:'Catering &amp; hospitality', singular:'catering company',
    pains:[
      'School meals and public catering contracts are big reliable revenue - if you see them in time',
      'Deadlines missed because you found the tender too late',
      'Competing with caterers that got there first'
    ],
    hook:'Catering and hospitality tenders across the public sector - delivered at 9am, before the deadline.',
    how:'We watch public procurement for catering and hospitality contracts and email you the relevant ones each morning.',
    feats:[
      'Catering contracts as they appear',
      'Deadlines and values shown clearly',
      'Matched to your area',
      'Bid summaries included',
      '7 days free - no card'
    ]
  },
  'tend-logistics': {
    plural: 'transport &amp; logistics companies',    product:'tenders', slug:'transport', label:'Transport &amp; logistics', singular:'transport and logistics company',
    pains:[
      'Public courier, fleet and transport contracts awarded to bidders who find them first',
      'No reliable way to track transport tenders across the UK',
      'Fleet capacity sitting idle between private contracts'
    ],
    hook:'Transport &amp; logistics tenders from the public sector - matched to your business and delivered at 9am.',
    how:'We watch government procurement for courier, fleet and logistics opportunities and email the relevant ones each morning.',
    feats:[
      'Courier, fleet &amp; logistics tenders',
      'Daily at 9am with deadline',
      'Filter to your size &amp; region',
      'Replace an irrelevant tender instantly',
      '7 days free - no card'
    ]
  }
};

module.exports = { P, SUBTYPES, TOWNS_FILE: path.join(__dirname, 'data', 'uk-postcode-areas.json') };
