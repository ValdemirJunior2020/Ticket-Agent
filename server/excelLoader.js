import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

function normalizeKey(k) {
  return String(k || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function rowToText(row) {
  const parts = [];
  for (const [k, v] of Object.entries(row)) {
    const key = String(k || "").trim();
    const val = v === null || v === undefined ? "" : String(v).trim();
    if (!key || !val) continue;
    parts.push(`${key}: ${val}`);
  }
  return parts.join(" | ");
}

export function loadProceduresFromExcel({ excelPath, sheetNames = [] }) {
  const abs = path.resolve(excelPath);

  if (!fs.existsSync(abs)) {
    throw new Error(
      `Excel file not found: ${abs}\nCopy it into: server/data/Service Matrix's 2026 Voice and Tickets.xlsx`
    );
  }

  const workbook = xlsx.readFile(abs, { cellDates: true });
  const availableSheets = workbook.SheetNames || [];

  const targets = sheetNames.length ? sheetNames.filter((n) => availableSheets.includes(n)) : availableSheets;
  if (!targets.length) {
    throw new Error(`No matching sheets. Wanted: ${sheetNames.join(", ")} | Available: ${availableSheets.join(", ")}`);
  }

  const procedures = [];
  let idCounter = 1;

  for (const sheet of targets) {
    const ws = workbook.Sheets[sheet];
    if (!ws) continue;

    const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });

    for (const r of rows) {
      const keys = Object.keys(r).reduce((acc, kk) => {
        acc[normalizeKey(kk)] = kk;
        return acc;
      }, {});

      const titleKey =
        keys["guideline"] ||
        keys["rule"] ||
        keys["policy"] ||
        keys["scenario"] ||
        keys["category"] ||
        keys["topic"] ||
        null;

      const tagsKey = keys["tags"] || keys["keywords"] || keys["keyword"] || null;

      const title = titleKey ? String(r[titleKey]).trim() : "";
      const tags = tagsKey ? String(r[tagsKey]).trim() : "";

      const body = rowToText(r);
      if (!body || body.length < 10) continue;

      procedures.push({
        id: `P${String(idCounter++).padStart(5, "0")}`,
        sheet,
        title: title || `${sheet} Row`,
        tags,
        body
      });
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const p of procedures) {
    const key = `${p.sheet}::${p.title}::${p.body}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }

  return deduped;
}
