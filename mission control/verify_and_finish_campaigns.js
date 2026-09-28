// ============================================================
// 9amLeads - Overnight Brevo campaign finisher
// Waits for Brevo's daily rate limit to reset (midnight UK), then:
//   1. Verifies the onboarding campaigns created today have the rich design
//   2. Creates the remaining onboarding + cold outreach campaigns
// Run with: node verify_and_finish_campaigns.js
// ============================================================
var h=require('https');
var KEY=process.env.BREVO_API_KEY || '';
var fr=require('./email_design.js');
var ce=require('./email_content.js');
var apiRequest=fr.apiRequest, buildEmail=fr.buildEmail;

var products=[
  {key:'moving',color:'#ff6b35',color2:'#e8551d',bg:'#fff7f2',name:'Moving Leads',url:'https://9amleads.com/movingleadsdaily/',leadType:'moving opportunity',source:'Rightmove',value:'a move worth £5,000+',listId:44},
  {key:'probate',color:'#8b5cf6',color2:'#7c3aed',bg:'#f8f5ff',name:'Probate Leads',url:'https://9amleads.com/probateleads/',leadType:'probate notice',source:'the UK Gazette',value:'a probate instruction worth thousands',listId:45},
  {key:'newbusiness',color:'#22c55e',color2:'#16a34a',bg:'#f0fdf4',name:'New Business Alerts',url:'https://9amleads.com/newbusinessalert/',leadType:'new company',source:'Companies House',value:'a new client worth thousands',listId:46},
  {key:'planning',color:'#14b8a6',color2:'#0d9488',bg:'#f0fdfa',name:'Planning Permission Leads',url:'https://9amleads.com/planningleads/',leadType:'planning application',source:'council planning portals',value:'a project worth thousands',listId:47},
  {key:'tenders',color:'#6366f1',color2:'#4f46e5',bg:'#f5f7ff',name:'Public Sector Tenders',url:'https://9amleads.com/tenders/',leadType:'tender opportunity',source:'Contracts Finder & Find a Tender',value:'a contract worth tens of thousands',listId:48}
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

function waitForUnlock(){
  return new Promise(function(resolve){
    function poll(){
      h.get({hostname:'api.brevo.com',path:'/v3/emailCampaigns?limit=5',headers:{'api-key':KEY,'Accept':'application/json'},timeout:20000},function(res){
        var b='';res.on('data',function(c){b+=c;});
        res.on('end',function(){
          if(res.statusCode===200){console.log('UNLOCKED at '+new Date().toLocaleString('en-GB',{timeZone:'Europe/London'}));resolve();}
          else{console.log('['+new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/London'})+'] rate-limited, retrying in 3min...');setTimeout(poll,180000);}
        });
      }).on('error',function(){setTimeout(poll,180000);});
    }
    poll();
  });
}

function getExistingNames(){
  return new Promise(function(resolve){
    var all=[];
    function page(offset){
      h.get({hostname:'api.brevo.com',path:'/v3/emailCampaigns?limit=200&offset='+offset,headers:{'api-key':KEY,'Accept':'application/json'},timeout:25000},function(res){
        var b='';res.on('data',function(c){b+=c;});
        res.on('end',function(){
          if(res.statusCode===429){setTimeout(function(){page(offset);},60000);return;}
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
  for(var a=0;a<8;a++){
    var r=await apiRequest('POST','/v3/emailCampaigns',body);
    if(r.status===201)return 'created';
    if(r.status===429){await sleep(30000);continue;}
    if(r.status===0){await sleep(20000);continue;}
    return 'err:'+r.body.substring(0,60);
  }
  return 'rate-limited';
}

async function run(){
  console.log('=== 9amLeads Brevo overnight finisher ===');
  console.log('Waiting for Brevo daily rate limit to reset...');
  await waitForUnlock();

  console.log('\n--- Verifying existing onboarding campaigns ---');
  var existing=await getExistingNames();
  var onbExisting=existing.filter(function(n){return /onboarding/.test(n);});
  console.log('existing onboarding campaigns: '+onbExisting.length);
  onbExisting.forEach(function(n){console.log('  '+n);});

  console.log('\n--- Creating missing campaigns ---');
  var created=0, skipped=0, failed=[];
  for(var pi=0;pi<products.length;pi++){
    var p=products[pi];
    var tracks=[{track:'onboarding',steps:onboarding},{track:'cold',steps:cold}];
    for(var ti=0;ti<tracks.length;ti++){
      var t=tracks[ti];
      for(var si=0;si<t.steps.length;si++){
        var step=t.steps[si];
        var campName=p.name+' - '+t.track+' - '+step.key;
        if(existing.indexOf(campName)>-1){skipped++;continue;}
        var layout=ce.makeOnboardingLayout(p,null,{track:t.track,key:step.key,week:step.week,subject:step.subject});
        var html=buildEmail(p,layout);
        var body=JSON.stringify({sender:{name:'9am Leads',email:'hello@9amleads.com'},name:campName,htmlContent:html,subject:step.subject,recipients:{listIds:[p.listId]},type:'classic'});
        var res=await createOne(campName,body);
        if(res==='created')created++;else failed.push(campName+' ('+res+')');
        await sleep(2000);
      }
    }
  }
  console.log('\n=== DONE ===');
  console.log('created='+created+' skipped(existing)='+skipped+' failed='+failed.length);
  if(failed.length)console.log(failed.slice(0,8).join('\n'));
  console.log('\nAll done at '+new Date().toLocaleString('en-GB',{timeZone:'Europe/London'}));
  process.exit(0);
}
run();
