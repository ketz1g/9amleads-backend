const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const cheerio = require('cheerio');
const { renderBlogIndex, renderBlogPost } = require('../site/backend.cjs');
const { products } = require('../site/content.cjs');
const { output } = require('./build-site.cjs');
const server = require('./preview-site.cjs');
const base = 'http://127.0.0.1:4173';
const screenshots = process.env.SITE_SCREENSHOTS || path.resolve(__dirname,'../test-results');
fs.mkdirSync(screenshots,{recursive:true});
const failures = [];
let browser;
function check(condition,message){if(!condition)failures.push(message);}

async function run(){
  if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));
  const posts=Array.from({length:27},(_,i)=>({slug:'guide-'+i,title:'Useful guide '+i,description:'Practical advice',category:i%2?'Moving':'Planning',html:'<html><body><h1>Old heading</h1><p>Original article content.</p></body></html>'}));
  assert.equal(cheerio.load(renderBlogIndex(posts,{}))('.blog-card').length,12);
  assert.equal(cheerio.load(renderBlogIndex(posts,{page:'3'}))('.blog-card').length,3);
  assert.equal(cheerio.load(renderBlogIndex(posts,{category:'moving'}))('.blog-card').length,12);
  assert.equal(cheerio.load(renderBlogIndex(posts,{q:'no matching words'}))('.blog-card').length,0);
  const article=cheerio.load(renderBlogPost({...posts[0],title:'<script>alert(1)</script>'}));
  assert.equal(article('h1').length,1);
  assert.ok(article('.editorial').text().includes('Original article content.'));
  assert.equal(article('h1 script').length,0);
  for(const file of ['.env','package.json','production_api_server.js','data/database.json'])assert.equal(fs.existsSync(path.join(output,file)),false,'Private build output: '+file);
  const redirect=fs.readFileSync(path.join(output,'_redirects'),'utf8');
  assert.ok(!/\/(movingleadsdaily|probateleads|newbusinessalert|planningleads|tenders)\/\*\s+\/who-we-serve/.test(redirect));

  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  let submitted;
  await context.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    let json={success:true,available:true,areas:[],counties:[],data:[]};
    if(url.pathname==='/api/auth/signup'){submitted=JSON.parse(request.postData());json={error:'Preview validation response: no account created.'};}
    await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(json)});
  });
  const page=await context.newPage();
  let errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const routes=['/','/pricing/','/who-we-serve/','/trades/','/how-it-works/','/bulk','/contact/','/about-us/','/founder/','/help/','/faq/',...products.map(p=>'/'+p.slug+'/'),'/integrations/','/compare/','/testimonials/','/affiliates','/security/','/gdpr/','/privacy.html','/terms.html','/api-docs/','/status/','/careers/','/benchmarks/','/movingleadsdaily/london/','/probateleads/london/','/planningleads/areas/','/blog/','/blog/preview-guide-1','/portal/demo.html','/portal/#signup'];
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:width===390?844:1000});
    for(const route of routes){
      errors=[];
      const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});
      await page.waitForTimeout(250);
      const dimensions=await page.evaluate(()=>({width:document.documentElement.scrollWidth,h1:document.querySelectorAll('h1').length,body:document.body.innerText}));
      check(response.ok(),`${width}px ${route}: HTTP ${response.status()}`);
      check(dimensions.width<=width+2,`${width}px ${route}: overflow ${dimensions.width}px`);
      check(dimensions.h1===1,`${width}px ${route}: ${dimensions.h1} H1 elements`);
      check(errors.length===0,`${width}px ${route}: ${errors.join('; ')}`);
      if(['/', '/pricing/','/movingleadsdaily/','/contact/','/integrations/','/affiliates','/blog/','/portal/#signup','/portal/demo.html'].includes(route)){
        await page.evaluate(()=>document.fonts.ready);
        const name=route==='/'?'home':route.replace(/[^a-z0-9]/gi,'-');
        await page.screenshot({path:path.join(screenshots,`9am-refresh-${width}-${name}.png`),animations:'disabled'});
      }
    }
  }
  await page.goto(base+'/');
  await page.locator('[data-sample="probate"]').click();
  assert.equal(await page.locator('[data-sample-panel="probate"]').isVisible(),true);
  assert.equal(await page.locator('[data-sample-panel="moving"]').isVisible(),false);
  await page.locator('.menu-toggle').click();
  assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');

  await page.goto(base+'/pricing/?product=probate');
  await page.waitForFunction(()=>document.querySelector('[data-price-product="probate"]').getAttribute('aria-pressed')==='true');
  assert.match(await page.locator('[data-allowance="0"]').textContent(),/^1 opportunities/);
  await page.locator('[data-price-product="planning"]').click();
  assert.match(await page.locator('[data-allowance="2"]').textContent(),/^Up to 5/);
  assert.match(await page.locator('#pricing-plans .plan-card').nth(1).locator('a').getAttribute('href'),/product=planning&plan=pro/);

  await page.goto(base+'/trades/');
  await page.locator('#trade-search').fill('roof');
  assert.equal(await page.locator('.trade-card:visible').count(),1);
  await page.locator('#trade-search').fill('no-such-trade-123');
  assert.equal(await page.locator('#trade-empty').isVisible(),true);

  await page.goto(base+'/probateleads/pricing.html');
  await page.waitForURL('**/pricing/?product=probate');
  await page.waitForFunction(()=>document.querySelector('[data-price-product="probate"]').getAttribute('aria-pressed')==='true');

  await page.goto(base+'/affiliates');
  await page.locator('#affiliate-pack-email').fill('preview@example.test');
  await page.locator('#affiliate-pack-form button').click();
  await page.waitForFunction(()=>document.querySelector('#affiliate-pack-form [role=status]').textContent.includes('Thank you'));

  await page.goto(base+'/status/');
  await page.waitForFunction(()=>!document.getElementById('health-retry').disabled);
  assert.match(await page.locator('#health-title').textContent(),/could not confirm/);
  await page.route('**/api/health',r=>r.fulfill({status:200,contentType:'application/json',body:'{"status":"running"}'}));
  await page.locator('#health-retry').click();
  await page.waitForFunction(()=>document.getElementById('health-title').textContent.includes('is responding'));

  await page.goto(base+'/contact/');
  await page.locator('#contact-name').fill('Preview Person');
  await page.locator('#contact-email').fill('preview@example.test');
  await page.locator('#contact-message').fill('A local preview test.');
  await page.route('**/api/contact',r=>r.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await page.locator('#refresh-contact [type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('contact-result').textContent.includes('could not'));
  assert.equal(await page.locator('#contact-message').inputValue(),'A local preview test.');
  await page.unroute('**/api/contact');
  await page.locator('#refresh-contact [type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('contact-result').textContent.includes('Thank you'));
  assert.equal(await page.locator('#contact-message').inputValue(),'');

  await page.goto(base+'/portal/?product=moving&plan=pro#signup');
  await page.waitForFunction(()=>document.querySelector('.signup-step-controls').hidden===false);
  assert.equal(await page.locator('[data-onboarding-step="0"]').isVisible(),true);
  assert.equal(await page.locator('[data-onboarding-step="1"]').isVisible(),false);
  await page.locator('.step-next').click();
  assert.equal(await page.locator('[data-onboarding-step="0"]').isVisible(),true);
  await page.locator('#s-name').fill('Preview Person');
  await page.locator('#s-email').fill('preview@example.test');
  await page.locator('#s-password').fill('PreviewOnly12345');
  await page.locator('.step-next').click();
  assert.equal(await page.locator('[data-onboarding-step="1"]').isVisible(),true);
  assert.equal(await page.locator('#s-plan-container input:checked').inputValue(),'free_trial');
  await page.locator('.step-back').click();
  assert.equal(await page.locator('#s-email').inputValue(),'preview@example.test');
  await page.locator('.step-next').click();
  await page.locator('.step-next').click();
  assert.equal(await page.locator('[data-onboarding-step="2"]').isVisible(),true);
  for(const area of ['M','SK','WA']){await page.locator('#s-postcode-input').fill(area);await page.locator('#s-add-btn').click();}
  await page.locator('#s-terms').check();
  await page.locator('#signup-btn').click();
  await page.waitForFunction(()=>document.getElementById('signup-error').textContent.includes('Preview validation'));
  assert.equal(submitted.email,'preview@example.test');
  assert.equal(submitted.plan,'free_trial');
  assert.deepEqual(submitted.targetAreas,['M','SK','WA']);
  assert.equal(submitted.acceptTerms,true);

  await page.goto(base+'/portal/demo.html');
  await page.locator('#demo-note').fill('Follow up next Tuesday');
  await page.locator('#demo-status').selectOption('Reviewed');
  await page.locator('#demo-save').click();
  await page.locator('[data-record="1"]').click();
  await page.locator('[data-record="0"]').click();
  assert.equal(await page.locator('#demo-note').inputValue(),'Follow up next Tuesday');
  assert.equal(await page.locator('#demo-status').inputValue(),'Reviewed');
  await page.goto(base+'/blog/?page=2');
  assert.equal(await page.locator('.blog-card').count(),6);
  await page.locator('#blog-search').fill('planning');
  await page.locator('.blog-tools [type=submit]').click();
  assert.equal(await page.locator('.blog-card').count(),3);
  await browser.close();
  console.log(`Verified ${routes.length} routes at desktop and mobile sizes, sample switching, pricing selection, trade search, contact success/failure, signup payload, demo notes, blog pagination/search and public-only build output.`);
  if(failures.length){console.error(failures.join('\n'));throw new Error(`${failures.length} layout or runtime checks failed`);}
  console.log('All site checks passed.');
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
