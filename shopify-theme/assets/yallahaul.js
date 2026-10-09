/* Yalla Haul theme behaviour: delivery area picker, banner slider, deals countdown, and the
   phone bottom bar (its cart button opens the cart drawer and shows the same count as the
   header). Works again after the theme editor re-renders a section (shopify:section:load). */
(() => {
  const AREA_KEY = 'yh-delivery-area';

  function initDelivery(root) {
    root.querySelectorAll('[data-yh-area]').forEach((select) => {
      if (select.dataset.yhReady) return;
      select.dataset.yhReady = '1';
      try {
        const saved = localStorage.getItem(AREA_KEY);
        if (saved && [...select.options].some((o) => o.value === saved)) select.value = saved;
      } catch (e) {}
      select.addEventListener('change', () => {
        try {
          localStorage.setItem(AREA_KEY, select.value);
        } catch (e) {}
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
        slides.forEach((slide, i) => {
          slide.setAttribute('aria-hidden', String(i !== index));
          slide.querySelectorAll('a').forEach((a) => (a.tabIndex = i === index ? 0 : -1));
        });
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

      dots.forEach((dot) => dot.addEventListener('click', () => { go(Number(dot.dataset.yhDot)); start(); }));
      slider.addEventListener('mouseenter', stop);
      slider.addEventListener('mouseleave', start);
      slider.addEventListener('focusin', stop);
      slider.addEventListener('focusout', start);

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

      document.addEventListener('shopify:block:select', (event) => {
        if (!slider.contains(event.target)) return;
        const i = slides.findIndex((slide) => slide === event.target || slide.contains(event.target));
        if (i >= 0) {
          stop();
          go(i);
        }
      });

      go(0);
      start();
    });
  }

  // Counts down to midnight (shopper's time): "today's deals".
  function initTimers(root) {
    root.querySelectorAll('[data-yh-timer]').forEach((el) => {
      if (el.dataset.yhReady) return;
      el.dataset.yhReady = '1';
      const pad = (n) => String(n).padStart(2, '0');
      const tick = () => {
        const now = new Date();
        const end = new Date(now);
        end.setHours(24, 0, 0, 0);
        const left = Math.max(0, Math.floor((end - now) / 1000));
        el.querySelector('[data-h]').textContent = pad(Math.floor(left / 3600));
        el.querySelector('[data-m]').textContent = pad(Math.floor((left % 3600) / 60));
        el.querySelector('[data-s]').textContent = pad(left % 60);
      };
      tick();
      setInterval(tick, 1000);
    });
  }

  function initTabbar() {
    const tabCart = document.querySelector('[data-yh-tab-cart]');
    if (!tabCart || tabCart.dataset.yhReady) return;
    tabCart.dataset.yhReady = '1';
    tabCart.addEventListener('click', (event) => {
      const drawer = document.querySelector('cart-drawer');
      if (!drawer || typeof drawer.open !== 'function') return;
      event.preventDefault();
      drawer.open(tabCart);
    });
    // Mirror the header's cart count, which Dawn re-renders after every cart change.
    const headerCart = document.getElementById('cart-icon-bubble');
    const tabCount = tabCart.querySelector('[data-yh-tab-count]');
    if (!headerCart || !tabCount) return;
    const sync = () => {
      const count = headerCart.querySelector('.yh-cart-count');
      if (!count) return;
      tabCount.textContent = count.textContent;
      tabCount.classList.toggle('is-empty', count.classList.contains('is-empty'));
    };
    new MutationObserver(sync).observe(headerCart, { childList: true, subtree: true, characterData: true });
  }

  function init(root = document) {
    initDelivery(root);
    initSlider(root);
    initTimers(root);
    initTabbar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();
  document.addEventListener('shopify:section:load', (event) => init(event.target));
})();
