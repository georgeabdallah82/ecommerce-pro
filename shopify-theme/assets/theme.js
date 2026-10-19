(() => {
  const one = (root, selector) => root.querySelector(selector);
  const all = (root, selector) => [...root.querySelectorAll(selector)];
  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-menu-toggle]');
    if (toggle) { const menu = one(document, '[data-mobile-menu]'); if (!menu) return; menu.hidden = !menu.hidden; toggle.setAttribute('aria-expanded', String(!menu.hidden)); }
    const link = event.target.closest('.mobile-nav a');
    if (link) { const menu = one(document, '[data-mobile-menu]'); if (menu) menu.hidden = true; }
  });
  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('.quick-add-form'); if (!form) return;
    event.preventDefault(); const button = one(form, 'button'); if (button) button.disabled = true;
    try {
      const root = window.Shopify?.routes?.root || '/';
      const response = await fetch(root + 'cart/add.js', {method:'POST',headers:{Accept:'application/json'},body:new FormData(form)});
      if (!response.ok) throw new Error('Cart add failed');
      const cartResponse = await fetch(root + 'cart.js',{headers:{Accept:'application/json'}});
      if (cartResponse.ok) { const cart = await cartResponse.json(); all(document,'[data-cart-count]').forEach(node => node.textContent = cart.item_count); }
    } catch { form.submit(); } finally { if (button) button.disabled = false; }
  });
  all(document,'[data-hero-slider]').forEach((slider) => {
    const slides = all(slider,'[data-hero-slide]'), dots = all(slider,'[data-hero-dot]'); if (slides.length < 2) return;
    let index = 0, timer;
    const show = n => { index=(n+slides.length)%slides.length; slides.forEach((node,i)=>node.classList.toggle('is-active',i===index)); dots.forEach((node,i)=>node.classList.toggle('is-active',i===index)); };
    const reset = () => { clearInterval(timer); if (slider.dataset.autoplay==='true') timer=setInterval(()=>show(index+1),Math.max(3,Number(slider.dataset.speed||5))*1000); };
    one(slider,'[data-hero-prev]')?.addEventListener('click',()=>{show(index-1);reset();});
    one(slider,'[data-hero-next]')?.addEventListener('click',()=>{show(index+1);reset();});
    dots.forEach((node,i)=>node.addEventListener('click',()=>{show(i);reset();})); reset();
  });
})();