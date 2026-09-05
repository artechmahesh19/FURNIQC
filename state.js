const STORAGE_KEY = "furniqc_state_v1";

function getInitialSampleState() {
  const artProjects = {
    "ART-90": {
      artNo: "ART-90",
      projectName: "The Bougain Villa",
      client: "Oberoi Luxury Living",
      poNo: "PO-2026-8812",
      drItems: {
        "DR-405": { drNo: "DR-405", productName: "Tall Unit Base Carcass", size: "1015 x 440 x 1095", qty: 1, department: "Panel" },
        "DR-406": { drNo: "DR-406", productName: "Tall Unit Shutter Panel", size: "1015 x 20 x 1095", qty: 2, department: "Panel" },
        "DR-407": { drNo: "DR-407", productName: "Master Bed Cushion Headboard", size: "1800 x 150 x 1200", qty: 1, department: "Upholstery" },
        "DR-408": { drNo: "DR-408", productName: "Solid Wood Dining Table Top", size: "2100 x 900 x 750", qty: 1, department: "Solid" }
      }
    },
    "ART-102": {
      artNo: "ART-102",
      projectName: "TechPark Corporate HQ",
      client: "TechPark Infra Ltd",
      poNo: "PO-2026-9041",
      drItems: {
        "DR-101": { drNo: "DR-101", productName: "Executive Manager Desk Table", size: "1600 x 800 x 750", qty: 4, department: "Panel" },
        "DR-102": { drNo: "DR-102", productName: "Side Credenza Storage Unit", size: "1200 x 450 x 650", qty: 4, department: "Panel" }
      }
    }
  };

  // Generate SVG data URIs for sample photos
  const createSamplePhotoSvg = (label, color) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
      <rect width="100%" height="100%" fill="${color}"/>
      <circle cx="150" cy="120" r="45" fill="rgba(255,255,255,0.2)"/>
      <path d="M 70 240 Q 150 160 230 240" stroke="rgba(255,255,255,0.4)" stroke-width="8" fill="none"/>
      <text x="50%" y="82%" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle">${label}</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  const samplePhoto1 = createSamplePhotoSvg("DR-405 Base Inspection", "#1e3a8a");
  const samplePhoto2 = createSamplePhotoSvg("DR-406 Shutter Peeling Defect", "#991b1b");
  const samplePhoto3 = createSamplePhotoSvg("DR-101 Executive Desk OK", "#065f46");

  const buildDefaultParams = (override = {}) => {
    const params = {};
    CONFIG.QC_PARAMETERS.forEach((p) => {
      params[p] = override[p] || { state: "OK", reason: null, severity: null };
    });
    return params;
  };

  const buildDefaultDepts = (override = {}) => {
    const depts = {};
    CONFIG.QC_DEPARTMENTS.forEach((d) => {
      depts[d] = override[d] || { state: "OK", reason: null, severity: null };
    });
    return depts;
  };

  const insp1Id = "insp_ART-90_sample01";
  const insp2Id = "insp_ART-102_sample02";

  const inspections = {
    [insp1Id]: {
      id: insp1Id,
      artNo: "ART-90",
      qcType: "Fresh QC",
      qcDate: new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10),
      inspector: "Rakesh Sharma",
      linkedFreshQcId: null,
      status: "rejected",
      createdAt: Date.now() - 86400000 * 2,
      savedAt: Date.now() - 86400000 * 2,
      lineItems: {
        "DR-405": {
          drNo: "DR-405",
          productName: "Tall Unit Base Carcass",
          size: "1015 x 440 x 1095",
          qty: 1,
          department: "Panel",
          departments: buildDefaultDepts({
            "Panel": { state: "OK" },
            "Polish": { state: "OK" },
            "Solid": { state: "N/A" },
            "Upholstery": { state: "N/A" }
          }),
          parameters: buildDefaultParams(),
          remarks: "Carcass assembly aligned properly.",
          photos: [{ id: "p_101", driveFileId: null, localUrl: samplePhoto1 }]
        },
        "DR-406": {
          drNo: "DR-406",
          productName: "Tall Unit Shutter Panel",
          size: "1015 x 20 x 1095",
          qty: 2,
          department: "Panel",
          departments: buildDefaultDepts({
            "Panel": { state: "Rejected", reason: "Edgeband Peeling / Gap", severity: "Major" },
            "Polish": { state: "OK" },
            "Solid": { state: "N/A" },
            "Upholstery": { state: "N/A" }
          }),
          parameters: buildDefaultParams({
            "Edgeband": { state: "Rejected", reason: "Edgeband Peeling / Gap", severity: "Major" }
          }),
          remarks: "Bottom edge tape peeling along 200mm length.",
          photos: [{ id: "p_102", driveFileId: null, localUrl: samplePhoto2 }]
        },
        "DR-407": {
          drNo: "DR-407",
          productName: "Master Bed Cushion Headboard",
          size: "1800 x 150 x 1200",
          qty: 1,
          department: "Upholstery",
          departments: buildDefaultDepts({
            "Panel": { state: "N/A" },
            "Polish": { state: "N/A" },
            "Solid": { state: "OK" },
            "Upholstery": { state: "OK" }
          }),
          parameters: buildDefaultParams(),
          remarks: "Upholstery stitching clean.",
          photos: []
        }
      }
    },
    [insp2Id]: {
      id: insp2Id,
      artNo: "ART-102",
      qcType: "Fresh QC",
      qcDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      inspector: "Mahesh Kumar",
      linkedFreshQcId: null,
      status: "approved",
      createdAt: Date.now() - 86400000,
      savedAt: Date.now() - 86400000,
      lineItems: {
        "DR-101": {
          drNo: "DR-101",
          productName: "Executive Manager Desk Table",
          size: "1600 x 800 x 750",
          qty: 4,
          department: "Panel",
          departments: buildDefaultDepts({
            "Panel": { state: "OK" },
            "Polish": { state: "OK" },
            "Solid": { state: "OK" },
            "Upholstery": { state: "N/A" }
          }),
          parameters: buildDefaultParams(),
          remarks: "Desk assembly verified.",
          photos: [{ id: "p_201", driveFileId: null, localUrl: samplePhoto3 }]
        },
        "DR-102": {
          drNo: "DR-102",
          productName: "Side Credenza Storage Unit",
          size: "1200 x 450 x 650",
          qty: 4,
          department: "Panel",
          departments: buildDefaultDepts({
            "Panel": { state: "OK" },
            "Polish": { state: "OK" },
            "Solid": { state: "N/A" },
            "Upholstery": { state: "N/A" }
          }),
          parameters: buildDefaultParams(),
          remarks: "Soft-close hinges working smoothly.",
          photos: []
        }
      }
    }
  };

  return {
    artProjects,
    inspections,
    syncQueue: []
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      // Ensure all line items have both 8 parameters and 4 departments
      if (state.inspections) {
        Object.values(state.inspections).forEach((insp) => {
          if (insp.lineItems) {
            Object.values(insp.lineItems).forEach((item) => {
              // Ensure 4 departments exist
              if (!item.departments) {
                item.departments = {};
                CONFIG.QC_DEPARTMENTS.forEach((d) => {
                  item.departments[d] = { state: "OK", reason: null, severity: null };
                });
              }
              // Ensure 8 QC parameters exist
              if (!item.parameters || Object.keys(item.parameters).length < 8) {
                const currentParams = item.parameters || {};
                item.parameters = {};
                CONFIG.QC_PARAMETERS.forEach((p) => {
                  item.parameters[p] = currentParams[p] || { state: "OK", reason: null, severity: null };
                });
              }
            });
          }
        });
      }
      return state;
    }
  } catch (e) {
    console.error("Failed to load local state, starting fresh:", e);
  }
  const initialState = getInitialSampleState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState));
  return initialState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(APP_STATE));
}

function resetStateToSample() {
  APP_STATE = getInitialSampleState();
  saveState();
}

let APP_STATE = loadState();

// ---- Art Project / Dr No helpers -------------------------------------

function upsertArtProject({ artNo, projectName, client, poNo }) {
  if (!APP_STATE.artProjects[artNo]) {
    APP_STATE.artProjects[artNo] = { artNo, projectName, client, poNo, drItems: {} };
  } else {
    Object.assign(APP_STATE.artProjects[artNo], { projectName, client, poNo });
  }
  saveState();
  return APP_STATE.artProjects[artNo];
}

function upsertDrItem(artNo, drItem) {
  const project = APP_STATE.artProjects[artNo];
  if (!project) throw new Error(`Unknown Art No ${artNo} — create the project first`);
  project.drItems[drItem.drNo] = { ...project.drItems[drItem.drNo], ...drItem };
  saveState();
  return project.drItems[drItem.drNo];
}

function deleteDrItem(artNo, drNo) {
  const project = APP_STATE.artProjects[artNo];
  if (project) {
    delete project.drItems[drNo];
    saveState();
  }
}

// ---- QC Inspection helpers --------------------------------------------

function detectDepartment(productName, drNo) {
  const text = `${productName} ${drNo}`.toLowerCase();
  for (const [dept, keywords] of Object.entries(CONFIG.DEPARTMENT_KEYWORDS)) {
    if (keywords.some((k) => text.includes(k))) return dept;
  }
  return "Panel";
}

function makeInspection({ artNo, qcType, inspector }) {
  const id = `insp_${artNo}_${Date.now()}`;
  const inspection = {
    id,
    artNo,
    qcType,               // "Fresh QC" | "Re-QC"
    qcDate: new Date().toISOString().slice(0, 10),
    inspector: inspector || "Unassigned",
    linkedFreshQcId: null,
    lineItems: {},
    status: "draft",       // "draft" | "approved" | "rejected"
    createdAt: Date.now()
  };
  APP_STATE.inspections[id] = inspection;
  saveState();
  return inspection;
}

function addLineItemToInspection(inspectionId, drItem) {
  const insp = APP_STATE.inspections[inspectionId];
  const params = {};
  CONFIG.QC_PARAMETERS.forEach((p) => (params[p] = { state: "OK", reason: null, severity: null }));
  const depts = {};
  CONFIG.QC_DEPARTMENTS.forEach((d) => (depts[d] = { state: "OK", reason: null, severity: null }));

  insp.lineItems[drItem.drNo] = {
    drNo: drItem.drNo,
    productName: drItem.productName,
    size: drItem.size || "",
    qty: drItem.qty || 1,
    department: detectDepartment(drItem.productName, drItem.drNo),
    departments: depts,
    parameters: params,
    remarks: "",
    photos: []
  };
  saveState();
  return insp.lineItems[drItem.drNo];
}

function excludeLineItem(inspectionId, drNo) {
  const insp = APP_STATE.inspections[inspectionId];
  delete insp.lineItems[drNo];
  saveState();
}

function setParameterResult(inspectionId, drNo, paramName, { state, reason, severity }) {
  const item = APP_STATE.inspections[inspectionId].lineItems[drNo];
  if (!item.parameters) item.parameters = {};
  item.parameters[paramName] = { state, reason: reason || null, severity: severity || null };
  saveState();
}

function setDepartmentResult(inspectionId, drNo, deptName, { state, reason, severity }) {
  const item = APP_STATE.inspections[inspectionId].lineItems[drNo];
  if (!item.departments) item.departments = {};
  item.departments[deptName] = { state, reason: reason || null, severity: severity || null };
  saveState();
}

function addPhotoToLineItem(inspectionId, drNo, photo) {
  APP_STATE.inspections[inspectionId].lineItems[drNo].photos.push(photo);
  saveState();
}

function deletePhotoFromLineItem(inspectionId, drNo, photoId) {
  const item = APP_STATE.inspections[inspectionId].lineItems[drNo];
  item.photos = item.photos.filter((p) => p.id !== photoId);
  saveState();
}

function recapturePhoto(inspectionId, drNo, photoId, newPhoto) {
  const item = APP_STATE.inspections[inspectionId].lineItems[drNo];
  const idx = item.photos.findIndex((p) => p.id === photoId);
  if (idx > -1) item.photos[idx] = { ...item.photos[idx], ...newPhoto, id: photoId };
  saveState();
}

function getItemResponsibleDepartment(item) {
  const rejected = [];
  if (item.departments) {
    Object.entries(item.departments).forEach(([d, val]) => {
      if (val && val.state === "Rejected") rejected.push(d);
    });
  }
  if (item.parameters) {
    // If a parameter is rejected, associate with relevant department if not already added
    if (item.parameters["Outer/Polish/Veneer/Pu/Metal"]?.state === "Rejected" && !rejected.includes("Polish")) {
      rejected.push("Polish");
    }
    if (item.parameters["Edgeband"]?.state === "Rejected" && !rejected.includes("Panel")) {
      rejected.push("Panel");
    }
    if (item.parameters["Fabric"]?.state === "Rejected" && !rejected.includes("Upholstery")) {
      rejected.push("Upholstery");
    }
  }
  return rejected.length > 0 ? rejected.join(", ") : "-";
}

function computeInspectionStatus(inspection) {
  const items = Object.values(inspection.lineItems);
  if (items.length === 0) return "draft";
  const anyRejected = items.some((item) => {
    const paramsRejected = item.parameters && Object.values(item.parameters).some((p) => p.state === "Rejected");
    const deptsRejected = item.departments && Object.values(item.departments).some((d) => d.state === "Rejected");
    return paramsRejected || deptsRejected;
  });
  return anyRejected ? "rejected" : "approved";
}

function finalizeInspection(inspectionId) {
  const insp = APP_STATE.inspections[inspectionId];
  insp.status = computeInspectionStatus(insp);
  insp.savedAt = Date.now();
  if (!APP_STATE.syncQueue.includes(inspectionId)) {
    APP_STATE.syncQueue.push(inspectionId);
  }
  saveState();
  return insp;
}

function deleteInspection(inspectionId) {
  delete APP_STATE.inspections[inspectionId];
  APP_STATE.syncQueue = APP_STATE.syncQueue.filter((id) => id !== inspectionId);
  saveState();
}

// ---- Dashboard & Rejection Analytics --------------------------------

function getDashboardStats() {
  const stats = {};
  CONFIG.DEPARTMENTS.forEach((d) => (stats[d] = { approved: 0, rejected: 0, na: 0 }));

  Object.values(APP_STATE.inspections).forEach((insp) => {
    if (insp.status !== "approved" && insp.status !== "rejected") return;
    Object.values(insp.lineItems).forEach((item) => {
      CONFIG.DEPARTMENTS.forEach((dept) => {
        const dVal = item.departments && item.departments[dept];
        if (dVal) {
          if (dVal.state === "Rejected") {
            stats[dept].rejected += 1;
          } else if (dVal.state === "OK") {
            stats[dept].approved += 1;
          } else if (dVal.state === "N/A") {
            stats[dept].na += 1;
          }
        }
      });
    });
  });

  Object.keys(stats).forEach((dept) => {
    const { approved, rejected } = stats[dept];
    const total = approved + rejected;
    stats[dept].total = total;
    stats[dept].pctApproved = total ? Math.round((approved / total) * 100) : 0;
    stats[dept].pctRejected = total ? Math.round((rejected / total) * 100) : 0;
  });

  return stats;
}

function getRejectionReasonStats() {
  const counts = {};
  CONFIG.REJECTION_REASONS.forEach((r) => (counts[r] = 0));

  let totalRejections = 0;
  Object.values(APP_STATE.inspections).forEach((insp) => {
    Object.values(insp.lineItems).forEach((item) => {
      if (item.parameters) {
        Object.values(item.parameters).forEach((param) => {
          if (param.state === "Rejected" && param.reason) {
            counts[param.reason] = (counts[param.reason] || 0) + 1;
            totalRejections++;
          }
        });
      }
      if (item.departments) {
        Object.values(item.departments).forEach((dept) => {
          if (dept.state === "Rejected" && dept.reason) {
            counts[dept.reason] = (counts[dept.reason] || 0) + 1;
            totalRejections++;
          }
        });
      }
    });
  });

  return { counts, totalRejections };
}



