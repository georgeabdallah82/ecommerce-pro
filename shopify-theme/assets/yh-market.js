(() => {
  const initSlider = (root) => {
    root.querySelectorAll('[data-yhm-slider]').forEach((slider) => {
      if (slider.dataset.yhmReady) return;
      slider.dataset.yhmReady = '1';
      const slides = [...slider.querySelectorAll('[data-yhm-slide]')];
      const track = slider.querySelector('[data-yhm-track]');
      const dots = [...slider.querySelectorAll('[data-yhm-dot]')];
      if (slides.length < 2 || !track) return;
      let index = 0;
      let timer = null;
      const show = (next) => {
        index = (next + slides.length) % slides.length;
        track.style.transform = `translateX(-${index * 100}%)`;
        slides.forEach((slide, i) => { slide.classList.toggle('is-active', i === index); slide.setAttribute('aria-hidden', String(i !== index)); });
        dots.forEach((dot, i) => { if (i === index) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current'); });
      };
      const stop = () => { if (timer) window.clearInterval(timer); timer = null; };
      const start = () => {
        stop();
        if (slider.dataset.autoplay !== 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        timer = window.setInterval(() => show(index + 1), Math.max(3, Number(slider.dataset.speed || 5)) * 1000);
      };
      slider.querySelector('[data-yhm-prev]')?.addEventListener('click', () => { show(index - 1); start(); });
      slider.querySelector('[data-yhm-next]')?.addEventListener('click', () => { show(index + 1); start(); });
      dots.forEach((dot) => dot.addEventListener('click', () => { show(Number(dot.dataset.yhmDot || 0)); start(); }));
      slider.addEventListener('mouseenter', stop);
      slider.addEventListener('mouseleave', start);
      show(0); start();
    });
  };
  const initTabs = (root) => {
    root.querySelectorAll('[data-yhm-tabs]').forEach((section) => {
      if (section.dataset.yhmReady) return;
      section.dataset.yhmReady = '1';
      const buttons = [...section.querySelectorAll('[data-yhm-tab]')];
      const panels = [...section.querySelectorAll('[data-yhm-panel]')];
      buttons.forEach((button) => button.addEventListener('click', () => {
        const index = button.dataset.yhmTab;
        buttons.forEach((b) => { const active = b.dataset.yhmTab === index; b.classList.toggle('is-active', active); b.setAttribute('aria-selected', String(active)); });
        panels.forEach((panel) => { const active = panel.dataset.yhmPanel === index; panel.classList.toggle('is-active', active); panel.hidden = !active; });
      }));
    });
  };
  const initHeader = (root) => {
    root.querySelectorAll('[data-yhm-header]').forEach((header) => {
      if (header.dataset.yhmReady) return;
      header.dataset.yhmReady = '1';
      const drawer = header.querySelector('[data-yhm-menu]');
      const opener = header.querySelector('[data-yhm-menu-open]');
      const close = () => {
        if (!drawer) return;
        drawer.classList.remove('is-open');
        document.documentElement.classList.remove('yhm-menu-open');
        opener?.setAttribute('aria-expanded', 'false');
        window.setTimeout(() => { drawer.hidden = true; }, 230);
      };
      const open = () => {
        if (!drawer) return;
        drawer.hidden = false;
        requestAnimationFrame(() => drawer.classList.add('is-open'));
        document.documentElement.classList.add('yhm-menu-open');
        opener?.setAttribute('aria-expanded', 'true');
        drawer.querySelector('.yhm-drawer-panel')?.focus();
      };
      opener?.addEventListener('click', open);
      drawer?.querySelectorAll('[data-yhm-menu-close]').forEach((button) => button.addEventListener('click', close));
      drawer?.addEventListener('click', (event) => { if (event.target.closest('a[href]')) close(); });
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
      const area = header.querySelector('[data-yhm-area]');
      if (area) {
        try { const saved = localStorage.getItem('yhm-delivery-area'); if (saved && [...area.options].some(o => o.value === saved)) area.value = saved; } catch (_) {}
        area.addEventListener('change', () => { try { localStorage.setItem('yhm-delivery-area', area.value); } catch (_) {} });
      }
    });
  };
  const init = (root = document) => { initSlider(root); initTabs(root); initHeader(root); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();
  document.addEventListener('shopify:section:load', (event) => init(event.target));
})();