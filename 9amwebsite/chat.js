(function() {
  var d = document;
  var chatHTML = '<div id="chatWidget" style="display:none">' +
    '<div id="chatBubble" style="position:fixed;bottom:24px;right:24px;z-index:99999;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 20px rgba(14,165,233,0.4);transition:.3s;font-size:26px"' +
    ' onmouseover="this.style.transform=\'scale(1.1)\'" onmouseout="this.style.transform=\'scale(1)\'">' +
    '<i class="fas fa-comment-dots"></i>' +
    '<div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid rgba(14,165,233,0.3);animation:chatPulse 2s infinite"></div>' +
    '</div>' +
    '<div id="chatPanel" style="position:fixed;bottom:96px;right:24px;z-index:99998;width:360px;max-width:calc(100vw - 48px);background:#0a0a0a;border:1px solid #1a1a1a;border-radius:16px;overflow:hidden;box-shadow:0 12px 60px rgba(0,0,0,0.5);display:none;flex-direction:column;max-height:520px">' +
    '<div style="padding:16px 20px;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">' +
    '<div style="display:flex;align-items:center;gap:10px">' +
    '<div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:16px">9</div>' +
    '<div><div style="font-weight:700;font-size:14px">9amLeads Chat</div><div style="font-size:11px;opacity:0.8">Typically replies in 5min</div></div>' +
    '</div>' +
    '<div id="chatClose" style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;transition:.2s"><i class="fas fa-times"></i></div>' +
    '</div>' +
    '<div id="chatMsgs" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;min-height:200px">' +
    '<div class="chat-msg chat-bot"><div style="max-width:85%;background:#141414;border:1px solid #1a1a1a;border-radius:12px 12px 12px 4px;padding:12px 14px;font-size:13px;color:#999;line-height:1.6"><strong style="color:#f5f5f5">👋 Hi there!</strong><br>Got a question about our leads? Tell us a bit about yourself and we\'ll get back to you right away.</div></div>' +
    '</div>' +
    '<div id="chatForm" style="padding:12px 16px 16px;border-top:1px solid #1a1a1a;flex-shrink:0">' +
    '<div id="chatInputs">' +
    '<input id="chatName" type="text" placeholder="Your name" style="width:100%;padding:10px 12px;background:#050505;border:1px solid #1a1a1a;border-radius:8px;color:#f5f5f5;font-size:13px;font-family:inherit;outline:none;margin-bottom:8px;box-sizing:border-box" onfocus="this.style.borderColor=\'#0ea5e9\'" onblur="this.style.borderColor=\'\'">' +
    '<input id="chatEmail" type="email" placeholder="Your email" style="width:100%;padding:10px 12px;background:#050505;border:1px solid #1a1a1a;border-radius:8px;color:#f5f5f5;font-size:13px;font-family:inherit;outline:none;margin-bottom:8px;box-sizing:border-box" onfocus="this.style.borderColor=\'#0ea5e9\'" onblur="this.style.borderColor=\'\'">' +
    '<textarea id="chatMessage" placeholder="Type your message..." rows="2" style="width:100%;padding:10px 12px;background:#050505;border:1px solid #1a1a1a;border-radius:8px;color:#f5f5f5;font-size:13px;font-family:inherit;outline:none;resize:none;box-sizing:border-box;margin-bottom:8px" onfocus="this.style.borderColor=\'#0ea5e9\'" onblur="this.style.borderColor=\'\'"></textarea>' +
    '<button id="chatSend" style="width:100%;padding:11px;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;transition:.2s"><i class="fas fa-paper-plane" style="margin-right:6px"></i> Send Message</button>' +
    '</div>' +
    '<div id="chatSuccess" style="display:none;text-align:center;padding:12px">' +
    '<div style="font-size:32px;margin-bottom:8px">✅</div>' +
    '<div style="font-size:15px;font-weight:600;color:#f5f5f5;margin-bottom:4px">Message Sent!</div>' +
    '<div style="font-size:12px;color:#666">We\'ll get back to you at <span id="chatSentEmail" style="font-weight:600;color:#0ea5e9"></span></div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>';

  var container = d.createElement('div');
  container.id = 'chatContainer';
  container.innerHTML = chatHTML;
  d.body.appendChild(container);

  var bubble = d.getElementById('chatBubble');
  var panel = d.getElementById('chatPanel');
  // Keep the chat bubble/panel, cookie bar and live-proof banner from overlapping.
  // A single shared function also lets other scripts (cookie accept buttons)
  // re-run the layout after the consent bar disappears.
  function shiftForOverlays() {
    try {
      // The visible consent bar (either the JS-injected #cookieBanner or a page's
      // own #cookieConsent).
      var bar = d.getElementById('cookieBanner') || d.getElementById('cookieConsent');
      var barShown = bar && String(bar.style.display) !== 'none';
      var barBottomPad = 0;
      if (barShown && bar) barBottomPad = (bar.offsetHeight || 52) + 10;

      // On small screens a full-width mobile sticky CTA also docks to the bottom.
      // While the cookie bar is showing we hide the sticky CTA (the consent bar
      // takes that slot) and restore it once consent is given.
      var msticky = d.getElementById('msticky') || d.querySelector('.msticky');
      var stickyH = 0;
      if (msticky) {
        var mstickyHadData = msticky.getAttribute('data-msticky-state');
        if (barShown) {
          if (getComputedStyle(msticky).display !== 'none') {
            msticky.setAttribute('data-msticky-state', 'shown');
          }
          msticky.style.setProperty('display', 'none', 'important');
        } else if (mstickyHadData === 'shown') {
          msticky.style.removeProperty('display');
          msticky.removeAttribute('data-msticky-state');
        }
        if (getComputedStyle(msticky).display !== 'none') stickyH = (msticky.offsetHeight || 72);
      }

      var gap = barBottomPad + stickyH;
      if (gap) gap += 10;

      var live = d.getElementById('liveProof');
      if (live) live.style.bottom = (24 + gap) + 'px';

      bubble.style.bottom = (24 + gap) + 'px';
      panel.style.bottom = (96 + gap) + 'px';

      // Keep the back-to-top button above the overlays too.
      var btt = d.getElementById('backToTop');
      if (btt) btt.style.bottom = (96 + gap) + 'px';
    } catch (e) {}
  }
  window.__shiftBottomWidgets = shiftForOverlays;
  shiftForOverlays();
  // Re-run whenever the consent bar is shown/hidden.
  ['cookieConsent', 'cookieBanner', 'msticky', 'mobileSticky'].forEach(function(id) {
    try {
      var el = d.getElementById(id);
      if (el) {
        var mo = new MutationObserver(shiftForOverlays);
        mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
      }
    } catch (e) {}
  });
  window.addEventListener('resize', shiftForOverlays);
  setTimeout(shiftForOverlays, 300);
  setTimeout(shiftForOverlays, 1000);
  setTimeout(shiftForOverlays, 2500);
  // Late / repeated re-layout: catches elements injected after this script ran
  // (e.g. mobile sticky CTA or consent banner added near the end of the page).
  setInterval(shiftForOverlays, 2500);
  var close = d.getElementById('chatClose');
  var send = d.getElementById('chatSend');
  var name = d.getElementById('chatName');
  var email = d.getElementById('chatEmail');
  var msg = d.getElementById('chatMessage');
  var msgs = d.getElementById('chatMsgs');
  var inputs = d.getElementById('chatInputs');
  var success = d.getElementById('chatSuccess');
  var sentEmail = d.getElementById('chatSentEmail');
  var open = false;

  function addMsg(text, type) {
    var div = d.createElement('div');
    div.className = 'chat-msg chat-' + type;
    div.style.cssText = 'display:flex;' + (type === 'user' ? 'justify-content:flex-end' : '');
    div.innerHTML = '<div style="max-width:85%;background:' + (type === 'user' ? 'linear-gradient(135deg,#0ea5e9,#2563eb)' : '#141414') + ';border:1px solid ' + (type === 'user' ? 'rgba(14,165,233,0.3)' : '#1a1a1a') + ';border-radius:' + (type === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px') + ';padding:10px 14px;font-size:13px;color:' + (type === 'user' ? '#fff' : '#999') + ';line-height:1.5">' + text + '</div>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  bubble.onclick = function() {
    open = !open;
    panel.style.display = open ? 'flex' : 'none';
    bubble.style.display = open ? 'none' : 'flex';
    if (open) msgs.scrollTop = msgs.scrollHeight;
  };

  close.onclick = function() {
    open = false;
    panel.style.display = 'none';
    bubble.style.display = 'flex';
  };

  send.onclick = function() {
    var n = name.value.trim();
    var e = email.value.trim();
    var m = msg.value.trim();
    if (!n || !e || !m) {
      if (!n) name.style.borderColor = '#ef4444';
      else name.style.borderColor = '';
      if (!e) email.style.borderColor = '#ef4444';
      else email.style.borderColor = '';
      if (!m) msg.style.borderColor = '#ef4444';
      else msg.style.borderColor = '';
      return;
    }
    name.style.borderColor = '';
    email.style.borderColor = '';
    msg.style.borderColor = '';
    addMsg(m, 'user');
    inputs.style.display = 'none';
    send.disabled = true;
    send.textContent = 'Sending...';

    var payload = JSON.stringify({ name: n, email: e, message: m, page: window.location.pathname });
    fetch('https://nineamleads-api.onrender.com/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
      .then(function(r) { return r.json(); })
      .then(function() { showSuccess(e); })
      .catch(function() {
        var mailto = 'mailto:hello@9amleads.com?subject=Chat from ' + encodeURIComponent(n) + '&body=' + encodeURIComponent('Name: ' + n + '\nEmail: ' + e + '\nMessage: ' + m);
        window.open(mailto);
        showSuccess(e);
      });
  };

  function showSuccess(emailAddr) {
    sentEmail.textContent = emailAddr;
    success.style.display = 'block';
    addMsg('Thanks for reaching out! We\'ll email you back shortly.', 'bot');
  }

  msg.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send.click(); }
  });

  d.getElementById('chatWidget').style.display = 'block';
})();
