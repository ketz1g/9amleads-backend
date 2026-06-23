const fs = require('fs');
const path = require('path');

const socialLinks = {
  facebook: 'https://www.facebook.com/share/1SBwDAUuxh/?mibextid=wwXIfr',
  tiktok: 'https://www.tiktok.com/@9amleads.com',
  instagram: 'https://www.instagram.com/9amleads/'
};

const socialHTML = (size, fontSize) => `
<div style="display:flex;gap:8px;margin-top:14px">
<a href="${socialLinks.facebook}" target="_blank" style="display:inline-flex;align-items:center;justify-content:center;width:${size};height:${size};border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:#8890a8;font-size:${fontSize};text-decoration:none;transition:.2s" onmouseover="this.style.background='rgba(14,165,233,0.1)';this.style.color='#0ea5e9'" onmouseout="this.style.background='';this.style.color=''" aria-label="Facebook"><i class="fab fa-facebook-f"></i></a>
<a href="${socialLinks.tiktok}" target="_blank" style="display:inline-flex;align-items:center;justify-content:center;width:${size};height:${size};border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:#8890a8;font-size:${fontSize};text-decoration:none;transition:.2s" onmouseover="this.style.background='rgba(14,165,233,0.1)';this.style.color='#0ea5e9'" onmouseout="this.style.background='';this.style.color=''" aria-label="TikTok"><i class="fab fa-tiktok"></i></a>
<a href="${socialLinks.instagram}" target="_blank" style="display:inline-flex;align-items:center;justify-content:center;width:${size};height:${size};border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:#8890a8;font-size:${fontSize};text-decoration:none;transition:.2s" onmouseover="this.style.background='rgba(14,165,233,0.1)';this.style.color='#0ea5e9'" onmouseout="this.style.background='';this.style.color=''" aria-label="Instagram"><i class="fab fa-instagram"></i></a>
</div>`;

const emailSocialHTML = `
<p style="margin:14px 0 8px">
<a href="${socialLinks.facebook}" style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:50%;background:rgba(255,255,255,0.04);color:#666;text-decoration:none;margin:0 3px;font-size:13px">f</a>
<a href="${socialLinks.tiktok}" style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:50%;background:rgba(255,255,255,0.04);color:#666;text-decoration:none;margin:0 3px;font-size:13px">T</a>
<a href="${socialLinks.instagram}" style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:50%;background:rgba(255,255,255,0.04);color:#666;text-decoration:none;margin:0 3px;font-size:13px">Ig</a>
</p>`;

// Files to update (website footers)
const files = [
  'C:\\Users\\ketzm\\9amwebsite\\index.html',
  'C:\\Users\\ketzm\\9amwebsite\\movingleadsdaily\\index.html',
  'C:\\Users\\ketzm\\9amwebsite\\probateleads\\index.html',
  'C:\\Users\\ketzm\\9amwebsite\\newbusinessalert\\index.html',
  'C:\\Users\\ketzm\\9amwebsite\\planningleads\\index.html',
  'C:\\Users\\ketzm\\9amwebsite\\tenders\\index.html',
  'C:\\Users\\ketzm\\9amwebsite\\how-it-works\\index.html',
  'C:\\Users\\ketzm\\9amwebsite\\who-we-serve\\index.html'
];

for (const file of files) {
  if (!fs.existsSync(file)) { console.log('SKIP (not found): ' + file); continue; }
  let c = fs.readFileSync(file, 'utf-8');
  // Find the social div placeholder and replace it
  const socialDiv = '<div style="display:flex;gap:10px;margin-top:16px">';
  const socialDiv2 = '<div style="display:flex;gap:10px;margin-top:12px">';
  
  if (c.includes(socialDiv)) {
    // Replace the empty social div with actual icons
    const closeDiv = '</div>';
    const idx = c.indexOf(socialDiv);
    const endIdx = c.indexOf(closeDiv, idx);
    const existing = c.substring(idx, endIdx + closeDiv.length);
    const replacement = socialHTML('36px', '15px').trim();
    c = c.replace(existing, replacement);
    console.log('UPDATED: ' + path.basename(file));
  } else if (c.includes(socialDiv2)) {
    const idx = c.indexOf(socialDiv2);
    const endIdx = c.indexOf('</div>', idx);
    const existing = c.substring(idx, endIdx + 6);
    const replacement = socialHTML('36px', '15px').trim();
    c = c.replace(existing, replacement);
    console.log('UPDATED: ' + path.basename(file));
  } else {
    // Try finding any footer section and add after company description
    console.log('No social div found in: ' + path.basename(file) + ' - checking for footer...');
    if (c.includes('9am<span style="color:var(--accent)">Leads</span></div>')) {
      const search = '9am<span style="color:var(--accent)">Leads</span></div>';
      const idx = c.indexOf(search) + search.length;
      const after = c.substring(idx);
      // Find next div after the company logo
      const pIdx = after.indexOf('</p>');
      if (pIdx > 0) {
        const insertAt = idx + pIdx + 4;
        c = c.substring(0, insertAt) + socialHTML('36px', '15px') + c.substring(insertAt);
        console.log('ADDED social to footer of: ' + path.basename(file));
      }
    }
  }
  fs.writeFileSync(file, c);
}

// Email templates - update regenerate_campaigns.js
const emailFile = 'C:\\Users\\ketzm\\regenerate_campaigns.js';
if (fs.existsSync(emailFile)) {
  let ec = fs.readFileSync(emailFile, 'utf-8');
  // Find the footer section and add social links before Company No.
  const searchText = 'Company No. 17168176';
  if (ec.includes(searchText)) {
    const idx = ec.indexOf(searchText);
    // Add social links before the company number line
    const before = ec.substring(0, idx);
    const after = ec.substring(idx);
    ec = before + emailSocialHTML.trim() + '\n    ' + after;
    fs.writeFileSync(emailFile, ec);
    console.log('UPDATED: regenerate_campaigns.js with social links');
  }
}

// Production API server email templates
const prodFile = 'C:\\Users\\ketzm\\mission control\\production_api_server.js';
if (fs.existsSync(prodFile)) {
  let pc = fs.readFileSync(prodFile, 'utf-8');
  const searchText2 = '9am Leads Ltd &bull; Company No. 17168176';
  if (pc.includes(searchText2)) {
    const idx = pc.indexOf(searchText2);
    const before = pc.substring(0, idx);
    const after = pc.substring(idx);
    pc = before + emailSocialHTML.trim() + '\n' + after;
    fs.writeFileSync(prodFile, pc);
    console.log('UPDATED: production_api_server.js with social links');
  }
}

console.log('\nDONE - Social links added to all files');
