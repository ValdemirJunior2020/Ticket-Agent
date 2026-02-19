// client/src/App.jsx
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

function AnswerPanel({ answer, rag, latencyMs }) {
  if (!answer) {
    return (
      <div className="empty">
        <div className="emptyIcon">🎫</div>
        <div className="emptyTitle">Paste a Zendesk ticket to get a plan</div>
        <div className="emptySub">The tool extracts key fields and outputs a step-by-step specialist workflow.</div>
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

      <pre className="answerBox" style={{ height: 430 }}>{answer}</pre>

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
          <div className="muted small">No matching snippets. Add more exact matrix wording to the ticket notes.</div>
        )}
      </div>
    </>
  );
}

export default function App() {
  const [agentName, setAgentName] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [callCenter, setCallCenter] = useState(CALL_CENTERS[0]);

  const [rawTicketText, setRawTicketText] = useState("");
  const [useAI, setUseAI] = useState(true);

  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [rag, setRag] = useState(null);
  const [latencyMs, setLatencyMs] = useState(null);
  const [err, setErr] = useState("");

  const canRun = useMemo(() => rawTicketText.trim().length >= 20, [rawTicketText]);

  async function onRunTicketAssist() {
    setErr("");
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
          rawTicketText,
          useAI,
          meta: { source: "web-ui" }
        })
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) throw new Error(data.error || `Request failed (${resp.status})`);

      setAnswer(data.planText || "");
      setRag(data.rag || null);
      setLatencyMs(typeof data.latencyMs === "number" ? data.latencyMs : Date.now() - startedAt);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shell onepage">
      <div className="bgGlow" />

      <header className="topbar">
        <div className="brand">
          <div className="brandMark">HP</div>
          <div className="brandText">
            <div className="brandTitle">HotelPlanner Ticket Specialist</div>
            <div className="brandSub">Paste Zendesk dump → step-by-step + call order + scripts</div>
          </div>
        </div>

        <div className="topbarRight">
          <Pill tone={useAI ? "ok" : "warn"}>{useAI ? "AI ON" : "AI OFF"}</Pill>
          <button className="btn ghost" onClick={() => setUseAI((v) => !v)} disabled={loading}>
            Toggle AI
          </button>
        </div>
      </header>

      <main className="grid">
        <div className="col">
          <Card title="Paste Zendesk Ticket">
            <div className="twoCol">
              <Field label="Agent name">
                <input value={agentName} onChange={(e) => setAgentName(e.target.value)} />
              </Field>
              <Field label="Agent email">
                <input value={agentEmail} onChange={(e) => setAgentEmail(e.target.value)} />
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

            <Field label="Zendesk dump" hint="Paste the whole ticket text. Phone/IP/email will be redacted automatically.">
              <textarea rows={14} value={rawTicketText} onChange={(e) => setRawTicketText(e.target.value)} />
            </Field>

            <div className="rowActions">
              <button className="btn primary" onClick={onRunTicketAssist} disabled={!canRun || loading}>
                {loading ? "Building plan…" : "Generate Ticket Plan"}
              </button>
              <button className="btn" type="button" onClick={() => { setRawTicketText(""); setErr(""); setAnswer(""); setRag(null); setLatencyMs(null); }}>
                Clear
              </button>
            </div>

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
          <Card title="Specialist Plan">
            <AnswerPanel answer={answer} rag={rag} latencyMs={latencyMs} />
          </Card>
        </div>
      </main>

      <footer className="footer">
        <Pill tone="muted">Saving: /api/ticket-assist can log into Google Sheets when GAS is configured.</Pill>
      </footer>
    </div>
  );
}
