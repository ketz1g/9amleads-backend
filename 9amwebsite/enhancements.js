(function() {
  var d = document;

  window.toggleMobile = function() {
    var menu = d.getElementById('mobileMenu');
    var overlay = d.getElementById('mobileOverlay');
    var btn = d.getElementById('hamBtn');
    if (menu) menu.classList.toggle('open');
    if (overlay) overlay.classList.toggle('show');
    if (btn) btn.classList.toggle('active');
  };

  var style = d.createElement('style');
  style.textContent = '.skeleton{background:linear-gradient(90deg,#0a0a0a 25%,#141414 50%,#0a0a0a 75%);background-size:200% 100%;animation:skeletonLoad 1.5s infinite;border-radius:6px}@keyframes skeletonLoad{0%{background-position:200% 0}100%{background-position:-200% 0}}';
  d.head.appendChild(style);

  /* ---------------------------------------------------------------- */
  /* Visual effects (progress bar, reveal, counters, aurora, 3D tilt) */
  /* All opt-in via data attributes and safe without JS / reduced motion */
  /* ---------------------------------------------------------------- */
  function effectsStyles() {
    var css = [
      '@keyframes fxFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}',
      '@keyframes fxAurora{0%{transform:translate(0,0) scale(1)}50%{transform:translate(4%,-3%) scale(1.08)}100%{transform:translate(0,0) scale(1)}}',
      '#fxProgress{position:fixed;top:0;left:0;height:3px;width:0;z-index:2147483000;background:linear-gradient(90deg,#0ea5e9,#6366f1,#a855f7);box-shadow:0 0 10px rgba(14,165,233,.55);transition:width .12s linear}',
      '.fx-ready [data-fx]{opacity:0;transform:translateY(20px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}',
      '.fx-ready [data-fx].fx-in{opacity:1;transform:none}',
      '.fx-ready .fx-stagger [data-fx]{transition-delay:calc(var(--fx-i,0) * 70ms)}',
      '.fx-aurora{position:absolute;inset:-25% -12%;z-index:0;pointer-events:none;overflow:hidden}',
      '.fx-aurora i{position:absolute;border-radius:50%;filter:blur(72px);opacity:.5;mix-blend-mode:screen;animation:fxAurora 15s ease-in-out infinite}',
      '.fx-aurora i:nth-child(1){width:520px;height:520px;background:radial-gradient(circle,#0ea5e9,transparent 70%);top:-140px;left:-90px}',
      '.fx-aurora i:nth-child(2){width:460px;height:460px;background:radial-gradient(circle,#6366f1,transparent 70%);bottom:-170px;right:-70px;animation-delay:-5s}',
      '.fx-aurora i:nth-child(3){width:360px;height:360px;background:radial-gradient(circle,#a855f7,transparent 70%);top:28%;left:44%;animation-delay:-9s}',
      '[data-tilt]{transition:transform .25s ease;will-change:transform}',
      '.fx-float{animation:fxFloat 6s ease-in-out infinite}',
      '.fx-icons{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden}',
      '.fx-icon{position:absolute;line-height:1;filter:blur(.4px);animation-name:fxDrift;animation-timing-function:ease-in-out;animation-iteration-count:infinite;will-change:transform}',
      '.fx-icon.fx-spin{animation-name:fxSpin;animation-timing-function:linear}',
      '@keyframes fxDrift{0%{transform:translate3d(0,0,0) rotate(0)}25%{transform:translate3d(16px,-26px,0) rotate(7deg)}50%{transform:translate3d(-12px,-44px,0) rotate(-6deg)}75%{transform:translate3d(-20px,-18px,0) rotate(5deg)}100%{transform:translate3d(0,0,0) rotate(0)}}',
      '@keyframes fxSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}',
      '.fx-marquee{display:flex;gap:44px;width:max-content;animation:fxScroll 34s linear infinite;will-change:transform}',
      '.fx-marquee:hover{animation-play-state:paused}',
      '.fx-marquee span{display:inline-flex;align-items:center;gap:10px;font-size:14px;font-weight:700;white-space:nowrap}',
      '@keyframes fxScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}',
      '.fx-orbit{position:absolute;pointer-events:none;z-index:1}',
      '.fx-orbit-ring{position:absolute;inset:0;margin:auto;border-radius:50%;border:1px dashed rgba(148,163,184,.30);animation-name:fxSpin;animation-timing-function:linear;animation-iteration-count:infinite}',
      '.fx-orbit-dot{position:absolute;left:50%;top:50%;width:9px;height:9px;border-radius:50%;box-shadow:0 0 12px currentColor}',
      '.fx-sparkles{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden}',
      '.fx-sparkle{position:absolute;width:4px;height:4px;border-radius:50%;background:#fff;opacity:0;animation-name:fxTwinkle;animation-timing-function:ease-in-out;animation-iteration-count:infinite}',
      '@keyframes fxTwinkle{0%,100%{opacity:0;transform:scale(.3)}50%{opacity:.85;transform:scale(1)}}',
      '.fx-tilt-inner{transform:translateZ(30px)}',
      '@media (prefers-reduced-motion: reduce){.fx-ready [data-fx]{opacity:1 !important;transform:none !important}.fx-aurora i{animation:none}[data-tilt]{transform:none !important}.fx-float{animation:none}.fx-icon,.fx-marquee,.fx-orbit-ring,.fx-sparkle{animation:none !important}}'
    ].join('');
    var s = d.createElement('style');
    s.textContent = css;
    d.head.appendChild(s);
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function scrollProgress() {
    if (d.getElementById('fxProgress')) return;
    var bar = d.createElement('div');
    bar.id = 'fxProgress';
    d.body.appendChild(bar);
    var ticking = false;
    function update() {
      var h = d.documentElement;
      var max = (h.scrollHeight - h.clientHeight) || 1;
      var pct = Math.max(0, Math.min(100, (h.scrollTop || d.body.scrollTop) / max * 100));
      bar.style.width = pct + '%';
      ticking = false;
    }
    window.addEventListener('scroll', function() {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  function revealOnScroll() {
    if (!('IntersectionObserver' in window) || reducedMotion()) return;
    var selector = '[data-fx], .feat-card';
    var els = Array.prototype.slice.call(d.querySelectorAll(selector));
    if (!els.length) return;
    d.documentElement.classList.add('fx-ready');

    // Stagger children inside any .fx-stagger container.
    Array.prototype.forEach.call(d.querySelectorAll('.fx-stagger'), function(group) {
      var kids = group.querySelectorAll('[data-fx], .feat-card');
      Array.prototype.forEach.call(kids, function(k, i) { k.style.setProperty('--fx-i', i); });
    });

    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);
        el.classList.add('fx-in');
        var done = function() {
          el.removeEventListener('transitionend', done);
          // Drop the opt-in attribute so native hover transforms work again.
          el.removeAttribute('data-fx');
          el.classList.remove('fx-in');
        };
        el.addEventListener('transitionend', done);
        setTimeout(done, 1100);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    els.forEach(function(el) {
      var r = el.getBoundingClientRect();
      var inView = r.top < (window.innerHeight || 800) * 0.9 && r.bottom > 0;
      // Anything already on screen stays put (avoids a flash on load).
      if (inView) { if (el.hasAttribute('data-fx')) el.classList.add('fx-in'); return; }
      if (!el.hasAttribute('data-fx')) el.setAttribute('data-fx', '');
      io.observe(el);
    });
  }

  function animateCounters() {
    var els = Array.prototype.slice.call(d.querySelectorAll('[data-count]'));
    if (!els.length) return;
    function run(el) {
      var target = parseFloat(el.getAttribute('data-count'));
      if (isNaN(target)) return;
      var suffix = el.getAttribute('data-suffix') || '';
      var prefix = el.getAttribute('data-prefix') || '';
      var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
      if (reducedMotion()) { el.textContent = prefix + target.toFixed(dec) + suffix; return; }
      var start = null, dur = 1400;
      function tick(ts) {
        if (start === null) start = ts;
        var p = Math.min(1, (ts - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        var val = target * eased;
        el.textContent = prefix + (dec ? val.toFixed(dec) : Math.round(val)) + suffix;
        if (p < 1) window.requestAnimationFrame(tick);
      }
      window.requestAnimationFrame(tick);
    }
    if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        run(e.target);
      });
    }, { threshold: 0.5 });
    els.forEach(function(el) { io.observe(el); });
  }

  function addAurora() {
    if (reducedMotion()) return;
    Array.prototype.forEach.call(d.querySelectorAll('[data-aurora]'), function(host) {
      if (host.querySelector('.fx-aurora')) return;
      var cs = window.getComputedStyle(host);
      if (cs.position === 'static') host.style.position = 'relative';
      if (cs.overflow === 'visible') host.style.overflow = 'hidden';
      var wrap = d.createElement('span');
      wrap.className = 'fx-aurora';
      wrap.setAttribute('aria-hidden', 'true');
      wrap.innerHTML = '<i></i><i></i><i></i>';
      host.insertBefore(wrap, host.firstChild);
    });
  }

  function cardTilt() {
    if (reducedMotion()) return;
    if (!window.matchMedia || !window.matchMedia('(pointer: fine)').matches) return;
    Array.prototype.forEach.call(d.querySelectorAll('[data-tilt]'), function(el) {
      var max = parseFloat(el.getAttribute('data-tilt')) || 8;
      var raf = null, tx = 0, ty = 0;
      el.style.transformStyle = 'preserve-3d';
      el.addEventListener('mousemove', function(e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        ty = px * max;
        tx = -py * max;
        if (raf) return;
        raf = window.requestAnimationFrame(function() {
          el.style.transform = 'perspective(900px) rotateX(' + tx.toFixed(2) + 'deg) rotateY(' + ty.toFixed(2) + 'deg)';
          raf = null;
        });
      });
      el.addEventListener('mouseleave', function() { el.style.transform = ''; });
    });
  }

  function floatElements() {
    if (reducedMotion()) return;
    Array.prototype.forEach.call(d.querySelectorAll('[data-float]'), function(el) {
      if (el.querySelector('.fx-float')) return;
      if (el.firstElementChild) el.firstElementChild.classList.add('fx-float');
      else el.classList.add('fx-float');
    });
  }

  /* Floating drifting icon field behind a section (opt-in: data-float-icons). */
  function floatingIcons() {
    if (reducedMotion()) return;
    Array.prototype.forEach.call(d.querySelectorAll('[data-float-icons]'), function(host) {
      if (host.querySelector('.fx-icons')) return;
      var cs = window.getComputedStyle(host);
      if (cs.position === 'static') host.style.position = 'relative';
      if (cs.overflow === 'visible') host.style.overflow = 'hidden';
      var list = (host.getAttribute('data-float-icons') || '🏠,📦,⚖️,🏢,📄').split(',')
        .map(function(s) { return s.trim(); }).filter(Boolean);
      if (!list.length) return;
      var wrap = d.createElement('div');
      wrap.className = 'fx-icons';
      wrap.setAttribute('aria-hidden', 'true');
      var count = Math.min(list.length * 2, 12);
      for (var i = 0; i < count; i++) {
        var icon = d.createElement('span');
        var spin = Math.random() < 0.28;
        icon.className = 'fx-icon' + (spin ? ' fx-spin' : '');
        icon.textContent = list[i % list.length];
        icon.style.left = (Math.random() * 90 + 3).toFixed(1) + '%';
        icon.style.top = (Math.random() * 82 + 6).toFixed(1) + '%';
        icon.style.fontSize = (18 + Math.random() * 28).toFixed(0) + 'px';
        icon.style.opacity = (0.07 + Math.random() * 0.13).toFixed(2);
        icon.style.animationDuration = (spin ? 18 + Math.random() * 20 : 11 + Math.random() * 16).toFixed(1) + 's';
        icon.style.animationDelay = (-Math.random() * 14).toFixed(1) + 's';
        wrap.appendChild(icon);
      }
      host.insertBefore(wrap, host.firstChild);
      // Let the icon field drift slightly on scroll too.
      wrap.setAttribute('data-parallax', '0.05');
      // Lift real content above the decoration.
      Array.prototype.forEach.call(host.children, function(c) {
        if (c === wrap) return;
        var cn = ' ' + (c.getAttribute ? (c.getAttribute('class') || '') : '') + ' ';
        if (/ s-grid | s-orb | s-bg | hero-bg | hero-overlay | fx-/.test(cn)) return;
        if (window.getComputedStyle(c).position === 'static') c.style.position = 'relative';
        if (!c.style.zIndex) c.style.zIndex = '2';
      });
    });
  }

  /* Gentle scroll parallax for opt-in elements (data-parallax="0.12"). */
  function parallax() {
    if (reducedMotion()) return;
    var els = Array.prototype.slice.call(d.querySelectorAll('[data-parallax]'));
    if (!els.length) return;
    var ticking = false;
    function update() {
      var vh = window.innerHeight || 800;
      els.forEach(function(el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var off = (r.top + r.height / 2 - vh / 2) / vh;
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.12;
        el.style.transform = 'translate3d(0,' + (-off * 100 * speed).toFixed(1) + 'px,0)';
      });
      ticking = false;
    }
    window.addEventListener('scroll', function() { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* Infinite scrolling strip of icons/labels (opt-in: data-marquee="a,b,c"). */
  function marquee() {
    Array.prototype.forEach.call(d.querySelectorAll('[data-marquee]'), function(host) {
      if (host.querySelector('.fx-marquee')) return;
      var items = (host.getAttribute('data-marquee') || '').split(',')
        .map(function(s) { return s.trim(); }).filter(Boolean);
      if (!items.length) return;
      host.style.overflow = 'hidden';
      var track = d.createElement('div');
      track.className = 'fx-marquee';
      track.setAttribute('aria-hidden', 'true');
      var build = function() {
        items.forEach(function(t) {
          var span = d.createElement('span');
          span.innerHTML = t;
          span.style.color = 'var(--text2,var(--muted,#94a3b8))';
          track.appendChild(span);
        });
      };
      build(); build();
      host.appendChild(track);
    });
  }

  /* Orbiting rings + dots around a hero visual (opt-in: data-orbit="#hex"). */
  function orbit() {
    if (reducedMotion()) return;
    Array.prototype.forEach.call(d.querySelectorAll('[data-orbit]'), function(el) {
      var host = el.parentElement;
      if (!host || host.querySelector('.fx-orbit')) return;
      var cs = window.getComputedStyle(host);
      if (cs.position === 'static') host.style.position = 'relative';
      var color = el.getAttribute('data-orbit') || '#0ea5e9';
      var r = el.getBoundingClientRect();
      var hr = host.getBoundingClientRect();
      var size = Math.max(r.width, r.height) * 1.2 + 20;
      var wrap = d.createElement('div');
      wrap.className = 'fx-orbit';
      wrap.setAttribute('aria-hidden', 'true');
      wrap.style.width = size + 'px';
      wrap.style.height = size + 'px';
      wrap.style.left = (r.left - hr.left + r.width / 2) + 'px';
      wrap.style.top = (r.top - hr.top + r.height / 2) + 'px';
      wrap.style.transform = 'translate(-50%,-50%)';
      [[1, 3, 26], [0.8, 2, 18]].forEach(function(ring, k) {
        var rs = size * ring[0];
        var ringEl = d.createElement('div');
        ringEl.className = 'fx-orbit-ring';
        ringEl.style.width = rs + 'px';
        ringEl.style.height = rs + 'px';
        ringEl.style.animationDuration = ring[2] + 's';
        if (k === 1) ringEl.style.animationDirection = 'reverse';
        for (var j = 0; j < ring[1]; j++) {
          var dot = d.createElement('span');
          dot.className = 'fx-orbit-dot';
          dot.style.color = color;
          dot.style.background = color;
          var ang = (360 / ring[1]) * j;
          dot.style.transform = 'translate(-50%,-50%) rotate(' + ang + 'deg) translateY(-' + (rs / 2) + 'px)';
          ringEl.appendChild(dot);
        }
        wrap.appendChild(ringEl);
      });
      host.appendChild(wrap);
      if (window.getComputedStyle(el).position === 'static') el.style.position = 'relative';
      if (!el.style.zIndex) el.style.zIndex = '2';
    });
  }

  /* Subtle twinkling particle layer (opt-in: data-sparkles). */
  function sparkles() {
    if (reducedMotion()) return;
    Array.prototype.forEach.call(d.querySelectorAll('[data-sparkles]'), function(host) {
      if (host.querySelector('.fx-sparkles')) return;
      var cs = window.getComputedStyle(host);
      if (cs.position === 'static') host.style.position = 'relative';
      if (cs.overflow === 'visible') host.style.overflow = 'hidden';
      var layer = d.createElement('div');
      layer.className = 'fx-sparkles';
      layer.setAttribute('aria-hidden', 'true');
      var colors = ['#ffffff', '#7dd3fc', '#a5b4fc', '#fef08a'];
      for (var i = 0; i < 20; i++) {
        var s = d.createElement('span');
        s.className = 'fx-sparkle';
        s.style.left = (Math.random() * 98 + 1).toFixed(1) + '%';
        s.style.top = (Math.random() * 92 + 4).toFixed(1) + '%';
        var sz = (2 + Math.random() * 3).toFixed(1);
        s.style.width = sz + 'px';
        s.style.height = sz + 'px';
        s.style.background = colors[i % colors.length];
        s.style.animationDuration = (2.5 + Math.random() * 3.5).toFixed(1) + 's';
        s.style.animationDelay = (-Math.random() * 5).toFixed(1) + 's';
        layer.appendChild(s);
      }
      host.insertBefore(layer, host.firstChild);
    });
  }

  /* Video audio: keep the mute state in sync with the native volume slider so
     raising the volume always produces sound (the hero video starts muted for
     autoplay, which otherwise leaves viewers dragging the slider in silence). */
  function videoAudio() {
    var vids = Array.prototype.slice.call(d.querySelectorAll('video'));
    vids.forEach(function(v) {
      // Only pair a video with its OWN unmute button (same container), never
      // with a button that belongs to another video on the page.
      var host = v.parentElement || v;
      var btn = host.querySelector('#hero-unmute, [data-video-unmute]');
      function sync() {
        if (!btn) return;
        btn.innerHTML = v.muted ? '🔊 Unmute' : '🔇 Mute';
        btn.setAttribute('aria-label', v.muted ? 'Unmute video' : 'Mute video');
      }
      var lastVol = v.volume;
      v.addEventListener('volumechange', function() {
        // Only auto-unmute when the viewer actually increases the volume, so the
        // mute button (which leaves volume unchanged) still works both ways.
        var raised = v.volume > lastVol && v.volume > 0;
        lastVol = v.volume;
        if (v.muted && raised) { v.muted = false; }
        sync();
      });
      v.addEventListener('play', sync);
      v.addEventListener('pause', sync);
      sync();
    });
  }

  /* ROI Calculator */
  function calcROI() {
    var section = d.getElementById('roi-calc');
    if (!section) return;
    var leads = d.getElementById('roiLeads');
    var conv = d.getElementById('roiConv');
    var profit = d.getElementById('roiProfit');
    if (!leads || !conv || !profit) return;
    function update() {
      var l = parseInt(leads.value);
      var c = parseInt(conv.value);
      var p = parseInt(profit.value);
      var ml = l * 30;
      var mw = Math.round(ml * c / 100);
      var mr = mw * p;
      d.getElementById('roiMonthlyLeads').textContent = ml;
      d.getElementById('roiMonthlyWins').textContent = mw;
      d.getElementById('roiMonthlyRevenue').textContent = '£' + mr.toLocaleString();
      d.getElementById('roiAnnualRevenue').textContent = '£' + (mr * 12).toLocaleString();
    }
    leads.addEventListener('input', update);
    conv.addEventListener('input', update);
    profit.addEventListener('input', update);
    update();
  }

  /* Social Proof */
  function liveProof() {
    var el = d.getElementById('liveProofText');
    if (!el) return;
    var msgs = [
      'Someone from Manchester is viewing Moving Leads',
      'Someone from London is viewing Probate Leads',
      'Someone from Birmingham is viewing New Business',
      'Someone from Leeds is viewing Planning Permission',
      'Someone from Bristol is viewing Public Tenders',
      'Someone from Liverpool just started a free trial'
    ];
    var idx = 0;
    var banner = d.getElementById('liveProof');
    function rotate() {
      el.textContent = msgs[idx];
      if (banner) banner.style.display = 'flex';
      idx = (idx + 1) % msgs.length;
    }
    setTimeout(rotate, 4000);
    setInterval(function() {
      el.style.opacity = '0';
      setTimeout(function() {
        el.textContent = msgs[idx % msgs.length];
        el.style.opacity = '1';
        idx++;
      }, 300);
    }, 8000);
    setTimeout(rotate, 4000);
  }

  /* Cookie Consent */
  function cookieConsent() {
    // A page may already carry its own consent banner (static markup). Don't
    // inject a second overlapping one.
    if (localStorage.getItem('cookieConsent')) return;
    if (d.getElementById('cookieConsent') || d.getElementById('cookieBanner')) return;
    var banner = d.createElement('div');
    banner.id = 'cookieBanner';
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99997;background:rgba(0,0,0,0.95);backdrop-filter:blur(12px);border-top:1px solid #1a1a1a;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:13px';
    banner.innerHTML = '<span style="color:#999;line-height:1.5">We use cookies to improve your experience. By continuing, you agree to our <a href="/privacy.html" style="color:#0ea5e9;text-decoration:underline">Privacy Policy</a>.</span>' +
      '<button id="cookieAccept" style="white-space:nowrap;padding:9px 22px;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit;flex-shrink:0">Accept</button>';
    d.body.appendChild(banner);
    d.getElementById('cookieAccept').onclick = function() {
      localStorage.setItem('cookieConsent', 'true');
      banner.style.display = 'none';
      if (window.__shiftBottomWidgets) window.__shiftBottomWidgets();
    };
  }

  /* Back to Top */
  function backToTop() {
    var btn = d.createElement('button');
    btn.id = 'backToTop';
    btn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    btn.style.cssText = 'position:fixed;bottom:96px;right:24px;z-index:99996;width:44px;height:44px;border-radius:50%;background:#0a0a0a;border:1px solid #1a1a1a;color:#999;font-size:16px;cursor:pointer;display:none;align-items:center;justify-content:center;transition:.3s;box-shadow:0 2px 12px rgba(0,0,0,0.3)';
    btn.onmouseover = function() { btn.style.borderColor = '#0ea5e9'; btn.style.color = '#0ea5e9'; };
    btn.onmouseout = function() { btn.style.borderColor = ''; btn.style.color = ''; };
    btn.onclick = function() { window.scrollTo({ top: 0, behavior: 'smooth' }); };
    d.body.appendChild(btn);
    window.addEventListener('scroll', function() {
      btn.style.display = window.scrollY > 400 ? 'flex' : 'none';
    });
  }

  d.addEventListener('DOMContentLoaded', function() {
    effectsStyles();
    scrollProgress();
    revealOnScroll();
    animateCounters();
    addAurora();
    cardTilt();
    floatElements();
    floatingIcons();
    parallax();
    marquee();
    orbit();
    sparkles();
    videoAudio();
    calcROI();
    liveProof();
    cookieConsent();
    backToTop();
  });
})();
