const express = require('express');
const path = require('path');
const QRCode = require('qrcode');
const fs = require('fs');
const os = require('os');

// Helper to get local Wi-Fi/network IP address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── In-Memory Data Store ──────────────────────────────────────────
let checkins = [];
let nextId = 1;

// Persist to file so data survives restarts
const DATA_FILE = path.join(__dirname, 'data.json');
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      checkins = raw.checkins || [];
      nextId = raw.nextId || 1;
    }
  } catch (e) {
    console.log('Starting with fresh data');
  }
}
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ checkins, nextId }, null, 2));
}
loadData();

// Generate a sequential pickup number from 101 to 199
let nextPickupNumber = 101;
function generatePickupNumber() {
  // Collect currently active pickup numbers
  const activeNumbers = new Set(
    checkins.filter(c => !c.checkedOut).map(c => c.pickupNumber)
  );

  // Find the next available number in 101–199
  for (let i = 0; i < 99; i++) {
    const num = String(nextPickupNumber);
    nextPickupNumber = nextPickupNumber >= 199 ? 101 : nextPickupNumber + 1;
    if (!activeNumbers.has(num)) return num;
  }
  return String(nextPickupNumber); // fallback
}

// ── API Routes ────────────────────────────────────────────────────

// Check in a child
app.post('/api/checkin', (req, res) => {
  const { parentName, phoneNumber, childName, childAge, allergies, notes } = req.body;

  if (!parentName || !childName) {
    return res.status(400).json({ error: 'Parent name and child name are required.' });
  }

  const pickupNumber = generatePickupNumber();
  const record = {
    id: nextId++,
    parentName: parentName.trim(),
    phoneNumber: phoneNumber || '',
    childName: childName.trim(),
    childAge: childAge || '',
    allergies: allergies || '',
    notes: notes || '',
    pickupNumber,
    checkedIn: new Date().toISOString(),
    checkedOut: false,
    checkedOutAt: null
  };

  checkins.push(record);
  saveData();

  res.json({
    success: true,
    pickupNumber: record.pickupNumber,
    childName: record.childName,
    parentName: record.parentName
  });
});

// Get all active check-ins (for admin)
app.get('/api/checkins', (req, res) => {
  const active = checkins.filter(c => !c.checkedOut);
  res.json(active);
});

// Get all check-ins including checked-out (history)
app.get('/api/checkins/all', (req, res) => {
  res.json(checkins);
});

// Check out a child by pickup number
app.post('/api/checkout', (req, res) => {
  const { pickupNumber } = req.body;

  if (!pickupNumber) {
    return res.status(400).json({ error: 'Pickup number is required.' });
  }

  const record = checkins.find(c => c.pickupNumber === pickupNumber && !c.checkedOut);
  if (!record) {
    return res.status(404).json({ error: 'No active check-in found with that pickup number.' });
  }

  record.checkedOut = true;
  record.checkedOutAt = new Date().toISOString();

  // If all kids are now checked out, reset everything
  const stillActive = checkins.filter(c => !c.checkedOut);
  if (stillActive.length === 0) {
    checkins = [];
    nextId = 1;
    nextPickupNumber = 101;
  }

  saveData();

  res.json({
    success: true,
    childName: record.childName,
    parentName: record.parentName
  });
});

// Generate QR code image
app.get('/api/qrcode', async (req, res) => {
  try {
    // Generate URL pointing to the live Render app, or fallback to local IP
    const checkinUrl = process.env.RENDER_EXTERNAL_URL || 'https://church-checkin.onrender.com';

    const qrDataUrl = await QRCode.toDataURL(checkinUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#1a1a2e',
        light: '#ffffff'
      }
    });
    res.json({ qrcode: qrDataUrl, url: checkinUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Reset all data (admin)
app.post('/api/reset', (req, res) => {
  checkins = [];
  nextId = 1;
  saveData();
  res.json({ success: true });
});

// ── Start Server ──────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log(`✅ Church Check-In System running at:`);
  console.log(`   - Local: http://localhost:${PORT}`);
  console.log(`   - Network: http://${localIp}:${PORT}`);
  console.log(`📋 Admin Dashboard: http://localhost:${PORT}/admin.html`);
});
