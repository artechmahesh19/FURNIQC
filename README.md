# FurniQc — starter build

A mobile-web QC inspection app for furniture (Panel / Sofa / Bed / Office Table),
built from the confirmed spec in `FurniQc_Requirements.md`. This is a working
front-end scaffold, ready to hand into **Google Antigravity** to finish and harden.

## What's implemented

- **Home** — Completed QC / Rejected Items / QC Dashboard (department %) cards
- **New QC Inspection** — Import PDF (auto-extracts Art No, Project Name, Dr No items) or manual create
- **Partial QC** — remove a Dr No from the current round if it's not ready yet (§4a)
- **Checklist** — the 8 parameters × OK / Rejected / N-A, with rejection reason + severity
- **Photos** — capture, per-photo delete (✕), per-photo recapture (↻, replaces in place)
- **Art-No-wise photo backup to Google Drive** — `js/googleDrive.js`, immediate upload on capture, folder structure:
  `FurniQc / {Art No} / {Dr No} / {QC Date}_{QC Type} / photo_001.jpg`, with client-side compression
- **QC Report → Google Sheet** — `js/googleSheets.js`, appends one row per Dr No matching your
  existing `QC_REPORT_.xlsx` columns exactly, plus auto-writes a **Dashboard** tab with
  department-wise Approved/Rejected counts and %
- **Reports tab** — Dashboard cards + QC log **grouped Art No wise**, each record with View / Change / Download PDF
- **PDF export** — primary: one combined PDF per Art No (all Dr No sections in one file);
  secondary: single Dr No PDF
- **Dark charcoal theme** matching your reference screens (§12), with distinct green/red/gray checklist colors

## Setup (Google Cloud side — do this before running)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create/select a project.
2. **APIs & Services → Library** → enable **Google Drive API** and **Google Sheets API**.
3. **APIs & Services → Credentials** → Create Credentials:
   - **OAuth 2.0 Client ID** (type: Web application). Add your Antigravity/dev URL and
     your production domain to "Authorized JavaScript origins."
   - **API key** (restrict it to Drive API + Sheets API for safety).
4. Create a blank Google Sheet to be the QC Report log. Copy its ID from the URL
   (`https://docs.google.com/spreadsheets/d/<ID>/edit`). Add a header row matching
   the columns in `js/googleSheets.js` (`buildRow`), and a second tab named `Dashboard`.
5. Paste the Client ID, API key, and Spreadsheet ID into **`js/config.js`**.

## Running locally

No build step — it's plain HTML/CSS/JS. Serve the folder with any static server
(needed because `fetch`/camera APIs require http(s), not `file://`):

```
npx serve .
```

## Handing this to Antigravity

Import this whole folder as the project root. Suggested next steps for Antigravity to pick up:

- Wire the **Photos tab** gallery (left as a stub in `index.html` / `js/app.js`) —
  browse by Art No → Dr No, pulling thumbnails from local state + Drive `webViewLink`.
- Add an **offline sync indicator** and background retry for `APP_STATE.syncQueue`
  (the queue array already exists in `js/state.js`, just needs a connectivity listener).
- Replace the `prompt()` calls for rejection reason/severity in `js/app.js` with proper
  dropdown UI (kept as plain prompts here to keep the scaffold small).
- Deferred-to-future-scope items from the spec (§10/§11), when you're ready: QR/barcode
  per Dr No, duplicate Job Card detection, "top rejection reasons" chart, Excel export.

## File map

```
furniqc-web/
├── index.html          screens + CDN script tags
├── css/style.css        charcoal theme, badges, checklist colors
├── js/config.js         Google credentials + app constants (fill these in)
├── js/state.js          data model + local/offline persistence
├── js/googleAuth.js     Google sign-in (Identity Services + gapi client)
├── js/googleDrive.js    Art-No-wise photo backup, immediate upload, compression
├── js/googleSheets.js   QC Report row append (xlsx-matching columns) + Dashboard tab
├── js/pdfImport.js      Job Card PDF → Art No / Project Name / Dr No items
├── js/pdfExport.js      Art-No-wise combined PDF (primary) + single-Dr-No PDF
└── js/app.js            screen rendering, navigation, event wiring
```
