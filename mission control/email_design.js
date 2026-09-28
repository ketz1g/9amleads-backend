var h=require('https');
var KEY=process.env.BREVO_API_KEY || '';
var WEB='https://9amleads.com';
var FB='https://www.facebook.com/share/1SBwDAUuxh/?mibextid=wwXIfr';
var IG='https://www.instagram.com/9amleads/';
var TT='https://www.tiktok.com/@9amleads.com';

// Light accent per product, for text that sits on DARK backgrounds (footer/header).
function lightAccentOf(c){
  return c === '#bf360c' ? '#fb923c' : c === '#5b21b6' ? '#a78bfa' : c === '#166534' ? '#4ade80' : c === '#115e59' ? '#2dd4bf' : c === '#3730a3' ? '#818cf8' : '#818cf8';
}

// Solid pastel TINT per product colour, email clients do NOT support 8-digit
// RGBA hex (#bf360c22), which made badges/borders invisible. Use solid tints.
function tintOf(c){
  return c === '#bf360c' ? '#fde8e0' : c === '#5b21b6' ? '#ede9fe' : c === '#166534' ? '#dcfce7' : c === '#115e59' ? '#ccfbf1' : c === '#3730a3' ? '#e0e7ff' : '#eef2f7';
}

// EMAIL-SAFE GRADIENT: most email clients (Outlook, Gmail web) strip the CSS
// `background:linear-gradient(...)` rule entirely, leaving white text invisible
// on a transparent background. Fix: declare a SOLID background-color FIRST as a
// fallback, then layer the gradient on top for clients that support it. White
// text is always readable because the solid colour shows wherever the gradient
// is dropped.
function gradOf(c, c2){
  var solid = c2 || c;
  return 'background-color:'+solid+';background-image:linear-gradient(135deg,'+c+','+(c2||c)+');';
}

function ctaBtn(c, c2, text, url, size){
  var pad=size==='lg'?'12px 34px':'9px 24px';
  var fs=size==='lg'?'14px':'12px';
  return '<a href="'+url+'" style="display:inline-block;'+gradOf(c,c2)+'color:#ffffff;text-decoration:none;font-size:'+fs+';font-weight:700;padding:'+pad+';border-radius:50px">'+text+' &rarr;</a>';
}

function buildEmail(p, L){
  var c=p.color, c2=p.color2||p.color;
  var lightAccent = lightAccentOf(c);
  var tint = tintOf(c);
  var grad = gradOf(c,c2);
  var shortName = p.shortName || (p.name||'').replace(/Leads|Alerts|Tenders|Planning Permission/gi,'').trim() || p.name || '9amLeads';
  L.sections=L.sections||[]; L.stats=L.stats||[]; L.steps=L.steps||[];

  // Sections (rich cards)
  var secHtml=L.sections.map(function(s){
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px"><tr>'+
      '<td width="56" valign="top" style="padding:14px 0;background:#ffffff;border-radius:12px 0 0 12px;text-align:center;font-size:24px">'+s.icon+'</td>'+
      '<td valign="top" style="padding:12px 16px;background:#ffffff;border-radius:0 12px 12px 0"><strong style="font-size:15px;color:#0f172a">'+s.title+'</strong><div style="font-size:13px;line-height:1.6;color:#64748b;margin-top:3px">'+s.body+'</div></td></tr></table>';
  }).join('');
  // Stats
  var statHtml=L.stats.map(function(st){
    return '<td style="width:33%;padding:16px 8px;text-align:center"><div style="font-size:30px;font-weight:900;color:'+c+'">'+st.num+'</div><div style="font-size:11px;color:#64748b;line-height:1.4;margin-top:4px">'+st.label+'</div></td>';
  }).join('');
  // Steps
  var stepHtml=L.steps.map(function(s){
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px"><tr>'+
      '<td width="44" valign="top"><div style="width:34px;height:34px;border-radius:50%;background:'+c+';color:#fff;font-weight:800;font-size:15px;text-align:center;line-height:34px">'+s.num+'</div></td>'+
      '<td valign="top" style="padding-left:10px"><strong style="font-size:14px;color:#0f172a">'+s.title+'</strong><div style="font-size:13px;line-height:1.6;color:#64748b;margin-top:2px">'+s.desc+'</div></td></tr></table>';
  }).join('');
  // Reasons
  var reasonsHtml='';
  if(L.reasons&&L.reasons.length){
    var reasonItems=L.reasons.map(function(r){
      return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px"><tr>'+
        '<td width="40" valign="top" style="padding-top:2px"><div style="width:26px;height:26px;border-radius:50%;background:'+tint+';color:'+c+';font-weight:800;font-size:13px;text-align:center;line-height:26px">&#10003;</div></td>'+
        '<td valign="top" style="padding-left:8px"><strong style="font-size:14px;color:#0f172a">'+r.title+'</strong><div style="font-size:13px;line-height:1.6;color:#64748b;margin-top:2px">'+r.body+'</div></td></tr></table>';
    }).join('');
    reasonsHtml='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:2px solid '+tint+';margin:14px 0"><tr><td style="padding:20px">'+
      '<div style="font-size:14px;font-weight:800;color:'+c+';text-align:center;margin-bottom:14px;text-transform:uppercase;letter-spacing:1px">&#9733; 6 reasons to choose 9amLeads</div>'+
      reasonItems+'</td></tr></table>';
  }
  // Features (Everything included), simple email-safe layout (no nested tables)
  var featuresHtml='';
  if(L.features&&L.features.length){
    var fItems=L.features.map(function(f){
      return '<tr><td style="padding:9px 14px;background:#ffffff;border:1px solid #eef2f7;border-radius:8px"><div style="font-size:20px;display:inline-block;margin-right:8px;vertical-align:middle">'+f.icon+'</div><strong style="font-size:13px;color:#0f172a">'+f.title+'</strong><div style="font-size:12px;line-height:1.5;color:#64748b;margin-top:2px">'+f.body+'</div></td></tr>';
    }).join('');
    featuresHtml='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:'+p.bg+';border-radius:12px;border:2px solid '+tint+';margin:14px 0"><tr><td style="padding:16px 12px">'+
      '<div style="font-size:14px;font-weight:800;color:'+c+';text-align:center;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px">&#9989; Everything included</div>'+
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'+fItems+'</table></td></tr></table>';
  }
  // Testimonials (1-3)
  var testHtml='';
  var tests=L.testimonials||(L.testimonial?[L.testimonial]:[]);
  testHtml=tests.map(function(t){
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border-left:4px solid '+c+';margin-bottom:12px"><tr><td style="padding:16px 20px"><div style="font-size:24px;color:'+c+';line-height:1">&#8220;</div><p style="margin:4px 0 8px;font-size:14px;line-height:1.6;color:#334155;font-style:italic">'+t.quote+'</p><div style="font-size:12px;font-weight:700;color:'+c+'">'+t.author+'</div></td></tr></table>';
  }).join('');
  // Why we're different (comparison table vs other lead companies)
  var diffHtml='';
  if(L.different&&L.different.length){
    var rows=L.different.map(function(d){
      return '<tr><td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0f172a;font-weight:700">'+d.us+'</td><td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#94a3b8;text-align:center">'+d.them+'</td></tr>';
    }).join('');
    diffHtml='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:2px solid '+tint+';margin:14px 0"><tr><td style="padding:18px 16px">'+
      '<div style="font-size:14px;font-weight:800;color:'+c+';text-align:center;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px">&#9733; Why we\'re different</div>'+
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef2f7;border-radius:8px;overflow:hidden">'+
      '<tr style="background:#f8fafc"><td style="padding:10px 14px;font-size:11px;font-weight:700;color:'+c+';text-transform:uppercase">9amLeads</td><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;text-align:center">Other lead companies</td></tr>'+
      rows+'</table>'+
      '<div style="font-size:12px;color:#64748b;text-align:center;margin-top:12px;line-height:1.5">We built 9amLeads to fix everything that\'s broken about lead generation. No shared leads. No stale data. No dashboards to babysit.</div>'+
      '</td></tr></table>';
  }
  // What we offer (full service breakdown)
  var offerHtml='';
  if(L.offer&&L.offer.length){
    var oItems=L.offer.map(function(o){
      return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px"><tr>'+
        '<td width="46" valign="top" style="padding-top:2px"><div style="width:34px;height:34px;border-radius:10px;background:'+tint+';color:'+c+';text-align:center;line-height:34px;font-size:17px">'+o.icon+'</div></td>'+
        '<td valign="top" style="padding-left:10px"><strong style="font-size:14px;color:#0f172a">'+o.title+'</strong><div style="font-size:13px;line-height:1.6;color:#64748b;margin-top:2px">'+o.body+'</div></td></tr></table>';
    }).join('');
    offerHtml='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:2px solid '+tint+';margin:14px 0"><tr><td style="padding:20px">'+
      '<div style="font-size:14px;font-weight:800;color:'+c+';text-align:center;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px">&#128640; Everything we offer</div>'+oItems+'</td></tr></table>';
  }
  // Social proof bar
  var socialHtml=L.socialProof?('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #eef2f7;margin:14px 0"><tr>'+L.socialProof.map(function(s){
    return '<td style="width:33%;padding:14px 8px;text-align:center"><div style="font-size:20px;font-weight:900;color:'+c+'">'+s.num+'</div><div style="font-size:11px;color:#64748b;margin-top:2px">'+s.label+'</div></td>';
  }).join('')+'</tr></table>'):'';
  // Pricing table
  var pricingHtml='';
  if(L.pricing){
    var rows=L.pricing.map(function(pr){
      return '<tr><td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;font-weight:600">'+pr.plan+'</td><td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b">'+pr.leads+'</td><td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:'+c+';font-weight:800;text-align:right">'+pr.price+'</td></tr>';
    }).join('');
    pricingHtml='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;margin:14px 0"><tr><td style="padding:16px 14px"><div style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:10px;text-align:center">📊 Plans &amp; pricing</div>'+
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef2f7;border-radius:8px;overflow:hidden"><tr style="background:#f8fafc"><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Plan</td><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Daily leads</td><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:right">Price</td></tr>'+rows+'</table>'+
      '<div style="font-size:11px;color:#94a3b8;text-align:center;margin-top:10px">All plans include the 7-day free trial &middot; No obligation &middot; Cancel anytime</div></td></tr></table>';
  }
  // Guarantee / risk reversal
  var guaranteeHtml=L.guarantee?('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:12px;border:2px solid #bbf7d0;margin:14px 0"><tr><td style="padding:18px 20px;text-align:center"><div style="font-size:26px">🛡️</div><div style="font-size:14px;font-weight:800;color:#065f46;margin-top:6px">'+L.guarantee.title+'</div><div style="font-size:13px;line-height:1.6;color:#065f46;margin-top:6px">'+L.guarantee.body+'</div></td></tr></table>'):'';
  // FAQ
  var faqHtml=L.faq?('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;margin-bottom:12px"><tr><td style="padding:16px 20px"><div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:6px">'+L.faq.q+'</div><div style="font-size:13px;line-height:1.6;color:#64748b">'+L.faq.a+'</div></td></tr></table>'):'';
  // Urgency
  var urgencyHtml=L.urgency?('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border-radius:10px;margin-bottom:16px"><tr><td style="padding:12px 16px;text-align:center;font-size:13px;font-weight:600;color:#92400e">'+L.urgency+'</td></tr></table>'):'';
  // SECTOR BLOCK, who this lead type is for + why 9amLeads benefits their sector.
  // Rendered as a prominent, high-contrast card so the customer sees their own
  // business reflected and knows exactly why these leads matter to them.
  var sectorHtml='';
  if(L.sector){
    var sec=L.sector;
    var audChips=(sec.audience||[]).map(function(a){
      return '<span style="display:inline-block;background:'+tint+';border:1px solid '+tint+';color:'+c+';border-radius:20px;padding:5px 12px;font-size:11px;font-weight:700;margin:3px 3px 0 0">'+a+'</span>';
    }).join('');
    sectorHtml='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:'+p.bg+';border-radius:14px;border:2px solid '+tint+';margin:16px 0 14px;overflow:hidden"><tr><td style="padding:22px 20px">'+
      '<div style="'+grad+'border-radius:9px;display:inline-block;padding:4px 14px;color:#ffffff;font-size:11px;font-weight:800;letter-spacing:0.6px;text-transform:uppercase">'+p.shortName+'</div>'+
      '<h3 style="font-size:17px;font-weight:800;color:#0f172a;margin:14px 0 6px">'+sec.whoTitle+'</h3>'+
      '<p style="font-size:13px;line-height:1.65;color:#475569;margin:0 0 12px">'+sec.whoBody+'</p>'+
      '<div style="margin-bottom:14px">'+audChips+'</div>'+
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;border:1px solid '+tint+';margin-bottom:12px"><tr><td style="padding:14px 16px">'+
      '<div style="font-size:13px;font-weight:800;color:'+c+';margin-bottom:4px">'+sec.whyTitle+'</div>'+
      '<div style="font-size:13px;line-height:1.65;color:#475569">'+sec.whyBody+'</div></td></tr></table>'+
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:'+tint+';border-radius:10px;border:1px solid '+tint+'"><tr><td style="padding:14px 16px">'+
      '<div style="font-size:13px;font-weight:800;color:'+c+';margin-bottom:4px">'+sec.winTitle+'</div>'+
      '<div style="font-size:13px;line-height:1.65;color:#475569">'+sec.winBody+'</div></td></tr></table>'+
      '</td></tr></table>';
  }
  // CTA buttons
  var heroCta=L.ctaHero?('<div style="text-align:center;margin-top:18px">'+ctaBtn(c,c2,L.ctaHero.text,L.ctaHero.url)+'</div>'):'';
  var midCta=L.ctaMid?('<div style="text-align:center;margin:20px 0">'+ctaBtn(c,c2,L.ctaMid.text,L.ctaMid.url,'sm')+'</div>'):'';
  var finalCta=ctaBtn(c,c2,L.cta,L.ctaUrl,'lg');

  // PAIN POINTS, real problems the customer feels every week. Rendered as a
  // high-emotion card so the reader says "yes, that's me".
  var painHtml='';
  if(L.painPoints&&L.painPoints.length){
    var painItems=L.painPoints.map(function(pp){
      return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px"><tr>'+
        '<td width="44" valign="top" style="padding-top:2px"><div style="width:32px;height:32px;border-radius:8px;background:'+tint+';text-align:center;line-height:32px;font-size:15px">'+pp.icon+'</div></td>'+
        '<td valign="top" style="padding-left:10px"><strong style="font-size:13px;color:#0f172a">'+pp.title+'</strong><div style="font-size:12px;line-height:1.6;color:#64748b;margin-top:2px">'+pp.body+'</div></td></tr></table>';
    }).join('');
    painHtml='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #f1f5f9;margin:16px 0 8px"><tr><td style="padding:18px 18px 14px">'+
      '<div style="font-size:13px;font-weight:800;color:#dc2626;text-align:center;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.6px">&#9888;&#65039; Sound familiar?</div>'+
      painItems+'</td></tr></table>';
  }
  // ATTRACTION, the wins and reasons to sign up, turned into a persuasive card.
  var attractHtml='';
  if(L.attract&&L.attract.length){
    var attractItems=L.attract.map(function(a){
      return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px"><tr>'+
        '<td width="44" valign="top" style="padding-top:2px"><div style="width:32px;height:32px;border-radius:8px;background:'+grad+';text-align:center;line-height:32px;font-size:15px">'+a.icon+'</div></td>'+
        '<td valign="top" style="padding-left:10px"><strong style="font-size:13px;color:#0f172a">'+a.title+'</strong><div style="font-size:12px;line-height:1.6;color:#64748b;margin-top:2px">'+a.body+'</div></td></tr></table>';
    }).join('');
    attractHtml='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:'+p.bg+';border-radius:12px;border:2px solid '+tint+';margin:8px 0 14px"><tr><td style="padding:18px 18px 14px">'+
      '<div style="font-size:13px;font-weight:800;color:'+c+';text-align:center;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.6px">&#127775; What you get</div>'+
      attractItems+'</td></tr></table>';
  }

  // HEADER, compact, email-safe (no RGBA hex), high-contrast. Logo + wordmark + badge.
  var headerHtml =
  '<tr><td style="background:#ffffff;border-bottom:2px solid '+tint+';padding:10px 44px"><table role="presentation" width="100%"><tr>'+
  '<td><table role="presentation" cellpadding="0" cellspacing="0"><tr>'+
  '<td bgcolor="'+c2+'" style="'+grad+'border-radius:7px;width:24px;height:24px;text-align:center;color:#ffffff;font-size:13px;font-weight:900;font-family:Georgia,serif">9</td>'+
  '<td style="padding-left:8px"><div style="font-size:13px;font-weight:900;color:#0f172a;letter-spacing:-0.2px;line-height:1.2">9am<span style="color:'+c+'">Leads</span></div><div style="font-size:8px;color:#64748b;letter-spacing:0.6px;text-transform:uppercase;font-weight:700">Fresh leads &middot; Every morning</div></td>'+
  '</tr></table></td>'+
  '<td align="right" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" align="right"><tr>'+
  '<td style="background:'+tint+';border:1px solid '+tint+';border-radius:20px;padding:3px 10px"><span style="font-size:9px;color:'+c+';font-weight:800;text-transform:uppercase;letter-spacing:0.3px">'+shortName+'</span></td>'+
  '</tr></table><div style="font-size:9px;color:#64748b;text-align:right;font-weight:600;margin-top:3px">'+L.week+'</div></td>'+
  '</tr></table></td></tr>';

  // HERO, compact gradient banner with readable white text, not oversized.
  // Uses solid background-color fallback so white text stays visible in email
  // clients that strip gradients.
  var heroHtml =
  '<tr><td bgcolor="'+c2+'" style="'+gradOf(c,c2)+'padding:20px 44px 18px;text-align:center">'+
  '<div style="width:34px;height:34px;margin:0 auto 8px;border-radius:50%;background:rgba(255,255,255,0.22);display:block;text-align:center;line-height:34px;font-size:17px">&#128336;</div>'+
  '<h1 style="margin:0 0 6px;font-size:18px;line-height:1.35;color:#ffffff;font-weight:800">'+L.heroTitle+'</h1>'+
  '<p style="margin:0 auto;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.96);max-width:470px">'+L.heroSub+'</p>'+
  heroCta+
  '</td></tr>';

  // BODY
  var bodyHtml =
  '<tr><td style="padding:26px 44px">'+
  '<p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#475569">'+L.open+'</p>'+
  (L.sections.length?secHtml:'')+
  (L.stats.length?('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;margin:14px 0"><tr>'+statHtml+'</tr></table>'):'')+
  (L.steps.length?('<div style="margin:14px 0">'+stepHtml+'</div>'):'')+
  sectorHtml+
  painHtml+
  attractHtml+
  reasonsHtml+
  featuresHtml+
  offerHtml+
  diffHtml+
  socialHtml+
  pricingHtml+
  midCta+
  testHtml+
  guaranteeHtml+
  faqHtml+
  urgencyHtml+
  '<div style="text-align:center;padding:18px 0 8px">'+finalCta+'</div>'+
  '<p style="font-size:12px;color:#94a3b8;text-align:center;margin:12px 0 0">No Obligation &middot; Cancel anytime &middot; Delivery at 9am</p>'+
  (L.ps?('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;margin-top:16px"><tr><td style="padding:14px 16px;font-size:13px;line-height:1.6;color:#475569"><strong style="color:'+c+'">P.S.&nbsp;</strong>'+L.ps+'</td></tr></table>'):'')+
  '</td></tr>';

  // FOOTER (dark), wordmark + links use LIGHT accent so they are visible on dark.
  var footerHtml =
  '<tr><td style="background:#0f172a;padding:24px 44px;text-align:center">'+
  '<table role="presentation" width="100%"><tr><td align="center" style="padding-bottom:12px">'+
  '<a href="'+FB+'" style="display:inline-block;width:34px;height:34px;margin:0 5px;border-radius:50%;background:rgba(255,255,255,0.08);color:#94a3b8;font-size:12px;text-decoration:none;line-height:34px">f</a>'+
  '<a href="'+IG+'" style="display:inline-block;width:34px;height:34px;margin:0 5px;border-radius:50%;background:rgba(255,255,255,0.08);color:#94a3b8;font-size:12px;text-decoration:none;line-height:34px">&#9854;</a>'+
  '<a href="'+TT+'" style="display:inline-block;width:34px;height:34px;margin:0 5px;border-radius:50%;background:rgba(255,255,255,0.08);color:#94a3b8;font-size:12px;text-decoration:none;line-height:34px">&#127916;</a>'+
  '</td></tr>'+
  '<tr><td style="padding-bottom:8px"><table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>'+
  '<td bgcolor="'+c2+'" style="'+gradOf(c,c2)+'border-radius:7px;width:26px;height:26px;text-align:center;color:#ffffff;font-size:13px;font-weight:900;font-family:Georgia,serif">9</td>'+
  '<td style="padding-left:7px;vertical-align:middle"><span style="font-size:17px;font-weight:900;color:#ffffff;letter-spacing:-0.3px">9am<span style="color:'+lightAccent+'">Leads</span></span></td>'+
  '</tr></table></td></tr>'+
  '<tr><td style="font-size:11px;color:#94a3b8;padding-bottom:8px">Fresh business leads delivered to your inbox every morning at 9am</td></tr>'+
  '<tr><td style="font-size:11px;color:#64748b"><a href="'+WEB+'" style="color:'+lightAccent+';text-decoration:underline;font-weight:700">9amleads.com</a> &middot; <a href="mailto:hello@9amleads.com" style="color:#94a3b8;text-decoration:none">hello@9amleads.com</a></td></tr>'+
  '<tr><td style="font-size:11px;color:#64748b;padding-top:8px"><a href="{{ unsubscribe }}" style="color:#94a3b8;text-decoration:underline">Unsubscribe</a> &middot; <a href="'+WEB+'/privacy.html" style="color:#94a3b8;text-decoration:underline">Privacy Policy</a></td></tr>'+
  '</table></td></tr>';

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'+
  '<body style="margin:0;padding:0;background:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif">'+
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:20px 0"><tr><td align="center">'+
  '<table role="presentation" width="660" cellpadding="0" cellspacing="0" style="max-width:660px;width:100%;background:'+p.bg+';border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.08)">'+
  headerHtml+
  heroHtml+
  bodyHtml+
  footerHtml+
  '</table></td></tr></table></body></html>';
}
module.exports={buildEmail,apiRequest:function(method,path,body){return new Promise(function(resolve){var opts={hostname:'api.brevo.com',path:path,method:method,headers:{'api-key':KEY,'Accept':'application/json'},timeout:30000};if(body){opts.headers['Content-Type']='application/json';opts.headers['Content-Length']=Buffer.byteLength(body);}var r=h.request(opts,function(res){var b='';res.on('data',function(c){b+=c;});res.on('end',function(){resolve({status:res.statusCode,body:b});});});r.on('error',function(e){resolve({status:0,body:e.message});});if(body)r.write(body);r.end();});}};
