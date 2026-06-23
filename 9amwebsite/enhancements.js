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
    if (localStorage.getItem('cookieConsent')) return;
    var banner = d.createElement('div');
    banner.id = 'cookieBanner';
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99997;background:rgba(0,0,0,0.95);backdrop-filter:blur(12px);border-top:1px solid #1a1a1a;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:13px';
    banner.innerHTML = '<span style="color:#999;line-height:1.5">We use cookies to improve your experience. By continuing, you agree to our <a href="/privacy.html" style="color:#0ea5e9;text-decoration:underline">Privacy Policy</a>.</span>' +
      '<button id="cookieAccept" style="white-space:nowrap;padding:9px 22px;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit;flex-shrink:0">Accept</button>';
    d.body.appendChild(banner);
    d.getElementById('cookieAccept').onclick = function() {
      localStorage.setItem('cookieConsent', 'true');
      banner.style.display = 'none';
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
    calcROI();
    liveProof();
    cookieConsent();
    backToTop();
  });
})();
