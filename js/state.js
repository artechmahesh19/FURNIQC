const STORAGE_KEY = "furniqc_state_v1";

function getInitialSampleState() {
  return {
    artProjects: {},
    inspections: {},
    syncQueue: []
  };
}

function getInspectionScore(insp) {
  if (!insp || !insp.lineItems) {
    return { total: 0, approved: 0, rejected: 0, pctApproved: 100, pctRejected: 0, label: "100% OK", color: "#6ee7b7", bg: "#065f46", border: "#10b981" };
  }

  const items = Object.values(insp.lineItems);
  const total = items.length;
  if (total === 0) {
    return { total: 0, approved: 0, rejected: 0, pctApproved: 100, pctRejected: 0, label: "0 Items", color: "#a1a1b3", bg: "#272730", border: "#424250" };
  }

  let rejectedCount = 0;
  items.forEach((item) => {
    const isDeptRejected = item.departments && Object.values(item.departments).some((d) => d && d.state === "Rejected");
    const isParamRejected = item.parameters && Object.values(item.parameters).some((p) => p && p.state === "Rejected");
    if (isDeptRejected || isParamRejected) {
      rejectedCount++;
    }
  });

  const approvedCount = total - rejectedCount;
  const pctApproved = Math.round((approvedCount / total) * 100);
  const pctRejected = 100 - pctApproved;

  let color = "#6ee7b7";
  let bg = "#065f46";
  let border = "#10b981";
  let label = `${pctApproved}% OK (${approvedCount}/${total})`;

  if (pctApproved === 100) {
    color = "#6ee7b7";
    bg = "#065f46";
    border = "#10b981";
    label = `100% OK · ${total}/${total} Passed`;
  } else if (pctApproved >= 60) {
    color = "#fde68a";
    bg = "#78350f";
    border = "#f59e0b";
    label = `${pctApproved}% OK · ${rejectedCount} Rej`;
  } else {
    color = "#fca5a5";
    bg = "#7f1d1d";
    border = "#ef4444";
    label = `${pctApproved}% OK · ${rejectedCount} Rej`;
  }

  return { total, approved: approvedCount, rejected: rejectedCount, pctApproved, pctRejected, label, color, bg, border };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const state = JSON.parse(raw);

      // Clean out mock sample inspections that user never created
      if (state.inspections) {
        const cleanedInspections = {};
        Object.entries(state.inspections).forEach(([id, insp]) => {
          if (id.includes("sample01") || id.includes("sample02") || id.includes("sample03")) {
            return; // Skip mock fake sample inspections
          }
          cleanedInspections[id] = insp;
        });
        state.inspections = cleanedInspections;
      }

      // Clean out sample projects if no real inspections exist for them
      if (state.artProjects) {
        const activeArtNos = new Set(Object.values(state.inspections || {}).map((i) => i.artNo));
        const cleanedProjects = {};
        Object.entries(state.artProjects).forEach(([artNo, proj]) => {
          if ((artNo === "ART-90" || artNo === "ART-102") && !activeArtNos.has(artNo)) {
            return; // Skip mock sample projects
          }
          cleanedProjects[artNo] = proj;
        });
        state.artProjects = cleanedProjects;
      }

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

function resetStateToEmpty() {
  APP_STATE = getInitialSampleState();
  saveState();
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



