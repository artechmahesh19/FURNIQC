// ============================================================
// FurniQc — Google Apps Script Backend
// Deploy as: Extensions > Apps Script > Deploy > Web App
//   - Execute as: Me
//   - Who has access: Anyone
//
// Web App URL is configured in furniqc-web/js/config.js:
//   APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxCbBmvybXwwD-LiULrb8yxuY-iKjcetv1BGTxA3n-jWqnnnNqaz847xQ-oxsKVH2nV-g/exec"
//
// Google Drive Folder Hierarchy:
//   FurniQc / {Month} / {Fresh QC | Re-QC} / {Art No}_{QC Date} / {Dr No} / photo_001.jpg
//
// Google Sheet Columns (28 Columns - Full 8 QC Parameters + 4 Department Tags):
//   A: Sr No | B: Date | C: Month | D: Client | E: Project Name | F: Po No
//   G: Department | H: Job Card No | I: Dr No | J: Product Name | K: Qty | L: Size
//   M: Outer/Polish/veneer/Pu/Metal | N: Edgeband | O: GVT/Leg | P: Glass/Lock
//   Q: Design As Per Drawing | R: Handle/knob/Profile | S: Fabric | T: Metal
//   U: Panel | V: Polish | W: Solid | X: Upholstery
//   Y: Remark | Z: QC APPROVED OR REJECT | AA: Responsible Department | AB: QC Round
// ============================================================

// ─── CONFIGURATION ───────────────────────────────────────────
var SHEET_ID = "1tYR0aFScB0bg--vmtQIhPlZTddNX8a1CUBWf7gsGZbU";

var QC_LOG_SHEET    = "Sheet1";
var DASHBOARD_SHEET = "Dashboard";
var DRIVE_ROOT_FOLDER = "FurniQc";

// 8 QC Checklist Parameters
var QC_PARAMETERS = [
  "Outer/Polish/veneer/Pu/Metal",
  "Edgeband",
  "GVT/Leg",
  "Glass/Lock",
  "Design As Per Drawing",
  "Handle/knob/Profile",
  "Fabric",
  "Metal"
];

// 4 Core QC Departments
var DEPARTMENTS = ["Panel", "Polish", "Solid", "Upholstery"];

var MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function getSpreadsheet() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active && active.getId()) return active;
  } catch (e) {}
  return SpreadsheetApp.openById(SHEET_ID);
}
// ─────────────────────────────────────────────────────────────


// ============================================================
// doPost — Called by FurniQc web app
// ============================================================
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    if (action === "saveInspection") {
      return saveInspection(data);
    }

    if (action === "uploadPhoto") {
      return uploadPhoto(data);
    }

    return jsonResponse({ success: false, error: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}


// ============================================================
// doGet — Returns QC data as JSON
// ============================================================
function doGet(e) {
  try {
    var action = (e.parameter && e.parameter.action) || "getDashboard";

    if (action === "getLog") {
      return getQcLog(e.parameter);
    }

    if (action === "getDashboard") {
      return getDashboard();
    }

    return getDashboard();
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}


// ============================================================
// saveInspection — Appends rows to QC Log sheet
// ============================================================
function saveInspection(data) {
  var inspection = data.inspection;
  var project    = data.project;

  if (!inspection || !project) {
    return jsonResponse({ success: false, error: "Missing inspection or project data" });
  }

  var ss    = getSpreadsheet();
  var sheet = getOrCreateSheet(ss, QC_LOG_SHEET);

  ensureHeaderRow(sheet);
  migrateToV2(sheet);

  var lastRow = sheet.getLastRow();
  var srNo    = lastRow;

  var lineItems = inspection.lineItems || {};
  var rowsAdded = 0;

  Object.keys(lineItems).forEach(function(drNo) {
    var item = lineItems[drNo];
    srNo++;
    var row = buildQcRow(srNo, inspection, project, item);
    sheet.appendRow(row);
    rowsAdded++;
  });

  formatNewRows(sheet, lastRow + 1, lastRow + rowsAdded);
  updateDashboard(ss);

  return jsonResponse({
    success: true,
    rowsAdded: rowsAdded,
    message: rowsAdded + " rows written to Google Sheet"
  });
}


// ============================================================
// uploadPhoto — Saves photo to Google Drive
// Hierarchy: FurniQc / {Month} / {Fresh QC | Re-QC} / {Art No}_{QC Date} / {Dr No} / photo.jpg
// ============================================================
function uploadPhoto(data) {
  var artNo    = data.artNo    || "ART-UNKNOWN";
  var drNo     = data.drNo     || "DR-UNKNOWN";
  var qcDate   = data.qcDate   || getTodayDate();
  var qcType   = data.qcType   || "Fresh QC";
  var fileName = data.fileName || ("photo_" + Date.now() + ".jpg");
  var b64      = data.base64Data;
  var mimeType = data.mimeType || "image/jpeg";

  if (!b64) {
    return jsonResponse({ success: false, error: "No base64Data provided" });
  }

  var monthName     = getMonthName(qcDate);
  var artDateName   = artNo + "_" + qcDate;

  var rootFolder    = findOrCreateFolder(DRIVE_ROOT_FOLDER, DriveApp.getRootFolder());
  var monthFolder   = findOrCreateFolder(monthName,   rootFolder);
  var roundFolder   = findOrCreateFolder(qcType,      monthFolder);
  var artDateFolder = findOrCreateFolder(artDateName, roundFolder);
  var drFolder      = findOrCreateFolder(drNo,        artDateFolder);

  var blob = Utilities.newBlob(
    Utilities.base64Decode(b64.replace(/^data:[^;]+;base64,/, "")),
    mimeType,
    fileName
  );

  var file = drFolder.createFile(blob);

  var folderPath = DRIVE_ROOT_FOLDER + " / " + monthName + " / " + qcType + " / " + artDateName + " / " + drNo;

  return jsonResponse({
    success: true,
    fileId: file.getId(),
    webViewLink: file.getUrl(),
    folderPath: folderPath,
    fileName: fileName
  });
}


// ============================================================
// getQcLog
// ============================================================
function getQcLog(params) {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(QC_LOG_SHEET);

  if (!sheet || sheet.getLastRow() < 2) {
    return jsonResponse({ success: true, rows: [] });
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var dataRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  var rows = dataRows.map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });

  if (params && params.artNo) {
    var filterArt = params.artNo.toUpperCase();
    rows = rows.filter(function(r) {
      return (r["Job Card No"] || "").toUpperCase() === filterArt;
    });
  }

  return jsonResponse({ success: true, count: rows.length, rows: rows });
}


// ============================================================
// getDashboard
// ============================================================
function getDashboard() {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(DASHBOARD_SHEET);


  if (!sheet || sheet.getLastRow() < 2) {
    return jsonResponse({ success: true, stats: [] });
  }

  var headers = sheet.getRange(1, 1, 1, 8).getValues()[0];
  var dataRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();

  var stats = dataRows.map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });

  return jsonResponse({ success: true, stats: stats });
}


// ============================================================
// HELPER: Build QC Row matching all 8 Parameters + 4 Department Tags
// ============================================================
function buildQcRow(srNo, inspection, project, item) {
  var qcDate    = inspection.qcDate    || getTodayDate();
  var qcType    = inspection.qcType    || "Fresh QC";

  var monthName = getMonthName(qcDate);

  var overallRejected = false;
  var rejectedDepts   = [];
  var rejectionNotes  = [];

  // 1. Evaluate 8 QC Parameters
  var paramCells = QC_PARAMETERS.map(function(paramName) {
    var p = (item.parameters || {})[paramName] || { state: "OK" };
    if (p.state === "Rejected") {
      overallRejected = true;
      var note = paramName + ": " + (p.reason || "Defect");
      if (p.severity) note += " (" + p.severity + ")";
      rejectionNotes.push(note);
      return "REJECTED";
    }
    if (p.state === "N/A") return "N/A";
    return "OK";
  });

  // 2. Evaluate 4 Departments (Mistake Tagging)
  var deptCells = DEPARTMENTS.map(function(deptName) {
    var d = (item.departments || {})[deptName] || { state: "OK" };
    if (d.state === "Rejected") {
      overallRejected = true;
      if (rejectedDepts.indexOf(deptName) === -1) rejectedDepts.push(deptName);
      var note = deptName + " (Dept Mistake): " + (d.reason || "Defect");
      if (d.severity) note += " (" + d.severity + ")";
      rejectionNotes.push(note);
      return "REJECTED";
    }
    if (d.state === "N/A") return "N/A";
    return "OK";
  });

  // Parameter-to-Department correlation
  if ((item.parameters || {})["Outer/Polish/veneer/Pu/Metal"]?.state === "Rejected" || (item.parameters || {})["Outer/Polish/Veneer/Pu/Metal"]?.state === "Rejected") {
    if (rejectedDepts.indexOf("Polish") === -1) rejectedDepts.push("Polish");
  }
  if ((item.parameters || {})["Edgeband"]?.state === "Rejected") {
    if (rejectedDepts.indexOf("Panel") === -1) rejectedDepts.push("Panel");
  }
  if ((item.parameters || {})["Fabric"]?.state === "Rejected") {
    if (rejectedDepts.indexOf("Upholstery") === -1) rejectedDepts.push("Upholstery");
  }

  var remark          = [item.remarks || "", rejectionNotes.join("; ")].filter(Boolean).join(" — ");
  var qcStatus        = overallRejected ? "QC REJECTED" : "QC APPROVED";
  var responsibleDept = rejectedDepts.length > 0 ? rejectedDepts.join(", ") : "-";

  return [
    srNo,                                // A: Sr No
    qcDate,                              // B: Date
    monthName,                           // C: Month
    project.client     || "",            // D: Client
    project.projectName|| "",            // E: Project Name
    project.poNo       || "",            // F: PO No
    item.department    || "Panel",       // G: Department
    project.artNo      || "",            // H: Job Card No (= Art No)
    item.drNo          || "",            // I: Dr No
    item.productName   || "",            // J: Product Name
    item.qty           || 1,             // K: Qty
    item.size          || "",            // L: Size
    paramCells[0],                       // M: Outer/Polish/veneer/Pu/Metal
    paramCells[1],                       // N: Edgeband
    paramCells[2],                       // O: GVT/Leg
    paramCells[3],                       // P: Glass/Lock
    paramCells[4],                       // Q: Design As Per Drawing
    paramCells[5],                       // R: Handle/knob/Profile
    paramCells[6],                       // S: Fabric
    paramCells[7],                       // T: Metal
    deptCells[0],                        // U: Panel
    deptCells[1],                        // V: Polish
    deptCells[2],                        // W: Solid
    deptCells[3],                        // X: Upholstery
    remark,                              // Y: Remark
    qcStatus,                            // Z: QC APPROVED OR REJECT
    responsibleDept,                     // AA: Responsible Department
    qcType                               // AB: QC Round (Fresh QC / Re-QC)
  ];
}


// ============================================================
// HELPER: Ensure header row in QC Log sheet (28 Columns)
// ============================================================
function ensureHeaderRow(sheet) {
  var headers = [
    "Sr No", "Date", "Month", "Client", "Project Name", "Po No",
    "Department", "Job Card No", "Dr No", "Product Name", "Qty", "Size",
    "Outer/Polish/veneer/Pu/Metal", "Edgeband", "GVT/Leg", "Glass/Lock",
    "Design As Per Drawing", "Handle/knob/Profile", "Fabric", "Metal",
    "Panel", "Polish", "Solid", "Upholstery",
    "Remark", "QC APPROVED OR REJECT", "Responsible Department", "QC Round"
  ];

  // Overwrite Row 1 with latest 28-column headers
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange
    .setBackground("#1e3a5f")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(10)
    .setHorizontalAlignment("center");

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(5,  180); // Project Name
  sheet.setColumnWidth(10, 200); // Product Name
  sheet.setColumnWidth(25, 220); // Remark
  sheet.setColumnWidth(27, 180); // Responsible Department
}


// ============================================================
// HELPER: Format newly added data rows
// ============================================================
function formatNewRows(sheet, fromRow, toRow) {
  if (fromRow > toRow) return;
  var numCols = 28;
  var range   = sheet.getRange(fromRow, 1, toRow - fromRow + 1, numCols);

  for (var r = fromRow; r <= toRow; r++) {
    var rowRange = sheet.getRange(r, 1, 1, numCols);
    rowRange.setBackground(r % 2 === 0 ? "#f0f4fa" : "#ffffff");
  }

  // Highlight 8 QC Parameter Columns (Cols 13-20) & 4 Dept Columns (Cols 21-24)
  for (var r = fromRow; r <= toRow; r++) {
    for (var c = 13; c <= 24; c++) {
      var cell = sheet.getRange(r, c);
      var val = cell.getValue().toString().trim().toUpperCase();
      if (val === "REJECTED") {
        cell.setBackground("#fde8e8").setFontColor("#c0392b").setFontWeight("bold");
      } else if (val === "OK") {
        cell.setBackground("#e8f8f0").setFontColor("#1e8449");
      } else if (val === "N/A") {
        cell.setBackground("#f4f4f7").setFontColor("#717182");
      }
    }
  }

  // QC APPROVED OR REJECT (Z = col 26)
  for (var r = fromRow; r <= toRow; r++) {
    var statusCell = sheet.getRange(r, 26);
    var val        = statusCell.getValue().toString();
    if (val.includes("REJECTED")) {
      statusCell.setBackground("#fde8e8").setFontColor("#c0392b").setFontWeight("bold");
    } else if (val.includes("APPROVED")) {
      statusCell.setBackground("#e8f8f0").setFontColor("#1e8449").setFontWeight("bold");
    }
  }

  // Responsible Department (AA = col 27)
  for (var r = fromRow; r <= toRow; r++) {
    var respCell = sheet.getRange(r, 27);
    var val      = respCell.getValue().toString().trim();
    if (val !== "-" && val !== "None" && val !== "") {
      respCell.setBackground("#fde8e8").setFontColor("#991b1b").setFontWeight("bold");
    }
  }

  // QC Round (AB = col 28)
  for (var r = fromRow; r <= toRow; r++) {
    var roundCell = sheet.getRange(r, 28);
    var val       = roundCell.getValue().toString();
    if (val.toLowerCase().includes("re")) {
      roundCell.setBackground("#fff3cd").setFontColor("#856404");
    } else {
      roundCell.setBackground("#d1ecf1").setFontColor("#0c5460");
    }
  }

  range.setBorder(true, true, true, true, true, true, "#cccccc",
    SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}


// ============================================================
// HELPER: Multi-Table Analytics Dashboard
// 1. Department-Wise QC Summary (Panel, Polish, Solid, Upholstery)
// 2. Month-Wise & QC Round Analysis (Fresh QC vs Re-QC)
// 3. Responsible Department Mistake Tracking
// ============================================================
function updateDashboard(ss) {
  var logSheet  = ss.getSheetByName(QC_LOG_SHEET);
  var dashSheet = getOrCreateSheet(ss, DASHBOARD_SHEET);

  if (!logSheet || logSheet.getLastRow() < 2) return;

  var lastRow = logSheet.getLastRow();
  var lastCol = Math.max(logSheet.getLastColumn(), 28);
  var dataRows = logSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  // 1. Department Stats Initialization
  var deptStats = {};
  DEPARTMENTS.forEach(function(d) {
    deptStats[d] = { approved: 0, rejected: 0, na: 0, freshQc: 0, reQc: 0 };
  });

  // 2. Month Stats Initialization
  var monthStats = {};

  // 3. Responsible Dept Mistake Stats
  var responsibleStats = {};
  DEPARTMENTS.forEach(function(d) {
    responsibleStats[d] = 0;
  });

  var totalInspections = 0;
  var totalMistakes = 0;

  dataRows.forEach(function(row) {
    totalInspections++;
    var month = (row[2] || "August").toString().trim();
    if (!month) month = "Current Month";
    if (!monthStats[month]) {
      monthStats[month] = { freshQc: 0, reQc: 0, approved: 0, rejected: 0, total: 0 };
    }

    // Determine QC Round & Status
    // If 28-column format: QC Status is col 26 (index 25), Round is col 28 (index 27), Resp is col 27 (index 26)
    // If 24-column format: QC Status is col 22 (index 21), Round is col 24 (index 23), Resp is col 23 (index 22)
    var statusText = (row[25] || row[21] || "APPROVED").toString().toUpperCase();
    var roundText  = (row[27] || row[23] || "Fresh QC").toString();
    var respDept   = (row[26] || row[22] || "").toString().trim();

    var isApproved = statusText.includes("APPROVED") && !statusText.includes("REJECT");
    var isReQc     = roundText.toLowerCase().includes("re");

    monthStats[month].total++;
    if (isReQc) monthStats[month].reQc++; else monthStats[month].freshQc++;
    if (isApproved) monthStats[month].approved++; else monthStats[month].rejected++;

    // Track Responsible Department Mistakes
    if (respDept && respDept !== "-" && respDept !== "None") {
      DEPARTMENTS.forEach(function(d) {
        if (respDept.toLowerCase().includes(d.toLowerCase())) {
          responsibleStats[d]++;
          totalMistakes++;
        }
      });
    }

    // Department Columns Evaluation: Cols 21-24 (indices 20-23)
    var deptIndices = { "Panel": 20, "Polish": 21, "Solid": 22, "Upholstery": 23 };

    DEPARTMENTS.forEach(function(dept) {
      var colIdx = deptIndices[dept];
      var val = (row[colIdx] || "").toString().trim().toUpperCase();

      if (val === "REJECTED") {
        deptStats[dept].rejected++;
      } else if (val === "N/A") {
        deptStats[dept].na++;
      } else {
        deptStats[dept].approved++;
      }

      if (isReQc) deptStats[dept].reQc++; else deptStats[dept].freshQc++;
    });
  });

  // Clear Dashboard sheet
  dashSheet.clear();

  var curRow = 1;

  // ─────────────────────────────────────────────────────────────
  // TABLE 1: 4 Department-Wise QC Summary
  // ─────────────────────────────────────────────────────────────
  dashSheet.getRange(curRow, 1).setValue("📊 1. FOUR DEPARTMENT QC EVALUATION (PANEL, POLISH, SOLID, UPHOLSTERY)").setFontWeight("bold").setFontSize(11).setFontColor("#1e3a8a");
  curRow++;

  var t1Headers = ["Department", "Approved (OK)", "Mistakes / Rejected", "Total Evaluated", "% Approved", "% Rejected", "Fresh QC Rounds", "Re-QC Rounds"];
  dashSheet.getRange(curRow, 1, 1, 8).setValues([t1Headers]).setBackground("#1e3a5f").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  curRow++;

  var t1Start = curRow;
  DEPARTMENTS.forEach(function(dept) {
    var s = deptStats[dept];
    var total = s.approved + s.rejected;
    var pctApp = total ? Math.round((s.approved / total) * 100) + "%" : "0%";
    var pctRej = total ? Math.round((s.rejected / total) * 100) + "%" : "0%";
    dashSheet.getRange(curRow, 1, 1, 8).setValues([[dept, s.approved, s.rejected, total, pctApp, pctRej, s.freshQc, s.reQc]]);
    curRow++;
  });

  // Format Table 1
  for (var r = t1Start; r < curRow; r++) {
    var pctCell = dashSheet.getRange(r, 5);
    var val = parseInt(pctCell.getValue()) || 0;
    pctCell.setBackground(val >= 80 ? "#e8f8f0" : "#fde8e8").setFontColor(val >= 80 ? "#1e8449" : "#c0392b").setFontWeight("bold");
  }

  curRow += 2;

  // ─────────────────────────────────────────────────────────────
  // TABLE 2: Month-Wise & QC Round Summary (Fresh QC vs Re-QC)
  // ─────────────────────────────────────────────────────────────
  dashSheet.getRange(curRow, 1).setValue("📅 2. MONTH-WISE & QC ROUND BREAKDOWN (FRESH QC vs RE-QC)").setFontWeight("bold").setFontSize(11).setFontColor("#1e3a8a");
  curRow++;

  var t2Headers = ["Month", "Fresh QC Count", "Re-QC Count", "Total Items Checked", "Approved (OK)", "Rejected / Cancel", "% Approval Rate"];
  dashSheet.getRange(curRow, 1, 1, 7).setValues([t2Headers]).setBackground("#0f766e").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  curRow++;

  var t2Start = curRow;
  Object.keys(monthStats).forEach(function(m) {
    var ms = monthStats[m];
    var pct = ms.total ? Math.round((ms.approved / ms.total) * 100) + "%" : "0%";
    dashSheet.getRange(curRow, 1, 1, 7).setValues([[m, ms.freshQc, ms.reQc, ms.total, ms.approved, ms.rejected, pct]]);
    curRow++;
  });

  for (var r = t2Start; r < curRow; r++) {
    var pctCell = dashSheet.getRange(r, 7);
    var val = parseInt(pctCell.getValue()) || 0;
    pctCell.setBackground(val >= 80 ? "#e8f8f0" : "#fde8e8").setFontColor(val >= 80 ? "#1e8449" : "#c0392b").setFontWeight("bold");
  }

  curRow += 2;

  // ─────────────────────────────────────────────────────────────
  // TABLE 3: Responsible Department Mistake Tracking
  // ─────────────────────────────────────────────────────────────
  dashSheet.getRange(curRow, 1).setValue("⚠️ 3. RESPONSIBLE DEPARTMENT MISTAKE TRACKING").setFontWeight("bold").setFontSize(11).setFontColor("#991b1b");
  curRow++;

  var t3Headers = ["Department", "Mistakes Made (Rejections)", "% Share of Total Mistakes", "Department Status"];
  dashSheet.getRange(curRow, 1, 1, 4).setValues([t3Headers]).setBackground("#7f1d1d").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  curRow++;

  DEPARTMENTS.forEach(function(dept) {
    var count = responsibleStats[dept] || 0;
    var share = totalMistakes ? Math.round((count / totalMistakes) * 100) + "%" : "0%";
    var status = count === 0 ? "✅ No Mistakes" : (count > 3 ? "❌ High Attention Needed" : "⚠️ Needs Improvement");
    dashSheet.getRange(curRow, 1, 1, 4).setValues([[dept, count, share, status]]);
    curRow++;
  });

  // Set column widths for Dashboard
  dashSheet.setColumnWidth(1, 160);
  dashSheet.setColumnWidth(2, 140);
  dashSheet.setColumnWidth(3, 160);
  dashSheet.setColumnWidth(4, 150);
  dashSheet.setColumnWidth(5, 120);
  dashSheet.setColumnWidth(6, 120);
  dashSheet.setColumnWidth(7, 140);
  dashSheet.setColumnWidth(8, 140);
}


// ============================================================
// HELPER FUNCTIONS
// ============================================================
function findOrCreateFolder(name, parent) {
  var folders = parent.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return parent.createFolder(name);
}

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function getTodayDate() {
  var d = new Date();
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function getMonthName(dateStr) {
  if (!dateStr) return "";
  var parts = dateStr.split("-");
  if (parts.length < 2) return "";
  var idx = parseInt(parts[1], 10) - 1;
  return MONTH_NAMES[idx] || "";
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────
// Run this function in Apps Script Editor to update headers & dashboard immediately
// ─────────────────────────────────────────────────────────────
function testScript() {
  var ss = getSpreadsheet();
  var sheet = getOrCreateSheet(ss, QC_LOG_SHEET);
  ensureHeaderRow(sheet);
  migrateToV2(sheet);
  updateDashboard(ss);
  Logger.log("FurniQc Sheet headers, migration and Dashboard updated successfully!");
}


// ─────────────────────────────────────────────────────────────
// MIGRATION: Fix old 24-column rows to 28-column format
//
// Old format (24 cols):
//   A-L: Basic info (12)  M-T: 8 QC params  U:Remark  V:QC Status  W:RespDept  X:QCRound
//
// New format (28 cols):
//   A-L: Basic info (12)  M-T: 8 QC params  U:Panel  V:Polish  W:Solid  X:Upholstery
//   Y:Remark  Z:QC Status  AA:RespDept  AB:QCRound
// ─────────────────────────────────────────────────────────────
function migrateToV2(sheet) {
  if (!sheet) {
    var ss = getSpreadsheet();
    sheet = ss.getSheetByName(QC_LOG_SHEET);
  }
  if (!sheet || sheet.getLastRow() < 2) return;

  var lastRow = sheet.getLastRow();
  var migratedCount = 0;

  for (var r = 2; r <= lastRow; r++) {
    var rowData = sheet.getRange(r, 1, 1, 28).getValues()[0];

    // In OLD 24-col format:
    // rowData[20] = Remark (Col U)
    // rowData[21] = QC Status ("QC APPROVED" or "QC REJECTED") (Col V)
    // rowData[22] = Responsible Dept (Col W)
    // rowData[23] = QC Round ("Fresh QC" or "Re-QC") (Col X)

    var valAtCol22 = (rowData[21] || "").toString().trim().toUpperCase(); // Col V
    var valAtCol24 = (rowData[23] || "").toString().trim().toUpperCase(); // Col X

    var isOldFormat = valAtCol22.indexOf("QC APPROVED") !== -1 ||
                      valAtCol22.indexOf("QC REJECTED") !== -1 ||
                      valAtCol24 === "FRESH QC" ||
                      valAtCol24 === "RE-QC";

    if (isOldFormat) {
      var oldRemark   = rowData[20]; // index 20 (Col U)
      var oldStatus   = rowData[21]; // index 21 (Col V)
      var oldRespDept = rowData[22]; // index 22 (Col W)
      var oldQcRound  = rowData[23]; // index 23 (Col X)

      var panelState = "OK";
      var polishState = "OK";
      var solidState = "OK";
      var uphState = "OK";

      if (oldRespDept && oldRespDept !== "-" && oldRespDept !== "None") {
        var respLower = oldRespDept.toString().toLowerCase();
        if (respLower.indexOf("panel") !== -1) panelState = "REJECTED";
        if (respLower.indexOf("polish") !== -1) polishState = "REJECTED";
        if (respLower.indexOf("solid") !== -1) solidState = "REJECTED";
        if (respLower.indexOf("upholstery") !== -1) uphState = "REJECTED";
      }

      var newRow = rowData.slice(0, 20); // Cols A-T (Indices 0-19)
      newRow[20] = panelState;           // Col U: Panel
      newRow[21] = polishState;          // Col V: Polish
      newRow[22] = solidState;           // Col W: Solid
      newRow[23] = uphState;             // Col X: Upholstery
      newRow[24] = oldRemark || "";      // Col Y: Remark
      newRow[25] = oldStatus || (panelState === "REJECTED" || polishState === "REJECTED" || solidState === "REJECTED" || uphState === "REJECTED" ? "QC REJECTED" : "QC APPROVED"); // Col Z: QC Status
      newRow[26] = oldRespDept || "-";   // Col AA: Responsible Dept
      newRow[27] = oldQcRound || "Fresh QC"; // Col AB: QC Round

      sheet.getRange(r, 1, 1, 28).setValues([newRow]);
      migratedCount++;
    }
  }

  if (migratedCount > 0) {
    formatNewRows(sheet, 2, lastRow);
    Logger.log("Migrated " + migratedCount + " old rows to 28-column format.");
  }
}




