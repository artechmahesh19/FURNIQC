// ============================================================
// FurniQc — configuration
// Fill in the values below with your own Google Cloud project
// credentials before running the app. See README.md for the
// step-by-step setup (enabling Drive API + Sheets API, creating
// an OAuth Client ID, and creating the destination Google Sheet).
// ============================================================

const CONFIG = {
  // ── Google Apps Script Web App URL ──────────────────────────────────────
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyRos2ecAa0tcZOz3U2ou_N0xnNQbnygzWxDadsoQwbfpjGraX9ktpvOm6Wx1JN1bB-/exec",

  // OAuth 2.0 Client ID from Google Cloud Console (APIs & Services > Credentials)
  GOOGLE_CLIENT_ID: "YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com",

  // API key from Google Cloud Console (used for Sheets/Drive discovery docs)
  GOOGLE_API_KEY: "YOUR_GOOGLE_API_KEY",

  // Scopes requested at sign-in
  GOOGLE_SCOPES: [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets"
  ].join(" "),

  // The Google Sheet that receives QC Report rows
  QC_REPORT_SPREADSHEET_ID: "1tYR0aFScB0bg--vmtQIhPlZTddNX8a1CUBWf7gsGZbU",

  // Sheet tab names
  QC_LOG_SHEET_NAME: "Sheet1",
  DASHBOARD_SHEET_NAME: "Dashboard",

  // Root folder name in Google Drive
  DRIVE_ROOT_FOLDER_NAME: "FurniQc",

  // 4 Core QC Departments evaluated on every product for mistake tagging
  QC_DEPARTMENTS: [
    "Panel",
    "Polish",
    "Solid",
    "Upholstery"
  ],

  // The 8 QC checklist parameters (All 8 parameters)
  QC_PARAMETERS: [
    "Outer/Polish/Veneer/Pu/Metal",
    "Edgeband",
    "GVT/Leg",
    "Glass/Lock",
    "Design As Per Drawing",
    "Handle/Knob/Profile",
    "Fabric",
    "Metal"
  ],

  // Standard rejection reasons shown in the modal
  REJECTION_REASONS: [
    "Polish Mismatch / Uneven Finish",
    "Size / Dimension Mismatch",
    "Hardware Missing / Loose",
    "Edgeband Peeling / Gap",
    "Laminate Defect / Bubble / Scratch",
    "Solid Wood Joint / Crack / Warp",
    "Stitching Defect / Wrinkle",
    "Fabric / Leatherette Mismatch",
    "Design Not As Per Drawing",
    "Other Defect"
  ],

  SEVERITY_LEVELS: ["Minor", "Major", "Critical"],

  DEPARTMENTS: ["Panel", "Polish", "Solid", "Upholstery"],

  DEPARTMENT_KEYWORDS: {
    Upholstery: ["sofa", "ottoman", "recliner", "settee", "cushion", "fabric", "upholstery", "leatherette", "mattress", "headboard"],
    Solid: ["solid", "wood", "teak", "oak", "sheesham", "table", "chair", "leg", "dining"],
    Polish: ["polish", "veneer", "pu", "deco", "paint", "gloss", "matt"],
    Panel: ["panel", "door", "shutter", "carcass", "unit", "patta", "cabinet", "drawer", "box", "credenza", "desk"]
  }
};


