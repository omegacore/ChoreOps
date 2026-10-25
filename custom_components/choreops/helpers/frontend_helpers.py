# File: helpers/frontend_helpers.py
"""Frontend asset registration for ChoreOps.

Serves the celebration effects module (confetti, sparkles and sounds when
chores are claimed/approved) and injects it into every Home Assistant
frontend page, so it works on any dashboard - including kiosks - without
users having to add a Lovelace resource by hand.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import TYPE_CHECKING

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig

from .. import const

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

FRONTEND_DIR = Path(__file__).parent.parent / const.FRONTEND_DIRECTORY


def _file_fingerprint(path: Path) -> str:
    """Return a short content hash used to bust browser caches on upgrade."""
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]


def get_celebrations_url(fingerprint: str) -> str:
    """Return the cache-busted URL the frontend loads the celebrations module from."""
    return (
        f"{const.FRONTEND_URL_BASE}/{const.FRONTEND_CELEBRATIONS_FILENAME}"
        f"?v={fingerprint}"
    )


async def async_register_frontend(hass: HomeAssistant) -> bool:
    """Serve and auto-load the ChoreOps frontend modules.

    Idempotent across config entries: registration happens once per
    Home Assistant run. Returns True when the module is (now) registered.
    """
    if hass.data.get(const.RUNTIME_KEY_FRONTEND_REGISTERED):
        return True

    # frontend + http are loaded during HA bootstrap before custom integrations.
    # They are deliberately not manifest dependencies: when they are absent
    # (headless/test setups) the celebrations are simply skipped.
    loaded = hass.config.components
    if "frontend" not in loaded or "http" not in loaded:
        const.LOGGER.debug("Frontend not loaded; skipping ChoreOps celebrations")
        return False

    script_path = FRONTEND_DIR / const.FRONTEND_CELEBRATIONS_FILENAME
    if not await hass.async_add_executor_job(script_path.is_file):
        const.LOGGER.warning(
            "ChoreOps celebrations script missing at %s; skipping", script_path
        )
        return False

    fingerprint = await hass.async_add_executor_job(_file_fingerprint, script_path)

    await hass.http.async_register_static_paths(
        [StaticPathConfig(const.FRONTEND_URL_BASE, str(FRONTEND_DIR), True)]
    )
    add_extra_js_url(hass, get_celebrations_url(fingerprint))
    hass.data[const.RUNTIME_KEY_FRONTEND_REGISTERED] = True
    const.LOGGER.debug("Registered ChoreOps celebrations frontend module")
    return True
