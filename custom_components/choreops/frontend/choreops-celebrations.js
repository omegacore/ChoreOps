/*
 * ChoreOps Celebrations
 * ---------------------
 * Loaded on every Home Assistant frontend page by the ChoreOps integration.
 * Watches chore status sensors and throws a party when chores get done:
 *
 *   claimed   -> sparkle burst, shockwave ring, chime, "claimed!" toast
 *   approved  -> confetti cannons, stars, fanfare, banner with points count-up
 *   all done  -> fireworks finale when an assignee clears every open chore
 *
 * No external assets: visuals are drawn on a canvas overlay, sounds are
 * synthesized with the Web Audio API, icons use HA's built-in <ha-icon>.
 *
 * Per-device settings (persisted in localStorage):
 *   URL params      ?choreops_fx=on|quiet|off|everywhere   ?choreops_fx_users=Name1,Name2
 *   Effects show only on dashboards that display ChoreOps chores unless
 *   ?choreops_fx=everywhere (or configure({ everywhere: true })) is set.
 *   Browser console ChoreOpsCelebrations.configure({ volume: 0.5 })
 *                   ChoreOpsCelebrations.demo('claim' | 'approve' | 'finale')
 */
(() => {
  "use strict";
  if (window.ChoreOpsCelebrations) return;

  const VERSION = "1.1.0";
  const PURPOSE_CHORE_STATUS = "purpose_chore_status";
  const CLAIMED = new Set(["claimed", "claimed_in_part"]);
  const DONE = new Set([
    "approved",
    "approved_in_part",
    "already_approved",
    "completed",
    "completed_in_part",
  ]);
  const OPEN = new Set(["pending", "due", "overdue"]);
  const CLAIM_ACCENT = "#a957fa";
  const COLORS = [
    "#FF4D6D", "#FFB703", "#FB8500", "#06D6A0", "#118AB2",
    "#8338EC", "#FF006E", "#3A86FF", "#FFD60A", "#2EC4B6",
  ];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ------------------------------------------------------------------ */
  /* Settings                                                            */
  /* ------------------------------------------------------------------ */
  const STORE_KEY = "choreops_celebrations";
  const DEFAULTS = {
    enabled: true,
    sound: true,
    volume: 0.7,
    intensity: 1,
    users: [],
    everywhere: false, // false: only on dashboards that show ChoreOps chores
  };

  const loadSettings = () => {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch (_err) {
      stored = {};
    }
    return { ...DEFAULTS, ...stored };
  };
  const saveSettings = (value) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(value));
    } catch (_err) {
      /* storage unavailable (private mode) — keep in-memory settings */
    }
  };
  let settings = loadSettings();

  try {
    const params = new URLSearchParams(window.location.search);
    const mode = (params.get("choreops_fx") || "").toLowerCase();
    if (mode) {
      if (mode === "off") settings.enabled = false;
      else if (mode === "quiet" || mode === "mute") {
        settings.enabled = true;
        settings.sound = false;
      } else if (mode === "on") {
        settings.enabled = true;
        settings.sound = true;
      } else if (mode === "everywhere") {
        settings.enabled = true;
        settings.everywhere = true;
      }
      saveSettings(settings);
    }
    const users = params.get("choreops_fx_users");
    if (users !== null) {
      settings.users = users.split(",").map((u) => u.trim()).filter(Boolean);
      saveSettings(settings);
    }
  } catch (_err) {
    /* ignore malformed URLs */
  }

  const reducedMotion = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const intensity = () =>
    Math.max(0.1, Math.min(2, Number(settings.intensity) || 1)) * (reducedMotion() ? 0.3 : 1);

  /* ------------------------------------------------------------------ */
  /* Sound: tiny Web Audio synth                                         */
  /* ------------------------------------------------------------------ */
  const Sound = (() => {
    let ctx = null;
    let master = null;
    let noiseBuffer = null;

    const ensure = () => {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        master = ctx.createGain();
        master.connect(comp);
        comp.connect(ctx.destination);
      }
      master.gain.value = Math.max(0, Math.min(1, Number(settings.volume) || 0));
      return ctx;
    };

    // Browsers only allow audio after a user gesture; a kiosk tap unlocks it.
    const unlock = () => {
      const c = ensure();
      if (c && c.state === "suspended") c.resume().catch(() => {});
    };
    ["pointerdown", "touchstart", "keydown"].forEach((evt) =>
      window.addEventListener(evt, unlock, { capture: true, passive: true })
    );

    const ready = () => {
      if (!settings.sound) return null;
      const c = ensure();
      if (!c) return null;
      if (c.state !== "running") {
        c.resume().catch(() => {});
        return null; // never schedule into a suspended clock (would play late)
      }
      return c;
    };

    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

    const tone = (freq, start, dur, opts = {}) => {
      const { type = "sine", gain = 0.3, attack = 0.006, glideTo = null } = opts;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(gain, start + attack);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(amp);
      amp.connect(master);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    };

    const noise = (start, dur, opts = {}) => {
      const { gain = 0.3, freq = 2000, q = 1, type = "bandpass" } = opts;
      if (!noiseBuffer) {
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(gain, start);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      src.connect(filter);
      filter.connect(amp);
      amp.connect(master);
      src.start(start, Math.random() * 0.5);
      src.stop(start + dur + 0.05);
    };

    const shimmer = (t0, count, spread) => {
      for (let i = 0; i < count; i++) {
        tone(midi(84 + Math.floor(Math.random() * 15)), t0 + Math.random() * spread, 0.28, {
          gain: 0.05,
        });
      }
    };

    const pop = (t) => {
      noise(t, 0.13, { gain: 0.55, freq: 800, q: 0.7 });
      tone(170, t, 0.2, { glideTo: 55, gain: 0.45 });
    };

    return {
      status() {
        if (!settings.sound) return "off";
        if (!ctx || ctx.state !== "running") return "waiting for first tap";
        return "ready";
      },
      claim() {
        const c = ready();
        if (!c) return;
        const t = c.currentTime + 0.02;
        tone(midi(88), t, 0.35, { type: "triangle", gain: 0.22 });
        tone(midi(95), t + 0.09, 0.5, { type: "triangle", gain: 0.2 });
        tone(midi(100), t + 0.18, 0.7, { gain: 0.1 });
        shimmer(t + 0.1, 7, 0.5);
      },
      approve() {
        const c = ready();
        if (!c) return;
        const t = c.currentTime + 0.02;
        pop(t);
        pop(t + 0.08);
        [72, 76, 79, 84].forEach((m, i) => {
          const nt = t + 0.14 + i * 0.1;
          tone(midi(m), nt, 0.24, { type: "triangle", gain: 0.2 });
          tone(midi(m), nt, 0.2, { type: "square", gain: 0.035 });
        });
        const ct = t + 0.56;
        [72, 76, 79, 84, 88].forEach((m) => {
          tone(midi(m), ct, 1.2, { type: "triangle", gain: 0.09 });
          tone(midi(m) * 1.004, ct, 1.2, { type: "sawtooth", gain: 0.012 });
        });
        shimmer(ct, 14, 1.0);
      },
      tick(step) {
        const c = ready();
        if (!c) return;
        tone(midi(84 + (step % 12)), c.currentTime + 0.005, 0.07, { type: "square", gain: 0.03 });
      },
      finale() {
        const c = ready();
        if (!c) return;
        const t = c.currentTime + 0.02;
        // Rockets: whistle up, boom, crackle
        [0, 0.55, 1.05, 1.6, 2.1, 2.5].forEach((d) => {
          tone(rand(500, 700), t + d, 0.45, { glideTo: rand(1400, 1900), gain: 0.03 });
          tone(90, t + d + 0.45, 0.6, { glideTo: 38, gain: 0.55 });
          noise(t + d + 0.45, 0.5, { gain: 0.35, freq: 400, q: 0.5, type: "lowpass" });
          for (let i = 0; i < 9; i++) {
            noise(t + d + 0.55 + Math.random() * 0.6, 0.04, { gain: 0.12, freq: 5000, q: 2 });
          }
        });
        // Victory tune
        [67, 72, 76, 79, 76, 79, 84].forEach((m, i) => {
          const dur = i === 6 ? 1.3 : 0.2;
          const nt = t + 0.2 + i * 0.17;
          tone(midi(m), nt, dur, { type: "triangle", gain: 0.2 });
          tone(midi(m - 12), nt, dur, { type: "sine", gain: 0.1 });
        });
        shimmer(t + 1.4, 20, 1.6);
      },
    };
  })();

  /* ------------------------------------------------------------------ */
  /* Visuals: canvas particle engine                                     */
  /* ------------------------------------------------------------------ */
  const FX = (() => {
    let canvas = null;
    let g = null;
    let W = 0;
    let H = 0;
    let parts = [];
    let running = false;
    let last = 0;
    const MAX_PARTS = 700;

    const resize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const setup = () => {
      if (canvas && canvas.isConnected) return;
      canvas = document.createElement("canvas");
      canvas.id = "choreops-fx-canvas";
      Object.assign(canvas.style, {
        position: "fixed",
        left: "0",
        top: "0",
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: "2147483646",
      });
      document.body.appendChild(canvas);
      g = canvas.getContext("2d");
      resize();
      window.addEventListener("resize", resize);
    };

    const add = (p) => {
      parts.push(p);
    };

    const n = (count) => Math.max(1, Math.round(count * intensity()));

    const star = (ctx, spikes, outer, inner) => {
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (i * Math.PI) / spikes - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
    };

    const confetti = (x, y, count, angle, spread, power) => {
      for (let i = 0; i < n(count); i++) {
        const a = angle + rand(-spread, spread);
        const v = power * rand(0.55, 1.15);
        add({
          k: "c",
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          w: rand(7, 13),
          h: rand(4, 8),
          rot: rand(0, Math.PI * 2),
          vr: rand(-10, 10),
          tilt: rand(0, Math.PI * 2),
          vt: rand(6, 14),
          color: pick(COLORS),
          shape: Math.random() < 0.18 ? "circle" : Math.random() < 0.25 ? "star" : "rect",
          life: rand(2.4, 3.6),
          age: 0,
        });
      }
    };

    const rain = (count) => {
      for (let i = 0; i < n(count); i++) {
        add({
          k: "c",
          x: rand(0, W),
          y: rand(-260, -10),
          vx: rand(-40, 40),
          vy: rand(60, 180),
          w: rand(7, 13),
          h: rand(4, 8),
          rot: rand(0, Math.PI * 2),
          vr: rand(-8, 8),
          tilt: rand(0, Math.PI * 2),
          vt: rand(6, 14),
          color: pick(COLORS),
          shape: Math.random() < 0.18 ? "circle" : Math.random() < 0.25 ? "star" : "rect",
          life: rand(4, 5.5),
          age: 0,
        });
      }
    };

    const sparkles = (x, y, count, radius) => {
      for (let i = 0; i < n(count); i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(radius * 0.6, radius * 2.2);
        add({
          k: "s",
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          size: rand(4, 11),
          color: pick(["#FFC300", "#FF4D9D", "#9B5DE5", "#00BBF9", "#00C49A"]),
          spin: rand(-3, 3),
          phase: rand(0, Math.PI * 2),
          life: rand(0.7, 1.4),
          age: 0,
        });
      }
    };

    const stars = (x, y, count) => {
      for (let i = 0; i < n(count); i++) {
        const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
        const v = rand(380, 820);
        add({
          k: "t",
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          size: rand(11, 20),
          rot: rand(0, Math.PI),
          vr: rand(-6, 6),
          color: pick(["#FFD60A", "#FFB703", "#FFE066"]),
          life: rand(1.6, 2.2),
          age: 0,
        });
      }
    };

    const ring = (x, y, color, maxR) => {
      add({ k: "r", x, y, r: 6, maxR: maxR || 140, color, life: 0.7, age: 0 });
    };

    const rocket = (x, targetY, delay) => {
      add({
        k: "k",
        x,
        y: H + 10,
        vx: rand(-40, 40),
        vy: -Math.sqrt(2 * 520 * (H + 10 - targetY)),
        color: pick(COLORS),
        delay,
        life: 6,
        age: 0,
      });
    };

    const explode = (x, y, color) => {
      const count = n(70);
      const alt = pick(COLORS);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rand(-0.05, 0.05);
        const v = rand(140, 330);
        add({
          k: "p",
          x,
          y,
          px: x,
          py: y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          color: i % 3 === 0 ? alt : color,
          life: rand(1.1, 1.8),
          age: 0,
        });
      }
      ring(x, y, color, 120);
      sparkles(x, y, 10, 60);
    };

    const step = (p, dt) => {
      p.age += dt;
      switch (p.k) {
        case "c": {
          p.vx *= 1 - 1.5 * dt;
          p.vy = p.vy * (1 - 1.5 * dt) + 700 * dt;
          if (p.vy > 210) p.vy = 210; // paper flutter terminal velocity
          p.x += (p.vx + Math.sin(p.age * 4 + p.tilt) * 30) * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          p.tilt += p.vt * dt;
          break;
        }
        case "s": {
          p.vx *= 1 - 3 * dt;
          p.vy = p.vy * (1 - 3 * dt) + 40 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        }
        case "t": {
          p.vx *= 1 - 0.8 * dt;
          p.vy += 900 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          break;
        }
        case "r":
          p.r = 6 + (p.maxR - 6) * (1 - Math.pow(1 - p.age / p.life, 3));
          break;
        case "k": {
          if (p.delay > 0) {
            p.delay -= dt;
            p.age = 0;
            break;
          }
          p.vy += 520 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (Math.random() < 0.8) {
            add({
              k: "p",
              x: p.x,
              y: p.y,
              px: p.x,
              py: p.y,
              vx: rand(-20, 20),
              vy: rand(10, 60),
              color: "#FFB703",
              life: 0.4,
              age: 0,
            });
          }
          if (p.vy >= -30) {
            explode(p.x, p.y, p.color);
            p.age = p.life; // done
          }
          break;
        }
        case "p": {
          p.px = p.x;
          p.py = p.y;
          p.vx *= 1 - 1.6 * dt;
          p.vy = p.vy * (1 - 1.6 * dt) + 160 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        }
        default:
          break;
      }
    };

    const draw = (p) => {
      const remaining = p.life - p.age;
      const fade = Math.max(0, Math.min(1, remaining / 0.45));
      g.save();
      switch (p.k) {
        case "c": {
          g.globalAlpha = fade;
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.scale(1, Math.cos(p.tilt));
          g.fillStyle = p.color;
          if (p.shape === "circle") {
            g.beginPath();
            g.arc(0, 0, p.h * 0.7, 0, Math.PI * 2);
            g.fill();
          } else if (p.shape === "star") {
            star(g, 5, p.w * 0.6, p.w * 0.27);
            g.fill();
          } else {
            g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          }
          break;
        }
        case "s": {
          // Colored twinkle with a white core: readable on light and dark themes.
          const tw = 0.55 + 0.45 * Math.sin(p.age * 18 + p.phase);
          const r = p.size * (0.7 + tw * 0.5);
          g.globalAlpha = fade * (0.35 + tw * 0.65);
          g.translate(p.x, p.y);
          g.rotate(p.age * p.spin);
          g.fillStyle = p.color;
          star(g, 4, r, r * 0.2);
          g.fill();
          g.fillStyle = "#FFFFFF";
          star(g, 4, r * 0.5, r * 0.12);
          g.fill();
          break;
        }
        case "t": {
          g.globalAlpha = fade;
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillStyle = p.color;
          g.strokeStyle = "rgba(255,255,255,0.9)";
          g.lineWidth = 2;
          star(g, 5, p.size, p.size * 0.45);
          g.fill();
          g.stroke();
          break;
        }
        case "r": {
          g.globalAlpha = Math.max(0, 1 - p.age / p.life);
          g.strokeStyle = p.color;
          g.lineWidth = 6 * (1 - p.age / p.life) + 1;
          g.beginPath();
          g.arc(p.x, p.y, Math.max(0, p.r), 0, Math.PI * 2);
          g.stroke();
          break;
        }
        case "k": {
          if (p.delay > 0) break;
          g.fillStyle = "#FFF6D5";
          g.beginPath();
          g.arc(p.x, p.y, 3, 0, Math.PI * 2);
          g.fill();
          break;
        }
        case "p": {
          g.globalAlpha = fade;
          g.strokeStyle = p.color;
          g.lineWidth = 3.5;
          g.lineCap = "round";
          g.beginPath();
          g.moveTo(p.px, p.py);
          g.lineTo(p.x, p.y);
          g.stroke();
          break;
        }
        default:
          break;
      }
      g.restore();
    };

    const frame = (now) => {
      // rAF timestamps can precede the performance.now() we seeded with, so
      // clamp: a negative step would run particles backwards.
      const dt = Math.max(0.001, Math.min(0.05, (now - last) / 1000 || 0.016));
      last = now;
      g.clearRect(0, 0, W, H);
      const current = parts;
      parts = []; // anything spawned during step() (trails, bursts) lands here
      const alive = [];
      for (const p of current) {
        step(p, dt);
        if (p.age < p.life && p.y < H + 80 && p.x > -120 && p.x < W + 120) {
          try {
            draw(p);
            alive.push(p);
          } catch (_err) {
            g.restore(); // drop the bad particle, keep the party going
          }
        }
      }
      parts = alive.concat(parts);
      if (parts.length > MAX_PARTS) parts.splice(0, parts.length - MAX_PARTS);
      if (parts.length) {
        requestAnimationFrame(frame);
      } else {
        running = false;
        g.clearRect(0, 0, W, H);
      }
    };

    const kick = () => {
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    };

    const api = {
      size: () => ({ w: W || window.innerWidth, h: H || window.innerHeight }),
      claim(x, y) {
        setup();
        ring(x, y, CLAIM_ACCENT, 120);
        ring(x, y, "#FFD60A", 80);
        sparkles(x, y, 46, 90);
        confetti(x, y, 22, -Math.PI / 2, Math.PI, 420);
        kick();
      },
      approve(x, y) {
        setup();
        const s = api.size();
        confetti(-10, s.h * 0.85, 90, -Math.PI / 3, 0.32, 1250);
        confetti(s.w + 10, s.h * 0.85, 90, (-2 * Math.PI) / 3, 0.32, 1250);
        confetti(x, y, 50, -Math.PI / 2, Math.PI, 650);
        stars(x, y, 12);
        sparkles(x, y, 40, 110);
        ring(x, y, "#06D6A0", 170);
        ring(x, y, "#FFD60A", 110);
        kick();
      },
      finale() {
        setup();
        const s = api.size();
        // Bursts across the top band; the finale banner sits lower so they show.
        for (let i = 0; i < 8; i++) {
          const lane = (i % 4) / 4 + 0.125;
          rocket(s.w * (lane + rand(-0.08, 0.08)), rand(s.h * 0.1, s.h * 0.34), i * 0.42);
        }
        rain(90);
        setTimeout(() => {
          rain(80);
          kick();
        }, 1600);
        kick();
      },
    };
    return api;
  })();

  /* ------------------------------------------------------------------ */
  /* Banner & toast                                                      */
  /* ------------------------------------------------------------------ */
  const CSS = `
    :host { all: initial; }
    .stage { position: fixed; inset: 0; pointer-events: none;
      font-family: ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif; }
    .banner { position: absolute; left: 50%; top: 36%; transform: translate(-50%, -50%);
      width: min(86vw, 420px); padding: 26px 22px 22px; border-radius: 30px; text-align: center;
      color: #fff; overflow: hidden; box-sizing: border-box;
      background: linear-gradient(135deg, #8338EC 0%, #FF006E 55%, #FB8500 100%);
      box-shadow: 0 18px 60px rgba(131,56,236,.45), 0 0 0 5px rgba(255,255,255,.85), 0 0 0 10px rgba(255,214,10,.55);
      animation: pop-in .7s cubic-bezier(.2,1.6,.4,1) both; }
    .banner.finale { background: linear-gradient(135deg, #3A86FF 0%, #8338EC 45%, #FF006E 80%, #FFB703 100%);
      width: min(90vw, 480px); top: 62%; }
    .banner.out { animation: pop-out .45s ease-in both; }
    .banner::after { content: ""; position: absolute; top: -50%; left: -60%; width: 40%; height: 200%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent);
      transform: rotate(20deg); animation: sheen 1.6s .35s ease-in-out; }
    .badge { position: relative; width: 92px; height: 92px; margin: -2px auto 10px; border-radius: 50%;
      display: grid; place-items: center; background: #fff; color: #FF006E;
      box-shadow: 0 6px 0 rgba(0,0,0,.12); animation: bounce .9s .25s cubic-bezier(.3,1.8,.5,1) both,
      wiggle 1.4s 1.1s ease-in-out infinite; }
    .badge::before { content: ""; position: absolute; inset: -18px; border-radius: 50%; z-index: -1;
      background: repeating-conic-gradient(rgba(255,255,255,.55) 0 12deg, transparent 12deg 30deg);
      animation: spin 6s linear infinite; }
    ha-icon { display: inline-flex; width: var(--mdc-icon-size, 24px); height: var(--mdc-icon-size, 24px); }
    .badge ha-icon { --mdc-icon-size: 54px; }
    .title { font-size: clamp(26px, 7vw, 38px); font-weight: 900; letter-spacing: .5px; line-height: 1.05;
      text-shadow: 0 3px 0 rgba(0,0,0,.18); animation: rise .5s .2s ease-out both; }
    .sub { margin-top: 6px; font-size: 16px; font-weight: 700; opacity: .95; animation: rise .5s .3s ease-out both; }
    .chips { margin-top: 14px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 999px;
      font-size: 20px; font-weight: 900; background: #FFD60A; color: #5a2a00;
      box-shadow: 0 4px 0 #e0a800; animation: chip .6s .45s cubic-bezier(.2,1.8,.4,1) both; }
    .chip.streak { background: #fff; color: #FB8500; box-shadow: 0 4px 0 #ffd3a8; animation-delay: .6s; }
    .chip ha-icon { --mdc-icon-size: 22px; }
    .toast { position: absolute; left: 50%; bottom: 7%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 10px; max-width: 88vw; padding: 12px 20px 12px 12px;
      border-radius: 999px; background: ${CLAIM_ACCENT}; color: #fff; font-size: 18px; font-weight: 800;
      box-shadow: 0 10px 30px rgba(169,87,250,.5), 0 0 0 4px rgba(255,255,255,.8);
      animation: toast-in .55s cubic-bezier(.2,1.6,.4,1) both; white-space: nowrap; }
    .toast.out { animation: toast-out .4s ease-in both; }
    .toast .dot { width: 38px; height: 38px; border-radius: 50%; background: #fff; color: ${CLAIM_ACCENT};
      display: grid; place-items: center; animation: wiggle .8s .3s ease-in-out 2; flex: none; }
    .toast .dot ha-icon { --mdc-icon-size: 24px; }
    .toast .txt { overflow: hidden; text-overflow: ellipsis; }
    @keyframes pop-in { 0% { opacity: 0; transform: translate(-50%,-50%) scale(.3) rotate(-10deg); }
      100% { opacity: 1; transform: translate(-50%,-50%) scale(1) rotate(0); } }
    @keyframes pop-out { to { opacity: 0; transform: translate(-50%,-80%) scale(.7); } }
    @keyframes sheen { to { left: 130%; } }
    @keyframes bounce { 0% { transform: scale(0); } 100% { transform: scale(1); } }
    @keyframes wiggle { 0%,100% { rotate: 0deg; } 25% { rotate: -9deg; } 75% { rotate: 9deg; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
    @keyframes chip { from { opacity: 0; transform: scale(.2); } to { opacity: 1; transform: scale(1); } }
    @keyframes toast-in { from { opacity: 0; transform: translate(-50%, 60px) scale(.7); }
      to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
    @keyframes toast-out { to { opacity: 0; transform: translate(-50%, 30px) scale(.8); } }
    @media (prefers-reduced-motion: reduce) {
      .banner, .badge, .badge::before, .chip, .toast, .title, .sub, .banner::after { animation-duration: .01s !important;
        animation-iteration-count: 1 !important; }
    }
  `;

  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[ch]);

  const Banner = (() => {
    let stage = null;
    const setup = () => {
      if (stage && stage.isConnected) return;
      const host = document.createElement("div");
      host.id = "choreops-fx-banner";
      Object.assign(host.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "2147483647" });
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = `<style>${CSS}</style><div class="stage"></div>`;
      document.body.appendChild(host);
      stage = root.querySelector(".stage");
    };

    const dismiss = (el, after) => {
      setTimeout(() => {
        el.classList.add("out");
        setTimeout(() => el.remove(), 500);
      }, after);
    };

    return {
      show({ icon, title, sub, points, currency, streak, finale, duration }) {
        const cur = currency || { label: "points", icon: "mdi:star" };
        setup();
        stage.querySelectorAll(".banner").forEach((el) => el.remove());
        const el = document.createElement("div");
        el.className = `banner${finale ? " finale" : ""}`;
        const hasPoints = Number.isFinite(points) && points > 0;
        el.innerHTML = `
          <div class="badge"><ha-icon icon="${escapeHtml(icon)}"></ha-icon></div>
          <div class="title">${escapeHtml(title)}</div>
          ${sub ? `<div class="sub">${escapeHtml(sub)}</div>` : ""}
          <div class="chips">
            ${hasPoints ? `<span class="chip"><ha-icon icon="${escapeHtml(cur.icon)}"></ha-icon>+<span class="pts">0</span> ${escapeHtml(cur.label)}</span>` : ""}
            ${streak > 1 ? `<span class="chip streak"><ha-icon icon="mdi:fire"></ha-icon>${escapeHtml(streak)}x streak!</span>` : ""}
          </div>`;
        stage.appendChild(el);
        if (hasPoints) {
          const target = el.querySelector(".pts");
          const steps = Math.min(12, Math.max(1, Math.round(points)));
          const decimals = Number.isInteger(points) ? 0 : 1;
          for (let i = 1; i <= steps; i++) {
            setTimeout(() => {
              target.textContent = ((points * i) / steps).toFixed(decimals);
              Sound.tick(i);
            }, 550 + i * 55);
          }
        }
        dismiss(el, duration);
      },
      toast({ icon, text, duration }) {
        setup();
        stage.querySelectorAll(".toast").forEach((el) => el.remove());
        const el = document.createElement("div");
        el.className = "toast";
        el.innerHTML = `<span class="dot"><ha-icon icon="${escapeHtml(icon)}"></ha-icon></span><span class="txt">${escapeHtml(text)}</span>`;
        stage.appendChild(el);
        dismiss(el, duration);
      },
    };
  })();

  /* ------------------------------------------------------------------ */
  /* Celebrations                                                        */
  /* ------------------------------------------------------------------ */
  const APPROVE_TITLES = [
    "Awesome job", "You did it", "Chore champion", "Superstar", "High five",
    "Way to go", "Nailed it", "Legendary", "Crushed it", "Boom",
  ];
  const APPROVE_ICONS = [
    "mdi:trophy", "mdi:star-face", "mdi:party-popper", "mdi:rocket-launch",
    "mdi:crown", "mdi:emoticon-excited", "mdi:medal", "mdi:arm-flex",
  ];
  const CLAIM_LINES = ["claimed! Waiting for approval", "done! Sent for approval", "checked off! Nice"];

  let lastPointer = { x: 0, y: 0, t: 0 };
  window.addEventListener(
    "pointerdown",
    (ev) => {
      lastPointer = { x: ev.clientX, y: ev.clientY, t: Date.now() };
    },
    { capture: true, passive: true }
  );
  const origin = () => {
    if (Date.now() - lastPointer.t < 6000) return { x: lastPointer.x, y: lastPointer.y };
    const s = FX.size();
    return { x: s.w / 2, y: s.h * 0.5 };
  };

  // ChoreOps points sensors use the family's configured currency name as their
  // unit ("Stars", "Gems", ...) and the configured points icon.
  const pointsCurrency = (user) => {
    const states = Object.values(currentStates());
    const sensors = states.filter((s) => s.attributes && s.attributes.purpose === "purpose_points");
    const mine = sensors.find((s) => s.attributes.user_name === user) || sensors[0];
    const a = (mine && mine.attributes) || {};
    return {
      label: typeof a.unit_of_measurement === "string" && a.unit_of_measurement.trim()
        ? a.unit_of_measurement.trim()
        : "points",
      icon: typeof a.icon === "string" && a.icon.startsWith("mdi:") ? a.icon : "mdi:star",
    };
  };

  const choreList = (infos) => {
    const names = infos.map((i) => i.chore).filter(Boolean);
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} + ${names.length - 2} more`;
  };

  const celebrateClaim = (infos) => {
    const o = origin();
    FX.claim(o.x, o.y);
    Sound.claim();
    const first = infos[0];
    Banner.toast({
      icon: (infos.length === 1 && first.icon) || "mdi:check-bold",
      text:
        infos.length === 1
          ? `${first.chore || "Chore"} ${pick(CLAIM_LINES)}`
          : `${infos.length} chores claimed! Waiting for approval`,
      duration: 2200,
    });
    return 1300;
  };

  const celebrateApprove = (infos) => {
    const o = origin();
    const first = infos[0];
    const combo = infos.length > 1;
    FX.approve(o.x, o.y);
    if (combo) setTimeout(() => FX.approve(FX.size().w / 2, FX.size().h * 0.35), 350);
    Sound.approve();
    const name = first.user ? `, ${first.user}` : "";
    const total = infos.reduce((sum, i) => sum + (Number.isFinite(i.points) ? i.points : 0), 0);
    Banner.show({
      icon: !combo && first.icon && Math.random() < 0.5 ? first.icon : pick(APPROVE_ICONS),
      title: combo ? `${infos.length} chores done${name}!` : `${pick(APPROVE_TITLES)}${name}!`,
      sub: combo ? choreList(infos) : first.chore ? `${first.chore} — done!` : "Chore done!",
      points: total,
      currency: pointsCurrency(first.user),
      streak: combo ? 0 : first.streak,
      duration: combo ? 3000 : 2600,
    });
    return combo ? 3400 : 3000;
  };

  const celebrateFinale = (user) => {
    FX.finale();
    Sound.finale();
    Banner.show({
      icon: "mdi:trophy-variant",
      title: "ALL DONE!",
      sub: user ? `Every chore finished. You're unstoppable, ${user}!` : "Every chore finished!",
      finale: true,
      duration: 4200,
    });
    return 4800;
  };

  /*
   * Celebration queue. Items: { kind: "claim" | "approve" | "finale", user, infos }.
   * Waiting claims/approvals for the same person merge into one combo, so a
   * parent bulk-approving five chores yields one big party, not five in a row.
   */
  const queue = [];
  let busy = false;
  let pumpTimer = null;
  const run = (item) => {
    if (item.kind === "claim") return celebrateClaim(item.infos);
    if (item.kind === "approve") return celebrateApprove(item.infos);
    return celebrateFinale(item.user);
  };
  const pump = () => {
    pumpTimer = null;
    if (busy || !queue.length) return;
    busy = true;
    const item = queue.shift();
    let wait = 0;
    try {
      wait = document.hidden ? 0 : run(item);
    } catch (err) {
      console.warn("[ChoreOps Celebrations]", err);
    }
    setTimeout(() => {
      busy = false;
      pump();
    }, wait);
  };
  const enqueue = (kind, user, info) => {
    const existing = queue.find((q) => q.kind === kind && q.user === user);
    if (existing) {
      if (info) existing.infos.push(info);
      return;
    }
    if (kind === "approve") {
      // An approval supersedes a still-waiting claim toast for the same chore.
      const claimIdx = queue.findIndex(
        (q) => q.kind === "claim" && q.user === user && q.infos.some((i) => i.entityId === info.entityId)
      );
      if (claimIdx >= 0) {
        const claim = queue[claimIdx];
        claim.infos = claim.infos.filter((i) => i.entityId !== info.entityId);
        if (!claim.infos.length) queue.splice(claimIdx, 1);
      }
    }
    if (queue.length >= 6) queue.splice(0, queue.length - 5);
    queue.push({ kind, user, infos: info ? [info] : [] });
    // Brief debounce lets simultaneous state changes land in the same combo.
    if (!busy && !pumpTimer) pumpTimer = setTimeout(pump, 250);
  };

  /* ------------------------------------------------------------------ */
  /* Home Assistant wiring                                               */
  /* ------------------------------------------------------------------ */
  const haRoot = () => document.querySelector("home-assistant");
  const currentStates = () => {
    const ha = haRoot();
    return (ha && ha.hass && ha.hass.states) || {};
  };

  const pendingClaims = new Map();
  const lastFinale = new Map();

  /*
   * Only celebrate on chore dashboards (where kids actually tap chores), not on
   * e.g. the main Home dashboard of whoever else has HA open. A page counts
   * when it is a ChoreOps-generated dashboard (url "cod-…") or any dashboard
   * whose config shows ChoreOps entities. `everywhere: true` disables the gate.
   */
  const dashboardCache = new Map(); // url_path -> true | false | "pending"
  const currentDashboard = () => {
    const seg = window.location.pathname.split("/").filter(Boolean)[0] || "";
    return seg;
  };
  const lookupDashboard = (urlPath) => {
    if (dashboardCache.has(urlPath)) return;
    if (urlPath.startsWith("cod-")) {
      dashboardCache.set(urlPath, true);
      return;
    }
    const ha = haRoot();
    const hass = ha && ha.hass;
    const panel = hass && hass.panels && hass.panels[urlPath];
    if (!panel || panel.component_name !== "lovelace") {
      dashboardCache.set(urlPath, false);
      return;
    }
    dashboardCache.set(urlPath, "pending");
    hass
      .callWS({ type: "lovelace/config", url_path: urlPath === "lovelace" ? null : urlPath })
      .then((cfg) => dashboardCache.set(urlPath, /choreops/i.test(JSON.stringify(cfg))))
      .catch(() => dashboardCache.set(urlPath, false));
  };
  const onChoreDashboard = () => {
    if (settings.everywhere) return true;
    const urlPath = currentDashboard();
    lookupDashboard(urlPath);
    return dashboardCache.get(urlPath) === true;
  };

  const userAllowed = (user) =>
    !settings.users.length ||
    settings.users.some((u) => u.toLowerCase() === String(user || "").toLowerCase());

  const checkFinale = (user) => {
    setTimeout(() => {
      const mine = Object.values(currentStates()).filter(
        (s) => s.attributes && s.attributes.purpose === PURPOSE_CHORE_STATUS && s.attributes.user_name === user
      );
      if (mine.length < 2) return;
      if (mine.some((s) => OPEN.has(s.state) || CLAIMED.has(s.state))) return;
      if (!mine.some((s) => DONE.has(s.state))) return;
      const prev = lastFinale.get(user) || 0;
      if (Date.now() - prev < 30 * 60 * 1000) return;
      lastFinale.set(user, Date.now());
      enqueue("finale", user, null);
    }, 900);
  };

  const describe = (stateObj) => {
    const a = stateObj.attributes || {};
    const points = Number(a.default_points);
    return {
      entityId: stateObj.entity_id,
      user: a.user_name || "",
      chore: a.chore_name || a.friendly_name || "",
      points: Number.isFinite(points) ? points : NaN,
      streak: Number(a.chore_current_streak || 0),
      icon: typeof a.icon === "string" ? a.icon : "",
    };
  };

  const onStateChanged = (event) => {
    const data = event && event.data;
    if (!data || !data.new_state || !data.old_state) return;
    const next = data.new_state;
    if (!next.attributes || next.attributes.purpose !== PURPOSE_CHORE_STATUS) return;
    if (!settings.enabled || !onChoreDashboard()) return;
    const from = data.old_state.state;
    const to = next.state;
    if (from === to) return;
    const info = describe(next);
    if (!userAllowed(info.user)) return;

    if (DONE.has(to) && !DONE.has(from)) {
      const pending = pendingClaims.get(info.entityId);
      if (pending) {
        clearTimeout(pending);
        pendingClaims.delete(info.entityId);
      }
      enqueue("approve", info.user, info);
      checkFinale(info.user);
    } else if (CLAIMED.has(to) && !CLAIMED.has(from) && !DONE.has(from)) {
      // Short delay so auto-approved chores show one big party, not two.
      const timer = setTimeout(() => {
        pendingClaims.delete(info.entityId);
        enqueue("claim", info.user, info);
      }, 450);
      pendingClaims.set(info.entityId, timer);
    }
  };

  /*
   * Watch the same entity states the dashboard renders from. The frontend
   * replaces `hass` (and `hass.states`) on every update, so diffing the chore
   * status entities on each new object catches every claim/approval, for any
   * user (non-admin kiosk accounts can't subscribe to raw state_changed).
   */
  let lastStates = null;
  let tracked = new Map(); // entity_id -> last seen state object
  let lastScan = 0;

  const rescan = (states) => {
    const next = new Map();
    for (const id in states) {
      const s = states[id];
      if (s && s.attributes && s.attributes.purpose === PURPOSE_CHORE_STATUS) {
        next.set(id, tracked.get(id) || s);
      }
    }
    tracked = next;
    lastScan = Date.now();
  };

  const watch = () => {
    const ha = haRoot();
    const states = ha && ha.hass && ha.hass.states;
    if (states && states !== lastStates) {
      const first = lastStates === null;
      lastStates = states;
      if (first || Date.now() - lastScan > 15000) rescan(states);
      lookupDashboard(currentDashboard()); // warm the cache before taps happen
      for (const [id, prev] of tracked) {
        const cur = states[id];
        if (!cur || cur === prev) continue;
        tracked.set(id, cur);
        if (!first && cur.state !== prev.state) {
          onStateChanged({ data: { entity_id: id, old_state: prev, new_state: cur } });
        }
      }
    }
  };

  /* ?choreops_fx_debug=1 shows a status badge: handy on kiosks with no devtools */
  const debugBadge = () => {
    let wanted = false;
    try {
      wanted = new URLSearchParams(window.location.search).has("choreops_fx_debug");
    } catch (_err) {
      wanted = false;
    }
    if (!wanted) return;
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "fixed", left: "12px", bottom: "12px", zIndex: "2147483647", maxWidth: "92vw",
      padding: "10px 14px", borderRadius: "14px", background: "#2B2140", color: "#fff",
      font: "600 13px/1.45 system-ui, sans-serif", boxShadow: "0 6px 24px rgba(0,0,0,.35)",
      pointerEvents: "none", whiteSpace: "pre",
    });
    document.body.appendChild(el);
    const render = () => {
      const urlPath = currentDashboard();
      lookupDashboard(urlPath);
      const dash = settings.everywhere ? "everywhere" : String(dashboardCache.get(urlPath));
      el.textContent =
        `ChoreOps Celebrations ${VERSION} loaded\n` +
        `page "${urlPath}" chore dashboard: ${dash}\n` +
        `watching ${tracked.size} chores | effects ${settings.enabled ? "on" : "off"}\n` +
        `sound: ${Sound.status()}`;
    };
    render();
    const timer = setInterval(render, 1000);
    setTimeout(() => {
      clearInterval(timer);
      el.remove();
    }, 20000);
  };

  const connect = () => {
    setInterval(watch, 250);
    watch();
    setTimeout(debugBadge, 1500);
  };

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */
  window.ChoreOpsCelebrations = {
    version: VERSION,
    settings: () => ({ ...settings }),
    configure(patch) {
      settings = { ...settings, ...(patch || {}) };
      saveSettings(settings);
      return { ...settings };
    },
    reset() {
      settings = { ...DEFAULTS };
      saveSettings(settings);
      return { ...settings };
    },
    demo(kind = "approve", name = "Superstar") {
      const info = {
        entityId: "demo",
        user: name,
        chore: "Make the bed",
        points: 10,
        streak: 3,
        icon: "mdi:bed",
      };
      if (kind === "claim" || kind === "finale") enqueue(kind, name, kind === "claim" ? info : null);
      else enqueue("approve", name, info);
    },
    _handleStateChanged: onStateChanged,
    _watch: watch,
  };

  console.info(
    `%c ChoreOps %c Celebrations ${VERSION} `,
    "background:#8338EC;color:#fff;border-radius:4px 0 0 4px;padding:2px 4px;font-weight:700",
    "background:#FFD60A;color:#5a2a00;border-radius:0 4px 4px 0;padding:2px 4px;font-weight:700"
  );
  connect();
})();
