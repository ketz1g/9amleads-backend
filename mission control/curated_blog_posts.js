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
  return '<h2>Related Guides</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin:18px 0">' + picks.map(function(x) {
    var c = CAT_COLOR[x.category] || '#0ea5e9';
    return '<a href="https://9amleads.com/blog/' + x.slug + '" style="text-decoration:none;color:inherit;border:1px solid #1a1a1a;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.02);transition:border-color .2s" onmouseover="this.style.borderColor=' + "'" + c + "'" + '" onmouseout="this.style.borderColor=' + "'#1a1a1a'" + '"><img src="https://9amleads.com/blog/img/' + x.slug + '.png" alt="' + esc(x.title) + '" loading="lazy" style="width:100%;height:110px;object-fit:cover;border-radius:0;display:block"><div style="padding:12px;font-size:13px;font-weight:600;color:#e2e8f0;line-height:1.4">' + esc(x.title) + '</div></a>';
  }).join('') + '</div>';
}

function buildPostHTML(p) {
  var headTitle = p.title + ' | 9amLeads Blog';
  var canonical = 'https://9amleads.com/blog/' + p.slug;
  var pageUrl = (p.ctaUrl || CAT_PAGE[p.category] || 'https://9amleads.com/');
  var heroImg = p.heroImg || 'https://9amleads.com/blog/img/' + p.slug + '.png';
  var ogImg = p.ogImg || 'https://9amleads.com/blog/og/' + p.slug + '.png';

  var body = '';
  for (var i = 0; i < p.sections.length; i++) {
    var s = p.sections[i];
    body += '<div class="section-block"><h2 style="margin-top:0">' + esc(s.h) + '</h2>';
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
        body += '<p style="margin:22px 0;text-align:center"><a href="' + href + '" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;box-shadow:0 4px 20px rgba(14,165,233,.3)">' + esc(part.cta) + '</a></p>';
      } else {
        body += '<p>' + part + '</p>';
      }
    }
    body += '</div>';
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
    '<style>body{font-family:Inter,sans-serif;background:#000;color:#ccc;margin:0;padding:0;line-height:1.8;overflow-x:hidden}h1,h2,h3{font-family:Outfit,sans-serif;color:#fff;letter-spacing:-.3px}h1{font-size:34px;font-weight:800;line-height:1.2;margin:0 0 12px}h2{font-size:24px;font-weight:700;margin-top:44px}h3{font-size:18px}p{color:#cbd5e1;font-size:16px}a{color:#0ea5e9}.wrap{max-width:820px;margin:0 auto;padding:0 24px 60px}.topnav{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 24px;border-bottom:1px solid #1a1a1a;background:#0a0a0a;position:sticky;top:0;z-index:50}.brand{display:flex;align-items:center;gap:8px;font-family:Outfit,sans-serif;font-weight:800;font-size:18px;color:#fff;text-decoration:none}.brand .mark{width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,#0ea5e9,#2563eb);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff}.backlink{color:#94a3b8;text-decoration:none;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}.backlink:hover{color:#fff}.heroimg{width:100%;height:auto;border-radius:16px;border:1px solid #1a1a1a;display:block;margin:24px 0 8px}.meta{color:#888;font-size:14px;margin:14px 0 0}.section-block{border:1px solid #1a1a1a;border-radius:14px;padding:22px 24px;margin:26px 0;background:rgba(255,255,255,.02)}ul{color:#cbd5e1}table{border:1px solid #262626}th,td{border:1px solid #262626;padding:10px;text-align:left}th{background:#0d0d0d;color:#fff}strong{color:#fff}img{max-width:100%;height:auto;border-radius:12px}@media(max-width:600px){h1{font-size:26px}h2{font-size:20px}.wrap{padding:0 16px 40px}}</style>' +
    '</head><body>' +
    '<div class="topnav"><a class="brand" href="https://9amleads.com"><span class="mark">9</span>9am<span style="color:#0ea5e9">Leads</span></a><a class="backlink" href="https://9amleads.com/blog"><i style="font-style:normal;font-size:12px">&#8592;</i> All Guides</a></div>' +
    '<div class="wrap">' +
    '<img class="heroimg" src="' + heroImg + '" alt="' + esc(p.title) + '" width="1200" height="630" loading="eager">' +
    '<p class="meta" style="text-transform:uppercase;letter-spacing:1px;font-size:12px;font-weight:700;color:' + color + '">' + esc(p.categoryLabel || '') + '</p>' +
    '<h1>' + esc(p.title) + '</h1>' +
    '<p style="color:#888;font-size:14px;margin-top:-6px">' + esc(p.date) + ' &middot; ' + p.reading_time + '</p>' +
    '<p style="font-size:17px;color:#ddd">' + esc(p.description) + '</p>' +
    body + finalCta + related + faqSection +
    '<hr style="border:none;border-top:1px solid #222;margin:40px 0">' +
    '<div style="font-size:13px;color:#666"><strong style="color:#aaa">About 9amLeads</strong> — We deliver fresh UK business leads every morning at 9am across moving, probate, new business, planning permission and public sector tender opportunities. <a href="https://9amleads.com" style="color:#0ea5e9">Visit 9amLeads.com</a> to start your free 7-day trial. <a href="https://9amleads.com/pricing/" style="color:#0ea5e9">See pricing</a> · <a href="https://9amleads.com/how-it-works/" style="color:#0ea5e9">How it works</a>.</div>' +
    '</div>' +
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
  },
    {
    slug: 'removals-quote-cost-uk',
    title: 'Removal Quote Benchmarks: How to Price Moving Leads and Win the Job',
    description: 'The UK market-rate benchmarks for removal quotes by property size and distance, and how to use them to price moving leads fast, win the job and protect your margin.',
    category: 'moving', product_name: 'Moving Leads', categoryLabel: 'Moving Leads',
    keywords: ['removal quote benchmarks', 'price moving leads', 'removal company pricing', 'UK removal rates', 'win removal jobs'],
    date: '2026-09-05', reading_time: '8 min read',
    faqs: [
      { q: 'What should I quote for a 3-bedroom house move?', a: 'The UK benchmark for a local 3-bed house move is roughly £450 to £950 in 2026. Your quote should sit within this range unless access, stairs, parking or distance justify more. Quoting within the benchmark range means homeowners won\'t dismiss you before you have a chance to sell your value.' },
      { q: 'Why are removal quotes so different between companies?', a: 'Because the inputs differ: crew size, van size, travel distance, packing materials, parking and access, and insurance levels. When you see a competitor quoting far lower, they are usually covering less — fewer crew, no VAT, no permits. Benchmark against scope, not just the headline number.' },
      { q: 'How do I price a moving lead quickly?', a: 'Build a pricing matrix by property size and distance so you can quote a fresh moving lead in minutes. Add extras (parking permits, packing, stairs, disconnection) as line items. Speed matters: the first removal company to quote a moving lead usually wins it.' },
      { q: 'How do I win moving leads without slashing my price?', a: 'Quote within benchmark range, respond fast, and sell the difference: guaranteed crew, itemised scope, insurance, and clear communication. Homeowners getting three similar-priced quotes usually pick the most professional and responsive company, not the cheapest.' }
    ],
    sections: [
      { h: 'Know the market before you quote', body: [
        'When a fresh moving lead lands, the homeowner is usually collecting two or three quotes. If yours is wildly outside the market range, you are out before you have a chance to explain why. Knowing the 2026 UK benchmarks lets you price every moving lead fast and credibly.',
        { table: [['Move type', 'Typical 2026 price'], ['1-bed flat, local move', '£200 – £500'], ['2-bed house, local move', '£350 – £700'], ['3-bed house, local move', '£450 – £950'], ['4-bed house, local move', '£700 – £1,500'], ['3-bed house, long-distance', '£1,000 – £1,800'], ['Packing service (per crew)', '£200 – £400 extra']] },
        'London and the South East sit at the top of each range; northern regions at the bottom. Fridays, weekends and summer peak command a premium. Use these numbers as the anchor for every quote you send.',
        { cta: 'Get fresh moving leads in your postcode areas every morning at 9am — start your free trial.' }
      ] },
      { h: 'Build a pricing matrix so you can quote in minutes', body: [
        'The removal companies that win the most moving leads are the ones that quote fastest. A pricing matrix turns a 20-minute estimate into a 2-minute one.',
        { ul: ['Base price by property size (1-2 bed, 3 bed, 4+ bed)', 'Distance bands: local, regional, long-distance, international', 'Crew and van configuration per band', 'Standard extras list with prices (packing, permits, stairs)', 'Peak-season and weekend uplift', 'Minimum job price to protect margin'] },
        'With a matrix, every fresh moving lead gets a credible, consistent quote that is within market range and profitable — and it goes out the same day.',
        { cta: 'See how moving leads fit your quote pipeline — start your free trial.' }
      ] },
      { h: 'The extras that catch people out', body: [
        'The biggest source of quoted-vs-actual pain is extras that were never itemised. Parking permits, meter feeding, carrying from a third-floor flat with no lift, packing materials, and disconnecting appliances each add £50 to £200.',
        'When you list these as clear line items on every quote, two things happen: the homeowner understands the true scope, and you stop absorbing costs that should be charged. An itemised quote also looks more professional than a vague one.',
        { cta: 'Learn how removal companies win with moving leads — start your free trial.' }
      ] },
      { h: 'Quote moving leads before your competitors', body: [
        'A moving lead is most valuable in the first few hours. The homeowner is actively comparing companies, and the first firm to send a warm, itemised, on-market quote usually controls the conversation. Later callers end up competing on price.',
        'Make a fast quote your standard operating procedure: alert on the 9am delivery, review the property details, apply your matrix, and send the quote the same morning. Speed is a competitive weapon you control.',
        { cta: 'Delivered every morning at 9am — start your free trial.' }
      ] },
      { h: 'Protect your margin while winning the job', body: [
        'Winning every moving lead at rock-bottom prices is not a strategy — it is a race to zero. Price within the benchmark range, sell your value (guaranteed crew, insurance, communication), and walk away politely from leads that cannot be profitable.',
        'Track your win rate and average job value in a simple sheet. Over time you will see which areas and property types are profitable, so you can target your postcode areas and adjust your matrix.',
        { cta: 'Start your free week of moving leads today.' }
      ] }
    ]
  },
    {
    slug: 'probate-solicitor-fees-guide',
    title: 'Probate Fee Benchmarks for Solicitors: Pricing Instructions to Win and Stay Profitable',
    description: 'How UK solicitors price probate instructions in 2026 — hourly, fixed and percentage models, fee benchmarks, and how to quote probate leads to win the instruction profitably.',
    category: 'probate', product_name: 'Probate Leads', categoryLabel: 'Probate Leads',
    keywords: ['probate fee benchmarks', 'probate solicitor pricing', 'price probate instructions', 'win probate leads', 'probate fees for solicitors'],
    date: '2026-09-05', reading_time: '8 min read',
    faqs: [
      { q: 'How do solicitors charge for probate?', a: 'The three common models are percentage of the estate value, fixed fees, and hourly rates. Percentage fees are easiest to quote from a probate lead but can undersell large estates; fixed fees win instructions but need careful scoping; hourly rates suit complex estates but carry uncertainty for the client.' },
      { q: 'How should I price a probate lead?', a: 'Assess the estate value from the grant data, choose a model that fits the complexity, and quote within market range. Speed and clarity win probate instructions — the firm that quotes first with a transparent, itemised fee usually gets the work.' },
      { q: 'What is a typical probate fee in the UK?', a: 'Fixed-fee probate work typically runs a few hundred to a couple of thousand pounds depending on complexity; percentage models often sit around 1-3% of the estate value; hourly rates vary by region and seniority. Always state disbursements separately.' },
      { q: 'How do I win probate leads against competitors?', a: 'Contact the executors within the first 48 hours of the grant, quote clearly and quickly, and lead with empathy. Executors are choosing between several firms — the one that is fast, clear and human wins the instruction.' }
    ],
    sections: [
      { h: 'The fee models and when each wins', body: [
        'There are three standard ways to charge for probate, and each suits different estates. Your choice affects both your win rate on probate leads and your profitability.',
        { table: [['Model', 'How it works', 'Best for'], ['Percentage', '1-3% of estate value', 'Quick quotes on simple estates'], ['Fixed fee', 'Set price for defined scope', 'Winning competitive instructions'], ['Hourly', 'Time spent, recorded', 'Complex or disputed estates']] },
        'Many firms blend them: a fixed fee for straightforward administration plus hourly for anything out of scope. Clarity is what wins instructions.',
        { cta: 'Get fresh probate leads in your counties every morning at 9am — start your free trial.' }
      ] },
      { h: 'Benchmark your prices to the market', body: [
        'Executors often shop around. If your quote is far outside the local market, you lose the instruction before you can explain your value. Benchmark your fixed fees and percentage rates against your region and estate sizes.',
        'Publish or state your pricing model clearly in your first contact. Transparency is a differentiator in a service where families are anxious about cost.',
        { cta: 'See what probate leads could do for your practice — start your free trial.' }
      ] },
      { h: 'Price probate leads fast and clearly', body: [
        'A probate lead is most valuable in the first 48 hours after the grant is applied for. Executors are gathering quotes, and the firm that responds first with a clear, itemised fee usually wins the instruction.',
        'Build a simple scoping checklist: estate value, assets (property, shares, bank), whether it is straightforward or complex, and any likely disputes. From that, apply your fee model and send the quote the same day.',
        { cta: 'Fresh probate grants delivered daily — start your free trial.' }
      ] },
      { h: 'State disbursements separately', body: [
        'Executors are often surprised by disbursements — court fees, Land Registry, searches, insurance, and valuation costs. If these are buried, the client feels misled later. List them separately so the total is transparent and defensible.',
        { ul: ['Court application fee', 'Land Registry fees', 'Copies of the grant', 'Property valuation', 'Bankruptcy search', 'Insurance premium', 'Postage and administration'] },
        'A transparent fee breakdown builds trust — and trust wins probate instructions.',
        { cta: 'Start your free week of probate leads.' }
      ] },
      { h: 'Track win rate and profitability', body: [
        'Track how many probate leads you quote, how many you win, and the average fee per instruction. Over time you will see which estate sizes and counties are most profitable, so you can target your probate lead areas and refine your pricing.',
        'One probate instruction typically covers a lead subscription many times over. Profitability is about winning the right instructions at the right price.',
        { cta: 'Delivered every morning at 9am — start your free trial.' }
      ] }
    ]
  },
  {
    slug: 'companies-house-search-new-companies',
    title: 'Companies House Search: How to Find New Companies to Sell To',
    description: 'How to use Companies House search and free tools to find newly registered companies in your target sector and location — a step-by-step guide for accountants, web designers and B2B providers.',
    category: 'newbusiness', product_name: 'New Business Leads', categoryLabel: 'New Business Leads',
    keywords: ['companies house search', 'find new companies', 'companies house newly incorporated', 'new company list UK', 'B2B company data'],
    date: '2026-09-03', reading_time: '7 min read',
    faqs: [
      { q: 'Can I search Companies House for new companies?', a: 'Yes. The Companies House service offers a public search, and the register includes the date of incorporation, company type, registered office and industry SIC codes. You can also use filters like the advanced search on the GOV.UK website.' },
      { q: 'Is Companies House data free?', a: 'The core register is free to search. Bulk and API access is available via Companies House, and third-party services (including 9amLeads) package the data with SIC, location and contact filters for faster targeting.' },
      { q: 'How do I find new companies in my sector?', a: 'Use the advanced search on the GOV.UK Companies House service, filter by SIC code and incorporation date (e.g. the last 7 or 30 days), and export or shortlist the results by location and company type.' },
      { q: 'How do I know which new companies are worth contacting?', a: 'Look for companies with an active-looking profile: a real registered office, a relevant SIC code, and multiple directors or a credible capital figure. Skip dormant or obviously shell companies and focus on businesses set up to trade.' }
    ],
    sections: [
      { h: 'Why newly incorporated companies are gold for B2B', body: [
        'A newly registered company has no incumbent suppliers. In its first weeks the director must choose an accountant, a bank, a website provider, insurance, IT and more — and whoever makes first contact usually gets the business. The register is public, free and updated daily, which makes it the best B2B lead source many providers never use.',
        'The skill is not finding the companies — the search is easy. It is filtering them to the ones that will actually trade and need your service.',
        { cta: 'Get Companies House new company data matched to your sector — start your free trial.' }
      ]},
      { h: 'Step by step: find new companies on the register', body: [
        'The Companies House advanced search makes this straightforward:',
        { ul: ['Go to the Companies House service and open the advanced company search', 'Set incorporation date to the last 7 or 30 days', 'Add the SIC codes for the sectors you serve', 'Filter by location if you only work locally', 'Review the list and shortlist companies that look set up to trade', 'Use the registered office and any public director info to build your prospect list'] },
        'The SIC code filter is the most powerful lever — it turns a generic list of new companies into a list of your ideal clients.'
      ]},
      { h: 'Use SIC codes to find your ideal client', body: [
        'SIC codes classify what a company does, and they let you target precisely. An accountant might target all new professional-services firms; a web designer might target retail and e-commerce registrations; an IT provider might target legal and financial services.',
        'Familiarise yourself with the codes that match your best customers and build a saved search around them, so finding new companies takes minutes rather than an afternoon.',
        { table: [['Your service', 'SIC codes to watch'], ['Accountancy', '69 (legal & accounting), 47 (retail), all services'], ['Web design / marketing', '47 (e-commerce), 70 (consultancy), 74 (design)'], ['IT / telecoms', '62 (software), 63 (information services), 66 (finance)'], ['Insurance / compliance', '41 (construction), 49 (transport), 86 (health)']] }
      ]},
      { h: 'Filter out the companies not worth chasing', body: [
        'Not every registration is a business about to trade. Skip dormant companies, shell registrations and businesses set up for a purpose you cannot serve. Signals of a real business include a genuine registered office (not just an accountant\'s address), a specific and relevant SIC code, and founders who have registered for the services they need.',
        'Checking the incorporation details takes seconds and saves you from calling companies that will never become customers.',
        { cta: 'Automate the search — get new company leads daily — start your free trial.' }
      ]},
      { h: 'Turn the list into a follow-up system', body: [
        'A list of new companies is only valuable if you contact them in the first weeks. Build a simple cadence: a first email referencing the company by name, a follow-up a few days later, and a call the following week. The companies you contact in the first fortnight are the ones you win.',
        'Whether you search manually or use a daily feed like 9amLeads, the advantage is the same — you are first to a brand new company with no incumbent supplier. That is the cheapest, highest-converting B2B lead there is.'
      ]}
    ]
  },
    {
    slug: 'loft-conversion-planning-permission',
    title: 'Loft Conversion Leads: How Builders Win High-Value Projects First',
    description: 'When loft conversions need planning permission, and how builders use planning leads to spot high-value loft projects before competitors and win the job.',
    category: 'planning', product_name: 'Planning Leads', categoryLabel: 'Planning Permission Leads',
    keywords: ['loft conversion leads', 'loft conversion planning permission', 'win loft conversion projects', 'planning leads for builders', 'loft conversion builders'],
    date: '2026-09-05', reading_time: '8 min read',
    faqs: [
      { q: 'Do I need planning permission for a loft conversion?', a: 'Many loft conversions are permitted development, but size, dormer windows, and position relative to the ridge can trigger planning permission. The planning application itself is your lead signal — it means the homeowner is committed and ready to spend.' },
      { q: 'How do I find loft conversion projects?', a: 'Use planning leads to see loft conversion applications in your council areas the day they appear. The homeowner is actively planning the build — the builder who quotes first usually wins.' },
      { q: 'Who wins loft conversion work?', a: 'Speed and relevance. The builder who contacts the applicant with a clear, specific quote on the day the application appears wins an outsized share of the work. Later competitors end up chasing.' },
      { q: 'What is a loft conversion worth to a builder?', a: 'Loft conversions are high-value projects. A single conversion can cover a planning leads subscription many times over — which is why targeting them is so profitable.' }
    ],
    sections: [
      { h: 'Every loft application is a committed buyer', body: [
        'When a loft conversion application appears, the homeowner has already decided to spend. Architects, engineers and builders are in motion, and budgets are set. This is a serious, funded project — exactly the kind of lead a builder wants.',
        'Planning leads surface these applications in your council areas the day they are published. Speed turns them into jobs.',
        { cta: 'Get fresh planning leads in your areas every morning at 9am — start your free trial.' }
      ] },
      { h: 'When a loft conversion needs planning permission', body: [
        'Many loft conversions are permitted development, but planning permission is triggered when: the dormer or roof extension exceeds the permitted size, it is positioned at the front of the house, or it sits too close to the ridge.',
        { ul: ['Dormer beyond the permitted volume or height', 'Front-facing or side-facing dormers in some cases', 'Extensions above the highest part of the existing roof', 'Conservation areas and listed buildings', 'Flats and maisonettes (different rules)'] },
        'The presence of an application means the project is real and funded — the strongest signal you can get.',
        { cta: 'See what planning leads could do for your business — start your free trial.' }
      ] },
      { h: 'Spot the high-value projects', body: [
        'Not all loft applications are equal. Read the application to judge value: the size and type of conversion, whether it includes structural work, bathrooms, and the property location.',
        { table: [['Signal', 'What it means'], ['Full conversion with bathroom', 'Higher value, more trades'], ['Dormer extension', 'Structural work, more spend'], ['Conservation area', 'Specialist finishes, premium pricing'], ['Large property, high-value area', 'Larger budget']] },
        'Prioritise the applications that justify your best quote.',
        { cta: 'Start your free week of planning leads.' }
      ] },
      { h: 'Quote first, win the job', body: [
        'The builder who contacts the applicant on the day the application appears, with a specific quote for their project, wins an outsized share of the work. Later competitors end up competing on price.',
        'Use the planning lead details — the property address and proposed works — to tailor your outreach. A message that references their specific loft conversion gets a far better response than a generic pitch.',
        { cta: 'Delivered every morning at 9am — start your free trial.' }
      ] },
      { h: 'Build a steady pipeline of conversions', body: [
        'Track every loft application you quote, win and complete. Over time you will see which council areas and project types are most profitable, so you can focus your planning lead areas.',
        'A single loft conversion typically covers a planning leads subscription many times over. Consistency plus speed turns planning leads into a predictable pipeline.',
        { cta: 'Fresh planning applications delivered daily — start your free trial.' }
      ] }
    ]
  },
  {
    slug: 'tenders-for-cleaning-companies',
    title: 'How to Find Tenders for Cleaning Companies: A Practical Guide',
    description: 'Where cleaning and facilities management companies can find public sector cleaning tenders, how to filter them, and how to write a cleaning bid that actually wins contracts.',
    category: 'tenders', product_name: 'Tender Opportunities', categoryLabel: 'Tender Opportunities',
    keywords: ['cleaning tenders UK', 'cleaning contracts public sector', 'FM cleaning tenders', 'cleaning company government contracts', 'find cleaning tenders'],
    date: '2026-09-01', reading_time: '7 min read',
    faqs: [
      { q: 'Where are cleaning tenders published?', a: 'Public sector cleaning and FM contracts are published on Contracts Finder, Find a Tender, PCS and eTendersNI, plus local authority and NHS portals. Many are also advertised on procurement frameworks like CCS (Crown Commercial Service).' },
      { q: 'Are cleaning contracts realistic for small companies?', a: 'Yes. Many cleaning and FM tenders are deliberately sized and weighted for SMEs — local authority and school contracts often suit small teams, and buyers value local, specialist suppliers. Winning your first contract is mostly about picking the right one and answering the questions fully.' },
      { q: 'What do cleaning tenders ask for?', a: 'Expect questions on your cleaning schedules and methodology, staffing and supervision, training and security checks (DBS), insurances and compliance, health and safety, and evidence of similar contracts. Compliance documents like insurance and disclosure forms are mandatory.' },
      { q: 'How do I get onto cleaning frameworks?', a: 'Frameworks like CCS RM6316 (or the current FM equivalents) and local authority framework agreements let you be invited to future work. Getting listed is an application in itself — complete the capability and compliance questions thoroughly.' }
    ],
    sections: [
      { h: 'The public sector market for cleaning', body: [
        'Councils, schools, NHS trusts and other public bodies buy cleaning services on long, recurring contracts. That recurring revenue is attractive — but the barrier for most cleaning companies is simply not seeing the right opportunities or not knowing how the scoring works.',
        'Both are solvable. Cleaning and FM tenders follow a predictable pattern, and the same process wins them: find the right contract, answer the quality questions completely, evidence your claims, and price realistically.',
        { cta: 'Get cleaning tenders matched to your sector delivered at 9am — start your free trial.' }
      ]},
      { h: 'Where to find cleaning and FM tenders', body: [
        'The main sources are: Contracts Finder and Find a Tender for England and Wales, Public Contracts Scotland for Scotland, and eTendersNI for Northern Ireland. Local authority portals and the NHS Supply Chain advertise FM opportunities too.',
        'Use keyword filters like "cleaning", "catering cleaning", "facilities management" and "window cleaning", combined with your region and contract value. A daily tender feed does this filtering for you, so you only see contracts worth bidding on.',
        { table: [['Platform', 'What it covers', 'Search tip'], ['Contracts Finder', 'England & Wales', 'Filter "cleaning" + your region'], ['Find a Tender', 'Higher value UK', 'Set value threshold'], ['PCS', 'Scotland', 'Filter FM & cleaning'], ['eTendersNI', 'Northern Ireland', 'Filter cleaning']] }
      ]},
      { h: 'Choosing the cleaning contract to win', body: [
        'Your first public sector cleaning contract should be one you are almost certain to deliver well — a school, a small council building or a local authority site near your existing teams. Small, local contracts are exactly where SMEs win.',
        'Avoid the temptation to bid on everything. Responding excellently to two or three opportunities a month beats chasing twenty poorly. Each completed bid also improves your evidence bank for the next one.',
        { cta: 'Find winnable cleaning tenders — start your free trial.' }
      ]},
      { h: 'What buyers want in a cleaning bid', body: [
        'Cleaning tenders are scored on quality more than price. Buyers want: a clear cleaning schedule and methodology, staff supervision and management, training and DBS checks, robust health and safety, insurances at the required level, and evidence of similar work.',
        'Answer each question directly, evidence every claim with a named contract, and keep the response tidy. A compliant, complete submission that proves you can deliver is what wins — not the longest response.',
        { ul: ['Methodology: your cleaning schedule and frequency', 'Staffing: who works on the site and who supervises', 'Compliance: DBS, training, insurance, H&S', 'Evidence: similar contracts with results', 'Price: realistic, aligned to the specification'] }
      ]},
      { h: 'Build a cleaning contract pipeline', body: [
        'One won cleaning contract usually leads to the next: buyers re-tender, add sites, and award extensions to suppliers who deliver. Deliver reliably, ask for feedback, and keep watching the same buyers\' new opportunities.',
        'With a steady flow of matched tender opportunities, cleaning work stops being feast-and-famine and becomes a pipeline you can plan around.'
      ]}
    ]
  },
  {
    slug: 'measure-lead-generation-roi',
    title: 'How to Measure Lead Generation ROI: The Numbers That Matter',
    description: 'A practical framework for measuring whether your lead generation is actually making money — cost per lead, cost per closed job, conversion tracking and the simple spreadsheet that ties it together.',
    category: 'general', product_name: 'Business Leads', categoryLabel: 'Business Leads',
    keywords: ['lead generation ROI', 'measure lead ROI', 'cost per lead', 'cost per acquisition', 'lead conversion tracking'],
    date: '2026-08-30', reading_time: '8 min read',
    faqs: [
      { q: 'What is a good cost per lead?', a: 'There is no universal number — what matters is cost per closed job relative to the value of a job. If you convert 1 in 5 leads and your job is worth £800, a £40 lead is breakeven even if it sounds expensive. Always measure the full funnel, not the lead price.' },
      { q: 'How do I measure ROI if jobs come from referrals and leads mixed?', a: 'Track the source of every job — ask on the phone or add a source field to your CRM. Even a rough 80/20 split beats guessing. Over time, attributing jobs to their source tells you which channels actually pay.' },
      { q: 'What is the minimum tracking I need?', a: 'Three numbers: leads received, quotes sent, jobs won. Add the value of each job and the cost of each channel, and you have ROI. A spreadsheet with these columns is enough to start — precision matters less than consistency.' },
      { q: 'How often should I review ROI?', a: 'Weekly for the operational numbers (leads, contacts, quotes) and monthly for ROI and channel decisions. Weekly reviews catch problems fast; monthly reviews tell you where to spend next month\'s money.' }
    ],
    sections: [
      { h: 'The funnel, not the lead price', body: [
        'Most businesses judge lead generation by the wrong number — the price of a lead. A cheap lead you never convert is worthless; an expensive lead you win is priceless. ROI lives in the full funnel: leads, contacts, quotes, jobs, and the value of each job.',
        'Once you track the funnel, decisions become obvious. You stop asking "is this lead source cheap?" and start asking "which source produces a job for the least total cost?"',
        { cta: 'Track leads properly with a daily feed — start your free 7-day trial.' }
      ]},
      { h: 'The three numbers to track first', body: [
        'Start with the minimum viable tracking. Record three numbers every week:',
        { ul: ['Leads received — from each channel', 'Quotes sent — how many become actual proposals', 'Jobs won — and the average value of each job'] },
        'Add the cost you paid for each channel and you can calculate everything else: contact rate, quote-to-win rate, cost per lead, and cost per closed job.'
      ]},
      { h: 'The simple ROI spreadsheet', body: [
        'A one-page spreadsheet is all you need to run the numbers. Each channel gets a row; each column is a stage of the funnel:',
        { table: [['Channel', 'Leads', 'Quotes', 'Jobs', 'Job value', 'Cost', 'Cost per job'], ['Moving leads', '20', '12', '4', '£700', '£100', '£25'], ['PPC', '30', '10', '3', '£700', '£450', '£150'], ['Directory', '8', '3', '1', '£700', '£80', '£80']] },
        'The channel with the lowest cost per closed job is where the next pound goes. The example shows a cheap channel (moving leads) winning on the only number that matters.'
      ]},
      { h: 'Speed is part of the ROI equation', body: [
        'The same channel converts very differently depending on how fast you respond. A lead contacted within the hour wins at a far higher rate than one contacted tomorrow — which means your ROI improves by changing your process, not just your spend.',
        'Track contact time as a metric. If you notice leads sitting for hours, the fix is workflow, not a different lead source. Faster contact is often the cheapest improvement to ROI you will ever make.',
        { cta: 'Build a fast morning workflow — start your free trial.' }
      ]},
      { h: 'Review weekly, decide monthly', body: [
        'Review the operational numbers weekly — leads, contacts, quotes — so problems are caught in days, not months. Make channel decisions monthly, when you have enough jobs to judge ROI meaningfully. A single week\'s data is noise; a month is a signal.',
        'The companies that win with lead generation are not the ones with the fanciest tools. They are the ones that measure the funnel, improve the weak step, and put next month\'s money where the jobs actually come from.'
      ]}
    ]
  },
  {
    slug: 'get-more-removal-customers-without-ads',
    title: 'How to Get More Removal Customers Without Spending on Ads',
    description: 'Seven proven ways removal companies can fill their calendar without paying for advertising — referrals, reviews, local visibility, partnerships and daily moving leads.',
    category: 'moving', product_name: 'Moving Leads', categoryLabel: 'Moving Leads',
    keywords: ['get removal customers', 'removal company marketing', 'fill removal calendar', 'removals without ads', 'removal company growth'],
    date: '2026-09-06', reading_time: '8 min read', publish_delay_days: 1,
    faqs: [
      { q: 'Can a removal company grow without ads?', a: 'Yes. Referrals, reviews, repeat clients, local visibility, estate agent partnerships and a fast daily-lead routine generate work without a single ad pound. Most companies win more from these channels than from advertising — they just never measure it.' },
      { q: 'What is the fastest channel to fill the calendar?', a: 'Speed on daily moving leads. When a property goes under offer, the removal company that calls within the hour wins far more often. For a fraction of ad spend, a daily lead feed puts you in front of homeowners at the exact moment they need you.' },
      { q: 'How do I get estate agents to send me work?', a: 'Agents recommend removal companies they trust because it protects the sale process. Build the relationship with a named contact, do flawless moves, and offer agents a simple referral arrangement — leave cards, attend launches, and follow up after every move.' },
      { q: 'Why do reviews matter so much for removals?', a: 'Moving is high-trust, and most homeowners start with Google reviews. A strong review profile converts more enquiries than any ad, and it compounds — each happy move produces the next. Make a review request part of your completion process.' }
    ],
    sections: [
      { h: 'The ad-free growth engine', body: [
        'Removal companies that grow profitably rarely depend on ads. They build a repeatable engine: referrals from every move, reviews that make the phone ring, local visibility when people search, agent partnerships that send steady work, and a fast routine on fresh moving leads.',
        'Each channel feeds the others. A great move earns a review, the review earns a referral, and the referral becomes another move to earn another review. Ads are not the only way to start the loop.',
        { cta: 'Get moving leads in your postcode delivered daily — start your free 7-day trial.' }
      ]},
      { h: 'Make every move generate the next one', body: [
        'The cheapest customer is the one you already have. Ask every customer on the day for feedback, fix anything that was less than perfect, and request a Google review at the moment of happiness — straight after a well-done completion.',
        'Add a simple "moved by us" card to your completion pack, and run a six-month reminder for the next move. A homeowner who moved well with you is your best salesperson and your next client.',
        { ul: ['Request a review at completion, not a week later', 'Send a thank-you and ask for one referral', 'Keep a six-month "moving again?" reminder list', 'Track referrals so you know your true cost per job'] }
      ]},
      { h: 'Dominate your local search', body: [
        'When homeowners search "removal companies near me", the businesses with complete, reviewed Google Business Profiles win. Fill every field, add photos of your vans and crews, and answer questions promptly. Consistent positive reviews are the biggest ranking and trust factor you control.',
        'Local visibility compounds quietly. You do not pay per click — you simply become the obvious choice in your postcode areas.',
        { cta: 'Choose the right postcode areas for your moving leads — start your free trial.' }
      ]},
      { h: 'Partner with estate agents', body: [
        'Estate agents want their sales to complete smoothly, which makes a reliable removal company a genuine asset to them. Introduce yourself to local agents, leave a clean stack of cards, attend their property launches, and deliver a flawless move every time.',
        'Agents only recommend companies they trust, so consistency is everything. One great agent relationship can quietly feed you work for years.',
        { ul: ['Identify the top 5–10 local agents by volume', 'Meet them personally with a simple offer', 'Give them cards and a reliable named contact', 'Follow up after every move they refer'] }
      ]},
      { h: 'The 9am daily-lead routine', body: [
        'Advertising shows you to people who may be moving someday. A daily moving lead feed shows you to people who are moving right now. When a property goes SSTC or under offer, contact matters more than brand.',
        'Build the habit: review leads at 9am, call the strongest within the hour, quote on the day, follow up after 48 hours. A removal company that runs this routine reliably converts a steady stream of fresh leads into bookings — without a single ad pound.'
      ]}
    ]
  },
    {
    slug: 'probate-vs-administration-guide',
    title: 'Probate vs Estate Administration: How Solicitors Sell the Full Service',
    description: 'The difference between probate and estate administration, and how solicitors use a probate lead to win the full instruction — from the grant to completion.',
    category: 'probate', product_name: 'Probate Leads', categoryLabel: 'Probate Leads',
    keywords: ['probate vs administration', 'probate and estate administration', 'win probate instructions', 'probate leads for solicitors', 'estate administration services'],
    date: '2026-09-05', reading_time: '7 min read',
    faqs: [
      { q: 'What is the difference between probate and estate administration?', a: 'Probate is the legal grant from the court that gives authority to deal with the estate. Estate administration is the whole job that follows: collecting assets, paying debts and tax, and distributing to beneficiaries. Most clients need both, which is why winning the probate lead opens the door to the full instruction.' },
      { q: 'Why should I offer estate administration as well as probate?', a: 'The administration work is where most of the fee sits. The grant is the entry point; the administration is the profitable, repeatable work. Positioning the full service from the first contact wins bigger instructions.' },
      { q: 'How do I win the full probate instruction?', a: 'Contact executors within the first 48 hours of the grant, explain the whole journey (grant plus administration) in plain language, and quote the full service. Executors choose the firm that makes the process feel manageable.' },
      { q: 'When might an estate not need a grant?', a: 'Small estates, jointly-owned assets passing by survivorship, or where the estate is below the threshold may not need a grant. Recognising this early positions you as an expert and lets you offer the right level of help.' }
    ],
    sections: [
      { h: 'Two jobs, one instruction', body: [
        'Executors hear "probate" and assume it is one job. In practice there are two: getting the grant of probate, and then administering the estate — collecting assets, paying debts and tax, and distributing to beneficiaries. The administration is usually where the real work (and fee) sits.',
        'When you explain this clearly on a fresh probate lead, you position yourself as the firm that handles the whole journey — and you win the larger instruction.',
        { cta: 'Get fresh probate leads in your counties every morning at 9am — start your free trial.' }
      ] },
      { h: 'What the grant involves', body: [
        'The grant of probate is the court document giving authority to deal with the estate. It requires the will (if any), an inheritance tax account where needed, and the application to the Probate Registry.',
        'A probate lead tells you a grant has been applied for — which means the estate is in motion and the executors need help now. That is the perfect moment to offer the full service.',
        { cta: 'See what probate leads could do for your practice — start your free trial.' }
      ] },
      { h: 'What estate administration involves', body: [
        'Once the grant is issued, the real work begins: valuing and collecting assets, selling property, settling debts and inheritance tax, preparing estate accounts, and distributing to beneficiaries.',
        { ul: ['Identify and value all assets', 'Collect bank balances, shares and property', 'Sell or transfer assets as required', 'Settle debts and inheritance tax', 'Prepare estate accounts', 'Distribute to beneficiaries and close the estate'] },
        'Every one of these is a service you can offer — and each one justifies part of the fee.',
        { cta: 'Start your free week of probate leads.' }
      ] },
      { h: 'Win the full instruction from the first contact', body: [
        'On a fresh probate lead, the winning move is to explain the whole journey in plain English and quote the full service — grant plus administration. Executors are overwhelmed; the firm that makes it feel manageable wins the instruction.',
        'Lead with empathy, be transparent about fees, and offer a clear next step. Speed matters: contact within the first 48 hours while the executors are still choosing.',
        { cta: 'Fresh probate grants delivered daily — start your free trial.' }
      ] },
      { h: 'Position yourself as the expert', body: [
        'Recognising when a grant is needed — and when it is not — marks you as the expert. Small estates, jointly-owned assets passing by survivorship, and estates below threshold may not need a grant, and advising on that early builds trust.',
        'Track your probate win rate and average fee. A steady pipeline of fresh grants, converted into full instructions, is how probate practices grow predictably.',
        { cta: 'Delivered every morning at 9am — start your free trial.' }
      ] }
    ]
  },
    {
    slug: 'what-new-company-needs-first-month',
    title: 'What New Companies Buy in Their First Month: The B2B Supplier Opportunity',
    description: 'The services every newly-registered UK company needs in its first month — and how B2B suppliers use new business leads to win them as clients first.',
    category: 'newbusiness', product_name: 'New Business Leads', categoryLabel: 'New Business Leads',
    keywords: ['services for new companies', 'sell to new businesses', 'new business leads B2B', 'what new companies buy', 'win new company clients'],
    date: '2026-09-05', reading_time: '8 min read',
    faqs: [
      { q: 'What services do new companies buy first?', a: 'In the first month most new companies buy accounting and bookkeeping, a registered office and virtual address, business bank account, insurance, a website and email, and often IT setup and compliance. These are the services B2B suppliers can pitch.' },
      { q: 'Why are new business leads valuable?', a: 'A new company is still choosing its suppliers. Contact them in their first days and you have a chance to become their provider from day one — a relationship that typically lasts for years.' },
      { q: 'How do I win new company clients?', a: 'Be first and be helpful. Send a clear onboarding offer within hours of the registration appearing, explain what they need in their first 30 days, and follow up. Founders are overwhelmed — the supplier who simplifies things wins.' },
      { q: 'Which new companies should I target?', a: 'Use SIC codes and company type filters to target the industries you serve. A company selling professional services, construction or retail each needs different suppliers — target the ones that fit your offering.' }
    ],
    sections: [
      { h: 'The first month is the window', body: [
        'A new company is a buyer in a hurry. In its first month it needs accounts, a bank account, insurance, a website, email, IT, and compliance. The suppliers who contact it in those first days usually keep it as a client for years.',
        'New business leads are the map: they tell you which companies just registered, in which industries, and where. Act on the day and you win the onboarding.',
        { cta: 'Get fresh new business leads every morning at 9am — start your free trial.' }
      ] },
      { h: 'The services every new company buys', body: [
        'Build your offer around the first-month essentials. These are the purchases every new LTD makes, and the services B2B suppliers can win.',
        { table: [['Service', 'Why they need it', 'Who sells it'], ['Accounting & bookkeeping', 'Filing, tax, payroll', 'Accountants, bookkeepers'], ['Registered office & virtual address', 'Legal requirement, privacy', 'Formation agents, virtual offices'], ['Business bank account', 'Separate finances', 'Banks, fintechs'], ['Insurance', 'Employers\' & public liability', 'Brokers'], ['Website & email', 'Presence and credibility', 'Web designers, hosting'], ['IT setup & security', 'Tools to work', 'IT support, cyber firms'], ['Compliance & GDPR', 'Stay legal', 'Consultants']] },
        'Pick the services that fit your business and lead with the ones a founder needs most urgently.',
        { cta: 'See what new business leads could do for you — start your free trial.' }
      ] },
      { h: 'Be the helpful first contact', body: [
        'Founders are overwhelmed and making decisions fast. The supplier who simplifies things wins the account. Lead with a clear "here is what to sort in your first 30 days" message — it positions you as the expert and makes saying yes easy.',
        'Speed is everything. A new business lead is most valuable in the first hours and days, before the founder has chosen their providers.',
        { cta: 'Fresh new company registrations delivered daily — start your free trial.' }
      ] },
      { h: 'Filter to the right industries', body: [
        'Not every new company fits your service. Use SIC codes and company type filters to target the industries you serve, so every lead is a genuine prospect, not a lottery ticket.',
        { ul: ['Filter by SIC code or industry', 'Target your region or nationwide', 'Exclude company types you do not serve', 'Track win rate by industry to refine targeting'] },
        'Focused targeting means your team only acts on leads that convert.',
        { cta: 'Start your free week of new business leads.' }
      ] },
      { h: 'One client pays for the year', body: [
        'A single onboarding — an accounting client, a website build, an insurance policy — typically covers a new business lead subscription many times over. The rest is profit.',
        'Track how many leads you contact, quote and win. Over time the numbers show which industries and regions produce your best clients, so you can focus your daily pipeline.',
        { cta: 'Delivered every morning at 9am — start your free trial.' }
      ] }
    ]
  },
    {
    slug: 'rear-extension-planning-permission',
    title: 'Rear Extension Leads: How Builders Win Projects Before Competitors',
    description: 'When rear extensions need planning permission, and how builders use planning leads to spot and win rear extension projects first.',
    category: 'planning', product_name: 'Planning Leads', categoryLabel: 'Planning Permission Leads',
    keywords: ['rear extension leads', 'rear extension planning permission', 'win extension projects', 'planning leads for builders', 'extension builders'],
    date: '2026-09-05', reading_time: '8 min read',
    faqs: [
      { q: 'Do I need planning permission for a rear extension?', a: 'Many rear extensions are permitted development, but size limits, single vs two-storey, and distance to boundaries trigger planning permission. The application itself is the lead signal — the homeowner is committed and ready to build.' },
      { q: 'How do I find rear extension projects?', a: 'Use planning leads to see rear extension applications in your council areas the day they appear. Contact the applicant with a specific quote and you are ahead of every competitor who finds out later.' },
      { q: 'Who wins rear extension work?', a: 'Speed and specificity. The builder who references the actual project and quotes on the day the application appears wins. Generic outreach and slow response lose to focused, fast quotes.' },
      { q: 'What is a rear extension worth to a builder?', a: 'Rear extensions are substantial jobs. A single project can cover a planning leads subscription many times over, which is why targeting them is so profitable.' }
    ],
    sections: [
      { h: 'Every rear extension application is a project', body: [
        'A rear extension application means a homeowner is about to spend real money on their home. The project is defined, the budget is forming, and the trades will be chosen soon. Planning leads surface these applications the day they appear.',
        'The builder who acts first controls the conversation. Speed is your competitive edge.',
        { cta: 'Get fresh planning leads in your areas every morning at 9am — start your free trial.' }
      ] },
      { h: 'When a rear extension needs planning permission', body: [
        'Many rear extensions are permitted development, but planning permission is triggered by size, storeys, and boundary distance.',
        { ul: ['Extensions beyond permitted development size limits', 'Two-storey rear extensions (stricter rules)', 'Within certain distances of the boundary', 'Conservation areas and listed buildings', 'Flats and maisonettes'] },
        'An application means the project is real and funded — the strongest lead signal for a builder.',
        { cta: 'See what planning leads could do for your business — start your free trial.' }
      ] },
      { h: 'Judge the project value from the application', body: [
        'Read the application to estimate value: single vs two-storey, floor area, glazing, and property location. A two-storey rear extension in a good area is a premium project.',
        { table: [['Signal', 'What it means'], ['Two-storey rear extension', 'Larger job, more trades'], ['Large floor area', 'Bigger budget'], ['High-value location', 'Premium pricing'], ['Conservation area', 'Specialist finishes']] },
        'Prioritise the applications that justify your best quote.',
        { cta: 'Start your free week of planning leads.' }
      ] },
      { h: 'Contact applicants on day one', body: [
        'The builder who contacts the applicant on the day the application appears — with a specific quote for their project — wins an outsized share of the work.',
        'Reference the actual proposal in your outreach. "I saw your two-storey rear extension application" gets a response; a generic "we do extensions" does not. Send a tailored quote and a clear next step.',
        { cta: 'Delivered every morning at 9am — start your free trial.' }
      ] },
      { h: 'A predictable pipeline of extension work', body: [
        'Track every rear extension you quote, win and complete. Over time you will see which council areas and project types are most profitable, so you can focus your planning lead areas.',
        'A single rear extension typically covers a planning leads subscription many times over. Consistency plus speed turns planning leads into a steady pipeline.',
        { cta: 'Fresh planning applications delivered daily — start your free trial.' }
      ] }
    ]
  },
  {
    slug: 'framework-agreement-guide',
    title: 'What is a Framework Agreement? A Plain English Guide for SMEs',
    description: 'What public sector framework agreements are, how they work, how SMEs get onto them, and whether they are the right route to government work for your business.',
    category: 'tenders', product_name: 'Tender Opportunities', categoryLabel: 'Tender Opportunities',
    keywords: ['framework agreement explained', 'public sector frameworks', 'get on a framework', 'CCS frameworks SMEs', 'framework vs tender'],
    date: '2026-09-10', reading_time: '7 min read', publish_delay_days: 5,
    faqs: [
      { q: 'What is a framework agreement?', a: 'A framework agreement is a pre-agreed list of approved suppliers that public bodies can buy from without running a full tender every time. It is a standing arrangement, not a contract for a fixed amount of work.' },
      { q: 'How do SMEs get onto a framework?', a: 'Frameworks are awarded through a competition — you apply when the framework opens, answer the capability and quality questions, and if you are accepted you join the approved supplier list for its lifetime (usually up to four years).' },
      { q: 'Does being on a framework guarantee work?', a: 'No. It guarantees eligibility — public buyers can call off work from the framework, but they are not obliged to give you any. You still compete for call-offs against other approved suppliers.' },
      { q: 'Should a small business join a framework?', a: 'If your sector has relevant frameworks (cleaning, IT, construction, FM, consultancy) and you can evidence the capability, yes — it is one of the best ways to open up recurring public sector work. Choose frameworks where you can genuinely compete.' }
    ],
    sections: [
      { h: 'Frameworks in plain English', body: [
        'A framework agreement is like an approved-supplier list. A public body runs a competition once, picks a set of capable suppliers, and then buys from that list for the next few years without running a full tender for every small job.',
        'Being on a framework is not a contract and guarantees no work. It guarantees eligibility. When a buyer needs a service, they can go straight to the framework and run a simple call-off — and you, as an approved supplier, can be invited.',
        { cta: 'Get tender and framework opportunities matched to your business — start your free trial.' }
      ]},
      { h: 'How the framework process works', body: [
        'The framework itself is procured through a competition. The buyer publishes the opportunity, suppliers apply with capability and quality answers, and the winners are appointed to the framework for its term — commonly two to four years.',
        'Work then comes in two ways: direct award (the buyer picks one approved supplier for a small job) or mini-competition (approved suppliers bid against each other for a specific call-off). Being on the framework is the ticket to both.',
        { ul: ['Apply when the framework competition opens', 'Answer capability and quality questions with evidence', 'Meet the compliance and insurance requirements', 'Wait for appointment, then register for call-offs', 'Bid well on mini-competitions to win the work'] }
      ]},
      { h: 'Popular frameworks for SMEs', body: [
        'Crown Commercial Service (CCS) frameworks cover IT, facilities management, cleaning, construction, professional services and more, and many are open to SMEs. Local authorities and schools operate their own framework agreements for regional suppliers.',
        'The value of a framework for a small business is access: you stop chasing each opportunity cold and become a recognised, compliant supplier that buyers call on. For the right sector, it is the single best door into public sector work.',
        { table: [['Sector', 'Typical framework route'], ['Cleaning / FM', 'CCS FM and local authority frameworks'], ['IT / digital', 'CCS technology frameworks'], ['Construction', 'Scape, CCS and regional frameworks'], ['Professional services', 'CCS RM6166 and similar']] }
      ]},
      { h: 'Frameworks vs one-off tenders', body: [
        'A one-off tender is a single contract with a defined outcome. A framework is a standing arrangement that can feed you many smaller pieces of work over years. Frameworks suit businesses that can deliver recurring, repeatable services; one-off tenders suit project-based work.',
        'Many SMEs use both: framework membership for steady recurring work, plus targeted tenders for larger single contracts. The two together smooth out the workload.',
        { cta: 'Compare tenders and frameworks for your sector — start your free trial.' }
      ]},
      { h: 'Getting on your first framework', body: [
        'Find frameworks relevant to your sector, register your interest when they open, and prepare your evidence: capability statements, relevant contracts, insurance and compliance documents. Apply to the ones you can genuinely compete on, and answer the quality questions fully.',
        'A framework is a long-term asset — a compliant, approved status that keeps you eligible for years. For SMEs serious about public sector work, it is worth the effort of getting on.'
      ]}
    ]
  },
  {
    slug: 'lead-scoring-prioritise-daily-leads',
    title: 'Lead Scoring: How to Prioritise Your Daily Leads',
    description: 'A simple lead scoring system for daily business leads — how to rank leads by value, fit and urgency so your team always contacts the right prospects first.',
    category: 'general', product_name: 'Business Leads', categoryLabel: 'Business Leads',
    keywords: ['lead scoring', 'prioritise leads', 'lead ranking', 'sales lead prioritisation', 'daily lead management'],
    date: '2026-09-11', reading_time: '7 min read', publish_delay_days: 6,
    faqs: [
      { q: 'What is lead scoring?', a: 'Lead scoring is ranking your leads by how likely they are to become valuable customers, so your team contacts the best ones first. It stops you wasting time on low-quality leads while strong ones go cold.' },
      { q: 'How simple can lead scoring be?', a: 'Very. A simple score out of 10 — value and fit, urgency, and how quickly you can respond — beats no system at all. You can start with pen and paper and refine it as you learn what converts.' },
      { q: 'What makes a lead high-scoring?', a: 'High value, strong fit with your service, evidence of urgency, and something that makes it winnable — low competition or a personal advantage. A lead that scores well on all three gets contacted first.' },
      { q: 'How often should I review my scoring?', a: 'Revisit your scoring criteria monthly against your conversion data. As you learn which leads actually convert, adjust the weights so your scoring matches reality rather than assumption.' }
    ],
    sections: [
      { h: 'Why scoring beats random contact', body: [
        'Every morning you face a list of leads and a limited number of calls. Without a system, teams contact the easy or obvious ones and let the best ones sit. Lead scoring turns that gut feel into a repeatable rule: contact the highest-value, best-fit, most-urgent leads first.',
        'Scoring does not need to be complicated. A simple ranking that is consistent beats a clever one that nobody uses.',
        { cta: 'Get a structured daily lead feed to score — start your free 7-day trial.' }
      ]},
      { h: 'The three factors that matter', body: [
        'Score every lead on three things, each out of 10, and take the total:',
        { ul: ['Value — how much is this job worth? (property size, estate value, contract size)', 'Fit — how well does it match what you do and where you work?', 'Urgency — how soon must the prospect decide? (fresh listing, short window)'] },
        'Add a small bonus for winnability — low competition or a personal advantage. The total is your priority score: 27+ call immediately, 20+ call within the hour, below that batch later.'
      ]},
      { h: 'Build a scoring table for your trade', body: [
        'Create a simple scoring sheet for your industry so the system is consistent across your team. For a removal company:',
        { table: [['Signal', 'Score'], ['3+ bed house / high-value property', '3'], ['Move date within 2–4 weeks', '3'], ['Your core postcode area', '2'], ['Large furniture / long-distance', '2'], ['Little sign of competition', '2']] },
        'Weight the signals by what actually converts for you, and update the sheet monthly from your results.'
      ]},
      { h: 'Act on the score, then measure', body: [
        'A score only matters if it changes behaviour. Agree the thresholds with your team — who gets called first, who gets called later, who gets skipped — and follow it every day.',
        'Then close the loop: track which leads actually converted and refine your scoring. If the leads you scored highest never win, your weights are wrong. Scoring is a learning system, not a fixed rule.',
        { cta: 'See how a daily workflow + scoring lifts conversion — start your free trial.' }
      ]},
      { h: 'Start today, refine next month', body: [
        'The perfect scoring model does not exist on day one — but a simple one does. Start with value, fit and urgency, contact in score order every morning, and review the weights monthly. Within a quarter you will have a system tuned to how your business actually converts, and your first-contact time will be spent where it makes money.'
      ]}
    ]
  },
  {
    slug: 'gdpr-buying-using-b2b-leads',
    title: 'GDPR and B2B Leads: A Compliance Guide for UK Businesses',
    description: 'How to buy and use B2B leads legally under UK GDPR — legitimate interest, lawful bases, data sources, opt-outs and the record-keeping that keeps you safe.',
    category: 'general', product_name: 'Business Leads', categoryLabel: 'Business Leads',
    keywords: ['GDPR B2B leads', 'buying leads legal UK', 'legitimate interest marketing', 'B2B data protection', 'cold email legal UK'],
    date: '2026-09-12', reading_time: '9 min read', publish_delay_days: 7,
    faqs: [
      { q: 'Is it legal to buy B2B leads under UK GDPR?', a: 'Yes, if you have a lawful basis. For corporate prospects, legitimate interest is usually the appropriate basis for first contact — provided you have collected the data lawfully, carried out a legitimate interest assessment, and honour opt-outs.' },
      { q: 'Can I cold-email business leads?', a: 'Under PECR, cold email to corporate addresses (like info@ or a named business contact) is allowed if you meet the conditions: relevant marketing, an honest sender identity, a clear unsubscribe route, and no advertising of individual consumer emails without consent.' },
      { q: 'What records should I keep for GDPR?', a: 'A legitimate interest assessment, the source of the data, when and how it was obtained, your privacy notice, and a clear record of opt-outs and suppression. Good records are the difference between a complaint and a fine.' },
      { q: 'What is the difference between consumer and business leads under GDPR?', a: 'Consumer (personal) data needs consent or a different lawful basis, and cold marketing to individuals requires consent under PECR. Business leads — company data and named corporate contacts — fall under legitimate interest and the corporate cold-email rules. Treat the two very differently.' }
    ],
    sections: [
      { h: 'The rules for business data are not the consumer rules', body: [
        'A lot of GDPR fear comes from conflating consumer and business marketing. Cold marketing to consumers needs consent; contacting a company about a relevant business service uses a different basis — legitimate interest — with conditions attached. Understand which rules apply to which contact and most of the anxiety disappears.',
        'This guide covers buying and using B2B leads. If you market to consumers, seek consent and take specialist advice.',
        { cta: 'See how compliant B2B lead feeds work — start your free 7-day trial.' }
      ]},
      { h: 'The lawful basis: legitimate interest', body: [
        'For corporate prospects, legitimate interest is usually the right basis for a relevant first contact. It requires three things: a genuine purpose (offering a relevant service), the necessity of the processing (you cannot market without it), and a balance of interests (your purpose outweighs the individual\'s expectations, or the contact is so relevant that it does not intrude).',
        'Document it with a quick legitimate interest assessment so you can demonstrate your reasoning if challenged.',
        { ul: ['State your purpose clearly', 'Confirm the processing is necessary for it', 'Weigh the individual\'s interests and privacy expectations', 'Balance in favour of your purpose, or adjust the approach'] }
      ]},
      { h: 'Where your data comes from matters', body: [
        'The data source determines how you may use it. Public registers like Companies House, official probate and planning data, and records the prospect gave you directly are different from third-party lists. Make sure any lead supplier has the right to provide the data and that the data was collected lawfully.',
        'Keep a record of the source for every lead. If you can show where the data came from and that it was lawfully obtained, you are in a far stronger position than a business that cannot explain its list.'
      ]},
      { h: 'PECR and the cold-email rules', body: [
        'Alongside GDPR, PECR governs electronic marketing. Cold email to a corporate address is permitted if: it is genuinely relevant to the recipient\'s business role, your sender identity is real and accurate, and every message carries a clear, working opt-out. Do not send cold email to individual consumers, and do not hide behind a no-reply address.',
        'Always provide a suppression route and honour it immediately. A clean, up-to-date suppression list is your best defence.',
        { cta: 'Build a compliant outreach routine — start your free trial.' }
      ]},
      { h: 'Practical habits that keep you safe', body: [
        'Compliance is a set of habits, not a one-off document:',
        { ul: ['Buy from reputable sources with clear data rights', 'Record the lawful basis and source for each lead', 'Identify yourself honestly in every message', 'Give a clear opt-out and process it without delay', 'Maintain a suppression list and check it before sending', 'Re-train your team so everyone follows the same rules'] },
        'Done consistently, these habits make a complaint the rare exception — and give you the records to handle it confidently if one comes.'
      ]}
    ]
  }
];

module.exports = { CURATED_POSTS: CURATED_POSTS, buildPostHTML: buildPostHTML };
