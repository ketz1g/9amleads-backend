(function() {
  var skeletonStyle = document.createElement('style');
  skeletonStyle.textContent = '.skeleton{background:linear-gradient(90deg,var(--card) 25%,var(--card-hover) 50%,var(--card) 75%);background-size:200% 100%;animation:skeletonLoad 1.5s infinite;border-radius:6px}@keyframes skeletonLoad{0%{background-position:200% 0}100%{background-position:-200% 0}}';
  document.head.appendChild(skeletonStyle);
  var d = document;

  /* === #6 ROI Calculator === */
  function roiCalculator() {
    var section = d.getElementById('roi-calc');
    if (!section) return;
    var leadsSlider = d.getElementById('roiLeads');
    var convSlider = d.getElementById('roiConv');
    var profitSlider = d.getElementById('roiProfit');
    var leadsVal = d.getElementById('roiLeadsVal');
    var convVal = d.getElementById('roiConvVal');
    var profitVal = d.getElementById('roiProfitVal');
    var monthlyLeads = d.getElementById('roiMonthlyLeads');
    var monthlyWins = d.getElementById('roiMonthlyWins');
    var monthlyRevenue = d.getElementById('roiMonthlyRevenue');
    var annualRevenue = d.getElementById('roiAnnualRevenue');

    function update() {
      var l = parseInt(leadsSlider.value);
      var c = parseInt(convSlider.value) / 100;
      var p = parseInt(profitSlider.value);
      leadsVal.textContent = l;
      convVal.textContent = c * 100 + '%';
      profitVal.textContent = '£' + p;
      var ml = l * 30;
      monthlyLeads.textContent = ml;
      var mw = Math.round(ml * c);
      monthlyWins.textContent = mw;
      var mr = mw * p;
      monthlyRevenue.textContent = '£' + mr.toLocaleString();
      annualRevenue.textContent = '£' + (mr * 12).toLocaleString();
    }
    leadsSlider.addEventListener('input', update);
    convSlider.addEventListener('input', update);
    profitSlider.addEventListener('input', update);
    update();
  }

  /* === #8 Real-time Social Proof === */
  function socialProof() {
    var el = d.getElementById('liveProof');
    if (!el) return;
    var messages = [
      'Someone from Manchester is viewing Moving Leads',
      'Someone from London is viewing Probate Leads',
      'Someone from Birmingham is viewing New Business Alerts',
      'Someone from Leeds is viewing Planning Permission',
      'Someone from Bristol is viewing Public Tenders',
      'Someone from Liverpool just started a free trial'
    ];
    var idx = 0;
    function rotate() {
      el.textContent = messages[idx];
      el.style.opacity = '0';
      setTimeout(function() {
        el.style.opacity = '1';
      }, 100);
      idx = (idx + 1) % messages.length;
    }
    setInterval(function() {
      el.style.opacity = '0';
      setTimeout(rotate, 500);
    }, 5000);
    rotate();
  }

  /* === #18 Cookie Consent Banner === */
  function cookieConsent() {
    if (localStorage.getItem('cookieConsent')) return;
    var banner = d.createElement('div');
    banner.id = 'cookieBanner';
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99997;background:rgba(0,0,0,0.95);backdrop-filter:blur(12px);border-top:1px solid rgba(255,255,255,0.06);padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:13px';
    banner.innerHTML = '<span style="color:var(--text2);line-height:1.5">🍪 We use cookies and similar technologies to improve your experience. By continuing, you agree to our <a href="/terms.html" style="color:var(--primary);text-decoration:underline">Terms</a> &amp; <a href="/privacy.html" style="color:var(--primary);text-decoration:underline">Privacy Policy</a>.</span>' +
      '<button id="cookieAccept" style="white-space:nowrap;padding:9px 22px;background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#fff;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit;flex-shrink:0">Accept</button>';
    d.body.appendChild(banner);
    d.getElementById('cookieAccept').onclick = function() {
      localStorage.setItem('cookieConsent', 'true');
      banner.style.display = 'none';
    };
  }

  /* === #17 Back-to-top Button === */
  function backToTop() {
    var btn = d.createElement('button');
    btn.id = 'backToTop';
    btn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    btn.style.cssText = 'position:fixed;bottom:96px;right:24px;z-index:99996;width:44px;height:44px;border-radius:50%;background:var(--card);border:1px solid var(--border);color:var(--text2);font-size:16px;cursor:pointer;display:none;align-items:center;justify-content:center;transition:.3s;box-shadow:0 2px 12px rgba(0,0,0,0.3)';
    btn.onmouseover = function() { btn.style.borderColor = 'var(--primary)'; btn.style.color = 'var(--primary)'; };
    btn.onmouseout = function() { btn.style.borderColor = ''; btn.style.color = ''; };
    btn.onclick = function() { window.scrollTo({ top: 0, behavior: 'smooth' }); };
    d.body.appendChild(btn);
    window.addEventListener('scroll', function() {
      btn.style.display = window.scrollY > 400 ? 'flex' : 'none';
    });
  }

  /* === #19 Smooth Anchor Scrolling === */
  function smoothScroll() {
    d.querySelectorAll('a[href^="#"]').forEach(function(a) {
      a.addEventListener('click', function(e) {
        var href = this.getAttribute('href');
        if (href === '#') return;
        var target = d.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  /* Init all enhancements */
  d.addEventListener('DOMContentLoaded', function() {
    roiCalculator();
    socialProof();
    cookieConsent();
    backToTop();
    smoothScroll();
  });
})();
