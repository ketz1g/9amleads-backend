// Creative Renderer — Generates actual social media images + email HTML
// Uses Playwright for rendering HTML → PNG, Sharp for image processing

const { chromium } = require('playwright');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const EXPORTS_DIR = path.join(__dirname, '..', 'creative', 'exports');
const TEMPLATES_DIR = path.join(__dirname, '..', 'creative', 'templates');

// === PLATFORM SIZES ===
const SIZES = {
  facebook: { w: 1200, h: 630, label: 'Facebook Post' },
  instagram: { w: 1080, h: 1080, label: 'Instagram Square' },
  story: { w: 1080, h: 1920, label: 'Instagram Story' },
  linkedin: { w: 1200, h: 627, label: 'LinkedIn Post' },
  tiktok: { w: 1080, h: 1920, label: 'TikTok/Reels Cover' },
  twitter: { w: 1600, h: 900, label: 'X/Twitter Post' }
};

// === DESIGN TEMPLATES ===
const TEMPLATES = {
  premium: { name: 'Premium Black/Gold', bg: '#0f172a', accent: '#d4af37', text: '#fff', sub: '#94a3b8', ctaBg: 'linear-gradient(135deg,#d4af37,#b8962e)' },
  corporate: { name: 'Clean Blue/White', bg: '#ffffff', accent: '#38bdf8', text: '#0f172a', sub: '#64748b', ctaBg: 'linear-gradient(135deg,#38bdf8,#0ea5e9)' },
  bold: { name: 'Bold Offer', bg: '#ff6b35', accent: '#ffffff', text: '#ffffff', sub: 'rgba(255,255,255,0.85)', ctaBg: '#0f172a' },
  testimonial: { name: 'Testimonial', bg: '#0f172a', accent: '#4ade80', text: '#ffffff', sub: '#94a3b8', ctaBg: 'linear-gradient(135deg,#4ade80,#22c55e)' },
  educational: { name: 'Educational', bg: '#1e293b', accent: '#a855f7', text: '#ffffff', sub: '#94a3b8', ctaBg: 'linear-gradient(135deg,#a855f7,#9333ea)' }
};

// === GENERATE SOCIAL GRAPHIC ===
async function generateGraphic(businessId, platform, style, headline, subheadline, cta, website, phone, offer) {
  const platformKey = platform.toLowerCase().replace(/[^a-z]/g, '');
  const size = SIZES[platformKey];
  const tmpl = TEMPLATES[style] || TEMPLATES.premium;
  
  const html = `<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:${size.w}px;height:${size.h}px;font-family:'Inter','Segoe UI',Arial,sans-serif;background:${tmpl.bg};color:${tmpl.text};display:flex;flex-direction:column;justify-content:center;padding:48px;position:relative;overflow:hidden}
    .bg-accent{position:absolute;top:-30%;right:-20%;width:60%;height:80%;background:radial-gradient(circle,${tmpl.accent}15 0%,transparent 70%);border-radius:50%}
    .brand{position:absolute;top:32px;left:48px;font-size:14px;font-weight:700;color:${tmpl.accent};letter-spacing:1px;text-transform:uppercase}
    .headline{font-size:${platformKey === 'story' || platformKey === 'tiktok' ? '64' : '42'}px;font-weight:800;line-height:1.1;margin-bottom:16px;letter-spacing:-1px;max-width:80%}
    .subheadline{font-size:${platformKey === 'story' || platformKey === 'tiktok' ? '28' : '20'}px;color:${tmpl.sub};margin-bottom:24px;max-width:75%;line-height:1.4}
    .benefits{display:flex;flex-direction:column;gap:10px;margin-bottom:28px}
    .benefit{display:flex;align-items:center;gap:12px;font-size:${platformKey === 'story' ? '22' : '16'}px}
    .benefit::before{content:'✓';width:28px;height:28px;background:${tmpl.accent};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0}
    .cta{margin-top:8px}
    .cta-btn{display:inline-block;padding:14px 36px;background:${tmpl.ctaBg};color:#fff;border-radius:8px;font-weight:700;font-size:${platformKey === 'story' ? '24' : '18'}px;text-decoration:none}
    .footer{position:absolute;bottom:32px;left:48px;right:48px;display:flex;justify-content:space-between;align-items:center;font-size:14px;color:${tmpl.sub};border-top:1px solid ${tmpl.sub}30;padding-top:16px}
    .badge{position:absolute;top:32px;right:48px;background:${tmpl.accent};color:${tmpl.bg};padding:6px 16px;border-radius:6px;font-weight:700;font-size:12px}
  </style></head><body>
    <div class="bg-accent"></div>
    <div class="brand">${businessId}</div>
    <div class="badge">${TEMPLATES[style].name}</div>
    <div class="headline">${headline}</div>
    <div class="subheadline">${subheadline || 'Premium service. Trusted results.'}</div>
    <div class="benefits">
      <div class="benefit">Professional, reliable service you can trust</div>
      <div class="benefit">Competitive pricing with complete transparency</div>
      <div class="benefit">UK-based team with local expertise</div>
    </div>
    <div class="cta"><a class="cta-btn">${cta || 'Get Started Today'}</a></div>
    <div class="footer"><span>${website || ''}</span><span>${phone || ''}</span></div>
  </body></html>`;

  const filename = `${businessId}-${platformKey}-${style}-${Date.now()}`;
  const pngPath = path.join(EXPORTS_DIR, filename + '.png');
  const jpgPath = path.join(EXPORTS_DIR, filename + '.jpg');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } });
  await page.setContent(html);
  await page.screenshot({ path: pngPath, fullPage: false });
  await browser.close();
  
  // Create JPG from PNG using Sharp
  await sharp(pngPath).jpeg({ quality: 90 }).toFile(jpgPath);
  
  // Also create resized versions
  const thumbPath = path.join(EXPORTS_DIR, filename + '-thumb.jpg');
  await sharp(pngPath).resize(400).jpeg({ quality: 70 }).toFile(thumbPath);
  
  return { png: pngPath, jpg: jpgPath, thumb: thumbPath, filename, size: size.w + 'x' + size.h };
}

// === GENERATE EMAIL HTML ===
function generateEmail(businessName, type, subject, message, style, website, phone, email) {
  const styles = {
    premium: { headerBg: 'linear-gradient(135deg,#0f172a,#1e293b)', accent: '#d4af37', btnBg: '#0f172a' },
    minimal: { headerBg: '#f8f9fa', accent: '#38bdf8', btnBg: '#38bdf8' },
    bold: { headerBg: 'linear-gradient(135deg,#ff6b35,#e85d26)', accent: '#fff', btnBg: '#0f172a' },
    corporate: { headerBg: 'linear-gradient(135deg,#1e293b,#334155)', accent: '#38bdf8', btnBg: '#38bdf8' }
  };
  const s = styles[style] || styles.premium;
  const types = { outreach: 'New Lead Outreach', followup: 'Follow-up', newsletter: 'Newsletter', offer: 'Special Offer', announcement: 'Announcement', nurture: 'Lead Nurture' };
  
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${subject}</title></head><body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:30px 16px">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">
    <tr><td style="background:${s.headerBg};padding:40px 32px;text-align:center">
      <h1 style="color:${s.accent};font-size:24px;margin:0 0 8px">${businessName}</h1>
      <p style="color:rgba(255,255,255,0.7);margin:0;font-size:14px">${types[type] || 'Email'}</p>
    </td></tr>
    <tr><td style="padding:32px"><p style="color:#555;font-size:13px;margin:0 0 16px"><strong>Subject:</strong> ${subject}</p><hr style="border:none;border-top:1px solid #e8ecf0;margin:0 0 24px">
      <div style="font-size:15px;line-height:1.8;color:#333">${message.replace(/\n/g,'<br>')}</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px;text-align:center">
      <a href="https://${website}" style="display:inline-block;padding:14px 36px;background:${s.btnBg};color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Get in Touch</a>
    </td></tr>
    <tr><td style="padding:32px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;text-align:center">
      <p style="margin:0 0 4px">${businessName} | ${website}</p>
      <p style="margin:0">${phone} | ${email}</p>
    </td></tr>
  </table></td></tr></table></body></html>`;
  
  const filename = `${businessName.toLowerCase().replace(/\s/g,'')}-${type}-${Date.now()}.html`;
  const htmlPath = path.join(EXPORTS_DIR, filename);
  fs.writeFileSync(htmlPath, html, 'utf-8');
  return { html: htmlPath, filename };
}

// === COMMAND LINE ===
async function main() {
  const args = process.argv.slice(2);
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  
  if (args[0] === '--graphic') {
    const [biz, platform, style, headline, sub, cta, web, phone, offer] = args.slice(1);
    if (!biz || !platform || !style) { console.log('Usage: --graphic <biz> <platform> <style> [headline]'); return; }
    const result = await generateGraphic(biz, platform, style, headline || 'Premium Service', sub, cta || 'Get Started', web || '', phone || '', offer);
    console.log(JSON.stringify(result));
    
  } else if (args[0] === '--email') {
    const [biz, type, subject, message, style, web, phone, email] = args.slice(1);
    if (!biz || !type) { console.log('Usage: --email <biz> <type> [subject] [message] [style]'); return; }
    const result = generateEmail(biz, type, subject || 'We have a special offer', message || 'Dear customer, thank you for your interest.', style || 'premium', web || '', phone || '', email || '');
    console.log(JSON.stringify(result));
    
  } else if (args[0] === '--list') {
    const files = fs.readdirSync(EXPORTS_DIR).filter(f => f !== '.gitkeep');
    console.log(JSON.stringify(files));
    
  } else {
    console.log('Creative Renderer');
    console.log('Usage:');
    console.log('  node creative/renderer.js --graphic <biz> <platform> <style> [headline] [sub] [cta]');
    console.log('  node creative/renderer.js --email <biz> <type> [subject] [message] [style]');
    console.log('  node creative/renderer.js --list');
    console.log('');
    console.log('Platforms: facebook, instagram, story, linkedin, tiktok, twitter');
    console.log('Styles: premium, corporate, bold, testimonial, educational');
    console.log('Email types: outreach, followup, newsletter, offer, announcement, nurture');
  }
}

if (require.main === module) main();
module.exports = { generateGraphic, generateEmail, SIZES, TEMPLATES };
