// Stripe Payment Handler — Powers subscriptions for all 4 businesses
// Usage: node stripe_handler.js --setup  (first time)
//        node stripe_handler.js --webhook (run as webhook server)
//        node stripe_handler.js --checkout <biz> <plan> <email>  Create checkout link
//        node stripe_handler.js --list   Show configured products

const https = require('https');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CONFIG_FILE = path.join(__dirname, 'data', 'stripe-config.json');
const DATA_FILE = path.join(__dirname, 'data', 'stripe-data.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch { return {}; }
}
function saveConfig(c) { fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2)); }

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); } catch { return { customers: [], subscriptions: [], invoices: [] }; }
}
function saveData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

// Product definitions — loaded from central pricing config
// Prices vary per product. Plan names: Starter, Growth, Power
const PRICING_DATA = {
  moving: [
    { id: 'mov-starter', name: 'Moving Starter',     price: 2500,  interval: 'week', leadsLabel: '1-5 estimated leads/day' },
    { id: 'mov-growth',  name: 'Moving Growth',      price: 4900,  interval: 'week', leadsLabel: '5-15 estimated leads/day' },
    { id: 'mov-power',   name: 'Moving Power',       price: 9900,  interval: 'week', leadsLabel: '15-35 estimated leads/day' }
  ],
  probate: [
    { id: 'prob-starter', name: 'Probate Starter',   price: 2500,  interval: 'week', leadsLabel: '0-2 estimated leads/day' },
    { id: 'prob-growth',  name: 'Probate Growth',    price: 4900,  interval: 'week', leadsLabel: '2-6 estimated leads/day' },
    { id: 'prob-power',   name: 'Probate Power',     price: 9900, interval: 'week', leadsLabel: '5-15 estimated leads/day' }
  ],
  newbusiness: [
    { id: 'nb-starter', name: 'New Business Starter', price: 2500, interval: 'week', leadsLabel: '1-5 estimated leads/day' },
    { id: 'nb-growth',  name: 'New Business Growth',  price: 2500, interval: 'week', leadsLabel: '5-15 estimated leads/day' },
    { id: 'nb-power',   name: 'New Business Power',   price: 4900, interval: 'week', leadsLabel: '15-40 estimated leads/day' }
  ],
  planning: [
    { id: 'plan-starter', name: 'Planning Starter', price: 4900, interval: 'week', leadsLabel: '1-3 estimated leads/day' },
    { id: 'plan-growth',  name: 'Planning Growth',  price: 9900, interval: 'week', leadsLabel: '3-10 estimated leads/day' },
    { id: 'plan-power',   name: 'Planning Power',   price: 9900, interval: 'week', leadsLabel: '10-25 estimated leads/day' }
  ],
  tenders: [
    { id: 'tend-starter', name: 'Tenders Starter', price: 4900, interval: 'week', leadsLabel: '3-5 estimated tenders/day' },
    { id: 'tend-growth',  name: 'Tenders Growth',  price: 9900, interval: 'week', leadsLabel: '5-15 estimated tenders/day' },
    { id: 'tend-power',   name: 'Tenders Power',   price: 9900, interval: 'week', leadsLabel: '15-40 estimated tenders/day' }
  ],
  // Industry Packages (Stage 34)
  'builder-package': [
    { id: 'bld-package', name: 'Builder Package', price: 13900, interval: 'week', leadsLabel: 'Planning + Probate + Tenders combined' }
  ],
  'marketing-package': [
    { id: 'mkt-package', name: 'Marketing Package', price: 6900, interval: 'week', leadsLabel: 'New Business + Tenders combined' }
  ],
  'property-package': [
    { id: 'prp-package', name: 'Property Package', price: 10900, interval: 'week', leadsLabel: 'Probate + Planning + New Business combined' }
  ],
  'moving-package': [
    { id: 'mov-package', name: 'Moving Package', price: 4900, interval: 'week', leadsLabel: 'Moving + Probate combined' }
  ],
  // 9amLeads Pro (Stage 35)
  'pro': [
    { id: 'pro-plan', name: '9amLeads Pro', price: 24900, interval: 'week', leadsLabel: 'All 5 lead types + unlimited territories' }
  ]
};

// Stripe API helper
function stripeRequest(method, path, data, apiKey) {
  return new Promise((resolve, reject) => {
    const params = data ? Object.entries(data).map(([k, v]) => 
      encodeURIComponent(k) + '=' + encodeURIComponent(v)
    ).join('&') : '';
    const body = params;
    const req = https.request({
      hostname: 'api.stripe.com', port: 443, method,
      path: '/v1/' + path,
      headers: {
        'Authorization': 'Basic ' + Buffer.from(apiKey + ':').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(parsed.error?.message || 'HTTP ' + res.statusCode));
          else resolve(parsed);
        } catch { reject(new Error(data.slice(0,200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Create Stripe products and prices
async function setupStripeProducts(apiKey) {
  console.log('Setting up Stripe products for all businesses...');
  const priceIds = {};

  for (const [business, plans] of Object.entries(PRICING_DATA)) {
    priceIds[business] = {};
    for (const plan of plans) {
      try {
        let product;
        try {
          product = await stripeRequest('GET', 'products/' + plan.id, null, apiKey);
          console.log('  Found existing product: ' + plan.name);
        } catch {
          product = await stripeRequest('POST', 'products', {
            name: plan.name, id: plan.id,
            description: (plan.leads > 0 ? plan.leads + ' leads/day' : 'Unlimited leads') + ' — ' + business
          }, apiKey);
          console.log('  Created product: ' + plan.name);
        }

        const price = await stripeRequest('POST', 'prices', {
          product: plan.id, unit_amount: String(plan.price), currency: 'gbp',
          'recurring[interval]': plan.interval, 'recurring[interval_count]': '1'
        }, apiKey);
        console.log('  Price: \u00a3' + (plan.price/100).toFixed(2) + '/wk (' + price.id + ')');
        priceIds[business][plan.id] = price.id;
      } catch (e) {
        console.log('  Error setting up ' + plan.name + ': ' + e.message + ' (body: ' + JSON.stringify(e).slice(0,200) + ')');
      }
    }
  }

  saveConfig({ priceIds, setupComplete: true });
  console.log('\nStripe setup complete! Price IDs saved to config.\n');
  console.log('Next steps:');
  console.log('  - Set webhook endpoint in Stripe Dashboard -> Webhooks:');
  console.log('    URL: https://YOUR_DOMAIN/api/stripe/webhook');
  console.log('    Events: checkout.session.completed');
  console.log('  - Or test locally with: node stripe_handler.js --webhook\n');
}

// Create checkout session
async function createCheckout(apiKey, business, planId, customerEmail, successUrl, cancelUrl) {
  const plans = PRICING_DATA[business] || [];
  const plan = plans.find(p => p.id === planId);
  if (!plan || !plan.stripePriceId) throw new Error('Plan not configured');
  
  const session = await stripeRequest('POST', 'checkout/sessions', {
    mode: 'subscription',
    customer_email: customerEmail,
    'line_items[0][price]': plan.stripePriceId,
    'line_items[0][quantity]': '1',
    'success_url': successUrl || 'http://localhost:8006/portal/dashboard.html?checkout=success',
    'cancel_url': cancelUrl || 'http://localhost:8006/portal/dashboard.html?checkout=cancel',
    'metadata[business]': business,
    'metadata[planId]': planId
  }, apiKey);
  return session;
}

// Webhook server — receives Stripe event forwards to the API server
function startWebhookServer(apiKey, webhookSecret, targetUrl) {
  const PORT = parseInt(process.env.WEBHOOK_PORT) || 8008;
  
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/stripe/webhook') {
      res.writeHead(404); res.end();
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        // Verify signature if secret provided
        if (webhookSecret) {
          const sig = req.headers['stripe-signature'];
          if (!sig) { res.writeHead(400); res.end('No signature'); return; }
          const crypto = require('crypto');
          const parts = {};
          sig.split(',').forEach(p => { const [k, v] = p.trim().split('='); parts[k] = v; });
          const signedPayload = parts['t'] + '.' + body;
          const computed = crypto.createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');
          if (computed !== parts['v1']) {
            console.log('[WEBHOOK] Invalid signature');
            res.writeHead(400); res.end('Invalid signature');
            return;
          }
        }

        const event = JSON.parse(body);
        console.log('[WEBHOOK] Received event: ' + event.type);

        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const customerId = session.metadata?.customer_id;
          const plan = session.metadata?.plan;
          
          if (customerId && plan && targetUrl) {
            // Forward to the production API server
            const forwardReq = https.request(new URL(targetUrl), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            }, forwardRes => {
              let resp = '';
              forwardRes.on('data', c => resp += c);
              forwardRes.on('end', () => {
                console.log('[WEBHOOK] Forwarded to API: ' + resp);
              });
            });
            forwardReq.on('error', e => console.log('[WEBHOOK] Forward error: ' + e.message));
            forwardReq.write(JSON.stringify({
              type: 'checkout.session.completed',
              data: { object: session }
            }));
            forwardReq.end();
          }

          // Save to local data
          const data = loadData();
          data.subscriptions.push({
            customer_id: customerId,
            plan,
            stripe_session: session.id,
            stripe_subscription: session.subscription,
            status: 'active',
            created_at: new Date().toISOString()
          });
          saveData(data);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      } catch (e) {
        console.log('[WEBHOOK] Error: ' + e.message);
        res.writeHead(200);
        res.end(JSON.stringify({ received: true }));
      }
    });
  });

  server.listen(PORT, () => {
    console.log('\n=== Stripe Webhook Server ===');
    console.log('  Listening on: http://localhost:' + PORT + '/stripe/webhook');
    console.log('  Forwarding to: ' + (targetUrl || 'none (local only)'));
    console.log('');
    console.log('  Set this URL in Stripe Dashboard -> Webhooks:');
    console.log('  https://dashboard.stripe.com/webhooks');
    console.log('  URL: http://YOUR_SERVER_IP:' + PORT + '/stripe/webhook');
    console.log('  Events: checkout.session.completed\n');
  });
}

// === COMMAND LINE ===
async function main() {
  const args = process.argv.slice(2);
  const config = loadConfig();
  
  if (args[0] === '--setup') {
    console.log('\n=== Stripe Payment Setup ===\n');
    console.log('Need a Stripe account? Go to https://stripe.com\n');
    const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    const apiKey = await new Promise(r => readline.question('Stripe Secret Key (sk_live_...): ', r));
    readline.close();
    
    if (!apiKey || !apiKey.startsWith('sk_')) { console.log('Invalid key — must start with sk_'); return; }
    saveConfig({ ...config, apiKey });
    await setupStripeProducts(apiKey);
    
  } else if (args[0] === '--checkout') {
    if (!config.apiKey) { console.log('Run --setup first'); return; }
    const business = args[1] || 'moving';
    const planId = args[2] || 'moving-starter';
    const email = args[3] || 'test@example.com';
    
    // Map business names to our keys
    const bizMap = { 'moving': 'moving', 'movingleadsdaily': 'moving', 'probate': 'probate', 'probateleads': 'probate', 'newbusiness': 'newbusiness', 'newbusinessalert': 'newbusiness', 'planning': 'planning', 'planningleads': 'planning', 'tenders': 'tenders' };
    const biz = bizMap[business] || 'moving';
    
    // Look up price ID from config (may have been set up already)
    const plans = PRICING_DATA[biz] || [];
    const plan = plans.find(p => p.id === planId);
    if (!plan) { console.log('Unknown plan. Available plans for ' + biz + ':'); plans.forEach(p => console.log('  ' + p.id)); return; }
    
    // Get price ID from config if available
    const priceIds = config.priceIds?.[biz] || {};
    if (priceIds[planId]) {
      plan.stripePriceId = priceIds[planId];
    }
    
    if (!plan.stripePriceId) {
      console.log('Plan not configured. Run --setup first.');
      return;
    }
    
    const session = await createCheckout(config.apiKey, biz, planId, email);
    console.log('\nCheckout URL:', session.url);
    console.log('Send this to your customer to pay.\n');
    
  } else if (args[0] === '--webhook') {
    if (!config.apiKey) { console.log('Run --setup first'); return; }
    const webhookSecret = config.webhookSecret || '';
    const targetUrl = args[1] || 'http://localhost:8012/api/stripe/webhook';
    startWebhookServer(config.apiKey, webhookSecret, targetUrl);
    
  } else if (args[0] === '--list') {
    console.log('\n=== Configured Products ===\n');
    const priceIds = config.priceIds || {};
    for (const [biz, plans] of Object.entries(PRICING_DATA)) {
      console.log(biz + ':');
      for (const plan of plans) {
        const pid = priceIds[biz]?.[plan.id] || 'NOT SETUP';
          console.log('  ' + plan.id + '  \u00a3' + (plan.price/100).toFixed(2) + '/wk  ->  ' + pid);
      }
      console.log('');
    }
    console.log('Setup complete:', config.setupComplete ? 'YES' : 'NO');
    console.log('API key:', config.apiKey ? config.apiKey.substring(0, 12) + '...' : 'NOT SET');
    console.log('');
    
  } else {
    console.log('\nStripe Payment Handler');
    console.log('Usage:');
    console.log('  node stripe_handler.js --setup              Configure Stripe + create products');
    console.log('  node stripe_handler.js --checkout <biz> <plan> <email>  Create checkout link');
    console.log('  node stripe_handler.js --webhook [api_url]  Run webhook server');
    console.log('  node stripe_handler.js --list               Show configured products');
    console.log('\nExamples:');
    console.log('  node stripe_handler.js --checkout moving moving-pro customer@email.com');
    console.log('  node stripe_handler.js --webhook http://localhost:8012/api/stripe/webhook\n');
  }
}

main().catch(e => console.error('Error:', e.message));
