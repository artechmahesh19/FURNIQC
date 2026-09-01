// ============================================================
// FurniQc — Google Sheets via Apps Script Web App
//
// All writes go through the deployed Apps Script Web App URL
// (CONFIG.APPS_SCRIPT_URL) using a simple fetch() POST.
// No OAuth / gapi required for this module.
//
// Web App URL (set in js/config.js):
//   APPS_SCRIPT_URL: https://script.google.com/macros/s/.../exec
//
// Columns match QC_REPORT_.xlsx exactly (24 cols A-X):
//   A:Sr No  B:Date  C:Month  D:Client  E:Project Name  F:PO No
//   G:Department  H:Job Card No  I:Dr No  J:Product Name  K:Qty  L:Size
//   M-T: 8 QC Parameters
//   U:Remark  V:QC APPROVED OR REJECT  W:Responsible Dept  X:QC Round
// ============================================================

const GoogleSheets = (() => {

  // POST inspection data to Apps Script Web App
  async function postToScript(payload) {
    const url = CONFIG.APPS_SCRIPT_URL;
    if (!url || url.includes('YOUR_DEPLOYMENT_ID')) {
      throw new Error('APPS_SCRIPT_URL not configured in config.js');
    }
    const resp = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain' } // avoids CORS preflight
    });
    if (!resp.ok) throw new Error('Network error: ' + resp.status);
    return resp.json();
  }

  // Sends the full inspection to Apps Script which writes rows + updates Dashboard
  async function appendInspection(inspection, project) {
    const result = await postToScript({
      action: 'saveInspection',
      inspection,
      project
    });
    if (!result.success) {
      throw new Error(result.error || 'Apps Script error');
    }
    return result; // { success, rowsAdded, message }
  }

  // Dashboard is auto-updated by Apps Script on every save — no-op here
  async function updateDashboard() {
    return { success: true };
  }

  return { appendInspection, updateDashboard };
})();
