/* Build a public-only static release from shared templates and reference pages.
 * Existing source pages and operational backend files are never overwritten.
 * Run: node scripts/build-site.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const { routes, pageHero } = require('../site/pages.cjs');
const { supportRoutes, locationPage } = require('../site/support-pages.cjs');
Object.assign(routes, supportRoutes);
const { shell, escape, icon } = require('../site/components.cjs');
const { products, plans } = require('../site/content.cjs');
const { illustration, names } = require('../site/illustrations.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
let htmlCount = 0;
const publicDirs = ['about-us','api-docs','assets','benchmarks','careers','compare','contact','faq','founder','gdpr','help','how-it-works','integrations','movingleadsdaily','newbusinessalert','planningleads','pricing','probateleads','security','status','tenders','testimonials','trades','who-we-serve'];
const publicFiles = ['404.html','affiliate-compare.html','affiliate-terms.html','affiliates.html','bulk.html','privacy.html','terms.html','index.html','robots.txt','sitemap.xml','favicon.png','favicon-32x32.png','apple-touch-icon.png','og-image.png','BingSiteAuth.xml','googlebe0f016002d131d5.html','9amleads-indexnow.txt','llms.txt','business-opportunity-explainer.jpg','business-opportunity-explainer.mp4','founder-intro-poster.jpg','founder-intro.mp4','hero-poster.jpg','hero-video.mp4','product-shared.js','pricing-config.js'];
const aliases = {};
for (const product of products) {
  for (const [file,target] of Object.entries({'pricing.html':'/pricing/?product='+product.id,'about.html':'/about-us/','contact.html':'/contact/','how-it-works.html':'/how-it-works/','privacy.html':'/privacy.html','terms.html':'/terms.html'})) {
    const relative=product.slug+'/'+file;
    if(fs.existsSync(path.join(root,relative)))aliases[relative]=target;
  }
}
const artwork = {'integrations':'connect','api-docs':'connect','contact':'connect','affiliates':'business','affiliate-compare':'business','affiliate-terms':'business','careers':'business','security':'tenders','status':'connect','gdpr':'probate','privacy':'probate','terms':'probate','testimonials':'morning','compare':'morning','benchmarks':'planning'};
const faMap = { truck:'truck',home:'pin',house:'pin',building:'building',clock:'clock',envelope:'mail',paper:'file',file:'file',check:'check',shield:'shield',lock:'shield',chart:'chart',map:'pin',location:'pin',arrow:'arrow',chevron:'chevron',user:'user',headset:'user',search:'search',link:'link',hammer:'ruler',ruler:'ruler',gift:'spark',robot:'spark',code:'grid',plug:'grid' };
function write(relative, content) {
  const target = path.join(output, relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
  if (/\.html$/i.test(relative)) htmlCount++;
}
function legacy(relative, original) {
  const $ = cheerio.load(original);
  const route = '/' + relative.replace(/index\.html$/, '');
  const title = $('title').text().replace(/\s*[|·]\s*9amLeads.*$/i, '').trim() || '9amLeads';
  const description = $('meta[name=description]').attr('content') || 'Useful information and support from 9amLeads.';
  const headStyles = $('style').map((_,el)=>$(el).html()).get();
  const scripts = $('script').map((_,el)=>{
    const node = $(el);
    const src = node.attr('src');
    if (node.attr('type') === 'application/ld+json' || src === '/enhancements.js' || src === '/chat.js' || src === '/assistant.js') return '';
    if (src) return /^https:\/\//.test(src) || src === '/product-shared.js' ? $.html(node) : '';
    const text = node.html() || '';
    // These old scripts inject duplicate navigation, fake activity or theme overrides.
    if (/liveProof|cookieBanner|createElement\(['"]style|localStorage\.getItem\(['"]theme|shiftBottomWidgets|sticky-trial/.test(text)) return '';
    return $.html(node);
  }).get().join('\n');
  const h1 = $('h1').first().text().trim();
  const hero = $('section.hero,.hero-section').first();
  const heroText = hero.find('p').filter((_,el)=>$(el).text().length>55).first().text().trim();
  const key = relative.split('/')[0].replace(/\.html$/, '');
  const product = products.find(p=>relative.startsWith(p.slug+'/'));
  if (product && new RegExp('^'+product.slug+'/[^/]+/index\\.html$').test(relative) && !relative.includes('/areas/')) {
    const city = h1.replace(/^.*\bin\s+/i,'').trim();
    if (city && city !== h1) return locationPage(product,city,$('.chip').map((_,el)=>$(el).text().trim()).get());
  }
  let intro = '';
  if (hero.length) {
    intro = pageHero(product?product.name:'9amLeads · '+title,escape(h1 || title),escape(heroText || description),product?product.art:artwork[key] || 'morning');
    hero.remove();
  }
  $('script,style,link,nav,footer,header,.mobile-menu,.mobile-overlay,#mobileMenu,#mobileOverlay,.hamburger,.part-of-bar,.brand-strip,.top-bar,.topbar,.back-home,#why-different,#cookieConsent,#cookieBanner,#liveProof,#backToTop,.sticky-trial-cta,.sticky-cta').remove();
  $('main').each((_,el)=>{el.tagName='div';});
  $('.s-bg,.s-grid,.s-orb').remove();
  $('body>a').filter((_,el)=>$(el).text().includes('Back to')).remove();
  $('body>div').filter((_,el)=>/Back to Home|Part of 9amLeads/.test($(el).text()) && $(el).text().length<230).remove();
  $('body>div').filter((_,el)=>$(el).attr('id')==='trust-strip').remove();
  // Keep meaningful layout declarations, but let the shared tokens own colours,
  // text sizing and spacing. Preserve display:none for functional UI states.
  $('[style]').each((_,el)=>{
    const node = $(el);
    let style = node.attr('style').split(';').filter(rule=>!/^\s*(?:background(?:-image)?|color|font-family|font-weight|text-shadow|box-shadow|position|z-index|top|left|right|bottom)\s*:/i.test(rule)).join(';');
    style = style.replace(/font-size:\s*(?:9|10|11)px/g,'font-size:12px');
    node.attr('style',style);
  });
  $('i[class*="fa-"]').each((_,el)=>{
    const cls = $(el).attr('class') || '';
    const name = Object.keys(faMap).find(k=>cls.includes('fa-'+k));
    $(el).replaceWith(icon(faMap[name] || 'spark'));
  });
  $('img[src*="images.unsplash.com/photo-150700"],img[src*="images.unsplash.com/photo-147209"],img[src*="images.unsplash.com/photo-150064"]').remove();
  $('table').wrap('<div class="comparison-scroll"></div>');
  $('*').contents().filter((_,n)=>n.type==='text').each((_,n)=>{
    n.data = n.data.replace(/\uFFFD[-\uFFFD️]*/g,'').replace(/\?{3,}/g,'').replace(/ZERO COMPETITION/g,'Source information included').replace(/every morning at 9am/gi,'at 9am on working days');
  });
  const body = $('body').html();
  // Scope retained layout CSS to the reference content. The original theme/nav
  // styles do not enter the new shell. Only structural grid selectors survive.
  const layout = headStyles.join('\n').match(/[^{}]*(?:grid|cards|features|values|roles|contact-row|stats-row)[^{}]*\{[^{}]*\}/g) || [];
  const scoped = layout.filter(rule=>!/@|:root|body|html|nav|footer|header|\*/.test(rule)).map(rule=>rule.replace(/^([^{}]+)\{/,(_,selectors)=>selectors.split(',').map(s=>'.legacy-content '+s.trim()).join(',')+'{').replace(/(?:background(?:-image)?|color|font-family|font-weight):[^;}]+;?/g,'')).join('\n');
  return shell({title,description,route,kind:'reference-page',body:intro+`<div class="legacy-content">${body}</div>`,head:scoped?`<style>${scoped}</style>`:'',scripts});
}
function copy(relative) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source)) return;
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(source)) {
      if (entry.startsWith('.') || /^(?:node_modules|data|_docs|dist)$/.test(entry)) continue;
      copy(path.join(relative, entry));
    }
  } else {
    const rel = relative.split(path.sep).join('/');
    if (routes[rel] || aliases[rel]) return;
    if (/\.html$/i.test(rel) && !/google.*\.html$|^assets\//.test(rel)) {
      write(rel,legacy(rel,fs.readFileSync(source,'utf8')));
    } else if (/\.(?:html|css|js|png|jpe?g|webp|avif|svg|ico|mp4|pdf|xml|txt)$/i.test(rel)) {
      write(rel,fs.readFileSync(source));
    }
  }
}
function build() {
  htmlCount = 0;
  if (path.basename(output) !== 'dist' || path.dirname(output) !== root) throw new Error('Unexpected build path');
  fs.rmSync(output,{recursive:true,force:true});
  fs.mkdirSync(output,{recursive:true});
  [...publicFiles,...publicDirs].forEach(copy);
  for (const [relative, render] of Object.entries(routes)) write(relative,render());
  for (const [relative,target] of Object.entries(aliases)) write(relative,`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Continue to 9amLeads</title><link rel="canonical" href="https://9amleads.com${escape(target)}"><meta http-equiv="refresh" content="0;url=${escape(target)}"></head><body><h1>This page has moved</h1><a href="${escape(target)}">Continue to 9amLeads</a></body></html>`);
  for (const file of ['site.css','site.js','portal.css','portal.js','demo.js']) write('assets/refresh/'+file,fs.readFileSync(path.join(root,'site',file)));
  write('assets/refresh/catalogue.json',JSON.stringify({products:products.map(({id,short,allowances,qualifier,trial})=>({id,short,allowances,qualifier,trial})),plans:plans.map(({id,name,price})=>({id,name,price}))}));
  for (const name of names) write(`assets/refresh/${name}.svg`,illustration(name));
  // Keep genuine product/location paths available. The source redirects contain
  // an old blanket redirect that sends missing public pages to Who We Serve.
  const redirectSource = fs.readFileSync(path.join(root,'_redirects'),'utf8');
  const redirects = redirectSource.split(/\r?\n/).filter(line=>!/^\/(?:movingleadsdaily|probateleads|newbusinessalert|planningleads|tenders)(?:\s|\/\*)/.test(line) && !/^\/contact\/?\s/.test(line));
  const finalRedirects=redirects.filter(line=>!/^\/\*\s/.test(line));
  for(const [relative,target] of Object.entries(aliases))finalRedirects.push('/'+relative+'  '+target+'  301!');
  finalRedirects.push('/*  /404.html  404');
  write('_redirects',finalRedirects.join('\n'));
  write('assets/refresh/build-info.json',JSON.stringify({version:1,templates:Object.keys(routes).length,illustrations:names.length}));
  console.log(`Built ${htmlCount} public HTML files using ${Object.keys(routes).length} redesigned page templates, reference/location templates and ${names.length} illustrations in ${output}`);
}
if (require.main === module) build();
module.exports = { build, legacy, root, output };
