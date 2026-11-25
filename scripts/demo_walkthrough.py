"""Click through the six demo-video scenes in a real browser and save screenshots (also a smoke test).

Needs the app running (scripts/run_local.ps1) and Playwright (pip install playwright; python -m playwright install chromium).
Usage: python scripts/demo_walkthrough.py [--base http://localhost:5180] [--out screenshots]
"""
import argparse
import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:5180")
ap.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "screenshots"))
ap.add_argument("--headed", action="store_true")
a = ap.parse_args()
OUT = Path(a.out)
OUT.mkdir(parents=True, exist_ok=True)
errors = []


def test_photo() -> bytes:
    im = Image.new("RGB", (800, 600), (210, 220, 235))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 380, 800, 600], fill=(120, 120, 120))
    d.ellipse([220, 400, 620, 520], fill=(90, 140, 200))
    d.text((20, 20), "test photo (demo walkthrough)", fill=(10, 31, 102))
    buf = io.BytesIO()
    im.save(buf, "JPEG")
    return buf.getvalue()


def shot(page, name, full=True):
    page.wait_for_timeout(900)
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
    print("  saved", name)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=not a.headed)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, geolocation={"latitude": 21.2713, "longitude": 78.5874},
                              permissions=["geolocation"], locale="en-IN")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    print("scene 1: start")
    page.goto(a.base + "/")
    page.get_by_role("radio", name="English").click()
    shot(page, "01_start", full=False)

    print("scene 2: resident logs supply + tanker in Marathi")
    page.get_by_role("button", name="Asha Patil").click()
    page.wait_for_url("**/home")
    shot(page, "02_home_marathi_before")
    page.get_by_role("button", name="आज पाणी आले", exact=True).click()
    page.get_by_role("button", name="2 तास", exact=True).click()
    page.wait_for_timeout(600)
    if page.get_by_role("button", name="टँकर आला").count():
        page.get_by_role("button", name="टँकर आला").click()
    shot(page, "03_home_marathi_logged")

    print("scene 3: groundwater, community reading + trust check")
    page.goto(a.base + "/society")
    page.wait_for_selector("[data-guide=borewell-form]")
    last = page.locator("[data-guide=borewell-form] li .tabnum").first.inner_text().split()[0]
    page.fill("#depth", f"{float(last) + 0.18:.2f}")
    page.get_by_role("button", name="तपासा आणि जतन करा").click()
    page.wait_for_selector("[data-guide=borewell-form] [role=status]")
    shot(page, "04_society_marathi")
    page.goto(a.base + "/groundwater")
    page.wait_for_selector("[data-guide=proof-chart] .recharts-surface")
    shot(page, "05_groundwater_marathi")

    print("scene 4: rainwater checklist + calculator (English)")
    page.get_by_role("radio", name="English").click()
    page.goto(a.base + "/society#rwh")
    page.wait_for_selector("[data-guide=rwh-checklist] li button")
    page.locator("[data-guide=rwh-checklist] li button").nth(2).click()
    page.wait_for_timeout(500)
    page.locator("[data-guide=rwh-calculator] input").nth(0).fill("500")
    page.locator("[data-guide=rwh-calculator] input").nth(1).fill("1000")
    page.locator("[data-guide=rwh-checklist]").scroll_into_view_if_needed()
    shot(page, "06_rwh", full=False)

    print("scene 5: leak report with photo")
    page.goto(a.base + "/leaks/new")
    page.get_by_role("button", name="Burst pipe").click()
    page.set_input_files("input[type=file]", files=[{"name": "leak.jpg", "mimeType": "image/jpeg", "buffer": test_photo()}])
    page.get_by_role("button", name="Use my location").click()
    page.fill("textarea", "Water gushing near the market corner (walkthrough test)")
    page.get_by_role("button", name="Send to the ward utility").click()
    page.wait_for_selector("text=Report sent")
    shot(page, "07_leak_sent")

    print("scene 6: ward officer closes the ticket; hotspot + priority map + outbox")
    page.get_by_title("Sign out").click()
    page.wait_for_url(a.base + "/")
    page.get_by_role("button", name="Priya Wankhede").click()
    page.wait_for_url("**/ward")
    page.wait_for_selector("[data-guide=ticket-board] button")
    new_id = page.url and page.locator("[data-guide=ticket-board] b").filter(has_text="Burst pipe").first.inner_text().split(" ")[0]
    for _ in range(3):
        card = page.locator("[data-guide=ticket-board] div.rounded-xl").filter(has_text=f"{new_id} ·")
        card.get_by_role("button").click()
        page.wait_for_timeout(800)
    print("  ticket", new_id, "->", "Fixed" if page.locator("[data-guide=ticket-board] div.rounded-xl").filter(has_text=f"{new_id} ·").count() and
          not page.locator("[data-guide=ticket-board] div.rounded-xl").filter(has_text=f"{new_id} ·").get_by_role("button").count() else "?")
    page.get_by_role("button", name="Run alert checks").click()
    page.wait_for_selector("[data-guide=priority-map] path.leaflet-interactive")
    shot(page, "08_ward")

    print("community + chat guide")
    page.goto(a.base + "/community")
    page.wait_for_selector("[data-guide=forum]")
    page.get_by_role("button", name="Ask the guide").click()
    page.get_by_role("button", name="What does the 80% range mean?").click()
    page.wait_for_selector("[role=dialog] .border-line p", timeout=30000)
    shot(page, "09_community_chat", full=False)

    print("mobile home (resident)")
    m = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    mp = m.new_page()
    mp.on("pageerror", lambda e: errors.append(f"mobile pageerror: {e}"))
    mp.goto(a.base + "/")
    mp.get_by_role("button", name="Asha Patil").click()
    mp.wait_for_url("**/home")
    shot(mp, "10_mobile_home")
    browser.close()

real = [e for e in errors if "favicon" not in e and "tile.openstreetmap" not in e]
print(f"\nconsole errors: {len(real)}")
for e in real[:20]:
    print("  ", e)
sys.exit(1 if real else 0)
