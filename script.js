(() => {
  const heroHeadline = document.getElementById('hero-headline');
  if (heroHeadline) {
    const plainText = heroHeadline.dataset.plain || '';
    const emText = heroHeadline.dataset.em || '';
    const reducedForHeadline = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reducedForHeadline) {
      const DECK = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const pick = () => DECK[(Math.random() * DECK.length) | 0];
      heroHeadline.textContent = '';
      const plainSpan = document.createElement('span');
      const emEl = document.createElement('em');
      heroHeadline.appendChild(plainSpan);
      heroHeadline.appendChild(emEl);
      const chars = [...plainText].map((ch) => {
        const s = document.createElement('span');
        s.textContent = ch === ' ' ? ' ' : pick();
        plainSpan.appendChild(s);
        return s;
      });
      const total = plainText.length + emText.length;
      const duration = 1000;
      const fps = 24;
      let t0 = null;
      let lastSwap = 0;
      const frame = (now) => {
        if (t0 === null) t0 = now;
        if (now - lastSwap >= 1000 / fps) {
          lastSwap = now;
          const ratio = Math.min(1, (now - t0) / duration);
          const lockedCount = Math.floor(ratio * total);
          for (let i = 0; i < plainText.length; i++) {
            const ch = plainText[i];
            chars[i].textContent = ch === ' ' ? ' ' : (i < lockedCount ? ch : pick());
          }
          let emOut = '';
          for (let i = 0; i < emText.length; i++) {
            const ch = emText[i];
            const globalIdx = plainText.length + i;
            emOut += ch === ' ' || globalIdx < lockedCount ? ch : pick();
          }
          emEl.textContent = emOut;
        }
        if (now - t0 < duration + 80) {
          requestAnimationFrame(frame);
        } else {
          chars.forEach((s, i) => { s.textContent = plainText[i] === ' ' ? ' ' : plainText[i]; });
          emEl.textContent = emText;
        }
      };
      requestAnimationFrame(frame);
    }
  }

  const reducedForTilt = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reducedForTilt) {
    const TILT_MAX = 7;
    document.querySelectorAll('.portfolio-card, .skill-card').forEach((card) => {
      card.addEventListener('pointermove', (event) => {
        if (event.pointerType === 'touch') return;
        const rect = card.getBoundingClientRect();
        const cx = (event.clientX - rect.left) / rect.width - 0.5;
        const cy = (event.clientY - rect.top) / rect.height - 0.5;
        card.style.setProperty('--rx', `${-cy * TILT_MAX * 2}deg`);
        card.style.setProperty('--ry', `${cx * TILT_MAX * 2}deg`);
        card.style.setProperty('--gx', `${(cx + 0.5) * 100}%`);
        card.style.setProperty('--gy', `${(cy + 0.5) * 100}%`);
        card.style.setProperty('--tilt-s', '1.015');
        card.style.setProperty('--tilt-trs', '0ms');
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--tilt-s', '1');
        card.style.setProperty('--tilt-trs', '320ms');
      });
    });
  }

  const themeToggle = document.querySelector('[data-theme-toggle]');
  const dashboardFrame = document.querySelector('.dashboard-window iframe');
  const dashboardSkeleton = document.querySelector('.dashboard-skeleton');
  dashboardFrame?.addEventListener('load', () => dashboardSkeleton?.classList.add('is-hidden'), { once: true });
  const currentTheme = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  const notifyDashboard = (theme) => {
    dashboardFrame?.contentWindow?.postMessage({ type: 'otd-theme', theme }, '*');
  };
  if (dashboardFrame) {
    const src = new URL(dashboardFrame.getAttribute('src'), window.location.href);
    src.searchParams.set('theme', currentTheme());
    dashboardFrame.setAttribute('src', `${src.pathname}${src.search}`);
  }
  const applyThemeIcon = () => {
    const isLight = currentTheme() === 'light';
    if (!themeToggle) return;
    themeToggle.checked = isLight;
    themeToggle.closest('.theme-switch')?.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
  };
  applyThemeIcon();
  themeToggle?.addEventListener('change', () => {
    if (themeToggle.checked) {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('site-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('site-theme', 'dark');
    }
    applyThemeIcon();
    notifyDashboard(currentTheme());
  });

  const header = document.querySelector('[data-header]');
  const menuButton = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  const sections = [...document.querySelectorAll('main section[id]')];
  const navAnchors = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const setHeader = () => header?.classList.toggle('scrolled', window.scrollY > 24);
  setHeader();
  let scrollFrame = 0;
  window.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      setHeader();
      scrollFrame = 0;
    });
  }, { passive: true });

  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    navLinks?.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
  });

  navAnchors.forEach((link) => link.addEventListener('click', () => {
    menuButton?.setAttribute('aria-expanded', 'false');
    navLinks?.classList.remove('open');
    document.body.classList.remove('menu-open');
  }));

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const easeInOut = (progress) => progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - ((-2 * progress + 2) ** 3) / 2;

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.getAttribute('href');
      const target = id && id !== '#' ? document.querySelector(id) : null;
      if (!target) return;
      event.preventDefault();

      const start = window.scrollY;
      const destination = Math.max(0, target.getBoundingClientRect().top + start - 92);
      const distance = destination - start;
      if (reducedMotion || Math.abs(distance) < 8) {
        window.scrollTo(0, destination);
        history.replaceState(null, '', id);
        return;
      }

      const started = performance.now();
      const duration = 560;
      const step = (now) => {
        const progress = Math.min(1, (now - started) / duration);
        window.scrollTo(0, start + distance * easeInOut(progress));
        if (progress < 1) requestAnimationFrame(step);
        else history.replaceState(null, '', id);
      };
      requestAnimationFrame(step);
    });
  });

  const countElements = document.querySelectorAll('[data-count-to]');
  if (countElements.length) {
    const animateCount = (element) => {
      const target = Number(element.getAttribute('data-count-to')) || 0;
      const suffix = element.getAttribute('data-count-suffix') || '';
      if (reducedMotion) {
        element.textContent = target + suffix;
        return;
      }
      const duration = 1100;
      const started = performance.now();
      const step = (now) => {
        const progress = Math.min(1, (now - started) / duration);
        element.textContent = Math.round(target * easeInOut(progress)) + suffix;
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const countObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    countElements.forEach((element) => countObserver.observe(element));
  }

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navAnchors.forEach((link) => {
        link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`);
      });
    });
  }, { rootMargin: '-35% 0px -55% 0px' });
  sections.forEach((section) => sectionObserver.observe(section));

  const toast = document.querySelector('.toast');
  document.querySelector('[data-copy-email]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('youssefkhoury01@gmail.com');
      toast?.classList.add('show');
      window.setTimeout(() => toast?.classList.remove('show'), 1800);
    } catch {
      window.location.href = 'mailto:youssefkhoury01@gmail.com';
    }
  });

  document.querySelectorAll('[data-year]').forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('motion-paused', document.hidden);
  });
})();
