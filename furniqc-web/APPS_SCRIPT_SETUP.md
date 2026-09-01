# FurniQc — Google Apps Script Setup Guide

## What Does the Apps Script Do?

The Google Apps Script (`FurniQc_AppScript.gs`) acts as a **server-side backend** for the FurniQc app. It handles:

| Feature | What it does |
|---|---|
| 📊 **QC Sheet Export** | Writes one row per Dr No to your Google Sheet (24 columns, exact Excel format) |
| 📁 **Drive Photo Backup** | Saves photos to Drive folder: `FurniQc / {Art No} / {Date} / {Fresh QC or Re-QC} / {Dr No}` |
| 📈 **Dashboard Tab** | Auto-computes Department-wise Approved/Rejected/Fresh QC/Re-QC stats |
| 🎨 **Auto Formatting** | Green = Approved, Red = Rejected, Blue = Fresh QC, Yellow = Re-QC |

---

## Step 1: Create Your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → **New Spreadsheet**
2. Name it: `FurniQc QC Report`
3. Copy the **Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  ← THIS PART →  /edit
   ```

---

## Step 2: Create the Apps Script Project

1. Go to [script.google.com](https://script.google.com)
2. Click **New Project**
3. Name the project: `FurniQc Backend`
4. Delete all existing code in the editor
5. Copy the **entire contents** of `FurniQc_AppScript.gs` and paste it
6. Find this line at the top and paste your Sheet ID:
   ```javascript
   var SHEET_ID = "YOUR_SPREADSHEET_ID_HERE";
   ```

---

## Step 3: Test the Script

1. In the Apps Script editor, select **testScript** from the function dropdown
2. Click ▶ **Run**
3. Authorize the script when prompted (allow Sheets + Drive access)
4. Check your Google Sheet — you should see:
   - A formatted header row in blue
   - One test data row

---

## Step 4: Deploy as Web App

1. Click **Deploy** → **New Deployment**
2. Click ⚙ gear icon → Select **Web App**
3. Set:
   - **Description**: `FurniQc Backend v1`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` (or `Anyone with Google Account`)
4. Click **Deploy**
5. **Copy the Web App URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxx/exec
   ```

---

## Step 5: Connect to FurniQc Web App

Open `furniqc-web/js/config.js` and paste your URL:

```javascript
APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxxxxxxxx/exec",
```

---

## Sheet Column Layout (24 Columns — Matches Excel)

| Col | Header | Example |
|-----|--------|---------|
| A | Sr No | 1 |
| B | Date | 2026-08-10 |
| C | Month | August |
| D | Client | Oberoi Luxury Living |
| E | Project Name | The Bougain Villa |
| F | Po No | PO-2026-8812 |
| G | Department | Panel |
| H | Job Card No | ART-90 |
| I | Dr No | DR-405 |
| J | Product Name | Tall Unit Base Carcass |
| K | Qty | 1 |
| L | Size | 1015 x 440 x 1095 |
| M | Outer/Polish/veneer/Pu/Metal | OK |
| N | Edgeband | REJECTED |
| O | GVT/Leg | OK |
| P | Glass/Lock | OK |
| Q | Design As Per Drawing | OK |
| R | Handle/knob/Profile | OK |
| S | Fabric | N/A |
| T | Metal | OK |
| U | Remark | Edgeband: Edgeband Peeling (Major) |
| V | QC APPROVED OR REJECT | **QC REJECTED** |
| W | Responsible Department | Panel |
| X | QC Round | Fresh QC / Re-QC |

---

## Google Drive Folder Structure

After photos are uploaded, your Drive will look like:

```
📁 FurniQc/
  📁 ART-90/
    📁 2026-08-10/
      📁 Fresh QC/
        📁 DR-405/
          🖼️ photo_001.jpg
          🖼️ photo_002.jpg
        📁 DR-406/
          🖼️ photo_001.jpg
      📁 Re-QC/
        📁 DR-405/
          🖼️ photo_001.jpg   ← separate Re-QC photos!
  📁 ART-102/
    📁 2026-08-11/
      📁 Fresh QC/
        📁 DR-101/
          🖼️ photo_001.jpg
```

---

## Dashboard Tab (Auto-Computed)

The `Dashboard` sheet is automatically updated every time a QC report is saved:

| Department | Approved | Rejected | Total | % Approved | % Rejected | Fresh QC | Re-QC |
|---|---|---|---|---|---|---|---|
| Panel | 12 | 3 | 15 | 80% | 20% | 10 | 5 |
| Sofa | 8 | 2 | 10 | 80% | 20% | 6 | 4 |
| Bed | 5 | 1 | 6 | 83% | 17% | 5 | 1 |
| Office Table | 4 | 0 | 4 | 100% | 0% | 4 | 0 |

---

## Re-Deploying After Changes

If you edit the Apps Script code later:
1. Click **Deploy** → **Manage Deployments**
2. Click the ✏️ pencil icon
3. Change version to **New version**
4. Click **Deploy** — the URL stays the same!
