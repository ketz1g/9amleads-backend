// Dependency-free renderers used by the existing Express server and local preview.
const { shell, header, footer, escape, icon, art, button, closing } = require('./components.cjs');
const { products } = require('./content.cjs');

function productFor(post) {
  const value = `${post.product || ''} ${post.product_name || ''} ${post.category || ''} ${post.title || ''}`.toLowerCase();
  return products.find(p => value.includes(p.id) || value.includes(p.short.toLowerCase())) || products[2];
}
function renderBlogIndex(posts, query={}) {
  const q = String(query.q || '').trim().slice(0,180);
  const category = products.some(p=>p.id===query.category) ? query.category : '';
  const filtered = posts.filter(p=>(!category || productFor(p).id === category) && (!q || `${p.title || ''} ${p.description || ''}`.toLowerCase().includes(q.toLowerCase())));
  const pageSize = 12;
  const pages = Math.max(1,Math.ceil(filtered.length/pageSize));
  const page = Math.min(pages,Math.max(1,parseInt(query.page,10)||1));
  const slice = filtered.slice((page-1)*pageSize,page*pageSize);
  const url = n => '/blog/?'+new URLSearchParams(Object.fromEntries(Object.entries({q,category,page:String(n)}).filter(([,v])=>v)));
  const cards = slice.map(p=>{
    const product=productFor(p);
    return `<a class="resource-card blog-card" href="/blog/${encodeURIComponent(p.slug)}">${art(product.art)}<div><p class="eyebrow">${escape(p.product_name || p.category || product.name)}</p><h3>${escape(p.title)}</h3><p>${escape(p.description || '')}</p><span class="text-link">Read the guide ${icon('arrow')}</span></div></a>`;
  }).join('');
  return shell({title:page>1?`Guides & insights · Page ${page}`:'Guides for a more productive business day',description:'Practical guides to moving, probate, new-business, planning and tender opportunities. Find an idea for your next step.',route:page>1?url(page):'/blog/',body:
    `<section class="page-hero"><div class="container split"><div><p class="eyebrow">The 9am reading list</p><h1>A little insight.<br>A useful next step.</h1><p>Practical ideas for finding opportunities, making introductions and building a more consistent pipeline.</p></div>${art('business','',true)}</div></section><section class="section"><div class="container"><form class="blog-tools" action="/blog/" method="get"><div class="search-field"><label class="sr-only" for="blog-search">Search guides</label>${icon('search')}<input id="blog-search" type="search" name="q" placeholder="What would you like to learn?" value="${escape(q)}"></div><label class="sr-only" for="blog-category">Guide category</label><select id="blog-category" class="field" name="category"><option value="">All topics</option>${products.map(p=>`<option value="${p.id}"${p.id===category?' selected':''}>${p.name}</option>`).join('')}</select><button class="button" type="submit">Find guides ${icon('arrow')}</button></form><p class="fine-print" style="margin:0 0 24px">${filtered.length} ${filtered.length===1?'guide':'guides'}${q?' matching your search':''}</p><div class="resource-grid">${cards}</div>${!cards?'<p class="empty-message">No guides match that search. Try a different phrase or browse all topics.</p>':''}<nav class="pagination" aria-label="Blog pages">${page>1?`<a class="button button-secondary" href="${escape(url(page-1))}">Previous</a>`:''}<span>Page ${page} of ${pages}</span>${page<pages?`<a class="button button-secondary" href="${escape(url(page+1))}">Next ${icon('arrow')}</a>`:''}</nav></div></section>`+closing()});
}

function renderBlogPost(post) {
  const product=productFor(post);
  const match=String(post.html || '').match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  let body=match?match[1]:String(post.html || '');
  body=body.replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi,'');
  body=body.replace(/<div\b[^>]*class=["']topnav["'][^>]*>[\s\S]*?<\/div>/gi,'');
  body=body.replace(/\sstyle=("[^"]*"|'[^']*')/gi,(_,raw)=>{
    const style=raw.slice(1,-1).split(';').filter(rule=>!/^\s*(color|background[^:]*|font[^:]*|max-width|width|margin|padding)\s*:/.test(rule)).join(';');
    return style?' style="'+escape(style)+'"':'';
  });
  body=body.replace(/<img\b[^>]*src=["'][^"']*\/blog\/(?:img|og)\/[^"']+["'][^>]*>/gi,'');
  const date=new Date(post.updated_at || post.created_at);
  const dateLabel=Number.isNaN(date.getTime())?'':date.toLocaleDateString('en-GB',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'});
  const route='/blog/'+encodeURIComponent(post.slug);
  const schema={'@context':'https://schema.org','@type':'Article',headline:post.title,description:post.description || '',author:{'@type':'Organization',name:'9amLeads'},mainEntityOfPage:'https://9amleads.com'+route};
  if(!Number.isNaN(date.getTime()))schema.dateModified=date.toISOString();
  return shell({title:post.title,description:post.description || product.description,route,head:'<script type="application/ld+json">'+JSON.stringify(schema).replace(/</g,'\\u003c')+'</script>',body:
    `<section class="page-hero"><div class="container split"><div><div class="breadcrumb"><a href="/blog/">Guides & insights</a><span>/</span><span>${escape(product.name)}</span></div><p class="eyebrow">${escape(product.name)}</p><h1>${escape(post.title)}</h1><p>${escape(post.description || '')}</p><p class="fine-print">9amLeads editorial team${dateLabel?' · Updated '+dateLabel:''}</p></div>${art(product.art,'',true)}</div></section><section class="section"><div class="container"><article class="editorial">${body}</article></div></section>`+closing(product.id)});
}

function injectPortal(html, filename) {
  if (/^(admin|seo|staff|test|debug|_)/i.test(filename)) return html;
  let output=html;
  if(!output.includes('/assets/refresh/portal.css'))output=output.replace(/<\/head>/i,'<link rel="stylesheet" href="/assets/refresh/portal.css"></head>');
  output=output.replace(/<body\b([^>]*)>/i,(_,attrs)=>{
    if(/\bclass\s*=/.test(attrs))return '<body'+attrs.replace(/class=(['"])(.*?)\1/i,(_,q,classes)=>`class=${q}${classes} refresh-portal${q}`)+'>';
    return '<body'+attrs+' class="refresh-portal">';
  });
  return output;
}

function renderDemo() {
  return shell({title:'Explore a sample 9amLeads workspace',description:'Try a fictional sample workspace. Review example opportunities, save a note and explore the next step without creating an account.',route:'/portal/demo.html',kind:'demo-page',head:'<meta name="robots" content="noindex"><script src="/assets/refresh/demo.js" defer></script>',body:
    `<section class="page-hero"><div class="container"><p class="eyebrow">An interactive product preview</p><h1>Meet your new<br>morning workspace.</h1><p>Explore fictional example records. Try selecting an opportunity, adding a note and changing its status.</p><p class="fine-print">This sample is stored only in this page. It does not contact prospects, send mail or change your account.</p></div></section><section class="section"><div class="container"><div class="product-tabs" role="group" aria-label="Demo opportunity type">${products.map(p=>`<button type="button" data-demo-product="${p.id}" aria-pressed="${p.id==='moving'}">${icon(p.icon)}${p.short}</button>`).join('')}</div><div class="demo-workspace"><aside class="demo-sidebar"><p class="eyebrow">Your opportunities</p><div id="demo-records"></div></aside><div class="demo-detail" id="demo-detail"></div></div><p class="section-end">Ready to see real opportunities in your area? <a href="/portal/#signup">Start your free week ${icon('arrow')}</a></p></div></section>`,scripts:`<script type="application/json" id="demo-data">${JSON.stringify(products.map(({id,name,colour,tint,icon,sample})=>({id,name,colour,tint,icon,sample}))).replace(/</g,'\\u003c')}</script>`});
}
module.exports={renderBlogIndex,renderBlogPost,injectPortal,renderDemo};
