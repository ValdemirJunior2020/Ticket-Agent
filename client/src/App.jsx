// client/src/App.jsx  (REPLACE your App.jsx with this full file)
import React, { useMemo, useState } from "react";

const CALL_CENTERS = ["Concentrix", "Buwelo", "WNS", "Teleperformance", "Ideal", "Telus", "Other"];

function Pill({ children, tone = "default" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function Card({ title, right, children }) {
  return (
    <section className="card">
      <div className="cardHead">
        <h2>{title}</h2>
        {right ? <div className="cardRight">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Label({ children }) {
  return <div className="label">{children}</div>;
}

function Field({ label, children, hint }) {
  return (
    <div className="field">
      <Label>{label}</Label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

function Alert({ title, text, hint }) {
  return (
    <div className="alert">
      <div className="alertIcon">⚠️</div>
      <div className="alertBody">
        <div className="alertTitle">{title}</div>
        <div className="alertText">{text}</div>
        {hint ? <div className="alertHint">{hint}</div> : null}
      </div>
    </div>
  );
}

function AnswerPanel({ answer, rag, latencyMs }) {
  if (!answer) {
    return (
      <div className="empty">
        <div className="emptyIcon">💬</div>
        <div className="emptyTitle">Ask a scenario to get an answer</div>
        <div className="emptySub">
          The assistant will pull the most relevant procedure snippets from your Excel and generate a compliant response.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="answerMeta">
        <Pill tone="ok">Response ready</Pill>
        {typeof latencyMs === "number" ? <Pill tone="muted">{latencyMs}ms</Pill> : null}
        {rag?.picked?.length ? <Pill tone="info">{rag.picked.length} snippets used</Pill> : <Pill tone="warn">No snippets matched</Pill>}
      </div>

      <pre className="answerBox">{answer}</pre>

      <div className="subCard">
        <div className="subCardTitle">Context used (top matches)</div>
        {rag?.picked?.length ? (
          <div className="snips">
            {rag.picked.map((p) => (
              <div className="snip" key={p.id}>
                <div className="snipTop">
                  <div className="snipTitle">{p.title}</div>
                  <Pill tone="muted">{p.sheet}</Pill>
                </div>
                <div className="snipBottom">
                  <span className="mono">{p.id}</span>
                  <span className="dot">•</span>
                  <span className="muted">score</span> <span className="mono">{Number(p.score || 0).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted small">
            No procedure snippets matched your wording. Try adding more detail or using the same terms as the matrix.
          </div>
        )}
      </div>
    </>
  );
}

function TicketPlanPanel({ planText, parsed, rag, latencyMs }) {
  if (!planText) {
    return (
      <div className="empty">
        <div className="emptyIcon">🎫</div>
        <div className="emptyTitle">Paste a Zendesk ticket to generate a plan</div>
        <div className="emptySub">The assistant will extract itinerary + intent, match procedures, and output a step-by-step plan.</div>
      </div>
    );
  }

  return (
    <>
      <div className="answerMeta">
        <Pill tone="ok">Plan ready</Pill>
        {typeof latencyMs === "number" ? <Pill tone="muted">{latencyMs}ms</Pill> : null}
        {rag?.picked?.length ? <Pill tone="info">{rag.picked.length} snippets used</Pill> : <Pill tone="warn">No snippets matched</Pill>}
        {parsed?.itinerary ? <Pill tone="muted">Itin: {parsed.itinerary}</Pill> : null}
      </div>

      <pre className="answerBox">{planText}</pre>

      <div className="subCard">
        <div className="subCardTitle">Extracted fields</div>
        <div className="kv">
          <div className="kvRow">
            <div className="kvKey">Itinerary</div>
            <div className="kvVal mono">{parsed?.itinerary || "-"}</div>
          </div>
          <div className="kvRow">
            <div className="kvKey">Guest</div>
            <div className="kvVal">{parsed?.guestName || "-"}</div>
          </div>
          <div className="kvRow">
            <div className="kvKey">Hotel</div>
            <div className="kvVal">{parsed?.hotelName || "-"}</div>
          </div>
          <div className="kvRow">
            <div className="kvKey">Intent</div>
            <div className="kvVal">{parsed?.intent || "-"}</div>
          </div>
        </div>
      </div>

      <div className="subCard">
        <div className="subCardTitle">Context used (top matches)</div>
        {rag?.picked?.length ? (
          <div className="snips">
            {rag.picked.map((p) => (
              <div className="snip" key={p.id}>
                <div className="snipTop">
                  <div className="snipTitle">{p.title}</div>
                  <Pill tone="muted">{p.sheet}</Pill>
                </div>
                <div className="snipBottom">
                  <span className="mono">{p.id}</span>
                  <span className="dot">•</span>
                  <span className="muted">score</span> <span className="mono">{Number(p.score || 0).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted small">
            No procedure snippets matched your wording. Try adding more detail or using the same terms as the matrix.
          </div>
        )}
      </div>
    </>
  );
}

// -------- helpers (better error messages) --------
async function readJsonSafe(resp) {
  const txt = await resp.text().catch(() => "");
  if (!txt) return {};
  try {
    return JSON.parse(txt);
  } catch {
    return { raw: txt };
  }
}

function explainHttp(status, data) {
  const serverMsg = data?.error || data?.message || "";
  const hintFromServer = data?.hint || "";

  if (status === 404) {
    return {
      title: "Endpoint not found (404)",
      text: serverMsg || "Your frontend is calling an API route that doesn't exist on the backend.",
      hint:
        hintFromServer ||
        "Fix: confirm your backend has this route and your Netlify redirect sends /api/* to Render. Also ensure the backend path is /api/ticket-assist (not /ticket-assist)."
    };
  }

  if (status === 401) {
    return {
      title: "Unauthorized (401)",
      text: serverMsg || "Your backend rejected the request (missing/wrong API key).",
      hint: hintFromServer || "Fix: set NVIDIA_API_KEY on Render (or server/.env locally) and redeploy."
    };
  }

  if (status === 500) {
    return {
      title: "Server error (500)",
      text: serverMsg || "Backend crashed or threw an error.",
      hint: hintFromServer || "Fix: open Render logs (or local server console) to see the exact stack trace."
    };
  }

  if (status === 0) {
    return {
      title: "Network error",
      text: serverMsg || "Could not reach the backend.",
      hint: hintFromServer || "Fix: confirm Render is running and Netlify redirect is pointing to the correct Render URL."
    };
  }

  return {
    title: `Request failed (${status})`,
    text: serverMsg || "The server returned an error response.",
    hint: hintFromServer || (data?.raw ? `Server returned non-JSON:\n${String(data.raw).slice(0, 200)}` : "")
  };
}

export default function App() {
  // Shared identity fields
  const [agentName, setAgentName] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [callCenter, setCallCenter] = useState(CALL_CENTERS[0]);

  // Scenario QA
  const [scenario, setScenario] = useState("");
  const [question, setQuestion] = useState("");
  const [loadingAsk, setLoadingAsk] = useState(false);
  const [answer, setAnswer] = useState("");
  const [ragAsk, setRagAsk] = useState(null);
  const [latAsk, setLatAsk] = useState(null);

  // Ticket Copilot
  const [rawTicketText, setRawTicketText] = useState("");
  const [solved, setSolved] = useState("NO");
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [planText, setPlanText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [ragTicket, setRagTicket] = useState(null);
  const [latTicket, setLatTicket] = useState(null);

  // unified error
  const [err, setErr] = useState(null);

  const canAsk = useMemo(() => question.trim().length >= 3, [question]);
  const canTicket = useMemo(() => String(rawTicketText || "").trim().length >= 20, [rawTicketText]);

  async function onAsk() {
    setErr(null);
    setAnswer("");
    setRagAsk(null);
    setLatAsk(null);
    setLoadingAsk(true);

    const startedAt = Date.now();

    try {
      const resp = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName,
          agentEmail,
          callCenter,
          scenario,
          question,
          meta: { source: "web-ui" }
        })
      });

      const data = await readJsonSafe(resp);
      if (!resp.ok || !data.ok) {
        const ex = explainHttp(resp.status, data);
        throw new Error(`${ex.title}: ${ex.text}${ex.hint ? `\n\n${ex.hint}` : ""}`);
      }

      setAnswer(data.answer || "");
      setRagAsk(data.rag || null);
      setLatAsk(typeof data.latencyMs === "number" ? data.latencyMs : Date.now() - startedAt);
    } catch (e) {
      setErr({ title: "Action needed", text: String(e?.message || e) });
    } finally {
      setLoadingAsk(false);
    }
  }

  async function onGenerateTicketPlan() {
    setErr(null);
    setPlanText("");
    setParsed(null);
    setRagTicket(null);
    setLatTicket(null);
    setLoadingTicket(true);

    const startedAt = Date.now();

    try {
      const resp = await fetch("/api/ticket-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName,
          agentEmail,
          callCenter,
          rawTicketText,
          solved, // YES/NO
          useAI: true,
          meta: { source: "web-ui" }
        })
      });

      const data = await readJsonSafe(resp);

      if (!resp.ok || !data.ok) {
        const ex = explainHttp(resp.status, data);
        throw new Error(`${ex.title}: ${ex.text}${ex.hint ? `\n\n${ex.hint}` : ""}`);
      }

      setPlanText(data.planText || data.answer || "");
      setParsed(data.parsed || null);
      setRagTicket(data.rag || null);
      setLatTicket(typeof data.latencyMs === "number" ? data.latencyMs : Date.now() - startedAt);

      // If backend says whether it saved to Sheets, we can surface it:
      if (data.saved === false) {
        setErr({
          title: "Saved to Sheets: NO",
          text: "The plan was generated, but the log was not saved (missing itinerary or agent info).",
        });
      }
    } catch (e) {
      setErr({ title: "Action needed", text: String(e?.message || e) });
    } finally {
      setLoadingTicket(false);
    }
  }

  async function onReloadProcedures() {
    setErr(null);
    try {
      const resp = await fetch("/api/reload-procedures", { method: "POST" });
      const data = await readJsonSafe(resp);
      if (!resp.ok || !data.ok) {
        const ex = explainHttp(resp.status, data);
        throw new Error(`${ex.title}: ${ex.text}${ex.hint ? `\n\n${ex.hint}` : ""}`);
      }
      alert(`Procedures reloaded. Rows: ${data.count}`);
    } catch (e) {
      setErr({ title: "Action needed", text: String(e?.message || e) });
    }
  }

  return (
    <div className="shell">
      <div className="bgGlow" />

      <header className="topbar">
        <div className="brand">
          <div className="brandMark">HP</div>
          <div className="brandText">
            <div className="brandTitle">Ticket Copilot + Agent Assist</div>
            <div className="brandSub">Glassy UI • Procedure-aware • Logs itinerary + solved</div>
          </div>
        </div>

        <div className="topbarRight">
          <Pill tone="muted">Server: /api</Pill>
          <button className="btn ghost" onClick={onReloadProcedures} disabled={loadingAsk || loadingTicket}>
            Reload Procedures
          </button>
        </div>
      </header>

      <main className="grid">
        <div className="col">
          <Card title="Agent identity (used for logs)">
            <div className="twoCol">
              <Field label="Agent name">
                <input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="e.g. Frank M." />
              </Field>
              <Field label="Agent email">
                <input value={agentEmail} onChange={(e) => setAgentEmail(e.target.value)} placeholder="agent@hotelplanner.com" />
              </Field>
            </div>

            <Field label="Call center">
              <select value={callCenter} onChange={(e) => setCallCenter(e.target.value)}>
                {CALL_CENTERS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </Card>

          <Card
            title="Ticket Copilot (Zendesk Specialist)"
            right={
              loadingTicket ? <Pill tone="info">Working…</Pill> : canTicket ? <Pill tone="ok">Ready</Pill> : <Pill tone="warn">Paste ticket</Pill>
            }
          >
            <Field label="Solved?" hint="This is what we save to Google Sheet: YES/NO">
              <select value={solved} onChange={(e) => setSolved(e.target.value)}>
                <option value="NO">NO</option>
                <option value="YES">YES</option>
              </select>
            </Field>

            <Field label="Paste Zendesk ticket text" hint="Paste the whole ticket text. Phone/IP/email can be included.">
              <textarea
                rows={10}
                value={rawTicketText}
                onChange={(e) => setRawTicketText(e.target.value)}
                placeholder="Paste the full ticket dump here…"
              />
            </Field>

            <div className="rowActions">
              <button className="btn primary" onClick={onGenerateTicketPlan} disabled={!canTicket || loadingTicket}>
                {loadingTicket ? "Generating…" : "Generate Ticket Plan"}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setRawTicketText("");
                  setPlanText("");
                  setParsed(null);
                  setRagTicket(null);
                  setLatTicket(null);
                  setErr(null);
                }}
              >
                Clear
              </button>
            </div>
          </Card>

          <Card
            title="Ask a scenario (call handling)"
            right={loadingAsk ? <Pill tone="info">Thinking…</Pill> : canAsk ? <Pill tone="ok">Ready</Pill> : <Pill tone="warn">Type a question</Pill>}
          >
            <Field label="Scenario (optional)" hint="Paste a short call summary or guest statement. More detail = better policy match.">
              <textarea
                rows={5}
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                placeholder='Guest says: “I can’t arrive tomorrow, please cancel…”'
              />
            </Field>

            <Field label="Question" hint="Ask what to do + what to say.">
              <textarea
                rows={4}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What steps should I follow and what should I say?"
              />
            </Field>

            <div className="rowActions">
              <button className="btn primary" onClick={onAsk} disabled={!canAsk || loadingAsk}>
                {loadingAsk ? "Generating…" : "Ask Agent"}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setScenario("");
                  setQuestion("");
                  setErr(null);
                  setAnswer("");
                  setRagAsk(null);
                  setLatAsk(null);
                }}
              >
                Clear
              </button>
            </div>
          </Card>

          {err ? <Alert title={err.title || "Action needed"} text={err.text || String(err)} /> : null}
        </div>

        <div className="col">
          <Card title="Ticket Plan Output">
            <TicketPlanPanel planText={planText} parsed={parsed} rag={ragTicket} latencyMs={latTicket} />
          </Card>

          <Card title="Scenario Answer Output">
            <AnswerPanel answer={answer} rag={ragAsk} latencyMs={latAsk} />
          </Card>
        </div>
      </main>

      <footer className="footer">
        <Pill tone="muted">If you see 404: your Netlify redirect isn’t pointing to Render OR Render route is missing.</Pill>
      </footer>
    </div>
  );
}
