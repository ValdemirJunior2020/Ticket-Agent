/**
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone (or Anyone with link)
 *
 * Create a Google Sheet with 2 tabs:
 * 1) Logs
 * 2) Settings
 *
 * Settings tab:
 *   A1 = GAS_SHARED_SECRET
 *   A2 = <paste same secret you put in server/.env>
 *
 * Logs tab headers (row 1):
 * ts | agentEmail | agentName | callCenter | scenario | question | answer | ragPicked | metaJson
 */

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSecret_() {
  const ss = getSheet_();
  const sh = ss.getSheetByName("Settings");
  if (!sh) return "";
  const v = sh.getRange("A2").getValue();
  return String(v || "").trim();
}

function ensureTabs_() {
  const ss = getSheet_();
  if (!ss.getSheetByName("Logs")) ss.insertSheet("Logs");
  if (!ss.getSheetByName("Settings")) ss.insertSheet("Settings");
  const logs = ss.getSheetByName("Logs");
  if (logs.getLastRow() === 0) {
    logs.appendRow(["ts","agentEmail","agentName","callCenter","scenario","question","answer","ragPicked","metaJson"]);
  }
  const settings = ss.getSheetByName("Settings");
  if (settings.getLastRow() === 0) {
    settings.getRange("A1").setValue("GAS_SHARED_SECRET");
    settings.getRange("A2").setValue("CHANGE_ME_TO_SOMETHING_RANDOM");
  }
}

function doGet(e) {
  ensureTabs_();
  return jsonOut({ ok: true, msg: "HotelPlanner Agent Logger is running" });
}

function doPost(e) {
  ensureTabs_();

  let payload = {};
  try {
    payload = JSON.parse(e.postData.contents || "{}");
  } catch (err) {
    return jsonOut({ ok: false, error: "Invalid JSON" });
  }

  const action = payload.action || "";
  const body = payload.body || {};

  const expected = getSecret_();
  const provided = String(body.secret || "").trim();

  if (expected && provided !== expected) {
    return jsonOut({ ok: false, error: "Unauthorized (bad secret)" });
  }

  if (action === "logQuestion") {
    const ss = getSheet_();
    const logs = ss.getSheetByName("Logs");

    const ragPicked = JSON.stringify((body.rag && body.rag.picked) ? body.rag.picked : []);
    const metaJson = JSON.stringify(body.meta || {});

    logs.appendRow([
      body.ts || new Date().toISOString(),
      body.agentEmail || "",
      body.agentName || "",
      body.callCenter || "",
      body.scenario || "",
      body.question || "",
      body.answer || "",
      ragPicked,
      metaJson
    ]);

    return jsonOut({ ok: true });
  }

  return jsonOut({ ok: false, error: "Unknown action" });
}
