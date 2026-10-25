# Celebrations preview

Runs the real `choreops-celebrations.js` in a plain browser against a fake
Home Assistant kiosk, so effects can be tried without touching HA.

```bash
cd tools/preview
npm install
npm run build      # writes preview.html
```

Open `preview.html`, tap a chore to claim it, tap again to approve, and finish
them all for the finale. The demo buttons replay each effect.

`shoot.py <out_dir>` (Python + Playwright) records screenshots and a video of
the full claim → approve → combo → finale sequence for review.
