const { products, plans, faqs, painPoints, platformFeatures, differentiators, sources, integrations, reasonsToTry, productDetails } = require('./content.cjs');
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const paths = {
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>', check:'<path d="m5 12 4 4L19 6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5H7"/>',
  pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  link:'<path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 -1)"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 6 9 7 9-7"/>',
  truck:'<path d="M3 5h11v12H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  file:'<path d="M14 3H5v18h14V8ZM14 3v5h5M8 12h8m-8 4h5"/>',
  building:'<path d="M4 21V3h12v18M16 10h4v11M1 21h22M8 7h4m-4 4h4m-4 4h4m-3 6v-3h2v3"/>',
  ruler:'<path d="m3 16 13-13 5 5L8 21Zm8-8 3 3m-6 0 3 3m-6 0 3 3"/>',
  clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="m9 13 2 2 4-5"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  spark:'<path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z"/>',
  chart:'<path d="M4 3v17h17M8 15l4-5 4 2 5-6"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  gift:'<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>'
};
function icon(name, cls='') { return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`; }
function art(name, cls='', eager=false) {
  const base = `/assets/refresh/3d/${name}`;
  return `<picture class="scene ${cls}"><source type="image/webp" srcset="${base}.webp 1x, ${base}@2x.webp 2x"><img src="${base}.png" width="700" height="610" alt="" ${eager?'fetchpriority="high"':'loading="lazy"'} decoding="async"></picture>`;
}
function signup(product='', plan='') { return '/portal/?' + new URLSearchParams(Object.fromEntries(Object.entries({product, plan}).filter(([,v])=>v))) + '#signup'; }
function button(text, href=signup(), secondary=false) { return `<a class="button${secondary?' button-secondary':''}" href="${escape(href)}">${text}${icon('arrow')}</a>`; }
function logo() { return `<a class="brand" href="/" aria-label="9amLeads home"><span class="brand-mark">9<span></span></span><span>9am<span class="brand-light">Leads</span></span></a>`; }
function header(active='') {
  const links = [['Lead types','/who-we-serve/'],['For your trade','/trades/'],['How it works','/how-it-works/'],['Pricing','/pricing/']];
  return `<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="container header-inner">${logo()}<nav id="site-navigation" class="site-navigation" aria-label="Main navigation">${links.map(([name,url])=>`<a href="${url}"${active===url?' aria-current="page"':''}>${name}</a>`).join('')}<a class="mobile-only" href="/contact/">Contact us</a><a class="mobile-only" href="/portal/#login">Sign in</a></nav><div class="header-actions"><a class="sign-in" href="/portal/#login">Sign in</a>${button('Start free',signup())}<button class="menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="site-navigation">${icon('menu')}</button></div></div></header>`;
}
function footer() {
  const groups = [['Opportunities',products.map(p=>[p.name,`/${p.slug}/`])],['Explore',[['How it works','/how-it-works/'],['Pricing','/pricing/'],['Print & Post','/bulk'],['Integrations','/integrations/'],['Find your trade','/trades/']]],['Company',[['Our story','/about-us/'],['Meet the founder','/founder/'],['Guides & insights','/blog/'],['Affiliates','/affiliates'],['Careers','/careers/']]],['Here to help',[['Contact us','/contact/'],['Help centre','/help/'],['FAQs','/faq/'],['API & webhooks','/api-docs/'],['System status','/status/']]]];
  return `<footer class="site-footer"><div class="container"><div class="footer-top"><div>${logo()}<p>A better start to your business day.<br>Fresh opportunities. A clear next step.</p><a href="mailto:hello@9amleads.com">hello@9amleads.com ${icon('arrow')}</a><div class="social-links"><a href="https://www.instagram.com/9amleads/">Instagram</a><a href="https://www.facebook.com/share/1SBwDAUuxh/">Facebook</a><a href="https://www.tiktok.com/@9amleads.com">TikTok</a></div></div><p class="footer-time">See you at <span>9:00<span class="time-dot">.</span></span></p></div><div class="footer-links">${groups.map(([title,items])=>`<div><h3>${title}</h3>${items.map(([name,href])=>`<a href="${href}">${name}</a>`).join('')}</div>`).join('')}</div><div class="footer-bottom"><p>© ${new Date().getFullYear()} 9am Leads Ltd · Company no. 17402522<br>66 Paul Street, London EC2A 4NA</p><div><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/gdpr/">Data protection</a><a href="/security/">Security</a></div></div></div></footer>`;
}
function shell({title,description,route='/',body,kind='',head='',scripts=''}) {
  const canonical = `https://9amleads.com${route}`;
  const structured = {'@context':'https://schema.org','@graph':[{'@type':'Organization','@id':'https://9amleads.com/#organization',name:'9amLeads',legalName:'9am Leads Ltd',url:'https://9amleads.com/',email:'hello@9amleads.com'},{'@type':'WebPage',name:title,url:canonical,isPartOf:{'@type':'WebSite',name:'9amLeads',url:'https://9amleads.com/'}}]};
  head = '<script type="application/ld+json">'+JSON.stringify(structured).replace(/</g,'\\u003c')+'</script>'+head;
  return `<!doctype html><html lang="en-GB"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | 9amLeads</title><meta name="description" content="${escape(description)}"><meta name="theme-color" content="#102b43"><meta name="google-site-verification" content="googlebe0f016002d131d5"><meta name="msvalidate.01" content="722F0474C4A2E6D3BCF479C7A4B8C3CD"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${escape(title)} | 9amLeads"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="website"><meta property="og:image" content="https://9amleads.com/og-image.png"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/favicon.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/assets/refresh/site.css">${head}<script src="/assets/refresh/site.js" defer></script></head><body class="refresh-site ${kind}">${header(route)}<main id="main">${body}</main>${footer()}${scripts}</body></html>`;
}
function heading(kicker,title,text='',left=false) { return `<div class="section-heading${left?' align-left':''}"><p class="eyebrow">${kicker}</p><h2>${title}</h2>${text?`<p>${text}</p>`:''}</div>`; }
function productCards() { return `<div class="product-grid">${products.map(p=>`<a class="product-card" href="/${p.slug}/" style="--product:${p.colour};--tint:${p.tint}"><div class="product-art">${art(p.art)}</div><div class="product-card-copy"><span class="category-icon">${icon(p.icon)}</span><h3>${p.name}</h3><p>${p.description}</p><span class="text-link">Explore ${icon('arrow')}</span></div></a>`).join('')}</div>`; }
function proofStrip() { return `<div class="proof-strip container"><span>${icon('clock')} 9am, Monday–Friday</span><span>${icon('pin')} Your selected areas</span><span>${icon('link')} Source links included</span><span>${icon('check')} 7-day free trial</span></div>`; }
function sampleCard(p=products[0]) {
  return `<article class="sample-card" style="--product:${p.colour};--tint:${p.tint}"><div class="sample-top"><span class="category-icon">${icon(p.icon)}</span><span>${p.sample.type}</span><span class="sample-label">Illustrative example</span></div><h3>${p.sample.title}</h3><p class="sample-area">${icon('pin')}${p.sample.area}</p><div class="sample-divider"></div><dl><div><dt>Opportunity</dt><dd>${p.sample.detail}</dd></div><div><dt>Source</dt><dd>${icon('link')}${p.sample.source}</dd></div><div><dt>Next step</dt><dd>${p.sample.next}</dd></div></dl><div class="sample-footer"><span>${icon('clock')} In your morning delivery</span><a href="${signup(p.id)}">Try ${p.short.toLowerCase()} leads ${icon('arrow')}</a></div></article>`;
}
function samples(selected='moving') {
  return `<section class="section sample-section" id="sample"><div class="container split"><div>${heading('A closer look','Less guesswork.<br>More to go on.','See the information behind each opportunity, then choose your next step.',true)}<div class="sample-selectors" role="group" aria-label="Choose a sample lead type">${products.map(p=>`<button type="button" data-sample="${p.id}" aria-pressed="${p.id===selected}" style="--product:${p.colour};--tint:${p.tint}">${icon(p.icon)}${p.short}${icon('arrow')}</button>`).join('')}</div><p class="fine-print">Fictional examples showing typical fields. Information varies by source; these are not live records.</p></div><div class="sample-stage">${products.map(p=>`<div data-sample-panel="${p.id}" ${p.id===selected?'':'hidden'}>${sampleCard(p)}</div>`).join('')}</div></div></section>`;
}
function workflow() { return `<section class="section" id="how"><div class="container">${heading('A simple daily habit','A little setup. A better start to every day.')}<div class="steps-grid">${[['01','pin','Make it yours','Choose the lead type and areas that fit your business.'],['02','clock','Open your morning delivery','Review matching opportunities at 9am on working days.'],['03','mail','Make your next move','Check the source, follow up and keep track of the conversation.']].map(([n,i,t,d])=>`<article class="step-card"><div class="step-top"><span>${n}</span>${icon(i)}</div><h3>${t}</h3><p>${d}</p></article>`).join('')}</div></div></section>`; }
function mailSection() { return `<section class="section mail-section" id="print-post"><div class="container split"><div class="mail-art">${art('post')}<span class="art-caption">Your introduction. In their hands.</span></div><div>${heading('Optional Print & Post','From your dashboard<br>to their doormat.','Turn a relevant opportunity into a thoughtful introduction. Choose a letter or leaflet, review your mailing and let us take care of the printing and posting.',true)}<ul class="check-list"><li>${icon('check')} Use your artwork or start with a template</li><li>${icon('check')} Review the price before you approve</li><li>${icon('check')} Keep your mailing history in one place</li></ul>${button('Explore Print & Post','/bulk',true)}<p class="fine-print">Printing and postage are charged separately from your lead subscription.</p></div></div></section>`; }
function faqSection(items=faqs) { return `<section class="section" id="faq"><div class="container narrow">${heading('Good questions','A few things you might be wondering.')}<div class="faq-list">${items.map(([q,a])=>`<details><summary>${q}${icon('chevron')}</summary><p>${a}</p></details>`).join('')}</div><p class="section-end">Need a hand? <a href="/contact/">Talk to our team ${icon('arrow')}</a></p></div></section>`; }
function closing(product='') { return `<section class="closing"><div class="container closing-inner"><div><p class="eyebrow">Make tomorrow a little more productive</p><h2>Your next opportunity<br>starts with a good morning.</h2><p>Try it for 7 days. See the opportunities for yourself.</p></div><div>${button('Start my free week',signup(product))}<p class="fine-print">No card required. No long-term contract.</p></div></div></section>`; }
function pricingCards(product=products[0]) { return `<div class="plan-grid">${plans.map((p,i)=>`<article class="plan-card${i===1?' recommended':''}">${i===1?'<span class="plan-tag">Room to grow</span>':''}<h3>${p.name}</h3><p>${p.description}</p><div class="plan-price">£${p.price}<span>/ week</span></div><p class="plan-allowance" data-allowance="${i}">${product.qualifier}${product.allowances[i]} ${product.id==='tenders'?'tenders':'opportunities'} / working day</p>${button('Start my free week',signup(product.id,p.id),i!==1)}<ul class="check-list">${p.features.map(f=>`<li>${icon('check')}${f}</li>`).join('')}</ul></article>`).join('')}</div>`; }
function cardGrid(items, opts = {}) {
  const variant = opts.variant || 'feature';
  const min = opts.min || 250;
  return `<div class="${variant}-grid" style="--min:${min}px">${items.map(([i, t, d]) => `<article class="${variant}-card"><span class="category-icon">${icon(i)}</span><h3>${t}</h3><p>${d}</p></article>`).join('')}</div>`;
}
function painSection(product) {
  const items = product ? productDetails[product.id].pain : painPoints;
  const title = product ? 'Competing for attention<br>is getting harder.' : "Everyone's online.<br>Nobody's at the door.";
  const intro = product ? undefined : 'We built 9amLeads around a simple observation: a letter on the doormat still gets read.';
  return `<section class="section pain-section" id="why"><div class="container">${heading('The problem we solve', title, intro)}${cardGrid(items, { variant:'pain', min:240 })}</div></section>`;
}
function featureSection(kicker = 'Everything in one platform', title = 'More than leads.<br>A complete toolkit.') {
  return `<section class="section" id="features"><div class="container">${heading(kicker, title, 'Every paid plan brings the opportunities, the tools to act on them and the record of what you have done.')}${cardGrid(platformFeatures, { variant:'feature', min:250 })}</div></section>`;
}
function differentiatorSection() {
  return `<section class="section diff-section" id="different"><div class="container">${heading('Why 9amLeads is different', 'Not just a list<br>of addresses.','With traditional address and leaflet providers you get addresses, but little transparency behind the data. 9amLeads shows you more.')}${cardGrid(differentiators, { variant:'diff', min:280 })}</div></section>`;
}
function sourcesSection() {
  return `<section class="section sources-section"><div class="container">${heading('Where the opportunities come from', 'Built on public<br>records and listings.','We bring information that is already public into one practical morning routine, and we show the source on every record.')}${cardGrid(sources, { variant:'source', min:260 })}<p class="fine-print" style="text-align:center">Availability varies by area and by the publishing source. Always check the source and the date on each record.</p></div></section>`;
}
function integrationsBand() {
  return `<section class="section"><div class="container"><div class="integration-band"><p class="eyebrow">Delivered where you work</p><h2>Your opportunities,<br>straight into your workflow.</h2><p>Read them in the 9am email, work in the dashboard, or send them into your CRM with a webhook or export. No copy-and-paste required.</p><ul>${integrations.map(name => `<li>${name}</li>`).join('')}</ul><div class="button-row">${button('See integrations','/integrations/',true)}</div></div></div></section>`;
}
function statsBand() {
  const stats = [['5', 'Opportunity types'], ['9am', 'Working-day delivery'], ['350+', 'Council planning portals'], ['15+ yrs', 'Founder experience']];
  return `<div class="stats-band container">${stats.map(([n, l]) => `<div><p class="stat-num">${n}</p><p class="stat-label">${l}</p></div>`).join('')}</div>`;
}
function whySection(product) {
  const items = productDetails[product.id].why;
  return `<section class="section"><div class="container">${heading('Why these opportunities work', `A useful signal.<br>A clearer next step.`)}${cardGrid(items, { variant:'why', min:250 })}</div></section>`;
}
function tacticsSection(product) {
  const items = productDetails[product.id].tactics;
  return `<section class="section sample-section"><div class="container">${heading('Turn an opportunity into work', 'How to make<br>the most of it.')}${cardGrid(items, { variant:'tactic', min:250 })}</div></section>`;
}
function reasonsSection() {
  return `<section class="section"><div class="container">${heading('Why we offer a free trial', 'Try it first.<br>Then decide.')}${cardGrid(reasonsToTry, { variant:'reason', min:280 })}</div></section>`;
}
function comparisonMini() {
  const rows = [
    ['What starts it', 'A source record or listing', 'A buyer submits an enquiry', 'A click on your advert'],
    ['Your next step', 'Review the source and introduce yourself', 'Respond to the enquiry quickly', 'Convert the visit into an enquiry'],
    ['How you pay', 'A weekly subscription', 'Per enquiry or a membership', 'Your advertising spend'],
    ['Worth knowing', 'Timing and fit still need judgement', 'How enquiries are shared varies', 'Watch your cost per result']
  ];
  return `<section class="section"><div class="container narrow">${heading('How it compares', 'Different routes.<br>Different starting points.','An early signal, an inbound enquiry and an advertising click do different jobs. Choose the mix that suits your business.')}<div class="comparison-wrap"><table class="comparison-table"><thead><tr><th scope="col">Consideration</th><th scope="col">9amLeads</th><th scope="col">Enquiry platforms</th><th scope="col">Online advertising</th></tr></thead><tbody>${rows.map(r => `<tr>${r.map((t, i) => i === 0 ? `<th scope="row">${t}</th>` : `<td>${t}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="fine-print">A general comparison of these approaches. Individual providers and campaign terms vary. See the full <a href="/compare/">comparison page</a>.</p></div></section>`;
}
module.exports = { escape, icon, art, signup, button, logo, header, footer, shell, heading, productCards, proofStrip, sampleCard, samples, workflow, mailSection, faqSection, closing, pricingCards, cardGrid, painSection, featureSection, differentiatorSection, sourcesSection, integrationsBand, statsBand, whySection, tacticsSection, reasonsSection, comparisonMini };
