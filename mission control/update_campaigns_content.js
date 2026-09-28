// ============================================================
// 9amLeads - Update all campaign email content with the fixed HTML
// Rebuilds each campaign's htmlContent from the (fixed) content engine
// and PUTs it to Brevo. Skips campaigns that already have clean content.
// Run: node update_campaigns_content.js
// ============================================================
var h=require('https');
var fs=require('fs');
var path=require('path');
var KEY=process.env.BREVO_API_KEY || '';
var fr=require('./email_design.js');
var ce=require('./email_content.js');
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
function loadProgress(){try{return JSON.parse(fs.readFileSync(path.join(__dirname,'campaign_progress.json'),'utf-8'));}catch(e){return {done:[]};}}

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
  for(var a=0;a<8;a++){
    var r=await apiRequest('PUT','/v3/emailCampaigns/'+id,JSON.stringify({htmlContent:html}));
    if(r.status===200||r.status===204)return 'ok';
    if(r.status===429){await sleep(60000);continue;}
    if(r.status===0){await sleep(30000);continue;}
    return 'err:'+r.body.substring(0,50);
  }
  return 'rate-limited';
}

async function run(){
  console.log('=== Update campaign content ===');
  var progress=loadProgress();
  var camps=await getCampaigns();
  console.log('campaigns on Brevo: '+camps.length);
  // Build desired content map
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
  // For each campaign, check if it needs update (has old/broken content)
  var toUpdate=camps.filter(function(c){
    if(!desired[c.name])return false;
    if(progress.done.indexOf('content:'+c.id)>-1)return false;
    // update if it contains "undefined" or old broken pattern
    return c.html.indexOf('undefined')>-1 || c.html.indexOf('<tr><t</tr>')>-1 || c.html.indexOf('Everything included')>-1;
  });
  console.log('campaigns needing content update: '+toUpdate.length);
  var updated=0, skipped=0;
  for(var i=0;i<toUpdate.length;i++){
    var c=toUpdate[i];
    var d=desired[c.name];
    var res=await updateOne(c.id, d.html);
    if(res==='ok'){updated++;progress.done.push('content:'+c.id);fs.writeFileSync(path.join(__dirname,'campaign_progress.json'),JSON.stringify(progress));}
    else skipped++;
    if((i+1)%10===0)console.log('progress '+(i+1)+'/'+toUpdate.length+' updated='+updated);
    await sleep(2500);
  }
  console.log('\nDONE: updated='+updated+' failed/skipped='+skipped);
  process.exit(0);
}
run();
