const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const refresh = require('../site/backend.cjs');
const root = path.resolve(__dirname, '..', 'dist');
const portal = path.resolve(__dirname, '..', '..', 'mission control', 'portal');
const port = Number(process.env.PREVIEW_PORT || 4173);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.mp4':'video/mp4','.xml':'application/xml','.txt':'text/plain; charset=utf-8'};
const server = http.createServer(function (req,res) {
  const url = new URL(req.url,'http://localhost');
  if (url.pathname === '/portal/demo.html') { res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(refresh.renderDemo()); return; }
  if (url.pathname === '/blog/' || url.pathname === '/blog') {
    // Public editorial fixtures only; the preview never reads the production DB.
    const posts = Array.from({length:18},(_,i)=>({slug:'preview-guide-'+(i+1),title:['Make a useful first introduction','Build a consistent morning routine','Find planning projects in your area','Getting started with moving opportunities','Reviewing your first public tender','Understanding a probate record'][i%6],description:'A practical guide to reviewing the source, choosing the right opportunity and making a relevant next step.',category:['New business','Moving','Planning','Moving','Tenders','Probate'][i%6],created_at:'2026-09-01',html:'<html><body><h1>Preview guide</h1><h2>A useful place to start</h2><p>This is a local preview fixture for checking the article layout. Production articles continue to come from the existing public blog store.</p></body></html>'}));
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(refresh.renderBlogIndex(posts,Object.fromEntries(url.searchParams)));return;
  }
  if (/^\/blog\/preview-guide-\d+$/.test(url.pathname)) {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(refresh.renderBlogPost({slug:url.pathname.split('/').pop(),title:'Make a useful first introduction',category:'New business',description:'A practical guide to a more thoughtful follow-up.',created_at:'2026-09-01',html:'<html><body><h1>Preview guide</h1><h2>Start with the source</h2><p>This is a local article preview. Review the information behind an opportunity before making a relevant introduction.</p><h2>Keep your next step clear</h2><p>Use a concise message and keep track of the conversation in your workspace.</p></body></html>'}));return;}
  if (url.pathname.startsWith('/api/')) { res.writeHead(503,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'Preview mode: live API requests are disabled.'})); return; }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400);res.end();return; }
  const base = pathname.startsWith('/portal/') ? portal : root;
  let relative = pathname.startsWith('/portal/') ? pathname.slice(8) : pathname.slice(1);
  let file = path.resolve(base,relative || 'index.html');
  if (file !== base && !file.startsWith(base+path.sep)) {res.writeHead(403);res.end();return;}
  try {
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
    if (!fs.existsSync(file) && !path.extname(file) && fs.existsSync(file+'.html')) file+='.html';
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    if (base === portal && path.extname(file) === '.html') res.end(refresh.injectPortal(fs.readFileSync(file,'utf8'),path.basename(file)));
    else fs.createReadStream(file).pipe(res);
  } catch {res.writeHead(500);res.end('Preview error');}
});
server.listen(port,'127.0.0.1',()=>console.log(`9amLeads preview: http://127.0.0.1:${port}`));
module.exports = server;
