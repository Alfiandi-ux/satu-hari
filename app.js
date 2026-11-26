/* ============================================================
   Satu Hari — satu foto, satu kalimat
   ============================================================ */
(() => {
  'use strict';

  /* ------------------------------ util ------------------------------ */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, '0');
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const WEEKDAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const getTodayKey = () => dateKey(new Date());

  function parseKey(key) {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function addDays(date, delta) {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    return d;
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function longDate(key) {
    const d = parseKey(key);
    return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  function mediumDate(key) {
    const d = parseKey(key);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  function dayOfYear(key) {
    const d = parseKey(key);
    const start = new Date(d.getFullYear(), 0, 1);
    return Math.round((d - start) / 86400000) + 1;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace('.', ',')} GB`;
  }

  function autosize(el) {
    if (!el) return;
    el.style.height = 'auto';
    const max = Math.min(200, Math.round(window.innerHeight * 0.28));
    el.style.height = `${Math.min(el.scrollHeight + 2, max)}px`;
  }

  function toBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Gagal mengompres foto'))), type, quality);
    });
  }

  function loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Gagal memuat gambar'));
      img.src = src;
    });
  }

  /* ------------------------------ penyimpanan ------------------------------ */

  const DB_NAME = 'satu-hari';
  const DB_VERSION = 1;
  const STORE_ENTRIES = 'entries';
  const STORE_PHOTOS = 'photos';
  let dbPromise = null;
  let entries = new Map();

  /* state aplikasi */
  let activeDate = null;
  let currentView = 'today';
  let viewMonth = new Date();
  viewMonth.setDate(1);
  viewMonth.setHours(0, 0, 0, 0);
  let mainTimer = null;
  let detailTimer = null;
  let detailPhotoUrl = null;
  let detailPhotoToken = 0;
  let photoTarget = null;
  let installEvent = null;
  let lastTodayKey = getTodayKey();

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('Browser tidak mendukung penyimpanan lokal'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
          db.createObjectStore(STORE_ENTRIES, { keyPath: 'date' });
        }
        if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
          db.createObjectStore(STORE_PHOTOS, { keyPath: 'date' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Gagal membuka penyimpanan'));
    });
    return dbPromise;
  }

  function requestResult(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGetAll(store) {
    const db = await openDB();
    return requestResult(db.transaction(store, 'readonly').objectStore(store).getAll());
  }

  async function dbGet(store, key) {
    const db = await openDB();
    return requestResult(db.transaction(store, 'readonly').objectStore(store).get(key));
  }

  async function dbPut(store, value) {
    const db = await openDB();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function dbDelete(store, key) {
    const db = await openDB();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function dbClear(store) {
    const db = await openDB();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function loadEntries() {
    const list = await dbGetAll(STORE_ENTRIES);
    entries = new Map(list.filter((e) => e && e.date).map((e) => [e.date, e]));
  }

  let persistAsked = false;
  function requestPersist() {
    if (persistAsked) return;
    persistAsked = true;
    try {
      if (navigator.storage && typeof navigator.storage.persist === 'function') {
        navigator.storage.persist().catch(() => {});
      }
    } catch (_) { /* diamkan */ }
  }

  /* ------------------------------ gambar ------------------------------ */

  async function decodeImage(file) {
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) {}
      try { return await createImageBitmap(file); } catch (_) {}
    }
    const url = URL.createObjectURL(file);
    try {
      return await loadImageElement(url);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  }

  async function processImage(file) {
    if (!file || !String(file.type || '').startsWith('image/')) {
      throw new Error('File bukan gambar');
    }
    if (file.size > 40 * 1024 * 1024) {
      throw new Error('Foto terlalu besar (maks 40 MB)');
    }

    const bitmap = await decodeImage(file);
    const sw = bitmap.width || bitmap.naturalWidth;
    const sh = bitmap.height || bitmap.naturalHeight;
    if (!sw || !sh) throw new Error('Foto tidak bisa dibaca');

    const qualityPref = readPhotoQualityPref();
    const isHigh = qualityPref === 'high';
    const maxDimension = isHigh ? 2400 : 1280;
    const jpegQuality = isHigh ? 0.92 : 0.82;

    const scale = Math.min(1, maxDimension / Math.max(sw, sh));
    const fw = Math.max(1, Math.round(sw * scale));
    const fh = Math.max(1, Math.round(sh * scale));

    const full = document.createElement('canvas');
    full.width = fw;
    full.height = fh;
    const fctx = full.getContext('2d');
    fctx.fillStyle = '#f6f0e4';
    fctx.fillRect(0, 0, fw, fh);
    fctx.imageSmoothingEnabled = true;
    fctx.imageSmoothingQuality = 'high';
    fctx.drawImage(bitmap, 0, 0, fw, fh);

    const side = Math.min(sw, sh);
    const sx = (sw - side) / 2;
    const sy = (sh - side) / 2;
    const thumbSize = 640;
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbSize;
    thumbCanvas.height = thumbSize;
    const tctx = thumbCanvas.getContext('2d');
    tctx.fillStyle = '#f6f0e4';
    tctx.fillRect(0, 0, thumbSize, thumbSize);
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(bitmap, sx, sy, side, side, 0, 0, thumbSize, thumbSize);

    const blob = await toBlob(full, 'image/jpeg', jpegQuality);
    const thumb = thumbCanvas.toDataURL('image/jpeg', 0.76);

    if (typeof bitmap.close === 'function') {
      try { bitmap.close(); } catch (_) {}
    }

    full.width = full.height = 0;
    thumbCanvas.width = thumbCanvas.height = 0;

    return { blob, thumb };
  }

  /* ------------------------------ tema ------------------------------ */

  const THEME_KEY = 'satu-hari-theme';

  function readThemePref() {
    try {
      const v = localStorage.getItem(THEME_KEY);
      return ['system', 'light', 'dark'].includes(v) ? v : 'system';
    } catch (_) {
      return 'system';
    }
  }

  function applyTheme() {
    const pref = readThemePref();
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = pref === 'dark' || (pref === 'system' && prefersDark);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#141110' : '#F5F0E6');
    $$('[data-theme-pref]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.themePref === pref));
    });
  }

  function setThemePref(pref) {
    try { localStorage.setItem(THEME_KEY, pref); } catch (_) {}
    applyTheme();
  }

  /* ------------------------------ kualitas foto ------------------------------ */

  const PHOTO_QUALITY_KEY = 'satu-hari-photo-quality';

  function readPhotoQualityPref() {
    try {
      const v = localStorage.getItem(PHOTO_QUALITY_KEY);
      return v === 'high' ? 'high' : 'standard';
    } catch (_) {
      return 'standard';
    }
  }

  function applyPhotoQualityUI() {
    const pref = readPhotoQualityPref();
    $$('[data-quality-pref]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.qualityPref === pref));
    });
  }

  function setPhotoQualityPref(pref) {
    try {
      localStorage.setItem(PHOTO_QUALITY_KEY, pref === 'high' ? 'high' : 'standard');
    } catch (_) { /* diabaikan */ }
    applyPhotoQualityUI();
  }

  /* ------------------------------ status & toast ------------------------------ */

  const statusTimers = new WeakMap();

  function setStatus(el, state) {
    if (!el) return;
    const existing = statusTimers.get(el);
    if (existing) clearTimeout(existing);
    if (state === 'saving') {
      el.textContent = 'Menyimpan…';
      el.classList.add('active');
      return;
    }
    if (state === 'saved') {
      el.textContent = 'Tersimpan';
      el.classList.add('active');
      const t = setTimeout(() => el.classList.remove('active'), 2200);
      statusTimers.set(el, t);
      return;
    }
    el.classList.remove('active');
  }

  let toastTimer = null;
  function toast(message, ms = 2400) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  /* ------------------------------ data ------------------------------ */

  async function patchEntry(date, patch) {
    const now = Date.now();
    const cur = entries.get(date) || {
      date,
      sentence: '',
      hasPhoto: false,
      thumb: null,
      createdAt: now,
      updatedAt: now
    };
    const next = { ...cur, ...patch, date, updatedAt: now };
    next.sentence = String(next.sentence || '').slice(0, 160);
    next.hasPhoto = Boolean(next.hasPhoto);
    next.thumb = next.hasPhoto ? next.thumb || null : null;

    const isEmpty = !next.hasPhoto && !next.sentence.trim();
    if (isEmpty) {
      entries.delete(date);
      await Promise.all([dbDelete(STORE_ENTRIES, date), dbDelete(STORE_PHOTOS, date)]);
    } else {
      entries.set(date, next);
      await dbPut(STORE_ENTRIES, next);
    }
    requestPersist();
    renderAll();
  }

  async function setPhotoForDate(date, file, { focusSentence = false } = {}) {
    const { blob, thumb } = await processImage(file);
    await dbPut(STORE_PHOTOS, { date, blob });
    await patchEntry(date, { hasPhoto: true, thumb });
    if (activeDate === date && !$('#detailSheet').hidden) {
      await renderDetailPhoto();
    }
    toast('Foto tersimpan');
    if (focusSentence) {
      const mainInput = $('#sentenceInput');
      if (date === getTodayKey() && currentView === 'today' && mainInput) {
        try { mainInput.focus({ preventScroll: false }); } catch (_) { mainInput.focus(); }
      }
    }
  }

  async function deleteEntry(date) {
    const clearedMain = date === getTodayKey();
    if (clearedMain) {
      if (mainTimer) { clearTimeout(mainTimer); mainTimer = null; }
      const mainInput = $('#sentenceInput');
      if (mainInput) {
        mainInput.value = '';
        autosize(mainInput);
        updateMainCount();
      }
      setStatus($('#saveStatus'), 'idle');
    }
    if (activeDate === date) {
      if (detailTimer) { clearTimeout(detailTimer); detailTimer = null; }
      activeDate = null;
      closeSheet($('#detailSheet'));
    }
    entries.delete(date);
    await Promise.all([dbDelete(STORE_ENTRIES, date), dbDelete(STORE_PHOTOS, date)]);
    renderAll();
  }

  /* ------------------------------ hitungan ------------------------------ */

  function streakStats() {
    const keys = Array.from(entries.keys()).sort();
    let longest = 0;
    let run = 0;
    let prev = null;
    for (const key of keys) {
      if (prev) {
        const diff = Math.round((parseKey(key) - parseKey(prev)) / 86400000);
        run = diff === 1 ? run + 1 : 1;
      } else {
        run = 1;
      }
      if (run > longest) longest = run;
      prev = key;
    }

    let current = 0;
    let cursor = startOfDay(new Date());
    if (!entries.has(dateKey(cursor))) cursor = addDays(cursor, -1);
    while (entries.has(dateKey(cursor))) {
      current += 1;
      cursor = addDays(cursor, -1);
    }
    return { current, longest };
  }

  /* ------------------------------ render: hari ini ------------------------------ */

  function renderToday() {
    const key = getTodayKey();
    const d = parseKey(key);
    const dateEl = $('#todayDate');
    const doyEl = $('#dayOfYear');
    if (dateEl) dateEl.textContent = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    if (doyEl) doyEl.textContent = `hari ke-${dayOfYear(key)}`;

    const entry = entries.get(key);
    const img = $('#photoImg');
    const empty = $('#photoEmpty');
    const tools = $('#photoTools');
    const hasPhoto = Boolean(entry && entry.hasPhoto && entry.thumb);

    if (img && empty && tools) {
      if (hasPhoto) {
        if (img.getAttribute('src') !== entry.thumb) img.src = entry.thumb;
        img.hidden = false;
        empty.hidden = true;
        tools.hidden = false;
      } else {
        img.hidden = true;
        img.removeAttribute('src');
        empty.hidden = false;
        tools.hidden = true;
      }
    }

    const input = $('#sentenceInput');
    if (input && document.activeElement !== input) {
      const val = entry ? entry.sentence || '' : '';
      if (input.value !== val) {
        input.value = val;
        autosize(input);
      }
    }
    updateMainCount();
    setStatus($('#saveStatus'), 'idle');
  }

  function updateMainCount() {
    const input = $('#sentenceInput');
    const count = $('#charCount');
    if (input && count) count.textContent = `${input.value.length}/160`;
  }

  function renderWeek() {
    const grid = $('#weekGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const today = startOfDay(new Date());
    for (let i = 6; i >= 0; i -= 1) {
      const d = addDays(today, -i);
      const key = dateKey(d);
      const entry = entries.get(key);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mini-day';
      btn.dataset.date = key;
      btn.setAttribute('aria-label', `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${entry ? ', ada catatan' : ', belum ada catatan'}`);
      if (key === getTodayKey()) btn.classList.add('today');

      const thumb = document.createElement('span');
      thumb.className = 'mini-thumb';
      if (entry && entry.thumb) {
        const im = document.createElement('img');
        im.src = entry.thumb;
        im.alt = '';
        thumb.append(im);
      } else {
        thumb.classList.add('blank');
        const dot = document.createElement('span');
        dot.className = 'dot';
        thumb.append(dot);
      }

      const label = document.createElement('span');
      label.className = 'mini-label';
      label.textContent = WEEKDAYS_SHORT[d.getDay()];

      btn.append(thumb, label);
      btn.addEventListener('click', () => openDetail(key));
      grid.append(btn);
    }
  }

  function renderStreak() {
    const stats = streakStats();
    const text = $('#streakPillText');
    const pill = $('#streakBtn');
    if (text) text.textContent = stats.current > 0 ? `${stats.current} hari` : 'Mulai';
    if (pill) {
      pill.classList.toggle('active', stats.current > 0);
      pill.setAttribute('aria-label', stats.current > 0 ? `Rangkaian ${stats.current} hari. Lihat kalender` : 'Lihat kalender dan mulai rangkaian');
    }
    const statStreak = $('#statStreak');
    if (statStreak) statStreak.textContent = String(stats.current);
    return stats;
  }

  /* ------------------------------ render: kalender ------------------------------ */

  function renderCalendar() {
    const title = $('#calTitle');
    const grid = $('#calGrid');
    if (!title || !grid) return;

    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    title.textContent = `${MONTHS[month]} ${year}`;

    const today = new Date();
    const nextBtn = $('#calNext');
    if (nextBtn) {
      const atLimit = year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth());
      nextBtn.disabled = atLimit;
    }

    const prefix = `${year}-${pad2(month + 1)}`;
    let monthCount = 0;
    entries.forEach((value, key) => {
      if (key.startsWith(prefix)) monthCount += 1;
    });
    if ($('#statMonth')) $('#statMonth').textContent = String(monthCount);
    if ($('#statTotal')) $('#statTotal').textContent = String(entries.size);
    const hint = $('#calHint');
    if (hint) {
      hint.textContent = entries.size
        ? `Ketuk tanggal untuk melihat atau mengubah catatan. Rangkaian terpanjang ${streakStats().longest} hari.`
        : 'Belum ada catatan. Ketuk tanggal hari ini untuk memulai.';
    }

    grid.innerHTML = '';
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    for (let i = 0; i < offset; i += 1) {
      const blank = document.createElement('div');
      blank.className = 'cal-day blank';
      blank.setAttribute('aria-hidden', 'true');
      grid.append(blank);
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = getTodayKey();

    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${prefix}-${pad2(day)}`;
      const entry = entries.get(key);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-day';
      btn.dataset.date = key;

      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(day);
      btn.append(num);

      if (key === todayKey) btn.classList.add('today');
      if (key > todayKey) {
        btn.disabled = true;
        btn.classList.add('future');
      }
      if (entry) {
        btn.classList.add('has-entry');
        if (entry.thumb) {
          btn.classList.add('thumb');
          btn.style.backgroundImage = `url("${entry.thumb}")`;
        }
      }

      const labelParts = [`${day} ${MONTHS[month]} ${year}`];
      if (key === todayKey) labelParts.push('hari ini');
      labelParts.push(entry ? 'ada catatan' : 'belum ada catatan');
      btn.setAttribute('aria-label', labelParts.join(', '));
      btn.addEventListener('click', () => openDetail(key));
      grid.append(btn);
    }
  }

  /* ------------------------------ render: arsip ------------------------------ */

  function renderArchive() {
    const wrap = $('#archiveList');
    if (!wrap) return;
    const query = ($('#searchInput')?.value || '').trim().toLowerCase();
    const list = Array.from(entries.values())
      .filter((e) => !query || String(e.sentence || '').toLowerCase().includes(query))
      .sort((a, b) => b.date.localeCompare(a.date));

    const countEl = $('#archiveCount');
    if (countEl) countEl.textContent = query ? `${list.length} hasil` : `${entries.size} catatan`;

    wrap.innerHTML = '';

    if (!list.length) {
      const box = document.createElement('div');
      box.className = 'empty-archive';
      const p = document.createElement('p');
      p.textContent = query ? 'Tidak ada kalimat yang cocok.' : 'Belum ada catatan. Mulai dari satu foto hari ini.';
      box.append(p);
      if (!query && !entries.size) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary';
        btn.textContent = 'Mulai hari ini';
        btn.addEventListener('click', () => switchView('today'));
        box.append(btn);
      }
      wrap.append(box);
      return;
    }

    let currentMonth = '';
    for (const entry of list) {
      const monthKey = entry.date.slice(0, 7);
      if (monthKey !== currentMonth) {
        currentMonth = monthKey;
        const d = parseKey(entry.date);
        const label = document.createElement('p');
        label.className = 'month-label';
        label.textContent = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
        wrap.append(label);
      }

      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'entry-row';
      row.dataset.date = entry.date;

      if (entry.thumb) {
        const img = document.createElement('img');
        img.className = 'entry-thumb';
        img.src = entry.thumb;
        img.alt = '';
        row.append(img);
      } else {
        const ph = document.createElement('span');
        ph.className = 'entry-thumb';
        ph.setAttribute('aria-hidden', 'true');
        ph.textContent = '“';
        row.append(ph);
      }

      const body = document.createElement('span');
      body.className = 'entry-body';

      const d = parseKey(entry.date);
      const date = document.createElement('span');
      date.className = 'entry-date';
      date.textContent = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()} · ${WEEKDAYS[d.getDay()]}`;

      const text = document.createElement('span');
      text.className = 'entry-text';
      if (entry.sentence) {
        text.textContent = entry.sentence;
      } else {
        text.textContent = 'Tanpa kalimat';
        text.classList.add('is-empty');
      }

      body.append(date, text);
      row.append(body);
      row.addEventListener('click', () => openDetail(entry.date));
      wrap.append(row);
    }
  }

  /* ------------------------------ render: semua ------------------------------ */

  function renderAll() {
    renderToday();
    renderWeek();
    renderStreak();
    renderCalendar();
    renderArchive();
    if (activeDate && !$('#detailSheet').hidden) renderDetailMeta();
  }

  /* ------------------------------ sheet & detail ------------------------------ */

  function openSheet(sheet) {
    if (!sheet) return;
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('show')));
  }

  function closeSheet(sheet) {
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove('show');
    setTimeout(() => {
      if (sheet.classList.contains('show')) return;
      sheet.hidden = true;
      if (!document.querySelector('.sheet:not([hidden])')) {
        document.body.classList.remove('sheet-open');
      }
      if (sheet.id === 'detailSheet') cleanupDetail();
    }, 300);
  }

  function closeDetail() {
    flushDetailSave();
    closeSheet($('#detailSheet'));
  }

  function cleanupDetail() {
    activeDate = null;
    detailPhotoToken += 1;
    if (detailPhotoUrl) {
      URL.revokeObjectURL(detailPhotoUrl);
      detailPhotoUrl = null;
    }
    const img = $('#detailPhoto');
    if (img) img.removeAttribute('src');
  }

  async function openDetail(key) {
    if (!key || key > getTodayKey()) return;
    await flushMainSave();
    activeDate = key;
    const sheet = $('#detailSheet');
    if (!sheet) return;
    if (sheet.hidden) openSheet(sheet);
    setStatus($('#detailStatus'), 'idle');
    renderDetailMeta();
    await renderDetailPhoto();
  }

  function renderDetailMeta() {
    if (!activeDate) return;
    const entry = entries.get(activeDate);
    const dateEl = $('#detailDate');
    if (dateEl) dateEl.textContent = longDate(activeDate);
    const sub = $('#detailSub');
    if (sub) {
      sub.textContent = activeDate === getTodayKey()
        ? 'Hari ini'
        : `Hari ke-${dayOfYear(activeDate)}`;
    }

    const ta = $('#detailSentence');
    if (ta && document.activeElement !== ta) {
      const value = entry ? entry.sentence || '' : '';
      if (ta.value !== value) {
        ta.value = value;
        autosize(ta);
      }
    }
    const count = $('#detailCount');
    if (count && ta) count.textContent = `${ta.value.length}/160`;

    const delBtn = $('#detailDeleteBtn');
    if (delBtn) delBtn.hidden = !entry;
    const shareBtn = $('#detailShareBtn');
    if (shareBtn) shareBtn.disabled = !entry;
    const photoLabel = $('#detailPhotoBtn span');
    if (photoLabel) photoLabel.textContent = entry && entry.hasPhoto ? 'Ganti foto' : 'Tambah foto';
  }

  async function renderDetailPhoto() {
    if (!activeDate) return;
    const date = activeDate;
    const token = ++detailPhotoToken;
    const entry = entries.get(date);
    const img = $('#detailPhoto');
    const empty = $('#detailPhotoEmpty');

    if (detailPhotoUrl) {
      URL.revokeObjectURL(detailPhotoUrl);
      detailPhotoUrl = null;
    }

    if (entry && entry.hasPhoto && entry.thumb) {
      if (empty) empty.hidden = true;
      if (img) {
        img.hidden = false;
        if (img.getAttribute('src') !== entry.thumb) img.src = entry.thumb;
      }
      try {
        const rec = await dbGet(STORE_PHOTOS, date);
        if (token !== detailPhotoToken || activeDate !== date) return;
        if (rec && rec.blob) {
          detailPhotoUrl = URL.createObjectURL(rec.blob);
          if (img) img.src = detailPhotoUrl;
        }
      } catch (_) { /* pakai thumbnail */ }
    } else {
      if (img) {
        img.hidden = true;
        img.removeAttribute('src');
      }
      if (empty) empty.hidden = false;
    }
  }

  function choosePhoto(date, mode) {
    photoTarget = date;
    const input = mode === 'gallery' ? $('#galleryInput') : $('#cameraInput');
    if (!input) return;
    input.value = '';
    input.click();
  }

  async function handlePhotoInput(event) {
    const input = event.currentTarget;
    const file = input && input.files && input.files[0];
    const date = photoTarget || getTodayKey();
    photoTarget = null;
    if (input) input.value = '';
    if (!file) return;

    toast('Memproses foto…', 6000);
    try {
      const focusSentence = date === getTodayKey() && currentView === 'today';
      await setPhotoForDate(date, file, { focusSentence });
    } catch (err) {
      console.error(err);
      toast(err && err.message ? err.message : 'Gagal memproses foto', 3200);
    }
  }

  /* ------------------------------ bagikan ------------------------------ */

  function drawCover(ctx, img, x, y, w, h) {
    const iw = img.width || img.naturalWidth || 1;
    const ih = img.height || img.naturalHeight || 1;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let cur = '';
    for (let i = 0; i < words.length; i += 1) {
      const test = cur ? `${cur} ${words[i]}` : words[i];
      if (!cur || ctx.measureText(test).width <= maxWidth) {
        cur = test;
      } else {
        lines.push(cur);
        cur = words[i];
        if (lines.length === maxLines - 1) {
          let rest = cur;
          for (let j = i + 1; j < words.length; j += 1) rest += ` ${words[j]}`;
          let trimmed = rest;
          while (trimmed && ctx.measureText(`${trimmed} …`).width > maxWidth) {
            trimmed = trimmed.slice(0, -1).replace(/\s+$/, '');
          }
          cur = trimmed ? `${trimmed} …` : '…';
          break;
        }
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, maxLines);
  }

  async function composeShareCard(date, entry) {
    const W = 1080;
    const H = 1350;
    const PAD = 72;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const paper = '#f6f0e4';
    const ink = '#221e18';
    const accent = '#b94b2c';
    const muted = '#8c8274';
    const sentence = String(entry && entry.sentence ? entry.sentence : '').trim();

    let img = null;
    try {
      if (entry && entry.hasPhoto) {
        const rec = await dbGet(STORE_PHOTOS, date);
        if (rec && rec.blob) {
          const url = URL.createObjectURL(rec.blob);
          try { img = await loadImageElement(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1500); }
        }
      }
      if (!img && entry && entry.thumb) img = await loadImageElement(entry.thumb);
    } catch (_) { img = null; }

    if (img) {
      ctx.fillStyle = '#1a1512';
      ctx.fillRect(0, 0, W, H);
      drawCover(ctx, img, 0, 0, W, H);

      const grad = ctx.createLinearGradient(0, H * 0.38, 0, H);
      grad.addColorStop(0, 'rgba(12,10,9,0)');
      grad.addColorStop(0.6, 'rgba(12,10,9,0.5)');
      grad.addColorStop(1, 'rgba(12,10,9,0.92)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.textAlign = 'left';
      const lines = sentence ? wrapLines(ctx, sentence, W - PAD * 2, 3) : [];
      const lh = 74;
      const bottom = H - 160;
      const top = bottom - Math.max(0, lines.length - 1) * lh;
      const dateY = top - 56;

      ctx.fillStyle = 'rgba(255,248,238,0.74)';
      ctx.font = '600 24px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
      ctx.fillText(longDate(date).toUpperCase(), PAD, dateY);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

      if (lines.length) {
        ctx.fillStyle = '#fff8ee';
        ctx.font = '600 58px Georgia, "Times New Roman", serif';
        lines.forEach((line, i) => ctx.fillText(line, PAD, top + i * lh));
      }

      ctx.fillStyle = 'rgba(255,248,238,0.62)';
      ctx.font = '700 20px system-ui, sans-serif';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
      ctx.fillText('SATU HARI', PAD, H - 64);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    } else {
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = accent;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(W / 2, 190, 44, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(W / 2, 190, 13, 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = accent;
      ctx.font = 'italic 600 96px Georgia, serif';
      ctx.fillText('“', W / 2, 370);

      ctx.fillStyle = ink;
      ctx.font = 'italic 600 58px Georgia, "Times New Roman", serif';
      const lines = wrapLines(ctx, sentence || 'Satu hari, satu kalimat.', W - PAD * 2, 6);
      const lh = 80;
      const start = 480;
      lines.forEach((line, i) => ctx.fillText(line, W / 2, start + i * lh));

      ctx.fillStyle = muted;
      ctx.font = '600 25px system-ui, sans-serif';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
      ctx.fillText(longDate(date).toUpperCase(), W / 2, H - 190);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

      ctx.fillStyle = ink;
      ctx.font = '700 20px system-ui, sans-serif';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
      ctx.fillText('SATU HARI', W / 2, H - 90);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    const blob = await toBlob(canvas, 'image/jpeg', 0.9);
    canvas.width = 0;
    canvas.height = 0;
    return blob;
  }

  function downloadBlob(blob, filename) {
    const bridge = window.SatuHariAndroid;
    if (bridge && typeof bridge.saveFile === 'function') {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = String(reader.result || '').split(',')[1] || '';
        try {
          bridge.saveFile(filename, blob.type || 'application/octet-stream', base64);
        } catch (_) {
          toast('Gagal menyimpan berkas');
        }
      };
      reader.onerror = () => toast('Gagal menyiapkan berkas');
      reader.readAsDataURL(blob);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function shareDay(date) {
    await flushMainSave();
    await flushDetailSave();
    const entry = entries.get(date);
    if (!entry) {
      toast('Belum ada yang bisa dibagikan');
      return;
    }
    toast('Menyiapkan kartu…', 6000);
    try {
      const blob = await composeShareCard(date, entry);
      const file = new File([blob], `satu-hari-${date}.jpg`, { type: 'image/jpeg' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Satu Hari', text: entry.sentence || '' });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      downloadBlob(blob, `satu-hari-${date}.jpg`);
      toast('Kartu diunduh');
    } catch (err) {
      console.error(err);
      const text = `${entry.sentence || ''}\n\n— Satu Hari, ${mediumDate(date)}`.trim();
      if (navigator.share) {
        try { await navigator.share({ text }); return; } catch (_) {}
      }
      toast('Gagal membuat kartu');
    }
  }

  /* ------------------------------ cadangan ------------------------------ */

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function exportData() {
    const btn = $('#exportRow');
    if (btn) btn.disabled = true;
    toast('Menyiapkan cadangan…', 6000);
    try {
      const list = Array.from(entries.values()).sort((a, b) => a.date.localeCompare(b.date));
      const photos = {};
      for (const entry of list) {
        if (!entry.hasPhoto) continue;
        try {
          const rec = await dbGet(STORE_PHOTOS, entry.date);
          if (rec && rec.blob) photos[entry.date] = await blobToDataURL(rec.blob);
        } catch (_) { /* lewati foto yang rusak */ }
      }
      const payload = {
        app: 'satu-hari',
        version: 1,
        exportedAt: new Date().toISOString(),
        entries: list,
        photos
      };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      downloadBlob(blob, `satu-hari-${getTodayKey()}.json`);
      toast('Cadangan diunduh');
    } catch (err) {
      console.error(err);
      toast('Gagal mengekspor data');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function importData(file) {
    toast('Mengimpor cadangan…', 8000);
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.entries)) throw new Error('Format tidak dikenal');
      let count = 0;
      for (const raw of data.entries) {
        if (!raw || typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) continue;
        if (raw.date > getTodayKey()) continue;
        let thumb = typeof raw.thumb === 'string' && raw.thumb.startsWith('data:image/') ? raw.thumb : null;
        let blob = null;
        const photoData = data.photos && data.photos[raw.date];
        if (raw.hasPhoto && typeof photoData === 'string' && photoData.startsWith('data:image/')) {
          try { blob = await (await fetch(photoData)).blob(); } catch (_) { blob = null; }
          if (blob && !thumb) {
            try {
              const processed = await processImage(blob);
              thumb = processed.thumb;
              blob = processed.blob;
            } catch (_) { /* tanpa thumbnail */ }
          }
        }
        const entry = {
          date: raw.date,
          sentence: String(raw.sentence || '').slice(0, 160),
          hasPhoto: Boolean(blob || thumb),
          thumb,
          createdAt: Number(raw.createdAt) || Date.now(),
          updatedAt: Number(raw.updatedAt) || Date.now()
        };
        if (!entry.hasPhoto && !entry.sentence.trim()) continue;
        if (blob) await dbPut(STORE_PHOTOS, { date: raw.date, blob });
        await dbPut(STORE_ENTRIES, entry);
        count += 1;
      }
      await loadEntries();
      renderAll();
      toast(`${count} catatan diimpor`);
    } catch (err) {
      console.error(err);
      toast('File cadangan tidak valid');
    }
  }

  async function deleteAllData() {
    if (!entries.size) {
      toast('Belum ada data untuk dihapus');
      return;
    }
    if (!confirm('Hapus semua catatan dan foto? Tindakan ini tidak bisa dibatalkan.')) return;
    try {
      if (mainTimer) { clearTimeout(mainTimer); mainTimer = null; }
      if (detailTimer) { clearTimeout(detailTimer); detailTimer = null; }
      await Promise.all([dbClear(STORE_ENTRIES), dbClear(STORE_PHOTOS)]);
      entries.clear();
      if (activeDate) {
        activeDate = null;
        closeSheet($('#detailSheet'));
      }
      renderAll();
      updateStorageInfo();
      toast('Semua data dihapus');
    } catch (err) {
      console.error(err);
      toast('Gagal menghapus data');
    }
  }

  /* ------------------------------ simpan otomatis ------------------------------ */

  function scheduleMainSave() {
    if (mainTimer) clearTimeout(mainTimer);
    setStatus($('#saveStatus'), 'saving');
    mainTimer = setTimeout(() => { flushMainSave(); }, 450);
  }

  async function flushMainSave() {
    if (mainTimer) {
      clearTimeout(mainTimer);
      mainTimer = null;
    }
    const input = $('#sentenceInput');
    if (!input) return;
    const date = getTodayKey();
    const value = input.value.replace(/[ \t]+$/, '').slice(0, 160);
    const cur = entries.get(date);
    if ((cur ? cur.sentence || '' : '') === value) {
      if (value) setStatus($('#saveStatus'), 'saved');
      return;
    }
    try {
      await patchEntry(date, { sentence: value });
      setStatus($('#saveStatus'), 'saved');
    } catch (err) {
      console.error(err);
      toast('Gagal menyimpan kalimat');
      setStatus($('#saveStatus'), 'idle');
    }
  }

  function scheduleDetailSave() {
    if (detailTimer) clearTimeout(detailTimer);
    setStatus($('#detailStatus'), 'saving');
    detailTimer = setTimeout(() => { flushDetailSave(); }, 450);
  }

  async function flushDetailSave() {
    if (detailTimer) {
      clearTimeout(detailTimer);
      detailTimer = null;
    }
    if (!activeDate) return;
    const ta = $('#detailSentence');
    if (!ta) return;
    const date = activeDate;
    const value = ta.value.replace(/[ \t]+$/, '').slice(0, 160);
    const cur = entries.get(date);
    if ((cur ? cur.sentence || '' : '') === value) {
      if (value) setStatus($('#detailStatus'), 'saved');
      return;
    }
    try {
      await patchEntry(date, { sentence: value });
      setStatus($('#detailStatus'), 'saved');
    } catch (err) {
      console.error(err);
      toast('Gagal menyimpan kalimat');
    }
  }

  /* ------------------------------ pengaturan ------------------------------ */

  async function updateStorageInfo() {
    const el = $('#storageInfo');
    if (!el) return;
    let usage = 0;
    try {
      if (navigator.storage && typeof navigator.storage.estimate === 'function') {
        const est = await navigator.storage.estimate();
        usage = est.usage || 0;
      }
    } catch (_) { usage = 0; }
    const parts = [`${entries.size} catatan`];
    if (usage > 0) parts.push(`${formatBytes(usage)} terpakai`);
    el.textContent = parts.join(' · ');
  }

  function detectInstallRow() {
    const row = $('#installRow');
    if (!row) return;
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    if (standalone) {
      row.hidden = true;
      return;
    }
    if (installEvent) {
      row.hidden = false;
      row.dataset.ios = '';
      return;
    }
    const iOS = /iP(hone|ad|od)/.test(navigator.userAgent);
    row.hidden = !iOS;
    row.dataset.ios = iOS ? '1' : '';
  }

  async function openSettings() {
    applyTheme();
    applyPhotoQualityUI();
    openSheet($('#settingsSheet'));
    updateStorageInfo();
    detectInstallRow();
  }

  async function handleInstallRow() {
    if (installEvent) {
      try {
        installEvent.prompt();
        await installEvent.userChoice;
      } catch (_) { /* diabaikan */ }
      installEvent = null;
      const row = $('#installRow');
      if (row) row.hidden = true;
      return;
    }
    toast('Buka menu browser, lalu pilih “Tambahkan ke Layar Utama”.', 5500);
  }

  /* ------------------------------ navigasi ------------------------------ */

  function switchView(name) {
    currentView = ['today', 'calendar', 'archive'].includes(name) ? name : 'today';
    $$('.view').forEach((view) => {
      view.hidden = view.id !== `view-${currentView}`;
    });
    $$('.tab').forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.view === currentView));
    });
    if (currentView === 'calendar') renderCalendar();
    if (currentView === 'archive') renderArchive();
    window.scrollTo(0, 0);
  }

  function checkDayRollover() {
    const key = getTodayKey();
    if (key !== lastTodayKey) {
      lastTodayKey = key;
      if (currentView === 'today' && activeDate === null) {
        const input = $('#sentenceInput');
        if (input) {
          input.value = entries.get(key) ? entries.get(key).sentence || '' : '';
          autosize(input);
          updateMainCount();
        }
      }
      renderAll();
    }
  }

  function registerSW() {
    if (window.SatuHariAndroid) return;
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;
    const register = () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }

  /* ------------------------------ event ------------------------------ */

  function bindEvents() {
    $('#brandBtn')?.addEventListener('click', () => switchView('today'));
    $('#streakBtn')?.addEventListener('click', () => switchView('calendar'));
    $('#settingsBtn')?.addEventListener('click', openSettings);
    $$('.tab').forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));

    $('#cameraBtn')?.addEventListener('click', () => choosePhoto(getTodayKey(), 'camera'));
    $('#galleryBtn')?.addEventListener('click', () => choosePhoto(getTodayKey(), 'gallery'));
    $('#changePhotoBtn')?.addEventListener('click', () => choosePhoto(getTodayKey(), 'camera'));
    $('#shareTodayBtn')?.addEventListener('click', () => shareDay(getTodayKey()));
    $('#photoImg')?.addEventListener('click', () => openDetail(getTodayKey()));
    $('#weekCalendarBtn')?.addEventListener('click', () => switchView('calendar'));

    $('#cameraInput')?.addEventListener('change', handlePhotoInput);
    $('#galleryInput')?.addEventListener('change', handlePhotoInput);
    $('#importInput')?.addEventListener('change', (event) => {
      const input = event.currentTarget;
      const file = input.files && input.files[0];
      input.value = '';
      if (file) importData(file);
    });

    const input = $('#sentenceInput');
    if (input) {
      input.addEventListener('input', () => {
        updateMainCount();
        autosize(input);
        scheduleMainSave();
      });
      input.addEventListener('blur', () => { flushMainSave(); });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          input.blur();
          flushMainSave();
        }
      });
    }

    const detailSentence = $('#detailSentence');
    if (detailSentence) {
      detailSentence.addEventListener('input', () => {
        const count = $('#detailCount');
        if (count) count.textContent = `${detailSentence.value.length}/160`;
        autosize(detailSentence);
        scheduleDetailSave();
      });
      detailSentence.addEventListener('blur', () => { flushDetailSave(); });
      detailSentence.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          detailSentence.blur();
          flushDetailSave();
        }
      });
    }

    $('#detailSheet')?.addEventListener('click', (event) => {
      if (event.target.closest('[data-close="detail"]')) closeDetail();
    });
    $('#settingsSheet')?.addEventListener('click', (event) => {
      if (event.target.closest('[data-close="settings"]')) closeSheet($('#settingsSheet'));
    });

    $('#detailPhotoBtn')?.addEventListener('click', () => { if (activeDate) choosePhoto(activeDate, 'camera'); });
    $('#detailGalleryBtn')?.addEventListener('click', () => { if (activeDate) choosePhoto(activeDate, 'gallery'); });
    $('#detailAddPhoto')?.addEventListener('click', () => { if (activeDate) choosePhoto(activeDate, 'camera'); });
    $('#detailShareBtn')?.addEventListener('click', () => { if (activeDate) shareDay(activeDate); });
    $('#detailDeleteBtn')?.addEventListener('click', async () => {
      if (!activeDate) return;
      const date = activeDate;
      if (!confirm(`Hapus catatan ${mediumDate(date)}?`)) return;
      try {
        await deleteEntry(date);
        toast('Catatan dihapus');
      } catch (err) {
        console.error(err);
        toast('Gagal menghapus catatan');
      }
    });

    $('#calPrev')?.addEventListener('click', () => {
      viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
      renderCalendar();
    });
    $('#calNext')?.addEventListener('click', () => {
      const next = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
      const now = new Date();
      if (next.getFullYear() > now.getFullYear() || (next.getFullYear() === now.getFullYear() && next.getMonth() > now.getMonth())) return;
      viewMonth = next;
      renderCalendar();
    });

    $('#searchInput')?.addEventListener('input', renderArchive);

    $$('[data-theme-pref]').forEach((btn) => {
      btn.addEventListener('click', () => setThemePref(btn.dataset.themePref));
    });

    $$('[data-quality-pref]').forEach((btn) => {
      btn.addEventListener('click', () => setPhotoQualityPref(btn.dataset.qualityPref));
    });

    $('#exportRow')?.addEventListener('click', exportData);
    $('#importRow')?.addEventListener('click', () => $('#importInput')?.click());
    $('#deleteAllRow')?.addEventListener('click', deleteAllData);
    $('#installRow')?.addEventListener('click', handleInstallRow);

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!$('#detailSheet').hidden) closeDetail();
      else if (!$('#settingsSheet').hidden) closeSheet($('#settingsSheet'));
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        flushMainSave();
        flushDetailSave();
      } else {
        checkDayRollover();
      }
    });

    window.addEventListener('pagehide', () => {
      flushMainSave();
      flushDetailSave();
    });

    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', () => {
          if (readThemePref() === 'system') applyTheme();
        });
      }
    }

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installEvent = event;
      detectInstallRow();
    });

    window.addEventListener('appinstalled', () => {
      installEvent = null;
      const row = $('#installRow');
      if (row) row.hidden = true;
    });
  }

  /* ------------------------------ init ------------------------------ */

  async function init() {
    applyTheme();
    applyPhotoQualityUI();
    bindEvents();
    try {
      await loadEntries();
    } catch (err) {
      console.error(err);
      toast('Penyimpanan lokal tidak tersedia. Aplikasi tetap bisa dibuka.', 6000);
    }
    renderAll();
    lastTodayKey = getTodayKey();
    setInterval(checkDayRollover, 30000);
    registerSW();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
