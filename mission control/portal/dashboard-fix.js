(function(){
  try {
    var s = localStorage.getItem('mld_portal_session');
    if (!s) { console.log('fix: no session'); return; }
    var sess = JSON.parse(s);
    var token = sess ? sess.token : null;
    if (!token) { console.log('fix: no token'); return; }

    // Define tool functions
    window.scrollToLeads = function() {
      var el = document.getElementById('leads-section');
      if (el) el.scrollIntoView({behavior:'smooth'});
    };
    window.showPage = function(page) {
      if (page === 'settings') { var el = document.getElementById('lead-filters-section'); if (el) el.scrollIntoView({behavior:'smooth'}); }
      else if (page === 'support') { alert('Contact us at hello@9amleads.com'); }
      else if (page === 'campaigns') { alert('Marketing materials available on paid plans'); }
    };
    window.showPlans = function() {
      var el = document.getElementById('sub-section');
      if (el) el.scrollIntoView({behavior:'smooth'});
    };
    window.exportRange = function(fmt) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/leads', true);
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.onload = function() {
        try {
          var leads = JSON.parse(xhr.responseText);
          if (!Array.isArray(leads) || leads.length === 0) { alert('No leads to export'); return; }
          var csv = 'Address,Type,Price,Bedrooms,Status,Date\n';
          leads.forEach(function(l){
            var d = typeof l.data === 'string' ? JSON.parse(l.data||'{}') : (l.data||{});
            csv += (d.address||'')+','+(d.propertyType||'')+','+(d.price||0)+','+(d.bedrooms||0)+','+(l.status||'')+','+((l.created_at||'').split('T')[0]||'')+'\n';
          });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
          a.download = 'leads.csv'; a.click();
        } catch(e) { alert('Export error'); }
      };
      xhr.onerror = function() { alert('Could not export'); };
      xhr.send();
    };

    // Wire tool cards
    var cards = document.querySelectorAll('.tool-card[data-tool]');
    for (var i = 0; i < cards.length; i++) {
      (function(card) {
        var tool = card.getAttribute('data-tool');
        card.onclick = function(e) {
          if (tool === 'scrollToLeads') { scrollToLeads(); }
          else if (tool === 'exportRange') { exportRange('csv'); }
          else if (tool === 'settings') { showPage('settings'); }
          else if (tool === 'campaigns') { showPage('campaigns'); }
          else if (tool === 'support') { showPage('support'); }
          else if (tool === 'upgrade') { showPlans(); }
        };
      })(cards[i]);
    }

    // Update greeting
    var greetEl = document.getElementById('greeting-name');
    if (greetEl && sess.name) greetEl.textContent = sess.name;

    // HIDE ALL loading spinners
    var allLoading = document.querySelectorAll('[class*=\"loading\"], [id*=\"loading\"], [class*=\"Loading\"], [id*=\"Loading\"]');
    for (var li = 0; li < allLoading.length; li++) {
      if (allLoading[li]) allLoading[li].style.display = 'none';
    }

    // Fetch and display leads using XHR (more reliable than fetch)
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/leads', true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.onload = function() {
      try {
        var leads = JSON.parse(xhr.responseText);
        if (!Array.isArray(leads)) return;
        
        var today = new Date().toISOString().split('T')[0];
        var todayLeads = leads.filter(function(l){return (l.created_at||'').startsWith(today);});

        // Update KPIs
        var kpiToday = document.getElementById('kpi-today');
        if (kpiToday) kpiToday.textContent = todayLeads.length;
        var kpiWeek = document.getElementById('kpi-week');
        if (kpiWeek) kpiWeek.textContent = leads.length;
        var kpiMonth = document.getElementById('kpi-month');
        if (kpiMonth) kpiMonth.textContent = leads.length;

        // Clear all loading states
        document.querySelectorAll('#delivery-loading, .loading-indicator, [class*=spinner]').forEach(function(el){
          if (el) el.style.display = 'none';
        });

        // Render leads
        if (todayLeads.length > 0) {
          var leadsSection = document.getElementById('leads-section');
          if (leadsSection) {
            var lr = '';
            for (var li2 = 0; li2 < todayLeads.length; li2++) {
              var l = todayLeads[li2];
              var d = typeof l.data === 'string' ? JSON.parse(l.data||'{}') : (l.data||{});
              lr += '<div style=\"display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px\">' +
                '<div style=\"flex:1\"><strong>' + (d.address||d.title||'Property') + '</strong><br><span style=\"color:var(--muted2);font-size:10px\">' + 
                [(d.bedrooms ? d.bedrooms + ' bed' : ''), (d.propertyType||''), (d.price ? '\u00a3'+Number(d.price).toLocaleString() : '')].filter(Boolean).join(' \u00b7 ') + '</span></div>' +
                '<span style=\"padding:2px 8px;border-radius:4px;font-size:9px;font-weight:600;background:rgba(34,197,94,0.1);color:#22c55e\">' + (d.listingStatus||'New') + '</span></div>';
            }
            var container = document.getElementById('lead-list-container');
            if (!container) {
              container = document.createElement('div');
              container.id = 'lead-list-container';
              leadsSection.appendChild(container);
            }
            container.innerHTML = lr;
          }
        }
      } catch(e) { console.log('fix error: ' + e.message); }
    };
    xhr.onerror = function() { console.log('fix: network error'); };
    xhr.send();
    
  } catch(e) { console.log('fix fatal: ' + e.message); }
})();
