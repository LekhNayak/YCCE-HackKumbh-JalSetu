# JalSetu site guide

JalSetu is a community water portal for a residential area (the demo ward is in Katol, Nagpur district). Residents log
when tap water and tankers come, the society tracks its borewell and rainwater-harvesting units, leaks are reported to
the ward's water utility, and everyone sees real groundwater data with a 30-day forecast for the district.

Data:
- Real: groundwater sensor wells (CGWB and GSDA telemetry, National Water Data Portal), the district groundwater series,
  the 7/14/30-day district forecast with its 80% range (a TFT + LightGBM ensemble), CHIRPS / Open-Meteo rainfall, and
  the district priority map.
- Community: supply logs, tanker trips, borewell readings, leak reports, forum posts and water-saving logs. In this
  demo they are seeded and marked "Demo data".

## Pages (routes)
- `/home`: the resident's day: log "water came / no water", mark a tanker arrival, next tanker, groundwater outlook, alerts.
- `/society`: the society dashboard: supply calendar, tanker punctuality, groundwater chart, borewell readings,
  rainwater-harvesting checklist and calculator, water-saving leaderboard, alert outbox.
- `/groundwater`: map of nearby real sensor wells, district chart with forecast, and how accurate past forecasts were.
- `/leaks/new`: report a leak with a photo and location. `/leaks`: my reports and their status.
- `/ward`: ward officer view: leak ticket board, hotspot map, tanker reliability by society, district priority map, outbox.
- `/community`: seasonal tips, the forum, and the water-saving log.

## Elements you can highlight (element ids)
| id | What it shows |
|---|---|
| lang-switch | language menu (English, मराठी, हिंदी) |
| persona-switch | switch demo user |
| chat-button | this guide |
| log-supply | the "water came / no water" buttons |
| tanker-card | next tanker and the "tanker arrived" button |
| outlook-card | district groundwater outlook: depth now and expected in 7, 14 and 30 days with a range |
| alerts-card | latest alerts |
| supply-calendar | 60-day calendar of water supply days |
| tanker-stats | tanker on-time percentage and recent trips |
| groundwater-chart | district level over time with the forecast band, nearby wells and community readings |
| borewell-form | add a borewell reading; it is checked against nearby sensor wells |
| wells-map | map of real sensor wells near the society |
| proof-chart | past 30-day forecasts against what actually happened |
| rwh-checklist | pre-monsoon maintenance checklist for rainwater-harvesting units |
| rwh-calculator | litres harvested per year = area x rainfall x runoff factor |
| leak-form | leak report form |
| ticket-board | leak tickets by status |
| hotspot-map | map of leak reports |
| priority-map | Maharashtra district priority map |
| outbox | alerts sent (WhatsApp preview) |
| savings-card | water-saving log and leaderboard |
| forum | community forum |
| tips | water-saving tips |

## Glossary
- **80% range:** the forecast expects the real value to fall inside this range 8 times out of 10.
- **District outlook:** the forecast is for the whole district, not one borewell.
- **Trust check:** a borewell reading's change is compared with how the nearest sensor wells changed over the same days.
- **On-time:** a tanker that arrived within 30 minutes of its scheduled time.
- **Danger depth:** the depth below which the society's borewell pump runs dry.

## Limits
- Sensor wells report with a delay; the date of the latest reading is always shown.
- The forecast is uncertain and district-level; it is shown with its issue date.
