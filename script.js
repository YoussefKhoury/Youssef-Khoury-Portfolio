(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  // Content is visible by default; only allow the hidden/reveal state now that JS runs.
  root.classList.add('js');

  /* ---------- one-time hero boot sequence ---------- */
  if (!reduced) {
    let booted = false;
    try { booted = sessionStorage.getItem('v2-booted') === '1'; } catch {}
    if (!booted) {
      root.classList.add('booting');
      // pin the end state so removing .booting can't hide anything
      document.querySelectorAll('.hero .reveal').forEach((el) => el.classList.add('visible'));
      setTimeout(() => {
        root.classList.remove('booting');
        try { sessionStorage.setItem('v2-booted', '1'); } catch {}
      }, 1300);
    }
  }

  /* ---------- header + scroll progress + work rail ---------- */
  const header = document.querySelector('[data-header]');
  const progress = document.querySelector('.scroll-progress');
  const secnav = document.querySelector('.secnav');
  const toTop = document.querySelector('.to-top');
  const workSec = document.getElementById('work');
  const workRail = workSec?.querySelector('.work-rail span');
  const workRows = [...(workSec ? workSec.querySelectorAll('.row') : [])];

  const onScroll = () => {
    const vh = window.innerHeight;
    header?.classList.toggle('scrolled', window.scrollY > 20);
    if (secnav) {
      const heroBottom = (document.querySelector('.hero')?.getBoundingClientRect().bottom ?? 0);
      secnav.classList.toggle('show', heroBottom < 54);
      secnav.setAttribute('aria-hidden', heroBottom < 54 ? 'false' : 'true');
    }
    if (toTop) toTop.classList.toggle('show', window.scrollY > vh * 1.4);
    if (progress) {
      const max = document.documentElement.scrollHeight - vh;
      progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
    }
    if (workSec && workRail) {
      const r = workSec.getBoundingClientRect();
      const span = Math.max(1, r.height - vh * 0.55);
      const p = Math.min(1, Math.max(0, (vh * 0.5 - r.top) / span));
      workRail.style.height = (p * 100) + '%';
      // light a row's node once the rail fill has physically reached it
      const railBox = workRail.parentElement.getBoundingClientRect();
      const filled = railBox.top + railBox.height * p;
      workRows.forEach((row) => {
        const rr = row.getBoundingClientRect();
        row.classList.toggle('rail-lit', rr.top + rr.height / 2 <= filled + 1);
      });
    }
    if (workRows.length) {
      const focus = vh * 0.42;
      let best = null, bestD = Infinity;
      workRows.forEach((row) => {
        const rr = row.getBoundingClientRect();
        if (rr.bottom < 0 || rr.top > vh) return;
        const d = Math.abs(rr.top + rr.height / 2 - focus);
        if (d < bestD) { bestD = d; best = row; }
      });
      workRows.forEach((row) => row.classList.toggle('is-active', row === best));
    }
  };
  onScroll();
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { onScroll(); ticking = false; });
  }, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  /* ---------- full-screen index overlay ---------- */
  const overlay = document.getElementById('overlay');
  const indexBtn = document.querySelector('.index-btn');
  const closeBtn = overlay?.querySelector('.ov-close');

  // one clock, drives every [data-clock] (menu readout + contact readout)
  const clockEls = [...document.querySelectorAll('[data-clock]')];
  const tickClock = () => {
    if (!clockEls.length) return;
    let t;
    try { t = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Beirut', hour12: false }); }
    catch { t = new Date().toLocaleTimeString('en-GB', { hour12: false }); }
    clockEls.forEach((el) => { el.textContent = t; });
  };
  tickClock();
  setInterval(tickClock, 1000);

  const openOverlay = () => {
    if (!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    indexBtn?.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('menu-open');
    overlay.scrollTop = 0;
    requestAnimationFrame(() => closeBtn?.focus());
  };
  const closeOverlay = () => {
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    indexBtn?.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('menu-open');
    indexBtn?.focus();
  };

  indexBtn?.addEventListener('click', openOverlay);
  closeBtn?.addEventListener('click', closeOverlay);
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
  overlay?.querySelectorAll('.ov-nav a').forEach((a) => a.addEventListener('click', closeOverlay));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay?.classList.contains('open')) closeOverlay();
  });

  // keep Tab focus inside the dialog while it is open
  overlay?.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !overlay.classList.contains('open')) return;
    const items = [...overlay.querySelectorAll('a[href], button:not([disabled])')]
      .filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ---------- count-up with hard timeout fallback ---------- */
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const counters = [...document.querySelectorAll('[data-count-to]')];
  const runCount = (el) => {
    if (el.dataset.counted) return;
    el.dataset.counted = '1';
    const target = Number(el.getAttribute('data-count-to')) || 0;
    const suffix = el.getAttribute('data-count-suffix') || '';
    if (reduced) { el.textContent = target + suffix; return; }
    const duration = 1100;
    const start = performance.now();
    let done = false;
    const finish = () => { if (done) return; done = true; el.textContent = target + suffix; };
    el.textContent = '0' + suffix;
    const step = (now) => {
      if (done) return;
      const p = Math.min(1, (now - start) / duration);
      el.textContent = Math.round(target * easeOut(p)) + suffix;
      if (p < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
    setTimeout(finish, duration + 400);
  };
  if (counters.length) {
    const countObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { runCount(entry.target); countObserver.unobserve(entry.target); }
      });
    }, { threshold: 0.5 });
    counters.forEach((el) => countObserver.observe(el));
  }

  /* ---------- reveal on scroll ---------- */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });
  document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

  /* ---------- expandable case detail ---------- */
  const caseToggles = [...document.querySelectorAll('.row[aria-controls]')];
  const setCase = (btn, panel, open) => {
    btn.setAttribute('aria-expanded', String(open));
    panel.classList.toggle('open', open);
    panel.style.height = panel.scrollHeight + 'px';
    if (open) {
      const done = () => { panel.style.height = 'auto'; panel.removeEventListener('transitionend', done); };
      panel.addEventListener('transitionend', done);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    } else {
      requestAnimationFrame(() => { panel.style.height = '0px'; });
    }
  };
  caseToggles.forEach((btn) => {
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;
    btn.addEventListener('click', () => {
      const willOpen = btn.getAttribute('aria-expanded') !== 'true';
      caseToggles.forEach((other) => {
        if (other === btn || other.getAttribute('aria-expanded') !== 'true') return;
        setCase(other, document.getElementById(other.getAttribute('aria-controls')), false);
      });
      setCase(btn, panel, willOpen);
    });
  });

  /* ---------- mobile: collapse the long sections behind their heading ----------
     Resting open/closed height is owned by CSS (@media + .collapsible:not(.open)).
     JS only flips .open and animates height, always handing the resting state
     back to CSS afterwards, so a resize to desktop can never leave one stuck. */
  const mqMobile = window.matchMedia('(max-width: 720px)');
  const collSecs = [...document.querySelectorAll('.section.collapsible')];

  const applyHeadRole = () => {
    collSecs.forEach((sec) => {
      const head = sec.querySelector('.sec-head');
      if (!head) return;
      if (mqMobile.matches) {
        head.setAttribute('role', 'button');
        head.setAttribute('tabindex', '0');
        head.setAttribute('aria-expanded', String(sec.classList.contains('open')));
      } else {
        head.removeAttribute('role');
        head.removeAttribute('tabindex');
        head.removeAttribute('aria-expanded');
        // back on desktop the body is always shown, so its reveals must be live
        sec.querySelectorAll('.sec-body .reveal').forEach((el) => el.classList.add('visible'));
      }
    });
  };
  applyHeadRole();
  mqMobile.addEventListener('change', applyHeadRole);

  /* on a phone the three sections are folders in a drawer: each one's front is
     the .sec-head bar, and pressing it draws that folder's file open. */
  const setSection = (sec, open) => {
    if (!mqMobile.matches || sec.classList.contains('open') === open) return;
    const head = sec.querySelector('.sec-head');
    const body = sec.querySelector('.sec-body');
    if (!head || !body) return;
    if (open) body.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
    body.style.height = (open ? 0 : body.scrollHeight) + 'px';
    void body.offsetHeight;                           // reflow so the start height sticks
    sec.classList.toggle('open', open);
    head.setAttribute('aria-expanded', String(open));
    body.style.height = (open ? body.scrollHeight : 0) + 'px';
    let t;
    const done = () => {
      body.style.height = '';                         // hand resting state back to CSS
      body.removeEventListener('transitionend', done);
      clearTimeout(t);
    };
    body.addEventListener('transitionend', done);
    t = setTimeout(done, 500);                        // fallback if transitionend never fires
    if (reduced) done();
  };

  collSecs.forEach((sec) => {
    const head = sec.querySelector('.sec-head');
    if (!head) return;
    const toggle = () => setSection(sec, !sec.classList.contains('open'));
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
    // the phone-only metric row is part of the same tap target
    sec.querySelector('.sec-metrics')?.addEventListener('click', toggle);
  });

  // Any in-page link to a collapsed section (hero action, strip pill, menu item)
  // opens it, so the jump never lands the visitor on a closed heading.
  document.addEventListener('click', (e) => {
    const link = e.target.closest?.('a[href^="#"]');
    if (!link) return;
    const target = document.querySelector(link.getAttribute('href'));
    if (target?.classList.contains('collapsible')) setSection(target, true);
  });

  // Fallback: if IntersectionObserver never delivers (rare edge cases), un-hide
  // everything so nothing is stuck invisible.
  setTimeout(() => {
    if (!document.querySelector('.reveal.visible')) {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
      counters.forEach(runCount);
    }
  }, 4000);

  /* ---------- nav active section ---------- */
  const navLinks = [...document.querySelectorAll('.topnav a[href^="#"], .secnav a[href^="#"]')];
  const sections = navLinks
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);
  if (sections.length) {
    const secObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) =>
          a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`));
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach((s) => secObserver.observe(s));
  }

  /* ---------- back to top ---------- */
  toTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });

  /* ---------- copy email ---------- */
  const toast = document.querySelector('.toast');
  const flashToast = () => {
    if (!toast) return;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 1700);
  };
  const copyEmail = async () => {
    const addr = 'youssefkhoury01@gmail.com';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard api');
      await navigator.clipboard.writeText(addr);
      flashToast();
      return;
    } catch {}
    // fallback for older / restricted mobile browsers
    try {
      const ta = document.createElement('textarea');
      ta.value = addr;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, addr.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) { flashToast(); return; }
    } catch {}
    window.location.href = 'mailto:' + addr;
  };
  document.querySelector('[data-copy-email]')?.addEventListener('click', copyEmail);

  /* ---------- hero atmospheric fog ----------
     Two layers on one low-res buffer, softened in CSS so it reads as haze:
       1. a few big amber radial blobs that drift on slow noise — the fog wash;
       2. an amber halftone-dot grid that travels as a diagonal wave and bends
          away from the cursor while it is over the hero.
     A per-axis radial weight still keeps the centre lighter so the headline,
     photo and buttons stay readable. Static under prefers-reduced-motion. */
  const fog = document.getElementById('herofog');
  if (fog) {
    const fx = fog.getContext('2d');
    const SCALE = 0.5;                  // buffer resolution vs. display
    const STEP = 5;                     // grid spacing in buffer px (~10px on screen)
    let fw = 1, fh = 1, fRun = false, fLast = 0, fTime = Math.random() * 100;
    // cursor state, all in buffer coords; pm* trails toward pt* for a soft lag
    let ptX = -999, ptY = -999, pmX = -999, pmY = -999, pStr = 0, pWant = 0;

    const hash = (ix, iy) => {
      let n = (ix * 374761393 + iy * 668265263) | 0;
      n = (n ^ (n >>> 13)) * 1274126177;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    };
    const vnoise = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y);
      const dx = x - ix, dy = y - iy;
      const u = dx * dx * (3 - 2 * dx), v = dy * dy * (3 - 2 * dy);
      const a = hash(ix, iy), b = hash(ix + 1, iy);
      const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
      return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
    };

    // the fog wash: three soft blobs whose centres wander on slow noise
    const BLOBS = [
      { bx: 0.16, by: 0.24, s: 0.62, ph: 0.0 },
      { bx: 0.86, by: 0.30, s: 0.55, ph: 2.1 },
      { bx: 0.52, by: 0.86, s: 0.70, ph: 4.3 }
    ];
    const fWash = () => {
      for (let i = 0; i < BLOBS.length; i++) {
        const b = BLOBS[i];
        const dxn = vnoise(i * 13 + fTime * 0.5, 7) - 0.5;
        const dyn = vnoise(i * 13 + 50, fTime * 0.5 + 3) - 0.5;
        const cx = (b.bx + dxn * 0.10) * fw;
        const cy = (b.by + dyn * 0.10) * fh;
        const rr = b.s * Math.max(fw, fh) * 0.55;
        const g = fx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        g.addColorStop(0, 'rgba(232,177,90,0.055)');
        g.addColorStop(0.55, 'rgba(224,150,70,0.022)');
        g.addColorStop(1, 'rgba(232,177,90,0)');
        fx.fillStyle = g;
        fx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      }
    };

    const fPaint = () => {
      fx.clearRect(0, 0, fw, fh);
      const cx = fw / 2, cy = fh / 2;
      if (!reduced) fWash();
      const R = fw * 0.34;               // cursor influence radius
      const R2 = R * R;
      for (let y = STEP * 0.5; y < fh; y += STEP) {
        for (let x = STEP * 0.5; x < fw; x += STEP) {
          // normalise per axis so the clearing hugs the hero's own shape
          const ux = (x - cx) / cx, uy = (y - cy) / cy;
          const nd = Math.min(1, Math.hypot(ux, uy) / 1.414);
          let edge = (nd - 0.24) / 0.76;          // dots reach a little further in now
          if (edge <= 0.02) continue;
          edge = edge < 1 ? edge * edge * (3 - 2 * edge) : 1;

          const wx = vnoise(x * 0.017 - fTime * 0.4, y * 0.017 + fTime * 0.15) - 0.5;
          const wy = vnoise(x * 0.017 + 37 + fTime * 0.18, y * 0.017 + fTime * 0.32) - 0.5;
          const sx = x * 0.055 + fTime * 1.1 + wx * 28;
          const sy = y * 0.055 - fTime * 0.4 + wy * 28;
          const n = 0.6 * vnoise(sx, sy)
                  + 0.4 * vnoise(x * 0.12 - fTime * 1.6 + wx * 13, y * 0.12 + wy * 13);

          let px = x, py = y, boost = 0;
          if (!reduced) {
            // two low-frequency swells crossed at different angles, nudged by the
            // same warp noise as the wash — an organic undulation, not a grid ripple
            const w1 = Math.sin(x * 0.020 + y * 0.014 - fTime * 3.2);
            const w2 = Math.sin(x * 0.011 - y * 0.026 - fTime * 2.3 + w1 * 0.6);
            const wave = (w1 + w2) * 0.5;
            px += wave * 3.0 + wx * 6;
            py += Math.cos(x * 0.015 - y * 0.020 - fTime * 2.6) * 2.4 + wy * 6;
            boost += (0.5 + 0.5 * wave) * 0.10 * edge;   // gentle brightness breathing
            // cursor push-away — smoothstep falloff, tracks pm* which now keeps up
            if (pStr > 0.005) {
              const ddx = x - pmX, ddy = y - pmY, d2 = ddx * ddx + ddy * ddy;
              if (d2 < R2) {
                const dd = Math.sqrt(d2) || 1;
                const f = 1 - dd / R;
                const ef = f * f * (3 - 2 * f);
                const push = ef * 30 * pStr;
                px += (ddx / dd) * push;
                py += (ddy / dd) * push;
                boost += ef * 0.6 * pStr;
              }
            }
          }

          const rad = edge * (0.35 + 1.7 * n) + boost * 1.6;
          if (rad < 0.3) continue;
          const a = 0.05 + 0.24 * edge * n + boost;
          fx.fillStyle = 'rgba(232,177,90,' + (a < 0.62 ? a : 0.62).toFixed(3) + ')';
          fx.beginPath();
          fx.arc(px, py, rad, 0, 6.283);
          fx.fill();
        }
      }
    };

    const fResize = () => {
      const r = fog.getBoundingClientRect();
      fw = Math.max(1, Math.round(r.width * SCALE));
      fh = Math.max(1, Math.round(r.height * SCALE));
      fog.width = fw; fog.height = fh;
      fPaint();                         // never leave the canvas blank
    };
    if (window.ResizeObserver) new ResizeObserver(fResize).observe(fog);
    fResize();

    const fDraw = (t) => {
      if (!fRun || reduced || document.hidden) return;
      // frame-rate independent: paint every frame, advance by real elapsed time
      const dt = fLast ? Math.min(50, t - fLast) : 16;
      fLast = t;
      fTime += dt * 0.00020;
      const kP = 1 - Math.pow(0.60, dt / 16);   // cursor point catches up quickly
      const kS = 1 - Math.pow(0.82, dt / 16);   // influence strength eases in/out
      pStr += (pWant - pStr) * kS;
      pmX += (ptX - pmX) * kP;
      pmY += (ptY - pmY) * kP;
      fPaint();
      requestAnimationFrame(fDraw);
    };

    if (!reduced) {
      const fStart = () => { if (!fRun) { fRun = true; fLast = 0; requestAnimationFrame(fDraw); } };
      const hero = fog.parentElement;
      const onMove = (e) => {
        const r = fog.getBoundingClientRect();
        ptX = (e.clientX - r.left) * SCALE;
        ptY = (e.clientY - r.top) * SCALE;
        if (pmX < -900) { pmX = ptX; pmY = ptY; }
        pWant = 1;
        fStart();
      };
      hero.addEventListener('pointermove', onMove, { passive: true });
      hero.addEventListener('pointerleave', () => { pWant = 0; });
      const fObs = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.isIntersecting) fStart(); else fRun = false; });
      }, { threshold: 0 });
      fObs.observe(fog);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { fRun = false; } else { fStart(); }
      });
    }
  }

  /* ---------- flagship dashboard: click-to-load gate ---------- */
  const dashWin = document.querySelector('.dashboard-window');
  const dashGate = dashWin?.querySelector('.dash-gate');
  const dashFrame = dashWin?.querySelector('iframe');
  dashGate?.addEventListener('click', () => {
    if (dashFrame && !dashFrame.src && dashFrame.dataset.src) {
      dashFrame.src = dashFrame.dataset.src;
    }
    dashWin.classList.remove('is-gated');
    dashFrame?.focus();
  });

  /* ---------- decrypt-on-hover for menu links ---------- */
  if (!reduced) {
    const GLYPHS = '!<>-_\\/[]{}=+*^?#%$&01';
    const scramble = (el) => {
      const target = el.dataset.text || (el.dataset.text = el.textContent);
      clearInterval(el._scr);
      const total = 16;                // frames until fully settled (~500ms)
      let frame = 0;
      el._scr = setInterval(() => {
        frame++;
        let out = '';
        for (let i = 0; i < target.length; i++) {
          const ch = target[i];
          if (ch === ' ') { out += ' '; continue; }
          const settleAt = Math.floor((i / target.length) * total * 0.75);
          out += frame > settleAt ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        el.textContent = out;
        if (frame >= total) { clearInterval(el._scr); el.textContent = target; }
      }, 32);
    };
    const restore = (el) => {
      clearInterval(el._scr);
      if (el.dataset.text) el.textContent = el.dataset.text;
    };
    document.querySelectorAll('.topnav a, .ov-nav a span').forEach((el) => {
      el.addEventListener('mouseenter', () => scramble(el));
      el.addEventListener('mouseleave', () => restore(el));
      el.addEventListener('focus', () => scramble(el));
      el.addEventListener('blur', () => restore(el));
    });
  }

  /* ---------- pressure-type on the hero heading (desktop pointer, motion-safe) ---------- */
  const heroH1 = document.querySelector('.hero-copy h1');
  if (heroH1 && !reduced &&
      window.matchMedia('(pointer: fine)').matches &&
      window.matchMedia('(min-width: 721px)').matches) {
    const W0 = 700, W1 = 900, WD0 = 100, WD1 = 136, RADIUS = 155;

    // per-letter spans, grouped into non-breaking word wrappers so lines only
    // break at real spaces; keeps the <em> wrapper intact
    const wrap = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (part === '') return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const word = document.createElement('span');
            word.className = 'tp-word';
            for (const ch of part) {
              const s = document.createElement('span');
              s.className = 'tp-ch';
              s.textContent = ch;
              word.appendChild(s);
            }
            frag.appendChild(word);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) {
          wrap(n);
        }
      });
    };
    if (!heroH1.hasAttribute('aria-label')) {
      heroH1.setAttribute('aria-label', heroH1.textContent.replace(/\s+/g, ' ').trim());
    }
    wrap(heroH1);

    const chars = [...heroH1.querySelectorAll('.tp-ch')].map((el) => ({ el, cx: 0, cy: 0, cur: 0 }));
    const measure = () => chars.forEach((c) => {
      const r = c.el.getBoundingClientRect();
      c.cx = r.left + r.width / 2;
      c.cy = r.top + r.height / 2;
    });
    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);

    const hero = document.querySelector('.hero');
    let mx = -9999, my = -9999, raf = 0, active = false;
    const loop = () => {
      let moving = false;
      for (const c of chars) {
        const d = Math.hypot(c.cx - mx, c.cy - my);
        const tgt = d < RADIUS ? (1 - d / RADIUS) ** 2 : 0;
        c.cur += (tgt - c.cur) * 0.22;
        if (Math.abs(tgt - c.cur) > 0.001) moving = true;
        const p = c.cur;
        c.el.style.fontVariationSettings =
          `"wght" ${(W0 + p * (W1 - W0)).toFixed(0)}, "wdth" ${(WD0 + p * (WD1 - WD0)).toFixed(0)}`;
        c.el.style.transform = p > 0.002
          ? `translateY(${(-4 * p).toFixed(2)}px) scale(${(1 + 0.13 * p).toFixed(3)})`
          : '';
      }
      raf = (moving || active) ? requestAnimationFrame(loop) : 0;
    };
    hero.addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY; active = true;
      if (!raf) raf = requestAnimationFrame(loop);
    });
    hero.addEventListener('pointerleave', () => {
      active = false; mx = my = -9999;
      if (!raf) raf = requestAnimationFrame(loop);
    });
  }
})();
