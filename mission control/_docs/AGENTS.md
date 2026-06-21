# Mission Control — Complete Project State

## Current Version: 2.0.0 (Last major update: session with trading profitability overhaul)

---

## QUICK COMMANDS
- `python server.py` — Start server on port 8000
- `node moverstaff-backend.js` — Start API on port 3003
- `node --check js/app.js` — JS syntax check
- `git log --oneline -10` — Recent changes

---

## FILE STRUCTURE
| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | ~4773 | Main SPA — all pages as `<section class="page" id="page-*">` |
| `js/app.js` | ~11288 | All logic — App object, DataStore, UI, Trading, CRM |
| `css/styles.css` | ~2065 | Dark theme + light mode |
| `server.py` | ~140 | Python HTTP + Alpaca proxy on port 8000 |
| `moverstaff-backend.js` | ~288 | Express API on port 3003 |
| `moverstaff/` | 18 files | Moving staff marketplace website |
| `probateleads/` | 5 files | Probate leads SaaS website |
| `movingleadsdaily/` | 7 files | Moving leads website |
| `newbusinessalert/` | 5 files | New business alerts website |
| `planningleads/` | 5 files | Planning leads website |
| `vidamotor_marketing/` | 1 file | VidaMotor video service landing page |
| `vidamotor/` | ~20 files | VidaMotor platform — API server, landing page, customer dashboard, CSS theme, showroom assets |
| `AGENTS.md` | This file | Project state for AI context recovery |

## 9am Leads Website Files - TWO LOCATIONS
The 9amLeads website exists in TWO places that must stay in sync:

**PRIMARY (live dev):** `C:\Users\ketzm\mission control\`
**COPY (desktop):** `C:\Users\ketzm\OneDrive\Desktop\9amsite\`

IMPORTANT: When editing ANY website file (HTML, JS, CSS, backend JS, configs, data, etc.)
you MUST update BOTH locations. The desktop copy is the standalone complete site.

Both locations can run independently. Start with:
  node production_api_server.js  (port 8012)
  python server.py               (port 8000)

---

## VIDAMOTOR PLATFORM
- **Server**: `vidamotor/server/vidamotor_server.py` — Python HTTP server on port 8001
- **Landing**: `vidamotor/index.html` — 67KB marketing page (all sections)
- **Dashboard**: `vidamotor/dashboard.html` — 24KB customer dashboard for video creation
- **CSS**: `vidamotor/css/styles.css` — Brand theme (632 lines)
- **Assets**: `vidamotor/assets/showrooms/` (10 PNGs), `vidamotor/assets/music/` (15 WAVs)
- **API endpoints**: /api/voices (13), /api/music (15), /api/showrooms (10), /api/styles (3), /api/formats (3), /api/scrape (AutoTrader/eBay URL import), /api/upload (photo upload), /api/generate (FFmpeg video gen), /api/regenerate (free re-edit)
- **Start**: `vidamotor/start.bat` or `python server/vidamotor_server.py`

---

## CURRENT TRADING SYSTEM STATE

### Trading Loop (`ovStartActivitySimulation`)
- **Interval**: 60 seconds
- **Symbol selection**: Round-robin through 8 crypto symbols (BTC/USD, ETH/USD, SOL/USD, AVAX/USD, LINK/USD, XRP/USD, DOGE/USD, ADA/USD)
- **Signal generation**: Simulated via `seAnalyzeSymbol()` — synthetic prices with momentum/trend/RSI indicators
- **Scoring**: 0-6 across indicators (Trend, Momentum, Maturity, RSI, MACD, R:R)
- **Sniper bonus**: +1 for trend reversals (justFlipped detection)
- **Minimum signal score**: 5/6 (was 4, raised in profitability overhaul)

### Signal Engine (`seAnalyzeSymbol`)
- Synthetic market state per symbol with trend, momentum, phase (sin wave), trendAge
- Trend flips: 8% chance per cycle when age exceeds strength
- Price simulated as: `100 + sin(phase)*10 + momentum*20 + random*2`
- RSI: `50 + momentum*30 + random*10`
- Indicators checked: Trend (+2), Momentum (+1), Maturity (+1), RSI (+1), MACD (+1), Sniper (+1)

### Quality Score (`ftCalculateQualityScore`) — 0-100
- Trend Alignment: 8-12 pts (buy bias removed from previous version)
- Structure Shift: 0-10 pts (FIXED — now reads real marketState.momentum)
- Liquidity Sweep: 0-8 pts (random)
- Entry Confirmation: 5-15 pts (based on signal.score >= 5)
- Session Timing: 2-10 pts
- Spread: 10 pts (hardcoded for now)
- Volatility: 3-10 pts
- R:R Ratio: 3-10 pts (≥2.0 = 10pts)
- **Minimum to pass**: 75

### Position Sizing
- Kelly formula: `winRate - (1-winRate)/avgRR`
- 50% Kelly fraction (was 25%)
- Max position: 2% of balance (was $2000 hard cap)
- Crypto: notional-based, stocks: qty-based

### Risk Management
- Max trades/day: 20
- Max open trades: 3
- Daily loss hard limit: 6% (pauses trading)
- Consecutive losses: 2 pause (4hrs), 3 stop (day)
- Dynamic confidence threshold: adjusts based on recent win rate
  - Win rate < 35%: +1 (capped at 6)
  - Win rate > 70%: -0.5 (floor 3)
  - Else: gradual decay -0.1 toward base 5

### Stop Loss / Take Profit
- Crypto reversal: SL 1.5%, TP 4.5% (1:3)
- Crypto trend: SL 2%, TP 6% (1:3)  
- Stocks reversal: SL 0.5%, TP 1.5% (1:3)
- Stocks trend: SL 0.8%, TP 2.4% (1:3)
- Partial TP: 50% at 1R, move SL to breakeven
- Full TP: remainder at 2R
- Time exit: 120 minutes max

### Price Simulation (neutral)
- `Math.random() - 0.5` (FIXED — was -0.48, hidden bear bias removed)
- 1.5% range per cycle for trade management

### Scalping Mode (`ftConfig.scalpingMode`)
- **Toggle**: `ftConfig.scalpingMode = true/false` (default: false)
- **When enabled**: scans 3 symbols per cycle (config `scalpingScanCount`) instead of 1
- **Interval**: 30s (config `scalpingIntervalMs`) instead of 60s
- **Lower thresholds**: quality min 65 (vs 75), signal min 4/6 (vs 5/6)
- **Per-cycle**: evaluates all N symbols, executes all that pass checks (risk-limited)
- Dynamic threshold adjustment still applies on top of scalping base

### Real Alpaca Price Data
- **Auto-enabled** when Alpaca keys are present (`alpacaInit` sets `ftConfig.useRealPrices = true`)
- Fetches 1-min bars via Alpaca API for all tradable symbols every 60s cycle
- `seAnalyzeSymbol` uses real price as base with synthetic momentum overlay
- `ftManageOpenTrades` uses real Alpaca price for SL/TP checks instead of simulated drift
- Raw price data cached in `ftState.realPrices`, refresh rate controlled by `ftConfig.realPriceCacheSecs`
- Falls back gracefully to simulation if Alpaca API call fails

### Known Fixed Bugs (this session)
- `renderBusinessPage` used `businessId` instead of `bid` parameter — caused ReferenceError on UI.render()
- `ovToggleTrade` early return on missing `ov-trade-btn` — prevented start/stop
- Strategy market condition match broken ternary — never applied +25 bonus
- Quality Score structure shift factor read nonexistent `.momentum` property — always 0
- Double-fire on sidebar button from inline onclick + addEventListener
- 48% bear bias in price simulation — capped win rate at ~45%
- `ftRecordLoss` pnlPct was decimal (0.02) vs config expecting percentage (6) — daily loss limit never triggered
- Spread check in quality score was hardcoded `true` — now uses realistic spread per asset type

## RECENT IMPROVEMENTS (implemented 2026-05-04)
### Spread Cost Fix
- Commission/slippage modeling: crypto 0.1%, stocks $0.005/share + 0.01%
- Limit order support (config toggle `ftConfig.useLimitOrders`, fill probability 40%)
- Realistic spread check in quality score (crypto ~0.15%, stocks ~0.05%)
- Costs deducted from PnL on trade close, tracked in `ftState.totalCommission/slippage`

### Circuit Breakers Added
- **Weekly loss limit**: 10% hard stop (config `ftConfig.weeklyLossHardPct`)
- **Max drawdown**: 15% from peak balance (config `ftConfig.maxDrawdownPct`)
- Weekly tracking auto-resets each Monday in `ftResetDaily()`

### Risk Management Upgrades
- **ATR-based stops**: config `ftConfig.useAtrStops` + `atrMultiplier` (1.5×), calculated from simulated volatility or market state
- **Sharpe ratio**: auto-calculated on trade close, stored in `ftState.sharpeRatio`, last 20 trades by default
- `ftCloseTrade()` consolidates all close logic: costs, returns, weekly PnL, peak balance tracking

---

## TRADING BUTTONS & THEIR HANDLERS

| Button | Location | Handler | File:Line |
|--------|----------|---------|-----------|
| `sidebar-trade-btn` | Sidebar "▶ Trade Now" | `App.toggleTradeNow()` | HTML:39, JS:7147 |
| `tf-trade-btn` | Dashboard tab "▶ Start Trading" | `App.ovToggleTrade()` (inline onclick) | HTML:4045, JS:7935 |
| `tc-btn-start` | Trading Control "▶ Start Trading" | `App.tcStart()` (inline onclick) | HTML:1081, JS:6989 |
| `tc-btn-stop` | Trading Control "⏹ Stop" | `App.tcStop()` (inline onclick) | HTML:1083, JS:7041 |
| `tc-btn-pause` | Trading Control "⏸ Pause" | `App.tcPause()` (inline onclick) | HTML:1082, JS:7038 |
| `tc-btn-kill` | Trading Control "🔴 KILL SWITCH" | `App.tcKillSwitch()` (inline onclick) | HTML:1084, JS:7063 |

---

## LIVE MONITOR PANEL (Dashboard tab)
Shows after pressing Start:
- **Status**: 🟢 Running / 🔴 Stopped / 🟡 Paused
- **Strategy**: Active strategy name
- **Signal**: Last scanned symbol + direction + score
- **Risk**: Risk per trade %
- **Cycles**: Number of 60s loops completed
- **Trades**: Total trades executed
- **Win Rate**: % of closed trades won

---

## ACTIVITY FEED
- `tf-agent-feed` element in Dashboard tab (line 4131)
- Populated by `ovAddActivity()` — called every 60s loop cycle
- Shows: agent icon, agent name, action text, timestamp
- Max 30 items shown
- Agent cards pulse for 3 seconds on activity

---

## SELF-DIAGNOSTIC STATE SNAPSHOT
Every 60s trading cycle, key state is saved to localStorage key `ms_trading_state`:

```json
{
  "botStatus": "running|stopped|paused",
  "cycle": 42,
  "openTrades": 2,
  "totalTrades": 15,
  "closedTrades": 13,
  "wins": 7,
  "losses": 6,
  "winRate": 53.8,
  "lastSignal": "BTC/USD BUY 5/6",
  "activeStrategy": "Trend Following",
  "dailyPnl": 234.50,
  "totalPnl": 1234.00,
  "balance": 101234.00,
  "errors": [],
  "lastUpdated": "2026-05-04T12:34:56.789Z"
}
```

---

## COMMON ISSUES & FIXES

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Button click does nothing | try-catch caught error | Check browser console for error Toast |
| "Toggle error" Toast | ReferenceError in render chain | Check `renderBusinessPage` for undefined vars |
| Nothing in activity feed | Bot not actually running OR ovAddActivity error | Check header status, check console for ovAddActivity errors |
| Button text not updating | `renderTradeNowStatus` not called | Check if function is called after tcStart/tcStop |
| "Kill switch active" | Previous session had kill switch | Go to Trading Control → deactivate, or clear localStorage |
| Strategy never "active" | `botSeedStrategies` not called or market condition bug | Check `botData.strategies` in console |
| Quality score always 88-98 | Structure Shift factor was broken | Now fixed — reads real marketState.momentum |

---

## NEXT IMPROVEMENTS QUEUED
_none_

---

## TRADING SYSTEM ARCHITECTURE
```
User clicks Start
  → toggleTradeNow() / ovToggleTrade()
    → tcStart() — sets botStatus='running', runs safety checks
    → startAutoStrategy() — detects market cond, selects best strategy
    → ovStartActivitySimulation() — starts 60s interval
    
Every 60 seconds (the interval):
  → ftManageOpenTrades() — check SL/TP on open positions
  → ftCheckSession() — verify trading hours
  → ftDetectRegime() — detect market regime
  → Dynamic threshold adjustment — based on recent win rate
  → seAnalyzeSymbol(symbol) — generate signal for next symbol
  → seRecordSignal(signal) — store signal
  → ftCalculateQualityScore() — score trade 0-100
  → ftCheckRiskLimits() — verify daily limits
  → ftCheckDuplicate() — no repeat trades
  → ftCheckCorrelation() — no correlated pairs
  → ftCheckExecution() — spread check
  → Kelly position sizing
  → alpacaRequest() or simulated order
  → Record trade in ptData.trades[]
  → ftInitTradeManagement() — set SL/TP/partials
```
