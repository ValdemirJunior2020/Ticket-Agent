// server/sheetsClient.js
// ✅ REPLACE your whole file with this (ESM). It supports GAS_URL or GAS_WEBAPP_URL.
// It also returns clear reasons back to the server so your UI can show what's wrong.

import crypto from "crypto";

function safeStr(v) {
  return (v ?? "").toString().trim();
}

function getGasUrl() {
  // ✅ support either name (you can use ONE on Render)
  return safeStr(process.env.GAS_URL) || safeStr(process.env.GAS_WEBAPP_URL);
}

function sign(secret, payload) {
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Append a ticket log row to Google Sheets (via Apps Script Web App).
 * Expected Code.gs accepts JSON with:
 * ts, agentName, agentEmail, itinerary, solved, callCenter, ticketPlanOutput, sig (optional)
 */
export async function appendTicketLog({
  agentName,
  agentEmail,
  itinerary,
  solved = "NO",
  callCenter = "",
  ticketPlanOutput = "",
  ts,
} = {}) {
  const GAS_URL = getGasUrl();
  if (!GAS_URL) {
    return { ok: false, reason: "Missing GAS_URL env var." };
  }

  const payload = {
    ts: ts || new Date().toISOString(),
    agentName: safeStr(agentName),
    agentEmail: safeStr(agentEmail),
    itinerary: safeStr(itinerary),
    solved: safeStr(solved).toUpperCase() === "YES" ? "YES" : "NO",
    callCenter: safeStr(callCenter),
    ticketPlanOutput: safeStr(ticketPlanOutput),
  };

  // Optional shared secret (if you set it on both sides)
  const secret = safeStr(process.env.GAS_SHARED_SECRET);
  const bodyStr = JSON.stringify(payload);
  const sig = sign(secret, bodyStr);

  const resp = await fetch(GAS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sig ? { "X-Signature": sig } : {}),
    },
    body: bodyStr,
  });

  const text = await resp.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // Apps Script sometimes returns HTML on errors
    return {
      ok: false,
      reason: `GAS response not JSON (${resp.status}). First 200 chars: ${text.slice(0, 200)}`,
    };
  }

  if (!resp.ok || !data?.ok) {
    return {
      ok: false,
      reason: data?.error || `GAS request failed (${resp.status})`,
      status: resp.status,
      data,
    };
  }

  return { ok: true, data };
}
