// 9amLeads in-dashboard assistant widget. Drop on any portal page with:
//   <script src="/portal/assistant.js" defer></script>
// Shows a floating "Ask a question" button that answers questions about 9amLeads.
(function () {
  if (window.__a9AssistantLoaded) return;
  window.__a9AssistantLoaded = true;

  var OPEN = false, BUSY = false;
  var SUGGEST = [
    'How do I get more leads?',
    'How does Print & Post work?',
    'How fresh are the leads?',
    'What does it cost?',
    'How do I cancel?'
  ];

  function token() {
    try { var s = JSON.parse(localStorage.getItem('mld_portal_session') || '{}'); return s && s.token; } catch (e) { return null; }
  }
  function el(tag, css, html) { var d = document.createElement(tag); if (css) d.style.cssText = css; if (html != null) d.innerHTML = html; return d; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var css = ''
    + '#a9-btn{position:fixed;right:20px;bottom:20px;z-index:9998;display:inline-flex;align-items:center;gap:9px;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;border:none;border-radius:50px;padding:14px 20px;font-family:Outfit,Inter,sans-serif;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 12px 30px rgba(14,165,233,.45)}'
    + '#a9-btn:hover{transform:translateY(-1px)}'
    + '#a9-panel{position:fixed;right:20px;bottom:20px;z-index:9999;width:380px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 40px);background:#0f1220;border:1px solid #1a1e32;border-radius:18px;display:none;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.55);font-family:Inter,sans-serif}'
    + '#a9-panel.a9-open{display:flex}'
    + '.a9-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;background:linear-gradient(135deg,#111527,#0f1220);border-bottom:1px solid #1a1e32;color:#e8edf5}'
    + '.a9-head b{font-family:Outfit,sans-serif;font-size:15px}'
    + '.a9-head small{color:#6b7280;font-size:11px;display:block}'
    + '.a9-x{background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;line-height:1}'
    + '.a9-body{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px}'
    + '.a9-msg{max-width:88%;padding:10px 13px;border-radius:12px;font-size:13px;line-height:1.6;white-space:pre-wrap}'
    + '.a9-bot{background:#161b2e;border:1px solid #1f2540;color:#e8edf5;align-self:flex-start}'
    + '.a9-me{background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;align-self:flex-end}'
    + '.a9-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:2px}'
    + '.a9-chip{background:#0b0d18;border:1px solid #1f2540;color:#a0a8c0;padding:7px 12px;border-radius:99px;font-size:12px;cursor:pointer;font-family:inherit}'
    + '.a9-chip:hover{border-color:#0ea5e9;color:#e8edf5}'
    + '.a9-foot{padding:12px 14px;border-top:1px solid #1a1e32;display:flex;gap:8px;background:#0b0d18}'
    + '.a9-in{flex:1;background:#0f1220;border:1px solid #1f2540;border-radius:10px;color:#e8edf5;padding:11px 13px;font-size:13px;outline:none;font-family:inherit}'
    + '.a9-in:focus{border-color:#0ea5e9}'
    + '.a9-send{background:#0ea5e9;border:none;color:#fff;border-radius:10px;padding:0 16px;font-size:15px;cursor:pointer}'
    + '.a9-send:disabled{opacity:.5;cursor:default}'
    + '.a9-typing{color:#6b7280;font-size:12px;align-self:flex-start;font-style:italic}';
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  var btn = el('button', null, '💬 Ask a question'); btn.id = 'a9-btn';

  var panel = el('div'); panel.id = 'a9-panel';
  panel.innerHTML = ''
    + '<div class="a9-head"><div><b>9amLeads Assistant</b><small>Ask me anything about your account</small></div><button class="a9-x" aria-label="Close">✕</button></div>'
    + '<div class="a9-body" id="a9-body"></div>'
    + '<div class="a9-foot"><input class="a9-in" id="a9-in" placeholder="Type your question..." autocomplete="off"><button class="a9-send" id="a9-send" aria-label="Send">➤</button></div>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  var body = panel.querySelector('#a9-body');
  var input = panel.querySelector('#a9-in');
  var sendBtn = panel.querySelector('#a9-send');

  function addMsg(text, who) {
    var m = el('div', null, esc(text)); m.className = 'a9-msg ' + (who === 'me' ? 'a9-me' : 'a9-bot');
    body.appendChild(m); body.scrollTop = body.scrollHeight; return m;
  }
  function addChips() {
    var wrap = el('div'); wrap.className = 'a9-chips';
    SUGGEST.forEach(function (q) {
      var c = el('button', null, esc(q)); c.className = 'a9-chip';
      c.onclick = function () { input.value = q; send(); };
      wrap.appendChild(c);
    });
    body.appendChild(wrap); body.scrollTop = body.scrollHeight;
  }
  var greeted = false;
  function open() {
    OPEN = true; panel.classList.add('a9-open'); btn.style.display = 'none';
    if (!greeted) { greeted = true; addMsg('Hi 👋 I\'m the 9amLeads assistant. Ask me anything about your leads, Print & Post, Auto Send, billing or your account.'); addChips(); }
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 50);
  }
  function close() { OPEN = false; panel.classList.remove('a9-open'); btn.style.display = 'inline-flex'; }

  function send() {
    if (BUSY) return;
    var q = (input.value || '').trim();
    if (!q) return;
    input.value = '';
    addMsg(q, 'me');
    var chips = body.querySelector('.a9-chips'); if (chips) chips.remove();
    var typing = el('div', null, 'Thinking...'); typing.className = 'a9-typing'; body.appendChild(typing); body.scrollTop = body.scrollHeight;
    BUSY = true; sendBtn.disabled = true;

    var x = new XMLHttpRequest();
    x.open('POST', '/api/assistant/ask', true);
    x.setRequestHeader('Content-Type', 'application/json');
    var t = token(); if (t) x.setRequestHeader('Authorization', 'Bearer ' + t);
    x.onload = function () {
      try { typing.remove(); } catch (e) {}
      var d = {}; try { d = JSON.parse(x.responseText); } catch (e) {}
      if (d && d.answer) addMsg(d.answer, 'bot');
      else addMsg('Sorry, I couldn\'t answer that just now. Please email hello@9amleads.com and we\'ll help.', 'bot');
      BUSY = false; sendBtn.disabled = false; try { input.focus(); } catch (e) {}
    };
    x.onerror = function () {
      try { typing.remove(); } catch (e) {}
      addMsg('Connection problem - please try again, or email hello@9amleads.com.', 'bot');
      BUSY = false; sendBtn.disabled = false;
    };
    x.send(JSON.stringify({ question: q, page: location.pathname }));
  }

  btn.onclick = open;
  window.a9Open = open;
  panel.querySelector('.a9-x').onclick = close;
  sendBtn.onclick = send;
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
})();
