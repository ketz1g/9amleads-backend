(function(){
  const data=document.getElementById('demo-data');if(!data)return;
  const products=JSON.parse(data.textContent);
  const state=new Map();
  let current=products.find(p=>p.id===new URLSearchParams(location.search).get('product')) || products[0];
  let selected=0;
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function recordKey(){return current.id+'-'+selected;}
  function render(){
    document.querySelectorAll('[data-demo-product]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.demoProduct===current.id)));
    const records=document.getElementById('demo-records');
    records.innerHTML=[0,1,2].map((_,i)=>`<button type="button" class="demo-record" data-record="${i}" aria-pressed="${selected===i}"><span>Example 0${i+1}</span><strong>${esc(i===0?current.sample.title:i===1?'Another opportunity to review':'A follow-up for your team')}</strong><small>${esc(current.sample.area)}</small></button>`).join('');
    records.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{selected=Number(b.dataset.record);render();}));
    const saved=state.get(recordKey())||{status:'New',note:''};
    document.getElementById('demo-detail').innerHTML=`<p class="eyebrow">${esc(current.name)} · Fictional example 0${selected+1}</p><h2>${esc(selected===0?current.sample.title:selected===1?'Another opportunity to review':'A follow-up for your team')}</h2><p class="demo-area">${esc(current.sample.area)}</p><div class="demo-information"><div><span>What happened</span><p>${esc(current.sample.detail)}</p></div><div><span>Source type</span><p>${esc(current.sample.source)}</p></div><div><span>Your next step</span><p>${esc(current.sample.next)}</p></div></div><div class="demo-edit"><div><label class="field-label" for="demo-status">Opportunity status</label><select class="field" id="demo-status">${['New','Reviewed','Contacted','Quoted','Won','Not a fit'].map(s=>`<option${s===saved.status?' selected':''}>${s}</option>`).join('')}</select></div><div><label class="field-label" for="demo-note">Your follow-up note</label><textarea class="field" id="demo-note" rows="3" placeholder="Try adding a next step…">${esc(saved.note)}</textarea></div><button class="button" id="demo-save" type="button">Save example note <span aria-hidden="true">→</span></button><p id="demo-feedback" role="status"></p></div><div class="feature-note">Real opportunities include the available source information. This is a fictional preview, so there is no live source record or mailing recipient.</div>`;
    document.getElementById('demo-save').addEventListener('click',()=>{
      state.set(recordKey(),{status:document.getElementById('demo-status').value,note:document.getElementById('demo-note').value});
      document.getElementById('demo-feedback').textContent='Saved in this preview. Switch records and come back to see your note.';
    });
  }
  document.querySelectorAll('[data-demo-product]').forEach(b=>b.addEventListener('click',()=>{current=products.find(p=>p.id===b.dataset.demoProduct);selected=0;render();}));
  render();
})();
