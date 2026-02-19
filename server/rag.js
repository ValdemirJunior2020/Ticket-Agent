function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/g)
    .filter((t) => t && t.length > 2);
}

function scoreDoc(queryTokens, docTokens) {
  if (!queryTokens.length || !docTokens.length) return 0;

  const q = new Map();
  for (const t of queryTokens) q.set(t, (q.get(t) || 0) + 1);

  const d = new Map();
  for (const t of docTokens) d.set(t, (d.get(t) || 0) + 1);

  let score = 0;
  for (const [t, qtf] of q.entries()) {
    const dtf = d.get(t) || 0;
    if (dtf) score += Math.sqrt(qtf) * Math.sqrt(dtf);
  }
  return score;
}

export function buildRagContext({
  procedures = [],
  query = "",
  maxChunks = 6,
  maxCharsPerChunk = 1200
}) {
  const qTokens = tokenize(query);

  const scored = procedures
    .map((p) => {
      const docText = `${p.title} ${p.tags || ""} ${p.body}`;
      const dTokens = tokenize(docText);
      const score = scoreDoc(qTokens, dTokens);
      return { ...p, score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks);

  const context = scored
    .map((p) => {
      const chunk =
        p.body.length > maxCharsPerChunk ? p.body.slice(0, maxCharsPerChunk) + "…" : p.body;

      return `---
ID: ${p.id}
SHEET: ${p.sheet}
TITLE: ${p.title}
TAGS: ${p.tags || ""}
TEXT: ${chunk}
`;
    })
    .join("\n");

  return { picked: scored, context };
}
