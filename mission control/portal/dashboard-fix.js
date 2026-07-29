// Dashboard Fix - standalone, no conflicts
(function(){
  var s = localStorage.getItem('mld_portal_session');
  if (!s) return;
  var sess = JSON.parse(s);
  var token = sess ? sess.token : null;
  if (!token) return;

  // Hide loading
  var ds = document.getElementById('delivery-status');
  if (ds) ds.textContent = '';
  var el = document.getElementById('kpi-loading');
  if (el) el.style.display = 'none';

  // Fetch leads
  var x = new XMLHttpRequest();
  x.open('GET', '/api/leads', true);
  x.setRequestHeader('Authorization', 'Bearer ' + token);
  x.onload = function() {
    try {
      var leads = JSON.parse(x.responseText);
      if (!Array.isArray(leads)) return;
      var today = new Date().toISOString().split('T')[0];
      var tl = leads.filter(function(l){return (l.created_at||'').startsWith(today);});
      
      document.getElementById('kpi-today').textContent = tl.length;
      document.getElementById('kpi-week').textContent = leads.length;
      document.getElementById('kpi-month').textContent = leads.length;
      
      if (tl.length > 0) {
        var section = document.getElementById('leads-section');
        if (section) {
          var c = document.getElementById('lead-list');
          if (!c) { c = document.createElement('div'); c.id = 'lead-list'; section.appendChild(c); }
          c.innerHTML = '<div class="card-title"><i class="fas fa-list" style="color:var(--accent)"></i> Today\'s Leads</div>';
          tl.forEach(function(l) {
            var d = typeof l.data === 'string' ? JSON.parse(l.data||'{}') : (l.data||{});
            c.innerHTML += '<div style="display:flex;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px"><div><strong>' + (d.address||d.title||'Property') + '</strong><br><span style="color:var(--muted2);font-size:10px">' + [(d.bedrooms ? d.bedrooms+' bed' : ''), d.propertyType||'', d.price ? '\u00a3'+Number(d.price).toLocaleString() : ''].filter(Boolean).join(' \u00b7 ') + '</span></div><span style="background:rgba(34,197,94,0.1);color:#22c55e;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700">' + (d.listingStatus||'New') + '</span></div>';
          });
        }
      }
    } catch(e) {}
  };
  x.send();
})();
