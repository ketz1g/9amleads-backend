(function () {
  'use strict';
  const menu = document.querySelector('.menu-toggle');
  const navigation = document.getElementById('site-navigation');
  function closeMenu() {
    if (!menu || !navigation) return;
    navigation.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', 'Open navigation');
  }
  if (menu && navigation) {
    menu.addEventListener('click', function () {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      navigation.classList.toggle('open', open);
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); }
    });
    document.addEventListener('click', function (event) {
      if (!event.target.closest('.site-header')) closeMenu();
    });
    navigation.addEventListener('click', function (event) { if (event.target.closest('a')) closeMenu(); });
    window.matchMedia('(min-width: 901px)').addEventListener('change', closeMenu);
  }

  document.querySelectorAll('[data-sample]').forEach(function (button) {
    button.addEventListener('click', function () {
      const id = button.dataset.sample;
      document.querySelectorAll('[data-sample]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      document.querySelectorAll('[data-sample-panel]').forEach(panel => { panel.hidden = panel.dataset.samplePanel !== id; });
      track('sample_lead_viewed', { product: id });
    });
  });

  const tradeSearch = document.getElementById('trade-search');
  if (tradeSearch) {
    const cards = [...document.querySelectorAll('[data-trade]')];
    function filterTrades() {
      const words = tradeSearch.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      let count = 0;
      cards.forEach(function (card) {
        card.hidden = !words.every(word => card.dataset.trade.toLowerCase().includes(word));
        if (!card.hidden) count++;
      });
      document.getElementById('trade-count').textContent = `${count} ${count === 1 ? 'match' : 'matches'}${words.length ? ' for your search' : ' across five opportunity types'}`;
      document.getElementById('trade-empty').hidden = count > 0;
    }
    tradeSearch.addEventListener('input', filterTrades);
    filterTrades();
  }

  const priceButtons = [...document.querySelectorAll('[data-price-product]')];
  if (priceButtons.length) {
    fetch('/assets/refresh/catalogue.json').then(function (response) {
      if (!response.ok) throw new Error('Catalogue unavailable');
      return response.json();
    }).then(function (catalogue) {
      function selectProduct(id, updateUrl) {
        const product = catalogue.products.find(p => p.id === id) || catalogue.products[0];
        priceButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.priceProduct === product.id)));
        document.querySelectorAll('[data-allowance]').forEach(function (label) {
          const count = product.allowances[Number(label.dataset.allowance)];
          label.textContent = `${product.qualifier}${count} ${product.id === 'tenders' ? 'tenders' : 'opportunities'} / working day`;
        });
        document.querySelectorAll('#pricing-plans .plan-card .button').forEach(function (link, index) {
          link.href = '/portal/?' + new URLSearchParams({ product: product.id, plan: catalogue.plans[index].id }) + '#signup';
        });
        document.getElementById('pricing-trial').textContent = `${product.short} trial: ${product.qualifier.toLowerCase()}${product.trial} ${product.trial === 1 ? 'opportunity' : 'opportunities'} per working day during your 7-day trial.`;
        if (updateUrl) { const url = new URL(location.href); url.searchParams.set('product', product.id); history.replaceState(null, '', url); }
      }
      priceButtons.forEach(b => b.addEventListener('click', () => selectProduct(b.dataset.priceProduct, true)));
      selectProduct(new URLSearchParams(location.search).get('product'), false);
    }).catch(function () {
      // Static plan cards and the full comparison remain usable without the feed.
      const note = document.getElementById('pricing-trial');
      if (note) note.textContent = 'Moving allowances shown above. See the comparison below for every lead type.';
      priceButtons.forEach(b => { b.disabled = true; });
    });
  }

  const contactForm = document.getElementById('refresh-contact');
  if (contactForm) contactForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!contactForm.reportValidity()) return;
    const button = contactForm.querySelector('[type=submit]');
    const result = document.getElementById('contact-result');
    button.disabled = true;
    result.hidden = false;
    result.textContent = 'Sending your message…';
    try {
      const response = await fetch('/api/contact', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.fromEntries(new FormData(contactForm))) });
      if (!response.ok) throw new Error('Message not accepted');
      result.textContent = 'Thank you. Your message has been sent. We’ll reply within one business day.';
      contactForm.reset();
    } catch (_) {
      result.textContent = 'Your message could not be sent. Please try again or email hello@9amleads.com. Your message is still here.';
    } finally { button.disabled = false; }
  });

  // Reference pages keep their existing content; accordions get shared keyboard
  // semantics and can also work when a page has no original toggle function.
  document.querySelectorAll('.legacy-content .faq-q').forEach(function (button, index) {
    const answer = button.parentElement.querySelector('.faq-a');
    if (!answer) return;
    answer.id = answer.id || `reference-answer-${index}`;
    button.setAttribute('aria-controls', answer.id);
    button.setAttribute('aria-expanded', String(button.parentElement.classList.contains('open')));
    button.removeAttribute('onclick');
    button.addEventListener('click', function () {
      const open = button.parentElement.classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
    });
  });

  const affiliatePack = document.getElementById('affiliate-pack-form');
  if (affiliatePack) affiliatePack.addEventListener('submit', async function(event) {
    event.preventDefault();
    if (!affiliatePack.reportValidity()) return;
    const button=affiliatePack.querySelector('button'),result=affiliatePack.querySelector('[role=status]');
    button.disabled=true;result.hidden=false;result.textContent='Requesting your pack…';
    try {
      const response=await fetch('/api/affiliate-prospect/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('affiliate-pack-email').value.trim(),source:'affiliates_page'})});
      const payload=await response.json();
      if(!response.ok || payload.error || payload.success===false)throw new Error('Request not accepted');
      result.textContent='Thank you. Your affiliate pack has been requested. Check your inbox for the programme information.';
      affiliatePack.reset();
    } catch (_) { result.textContent='We could not request the pack. Please try again or email hello@9amleads.com.'; }
    finally {button.disabled=false;}
  });
  const healthRetry=document.getElementById('health-retry');
  if(healthRetry){
    async function checkHealth(){
      healthRetry.disabled=true;
      const title=document.getElementById('health-title'),description=document.getElementById('health-description');
      title.textContent='Checking the connection…';
      try{
        const response=await fetch('/api/health',{cache:'no-store',signal:AbortSignal.timeout(15000)});
        const data=await response.json();
        if(!response.ok || data.status!=='running')throw new Error('Unconfirmed response');
        title.textContent='The platform API is responding.';
        description.textContent='We received a successful response from the public health endpoint.';
      }catch(_){title.textContent='We could not confirm the connection.';description.textContent='The check did not receive a confirmed healthy response. Try again in a moment or contact support if you are having trouble.';}
      document.getElementById('health-checked').textContent='Last checked: '+new Date().toLocaleString('en-GB',{timeZone:'Europe/London'})+' UK time';
      healthRetry.disabled=false;
    }
    healthRetry.addEventListener('click',checkHealth);checkHealth();
  }

  // Reuse the site's existing anonymous event endpoint without blocking a link.
  function track(event, props) {
    try {
      let uid = sessionStorage.getItem('9am_refresh_visit');
      if (!uid) { uid = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2,9); sessionStorage.setItem('9am_refresh_visit', uid); }
      fetch('/api/analytics/event', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({event,uid,props}),keepalive:true }).catch(function () {});
    } catch (_) {}
  }
  document.querySelectorAll('a[href*="#signup"]').forEach(function (link) {
    link.addEventListener('click', () => track('trial_cta_clicked', { placement:location.pathname }));
  });

  // Progressive depth: content is fully visible without JavaScript; this only
  // adds a gentle reveal as elements enter the viewport.
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const targets = document.querySelectorAll('.section-heading,[class$="-card"],.mail-art,.page-hero .split>*,.closing-inner>*,.product-tabs,.integration-band');
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin:'0px 0px -6% 0px', threshold:0.06 });
    targets.forEach(function (element, index) {
      if (element.classList.contains('is-visible')) return;
      element.classList.add('reveal');
      element.style.transitionDelay = Math.min(index % 4, 3) * 70 + 'ms';
      observer.observe(element);
    });
  }
})();
