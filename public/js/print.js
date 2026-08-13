// ── Label Printing ──────────────────────────────────────────────
// Talks to a 58 mm Bluetooth thermal printer over Web Bluetooth using
// ESC/POS, and falls back to the browser's print dialog for any other
// printer. Settings live behind a long-press on the church logo.
window.LabelPrinter = (function () {
  const SETTINGS_KEY = 'wol-print-settings';
  const PRINTED_KEY = 'wol-printed-labels';

  const DEFAULTS = {
    mode: 'bluetooth',   // 'bluetooth' | 'system'
    paper: '58',         // '58' | '80'  (mm — thermal only)
    size: '2.25x4',      // system-dialog label size
    subtitle: 'Children Church',
    auto: true,
    logo: true,
    details: false,      // name / parent / allergy under the number
    copies: 1
  };

  // Dots across the paper for the logo. 58 mm printers are 384 dots
  // wide; half that keeps the label short and quick to send over BLE.
  const LOGO_WIDTH = 192;

  // Characters per line at the default font, by paper width.
  const COLUMNS = { '58': 32, '80': 48 };

  // Service UUIDs used by the common 58 mm Bluetooth printers. The
  // picker shows every device, so this list only has to cover which
  // services we are allowed to talk to afterwards.
  const PRINTER_SERVICES = [
    0x18f0,       // most generic thermal printers (Goojprt, MTP, etc.)
    0xffe0,       // HM-10 style serial bridge
    0xff00, 0xfff0, 0xffb0, 0xff80,
    0xae30,
    '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC / Microchip transparent UART
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
    '0000fee7-0000-1000-8000-00805f9b34fb'
  ];

  const PAGE_RULES = {
    '2.25x4': '@page { size: 2.25in 4in; margin: 0.12in; }',
    '2x3': '@page { size: 2in 3in; margin: 0.1in; }',
    '4x6': '@page { size: 4in 6in; margin: 0.2in; }',
    'letter': '@page { size: letter; margin: 0.5in; }',
    'a4': '@page { size: A4; margin: 12mm; }'
  };

  let device = null;
  let characteristic = null;
  const listeners = [];

  // ── Settings (per check-in station) ───────────────────────────
  function getSettings() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch (e) {
      saved = {};
    }
    return Object.assign({}, DEFAULTS, saved);
  }

  function saveSettings(patch) {
    const next = Object.assign(getSettings(), patch);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    emit();
    return next;
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  function emit() {
    listeners.forEach(fn => {
      try { fn(status()); } catch (e) { /* a broken listener shouldn't stop printing */ }
    });
  }

  // ── Printed history ───────────────────────────────────────────
  // The server reuses ids after a full reset, so a record is keyed by
  // id + check-in time.
  function keyOf(rec) {
    return rec.id + '|' + rec.checkedIn;
  }

  function printedKeys() {
    try {
      return JSON.parse(localStorage.getItem(PRINTED_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function markPrinted(records) {
    const keys = printedKeys();
    records.forEach(r => {
      const k = keyOf(r);
      if (keys.indexOf(k) === -1) keys.push(k);
    });
    localStorage.setItem(PRINTED_KEY, JSON.stringify(keys.slice(-400)));
  }

  function unprinted(records) {
    const keys = printedKeys();
    return records.filter(r => keys.indexOf(keyOf(r)) === -1);
  }

  // ── Bluetooth ─────────────────────────────────────────────────
  function isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  function isConnected() {
    return !!(characteristic && device && device.gatt && device.gatt.connected);
  }

  function status() {
    return {
      supported: isSupported(),
      // Browsers only expose Bluetooth on https or localhost, so a
      // tablet opening the app by LAN address can't reach the printer.
      secure: typeof window !== 'undefined' && window.isSecureContext,
      connected: isConnected(),
      deviceName: device ? (device.name || 'Bluetooth printer') : null,
      settings: getSettings()
    };
  }

  // Finds the first characteristic we're allowed to write bytes to.
  async function findWriteCharacteristic(server) {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      let chars = [];
      try {
        chars = await service.getCharacteristics();
      } catch (e) {
        continue;
      }
      for (const c of chars) {
        if (c.properties.write || c.properties.writeWithoutResponse) return c;
      }
    }
    return null;
  }

  async function connect() {
    if (!isSupported()) {
      throw new Error(window.isSecureContext
        ? 'This browser can\'t use Bluetooth. Use Chrome or Edge on Windows or Android.'
        : 'Bluetooth only works over https or on the computer running the server. Open the app at its https address and try again.');
    }

    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES
    });

    device.addEventListener('gattserverdisconnected', () => {
      characteristic = null;
      emit();
    });

    const server = await device.gatt.connect();
    characteristic = await findWriteCharacteristic(server);

    if (!characteristic) {
      try { device.gatt.disconnect(); } catch (e) { /* already gone */ }
      device = null;
      throw new Error('That device didn\'t offer a printer connection. Pick the printer from the list (often named MTP, BT-Printer or Printer001).');
    }

    emit();
    return device.name || 'Bluetooth printer';
  }

  // Re-attach to a printer this browser already has permission for,
  // so the desk doesn't have to pair again every morning.
  async function reconnect() {
    if (!isSupported() || !navigator.bluetooth.getDevices) return false;
    try {
      const known = await navigator.bluetooth.getDevices();
      for (const d of known) {
        try {
          const server = await d.gatt.connect();
          const c = await findWriteCharacteristic(server);
          if (c) {
            device = d;
            characteristic = c;
            d.addEventListener('gattserverdisconnected', () => {
              characteristic = null;
              emit();
            });
            emit();
            return true;
          }
        } catch (e) { /* printer is off or out of range */ }
      }
    } catch (e) { /* permission backend unavailable */ }
    return false;
  }

  function disconnect() {
    try {
      if (device && device.gatt && device.gatt.connected) device.gatt.disconnect();
    } catch (e) { /* already gone */ }
    device = null;
    characteristic = null;
    emit();
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Two jobs writing at once would interleave their bytes on the same
  // characteristic, so every receipt goes out in turn.
  let queue = Promise.resolve();

  function enqueue(job) {
    const run = queue.then(job, job);
    queue = run.catch(() => {});
    return run;
  }

  // BLE writes are small, so the receipt goes out in chunks.
  async function writeBytes(bytes) {
    const CHUNK = 100;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const part = new Uint8Array(bytes.slice(i, i + CHUNK));
      if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
        await characteristic.writeValueWithoutResponse(part);
      } else {
        await characteristic.writeValue(part);
      }
      await sleep(20);
    }
  }

  // ── ESC/POS receipt builder ───────────────────────────────────
  // Thermal printers only speak a single-byte character set, so
  // accents are folded down and anything else is dropped.
  function ascii(str) {
    return String(str == null ? '' : str)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\x20-\x7E]/g, '');
  }

  function wrap(text, columns) {
    const words = ascii(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(w => {
      while (w.length > columns) {           // a single very long word
        if (line) { lines.push(line); line = ''; }
        lines.push(w.slice(0, columns));
        w = w.slice(columns);
      }
      if (!line) line = w;
      else if ((line + ' ' + w).length <= columns) line += ' ' + w;
      else { lines.push(line); line = w; }
    });
    if (line) lines.push(line);
    return lines;
  }

  // ── Logo bitmap ───────────────────────────────────────────────
  // The printer only understands dots, so the logo is scaled down and
  // turned into 1-bit rows once, then reused for every label.
  let logoPromise = null;

  function rasterize(img) {
    const width = LOGO_WIDTH;                       // already a multiple of 8
    const height = Math.round(img.height * width / img.width);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';                         // the logo has a transparent background
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const pixels = ctx.getImageData(0, 0, width, height).data;
    const widthBytes = width / 8;
    const data = new Array(widthBytes * height).fill(0);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const lum = pixels[i + 3] < 128
          ? 255
          : 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
        if (lum < 180) data[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }

    // Drop the blank rows around the emblem so the label stays short.
    const blank = row => data.slice(row * widthBytes, (row + 1) * widthBytes).every(b => b === 0);
    let top = 0;
    let bottom = height - 1;
    while (top < bottom && blank(top)) top++;
    while (bottom > top && blank(bottom)) bottom--;

    return {
      data: data.slice(top * widthBytes, (bottom + 1) * widthBytes),
      widthBytes,
      height: bottom - top + 1
    };
  }

  function loadLogo() {
    if (logoPromise) return logoPromise;
    logoPromise = new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try { resolve(rasterize(img)); } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = 'img/logo.png';
    });
    return logoPromise;
  }

  function Receipt(columns) {
    const out = [];
    const push = (...b) => out.push(...b);
    const api = {
      init() { push(0x1b, 0x40); return api; },                       // ESC @
      align(n) { push(0x1b, 0x61, n); return api; },                  // 0 left 1 centre 2 right
      bold(on) { push(0x1b, 0x45, on ? 1 : 0); return api; },         // ESC E
      size(w, h) { push(0x1d, 0x21, ((w - 1) << 4) | (h - 1)); return api; }, // GS !
      text(str) {
        wrap(str, columns).forEach((l, i) => {
          if (i) push(0x0a);
          for (const ch of l) push(ch.charCodeAt(0));
        });
        return api;
      },
      line(str) { api.text(str || ''); push(0x0a); return api; },
      big(str, scale) {
        api.size(scale, scale);
        // Wrapping has to account for the wider glyphs.
        wrap(str, Math.max(1, Math.floor(columns / scale))).forEach(l => {
          for (const ch of l) push(ch.charCodeAt(0));
          push(0x0a);
        });
        api.size(1, 1);
        return api;
      },
      rule() { api.line('-'.repeat(columns)); return api; },
      raster(img) {                                                   // GS v 0
        if (!img) return api;
        push(0x1d, 0x76, 0x30, 0x00,
          img.widthBytes & 0xff, (img.widthBytes >> 8) & 0xff,
          img.height & 0xff, (img.height >> 8) & 0xff);
        img.data.forEach(b => push(b));
        return api;
      },
      feed(n) { for (let i = 0; i < (n || 1); i++) push(0x0a); return api; },
      bytes() { return out; }
    };
    return api.init();
  }

  function timeOf(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function dateOf(iso) {
    return new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // "None", "n/a" and friends aren't worth a warning on the label.
  function hasAllergy(value) {
    return value && !/^(none|no|n\/?a|nil|-)$/i.test(String(value).trim());
  }

  // One short label per child: logo, wording, a line, and the pickup
  // number as large as the paper allows.
  function thermalLabel(rec, s, r, logo) {
    r.align(1);
    if (logo) r.raster(logo);
    r.bold(true).line(s.subtitle.toUpperCase()).bold(false);
    r.rule();
    r.feed(1);
    r.big(rec.pickupNumber, 6);

    if (s.details) {
      r.feed(1).bold(true).big(rec.childName, 2).bold(false);
      r.align(0);
      r.line('Parent: ' + rec.parentName + (rec.childAge ? ' (age ' + rec.childAge + ')' : ''));
      if (rec.phoneNumber) r.line('Phone: ' + rec.phoneNumber);
      r.line('In: ' + timeOf(rec.checkedIn) + ' ' + dateOf(rec.checkedIn));
      if (hasAllergy(rec.allergies)) {
        r.bold(true).line('** ALLERGY: ' + rec.allergies + ' **').bold(false);
      }
      if (rec.notes) r.line('Note: ' + rec.notes);
    }

    r.feed(3);
  }

  async function printThermal(records, s) {
    const logo = s.logo ? await loadLogo() : null;
    const r = Receipt(COLUMNS[s.paper] || 32);
    const copies = Math.max(1, Math.min(2, +s.copies || 1));

    records.forEach(rec => {
      for (let i = 0; i < copies; i++) thermalLabel(rec, s, r, logo);
    });
    await writeBytes(r.bytes());
  }

  // ── System print dialog (label / paper printers) ──────────────
  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  function htmlLabel(rec, s) {
    return '<div class="print-label">' +
      '<div class="pl-head">' +
      (s.logo ? '<img class="pl-logo" src="img/logo.png" alt="">' : '') +
      '<span>' + esc(s.subtitle) + '</span></div>' +
      '<div class="pl-number">' + esc(rec.pickupNumber) + '</div>' +
      (s.details
        ? '<div class="pl-name">' + esc(rec.childName) + '</div>' +
          '<div class="pl-line">Parent: <strong>' + esc(rec.parentName) + '</strong>' +
          (rec.childAge ? ' &middot; Age ' + esc(rec.childAge) : '') + '</div>' +
          (rec.phoneNumber ? '<div class="pl-line">' + esc(rec.phoneNumber) + '</div>' : '') +
          (hasAllergy(rec.allergies) ? '<div class="pl-alert">ALLERGY: ' + esc(rec.allergies) + '</div>' : '') +
          (rec.notes ? '<div class="pl-line pl-note">' + esc(rec.notes) + '</div>' : '') +
          '<div class="pl-foot">Checked in ' + timeOf(rec.checkedIn) + ' &middot; ' + dateOf(rec.checkedIn) + '</div>'
        : '') +
      '</div>';
  }

  function printSystem(records, s) {
    const root = document.getElementById('print-root');
    const rule = document.getElementById('page-rule');
    if (!root) return;

    const parts = [];
    const copies = Math.max(1, Math.min(2, +s.copies || 1));
    records.forEach(rec => {
      for (let i = 0; i < copies; i++) parts.push(htmlLabel(rec, s));
    });

    rule.textContent = PAGE_RULES[s.size] || PAGE_RULES['2.25x4'];
    root.className = (s.size === 'letter' || s.size === 'a4') ? 'pr-sheet' : 'pr-roll';
    root.innerHTML = parts.join('');
    window.print();
  }

  // ── Entry points ──────────────────────────────────────────────
  // Returns 'printed', 'no-printer', or throws on a printer error.
  async function print(records) {
    if (!records || !records.length) return 'no-printer';
    const s = getSettings();

    if (s.mode === 'system') {
      markPrinted(records);
      printSystem(records, s);
      return 'printed';
    }

    if (!isConnected()) return 'no-printer';

    // Claimed before the write starts: a roll of paper takes a moment
    // and the dashboard polls every 5 seconds, so unclaimed records
    // would queue up a second copy of the same label.
    markPrinted(records);
    await enqueue(() => printThermal(records, s));
    return 'printed';
  }

  function sample() {
    return {
      id: 0,
      childName: 'Emma Smith',
      childAge: '5',
      parentName: 'John Smith',
      phoneNumber: '072 123 4567',
      allergies: 'Peanuts',
      notes: '',
      pickupNumber: '101',
      checkedIn: new Date().toISOString()
    };
  }

  async function printTest() {
    const s = getSettings();
    if (s.mode === 'system') {
      printSystem([sample()], s);
      return 'printed';
    }
    if (!isConnected()) return 'no-printer';
    await enqueue(() => printThermal([sample()], s));
    return 'printed';
  }

  return {
    getSettings, saveSettings, onChange, status,
    isSupported, isConnected, connect, reconnect, disconnect,
    markPrinted, unprinted, print, printTest,
    _sample: sample
  };
})();
