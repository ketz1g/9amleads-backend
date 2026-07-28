// Dashboard fixes - loaded externally to bypass main script errors
setTimeout(function(){
  try {
    var s = localStorage.getItem('mld_portal_session');
    if (!s) return;
    var sess = JSON.parse(s);
    var token = sess ? sess.token : null;
    if (!token) return;

    // Update greeting
    var greetEl = document.getElementById('greeting-name');
    if (greetEl && sess.name) greetEl.textContent = sess.name;

    // Fetch leads
    fetch('/api/leads', {headers:{'Authorization':'Bearer '+token}})
    .then(function(r){return r.json();})
    .then(function(leads){
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

      // Hide loading spinners
      var els = document.querySelectorAll('#delivery-loading, [class*=loading]');
      for (var ei = 0; ei < els.length; ei++) { if (els[ei]) els[ei].style.display = 'none'; }

      // Render lead list in the leads section
      var leadSection = document.getElementById('leads-section');
      if (!leadSection) return;
      var leadList = leadSection.querySelector('.lead-list, #lead-list, [class*=lead]');
      if (!leadList) {
        // Create lead list if not present
        var lr = todayLeads.map(function(l, i){
          var data = typeof l.data === 'string' ? JSON.parse(l.data||'{}') : (l.data||{});
          var addr = data.address || data.title || 'Property ' + (i+1);
          var price = data.price ? '£' + (data.price).toLocaleString() : '';
          var beds = data.bedrooms ? data.bedrooms + ' bed' : '';
          var type = data.propertyType || '';
          var status = data.listingStatus || 'SSTC';
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px">' +
            '<div><strong>' + addr + '</strong><br><span style="color:var(--muted2);font-size:10px">' + [beds, type, price].filter(Boolean).join(' · ') + '</span></div>' +
            '<span class="badge badge-green" style="font-size:9px">' + status + '</span></div>';
        }).join('');
        if (leadSection.querySelector('.card')) {
          var card = leadSection.querySelector('.card');
          if (card) {
            var listDiv = document.createElement('div');
            listDiv.style.cssText = 'max-height:300px;overflow-y:auto';
            listDiv.innerHTML = lr || '<div style="text-align:center;padding:14px;color:var(--muted2)">No leads today</div>';
            card.appendChild(listDiv);
          }
        }
      }
    }).catch(function(){});
  } catch(e){}
}, 200);
