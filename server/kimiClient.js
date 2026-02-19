const BASE_URL = String(process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
const MODEL = process.env.NVIDIA_MODEL || "moonshotai/kimi-k2.5";

export async function kimiChat({ system, user }) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("Missing NVIDIA_API_KEY in server/.env");

  const max_tokens = Number(process.env.NVIDIA_MAX_TOKENS || 800);
  const temperature = Number(process.env.NVIDIA_TEMPERATURE || 0.2);

  const resp = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature,
      max_tokens
    })
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`NVIDIA NIM error ${resp.status}: ${t.slice(0, 1200)}`);
  }

  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return { text, usage: data?.usage || null, raw: data };
}
