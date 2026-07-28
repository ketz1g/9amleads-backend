// Dashboard fixes loaded externally to bypass script 1 errors
setTimeout(function(){
  try {
    // Define tool functions on window
    window.scrollToLeads = function() {
      var el = document.getElementById('leads-section');
      if (el) el.scrollIntoView({behavior:'smooth'});
    };
    window.showPlans = function() {
      var el = document.getElementById('sub-section');
      if (el) el.scrollIntoView({behavior:'smooth'});
    };
    window.exportRange = function(fmt) {
      var s = localStorage.getItem('mld_portal_session');
      if (!s) return;
      var sess = JSON.parse(s);
      fetch('/api/leads', {headers:{'Authorization':'Bearer '+sess.token}})
      .then(function(r){return r.json();})
      .then(function(leads){
        if (!Array.isArray(leads) || leads.length === 0) { alert('No leads to export'); return; }
        var csv = 'Address,Type,Price,Bedrooms,Status,Date\n';
        leads.forEach(function(l){
          csv += (l.title||'')+','+(l.propertyType||'')+','+(l.price||0)+','+(l.bedrooms||0)+','+(l.status||'')+','+((l.created_at||'').split('T')[0]||'')+'\n';
        });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
        a.download = 'leads.csv';
        a.click();
      });
    };
    window.showPage = function(page) {
      if (page === 'settings') { var el = document.getElementById('lead-filters-section'); if (el) el.scrollIntoView({behavior:'smooth'}); }
      else if (page === 'leads') { var el = document.getElementById('leads-section'); if (el) el.scrollIntoView({behavior:'smooth'}); }
      else if (page === 'support') { alert('Contact us at hello@9amleads.com'); }
      else if (page === 'campaigns') { alert('Marketing materials available on paid plans'); }
    };

    // Clean up duplicate tool cards
    var toolGrid = document.querySelector('.tools-grid');
    if (toolGrid) {
      var cards = toolGrid.querySelectorAll('.tool-card');
      var seen = {};
      for (var i = cards.length - 1; i >= 0; i--) {
        var tool = cards[i].getAttribute('data-tool') || '';
        if (seen[tool]) { cards[i].remove(); }
        else { seen[tool] = true; }
      }
    }

    // Update KPIs
    var s = localStorage.getItem('mld_portal_session');
    if (s) {
      var sess = JSON.parse(s);
      var greetEl = document.getElementById('greeting-name');
      if (greetEl && sess.name) greetEl.textContent = sess.name;
      fetch('/api/leads', {headers:{'Authorization':'Bearer '+sess.token}})
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
        var els = document.querySelectorAll('#delivery-loading, [class*=loading]');
        for (var ei = 0; ei < els.length; ei++) { if (els[ei]) els[ei].style.display = 'none'; }
      });
    }
  } catch(e) {}
}, 100);
