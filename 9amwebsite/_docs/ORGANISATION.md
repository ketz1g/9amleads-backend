===============================================
  PROJECT ORGANISATION
===============================================

Desktop folders:

  9amsite/                    — 9am Leads marketing website ONLY
    index.html                (main marketing page)
    movingleadsdaily/         (landing pages)
    probateleads/
    newbusinessalert/
    planningleads/
    tenders/
    portal/                   (customer login & dashboard)
    9amleads/                 (founder, invest, terms pages)

  Mission-Control/            — Mission Control SPA dashboard ONLY
    index.html                (dashboard with trading, businesses, CRM)
    js/app.js
    css/theme.css
    data/                     (business data)
    vidamotor/                (business site files)
    moverstaff/               (business files)

  Crypto-IPO-Research-Agent/  — Independent research agent
    (full project with venv, database, dashboard)

  mission control/            — LIVE DEV WORKSPACE (server + all files)
    server.py                 (Python HTTP server - port 8000)
    production_api_server.js  (API server - port 8012)
    moverstaff-backend.js     (Express API - port 3003)
    index.html                (9am Leads marketing page - served at /)
    index_mc.html             (Mission Control dashboard - backup)
    index.html.backup         (original MC backup)
    + all landing pages + backend files + data

NOTE: The Python server runs from 'mission control' folder and
serves the 9am Leads website. Mission Control dashboard is
now in ../Mission-Control/ on the Desktop.
