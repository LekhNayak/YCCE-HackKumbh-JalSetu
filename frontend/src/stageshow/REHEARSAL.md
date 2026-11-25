# Rehearsal: start page hero and feature tiles

Skill: stageshow 1.1.1 (`.claude/skills/stageshow`), commit 299140f.

## Hero: `TankerDemo.tsx`
Gold: `device-pair` for the layout (window pinned top-left and off the bottom, phone straddling its right edge over empty page) and `hero-demo` for the cursor story. Changed: JalSetu's own tokens, icons and strings; the phone shows the app's Alerts list, because the product does not send native push.

Beats: 1 log "water came" → 2 pick 2 h, today's square fills → 3 mark the tanker as arrived → payoff: the alert lands on a neighbour's phone in another language. Loop about 10 s. Narrow (under 730 px): the tanker card and the phone only.

## Tiles: `FeatureTiles.tsx`
Three stills, one kind each (`references/bento.md`): chart, component, count. Groundwater values are the run issued 4 Jun 2026 in `backend/data/forecast_run.json`, dated in the tile. Rainwater is the calculator's rule on a 250 m² roof with `default_annual_mm` from `rain_nagpur.json`. Both are fixed values: update them by hand after a new forecast import.

## Captured
- Widths: 1440, 1280, 1152, 1024, 820, 800, 770, 768, 640, 412, 390, 360, 320.
- Languages: English, Marathi, Hindi.
- States: full loop and seam at 1440 and 390, paused, reduced motion.
- No horizontal overflow; smallest text in any stage 10 px or more; no `[stageshow]` console warnings over two loops.

## Gate
**Not run.** `film.mjs --gate` needs `playwright-core`, which was not installed. The frames above were shot with the project's Python Playwright instead, which samples stills and does not check frame-by-frame jumps. To run it:

    cd .claude/skills/stageshow && npm install
    node scripts/film.mjs http://localhost:5180 --select ".start-demo" --gate
    node scripts/film.mjs http://localhost:5180 --select ".start-demo" --width 390 --gate

## Kit changes
One: an unused `useLayoutEffect` import removed from `kit/phone.tsx`, because the project's `noUnusedLocals` rejects it.

## Not checked
The gold examples filmed side by side; a fresh-eye review (`references/review.md`); presses and the alert's arrival at 40 to 80 ms steps; a physical phone; Firefox and Safari; `class-clash.mjs`.
