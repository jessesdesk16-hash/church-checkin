// ── Printer Settings Sheet ──────────────────────────────────────
// Hidden behind a long-press on the church logo, so parents never see
// it but staff can reach the Bluetooth printer in a second.
(function () {
  const HOLD_MS = 600;

  const SHEET = `
    <div class="ps-backdrop" id="ps-backdrop"></div>
    <div class="ps-sheet" id="ps-sheet" role="dialog" aria-label="Printer settings">
      <div class="ps-grip"></div>
      <div class="ps-head">
        <h3>🖨️ Printer</h3>
        <button class="ps-close" id="ps-close" aria-label="Close">✕</button>
      </div>

      <div class="ps-status" id="ps-status">
        <span class="ps-dot" id="ps-dot"></span>
        <span id="ps-status-text">Not connected</span>
      </div>

      <div class="ps-actions">
        <button class="ps-btn ps-btn-primary" id="ps-connect">Connect printer</button>
        <button class="ps-btn" id="ps-test">Test print</button>
        <button class="ps-btn ps-btn-quiet" id="ps-disconnect" style="display:none;">Disconnect</button>
      </div>

      <p class="ps-msg" id="ps-msg"></p>

      <div class="ps-section">
        <label class="ps-switch" for="ps-auto">
          <input type="checkbox" id="ps-auto">
          <span>Print automatically on every check-in</span>
        </label>
        <label class="ps-switch" for="ps-logo">
          <input type="checkbox" id="ps-logo">
          <span>Print the church logo on the label</span>
        </label>
        <label class="ps-switch" for="ps-details">
          <input type="checkbox" id="ps-details">
          <span>Add the child's name, parent and allergies</span>
        </label>
      </div>

      <div class="ps-section">
        <label class="ps-field">
          <span>Labels per child</span>
          <select id="ps-copies">
            <option value="1">1 label</option>
            <option value="2">2 labels (one for the parent)</option>
          </select>
        </label>
        <label class="ps-field">
          <span>Paper width</span>
          <select id="ps-paper">
            <option value="58">58 mm (standard)</option>
            <option value="80">80 mm</option>
          </select>
        </label>
        <label class="ps-field">
          <span>Wording under the logo</span>
          <input type="text" id="ps-subtitle" placeholder="Children Church">
        </label>
      </div>

      <details class="ps-advanced">
        <summary>Use a normal printer instead</summary>
        <label class="ps-switch" for="ps-system">
          <input type="checkbox" id="ps-system">
          <span>Print through the computer's print dialog</span>
        </label>
        <label class="ps-field" id="ps-size-field">
          <span>Label size</span>
          <select id="ps-size">
            <option value="2.25x4">Label roll — 2.25 × 4 in</option>
            <option value="2x3">Label roll — 2 × 3 in</option>
            <option value="4x6">Label roll — 4 × 6 in</option>
            <option value="letter">Plain paper — Letter</option>
            <option value="a4">Plain paper — A4</option>
          </select>
        </label>
      </details>

      <p class="ps-hint">Turn the printer on and hold the logo any time to get back here.</p>
    </div>
  `;

  let root = null;
  let el = {};

  function build() {
    root = document.createElement('div');
    root.className = 'ps-root';
    root.innerHTML = SHEET;
    document.body.appendChild(root);

    [
      'backdrop', 'sheet', 'close', 'status', 'dot', 'status-text', 'connect', 'test',
      'disconnect', 'msg', 'auto', 'logo', 'details', 'copies', 'paper', 'subtitle', 'system',
      'size', 'size-field'
    ].forEach(id => { el[id] = document.getElementById('ps-' + id); });

    el.backdrop.addEventListener('click', close);
    el.close.addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    el.connect.addEventListener('click', doConnect);
    el.disconnect.addEventListener('click', () => {
      LabelPrinter.disconnect();
      say('Printer disconnected.', '');
    });
    el.test.addEventListener('click', doTest);

    el.auto.addEventListener('change', () => LabelPrinter.saveSettings({ auto: el.auto.checked }));
    el.logo.addEventListener('change', () => LabelPrinter.saveSettings({ logo: el.logo.checked }));
    el.details.addEventListener('change', () => LabelPrinter.saveSettings({ details: el.details.checked }));
    el.copies.addEventListener('change', () => LabelPrinter.saveSettings({ copies: +el.copies.value }));
    el.paper.addEventListener('change', () => LabelPrinter.saveSettings({ paper: el.paper.value }));
    el.size.addEventListener('change', () => LabelPrinter.saveSettings({ size: el.size.value }));
    el.subtitle.addEventListener('change', () => {
      LabelPrinter.saveSettings({ subtitle: el.subtitle.value.trim() || 'Children Church' });
    });
    el.system.addEventListener('change', () => {
      LabelPrinter.saveSettings({ mode: el.system.checked ? 'system' : 'bluetooth' });
      render();
    });

    LabelPrinter.onChange(render);
  }

  function render() {
    const s = LabelPrinter.status();
    const cfg = s.settings;
    const bluetooth = cfg.mode !== 'system';

    el.auto.checked = cfg.auto;
    el.logo.checked = cfg.logo;
    el.details.checked = cfg.details;
    el.copies.value = String(cfg.copies);
    el.paper.value = cfg.paper;
    el.subtitle.value = cfg.subtitle;
    el.system.checked = !bluetooth;
    el.size.value = cfg.size;

    el['size-field'].style.display = bluetooth ? 'none' : '';
    el.connect.style.display = bluetooth ? '' : 'none';
    el.disconnect.style.display = (bluetooth && s.connected) ? '' : 'none';
    el.paper.parentElement.style.display = bluetooth ? '' : 'none';

    if (!bluetooth) {
      el.status.className = 'ps-status ps-ready';
      el['status-text'].textContent = 'Using the computer\'s print dialog';
    } else if (s.connected) {
      el.status.className = 'ps-status ps-ready';
      el['status-text'].textContent = 'Connected — ' + s.deviceName;
      el.connect.textContent = 'Change printer';
    } else if (!s.secure) {
      el.status.className = 'ps-status ps-off';
      el['status-text'].textContent = 'Open the app over https to use Bluetooth';
    } else if (!s.supported) {
      el.status.className = 'ps-status ps-off';
      el['status-text'].textContent = 'Bluetooth needs Chrome or Edge';
    } else {
      el.status.className = 'ps-status ps-off';
      el['status-text'].textContent = 'Not connected';
      el.connect.textContent = 'Connect printer';
    }
  }

  function say(text, kind) {
    el.msg.textContent = text;
    el.msg.className = 'ps-msg' + (kind ? ' ps-msg-' + kind : '');
  }

  async function doConnect() {
    say('Choose your printer from the list…', '');
    el.connect.disabled = true;
    try {
      const name = await LabelPrinter.connect();
      say('Connected to ' + name + '. Try a test print.', 'ok');
    } catch (err) {
      // The picker throws NotFoundError when the user simply closes it.
      say(err && err.name === 'NotFoundError' && /cancel/i.test(err.message || '')
        ? 'No printer chosen.'
        : (err.message || 'Could not connect.'), 'bad');
    } finally {
      el.connect.disabled = false;
      render();
    }
  }

  async function doTest() {
    el.test.disabled = true;
    try {
      const result = await LabelPrinter.printTest();
      say(result === 'printed' ? 'Test label sent.' : 'Connect the printer first.',
        result === 'printed' ? 'ok' : 'bad');
    } catch (err) {
      say(err.message || 'Printing failed. Check the printer is on.', 'bad');
    } finally {
      el.test.disabled = false;
    }
  }

  function open() {
    if (!root) build();
    render();
    say('', '');
    root.classList.add('ps-open');
    if (navigator.vibrate) navigator.vibrate(30);
  }

  function close() {
    if (root) root.classList.remove('ps-open');
  }

  // ── Long-press on the logo ────────────────────────────────────
  function bindLogo(logo) {
    let timer = null;
    const start = () => {
      clearTimeout(timer);
      timer = setTimeout(open, HOLD_MS);
    };
    const cancel = () => clearTimeout(timer);

    logo.addEventListener('touchstart', start, { passive: true });
    logo.addEventListener('touchend', cancel);
    logo.addEventListener('touchmove', cancel, { passive: true });
    logo.addEventListener('touchcancel', cancel);
    logo.addEventListener('mousedown', start);
    logo.addEventListener('mouseup', cancel);
    logo.addEventListener('mouseleave', cancel);
    // Stop the browser's own long-press menu on the image.
    logo.addEventListener('contextmenu', e => e.preventDefault());
    logo.classList.add('ps-holdable');
  }

  function init() {
    document.querySelectorAll('.church-logo, [data-printer-menu]').forEach(bindLogo);
    // Silently pick the printer back up if this browser already paired with it.
    if (LabelPrinter.getSettings().mode !== 'system') LabelPrinter.reconnect();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PrinterMenu = { open, close };
})();
