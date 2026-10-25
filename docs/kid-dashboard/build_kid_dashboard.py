"""Builds the kid "quest" Lovelace dashboard (button-card + auto-entities).

Output uses __USER__ / __USER_SLUG__ placeholders; replace them with the
assignee name and its entity slug (e.g. "Alex" / "alex") before saving.
"""

import json
import sys

USER = "__USER__"

# Shared JS helpers prepended to button-card templates.
JS_COMMON = r"""
const DONE = ['approved','approved_in_part','already_approved','completed','completed_in_part'];
const PALETTES = [
  {a:'#FF5C8A', d:'#D93A68', b:'#FFE6EE'}, {a:'#7B61FF', d:'#5A41DB', b:'#ECE8FF'},
  {a:'#00A6D6', d:'#0083AD', b:'#DDF4FB'}, {a:'#FF9F1C', d:'#DB7E00', b:'#FFF0DA'},
  {a:'#22B8A7', d:'#14907F', b:'#DDF6F2'}, {a:'#E255B9', d:'#BC3594', b:'#FCE4F5'}];
const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const pointsSensor = () => Object.values(states).find(s => s.attributes.purpose === 'purpose_points' && s.attributes.user_name === variables.user);
const unit = () => { const p = pointsSensor(); return (p && p.attributes.unit_of_measurement) || 'Points'; };
const fmt = (n) => { const x = Number(n); return Number.isFinite(x) ? (Math.round(x * 10) / 10).toString() : '--'; };
"""


def js(body: str) -> str:
    return "[[[ " + JS_COMMON + body + " ]]]"


STATE_STYLES = r"""
const raw = entity.state;
const st = DONE.includes(raw) ? 'done' : raw;
const pal = PALETTES[hash(entity.attributes.chore_name || entity.entity_id) % PALETTES.length];
const canClaim = entity.attributes.can_claim === true;
const locked = !canClaim && !['claimed','claimed_in_part','done'].includes(st);
"""

CHORE_TEMPLATE = {
    "variables": {"user": USER},
    "show_name": False,
    "show_icon": False,
    "show_state": False,
    "hold_action": {"action": "more-info"},
    "tap_action": {
        "action": js(STATE_STYLES + r"""
          if (locked || st === 'done' || ['waiting','missed','paused','completed_by_other','not_my_turn','standby'].includes(st)) return 'none';
          return 'call-service';"""),
        "service": "button.press",
        "data": {
            "entity_id": js(r"""
              if (entity.state === 'claimed') return entity.attributes.approve_button_eid || entity.attributes.claim_button_eid;
              return entity.attributes.claim_button_eid || entity.attributes.approve_button_eid;""")
        },
        "haptic": "success",
    },
    "extra_styles": r"""
      @keyframes lq-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
      @keyframes lq-wiggle { 0%,88%,100% { transform: rotate(0) } 91% { transform: rotate(-2.5deg) } 94% { transform: rotate(2.5deg) } 97% { transform: rotate(-1.5deg) } }
      @keyframes lq-stripes { from { background-position: 0 0 } to { background-position: 56px 0 } }
      @keyframes lq-stamp { 0% { transform: scale(2.2) rotate(-25deg); opacity: 0 } 70% { transform: scale(.9) rotate(-8deg); opacity: 1 } 100% { transform: scale(1) rotate(-10deg) } }
      @keyframes lq-spin { to { transform: rotate(360deg) } }
      @keyframes lq-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,.0) } 50% { box-shadow: 0 0 0 8px rgba(255,255,255,.55) } }
      ha-card { transition: transform .12s ease, box-shadow .12s ease; -webkit-tap-highlight-color: transparent; }
      ha-card:active { transform: translateY(5px) scale(.98) !important; }
      .lq { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;
            font-family: ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif; color: #2B2140; }
      .bubble { position: relative; width: 84px; height: 84px; border-radius: 50%; display: grid; place-items: center; color: #fff; }
      .bubble ha-icon { --mdc-icon-size: 48px; width: 48px; height: 48px; display: inline-flex; }
      .bubble.claimed::after { content: ""; position: absolute; inset: -7px; border-radius: 50%;
            border: 4px dashed rgba(123,97,255,.75); animation: lq-spin 6s linear infinite; }
      .check { position: absolute; right: -6px; bottom: -4px; width: 34px; height: 34px; border-radius: 50%;
            background: #1FB45A; border: 3px solid #fff; display: grid; place-items: center; }
      .check ha-icon { --mdc-icon-size: 20px; width: 20px; height: 20px; display: inline-flex; color: #fff; }
      .name { font-size: 21px; font-weight: 900; line-height: 1.1; }
      .desc { font-size: 13px; font-weight: 600; opacity: .7; line-height: 1.25; max-width: 95%; }
      .pts { display: inline-flex; align-items: center; gap: 4px; font-weight: 900; font-size: 15px;
            padding: 4px 12px; border-radius: 999px; background: #FFD60A; color: #5A2A00; box-shadow: 0 3px 0 #E0A800; }
      .pts ha-icon { --mdc-icon-size: 17px; width: 17px; height: 17px; display: inline-flex; }
      .cta { margin-top: 2px; display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 999px;
            font-weight: 900; font-size: 15px; letter-spacing: .3px; color: #fff; }
      .cta ha-icon { --mdc-icon-size: 20px; width: 20px; height: 20px; display: inline-flex; }
      .cta.go { animation: lq-glow 2.4s ease-in-out infinite; }
      .cta.wait { background: repeating-linear-gradient(-45deg, #7B61FF 0 14px, #9580FF 14px 28px);
            background-size: 56px 56px; animation: lq-stripes 1.2s linear infinite; }
      .stamp { position: absolute; top: 14px; right: 10px; padding: 4px 10px; border: 4px solid #1FB45A; border-radius: 12px;
            color: #1FB45A; font-weight: 900; font-size: 20px; letter-spacing: 1px; background: rgba(255,255,255,.85);
            animation: lq-stamp .6s cubic-bezier(.3,1.6,.5,1) both; transform: rotate(-10deg); }
      .streak { position: absolute; top: 14px; left: 12px; display: inline-flex; align-items: center; gap: 2px;
            font-weight: 900; font-size: 14px; color: #FF7A00; }
      .streak ha-icon { --mdc-icon-size: 18px; width: 18px; height: 18px; display: inline-flex; }
    """,
    "styles": {
        "card": [
            {"padding": "20px 14px 18px"},
            {"border-radius": "30px"},
            {"position": "relative"},
            {"overflow": "visible"},
            {"min-height": "250px"},
            {"background": js(STATE_STYLES + r"""
              if (st === 'done') return 'linear-gradient(160deg, #E8FBEA, #CFF5D6)';
              if (st === 'claimed' || st === 'claimed_in_part') return 'linear-gradient(160deg, #F1ECFF, #E2D9FF)';
              return `linear-gradient(160deg, #FFFFFF, ${pal.b})`;""")},
            {"border": js(STATE_STYLES + r"""
              if (st === 'done') return '4px solid #1FB45A';
              if (st === 'claimed' || st === 'claimed_in_part') return '4px solid #7B61FF';
              if (st === 'overdue') return '4px solid #FF3B30';
              if (st === 'due') return '4px solid #FF9F1C';
              return `4px solid ${pal.a}`;""")},
            {"box-shadow": js(STATE_STYLES + r"""
              if (st === 'done') return '0 7px 0 #14904A';
              if (st === 'claimed' || st === 'claimed_in_part') return '0 7px 0 #5A41DB';
              if (locked) return '0 7px 0 #B9B4C6';
              return `0 7px 0 ${pal.d}`;""")},
            {"opacity": js(STATE_STYLES + "return locked ? '0.55' : '1';")},
            {"animation": js(STATE_STYLES + r"""
              const delay = (hash(entity.entity_id) % 1000) / 1000 * 2.6;
              if (st === 'overdue' || st === 'due') return `lq-wiggle 3s ease-in-out ${delay}s infinite`;
              if (st === 'pending') return `lq-bob 2.6s ease-in-out ${delay}s infinite`;
              return 'none';""")},
        ],
        "grid": [{"grid-template-areas": '"body"'}, {"grid-template-columns": "1fr"}],
        "custom_fields": {
            "undo": [
                {"position": "absolute"},
                {"right": "12px"},
                {"bottom": "12px"},
                {"display": "[[[ return entity.state === 'claimed' ? 'block' : 'none'; ]]]"},
            ]
        },
    },
    "custom_fields": {
        "body": js(STATE_STYLES + r"""
          const a = entity.attributes;
          const icon = a.icon || 'mdi:broom';
          const claimed = st === 'claimed' || st === 'claimed_in_part';
          const bubbleBg = st === 'done' ? '#1FB45A' : claimed ? '#7B61FF' : pal.a;
          let cta;
          if (st === 'done') cta = '';
          else if (claimed) cta = `<span class="cta wait"><ha-icon icon="mdi:timer-sand"></ha-icon>Waiting for a grown-up</span>`;
          else if (locked) cta = `<span class="cta" style="background:#A49FB3"><ha-icon icon="mdi:lock-outline"></ha-icon>Not yet</span>`;
          else if (st === 'overdue') cta = `<span class="cta go" style="background:#FF3B30"><ha-icon icon="mdi:alarm"></ha-icon>Hurry, tap when done!</span>`;
          else if (st === 'due') cta = `<span class="cta go" style="background:#FF9F1C"><ha-icon icon="mdi:bell-ring"></ha-icon>Due now, tap when done!</span>`;
          else cta = `<span class="cta go" style="background:${pal.a}"><ha-icon icon="mdi:gesture-tap"></ha-icon>Tap when done!</span>`;
          const streak = Number(a.chore_current_streak || 0);
          return `<div class="lq">
            ${streak > 1 ? `<span class="streak"><ha-icon icon="mdi:fire"></ha-icon>${streak}</span>` : ''}
            ${st === 'done' ? '<span class="stamp">DONE!</span>' : ''}
            <div class="bubble ${claimed ? 'claimed' : ''}" style="background:${bubbleBg}">
              <ha-icon icon="${esc(icon)}"></ha-icon>
              ${st === 'done' ? '<span class="check"><ha-icon icon="mdi:check-bold"></ha-icon></span>' : ''}
            </div>
            <div class="name">${esc(a.chore_name || entity.attributes.friendly_name)}</div>
            ${a.description ? `<div class="desc">${esc(a.description)}</div>` : ''}
            <span class="pts"><ha-icon icon="mdi:star"></ha-icon>+${fmt(a.default_points)} ${esc(unit())}</span>
            ${cta}
          </div>`;"""),
        "undo": {
            "card": {
                "type": "custom:button-card",
                "entity": "[[[ return entity.entity_id; ]]]",
                "icon": "mdi:undo-variant",
                "name": "Undo",
                "show_state": False,
                "layout": "icon_name",
                "styles": {
                    "card": [
                        {"padding": "4px 10px"},
                        {"border-radius": "999px"},
                        {"background": "rgba(255,255,255,.9)"},
                        {"border": "2px solid #CFC6F5"},
                        {"box-shadow": "none"},
                    ],
                    "icon": [{"width": "16px"}, {"color": "#7B61FF"}],
                    "name": [{"font-size": "12px"}, {"font-weight": "800"}, {"color": "#5A41DB"}],
                },
                "tap_action": {
                    "action": "call-service",
                    "service": "button.press",
                    "data": {"entity_id": "[[[ return entity.attributes.disapprove_button_eid; ]]]"},
                },
            }
        },
    },
}

HERO_TEMPLATE = {
    "variables": {"user": USER},
    "show_name": False,
    "show_icon": False,
    "show_state": False,
    "tap_action": {"action": "none"},
    "extra_styles": r"""
      @keyframes lq-float { 0%,100% { transform: translateY(0) rotate(-4deg) } 50% { transform: translateY(-8px) rotate(4deg) } }
      @keyframes lq-twinkle { 0%,100% { transform: scale(1) rotate(0); } 50% { transform: scale(1.18) rotate(18deg); } }
      @keyframes lq-bar { from { background-position: 0 0 } to { background-position: 48px 0 } }
      @keyframes lq-grow { from { width: 0 } }
      .hero { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 18px; color: #fff;
            font-family: ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif; text-align: left; }
      .avatar { width: 92px; height: 92px; border-radius: 50%; background: rgba(255,255,255,.95); display: grid; place-items: center;
            color: #E255B9; box-shadow: 0 6px 0 rgba(0,0,0,.12); animation: lq-float 3.2s ease-in-out infinite; }
      .avatar ha-icon { --mdc-icon-size: 60px; width: 60px; height: 60px; display: inline-flex; }
      .hello { font-size: 18px; font-weight: 800; opacity: .95; }
      .who { font-size: clamp(34px, 6vw, 52px); font-weight: 900; line-height: 1; text-shadow: 0 3px 0 rgba(0,0,0,.15); }
      .bank { text-align: center; background: rgba(255,255,255,.95); color: #5A2A00; border-radius: 26px; padding: 10px 18px 12px;
            box-shadow: 0 6px 0 rgba(0,0,0,.12); min-width: 110px; }
      .bank ha-icon { --mdc-icon-size: 34px; width: 34px; height: 34px; display: inline-flex; color: #FFB703; animation: lq-twinkle 2.4s ease-in-out infinite; }
      .bank .n { font-size: 40px; font-weight: 900; line-height: 1; }
      .bank .u { font-size: 13px; font-weight: 800; opacity: .7; text-transform: uppercase; letter-spacing: 1px; }
      .quest { grid-column: 1 / -1; background: rgba(255,255,255,.18); border-radius: 22px; padding: 12px 14px; }
      .qhead { display: flex; justify-content: space-between; align-items: center; font-weight: 900; font-size: 17px; margin-bottom: 8px; gap: 8px; }
      .qhead ha-icon { --mdc-icon-size: 22px; width: 22px; height: 22px; display: inline-flex; vertical-align: -4px; }
      .track { height: 22px; border-radius: 999px; background: rgba(255,255,255,.35); overflow: hidden; }
      .fill { height: 100%; border-radius: 999px; animation: lq-grow 1.2s cubic-bezier(.3,1.2,.5,1) both, lq-bar 1s linear infinite;
            background: repeating-linear-gradient(-45deg, #FFD60A 0 12px, #FFE66D 12px 24px); background-size: 48px 48px;
            box-shadow: inset 0 -3px 0 rgba(0,0,0,.08); }
      .stats { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .stat { background: rgba(255,255,255,.95); color: #2B2140; border-radius: 18px; padding: 8px 6px; text-align: center; }
      .stat ha-icon { --mdc-icon-size: 22px; width: 22px; height: 22px; display: inline-flex; }
      .stat .v { font-size: 22px; font-weight: 900; line-height: 1.05; }
      .stat .l { font-size: 11px; font-weight: 800; opacity: .65; text-transform: uppercase; letter-spacing: .5px; }
      @media (max-width: 520px) { .hero { grid-template-columns: auto 1fr; } .bank { grid-column: 1 / -1; } .avatar { width: 72px; height: 72px; } }
    """,
    "styles": {
        "card": [
            {"padding": "20px"},
            {"border-radius": "32px"},
            {"background": "linear-gradient(135deg, #7B61FF 0%, #E255B9 55%, #FF9F1C 100%)"},
            {"border": "none"},
            {"box-shadow": "0 8px 0 #5A41DB33, 0 18px 40px rgba(123,97,255,.35)"},
        ],
        "grid": [{"grid-template-areas": '"body"'}, {"grid-template-columns": "1fr"}],
    },
    "custom_fields": {
        "body": js(r"""
          const who = variables.user;
          const mine = Object.values(states).filter(s => s.attributes.purpose === 'purpose_chore_status' && s.attributes.user_name === who
              && !['paused','not_my_turn','completed_by_other','waiting','standby'].includes(s.state));
          const done = mine.filter(s => DONE.includes(s.state)).length;
          const waiting = mine.filter(s => s.state === 'claimed' || s.state === 'claimed_in_part').length;
          const total = mine.length;
          const pct = total ? Math.round(done / total * 100) : 0;
          const h = new Date().getHours();
          const hello = h < 12 ? 'Good morning,' : h < 17 ? 'Good afternoon,' : 'Good evening,';
          const chores = Object.values(states).find(s => s.attributes.purpose === 'purpose_chores' && s.attributes.user_name === who);
          const ca = chores ? chores.attributes : {};
          const p = entity.attributes;
          let msg;
          if (total && done === total) msg = `<span><ha-icon icon="mdi:trophy"></ha-icon> All done! You're a superstar!</span>`;
          else if (waiting) msg = `<span><ha-icon icon="mdi:timer-sand"></ha-icon> ${done} of ${total} done, ${waiting} waiting</span>`;
          else msg = `<span><ha-icon icon="mdi:map-marker-star"></ha-icon> Today's quest: ${done} of ${total} done</span>`;
          return `<div class="hero">
            <div class="avatar"><ha-icon icon="mdi:unicorn-variant"></ha-icon></div>
            <div><div class="hello">${hello}</div><div class="who">${esc(who)}!</div></div>
            <div class="bank"><ha-icon icon="mdi:star-four-points"></ha-icon><div class="n">${fmt(entity.state)}</div><div class="u">${esc(unit())}</div></div>
            <div class="quest"><div class="qhead">${msg}<span>${pct}%</span></div>
              <div class="track"><div class="fill" style="width:${Math.max(pct, 4)}%"></div></div></div>
            <div class="stats">
              <div class="stat"><ha-icon icon="mdi:calendar-star" style="color:#7B61FF"></ha-icon><div class="v">${fmt(p.point_stat_points_earned_week)}</div><div class="l">${esc(unit())} this week</div></div>
              <div class="stat"><ha-icon icon="mdi:fire" style="color:#FF7A00"></ha-icon><div class="v">${fmt(ca.chore_stat_longest_streak)}</div><div class="l">Best streak</div></div>
              <div class="stat"><ha-icon icon="mdi:check-decagram" style="color:#1FB45A"></ha-icon><div class="v">${fmt(ca.chore_stat_approved_all_time)}</div><div class="l">Chores ever</div></div>
            </div>
          </div>`;""")
    },
}

REWARD_TEMPLATE = {
    "variables": {"user": USER},
    "show_name": False,
    "show_icon": False,
    "show_state": False,
    "hold_action": {"action": "more-info"},
    "tap_action": {
        "action": js(r"""
          const p = pointsSensor(); const bal = Number(p ? p.state : 0); const cost = Number(entity.attributes.cost || 0);
          return (bal >= cost && Number(entity.attributes.pending_claims || 0) === 0) ? 'call-service' : 'none';"""),
        "service": "button.press",
        "data": {"entity_id": "[[[ return entity.attributes.claim_button_eid; ]]]"},
        "confirmation": {"text": "[[[ return `Use ${entity.attributes.cost} points on ${entity.attributes.reward_name}?`; ]]]"},
    },
    "extra_styles": r"""
      @keyframes lq-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.04) } }
      @keyframes lq-grow { from { width: 0 } }
      .rw { display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: center; text-align: left; color: #2B2140;
            font-family: ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif; }
      .gift { width: 70px; height: 70px; border-radius: 22px; display: grid; place-items: center; color: #fff;
            background: linear-gradient(135deg, #FF5C8A, #FF9F1C); box-shadow: 0 5px 0 #D93A68; }
      .gift ha-icon { --mdc-icon-size: 40px; width: 40px; height: 40px; display: inline-flex; }
      .t { font-size: 20px; font-weight: 900; }
      .d { font-size: 13px; font-weight: 700; opacity: .65; }
      .track { margin-top: 8px; height: 18px; border-radius: 999px; background: #EEE8F7; overflow: hidden; }
      .fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #FF5C8A, #FF9F1C); animation: lq-grow 1.2s ease-out both; }
      .meta { margin-top: 6px; display: flex; justify-content: space-between; font-weight: 900; font-size: 14px; gap: 8px; }
      .ready { grid-column: 1 / -1; text-align: center; padding: 10px; border-radius: 999px; color: #fff; font-weight: 900; font-size: 17px;
            background: linear-gradient(90deg, #1FB45A, #22B8A7); box-shadow: 0 5px 0 #14904A; animation: lq-pulse 1.4s ease-in-out infinite; }
    """,
    "styles": {
        "card": [
            {"padding": "16px 18px"},
            {"border-radius": "28px"},
            {"background": "#FFFFFF"},
            {"border": "4px solid #FFD0DE"},
            {"box-shadow": "0 6px 0 #FFB3C9"},
        ],
        "grid": [{"grid-template-areas": '"body"'}, {"grid-template-columns": "1fr"}],
    },
    "custom_fields": {
        "body": js(r"""
          const a = entity.attributes;
          const p = pointsSensor(); const bal = Number(p ? p.state : 0); const cost = Number(a.cost || 0);
          const pct = cost ? Math.min(100, Math.round(bal / cost * 100)) : 100;
          const left = Math.max(0, cost - bal);
          const pending = Number(a.pending_claims || 0) > 0;
          let tail;
          if (pending) tail = `<div class="ready" style="background:linear-gradient(90deg,#7B61FF,#9580FF);box-shadow:0 5px 0 #5A41DB;animation:none">Asked! Waiting for a grown-up</div>`;
          else if (left <= 0) tail = `<div class="ready">You can get this! Tap to ask</div>`;
          else tail = '';
          return `<div class="rw">
            <div class="gift"><ha-icon icon="${esc(a.icon || 'mdi:gift')}"></ha-icon></div>
            <div><div class="t">${esc(a.reward_name)}</div>${a.description ? `<div class="d">${esc(a.description)}</div>` : ''}
              <div class="track"><div class="fill" style="width:${Math.max(pct, 3)}%"></div></div>
              <div class="meta"><span>${fmt(bal)} / ${fmt(cost)} ${esc(unit())}</span><span>${left > 0 ? fmt(left) + ' to go!' : 'Ready!'}</span></div></div>
            ${tail}
          </div>`;""")
    },
}

LABEL_TEMPLATE = {
    "show_icon": True,
    "show_state": False,
    "tap_action": {"action": "none"},
    "styles": {
        "card": [
            {"background": "none"},
            {"border": "none"},
            {"box-shadow": "none"},
            {"padding": "14px 6px 0"},
        ],
        "grid": [{"grid-template-areas": '"i n"'}, {"grid-template-columns": "min-content 1fr"}, {"justify-items": "start"}],
        "icon": [{"width": "28px"}, {"color": "#7B61FF"}],
        "name": [
            {"font-size": "24px"},
            {"font-weight": "900"},
            {"color": "#2B2140"},
            {"padding-left": "8px"},
            {"font-family": 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif'},
        ],
    },
}


def label(text, icon):
    return {"type": "custom:button-card", "template": "lq_label", "name": text, "icon": icon}


def auto_grid(purpose, template, columns, sort_by="attribute", sort_attr="chore_name"):
    return {
        "type": "custom:auto-entities",
        "card": {"type": "grid", "columns": columns, "square": False},
        "card_param": "cards",
        "show_empty": False,
        "filter": {
            "include": [
                {
                    "attributes": {"purpose": purpose, "user_name": USER},
                    "options": {"type": "custom:button-card", "template": template},
                }
            ]
        },
        "sort": {"method": "attribute", "attribute": sort_attr},
    }


config = {
    "title": f"{USER}'s Chores",
    "button_card_templates": {
        "lq_chore": CHORE_TEMPLATE,
        "lq_hero": HERO_TEMPLATE,
        "lq_reward": REWARD_TEMPLATE,
        "lq_label": LABEL_TEMPLATE,
    },
    "views": [
        {
            "title": USER,
            "path": "today",
            "icon": "mdi:star-shooting",
            "type": "panel",
            "background": "center / cover no-repeat fixed linear-gradient(160deg, #FFF4DE 0%, #FDE6F2 45%, #E4EDFF 100%)",
            "cards": [
                {
                    "type": "vertical-stack",
                    "cards": [
                        {"type": "custom:button-card", "template": "lq_hero", "entity": "sensor.__USER_SLUG___choreops_points"},
                        label("Today's chores", "mdi:format-list-checks"),
                        auto_grid("purpose_chore_status", "lq_chore", 3),
                        label("Saving up for", "mdi:gift-outline"),
                        auto_grid("purpose_reward_status", "lq_reward", 1, sort_attr="cost"),
                    ],
                }
            ],
        }
    ],
}

json.dump(config, open(sys.argv[1], "w"))
print("bytes", len(json.dumps(config)))
