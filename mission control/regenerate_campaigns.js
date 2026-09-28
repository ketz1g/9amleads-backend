// ============================================================
// 9amLeads - Regenerate ALL campaign email content with the
// fixed content engine (no repeated blocks, correct per-product
// colour scheme, clear logo, working links) and push to Brevo.
// Run: node regenerate_campaigns.js
// ============================================================
var h=require('https');
var fs=require('fs');
var path=require('path');
var __dir = __dirname;
var KEY=process.env.BREVO_API_KEY || '';
var fr=require(path.join(__dir,'email_design.js'));
var ce=require(path.join(__dir,'email_content.js'));
var apiRequest=fr.apiRequest, buildEmail=fr.buildEmail;

var products=[
  {key:'moving',color:'#bf360c',color2:'#8f2700',bg:'#fff7f2',name:'Moving Leads',shortName:'Moving',sector:'moving',url:'https://9amleads.com/movingleadsdaily/',leadType:'moving opportunity',source:'Rightmove',value:'a move worth £5,000+',listId:44},
  {key:'probate',color:'#5b21b6',color2:'#3b1364',bg:'#f8f5ff',name:'Probate Leads',shortName:'Probate',sector:'probate',url:'https://9amleads.com/probateleads/',leadType:'probate notice',source:'the UK Gazette',value:'a probate instruction worth thousands',listId:45},
  {key:'newbusiness',color:'#166534',color2:'#0f4524',bg:'#f0fdf4',name:'New Business Alerts',shortName:'New Business',sector:'newbusiness',url:'https://9amleads.com/newbusinessalert/',leadType:'new company',source:'Companies House',value:'a new client worth thousands',listId:46},
  {key:'planning',color:'#115e59',color2:'#0b3d3a',bg:'#f0fdfa',name:'Planning Permission Leads',shortName:'Planning',sector:'planning',url:'https://9amleads.com/planningleads/',leadType:'planning application',source:'council planning portals',value:'a project worth thousands',listId:47},
  {key:'tenders',color:'#3730a3',color2:'#232080',bg:'#f5f7ff',name:'Public Sector Tenders',shortName:'Tenders',sector:'tenders',url:'https://9amleads.com/tenders/',leadType:'tender opportunity',source:'Contracts Finder & Find a Tender',value:'a contract worth tens of thousands',listId:48}
];
var onboarding=[
  {key:'welcome',week:'Week 1 · Day 1',subject:'Your free week of leads starts now'},
  {key:'why9am',week:'Week 1 · Day 3',subject:'Why 9am? (There\'s a reason)'},
  {key:'convert',week:'Week 1 · Day 5',subject:'3 steps to convert your first lead'},
  {key:'sources',week:'Week 2 · Day 8',subject:'Where your leads come from'},
  {key:'exclusive',week:'Week 2 · Day 10',subject:'You\'re the only one getting these leads'},
  {key:'volume',week:'Week 2 · Day 12',subject:'How many leads should you expect?'},
  {key:'success',week:'Week 3 · Day 15',subject:'"I signed new clients in my first week"'},
  {key:'roi',week:'Week 3 · Day 17',subject:'One booking covers months of leads'},
  {key:'proof',week:'Week 3 · Day 19',subject:'Join 100+ businesses using 9amLeads'},
  {key:'ending',week:'Week 4 · Day 22',subject:'Your free trial ends in 3 days'},
  {key:'lose',week:'Week 4 · Day 24',subject:'Don\'t lose your lead flow'},
  {key:'final',week:'Week 4 · Day 26',subject:'Last chance - lock in launch pricing'}
];
var cold=[
  {key:'intro',week:'Email 1',subject:'Fresh leads every morning at 9am?'},
  {key:'problem',week:'Email 2',subject:'What\'s an hour of your team\'s time worth?'},
  {key:'solution',week:'Email 3',subject:'How 9amLeads works'},
  {key:'value',week:'Email 4',subject:'The value of a single lead'},
  {key:'how',week:'Email 5',subject:'Why 9am? (There\'s a reason)'},
  {key:'success',week:'Email 6',subject:'Real results from real customers'},
  {key:'objection',week:'Email 7',subject:'"I can find my own leads" - can you?'},
  {key:'compare',week:'Email 8',subject:'We\'re half the price - with better delivery'},
  {key:'proof',week:'Email 9',subject:'Join 100+ businesses using 9amLeads'},
  {key:'offer',week:'Email 10',subject:'Try 9amLeads free for 7 days'},
  {key:'urgency',week:'Email 11',subject:'Your free week won\'t last forever'},
  {key:'final',week:'Email 12',subject:'Last chance to try 9amLeads free'}
];

function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}

function getCampaigns(){
  return new Promise(function(resolve){
    var all=[];
    function page(offset){
      h.get({hostname:'api.brevo.com',path:'/v3/emailCampaigns?limit=100&offset='+offset,headers:{'api-key':KEY,'Accept':'application/json'},timeout:30000},function(res){
        var b='';res.on('data',function(c){b+=c;});
        res.on('end',function(){
          if(res.statusCode!==200){setTimeout(function(){page(offset);},60000);return;}
          try{
            var j=JSON.parse(b);
            var camps=j.campaigns||[];
            camps.forEach(function(c){all.push({id:c.id,name:c.name,html:c.htmlContent||''});});
            if(camps.length>=100)page(offset+100);else resolve(all);
          }catch(e){resolve(all);}
        });
      }).on('error',function(){setTimeout(function(){page(offset);},60000);});
    }
    page(0);
  });
}

async function updateOne(id, html){
  for(var a=0;a<60;a++){
    var r=await apiRequest('PUT','/v3/emailCampaigns/'+id,JSON.stringify({htmlContent:html}));
    if(r.status===200||r.status===204)return 'ok';
    if(r.status===429){console.log('  rate-limited (retry '+a+'), waiting 180s...');await sleep(180000);continue;}
    if(r.status===0){await sleep(30000);continue;}
    return 'err:'+r.body.substring(0,50);
  }
  return 'rate-limited';
}

async function run(){
  console.log('=== Regenerate ALL campaign content ===');
  var progress={};
  try{progress=JSON.parse(fs.readFileSync(path.join(__dirname,'regenerate_progress.json'),'utf-8'));}catch(e){}
  var camps=await getCampaigns();
  console.log('campaigns on Brevo: '+camps.length);
  var desired={};
  products.forEach(function(p){
    [['onboarding',onboarding],['cold',cold]].forEach(function(track){
      track[1].forEach(function(step){
        var name=p.name+' - '+track[0]+' - '+step.key;
        var L=ce.makeOnboardingLayout(p,null,{track:track[0],key:step.key,week:step.week,subject:step.subject});
        desired[name]={html:buildEmail(p,L), subject:step.subject};
      });
    });
  });
  console.log('desired emails: '+Object.keys(desired).length);
  // Sanity-check desired content: no repeated blocks (must NOT have all 4 of reasons/features/offer/different)
  Object.keys(desired).forEach(function(name){
    var html=desired[name].html;
    var blocks=0;
    ['6 reasons to choose','Everything included','Everything we offer','Why we\'re different'].forEach(function(m){
      if(html.indexOf(m)>-1)blocks++;
    });
    if(blocks>2)console.log('WARN '+name+' has '+blocks+' big blocks (should be <=2)');
    if(html.indexOf('undefined')>-1)console.log('WARN '+name+' contains undefined');
  });
  console.log('content sanity checks done');
  var matched=0;
  camps.forEach(function(c){ if(desired[c.name]) matched++; });
  console.log('campaigns matching desired names: '+matched);
  var updated=0, failed=0, skipped=0;
  var i=0;
  for(var name in desired){
    if(!desired.hasOwnProperty(name))continue;
    i++;
    if(progress.done && progress.done.indexOf(name)>-1){skipped++;continue;}
    var targets=camps.filter(function(c){return c.name===name;});
    if(targets.length===0){console.log('NO CAMPAIGN for '+name);continue;}
    // Update the FIRST (keep-alive) matching campaign
    var res=await updateOne(targets[0].id, desired[name].html);
    if(res==='ok'){
      updated++;
      progress.done=progress.done||[];
      progress.done.push(name);
      fs.writeFileSync(path.join(__dirname,'regenerate_progress.json'),JSON.stringify(progress));
    }
    else {failed++;console.log('FAIL '+name+': '+res);}
    if(i%10===0)console.log('progress '+i+'/'+Object.keys(desired).length+' updated='+updated+' failed='+failed+' skipped='+skipped);
    // Slower pacing to stay under Brevo's write rate limit (429s reset frequently)
    await sleep(8000);
  }
  console.log('\nDONE: updated='+updated+' failed='+failed+' skipped='+skipped+' of '+Object.keys(desired).length);
  process.exit(0);
}
run();
