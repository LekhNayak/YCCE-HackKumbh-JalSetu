# JalSetu: community water portal

**YCCE HackKumbh 2026 · Theme 03 Social Issues · PS 4: Water Scarcity and Groundwater Level Monitoring Dashboard**
Team **BOOMERS** (Sardar Patel Institute of Technology): Lekh Nayak, Vedant Tamboli, Sarang Patil.

JalSetu ("water bridge") is a web app for a residential area facing water shortages:
- residents log when tap water and tankers actually come;
- the housing society looks after its borewell and rainwater-harvesting units;
- leaks go straight to the ward's water utility;
- everyone sees real groundwater data with a 30-day forecast.

It works in English, मराठी and हिंदी, reads cards aloud, and keeps working offline.

## What the problem statement asks for, and where it is

| PS core feature | In JalSetu |
|---|---|
| Community dashboard logging daily water availability and tanker arrival timings | **Home**: one tap logs "water came / no water" (+ hours) and "tanker arrived". **My society**: 60-day supply calendar, tanker on-time %, the secretary's tanker schedule |
| Groundwater depth visualisation from open hydrological sensor feeds or manual community inputs | **Groundwater**: real CGWB and GSDA telemetry wells near the society, the district level with a 7/14/30-day forecast and its 80% range, and community borewell readings checked against nearby wells |
| Rainwater-harvesting maintenance checklist and effectiveness calculator | **My society**: 8-step checklist per unit; calculator for litres a year = area × rainfall × runoff factor (rainfall from Open-Meteo for the location, CHIRPS fallback) |
| Leakage and wastage reporting linked to utility departments | **Report a leak**: photo, place on the map, category. It is routed to the ward's utility by its boundary. Statuses go Received → Assigned → Being fixed → Fixed, with an alert at each step |
| Conservation tips and best-practice forum | **Community**: seasonal tips (with Listen), forum with replies and "helpful" votes |
| Expected prototype: supply schedules, groundwater depth charts, community water-saving logs | All three. The water-saving log has a society leaderboard |

**Beyond the problem statement:**
- an early-warning alert driven by the forecast;
- a trust check on community readings;
- a WhatsApp alert outbox (Twilio-ready);
- a ward officer view with a leak hotspot map and a Maharashtra district priority map;
- a site-guide chat (Groq LLM with an offline FAQ fallback);
- Marathi/Hindi/English voice read-aloud (Gnani, with the browser's voice as fallback);
- an installable offline PWA, where entries logged offline sync later without duplicates.

## Real data vs demo data
- **Real:**
  - 100 groundwater telemetry wells in Nagpur district: CGWB (11) and GSDA (89), via the National Water Data Portal / India-WRIS. Updated by `scripts/ingest_nwdp.py`.
  - The Nagpur district groundwater series.
  - The 7/14/30-day district forecast and its accuracy record.
  - CHIRPS and Open-Meteo rainfall.
  - The rule-based district priority map built from real district data.
  - These live in `backend/data/`.
- **Demo (seeded, labelled "Demo data" in the app):** one ward in Katol (Nagpur district) with five fictional societies and their community entries: supply logs, tanker trips, borewell readings, RWH units, leaks, forum, savings.
  - Seed dates are relative to today.
  - The borewell readings follow the real nearby wells' movement and pass through the same trust check as a real entry.
  - One deliberate outlier is there to show the check flagging it.

### The forecasting engine
An ensemble of a Temporal Fusion Transformer and LightGBM (with no-change and seasonal-naive baselines).
- **Inputs:** well levels, CHIRPS rainfall, ERA5-Land soil moisture/evapotranspiration, temperature and Sentinel-1/2 features.
- **Output:** district groundwater level 7, 14 and 30 days ahead, with q10/q50/q90.
- **Accuracy:** on a locked test (Oct 2025 – Jun 2026, 21 districts) its error was 16% / 23% / 38% lower than a no-change forecast at 7 / 14 / 30 days (p = 0.003). For Nagpur at 30 days it was 62% lower.
- **Engine vs app:** the engine is trained on Colab and is not part of this repo. JalSetu imports its exported files with `scripts/import_forecast.py`.
- **Display rules:** a forecast is always drawn against the observed series from its own data version, labelled with its issue date. When its dates have passed, the app says so and raises no forecast-based alerts.

## How it works
```
 NWDP (CGWB+GSDA wells) ─┐   scripts/ingest_nwdp.py (GitHub Actions, every 6 h)
 forecast engine export ─┤   scripts/import_forecast.py
 CHIRPS / district data ─┘   scripts/build_data.py        ──► backend/data/*.json  (real data)
                                                                  │
 residents / secretary / ward officer ──► React PWA ──► FastAPI ──┤──► SQLite (Postgres via DATABASE_URL)
                                          (EN/MR/HI)               ├──► trust check · tanker rules · early warning · ward routing
                                                                   ├──► alerts outbox ──► Twilio WhatsApp (optional)
                                                                   ├──► Gnani text-to-speech (optional) · Groq site guide (optional)
                                                                   └──► Open-Meteo rainfall (calculator)
```

**Rules (all in `backend/app/services/`, all unit-tested):**
- **Trust check** (`trust.py`): a borewell reading is compared by change, not level, because wells a few hundred metres apart differ by metres.
  - `z = (change of the borewell − median change of the 3 nearest live wells over the same days) / the wells' usual spread`.
  - |z| > 3 flags the reading for the secretary.
  - When the forecast is current, the change must also sit in its 80% range (± 0.5 m).
- **Early warning** (`forecast.py`): fires when the 30-day forecast falls ≥ 0.3 m with the whole 80% range below today, or when the deeper end of the range reaches the society's danger depth.
- **Tanker punctuality** (`community.py`): on time if it arrives ≤ 30 min after schedule; missed if there is no check-in 3 h after schedule.
- **Leak tickets:** routed by point-in-polygon to the ward; escalated after 48 h.

## Run it locally (Windows; Python 3.11+, Node 18+)
```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1      # once
powershell -ExecutionPolicy Bypass -File scripts\run_local.ps1  # API :8100, app :5180
```
- Open http://localhost:5180 and pick a demo user: Asha (resident, Marathi), Rajesh (society secretary) or Priya (ward water officer).
- The first API start creates `backend/jalsetu.db` and loads the demo ward.
- Every key in `backend/.env` is optional (see `.env.example`):
  - without Groq, the chat uses the offline guide;
  - without Gnani, the browser reads aloud;
  - without Twilio, alerts stay in the outbox as "simulated".
- `scripts\reset_demo.ps1` reloads the demo ward (run it just before recording).

### Demo video (≈ 3 min)
| Time | Scene | Where |
|---|---|---|
| 0:00 | The problem | Start page |
| 0:20 | Asha logs "water came, 2 h" and "tanker arrived" in Marathi; the WhatsApp alert appears | Home |
| 0:50 | Groundwater: real nearby wells, district forecast band, proof chart; a borewell reading is checked | My society → Groundwater |
| 1:30 | Rainwater checklist ticked; calculator | My society |
| 2:00 | Leak photo report → ticket → (as Priya) Assigned → Being fixed → Fixed; Asha gets the update | Report a leak → Ward |
| 2:30 | Ward view: hotspot map, district priority map, alert outbox; Listen + chat guide | Ward, Community |

`python scripts/demo_walkthrough.py` clicks through these scenes in a real browser (Playwright) and saves screenshots to `screenshots/`.

## Refreshing the data
```powershell
python scripts\ingest_nwdp.py                       # newest CGWB + GSDA telemetry (also runs in GitHub Actions)
python scripts\import_forecast.py --export <dashboard_export folder> --observed <groundwater_clean.csv> --data-version "CGWB + GSDA wells to 1 Nov 2026"
python scripts\build_data.py --source <folder with the research data>   # full rebuild of backend/data
```

## Tests
```powershell
cd backend;  python -m pytest        # rules + API flow of all six demo scenes (no external calls)
cd frontend; npm test                # translation key parity, speech splitting, number format
cd frontend; npm run build           # type check + production build (PWA)
```

## Deploy
Two Vercel projects from this repo and a Neon Postgres database:

1. **Database.** Create a Neon project (Singapore) and copy its *pooled* connection string. Load the demo ward with `scripts\seed_remote.ps1`; run it again just before a demo, because the dates are relative to today.
2. **API project.** Root Directory `backend` (FastAPI is detected from `app/main.py`). Environment variables:
   - `DATABASE_URL`: the pooled connection string
   - `JALSETU_SECRET`: a long random value (`python -c "import secrets; print(secrets.token_urlsafe(32))"`)
   - `JALSETU_ENV`: `production`
   - Groq, Gnani and Twilio keys are optional, as they are locally.
3. **Web project.** Put the API project's address in `frontend/vercel.json`, then create a project with Root Directory `frontend`. It forwards `/api` and `/uploads` to the API, so users need only this one address.

In production the API refuses to start with the development secret or SQLite, and it does not create or seed tables. Leak photos are stored in the database, and all times are Indian time wherever the server runs.

Without Vercel: `npm run build`, then `SERVE_FRONTEND=1 uvicorn app.main:app` serves the app and the API from one process.

## Project layout
```
backend/   FastAPI app (app/), real data (data/), tests/
frontend/  React + Vite + TypeScript + Tailwind + Recharts + Leaflet + i18next, PWA
scripts/   build_data, import_forecast, ingest_nwdp, demo_walkthrough, setup/run/reset
deck/      the PPT-round deck, image prompts and previews
```

## Sources and credits
**Data**
- **Groundwater:** CGWB and GSDA telemetry, National Water Data Portal (nwdp.nwic.gov.in) and India-WRIS.
- **Rainfall and weather:** CHIRPS (UCSB Climate Hazards Center), Open-Meteo, ERA5-Land (Copernicus) and Sentinel-1/2 (ESA Copernicus).
- **Other:** CGWB Dynamic Ground Water Resources (extraction stage), NITI Aayog Composite Water Management Index (2018).

**Software and services**
- **Maps:** © OpenStreetMap contributors, Leaflet.
- **Libraries and fonts:** React, Recharts, i18next, lucide icons, Poppins (OFL).
- **Start page demo:** built with the Stageshow kit by Benji Taylor (MIT), copied to `frontend/src/stageshow/kit`.
- **Optional services:** Groq, Gnani Vachana, Twilio.
