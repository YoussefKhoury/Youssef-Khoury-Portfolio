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

  // one renderer for the rail. normally the fill tracks whichever row sits on
  // the scroll focus line; while a case is open it pins to that row's dot.
  // everything is measured live, because opening a panel reflows every row
  // below it and the old geometry is stale within a frame.
  let railPin = null;
  let railAnimating = false;

  const renderRail = () => {
    if (!workSec || !workRail || !workRows.length) return;
    const firstRect = workRows[0].getBoundingClientRect();
    const lastRect = workRows[workRows.length - 1].getBoundingClientRect();
    const firstCenter = firstRect.top + firstRect.height / 2;
    const lastCenter = lastRect.top + lastRect.height / 2;
    const span = Math.max(1, lastCenter - firstCenter);
    // pin the track to the first and last nodes rather than to hand-tuned
    // offsets, so the line lands on the dots at every breakpoint
    const track = workRail.parentElement;
    const shellBox = track.offsetParent?.getBoundingClientRect();
    if (shellBox) {
      track.style.top = (firstCenter - shellBox.top) + 'px';
      track.style.bottom = 'auto';
      track.style.height = span + 'px';
    }
    let mark;
    if (railPin) {
      const pinRect = railPin.getBoundingClientRect();
      mark = pinRect.top + pinRect.height / 2;
    } else {
      mark = window.innerHeight * 0.5;
    }
    const p = Math.min(1, Math.max(0, (mark - firstCenter) / span));
    workRail.style.height = (p * 100) + '%';
    // light a row's node once the fill reaches that row's own position on the
    // same first/last-center scale used for p, so the last dot lights exactly
    // when p hits 1 regardless of the track's on-screen geometry
    workRows.forEach((row) => {
      const rr = row.getBoundingClientRect();
      const rowFrac = (rr.top + rr.height / 2 - firstCenter) / span;
      row.classList.toggle('rail-lit', p >= rowFrac - 0.01);
    });
  };

  // a CSS height transition emits no layout events, so the only way to keep
  // the fill sitting on the dot while a panel opens or closes is to re-measure
  // every frame until it settles
  const trackRailUntilSettled = (panel) => {
    railAnimating = true;
    let stopped = false;
    const tick = () => { if (stopped) return; renderRail(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const end = () => {
      if (stopped) return;
      stopped = true;
      railAnimating = false;
      panel.removeEventListener('transitionend', onEnd);
      clearTimeout(guard);
      renderRail();
    };
    const onEnd = (e) => { if (e.target === panel && e.propertyName === 'height') end(); };
    panel.addEventListener('transitionend', onEnd);
    const guard = setTimeout(end, 800);   // fallback if transitionend never fires
  };

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
    renderRail();
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
    if (railPin && !railAnimating) railPin = null;   // user scrolled: hand the rail back to the scroll position
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { onScroll(); ticking = false; });
  }, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  /* ---------- full-screen index overlay ---------- */
  const overlay = document.getElementById('overlay');
  const indexBtn = document.querySelector('.index-btn');
  const indexBtnLabel = indexBtn?.querySelector('span');

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
    if (indexBtnLabel) indexBtnLabel.textContent = 'Close ×';
    requestAnimationFrame(() => indexBtn?.focus());
  };
  const closeOverlay = () => {
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    indexBtn?.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('menu-open');
    if (indexBtnLabel) indexBtnLabel.textContent = 'Menu';
    indexBtn?.focus();
  };

  /* one control: it opens the index, then closes it from the same spot */
  indexBtn?.addEventListener('click', () => {
    if (overlay?.classList.contains('open')) closeOverlay(); else openOverlay();
  });
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
  overlay?.querySelectorAll('.ov-nav a').forEach((a) => a.addEventListener('click', closeOverlay));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay?.classList.contains('open')) closeOverlay();
  });

  // keep Tab focus inside the dialog while it is open
  overlay?.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !overlay.classList.contains('open')) return;
    const items = [indexBtn, ...overlay.querySelectorAll('a[href], button:not([disabled])')]
      .filter((el) => el && el.offsetParent !== null);
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
    const dp = Number(el.getAttribute('data-count-decimals')) || 0;
    const fmt = (n) => n.toFixed(dp) + suffix;
    if (reduced) { el.textContent = fmt(target); return; }
    const duration = 1100;
    const start = performance.now();
    let done = false;
    const finish = () => { if (done) return; done = true; el.textContent = fmt(target); };
    el.textContent = fmt(0);
    const step = (now) => {
      if (done) return;
      const p = Math.min(1, (now - start) / duration);
      el.textContent = fmt(target * easeOut(p));
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

  /* ---------- contact heading: static in the DOM, CTAs/socials fade in on scroll ----------
     the heading text lives in the markup so it's never empty (no-JS, JS-fails,
     or before-scroll all show the real text) — only the reveal is animated */
  const typeHeading = document.querySelector('.type-heading');
  if (typeHeading) {
    const cursor = typeHeading.querySelector('.type-cursor');
    if (cursor) cursor.style.display = 'none';
    const revealAfter = document.querySelector('.contact-reveal');
    if (reduced || !revealAfter) {
      revealAfter && revealAfter.classList.add('visible');
    } else {
      const headObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) { revealAfter.classList.add('visible'); headObserver.unobserve(entry.target); }
        });
      }, { threshold: 0.5 });
      headObserver.observe(typeHeading);
    }
  }

  /* ---------- expandable case detail ---------- */
  const caseToggles = [...document.querySelectorAll('.row[aria-controls]')];
  const setCase = (btn, panel, open) => {
    btn.setAttribute('aria-expanded', String(open));
    panel.classList.toggle('open', open);
    const label = btn.querySelector('.go b');
    if (label) label.textContent = open ? 'Close case file' : 'Open';
    panel.style.height = panel.scrollHeight + 'px';
    if (open) {
      // transitionend bubbles: without the target/property guard the first
      // child transition to finish cuts the height animation short
      const done = (e) => {
        if (e && (e.target !== panel || e.propertyName !== 'height')) return;
        panel.style.height = 'auto';
        panel.removeEventListener('transitionend', done);
        if (matchMedia('(max-width: 720px)').matches) {
          // on a phone the panel opens below the fold — bring its head back up
          btn.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      };
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
      // the rail follows the open case; releasing the pin hands it back to scroll
      railPin = willOpen ? btn : null;
      setCase(btn, panel, willOpen);
      trackRailUntilSettled(panel);
    });
  });

  /* ---------- case detail: Situation / Built / Showed tabs ----------
     Panels are grid-stacked in CSS, so selecting one never changes the height
     of the .case container the accordion above is animating. */
  document.querySelectorAll('.case-tabs').forEach((list) => {
    const tabs = [...list.querySelectorAll('.ct-tab')];
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.classList.toggle('on', on);
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const p = document.getElementById(t.getAttribute('aria-controls'));
        if (p) p.classList.toggle('on', on);
      });
      if (focus) tab.focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (step) { e.preventDefault(); select(tabs[(i + step + tabs.length) % tabs.length], true); }
        else if (e.key === 'Home') { e.preventDefault(); select(tabs[0], true); }
        else if (e.key === 'End') { e.preventDefault(); select(tabs[tabs.length - 1], true); }
      });
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
  let syncDrawer = () => {};
  const setSection = (sec, open) => {
    if (!mqMobile.matches || sec.classList.contains('open') === open) return;
    const head = sec.querySelector('.sec-head');
    const body = sec.querySelector('.sec-body');
    if (!head || !body) return;
    if (open) body.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));

    let t;
    const done = (e) => {
      // transitionend bubbles up from every child that finishes a transition;
      // acting on those cut the height animation short, which is what read as
      // a blink — the box snapped to its resting size mid-open.
      if (e && (e.target !== body || e.propertyName !== 'height')) return;
      body.style.height = '';                         // hand resting state back to CSS
      body.style.paddingTop = '';
      body.style.paddingBottom = '';
      body.removeEventListener('transitionend', done);
      clearTimeout(t);
    };

    if (open) {
      // .open brings padding and borders with it. The box is border-box, so a
      // height of 0 with padding on still renders ~36px — measure the target
      // with the open styles applied, then animate height AND padding from 0.
      sec.classList.add('open');
      head.setAttribute('aria-expanded', 'true');
      const target = body.offsetHeight;               // border-box, so borders count
      body.style.transition = 'none';
      body.style.height = '0px';
      body.style.paddingTop = '0px';
      body.style.paddingBottom = '0px';
      void body.offsetHeight;
      body.style.transition = '';
      body.style.height = target + 'px';
      body.style.paddingTop = '';
      body.style.paddingBottom = '';
    } else {
      body.style.transition = 'none';
      body.style.height = body.offsetHeight + 'px';
      void body.offsetHeight;
      body.style.transition = '';
      sec.classList.remove('open');
      head.setAttribute('aria-expanded', 'false');
      body.style.height = '0px';                      // padding follows from CSS
    }

    body.addEventListener('transitionend', done);
    t = setTimeout(done, 700);                        // fallback if transitionend never fires
    if (reduced) done();
    syncDrawer();
  };

  /* the drawer front is only a control while something is drawn out of it */
  const drawerFront = document.querySelector('.drawer-front');
  syncDrawer = () => {
    if (drawerFront) {
      drawerFront.disabled = !(mqMobile.matches && collSecs.some((s) => s.classList.contains('open')));
    }
  };
  syncDrawer();
  mqMobile.addEventListener('change', syncDrawer);

  /* pressing it files everything back in: the open folders slide shut in turn,
     bottom one first, and the front knocks closed behind the last of them */
  drawerFront?.addEventListener('click', () => {
    const open = collSecs.filter((s) => s.classList.contains('open')).reverse();
    if (!open.length) return;
    const step = reduced ? 0 : 110;

    /* Stay put while they fold shut. Scroll anchoring (kept on so opening a
       second folder doesn't jump) would, as the page shrinks, chase a node
       below the collapse and ride the viewport down to the footer — the bug.
       Suppress anchoring on the drawer for the duration of the fold, then
       hand it back. No scripted scroll: near the top nothing moves; scrolled
       deep, the rising floor carries the viewport up, which is fine. */
    const dossier = drawerFront.closest('.dossier');
    dossier?.classList.add('filing');
    const foldMs = (open.length - 1) * step + 700;
    setTimeout(() => dossier?.classList.remove('filing'), foldMs);

    open.forEach((sec, i) => {
      if (step) setTimeout(() => setSection(sec, false), i * step);
      else setSection(sec, false);
    });

    if (reduced) { dossier?.classList.remove('filing'); return; }
    setTimeout(() => {
      drawerFront.classList.add('shutting');
      drawerFront.addEventListener('animationend', () => drawerFront.classList.remove('shutting'), { once: true });
    }, (open.length - 1) * step + 300);
  });

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
  document.querySelectorAll('.to-top, .to-top-scroll').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  /* ---------- copy email ---------- */
  const toast = document.querySelector('.toast');
  const flashToast = (msg) => {
    if (!toast) return;
    toast.textContent = msg || 'Email copied';
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 2200);
  };
  const ADDR = 'youssefkhoury01@gmail.com';
  // iOS Safari ignores execCommand('copy') on a plain <textarea>: it needs a
  // contentEditable node with a real Range selection, and refuses a node that
  // is off-screen or opacity:0. Keep it in the viewport but invisible-by-size.
  const legacyCopy = () => {
    // window.getSelection() can return null and execCommand can throw; a throw
    // escaping here used to reject copyEmail's promise silently, so the toast
    // never fired and the tap looked dead
    const sel = window.getSelection();
    if (!sel) return false;
    const el = document.createElement('div');
    el.textContent = ADDR;
    el.contentEditable = 'true';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;' +
      'opacity:0.01;pointer-events:none;font-size:16px;';
    document.body.appendChild(el);
    let ok = false;
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      ok = document.execCommand('copy');
      sel.removeAllRanges();
    } catch { ok = false; }
    el.remove();
    return ok;
  };
  const copyEmail = async () => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(ADDR);
        ok = true;
      }
    } catch {}
    if (!ok) { try { ok = legacyCopy(); } catch {} }
    // either way the tap gets an answer: confirmation, or the address itself
    // so it can still be read off the screen
    flashToast(ok ? 'Email copied' : ADDR);
  };
  // Every email affordance copies the address without opening a mail app.
  // Keep the mailto: href as a no-JavaScript fallback.
  document.querySelectorAll('[data-copy-email]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      copyEmail();
    });
  });
  // tapping the toast dismisses it
  toast?.addEventListener('click', () => toast.classList.remove('show'));

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
    // per-frame dot budget. Spacing was a fixed 5 buffer px, so a wide desktop
    // hero cost ~17k arcs per frame (a phone costs ~3k) — that gap is why
    // desktop scrolling stuttered while mobile stayed smooth. Spacing is now
    // derived from the buffer area so the cost is flat across screen sizes.
    const DOTS = 5200;
    let fStep = 5;                      // grid spacing in buffer px
    let fw = 1, fh = 1, fNarrow = false, fRun = false, fLast = 0, fTime = Math.random() * 100;
    // the canvas bleeds past the hero (see styles.css). fV* is the visible hero
    // region expressed in buffer px, fVX/fVY its top-left inside the buffer —
    // density and the edge vignette are measured against this, not the whole
    // buffer, so the bleed is pure overscan that hides the black border strip.
    let fVW = 1, fVH = 1, fVX = 0, fVY = 0;
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
      const cx = fVX + fVW / 2, cy = fVY + fVH / 2;   // visible-hero centre
      if (!reduced) fWash();
      const R = fVW * 0.22;              // cursor influence radius
      const R2 = R * R;
      const rs = fStep / 5;              // keep dot mass constant as spacing grows
      for (let y = fStep * 0.5; y < fh; y += fStep) {
        for (let x = fStep * 0.5; x < fw; x += fStep) {
          // normalise per axis so the clearing hugs the hero's own shape
          // clear the centre so the headline/photo/buttons stay readable.
          // on a phone the hero is tall + narrow, so a round vignette shrinks to
          // two thin side strips — drive it mostly off the horizontal axis
          // instead, so dots run full-strength right out to both edges even as
          // the wave pushes them around.
          const ux = (x - cx) / (fVW / 2), uy = (y - cy) / (fVH / 2);
          let edge;
          if (fNarrow) {
            edge = Math.max((Math.abs(ux) - 0.02) / 0.72, (Math.abs(uy) - 0.34) / 0.66);
          } else {
            const nd = Math.min(1, Math.hypot(ux, uy) / 1.414);
            edge = (nd - 0.24) / 0.76;
          }
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
                const push = ef * 24 * pStr;
                px += (ddx / dd) * push;
                py += (ddy / dd) * push;
                boost += ef * 0.6 * pStr;
              }
            }
          }

          const rad = (edge * (0.35 + 1.7 * n) + boost * 1.6) * rs;
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
      const pr = (fog.parentElement || fog).getBoundingClientRect();
      fw = Math.max(1, Math.round(r.width * SCALE));
      fh = Math.max(1, Math.round(r.height * SCALE));
      // visible hero region, in buffer px, and where it sits inside the buffer
      fVW = Math.max(1, (pr.width || r.width) * SCALE);
      fVH = Math.max(1, (pr.height || r.height) * SCALE);
      fVX = (fw - fVW) / 2;
      fVY = (fh - fVH) / 2;
      fNarrow = (pr.width || r.width) < 720;
      fStep = Math.max(5, Math.sqrt((fVW * fVH) / DOTS));
      fog.width = fw; fog.height = fh;
      fPaint();                         // never leave the canvas blank
    };
    if (window.ResizeObserver) new ResizeObserver(fResize).observe(fog);
    fResize();

    const fDraw = (t) => {
      if (!fRun || reduced || document.hidden) return;
      requestAnimationFrame(fDraw);
      // ambient haze: 30fps is indistinguishable here and leaves the other half
      // of every frame budget to the scroll work
      if (fLast && t - fLast < 31) return;
      // frame-rate independent: advance by real elapsed time
      const dt = fLast ? Math.min(50, t - fLast) : 16;
      fLast = t;
      fTime += dt * 0.00020;
      const kP = 1 - Math.pow(0.60, dt / 16);   // cursor point catches up quickly
      const kS = 1 - Math.pow(0.82, dt / 16);   // influence strength eases in/out
      pStr += (pWant - pStr) * kS;
      pmX += (ptX - pmX) * kP;
      pmY += (ptY - pmY) * kP;
      fPaint();
    };

    if (!reduced) {
      const fStart = () => { if (!fRun) { fRun = true; fLast = 0; requestAnimationFrame(fDraw); } };
      // dots are ambient only — no cursor/touch push
      const fObs = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.isIntersecting) fStart(); else fRun = false; });
      }, { threshold: 0 });
      fObs.observe(fog);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { fRun = false; } else { fStart(); }
      });
    }
  }

  /* ---------- flagship dashboard: autoload once it scrolls near view ----------
     no click gate — the skeleton stays visible until the iframe fires load */
  const dashWin = document.querySelector('.dashboard-window');
  const dashFrame = dashWin?.querySelector('iframe');
  if (dashWin && dashFrame) {
    const loadDash = () => {
      if (dashFrame.src) return;
      dashFrame.src = dashFrame.dataset.src;
      dashFrame.addEventListener('load', () => dashWin.classList.remove('is-gated'), { once: true });
    };
    const dashObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { loadDash(); dashObserver.unobserve(entry.target); }
      });
    }, { rootMargin: '400px 0px' });
    dashObserver.observe(dashWin);
  }

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
    document.querySelectorAll('.topnav a').forEach((el) => {
      el.addEventListener('mouseenter', () => scramble(el));
      el.addEventListener('mouseleave', () => restore(el));
      el.addEventListener('focus', () => scramble(el));
      el.addEventListener('blur', () => restore(el));
    });
  }

  /* ---------- pressure-type on the hero heading (desktop pointer, motion-safe) ---------- */
  const heroH1 = document.querySelector('.hero-copy h1');
  const heroDate = document.querySelector('.hero .birthdate');
  const ptTargets = [heroH1, heroDate].filter(Boolean);
  if (ptTargets.length && !reduced &&
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
    ptTargets.forEach((node) => {
      if (!node.hasAttribute('aria-label') && !node.hasAttribute('aria-hidden')) {
        node.setAttribute('aria-label', node.textContent.replace(/\s+/g, ' ').trim());
      }
      wrap(node);
    });

    const chars = ptTargets
      .flatMap((node) => [...node.querySelectorAll('.tp-ch')])
      .map((el) => ({ el, cx: 0, cy: 0, cur: 0 }));
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
    let mx = -9999, my = -9999, raf = 0, active = false, tpLast = 0;
    const loop = (ts) => {
      const dt = tpLast ? Math.min(48, ts - tpLast) : 16;
      tpLast = ts;
      const k = 1 - Math.exp(-dt / 120);            // gentle, frame-rate independent
      let moving = false;
      for (const c of chars) {
        const d = Math.hypot(c.cx - mx, c.cy - my);
        const tgt = d < RADIUS ? (1 - d / RADIUS) ** 2 : 0;
        c.cur += (tgt - c.cur) * k;
        if (Math.abs(tgt - c.cur) > 0.002) moving = true;
        const p = c.cur;
        // weight/width only — no positional transform, so letters never jump
        const w = (W0 + p * (W1 - W0)).toFixed(1);
        if (w !== c.lw) {
          c.lw = w;
          c.el.style.fontVariationSettings = `"wght" ${w}, "wdth" ${(WD0 + p * (WD1 - WD0)).toFixed(1)}`;
        }
      }
      raf = (moving || active) ? requestAnimationFrame(loop) : (tpLast = 0);
    };
    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;   // ignore touch input, incl. touchscreen PCs
      mx = e.clientX; my = e.clientY; active = true;
      if (!raf) raf = requestAnimationFrame(loop);
    });
    hero.addEventListener('pointerleave', () => {
      active = false; mx = my = -9999;
      if (!raf) raf = requestAnimationFrame(loop);
    });
  }
})();
