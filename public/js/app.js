// ── Church Kids Check-In – Frontend Logic ──────────────────────
(function () {
  const form = document.getElementById('checkin-form');
  const checkinView = document.getElementById('checkin-view');
  const successView = document.getElementById('success-view');
  const checkoutView = document.getElementById('checkout-view');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnLoader = submitBtn.querySelector('.btn-loader');
  const checkinAnother = document.getElementById('checkin-another');

  // Nav buttons
  const navCheckin = document.getElementById('nav-checkin');
  const navCheckout = document.getElementById('nav-checkout');
  const backToCheckin = document.getElementById('back-to-checkin');

  // Checkout elements
  const checkoutSubmit = document.getElementById('checkout-submit');
  const checkoutInput = document.getElementById('checkout-number');
  const checkoutResult = document.getElementById('checkout-result');

  // ── Navigation ──────────────────────────────────────────────
  function showCheckinView() {
    checkinView.style.display = 'block';
    successView.style.display = 'none';
    checkoutView.style.display = 'none';
    navCheckin.classList.add('nav-active');
    navCheckout.classList.remove('nav-active');
  }

  function showCheckoutView() {
    checkinView.style.display = 'none';
    successView.style.display = 'none';
    checkoutView.style.display = 'block';
    navCheckin.classList.remove('nav-active');
    navCheckout.classList.add('nav-active');
    checkoutResult.textContent = '';
    checkoutInput.value = '';
  }

  navCheckin.addEventListener('click', showCheckinView);
  navCheckout.addEventListener('click', showCheckoutView);
  backToCheckin.addEventListener('click', showCheckinView);

  // ── Submit Check-In ─────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const parentName = document.getElementById('parentName').value.trim();
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    const childName = document.getElementById('childName').value.trim();
    const childAge = document.getElementById('childAge').value;
    const allergies = document.getElementById('allergies').value.trim();
    const notes = document.getElementById('notes').value.trim();

    if (!parentName || !childName || !phoneNumber) return;

    // Show loading
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-flex';

    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentName, phoneNumber, childName, childAge, allergies, notes })
      });

      const data = await res.json();

      if (data.success) {
        document.getElementById('success-childName').textContent = data.childName;
        document.getElementById('success-pickupNumber').textContent = data.pickupNumber;
        checkinView.style.display = 'none';
        successView.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        handleLabel(data.record);
      } else {
        alert(data.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      alert('Network error. Please check your connection and try again.');
    } finally {
      submitBtn.disabled = false;
      btnText.style.display = 'inline';
      btnLoader.style.display = 'none';
    }
  });

  // Check in another child
  checkinAnother.addEventListener('click', () => {
    form.reset();
    successView.style.display = 'none';
    checkinView.style.display = 'block';
    document.getElementById('parentName').focus();
  });

  // ── Label ───────────────────────────────────────────────────
  // Only useful on the desk device that holds the Bluetooth printer;
  // on a parent's own phone there is no printer, so nothing happens.
  const printBtn = document.getElementById('print-label');
  let lastRecord = null;

  function canPrint() {
    return LabelPrinter.getSettings().mode === 'system' || LabelPrinter.isConnected();
  }

  async function handleLabel(record) {
    lastRecord = record;
    printBtn.style.display = canPrint() ? 'block' : 'none';
    printBtn.textContent = '🖨️ Print Label';

    if (!record || !canPrint() || !LabelPrinter.getSettings().auto) return;
    try {
      await LabelPrinter.print([record]);
    } catch (e) {
      printBtn.textContent = '🖨️ Print again';
    }
  }

  printBtn.addEventListener('click', async () => {
    if (!lastRecord) return;
    printBtn.disabled = true;
    try {
      await LabelPrinter.print([lastRecord]);
      printBtn.textContent = '🖨️ Printed — print again';
    } catch (e) {
      printBtn.textContent = '🖨️ Failed — try again';
    } finally {
      printBtn.disabled = false;
    }
  });

  // ── Checkout ────────────────────────────────────────────────
  checkoutSubmit.addEventListener('click', async () => {
    const num = checkoutInput.value.trim();
    if (!num) {
      checkoutResult.textContent = 'Please enter your pickup number.';
      checkoutResult.style.color = '#e74c5e';
      return;
    }

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickupNumber: num })
      });
      const data = await res.json();

      if (data.success) {
        checkoutResult.innerHTML = '✅ <strong>' + escapeHtml(data.childName) + '</strong> has been checked out!';
        checkoutResult.style.color = '#22c67a';
        checkoutInput.value = '';
      } else {
        checkoutResult.textContent = '❌ ' + (data.error || 'Not found.');
        checkoutResult.style.color = '#e74c5e';
      }
    } catch (e) {
      checkoutResult.textContent = 'Network error. Please try again.';
      checkoutResult.style.color = '#e74c5e';
    }
  });

  checkoutInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkoutSubmit.click();
  });

  // ── Helpers ─────────────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
