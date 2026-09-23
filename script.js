/* ============================================================
 * UNDANGAN PERNIKAHAN DIGITAL — script.js
 * Dipakai bersama oleh index.html (cover) & isi.html (isi undangan)
 *
 * Semua isi (nama, tanggal, lokasi, dst) diambil dari Google Sheet
 * lewat Google Apps Script — TIDAK ADA data contoh/dummy di sini.
 * ============================================================ */
(function () {
  "use strict";

  /* ---------------- KONFIGURASI ---------------- */
  var APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwVw_2KX-YbanXXnfkIIn0hsCvMVUxXZ2WtLYfH1v7nP2vHxwOQtR2Hr8Bo9IwUP2j/exec";

  var GUEST_PARAM = "to";
  var DEFAULT_GUEST_NAME = "Bapak/Ibu/Saudara/i";
  var DEFAULT_GUEST_QUOTA = 5;

  var LOCAL_MUSIC_URL = "assets/audio/Lagu.mp3";

  var CONFIG = {};
  var guestCode = "";
  var guestQuota = DEFAULT_GUEST_QUOTA;
  var allWishes = [];
  var wishesShown = 5;
  var revealObserver = null;
  var galleryObserver = null;
  var countdownTimer = null;
  var lastCountdownValues = { d: null, h: null, m: null, s: null };
  var musicStarted = false;

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
    if (el && url) el.style.backgroundImage = "url('" + url + "')";
  }

  function setBGClass(className, url) {
    if (!url) return;
    document.querySelectorAll("." + className).forEach(function (el) {
      el.style.backgroundImage = "url('" + url + "')";
    });
  }

  function setHref(id, url) {
    var el = $(id);
    if (el && url) el.href = url;
  }

  function pad(n) {
    n = Math.max(0, Math.floor(n));
    return n < 10 ? "0" + n : String(n);
  }

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
  var LOADING_MAX_WAIT = 8000;
  function hideLoadingOverlay() {
    var el = $("loadingOverlay");
    if (el) el.classList.add("hide");
  }
  function setupLoadingOverlay() {
    if (!$("loadingOverlay")) return;
    setTimeout(hideLoadingOverlay, LOADING_MAX_WAIT);
  }

  /* ---------------- musik ---------------- */
  function tryAutoplayMusic(audio, onStateChange) {
    if (!audio) return;
    var play = function () {
      var p = audio.play();
      if (p && typeof p.then === "function") {
        p.then(function () { if (onStateChange) onStateChange(true); })
          .catch(function () {
            var resume = function () {
              audio.play()
                .then(function () { if (onStateChange) onStateChange(true); })
                .catch(function () { });
              document.removeEventListener("pointerdown", resume);
              document.removeEventListener("keydown", resume);
            };
            document.addEventListener("pointerdown", resume, { once: true });
            document.addEventListener("keydown", resume, { once: true });
          });
      }
    };
    play();
  }

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

  /* ---------------- data fetch ---------------- */
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

    var btnOpen = $("btnOpenInvitation");
    if (btnOpen) {
      var target = "isi.html" + (guestCode ? ("?" + GUEST_PARAM + "=" + encodeURIComponent(guestCode)) : "");
      btnOpen.setAttribute("href", target);
      btnOpen.addEventListener("click", function () {
        try { sessionStorage.setItem("undangan_from_cover", "1"); } catch (e) { }
      });
    }

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

  /* ============================================================
   * GALLERY — masonry + animasi muncul satu-satu
   * ============================================================ */
  var galleryImages = [];
  var lightboxIndex = 0;

  function renderGallery(urls) {
    var grid = $("galleryGrid");
    var section = $("gallerySection");
    if (!grid || !section) return;
    if (!urls || !urls.length) { section.style.display = "none"; return; }
    section.style.display = "";
    grid.innerHTML = "";

    galleryImages = urls.map(function (u) {
      if (u.indexOf("drive.google.com") !== -1) {
        var idMatch = u.match(/\/d\/([^\/]+)/);
        if (idMatch && idMatch[1]) {
          return "https://lh3.googleusercontent.com/d/" + idMatch[1];
        }
      }
      return u;
    });

    galleryImages.forEach(function (url, i) {
      var div = document.createElement("div");
      div.className = "gallery-item";

      div.style.setProperty("--d", (i * 0.12) + "s");
      div.style.backgroundImage = "url('" + url + "')";

      div.addEventListener("click", function () { openLightbox(i); });
      grid.appendChild(div);
    });

    observeGalleryItems();
  }

  /* Observer khusus gallery — animasi mulai pas section masuk viewport */
  function observeGalleryItems() {
    var items = document.querySelectorAll(".gallery-item");
    if (!items.length) return;

    if (!galleryObserver) {
      galleryObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            galleryObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: "0px 0px -8% 0px" });
    }

    items.forEach(function (item) {
      item.classList.remove("is-visible");
      galleryObserver.observe(item);
    });
  }

  /* ---------------- wishes ---------------- */
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
    if (moreBtn) moreBtn.style.display = "none";

    if (!allWishes.length) {
      wrap.innerHTML = '<p class="wishes-empty">Jadilah yang pertama mengirim ucapan &amp; doa.</p>';
      return;
    }

    // Tampilkan max 3 dulu
    var toShow = allWishes.slice(0, 3);

    toShow.forEach(function (w, i) {
      var card = document.createElement("div");
      card.className = "wish-card";
      card.style.setProperty("--d", Math.min(i, 8) * 0.08 + "s");
      var badgeClass = w.attendance === "Hadir" ? "badge-yes" : (w.attendance === "Tidak Hadir" ? "badge-no" : "badge-maybe");
      card.innerHTML =
        '<div class="wish-head">' +
        '<span class="wish-name">' + escapeHTML(w.name) + '</span>' +
        '<span class="wish-badge ' + badgeClass + '">' + escapeHTML(w.attendance || "") + '</span>' +
        '</div>' +
        '<p class="wish-msg">' + escapeHTML(w.message) + '</p>';
      wrap.appendChild(card);
    });

    // Tombol "Lihat ucapan lainnya" kalau ada lebih dari 3
    if (moreBtn && allWishes.length > 3) {
      moreBtn.style.display = "block";
      moreBtn.textContent = "Lihat " + (allWishes.length - 3) + " ucapan lainnya";
      moreBtn.onclick = function () {
        showAllWishes();
      };
    }
  }

  function showAllWishes() {
    var wrap = $("wishesList");
    var moreBtn = $("btnMoreWishes");
    if (!wrap) return;
    wrap.innerHTML = "";

    allWishes.forEach(function (w, i) {
      var card = document.createElement("div");
      card.className = "wish-card";
      card.style.setProperty("--d", Math.min(i, 8) * 0.05 + "s");
      var badgeClass = w.attendance === "Hadir" ? "badge-yes" : (w.attendance === "Tidak Hadir" ? "badge-no" : "badge-maybe");
      card.innerHTML =
        '<div class="wish-head">' +
        '<span class="wish-name">' + escapeHTML(w.name) + '</span>' +
        '<span class="wish-badge ' + badgeClass + '">' + escapeHTML(w.attendance || "") + '</span>' +
        '</div>' +
        '<p class="wish-msg">' + escapeHTML(w.message) + '</p>';
      wrap.appendChild(card);
    });

    if (moreBtn) moreBtn.style.display = "none";
  }

  /* ---------------- countdown ---------------- */
  function tickBox(id, newVal, key) {
    setText(id, newVal);
    if (lastCountdownValues[key] !== null && lastCountdownValues[key] !== newVal) {
      var el = $(id);
      var box = el && el.closest(".cd-box");
      if (box) {
        box.classList.remove("tick");
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

  /* ---------------- lightbox dengan navigasi ---------------- */
  function openLightbox(index) {
    var img = $("lightboxImg");
    var box = $("lightbox");
    if (!img || !box || !galleryImages.length) return;

    lightboxIndex = Math.max(0, Math.min(index, galleryImages.length - 1));
    img.src = galleryImages[lightboxIndex];

    var counter = $("lightboxCounter");
    if (counter) {
      counter.textContent = (lightboxIndex + 1) + " / " + galleryImages.length;
    }

    requestAnimationFrame(function () { box.classList.add("open"); });
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    var img = $("lightboxImg");
    var box = $("lightbox");
    if (!img || !box) return;
    box.classList.remove("open");
    document.body.style.overflow = "";
    setTimeout(function () { img.src = ""; }, 400);
  }

  function navigateLightbox(delta) {
    if (!galleryImages.length) return;
    lightboxIndex = (lightboxIndex + delta + galleryImages.length) % galleryImages.length;
    var img = $("lightboxImg");
    if (!img) return;

    img.style.opacity = "0";
    img.style.transform = "scale(.95)";
    setTimeout(function () {
      img.src = galleryImages[lightboxIndex];
      img.style.opacity = "1";
      img.style.transform = "scale(1)";
    }, 180);

    var counter = $("lightboxCounter");
    if (counter) {
      counter.textContent = (lightboxIndex + 1) + " / " + galleryImages.length;
    }
  }

  function setupLightbox() {
    var closeBtn = $("lightboxClose");
    var prevBtn = $("lightboxPrev");
    var nextBtn = $("lightboxNext");
    var box = $("lightbox");
    if (!closeBtn || !box) return;

    closeBtn.addEventListener("click", closeLightbox);
    if (prevBtn) prevBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      navigateLightbox(-1);
    });
    if (nextBtn) nextBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      navigateLightbox(1);
    });

    box.addEventListener("click", function (e) {
      if (e.target.id === "lightbox") closeLightbox();
    });

    document.addEventListener("keydown", function (e) {
      if (!box.classList.contains("open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") navigateLightbox(-1);
      if (e.key === "ArrowRight") navigateLightbox(1);
    });

    var touchStartX = 0;
    var touchEndX = 0;
    box.addEventListener("touchstart", function (e) {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    box.addEventListener("touchend", function (e) {
      touchEndX = e.changedTouches[0].screenX;
      var diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 50) {
        navigateLightbox(diff > 0 ? 1 : -1);
      }
    }, { passive: true });
  }

  /* ---------------- musik control ---------------- */
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
        if (audio.paused) {
          audio.play().catch(function () { });
          updateMusicIcon(true);
        } else {
          audio.pause();
          updateMusicIcon(false);
        }
      });
    }
  }

  /* ---------------- burung terbang ---------------- */
  var BIRD_IMAGES = [
    "assets/images/22.png",
    "assets/images/23.png",
    "assets/images/24.png"
  ];

  function initBirds() {
    var wrap = $("birds");
    if (!wrap) return;
    var count = window.innerWidth < 600 ? 4 : 6;
    for (var i = 0; i < count; i++) {
      var outer = document.createElement("div");
      outer.className = "bird-wrap " + (Math.random() < 0.5 ? "fly-left" : "fly-right");
      var dur = 16 + Math.random() * 10;
      var delay = Math.random() * -dur;
      outer.style.left = (2 + Math.random() * 90) + "vw";
      outer.style.animationDuration = dur + "s";
      outer.style.animationDelay = delay + "s";

      var inner = document.createElement("div");
      inner.className = "bird";
      var size = 30 + Math.random() * 22;
      inner.style.setProperty("--bird-size", size + "px");
      inner.style.animationDelay = (Math.random() * -2) + "s";

      var flapDelay = (Math.random() * -0.4) + "s";

      var frameA = document.createElement("img");
      frameA.src = BIRD_IMAGES[0];
      frameA.className = "frame-a";
      frameA.alt = "";
      frameA.style.animationDelay = flapDelay;

      var frameB = document.createElement("img");
      frameB.src = BIRD_IMAGES[1];
      frameB.className = "frame-b";
      frameB.alt = "";
      frameB.style.animationDelay = flapDelay;

      var frameC = document.createElement("img");
      frameC.src = BIRD_IMAGES[2];
      frameC.className = "frame-c";
      frameC.alt = "";
      frameC.style.animationDelay = flapDelay;

      inner.appendChild(frameA);
      inner.appendChild(frameB);
      inner.appendChild(frameC);
      outer.appendChild(inner);
      wrap.appendChild(outer);
    }
  }

  /* ---------------- quick nav (scroll-spy) ---------------- */
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

  /* ---------------- toggle info hadiah ---------------- */
  function setupGiftToggle() {
    var btn = $("btnToggleGift");
    var content = $("giftContent");
    if (!btn || !content) return;
    btn.addEventListener("click", function () {
      var isShown = content.classList.toggle("show");
      btn.textContent = isShown ? "Sembunyikan Info Hadiah" : "Tampilkan Info Hadiah";
      if (isShown && revealObserver) {
        content.querySelectorAll(".reveal").forEach(function (el) {
          revealObserver.observe(el);
        });
      }
    });
  }

  /* ---------------- RSVP form ---------------- */
  function setupRsvpForm() {
    var form = $("rsvpForm");
    if (!form) return;

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

  /* ---------------- init main page ---------------- */
  function initMainPage() {
    guestCode = getGuestCodeFromURL();

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
    initBirds();

    setupChapterReveals();
    setupAtlas();
    setupPeople();
    setupQuiz();
    setupLetterForm();

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
    }
    if ($("mainContent")) {
      initMainPage();
    }
  });

  /* ============================================================
   * CHAPTER BARU — The Day We Met, Atlas, People, Quiz, Letter
   * ============================================================ */

  function setupChapterReveals() {
    var buttons = document.querySelectorAll("[data-chapter-target]");
    if (!buttons.length) return;
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var targetId = btn.getAttribute("data-chapter-target");
        var target = document.getElementById(targetId);
        if (!target) return;
        var isOpen = target.classList.contains("active");
        document.querySelectorAll(".chapter-card").forEach(function (c) {
          c.classList.remove("active");
        });
        document.querySelectorAll("[data-chapter-target]").forEach(function (b) {
          b.classList.remove("active");
        });
        if (!isOpen) {
          target.classList.add("active");
          btn.classList.add("active");
        }
      });
    });
  }

  var ATLAS_MEMORIES = [
    { heading: "01 — WHERE WE MET", copy: "The little café with the green door.", date: "[LOKASI] · [TANGGAL]" },
    { heading: "02 — FIRST DATE", copy: "We ordered dessert twice.", date: "[LOKASI] · [TANGGAL]" },
    { heading: "03 — FIRST TRIP", copy: "The road felt like ours.", date: "[LOKASI] · [TANGGAL]" },
    { heading: "04 — FAVORITE PLACE", copy: "A table beneath the vines.", date: "[LOKASI] · [TANGGAL]" },
    { heading: "05 — THE PROPOSAL", copy: "The sweetest yes.", date: "[LOKASI] · [TANGGAL]" }
  ];

  function setupAtlas() {
    var markers = document.querySelectorAll(".atlas-marker");
    var panel = $("atlasPanel");
    var heading = $("atlasHeading");
    var copyEl = $("atlasCopy");
    var dateEl = $("atlasDate");
    if (!markers.length || !panel) return;

    markers.forEach(function (m) {
      m.addEventListener("click", function () {
        var idx = parseInt(m.getAttribute("data-memory"), 10) || 0;
        var data = ATLAS_MEMORIES[idx];
        if (!data) return;
        if (heading) heading.textContent = data.heading;
        if (copyEl) copyEl.textContent = data.copy;
        if (dateEl) dateEl.textContent = data.date;
        panel.classList.add("active");
        markers.forEach(function (x) { x.classList.remove("active"); });
        m.classList.add("active");
      });
    });
  }

  function setupPeople() {
    var cards = document.querySelectorAll(".people-card");
    var msg = $("peopleMessage");
    if (!cards.length || !msg) return;
    cards.forEach(function (card) {
      card.addEventListener("click", function () {
        msg.style.opacity = "0";
        setTimeout(function () {
          msg.textContent = card.getAttribute("data-person") || "";
          msg.style.opacity = "1";
        }, 180);
      });
    });
  }

  var QUIZ_DATA = [
    { q: "Who said \u201CI love you\u201D first?", a: "Bride", b: "Groom", correct: 0 },
    { q: "Who takes longer to get ready?", a: "Bride", b: "Groom", correct: 1 },
    { q: "Who suggests staying home?", a: "Bride", b: "Groom", correct: 0 },
    { q: "Who chose the first date?", a: "Bride", b: "Groom", correct: 1 },
    { q: "Who is more sentimental?", a: "Bride", b: "Groom", correct: 0 }
  ];

  function setupQuiz() {
    var wrap = $("quizList");
    if (!wrap) return;
    var scoreEl = $("quizScore");
    var feedbackEl = $("quizFeedback");
    var score = 0;
    var answered = 0;

    wrap.innerHTML = "";
    QUIZ_DATA.forEach(function (item, i) {
      var card = document.createElement("div");
      card.className = "quiz-card";
      card.innerHTML =
        '<p class="quiz-card-num">' + String(i + 1).padStart(2, "0") + '</p>' +
        '<p class="quiz-card-q">' + item.q + '</p>' +
        '<div class="quiz-choices">' +
        '<button type="button" class="quiz-choice" data-q="' + i + '" data-choice="0">' + item.a + '</button>' +
        '<button type="button" class="quiz-choice" data-q="' + i + '" data-choice="1">' + item.b + '</button>' +
        '</div>';
      wrap.appendChild(card);
    });

    wrap.addEventListener("click", function (e) {
      var btn = e.target.closest(".quiz-choice");
      if (!btn || btn.disabled) return;
      var qIdx = parseInt(btn.getAttribute("data-q"), 10);
      var choice = parseInt(btn.getAttribute("data-choice"), 10);
      var item = QUIZ_DATA[qIdx];
      if (!item) return;

      var parent = btn.parentElement;
      parent.querySelectorAll(".quiz-choice").forEach(function (b) {
        b.disabled = true;
        var c = parseInt(b.getAttribute("data-choice"), 10);
        if (c === item.correct) b.classList.add("correct");
      });
      if (choice !== item.correct) btn.classList.add("wrong");

      answered++;
      if (choice === item.correct) score++;

      if (scoreEl) scoreEl.textContent = score + " / " + QUIZ_DATA.length;
      if (feedbackEl) {
        feedbackEl.textContent = (choice === item.correct)
          ? "You know us rather well. \u2661"
          : "A charming guess... but no.";
      }
    });
  }

  function setupLetterForm() {
    var form = $("letterForm");
    var collection = $("letterCollection");
    if (!form || !collection) return;

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var message = $("letterMessage").value.trim();
      if (!message) return;
      var anniversaryInput = form.querySelector('input[name="letterAnniversary"]:checked');
      var anniversary = anniversaryInput ? anniversaryInput.value : "";

      var seal = document.createElement("div");
      seal.className = "letter-seal";
      seal.title = anniversary + " — " + message;
      collection.appendChild(seal);

      form.reset();
      if (collection.children.length === 1) {
        showToast("Surat kamu sudah disegel. \u2661");
      } else {
        showToast("Terima kasih! Suratmu sudah tersimpan.");
      }
    });
  }
})();