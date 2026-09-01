const PdfExport = (() => {
  function drawHeader(doc, project, inspection, y) {
    // Title Banner
    doc.setFillColor(30, 30, 36);
    doc.rect(14, y, 182, 22, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("FurniQc — QC Inspection Report", 20, y + 14);

    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");

    const infoY = y + 30;
    doc.text(`Art Number: ${project.artNo || "-"}`, 14, infoY);
    doc.text(`Project Name: ${project.projectName || "-"}`, 14, infoY + 6);
    doc.text(`Client: ${project.client || "-"}`, 14, infoY + 12);

    doc.text(`QC Round: ${inspection.qcType || "Fresh QC"}`, 110, infoY);
    doc.text(`QC Date: ${inspection.qcDate || "-"}`, 110, infoY + 6);
    doc.text(`Inspector: ${inspection.inspector || "-"}`, 110, infoY + 12);

    return infoY + 20;
  }

  function drawLineItemSection(doc, item, y) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }

    const anyRejected = Object.values(item.parameters).some((p) => p.state === "Rejected");

    // Item Header Box
    doc.setFillColor(anyRejected ? 254 : 240, anyRejected ? 242 : 253, anyRejected ? 242 : 244);
    doc.setDrawColor(anyRejected ? 239 : 16, anyRejected ? 68 : 185, anyRejected ? 68 : 129);
    doc.rect(14, y, 182, 14, "FD");

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text(`${item.drNo} · ${item.productName}`, 18, y + 9);

    const resultBadgeText = anyRejected ? "REJECTED" : "APPROVED";
    doc.setTextColor(anyRejected ? 185 : 5, anyRejected ? 28 : 150, anyRejected ? 28 : 105);
    doc.text(resultBadgeText, 160, y + 9);

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text(`Dimensions: ${item.size || "-"}  |  Quantity: ${item.qty}  |  Department: ${item.department}`, 18, y + 20);

    let rowY = y + 26;

    // Parameter Table Headers
    doc.setFillColor(240, 240, 245);
    doc.rect(18, rowY, 174, 6, "F");
    doc.setFontSize(8);
    doc.setFont(undefined, "bold");
    doc.setTextColor(60, 60, 60);
    doc.text("QC PARAMETER", 22, rowY + 4);
    doc.text("STATUS", 115, rowY + 4);
    doc.text("DEFECT REASON / REMARKS", 140, rowY + 4);

    rowY += 8;

    doc.setFont(undefined, "normal");
    Object.entries(item.parameters).forEach(([param, result]) => {
      if (rowY > 270) {
        doc.addPage();
        rowY = 20;
      }

      doc.setTextColor(40, 40, 40);
      doc.text(param, 22, rowY);

      if (result.state === "OK") {
        doc.setTextColor(16, 185, 129);
        doc.text("✓ OK", 115, rowY);
        doc.setTextColor(120, 120, 120);
        doc.text("-", 140, rowY);
      } else if (result.state === "Rejected") {
        doc.setTextColor(220, 38, 38);
        doc.text("✘ REJECTED", 115, rowY);
        doc.setTextColor(180, 40, 40);
        const reasonText = `${result.reason || "Defect"} [${result.severity || "Major"}]`;
        doc.text(reasonText.slice(0, 30), 140, rowY);
      } else {
        doc.setTextColor(120, 120, 120);
        doc.text("— N/A", 115, rowY);
        doc.text("-", 140, rowY);
      }

      rowY += 5;
    });

    if (item.remarks) {
      doc.setFont(undefined, "italic");
      doc.setTextColor(80, 80, 80);
      doc.text(`Item Remarks: ${item.remarks}`, 22, rowY + 2);
      rowY += 6;
    }

    return rowY + 8;
  }

  function exportArtWisePdf(project, inspection) {
    const doc = new jspdf.jsPDF();
    let y = drawHeader(doc, project, inspection, 14);

    Object.values(inspection.lineItems).forEach((item) => {
      y = drawLineItemSection(doc, item, y);
    });

    // Summary Section
    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    const overallRejected = Object.values(inspection.lineItems).some((item) =>
      Object.values(item.parameters).some((p) => p.state === "Rejected")
    );

    doc.setDrawColor(200, 200, 200);
    doc.line(14, y, 196, y);
    y += 10;

    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    if (overallRejected) {
      doc.setTextColor(220, 38, 38);
      doc.text("OVERALL INSPECTION RESULT: REJECTED", 14, y);
    } else {
      doc.setTextColor(16, 185, 129);
      doc.text("OVERALL INSPECTION RESULT: APPROVED", 14, y);
    }

    y += 16;
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Verified By Inspector: ${inspection.inspector || "Rakesh Sharma"}`, 14, y);
    doc.text(`Signature: ______________________`, 130, y);

    doc.save(`${project.artNo}_QC_Report_${inspection.qcDate}.pdf`);
  }

  function exportSingleDrNoPdf(project, inspection, drNo) {
    const doc = new jspdf.jsPDF();
    let y = drawHeader(doc, project, inspection, 14);
    const item = inspection.lineItems[drNo];
    if (item) {
      drawLineItemSection(doc, item, y);
    }
    doc.save(`${project.artNo}_${drNo}_QC_${inspection.qcDate}.pdf`);
  }

  return { exportArtWisePdf, exportSingleDrNoPdf };
})();

