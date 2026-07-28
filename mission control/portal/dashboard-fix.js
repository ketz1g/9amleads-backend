(function(){
  try {
    var s = localStorage.getItem('mld_portal_session');
    if (!s) return;
    var sess = JSON.parse(s);
    var token = sess ? sess.token : null;
    if (!token) return;

    window.scrollToLeads = function() {
      var el = document.getElementById('leads-section');
      if (el) el.scrollIntoView({behavior:'smooth'});
    };
    window.showPage = function(page) {
      if (page === 'settings') { var el = document.getElementById('lead-filters-section'); if (el) el.scrollIntoView({behavior:'smooth'}); }
      else if (page === 'leads') { var el = document.getElementById('leads-section'); if (el) el.scrollIntoView({behavior:'smooth'}); }
      else if (page === 'support') { alert('Contact us at hello@9amleads.com'); }
      else if (page === 'campaigns') { alert('Marketing materials available on paid plans'); }
    };
    window.showPlans = function() {
      var el = document.getElementById('sub-section');
      if (el) el.scrollIntoView({behavior:'smooth'});
    };
    window.exportRange = function(fmt) {
      fetch('/api/leads', {headers:{'Authorization':'Bearer '+token}})
      .then(function(r){return r.json();})
      .then(function(leads){
        if (!Array.isArray(leads) || leads.length === 0) { alert('No leads to export'); return; }
        var csv = 'Address,Type,Price,Bedrooms,Status,Date\n';
        leads.forEach(function(l){
          var d = typeof l.data === 'string' ? JSON.parse(l.data||'{}') : (l.data||{});
          csv += (d.address||'')+','+(d.propertyType||'')+','+(d.price||0)+','+(d.bedrooms||0)+','+(l.status||'')+','+((l.created_at||'').split('T')[0]||'')+'\n';
        });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
        a.download = 'leads.csv';
        a.click();
      }).catch(function(){alert('Could not export');});
    };

    var greetEl = document.getElementById('greeting-name');
    if (greetEl && sess.name) greetEl.textContent = sess.name;

    fetch('/api/leads', {headers:{'Authorization':'Bearer '+token}})
    .then(function(r){return r.json();})
    .then(function(leads){
      if (!Array.isArray(leads)) return;
      var today = new Date().toISOString().split('T')[0];
      var todayLeads = leads.filter(function(l){return (l.created_at||'').startsWith(today);});

      var kpiToday = document.getElementById('kpi-today');
      if (kpiToday) kpiToday.textContent = todayLeads.length;
      var kpiWeek = document.getElementById('kpi-week');
      if (kpiWeek) kpiWeek.textContent = leads.length;
      var kpiMonth = document.getElementById('kpi-month');
      if (kpiMonth) kpiMonth.textContent = leads.length;

      var els = document.querySelectorAll('#delivery-loading');
      for (var ei = 0; ei < els.length; ei++) { if (els[ei]) els[ei].style.display = 'none'; }

      // Render leads in the leads section
      var leadsSection = document.getElementById('leads-section');
      if (leadsSection && todayLeads.length > 0) {
        var lr = '';
        for (var li = 0; li < todayLeads.length; li++) {
          var l = todayLeads[li];
          var d = typeof l.data === 'string' ? JSON.parse(l.data||'{}') : (l.data||{});
          var addr = d.address || d.title || '';
          var price = d.price ? '\u00a3' + Number(d.price).toLocaleString() : '';
          var beds = d.bedrooms ? d.bedrooms + ' bed' : '';
          var ptype = d.propertyType || '';
          var status = d.listingStatus || 'New';
          lr += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px">' +
            '<div style="flex:1"><strong>' + addr + '</strong><br><span style="color:var(--muted2);font-size:10px">' + [beds, ptype, price].filter(Boolean).join(' · ') + '</span></div>' +
            '<span style="padding:2px 8px;border-radius:4px;font-size:9px;font-weight:600;background:rgba(34,197,94,0.1);color:#22c55e">' + status + '</span></div>';
        }
        var container = leadsSection.querySelector('#lead-list-container');
        if (!container) {
          container = document.createElement('div');
          container.id = 'lead-list-container';
          container.style.cssText = 'max-height:300px;overflow-y:auto';
          leadsSection.appendChild(container);
        }
        container.innerHTML = lr;
      }
    }).catch(function(){});
  } catch(e){}
})();
