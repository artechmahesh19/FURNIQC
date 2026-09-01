// ============================================================
// FurniQc — Google Drive photo backup
//
// Folder structure (Month -> QC Round -> Art No with Date -> Dr No -> Photos):
//   FurniQc / {Month} / {Fresh QC | Re-QC} / {Art No}_{QC Date} / {Dr No} / photo_001.jpg
//
// Example:
//   FurniQc / August / Fresh QC / ART-90_2026-08-22 / DR-405 / photo_001.jpg
//   FurniQc / August / Re-QC     / ART-90_2026-08-22 / DR-405 / photo_001.jpg
// ============================================================

const GoogleDrive = (() => {
  const folderCache = {};

  const MONTH_NAMES = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  function getMonthName(dateStr) {
    const parts = (dateStr || "").split("-");
    if (parts.length >= 2) {
      const monthIdx = parseInt(parts[1], 10) - 1;
      return MONTH_NAMES[monthIdx] || "General";
    }
    return "General";
  }

  // Compress image client-side before uploading to save bandwidth
  function compressImage(blob, maxDim = 1600, quality = 0.75) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((compressed) => resolve(compressed || blob), "image/jpeg", quality);
      };
      img.onerror = () => resolve(blob);
      img.src = URL.createObjectURL(blob);
    });
  }

  // Converts Blob to Base64 string
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Upload photo using Apps Script Web App
  async function uploadViaAppsScript({ artNo, drNo, qcDate, qcType, fileBlob, fileName }) {
    const compressed = await compressImage(fileBlob);
    const base64Data = await blobToBase64(compressed);

    const payload = {
      action: "uploadPhoto",
      artNo,
      drNo,
      qcDate,
      qcType: qcType || "Fresh QC",
      fileName: fileName || `photo_${Date.now()}.jpg`,
      base64Data,
      mimeType: "image/jpeg"
    };

    const resp = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain" }
    });

    return resp.json();
  }

  // Upload photo using Google Drive API (OAuth)
  async function findOrCreateFolder(name, parentId) {
    const cacheKey = `${parentId || "root"}::${name}`;
    if (folderCache[cacheKey]) return folderCache[cacheKey];

    const safeName = name.replace(/'/g, "\\'");
    const q = [
      `name='${safeName}'`,
      "mimeType='application/vnd.google-apps.folder'",
      "trashed=false",
      parentId ? `'${parentId}' in parents` : "'root' in parents"
    ].join(" and ");

    const searchResp = await gapi.client.drive.files.list({
      q,
      fields: "files(id, name)",
      spaces: "drive"
    });

    if (searchResp.result.files && searchResp.result.files.length > 0) {
      folderCache[cacheKey] = searchResp.result.files[0].id;
      return folderCache[cacheKey];
    }

    const createResp = await gapi.client.drive.files.create({
      resource: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: parentId ? [parentId] : undefined
      },
      fields: "id"
    });
    folderCache[cacheKey] = createResp.result.id;
    return folderCache[cacheKey];
  }

  // Creates folder path: FurniQc / {Month} / {Fresh QC | Re-QC} / {Art No}_{QC Date} / {Dr No}
  async function ensurePhotoFolderPath({ artNo, drNo, qcDate, qcType }) {
    const monthName = getMonthName(qcDate);
    const roundFolder = qcType || "Fresh QC";
    const artDateFolder = `${artNo}_${qcDate}`;

    const rootId = await findOrCreateFolder(CONFIG.DRIVE_ROOT_FOLDER_NAME, null);
    const monthId = await findOrCreateFolder(monthName, rootId);
    const roundId = await findOrCreateFolder(roundFolder, monthId);
    const artDateId = await findOrCreateFolder(artDateFolder, roundId);
    const drId = await findOrCreateFolder(drNo, artDateId);
    return drId;
  }

  async function uploadViaDriveApi({ artNo, drNo, qcDate, qcType, fileBlob, fileName }) {
    const folderId = await ensurePhotoFolderPath({ artNo, drNo, qcDate, qcType });
    const compressed = await compressImage(fileBlob);

    const metadata = { name: fileName, parents: [folderId] };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", compressed);

    const resp = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${gapi.client.getToken().access_token}` },
        body: form
      }
    );
    return resp.json();
  }

  // Unified upload photo function
  async function uploadPhoto({ artNo, drNo, qcDate, qcType, fileBlob, fileName }) {
    if (CONFIG.APPS_SCRIPT_URL && !CONFIG.APPS_SCRIPT_URL.includes("YOUR_DEPLOYMENT_ID")) {
      return uploadViaAppsScript({ artNo, drNo, qcDate, qcType, fileBlob, fileName });
    } else if (typeof GoogleAuth !== "undefined" && GoogleAuth.isSignedIn()) {
      return uploadViaDriveApi({ artNo, drNo, qcDate, qcType, fileBlob, fileName });
    }
    throw new Error("No Google Cloud or Apps Script connection configured.");
  }

  // Batch backup all photos for all line items in an inspection to Drive
  async function backupInspectionPhotos(inspection, project) {
    const hasAppsScript = CONFIG.APPS_SCRIPT_URL && !CONFIG.APPS_SCRIPT_URL.includes("YOUR_DEPLOYMENT_ID");
    const hasOAuth = typeof GoogleAuth !== "undefined" && GoogleAuth.isSignedIn();
    if (!hasAppsScript && !hasOAuth) return;

    const artNo = project.artNo;
    const qcDate = inspection.qcDate;
    const qcType = inspection.qcType || "Fresh QC";
    let photoCount = 1;

    for (const [drNo, item] of Object.entries(inspection.lineItems)) {
      for (const photo of item.photos) {
        if (photo.driveFileId) continue;
        if (!photo.localUrl || photo.localUrl.startsWith("data:image/svg")) continue;

        try {
          const resp = await fetch(photo.localUrl);
          const blob = await resp.blob();
          const fileName = `photo_${String(photoCount).padStart(3, "0")}.jpg`;
          const result = await uploadPhoto({ artNo, drNo, qcDate, qcType, fileBlob: blob, fileName });
          if (result && (result.fileId || result.id)) {
            photo.driveFileId = result.fileId || result.id;
            photo.webViewLink = result.webViewLink || null;
            photoCount++;
          }
        } catch (e) {
          console.warn(`Photo backup failed for ${drNo} photo ${photo.id}:`, e);
        }
      }
    }
    saveState();
  }

  async function overwritePhoto({ driveFileId, fileBlob }) {
    if (typeof GoogleAuth !== "undefined" && GoogleAuth.isSignedIn()) {
      const compressed = await compressImage(fileBlob);
      const resp = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=media`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${gapi.client.getToken().access_token}`,
            "Content-Type": "image/jpeg"
          },
          body: compressed
        }
      );
      return resp.json();
    }
    return { success: false };
  }

  async function deletePhoto(driveFileId) {
    if (typeof GoogleAuth !== "undefined" && GoogleAuth.isSignedIn()) {
      return gapi.client.drive.files.delete({ fileId: driveFileId });
    }
    return { success: false };
  }

  return { uploadPhoto, overwritePhoto, deletePhoto, ensurePhotoFolderPath, backupInspectionPhotos, getMonthName };
})();



