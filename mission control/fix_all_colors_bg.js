// ============================================================
// 9amLeads - Update ALL campaigns to dark high-contrast colors
// Rebuilds every campaign whose HTML still uses OLD light gradient
// colors, replacing with the dark versions. Runs in background,
// patient with Brevo's write rate limit. Logs to fixcolors.log.
// Run: node fix_all_colors_bg.js
// ============================================================
var h=require('https');
var fs=require('fs');
var path=require('path');
var KEY=process.env.BREVO_API_KEY || '';
var fr=require('./email_design.js');
var ce=require('./email_content.js');
var apiRequest=fr.apiRequest, buildEmail=fr.buildEmail;
var PROG=path.join(__dirname,'fixcolors_progress.json');

var products=[
  {key:'moving',color:'#bf360c',color2:'#8f2700',bg:'#fff7f2',name:'Moving Leads',url:'x',leadType:'moving opportunity',source:'Rightmove',value:'x',listId:44},
  {key:'probate',color:'#5b21b6',color2:'#3b1364',bg:'#f8f5ff',name:'Probate Leads',url:'x',leadType:'probate notice',source:'the UK Gazette',value:'x',listId:45},
  {key:'newbusiness',color:'#166534',color2:'#0f4524',bg:'#f0fdf4',name:'New Business Alerts',url:'x',leadType:'new company',source:'Companies House',value:'x',listId:46},
  {key:'planning',color:'#115e59',color2:'#0b3d3a',bg:'#f0fdfa',name:'Planning Permission Leads',url:'x',leadType:'planning application',source:'council planning portals',value:'x',listId:47},
  {key:'tenders',color:'#3730a3',color2:'#232080',bg:'#f5f7ff',name:'Public Sector Tenders',url:'x',leadType:'tender opportunity',source:'Contracts Finder & Find a Tender',value:'x',listId:48}
];
var onboarding=['welcome','why9am','convert','sources','exclusive','volume','success','roi','proof','ending','lose','final'].map(function(k){return {key:k,week:'Week',subject:k};});
var cold=['intro','problem','solution','value','how','success','objection','compare','proof','offer','urgency','final'].map(function(k){return {key:k,week:'Email',subject:k};});

function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
function log(msg){try{fs.appendFileSync(PROG+'.log',new Date().toISOString()+' '+msg+'\n');}catch(e){}console.log(msg);}
function getAllCampaigns(){
  return new Promise(function(resolve){
    var all=[];
    function page(offset){
      h.get({hostname:'api.brevo.com',path:'/v3/emailCampaigns?limit=100&offset='+offset,headers:{'api-key':KEY,'Accept':'application/json'},timeout:30000},function(res){
        var b='';res.on('data',function(c){b+=c;});
        res.on('end',function(){
          if(res.statusCode===429){setTimeout(function(){page(offset);},60000);return;}
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
  for(var a=0;a<30;a++){
    var r=await apiRequest('PUT','/v3/emailCampaigns/'+id,JSON.stringify({htmlContent:html}));
    if(r.status===200||r.status===204)return 'ok';
    if(r.status===429){await sleep(60000);continue;}
    if(r.status===0){await sleep(30000);continue;}
    return 'err:'+r.body.substring(0,40);
  }
  return 'rate-limited';
}
async function run(){
  log('=== fix_all_colors_bg started ===');
  var progress={done:[]};
  try{progress=JSON.parse(fs.readFileSync(PROG,'utf-8'));}catch(e){}
  var camps=await getAllCampaigns();
  log('campaigns fetched: '+camps.length);
  // Build desired HTML by name
  var desired={};
  var buildErrors=[];
  products.forEach(function(p){
    [['onboarding',onboarding],['cold',cold]].forEach(function(track){
      track[1].forEach(function(step){
        var name=p.name+' - '+track[0]+' - '+step.key;
        try{
          var L=ce.makeOnboardingLayout(p,null,{track:track[0],key:step.key,week:track[0]==='onboarding'?'W':'E',subject:step.subject});
          desired[name]=buildEmail(p,L);
        }catch(e){buildErrors.push(name+': '+e.message);}
      });
    });
  });
  log('desired built: '+Object.keys(desired).length+' errors: '+buildErrors.length);
  if(buildErrors.length)log('  '+buildErrors.slice(0,5).join('\n  '));
  // Find campaigns with OLD light colors that match a desired name
  var oldLight=['#ff6b35','#8b5cf6','#22c55e','#14b8a6','#6366f1'];
  var toFix=camps.filter(function(c){
    if(!desired[c.name])return false;
    if(progress.done.indexOf(c.id)>-1)return false;
    return oldLight.some(function(o){return c.html.indexOf(o)>-1;});
  });
  log('campaigns with OLD light colors to fix: '+toFix.length);
  var updated=0;
  for(var i=0;i<toFix.length;i++){
    var c=toFix[i];
    var res=await updateOne(c.id, desired[c.name]);
    if(res==='ok'){updated++;progress.done.push(c.id);fs.writeFileSync(PROG,JSON.stringify(progress));}
    else log('FAIL '+c.name+' id '+c.id+': '+res);
    if((i+1)%10===0)log('progress '+(i+1)+'/'+toFix.length+' updated='+updated);
    await sleep(3000);
  }
  log('=== COMPLETE updated='+updated+' of '+toFix.length+' ===');
  process.exit(0);
}
run();
