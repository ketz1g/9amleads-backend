# Mission Control — Launch & Deployment Guide

## Current Deployment Status
| Site | Status | Method |
|------|--------|--------|
| Mission Control SPA | ✅ Local dev ready | Python HTTP :8000 + Express API :3003 |
| MoverStaff Backend | ✅ Built | Node/Express API (moverstaff-backend.js) |
| GitHub Pages | ✅ Script ready | deploy.ps1 pushes to gh-pages |
| VidaMotor Elite Campaign | ✅ 16 emails ready | deploy_campaign.py → Brevo API |
| VidaBrands Email Templates | ✅ 20 templates ready | See vidabrands_email_templates/ |
| The Moving School Campaign | ✅ 16 emails + strategy ready | Needs deployment script |

---

## 1. Go Live Checklist (Custom Domain — Requires Server/VPS)

### ⬜ SSL Certificate
```bash
# Using Let's Encrypt (free):
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### ⬜ DNS Setup
```
A Record: @ → YOUR_SERVER_IP
CNAME: www → yourdomain.com  
```

### ⬜ Domain Configuration
Update the Python server to bind to your domain or use NGINX as a reverse proxy.

**NGINX reverse proxy config:**
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
server {
    listen 443 ssl;
    server_name yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Quick start without custom domain:**
```powershell
.\deploy.ps1  # Deploy to GitHub Pages (free, instant)
```

---

## 2. Email Deliverability (Brevo)

### ⬜ SPF Record (DNS TXT)
```
v=spf1 include:spf.brevo.com ~all
```

### ⬜ DKIM Record (DNS TXT)
Generated in Brevo → Settings → DKIM. Add the provided TXT record to your DNS.

### ⬜ DMARC Record (DNS TXT)
```
_dmarc  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com"
```

### ⬜ Verified Sender Domain
In Brevo → Settings → Sender Domains → Add & verify `vidamotor.co.uk`
Current sender: `hello@vidamotor.co.uk` (configured in Config.env)

### ✅ Campaign Content
- [x] VidaMotor Elite 16-email campaign (all emails created + deployed to Brevo IDs 10-25)
- [x] Deployment script (deploy_campaign.py)
- [x] The Moving School 16-email campaign (created + deployment script ready)
- [ ] Set `BREVO_SENDER_EMAIL`/`BREVO_LIST_ID` and run `python the_moving_school_campaign/deploy_campaign.py`

---

## 3. Payment Testing

### ⬜ Stripe Test Mode
```javascript
stripe_secret: sk_test_...
stripe_publishable: pk_test_...

// Test card numbers:
// 4242 4242 4242 4242 — Success
// 4000 0000 0000 0002 — Decline
```

### ⬜ PayPal Sandbox
Use the PayPal sandbox environment to test transactions before going live.
Current Stripe handler: `stripe_handler.js` (ready for integration)

---

## 4. Analytics

### ⬜ Plausible (Self-hosted)
The analytics snippet is already added to index.html. Replace `"mission-control.local"` with your domain.

### ⬜ Or Google Analytics
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>
```

---

## 5. Post-Launch Monitoring

| What | How | Status |
|------|-----|--------|
| Trading State | localStorage `ms_trading_state` | ✅ Active |
| Errors | Browser console (F12) | ✅ Global logger in app.js |
| Backup | Auto-saves daily to localStorage | ✅ Active |
| Export Data | Settings → Export Data | ✅ Available |
| Server | Restart server.py if it goes down | ⬜ Document restart procedure |

---

## 6. Domain URLs

| Site | URL |
|------|-----|
| Mission Control | yourdomain.com |
| VidaMotor | yourdomain.com/vidamotor/ |
| VidaListing | yourdomain.com/vidalisting/ |
| MoverStaff | yourdomain.com/moverstaff/ |
| MovingLeadsDaily | yourdomain.com/movingleadsdaily/ |
