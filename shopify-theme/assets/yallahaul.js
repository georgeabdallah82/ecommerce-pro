/* Yalla Haul theme behaviour: phone menu, "All categories" panel, delivery area picker, photo
   slider. Works again after the theme editor re-renders a section (shopify:section:load). */
(() => {
  const AREA_KEY = 'yh-delivery-area';

  function initMenu(root) {
    root.querySelectorAll('[data-yh-menu]').forEach((menu) => {
      if (menu.dataset.yhReady) return;
      menu.dataset.yhReady = '1';
      const close = () => {
        menu.removeAttribute('open');
      };
      menu.addEventListener('toggle', () => {
        document.documentElement.classList.toggle('yh-locked', menu.open);
        if (menu.open) menu.querySelector('.yh-menu__close')?.focus();
      });
      menu.querySelectorAll('[data-yh-menu-close]').forEach((el) => el.addEventListener('click', close));
      menu.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          close();
          menu.querySelector('summary')?.focus();
        }
      });
    });
  }

  function initCats(root) {
    root.querySelectorAll('[data-yh-cats]').forEach((nav) => {
      if (nav.dataset.yhReady) return;
      nav.dataset.yhReady = '1';
      const toggle = nav.querySelector('[data-yh-cats-toggle]');
      const panel = nav.querySelector('[data-yh-cats-panel]');
      if (!toggle || !panel) return;
      const set = (open) => {
        toggle.setAttribute('aria-expanded', String(open));
        panel.hidden = !open;
      };
      toggle.addEventListener('click', () => set(panel.hidden));
      document.addEventListener('click', (event) => {
        if (!panel.hidden && !nav.contains(event.target)) set(false);
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden) {
          set(false);
          toggle.focus();
        }
      });
    });
  }

  function initDelivery(root) {
    root.querySelectorAll('[data-yh-area]').forEach((select) => {
      if (select.dataset.yhReady) return;
      select.dataset.yhReady = '1';
      const bar = select.closest('[data-yh-delivery]');
      const apply = () => {
        const option = select.selectedOptions[0];
        const eta = bar?.querySelector('[data-yh-eta]');
        if (eta && option?.dataset.eta) eta.textContent = option.dataset.eta;
        document.querySelectorAll('[data-yh-area-name]').forEach((el) => (el.textContent = select.value));
      };
      try {
        const saved = localStorage.getItem(AREA_KEY);
        if (saved && [...select.options].some((o) => o.value === saved)) select.value = saved;
      } catch (e) {}
      apply();
      select.addEventListener('change', () => {
        try {
          localStorage.setItem(AREA_KEY, select.value);
        } catch (e) {}
        apply();
      });
    });
  }

  function initSlider(root) {
    root.querySelectorAll('[data-yh-slider]').forEach((slider) => {
      if (slider.dataset.yhReady) return;
      slider.dataset.yhReady = '1';
      const track = slider.querySelector('[data-yh-track]');
      const slides = track ? [...track.children] : [];
      if (slides.length < 2) return;
      const dots = [...slider.querySelectorAll('[data-yh-dot]')];
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const seconds = Number(slider.dataset.autoplay || 0);
      let index = 0;
      let timer = null;

      const go = (next) => {
        index = (next + slides.length) % slides.length;
        track.style.transform = `translateX(-${index * 100}%)`;
        slides.forEach((slide, i) => slide.setAttribute('aria-hidden', String(i !== index)));
        slides.forEach((slide, i) => slide.querySelectorAll('a').forEach((a) => (a.tabIndex = i === index ? 0 : -1)));
        dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
      };
      const stop = () => {
        clearInterval(timer);
        timer = null;
      };
      const start = () => {
        if (!seconds || reduced || window.Shopify?.designMode) return;
        stop();
        timer = setInterval(() => go(index + 1), seconds * 1000);
      };

      slider.querySelector('[data-yh-prev]')?.addEventListener('click', () => { go(index - 1); start(); });
      slider.querySelector('[data-yh-next]')?.addEventListener('click', () => { go(index + 1); start(); });
      dots.forEach((dot) => dot.addEventListener('click', () => { go(Number(dot.dataset.yhDot)); start(); }));
      slider.addEventListener('mouseenter', stop);
      slider.addEventListener('mouseleave', start);
      slider.addEventListener('focusin', stop);
      slider.addEventListener('focusout', start);

      // Swipe on touch screens.
      let startX = null;
      let startY = null;
      track.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return;
        startX = event.clientX;
        startY = event.clientY;
      });
      track.addEventListener('pointerup', (event) => {
        if (startX === null) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        startX = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          go(dx < 0 ? index + 1 : index - 1);
          start();
        }
      });
      track.addEventListener('pointercancel', () => (startX = null));

      // Theme editor: show the slide being edited.
      document.addEventListener('shopify:block:select', (event) => {
        const i = slides.findIndex((slide) => slide.contains(event.target) || slide === event.target);
        if (i >= 0 && slider.contains(event.target)) {
          stop();
          go(i);
        }
      });

      go(0);
      start();
    });
  }

  function init(root = document) {
    initMenu(root);
    initCats(root);
    initDelivery(root);
    initSlider(root);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();
  document.addEventListener('shopify:section:load', (event) => init(event.target));
})();
