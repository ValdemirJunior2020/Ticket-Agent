// server/index.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import XLSX from "xlsx";

import { appendTicketLog } from "./sheetsClient.js";
import { kimiChat } from "./kimiClient.js";
import { ticketAssist } from "./ticketAssist.js";

const app = express();

// ✅ CORS (allow Netlify + ANY localhost dev port)
const ALLOWED_ORIGINS = new Set([
  "https://ticket-copilot-agent.netlify.app",
  "http://localhost:3000",
]);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl/postman/server-to-server
      if (/^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true); // Vite ports (5173, 5174...)
      if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: false,
  })
);

app.use(express.json({ limit: "10mb" }));

// ==============================
// ✅ NO rag.js dependency at all
// ==============================

const DEFAULT_EXCEL = "data/Service Matrix's 2026 Voice and Tickets.xlsx";
const EXCEL_PATH = path.resolve(process.cwd(), process.env.EXCEL_PATH || DEFAULT_EXCEL);

const SHEET_ALLOWLIST = (process.env.SHEETS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let PROCEDURES = [];

function cellToString(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function rowToText(rowObj) {
  const parts = [];
  for (const [k, v] of Object.entries(rowObj || {})) {
    const vv = cellToString(v);
    if (!vv) continue;
    const kk = cellToString(k);
    parts.push(`${kk}: ${vv}`);
  }
  return parts.join(" | ");
}

function guessTitle(rowObj) {
  const preferred = ["Title", "Scenario", "Topic", "Question", "Category", "Issue", "Step", "Procedure"];
  for (const key of preferred) {
    if (rowObj && rowObj[key] && cellToString(rowObj[key])) return cellToString(rowObj[key]).slice(0, 80);
  }
  for (const v of Object.values(rowObj || {})) {
    const s = cellToString(v);
    if (s) return s.slice(0, 80);
  }
  return "Procedure";
}

function loadProceduresFromExcel() {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(
      `Excel file not found at: ${EXCEL_PATH}\nSet EXCEL_PATH in server/.env or copy the file into server/data/.`
    );
  }

  const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });
  const sheets = wb.SheetNames || [];

  const pickedSheets = SHEET_ALLOWLIST.length ? sheets.filter((name) => SHEET_ALLOWLIST.includes(name)) : sheets;

  if (!pickedSheets.length) {
    throw new Error(`No sheets matched. SHEETS=${SHEET_ALLOWLIST.join(", ")} | Available: ${sheets.join(", ")}`);
  }

  const docs = [];
  for (const sheetName of pickedSheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
    let rowIndex = 0;

    for (const row of json) {
      rowIndex += 1;
      const text = rowToText(row);
      if (!text) continue;

      docs.push({
        id: `${sheetName}:${rowIndex}`,
        sheet: sheetName,
        title: guessTitle(row),
        text,
      });
    }
  }

  return docs;
}

function tokenize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function ragSearchLocal(procs, query, topK = 6) {
  const qTokens = tokenize(query);
  const qSet = new Set(qTokens);

  const scored = (procs || []).map((p) => {
    const hay = tokenize(`${p.title} ${p.text} ${p.sheet}`);
    let score = 0;

    for (const t of hay) if (qSet.has(t)) score += 1;

    const q = String(query || "").toLowerCase().trim();
    const blob = `${p.title} ${p.text}`.toLowerCase();
    if (q && blob.includes(q)) score += 3;

    return { ...p, score };
  });

  const picked = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((p) => ({
      id: p.id,
      sheet: p.sheet,
      title: p.title,
      text: p.text,
      score: p.score,
    }));

  return { query, picked };
}

function ensureProceduresLoaded() {
  if (PROCEDURES.length) return;
  PROCEDURES = loadProceduresFromExcel();
}

function extractItinerary(raw) {
  const s = String(raw || "");

  const m1 = s.match(/\(([A-Z]\d{6,})\)/i);
  if (m1?.[1]) return m1[1].toUpperCase();

  const m2 = s.match(/itinerary\/confirmation\s*number\s*([A-Z]\d{6,})/i);
  if (m2?.[1]) return m2[1].toUpperCase();

  const m3 = s.match(/itinerary\s*#\s*([A-Z]\d{6,})/i);
  if (m3?.[1]) return m3[1].toUpperCase();

  const m4 = s.match(/\b(H\d{6,})\b/i);
  if (m4?.[1]) return m4[1].toUpperCase();

  return "";
}

// initial load
ensureProceduresLoaded();

// ------------------ routes ------------------

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    app: "HotelPlanner Agent (Kimi K2.5 via NVIDIA NIM)",
    excel: path.basename(EXCEL_PATH),
    sheetsFilter: SHEET_ALLOWLIST.length ? SHEET_ALLOWLIST : "ALL",
    procedures: PROCEDURES.length,
    time: new Date().toISOString(),
  });
});

app.post("/api/reload-procedures", async (_req, res) => {
  try {
    PROCEDURES = loadProceduresFromExcel();
    res.json({ ok: true, count: PROCEDURES.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ✅ “ask” endpoint (local RAG + Kimi)
app.post("/api/ask", async (req, res) => {
  const startedAt = Date.now();
  try {
    const { scenario = "", question = "" } = req.body || {};
    if (!String(question).trim()) return res.status(400).json({ ok: false, error: "Question is required." });

    ensureProceduresLoaded();

    const ragQuery = `${scenario}\n${question}`.trim();
    const rag = ragSearchLocal(PROCEDURES, ragQuery, 6);

    const system =
      "You are a HotelPlanner procedure assistant. Follow the internal matrix. Never promise refunds/cancellations. If info is missing, ask for it. Output must be clear and compliant.";
    const snippets = rag.picked
      .slice(0, 8)
      .map((p) => `SNIPPET [${p.sheet}] ${p.title}\n${p.text}`)
      .join("\n\n");

    const user = `Scenario:\n${scenario}\n\nQuestion:\n${question}\n\nProcedure snippets:\n${snippets || "(none matched)"}`;

    const answer = await kimiChat([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    const latencyMs = Date.now() - startedAt;
    res.json({ ok: true, answer, rag, latencyMs });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ✅ Ticket Specialist endpoint (paste Zendesk dump)
// Saves ONLY: agentName, agentEmail, itinerary, solved -> to Google Sheet via Code.gs Web App
app.post("/api/ticket-assist", async (req, res) => {
  const startedAt = Date.now();

  try {
    const {
      agentName = "",
      agentEmail = "",
      rawTicketText = "",
      solved = "NO", // YES/NO or boolean
      useAI = true,
    } = req.body || {};

    if (!rawTicketText || String(rawTicketText).trim().length < 20) {
      return res.status(400).json({ ok: false, error: "Paste the Zendesk ticket text (at least 20 chars)." });
    }

    ensureProceduresLoaded();

    const out = await ticketAssist({
      rawTicketText,
      useAI,
      ragSearchFn: async (q) => ragSearchLocal(PROCEDURES, q, 6),
      aiAnswerFn: async (messages) => kimiChat(messages),
    });

    const latencyMs = Date.now() - startedAt;

    // server/index.js
// ✅ only change: when saving to Google Sheets, include "ticketPlanOutput" field
// Find your /api/ticket-assist block and replace ONLY the logging call with this version:

// ... inside /api/ticket-assist after `const out = await ticketAssist(...)`

const itinerary = out?.parsed?.itinerary || out?.parsed?.itineraryNumber || extractItinerary(rawTicketText);

// ✅ Save ONLY the requested fields + Ticket Plan Output (Column G)
let saved = false;
let saveError = "";

try {
  if (!agentName || !agentEmail) {
    saveError = "Not saved: agentName and agentEmail are required.";
  } else if (!itinerary) {
    saveError = "Not saved: itinerary not found in the pasted ticket.";
  } else {
    const r = await appendTicketLog({
      agentName,
      agentEmail,
      itinerary,
      solved,
      ticketPlanOutput: out?.planText || "" // ✅ Column G
    });

    saved = !!r?.ok;
    if (!saved) saveError = r?.reason || "Google Sheets logging failed.";
  }
} catch (e) {
  saved = false;
  saveError = String(e?.message || e);
}

// then return response includes saved/saveError
return res.json({
  ok: true,
  latencyMs,
  saved,
  saveError,
  itinerary,
  ...out
});

  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ✅ JSON error handler (shows CORS + other crashes as JSON)
app.use((err, _req, res, _next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({
    ok: false,
    error: err?.message || String(err),
    hint: err?.message?.includes("CORS blocked")
      ? "Allow your frontend origin in server/index.js CORS settings (Vite may change ports)."
      : undefined,
  });
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`✅ HotelPlanner Agent running on http://localhost:${PORT}`));
