/* ============================================================
 * UNDANGAN PERNIKAHAN DIGITAL — script.js
 * Dipakai bersama oleh index.html (cover) & isi.html (isi undangan)
 *
 * Semua isi (nama, tanggal, lokasi, dst) diambil dari Google Sheet
 * lewat Google Apps Script — TIDAK ADA data contoh/dummy di sini.
 * Selama data belum termuat / field kosong di sheet, teks placeholder
 * bawaan di HTML (mis. "Memuat...") yang akan tampil.
 *
 * v2: nambahin sentuhan animasi kecil biar lebih hidup — countdown
 * "berdenyut" tiap detik, ikon musik ikut "berdenyut" pas lagu main,
 * dan kelopak bunga jatuh dengan gerakan goyang yang lebih natural.
 * ============================================================ */
(function () {
  "use strict";

  /* ---------------- KONFIGURASI — ISI BAGIAN INI ---------------- */
  // Tempel URL Web App Google Apps Script kamu di sini.
  var APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwVw_2KX-YbanXXnfkIIn0hsCvMVUxXZ2WtLYfH1v7nP2vHxwOQtR2Hr8Bo9IwUP2j/exec";


  // Nama parameter tamu di URL, contoh: index.html?to=A1
  var GUEST_PARAM = "to";
  var DEFAULT_GUEST_NAME = "Bapak/Ibu/Saudara/i";
  var DEFAULT_GUEST_QUOTA = 5;

  // Musik manual dari folder assets. Isi path filenya di sini kalau mau
  // pakai file lokal (nggak perlu isi kolom musik di Google Sheet lagi).
  // Kosongkan "" kalau mau tetap pakai musik dari Sheet.
  var LOCAL_MUSIC_URL = "assets/audio/Lagu.mp3";

  var CONFIG = {};
  var guestCode = "";
  var guestQuota = DEFAULT_GUEST_QUOTA;
  var allWishes = [];
  var wishesShown = 5;
  var revealObserver = null;

  /* ---------------- helpers ---------------- */
  function $(id) { return document.getElementById(id); }

  function setText(id, val) {
    var el = $(id);
    if (el && val !== undefined && val !== null && val !== "") {
      el.textContent = val;
    }
  }

  function setBG(id, url) {
    var el = $(id);
    if (el && url) {
      el.style.backgroundImage = "url('" + url + "')";
    }
  }

  function setBGClass(className, url) {
    if (!url) return;

    var els = document.querySelectorAll("." + className);

    els.forEach(function (el) {
      el.style.backgroundImage = "url('" + url + "')";
    });
  }
  function setHref(id, url) { var el = $(id); if (el && url) el.href = url; }
  function pad(n) { n = Math.max(0, Math.floor(n)); return n < 10 ? "0" + n : String(n); }
  function escapeHTML(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }
  function decodeGuestParam(v) {
    try { v = decodeURIComponent(String(v).replace(/\+/g, " ")); } catch (e) { }
    return v;
  }
  function getGuestCodeFromURL() {
    var params = new URLSearchParams(window.location.search);
    return params.get(GUEST_PARAM) || "";
  }
  function showToast(msg) {
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  /* ---------------- loading overlay ---------------- */
  var LOADING_MAX_WAIT = 8000; // detik pengaman, biar nggak nyangkut kalau koneksi lambat/gagal
  function hideLoadingOverlay() {
    var el = $("loadingOverlay");
    if (!el) return;
    el.classList.add("hide");
  }
  function setupLoadingOverlay() {
    var el = $("loadingOverlay");
    if (!el) return;
    setTimeout(hideLoadingOverlay, LOADING_MAX_WAIT);
  }

  /* ---------------- musik: coba autoplay, kalau diblokir browser,
     otomatis jalan begitu tamu sentuh/klik/keyboard pertama kali.
     Pakai touchend/click/keydown (bukan pointerdown) karena Safari
     & iOS cuma nganggep gesture yang "selesai" sebagai izin sah buat
     autoplay — pointerdown/touchstart doang belum cukup buat Safari. ---------------- */
  var MUSIC_GESTURE_EVENTS = ["touchend", "click", "keydown", "pointerup"];
  function tryAutoplayMusic(audio, onStateChange) {
    if (!audio) return;
    var play = function () {
      var p = audio.play();
      if (p && typeof p.then === "function") {
        p.then(function () { if (onStateChange) onStateChange(true); })
          .catch(function () {
            var resume = function () {
              audio.play().then(function () { if (onStateChange) onStateChange(true); }).catch(function () { });
              MUSIC_GESTURE_EVENTS.forEach(function (evt) {
                document.removeEventListener(evt, resume);
              });
            };
            MUSIC_GESTURE_EVENTS.forEach(function (evt) {
              document.addEventListener(evt, resume, { once: true });
            });
          });
      }
    };
    play();
  }

  // Pasang & putar musik. File lokal (LOCAL_MUSIC_URL) selalu menang
  // duluan; kalau dikosongkan, baru pakai musik dari Google Sheet.
  var musicStarted = false;
  function setupMusic(sheetMusicUrl, onStateChange) {
    var audio = $("bgMusic");
    if (!audio || musicStarted) return;
    var src = LOCAL_MUSIC_URL || sheetMusicUrl || "";
    if (!src) return;
    musicStarted = true;
    audio.src = src;
    var btnMusic = $("btnMusic");
    if (btnMusic) btnMusic.style.display = "flex";
    tryAutoplayMusic(audio, onStateChange);
  }

  /* ---------------- data fetch (Google Apps Script) ---------------- */
  function backendReady() {
    return APPS_SCRIPT_URL && APPS_SCRIPT_URL.indexOf("PASTE_") !== 0;
  }
  function fetchData(code) {
    var url = APPS_SCRIPT_URL + "?action=data&code=" + encodeURIComponent(code || "");
    return fetch(url).then(function (r) { return r.json(); });
  }
  function postRsvp(payload) {
    var body = new URLSearchParams(Object.assign({ action: "rsvp" }, payload));
    return fetch(APPS_SCRIPT_URL, { method: "POST", body: body }).then(function (r) { return r.json(); });
  }

  /* ============================================================
   * HALAMAN COVER (index.html)
   * ============================================================ */
  function initCoverPage() {
    guestCode = getGuestCodeFromURL();
    setupLoadingOverlay();

    // Sambungkan tombol "Buka Undangan" ke isi.html dengan kode tamu yang sama
    var btnOpen = $("btnOpenInvitation");
    if (btnOpen) {
      var target = "isi.html" + (guestCode ? ("?" + GUEST_PARAM + "=" + encodeURIComponent(guestCode)) : "");
      btnOpen.setAttribute("href", target);
      // tandai bahwa tamu memang lewat cover, dipakai isi.html buat cek
      btnOpen.addEventListener("click", function () {
        try { sessionStorage.setItem("undangan_from_cover", "1"); } catch (e) { }
        // klik tombol ini gesture paling sah buat Safari, jadi coba lagi di sini
        var audioEl = $("bgMusic");
        if (audioEl) { audioEl.play().catch(function () { }); }
      });
    }

    // musik lokal langsung dicoba diputar, nggak perlu nunggu Google Sheet
    setupMusic();

    if (!backendReady()) { hideLoadingOverlay(); return; }

    fetchData(guestCode).then(function (data) {
      if (!data || !data.ok) return;
      var c = data.config || {};
      setText("coverGroom", c.groom_nickname);
      setText("coverBride", c.bride_nickname);
      setText("coverDate", c.wedding_date_text);
      document.title = ((c.groom_nickname || "") + " & " + (c.bride_nickname || "")).trim() || document.title;

      var guestName = data.guest ? data.guest.name : (guestCode ? decodeGuestParam(guestCode) : "");
      setText("guestName", guestName || DEFAULT_GUEST_NAME);

      // kalau nggak ada musik lokal, baru pakai musik dari Sheet
      setupMusic(c.music_url);
    }).catch(function (err) {
      console.warn("Gagal memuat data dari Google Sheet.", err);
    }).finally(function () {
      hideLoadingOverlay();
    });
  }

  /* ============================================================
   * HALAMAN ISI (isi.html)
   * ============================================================ */
  function renderConfig(c) {
    setText("coverGroom", c.groom_nickname);
    setText("coverBride", c.bride_nickname);
    setText("heroGroom", c.groom_nickname);
    setText("heroBride", c.bride_nickname);
    setText("heroDate", c.wedding_date_text);
    setBGClass("couple-photo-img", c.cover_photo_url);
    setBG("bridePhoto", c.bride_photo_url);
    setText("brideName", c.bride_fullname);
    setText("brideParents", c.bride_parents);
    setBG("groomPhoto", c.groom_photo_url);
    setText("groomName", c.groom_fullname);
    setText("groomParents", c.groom_parents);
    setText("quoteText", c.quote_text);
    setText("quoteSource", c.quote_source);
    setText("openingText", c.opening_text);

    setText("event1Title", c.event1_title);
    setText("event1Date", c.event1_date);
    setText("event1Time", c.event1_time);
    setText("event1Place", c.event1_place);
    setText("event1Address", c.event1_address);
    setHref("event1Maps", c.event1_maps);
    setText("event2Title", c.event2_title);
    setText("event2Date", c.event2_date);
    setText("event2Time", c.event2_time);
    setText("event2Place", c.event2_place);
    setText("event2Address", c.event2_address);
    setHref("event2Maps", c.event2_maps);

    setText("bank1Name", c.bank1_name);
    setText("bank1Holder", c.bank1_holder);
    setText("bank1Number", c.bank1_number);
    setText("bank2Name", c.bank2_name);
    setText("bank2Holder", c.bank2_holder);
    setText("bank2Number", c.bank2_number);
    setText("giftAddress", c.gift_address);

    setBG("closingPhoto", c.closing_photo_url);
    var names = ((c.groom_nickname || "") + " & " + (c.bride_nickname || "")).trim();
    if (names !== "&") {
      setText("closingNames", names);
      setText("footerNames", names);
      document.title = names;
    }

    if (c.music_url || LOCAL_MUSIC_URL) {
      setupMusic(c.music_url, updateMusicIcon);
    }

    renderGallery(c.gallery || []);
    setupCountdown(c.countdown_target);
    CONFIG = c;
  }

  function renderGuestName(name, quota) {
    setText("guestName", name || DEFAULT_GUEST_NAME);
    guestQuota = quota || DEFAULT_GUEST_QUOTA;
    populateGuestsSelect(guestQuota);
  }

  function populateGuestsSelect(quota) {
    var max = Math.min(Math.max(parseInt(quota, 10) || 5, 1), 10);
    var sel = $("rsvpGuests");
    if (!sel) return;
    sel.innerHTML = '<option value="" disabled selected>Jumlah Tamu</option>';
    for (var i = 1; i <= max; i++) {
      var opt = document.createElement("option");
      opt.value = i;
      opt.textContent = i + " orang";
      sel.appendChild(opt);
    }
  }

  function renderGallery(urls) {
    var grid = $("galleryGrid");
    var section = $("gallerySection");
    if (!grid || !section) return;
    if (!urls || !urls.length) { section.style.display = "none"; return; }
    section.style.display = "";
    grid.innerHTML = "";
    urls.forEach(function (url, i) {
      var div = document.createElement("div");
      // Tambahkan 'is-visible' langsung agar tidak tersembunyi oleh animation reveal
      div.className = "gallery-item reveal is-visible";
      div.style.setProperty("--d", (i % 6 * 0.06) + "s");

      // Konversi otomatis link Google Drive view ke Direct Link (Bypass Link Drive)
      if (url.indexOf("drive.google.com") !== -1) {
        var idMatch = url.match(/\/d\/([^\/]+)/);
        if (idMatch && idMatch[1]) {
          url = "https://lh3.googleusercontent.com/d/" + idMatch[1];
        }
      }

      div.style.backgroundImage = "url('" + url + "')";
      div.addEventListener("click", function () { openLightbox(url); });
      grid.appendChild(div);
    });
  }

  function renderWishes(list) {
    allWishes = list || [];
    wishesShown = 5;
    drawWishes();
  }
  function drawWishes() {
    var wrap = $("wishesList");
    var moreBtn = $("btnMoreWishes");
    if (!wrap) return;
    wrap.innerHTML = "";
    if (!allWishes.length) {
      wrap.innerHTML = '<p class="wishes-empty">Jadilah yang pertama mengirim ucapan &amp; doa.</p>';
      if (moreBtn) moreBtn.style.display = "none";
      return;
    }
    var slice = allWishes.slice(0, wishesShown);
    slice.forEach(function (w, i) {
      var card = document.createElement("div");
      card.className = "wish-card reveal";
      card.setAttribute("data-dir", "up");
      card.style.setProperty("--d", Math.min(i, 6) * 0.05 + "s");
      var badgeClass = w.attendance === "Hadir" ? "badge-yes" : (w.attendance === "Tidak Hadir" ? "badge-no" : "badge-maybe");
      card.innerHTML =
        '<div class="wish-head">' +
        '<span class="wish-name">' + escapeHTML(w.name) + '</span>' +
        '<span class="wish-badge ' + badgeClass + '">' + escapeHTML(w.attendance || "") + '</span>' +
        '</div>' +
        '<p class="wish-msg">' + escapeHTML(w.message) + '</p>';
      wrap.appendChild(card);
      if (revealObserver) revealObserver.observe(card); else card.classList.add("is-visible");
    });
    if (moreBtn) moreBtn.style.display = allWishes.length > wishesShown ? "block" : "none";
  }

  /* ---------------- countdown ---------------- */
  var countdownTimer = null;
  var lastCountdownValues = { d: null, h: null, m: null, s: null };

  function tickBox(id, newVal, key) {
    setText(id, newVal);
    if (lastCountdownValues[key] !== null && lastCountdownValues[key] !== newVal) {
      var box = $(id) && $(id).closest(".cd-box");
      if (box) {
        box.classList.remove("tick");
        // reflow biar animasi bisa diulang tiap detik
        void box.offsetWidth;
        box.classList.add("tick");
      }
    }
    lastCountdownValues[key] = newVal;
  }

  function setupCountdown(targetISO) {
    if (countdownTimer) clearInterval(countdownTimer);
    if (!targetISO) return;
    var target = new Date(targetISO);
    if (isNaN(target.getTime())) return;
    function tick() {
      var diff = target.getTime() - Date.now();
      if (diff < 0) diff = 0;
      var days = Math.floor(diff / 86400000);
      var hours = Math.floor((diff % 86400000) / 3600000);
      var mins = Math.floor((diff % 3600000) / 60000);
      var secs = Math.floor((diff % 60000) / 1000);
      tickBox("cdDays", pad(days), "d");
      tickBox("cdHours", pad(hours), "h");
      tickBox("cdMinutes", pad(mins), "m");
      tickBox("cdSeconds", pad(secs), "s");
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  /* ---------------- calendar ---------------- */
  function setupCalendarButton() {
    var btn = $("btnCalendar");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var c = CONFIG;
      var start = new Date(c.countdown_target);
      if (isNaN(start.getTime())) { showToast("Tanggal acara belum diatur."); return; }
      var end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
      function fmt(d) { return d.toISOString().replace(/[-:]|\.\d{3}/g, ""); }
      var text = encodeURIComponent((c.groom_nickname || "") + " & " + (c.bride_nickname || ""));
      var details = encodeURIComponent((c.event1_title || "Acara Pernikahan") + " - " + (c.event1_place || ""));
      var loc = encodeURIComponent(c.event1_address || "");
      var url = "https://www.google.com/calendar/render?action=TEMPLATE&text=" + text +
        "&dates=" + fmt(start) + "/" + fmt(end) + "&details=" + details + "&location=" + loc;
      window.open(url, "_blank");
    });
  }

  /* ---------------- reveal on scroll ---------------- */
  function setupRevealObserver() {
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });

    var groups = {};
    document.querySelectorAll(".reveal").forEach(function (el) {
      var parent = el.closest(".section") || document.body;
      groups[parent] = groups[parent] || [];
      var idx = groups[parent].length;
      groups[parent].push(el);
      if (!el.style.getPropertyValue("--d")) {
        el.style.setProperty("--d", Math.min(idx, 5) * 0.1 + "s");
      }
      revealObserver.observe(el);
    });
  }

  /* ---------------- copy to clipboard ---------------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand("copy"); } catch (e) { }
    document.body.removeChild(ta);
    return Promise.resolve();
  }
  function setupCopyButtons() {
    document.querySelectorAll(".btn-copy").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var targetId = btn.getAttribute("data-copy-target");
        var el = $(targetId);
        if (!el) return;
        copyText(el.textContent.trim()).then(function () { showToast("Tersalin!"); });
      });
    });
  }

  /* ---------------- lightbox ---------------- */
  function openLightbox(url) {
    var img = $("lightboxImg");
    var box = $("lightbox");
    if (!img || !box) return;
    img.src = url;
    // trigger di frame berikutnya biar transisi scale/opacity kelihatan
    requestAnimationFrame(function () { box.classList.add("open"); });
  }
  function closeLightbox() {
    var img = $("lightboxImg");
    var box = $("lightbox");
    if (!img || !box) return;
    box.classList.remove("open");
    setTimeout(function () { img.src = ""; }, 350);
  }
  function setupLightbox() {
    var closeBtn = $("lightboxClose");
    var box = $("lightbox");
    if (!closeBtn || !box) return;
    closeBtn.addEventListener("click", closeLightbox);
    box.addEventListener("click", function (e) { if (e.target.id === "lightbox") closeLightbox(); });
  }

  /* ---------------- musik (autoplay, tombol cuma fallback manual) ---------------- */
  function updateMusicIcon(playing) {
    var btn = $("btnMusic");
    if (!btn) return;
    btn.innerHTML = playing ? "&#10074;&#10074;" : "&#9835;";
    btn.classList.toggle("playing", !!playing);
  }
  function setupControlBar() {
    var audio = $("bgMusic");
    var btnMusic = $("btnMusic");
    if (audio && btnMusic) {
      btnMusic.addEventListener("click", function () {
        if (audio.paused) { audio.play().catch(function () { }); updateMusicIcon(true); }
        else { audio.pause(); updateMusicIcon(false); }
      });
    }
  }

  /* ---------------- petals ---------------- */
  function initPetals() {
    var wrap = $("petals");
    if (!wrap) return;
    var count = window.innerWidth < 600 ? 10 : 16;
    for (var i = 0; i < count; i++) {
      var p = document.createElement("div");
      p.className = "petal";
      var size = 10 + Math.random() * 14;
      var fallDur = 12 + Math.random() * 10;
      var swayDur = 2.4 + Math.random() * 2.4;
      p.style.width = size + "px";
      p.style.height = (size * 1.3) + "px";
      p.style.left = (Math.random() * 100) + "vw";
      p.style.animationDuration = fallDur + "s, " + swayDur + "s";
      p.style.animationDelay = (Math.random() * -20) + "s, " + (Math.random() * -swayDur) + "s";
      p.style.opacity = 0.3 + Math.random() * 0.35;
      wrap.appendChild(p);
    }
  }

  /* ---------------- kupu-kupu terbang ---------------- */
  // Ganti path di sini kalau nama/lokasi filenya beda.
  var BUTTERFLY_IMAGES = ["assets/images/14.png", "assets/images/15.png"];

  function initButterflies() {
    var wrap = $("butterflies");
    if (!wrap) return;
    var count = window.innerWidth < 600 ? 5 : 8;
    for (var i = 0; i < count; i++) {
      var outer = document.createElement("div");
      outer.className = "butterfly-wrap " + (Math.random() < 0.5 ? "fly-left" : "fly-right");
      var dur = 14 + Math.random() * 10;      // makin besar = makin santai terbangnya
      var delay = Math.random() * -dur;       // biar mulainya nggak barengan semua
      outer.style.left = (2 + Math.random() * 90) + "vw";
      outer.style.animationDuration = dur + "s";
      outer.style.animationDelay = delay + "s";

      var inner = document.createElement("div");
      inner.className = "butterfly";
      var size = 22 + Math.random() * 18;
      inner.style.setProperty("--bfly-size", size + "px");
      inner.style.animationDelay = (Math.random() * -2) + "s";

      var flapDelay = (Math.random() * -0.4) + "s";

      var frameA = document.createElement("img");
      frameA.src = BUTTERFLY_IMAGES[0];
      frameA.className = "frame-a";
      frameA.alt = "";
      frameA.style.animationDelay = flapDelay;

      var frameB = document.createElement("img");
      frameB.src = BUTTERFLY_IMAGES[1];
      frameB.className = "frame-b";
      frameB.alt = "";
      frameB.style.animationDelay = flapDelay;

      inner.appendChild(frameA);
      inner.appendChild(frameB);
      outer.appendChild(inner);
      wrap.appendChild(outer);
    }
  }

  /* ---------------- quick nav bawah (scroll-spy) ---------------- */
  function setupQuickNav() {
    var nav = $("quicknav");
    if (!nav) return;
    var items = Array.prototype.slice.call(nav.querySelectorAll(".quicknav-item"));
    if (!items.length) return;

    var targets = items.map(function (item) {
      return document.getElementById(item.getAttribute("data-target"));
    }).filter(Boolean);
    if (!targets.length) return;

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.id;
          items.forEach(function (item) {
            item.classList.toggle("active", item.getAttribute("data-target") === id);
          });
        }
      });
    }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });

    targets.forEach(function (t) { spy.observe(t); });
  }

  /* ---------------- toggle info hadiah (klik buat tampil/sembunyi) ---------------- */
  function setupGiftToggle() {
    var btn = $("btnToggleGift");
    var content = $("giftContent");
    if (!btn || !content) return;
    btn.addEventListener("click", function () {
      var isShown = content.classList.toggle("show");
      btn.textContent = isShown ? "Sembunyikan Info Hadiah" : "Tampilkan Info Hadiah";
      if (isShown && revealObserver) {
        content.querySelectorAll(".reveal").forEach(function (el) { revealObserver.observe(el); });
      }
    });
  }

  /* ---------------- RSVP form ---------------- */
  function setupRsvpForm() {
    var form = $("rsvpForm");
    if (!form) return;
    var moreBtn = $("btnMoreWishes");
    if (moreBtn) moreBtn.addEventListener("click", function () { wishesShown += 5; drawWishes(); });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!backendReady()) {
        showToast("Google Sheet belum terhubung. Isi APPS_SCRIPT_URL dulu ya.");
        return;
      }
      var btn = $("rsvpSubmitBtn");
      btn.disabled = true;
      btn.textContent = "Mengirim...";
      var payload = {
        code: guestCode || "",
        name: $("rsvpName").value.trim(),
        attendance: $("rsvpAttendance").value,
        guests: $("rsvpGuests").value,
        message: $("rsvpMessage").value.trim()
      };
      postRsvp(payload).then(function (res) {
        if (res && res.ok) {
          showToast("Terima kasih! Ucapan kamu sudah terkirim.");
          form.reset();
          renderWishes(res.wishes || []);
        } else {
          showToast((res && res.error) || "Gagal mengirim, coba lagi.");
        }
      }).catch(function () {
        showToast("Gagal terhubung ke server. Cek URL Apps Script / koneksi internet.");
      }).finally(function () {
        btn.disabled = false;
        btn.textContent = "Kirim";
      });
    });
  }

  function initMainPage() {
    guestCode = getGuestCodeFromURL();

    // Kalau isi.html dibuka langsung (bukan lewat tombol "Buka Undangan"
    // di index.html), lempar balik ke index.html dulu.
    var cameFromCover = false;
    try { cameFromCover = sessionStorage.getItem("undangan_from_cover") === "1"; } catch (e) { }
    if (!cameFromCover) {
      var coverTarget = "index.html" + (guestCode ? ("?" + GUEST_PARAM + "=" + encodeURIComponent(guestCode)) : "");
      window.location.replace(coverTarget);
      return;
    }

    renderGuestName(guestCode ? decodeGuestParam(guestCode) : DEFAULT_GUEST_NAME, DEFAULT_GUEST_QUOTA);
    renderWishes([]);
    setupLoadingOverlay();
    setupMusic(null, updateMusicIcon);

    setupCalendarButton();
    setupRevealObserver();
    setupCopyButtons();
    setupGiftToggle();
    setupQuickNav();
    setupLightbox();
    setupControlBar();
    setupRsvpForm();
    initPetals();
    initButterflies();

    if (!backendReady()) {
      showToast("Google Sheet belum terhubung. Isi APPS_SCRIPT_URL di script.js.");
      hideLoadingOverlay();
      return;
    }

    fetchData(guestCode).then(function (data) {
      if (!data || !data.ok) return;
      renderConfig(data.config || {});
      if (data.guest) {
        renderGuestName(data.guest.name, data.guest.quota);
      } else if (guestCode) {
        renderGuestName(decodeGuestParam(guestCode), DEFAULT_GUEST_QUOTA);
      }
      renderWishes(data.wishes || []);
      // observer ulang untuk elemen yang baru dirender (galeri, ucapan)
      setupRevealObserver();
    }).catch(function (err) {
      console.warn("Gagal memuat data dari Google Sheet.", err);
      showToast("Gagal memuat data undangan. Coba muat ulang halaman.");
    }).finally(function () {
      hideLoadingOverlay();
    });
  }

  /* ---------------- init: deteksi halaman ---------------- */
  document.addEventListener("DOMContentLoaded", function () {
    if ($("cover") || $("btnOpenInvitation")) {
      initCoverPage();
      initButterflies();
    }
    if ($("mainContent")) {
      initMainPage();
    }
  });
})();