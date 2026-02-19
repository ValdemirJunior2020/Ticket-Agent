// server/sheetsClient.js  (make sure this is your actual file)
const GAS_URL = process.env.GAS_URL || "";

export async function appendTicketLog({ agentName, agentEmail, itinerary, solved }) {
  if (!GAS_URL) return { ok: false, skipped: true, error: "GAS_URL not set" };

  const resp = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "appendTicketLog",
      agentName,
      agentEmail,
      itinerary,
      solved
    })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) throw new Error(data.error || `GAS error (${resp.status})`);
  return data;
}
