import React, { useMemo, useState } from "react";

const CALL_CENTERS = ["Concentrix", "Buwelo", "WNS", "Teleperformance", "Telus", "Other"];

// ✅ put your Google Sheet here (opens in new tab)
const GOOGLE_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1hKvJtK_p-bQBLZ0oYg9o-GeYc661jZDIhOG_VDFSX4Y/edit?gid=0#gid=0";

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

function HelpPanel() {
  return (
    <div className="subCard">
      <div className="subCardTitle">How to use this tool</div>

      <div className="muted small" style={{ lineHeight: 1.5 }}>
        <b>Ticket Copilot (Zendesk Specialist)</b>
        <br />
        1) Paste the full Zendesk ticket dump (including internal notes).
        <br />
        2) Pick <b>Solved?</b> YES/NO.
        <br />
        3) Click <b>Generate Ticket Plan</b> to get a step-by-step plan (who to contact first, what to do, and what to
        document) based on your matrix.
        <br />
        4) When generated, we log to Google Sheet: <b>Agent Name</b>, <b>Agent Email</b>, <b>Call Center</b>,{" "}
        <b>Itinerary</b>, <b>Solved</b>, and the full <b>Ticket Plan Output</b>.
        <br />
        <br />
        <b>Agent Assist (Quick Question)</b>
        <br />
        Use this when you just need “what do I say / what do I do” for a call scenario. (We can add this section back as a
        second tab or second card — right now this UI is focused on ticket work.)
      </div>
    </div>
  );
}

function AnswerPanel({ answer, rag, latencyMs }) {
  if (!answer) {
    return (
      <div className="empty">
        <div className="emptyIcon">💬</div>
        <div className="emptyTitle">Paste a ticket to get a plan</div>
        <div className="emptySub">
          The assistant will pull the most relevant procedure snippets from your Matrix-File and generate a compliant
          ticket plan.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="answerMeta">
        <Pill tone="ok">Plan ready</Pill>
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

export default function App() {
  const [agentName, setAgentName] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [callCenter, setCallCenter] = useState(CALL_CENTERS[0]);

  const [solved, setSolved] = useState("NO");
  const [rawTicketText, setRawTicketText] = useState("");

  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [rag, setRag] = useState(null);
  const [latencyMs, setLatencyMs] = useState(null);
  const [err, setErr] = useState("");
  const [savedInfo, setSavedInfo] = useState("");

  const canAsk = useMemo(() => rawTicketText.trim().length >= 20, [rawTicketText]);

  async function onTicketAssist() {
    setErr("");
    setSavedInfo("");
    setAnswer("");
    setRag(null);
    setLatencyMs(null);
    setLoading(true);

    const startedAt = Date.now();

    try {
      const resp = await fetch("/api/ticket-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName,
          agentEmail,
          callCenter,
          solved,
          rawTicketText,
          useAI: true,
          meta: { source: "web-ui" },
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        const detail = data?.error ? ` — ${data.error}` : "";
        throw new Error(`Request failed (${resp.status})${detail}`);
      }

      setAnswer(data.planText || data.answer || "");
      setRag(data.rag || null);
      setLatencyMs(typeof data.latencyMs === "number" ? data.latencyMs : Date.now() - startedAt);

      if (data.saved === true) {
        setSavedInfo(`Saved ✅  Itinerary: ${data.itinerary || "—"}  |  Call Center: ${callCenter}`);
      } else if (data.saved === false) {
        setSavedInfo(`Not saved ⚠️  ${data.saveError || "Missing required fields (name/email/itinerary)."}`);
      }
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function onReloadProcedures() {
    setErr("");
    setSavedInfo("");
    setLoading(true);
    try {
      const resp = await fetch("/api/reload-procedures", { method: "POST" });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) throw new Error(data.error || `Reload failed (${resp.status})`);
      alert(`Procedures reloaded. Rows: ${data.count}`);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  function onClear() {
    setRawTicketText("");
    setErr("");
    setSavedInfo("");
    setAnswer("");
    setRag(null);
    setLatencyMs(null);
    setSolved("NO");
  }

  return (
    <div className="shell">
      <div className="bgGlow" />

      <header className="topbar">
        <div className="brand">
          <div className="brandMark">HP</div>
          <div className="brandText">
            <div className="brandTitle">Ticket Copilot + Agent Assist</div>
            <div className="brandSub">Glassy UI • Procedure-aware • Logs: name + email + call center + itinerary + solved + plan</div>
          </div>
        </div>

        <div className="topbarRight">
          <Pill tone="muted">Server: /api</Pill>

          {/* ✅ Open Google Sheet button (GREEN TEXT) */}
          <a
            className="btn ghost"
            href={GOOGLE_SHEET_URL}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#22c55e", textDecoration: "none" }}
          >
            Open Google Sheet
          </a>

          <button className="btn ghost" onClick={onReloadProcedures} disabled={loading}>
            Reload Procedures
          </button>
        </div>
      </header>

      <main className="grid">
        <div className="col">
          <Card title="Agent identity (used for logs)">
            <div className="twoCol">
              <Field label="Agent name">
                <input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="e.g. Frank M" />
              </Field>

              <Field label="Agent email">
                <input value={agentEmail} onChange={(e) => setAgentEmail(e.target.value)} placeholder="agent@hotelplanner.com" />
              </Field>
            </div>

            <Field label="Call center" hint="This is saved to Google Sheet.">
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
            right={loading ? <Pill tone="info">Thinking…</Pill> : canAsk ? <Pill tone="ok">Ready</Pill> : <Pill tone="warn">Paste ticket</Pill>}
          >
            <HelpPanel />

            <Field label="Solved?" hint='Saved to Google Sheet as YES/NO.'>
              <select value={solved} onChange={(e) => setSolved(e.target.value)}>
                <option value="NO">NO</option>
                <option value="YES">YES</option>
              </select>
            </Field>

            <Field label="Paste Zendesk ticket text" hint="Paste the whole ticket dump. Phone/IP/email will be redacted automatically.">
              <textarea
                rows={10}
                value={rawTicketText}
                onChange={(e) => setRawTicketText(e.target.value)}
                placeholder="Paste the full Zendesk ticket here..."
              />
            </Field>

            <div className="rowActions">
              <button className="btn primary" onClick={onTicketAssist} disabled={!canAsk || loading}>
                {loading ? "Generating…" : "Generate Ticket Plan"}
              </button>
              <button className="btn" type="button" onClick={onClear}>
                Clear
              </button>
            </div>

            {savedInfo ? (
              <div className="alert" style={{ borderColor: "rgba(0,255,180,0.18)" }}>
                <div className="alertIcon">✅</div>
                <div className="alertBody">
                  <div className="alertTitle">Log status</div>
                  <div className="alertText">{savedInfo}</div>
                </div>
              </div>
            ) : null}

            {err ? (
              <div className="alert">
                <div className="alertIcon">⚠️</div>
                <div className="alertBody">
                  <div className="alertTitle">Action needed</div>
                  <div className="alertText">{err}</div>
                </div>
              </div>
            ) : null}
          </Card>
        </div>

        <div className="col">
          <Card title="Ticket Plan Output">
            <AnswerPanel answer={answer} rag={rag} latencyMs={latencyMs} />
          </Card>
        </div>
      </main>

      <footer className="footer">
        <Pill tone="muted">Saved to Google Sheet Column G: “Ticket Plan Output”</Pill>
      </footer>
    </div>
  );
}
