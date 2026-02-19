// server/ticketAssist.js
import { parseZendeskDump } from "./ticketParser.js";

/**
 * Generates step-by-step ticket handling guidance.
 * - Uses parsed Zendesk dump
 * - If RAG snippets provided, injects them; otherwise produces a policy-safe plan.
 */
export function buildTicketPlan(parsed, ragPicked = []) {
  const it = parsed.itinerary || "[MISSING_ITINERARY]";
  const guest = parsed.guestName || parsed.requester || "[MISSING_GUEST]";
  const reason = parsed.reason || "[MISSING_REASON]";
  const cn = parsed.cancellationNumbers?.length ? parsed.cancellationNumbers.join(", ") : "";

  const header = [
    `Ticket Summary`,
    `- Itinerary: ${it}`,
    `- Guest: ${guest}`,
    `- Reason: ${reason}`,
    parsed.hasRPP ? `- RPP: YES` : `- RPP: NO/UNKNOWN`,
    parsed.rpDenied ? `- RP Status: DENIED (per notes)` : `- RP Status: UNKNOWN`,
    cn ? `- Cancellation #s: ${cn}` : `- Cancellation #s: none found`,
    parsed.hotelContacted ? `- Hotel contact attempts: YES` : `- Hotel contact attempts: NO/UNKNOWN`,
    parsed.hotelNoAnswer ? `- Hotel answered: NO (per notes)` : `- Hotel answered: UNKNOWN`
  ].join("\n");

  const whoToCall = [];
  if (parsed.hasRPP) whoToCall.push("1) Refund Protection / RP (guide guest to claim + confirm status if you have access)");
  whoToCall.push("2) Hotel Front Desk / Manager (courtesy waiver request if policy allows; document name/time/outcome)");
  whoToCall.push("3) Internal Escalations / Supervisor (only if matrix requires escalation or guest threatens legal)");

  const steps = [
    `Step-by-step (organized)`,
    ``,
    `A) Verify required identifiers (DO THIS FIRST)`,
    `- Confirm itinerary number, guest full name, hotel name, check-in/check-out dates.`,
    `- Confirm email on file is correct.`,
    ``,
    `B) Determine the correct path`,
    parsed.hasRPP
      ? `- This itinerary includes RPP → do NOT promise refund/cancellation. Direct guest to submit/continue the RPP claim (Requestmyrefund.com) and document it.`
      : `- If no RPP → follow hotel cancellation policy window + penalties; attempt courtesy waiver only when allowed; never promise refund.`,
    parsed.rpDenied
      ? `- RP already denied per ticket → communicate denial clearly and professionally, and offer to re-check with the property only if there is a named approval contact.`
      : `- If RP status unknown → ask: “Have you submitted the claim already? Any claim/denial email? If yes, request the claim reference and proceed accordingly.”`,
    ``,
    `C) Outbound attempts (Who to call first)`,
    ...whoToCall.map((x) => `- ${x}`),
    ``,
    `D) Guest communication (macro-ready wording)`,
    parsed.hasRPP
      ? `- “This reservation includes a Refund Protection Plan. Please submit or continue your refund request at Requestmyrefund.com. Once the claim is reviewed, you’ll receive a decision by email. If you already submitted, please share the claim reference so I can note it on the ticket.”`
      : `- “I can review your cancellation options, but I can’t guarantee a refund until we verify the hotel’s policy. May I confirm your itinerary number, hotel, and dates?”`,
    parsed.guestAsksStatus
      ? `- Status update reply: “Thanks for checking in. Your request is still under review based on policy/partner decision. If you have any denial/approval email or a reference number, please share it so we can update the ticket notes.”`
      : `- If guest is requesting cancel: confirm details → share available options → document.`,
    ``,
    `E) Documentation (internal note checklist)`,
    `- Ticket concern + reason (flight altered / court date changed, etc.)`,
    `- All call attempts (numbers dialed, times, who you spoke with)`,
    `- Policy outcome (RPP path / denial / hotel decision)`,
    `- What you sent to guest (macro used + links)`,
    `- Next step owner + follow-up date/time if applicable`
  ].join("\n");

  const ragSection =
    ragPicked?.length
      ? [
          ``,
          `Procedure snippets used (from matrix)`,
          ...ragPicked.slice(0, 6).map((p, i) => `- ${i + 1}. [${p.sheet}] ${p.title} (score ${Number(p.score || 0).toFixed(2)})`)
        ].join("\n")
      : "";

  const output = `${header}\n\n${steps}${ragSection}`;

  const recommendations = {
    suggestedMacros: [
      parsed.hasRPP ? "Refund Protection Claim" : "Cancellation Policy / No Refund Approved (if applicable)",
      "Delay / Follow-up (if awaiting partner/hotel response)"
    ].filter(Boolean),
    suggestedTags: [
      "refund_request",
      parsed.hasRPP ? "rpp" : "no_rpp",
      parsed.rpDenied ? "rp_denied" : null,
      parsed.guestAsksStatus ? "status_update" : null
    ].filter(Boolean)
  };

  return { planText: output, recommendations };
}

export async function ticketAssist({
  rawTicketText,
  ragSearchFn, // async (query) => {picked, query}
  aiAnswerFn,  // async (messages) => string
  useAI = true
}) {
  const parsed = parseZendeskDump(rawTicketText);

  const queryParts = [
    parsed.subject ? `Subject: ${parsed.subject}` : "",
    parsed.reason ? `Reason: ${parsed.reason}` : "",
    parsed.hasRPP ? "Has RPP" : "No/Unknown RPP",
    parsed.rpDenied ? "RP denied" : "",
    parsed.guestAsksStatus ? "Guest asked refund status update" : ""
  ].filter(Boolean);

  const ragQuery = queryParts.join(" | ") || "ticket refund cancellation procedure";

  let rag = { picked: [], query: ragQuery };
  if (typeof ragSearchFn === "function") {
    try {
      rag = await ragSearchFn(ragQuery);
    } catch {
      // ignore
    }
  }

  const base = buildTicketPlan(parsed, rag?.picked || []);

  if (useAI && typeof aiAnswerFn === "function") {
    const system = `You are a HotelPlanner Zendesk Ticket Specialist. Follow internal procedures. Be policy-safe: never promise refunds/cancellations. Output MUST be organized:
- Summary
- Who to call first (ordered)
- Step-by-step actions
- What to say to guest (copy-paste)
- What to document
Use provided procedure snippets if present; if missing, ask for required info.`;

    const snippets = (rag?.picked || [])
      .slice(0, 8)
      .map((p) => `SNIPPET [${p.sheet}] ${p.title}\n${p.text || ""}`)
      .join("\n\n");

    const user = `Zendesk ticket dump (redacted):\n${parsed.redactedText}\n\nParsed JSON:\n${JSON.stringify(parsed, null, 2)}\n\nProcedure snippets:\n${snippets || "(none)"}`;

    try {
      const ai = await aiAnswerFn([
        { role: "system", content: system },
        { role: "user", content: user }
      ]);

      return {
        ok: true,
        mode: "ai+rag",
        parsed,
        rag,
        planText: ai || base.planText,
        recommendations: base.recommendations
      };
    } catch (e) {
      return {
        ok: true,
        mode: "rag-only",
        parsed,
        rag,
        planText: base.planText,
        recommendations: base.recommendations,
        warn: String(e?.message || e)
      };
    }
  }

  return {
    ok: true,
    mode: "rag-only",
    parsed,
    rag,
    planText: base.planText,
    recommendations: base.recommendations
  };
}
