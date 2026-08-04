// ===== 9amLeads CENTRAL PRICING CONFIG =====
// Single source of truth for all pricing data.
// All pages should import from this file.
// Stripe price IDs are placeholders — update via stripe_handler.js --setup

const LEAD_TYPES = {
  moving:    { name: 'Moving Leads',          slug: 'movingleadsdaily',  icon: '🚚' },
  probate:   { name: 'Probate Leads',         slug: 'probateleads',     icon: '⚖️' },
  newbusiness: { name: 'New Business Alerts', slug: 'newbusinessalert', icon: '🏢' },
  planning:  { name: 'Planning Permission',   slug: 'planningleads',    icon: '🔨' },
  tenders:   { name: 'Public Sector Tenders', slug: 'tenders',          icon: '📋' }
};

const PLANS = [
  { id: 'starter', name: 'Starter', tier: 1 },
  { id: 'growth',  name: 'Growth',  tier: 2 },
  { id: 'power',   name: 'Power',   tier: 3 }
];

// UNIFORM PRICING across all lead types: £25 / £49 / £99 per week.
const PRICING = {
  newbusiness: {
    name: 'New Business Alerts',
    plans: [
      { id: 'nb-starter',  name: 'Starter', price: 2500, interval: 'week', leadsMin: 5,  leadsMax: 5,  leadsLabel: '5 leads/day', tier: 1 },
      { id: 'nb-growth',   name: 'Growth',  price: 4900, interval: 'week', leadsMin: 15, leadsMax: 15, leadsLabel: '15 leads/day',  tier: 2 },
      { id: 'nb-power',    name: 'Power',   price: 9900, interval: 'week', leadsMin: 40, leadsMax: 40, leadsLabel: '40 leads/day', tier: 3 }
    ]
  },
  planning: {
    name: 'Planning Permission Leads',
    plans: [
      { id: 'plan-starter', name: 'Starter', price: 2500, interval: 'week', leadsMin: 1,  leadsMax: 1,  leadsLabel: '1 lead/day',   tier: 1 },
      { id: 'plan-growth',  name: 'Growth',  price: 4900, interval: 'week', leadsMin: 3,  leadsMax: 3,  leadsLabel: '3 leads/day',  tier: 2 },
      { id: 'plan-power',   name: 'Power',   price: 9900, interval: 'week', leadsMin: 5,  leadsMax: 5,  leadsLabel: '5 leads/day',  tier: 3 }
    ]
  },
  probate: {
    name: 'Probate Leads',
    plans: [
      { id: 'prob-starter', name: 'Starter', price: 2500, interval: 'week', leadsMin: 5, leadsMax: 5,  leadsLabel: '5 leads/day',  tier: 1 },
      { id: 'prob-growth',  name: 'Growth',  price: 4900, interval: 'week', leadsMin: 15, leadsMax: 15, leadsLabel: '15 leads/day',  tier: 2 },
      { id: 'prob-power',   name: 'Power',   price: 9900, interval: 'week', leadsMin: 30, leadsMax: 30, leadsLabel: '30 leads/day', tier: 3 }
    ]
  },
  moving: {
    name: 'Moving Leads',
    plans: [
      { id: 'mov-starter', name: 'Starter', price: 2500, interval: 'week', leadsMin: 5,  leadsMax: 5,  leadsLabel: '5 leads/day',  tier: 1 },
      { id: 'mov-growth',  name: 'Growth',  price: 4900, interval: 'week', leadsMin: 15, leadsMax: 15, leadsLabel: '15 leads/day',  tier: 2 },
      { id: 'mov-power',   name: 'Power',   price: 9900, interval: 'week', leadsMin: 40, leadsMax: 40, leadsLabel: '40 leads/day', tier: 3 }
    ]
  },
  tenders: {
    name: 'Public Sector Tender Leads',
    plans: [
      { id: 'tend-starter', name: 'Starter', price: 2500, interval: 'week', leadsMin: 1,  leadsMax: 1,  leadsLabel: '1 tender/day',  tier: 1 },
      { id: 'tend-growth',  name: 'Growth',  price: 4900, interval: 'week', leadsMin: 3,  leadsMax: 3,  leadsLabel: '3 tenders/day', tier: 2 },
      { id: 'tend-power',   name: 'Power',   price: 9900, interval: 'week', leadsMin: 5,  leadsMax: 5,  leadsLabel: '5 tenders/day', tier: 3 }
    ]
  }
};

// ===== STRIPE ENVIRONMENT VARIABLE KEY NAMES =====
// Actual price IDs are stored in environment variables and data/stripe-config.json
// To generate: node stripe_handler.js --setup

const STRIPE_ENV_KEYS = {
  newbusiness: {
    'nb-starter': 'STRIPE_NEW_BUSINESS_STARTER_WEEKLY',
    'nb-growth':  'STRIPE_NEW_BUSINESS_GROWTH_WEEKLY',
    'nb-power':   'STRIPE_NEW_BUSINESS_POWER_WEEKLY'
  },
  planning: {
    'plan-starter': 'STRIPE_PLANNING_STARTER_WEEKLY',
    'plan-growth':  'STRIPE_PLANNING_GROWTH_WEEKLY',
    'plan-power':   'STRIPE_PLANNING_POWER_WEEKLY'
  },
  probate: {
    'prob-starter': 'STRIPE_PROBATE_STARTER_WEEKLY',
    'prob-growth':  'STRIPE_PROBATE_GROWTH_WEEKLY',
    'prob-power':   'STRIPE_PROBATE_POWER_WEEKLY'
  },
  moving: {
    'mov-starter': 'STRIPE_MOVING_STARTER_WEEKLY',
    'mov-growth':  'STRIPE_MOVING_GROWTH_WEEKLY',
    'mov-power':   'STRIPE_MOVING_POWER_WEEKLY'
  },
  tenders: {
    'tend-starter': 'STRIPE_TENDERS_STARTER_WEEKLY',
    'tend-growth':  'STRIPE_TENDERS_GROWTH_WEEKLY',
    'tend-power':   'STRIPE_TENDERS_POWER_WEEKLY'
  }
};

// Actual Stripe price IDs (loaded from stripe-config.json after running stripe_handler.js --setup)
const STRIPE_PRICE_IDS = { newbusiness: {}, planning: {}, probate: {}, moving: {}, tenders: {} };

function loadStripeIds() {
  // Try to load from the existing stripe config file
  try {
    if (typeof window === 'undefined') {
      var fs = require('fs');
      var path = require('path');
      var configPath = path.join(__dirname, 'data', 'stripe-config.json');
      if (fs.existsSync(configPath)) {
        var config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.priceIds) {
          for (var prod in config.priceIds) {
            if (!STRIPE_PRICE_IDS[prod]) STRIPE_PRICE_IDS[prod] = {};
            for (var plan in config.priceIds[prod]) {
              STRIPE_PRICE_IDS[prod][plan] = config.priceIds[prod][plan];
            }
          }
        }
      }
    }
  } catch(e) {}
}
loadStripeIds();

// ===== HELPERS =====

function getPlans(product) {
  return PRICING[product]?.plans || [];
}

function getPlan(product, planId) {
  return getPlans(product).find(p => p.id === planId) || null;
}

function getStripePriceId(product, planId) {
  return STRIPE_PRICE_IDS[product]?.[planId] || null;
}

function formatPrice(pence) {
  return '£' + (pence / 100).toFixed(0);
}

function formatInterval(interval) {
  return interval === 'week' ? '/wk' : '/mo';
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LEAD_TYPES, PLANS, PRICING, STRIPE_PRICE_IDS, getPlans, getPlan, getStripePriceId, formatPrice, formatInterval };
}

// Export for browser
if (typeof window !== 'undefined') {
  window.PRICING_CONFIG = { LEAD_TYPES, PLANS, PRICING, STRIPE_PRICE_IDS, getPlans, getPlan, getStripePriceId, formatPrice, formatInterval };
}
