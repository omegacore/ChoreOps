"""Headless capture of the celebration effects: python shoot.py <out_dir>"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
page_url = Path(__file__).with_name("preview.html").resolve().as_uri()
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(
        args=["--autoplay-policy=no-user-gesture-required"],
    )
    ctx = browser.new_context(
        viewport={"width": 1024, "height": 640},
        record_video_dir=str(out / "video"),
        record_video_size={"width": 1024, "height": 640},
    )
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(page_url)
    page.wait_for_timeout(600)
    page.screenshot(path=str(out / "00_dashboard.png"))

    cards = page.locator(".chore")
    # Claim "Make the bed"
    cards.nth(0).click()
    page.wait_for_timeout(750)
    page.screenshot(path=str(out / "01_claim.png"))
    page.wait_for_timeout(1500)
    # Approve it
    page.locator(".chore").nth(0).click()
    page.wait_for_timeout(350)
    page.screenshot(path=str(out / "02_approve_early.png"))
    page.wait_for_timeout(700)
    page.screenshot(path=str(out / "03_approve_peak.png"))
    page.wait_for_timeout(2600)

    # Finish everything else quickly via state changes (like a parent bulk-approving)
    page.evaluate(
        """() => { for (const id of Object.keys(window.__s = document.querySelector('home-assistant').hass.states)) {
              const s = window.__s[id]; if (s.attributes.purpose !== 'purpose_chore_status') continue;
              if (s.state === 'pending' || s.state === 'due') setChoreState(id, 'claimed'); } }"""
    )
    page.wait_for_timeout(300)
    page.evaluate(
        """() => { const st = document.querySelector('home-assistant').hass.states;
              for (const id of Object.keys(st)) if (st[id].state === 'claimed') setChoreState(id, 'approved'); }"""
    )
    # Merged combo approval, then finale
    page.wait_for_timeout(900)
    page.screenshot(path=str(out / "04a_combo.png"))
    page.wait_for_timeout(2700)
    for i, delay in enumerate([600, 700, 900]):
        page.wait_for_timeout(delay)
        page.screenshot(path=str(out / f"04_finale_{i}.png"))
    page.wait_for_timeout(3000)
    page.screenshot(path=str(out / "05_after.png"))

    # Dark mode + phone width approve
    page.emulate_media(color_scheme="dark", reduced_motion="no-preference")
    page.set_viewport_size({"width": 390, "height": 760})
    page.evaluate("() => ChoreOpsCelebrations.demo('approve', 'Superstar')")
    page.wait_for_timeout(1000)
    page.screenshot(path=str(out / "06_phone_dark.png"))
    page.wait_for_timeout(3200)
    ctx.close()
    browser.close()

print("ERRORS:", errors or "none")
