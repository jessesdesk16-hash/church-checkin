// ── Admin Dashboard Logic ───────────────────────────────────────
(function () {
  const tbody = document.getElementById('checkins-body');
  const emptyState = document.getElementById('empty-state');
  const statActive = document.getElementById('stat-active');
  const statOut = document.getElementById('stat-out');
  const statTotal = document.getElementById('stat-total');
  const checkoutInput = document.getElementById('checkout-input');
  const checkoutMsg = document.getElementById('checkout-msg');
  const toast = document.getElementById('toast');

  // ── Load QR code ────────────────────────────────────────────
  async function loadQR() {
    try {
      const res = await fetch('/api/qrcode');
      const data = await res.json();
      const img = document.getElementById('qr-img');
      const urlEl = document.getElementById('qr-url');
      img.src = data.qrcode;
      img.style.display = 'block';
      urlEl.innerHTML = '<span class="qr-url">' + data.url + '</span>';
      urlEl.style.display = 'block';
    } catch (e) {
      console.error('Failed to load QR code', e);
    }
  }
  loadQR();

  // ── Load check-ins ─────────────────────────────────────────
  async function loadCheckins() {
    try {
      const res = await fetch('/api/checkins/all');
      const allData = await res.json();

      const active = allData.filter(c => !c.checkedOut);
      const checkedOut = allData.filter(c => c.checkedOut);

      statActive.textContent = active.length;
      statOut.textContent = checkedOut.length;
      statTotal.textContent = allData.length;

      if (allData.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
      }

      emptyState.style.display = 'none';

      // Sort: active first, then by time descending
      const sorted = [...active.reverse(), ...checkedOut.reverse()];

      tbody.innerHTML = sorted.map(c => {
        const timeIn = new Date(c.checkedIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const status = c.checkedOut
          ? '<span class="tag" style="background:#fff3e0;color:#e67e22;">Picked Up</span>'
          : '<span class="tag tag-active">Active</span>';
        return `
          <tr style="${c.checkedOut ? 'opacity: 0.55;' : ''}">
            <td><span class="tag tag-pickup">${c.pickupNumber}</span></td>
            <td><strong>${escapeHtml(c.childName)}</strong></td>
            <td>${escapeHtml(c.parentName)}</td>
            <td>${c.phoneNumber ? escapeHtml(c.phoneNumber) : '—'}</td>
            <td>${c.childAge || '—'}</td>
            <td>${c.allergies ? escapeHtml(c.allergies) : '—'}</td>
            <td>${timeIn}</td>
            <td>${status}</td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      console.error('Failed to load check-ins', e);
    }
  }
  loadCheckins();

  // Auto-refresh every 5 seconds
  setInterval(loadCheckins, 5000);

  // ── Checkout ───────────────────────────────────────────────
  window.checkout = async function () {
    const num = checkoutInput.value.trim();
    if (!num) {
      checkoutMsg.textContent = 'Please enter a pickup number.';
      checkoutMsg.style.color = 'var(--danger)';
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
        checkoutMsg.innerHTML = `<strong>${escapeHtml(data.childName)}</strong> picked up by <strong>${escapeHtml(data.parentName)}</strong>`;
        checkoutMsg.style.color = 'var(--success)';
        showToast(`✅ ${data.childName} checked out!`, 'success');
        checkoutInput.value = '';
        loadCheckins();
      } else {
        checkoutMsg.textContent = data.error || 'Not found.';
        checkoutMsg.style.color = 'var(--danger)';
        showToast('❌ ' + (data.error || 'Not found'), 'error');
      }
    } catch (e) {
      checkoutMsg.textContent = 'Network error.';
      checkoutMsg.style.color = 'var(--danger)';
    }
  };

  // Enter key to checkout
  checkoutInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') window.checkout();
  });

  // ── Reset ──────────────────────────────────────────────────
  window.resetAll = async function () {
    if (!confirm('Are you sure you want to clear ALL check-in data? This cannot be undone.')) return;

    try {
      await fetch('/api/reset', { method: 'POST' });
      showToast('All data has been reset.', 'success');
      loadCheckins();
    } catch (e) {
      showToast('Failed to reset.', 'error');
    }
  };

  // ── Toast ──────────────────────────────────────────────────
  function showToast(message, type) {
    toast.textContent = message;
    toast.className = 'toast show toast-' + type;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
  }

  // ── Helpers ────────────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
