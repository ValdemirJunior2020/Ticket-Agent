// server/ticketParser.js
// Parses a pasted Zendesk ticket dump into structured fields (best-effort, regex-based)

function clean(s = "") {
  return String(s).replace(/\r/g, "").trim();
}

function pickFirst(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && (m[1] || m[0])) return (m[1] || m[0]).trim();
  }
  return "";
}

function pickAll(text, re) {
  const out = [];
  let m;
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = r.exec(text))) out.push((m[1] || m[0]).trim());
  return out;
}

function redactPII(text = "") {
  let t = String(text);

  // phone numbers
  t = t.replace(/\+?\d{1,2}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "[REDACTED_PHONE]");

  // IP addresses
  t = t.replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, "[REDACTED_IP]");

  // email addresses
  t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");

  return t;
}

export function parseZendeskDump(rawText = "") {
  const raw = clean(rawText);
  const text = redactPII(raw);

  const itinerary = pickFirst(text, [
    /\bItinerary\/Confirmation Number\s+([A-Z]\d{6,})\b/i,
    /\bItinerary\s*#\s*([A-Z]\d{6,})\b/i,
    /\(([A-Z]\d{6,})\)/,
    /\b([A-Z]\d{6,})\b/
  ]);

  const subject = pickFirst(text, [/^Subject\s+(.+)$/im, /^Client.*$/im]);
  const requester = pickFirst(text, [/^Requester\s+(.+)$/im, /^Name:\s*([A-Z][A-Z\s.'-]{2,})$/im]);
  const guestName = pickFirst(text, [/^Name:\s*([A-Z][A-Z\s.'-]{2,})$/im, /\bDear\s+([A-Z][A-Z\s.'-]{2,})\b/i]);

  const reason = pickFirst(text, [
    /^Reason for Call:\s*(.+)$/im,
    /^GST is requesting.*?:\s*(.+)$/im,
    /\brequesting to (?:cancel|cxl).+?\b(?:due to|because)\b(.+)$/im
  ]);

  const actionsTaken = pickFirst(text, [/^Actions taken:\s*(.+)$/im]);
  const resolution = pickFirst(text, [/^Resolution:\s*(.+)$/im]);

  const cancellationNumbers = Array.from(
    new Set(
      pickAll(text, /\bCancellation number\s+([A-Z0-9]{6,})\b/gi).concat(
        pickAll(text, /\bCancellation number\s*[:#]?\s*([A-Z0-9]{6,})\b/gi)
      )
    )
  );

  const hasRPP =
    /\bRefund Protection Plan\b/i.test(text) ||
    /\bRPP\b/i.test(text) ||
    /\bRequestmyrefund\.com\b/i.test(text);

  const rpDenied = /\bdenied\b/i.test(text) && /\bRP\b/i.test(text);

  const guestAsksStatus = /\bupdate me on the status\b/i.test(text) || /\bstatus of my refund request\b/i.test(text);

  // hotel contact attempts
  const hotelContacted =
    /\bContacted Hotel:\s*yes\b/i.test(text) ||
    /\bI called (?:the )?(?:FD|front desk)\b/i.test(text) ||
    /\bI called HTL\b/i.test(text);

  const hotelNoAnswer = /\bno answer\b/i.test(text) || /\bno ans\b/i.test(text);

  // tags/macros (best-effort)
  const macros = Array.from(new Set(pickAll(text, /^Macro applied\s+(.+)$/gim)));
  const tagsLine = pickAll(text, /^Tags\s+(.+)$/gim).join(" | ");
  const tags = tagsLine
    ? Array.from(new Set(tagsLine.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)))
    : [];

  return {
    itinerary,
    subject,
    requester: requester || guestName,
    guestName: guestName || requester,
    reason,
    actionsTaken,
    resolution,
    hasRPP,
    rpDenied,
    guestAsksStatus,
    hotelContacted,
    hotelNoAnswer,
    cancellationNumbers,
    macros,
    tags,
    redactedText: text
  };
}
