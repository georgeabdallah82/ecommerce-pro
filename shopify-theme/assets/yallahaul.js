/* Yalla Haul theme behaviour: deals countdown and the optional phone bottom bar (its cart
   button opens the cart drawer and shows the same count as the header). Works again after
   the theme editor re-renders a section (shopify:section:load). */
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
    initTabbar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();
  document.addEventListener('shopify:section:load', (event) => init(event.target));
})();
