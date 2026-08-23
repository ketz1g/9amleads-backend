// Curated, high-quality blog posts for 9amLeads.
// These replace the thin auto-generated template posts. Each post is long-form,
// genuinely useful, UK-specific, and carries complete Article + FAQPage schema.
// Loaded at server startup by production_api_server.js (seedCuratedPosts).

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

var CAT_PAGE = { moving: 'https://9amleads.com/who-we-serve/', probate: 'https://9amleads.com/who-we-serve/', newbusiness: 'https://9amleads.com/who-we-serve/', planning: 'https://9amleads.com/who-we-serve/', tenders: 'https://9amleads.com/who-we-serve/', general: 'https://9amleads.com/how-it-works/' };
var CAT_NAME = { moving: 'Moving Leads', probate: 'Probate Leads', newbusiness: 'New Business Leads', planning: 'Planning Permission Leads', tenders: 'Tender Opportunities', general: 'Business Leads' };
var CAT_COLOR = { moving: '#FF6B35', probate: '#A855F7', newbusiness: '#06B6D4', planning: '#10B981', tenders: '#6366F1', general: '#0EA5E9' };

function relatedPosts(p, max) {
  if (!CURATED_POSTS || !CURATED_POSTS.length) return '';
  var same = CURATED_POSTS.filter(function(x) { return x.slug !== p.slug && x.category === p.category; });
  var other = CURATED_POSTS.filter(function(x) { return x.slug !== p.slug && x.category !== p.category; });
  var picks = same.concat(other).slice(0, max || 3);
  if (!picks.length) return '';
  return '<h2>Related Guides</h2>' + picks.map(function(x) {
    return '<p style="margin:10px 0"><a href="https://9amleads.com/blog/' + x.slug + '" style="color:#0ea5e9;font-weight:600;text-decoration:none">' + esc(x.title) + '</a></p>';
  }).join('');
}

function buildPostHTML(p) {
  var headTitle = p.title + ' | 9amLeads Blog';
  var canonical = 'https://9amleads.com/blog/' + p.slug;
  var pageUrl = (p.ctaUrl || CAT_PAGE[p.category] || 'https://9amleads.com/');
  var heroImg = 'https://9amleads.com/blog/img/' + p.slug + '.png';
  var ogImg = 'https://9amleads.com/blog/og/' + p.slug + '.png';

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
        var href = part.href || pageUrl;
        body += '<p style="margin:28px 0;text-align:center"><a href="' + href + '" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;box-shadow:0 4px 20px rgba(14,165,233,.3)">' + esc(part.cta) + '</a></p>';
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

  var color = CAT_COLOR[p.category] || '#0ea5e9';
  var productName = p.product_name || CAT_NAME[p.category] || 'Business Leads';

  var articleJson = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":' +
    JSON.stringify(p.title) + ',"description":' + JSON.stringify(p.description) + ',"datePublished":"' + p.date + '"' +
    ',"dateModified":"' + p.date + '","image":"' + ogImg + '","author":{"@type":"Organization","name":"9amLeads","url":"https://9amleads.com"}' +
    ',"publisher":{"@type":"Organization","name":"9am Leads","url":"https://9amleads.com","logo":{"@type":"ImageObject","url":"https://9amleads.com/og-image.png"}}' +
    ',"mainEntityOfPage":"' + canonical + '","keywords":' + JSON.stringify(p.keywords.join(', ')) + ',"wordCount":' + p.word_count + '}</script>';

  var finalCta = '<div style="background:linear-gradient(135deg,' + color + '1a,rgba(14,165,233,.06));border:1px solid ' + color + '44;border-radius:16px;padding:28px;margin:36px 0;text-align:center">' +
    '<h2 style="margin:0 0 8px;font-size:24px">Try ' + esc(productName) + ' for free</h2>' +
    '<p style="margin:0 0 18px;color:#aaa;font-size:15px">Get fresh UK leads delivered every morning at 9am, matched to your trade and postcode areas. No card required.</p>' +
    '<a href="https://9amleads.com/portal/#signup" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;text-decoration:none;padding:14px 30px;border-radius:10px;font-weight:700;margin:0 6px;box-shadow:0 4px 20px rgba(14,165,233,.3)">Start your free 7-day trial</a>' +
    '<a href="' + pageUrl + '" style="display:inline-block;border:1px solid #333;color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;margin:6px">Explore ' + esc(CAT_NAME[p.category] || 'lead types') + '</a>' +
    '</div>';

  var related = relatedPosts(p, 3);

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(headTitle) + '</title>' +
    '<meta name="description" content="' + esc(p.description) + '">' +
    '<meta property="og:title" content="' + esc(p.title) + '">' +
    '<meta property="og:description" content="' + esc(p.description) + '">' +
    '<meta property="og:url" content="' + canonical + '">' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:site_name" content="9amLeads">' +
    '<meta property="og:image" content="' + ogImg + '">' +
    '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + esc(p.title) + '">' +
    '<meta name="twitter:description" content="' + esc(p.description) + '">' +
    '<meta name="twitter:image" content="' + ogImg + '">' +
    '<link rel="canonical" href="' + canonical + '">' +
    articleJson + faqJson +
    '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">' +
    '<style>body{font-family:Inter,sans-serif;background:#000;color:#ccc;max-width:800px;margin:0 auto;padding:24px;line-height:1.8}h1,h2,h3{font-family:Outfit,sans-serif;color:#fff}h1{font-size:30px;font-weight:800;line-height:1.25}h2{font-size:22px;font-weight:700;margin-top:36px}p{color:#ccc;font-size:16px}a{color:#0ea5e9}ul{color:#ccc}table{border:1px solid #262626}th,td{border:1px solid #262626;padding:10px;text-align:left}th{background:#0d0d0d;color:#fff}strong{color:#fff}img{max-width:100%;height:auto;border-radius:12px}</style>' +
    '</head><body><h1>' + esc(p.title) + '</h1>' +
    '<p style="color:#888;font-size:14px;margin-top:-8px">' + esc(p.categoryLabel || '') + ' &middot; ' + esc(p.date) + ' &middot; ' + p.reading_time + '</p>' +
    '<p style="font-size:17px;color:#ddd">' + esc(p.description) + '</p>' +
    '<img src="' + heroImg + '" alt="' + esc(p.title) + '" width="1200" height="630" loading="lazy" style="width:100%;height:auto;border-radius:14px;margin:8px 0 20px">' +
    body + finalCta + related + faqSection +
    '<hr style="border:none;border-top:1px solid #222;margin:36px 0">' +
    '<div style="font-size:13px;color:#666"><strong style="color:#aaa">About 9amLeads</strong> — We deliver fresh, exclusive UK business leads every morning at 9am across moving, probate, new business, planning permission and public sector tender opportunities. <a href="https://9amleads.com" style="color:#0ea5e9">Visit 9amLeads.com</a> to start your free 7-day trial. <a href="https://9amleads.com/pricing/" style="color:#0ea5e9">See pricing</a> · <a href="https://9amleads.com/how-it-works/" style="color:#0ea5e9">How it works</a>.</div>' +
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
  },
  {
    slug: 'moving-leads-postcode-strategy',
    title: 'How to Choose the Right Postcode Areas for Your Moving Leads',
    description: 'A practical, data-led approach to selecting UK postcode territories for moving leads — how to balance volume, response time, margin and competition so your removal company actually converts what it receives.',
    category: 'moving', product_name: 'Moving Leads', categoryLabel: 'Moving Leads',
    keywords: ['moving leads postcode targeting', 'best postcodes for moving leads', 'removal territory planning', 'postcode areas for removals', 'moving leads strategy'],
    date: '2026-08-22', reading_time: '8 min read',
    faqs: [
      { q: 'How many postcode areas should I cover?', a: 'Enough to keep your vans busy, but only what you can respond to fast. Most single-vehicle removal companies start with 3–6 postcode districts and expand once their first-contact response stays under an hour. Response speed is worth more than extra territory.' },
      { q: 'Should I choose high-volume or high-value areas?', a: 'It depends on your model. High-volume areas near major cities generate more enquiries but attract more competition. High-value rural or commuter-belt areas have fewer leads but larger moves and better margins. The best strategy is usually a balanced mix that fits your crew capacity.' },
      { q: 'Can I change my postcode areas later?', a: 'Yes. Your areas are not locked in. Review them quarterly against your conversion data and rebalance — drop districts where you rarely win and add adjacent ones where listings are growing.' },
      { q: 'What makes one postcode better than another for moving leads?', a: 'Look at four factors: listing and transaction volume, average property size (bigger homes usually mean bigger moves), access and parking difficulty, and how much competition you already face there. The ideal area scores well on volume and margin but poorly on competition.' }
    ],
    sections: [
      { h: 'Why territory choice decides your results', body: [
        'Two removal companies with identical lead quality can get completely different results purely because of the postcode areas they chose. One picks districts where vans can reach quickly and properties are the right size for their crew; the other spreads across areas they cannot serve well. The leads are the same — the outcomes are not.',
        'Territory planning is the cheapest improvement you can make. It costs nothing to change your areas, but it directly controls how many leads you see, how quickly you can respond, and how profitable each job is.',
        { cta: 'Test moving leads in your postcode districts with a free 7-day trial — no card required.' }
      ]},
      { h: 'The four factors that matter', body: [
        'When you evaluate a postcode district for moving leads, score it against four things rather than choosing by gut feel:',
        { ul: ['Volume — how many properties list and transact in the district each month', 'Property mix — average size and type, because a three-bed house moves differently from a one-bed flat', 'Accessibility — how quickly a van from your base can reach the district and whether parking is practical', 'Competition — how many other removal companies already advertise there'] },
        'A district can be full of listings and still be wrong for you if the moves are small, hard to reach, or fiercely fought over.'
      ]},
      { h: 'Build around your crew, not your ambition', body: [
        'Your vans and teams are the constraint. A three-crew operation can comfortably serve a ring of districts within a 45–60 minute drive, keeping travel time and empty return legs low. Every area you add beyond that pushes your average response time up — and response time is the single biggest factor in winning a move.',
        'Start with the districts where you already do most of your work. Your reputation and local knowledge there convert at a higher rate than anywhere new, even if the volume looks smaller on paper.'
      ]},
      { h: 'Use data to pick, not guess', body: [
        'The UK publishes a lot of open housing data, and your lead feed gives you the rest. Look at property listings and transaction counts by district, and once you are receiving moving leads, track three numbers per area: leads received, quotes sent, jobs won.',
        { table: [['Postcode district', 'Leads / month', 'Quotes sent', 'Jobs won'], ['SW9 (central)', '14', '11', '4'], ['BR1 (suburban)', '22', '16', '9'], ['RH6 (commuter belt)', '9', '8', '5']] },
        'The table is a real example of why volume is not everything: BR1 wins 9 of 16 quotes while SW9 wins only 4 of 11. Your conversion data should always win the argument over raw lead count.'
      ]},
      { h: 'Match area to margin, not just volume', body: [
        'A long-distance move from a large house in the commuter belt is worth several local flat moves. If your model is built on fewer, larger, higher-margin jobs, favour districts with bigger average property sizes even when their listing volume is lower.',
        'Write down what your ideal job looks like — van size, crew days, distance, price — and choose the districts where that job is most common. Every lead from a mismatched area costs you time you could have spent on a better fit.'
      ]},
      { h: 'Review and rebalance quarterly', body: [
        'Territories change: new housing developments shift volume, roadworks change access, and competitors come and go. Schedule a quarterly review where you compare each district on leads, conversion and margin, then rebalance. Drop what underperforms, add what looks promising, and keep the mix that lets your crews respond fast.',
        'A moving lead strategy is not set once. It is a living plan that improves every time you look at your numbers.'
      ]}
    ]
  },
  {
    slug: 'removal-company-pricing-strategies',
    title: 'Removal Company Pricing: How to Quote Moving Leads to Win Without Slashing Prices',
    description: 'Why the cheapest quote usually loses in the long run, how to build a removal quote that protects margin and wins the job, and how to respond to pushback without discounting.',
    category: 'moving', product_name: 'Moving Leads', categoryLabel: 'Moving Leads',
    keywords: ['removal company pricing', 'how to quote removals', 'moving quote strategy', 'removal pricing margins', 'win removal quotes'],
    date: '2026-08-21', reading_time: '8 min read',
    faqs: [
      { q: 'Should I price below my competitors to win the move?', a: 'Rarely. The cheapest quote attracts the riskiest customers, compresses your margin, and sets the tone for the whole job. When two quotes are close, the homeowner chooses the one that feels most trustworthy — which is a function of your communication, not your price.' },
      { q: 'How do I price a removal without underquoting?', a: 'Build the quote from your real inputs: crew hours, van time, mileage, parking and access, materials, and specialist handling. Add your required margin on top. If the total is higher than you expected, the job is more expensive than you estimated — not the other way around.' },
      { q: 'What do I do if the customer says a competitor is cheaper?', a: 'Stay confident and add value instead of cutting price. Explain what is included in your quote, ask what the other quote covers, and offer something meaningful — insurance levels, an experienced crew, or a fixed-price guarantee. Offer to match only if you can do it without damaging margin.' },
      { q: 'Should I charge extra for parking, stairs or long distances?', a: 'Yes — but be transparent. Homeowners respect a clearly itemised quote that explains why a job costs what it costs. Hidden extras cause complaints and refund requests; visible, justified line items build trust and protect you.' }
    ],
    sections: [
      { h: 'The race to the bottom is optional', body: [
        'When a homeowner collects three removal quotes, the temptation is to believe the cheapest one wins. In practice the job often goes to the company that communicates best — and the cheapest quote frequently loses, because low price signals low quality to a careful customer.',
        'If you win every quote by being cheapest, you are systematically underpricing. Your pricing is a promise about the quality of the move, so make it reflect the service you actually deliver.',
        { cta: 'Get fresh moving leads in your postcode and practise confident, margin-protecting quotes — start your free trial.' }
      ]},
      { h: 'Build the quote from real inputs', body: [
        'A defensible removal quote is arithmetic, not a guess. Estimate the inputs before you name a price:',
        { ul: ['Crew hours — how long the load and unload will really take', 'Van time and mileage, including the return leg', 'Parking permits, meter feeding and access constraints', 'Packing materials and specialist handling (pianos, art, safes)', 'Insurance and administrative overhead'] },
        'Add your target margin and you have your price. When you can explain every line item, you can defend it with confidence — and you stop giving away margin to avoid awkward conversations.'
      ]},
      { h: 'Anchor with a confident first number', body: [
        'The first number you name sets the anchor for the conversation. If you hesitate, downgrade or apologise for your price, the customer will treat it as negotiable. If you present a clear, complete price and stand behind it, you change the conversation from "can you do it cheaper?" to "what is included?".',
        'Present the price as the natural cost of a proper removal, not as a favour. Then let the value you have already built — speed of response, professionalism, clear communication — do the selling.'
      ]},
      { h: 'Responding to pushback without discounting', body: [
        'When a customer says a competitor is cheaper, do not reflexively discount. Instead:',
        { ul: ['Acknowledge it calmly — no defensiveness', 'Ask what the other quote actually includes (many miss parking, insurance or VAT)', 'Restate what your price covers and why it protects the customer', 'Offer a meaningful concession that costs you little, such as a fixed-price guarantee or an extra hour of packing', 'Know your walk-away number before the call and stick to it'] },
        'A discount given easily tells the customer your first price was too high. A price defended with value earns respect — even when they choose someone else, they will remember you as the professional one.'
      ]},
      { h: 'Value-based pricing for the jobs you want', body: [
        'A two-bed flat move and a five-bed family home move are different products, not the same service at different prices. Price the outcome, not the hours: a stressed family paying for a reliable, on-time move to their new home is buying certainty. Premium service, clear communication and a guaranteed crew command a premium price.',
        'Charge accordingly and let your marketing and reviews justify it. The customers who pay premium prices are the ones who become your repeat clients and referrals.'
      ]}
    ]
  },
  {
    slug: 'probate-executor-communication-guide',
    title: 'How to Talk to Executors About Probate: A Communication Guide for Solicitors',
    description: 'The sensitive, professional communication skills that win probate instructions — what to say in the first contact, how to handle difficult conversations, and how to build trust with grieving families.',
    category: 'probate', product_name: 'Probate Leads', categoryLabel: 'Probate Leads',
    keywords: ['talk to executors probate', 'probate communication', 'probate leads for solicitors', 'executor outreach', 'win probate instructions'],
    date: '2026-08-20', reading_time: '7 min read',
    faqs: [
      { q: 'Should I contact executors by phone or letter?', a: 'Start with a short, warm written contact so the executor can read it in their own time, then one gentle follow-up a few days later. A cold phone call can feel intrusive while the family is grieving, so use calls only after a written touch or when the executor has shown interest.' },
      { q: 'How do I sound helpful rather than salesy?', a: 'Lead with the situation, not your firm. Say who you are, why you are contacting them, and one or two concrete ways you can take work off their plate. Use plain English, avoid jargon and fees talk, and make it easy to reply. Never push or create urgency.' },
      { q: 'What if the executor is distressed or upset?', a: 'Slow down, acknowledge the loss, and do not rush to business. Offer support first: "I\'m sorry for your loss. Take your time — I\'m happy to explain the process whenever you\'re ready." If they are not ready, leave the door open and offer to call back.' },
      { q: 'Is it appropriate to follow up more than once?', a: 'One polite written touch and one follow-up is enough. Executors are often overwhelmed; repeated chasing feels pushy. Give them space and make it easy to come to you when they are ready.' }
    ],
    sections: [
      { h: 'The person behind the probate lead', body: [
        'A probate lead is not a sales prospect — it is a person dealing with bereavement, paperwork and often a property sale, all at once. The firms that win instructions are the ones that communicate like human beings, not like business developers.',
        'Every grant of probate you see represents a family making practical decisions under emotional strain. Your first message should reduce their load, not add to it.',
        { cta: 'Receive probate leads from the official register each morning — start your free 7-day trial.' }
      ]},
      { h: 'What to say in the first contact', body: [
        'A first contact that works has five parts, in order: a short line of sympathy, who you are, why you are writing, one concrete way you can help, and an easy reply path.',
        'Keep it brief and human. Something like: "I\'m sorry for your loss. I\'m a solicitor in [area] who helps families with estate administration after a bereavement. When the time is right, I\'d be glad to explain the process and take the paperwork off your hands — no obligation. Reply to this message and I\'ll call at a time that suits you."',
        'No jargon, no fee table, no urgency. The goal is to be remembered as the person who offered help, not pressure.'
      ]},
      { h: 'Handling difficult conversations', body: [
        'Executors can be distressed, guarded, or resentful of being contacted. Handle it by going slower and listening more.',
        { ul: ['Acknowledge the loss before anything else', 'Let them speak — do not talk over them', 'Explain the process in plain English', 'Be honest about timelines and costs', 'Never push for a decision in the same conversation', 'Leave a clear, low-pressure next step'] },
        'The executor who feels heard and unhurried is the one who comes back. The one who feels chased takes their file elsewhere.'
      ]},
      { h: 'Plain English beats legal fluency', body: [
        'Executors are not buying legal expertise they can see — they are buying certainty and less stress. Translate every service into an outcome: "we handle the estate administration" becomes "we deal with the court, the bank, the tax and the paperwork so you don\'t have to."',
        'Explain what happens next in concrete steps, tell them roughly how long things take, and give them one person to contact. Reassurance is the product.',
        { cta: 'Build a first-contact workflow your team can repeat — start your free probate leads trial.' }
      ]},
      { h: 'Win the instruction, then win the family', body: [
        'A well-handled probate file becomes a will for the family, conveyancing for the property sale, and referrals to friends. Communication is what earns all of it. Keep the executor informed, answer promptly, and treat the file with the care it deserves.',
        'In a market where many firms send the same letter, the firm that communicates with genuine warmth wins the instruction — and keeps the family for life.'
      ]}
    ]
  },
  {
    slug: 'services-to-sell-new-business-leads',
    title: '10 Services You Can Sell to New Business Leads (and How to Offer Them)',
    description: 'Newly registered companies need a long list of services in their first few months. Here are ten profitable services you can sell to new business leads, and the right way to offer each one.',
    category: 'newbusiness', product_name: 'New Business Leads', categoryLabel: 'New Business Leads',
    keywords: ['services for new businesses', 'sell to new business leads', 'Companies House leads services', 'new company cross-sell', 'new business leads opportunities'],
    date: '2026-08-19', reading_time: '9 min read',
    faqs: [
      { q: 'Which service should I lead with?', a: 'Lead with the service the new business needs first and that you deliver best. For most providers that is the one with a natural deadline — accounting and tax registration, or a website and domain. Solve the urgent problem and the wider relationship follows.' },
      { q: 'How many services should I offer in the first conversation?', a: 'Two or three maximum. New directors are overwhelmed, and a list of eight services reads as a sales pitch. Offer the one most relevant to their situation now, mention one more as a natural next step, and let the rest come later.' },
      { q: 'Is it better to specialise or offer a bundle?', a: 'A starter bundle — the two or three services every new company buys — tends to win because it reduces the director\'s decisions. Price it as a package with a clear first-month focus, then expand the account over time.' },
      { q: 'When is the best time to contact a new company?', a: 'In the first two weeks after incorporation. That is when bank accounts, accounting, websites and insurance decisions get made and no incumbent supplier exists yet. After a few months the decisions are locked in.' }
    ],
    sections: [
      { h: 'Why new companies are the perfect buyers', body: [
        'Every new limited company makes a predictable set of purchases in its first few months, and when you contact them early there is no incumbent supplier to displace. For B2B providers, a fresh incorporation is the closest thing to a guaranteed customer at the start of their journey.',
        'The skill is not finding the companies — the register is public. It is knowing which service to offer first and making the approach feel helpful rather than opportunistic.',
        { cta: 'Get new business leads from Companies House every morning — start your free trial.' }
      ]},
      { h: 'The ten services every new company buys', body: [
        'Here are the services that newly registered UK companies most commonly need, roughly in the order they buy them:',
        { table: [['#', 'Service', 'When they need it'], ['1', 'Business bank account setup', 'Week 1'], ['2', 'Accounting and tax registration', 'Week 1–2'], ['3', 'Website, domain and email', 'Week 1–4'], ['4', 'Business insurance', 'Week 1–4'], ['5', 'IT, software and phone systems', 'Week 2–6'], ['6', 'Legal review and contracts', 'Week 2–8'], ['7', 'Marketing and branding', 'Week 2–12'], ['8', 'Virtual office and address services', 'Week 1–4'], ['9', 'Payroll and HR setup', 'Month 2+'], ['10', 'Ongoing bookkeeping and tax', 'Month 1 onwards']] }
      ]},
      { h: 'Lead with the urgent, not the obvious', body: [
        'A website is an obvious need, but accounting and tax registration have a deadline — the company must file within months of incorporation. Leading with a service that has a date attached creates a natural reason to act now.',
        'When you open with the urgent service, you also build the relationship that lets you sell the rest later. A director who trusts you with their tax is far more likely to trust you with their insurance and their payroll.',
        { ul: ['Ask what they have already set up — bank, accountant, website', 'Offer the missing urgent item first', 'Frame it as helping them avoid a penalty or delay', 'Then mention one natural next step, no more'] }
      ]},
      { h: 'How to offer services without sounding pushy', body: [
        'New directors expect providers to contact them, so you are not intruding — but you must add value in the first message. Mention their company by name, reference something specific (their industry, their registration date), and offer one concrete thing: a free compliance check, a fixed-price starter package, a template they can use today.',
        'Give value first and the sale becomes a natural continuation rather than a pitch.'
      ]},
      { h: 'Turn the first sale into an account', body: [
        'The real money in new business leads is the account, not the first order. Onboard cleanly, set review points at one, three, six and twelve months, and add services as the company grows. A client won in the first month of trading is yours for the lifetime of the business — and a source of referrals to every other new company they meet.'
      ]}
    ]
  },
  {
    slug: 'how-to-read-a-planning-application',
    title: 'How to Read a Planning Application and Spot High-Value Projects',
    description: 'The practical skill that separates builders who win planning leads from those who waste time — how to read an application, judge project value, and prioritise the enquiries worth quoting.',
    category: 'planning', product_name: 'Planning Permission Leads', categoryLabel: 'Planning Permission Leads',
    keywords: ['read a planning application', 'planning application for builders', 'planning leads value', 'spot high-value projects', 'planning enquiries for trades'],
    date: '2026-08-18', reading_time: '7 min read',
    faqs: [
      { q: 'What should I check first in a planning application?', a: 'The application type and the scope of the works. A full two-storey extension or new build is a different job from a single-storey rear extension. The application description tells you the size and complexity before you spend a minute on the phone.' },
      { q: 'How do I estimate what a project is worth?', a: 'Use the property and the works as your guide. A larger property, a bigger extension, and added elements like a kitchen or bathroom typically mean a higher build value. Compare the application against jobs you have already priced to build a quick benchmark.' },
      { q: 'Which applications should I skip?', a: 'Skip applications outside your trade, below your minimum job size, or in areas you cannot serve quickly. Also be cautious with applications that are clearly very early stage or that look speculative — a phone call will confirm within minutes.' },
      { q: 'Is it worth contacting applicants whose application is still pending?', a: 'Yes. Most homeowners collect quotes while the application is being decided. Contacting them during that window means you can be the trusted builder who already knows the project when approval lands — rather than one of six callers the day after.' }
    ],
    sections: [
      { h: 'Reading an application like a professional', body: [
        'A planning application contains far more than an address. The description, the scale of works, and the property details tell you the size, complexity and likely budget of the project before you ever pick up the phone.',
        'Learning to read an application quickly is the highest-leverage skill for converting planning leads: it tells you which enquiries to chase, which to skip, and how to open the conversation with confidence.',
        { cta: 'Get planning permission leads matched to your trade delivered at 9am — start your free trial.' }
      ]},
      { h: 'What to look for in the description', body: [
        'The application description is the heart of the lead. It tells you what is being built, at what scale, and usually whether it is a simple extension or a substantial project.',
        { ul: ['Application type: extension, loft conversion, new build, garage conversion, change of use', 'Works scope: number of storeys, added floor area, new kitchens or bathrooms', 'Property context: existing house size and whether the application is residential or commercial', 'Applicant details and reference number for your records'] }
      ]},
      { h: 'Estimate project value with a simple benchmark', body: [
        'Build a personal benchmark table from jobs you have priced before, then slot each application into it. It does not need to be precise — you just need to sort applications into "worth chasing" and "below my minimum".',
        { table: [['Application type', 'Typical build value', 'Time to quote'], ['Single-storey rear extension', '£40,000 – £70,000', 'Low'], ['Two-storey extension', '£80,000 – £160,000', 'Medium'], ['Loft conversion', '£35,000 – £60,000', 'Low'], ['New build / substantial works', '£150,000+', 'High']] },
        'A rough value estimate lets you prioritise. Chase the applications that meet your minimum job size and spend your quoting time where the margin is.'
      ]},
      { h: 'Spot the high-value signal early', body: [
        'Certain signals mark a high-value project before you speak to anyone: a large existing property, an application that adds significant floor area, a kitchen or bathroom upgrade within the works, or a design that suggests a well-planned budget.',
        'Conversely, be careful with applications that are clearly speculative — a change of use with no build, or a tiny extension on a property that cannot support the works. A two-minute call will confirm, but the description usually gives it away first.'
      ]},
      { h: 'Turn reading into a repeatable process', body: [
        'Your morning routine becomes: review the day\'s applications, score each on value and fit, contact the top three within the hour, and log your quotes. The scoring takes seconds once you have a benchmark, and it stops you from chasing everything that looks like work.',
        'Builders who convert planning leads consistently are not the ones who quote every application. They are the ones who quote the right applications, fast, and with genuine knowledge of what the job involves.'
      ]}
    ]
  },
  {
    slug: 'how-to-write-winning-tender-responses',
    title: 'How to Write a Tender Response That Wins: A Step-by-Step Bid Writing Guide',
    description: 'The practical bid writing process for SMEs — how to structure quality answers, evidence your claims, price to win, and avoid the common errors that get tender responses rejected.',
    category: 'tenders', product_name: 'Tender Opportunities', categoryLabel: 'Tender Opportunities',
    keywords: ['tender response writing', 'bid writing guide', 'write winning tender', 'tender quality questions', 'SME bid writing'],
    date: '2026-08-17', reading_time: '9 min read',
    faqs: [
      { q: 'How do I structure a quality tender answer?', a: 'Use a simple framework: restate what the buyer asked, explain how you will deliver it, evidence it with a named example, and state the outcome. Answer exactly what is asked — buyers score against the question, not against how much you write.' },
      { q: 'How do I evidence my claims without a huge track record?', a: 'Evidence does not need to be the same sector. Use any named contract where you delivered the relevant outcome, explain your specific role, and include measurable results. A small, relevant example beats a vague, large one.' },
      { q: 'Should I price high or low to win?', a: 'Price to the scope, not to the floor. Buyers reject unrealistic low bids as risky and unrealistic high bids as expensive. A competitive, defensible price that matches the specification — and a quality response that scores well — is how tenders are actually won.' },
      { q: 'How long should a tender response take?', a: 'For an SME, budget one to two weeks for a medium-value tender: two to three days to plan, four to five to write, and the rest for review and submission. Rush jobs produce errors, and errors get you disqualified.' }
    ],
    sections: [
      { h: 'Tenders are won in the planning, not the writing', body: [
        'The bid starts before you type a word. Read the specification twice and make a compliance matrix: every question, its weighting, what the buyer is really asking, and what evidence you have to answer it. If any mandatory requirement is missing, stop — you cannot win what you are not compliant with.',
        'Most losing bids lose because they answer the wrong question or miss a requirement, not because the writing was bad.',
        { cta: 'Find tender opportunities that match your business — start your free trial.' }
      ]},
      { h: 'The structure of a winning quality answer', body: [
        'When the quality questions ask "how will you deliver this service?", answer in four parts:',
        { ul: ['Restate — briefly confirm what you understood the buyer needs', 'Approach — how you will actually deliver it, in plain steps', 'Evidence — a named example where you did this before', 'Outcome — the result and how you will measure it'] },
        'Buyers score against the question and the stated criteria. Mirror their language, answer completely, and resist the urge to pad. A focused answer that addresses every part of the question scores higher than a long one that drifts.'
      ]},
      { h: 'Evidence is the difference between a bid and an essay', body: [
        'Claims without evidence are just opinions. Every "we are good at X" should be backed with a named contract, your specific role, and a measurable result — cost saved, time reduced, or quality achieved.',
        'You do not need a huge track record. A small contract where you delivered the exact outcome, explained clearly, is stronger than a vague reference to a big one. Keep an evidence bank: for each project you deliver, note the client, the scope, your role and the results. Then tenders write themselves.'
      ]},
      { h: 'Price to the scope, not to the floor', body: [
        'Buyers evaluate price against the specification, and they are experienced enough to spot an unrealistic low bid. Price every element in the schedule realistically, and make sure your pricing model is defensible if you are asked to justify it at interview.',
        'A common SME mistake is to undercut to "get a foot in the door", then underdeliver. A contract won at a loss becomes a bad reference and a loss of money. Price to deliver well and win the next one on reputation.'
      ]},
      { h: 'Avoid the errors that get you disqualified', body: [
        'Tenders are often won or lost on process, not persuasion. Before you submit, run the checklist: every question answered, every form completed, documents in the required format, the right entity named, and submitted before the deadline. Late or incomplete submissions are rejected outright.',
        'Get a second pair of eyes to review. Fresh readers spot ambiguity, typos and missed requirements faster than the person who wrote the bid. A clean, complete, on-time submission is a professional standard in itself.'
      ]}
    ]
  },
  {
    slug: 'the-9am-lead-workflow',
    title: 'The 9am Lead Workflow: How Top Companies Convert Daily Leads',
    description: 'A repeatable morning routine for converting daily business leads — reviewing, prioritising, contacting fast, following up and tracking results. The system behind every successful lead strategy.',
    category: 'general', product_name: 'Business Leads', categoryLabel: 'Business Leads',
    keywords: ['morning lead workflow', 'daily lead routine', 'lead conversion system', 'contact leads fast', 'lead follow-up routine'],
    date: '2026-08-16', reading_time: '7 min read',
    faqs: [
      { q: 'Why is a daily routine better than checking leads when you have time?', a: 'Freshness decays fast — the business that contacts a prospect within the first hour wins far more than the one that contacts them tomorrow. A fixed daily routine makes first contact fast and consistent, which is the single biggest lever on conversion.' },
      { q: 'How many leads should I contact each day?', a: 'Contact every lead you receive, but prioritise. Aim to reach the top three to five within the hour and the rest before midday. Missing a day of contact is the same as not receiving the leads at all.' },
      { q: 'What does a good follow-up sequence look like?', a: 'Contact today, send a written confirmation of what was discussed today, one follow-up after 48 hours if there is no reply, then stop unless they engage. Consistent, spaced follow-up converts; repetitive chasing loses the relationship.' },
      { q: 'What should I track to improve?', a: 'Three numbers: leads received, first contacts made, and conversions. Once you know your conversion rate you can forecast results, find the weak step in your process, and focus your time on the leads most likely to convert.' }
    ],
    sections: [
      { h: 'The routine that separates converters from collectors', body: [
        'The difference between businesses that win with leads and those that do not is rarely the quality of the leads. It is the routine. The companies that convert treat 9am as a start signal: review, prioritise, contact, log. The ones that struggle treat leads as something to "get around to" and lose them to fresher competitors.',
        'A daily routine removes the decision fatigue. You do not ask "should I call these people today?" — you just run the process.',
        { cta: 'Start your free 7-day trial and receive your first daily batch of leads at 9am tomorrow.' }
      ]},
      { h: 'The five-step morning workflow', body: [
        'Run the same five steps every morning and your conversion compounds:',
        { ul: ['Review — open your leads for the day and skim each one', 'Prioritise — rank by value, fit and urgency', 'Contact — reach the top leads within the hour', 'Log — record who you contacted and the outcome', 'Follow up — schedule the next touch for every open conversation'] },
        'The whole routine should take under ninety minutes. Its power is consistency, not effort.'
      ]},
      { h: 'Prioritise like a professional', body: [
        'Not all leads are equal. A high-value job in your core area beats a low-value one far away, and a prospect ready to act today beats one still deciding. Create a simple scoring habit: value and fit first, urgency second, and your capacity third.',
        'Contact the top three to five yourself if you are the only person. If you have a team, assign the highest-value leads to the strongest closer. The first hour is where the results are won.'
      ]},
      { h: 'Contact fast, speak to the situation', body: [
        'Speed builds trust. A call within the hour says "you matter" — a call the next day says "you were an afterthought". When you contact, keep it short and situational: why you are calling, one or two questions, and a clear next step.',
        'Do not read from a script in a way that sounds scripted. Use the details of the lead to open genuinely, listen more than you talk, and close every call with a defined follow-up.'
      ]},
      { h: 'Track the three numbers that matter', body: [
        'You cannot improve what you do not measure. Track three numbers every week:',
        { table: [['Metric', 'What it tells you', 'What to do if it is low'], ['Leads received', 'Pipeline volume', 'Review your postcode areas and lead type'], ['First contacts made', 'How fast you act', 'Tighten the morning routine'], ['Conversions', 'How well you convert', 'Improve your call, quote or follow-up']] },
        'Once you know your conversion rate, forecasting becomes easy: if 10 leads become 2 jobs, you know exactly how many leads you need each week for your target. That is the number that turns lead buying from a cost into an investment.'
      ]}
    ]
  },
  {
    slug: 'seasonal-guide-to-moving-leads-uk',
    title: 'The Seasonal Guide to Moving Leads in the UK: When the Market Peaks (and How to Plan Around It)',
    description: 'UK house moves follow a predictable seasonal rhythm. Understand when moving leads peak, why, and how removal companies can plan staffing, pricing and marketing around the cycle.',
    category: 'moving', product_name: 'Moving Leads', categoryLabel: 'Moving Leads',
    keywords: ['seasonal moving leads UK', 'moving leads trends', 'UK removals season', 'when do people move house UK', 'removal company planning'],
    date: '2026-08-28', reading_time: '8 min read',
    faqs: [
      { q: 'When is the peak season for moving leads in the UK?', a: 'Late spring and summer — roughly April to September — are the busiest, peaking in June, July and August. School holidays, weather and the traditional rhythm of buying and selling all push families to move in the warmer months.' },
      { q: 'Is the winter completely quiet?', a: 'No, but it is quieter and more predictable. January is the slowest month for transactions. However, listing activity still happens, and businesses moving premises, downsizers and chain-free buyers often move in winter with less competition.' },
      { q: 'Should I change my pricing by season?', a: 'Yes. In peak season demand exceeds supply, so firm pricing and even premium rates for short-notice moves are justified. In quiet months, consider offers, minimum-hours packages and smaller-move specialisms to keep crews busy.' },
      { q: 'How do I smooth out seasonal dips?', a: 'Diversify into segments that move in winter — downsizing, probate and deceased estates, commercial moves and corporate relocations — and build a pipeline of long-distance moves that are booked further ahead.' }
    ],
    sections: [
      { h: 'The rhythm of the UK moving year', body: [
        'UK house moves are strongly seasonal, and the pattern is consistent enough to plan around. Transactions climb through spring, peak in the summer months, and fall back sharply after September, with January typically the quietest.',
        'The seasonal cycle is driven by practical decisions: families want to move during school holidays, buyers want the garden to look its best, and chains prefer to complete in daylight hours and good weather. None of this is news to experienced removal firms — the value is in planning for it deliberately.',
        { cta: 'Receive moving leads in your postcode all year round — start your free 7-day trial.' }
      ]},
      { h: 'What the seasonal curve looks like', body: [
        'The transaction calendar tells you where the work is. While any individual year shifts, the shape is reliable:',
        { table: [['Season', 'Transaction activity', 'What it means for removals'], ['Jan – Feb', 'Slowest', 'Quiet month, prepare and market'], ['Mar – Apr', 'Building', 'Listings rise, quoting season starts'], ['May – Aug', 'Peak', 'Highest volume, firm pricing, waitlists'], ['Sep – Nov', 'Tapering', 'Still active, chain completions'], ['Dec', 'Sharp dip', 'Planning and maintenance time']] },
        'Plan your capacity, pricing and marketing around this curve rather than reacting to it month by month.'
      ]},
      { h: 'Use peak season to build your year', body: [
        'Peak months are your revenue engine and your reputation builder. Run organised operations, deliver on time, and collect reviews aggressively — the goodwill you build in summer is what fills the phone in winter.',
        'Consider premium pricing for short-notice and weekend moves during peak demand, and offer early-booking discounts for summer dates to lock in work ahead of time. A full calendar is a strong position; do not discount from strength.',
        { cta: 'Plan your peak season around fresh moving leads — start your free trial.' }
      ]},
      { h: 'Fill the quiet months deliberately', body: [
        'Instead of chasing volume in a quiet market, specialise in the segments that move all year round:',
        { ul: ['Probate and deceased estate moves — no school holiday constraints', 'Downsizing moves for older clients, often early in the week', 'Commercial and office moves, driven by lease dates not seasons', 'Long-distance moves, which are booked weeks ahead and smooth the pipeline'] },
        'Business moves in particular follow commercial calendars rather than the housing cycle, so they can fill otherwise quiet weeks.'
      ]},
      { h: 'The 12-month marketing rhythm', body: [
        'Match your marketing to the cycle. In late winter, publish content and offers aimed at spring movers. Through summer, focus on reviews, referral incentives and rapid response. In autumn, target the business-moving and downsizing segments for winter.',
        'A seasonal plan turns a cyclical industry into a managed one. The companies that plan around the curve win more moves at every point of the year — and know exactly when to push hardest.'
      ]}
    ]
  },
  {
    slug: 'scalable-probate-lead-pipeline',
    title: 'How to Build a Scalable Probate Lead Pipeline for Your Law Firm',
    description: 'How solicitors move from sporadic probate work to a steady, repeatable pipeline — volume planning, workflow design, team roles, and the numbers that tell you your pipeline is working.',
    category: 'probate', product_name: 'Probate Leads', categoryLabel: 'Probate Leads',
    keywords: ['probate pipeline', 'probate leads for solicitors', 'scalable probate work', 'probate workflow', 'probate lead generation for law firms'],
    date: '2026-08-27', reading_time: '8 min read',
    faqs: [
      { q: 'How many probate leads does a firm need each week?', a: 'Work backwards from your target. If you win 1 in 4 instructions you contact and you want 4 new files a month, you need around 16 qualifying leads a month — roughly 4 a week. Start there and adjust as your conversion rate improves.' },
      { q: 'Do I need a dedicated team to scale probate work?', a: 'Not at first. One person owning the intake and first contact, supported by a defined process, is enough to handle a steady flow. You add a file-handler or trainee when your conversion outpaces your capacity.' },
      { q: 'What makes a probate pipeline scalable?', a: 'A repeatable process that does not depend on one person\'s memory: clear intake steps, standard first-contact templates, a single tracking list, and weekly numbers reviewed by the practice. Process is what makes volume manageable.' },
      { q: 'How long until probate leads become fees?', a: 'A contact this week can become an instruction within days, but the full file — grant, estate work, property sale — may take six to eighteen months to conclude. Keep your pipeline visible and your intake consistent, and the fee flow smooths out.' }
    ],
    sections: [
      { h: 'From sporadic work to a managed pipeline', body: [
        'Many probate teams operate reactively: work arrives when referrals come in, and the pipeline is whatever happens to be open this month. A scalable pipeline replaces that with a predictable flow — consistent intake, a clear process, and numbers you can plan around.',
        'The shift is not about working harder. It is about making intake reliable enough that your team always has files to work, and your forecast is based on data rather than hope.',
        { cta: 'Receive probate leads from the official register daily — start your free 7-day trial.' }
      ]},
      { h: 'Design the pipeline backwards', body: [
        'Build the pipeline from the number you need. If one probate instruction averages a certain fee and your contact-to-instruction rate is around 25%, you can calculate the intake required for any revenue target.',
        { ul: ['Target fees per month', 'Average fee per instruction', 'Required instructions (target ÷ average fee)', 'Required contacts (instructions ÷ conversion rate)', 'Required leads (contacts ÷ contact rate)'] },
        'Once the intake number is clear, everyone knows what "enough" looks like — and the pipeline has a target instead of an ambition.'
      ]},
      { h: 'Standardise the workflow', body: [
        'Scale comes from process, not heroics. Write down the steps every file passes through — lead received, first contact, first meeting or call, instruction, file opened — and make them standard. Templates for first contact and follow-up remove the friction of writing fresh each time.',
        'Assign one owner for intake so no lead is missed, and keep a single live list of open opportunities. A lead that is not on the list is a lead that will be lost.',
        { cta: 'Build a repeatable first-contact workflow with daily probate leads — start your free trial.' }
      ]},
      { h: 'Make your team structure match your volume', body: [
        'At low volume, one fee earner can own intake and files. As volume grows, split the roles: someone owns intake and first contact, someone owns file progression, and later a paralegal handles the routine steps. Match the structure to the flow, and add capacity only when conversion proves demand.',
        'The pipeline should never be blocked by one person being unavailable. Document the process so anyone can step in.'
      ]},
      { h: 'The numbers that tell you it is working', body: [
        'Review three numbers weekly: leads received, first contacts made, and instructions won. Watch the ratios, not just the counts.',
        { table: [['Metric', 'Healthy benchmark', 'If it drops'], ['First contact within 24h', '80%+ of leads', 'Tighten intake ownership'], ['Contact to instruction', '20–30%', 'Improve first-contact quality'], ['Leads per week', 'Enough to meet target', 'Expand postcode areas or channels']] },
        'A pipeline you can measure is a pipeline you can grow. The moment the numbers are visible, the debate about whether probate work "is there" ends — you know exactly what it takes to hit your target.'
      ]}
    ]
  },
  {
    slug: 'automate-new-business-lead-follow-ups',
    title: 'How to Automate Your New Business Lead Follow-Ups (Without Sounding Like a Robot)',
    description: 'A practical automation system for new business leads — triggered email sequences, a simple CRM, and the human touches that keep automation from killing the relationship.',
    category: 'newbusiness', product_name: 'New Business Leads', categoryLabel: 'New Business Leads',
    keywords: ['automate lead follow-up', 'new business leads email automation', 'Companies House leads follow-up', 'lead nurturing automation', 'B2B follow-up sequences'],
    date: '2026-08-26', reading_time: '7 min read',
    faqs: [
      { q: 'Is automated follow-up off-putting for new business owners?', a: 'Only when it reads like a robot. Short, personal, value-first messages spaced a few days apart are welcomed by busy directors — most new companies never receive a follow-up at all, so a well-timed one stands out.' },
      { q: 'What tools do I need to automate follow-ups?', a: 'A CRM or a simple spreadsheet with status tracking, plus email sequences from your own inbox or a lightweight tool. You do not need a complex marketing platform — a personal, human sequence beats a polished impersonal one.' },
      { q: 'How long should an automated sequence run?', a: 'Three touches over about ten days is enough for a cold new-business lead. After that, stop unless they respond. Long, relentless sequences do more damage than good.' },
      { q: 'What makes an automated message feel human?', a: 'Reference the specific company by name, keep it short, offer something genuinely useful, and write like a person rather than a template. Personalisation and brevity are what separate automation from spam.' }
    ],
    sections: [
      { h: 'Why new business leads need a follow-up system', body: [
        'Newly registered companies are deciding who to work with in the first weeks, and most providers contact them once and then go quiet. The firm that follows up systematically is the one that stays in front of the director when the decision gets made.',
        'A simple, triggered follow-up sequence means no lead slips through because someone got busy — and the director gets the impression of a provider who is organised and genuinely interested.',
        { cta: 'Get new business leads from Companies House daily and test your follow-up system — start your free trial.' }
      ]},
      { h: 'Design the sequence before you automate', body: [
        'Map the touches on paper first. A sequence that works for new business leads looks like this:',
        { ul: ['Touch 1 (day 1): short email referencing the company by name, one value-add', 'Touch 2 (day 3–4): a useful resource or a relevant example, no hard sell', 'Touch 3 (day 7–10): a brief follow-up asking how it is going, then stop'] },
        'The goal is to be helpful and persistent, not pushy. Three spaced touches convert; twenty automated pings alienate.'
      ]},
      { h: 'Keep the automation personal', body: [
        'Automation fails when it replaces personality. Every message should be short, reference the actual company, and sound like the person who will deliver the service. Personalise the first line with the company name and a detail from the lead, and keep the body to a few sentences.',
        'Use your real sending address rather than a generic "no-reply", and sign off with a real name. The moment a message reads like a mail-merge, the director stops reading.',
        { cta: 'Build a personal automated follow-up that wins — start your free new business leads trial.' }
      ]},
      { h: 'Make it easy to track who replied', body: [
        'Automation only works if the follow-through does. Keep a simple status list — new, contacted, replied, meeting booked, closed, lost — and update it daily. When someone replies, a person must take over immediately. That human handoff is what turns the sequence into clients.',
        'A lightweight CRM or even a well-organised spreadsheet is enough at small scale. The process matters more than the platform.'
      ]},
      { h: 'Let the sequence scale your outreach', body: [
        'Once the sequence runs, your capacity to handle new business leads stops being limited by how many emails you remember to send. You can receive more leads, respond faster, and keep every conversation moving — which is exactly what a scalable new business pipeline needs.'
      ]}
    ]
  },
  {
    slug: 'price-planning-works-profitably',
    title: 'How to Price Planning Works Profitably: A Builder\'s Estimating Guide',
    description: 'Pricing building work so you win the job and protect your margin — building an estimate from first principles, handling the price conversation, and the mistakes that quietly destroy builder margins.',
    category: 'planning', product_name: 'Planning Permission Leads', categoryLabel: 'Planning Permission Leads',
    keywords: ['price building work', 'builder estimating', 'planning works pricing', 'construction margins', 'quote building projects'],
    date: '2026-08-25', reading_time: '8 min read',
    faqs: [
      { q: 'How do I price a building job I have never done before?', a: 'Break it into known parts — labour, materials, plant, subbies, overheads, contingency — and price each from your records. Unknown tasks deserve a line item and a contingency, not a hopeful number. If you cannot price a part, that is a reason to get a quote, not a guess.' },
      { q: 'What is a healthy margin on building work?', a: 'Net profit of 15–25% on well-run projects is a realistic target after all costs and overheads. Many builders quote on cost-plus-a-small-markup and discover too late that overheads and variations ate the margin. Price the job to make the business sustainable.' },
      { q: 'How do I handle "the other builder is cheaper"?', a: 'Stay calm, explain what your price includes, and ask what theirs covers. Quality builders win on clarity and completeness, not on matching the lowest number. Offer to adjust scope rather than price if needed.' },
      { q: 'What should I always include in a quote?', a: 'Labour, materials with a small allowance for waste, plant hire, skip and waste removal, statutory fees, access and protection, and a contingency. Itemise clearly so the customer sees value — and so variations are easy to agree later.' }
    ],
    sections: [
      { h: 'The estimate is the business plan for the job', body: [
        'A building estimate is not a number you hope will cover the job — it is a plan for how you will make money on it. Every line item represents a cost you have priced, a risk you have considered, and margin you have protected. The builders who go bust usually do so on profitable-looking jobs that were underestimated.',
        'Pricing well is what lets you win planning leads confidently: when you know exactly what a job costs, you can quote fast and stand behind the number.',
        { cta: 'Receive planning leads matched to your trade and price them with confidence — start your free trial.' }
      ]},
      { h: 'Build the estimate from first principles', body: [
        'Start from the drawings and specification, not from last time. Break the job into its real parts and price each one from your records:',
        { ul: ['Labour — real crew days at your full cost, not a daily rate that excludes overheads', 'Materials — with a sensible waste allowance', 'Plant, hire and delivery', 'Subcontractors — priced from written quotes', 'Skip, waste and access', 'Statutory fees and insurance', 'Contingency — typically 5–10%', 'Your overheads and target profit'] },
        'The discipline of itemising every part is what catches the costs that quietly destroy margins.'
      ]},
      { h: 'Use benchmarks to quote faster', body: [
        'Track your own benchmarks so future quotes are faster and more accurate. After each job, note the price per square metre, per crew day, and per project type. Over time you build a reliable reference for extensions, conversions and new builds that lets you estimate in minutes, not days.',
        { table: [['Project type', 'Typical price per m² (rough build)', 'Key cost drivers'], ['Single-storey extension', '£2,000 – £3,500 / m²', 'Groundworks, roof, finishes'], ['Two-storey extension', '£2,200 – £3,800 / m²', 'Structure, scaffolding, services'], ['Loft conversion', '£35,000 – £60,000 fixed', 'Dormer, stairs, fire safety'], ['Kitchen extension / refurb', '£1,800 – £2,800 / m²', 'Fittings, plumbing, electrics']] },
        'Benchmarks are a starting point — every job is priced from its own details.'
      ]},
      { h: 'Handle the price conversation with confidence', body: [
        'Present the quote clearly and stand behind it. Explain what is included, what is not, and how variations will be handled. When a customer pushes back, invite comparison rather than discounting: "what did the other quote include?" More often than not, the difference is scope, not price.',
        'A confident, transparent price is a competitive advantage. It signals a professional who has thought the job through — exactly the builder a homeowner wants on their extension.',
        { cta: 'Quote the right planning projects with confidence — start your free planning leads trial.' }
      ]},
      { h: 'Protect your margin through the project', body: [
        'The estimate sets the price, but margin is protected during delivery. Agree variations in writing before doing extra work, keep a change log, and invoice against a clear schedule. The builders who lose margin rarely lose it at pricing — they lose it on uncontrolled extras and variations.',
        'Combine disciplined pricing with disciplined delivery and the projects you win on planning leads become the projects that grow your business.'
      ]}
    ]
  },
  {
    slug: 'common-mistakes-tender-submissions',
    title: 'Common Mistakes in Tender Submissions (and How to Avoid Them)',
    description: 'The repeated errors that disqualify SME tender bids — and the simple checks that stop them. From compliance slips to generic answers, here is what loses bids and how to fix it.',
    category: 'tenders', product_name: 'Tender Opportunities', categoryLabel: 'Tender Opportunities',
    keywords: ['tender submission mistakes', 'tender errors', 'why tenders get rejected', 'bid disqualification', 'tender response tips'],
    date: '2026-08-24', reading_time: '8 min read',
    faqs: [
      { q: 'Why are most SME tender bids rejected?', a: 'Rarely because the bidder could not do the work. The most common reasons are missing mandatory documents, answers that do not address the question, non-compliance with the specification, and late or malformed submissions.' },
      { q: 'How do I avoid missing a mandatory requirement?', a: 'Build a compliance matrix before you write anything: list every requirement in the specification, mark whether you meet it, and evidence it. Cross off each one as the document is included. This single habit eliminates most disqualifications.' },
      { q: 'How short should my answers be?', a: 'As long as they fully answer the question and no longer. Buyers score against the question, and word count does not score points. Focused, evidenced answers outperform padded ones.' },
      { q: 'Can I reuse answers between tenders?', a: 'Reuse your evidence bank, not your answers. The same example can prove different capabilities, but every answer must address the specific question the buyer asked. A pasted answer that ignores the question is a classic losing mistake.' }
    ],
    sections: [
      { h: 'Tenders are lost in the details', body: [
        'Most SME bids do not lose because the business could not do the work. They lose because of errors that had nothing to do with capability — a missing document, a misunderstood question, a specification requirement that was never addressed.',
        'The good news is that these errors are almost entirely preventable. They are process failures, and process can be fixed.',
        { cta: 'Find tender opportunities matched to your business — start your free trial.' }
      ]},
      { h: 'The compliance slip that ends the bid', body: [
        'The most common fatal error is non-compliance. Mandatory documents missing, insurances not at the required level, a question skipped, or a specification deviation that was never flagged. Buyers are not allowed to waive mandatory requirements — a non-compliant bid is rejected regardless of quality.',
        'Before writing a word, build a compliance matrix. Every requirement becomes a checklist item, and nothing is submitted until every item is confirmed. Compliance is not a detail; it is the price of admission.',
        { ul: ['List every mandatory requirement from the specification', 'Confirm you meet each one and note the evidence', 'Check insurances, accreditations and financial thresholds', 'Verify the entity name matches your legal registration', 'Leave time for a final compliance pass before deadline'] }
      ]},
      { h: 'Answers that miss the question', body: [
        'Buyers score against the exact question and its weighting. A polished answer to a slightly different question scores near zero. Restate the question in your own words at the top of your answer, then address every part of it explicitly.',
        'Generic answers are the second most common killer. "We deliver high-quality services" scores nothing without evidence. Every claim needs a named example, your specific role, and a measurable result.',
        { cta: 'See which tenders are worth your time — start your free trial.' }
      ]},
      { h: 'Pricing mistakes that disqualify', body: [
        'Outliers are rejected on both ends. An unrealistically low bid signals a misunderstanding of the scope or a future loss; an inflated bid fails value for money. Price every element of the schedule realistically, and make sure your numbers add up exactly — arithmetic errors in a pricing schedule are an instant red flag.',
        'Read the pricing instructions carefully. Some tenders require a breakdown, others a fixed figure. Format exactly as asked.'
      ]},
      { h: 'The submission-day checklist', body: [
        'The final pass is where quality bids become winners. Run the checklist before you click submit:',
        { ul: ['Every question answered, every form completed', 'Mandatory documents attached in the required format', 'Compliance matrix fully confirmed', 'Pricing verified and in the required format', 'Submitted before the deadline, never at it', 'A second person has reviewed the whole response'] },
        'A complete, compliant, on-time submission is a professional standard in its own right. Get the process right and the quality of your actual work does the winning.'
      ]}
    ]
  },
  {
    slug: 'business-leads-vs-ppc-vs-directories',
    title: 'Business Leads vs PPC vs Directories: Choosing the Right Channel for Your Business',
    description: 'How UK businesses should choose between buying business leads, pay-per-click advertising and directory listings — comparing costs, control and conversion so you spend where you win.',
    category: 'general', product_name: 'Business Leads', categoryLabel: 'Business Leads',
    keywords: ['business leads vs PPC', 'lead generation channels', 'buy leads vs advertise', 'directory vs PPC vs leads', 'marketing channel comparison'],
    date: '2026-08-23', reading_time: '8 min read',
    faqs: [
      { q: 'What is the difference between buying leads, PPC and directories?', a: 'Directories list you where prospects browse; PPC puts you in front of people actively searching; buying leads delivers you specific fresh opportunities from public data before competitors see them. They solve different problems and can be combined.' },
      { q: 'Which is cheapest?', a: 'Cost per lead varies by market, but directories often charge listing or per-lead fees with unpredictable quality, and PPC costs rise with competition. Fixed-price lead feeds are predictable but require you to act on them. Cheapest depends on your conversion, not the sticker price.' },
      { q: 'Should I run all three at once?', a: 'Most successful businesses use one channel to build a pipeline and one to capture on-demand demand. Start with the channel that fits how you win work today, prove the numbers, then add a second channel rather than spreading thin.' },
      { q: 'How do I know which channel is working?', a: 'Track cost, leads, and — critically — jobs won per channel. A channel that brings cheap leads you never convert is worthless. Measure the full funnel, not just the lead price.' }
    ],
    sections: [
      { h: 'Three channels, three different jobs', body: [
        'Directories, PPC and bought leads all generate enquiries, but they do different work. Choosing between them is not about which is "best" — it is about which matches how your customers find you.',
        'Directories put your listing in front of people browsing for a service. PPC captures people searching right now. A business lead feed surfaces a specific fresh event — a property under offer, a grant, an incorporation, an application — before most competitors know it exists.',
        { cta: 'See if daily business leads fit your marketing mix — start your free 7-day trial.' }
      ]},
      { h: 'How the three channels really compare', body: [
        'The differences show up in control, cost and conversion:',
        { table: [['Channel', 'Who you reach', 'Cost model', 'Control'], ['Directories', 'People browsing', 'Listing / per-lead fees', 'Low — you compete on price'], ['PPC', 'Active searchers', 'Auction, rising CPCs', 'Medium — budget and targeting'], ['Business leads', 'Fresh public opportunities', 'Fixed weekly price', 'High — you choose the leads']] },
        'Directories put you in a price comparison; PPC puts you in a bidding war; a data feed gives you opportunities nobody else has been shown yet.'
      ]},
      { h: 'When each channel makes sense', body: [
        'Directories work when customers actively compare providers and your reviews and pricing win. PPC works when there is clear search demand and you can convert traffic efficiently. Business leads work when your service follows a public event — a move, a grant, an incorporation, an application, a tender.',
        'For most trade and B2B services, the last category is a strong fit: your ideal customer has a predictable trigger, and being first to that trigger beats being best positioned in a listing.',
        { cta: 'Match a data feed to your trade — start your free trial.' }
      ]},
      { h: 'The real cost is cost-per-closed-job', body: [
        'Lead price is vanity; cost per closed job is the number that matters. A £3 directory lead that converts at 2% costs £150 per job. A £25 business lead that converts at 20% costs £125 per job. Judge every channel on the full funnel: cost, leads, contacts, quotes, jobs.',
        'Track each channel separately, including how fast you contacted the lead — the same channel converts differently depending on your response time.'
      ]},
      { h: 'Build a mix that fits how you win', body: [
        'Most winning businesses combine one pipeline channel with one on-demand channel. A removal company might run daily moving leads for the pipeline and a small PPC budget for peak-season demand. An accountant might run new business leads for steady intake and rely on referrals for the rest.',
        'Start with the channel that matches your strongest trigger, prove your numbers, then add the second. Let the data decide where the next pound goes — and you will be spending where you win.'
      ]}
    ]
  }
];

module.exports = { CURATED_POSTS: CURATED_POSTS, buildPostHTML: buildPostHTML };
