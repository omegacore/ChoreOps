"""Tests for the celebration effects frontend module registration.

The module itself is plain JavaScript; these tests cover the Python side
(static path + extra JS URL registration) and guard the contract between
the JS trigger logic and the integration's chore state / purpose constants.
"""

# pylint: disable=redefined-outer-name

from pathlib import Path
import re
from unittest.mock import AsyncMock, MagicMock, patch

from homeassistant.core import HomeAssistant
import pytest

from custom_components.choreops import const
from custom_components.choreops.helpers import frontend_helpers as fh
from tests.helpers import setup_minimal_scenario

SCRIPT_PATH = fh.FRONTEND_DIR / const.FRONTEND_CELEBRATIONS_FILENAME


def _script_source() -> str:
    return Path(SCRIPT_PATH).read_text(encoding="utf-8")


@pytest.mark.asyncio
async def test_setup_skips_frontend_when_not_loaded(
    hass: HomeAssistant, mock_hass_users: dict
) -> None:
    """Integration setup must succeed without the frontend component."""
    result = await setup_minimal_scenario(hass, mock_hass_users)

    assert result.config_entry is not None
    assert not hass.data.get(const.RUNTIME_KEY_FRONTEND_REGISTERED)


@pytest.mark.asyncio
async def test_register_frontend_serves_and_injects_module(
    hass: HomeAssistant,
) -> None:
    """Static path is registered once and the module URL is injected once."""
    hass.config.components.update({"frontend", "http"})
    http_mock = MagicMock()
    http_mock.async_register_static_paths = AsyncMock()

    with (
        patch.object(hass, "http", http_mock),
        patch.object(fh, "add_extra_js_url") as add_js,
    ):
        assert await fh.async_register_frontend(hass) is True
        assert await fh.async_register_frontend(hass) is True  # idempotent

    http_mock.async_register_static_paths.assert_awaited_once()
    (configs,), _ = http_mock.async_register_static_paths.call_args
    assert configs[0].url_path == const.FRONTEND_URL_BASE
    assert Path(configs[0].path) == fh.FRONTEND_DIR

    add_js.assert_called_once()
    url = add_js.call_args.args[1]
    assert url.startswith(
        f"{const.FRONTEND_URL_BASE}/{const.FRONTEND_CELEBRATIONS_FILENAME}?v="
    )
    assert hass.data[const.RUNTIME_KEY_FRONTEND_REGISTERED] is True


@pytest.mark.asyncio
async def test_register_frontend_failure_does_not_block_setup(
    hass: HomeAssistant, mock_hass_users: dict
) -> None:
    """A frontend registration error is logged, not raised."""
    with patch(
        "custom_components.choreops.async_register_frontend",
        side_effect=RuntimeError("boom"),
    ):
        result = await setup_minimal_scenario(hass, mock_hass_users)

    assert result.config_entry is not None


def test_celebrations_script_matches_integration_contract() -> None:
    """JS trigger constants must stay in sync with const.py."""
    source = _script_source()

    assert f'"{const.TRANS_KEY_PURPOSE_CHORE_STATUS}"' in source
    assert f'"{const.TRANS_KEY_PURPOSE_POINTS}"' in source
    for attr in (
        const.ATTR_USER_NAME,
        const.ATTR_CHORE_NAME,
        const.ATTR_DEFAULT_POINTS,
        const.ATTR_CHORE_CURRENT_STREAK,
    ):
        assert re.search(rf"\b{attr}\b", source), attr

    for state in (
        const.CHORE_STATE_CLAIMED,
        const.CHORE_STATE_CLAIMED_IN_PART,
        const.CHORE_STATE_APPROVED,
        const.CHORE_STATE_APPROVED_IN_PART,
        const.CHORE_STATE_COMPLETED,
        const.CHORE_STATE_COMPLETED_IN_PART,
        const.CHORE_STATE_PENDING,
        const.CHORE_STATE_DUE,
        const.CHORE_STATE_OVERDUE,
    ):
        assert f'"{state}"' in source, state
