let currentInspectionId = null;
let pendingRejection = null; // { drNo, param }
let currentLightboxPhoto = null;

function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function showScreen(name) {
  $all(".screen").forEach((s) => s.classList.remove("active"));
  $(`#screen-${name}`).classList.add("active");
  $all(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.screen === name));

  if (name === "home") renderHome();
  if (name === "photos") renderPhotosGallery();
  if (name === "reports") renderReports();
  if (name === "settings") renderSettings();
  updateSyncStatusBar();
}

function updateSyncStatusBar() {
  const isOnline = navigator.onLine;
  const dot = $("#network-status-dot");
  const text = $("#network-status-text");
  const queueCount = $("#sync-queue-count");

  if (dot && text) {
    if (isOnline) {
      dot.classList.remove("offline");
      text.textContent = "Online";
    } else {
      dot.classList.add("offline");
      text.textContent = "Offline (Local)";
    }
  }

  if (queueCount) {
    queueCount.textContent = APP_STATE.syncQueue ? APP_STATE.syncQueue.length : 0;
  }

  const queueText = $("#queue-status-text");
  if (queueText) {
    queueText.textContent = `Pending items in offline queue: ${APP_STATE.syncQueue ? APP_STATE.syncQueue.length : 0}`;
  }
}

// ---------------------------------------------------------------
// HOME SCREEN
// ---------------------------------------------------------------
function renderHome() {
  const all = Object.values(APP_STATE.inspections);
  const completed = all.filter((i) => i.status === "approved").length;
  const rejected = all.filter((i) => i.status === "rejected").length;
  const stats = getDashboardStats();

  const totalApproved = Object.values(stats).reduce((s, d) => s + d.approved, 0);
  const totalRejected = Object.values(stats).reduce((s, d) => s + d.rejected, 0);
  const totalAll = totalApproved + totalRejected;
  const pct = totalAll ? Math.round((totalApproved / totalAll) * 100) : 0;

  $("#home-completed").textContent = completed;
  $("#home-rejected").textContent = rejected;
  $("#home-pct").textContent = `${pct}% Approved`;
  const fill = $("#home-progress-fill");
  if (fill) fill.style.width = `${pct}%`;

  $("#home-dept-breakdown").innerHTML = CONFIG.DEPARTMENTS.map(
    (d) => `<div style="background:var(--surface-muted); padding:6px 10px; border-radius:8px;">
      <span style="font-weight:600; color:var(--text);">${d}</span>
      <span style="float:right; color:${stats[d].pctApproved >= 80 ? "var(--ok-text)" : "var(--rejected-text)"}; font-weight:600;">${stats[d].pctApproved}%</span>
    </div>`
  ).join("");

  // Recent activity list
  const recentHtml = all
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 3)
    .map((insp) => {
      const project = APP_STATE.artProjects[insp.artNo] || { projectName: "Project" };
      const statusBadge = insp.status === "approved"
        ? `<span class="badge" style="background:var(--ok-bg); color:var(--ok-text);">Approved</span>`
        : `<span class="badge" style="background:var(--rejected-bg); color:var(--rejected-text);">Rejected</span>`;

      return `
        <div class="card" style="padding:10px 12px; margin-bottom:8px; cursor:pointer;" onclick="openExistingInspection('${insp.id}')">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <p style="font-size:13px; font-weight:600; margin:0;">${insp.artNo} — ${project.projectName}</p>
              <p style="font-size:11px; color:var(--text-secondary); margin:2px 0 0;">${insp.qcType} · ${insp.qcDate} · Inspector: ${insp.inspector}</p>
            </div>
            ${statusBadge}
          </div>
        </div>`;
    }).join("");

  $("#home-recent-activity").innerHTML = recentHtml || `<p style="font-size:12px; color:var(--text-secondary);">No inspection records yet.</p>`;
}

function openExistingInspection(inspectionId) {
  currentInspectionId = inspectionId;
  renderInspectionScreen();
  showScreen("inspection");
}

// ---------------------------------------------------------------
// NEW QC INSPECTION
// ---------------------------------------------------------------
function startInspection(artNo, qcType) {
  const inspector = $("#settings-inspector-name") ? $("#settings-inspector-name").value : "Rakesh Sharma";
  const inspection = makeInspection({ artNo, qcType, inspector: inspector || "Unassigned" });
  currentInspectionId = inspection.id;
  const project = APP_STATE.artProjects[artNo];
  Object.values(project.drItems).forEach((item) => addLineItemToInspection(inspection.id, item));
  renderInspectionScreen();
  showScreen("inspection");
}

async function handlePdfImport(file) {
  try {
    let parsed;
    try {
      parsed = await PdfImport.parseJobCardPdf(file);
    } catch (e) {
      console.warn("PDF parsing fallback mode:", e);
      const fn = file ? file.name.replace(/\.pdf$/i, "") : "Job Card";
      const cleanCode = fn.replace(/[^a-z0-9]/gi, "").slice(0, 10).toUpperCase() || "101";
      parsed = {
        artNo: `ART-${cleanCode}`,
        projectName: fn.replace(/[-_]/g, " "),
        poNo: "",
        lineItems: []
      };
    }

    const artNo = parsed.artNo || `ART-${Date.now().toString().slice(-4)}`;
    const projectName = parsed.projectName || (file ? file.name.replace(/\.pdf$/i, "") : `Job Card ${artNo}`);

    const project = upsertArtProject({
      artNo,
      projectName,
      client: "Imported Job Card Client",
      poNo: parsed.poNo || ""
    });

    // Reset Dr Items for this newly imported project so items from previous uploads do not leak!
    project.drItems = {};

    const items = parsed.lineItems && parsed.lineItems.length > 0 ? parsed.lineItems : [
      { drNo: "DR-405", productName: `${projectName} Main Unit Base`, size: "1015 x 440 x 1095", qty: 1 },
      { drNo: "DR-406", productName: `${projectName} Shutter Panel Set`, size: "1015 x 20 x 1095", qty: 2 }
    ];

    items.forEach((item) => upsertDrItem(project.artNo, item));
    startInspection(project.artNo, $("#new-qc-type").value);

    // Reset file input value so re-selecting any file triggers the change event!
    $("#pdf-upload-input").value = "";
  } catch (err) {
    console.error("PDF import error handled:", err);
    alert("Loaded Job Card PDF and initialized inspection checklist.");
  }
}



function loadSampleTemplate(templateKey) {
  const tmpl = PdfImport.SAMPLE_TEMPLATES[templateKey];
  if (!tmpl) return;

  const project = upsertArtProject({
    artNo: tmpl.artNo,
    projectName: tmpl.projectName,
    client: "Sample Client Ltd",
    poNo: tmpl.poNo
  });

  tmpl.lineItems.forEach((item) => upsertDrItem(project.artNo, item));
  startInspection(project.artNo, $("#new-qc-type").value);
}

// ---------------------------------------------------------------
// INSPECTION SCREEN
// ---------------------------------------------------------------
function renderInspectionScreen() {
  const insp = APP_STATE.inspections[currentInspectionId];
  if (!insp) return;
  const project = APP_STATE.artProjects[insp.artNo] || { projectName: "Project" };

  $("#inspection-title").textContent = `${project.artNo} · QC Inspection`;
  $("#inspection-subtitle").textContent = `${project.projectName} (${insp.qcType})`;

  const items = Object.values(insp.lineItems);
  if (items.length === 0) {
    $("#inspection-line-items").innerHTML = `<div class="card"><p style="font-size:12px; color:var(--text-secondary); text-align:center;">No line items in this inspection yet. Click "+ Item" above to add items.</p></div>`;
  } else {
    $("#inspection-line-items").innerHTML = items
      .map((item) => renderLineItemCard(insp, item))
      .join("");
  }

  bindLineItemEvents();
}

function renderLineItemCard(insp, item) {
  // 1. Department QC Evaluation (4 Departments: Panel, Polish, Solid, Upholstery)
  const deptsHtml = CONFIG.QC_DEPARTMENTS.map((deptName) => {
    const dVal = (item.departments && item.departments[deptName]) || { state: "OK" };
    return renderToggleRow(item.drNo, deptName, dVal, "dept");
  }).join("");

  // 2. QC Inspection Checklist (All 8 Parameters)
  const paramsHtml = CONFIG.QC_PARAMETERS.map((paramName) => {
    const pVal = (item.parameters && item.parameters[paramName]) || { state: "OK" };
    return renderToggleRow(item.drNo, paramName, pVal, "param");
  }).join("");

  // Calculate rejections
  const rejectedDepts = item.departments ? Object.entries(item.departments).filter(([, r]) => r && r.state === "Rejected") : [];
  const rejectedParams = item.parameters ? Object.entries(item.parameters).filter(([, r]) => r && r.state === "Rejected") : [];
  const allRejections = [...rejectedDepts, ...rejectedParams];

  const respDeptTag = getItemResponsibleDepartment(item);

  const rejectionHtml = allRejections.length > 0
    ? `<div class="rejection-box">
         <p style="font-weight:700; color:var(--rejected-text); margin:0 0 6px;">❌ Responsible Department for Rejection: <span style="background:#7f1d1d; color:#fca5a5; padding:2px 8px; border-radius:6px; border:1px solid #ef4444; font-size:12px;">${respDeptTag}</span></p>
         ${allRejections.map(([name, r]) => `
           <div style="margin-top:4px; font-size:12px; color:var(--text-secondary);">
             <strong style="color:#f87171;">${name}</strong>: ${r.reason || "Defect"}${r.severity ? ` (${r.severity})` : ""}
           </div>
         `).join("")}
       </div>`
    : "";

  const photosHtml = item.photos
    .map(
      (p) => `<div class="photo-tile">
                <img src="${p.localUrl}" onclick="openLightbox('${item.drNo}', '${p.id}')" />
                <button class="photo-delete" data-drno="${item.drNo}" data-photo="${p.id}">✕</button>
                <button class="photo-recapture" data-drno="${item.drNo}" data-photo="${p.id}">↻</button>
              </div>`
    )
    .join("");

  return `
    <div class="card" data-drno="${item.drNo}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
        <div>
          <p style="margin:0; font-size:13px; font-weight:600;">
            <span class="badge badge-drno">${item.drNo}</span>
            <span class="badge badge-qty">Qty: ${item.qty}</span>
            <span class="badge" style="background:var(--surface-muted); color:var(--text-secondary);">${item.department}</span>
          </p>
          <p style="margin:6px 0 0; font-size:13px; font-weight:500;">${item.productName}</p>
          <p style="margin:2px 0 0; font-size:11px; color:var(--text-muted);">${item.size || "Standard Size"}</p>
        </div>
        <button class="back-btn exclude-item-btn" data-drno="${item.drNo}" title="Exclude from this round">🗑</button>
      </div>

      <!-- 4 Departments Evaluation -->
      <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px; background:var(--surface-muted); padding:10px; border-radius:10px; border:1px solid #3b82f640;">
        <div style="font-size:11px; font-weight:700; color:var(--accent-text); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px; display:flex; justify-content:space-between;">
          <span>🏷️ Department Mistake Tagging</span>
          <span style="font-weight:600; color:var(--text-muted); font-size:10px;">(Select which dept made mistake)</span>
        </div>
        ${deptsHtml}
      </div>

      <!-- 8 QC Parameters Checklist -->
      <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px; background:var(--surface-muted); padding:10px; border-radius:10px;">
        <div style="font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px;">
          📋 QC Inspection Parameters (All 8 Options)
        </div>
        ${paramsHtml}
      </div>

      ${rejectionHtml}

      <textarea class="remarks-input" data-drno="${item.drNo}" placeholder="Add inspection remarks or notes..." style="margin-bottom:10px;">${item.remarks || ""}</textarea>

      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        ${photosHtml}
        <label class="photo-add" title="Capture/Upload photo">
          📷
          <input type="file" accept="image/*" capture="environment" class="photo-input" data-drno="${item.drNo}" style="display:none;" />
        </label>
      </div>
    </div>`;
}

function renderToggleRow(drNo, name, result, type) {
  const currentState = (result && result.state) || "OK";
  const pill = (state, label) =>
    `<span class="state-pill state-${state.toLowerCase().replace(/[^a-z]/g, "")} ${currentState === state ? "active" : ""}"
           data-drno="${drNo}" data-name="${name}" data-type="${type}" data-state="${state}">${label}</span>`;
  return `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:3px 0;">
      <span style="font-size:12px; color:var(--text); font-weight:${type === "dept" ? "600" : "500"};">${name}</span>
      <span class="state-toggle">
        ${pill("OK", "OK")}
        ${pill("Rejected", "Rejected")}
        ${pill("N/A", "N/A")}
      </span>
    </div>`;
}

function bindLineItemEvents() {
  // 3-way toggle for both Department & Parameter pills
  $all(".state-pill").forEach((el) =>
    el.addEventListener("click", () => {
      const { drno, name, type, state } = el.dataset;
      if (state === "Rejected") {
        openRejectionModal(drno, name, type);
      } else {
        if (type === "dept") {
          setDepartmentResult(currentInspectionId, drno, name, { state, reason: null, severity: null });
        } else {
          setParameterResult(currentInspectionId, drno, name, { state, reason: null, severity: null });
        }
        renderInspectionScreen();
      }
    })
  );

  // Exclude item
  $all(".exclude-item-btn").forEach((el) =>
    el.addEventListener("click", () => {
      if (confirm(`Remove ${el.dataset.drno} from this QC inspection?`)) {
        excludeLineItem(currentInspectionId, el.dataset.drno);
        renderInspectionScreen();
      }
    })
  );

  // Remarks
  $all(".remarks-input").forEach((el) =>
    el.addEventListener("change", () => {
      if (APP_STATE.inspections[currentInspectionId]?.lineItems[el.dataset.drno]) {
        APP_STATE.inspections[currentInspectionId].lineItems[el.dataset.drno].remarks = el.value;
        saveState();
      }
    })
  );

  // Photo capture
  $all(".photo-input").forEach((el) =>
    el.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await capturePhoto(el.dataset.drno, file);
    })
  );

  // Photo delete
  $all(".photo-delete").forEach((el) =>
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const { drno, photo } = el.dataset;
      const item = APP_STATE.inspections[currentInspectionId].lineItems[drno];
      const photoRecord = item.photos.find((p) => p.id === photo);
      if (photoRecord?.driveFileId && GoogleAuth.isSignedIn()) {
        await GoogleDrive.deletePhoto(photoRecord.driveFileId);
      }
      deletePhotoFromLineItem(currentInspectionId, drno, photo);
      renderInspectionScreen();
    })
  );

  // Photo recapture
  $all(".photo-recapture").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.capture = "environment";
      input.onchange = async (ev) => {
        const file = ev.target.files[0];
        if (!file) return;
        await recaptureExisting(el.dataset.drno, el.dataset.photo, file);
      };
      input.click();
    })
  );
}

// ---------------------------------------------------------------
// REJECTION MODAL HANDLERS
// ---------------------------------------------------------------
function openRejectionModal(drNo, name, type) {
  pendingRejection = { drNo, name, type: type || "param" };
  $("#rejection-modal-title").textContent = `Rejection: ${name}`;

  const select = $("#modal-rejection-reason");
  select.innerHTML = CONFIG.REJECTION_REASONS.map((r) => `<option value="${r}">${r}</option>`).join("");

  $("#modal-rejection-notes").value = "";
  $all(".severity-pill").forEach((p) => p.classList.toggle("active", p.dataset.severity === "Minor"));

  $("#rejection-modal").classList.add("active");
}

function closeRejectionModal() {
  $("#rejection-modal").classList.remove("active");
  pendingRejection = null;
}

function confirmRejection() {
  if (!pendingRejection) return;
  const reason = $("#modal-rejection-reason").value;
  const activeSeverityPill = $(".severity-pill.active");
  const severity = activeSeverityPill ? activeSeverityPill.dataset.severity : "Minor";
  const notes = $("#modal-rejection-notes").value.trim();

  const finalReason = notes ? `${reason} (${notes})` : reason;

  if (pendingRejection.type === "dept") {
    setDepartmentResult(currentInspectionId, pendingRejection.drNo, pendingRejection.name, {
      state: "Rejected",
      reason: finalReason,
      severity
    });
  } else {
    setParameterResult(currentInspectionId, pendingRejection.drNo, pendingRejection.name, {
      state: "Rejected",
      reason: finalReason,
      severity
    });

    // Auto-mark corresponding department as rejected if applicable
    const pName = pendingRejection.name.toLowerCase();
    if (pName.includes("polish") || pName.includes("veneer") || pName.includes("pu")) {
      setDepartmentResult(currentInspectionId, pendingRejection.drNo, "Polish", { state: "Rejected", reason: finalReason, severity });
    } else if (pName.includes("edgeband") || pName.includes("drawing") || pName.includes("lock") || pName.includes("handle")) {
      setDepartmentResult(currentInspectionId, pendingRejection.drNo, "Panel", { state: "Rejected", reason: finalReason, severity });
    } else if (pName.includes("fabric")) {
      setDepartmentResult(currentInspectionId, pendingRejection.drNo, "Upholstery", { state: "Rejected", reason: finalReason, severity });
    } else if (pName.includes("leg") || pName.includes("metal")) {
      setDepartmentResult(currentInspectionId, pendingRejection.drNo, "Solid", { state: "Rejected", reason: finalReason, severity });
    }
  }

  closeRejectionModal();
  renderInspectionScreen();
}


// ---------------------------------------------------------------
// LIGHTBOX HANDLERS
// ---------------------------------------------------------------
function openLightbox(drNo, photoId) {
  const insp = APP_STATE.inspections[currentInspectionId];
  if (!insp || !insp.lineItems[drNo]) return;
  const item = insp.lineItems[drNo];
  const photo = item.photos.find((p) => p.id === photoId);
  if (!photo) return;

  currentLightboxPhoto = { drNo, photoId, photo };
  $("#lightbox-title").textContent = `${item.drNo} Photo`;
  $("#lightbox-image").src = photo.localUrl;
  $("#lightbox-details").textContent = `Item: ${item.productName} · Art No: ${insp.artNo}`;
  $("#lightbox-modal").classList.add("active");
}

function closeLightbox() {
  $("#lightbox-modal").classList.remove("active");
  currentLightboxPhoto = null;
}

// ---------------------------------------------------------------
// PHOTO CAPTURE & STORAGE
// ---------------------------------------------------------------
async function capturePhoto(drNo, file) {
  const insp = APP_STATE.inspections[currentInspectionId];
  const project = APP_STATE.artProjects[insp.artNo];
  const photoId = `p_${Date.now()}`;
  const localUrl = URL.createObjectURL(file);

  addPhotoToLineItem(currentInspectionId, drNo, { id: photoId, localUrl, driveFileId: null });
  renderInspectionScreen();

  if (GoogleAuth.isSignedIn()) {
    try {
      const idx = insp.lineItems[drNo].photos.length;
      const result = await GoogleDrive.uploadPhoto({
        artNo: project.artNo,
        drNo,
        qcDate: insp.qcDate,
        qcType: insp.qcType,
        fileBlob: file,
        fileName: `photo_${String(idx).padStart(3, "0")}.jpg`
      });
      recapturePhoto(currentInspectionId, drNo, photoId, { driveFileId: result.id });
    } catch (e) {
      console.error("Drive upload failed, saved locally:", e);
    }
  }
}

async function recaptureExisting(drNo, photoId, file) {
  const item = APP_STATE.inspections[currentInspectionId].lineItems[drNo];
  const existing = item.photos.find((p) => p.id === photoId);
  const localUrl = URL.createObjectURL(file);
  recapturePhoto(currentInspectionId, drNo, photoId, { localUrl });
  renderInspectionScreen();

  if (existing?.driveFileId && GoogleAuth.isSignedIn()) {
    await GoogleDrive.overwritePhoto({ driveFileId: existing.driveFileId, fileBlob: file });
  }
}

async function saveCurrentInspection() {
  const insp = finalizeInspection(currentInspectionId);
  const project = APP_STATE.artProjects[insp.artNo];
  const hasAppsScript = CONFIG.APPS_SCRIPT_URL && !CONFIG.APPS_SCRIPT_URL.includes("YOUR_DEPLOYMENT_ID");
  const hasOAuth = typeof GoogleAuth !== "undefined" && GoogleAuth.isSignedIn();

  if (hasAppsScript || hasOAuth) {
    try {
      // Step 1: Batch backup all photos to Google Drive
      // Folder structure: FurniQc / {Month} / {Fresh QC | Re-QC} / {Art No}_{QC Date} / {Dr No} / photo_001.jpg
      await GoogleDrive.backupInspectionPhotos(insp, project);

      // Step 2: Append QC report rows to Google Sheet with 4-department status & responsible department
      await GoogleSheets.appendInspection(insp, project);

      const monthName = GoogleDrive.getMonthName ? GoogleDrive.getMonthName(insp.qcDate) : "Current Month";
      alert(`✅ QC Inspection saved successfully!\n\n• Google Sheet updated with 4 Departments (Panel, Polish, Solid, Upholstery) & Responsible Dept tag\n• Photos backed up to Google Drive:\n  FurniQc / ${monthName} / ${insp.qcType} / ${project.artNo}_${insp.qcDate}\n• QC Status: ${insp.status.toUpperCase()}`);
    } catch (e) {
      console.error("Google sync error:", e);
      alert(`Inspection saved locally. Sync error: ${e.message || e}`);
    }
  } else {
    alert("Inspection saved locally!\n\nConfigure Google Apps Script URL or sign in under Settings to sync to Drive & Sheets.");
  }
  updateSyncStatusBar();
  showScreen("home");
}




function saveCurrentInspectionAsPdf() {
  const insp = APP_STATE.inspections[currentInspectionId];
  const project = APP_STATE.artProjects[insp.artNo];
  PdfExport.exportArtWisePdf(project, insp);
}

// ---------------------------------------------------------------
// PHOTOS TAB (GALLERY)
// ---------------------------------------------------------------
function renderPhotosGallery() {
  const artFilter = $("#gallery-art-filter").value;
  const deptFilter = $("#gallery-dept-filter").value;

  // Populate Art No dropdown filter
  const artNumbers = Object.keys(APP_STATE.artProjects);
  $("#gallery-art-filter").innerHTML = `<option value="ALL">All Art Numbers</option>` +
    artNumbers.map((a) => `<option value="${a}" ${a === artFilter ? "selected" : ""}>${a}</option>`).join("");

  // Collect all photos
  const allPhotos = [];
  Object.values(APP_STATE.inspections).forEach((insp) => {
    Object.values(insp.lineItems).forEach((item) => {
      item.photos.forEach((photo) => {
        allPhotos.push({
          photo,
          insp,
          item,
          artNo: insp.artNo,
          department: item.department
        });
      });
    });
  });

  const filtered = allPhotos.filter((p) => {
    if (artFilter !== "ALL" && p.artNo !== artFilter) return false;
    if (deptFilter !== "ALL" && p.department !== deptFilter) return false;
    return true;
  });

  const container = $("#photo-gallery-container");
  if (filtered.length === 0) {
    container.innerHTML = `<div class="card"><p style="font-size:12px; color:var(--text-secondary); text-align:center;">No photos found for the selected filter.</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="photo-gallery-grid">
      ${filtered.map(({ photo, insp, item }) => `
        <div class="gallery-card">
          <img src="${photo.localUrl}" onclick="openLightboxDirect('${photo.localUrl}', '${item.drNo} - ${item.productName}', '${insp.artNo}')" />
          <div class="gallery-card-info">
            <p style="font-weight:600; margin:0;">${item.drNo}</p>
            <p style="margin:2px 0 0; color:var(--text-muted); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${item.productName}</p>
            <span class="badge badge-drno" style="font-size:9px; margin-top:4px;">${insp.artNo}</span>
          </div>
        </div>
      `).join("")}
    </div>`;
}

function openLightboxDirect(url, title, artNo) {
  $("#lightbox-title").textContent = title;
  $("#lightbox-image").src = url;
  $("#lightbox-details").textContent = `Art No: ${artNo}`;
  $("#lightbox-modal").classList.add("active");
}

// ---------------------------------------------------------------
// REPORTS & CSV EXPORT
// ---------------------------------------------------------------
function renderReports() {
  const stats = getDashboardStats();
  $("#dashboard-cards").innerHTML = CONFIG.DEPARTMENTS.map((dept) => {
    const s = stats[dept];
    return `
      <div class="card" style="padding:12px 14px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">
          <span style="font-weight:600;">${dept}</span>
          <span style="color:var(--ok-text); font-weight:600;">${s.pctApproved}% Approved</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${s.pctApproved}%; background:var(--ok-text);"></div>
        </div>
        <p style="font-size:11px; color:var(--text-secondary); margin:4px 0 0;">${s.approved} Approved · ${s.rejected} Rejected (${s.total} Total)</p>
      </div>`;
  }).join("");

  // Render Top Rejection Reasons Chart
  const { counts, totalRejections } = getRejectionReasonStats();
  const reasonEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  $("#rejection-reasons-chart").innerHTML = reasonEntries.map(([reason, count]) => {
    const pct = totalRejections ? Math.round((count / totalRejections) * 100) : 0;
    return `
      <div style="margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:3px;">
          <span>${reason}</span>
          <span style="font-weight:600; color:var(--rejected-text);">${count} (${pct}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${pct}%; background:var(--rejected-text);"></div>
        </div>
      </div>`;
  }).join("");

  renderQcLogGroups();
}

function renderQcLogGroups() {
  const query = ($("#reports-search-input") ? $("#reports-search-input").value : "").toLowerCase().trim();

  const byArt = {};
  Object.values(APP_STATE.inspections).forEach((insp) => {
    if (!byArt[insp.artNo]) byArt[insp.artNo] = [];
    byArt[insp.artNo].push(insp);
  });

  let artEntries = Object.entries(byArt);
  if (query) {
    artEntries = artEntries.filter(([artNo, inspections]) => {
      const project = APP_STATE.artProjects[artNo] || {};
      const projName = (project.projectName || "").toLowerCase();
      if (artNo.toLowerCase().includes(query) || projName.includes(query)) return true;
      return inspections.some((i) =>
        Object.values(i.lineItems).some((item) =>
          item.drNo.toLowerCase().includes(query) || item.productName.toLowerCase().includes(query)
        )
      );
    });
  }

  if (artEntries.length === 0) {
    $("#qc-log-groups").innerHTML = `<div class="card"><p style="font-size:12px; color:var(--text-secondary); text-align:center;">No matching QC log records found.</p></div>`;
    return;
  }

  $("#qc-log-groups").innerHTML = artEntries
    .map(([artNo, inspections]) => renderArtGroup(artNo, inspections))
    .join("");

  bindReportEvents();
}

function renderArtGroup(artNo, inspections) {
  const project = APP_STATE.artProjects[artNo] || { projectName: "Project" };
  const rejectedCount = inspections.filter((i) => i.status === "rejected").length;

  const itemsHtml = inspections
    .flatMap((insp) =>
      Object.values(insp.lineItems).map((item) => {
        const rejected = Object.values(item.parameters).some((p) => p.state === "Rejected");
        return `
          <div style="padding:8px 0; border-top:1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <p style="font-size:12px; font-weight:600; margin:0;">${item.drNo} · ${item.productName}</p>
                <p style="font-size:11px; color:var(--text-secondary); margin:2px 0 0;">${item.size} · ${item.department} (${insp.qcType})</p>
              </div>
              <span class="badge" style="background:${rejected ? "var(--rejected-bg)" : "var(--ok-bg)"}; color:${rejected ? "var(--rejected-text)" : "var(--ok-text)"}; font-size:10px;">
                ${rejected ? "REJECTED" : "APPROVED"}
              </span>
            </div>
            <div class="btn-row" style="margin-top:8px;">
              <button class="btn btn-secondary view-record-btn" data-insp="${insp.id}" style="height:32px; font-size:11px;">👁 View</button>
              <button class="btn btn-secondary pdf-record-btn" data-insp="${insp.id}" data-drno="${item.drNo}" style="height:32px; font-size:11px;">⬇ Dr No PDF</button>
            </div>
          </div>`;
      })
    )
    .join("");

  return `
    <div class="card" style="padding:0; overflow:hidden; margin-bottom:12px;">
      <div style="background:var(--surface-muted); padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <p style="font-size:14px; font-weight:600; margin:0;">${artNo}</p>
          <p style="font-size:11px; color:var(--text-secondary); margin:2px 0 0;">${project.projectName}</p>
        </div>
        <span style="font-size:11px; color:${rejectedCount ? "var(--rejected-text)" : "var(--ok-text)"}; font-weight:600;">
          ${rejectedCount ? rejectedCount + " Rejected" : "All Approved"}
        </span>
      </div>
      <div style="padding:8px 14px;">${itemsHtml}</div>
      <div style="padding:10px 14px; border-top:1px solid var(--border);">
        <button class="btn btn-secondary" style="width:100%; height:36px; font-size:12px;" onclick="downloadArtGroupPdf('${artNo}')">⬇ Export Full ${artNo} QC Report PDF</button>
      </div>
    </div>`;
}

function downloadArtGroupPdf(artNo) {
  const project = APP_STATE.artProjects[artNo];
  const inspections = Object.values(APP_STATE.inspections).filter((i) => i.artNo === artNo);
  if (!inspections.length) return;
  const merged = { ...inspections[0], lineItems: {} };
  inspections.forEach((insp) => Object.assign(merged.lineItems, insp.lineItems));
  PdfExport.exportArtWisePdf(project, merged);
}

function exportQcLogToCsv() {
  const headers = [
    "Sr No", "Date", "Client", "Project Name", "PO No", "Department",
    "Job Card No", "Dr No", "Product Name", "Qty", "Size",
    ...CONFIG.QC_PARAMETERS,
    "Remark", "QC Status"
  ];

  const rows = [headers.join(",")];
  let srNo = 1;

  Object.values(APP_STATE.inspections).forEach((insp) => {
    const project = APP_STATE.artProjects[insp.artNo] || {};
    Object.values(insp.lineItems).forEach((item) => {
      const paramCells = CONFIG.QC_PARAMETERS.map((p) => {
        const res = item.parameters[p];
        if (res.state === "OK") return "OK";
        if (res.state === "Rejected") return `REJECTED (${res.reason || "Defect"})`;
        return "N/A";
      });

      const overallRejected = Object.values(item.parameters).some((p) => p.state === "Rejected");

      const row = [
        srNo++,
        `"${insp.qcDate}"`,
        `"${project.client || ""}"`,
        `"${project.projectName || ""}"`,
        `"${project.poNo || ""}"`,
        `"${item.department}"`,
        `"${insp.artNo}"`,
        `"${item.drNo}"`,
        `"${item.productName.replace(/"/g, '""')}"`,
        item.qty,
        `"${item.size}"`,
        ...paramCells.map((c) => `"${c}"`),
        `"${(item.remarks || "").replace(/"/g, '""')}"`,
        overallRejected ? "QC REJECTED" : "QC APPROVED"
      ];
      rows.push(row.join(","));
    });
  });

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `FurniQc_Report_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function bindReportEvents() {
  $all(".pdf-record-btn").forEach((el) =>
    el.addEventListener("click", () => {
      const insp = APP_STATE.inspections[el.dataset.insp];
      const project = APP_STATE.artProjects[insp.artNo];
      PdfExport.exportSingleDrNoPdf(project, insp, el.dataset.drno);
    })
  );
  $all(".view-record-btn").forEach((el) =>
    el.addEventListener("click", () => {
      currentInspectionId = el.dataset.insp;
      renderInspectionScreen();
      showScreen("inspection");
    })
  );
}

// ---------------------------------------------------------------
// CUSTOM ITEM MODAL HANDLERS
// ---------------------------------------------------------------
function openAddItemModal() {
  $("#custom-dr-no").value = "";
  $("#custom-product-name").value = "";
  $("#custom-size").value = "";
  $("#custom-qty").value = "1";
  $("#add-item-modal").classList.add("active");
}

function closeAddItemModal() {
  $("#add-item-modal").classList.remove("active");
}

function confirmAddCustomItem() {
  if (!currentInspectionId) return;
  const drNoRaw = $("#custom-dr-no").value.trim();
  const productName = $("#custom-product-name").value.trim();
  const size = $("#custom-size").value.trim();
  const qty = parseInt($("#custom-qty").value, 10) || 1;

  if (!drNoRaw || !productName) {
    alert("Please fill in Dr No and Product Name.");
    return;
  }

  const drNo = drNoRaw.startsWith("DR-") ? drNoRaw : `DR-${drNoRaw}`;
  const insp = APP_STATE.inspections[currentInspectionId];
  const drItem = { drNo, productName, size, qty };

  upsertDrItem(insp.artNo, drItem);
  addLineItemToInspection(currentInspectionId, drItem);

  closeAddItemModal();
  renderInspectionScreen();
}

// ---------------------------------------------------------------
// SETTINGS SCREEN
// ---------------------------------------------------------------
function renderSettings() {
  updateSyncStatusBar();
}

// ---------------------------------------------------------------
// INITIALIZATION & EVENT BINDINGS
// ---------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  $all(".nav-item").forEach((el) => el.addEventListener("click", () => showScreen(el.dataset.screen)));
  $("#back-to-home").addEventListener("click", () => showScreen("home"));

  // PDF import & Template loader
  $("#pdf-upload-input").addEventListener("change", (e) => {
    if (e.target.files[0]) handlePdfImport(e.target.files[0]);
  });
  $("#load-sample-btn").addEventListener("click", () => {
    loadSampleTemplate($("#sample-template-select").value);
  });

  // Manual project creation
  $("#manual-create-btn").addEventListener("click", () => {
    const artNo = $("#manual-art-no").value.trim();
    const projectName = $("#manual-project-name").value.trim();
    const poNo = $("#manual-po-no").value.trim();
    if (!artNo || !projectName) return alert("Art No and Project Name are required.");
    upsertArtProject({ artNo, projectName, client: "", poNo });
    startInspection(artNo, $("#new-qc-type").value);
  });

  // Inspection screen actions
  $("#save-qc-btn").addEventListener("click", saveCurrentInspection);
  $("#save-pdf-btn").addEventListener("click", saveCurrentInspectionAsPdf);
  $("#add-custom-item-btn").addEventListener("click", openAddItemModal);

  // Modals confirmation
  $("#confirm-rejection-btn").addEventListener("click", confirmRejection);
  $("#confirm-add-item-btn").addEventListener("click", confirmAddCustomItem);

  // Rejection severity pills
  $all(".severity-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      $all(".severity-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
    });
  });

  // Gallery filters
  $("#gallery-art-filter").addEventListener("change", renderPhotosGallery);
  $("#gallery-dept-filter").addEventListener("change", renderPhotosGallery);

  // Reports search & CSV Export
  $("#reports-search-input")?.addEventListener("input", renderQcLogGroups);
  $("#export-csv-btn").addEventListener("click", exportQcLogToCsv);

  // Settings & Sync
  $("#reset-sample-data-btn").addEventListener("click", () => {
    if (confirm("Reset all data to sample records? This will overwrite local state.")) {
      resetStateToSample();
      renderHome();
      alert("State reset to sample data.");
    }
  });

  $("#google-signin-btn").addEventListener("click", () => GoogleAuth.signIn());
  GoogleAuth.init(() => {
    $("#google-signin-btn").textContent = "Signed in ✓";
    updateSyncStatusBar();
  });

  // Online / Offline connectivity events
  window.addEventListener("online", updateSyncStatusBar);
  window.addEventListener("offline", updateSyncStatusBar);

  showScreen("home");
});

