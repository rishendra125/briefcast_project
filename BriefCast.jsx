import { useState, useCallback } from "react";

const SYNTHETIC = {
  jira: `Sprint 24 — National Digital Infrastructure Programme
Period: 1 Sep – 14 Sep 2026
Velocity: 38 story points (target: 47, prev sprint: 47)
Completed tickets: 18 of 23 planned
Open tickets: 5 (3 carry-over, 2 new)
Blockers:
- INT-1142: API gateway latency >800ms on staging — pending infrastructure review (raised 4 Sep, owner: Platform Lead)
- INT-1156: Data migration script failing on legacy GUID format — raised 11 Sep, no owner assigned yet
In-sprint scope note: 2 tickets reference Q3 roadmap items not in sprint plan (INT-1138, INT-1139)`,
  escalation: `Escalation Log — Fortnightly Period ending 14 Sep 2026
Total escalations: 4
Categories:
- Vendor delay (Tier 2 SLA breach, Tata Consultancy): raised 3 Sep, under resolution — vendor remediation plan expected 18 Sep
- Resourcing gap: senior BA on medical leave, coverage not yet confirmed — OPEN
- Scope ambiguity: client requested additional reporting dashboard not in SOW — deferred to change control board
- Data governance: DPA sign-off outstanding for cross-department data share — OPEN, legal review in progress
Resolved this period: 1 of 4`,
  metrics: `Delivery Metrics — Fortnightly ending 14 Sep 2026
On-time delivery rate: 74% (target: 85%)
Budget variance: +3.2% over baseline (within tolerance up to 5%)
Milestones:
- MS-04 Integration Testing Gateway: DELAYED — 1 week slip, new date 19 Sep
- MS-05 UAT Environment Setup: ON TRACK — due 26 Sep
- MS-06 Stakeholder Signoff Draft: NOT STARTED — due 3 Oct
Resource utilisation: 91%`,
};

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(16).toUpperCase().padStart(8, "0");
}

function Badge({ rag }) {
  const styles = {
    Red: { background: "#FCEBEB", color: "#A32D2D" },
    Amber: { background: "#FAEEDA", color: "#854F0B" },
    Green: { background: "#EAF3DE", color: "#3B6D11" },
  };
  return (
    <span style={{
      ...styles[rag],
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500,
    }}>● {rag}</span>
  );
}

function Banner({ type, children }) {
  const styles = {
    warning: { background: "#FAEEDA", border: "0.5px solid #EF9F27", color: "#854F0B" },
    danger:  { background: "#FCEBEB", border: "0.5px solid #E24B4A", color: "#A32D2D" },
    info:    { background: "#E6F1FB", border: "0.5px solid #378ADD", color: "#185FA5" },
  };
  return (
    <div style={{ ...styles[type], borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function MetricChip({ val, label }) {
  return (
    <div style={{ background: "#f5f5f3", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 500, color: "#1a1a1a" }}>{val}</div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function BriefCast() {
  const [jira, setJira] = useState(SYNTHETIC.jira);
  const [escalation, setEscalation] = useState(SYNTHETIC.escalation);
  const [metrics, setMetrics] = useState(SYNTHETIC.metrics);
  const [period, setPeriod] = useState("fortnightly");
  const [audience, setAudience] = useState("steering");
  const [tone, setTone] = useState("formal");

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [ragConfirmNeeded, setRagConfirmNeeded] = useState(false);
  const [pendingRag, setPendingRag] = useState(null);
  const [copied, setCopied] = useState(false);

  const validate = () => {
    const missing = [];
    if (jira.trim().length < 30) missing.push("Sprint data (JIRA)");
    if (escalation.trim().length < 20) missing.push("Escalation log");
    if (metrics.trim().length < 20) missing.push("Delivery metrics");
    return missing;
  };

  const checkGuardrails = () => {
    const flags = [];
    if (/Q3 roadmap|not in sprint plan|out of scope/i.test(jira)) {
      flags.push({ type: "warning", text: "⚠️ Scope creep detected — sprint data references items outside the declared period (Q3 roadmap items INT-1138, INT-1139). These have been flagged to the AI for exclusion." });
    }
    if (audience === "csuite" && /API gateway latency|GUID format|migration script/i.test(jira)) {
      flags.push({ type: "warning", text: "⚠️ Tone/audience mismatch — C-suite selected but sprint data contains technical implementation detail. The AI will surface patterns only, not raw technical content." });
    }
    return flags;
  };

  const callClaudeAPI = async (ragOverride) => {
    const periodLabels = { weekly: "Weekly", fortnightly: "Fortnightly", monthly: "Monthly" };
    const audienceLabels = { csuite: "C-suite", steering: "Steering Committee", client: "Client" };

    const systemPrompt = `You are BriefCast, a PMO stakeholder reporting engine. Generate structured status reports from raw programme data.

Rules:
1. INTERPRET patterns unprompted (e.g. velocity drop as a leading indicator even if on-time rate held). Surface in executive summary.
2. Use ⚠️ prefix for ambiguous interpretations. Never present a guess as a conclusion.
3. Exclude out-of-period work; note if detected.
4. Audience tone: C-suite = outcomes/patterns only, no technical detail; Steering Committee = governance-focused; Client = delivery-focused.
5. Executive summary: max 2 sentences. Be concise throughout — short strings only.
6. RAG: Green = on track, Amber = at risk, Red = escalation required.${ragOverride ? `\n7. OVERRIDE: RAG must be ${ragOverride}.` : ""}
8. metrics array: exactly 3 items. risks array: max 4 items. blockers array: max 4 items. confidenceFlags: max 2 items, empty array if none.
9. All string values must be short. executiveSummary max 200 chars. deliveryPerformance max 200 chars. nextPeriodFocus max 180 chars. Each risk/blocker text max 100 chars.

Respond ONLY with a valid JSON object. No markdown, no backticks, no extra text.
{"rag":"Green|Amber|Red","ragAmbiguous":true,"executiveSummary":"","deliveryPerformance":"","metrics":[{"val":"","label":""}],"risks":[{"color":"red|amber|green","text":""}],"blockers":[{"text":"","noOwner":true}],"nextPeriodFocus":"","confidenceFlags":[]}`;

    const userPrompt = `Generate a ${periodLabels[period]} status report for ${audienceLabels[audience]} audience in ${tone} tone.

SPRINT DATA (JIRA):
${jira}

ESCALATION LOG:
${escalation}

DELIVERY METRICS:
${metrics}

Reporting period: ${periodLabels[period]} ending 14 Sep 2026.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    const raw = data.content.find(b => b.type === "text")?.text || "";
    const stripped = raw.replace(/```json|```/g, "").trim();
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON object found in response");
    return JSON.parse(stripped.slice(start, end + 1));
  };

  const generate = useCallback(async (ragOverride = null) => {
    const missing = validate();
    if (missing.length > 0) {
      setWarnings([{ type: "warning", text: `Data completeness check failed — missing or sparse: ${missing.join(", ")}. Add data before generating.` }]);
      return;
    }

    const guardrailFlags = checkGuardrails();
    setWarnings(guardrailFlags);
    setRagConfirmNeeded(false);
    setError(null);
    setLoading(true);
    setReport(null);

    try {
      const result = await callClaudeAPI(ragOverride);

      if (result.rag === "Red" && result.ragAmbiguous && !ragOverride) {
        setPendingRag(result);
        setRagConfirmNeeded(true);
        setLoading(false);
        return;
      }

      setReport({
        ...result,
        hash: hashStr(jira + escalation + metrics),
        ts: new Date().toLocaleString("en-GB"),
        period: { weekly: "Weekly", fortnightly: "Fortnightly", monthly: "Monthly" }[period],
        audience: { csuite: "C-suite", steering: "Steering Committee", client: "Client" }[audience],
        tone: tone.charAt(0).toUpperCase() + tone.slice(1),
      });
    } catch (e) {
      setError("Report generation failed — " + e.message);
    } finally {
      setLoading(false);
    }
  }, [jira, escalation, metrics, period, audience, tone]);

  const confirmRed = (useRed) => {
    setRagConfirmNeeded(false);
    if (pendingRag) {
      const override = useRed ? "Red" : "Amber";
      generate(override);
    }
  };

  const copyReport = () => {
    if (!report) return;
    const text = [
      `${report.period} Status Report — ${report.audience}`,
      `RAG Status: ${report.rag}`,
      "",
      "EXECUTIVE SUMMARY",
      report.executiveSummary,
      "",
      "DELIVERY PERFORMANCE",
      report.deliveryPerformance,
      "",
      "NEXT PERIOD FOCUS",
      report.nextPeriodFocus,
      "",
      `Generated: ${report.ts} | Input hash: ${report.hash}`,
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const sel = {
    width: "100%", height: 34, borderRadius: 6,
    border: "0.5px solid #d0d0cc", background: "#fff",
    fontSize: 13, padding: "0 8px", color: "#1a1a1a",
  };

  const ta = {
    width: "100%", height: 120, fontSize: 11, fontFamily: "monospace",
    resize: "none", border: "0.5px solid #d0d0cc", borderRadius: 6,
    padding: 8, background: "#fafaf8", color: "#1a1a1a", lineHeight: 1.6,
  };

  const btnPrimary = {
    background: "#185FA5", color: "#fff", border: "none",
    borderRadius: 6, padding: "0 20px", height: 34,
    fontSize: 13, fontWeight: 500, cursor: "pointer",
  };

  const btnSecondary = {
    background: "transparent", border: "0.5px solid #b0b0aa",
    borderRadius: 6, padding: "0 14px", height: 34,
    fontSize: 13, cursor: "pointer", color: "#3a3a38",
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", padding: "16px", boxSizing: "border-box", width: "100%" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, background: "#185FA5", borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 600, fontSize: 13, flexShrink: 0,
        }}>BC</div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 500, color: "#1a1a1a" }}>BriefCast</div>
          <div style={{ fontSize: 12, color: "#888" }}>AI-powered stakeholder reporting generator</div>
        </div>
      </div>

      {/* Pre-load banner */}
      <div style={{
        background: "#E6F1FB", border: "0.5px solid #378ADD",
        borderRadius: 8, padding: "9px 14px", marginBottom: 14,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 13, color: "#185FA5" }}>
          Synthetic PMO dataset loaded — demo ready. Paste your own data to override.
        </span>
        <button style={{ ...btnSecondary, height: 28, fontSize: 12, flexShrink: 0 }}
          onClick={() => { setJira(SYNTHETIC.jira); setEscalation(SYNTHETIC.escalation); setMetrics(SYNTHETIC.metrics); }}>
          Reload demo
        </button>
      </div>

      {/* Controls */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
        {[
          { label: "Reporting period", id: "period", val: period, set: setPeriod, opts: [["fortnightly","Fortnightly"],["weekly","Weekly"],["monthly","Monthly"]] },
          { label: "Audience", id: "audience", val: audience, set: setAudience, opts: [["steering","Steering committee"],["csuite","C-suite"],["client","Client"]] },
          { label: "Tone", id: "tone", val: tone, set: setTone, opts: [["formal","Formal"],["concise","Concise"],["detailed","Detailed"]] },
        ].map(({ label, id, val, set, opts }) => (
          <div key={id}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{label}</div>
            <select style={sel} value={val} onChange={e => set(e.target.value)}>
              {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* Input grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
        {[
          { label: "Sprint data (JIRA)", hint: "Velocity, tickets, blockers", val: jira, set: setJira },
          { label: "Escalation log", hint: "Count, categories, resolution", val: escalation, set: setEscalation },
          { label: "Delivery metrics", hint: "On-time rate, budget, milestones", val: metrics, set: setMetrics },
        ].map(({ label, hint, val, set }) => (
          <div key={label} style={{ background: "#fff", border: "0.5px solid #d0d0cc", borderRadius: 10, padding: 12, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#1a1a1a", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 11, color: "#aaa", marginBottom: 8 }}>{hint}</div>
            <textarea style={ta} value={val} onChange={e => set(e.target.value)} />
          </div>
        ))}
      </div>

      {/* Warnings */}
      {warnings.map((w, i) => (
        <Banner key={i} type={w.type}>{w.text}</Banner>
      ))}

      {/* RAG Red confirmation */}
      {ragConfirmNeeded && (
        <Banner type="danger">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>Red status detected — confirmation required</div>
          <div style={{ marginBottom: 10, fontSize: 13 }}>
            The AI has assessed overall status as <strong>Red</strong>, but some inputs are ambiguous. Red status has real governance consequences — please confirm before finalising.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...btnSecondary, height: 30, fontSize: 12, borderColor: "#A32D2D", color: "#A32D2D" }} onClick={() => confirmRed(true)}>
              Confirm Red — finalise
            </button>
            <button style={{ ...btnSecondary, height: 30, fontSize: 12 }} onClick={() => confirmRed(false)}>
              Override — set to Amber
            </button>
          </div>
        </Banner>
      )}

      {error && <Banner type="danger">{error}</Banner>}

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button style={btnPrimary} onClick={() => generate()} disabled={loading}>
          {loading ? "Generating…" : "Generate report"}
        </button>
        <button style={btnSecondary} onClick={() => {
          setJira(""); setEscalation(""); setMetrics("");
          setReport(null); setWarnings([]); setError(null); setRagConfirmNeeded(false);
        }}>Clear</button>
        {loading && <span style={{ fontSize: 12, color: "#888" }}>Calling Claude API…</span>}
      </div>

      {/* Report output */}
      {report && (
        <div style={{ background: "#fff", border: "0.5px solid #d0d0cc", borderRadius: 12, padding: 20 }}>

          {/* Report header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 14, borderBottom: "0.5px solid #e8e8e4" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#1a1a1a", marginBottom: 3 }}>
                Programme Status Report — {report.period}
              </div>
              <div style={{ fontSize: 12, color: "#aaa" }}>
                {report.audience} · {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · {report.tone}
              </div>
            </div>
            <Badge rag={report.rag} />
          </div>

          {/* Confidence flags */}
          {report.confidenceFlags?.length > 0 && (
            <Banner type="warning">
              <strong>⚠️ Confidence flags</strong>
              <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                {report.confidenceFlags.map((f, i) => <li key={i} style={{ marginBottom: 2 }}>{f}</li>)}
              </ul>
            </Banner>
          )}

          {/* Executive summary */}
          <Section title="Executive summary">
            <p style={{ fontSize: 14, lineHeight: 1.75, color: "#2a2a28" }}>{report.executiveSummary}</p>
          </Section>

          {/* Delivery performance */}
          <Section title="Delivery performance">
            <p style={{ fontSize: 14, lineHeight: 1.75, color: "#2a2a28", marginBottom: 10 }}>{report.deliveryPerformance}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8 }}>
              {report.metrics?.map((m, i) => <MetricChip key={i} val={m.val} label={m.label} />)}
            </div>
          </Section>

          {/* Risk & escalation */}
          <Section title="Risk & escalation summary">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {report.risks?.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "6px 10px", background: "#fafaf8", borderRadius: 6, color: "#2a2a28" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: r.color === "red" ? "#E24B4A" : r.color === "green" ? "#639922" : "#EF9F27" }} />
                  {r.text}
                </div>
              ))}
            </div>
          </Section>

          {/* Blockers & actions */}
          <Section title="Blockers & actions">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {report.blockers?.map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, padding: "6px 10px", background: "#fafaf8", borderRadius: 6, color: "#2a2a28" }}>
                  <span style={{ color: "#aaa", marginTop: 1, flexShrink: 0 }}>→</span>
                  {b.text}
                  {b.noOwner && (
                    <span style={{ fontSize: 11, background: "#FAEEDA", color: "#854F0B", padding: "2px 6px", borderRadius: 4, flexShrink: 0, marginLeft: 4 }}>⚠️ no owner</span>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* Next period focus */}
          <Section title="Next period focus">
            <p style={{ fontSize: 14, lineHeight: 1.75, color: "#2a2a28" }}>{report.nextPeriodFocus}</p>
          </Section>

          {/* Report actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={btnSecondary} onClick={copyReport}>
              {copied ? "Copied" : "Copy report"}
            </button>
          </div>

          {/* Audit trail */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "0.5px solid #e8e8e4", fontSize: 11, color: "#bbb" }}>
            <span>Input hash: {report.hash}</span>
            <span>Generated: {report.ts}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: "#aaa", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
