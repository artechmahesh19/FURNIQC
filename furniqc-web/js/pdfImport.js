const PdfImport = (() => {
  async function extractText(fileArrayBuffer) {
    try {
      const pdf = await pdfjsLib.getDocument({ data: fileArrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((it) => it.str).join(" ");
        fullText += pageText + "\n";
      }
      return fullText;
    } catch (e) {
      console.warn("pdf.js text extraction warning:", e);
      return "";
    }
  }

  function parseHeader(text, fileName = "") {
    const cleanFn = fileName.replace(/\.pdf$/i, "").trim();

    // 1. Art No extraction
    let artNo = "";

    // Pattern 1: Look for "Order Number" / "Job Card" / "Art No" / "Job No"
    const orderNoPatterns = [
      /(?:Order\s*(?:Number|No)|Job\s*Card\s*(?:No|Number)?|Job\s*No|Art\s*(?:No|Number)?)\s*[:\-–—]?\s*(?:ART\s*[:\-–—\s]?\s*)?([0-9A-Z]+)/i,
      /(?:Order\s*(?:Number|No)|Job\s*Card|Art\s*No)\s*[:\-–—]?\s*(ART\s*[\-–—\s]?\s*[0-9A-Z]+)/i
    ];

    for (const pat of orderNoPatterns) {
      const m = text.match(pat);
      if (m && m[1]) {
        let val = m[1].trim();
        if (!["ORDER", "NUMBER", "NAME", "DATE", "CLIENT", "PROJECT"].includes(val.toUpperCase())) {
          val = val.replace(/\s+/g, "").replace(/^ART[\-–—]?/i, "");
          if (val.length > 0) {
            artNo = `ART-${val.toUpperCase()}`;
            break;
          }
        }
      }
    }

    // Pattern 2: Look for ART - 126 or ART-126 or ART 126 anywhere in text
    if (!artNo || artNo === "ART-" || artNo.includes("DATE")) {
      const artAnywhere = text.match(/\bART\s*[\-–—\s]\s*(\d+[A-Z0-9]*)\b/i) || text.match(/\b(ART[\-–—]?\d+)\b/i);
      if (artAnywhere && artAnywhere[1]) {
        const num = artAnywhere[1].replace(/^ART[\-–—]?/i, "").trim();
        artNo = `ART-${num.toUpperCase()}`;
      }
    }

    // Pattern 3: Check filename digits
    if (!artNo || artNo === "ART-" || artNo.includes("DATE")) {
      const fnMatch = cleanFn.match(/\bART\s*[\-_]?\s*(\d+)\b/i) || cleanFn.match(/(\d{3,5})/);
      if (fnMatch && fnMatch[1]) {
        artNo = `ART-${fnMatch[1]}`;
      }
    }

    // Fallback if still not found
    if (!artNo || artNo === "ART-" || artNo.includes("DATE") || artNo === "ART") {
      const fnDigits = cleanFn.replace(/[^0-9]/g, "").slice(0, 4);
      artNo = fnDigits ? `ART-${fnDigits}` : `ART-${Date.now().toString().slice(-3)}`;
    }

    artNo = artNo.replace(/\s+/g, "").replace(/^ART-+/, "ART-");

    // 2. Project Name extraction
    let projectName = "";
    const projPatterns = [
      /(?:Order\s*Name|Project\s*Name|Project|Client|Title)\s*[:\-–—]?\s*(.+?)(?:\s+Order\s*Number|\s+PO|\s+Dispatch|\s+Date|\n|$)/i,
      /(?:REWORKS|SPECIFICATION|JOB CARD)\s*[-:]?\s*(.+?)(?:\n|$)/i
    ];

    for (const pat of projPatterns) {
      const m = text.match(pat);
      if (m && m[1] && m[1].trim().length > 2) {
        projectName = m[1].trim();
        break;
      }
    }

    if (!projectName || projectName.toUpperCase() === "PROJECT") {
      projectName = cleanFn ? cleanFn.replace(/[-_]/g, " ") : "Furniture Job Card";
    }

    projectName = projectName.replace(/^[:\-\s]+/, "").replace(/\s+/g, " ").trim();

    // 3. PO No extraction
    const poMatch = text.match(/(?:PO\s*Number|PO\s*No|PO)\s*:?\s*([A-Z0-9_-]+)/i);
    const poNo = poMatch ? poMatch[1].trim() : "";

    return { artNo, projectName, poNo };
  }

  function parseLineItems(text, projectName = "") {
    const items = [];
    const seenDr = new Set();

    // 1. Regex to match DR No or Drawing No occurrences
    const drRegex = /(?:DR\s*NO|DRAWING\s*NO|\bDR\b)\s*[:\-–—]?\s*(\d{2,4})\b/gi;
    const drMatches = [];
    let m;
    while ((m = drRegex.exec(text)) !== null) {
      drMatches.push({ drNum: m[1], index: m.index, matchLength: m[0].length });
    }

    if (drMatches.length > 0) {
      for (let i = 0; i < drMatches.length; i++) {
        const current = drMatches[i];
        const nextIndex = i + 1 < drMatches.length ? drMatches[i + 1].index : text.length;
        const blockText = text.slice(current.index + current.matchLength, nextIndex).trim();

        const drNum = current.drNum;
        if (seenDr.has(drNum)) continue;
        seenDr.add(drNum);

        // Extract clean Product Name
        let prodName = "";
        const lines = blockText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        // Check first 2 lines for item description
        for (const line of lines.slice(0, 3)) {
          const cleanedLine = line
            .replace(/(?:Core\s*Material|Outer\s*Laminate|INNER\s*Laminate|HARDWARE|W\s+D\s+H|Qty|Quantity).*$/i, "")
            .replace(/\b\d{3,4}\s*[\text{x}\*×\s]\s*\d{3,4}\s*[\text{x}\*×\s]\d{3,4}\b/gi, "")
            .replace(/[-:\s\.\,]+$/, "")
            .trim();

          if (cleanedLine.length > 2 && !cleanedLine.match(/^(?:DATE|PO|PAGE|CLIENT|ORDER|DISPATCH|PAGE)/i)) {
            prodName = cleanedLine;
            break;
          }
        }

        if (!prodName && lines.length > 0) {
          prodName = lines[0].slice(0, 50).trim();
        }

        // Clean up spec fluff from product name
        prodName = prodName
          .replace(/[-:\s\.\,]+$/, "")
          .replace(/^[-:\s\.\,]+/, "")
          .replace(/\s+/g, " ")
          .trim();

        // Extract Dimensions W x D x H
        let w = "", d = "", h = "", qty = 1;
        const dimMatch = blockText.match(/(\d{3,4})\s*[\text{x}\*×\s]\s*(\d{2,4})\s*[\text{x}\*×\s]\s*(\d{2,4})/i);
        if (dimMatch) {
          w = dimMatch[1];
          d = dimMatch[2];
          h = dimMatch[3];
        }

        // Extract Quantity
        const qtyMatch = blockText.match(/(?:Qty|QTY|Quantity|W\s+D\s+H)\s*[:\-–—]?\s*(\d{1,2})/i);
        if (qtyMatch) {
          qty = parseInt(qtyMatch[1], 10) || 1;
        }

        items.push({
          drNo: `DR-${drNum}`,
          productName: prodName || `Furniture Item ${drNum}`,
          size: w && d && h ? `${w} x ${d} x ${h}` : "Standard Dimension",
          qty
        });
      }
    }

    // Strategy 2: Scan for lines with structured item descriptions if no DR matches
    if (items.length === 0) {
      const rawLines = text.split(/\r?\n/);
      for (let line of rawLines) {
        line = line.trim();
        const nMatch = line.match(/^(\d+)[\.\)]\s*([A-Z0-9 \-()\/\.\&]{4,50}?)(?:\s+(\d{2,4})\s*[\text{x}\*×]\s*(\d{2,4})\s*[\text{x}\*×]\s*(\d{2,4}))?\s*(?:Qty\s*:\s*(\d+))?$/i);
        if (nMatch) {
          const prodName = nMatch[2].trim().replace(/\s+/g, " ");
          const w = nMatch[3] || "";
          const d = nMatch[4] || "";
          const h = nMatch[5] || "";
          const qty = nMatch[6] || "1";

          if (prodName.length > 3 && !prodName.toLowerCase().includes("page")) {
            items.push({
              drNo: `DR-${400 + items.length + 1}`,
              productName: prodName,
              size: w && d && h ? `${w} x ${d} x ${h}` : "Standard Dimension",
              qty: parseInt(qty, 10) || 1
            });
          }
        }
      }
    }

    return items;
  }

  async function parseJobCardPdf(file) {
    const fileName = file ? file.name || "" : "";

    const buffer = await file.arrayBuffer();
    const text = await extractText(buffer);
    const header = parseHeader(text, fileName);
    const lineItems = parseLineItems(text, header.projectName);
    return { ...header, lineItems };
  }

  // Predefined Sample Job Card Templates for quick 1-click loading
  const SAMPLE_TEMPLATES = {
    bedroom: {
      artNo: "ART-201",
      projectName: "The Palms Villa - Bedroom Suite",
      poNo: "PO-2026-B101",
      lineItems: [
        { drNo: "DR-301", productName: "King Size Bed Frame", size: "1980 x 2030 x 1150", qty: 1 },
        { drNo: "DR-302", productName: "Upholstered Fabric Headboard", size: "2080 x 120 x 1350", qty: 1 },
        { drNo: "DR-303", productName: "2-Drawer Nightstand Table", size: "550 x 450 x 500", qty: 2 },
        { drNo: "DR-304", productName: "4-Door Wardrobe Carcass Unit", size: "2400 x 600 x 2200", qty: 1 }
      ]
    },
    office: {
      artNo: "ART-305",
      projectName: "Apex Towers - Executive Suite",
      poNo: "PO-2026-OFF7",
      lineItems: [
        { drNo: "DR-501", productName: "Executive Desk Table with PU Leather Top", size: "1800 x 900 x 760", qty: 2 },
        { drNo: "DR-502", productName: "Credenza Storage Drawer Unit", size: "1400 x 450 x 680", qty: 2 },
        { drNo: "DR-503", productName: "High-Back Ergonomic Office Armchair", size: "650 x 650 x 1200", qty: 4 }
      ]
    },
    sofa: {
      artNo: "ART-410",
      projectName: "Emerald Heights - Living Lounge",
      poNo: "PO-2026-SOFA2",
      lineItems: [
        { drNo: "DR-601", productName: "L-Shape Sectional Velvet Sofa", size: "2800 x 1600 x 850", qty: 1 },
        { drNo: "DR-602", productName: "Ottoman Storage Footrest", size: "800 x 600 x 450", qty: 2 },
        { drNo: "DR-603", productName: "Veneer Center Coffee Table", size: "1200 x 700 x 420", qty: 1 }
      ]
    }
  };

  return { parseJobCardPdf, SAMPLE_TEMPLATES };
})();


