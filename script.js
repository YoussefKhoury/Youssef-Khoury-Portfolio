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
  const workSec = document.getElementById('work');
  const workRail = workSec?.querySelector('.work-rail span');
  const workRows = [...(workSec ? workSec.querySelectorAll('.row') : [])];

  const onScroll = () => {
    const vh = window.innerHeight;
    header?.classList.toggle('scrolled', window.scrollY > 20);
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

  // Fallback: if IntersectionObserver never delivers (rare edge cases), un-hide
  // everything so nothing is stuck invisible.
  setTimeout(() => {
    if (!document.querySelector('.reveal.visible')) {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
      counters.forEach(runCount);
    }
  }, 4000);

  /* ---------- nav active section ---------- */
  const navLinks = [...document.querySelectorAll('.topnav a[href^="#"]')];
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

  /* ---------- copy email ---------- */
  const toast = document.querySelector('.toast');
  document.querySelector('[data-copy-email]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('youssefkhoury01@gmail.com');
      toast?.classList.add('show');
      setTimeout(() => toast?.classList.remove('show'), 1700);
    } catch {
      window.location.href = 'mailto:youssefkhoury01@gmail.com';
    }
  });

  /* ---------- hero motes ---------- */
  const canvas = document.getElementById('motes');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const DPR = Math.min(window.devicePixelRatio || 1, 1.75);
    let w = 1, h = 1, pts = [], running = false;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * DPR);
      canvas.height = Math.round(h * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const n = Math.max(10, Math.min(28, Math.round(w * h / 24000)));
      pts = [];
      for (let i = 0; i < n; i++) pts.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 0.7 + Math.random() * 1.5, spd: 0.07 + Math.random() * 0.16,
        seed: Math.random() * 6.283, sway: 4 + Math.random() * 9
      });
    };
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    resize();

    // motes get a transient push from scroll velocity, then settle
    let lastScrollY = window.scrollY;
    let scrollKick = 0;
    if (!reduced) {
      window.addEventListener('scroll', () => {
        const dy = window.scrollY - lastScrollY;
        lastScrollY = window.scrollY;
        scrollKick = Math.max(-4, Math.min(4, scrollKick + dy * 0.03));
      }, { passive: true });
    }

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      scrollKick *= 0.9;
      for (let i = 0; i < pts.length; i++) {
        const m = pts[i];
        if (!reduced) {
          m.y -= m.spd + scrollKick * (0.4 + m.r * 0.3);
          if (m.y < -6) { m.y = h + 6; m.x = Math.random() * w; }
          else if (m.y > h + 6) { m.y = -6; m.x = Math.random() * w; }
        }
        const x = m.x + Math.sin(t * 0.001 + m.seed) * m.sway;
        const edge = Math.min(1, m.y / 50, (h - m.y) / 50);
        ctx.fillStyle = 'rgba(232,177,90,' + (0.05 + 0.32 * Math.max(0, edge)) + ')';
        ctx.beginPath();
        ctx.arc(x, m.y, m.r, 0, 6.283);
        ctx.fill();
      }
      if (running && !reduced && !document.hidden) requestAnimationFrame(draw);
    };

    const start = () => { if (!running) { running = true; requestAnimationFrame(draw); } };
    const stop = () => { running = false; };

    if (reduced) {
      draw(2400);
    } else {
      // only animate while the hero is on screen
      const heroObserver = new IntersectionObserver((entries) => {
        entries.forEach((e) => (e.isIntersecting ? start() : stop()));
      }, { threshold: 0.02 });
      heroObserver.observe(canvas);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && running) requestAnimationFrame(draw);
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
    const REST = 700, MAX_ADD = 200, RADIUS = 190;

    // split into per-letter spans, keeping the <em> wrapper and spaces intact
    const wrap = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const ch of n.textContent) {
            if (ch === ' ') { frag.appendChild(document.createTextNode(' ')); continue; }
            const s = document.createElement('span');
            s.className = 'tp-ch';
            s.textContent = ch;
            frag.appendChild(s);
          }
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
        c.cur += (tgt - c.cur) * 0.16;
        if (Math.abs(tgt - c.cur) > 0.001) moving = true;
        c.el.style.fontWeight = (REST + c.cur * MAX_ADD).toFixed(0);
        c.el.style.transform = c.cur > 0.002
          ? `translateY(${(-2.5 * c.cur).toFixed(2)}px) scale(${(1 + 0.05 * c.cur).toFixed(3)})`
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
