/* Yalla Haul Market theme script. Plain JavaScript, no build step. Every feature degrades to the
   plain HTML: forms still post to /cart/add, filters are links and forms, FAQs are <details>. */
(function () {
  'use strict'

  var strings = window.mkStrings || {}
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function $(selector, scope) { return (scope || document).querySelector(selector) }
  function $$(selector, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(selector)) }
  function safeGet(key) { try { return window.localStorage.getItem(key) } catch (e) { return null } }
  function safeSet(key, value) { try { window.localStorage.setItem(key, value) } catch (e) { /* private mode */ } }
  function fill(template, values) {
    return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, function (_, name) { return values[name] != null ? values[name] : '' })
  }

  /* ---------- Toast ---------- */
  var toastTimer
  function toast(message) {
    var el = $('[data-toast]')
    if (!el) return
    el.textContent = message
    el.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { el.hidden = true }, 2600)
  }

  /* ---------- Announcement bar ---------- */
  function initAnnouncement() {
    var bar = $('[data-announcement]')
    if (!bar) return
    var messages = $$('[data-announce-msg]', bar)
    var index = 0
    var speed = (parseInt(bar.getAttribute('data-speed'), 10) || 6) * 1000
    if (messages.length > 1 && !reduceMotion) {
      setInterval(function () {
        messages[index].classList.remove('is-active')
        index = (index + 1) % messages.length
        messages[index].classList.add('is-active')
      }, speed)
    }
    var close = $('[data-announce-close]', bar)
    if (close) {
      if (safeGet('mk-announce-closed') === '1') bar.hidden = true
      close.addEventListener('click', function () {
        bar.hidden = true
        safeSet('mk-announce-closed', '1')
      })
    }
  }

  /* ---------- Hero slider ---------- */
  function initSliders() {
    $$('[data-slider]').forEach(function (slider) {
      var slides = $$('[data-slide]', slider)
      if (slides.length < 2) return
      var dotsWrap = $('[data-slider-dots]', slider)
      var current = 0
      var timer = null
      var autoplay = slider.getAttribute('data-autoplay') === 'true' && !reduceMotion
      var delay = (parseInt(slider.getAttribute('data-speed'), 10) || 5) * 1000

      slides.forEach(function (_, i) {
        if (!dotsWrap) return
        var dot = document.createElement('button')
        dot.type = 'button'
        dot.setAttribute('aria-label', (i + 1) + ' / ' + slides.length)
        dot.addEventListener('click', function () { show(i); restart() })
        dotsWrap.appendChild(dot)
      })

      function show(n) {
        current = (n + slides.length) % slides.length
        slides.forEach(function (slide, i) {
          slide.classList.toggle('is-active', i === current)
          slide.setAttribute('aria-hidden', i === current ? 'false' : 'true')
        })
        if (dotsWrap) $$('button', dotsWrap).forEach(function (dot, i) {
          dot.setAttribute('aria-current', i === current ? 'true' : 'false')
        })
      }
      function restart() {
        if (!autoplay) return
        clearInterval(timer)
        timer = setInterval(function () { show(current + 1) }, delay)
      }

      var prev = $('[data-slider-prev]', slider)
      var next = $('[data-slider-next]', slider)
      if (prev) prev.addEventListener('click', function () { show(current - 1); restart() })
      if (next) next.addEventListener('click', function () { show(current + 1); restart() })
      slider.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowLeft') { show(current - 1); restart() }
        if (event.key === 'ArrowRight') { show(current + 1); restart() }
      })
      var startX = null
      slider.addEventListener('touchstart', function (event) { startX = event.changedTouches[0].clientX }, { passive: true })
      slider.addEventListener('touchend', function (event) {
        if (startX === null) return
        var dx = event.changedTouches[0].clientX - startX
        startX = null
        if (Math.abs(dx) > 40) { show(dx < 0 ? current + 1 : current - 1); restart() }
      })
      slider.addEventListener('mouseenter', function () { clearInterval(timer) })
      slider.addEventListener('mouseleave', restart)

      show(0)
      restart()
    })
  }

  /* ---------- Product tabs ---------- */
  function initTabs() {
    $$('[data-tabs]').forEach(function (wrap) {
      var tabs = $$('[role="tab"]', wrap)
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          tabs.forEach(function (other) {
            var active = other === tab
            other.classList.toggle('is-active', active)
            other.setAttribute('aria-selected', active ? 'true' : 'false')
            var panel = document.getElementById(other.getAttribute('aria-controls'))
            if (panel) panel.hidden = !active
          })
        })
      })
    })
  }

  /* ---------- Delivery bar ---------- */
  function initDelivery() {
    var bar = $('[data-delivery]')
    if (!bar) return
    var select = $('[data-delivery-select]', bar)
    var time = $('[data-delivery-time]', bar)
    if (!select) return
    var saved = safeGet('mk-delivery-area')
    if (saved) {
      $$('option', select).forEach(function (option) { if (option.value === saved) option.selected = true })
    }
    function update() {
      var option = select.options[select.selectedIndex]
      if (time && option) time.textContent = option.getAttribute('data-time') || ''
      if (option) safeSet('mk-delivery-area', option.value)
    }
    select.addEventListener('change', update)
    update()
  }

  /* ---------- Mobile menu ---------- */
  function initMenu() {
    var toggle = $('[data-menu-toggle]')
    var menu = $('#mkMobileMenu')
    if (!toggle || !menu) return
    toggle.addEventListener('click', function () {
      var open = menu.hidden
      menu.hidden = !open
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    })
  }

  /* ---------- Predictive search ---------- */
  function initSearch() {
    var input = $('[data-search-input]')
    var box = $('[data-suggest]')
    if (!input || !box) return
    var timer
    var lastQuery = ''
    input.addEventListener('input', function () {
      clearTimeout(timer)
      var query = input.value.trim()
      if (query.length < 2) { box.hidden = true; box.innerHTML = ''; return }
      timer = setTimeout(function () {
        if (query === lastQuery) return
        lastQuery = query
        var url = '/search/suggest.json?q=' + encodeURIComponent(query) + '&resources[type]=product&resources[limit]=4&resources[options][unavailable_products]=show'
        fetch(url, { headers: { accept: 'application/json' } })
          .then(function (response) { return response.ok ? response.json() : null })
          .then(function (data) {
            var products = data && data.resources && data.resources.results && data.resources.results.products || []
            box.innerHTML = ''
            products.forEach(function (product) {
              var link = document.createElement('a')
              link.href = product.url
              if (product.image) {
                var img = document.createElement('img')
                img.src = product.image
                img.alt = ''
                img.loading = 'lazy'
                link.appendChild(img)
              }
              var span = document.createElement('span')
              span.textContent = product.title
              link.appendChild(span)
              box.appendChild(link)
            })
            box.hidden = products.length === 0
          })
          .catch(function () { box.hidden = true })
      }, 220)
    })
    input.addEventListener('keydown', function (event) { if (event.key === 'Escape') box.hidden = true })
    document.addEventListener('click', function (event) {
      if (!box.contains(event.target) && event.target !== input) box.hidden = true
    })
  }

  /* ---------- Cart ---------- */
  var cartDrawer = null
  var backdrop = null

  // strings.money_sample is the store's money format for 1.00 (for example "$1.00"); the amount
  // is swapped into it so cart totals match the rest of the store.
  function money(cents) {
    var sample = strings.money_sample || ''
    return sample ? sample.replace(/\d[\d.,]*/, (cents / 100).toFixed(2)) : (cents / 100).toFixed(2)
  }

  function renderCart(cart) {
    var count = $$('[data-cart-count]')
    count.forEach(function (el) { el.textContent = cart.item_count })
    var total = $('[data-cart-total]')
    if (total) total.textContent = money(cart.total_price)
    var note = $('[data-cart-note]')
    if (note && document.activeElement !== note) note.value = cart.note || ''

    var bar = $('[data-free-bar-text]')
    if (bar && cartDrawer && cartDrawer.getAttribute('data-free-bar') === 'true') {
      var threshold = (parseFloat(cartDrawer.getAttribute('data-free-threshold')) || 0) * 100
      var remaining = threshold - cart.total_price
      bar.textContent = remaining <= 0 ? (strings.free_unlocked || '') : fill(strings.free_remaining, { amount: money(remaining) })
    }

    var list = $('[data-cart-lines]')
    if (!list) return
    list.innerHTML = ''
    var empty = document.createElement('li')
    empty.className = 'mkDrawerEmpty'
    empty.textContent = strings.empty || ''
    if (cart.items.length === 0) { list.appendChild(empty); return }

    cart.items.forEach(function (item) {
      var li = document.createElement('li')
      li.className = 'mkDrawerLine'
      li.setAttribute('data-line-key', item.key)
      if (item.image) {
        var img = document.createElement('img')
        img.src = item.image.replace(/(\.[a-z]+)(\?|$)/i, '_240x$1$2')
        img.alt = ''
        li.appendChild(img)
      } else {
        li.appendChild(document.createElement('span'))
      }
      var body = document.createElement('div')
      var name = document.createElement('a')
      name.className = 'mkCartName'
      name.href = item.url
      name.textContent = item.product_title
      body.appendChild(name)
      var controls = document.createElement('div')
      controls.className = 'mkCartQty'
      var minus = qtyButton('−', item.key, item.quantity - 1, 'Decrease')
      var qty = document.createElement('span')
      qty.textContent = item.quantity
      var plus = qtyButton('+', item.key, item.quantity + 1, 'Increase')
      var remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'mkDrawerRemove'
      remove.textContent = strings.remove || 'Remove'
      remove.addEventListener('click', function () { changeLine(item.key, 0) })
      controls.appendChild(minus)
      controls.appendChild(qty)
      controls.appendChild(plus)
      controls.appendChild(remove)
      body.appendChild(controls)
      li.appendChild(body)
      var price = document.createElement('strong')
      price.textContent = money(item.final_line_price)
      li.appendChild(price)
      list.appendChild(li)
    })
  }

  function qtyButton(label, key, nextQuantity, aria) {
    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'mkQtyBtn'
    button.textContent = label
    button.setAttribute('aria-label', aria)
    button.addEventListener('click', function () { changeLine(key, Math.max(0, nextQuantity)) })
    return button
  }

  function fetchCart() {
    return fetch('/cart.js', { headers: { accept: 'application/json' } }).then(function (r) { return r.json() }).then(renderCart)
  }

  function changeLine(key, quantity) {
    return fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ id: key, quantity: quantity })
    }).then(function (r) { return r.json() }).then(renderCart)
  }

  function openCart() {
    if (!cartDrawer) return
    cartDrawer.hidden = false
    if (backdrop) backdrop.hidden = false
    var trigger = $('[data-cart-open]')
    if (trigger) trigger.setAttribute('aria-expanded', 'true')
    fetchCart()
    var close = $('.mkDrawerX', cartDrawer)
    if (close) close.focus()
  }

  function closeCart() {
    if (!cartDrawer) return
    cartDrawer.hidden = true
    if (backdrop) backdrop.hidden = true
    var trigger = $('[data-cart-open]')
    if (trigger) { trigger.setAttribute('aria-expanded', 'false'); trigger.focus() }
  }

  function addToCart(variantId, quantity, title) {
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ id: Number(variantId), quantity: quantity || 1 })
    }).then(function (response) {
      if (!response.ok) return response.json().then(function (data) { throw new Error(data.description || strings.error) })
      return response.json()
    }).then(function () {
      if (cartDrawer && cartDrawer.getAttribute('data-cart-drawer-enabled') === 'true') {
        return fetchCart().then(openCart)
      }
      toast(fill(strings.added, { title: title || '' }))
      return fetchCart()
    }).catch(function (error) {
      toast(error.message || strings.error)
    })
  }

  function initCart() {
    cartDrawer = $('[data-cart-drawer]')
    backdrop = $('.mkDrawerBackdrop')
    $$('[data-cart-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (cartDrawer && cartDrawer.getAttribute('data-cart-drawer-enabled') === 'true') openCart()
        else window.location.href = '/cart'
      })
    })
    $$('[data-drawer-close]').forEach(function (el) { el.addEventListener('click', closeCart) })
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && cartDrawer && !cartDrawer.hidden) closeCart()
    })
    var note = $('[data-cart-note]')
    if (note) note.addEventListener('change', function () {
      fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ note: note.value })
      })
    })
    $$('[data-add-to-cart]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true
        addToCart(btn.getAttribute('data-variant-id'), 1, btn.getAttribute('data-product-title')).then(function () { btn.disabled = false })
      })
    })
    if (cartDrawer) fetchCart()
  }

  /* ---------- Product page ---------- */
  function initProduct() {
    var form = $('#mkProductForm')
    var page = $('[data-product]')
    if (!form || !page) return
    var mapEl = $('[data-variant-map]')
    var variants = {}
    try { variants = JSON.parse(mapEl ? mapEl.textContent : '{}') } catch (e) { variants = {} }
    var idInput = form.querySelector('[name="id"]')
    var addButton = $('[data-add-button]', form)
    var price = $('[data-price]', page)
    var stock = $('[data-stock]', page)
    var stickyPrice = $('[data-sticky-price]')

    function selectedOptions() {
      return $$('[data-option]', form).map(function (group) {
        var checked = $('input[type="radio"]:checked', group)
        return checked ? checked.value : null
      })
    }

    function findVariant(options) {
      var found = null
      Object.keys(variants).some(function (id) {
        var v = variants[id]
        var match = options.every(function (value, i) { return v.options[i] === value })
        if (match) found = { id: id, data: v }
        return match
      })
      return found
    }

    function update() {
      var options = selectedOptions()
      $$('[data-option]', form).forEach(function (group, i) {
        var value = options[i]
        var label = $('[data-option-value]', group)
        if (label) label.textContent = value || ''
        $$('.mkOptionValue', group).forEach(function (chip) {
          var input = $('input', chip)
          chip.classList.toggle('is-selected', input && input.checked)
        })
      })
      var found = findVariant(options)
      if (!found) return
      if (idInput) idInput.value = found.id
      if (price) {
        var wrap = document.createElement('span')
        var now = document.createElement('span')
        now.className = 'mkPriceNow'
        now.textContent = found.data.price
        wrap.appendChild(now)
        var onSale = found.data.compare && found.data.compare !== found.data.price
        if (onSale) {
          var compare = document.createElement('s')
          compare.className = 'mkPriceCompare'
          compare.textContent = found.data.compare
          wrap.appendChild(compare)
        }
        wrap.className = 'mkPrice' + (onSale ? ' is-sale' : '')
        price.textContent = ''
        price.appendChild(wrap)
      }
      if (stickyPrice) stickyPrice.textContent = found.data.price
      if (addButton) {
        addButton.disabled = !found.data.available
        addButton.textContent = found.data.available ? (strings.add_to_cart || 'Add to cart') : (strings.sold_out || 'Sold out')
      }
      if (stock) {
        stock.textContent = found.data.stock || ''
        stock.hidden = !found.data.stock
      }
    }

    $$('[data-option] input[type="radio"]', form).forEach(function (radio) {
      radio.addEventListener('change', update)
    })

    var qty = $('[data-qty-input]', form)
    var minus = $('[data-qty-minus]', form)
    var plus = $('[data-qty-plus]', form)
    function setQty(n) { if (qty) qty.value = Math.min(99, Math.max(1, n)) }
    if (minus) minus.addEventListener('click', function () { setQty((parseInt(qty.value, 10) || 1) - 1) })
    if (plus) plus.addEventListener('click', function () { setQty((parseInt(qty.value, 10) || 1) + 1) })

    form.addEventListener('submit', function (event) {
      event.preventDefault()
      if (addButton) addButton.disabled = true
      var data = new FormData(form)
      fetch('/cart/add.js', { method: 'POST', headers: { accept: 'application/json' }, body: data })
        .then(function (response) {
          if (!response.ok) return response.json().then(function (body) { throw new Error(body.description || strings.error) })
          return response.json()
        })
        .then(function () {
          var title = $('.mkBuyTitle', page)
          if (cartDrawer && cartDrawer.getAttribute('data-cart-drawer-enabled') === 'true') return fetchCart().then(openCart)
          toast(fill(strings.added, { title: title ? title.textContent : '' }))
          return fetchCart()
        })
        .catch(function (error) { toast(error.message || strings.error) })
        .then(function () { if (addButton) addButton.disabled = false; update() })
    })

    $$('[data-gallery-thumb]').forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        var main = $('.mkGalleryMain img')
        if (main) { main.src = thumb.getAttribute('data-src'); main.removeAttribute('srcset') }
        $$('[data-gallery-thumb]').forEach(function (other) { other.classList.toggle('is-active', other === thumb) })
      })
    })

    var sticky = $('[data-sticky-buy]')
    var stickyAdd = $('[data-sticky-add]')
    if (sticky && 'IntersectionObserver' in window && addButton) {
      var observer = new IntersectionObserver(function (entries) {
        sticky.hidden = entries[0].isIntersecting
      })
      observer.observe(addButton)
    }
    if (stickyAdd) stickyAdd.addEventListener('click', function () { if (addButton) addButton.click() })

    var recent = $('[data-recent-product]')
    if (recent) {
      try {
        var item = JSON.parse(recent.textContent)
        var list = JSON.parse(safeGet('mk-recent') || '[]').filter(function (p) { return p.url !== item.url })
        list.unshift(item)
        safeSet('mk-recent', JSON.stringify(list.slice(0, 12)))
      } catch (e) { /* ignore bad data */ }
    }
  }

  /* ---------- Recently viewed row (home and other pages) ---------- */
  function initRecent() {
    var section = $('[data-recent]')
    if (!section) return
    var list = $('[data-recent-list]', section)
    var limit = parseInt(list.getAttribute('data-limit'), 10) || 6
    var items = []
    try { items = JSON.parse(safeGet('mk-recent') || '[]') } catch (e) { items = [] }
    if (!items.length) return
    items.slice(0, limit).forEach(function (item) {
      var card = document.createElement('div')
      card.className = 'mkRailItem'
      var art = document.createElement('article')
      art.className = 'mkCard'
      var media = document.createElement('a')
      media.className = 'mkCardMedia mkCardMedia--square'
      media.href = item.url
      if (item.image) {
        var img = document.createElement('img')
        img.className = 'mkCardImg'
        img.src = item.image
        img.alt = ''
        img.loading = 'lazy'
        media.appendChild(img)
      }
      var body = document.createElement('div')
      body.className = 'mkCardBody'
      var title = document.createElement('h3')
      title.className = 'mkCardTitle'
      var link = document.createElement('a')
      link.href = item.url
      link.textContent = item.title
      title.appendChild(link)
      var price = document.createElement('span')
      price.className = 'mkPriceNow'
      price.textContent = item.price
      body.appendChild(title)
      body.appendChild(price)
      art.appendChild(media)
      art.appendChild(body)
      card.appendChild(art)
      list.appendChild(card)
    })
    section.hidden = false
  }

  document.addEventListener('DOMContentLoaded', function () {
    initAnnouncement()
    initSliders()
    initTabs()
    initDelivery()
    initMenu()
    initSearch()
    initCart()
    initProduct()
    initRecent()
  })
})()
