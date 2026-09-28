var h=require('https');
var fs=require('fs');
var path=require('path');
var KEY=process.env.BREVO_API_KEY || '';
var fr=require('./email_design.js');
var ce=require('./email_content.js');
var apiRequest=fr.apiRequest, buildEmail=fr.buildEmail;
var PROG=path.join(__dirname,'fix27_progress.json');

var broken=[
  'New Business Alerts - cold - offer','New Business Alerts - cold - urgency','New Business Alerts - cold - final',
  'Planning Permission Leads - onboarding - welcome','Planning Permission Leads - onboarding - why9am','Planning Permission Leads - onboarding - convert',
  'Planning Permission Leads - onboarding - sources','Planning Permission Leads - onboarding - exclusive','Planning Permission Leads - onboarding - volume',
  'Planning Permission Leads - onboarding - success','Planning Permission Leads - onboarding - roi','Planning Permission Leads - onboarding - proof',
  'Planning Permission Leads - onboarding - ending','Planning Permission Leads - onboarding - lose','Planning Permission Leads - onboarding - final',
  'Planning Permission Leads - cold - intro','Planning Permission Leads - cold - problem','Planning Permission Leads - cold - solution',
  'Planning Permission Leads - cold - value','Planning Permission Leads - cold - how','Planning Permission Leads - cold - success',
  'Planning Permission Leads - cold - objection','Planning Permission Leads - cold - compare','Planning Permission Leads - cold - proof',
  'Planning Permission Leads - cold - offer','Planning Permission Leads - cold - urgency','Planning Permission Leads - cold - final'
];
var P={
  'New Business Alerts':{color:'#166534',color2:'#0f4524',bg:'#f0fdf4',name:'New Business Alerts',url:'x',leadType:'new company',source:'Companies House',value:'x',listId:46},
  'Planning Permission Leads':{color:'#115e59',color2:'#0b3d3a',bg:'#f0fdfa',name:'Planning Permission Leads',url:'x',leadType:'planning application',source:'council planning portals',value:'x',listId:47}
};
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
function log(msg){fs.appendFileSync(PROG+'.log',new Date().toISOString()+' '+msg+'\n');console.log(msg);}

// Fetch ALL campaigns once and map name -> [ids]
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
            camps.forEach(function(c){all.push({id:c.id,name:c.name});});
            if(camps.length>=100)page(offset+100);else resolve(all);
          }catch(e){resolve(all);}
        });
      }).on('error',function(){setTimeout(function(){page(offset);},60000);});
    }
    page(0);
  });
}
async function updateOne(id, html){
  // Very patient: up to 30 attempts, 60s apart on 429
  for(var a=0;a<30;a++){
    var r=await apiRequest('PUT','/v3/emailCampaigns/'+id,JSON.stringify({htmlContent:html}));
    if(r.status===200||r.status===204)return 'ok';
    if(r.status===429){await sleep(60000);continue;}
    if(r.status===0){await sleep(30000);continue;}
    return 'err:'+r.body.substring(0,40);
  }
  return 'rate-limited-after-30';
}
async function run(){
  log('=== fix_27_bg started ===');
  var progress={done:[]};
  try{progress=JSON.parse(fs.readFileSync(PROG,'utf-8'));}catch(e){}
  var camps=await getAllCampaigns();
  var byName={};
  camps.forEach(function(c){if(!byName[c.name])byName[c.name]=[];byName[c.name].push(c.id);});
  log('campaigns fetched: '+camps.length+', broken names to process: '+broken.length);
  var updated=0;
  for(var i=0;i<broken.length;i++){
    var name=broken[i];
    if(progress.done.indexOf(name)>-1){log('skip (done): '+name);continue;}
    var ids=byName[name]||[];
    if(ids.length===0){log('NOT FOUND: '+name);progress.done.push(name);fs.writeFileSync(PROG,JSON.stringify(progress));continue;}
    var parts=name.split(' - ');
    var prodName=parts[0], track=parts[1], key=parts[2];
    var p=P[prodName];
    var L=ce.makeOnboardingLayout(p,null,{track:track,key:key,week:track==='onboarding'?'W':'E',subject:key});
    var html=buildEmail(p,L);
    var allOk=true;
    for(var m=0;m<ids.length;m++){
      var res=await updateOne(ids[m], html);
      if(res!=='ok'){allOk=false;log('  FAIL '+name+' id '+ids[m]+': '+res);}
    }
    if(allOk){updated+=ids.length;log('['+(i+1)+'/'+broken.length+'] OK '+name+' ('+ids.length+' copies) total updated='+updated);}
    progress.done.push(name);
    fs.writeFileSync(PROG,JSON.stringify(progress));
    await sleep(4000);
  }
  log('=== COMPLETE updated='+updated+' ===');
  process.exit(0);
}
run();
