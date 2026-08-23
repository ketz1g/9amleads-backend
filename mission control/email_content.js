// ============================================================
// 9amLeads EMAIL CONTENT ENGINE, Long-form, sales-focused copy
// Generates rich, exciting, converting email layouts for every
// campaign step, personalized per product. Each email includes:
// hook, pain agitation, rich benefits, "reasons to choose 9amLeads",
// proof (stats + testimonials), objection handling, urgency, PS.
// ============================================================

// Shared "reasons to choose 9amLeads", reused across emails, tailored per product
function reasonsBlock(p){
  return [
    {icon:'⚡',title:'Fresh within 24 hours',body:'Your '+p.leadType+' opportunities are typically under a day old. Nobody else has contacted them. You contact first.'},
    {icon:'🔒',title:'Exclusive, yours alone',body:'We never sell the same lead to multiple businesses. No bidding wars. No racing 3 competitors to the phone.'},
    {icon:'⏰',title:'Delivered at 9am sharp',body:'The most productive hour of your day, ready to sell. No refreshing, no dashboard-hunting, it arrives.'},
    {icon:'📍',title:'Your exact areas',body:'Target the postcodes, counties or regions you actually serve. We do the finding.'},
    {icon:'✅',title:'Verified public data',body:'Sourced from '+p.source+'. Real, traceable, compliant. No recycled databases.'},
    {icon:'💷',title:'Pays for itself',body:'Plans from £25/week. One '+p.leadType+' is worth '+p.value+' to your business.'}
  ];
}
function featuresBlock(p){
  var leadType=p.leadType||'opportunity';
  var source=p.source||'official public registers';
  return [
    {icon:'🎁',title:'7-day FREE trial',body:'A full week of '+leadType+' opportunities. no commitment.'},
    {icon:'🔒',title:'Exclusive, no-competition leads',body:'Every lead is delivered to ONE business only. You never compete for the same prospect.'},
    {icon:'✉️',title:'Print & Post service',body:'We can print and post your outreach letters to leads automatically - done for you.'},
    {icon:'⏰',title:'Daily delivery at 9am',body:'Fresh opportunities every weekday, straight to your inbox.'},
    {icon:'✅',title:'Verified public data',body:'Sourced from '+source+'. Real, traceable, compliant.'},
    {icon:'📊',title:'Dashboard & tracking',body:'See every lead, track conversions, and manage your areas in one place.'}
  ];
}
// Why we are different from other lead companies
function differentBlock(p){
  var source=p.source||'official public registers';
  return [
    {us:'Your own allocation, never sent to you twice',them:'Sold to 3-5 businesses'},
    {us:'Fresh within 24 hours',them:'Recycled or weeks old'},
    {us:'Delivered to your inbox at 9am',them:'Dashboard you must keep checking'},
    {us:'Verified official '+source+' data',them:'Sourced from who knows where'},
    {us:'Print & Post service included',them:'You print and mail yourself'},
    {us:'7-day free trial',them:'Pay before you see anything'}
  ];
}

// What we offer
function offerBlock(p){
  var leadType=p.leadType||'opportunity';
  var source=p.source||'official public registers';
  return [
    {icon:'⏰',title:'Daily 9am delivery',body:'Fresh '+leadType+' opportunities in your inbox every weekday - ready to act on by 9:01am.'},
    {icon:'🔒',title:'Exclusive territories',body:'Choose the postcodes, counties or regions you serve. Each lead goes to exactly one business.'},
    {icon:'✅',title:'Verified public data',body:'Sourced from '+source+'. Real, traceable, fully compliant.'},
    {icon:'✉️',title:'Print & Post service',body:'We print and post your outreach letters automatically. You just sign and send.'},
    {icon:'📊',title:'Dashboard & tracking',body:'Manage areas, see every lead, and track conversions in one clean dashboard.'},
    {icon:'🎁',title:'7-day free trial',body:'Every plan starts free. No obligation. See the leads before you pay.'}
  ];
}

// SECTOR/AUDIENCE BLOCK, who this lead type is FOR (which businesses), why
// they benefit, and the specific win for their trade. This is critical: customers
// must see their own business reflected so they know the leads are meant for them.
function sectorBlock(p){
  var s = p.sector || p.key;
  var who = SECTOR_INFO[s] || SECTOR_INFO.default;
  return {
    heading: 'Who is this for?',
    whoTitle: who.whoTitle,
    whoBody: who.whoBody,
    audience: who.audience,
    whyTitle: 'Why ' + (p.shortName || p.name) + ' businesses win with 9amLeads',
    whyBody: who.whyBody,
    winTitle: 'The ' + p.leadType + ' advantage',
    winBody: who.winBody
  };
}

// Per-sector content. Each lead type serves a clear set of businesses.
var SECTOR_INFO = {
  moving: {
    whoTitle: 'Built for removals, agents & home-move businesses',
    whoBody: 'If you move homes or businesses, handle storage, sell property, do house clearance, deep cleaning, or any trade that serves people at a big life moment, this is your lead flow. Every day we find homeowners about to move AND commercial premises changing hands — offices, retail, warehouses and business relocations.',
    audience: ['Removal & man & van companies','Commercial movers & office relocation teams','Estate agents & property sourcers','House clearance & storage firms','Cleaners, carpet fitters & end-of-tenancy teams','Trades & home-service businesses'],
    whyBody: 'Homeowners announce their move the moment a property is newly listed, or when it goes being listed for sale — and businesses signal a move the moment a commercial property goes on the market. That\'s the exact second they start booking services. Movers, agents, clearance and cleaning firms who are FIRST to that doorstep or boardroom win the job. 9amLeads hands you that moment every single morning — residential and commercial — whether it\'s a brand-new listing, an newly listed that signals a guaranteed move, or an office that\'s about to relocate.',
    winBody: 'A seller who just listed or accepted an offer is organising their move RIGHT NOW — and so is the business owner selling their premises. One booking for a removal, a clearance, a deep clean or a commercial relocation covers months of your subscription cost. Speed wins, and 9amLeads makes you fastest.'
  },
  probate: {
    whoTitle: 'Built for probate, legal & estate professionals',
    whoBody: 'If you handle probate, administer estates, buy property, provide care, or offer financial/legal services to families after a bereavement, this is your lead flow.',
    audience: ['Probate practitioners & solicitors','Estate administrators & executors','Property buyers & auction houses','Care, funeral & financial services'],
    whyBody: 'Every probate notice is a family that needs professional help, legal, property, financial. Probate firms who reach out early, with sensitivity, win the instruction. 9amLeads delivers these notices the day they\'re published.',
    winBody: 'The estate is being administered NOW. An early, compassionate approach wins families over for the legal work, the property, and the lifetime of referrals that follow.'
  },
  newbusiness: {
    whoTitle: 'Built for agencies, consultants & B2B services',
    whoBody: 'If you sell to new companies, accounting, insurance, web design, marketing, telecoms, IT, banking, any B2B service, this is your lead flow.',
    audience: ['Accountants & bookkeepers','Insurance & financial advisers','Web design, marketing & IT agencies','Business consultants & B2B service providers'],
    whyBody: 'Every newly registered company is a brand-new business that needs suppliers. They need an accountant, a website, insurance, a bank, often within days. B2B firms who contact them first win the account for years.',
    winBody: 'A brand-new company has no existing suppliers. You could be their accountant or agency from day one, an account worth thousands over years, for the cost of one lead.'
  },
  planning: {
    whoTitle: 'Built for builders, trades & planning professionals',
    whoBody: 'If you\'re a builder, roofer, extension specialist, architect, structural engineer or any trade that works on building projects, this is your lead flow.',
    audience: ['Builders & general contractors','Extensions, loft & conversion specialists','Roofers, electricians & heating engineers','Architects, engineers & planning consultants'],
    whyBody: 'Every planning application is a homeowner or developer about to spend money on construction. The contractor who approaches them during the planning stage wins the build. 9amLeads delivers applications the day they\'re lodged.',
    winBody: 'The project is being planned NOW. Position yourself before the work is tendered and you\'re the obvious choice when it goes ahead, a build worth thousands to your firm.'
  },
  tenders: {
    whoTitle: 'Built for public-sector suppliers & contractors',
    whoBody: 'If you bid for public work, construction, cleaning, catering, IT, security, facilities, consultancy, this is your lead flow.',
    audience: ['Construction & building contractors','Cleaning, catering & facilities firms','IT, security & consultancy providers','SMEs ready to win public contracts'],
    whyBody: 'Public-sector contracts are steady, reliable revenue, but you only win them if you find them in time. 9amLeads delivers new tender opportunities the day they\'re published, so you can bid before the deadline pressure.',
    winBody: 'A public contract can be worth tens of thousands, a single win pays for years of leads. Early access to new notices is the difference between bidding and missing out.'
  },
  default: {
    whoTitle: 'Built for businesses ready to grow',
    whoBody: 'If you\'re a business that wins customers by being first, this is your lead flow.',
    audience: ['Local & service businesses','B2B providers & agencies','Trades & professionals'],
    whyBody: 'Fresh, exclusive opportunities delivered at 9am give you the first-mover advantage. Being first means winning the customer.',
    winBody: 'One converted lead covers months of your subscription. Speed wins, and 9amLeads makes you fastest.'
  }
};



// PRODUCT-SPECIFIC PAIN POINTS + ATTRACTION. Injected into each email so the
// copy is tailored to the exact pains and wins of each lead type, not generic.
var PRODUCT_COPY = {
  moving: {
    leadTypes: ['newly listed properties', 'properties going being listed for sale'],
    painPoints: [
      {icon:'😫', title:'You only find out too late', body:'By the time you spot a new listing or an newly listed, three other removal firms already quoted. The seller is comparing prices, not hearing about your service for the first time.'},
      {icon:'⏳', title:'Hours lost hunting listings', body:'Refreshing Rightmove, checking portals, cross-referencing, that is 10+ hours a month you should be spending on a van, a crew, and a signed job.'},
      {icon:'💰', title:'Missed moves are missed money', body:'A single removal, clearance or deep-clean booking is worth hundreds. Every lead you miss is money going to whoever contacted first.'},
      {icon:'📉', title:'Unpredictable work', body:'You never know what next week looks like. One quiet week can wipe out a month of profit, unless you have a steady stream of people who are moving.'}
    ],
    attract: [
      {icon:'🚚', title:'Be first to the doorstep', body:'A seller who just listed or accepted an offer is actively booking services. First contact wins, and 9amLeads makes you first, every morning.'},
      {icon:'🎯', title:'New listings AND newly listeds', body:'We flag properties the moment they\'re listed, and the moment they go newly listed, so you catch homeowners at two critical moments of their move.'},
      {icon:'✅', title:'Verified, exclusive leads', body:'Every lead is checked and delivered to only one business. No shared leads, no racing five competitors.'},
      {icon:'💷', title:'One move pays for months', body:'A single booking covers your whole subscription. The rest is pure profit.'}
    ]
  },
  probate: {
    painPoints: [
      {icon:'😔', title:'Families in crisis get bombarded', body:'When a probate notice is published, aggressive firms flood in. The family goes with whoever reached out with care and clarity first.'},
      {icon:'⏳', title:'Slow outreach loses the estate', body:'Probate instructions go to the professional who makes contact early. Wait a week and the executors have already appointed someone.'},
      {icon:'💰', title:'Estates are one-time, high value', body:'A single probate instruction can mean the legal work, the property sale, and years of referrals. Missing it is leaving real money behind.'}
    ],
    attract: [
      {icon:'🤝', title:'Compassionate, early contact', body:'Our leads arrive the day the notice is published, so you can be the respectful professional who helps first.'},
      {icon:'🎯', title:'Exclusive to your firm', body:'Each notice goes to one business. No competing contacts to the same grieving family.'},
      {icon:'💷', title:'One estate, big value', body:'The legal work and property instruction from one estate can cover months of your subscription.'}
    ]
  },
  newbusiness: {
    painPoints: [
      {icon:'😫', title:'New companies are snatched up fast', body:'A company registers and within days needs an accountant, a website, insurance. If you\'re not first, someone else is their supplier for years.'},
      {icon:'⏳', title:'Manual Companies House digging', body:'Wading through the register to find new registrations is tedious, and you still miss the ones that matter.'},
      {icon:'💰', title:'Lost accounts are lost revenue', body:'A new client keeps you for 2-5 years on average. Every one you miss is thousands in lifetime value.'}
    ],
    attract: [
      {icon:'⚡', title:'Day-one contact', body:'We deliver new registrations the day they appear, so you\'re the first supplier they speak to.'},
      {icon:'🎯', title:'Target your niche', body:'Only see registrations in your sector and area. No noise, just your ideal prospects.'},
      {icon:'💷', title:'Lifetime accounts', body:'Win them at day one and they\'re yours for years. One client covers the subscription many times over.'}
    ]
  },
  planning: {
    painPoints: [
      {icon:'😫', title:'You find out when it\'s already built', body:'Planning applications are public the day they\'re lodged, but most trades never see them until it\'s too late to quote the build.'},
      {icon:'⏳', title:'Bidding starts late', body:'The builder who approaches during the planning stage is the obvious choice when work goes ahead. Latecomers are second best.'},
      {icon:'💰', title:'Each project is big money', body:'One extension or new build is worth thousands. Missing the application window means missing the job.'}
    ],
    attract: [
      {icon:'🏗️', title:'Win the build before it\'s tendered', body:'We flag applications the day they\'re lodged, so you can position yourself before anyone else.'},
      {icon:'🎯', title:'Only your area, only your trade', body:'See applications in the postcodes you serve, for the type of work you do.'},
      {icon:'💷', title:'One project covers a year', body:'A single build quote that lands covers your subscription many times over.'}
    ]
  },
  tenders: {
    painPoints: [
      {icon:'😫', title:'You hear about contracts too late', body:'Public tenders close fast. By the time you find one, you\'ve missed the deadline or rush a weak bid.'},
      {icon:'⏳', title:'Scattered across portals', body:'Contracts Finder, Find a Tender, local councils, it\'s a maze. No wonder so many SMEs miss out.'},
      {icon:'💰', title:'Lost contracts are lost years', body:'A public contract can be worth tens of thousands and run for years. One win changes your year.'}
    ],
    attract: [
      {icon:'📬', title:'New tenders the day they\'re published', body:'We deliver fresh opportunities to your inbox at 9am, so you bid early and bid well.'},
      {icon:'🎯', title:'Only tenders you can win', body:'Filter by sector, value and region, so you spend time on bids that fit you.'},
      {icon:'💷', title:'One contract, years of revenue', body:'A single public-sector win covers your subscription for years.'}
    ]
  },
  default: {
    painPoints: [
      {icon:'⏳', title:'Hours lost prospecting', body:'You spend your week searching for leads instead of selling. That\'s time you never get back.'},
      {icon:'💰', title:'Late means losing', body:'By the time you contact a prospect, a competitor already has them. Being first is everything.'}
    ],
    attract: [
      {icon:'⚡', title:'Fresh leads at 9am', body:'A clear list every morning, ready to act on. No searching, no admin.'},
      {icon:'💷', title:'One lead pays for months', body:'A single conversion covers your subscription. The rest is profit.'}
    ]
  }
};

// Long-form hook + pain + solution paragraphs per step (both tracks)
function makeOnboardingLayout(p, day, step){
  var R=reasonsBlock(p);
  var L=JSON.parse(JSON.stringify({
    base:{
      welcome:{week:'Week 1 · Day 1',heroTitle:'Your free week of '+p.name+' starts NOW 🎉',heroSub:'Starting tomorrow at 9am, fresh '+p.leadType+' opportunities land in your inbox, exclusive to you.',open:'Welcome aboard, and congratulations on making the smartest move for your business this year.\n\nHere\'s the reality: your competitors are already hunting for '+p.leadType+' opportunities manually, refreshing pages and missing the good ones. You just skipped all of that.\n\nOver the next 7 days you\'ll see exactly how powerful this is. Here\'s what happens next:',sections:[{icon:'⏰',title:'Tomorrow, 9am, your first leads arrive',body:'A fresh batch of '+p.leadType+' opportunities, delivered straight to your inbox. Complete details, ready to act on.'},{icon:'📋',title:'Everything you need, in one sheet',body:'Full addresses, postcodes and the key data to contact each prospect with confidence.'},{icon:'🔒',title:'Exclusive, only you receive them',body:'We never sell a lead to multiple businesses. These opportunities are yours and yours alone.'}],stats:[{num:'7',label:'days free'},{num:'9am',label:'daily delivery'},{num:'100%',label:'exclusive'}],reasons:R,testimonial:{quote:'I signed up on a Monday. By Thursday I had more leads than I\'d get in a month of manual searching.',author:'9amLeads customer'},faq:{q:'Do I need to do anything?',a:'No. Just check your inbox at 9am. The leads do the rest.'},features:featuresBlock(p),cta:'View My Dashboard',ctaUrl:p.url,ps:'Your first lead sheet lands tomorrow at 9am. Keep an eye on your inbox, and don\'t forget to check spam if it\'s not there by 9:05.'},
      why9am:{week:'Week 1 · Day 3',heroTitle:'Why 9am? Because that\'s when money is made 💰',heroSub:'The science is clear: teams who act on leads in the first hour convert at 3x the rate.',open:'Let me ask you something.\n\nWhen is your team at their most productive? For 90% of sales professionals, it\'s 9-10am, fresh, focused, ready to work.\n\nSo why would you spend that golden hour searching for leads instead of contacting them?\n\nThat\'s exactly why we deliver at 9am. Not 8am (too early, you\'re commuting). Not 10am (momentum already lost). 9am, the moment your team sits down, opens their email, and is ready to sell.',sections:[{icon:'📊',title:'3x more conversions',body:'Sales teams that contact leads within the first hour convert at 3x the rate of those who wait.'},{icon:'🧠',title:'Still fresh in their mind',body:'A prospect contacted within hours of a '+p.leadType+' still feels the urgency themselves.'},{icon:'🏃',title:'You\'re first. Always.',body:'Most of your competitors won\'t contact until lunchtime. You\'ll have the conversation at 9:05am.'}],stats:[{num:'3x',label:'conversion rate'},{num:'9:01am',label:'the money moment'},{num:'24hr',label:'fresher than anyone'}],reasons:R,features:featuresBlock(p),cta:'See How It Works',ctaUrl:'https://9amleads.com/how-it-works/'},
      convert:{week:'Week 1 · Day 5',heroTitle:'How to turn your first '+p.leadType+' into a customer 🎯',heroSub:'A simple 3-step framework that converts, even on the first contact.',open:'Getting the lead is only half the battle. Converting it is where the money is made.\n\nHere\'s the exact framework our most successful customers use, and it works because it plays to your biggest advantage: speed.',sections:[{icon:'⚡',title:'Step 1: Contact at 9:01am',body:'Your lead sheet lands at 9am. By 9:01 you should be dialling. You are the first person they\'ve spoken to, that\'s priceless.'},{icon:'🎯',title:'Step 2: Be specific, not scripted',body:'Mention something real. "I saw your '+p.leadType+', let me tell you exactly how I can help." Specificity builds trust instantly.'},{icon:'🤝',title:'Step 3: Add value, book the follow-up',body:'Your goal isn\'t to close on the first contact. It\'s to start a conversation, solve a problem, and lock in a next step.'}],testimonial:{quote:'The framework is so simple. Contact early, be specific, add value. I converted 3 leads in my first week.',author:'9amLeads customer'},stats:[{num:'3x',label:'higher conversion when first'},{num:'9:01am',label:'make the contact'},{num:'1st',label:'contact wins'}],reasons:R,features:featuresBlock(p),cta:'Get the Full Playbook',ctaUrl:p.url,ps:'Speed is everything. In our data, the customers who act before 10am convert 2x more often than those who wait until the afternoon.'},
      sources:{week:'Week 2 · Day 8',heroTitle:'Where your leads actually come from 🔍',heroSub:'Full transparency, because trust matters.',open:'A lot of lead companies are vague about their data. We\'re not.\n\nHere\'s exactly where your '+p.name+' come from, and why that makes them better than anything you\'ll find elsewhere.',sections:[{icon:'🔍',title:'Official '+p.source+' data',body:'Every '+p.leadType+' is sourced from '+p.source+'. Real, traceable, verified.'},{icon:'🆕',title:'Under 24 hours old',body:'From publication to your inbox in under a day. Nobody else has seen it.'},{icon:'🔒',title:'Exclusive to you',body:'We deliver each lead to exactly one customer. Ever. That\'s the promise.'}],stats:[{num:'24hr',label:'max lead age'},{num:'100%',label:'verified sources'},{num:'1',label:'customer per lead'}],reasons:R,faq:{q:'Is this compliant?',a:'Yes. We use official public registers and follow all data regulations.'},features:featuresBlock(p),cta:'Learn About Our Data',ctaUrl:p.url},
      exclusive:{week:'Week 2 · Day 10',heroTitle:'You\'re the ONLY one getting these leads 🤫',heroSub:'No shared leads. No bidding wars. Ever.',open:'Imagine this: you get a '+p.leadType+'. You contact. And the prospect says "you\'re the fifth company to contact me today."\n\nWith most lead services, that\'s exactly what happens, they sell the same lead to 3, 4, 5 businesses.\n\nNot with us. Every '+p.leadType+' we deliver is exclusive to you. Here\'s why that matters:',sections:[{icon:'🏆',title:'You\'re the only option',body:'When you contact, there\'s no competition. Just you and the prospect.'},{icon:'📈',title:'Far better conversion',body:'Exclusive leads convert at dramatically higher rates than shared ones.'},{icon:'🤝',title:'Referrals follow',body:'Happy customers refer others. Your lead quality compounds.'}],reasons:R,stats:[{num:'1',label:'customer per lead'},{num:'0',label:'bidding wars'},{num:'100%',label:'exclusive'}],features:featuresBlock(p),cta:'Start My Free Trial',ctaUrl:p.url,ps:'Still deciding? Your free trial is live right now, you have nothing to lose and a full week of exclusive leads to gain.'},
      volume:{week:'Week 2 · Day 12',heroTitle:'How many leads will you get? The honest answer 📊',heroSub:'Realistic expectations, so you\'re never disappointed.',open:'We get this question a lot, so let\'s be straight with you.\n\nLead volume depends on your target areas and market conditions. But here\'s what you can expect:',sections:[{icon:'📦',title:'A steady daily flow',body:'Fresh '+p.leadType+' opportunities every weekday morning, without fail.'},{icon:'🌍',title:'Widen your areas anytime',body:'Add more postcodes or counties from the dashboard to increase volume instantly.'},{icon:'💎',title:'Quality over quantity, always',body:'One strong lead that converts beats 100 recycled ones. We deliver the strong ones.'}],reasons:R,stats:[{num:'5-30',label:'leads/day by plan'},{num:'9am',label:'daily delivery'},{num:'100%',label:'exclusive'}],faq:{q:'What if I want more leads?',a:'Upgrade your plan or widen your areas, both give you more volume immediately.'},features:featuresBlock(p),cta:'Choose Your Areas',ctaUrl:p.url},
      success:{week:'Week 3 · Day 15',heroTitle:'"I converted 3 clients in my first week" ⭐',heroSub:'A real story from a real 9amLeads customer.',open:'Let me tell you about one of our customers.\n\nThey\'d relied on ads and referrals for years. Some months were great. Most were unpredictable.\n\n"The problem wasn\'t our sales ability," they told us. "It was that we were always late. By the time we found a '+p.leadType+', three competitors had already contacted."\n\nThey signed up on a Monday. By Thursday they\'d received a stream of exclusive '+p.leadType+' opportunities, and converted several into paying customers.\n\n"Now I start every day knowing exactly who needs my services. My team spends their time selling, not searching."',sections:[{icon:'📈',title:'From hunting to closing',body:'No more hours lost prospecting. Just a clear list, every morning.'},{icon:'💰',title:'The revenue impact',body:'One '+p.leadType+' is worth '+p.value+'. The subscription pays for itself.'},{icon:'⭐',title:'The verdict',body:'"I\'d never go back. This is how you\'re supposed to run a business."'}],stats:[{num:'Day 1',label:'first leads delivered'},{num:'3',label:'converted in week one'},{num:'24hr',label:'lead freshness'}],testimonial:{quote:'The problem wasn\'t our sales ability, we were always late. Now we\'re always first.',author:'9amLeads customer'},reasons:R,features:featuresBlock(p),cta:'Write Your Own Success Story',ctaUrl:p.url},
      roi:{week:'Week 3 · Day 17',heroTitle:'One booking covers MONTHS of leads 🧮',heroSub:'The maths is embarrassingly simple.',open:'Let\'s do some maths.\n\nYour plan costs from £25/week, less than a coffee a day.\n\nNow, what is one '+p.leadType+' actually worth to you?',sections:[{icon:'💷',title:'The tiny cost',body:'£25/week for a plan. Less than a round of coffees for your team.'},{icon:'💰',title:'The real value',body:'One converted '+p.leadType+' is worth '+p.value+'. Not hundreds, thousands.'},{icon:'🧮',title:'The maths',body:'Even if you convert 1 in 20 leads, you\'re still far ahead. The numbers don\'t lie.'}],stats:[{num:'£25',label:'plans from /week'},{num:'1',label:'booking covers it'},{num:'1 in 20',label:'conversion = huge profit'}],reasons:R,features:featuresBlock(p),cta:'Do the Maths Yourself',ctaUrl:p.url},
      proof:{week:'Week 3 · Day 19',heroTitle:'You\'re in excellent company 👥',heroSub:'Businesses across the UK start every morning with 9amLeads.',open:'You\'re not alone in this. Businesses like yours rely on 9amLeads every single morning.',sections:[{icon:'⭐',title:'"The data quality is excellent"',body:'"I was sceptical, but these aren\'t recycled leads, they\'re genuinely fresh."'},{icon:'📈',title:'"We were always late. Now we\'re first."',body:'The 9am delivery changes everything about how you start your day.'},{icon:'🏆',title:'"My team sells, they don\'t search."',body:'That\'s what our customers say when they stop wasting time prospecting.'}],stats:[{num:'100+',label:'businesses served'},{num:'5',label:'lead types'},{num:'9am',label:'daily delivery'}],testimonial:{quote:'The 9am delivery is a game-changer. My team starts every day with a clear list of who to contact.',author:'9amLeads customer'},reasons:R,features:featuresBlock(p),cta:'Join Them',ctaUrl:p.url},
      ending:{week:'Week 4 · Day 22',heroTitle:'Your free trial ends in 3 days ⏳',heroSub:'Don\'t let your daily lead flow stop now.',open:'Here\'s the thing: you\'ve seen the leads. You\'ve felt the difference of starting each day with a clear list.\n\nNow it\'s time to decide. In 3 days, your free trial ends. Here\'s what happens:',sections:[{icon:'✅',title:'Keep it all flowing',body:'Upgrade to keep your daily '+p.leadType+' opportunities coming, uninterrupted.'},{icon:'🏷️',title:'Keep your low price',body:'Upgrade now and keep today\'s rate for life.'},{icon:'🔒',title:'Your exclusive areas stay yours',body:'The moment you leave, a competitor could take your territory.'}],urgency:'⏳ 3 days left on your free trial. Upgrade now to keep your daily leads.',stats:[{num:'3',label:'days left'},{num:'9am',label:'leads keep coming'},{num:'100%',label:'exclusive stays'}],reasons:R,features:featuresBlock(p),cta:'Upgrade Now',ctaUrl:p.url,ps:'Upgrade in the next 3 days and keep today\'s rate. Wait, and the price rises for everyone.'},
      lose:{week:'Week 4 · Day 24',heroTitle:'Don\'t lose this. Seriously. 🚫',heroSub:'What happens if your free trial ends without upgrading.',open:'If you don\'t upgrade, here\'s exactly what you\'re giving up:',sections:[{icon:'❌',title:'Daily leads at 9am',body:'Back to manually hunting for '+p.leadType+' opportunities, hours a day, gone.'},{icon:'❌',title:'Your exclusive territory',body:'Your areas could go to a competitor the day you leave.'},{icon:'❌',title:'The first-mover advantage',body:'You\'ll be late again. And in business, late means losing.'}],urgency:'⚠️ It costs less than £4/day to keep your lead flow. Don\'t let it stop.',stats:[{num:'10hr+',label:'per month searching saved'},{num:'£4',label:'per day to keep leads'},{num:'9:01am',label:'when you could be closing'}],reasons:R,features:featuresBlock(p),cta:'Keep My Leads',ctaUrl:p.url,ps:'Think about it: less than £4/day vs going back to hours of manual searching. The choice is clear.'},
      final:{week:'Week 4 · Day 26',heroTitle:'Last chance, keep today\'s low price 🔥',heroSub:'This is the final email in your free week.',open:'This is it, the last chance to keep today\'s rate before it rises.\n\nYou\'ve seen what 9amLeads delivers. You know the leads are fresh, exclusive, and worth far more than they cost.\n\nThe only question is: are you in, or are you going back to searching manually?',sections:[{icon:'🏷️',title:'Today\'s rate for life',body:'Keep today\'s rate forever. Never pay more.'},{icon:'⭐',title:'Priority support',body:'Faster responses, direct help when you need it.'},{icon:'🚀',title:'New features first',body:'Early access before anyone else.'}],urgency:'🔥 Final reminder. Keep your daily leads, upgrade now.',reasons:R,features:featuresBlock(p),cta:'Keep My Daily Leads',ctaUrl:p.url,ps:'One booking covers months of costs. Keep your price today and let the leads do the rest.'}
    },
    cold:{
      intro:{week:'Email 1',heroTitle:'Fresh '+p.leadType+' opportunities. Every morning at 9am ⏰',heroSub:'Stop hunting. Start closing. It\'s that simple.',open:'Hi there,\n\nQuick question: how many hours a week does your team spend hunting for new business?\n\n2 hours? 5? 10?\n\nThose are hours you\'ll never get back, hours your competitors are spending on the phone instead.\n\nHere\'s what 9amLeads does: it finds fresh '+p.leadType+' opportunities for you, delivers them to your inbox every morning at 9am, and makes them exclusive to your business.',sections:[{icon:'⏰',title:'Delivered at 9am sharp',body:'Fresh '+p.leadType+' opportunities in your inbox every weekday. Ready to act on.'},{icon:'📍',title:'Your exact areas',body:'Choose the postcodes, counties or regions you serve. We find the leads there.'},{icon:'🔒',title:'Exclusive to you',body:'We never sell the same lead to multiple businesses. These are yours alone.'}],stats:[{num:'9am',label:'daily delivery'},{num:'24hr',label:'max lead age'},{num:'100%',label:'exclusive'}],reasons:R,features:featuresBlock(p),cta:'Start Your Free Trial',ctaUrl:p.url,ps:'No contract. Just a week of fresh '+p.leadType+' opportunities to prove it. What have you got to lose?'},
      problem:{week:'Email 2',heroTitle:'What\'s an hour of your team\'s time worth? 💷',heroSub:'The hidden cost of manual lead hunting.',open:'Let\'s be honest about something.\n\nIf your team spends 30 minutes every morning searching for leads, that adds up fast:',sections:[{icon:'⏱️',title:'2.5 hours a week',body:'Just 30 minutes a day, every day, searching for opportunities.'},{icon:'💷',title:'£3,000+ a year',body:'At £25/hour fully-loaded, that\'s the true cost of manual prospecting.'},{icon:'📉',title:'The leads you miss',body:'Every opportunity you miss because a competitor saw it first.'}],stats:[{num:'120hr',label:'per year prospecting'},{num:'£3,000',label:'lost productivity'},{num:'9am',label:'when you should be selling'}],reasons:R,features:featuresBlock(p),cta:'Stop Wasting Time',ctaUrl:p.url},
      solution:{week:'Email 3',heroTitle:'How 9amLeads works, it\'s embarrassingly simple 🤯',heroSub:'Three steps from signup to revenue.',open:'You\'re busy. We get it. So here\'s how 9amLeads works in three simple steps:',sections:[{icon:'1',title:'Choose your areas',body:'Tell us the postcodes, counties or regions you serve. Takes 60 seconds.'},{icon:'2',title:'We find the leads',body:'We monitor '+p.source+' around the clock and collect fresh '+p.leadType+' opportunities.'},{icon:'3',title:'You get them at 9am',body:'Your exclusive leads arrive in your inbox every morning. Ready to contact.'}],steps:[{num:1,title:'Sign up, free for 7 days',desc:'No commitment. Nothing to lose.'},{num:2,title:'Leads arrive daily at 9am',desc:'Fresh opportunities every weekday, exclusive to you.'},{num:3,title:'Convert & grow',desc:'Turn leads into paying customers, starting day one.'}],reasons:R,features:featuresBlock(p),cta:'See How It Works',ctaUrl:'https://9amleads.com/how-it-works/'},
      value:{week:'Email 4',heroTitle:'What is ONE '+p.leadType+' actually worth to you? 💰',heroSub:'Spoiler: far more than the subscription costs.',open:'Let\'s talk real numbers.\n\nWhat\'s a single good '+p.leadType+' worth to your business?',sections:[{icon:'💰',title:'Potentially thousands',body:'One converted '+p.leadType+' is worth '+p.value+'. Not hundreds, thousands.'},{icon:'🆕',title:'Fresh, not recycled',body:'Your leads are under 24 hours old. Nobody else has contacted them. That\'s priceless.'},{icon:'🔒',title:'Yours alone',body:'Exclusive leads convert dramatically better than shared ones. Period.'}],stats:[{num:'1',label:'lead covers months of costs'},{num:'24hr',label:'freshness'},{num:'100%',label:'exclusive'}],reasons:R,features:featuresBlock(p),cta:'Try It Free',ctaUrl:p.url,ps:'The best way to understand the value of a lead is to hold one in your hand. Start your free week today.'},
      how:{week:'Email 5',heroTitle:'Why 9am? Because that\'s when money is made 🕘',heroSub:'The science of the 9am delivery.',open:'Here\'s a stat that changes everything:\n\nSales teams who act on leads within the first hour convert at 3x the rate of those who wait.\n\nMost businesses don\'t get to their inbox until lunchtime. By then, the best '+p.leadType+' opportunities are gone.\n\nWe deliver at 9am so you\'re always first.',sections:[{icon:'📊',title:'3x conversion',body:'Act in the first hour. Convert at 3x the rate.'},{icon:'🧠',title:'Fresh in their mind',body:'A prospect contacted within hours still feels the urgency.'},{icon:'🏃',title:'Always first',body:'Your competitors aren\'t contacting until lunch. You already did.'}],reasons:R,features:featuresBlock(p),cta:'Get Your 9am Advantage',ctaUrl:p.url},
      success:{week:'Email 6',heroTitle:'Real results from real customers ⭐',heroSub:'This could be you in a week.',open:'Here\'s what happens when businesses start receiving '+p.leadType+' opportunities every morning:',sections:[{icon:'📈',title:'The turnaround',body:'Within days, customers report a steady flow of fresh, exclusive opportunities.'},{icon:'💰',title:'The revenue',body:'One '+p.leadType+' is worth '+p.value+'. The subscription pays for itself.'},{icon:'⭐',title:'The feedback',body:'"These aren\'t recycled leads, they\'re genuinely fresh."'}],testimonial:{quote:'Got a steady stream of leads in my first week. Converted several. The data quality is excellent.',author:'9amLeads customer'},reasons:R,features:featuresBlock(p),cta:'Start Your Free Week',ctaUrl:p.url},
      objection:{week:'Email 7',heroTitle:'"I can find my own leads", can you? 🤔',heroSub:'The true cost of DIY lead generation.',open:'We hear this a lot. "I can find my own leads."\n\nMaybe you can. But let\'s look at what it really costs:',sections:[{icon:'⏱️',title:'40 hours a month',body:'2 hours a day searching = a full working week every month, on admin.'},{icon:'💷',title:'The real cost',body:'9amLeads costs less than 2 hours of your own time. And it\'s better quality.'},{icon:'🎯',title:'Focus on selling',body:'Let us do the searching. You do the selling. That\'s the division of labour that wins.'}],stats:[{num:'40hr',label:'per month on admin'},{num:'£4',label:'per day for 9amLeads'},{num:'9am',label:'leads delivered daily'}],reasons:R,features:featuresBlock(p),cta:'Let Us Do the Searching',ctaUrl:p.url},
      compare:{week:'Email 8',heroTitle:'Half the price. Better delivery. No contest. 🏆',heroSub:'How 9amLeads beats the old way.',open:'Let\'s put it side by side:',sections:[{icon:'📥',title:'Inbox delivery',body:'No dashboard to remember. Leads come straight to your email.'},{icon:'🔒',title:'Exclusive, not shared',body:'You\'re the only one who receives each lead. No competition.'},{icon:'🆕',title:'Fresh within 24 hours',body:'From publication to your inbox in under a day.'},{icon:'💷',title:'From £25/week',body:'Less than a coffee a day for a steady stream of opportunities.'}],stats:[{num:'9am',label:'inbox delivery'},{num:'100%',label:'exclusive'},{num:'24hr',label:'freshness'}],reasons:R,features:featuresBlock(p),cta:'Switch to 9amLeads',ctaUrl:p.url},
      proof:{week:'Email 9',heroTitle:'Join 100+ businesses starting at 9am 👥',heroSub:'You\'re in good company.',open:'Businesses across the UK start their morning with 9amLeads.',sections:[{icon:'⭐',title:'"The data quality is excellent"',body:'"I was sceptical, but these aren\'t recycled, they\'re genuinely fresh."'},{icon:'📈',title:'"We were always late. Now we\'re first."',body:'That\'s what the 9am delivery does.'},{icon:'🏆',title:'"My team sells, they don\'t search."',body:'The words of customers who stopped wasting time.'}],testimonial:{quote:'The 9am delivery is a game-changer. My team starts every day with a clear list of who to contact.',author:'9amLeads customer'},reasons:R,features:featuresBlock(p),cta:'Join Them Free',ctaUrl:p.url,ps:'While you\'re deciding, a competitor could be taking your territory. Don\'t let that happen.'},
      offer:{week:'Email 10',heroTitle:'Try 9amLeads FREE for 7 days 🎁',heroSub:'No commitment. See the leads yourself.',open:'Here\'s the offer, and it\'s a good one:\n\nA full week of '+p.leadType+' opportunities, delivered daily at 9am, completely free.\n\nNo commitment. If it\'s not the best leads you\'ve ever seen, walk away.',sections:[{icon:'🎁',title:'7 days, completely free',body:'A full week of daily leads. No Obligation, no catch.'},{icon:'🚫',title:'Cancel anytime',body:'Zero fees, zero hassle. Your choice.'},{icon:'📊',title:'Judge for yourself',body:'See the quality before you spend a penny.'}],reasons:R,features:featuresBlock(p),cta:'Claim Your Free Week',ctaUrl:p.url,ps:'The only thing you risk by trying is losing an hour, and you\'ll gain a week of exclusive leads.'},
      urgency:{week:'Email 11',heroTitle:'Your free week won\'t last forever ⏳',heroSub:'Your 7-day free trial is ending soon.',open:'Here\'s what you get when you join today:',sections:[{icon:'🏷️',title:'Current price for life',body:'Never pay more than today\'s rate.'},{icon:'⭐',title:'Priority support',body:'Faster responses when you need them.'},{icon:'🚀',title:'New features first',body:'Early access before general release.'}],urgency:'🔥 Your free trial ends soon. Join today to keep the current rate.',reasons:R,features:featuresBlock(p),cta:'Start My Free Week',ctaUrl:p.url,ps:'Join during your free trial and keep today\'s rate. It won\'t last forever.'},
      final:{week:'Email 12',heroTitle:'Last chance to try 9amLeads FREE 🎁',heroSub:'One week of fresh leads. Free. No commitment.',open:'This is your final reminder.\n\nThe free trial is still available, and joining now keeps today\'s rate.\n\nA week of '+p.leadType+' opportunities, delivered at 9am every morning, exclusive to you.\n\nFree.\n\nOne booking could cover months of costs. The maths has never been easier.',sections:[{icon:'🎁',title:'7 days free',body:'A full week of daily opportunities.'},{icon:'🚫',title:'Cancel anytime',body:'No fees. No commitment.'},{icon:'📈',title:'Start growing',body:'One booking covers months of costs.'}],urgency:'⏳ Claim your free week now and keep today\'s rate.',reasons:R,features:featuresBlock(p),cta:'Start My Free Week',ctaUrl:p.url,ps:'In 7 days you\'ll either have a pipeline of fresh leads or you\'ll walk away free. Either way, you win.'}
    }
  }));
  var track=step.track==='cold'?L.cold:L.base;
  var key=step.key;
  if(!track[key])key='welcome';
  var out=track[key];
  if(!out){var firstKey=Object.keys(track)[0];out=track[firstKey]||{};out.base={week:'',heroTitle:'',heroSub:'',open:'',sections:[],stats:[],reasons:[],features:[],cta:'',ctaUrl:''};}
  out.week=step.week;
  out.subject=step.subject;

  // ==== ENRICHMENT: more CTAs, pricing, guarantee, social proof, testimonials ====
  // Hero CTA (in the banner)
  if(!out.ctaHero && out.cta){ out.ctaHero={text:'Start My Free 7-Day Trial',url:out.ctaUrl}; }
  // Mid-email CTA
  if(!out.ctaMid && out.cta){ out.ctaMid={text:out.cta,url:out.ctaUrl}; }
  // Social proof bar
  if(!out.socialProof){ out.socialProof=[
    {num:'100+',label:'businesses served'},
    {num:'9am',label:'daily delivery'},
    {num:'100%',label:'exclusive leads'}
  ]; }
  // Pricing table (for onboarding conversion + offer emails)
  if(!out.pricing && (step.key==='welcome'||step.key==='offer'||step.key==='ending'||step.key==='final'||step.key==='value')){
    out.pricing=[
      {plan:'Starter',leads:'5/day',price:'£25/wk'},
      {plan:'Pro',leads:'10-15/day',price:'£49/wk'},
      {plan:'Enterprise',leads:'20-30/day',price:'£99/wk'}
    ];
  }
  // Guarantee / risk reversal
  if(!out.guarantee){
    out.guarantee={title:'Zero-risk guarantee',body:'Start with a full 7-day free trial, no commitment. See the lead quality yourself. If it isn\'t the best leads you\'ve ever had, walk away free.'};
  }
  // Multiple testimonials
  if(out.testimonial && !out.testimonials){
    out.testimonials=[
      out.testimonial,
      {quote:'The 9am delivery is a game-changer. My team starts every day with a clear list of who to contact.',author:'9amLeads customer'}
    ];
  }
  // NO-REPEAT CONTENT ROTATION: the four big info blocks (reasons, features,
  // offer, different) all cover the same selling points (exclusive, 9am delivery,
  // verified data, Print & Post). Showing all four together made every email a
  // wall of repeated information. Rotate them so each email includes only TWO,
  // varied by step, the message stays complete, but emails stay fresh and lean.
  var blockKeys = ['reasons','features','offer','different'];
  var hash = 0;
  var sKey = String(step.key || '') + String(step.track || '');
  for (var hi = 0; hi < sKey.length; hi++) hash = (hash * 31 + sKey.charCodeAt(hi)) >>> 0;
  var startIdx = hash % blockKeys.length;
  var chosenTwo = [blockKeys[startIdx], blockKeys[(startIdx + 2) % blockKeys.length]];
  blockKeys.forEach(function(bk){
    if (chosenTwo.indexOf(bk) !== -1) {
      if (bk === 'reasons' && !out.reasons) out.reasons = reasonsBlock(p);
      if (bk === 'features' && !out.features) out.features = featuresBlock(p);
      if (bk === 'offer' && !out.offer) out.offer = offerBlock(p);
      if (bk === 'different' && !out.different) out.different = differentBlock(p);
    } else {
      // Skip this block for this email to avoid repeating the same selling points
      if (bk === 'reasons') delete out.reasons;
      if (bk === 'features') delete out.features;
      if (bk === 'offer') delete out.offer;
      if (bk === 'different') delete out.different;
    }
  });
  // EXTRA VALUE SECTIONS (Print & Post / free trial / support) are only added
  // when the features and offer blocks are NOT shown, so nothing is repeated.
  var hasFeatureContent = !!(out.features && out.features.length) || !!(out.offer && out.offer.length);
  if(out.sections && out.sections.length<=3 && !hasFeatureContent){
    out.sections.push(
      {icon:'✉️',title:'Print & Post service, done for you',body:'We can print and post your outreach letters to every lead automatically. You just sign and send. Zero admin.'},
      {icon:'🎁',title:'7-day free trial included',body:'Every plan starts with a full week free. No obligation. See the leads before you pay a penny.'},
      {icon:'🤝',title:'Personal support',body:'Real humans, fast responses. We help you convert more from day one.'}
    );
  }
  // SECTOR BLOCK, ALWAYS included. This is the most important content: it tells
  // the customer which businesses this lead type is for, and why choosing
  // 9amLeads for THEIR sector is beneficial. Overrides any existing.
  out.sector = sectorBlock(p);
  // PRODUCT-SPECIFIC PAIN + ATTRACTION: inject tailored pain points and
  // attraction angles for this lead type so the email resonates and sells.
  var pc = PRODUCT_COPY[p.sector || p.key] || PRODUCT_COPY.default;
  if (pc && pc.painPoints) out.painPoints = pc.painPoints;
  if (pc && pc.attract) out.attract = pc.attract;
  if (pc && pc.leadTypes) out.leadTypes = pc.leadTypes;
  return JSON.parse(JSON.stringify(out));
}

module.exports={makeOnboardingLayout:makeOnboardingLayout};
console.log('content engine ready');
