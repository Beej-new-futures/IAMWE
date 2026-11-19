/* ─── IAMWE / Tickets — event page ─────────────────────────────────────
   1. Scroll scrubs the film (or pushes into the still).
   2. Chapters fade in and out at their data-from / data-to.
   3. The buy card rises in at the end; PayPal buttons take payment;
      the server issues the tickets and we go to the ticket page. */
(function () {
  'use strict';

  var slug = document.body.dataset.event;
  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── Film ─────────────────────────────────────────────────────────────
  var film = $('film'), stage = $('stage'), video = $('video'), still = $('still');
  var progressBar = $('film-progress'), cue = $('scroll-cue');
  var chapters = Array.prototype.slice.call(document.querySelectorAll('.chapter'));
  var hasVideo = false, target = 0, current = 0, lastSet = -1;

  still.addEventListener('error', function () { still.remove(); still = null; });

  // Pull the whole film into memory first. Seeking a streamed file means
  // a network round trip per frame; seeking a blob is instant — this is
  // what makes it feel like the Lottie version.
  var src = video.dataset.src;
  if (src) {
    var loading = $('loading-film');
    var showLoading = setTimeout(function () { loading.hidden = false; }, 1200);
    fetch(src).then(function (r) {
      if (!r.ok) throw new Error('no film');
      return r.blob();
    }).then(function (blob) {
      video.src = URL.createObjectURL(blob);
      video.addEventListener('loadedmetadata', function () {
        hasVideo = true;
        video.classList.add('ready');
        onScroll();
      }, { once: true });
    }).catch(function () {
      video.remove();
    }).finally(function () {
      clearTimeout(showLoading);
      loading.hidden = true;
    });

    // iOS won't paint a frame for a video that has never played. A
    // silent play/pause on first touch unlocks seeking.
    var unlock = function () {
      var p = video.play();
      if (p && p.then) p.then(function () { video.pause(); }).catch(function () {});
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  function filmProgress() {
    var rect = film.getBoundingClientRect();
    var span = film.offsetHeight - window.innerHeight;
    return span > 0 ? clamp(-rect.top / span, 0, 1) : 1;
  }

  function onScroll() {
    var p = filmProgress();
    stage.style.setProperty('--p', p.toFixed(4));
    progressBar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    if (cue) cue.style.visibility = p > 0.02 ? 'hidden' : '';
    if (still && !hasVideo && !reduced) {
      still.style.transform = 'scale(' + (1.18 - p * 0.18).toFixed(4) + ') translateY(' + (p * -3).toFixed(2) + '%)';
    }
    chapters.forEach(function (c) {
      var from = parseFloat(c.dataset.from), to = parseFloat(c.dataset.to);
      var fade = Math.min(0.05, (to - from) / 3);
      var o;
      if (p < from || p > to) o = 0;
      else if (p < from + fade) o = (p - from) / fade;
      else if (p > to - fade) o = (to - p) / fade;
      else o = 1;
      // The first chapter is already up when the page opens.
      if (from === 0 && p < fade) o = 1;
      c.style.opacity = o.toFixed(3);
      c.style.transform = reduced ? 'none' : 'translateY(' + ((1 - o) * 18).toFixed(1) + 'px)';
    });
    if (hasVideo) target = p * (video.duration - 0.05);
  }

  // Ease the playhead towards where the scroll says it should be, so a
  // flick of the wheel glides rather than jumps.
  function tick() {
    if (hasVideo) {
      current += (target - current) * (reduced ? 1 : 0.14);
      if (Math.abs(current - lastSet) > 0.008 && !video.seeking) {
        video.currentTime = current;
        lastSet = current;
      }
    }
    requestAnimationFrame(tick);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
  requestAnimationFrame(tick);

  // ─── Buy card reveal + jump pill ──────────────────────────────────────
  var buy = $('buy'), jump = $('jump');
  new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) buy.classList.add('in');
      if (jump) jump.parentNode.classList.toggle('hidden', e.isIntersecting);
    });
  }, { threshold: 0.18 }).observe(buy);

  if (jump) jump.addEventListener('click', function (e) {
    e.preventDefault();
    buy.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  });

  // ─── Event data from the server (price, tickets left) ─────────────────
  var ev = null, qty = 1;
  var errorEl = $('form-error');
  var showError = function (msg) { errorEl.textContent = msg || ''; };

  function money(pence) {
    var s = (pence / 100).toFixed(2);
    return '£' + (s.slice(-3) === '.00' ? s.slice(0, -3) : s);
  }
  function renderQty() {
    $('qty').textContent = qty;
    $('minus').disabled = qty <= 1;
    $('plus').disabled = !ev || qty >= ev.maxPerOrder;
    if (ev) $('total').textContent = '£' + (ev.pricePence * qty / 100).toFixed(2);
  }
  $('minus').addEventListener('click', function () { qty = Math.max(1, qty - 1); renderQty(); });
  $('plus').addEventListener('click', function () { if (ev) qty = Math.min(ev.maxPerOrder, qty + 1); renderQty(); });

  function applyEvent(data) {
    ev = data;
    $('ev-name').textContent = data.name;
    var meta = [data.dateLabel, data.timeLabel, data.venue].filter(Boolean);
    $('ev-meta').innerHTML = meta.map(function (m) { return m.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }).join('<br>');
    $('tier-label').textContent = data.tier;
    $('price').textContent = money(data.pricePence);
    var label = jump && jump.querySelector('.buy-pill-label');
    if (label && !data.onSale) label.textContent = data.soldOut ? 'Sold out' : 'Tickets';

    var note = $('left-note');
    if (data.onSale && data.left <= 20) { note.hidden = false; note.textContent = 'Only ' + data.left + ' left'; }
    else if (data.onSale && data.nextTier) { note.hidden = false; note.textContent = data.tier + ' — then ' + money(Math.round(parseFloat(data.nextTier.price) * 100)); }
    else note.hidden = true;

    if (!data.onSale) {
      $('sale-open').hidden = true;
      $('sale-closed').hidden = false;
      $('closed-msg').textContent = data.soldOut ? 'Sold out' : 'Sales have closed';
    }
    qty = clamp(qty, 1, Math.max(1, data.maxPerOrder));
    renderQty();
  }

  function loadEvent() {
    return fetch('/api/tickets/event/' + encodeURIComponent(slug))
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d.ok) applyEvent(d); else throw new Error(d.error); });
  }

  // ─── Form ─────────────────────────────────────────────────────────────
  function readForm() {
    var name = $('name').value.trim();
    var email = $('email').value.trim();
    if (!name) { $('name').focus(); return { error: 'Please add your name' }; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('email').focus(); return { error: 'Please check your email — that’s where your tickets go' }; }
    return { slug: slug, name: name, email: email, qty: qty, optIn: $('optin').checked, expectPence: ev ? ev.pricePence : null };
  }

  function post(path, body) {
    return fetch('/api/tickets/' + path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }

  function createOrder() {
    var f = readForm();
    if (f.error) { showError(f.error); return Promise.reject(new Error(f.error)); }
    showError('');
    return post('create-order', f).then(function (d) {
      if (!d.ok) {
        if (d.priceChanged) loadEvent();
        showError(d.error);
        throw new Error(d.error);
      }
      return d.paypalOrderId;
    });
  }

  function finish(paypalOrderId) {
    $('busy').classList.add('on');
    return post('capture', { paypalOrderId: paypalOrderId }).then(function (d) {
      if (!d.ok) { $('busy').classList.remove('on'); showError(d.error); loadEvent(); return; }
      window.location.href = '/tickets/view/?o=' + encodeURIComponent(d.token) + '&new=1';
    }).catch(function () {
      $('busy').classList.remove('on');
      showError('We couldn’t confirm that just now. If you were charged, your tickets will still arrive by email — or get in touch.');
    });
  }

  // ─── Payment buttons ──────────────────────────────────────────────────
  function mountMock() {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn mono';
    b.textContent = 'Pay (test mode — no money taken)';
    b.addEventListener('click', function () { createOrder().then(finish).catch(function () {}); });
    $('paypal-buttons').appendChild(b);
  }

  function mountPaypal(clientId) {
    var s = document.createElement('script');
    s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(clientId) +
      '&currency=GBP&intent=capture&components=buttons&disable-funding=paylater,credit';
    s.onload = function () {
      window.paypal.Buttons({
        style: { layout: 'vertical', color: 'white', shape: 'rect', label: 'pay', height: 48 },
        // Check the form before PayPal opens, so nobody pays and then
        // finds out we needed their email.
        onClick: function (data, actions) {
          var f = readForm();
          if (f.error) { showError(f.error); return actions.reject(); }
          showError('');
          return actions.resolve();
        },
        createOrder: function () { return createOrder(); },
        onApprove: function (data) { return finish(data.orderID); },
        onCancel: function () { showError(''); },
        onError: function () { if (!errorEl.textContent) showError('Payment didn’t go through — nothing was taken. Please try again.'); },
      }).render('#paypal-buttons');
    };
    s.onerror = function () { showError('Couldn’t load PayPal — check your connection and refresh.'); };
    document.head.appendChild(s);
  }

  loadEvent().then(function () {
    if (!ev.onSale) return;
    return fetch('/api/tickets/config').then(function (r) { return r.json(); }).then(function (c) {
      if (c.mode === 'mock') mountMock();
      else if (c.paypalClientId) mountPaypal(c.paypalClientId);
      else showError('Payments aren’t switched on yet.');
    });
  }).catch(function () {
    showError('Tickets aren’t available right now — please try again shortly.');
  });
  renderQty();
})();
