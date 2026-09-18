# EPC Address Index — Monthly Refresh (Ops Note)

The moving-lead supply depends on the **EPC address index**, which resolves a house number
for a `street + postcode` (Rightmove/Zoopla/OTM hide the number in list view). It's built
from the **free UK EPC open data** (Open Government Licence) and stored as SQLite on the
Render disk, queried per postcode. Refreshing keeps it current with newly published
certificates.

## When
- An automatic **reminder email** arrives on the **1st of each month** (08:00 UK).
- Skipping a month is safe — the index stays valid, it just misses the newest certificates.

## Steps (about 20 minutes)

1. **Download** the latest domestic EPC CSV zip (free):
   https://epc.opendatacommunities.org
   - Select **Domestic Energy Performance Certificates**
   - Choose the areas you serve (or all), the **widest date range**, and **CSV**
   - Save the zip (e.g. `domestic-csv.zip`)

2. **Build the gzipped index** locally (streams the ~90 GB zip, no full extract):
   ```
   cd "C:\Users\ketzm\mission control"
   node build_epc_index.js "<path-to-zip>" "data" "AB,AL,BA,BB,BD,BH,BL,BR,BS,CA,CF,CH,CM,CO,CR,CT,CW,DA,DD,DE,DG,DH,DL,DN,DT,E,EC,EH,EN,FK,FY,G,GL,GU,HA,HD,HG,HP,HS,HU,HX,IG,IV,KA,KT,KW,KY,L,LA,LD,LE,LL,LS,LU,M,ME,MK,ML,N,NE,NP,NW,OL,PA,PH,PO,PR,RG,RM,S,SA,SE,SG,SK,SM,SN,SO,SP,SR,SS,ST,SW,SY,TA,TD,TF,TN,TS,TW,UB,W,WA,WC,WD,WF,WN,YO,ZE"
   ```
   (The area list = every postcode area any customer targets. Ask your assistant to
   regenerate it if customer areas change.)
   - Output: `data\epc-index.tsv.gz` (~90 MB)

3. **Gzip it** (the build writes a plain `.tsv`; compress it):
   ```
   # PowerShell
   $in="data\epc-index.tsv"; $out="$in.gz"
   $fs=[IO.File]::OpenRead($in); $os=[IO.File]::Create($out)
   $gz=New-Object IO.Compression.GZipStream($os,[IO.Compression.CompressionLevel]::Optimal)
   $fs.CopyTo($gz); $gz.Close(); $os.Close(); $fs.Close()
   ```

4. **Upload it** to the live server (raw gzip body):
   ```
   curl.exe -X POST "https://nineamleads-backend.onrender.com/api/admin/upload-epc-gz" ^
     -H "Authorization: Bearer <ADMIN_PASSWORD>" ^
     -H "Content-Type: application/gzip" --data-binary "@data\epc-index.tsv.gz"
   ```

5. **Rebuild the SQLite index** on the server:
   ```
   curl.exe -X POST "https://nineamleads-backend.onrender.com/api/admin/build-epc-sqlite" ^
     -H "Authorization: Bearer <ADMIN_PASSWORD>" -H "Content-Type: application/json" -d "{}"
   ```

6. **Verify** (should return a real address):
   ```
   curl.exe "https://nineamleads-backend.onrender.com/api/admin/epc-status?street=Mynachdy%20Road&postcode=CF14%203HL" ^
     -H "Authorization: Bearer <ADMIN_PASSWORD>"
   ```

## Endpoints reference
| Endpoint | Purpose |
|---|---|
| `POST /api/admin/upload-epc-gz` | write the gzipped TSV to the data disk (raw `application/gzip`) |
| `POST /api/admin/build-epc-sqlite` | build `epc-index.db` from the gz on the box |
| `GET  /api/admin/epc-status` | is the index loaded + resolve a sample (`?street=&postcode=`) |
| `POST /api/admin/enrich-pool` | run the enrichment now (`{max}` optional) |
| `GET  /api/admin/pool-postcodes?product=moving` | distinct postcodes in the pool |

## Notes
- **Disk:** the SQLite index is ~1.2 GB; the Render disk is 3 GB (resized for this).
- **Cost:** EPC is free. Only OTM page fetches use bandwidth (capped at `MOVING_ENRICH_DAILY_CAP`, default 250/day).
- **Freshness:** the 24h-fresh / 48h-fallback gate is unaffected by the index.
