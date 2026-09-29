(function () {
  'use strict';
  function init() {
    const form = document.getElementById('signup-form');
    if (!form || !document.querySelector('.refresh-auth-card')) return;
    document.body.classList.add('refresh-portal','refresh-auth');
    const steps = [...form.querySelectorAll('[data-onboarding-step]')];
    if (steps.length !== 3) return;
    const controls = form.querySelector('.signup-step-controls');
    const progress = form.querySelector('.signup-progress');
    const error = document.getElementById('signup-step-error');
    let step = 0;
    function show(index,focus=true) {
      step = index;
      steps.forEach((panel,i) => { panel.hidden = i !== step; });
      progress.querySelectorAll('button').forEach((button,i) => {
        if (i === step) button.setAttribute('aria-current','step'); else button.removeAttribute('aria-current');
        button.classList.toggle('completed', i < step);
      });
      controls.querySelector('.step-back').hidden = step === 0;
      controls.querySelector('.step-next').hidden = step === 2;
      document.getElementById('signup-step-count').textContent = `Step ${step+1} of 3`;
      error.hidden = true;
      if (focus) {
        const title = steps[step].querySelector('h2');
        title.focus({preventScroll:true});
        title.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
      }
    }
    function validate() {
      if (step === 0) {
        for (const input of steps[0].querySelectorAll('input')) {
          input.setCustomValidity('');
          if (input.id === 's-name' && !input.value.trim()) input.setCustomValidity('Please enter your name.');
          if (input.id === 's-password' && input.value.length < 8) input.setCustomValidity('Please use at least 8 characters.');
          if (input.id === 's-phone' && input.value.trim() && !/^[0-9+\s()-]{7,20}$/.test(input.value.trim())) input.setCustomValidity('Please enter a valid phone number or leave this optional field empty.');
          if (!input.checkValidity()) { input.reportValidity(); return false; }
        }
      }
      if (step === 1) {
        const count = form.querySelectorAll('#s-products-container input:checked').length;
        const plan = form.querySelector('#s-plan-container input:checked')?.value || 'free_trial';
        const max = plan === 'free_trial' ? 1 : plan === 'starter' ? 2 : 99;
        if (!count || count > max) {
          error.textContent = !count ? 'Choose a lead type to continue.' : `Your ${plan === 'free_trial' ? 'free trial' : plan} allows ${max} lead ${max===1?'type':'types'}. Adjust your selection or choose another plan.`;
          error.hidden = false;
          return false;
        }
      }
      return true;
    }
    controls.querySelector('.step-next').addEventListener('click',()=>{if(validate())show(step+1);});
    controls.querySelector('.step-back').addEventListener('click',()=>show(Math.max(0,step-1)));
    progress.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{
      const target=Number(button.dataset.goStep);
      if(target<step)show(target);else if(target===step+1&&validate())show(target);
    }));
    steps[0].addEventListener('input',event=>{if(event.target.setCustomValidity)event.target.setCustomValidity('');});
    controls.hidden = false;
    progress.hidden = false;
    show(0,false);

    // Preserve the existing visibility toggle while making it keyboard-accessible.
    document.querySelectorAll('input[type=password]').forEach(function(input){
      const old=input.parentElement.querySelector('span[onclick]');
      if(!old)return;
      const button=document.createElement('button');button.type='button';button.className='password-toggle';button.textContent='Show';button.setAttribute('aria-label','Show password');
      button.addEventListener('click',()=>{input.type=input.type==='password'?'text':'password';button.textContent=input.type==='password'?'Show':'Hide';button.setAttribute('aria-label',input.type==='password'?'Show password':'Hide password');});
      old.replaceWith(button);
    });

    // A pricing CTA starts the free trial. Record the requested future plan without
    // silently choosing a paid checkout instead of the advertised free week.
    const intended = new URLSearchParams(location.search).get('plan');
    const planNames = {starter:'Starter',pro:'Pro',enterprise:'Enterprise'};
    if (planNames[intended]) {
      const note=document.createElement('p');note.className='signup-plan-note';
      note.textContent=`Interested in ${planNames[intended]}? Start with your free trial below. You can upgrade from your dashboard, or select a paid plan if you are ready now.`;
      document.getElementById('s-plan-container').parentElement.prepend(note);
    }
    fetch('/assets/refresh/catalogue.json').then(r=>r.ok?r.json():Promise.reject()).then(function(catalogue){
      function updateLabels(){
        const id=form.querySelector('#s-products-container input:checked')?.value || 'moving';
        const p=catalogue.products.find(p=>p.id===id);if(!p)return;
        const selected=[...form.querySelectorAll('#s-products-container input:checked')];
        catalogue.plans.forEach(function(plan,index){
          const label=document.querySelector(`#plan-${plan.id} .plan-d`);
          if(label)label.textContent=`${p.qualifier}${p.allowances[index]} ${p.short.toLowerCase()} opportunities / working day${selected.length>1?' · review your product allowances':''}`;
        });
        const trial=document.querySelector('#plan-free_trial .plan-d');
        if(trial)trial.textContent=`${p.qualifier}${p.trial} ${p.short.toLowerCase()} ${p.trial===1?'opportunity':'opportunities'} / working day · 7 days · one lead type`;
      }
      form.querySelectorAll('#s-products-container input').forEach(input=>input.addEventListener('change',updateLabels));
      updateLabels();
    }).catch(function(){});
    // Make errors announced without changing the backend validation or submission.
    ['signup-error','login-error'].forEach(id=>{const el=document.getElementById(id);if(el)el.setAttribute('role','alert');});
    document.querySelectorAll('#login-form .form-group').forEach(group=>{
      const label=group.querySelector('label'),input=group.querySelector('input');
      if(label&&input)label.htmlFor=input.id;
      if(input)input.autocomplete=input.type==='password'?'current-password':'email';
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
