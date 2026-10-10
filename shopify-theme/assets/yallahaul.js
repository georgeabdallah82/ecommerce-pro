/* Yalla Haul theme behaviour: deals countdown, the phone menu panel, the nav bar dropdowns, and
   the phone bottom bar (its cart button opens the cart drawer and shows the same count as the
   header). Works again after the theme editor re-renders a section (shopify:section:load). */
(() => {
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

  // Phone menu panel (header section). Opened by the header's menu button and the bottom bar's
  // "Menu" tab; closed by the X, the shade, Escape, or following a link.
  function initMenu(root) {
    root.querySelectorAll('[data-yh-menu]').forEach((menu) => {
      if (menu.dataset.yhReady) return;
      menu.dataset.yhReady = '1';
      const panel = menu.querySelector('.yh-drawer__panel');
      let opener = null;
      const setExpanded = (value) =>
        document.querySelectorAll(`[aria-controls="${menu.id}"]`).forEach((b) => b.setAttribute('aria-expanded', String(value)));
      const open = (button) => {
        opener = button || null;
        menu.hidden = false;
        document.documentElement.classList.add('yh-menu-open');
        requestAnimationFrame(() => menu.classList.add('is-open'));
        setExpanded(true);
        panel.focus();
      };
      const close = () => {
        if (menu.hidden) return;
        menu.classList.remove('is-open');
        document.documentElement.classList.remove('yh-menu-open');
        setExpanded(false);
        setTimeout(() => {
          if (!menu.classList.contains('is-open')) menu.hidden = true;
        }, 260);
        if (opener) opener.focus();
      };
      menu.yhOpen = open;
      menu.yhClose = close;
      menu.querySelectorAll('[data-yh-menu-close]').forEach((el) => el.addEventListener('click', close));
      menu.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') close();
      });
      menu.addEventListener('click', (event) => {
        if (event.target.closest('a[href]')) close();
      });
    });
    root.querySelectorAll('[data-yh-menu-open]').forEach((button) => {
      if (button.dataset.yhMenuReady) return;
      button.dataset.yhMenuReady = '1';
      button.addEventListener('click', (event) => {
        const menu = document.querySelector('[data-yh-menu]');
        if (!menu || typeof menu.yhOpen !== 'function') return;
        event.preventDefault();
        menu.yhOpen(button);
      });
    });
  }

  // Nav bar dropdowns (<details>): one open at a time, closed by a click outside or Escape.
  function initDropdowns(root) {
    root.querySelectorAll('[data-yh-dropdown]').forEach((dropdown) => {
      if (dropdown.dataset.yhReady) return;
      dropdown.dataset.yhReady = '1';
      dropdown.addEventListener('toggle', () => {
        if (!dropdown.open) return;
        document.querySelectorAll('[data-yh-dropdown][open]').forEach((other) => {
          if (other !== dropdown) other.open = false;
        });
      });
    });
    if (document.documentElement.dataset.yhDropdowns) return;
    document.documentElement.dataset.yhDropdowns = '1';
    document.addEventListener('click', (event) => {
      document.querySelectorAll('[data-yh-dropdown][open]').forEach((dropdown) => {
        if (!dropdown.contains(event.target)) dropdown.open = false;
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      document.querySelectorAll('[data-yh-dropdown][open]').forEach((dropdown) => {
        dropdown.open = false;
        dropdown.querySelector('summary')?.focus();
      });
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
    initTimers(root);
    initMenu(document);
    initDropdowns(root);
    initTabbar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();
  document.addEventListener('shopify:section:load', (event) => init(event.target));
})();
