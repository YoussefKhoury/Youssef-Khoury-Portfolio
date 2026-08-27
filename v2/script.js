(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Content is visible by default; only allow the hidden/reveal state now that JS runs.
  document.documentElement.classList.add('js');

  /* ---------- header + mobile nav ---------- */
  const header = document.querySelector('[data-header]');
  const menuBtn = document.querySelector('.menu-toggle');
  const nav = document.getElementById('nav');

  const setHeader = () => header?.classList.toggle('scrolled', window.scrollY > 20);
  setHeader();
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { setHeader(); ticking = false; });
  }, { passive: true });

  menuBtn?.addEventListener('click', () => {
    const open = menuBtn.getAttribute('aria-expanded') !== 'true';
    menuBtn.setAttribute('aria-expanded', String(open));
    nav?.classList.toggle('open', open);
  });
  nav?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
    menuBtn?.setAttribute('aria-expanded', 'false');
    nav.classList.remove('open');
  }));

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

  // Fallback: if IntersectionObserver never delivers (rare edge cases), un-hide
  // everything so nothing is stuck invisible.
  setTimeout(() => {
    if (!document.querySelector('.reveal.visible')) {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
      counters.forEach(runCount);
    }
  }, 4000);

  /* ---------- nav active section ---------- */
  const navLinks = [...document.querySelectorAll('#nav a[href^="#"]')];
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

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < pts.length; i++) {
        const m = pts[i];
        if (!reduced) {
          m.y -= m.spd;
          if (m.y < -6) { m.y = h + 6; m.x = Math.random() * w; }
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

  /* ---------- dashboard skeleton hide (safety) ---------- */
  const frame = document.querySelector('.dashboard-window iframe');
  frame?.addEventListener('load', () => frame.classList.add('is-loaded'), { once: true });
})();
