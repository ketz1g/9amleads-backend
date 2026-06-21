# Mission Control

Automation hub for lead generation and business management.

## What This Is

A Mission Control system to manage:
- Lead generation via Apify scraper
- CRM management
- Brevo email automation
- Task management

## Current Status

**With Apify & Brevo Integration Ready** - No APIs connected yet.

## How to Use

### Open locally:
1. Double-click `index.html` in the folder
2. Or navigate to the folder and open with Chrome/Edge

### Workflow:

#### 1. Configure Integrations (Settings page)
- **Apify**: Enter API token + Actor ID
- **Brevo**: Enter API key + List ID + Sender details

#### 2. Run Apify Scrape (Apify Scraper page)
- Enter search query (e.g., "car dealership UK")
- Enter location (e.g., "London")
- Set daily limit and leads per run
- Click "Start Apify Scrape"
- Results saved to CRM as "Needs Review"

#### 3. Review Leads (Leads CRM page)
- Review "Needs Review" leads
- Click "Approve" or "Reject"
- Approved leads move to "New" status

#### 4. Send to Brevo (Leads CRM or Brevo page)
- Only approved leads can be sent
- Click "Send to Brevo" on approved leads
- No auto-send - manual approval required

## Integration Setup

### Apify
1. Get API token from https://console.apify.com/
2. Find or create an actor (e.g., car dealership scraper)
3. Copy Actor ID (e.g., `username/actor-name`)
4. Add to Settings page

### Brevo
1. Get API key from https://app.brevo.com/
2. Create or find list ID
3. Add to Settings page

**Safety Rules:**
- NO auto-emailing enabled
- AUTO_SEND_EMAILS = false
- AUTO_ADD_TO_BREVO = false
- All sends require manual approval

## Project Structure

```
/mission control/
  index.html          - Main app
  css/styles.css     - Styling
  js/app.js          - App logic
  data/data.json    - Data structure
  agent/             - Agent files
  backup/            - Backups
```

## Data Storage

- Uses localStorage in browser
- Export/Import via Settings page
- No server required

## Future: Replit

- Will deploy to Replit for server
- Store API keys in Replit Secrets
- Enable auto-sync if desired

## Future: GitHub

- Backup via GitHub
- Version history
- Cross-device access