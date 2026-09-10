// autoimport_buyer_lists.js — watches the shared data dir for completed buyer CSV
// scrapes and imports each into its Brevo list + attaches to its draft campaign.
// Spawned detached by production_api_server.js (boot hook) so it runs 24/7 on the
// Render disk where the CSVs land. Self-throttles on Brevo's ~100 req/hr budget and
// records progress so it never double-imports.
//
// Only imports subtypes that still have a live campaign. moving-estateagent and
// tend-catering are deliberately SKIPPED (their campaigns 446/474 were removed).
//
// Progress is stored in data/autoimport-progress.json  { imported: { subtype: ts } }
const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PROG_FILE = path.join(DATA_DIR, 'autoimport-progress.json');
const LOG_FILE = path.join(DATA_DIR, 'autoimport.log');

// subtype -> live Brevo draft campaign id (from the 32 kept campaigns)
const CAMPAIGN_MAP = {
  'moving-removal':442, 'moving-manvan':443, 'moving-storage':444, 'moving-clearance':445,
  'moving-packers':447, 'moving-skipwaste':448,
  'probate-solicitor':449, 'probate-estateagent':450, 'probate-funeraldirector':451, 'probate-financial':452, 'probate-willwriter':453,
  'nb-accountant':454, 'nb-webdesign':455, 'nb-marketing':456, 'nb-it':457, 'nb-insurance':458, 'nb-recruitment':459, 'nb-businesssupport':460,
  'plan-builder':461, 'plan-roofing':462, 'plan-electrician':463, 'plan-plumber':464, 'plan-extensions':465, 'plan-architect':466, 'plan-landscaper':467, 'plan-developer':468,
  'tend-construction':469, 'tend-cleaning':470, 'tend-security':471, 'tend-it':472, 'tend-facilities':473, 'tend-logistics':475, 'tend-healthcare':510
};
// readable plural for list naming (matches import_buyer_list.js naming)
const PLURAL = {
  'moving-removal':'Removal Companies', 'moving-manvan':'Man & Van Operators', 'moving-storage':'Storage Companies', 'moving-clearance':'House Clearance Firms',
  'moving-packers':'Packing & Relocation Services', 'moving-skipwaste':'Skip & Waste Companies',
  'probate-solicitor':'Solicitors', 'probate-estateagent':'Estate Agents', 'probate-funeraldirector':'Funeral Directors', 'probate-financial':'Financial Advisers', 'probate-willwriter':'Will Writers',
  'nb-accountant':'Accountants & Bookkeepers', 'nb-webdesign':'Web Designers & Developers', 'nb-marketing':'Marketing & SEO Agencies', 'nb-it':'IT & Support Providers', 'nb-insurance':'Insurance Brokers', 'nb-recruitment':'Recruitment Agencies', 'nb-businesssupport':'Business Support & Consultancy Firms',
  'plan-builder':'Builders & Contractors', 'plan-roofing':'Roofers', 'plan-electrician':'Electricians', 'plan-plumber':'Plumbers & Heating Engineers', 'plan-extensions':'Extension & Loft Specialists', 'plan-architect':'Architects', 'plan-landscaper':'Landscapers & Gardeners', 'plan-developer':'Property Developers',
  'tend-construction':'Construction Contractors', 'tend-cleaning':'Cleaning Companies', 'tend-security':'Security Companies', 'tend-it':'IT & Technology Providers', 'tend-facilities':'Facilities Management Companies', 'tend-logistics':'Transport & Logistics Companies', 'tend-healthcare':'Healthcare & Social Care Providers'
};
const NOISE = /\b(courier|haulage|freight|trucking|parcel|same.?day\s?delivery|logistics|van hire|van\s*sales)\b/i;
const JUNK = /user@domain|yourdomain|@example\.|@domain\.|jane@example|van.?hire|vans@|@gmail|@yahoo|@hotmail|@outlook|@aol\./i;
const bk = process.env.BREVO_API_KEY || process.argv[2] || '';

function log(m){ const l = new Date().toISOString() + ' ' + m; console.log(l); try { fs.appendFileSync(LOG_FILE, l + '\n'); } catch(e){} }
function loadProg(){ try { return JSON.parse(fs.readFileSync(PROG_FILE,'utf-8')); } catch(e){ return { imported: {} }; } }
function saveProg(p){ try { fs.writeFileSync(PROG_FILE, JSON.stringify(p, null, 2)); } catch(e){} }
function req(method, url, body){
  return new Promise(function(resolve){
    const d = body ? JSON.stringify(body) : '';
    const r = https.request({ hostname:'api.brevo.com', path:url, method, headers:{ 'api-key':bk, 'content-type':'application/json', 'accept':'application/json', ...(d ? { 'content-length': Buffer.byteLength(d) } : {}) } }, function(resp){
      let b=''; resp.on('data',function(c){ b+=c; }); resp.on('end',function(){ resolve({ s:resp.statusCode, h:resp.headers, b }); });
    });
    r.on('error', function(e){ resolve({ s:0, h:{}, b:String(e) }); });
    if (d) r.write(d); r.end();
  });
}
const sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };

// Parse name,website,email CSV rows respecting quotes.
function parseCsv(txt){
  const out=[]; const lines=String(txt||'').split(/\r?\n/).filter(Boolean).slice(1);
  lines.forEach(function(ln){
    const fields=[]; let cur='', inq=false;
    for(let i=0;i<ln.length;i++){ const ch=ln[i]; if(inq){ if(ch==='"'){ if(ln[i+1]==='"'){ cur+='"'; i++; } else inq=false; } else cur+=ch; } else if(ch==='"') inq=true; else if(ch===','){ fields.push(cur); cur=''; } else cur+=ch; }
    fields.push(cur);
    const email=fields[2] ? String(fields[2]).trim() : '';
    const name=fields[0] ? String(fields[0]).trim() : '';
    if(!email) return;
    if(JUNK.test(email)) return;
    const nm=(name||'').toLowerCase();
    if(NOISE.test(nm) && !/remov|storage|house clear|clearance|mover/i.test(nm)) return;
    out.push({ name, email });
  });
  return out;
}

// Import one completed subtype CSV: create/reuse list, bulk import, attach to campaign.
async function importSubtype(key){
  const csvFile = path.join(DATA_DIR, 'buyer-' + key + '-emails.csv');
  const rows = parseCsv(fs.readFileSync(csvFile,'utf-8'));
  const seen={}; const emails=[];
  rows.forEach(function(r){ if(!seen[r.email]){ seen[r.email]=1; emails.push(r.email); } });
  if(!emails.length){ log('[autoimport] '+key+': no valid emails, skipping'); return false; }
  const listName = (PLURAL[key] || key) + ' (9am Buyers)';
  log('[autoimport] '+key+': '+emails.length+' emails -> list "'+listName+'"');

  // 1. find or create list (case-insensitive name match)
  let listId=null;
  for(let off=0; off<500 && !listId; off+=50){
    const r=await req('GET','/v3/contacts/lists?limit=50&offset='+off);
    if(r.s===200){ const j=JSON.parse(r.b); const hit=(j.lists||[]).find(function(l){ return String(l.name).trim().toLowerCase()===listName.toLowerCase(); }); if(hit) listId=hit.id; }
    else if(r.s===429){ const w=Math.max(parseInt(r.h['x-sib-ratelimit-reset']||'60',10),60)+5; log('[autoimport] rate list-check, wait '+w+'s'); await sleep(w*1000); }
    else { log('[autoimport] list GET err '+r.s); break; }
    await sleep(400);
  }
  if(!listId){
    for(let a=0;a<25 && !listId;a++){
      const r=await req('POST','/v3/contacts/lists',{ folderId:1, name:listName });
      if(r.s===201||r.s===200){ listId=JSON.parse(r.b).id; log('[autoimport] created list '+listId); }
      else if(r.s===429){ const w=Math.max(parseInt(r.h['x-sib-ratelimit-reset']||'60',10),60)+5; log('[autoimport] rate create, wait '+w+'s'); await sleep(w*1000); }
      else { log('[autoimport] create list failed '+r.s+' '+String(r.b).slice(0,150)); return false; }
    }
  }
  if(!listId){ log('[autoimport] no list id for '+key); return false; }

  // 2. bulk import (update existing so re-scrapes enrich, not duplicate)
  const body={ listIds:[listId], updateExistingContacts:true, jsonBody: emails.map(function(e){ return { email:e }; }) };
  let imported=false;
  for(let a=0;a<30 && !imported;a++){
    const r=await req('POST','/v3/contacts/import',body);
    if(r.s===200||r.s===201||r.s===202){ log('[autoimport] import accepted ('+emails.length+' emails)'); imported=true; }
    else if(r.s===429){ const w=Math.max(parseInt(r.h['x-sib-ratelimit-reset']||'60',10),60)+5; log('[autoimport] rate import, wait '+w+'s'); await sleep(w*1000); }
    else { log('[autoimport] import failed '+r.s+' '+String(r.b).slice(0,200)); return false; }
  }
  if(!imported) return false;

  // 3. attach list to campaign
  const campId = CAMPAIGN_MAP[key];
  if(campId){
    for(let a=0;a<25;a++){
      const r=await req('PUT','/v3/emailCampaigns/'+campId,{ recipients:{ listIds:[listId] } });
      if(r.s===204){ log('[autoimport] attached list '+listId+' -> campaign '+campId); break; }
      if(r.s===429){ const w=Math.max(parseInt(r.h['x-sib-ratelimit-reset']||'60',10),60)+5; log('[autoimport] rate attach, wait '+w+'s'); await sleep(w*1000); }
      else { log('[autoimport] attach failed '+r.s+' '+String(r.b).slice(0,120)); break; }
    }
  } else {
    log('[autoimport] WARN no campaign for '+key+' (skipped subtype) - imported to list only');
  }
  // 4. record progress
  const prog=loadProg(); prog.imported[key]=new Date().toISOString(); saveProg(prog);
  log('[autoimport] DONE '+key+' -> list '+listId+' ('+emails.length+' emails)');
  return true;
}

async function scan(){
  if(!bk){ log('[autoimport] no BREVO_API_KEY - exiting'); process.exit(1); }
  let files=[];
  try { files=fs.readdirSync(DATA_DIR).filter(function(f){ return /^buyer-.*-emails\.csv$/.test(f); }); } catch(e){ log('[autoimport] data dir read error '+e.message); return; }
  const prog=loadProg();
  for(const f of files){
    const key=f.replace(/^buyer-/,'').replace(/-emails\.csv$/,'');
    if(!CAMPAIGN_MAP[key]) continue;               // skip subtypes with no live campaign (estateagent/catering etc)
    if(prog.imported && prog.imported[key]) continue; // already imported
    try { await importSubtype(key); } catch(e){ log('[autoimport] error on '+key+': '+e.message); }
  }
}

(async function loop(){
  log('[autoimport] watcher started');
  // run on start, then every 10 minutes
  await scan();
  setInterval(function(){ scan().catch(function(e){ log('[autoimport] loop error '+e.message); }); }, 10*60*1000);
})();
