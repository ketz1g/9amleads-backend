/* 9amLeads portal visual polish.
 * Soft aurora, drifting icons, sparkles and reveal/KPI-pop for dashboard-type
 * pages. Self-contained (no external deps) and fully disabled under
 * prefers-reduced-motion. Safe to include on any page: it no-ops if there is
 * nothing to decorate. */
(function () {
  var d = document;
  if (d.getElementById('dfx-style')) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var st = d.createElement('style');
  st.id = 'dfx-style';
  st.textContent = [
    '.dfx-aurora{position:absolute;inset:-30% -10%;pointer-events:none;overflow:hidden;z-index:0;border-radius:16px}',
    '.dfx-aurora i{position:absolute;border-radius:50%;filter:blur(60px);opacity:.3;animation:dfxAur 16s ease-in-out infinite}',
    '.dfx-aurora i:nth-child(1){width:320px;height:320px;background:radial-gradient(circle,#93c5fd,transparent 70%);top:-90px;left:-60px}',
    '.dfx-aurora i:nth-child(2){width:280px;height:280px;background:radial-gradient(circle,#c4b5fd,transparent 70%);bottom:-110px;right:-40px;animation-delay:-6s}',
    '@keyframes dfxAur{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(3%,-3%) scale(1.08)}}',
    '.dfx-icons{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}',
    '.dfx-icon{position:absolute;line-height:1;animation-name:dfxDrift;animation-timing-function:ease-in-out;animation-iteration-count:infinite;filter:blur(.3px)}',
    '@keyframes dfxDrift{0%,100%{transform:translate3d(0,0,0) rotate(0)}50%{transform:translate3d(10px,-20px,0) rotate(6deg)}}',
    '.dfx-sparkles{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}',
    '.dfx-sparkle{position:absolute;width:4px;height:4px;border-radius:50%;background:#60a5fa;opacity:0;animation-name:dfxTwinkle;animation-timing-function:ease-in-out;animation-iteration-count:infinite}',
    '@keyframes dfxTwinkle{0%,100%{opacity:0;transform:scale(.3)}50%{opacity:.75;transform:scale(1)}}',
    '.dfx-reveal{opacity:0;transform:translateY(14px);transition:opacity .6s ease,transform .6s ease}',
    '.dfx-reveal.dfx-in{opacity:1;transform:none}',
    '.dfx-pop{animation:dfxPop .5s ease}',
    '@keyframes dfxPop{0%{transform:scale(.7);opacity:.4}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}',
    '@media (prefers-reduced-motion: reduce){.dfx-icon,.dfx-sparkle,.dfx-aurora i{animation:none}.dfx-reveal{opacity:1;transform:none}}'
  ].join('');
  d.head.appendChild(st);

  function layer(host, cls) {
    var el = d.createElement('div');
    el.className = cls;
    el.setAttribute('aria-hidden', 'true');
    host.insertBefore(el, host.firstChild);
    return el;
  }

  function findHost() {
    return d.querySelector('[data-dfx-host]') || d.querySelector('.hero') || d.querySelector('.page-header');
  }

  function decorate() {
    var hero = findHost();
    if (!hero || hero.dataset.dfx) return;
    hero.dataset.dfx = '1';
    if (window.getComputedStyle(hero).position === 'static') hero.style.position = 'relative';
    hero.style.overflow = 'hidden';
    if (!reduce) {
      var aur = layer(hero, 'dfx-aurora');
      aur.innerHTML = '<i></i><i></i>';
      var icons = ['📊', '📈', '📬', '🗺️', '⚡', '✅'];
      var ic = layer(hero, 'dfx-icons');
      for (var i = 0; i < 8; i++) {
        var s = d.createElement('span');
        s.className = 'dfx-icon';
        s.textContent = icons[i % icons.length];
        s.style.left = (Math.random() * 90 + 3).toFixed(1) + '%';
        s.style.top = (Math.random() * 70 + 15).toFixed(1) + '%';
        s.style.fontSize = (16 + Math.random() * 22).toFixed(0) + 'px';
        s.style.opacity = (0.06 + Math.random() * 0.10).toFixed(2);
        s.style.animationDuration = (10 + Math.random() * 12).toFixed(1) + 's';
        s.style.animationDelay = (-Math.random() * 10).toFixed(1) + 's';
        ic.appendChild(s);
      }
      var sp = layer(hero, 'dfx-sparkles');
      for (var j = 0; j < 14; j++) {
        var k = d.createElement('span');
        k.className = 'dfx-sparkle';
        k.style.left = (Math.random() * 98).toFixed(1) + '%';
        k.style.top = (Math.random() * 90 + 5).toFixed(1) + '%';
        k.style.animationDuration = (2.5 + Math.random() * 3).toFixed(1) + 's';
        k.style.animationDelay = (-Math.random() * 5).toFixed(1) + 's';
        sp.appendChild(k);
      }
    }
    Array.prototype.forEach.call(hero.children, function (c) {
      if (/dfx-/.test(c.className || '')) return;
      if (window.getComputedStyle(c).position === 'static') c.style.position = 'relative';
      if (!c.style.zIndex) c.style.zIndex = '1';
    });
  }

  function reveal() {
    if (reduce || !('IntersectionObserver' in window)) return;
    var els = d.querySelectorAll('.container .card');
    if (!els.length) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('dfx-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    Array.prototype.forEach.call(els, function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < (window.innerHeight || 800) * 0.95) return;
      el.classList.add('dfx-reveal');
      io.observe(el);
    });
  }

  function kpiPop() {
    if (reduce) return;
    var ids = ['kpi-today', 'res-contacted', 'res-quoted', 'res-won', 'res-revenue', 'res-conv', 'res-roi'];
    ids.forEach(function (id) {
      var el = d.getElementById(id);
      if (!el || el.dataset.dfxpop) return;
      el.dataset.dfxpop = '1';
      var mo = new MutationObserver(function () {
        el.classList.remove('dfx-pop');
        void el.offsetWidth;
        el.classList.add('dfx-pop');
      });
      mo.observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  function run() { decorate(); reveal(); kpiPop(); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', run);
  else run();
})();
