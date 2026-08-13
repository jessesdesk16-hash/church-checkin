# Church Kids Check-In

Parents scan a QR code, fill in the form on their own phone, and get a pickup number.
Staff watch the dashboard and release each child against that number.

```bash
npm install
node server.js
```

- Check-in page — `http://localhost:3000`
- Staff dashboard — `http://localhost:3000/admin.html`

## Printing labels

The desk can print a label for every check-in on a 58 mm Bluetooth thermal printer.

**Setup — hold the church logo for a second** (on either page) to open the printer sheet.
Turn the printer on, tap **Connect printer**, pick it from the list (usually named something
like `MTP-II`, `BT-Printer` or `Printer001`), then tap **Test print**.

Once connected, every new check-in prints on its own — one short label per child:

```
      [ church logo ]
      CHILDREN CHURCH
------------------------------

           101
```

The same sheet changes the wording under the logo, switches the logo off, prints two labels per
child, sets paper width, and can **add the child's name, parent and allergies** under the number.
The 🖨️ button on each dashboard row reprints a label if one gets lost.

### Notes

- Browsers only allow Bluetooth on **https** or on **localhost**. The deployed
  `https://church-checkin.onrender.com` address works; opening the app by LAN address
  (`http://192.168.…`) does not — the sheet will say so.
- Needs Chrome or Edge, on Windows or Android. iPhones and iPads can't do Web Bluetooth.
- Printer settings are remembered per device, so each check-in station keeps its own.
- Only the station with the printer prints; a parent's own phone just shows the number.

## Data

Check-ins are held in memory and mirrored to `data.json`. When the last child is checked out
the list clears itself and pickup numbers start again at 101. **Reset All** on the dashboard
clears everything immediately.
