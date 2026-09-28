// ============================================================
// 9amLeads - Overnight Brevo campaign creator (self-restarting)
// Creates the remaining onboarding + cold outreach campaigns in
// batches, waiting out Brevo's rolling rate limit between batches.
// Writes progress to campaign_progress.json so we can track it.
// Run: node overnight_campaigns.js
// ============================================================
var h=require('https');
var fs=require('fs');
var path=require('path');
var KEY=process.env.BREVO_API_KEY || '';
var fr=require('./email_design.js');
var ce=require('./email_content.js');
var apiRequest=fr.apiRequest, buildEmail=fr.buildEmail;
var PROGRESS=path.join(__dirname,'campaign_progress.json');

var products=[
  {key:'moving',color:'#bf360c',color2:'#8f2700',bg:'#fff7f2',name:'Moving Leads',url:'https://9amleads.com/movingleadsdaily/',leadType:'moving opportunity',source:'Rightmove',value:'a move worth £5,000+',listId:44},
  {key:'probate',color:'#5b21b6',color2:'#3b1364',bg:'#f8f5ff',name:'Probate Leads',url:'https://9amleads.com/probateleads/',leadType:'probate notice',source:'the UK Gazette',value:'a probate instruction worth thousands',listId:45},
  {key:'newbusiness',color:'#166534',color2:'#0f4524',bg:'#f0fdf4',name:'New Business Alerts',url:'https://9amleads.com/newbusinessalert/',leadType:'new company',source:'Companies House',value:'a new client worth thousands',listId:46},
  {key:'planning',color:'#115e59',color2:'#0b3d3a',bg:'#f0fdfa',name:'Planning Permission Leads',url:'https://9amleads.com/planningleads/',leadType:'planning application',source:'council planning portals',value:'a project worth thousands',listId:47},
  {key:'tenders',color:'#3730a3',color2:'#232080',bg:'#f5f7ff',name:'Public Sector Tenders',url:'https://9amleads.com/tenders/',leadType:'tender opportunity',source:'Contracts Finder & Find a Tender',value:'a contract worth tens of thousands',listId:48}
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
function loadProgress(){try{return JSON.parse(fs.readFileSync(PROGRESS,'utf-8'));}catch(e){return {done:[],created:0};}}
function saveProgress(p){fs.writeFileSync(PROGRESS,JSON.stringify(p,null,2));}

function getExistingNames(){
  return new Promise(function(resolve){
    var all=[];
    function page(offset){
      h.get({hostname:'api.brevo.com',path:'/v3/emailCampaigns?limit=200&offset='+offset,headers:{'api-key':KEY,'Accept':'application/json'},timeout:25000},function(res){
        var b='';res.on('data',function(c){b+=c;});
        res.on('end',function(){
          if(res.statusCode===429){setTimeout(function(){page(offset);},120000);return;}
          if(res.statusCode!==200){setTimeout(function(){page(offset);},60000);return;}
          try{
            var j=JSON.parse(b);
            var camps=j.campaigns||[];
            camps.forEach(function(c){all.push(c.name);});
            if(camps.length>=200)page(offset+200);else resolve(all);
          }catch(e){resolve(all);}
        });
      }).on('error',function(){setTimeout(function(){page(offset);},60000);});
    }
    page(0);
  });
}

async function createOne(campName, body){
  for(var a=0;a<10;a++){
    var r=await apiRequest('POST','/v3/emailCampaigns',body);
    if(r.status===201)return 'created';
    if(r.status===429){await sleep(60000);continue;}
    if(r.status===0){await sleep(30000);continue;}
    return 'err:'+r.body.substring(0,60);
  }
  return 'rate-limited';
}

async function run(){
  console.log('=== Overnight Brevo campaign creator started ===');
  var progress=loadProgress();
  // Skip the slow bulk fetch of existing names - rely on the progress file
  // (it dedupes across runs). If a name was already created, Brevo still
  // allows the POST but we track it in progress.
  var existing=progress.done||[];
  console.log('progress file has '+existing.length+' done');
  var queue=[];
  for(var pi=0;pi<products.length;pi++){
    var p=products[pi];
    [['onboarding',onboarding],['cold',cold]].forEach(function(track){
      track[1].forEach(function(step){
        var campName=p.name+' - '+track[0]+' - '+step.key;
        if(progress.done.indexOf(campName)>-1)return;
        if(existing.indexOf(campName)>-1){progress.done.push(campName);return;}
        queue.push({p:p,track:track[0],step:step,name:campName});
      });
    });
  }
  console.log('campaigns to create: '+queue.length);
  var createdInThisRun=0;
  for(var i=0;i<queue.length;i++){
    var item=queue[i];
    var layout=ce.makeOnboardingLayout(item.p,null,{track:item.track,key:item.step.key,week:item.step.week,subject:item.step.subject});
    var html=buildEmail(item.p,layout);
    var body=JSON.stringify({sender:{name:'9am Leads',email:'hello@9amleads.com'},name:item.name,htmlContent:html,subject:item.step.subject,recipients:{listIds:[item.p.listId]},type:'classic'});
    var res=await createOne(item.name,body);
    if(res==='created'){createdInThisRun++;progress.created++;progress.done.push(item.name);saveProgress(progress);console.log('created '+item.name);}
    else if(res==='rate-limited'){
      console.log('RATE LIMITED at '+item.name+' - saving progress and exiting. Re-run to continue.');
      console.log('Progress: '+progress.done.length+' done, '+progress.created+' created this session total.');
      process.exit(0);
    }
    else console.log('FAIL '+item.name+': '+res);
    await sleep(2000);
  }
  console.log('=== COMPLETE === Created '+createdInThisRun+' this run. Total '+progress.created+' created. '+(queue.length-createdInThisRun)+' skipped. Remaining: '+queue.filter(function(q){return progress.done.indexOf(q.name)===-1;}).length);
  process.exit(0);
}
run();
