(() => {
  const header = document.querySelector('[data-header]');
  const menuButton = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  const sections = [...document.querySelectorAll('main section[id]')];
  const navAnchors = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  const animateCount = (element) => {
    const target = Number(element.dataset.count || 0);
    if (reduceMotion) {
      element.textContent = target.toLocaleString();
      return;
    }
    const start = performance.now();
    const duration = 1100;
    const tick = (time) => {
      const progress = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = Math.round(target * eased).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        countObserver.unobserve(entry.target);
      }
    });
  }, { threshold: .5 });
  document.querySelectorAll('[data-count]').forEach((element) => countObserver.observe(element));

  const preview = document.querySelector('#project-preview');
  const tabs = [...document.querySelectorAll('.preview-tab')];
  tabs.forEach((tab) => tab.addEventListener('pointerenter', () => {
    const source = tab.dataset.image;
    if (source) new Image().src = source;
  }, { once: true }));
  tabs.forEach((tab) => tab.addEventListener('click', async () => {
    if (!preview || tab.classList.contains('active')) return;
    const source = tab.dataset.image || preview.src;
    const nextImage = new Image();
    nextImage.src = source;
    try { await nextImage.decode(); } catch { /* browser falls back to normal loading */ }
    tabs.forEach((item) => {
      item.classList.toggle('active', item === tab);
      item.setAttribute('aria-selected', String(item === tab));
    });
    preview.src = source;
    preview.alt = tab.dataset.alt || 'Project preview';
    if (!reduceMotion) {
      preview.animate([
        { opacity: 0, transform: 'translateY(10px) scale(.992)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }));

  const lightbox = document.querySelector('.lightbox');
  const lightboxImage = lightbox?.querySelector('img');
  document.querySelector('.preview-frame')?.addEventListener('click', () => {
    if (!lightbox || !lightboxImage || !preview) return;
    lightboxImage.src = preview.src;
    lightboxImage.alt = preview.alt;
    lightbox.showModal();
  });
  lightbox?.querySelector('.lightbox-close')?.addEventListener('click', () => lightbox.close());
  lightbox?.addEventListener('click', (event) => {
    if (event.target === lightbox) lightbox.close();
  });

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
