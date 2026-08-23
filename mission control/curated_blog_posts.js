// Curated, high-quality blog posts for 9amLeads.
// These replace the thin auto-generated template posts. Each post is long-form,
// genuinely useful, UK-specific, and carries complete Article + FAQPage schema.
// Loaded at server startup by production_api_server.js (seedCuratedPosts).

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPostHTML(p) {
  var headTitle = p.title + ' | 9amLeads Blog';
  var canonical = 'https://9amleads.com/blog/' + p.slug;

  var body = '';
  for (var i = 0; i < p.sections.length; i++) {
    var s = p.sections[i];
    body += '<h2>' + esc(s.h) + '</h2>';
    for (var j = 0; j < s.body.length; j++) {
      var part = s.body[j];
      if (part.ul) {
        body += '<ul>' + part.ul.map(function(li) { return '<li>' + li + '</li>'; }).join('') + '</ul>';
      } else if (part.table) {
        var rows = part.table.map(function(row, ri) {
          var cells = row.map(function(c) { return ri === 0 ? '<th>' + c + '</th>' : '<td>' + c + '</td>'; }).join('');
          return '<tr>' + cells + '</tr>';
        }).join('');
        body += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">' + rows + '</table></div>';
      } else if (part.cta) {
        body += '<div style="background:rgba(14,165,233,0.07);border:1px solid rgba(14,165,233,0.18);border-radius:12px;padding:20px 22px;margin:24px 0"><strong style="color:#fff">' + part.cta + '</strong></div>';
      } else {
        body += '<p>' + part + '</p>';
      }
    }
  }

  var faqJson = '';
  var faqSection = '';
  if (p.faqs && p.faqs.length) {
    faqJson = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[' +
      p.faqs.map(function(f) {
        return '{"@type":"Question","name":' + JSON.stringify(f.q) + ',"acceptedAnswer":{"@type":"Answer","text":' + JSON.stringify(f.a) + '}}';
      }).join(',') + ']}</script>';
    faqSection = '<h2>Frequently Asked Questions</h2>' + p.faqs.map(function(f) {
      return '<h3 style="font-size:17px;margin:24px 0 8px;color:#f5f5f5">' + esc(f.q) + '</h3><p>' + esc(f.a) + '</p>';
    }).join('');
  }

  var articleJson = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":' +
    JSON.stringify(p.title) + ',"description":' + JSON.stringify(p.description) + ',"datePublished":"' + p.date + '"' +
    ',"dateModified":"' + p.date + '","author":{"@type":"Organization","name":"9amLeads","url":"https://9amleads.com"}' +
    ',"publisher":{"@type":"Organization","name":"9am Leads","url":"https://9amleads.com","logo":{"@type":"ImageObject","url":"https://9amleads.com/og-image.png"}}' +
    ',"mainEntityOfPage":"' + canonical + '","keywords":' + JSON.stringify(p.keywords.join(', ')) + ',"wordCount":' + p.word_count + '}</script>';

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(headTitle) + '</title>' +
    '<meta name="description" content="' + esc(p.description) + '">' +
    '<meta property="og:title" content="' + esc(p.title) + '">' +
    '<meta property="og:description" content="' + esc(p.description) + '">' +
    '<meta property="og:url" content="' + canonical + '">' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:site_name" content="9amLeads">' +
    '<link rel="canonical" href="' + canonical + '">' +
    articleJson + faqJson +
    '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">' +
    '<style>body{font-family:Inter,sans-serif;background:#000;color:#ccc;max-width:800px;margin:0 auto;padding:24px;line-height:1.8}h1,h2,h3{font-family:Outfit,sans-serif;color:#fff}h1{font-size:30px;font-weight:800;line-height:1.25}h2{font-size:22px;font-weight:700;margin-top:36px}p{color:#ccc;font-size:16px}a{color:#0ea5e9}ul{color:#ccc}table{border:1px solid #262626}th,td{border:1px solid #262626;padding:10px;text-align:left}th{background:#0d0d0d;color:#fff}strong{color:#fff}</style>' +
    '</head><body><h1>' + esc(p.title) + '</h1>' +
    '<p style="color:#888;font-size:14px;margin-top:-8px">' + esc(p.categoryLabel || '') + ' &middot; ' + esc(p.date) + ' &middot; ' + p.reading_time + '</p>' +
    '<p style="font-size:17px;color:#ddd">' + esc(p.description) + '</p>' +
    body + faqSection +
    '<hr style="border:none;border-top:1px solid #222;margin:36px 0">' +
    '<div style="font-size:13px;color:#666"><strong style="color:#aaa">About 9amLeads</strong> — We deliver fresh, exclusive UK business leads every morning at 9am across moving, probate, new business, planning permission and public sector tender opportunities. <a href="https://9amleads.com" style="color:#0ea5e9">Visit 9amLeads.com</a> to start your free 7-day trial.</div>' +
    '</body></html>';
}

var CURATED_POSTS = [
  {
    slug: 'moving-leads-playbook-for-removal-companies',
    title: 'Moving Leads for Removal Companies: The Complete Conversion Playbook',
    description: 'A practical playbook for UK removal companies on how to respond to moving leads fast, quote with confidence, follow up without annoying people, and turn first moves into repeat clients.',
    category: 'moving', product_name: 'Moving Leads', categoryLabel: 'Moving Leads',
    keywords: ['moving leads', 'moving leads for removal companies', 'convert moving leads', 'removal company lead generation', 'UK moving leads'],
    date: '2026-08-20', reading_time: '8 min read',
    faqs: [
      { q: 'How quickly should I contact a moving lead?', a: 'Aim for under 30 minutes, and absolutely inside 2 hours. When a property goes under offer or SSTC, the homeowner is actively comparing removal companies. The business that calls first wins a disproportionate share of the job, and a polite phone call builds far more trust than an email alone.' },
      { q: 'Are moving leads shared with other removal companies?', a: '9amLeads is a subscription data feed, not a marketplace. You receive your own daily allocation and we never send you the same opportunity twice. Because the underlying property listings are public, a competitor may spot the same move independently — which is exactly why speed of first contact matters.' },
      { q: 'How much do moving leads cost?', a: 'Moving leads start at £25 per week with a 7-day free trial and no card required. There are no auction dynamics or per-lead bidding — the price is fixed, so you can predict your monthly marketing cost precisely.' },
      { q: 'What postcode areas should I choose?', a: 'Start with the postcode districts you already work in most and where your crews run regularly. Expanding into adjacent districts with high listing volume grows your pipeline without spreading your response time too thin.' }
    ],
    sections: [
      { h: 'Why speed decides who wins the move', body: [
        'When a property goes on the market, appears as Sold Subject to Contract (SSTC), or exchanges contracts, a removal decision is already forming. The homeowner is comparing quotes, often within a two-to-four week window. Every hour of delay means another removal company gets their quote in first.',
        'In practice this means the first removal firm to make a warm, helpful phone call usually controls the conversation. Later callers end up competing on price. Earlier callers compete on service, personality and trust.',
        { cta: 'Get fresh moving leads in your postcode delivered every morning at 9am — start your free 7-day trial at 9amLeads.' }
      ]},
      { h: 'What a good moving lead looks like', body: [
        'A quality moving lead gives you enough to act immediately: the property address and postcode, the property type, the estimated move date where available, and the point in the sales process the property has reached.',
        'With that information you can pre-qualify before you even call — the property size tells you the van size, the move date tells you how to frame urgency, and the location tells you which crew is best placed.',
        { ul: ['Property type and approximate size (for van and crew planning)', 'Estimated move-in/move-out window', 'Local authority area so you can quote parking and access considerations', 'A realistic value signal so you can prioritise high-margin jobs'] }
      ]},
      { h: 'The first-call script that builds trust', body: [
        'Open with why you are calling, not what you are selling. Something like: "Hi, I saw your property in [area] looks to be moving soon and I wanted to check whether you\'ve booked a removal company yet. I run a local team — mind if I ask a couple of quick questions so I can give you an accurate quote?"',
        'Ask, then listen. When did you need to move? How much furniture? Any access restrictions — stairs, parking, gardens? What matters most to you — reliability, speed or keeping it affordable? The answers let you tailor the quote instead of reading from a price list.',
        { ul: ['Confirm the move dates before quoting anything', 'Note access issues (parking permits, narrow streets, stairs)', 'Ask if anything is fragile or high-value so you can flag insurance', 'End every call with a clear next step and a specific call-back time'] }
      ]},
      { h: 'Pricing: win the job, protect your margin', body: [
        'Price from your cost, not from the lowest quote you fear. A removal quote should reflect the crew hours, van time, mileage, packing materials and any specialist handling. Then add a margin that keeps the business sustainable — dropping prices to beat an unknown competitor usually means a rushed job and a one-star review.',
        'Present the quote clearly: what is included, what is not, and the payment terms. Homeowners choose confidence over the cheapest number every time when the two are close.',
        { table: [['Scenario', 'Typical price band (London)', 'Typical price band (regions)'], ['1-bed flat, local move', '£300 – £500', '£200 – £350'], ['3-bed house, local move', '£600 – £950', '£450 – £700'], ['3-bed house, long-distance', '£1,400 – £2,400', '£1,000 – £1,800']] }
      ]},
      { h: 'Follow up without being annoying', body: [
        'Most homeowners need two or three touches before they book. Agree the next touch at the end of every call and honour it — a text confirming your quote, a call the next morning, a reminder two days before their target move date.',
        'A simple three-touch sequence converts far more leads than a single quote followed by silence: call and quote today, text the written quote today, one follow-up call 48 hours later. After that, step back and let the homeowner come to you.',
        { cta: 'See how a structured morning workflow doubles conversion — start your free moving leads trial today.' }
      ]},
      { h: 'Turn one move into a client for life', body: [
        'A removal company that handles a move well is the first call for the next move, and the recommendation friends and family ask for. Send a thank-you message after the job, ask for a review, and add the customer to a simple six-month reminder list so you are top of mind when they next move.',
        'Referrals and repeat clients are the cheapest moving leads you will ever get. The job is to earn them on every single move — and a fast, organised response to fresh leads is where that chain starts.'
      ]}
    ]
  },
  {
    slug: 'probate-leads-for-solicitors-first-48-hours',
    title: 'Probate Leads for Solicitors: How to Win Instructions in the First 48 Hours',
    description: 'Why timing decides who wins probate instructions, how to make a sensitive and professional first contact with executors, and how to build a pipeline of probate leads your firm can rely on.',
    category: 'probate', product_name: 'Probate Leads', categoryLabel: 'Probate Leads',
    keywords: ['probate leads', 'probate leads for solicitors', 'win probate instructions', 'executor outreach', 'UK probate register'],
    date: '2026-08-19', reading_time: '8 min read',
    faqs: [
      { q: 'What are probate leads and where do they come from?', a: 'Probate leads are notifications of newly granted probate from the official Gov.uk probate register. Each entry names the deceased and the executor, which tells you a family is actively dealing with an estate and very likely needs legal help, property sale support or tax advice.' },
      { q: 'How fast do I need to contact the executor?', a: 'Within 24 to 48 hours of the grant being published. The data consistently shows the first firms to make contact win instruction at far higher rates, while waiting a week means the opportunity has usually gone to someone else.' },
      { q: 'Is cold contacting executors ethical and compliant?', a: 'The probate register is public data. You must follow your firm\'s compliance rules and treat the contact with empathy — a brief, respectful first touch rather than a hard sales pitch. Always honour opt-outs and stop immediately if asked.' },
      { q: 'Can probate leads lead to other work?', a: 'Yes. An executor contact frequently leads to estate administration, conveyancing for the property sale, wills, trusts and tax work. It is one of the highest-value first-touch points in private client law.' }
    ],
    sections: [
      { h: 'Why the first 48 hours decide the instruction', body: [
        'Every day the Gov.uk probate register publishes new grants. Each one represents a family who has just lost someone and now needs to deal with the estate. The firms that win these instructions are not usually the cheapest or the best known — they are simply the ones who make a respectful first contact first.',
        'The data is blunt: contacting an executor within 24 hours wins instructions at a much higher rate than waiting 72 hours, and waiting a week effectively hands the opportunity to a competitor.',
        { cta: 'Get probate leads from the official register delivered at 9am every morning — start your free 7-day trial.' }
      ]},
      { h: 'Understanding the person behind the grant', body: [
        'A probate lead is not a cold sales prospect. It is a grieving family managing paperwork, finances and often a house sale. The winning approach is empathy first, expertise second.',
        'Before you contact anyone, read everything the lead tells you: the grant type, the registry location and the estate context. That lets you offer something genuinely relevant — estate administration, help with the property sale, or inheritance tax — instead of a generic "do you need a solicitor?" message.',
        { ul: ['Acknowledge the situation before you introduce your services', 'Keep the first contact short, human and low-pressure', 'Be specific about what you can help with based on the estate', 'Never imply the family must act now — offer support, not urgency'] }
      ]},
      { h: 'The first contact: letter, email and phone', body: [
        'A combination works best. A short, warm letter or email first — so the executor can read it in their own time — followed by one gentle follow-up a few days later. Phone calls can feel intrusive at this moment, so use them only after a written touch.',
        'What to include: who you are, a line of sympathy, one or two concrete ways you can help (estate administration, property sale, tax), and an easy way to reply. No jargon, no pricing push, no pressure.',
        { cta: 'Build a repeatable first-contact workflow with daily probate leads — start your free trial.' }
      ]},
      { h: 'Build a pipeline, not a one-off campaign', body: [
        'Probate work compounds. Every instruction handled well becomes a referral source and a client who may return for wills and trusts. A daily probate feed means your team always has a steady stream of new files to work — smoothing out the feast-and-famine cycles of private client work.',
        'Track your numbers: leads received, first contacts made, instructions won, average fee. Once you know your conversion rate, you can forecast how many probate leads your firm needs each week to hit its growth target.',
        { table: [['Metric', 'Why it matters', 'Good benchmark'], ['First contact within 24h', 'Decides most instructions', '80%+ of leads'], ['Contact to instruction rate', 'Shows your message is working', '15–30%'], ['Average fee per file', 'Pricing and profitability', 'Firm-specific']] }
      ]},
      { h: 'Positioning your firm to win', body: [
        'Executors usually choose based on reassurance, not price. Make your firm easy to choose: a clear page about probate and estates, a named contact, and a description of the process in plain English. When your outreach is backed by a strong web presence, the conversion lifts noticeably.',
        'Combine your probate lead response with onward opportunities — conveyancing for the property sale, wills for the wider family — and one probate instruction frequently becomes several streams of work.'
      ]}
    ]
  },
  {
    slug: 'new-business-leads-companies-house-b2b-guide',
    title: 'New Business Leads From Companies House: A B2B Outreach Guide',
    description: 'How accountants, web designers, IT firms and other B2B service providers can turn new Companies House registrations into clients — with a practical outreach cadence.',
    category: 'newbusiness', product_name: 'New Business Leads', categoryLabel: 'New Business Leads',
    keywords: ['new business leads', 'Companies House leads', 'new company registrations', 'B2B lead generation', 'new business outreach'],
    date: '2026-08-18', reading_time: '7 min read',
    faqs: [
      { q: 'What is a new business lead?', a: 'It is a newly registered company from the official Companies House register. A new registration means a director has just taken the biggest step of their professional life — and now needs everything from accounts and insurance to websites and IT, often within the first few weeks.' },
      { q: 'Why target newly registered companies?', a: 'New companies are actively shopping for services. They have no incumbent supplier yet, which makes them far easier to win than established firms with loyal providers. First-mover advantage matters enormously in the first 30 days.' },
      { q: 'Which businesses should use new business leads?', a: 'Accountants, bookkeepers, web designers, marketing agencies, IT and telecoms providers, insurers, recruiters, solicitors and virtual offices all sell something every new company needs. The register even tells you the company\'s industry via its SIC code.' },
      { q: 'How do I choose which new businesses to contact?', a: 'Filter by SIC code, location and company type to match your ideal client. A small agency might target limited companies in their home region; an accountant might target companies over a certain registered capital or in high-growth sectors.' }
    ],
    sections: [
      { h: 'The Companies House advantage', body: [
        'Every limited company in the UK appears on the public register the moment it incorporates. That public moment is a commercial opportunity: the new director has made a decision to start trading, and a list of services is needed in the next few weeks.',
        'For B2B providers the timing is the entire game. Contact a director in the first fortnight and you are the only provider they have spoken to. Contact them three months later and they have already chosen their accountant, their bank and their website builder.',
        { cta: 'Receive new business leads from Companies House every morning at 9am — start your free trial.' }
      ]},
      { h: 'Who to target (and how to prioritise)', body: [
        'The register tells you the company type, registered office location and the industry SIC code. That is enough to build a tightly-matched prospect list instead of cold-calling everyone.',
        { table: [['Your service', 'Best SIC / signal to filter on'], ['Accountant / bookkeeper', 'All limited companies in your region'], ['Web design / marketing', 'E-commerce, retail, professional services'], ['IT / telecoms', 'Tech, legal, financial services firms'], ['Insurance / compliance', 'Construction, transport, healthcare']] },
        { ul: ['Filter by SIC code to match your ideal client profile', 'Filter by location to keep travel and relevance high', 'Prioritise companies with multiple directors or higher capital', 'Skip dormant companies that may never trade'] }
      ]},
      { h: 'A first-contact cadence that gets replies', body: [
        'New directors are busy and slightly overwhelmed. Keep the first touch short, helpful and specific to their company. Reference the company by name and offer one concrete thing they genuinely need in the first month.',
        'A simple cadence works: day one email, day three follow-up email, day seven a short call or LinkedIn message. Then step back. Most conversions happen after the first two touches, so consistency beats cleverness.',
        { ul: ['Email 1: congratulations + one specific value-add', 'Email 2: a relevant example or resource, no hard sell', 'Call/LinkedIn on day 7: ask how it is going', 'Stop after three touches unless they engage'] }
      ]},
      { h: 'Services every new company buys', body: [
        'The fastest way to convert a new business lead is to offer something the director has already realised they need. The first month after incorporation is when the following decisions get made:',
        { ul: ['Accounting, bookkeeping and tax registration', 'Business bank account and payment setup', 'Website, domain and business email', 'Insurance, compliance and legal review', 'IT, telecoms, phone systems and software'] }
      ]},
      { h: 'Turn first clients into long-term accounts', body: [
        'A newly registered company that is won early tends to stay. Onboard smoothly, invoice clearly, and review their needs at 3, 6 and 12 months. The lifetime value of one new-company client frequently multiplies the effort of the first contact.',
        'Add each converted client to a simple care cycle — a quarterly check-in or a newsletter with genuinely useful content — so you grow the account and earn referrals as their business expands.'
      ]}
    ]
  },
  {
    slug: 'planning-permission-leads-for-builders-and-trades',
    title: 'Planning Permission Leads: How Builders and Tradespeople Win Extension Projects',
    description: 'How builders, architects, kitchen fitters and other trades can turn new planning applications into confirmed projects by reading applications well, quoting fast and offering design-build.',
    category: 'planning', product_name: 'Planning Permission Leads', categoryLabel: 'Planning Permission Leads',
    keywords: ['planning permission leads', 'planning application leads', 'planning leads for builders', 'extension leads', 'construction lead generation'],
    date: '2026-08-17', reading_time: '7 min read',
    faqs: [
      { q: 'What are planning permission leads?', a: 'They are newly submitted planning applications from UK local authority planning portals. Each application names the applicant and the project — a rear extension, loft conversion, new build or kitchen upgrade — which tells you a homeowner is ready to spend money on construction.' },
      { q: 'Why should tradespeople target planning applicants?', a: 'Applying for planning permission is a strong buying signal. The applicant has already invested time and money in design work, which means a real project with a budget. Reaching them early means you can quote before they have lined up a builder.' },
      { q: 'How quickly should I respond to a planning lead?', a: 'Fast. Homeowners often collect quotes while their application is being decided, so contacting them within hours of the application being published puts you first in the queue. Speed plus a sensible quote wins most projects.' },
      { q: 'Do I need to wait for planning approval?', a: 'No. You can build a relationship during the decision period — offering advice, cost guidance and design-build services — so that when approval lands you are the builder they already trust.' }
    ],
    sections: [
      { h: 'Why a planning application is a buying signal', body: [
        'A planning application is one of the clearest signals a homeowner will spend money on construction. To submit one they have already paid for drawings, engaged an architect, and decided the project is worth it. That is not a browsing prospect — that is an active project with a budget.',
        'For builders, architects, kitchen and bathroom fitters and loft specialists, the window between application and approval is the best time to make contact: the homeowner is comparing quotes and no one has won the job yet.',
        { cta: 'Get planning permission leads matched to your trade and area — start your free 7-day trial.' }
      ]},
      { h: 'How to read a planning application', body: [
        'A good planning lead gives you the address, application type, project description and applicant details. That is enough to judge the project value before you call.',
        { ul: ['Application type: extension, loft conversion, new build, garage conversion', 'Project description: what is actually being built', 'Estimated project value and scale of the works', 'Council and application reference for your records'] },
        { table: [['Application type', 'Typical spend'], ['Rear / side extension', '£40,000 – £90,000'], ['Loft conversion', '£35,000 – £60,000'], ['New build', '£150,000+'], ['Kitchen / bathroom (PD)', '£10,000 – £40,000']] }
      ]},
      { h: 'The outreach that wins the project', body: [
        'Contact the applicant with something useful, not a generic pitch. Reference their specific project — "I see you\'ve submitted plans for a two-storey rear extension in [area]" — and offer a free, no-obligation costing or a call about timelines.',
        'Be genuinely helpful during the decision period. Offer to talk through build costs, structural considerations or sequencing. When the approval lands, you are the builder they already know and trust.',
        { cta: 'Be first to quote on local extension projects — start your free planning leads trial.' }
      ]},
      { h: 'Offer design-build to win more work', body: [
        'Many homeowners find managing an architect and a builder separately stressful. If you offer design-build — where your firm handles drawings, planning, building regulations and the build itself — you remove that friction and win projects that would otherwise go to multiple competitors.',
        'Positioning yourself as a single accountable partner justifies a better price and earns stronger referrals, because the homeowner has one team to trust from start to finish.'
      ]},
      { h: 'Build a pipeline across your area', body: [
        'Construction work is cyclical, and the firms that thrive are the ones with a constant pipeline of enquires. A daily feed of planning applications in your postcode districts means you always have new projects to quote, regardless of referrals or repeat clients.',
        'Track your numbers the same way you track jobs: applications received, quotes sent, projects won, average job value. That data tells you which areas and application types to focus on next.'
      ]}
    ]
  },
  {
    slug: 'public-sector-tenders-for-small-businesses',
    title: 'Public Sector Tenders for Small Businesses: How to Win Your First Contract',
    description: 'A clear guide to public sector tender opportunities for UK SMEs — where they come from, how the evaluation process works, and how to write responses that actually win.',
    category: 'tenders', product_name: 'Tender Opportunities', categoryLabel: 'Tender Opportunities',
    keywords: ['public sector tenders', 'UK government tenders', 'tenders for small business', 'bid writing', 'Contracts Finder opportunities'],
    date: '2026-08-16', reading_time: '8 min read',
    faqs: [
      { q: 'What are public sector tender opportunities?', a: 'They are contract opportunities published by UK public bodies — councils, NHS trusts, schools, government departments — for goods, works and services. Small businesses can win them via platforms such as Contracts Finder and PCS (Public Contracts Scotland).' },
      { q: 'Can small businesses really win tenders?', a: 'Yes. Many contracts are reserved or weighted to favour SMEs, and buyers often prefer local, specialist suppliers. Winning your first contract is mostly about picking the right opportunities and answering the questions completely.' },
      { q: 'How long does the tendering process take?', a: 'From spotting a relevant contract to winning it usually takes four to twelve weeks, depending on the tender value and whether there is a selection (SQ) stage before the full bid. Build in time for the quality questions.' },
      { q: 'Do I need specialist bid writing help?', a: 'Not for your first contracts. A structured response that directly answers every question, provides evidence, and reflects the evaluation scoring will outperform a polished but generic one. Add specialist help once you scale.' }
    ],
    sections: [
      { h: 'Why public sector work is worth pursuing', body: [
        'Public sector buyers pay reliably, re-tender contracts, and are under pressure to spend with local and small businesses. For a cleaning firm, IT provider, construction company or consultancy, a single framework or recurring contract can smooth out the ups and downs of private clients.',
        'The barrier for most SMEs is not capability — it is not seeing the right opportunities and not knowing how the scoring works. Both are solvable.',
        { cta: 'Get public sector tender opportunities matched to your sector delivered at 9am — start your free trial.' }
      ]},
      { h: 'Where tender opportunities come from', body: [
        'In England and Wales, the main platform is Contracts Finder, backed by Find a Tender for higher-value work. Scotland uses Public Contracts Scotland and Northern Ireland uses eTendersNI. NHS and local-authority portals publish many opportunities too.',
        'A daily tender feed saves hours of scanning these portals. You receive the ones that match your sector, region and contract value — so you spend your time bidding, not searching.',
        { table: [['Platform', 'Covers', 'Best for'], ['Contracts Finder', 'England & Wales', 'Most SME contracts'], ['Find a Tender', 'UK (higher value)', 'Larger frameworks'], ['Public Contracts Scotland', 'Scotland', 'Scottish buyers'], ['eTendersNI', 'Northern Ireland', 'NI public bodies']] }
      ]},
      { h: 'How tender evaluation actually works', body: [
        'Tenders are scored against published criteria — usually price (weighted 20–40%) and quality (weighted 60–80%). The quality mark is won by answering every question precisely and evidencing your claims, not by writing more words.',
        'Read the specification twice, then answer each question in the exact structure the buyer asks for. Reference your past contracts and include real examples. A tidy, complete response always outscores a long, vague one.',
        { ul: ['Answer every question, even ones that seem optional', 'Use the buyer\'s own headings and structure', 'Evidence claims with named contracts and results', 'Price realistically — buyers reject outliers on both ends'] }
      ]},
      { h: 'Pick the right first contract', body: [
        'Your first tender should be one you are almost certain to win. Choose a contract slightly below your ideal value, in a sector you know deeply, for a buyer near you. Winning builds the track record (and the confidence) for bigger bids.',
        'Avoid the temptation to bid on everything. Better to respond excellently to three opportunities a month than poorly to twenty.',
        { cta: 'Find your first winnable contract with a daily tender feed — start your free trial.' }
      ]},
      { h: 'Turn one win into a stream of work', body: [
        'Buyers re-tender and award extensions to suppliers who deliver. Do excellent work on your first contract, ask for feedback (buyers must give it), and keep an eye out for the same buyer\'s new opportunities. One satisfied public sector client becomes a reference for everything you bid next.'
      ]}
    ]
  },
  {
    slug: 'uk-business-leads-complete-guide',
    title: 'UK Business Leads: The Complete Guide to Daily Lead Generation',
    description: 'Everything UK businesses need to know about buying and converting business leads — the five lead types we deliver, how daily delivery works, how it compares to PPC, and how to get results.',
    category: 'general', product_name: 'Business Leads', categoryLabel: 'Business Leads',
    keywords: ['UK business leads', 'daily lead generation', 'buy business leads', 'lead generation guide', '9amLeads how it works'],
    date: '2026-08-15', reading_time: '9 min read',
    faqs: [
      { q: 'How does 9amLeads deliver leads?', a: 'Every morning at 9am UK time you receive your matched leads in your dashboard and email. We scrape and process official public sources overnight — property portals, the probate register, Companies House, council planning portals and public tender platforms — then match the results to your trade and chosen postcode areas.' },
      { q: 'Is 9amLeads better than PPC?', a: 'They solve different problems. PPC captures people actively searching; 9amLeads puts you in front of fresh public opportunities your competitors haven\'t seen. Many customers run both, but daily data feeds give you a predictable pipeline at a fixed price with no auction dynamics.' },
      { q: 'Which lead type should I choose?', a: 'Choose the one that matches how you win work today. Removal companies and estate agents use moving leads; solicitors use probate leads; accountants and web designers use new business leads; builders use planning leads; and services businesses use tender opportunities. You can change or add types at any time.' },
      { q: 'Do I need a marketing team to use these leads?', a: 'No. A simple workflow — review your leads at 9am, contact the strongest ones within the hour, log your follow-ups — is enough to see results. Our platform gives you the data; you bring your phone and your expertise.' }
    ],
    sections: [
      { h: 'The five lead types explained', body: [
        '9amLeads covers five categories of UK business opportunity, each sourced from official public data:',
        { table: [['Lead type', 'Source', 'Best for'], ['Moving leads', 'Rightmove & property listings', 'Removal companies, estate agents'], ['Probate leads', 'Gov.uk probate register', 'Solicitors, estate administrators'], ['New business leads', 'Companies House register', 'Accountants, web designers, B2B'], ['Planning leads', 'Council planning portals', 'Builders, architects, tradespeople'], ['Tender opportunities', 'Contracts Finder & public portals', 'Cleaning, IT, construction, FM']] }
      ]},
      { h: 'How daily delivery creates a winning habit', body: [
        'Daily beats weekly for a simple reason: consistency builds a routine. When leads arrive at the same time every morning, reviewing them becomes part of the day\'s start, and prospects are contacted while they are freshest — often before competitors have seen the same public listing.',
        'The data feed does the searching, filtering and matching. You simply choose the strongest opportunities and respond fast, which is exactly where conversion is won.',
        { cta: 'Start your free 7-day trial and see your first leads at 9am tomorrow.' }
      ]},
      { h: 'Business leads vs PPC vs directories', body: [
        'Most marketing channels compete for attention. Directories show you to people who may not be buying, and PPC lets you bid against everyone searching for the same service. Data feeds work differently: they surface a specific new event — a property under offer, a grant, an incorporation, an application, a tender — before most people know it exists.',
        { table: [['Channel', 'Who sees you', 'Cost model'], ['PPC', 'People actively searching', 'Auction, rising CPCs'], ['Directories', 'Anyone browsing', 'Listing fees / per-lead'], ['Data feed (9amLeads)', 'You, on fresh public events', 'Fixed weekly price']] }
      ]},
      { h: 'A simple system to convert more leads', body: [
        'The teams that convert best follow a repeatable process, not a clever trick:',
        { ul: ['Review leads at 9am and rank by value and fit', 'Contact the top leads within the hour', 'Use a short script that asks before it sells', 'Send a written quote the same day', 'Follow up after 48 hours, then step back', 'Track lead-to-job conversion and refine'] }
      ]},
      { h: 'Choosing your postcode areas', body: [
        'Select the postcode districts where your team already works best. Start narrow and expand once your response times stay fast. A feed covering areas you can actually serve beats a national feed you cannot keep up with.',
        'You can change your areas as the business grows — the platform is built around matching supply to your capacity, not the other way around.'
      ]},
      { h: 'Get started in minutes', body: [
        'Every lead type comes with a 7-day free trial and no card required. Pick your trade, choose your postcode areas, and your first daily batch arrives at 9am the next morning. Start the habit early, respond fast, and let the data do the hunting.'
      ]}
    ]
  }
];

module.exports = { CURATED_POSTS: CURATED_POSTS, buildPostHTML: buildPostHTML };
