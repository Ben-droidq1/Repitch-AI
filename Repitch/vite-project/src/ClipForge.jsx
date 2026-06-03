import { useEffect, useState } from "react";

const PLATFORMS = [
  { id: "social", label: "Social Media Post", icon: "𝕏", color: "#1DA1F2" },
  { id: "linkedin", label: "LinkedIn Post", icon: "in", color: "#0A66C2" },
  { id: "newsletter", label: "Newsletter", icon: "✉", color: "#F59E0B" },
  { id: "video_script", label: "Video Script", icon: "▶", color: "#EF4444" },
  { id: "seo_blog", label: "SEO Blog", icon: "✍", color: "#10B981" },
];

const TONES = ["Professional", "Casual", "Witty", "Educational", "Hype / Web3"];
const LENGTH_OPTIONS = [
  { id: "short", label: "Short", value: 280 },
  { id: "medium", label: "Medium", value: 500 },
  { id: "long", label: "Long", value: 900 },
];

const SOURCE_TYPES = {
  transcript: {
    label: "Video Transcript",
    shortLabel: "Transcript",
    placeholder: "Paste a YouTube link, video link, or transcript you want turned into posts...",
  },
  blog: {
    label: "Article / Blog",
    shortLabel: "Article",
    placeholder: "Paste the article, blog post, or newsletter you want repurposed...",
  },
  raw: {
    label: "Reference Notes",
    shortLabel: "Notes",
    placeholder: "Paste your reference, rough notes, outline, or idea dump...",
  },
};

const SYSTEM_PROMPT = `You are Repitch — an expert content strategist and copywriter. 
Given source content (YouTube transcript, blog post, or raw text), generate high-quality repurposed content.
Be specific, punchy, and platform-native. Never be generic.
Always return ONLY the requested content — no preamble, no meta-commentary.`;

function getApiError(data, fallback) {
  return data?.error?.message || data?.error || fallback;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (error) {
    return { error: "The server returned an invalid response." };
  }
}

function buildPrompt(input, inputType, platform, tone, targetLength) {
  const toneStr = `Tone: ${tone}.`;
  const sourceLabel = SOURCE_TYPES[inputType]?.label || "Reference Material";
  const grounding = `Use the user's reference material as the source of truth.
Reference type: ${sourceLabel}.
Target length: about ${targetLength} characters.
Preserve the core idea, facts, examples, names, and angle from the reference.
Do not invent unsupported claims, stats, quotes, case studies, or personal experiences.
If the reference is thin, add only reasonable copywriting structure, not fake facts.`;
  const prompts = {
    social: `${toneStr}\n\nWrite a strong social media post for X from this content. Keep it engaging, punchy, and platform-native. Make the hook immediate, keep the message clear, and end with a concise takeaway or CTA.\n\nContent:\n${input}`,
    linkedin: `${toneStr}\n\nWrite a LinkedIn post from this content. Use a strong hook first line (no "I" start). Add line breaks for readability. End with a thought-provoking question. 150–300 words.\n\nContent:\n${input}`,
    newsletter: `${toneStr}\n\nWrite an email newsletter section from this content. Include: Subject line, Preview text, Opening hook, 2–3 key insights with brief explanations, CTA at the end. 300–500 words.\n\nContent:\n${input}`,
    video_script: `${toneStr}\n\nWrite a 60–90 second short-form video script from this content. Format: [HOOK 0–3s], [CONTEXT 3–10s], [3 KEY POINTS 10–50s], [CTA 50–60s]. Add [B-ROLL] suggestions in brackets.\n\nContent:\n${input}`,
    seo_blog: `${toneStr}\n\nWrite an SEO-optimized blog post from this content. Include: Title with keyword, Meta description (155 chars), H2/H3 structure, intro, 3–5 sections, conclusion with CTA. 600–900 words.\n\nContent:\n${input}`,
  };
  return `${grounding}\n\n${prompts[platform]}`;
}

export default function ClipForgeAI() {
  const [input, setInput] = useState("");
  const [inputType, setInputType] = useState("raw");
  const [selectedPlatforms, setSelectedPlatforms] = useState(["social"]);
  const [tone, setTone] = useState("Professional");
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});
  const [activeTab, setActiveTab] = useState(null);
  const [copied, setCopied] = useState(null);
  const [charCount, setCharCount] = useState(0);
  const [targetLength, setTargetLength] = useState(500);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("repitch-history");
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (error) {
      console.warn("Could not load history", error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("repitch-history", JSON.stringify(history));
  }, [history]);

  const togglePlatform = (id) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const generatePlatform = async (platformId) => {
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [
            { role: "user", content: buildPrompt(input, inputType, platformId, tone, targetLength) },
          ],
        }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(getApiError(data, "Error generating content."));
      }
      const text = data.text || data.content?.map((b) => b.text || "").join("\n") || "Error generating content.";
      setResults((prev) => ({ ...prev, [platformId]: text }));
      setHistory((prev) => [
        {
          id: `${Date.now()}-${platformId}`,
          platform: platformId,
          label: PLATFORMS.find((p) => p.id === platformId)?.label || platformId,
          text,
          tone,
          inputType,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 8));
    } catch (error) {
      setResults((prev) => ({ ...prev, [platformId]: `Failed to generate: ${error.message}` }));
    } finally {
      setLoading((prev) => ({ ...prev, [platformId]: false }));
    }
  };

  const handleGenerate = async () => {
    if (!input.trim() || selectedPlatforms.length === 0) return;
    const newLoading = {};
    selectedPlatforms.forEach((p) => (newLoading[p] = true));
    setLoading(newLoading);
    setResults({});
    setActiveTab(selectedPlatforms[0]);

    await Promise.all(selectedPlatforms.map((platformId) => generatePlatform(platformId)));
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const hasResults = Object.keys(results).length > 0;
  const isGenerating = Object.values(loading).some(Boolean);
  const activePlatform = PLATFORMS.find((p) => p.id === activeTab);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100vh", background: "#0A0A0F", color: "#E8E8F0" }}>
      {/* Header */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000, height: "72px", borderBottom: "1px solid #1E1E2E", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12, background: "#0D0D18" }}>
        <div style={{ width: 36, height: 36, background: "linear-gradient(135deg, #6C47FF, #FF6B6B)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>↗</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.3px" }}>Re<span style={{ background: "linear-gradient(90deg, #6C47FF, #FF6B6B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>pitch</span></div>
          <div style={{ fontSize: 11, color: "#666", marginTop: 1 }}>One idea. Every platform.</div>
        </div>
        <div style={{ marginLeft: "auto", background: "#1A1A2E", border: "1px solid #2A2A4A", borderRadius: 20, padding: "4px 12px", fontSize: 11, color: "#888" }}>
          MVP v0.1
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px", paddingTop: "96px", display: "grid", gridTemplateColumns: hasResults ? "1fr 1fr" : "1fr", gap: 24, "@media (maxWidth: 1024px)": { gridTemplateColumns: "1fr", gap: 20, padding: "20px 16px" }, "@media (maxWidth: 640px)": { gap: 16, padding: "16px 12px" } }}>
        {/* LEFT — Input Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Input Type */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>Reference Type</label>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {Object.entries(SOURCE_TYPES).map(([t, source]) => (
                <button key={t} onClick={() => setInputType(t)}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: inputType === t ? "1px solid #6C47FF" : "1px solid #2A2A4A", background: inputType === t ? "rgba(108,71,255,0.15)" : "#111120", color: inputType === t ? "#A78BFA" : "#666", fontSize: "clamp(11px, 2vw, 13px)", cursor: "pointer", fontWeight: inputType === t ? 600 : 400, transition: "all 0.15s" }}>
                  {t === "transcript" ? "📹 Transcript" : t === "blog" ? "📝 Blog Post" : "✏️ Raw Text"}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>Paste Reference</label>
              <span style={{ fontSize: 11, color: charCount > 8000 ? "#EF4444" : "#555" }}>{charCount.toLocaleString()} chars</span>
            </div>
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); setCharCount(e.target.value.length); }}
              placeholder={inputType === "transcript" ? "Paste your YouTube transcript or video transcript here…" : inputType === "blog" ? "Paste your blog post content here…" : "Paste any text content here…"}
              style={{ width: "100%", minHeight: "clamp(150px, 40vh, 300px)", background: "#111120", border: "1px solid #1E1E2E", borderRadius: 12, padding: "12px 14px", color: "#E8E8F0", fontSize: "clamp(13px, 2vw, 14px)", lineHeight: 1.6, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit", transition: "border 0.15s" }}
              onFocus={(e) => (e.target.style.border = "1px solid #6C47FF")}
              onBlur={(e) => (e.target.style.border = "1px solid #1E1E2E")}
            />
          </div>

          {/* Tone */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>Tone</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8 }}>
              {TONES.map((t) => (
                <button key={t} onClick={() => setTone(t)}
                  style={{ padding: "6px 12px", borderRadius: 20, border: tone === t ? "1px solid #FF6B6B" : "1px solid #2A2A4A", background: tone === t ? "rgba(255,107,107,0.15)" : "#111120", color: tone === t ? "#FCA5A5" : "#666", fontSize: "clamp(11px, 2vw, 12px)", cursor: "pointer", fontWeight: tone === t ? 600 : 400, transition: "all 0.15s", whiteSpace: "nowrap" }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Length Target */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>Target Length</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {LENGTH_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setTargetLength(option.value)}
                  style={{ padding: "8px 10px", borderRadius: 10, border: targetLength === option.value ? "1px solid #6C47FF" : "1px solid #2A2A4A", background: targetLength === option.value ? "rgba(108,71,255,0.15)" : "#111120", color: targetLength === option.value ? "#A78BFA" : "#666", fontSize: "clamp(11px, 2vw, 12px)", cursor: "pointer", fontWeight: targetLength === option.value ? 600 : 400 }}>
                  {option.label} · {option.value} chars
                </button>
              ))}
            </div>
          </div>

          {/* Platforms */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>
              Output Formats <span style={{ color: "#444", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— select all you need</span>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: 8 }}>
              {PLATFORMS.map((p) => {
                const sel = selectedPlatforms.includes(p.id);
                return (
                  <button key={p.id} onClick={() => togglePlatform(p.id)}
                    style={{ padding: "10px 8px", borderRadius: 10, border: sel ? `1px solid ${p.color}44` : "1px solid #1E1E2E", background: sel ? `${p.color}15` : "#111120", color: sel ? "#E8E8F0" : "#555", fontSize: "clamp(10px, 2vw, 12px)", cursor: "pointer", transition: "all 0.15s", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minHeight: "90px", justifyContent: "center" }}>
                    <span style={{ fontSize: "clamp(16px, 4vw, 18px)" }}>{p.icon}</span>
                    <span style={{ fontWeight: sel ? 600 : 400, textAlign: "center", lineHeight: 1.2 }}>{p.label}</span>
                    {sel && <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.color, marginTop: 2 }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* History */}
          <div style={{ background: "#0D0D18", border: "1px solid #1E1E2E", borderRadius: 14, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>Recent History</label>
              <span style={{ fontSize: 11, color: "#555" }}>{history.length} saved</span>
            </div>
            {history.length === 0 ? (
              <div style={{ color: "#555", fontSize: 12 }}>Your previous creations will appear here.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.platform);
                      setResults((prev) => ({ ...prev, [item.platform]: item.text }));
                    }}
                    style={{ textAlign: "left", border: "1px solid #1E1E2E", background: "#111120", borderRadius: 10, padding: "10px 12px", color: "#E8E8F0", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: "#A78BFA", marginBottom: 4 }}>
                      <span>{item.label}</span>
                      <span style={{ color: "#666" }}>{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#D0D0E8", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
                      {item.text.slice(0, 110)}{item.text.length > 110 ? "…" : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!input.trim() || selectedPlatforms.length === 0 || isGenerating}
            style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: input.trim() && selectedPlatforms.length > 0 && !isGenerating ? "linear-gradient(135deg, #6C47FF, #FF6B6B)" : "#1A1A2E", color: input.trim() && selectedPlatforms.length > 0 && !isGenerating ? "#fff" : "#444", fontSize: "clamp(14px, 2vw, 15px)", fontWeight: 700, cursor: input.trim() && selectedPlatforms.length > 0 && !isGenerating ? "pointer" : "not-allowed", transition: "all 0.2s", letterSpacing: "-0.2px" }}>
            {isGenerating ? "↗ Repitching…" : `↗ Repitch to ${selectedPlatforms.length} Format${selectedPlatforms.length !== 1 ? "s" : ""}`}
          </button>
        </div>

        {/* RIGHT — Results Panel */}
        {hasResults && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0, background: "#0D0D18", border: "1px solid #1E1E2E", borderRadius: 16, overflow: "hidden", minHeight: "500px" }}>
            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #1E1E2E", overflowX: "auto", scrollBehavior: "smooth" }}>
              {selectedPlatforms.map((pid) => {
                const p = PLATFORMS.find((pl) => pl.id === pid);
                const isLoading = loading[pid];
                const isActive = activeTab === pid;
                return (
                  <button key={pid} onClick={() => setActiveTab(pid)}
                    style={{ padding: "clamp(8px, 2vw, 12px) clamp(12px, 2vw, 16px)", border: "none", background: isActive ? "#111120" : "transparent", color: isActive ? "#E8E8F0" : "#555", fontSize: "clamp(11px, 2vw, 12px)", fontWeight: isActive ? 600 : 400, cursor: "pointer", borderBottom: isActive ? `2px solid ${p?.color}` : "2px solid transparent", whiteSpace: "nowrap", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6, minWidth: "min-content" }}>
                    <span>{p?.icon}</span>
                    <span>{p?.label}</span>
                    {isLoading && <span style={{ width: 8, height: 8, borderRadius: "50%", border: `2px solid ${p?.color}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite", display: "inline-block" }} />}
                    {!isLoading && results[pid] && <span style={{ width: 6, height: 6, borderRadius: "50%", background: p?.color }} />}
                  </button>
                );
              })}
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, padding: "clamp(12px, 4vw, 20px)", position: "relative", minHeight: "300px", overflowY: "auto" }}>
              {activeTab && loading[activeTab] && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 250, gap: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px solid ${activePlatform?.color || "#6C47FF"}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
                  <span style={{ color: "#555", fontSize: "clamp(12px, 2vw, 13px)", textAlign: "center" }}>Forging {activePlatform?.label}…</span>
                </div>
              )}
              {activeTab && !loading[activeTab] && results[activeTab] && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "clamp(12px, 2vw, 13px)", fontWeight: 600, color: activePlatform?.color }}>{activePlatform?.icon} {activePlatform?.label}</span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(results[activeTab], activeTab)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${activePlatform?.color}44`, background: copied === activeTab ? `${activePlatform?.color}22` : "transparent", color: copied === activeTab ? activePlatform?.color : "#888", fontSize: "clamp(11px, 2vw, 12px)", cursor: "pointer", transition: "all 0.15s", fontWeight: 500, whiteSpace: "nowrap" }}>
                      {copied === activeTab ? "✓ Copied!" : "Copy All"}
                    </button>
                  </div>
                  <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "clamp(12px, 2vw, 13.5px)", lineHeight: 1.7, color: "#D0D0E8", margin: 0, fontFamily: "inherit", overflowY: "auto", maxHeight: "calc(100% - 60px)" }}>
                    {results[activeTab]}
                  </pre>
                </>
              )}
            </div>
          </div>
        )}

        {/* Empty state when generating first batch */}
        {isGenerating && !hasResults && (
          <div style={{ background: "#0D0D18", border: "1px solid #1E1E2E", borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, minHeight: "clamp(300px, 50vh, 400px)", gridColumn: hasResults ? "auto" : "1 / -1" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid #6C47FF", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
            <div style={{ textAlign: "center", padding: "0 16px" }}>
              <div style={{ fontWeight: 600, color: "#E8E8F0", fontSize: "clamp(14px, 2vw, 16px)" }}>Repitching your content…</div>
              <div style={{ fontSize: "clamp(11px, 2vw, 12px)", color: "#555", marginTop: 4 }}>Generating {selectedPlatforms.length} format{selectedPlatforms.length !== 1 ? "s" : ""}</div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 1024px) {
          [data-layout-container] {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 768px) {
          [data-platform-tabs] {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
        }
        @media (max-width: 480px) {
          [data-platform-grid] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "16px", borderTop: "1px solid #1A1A2E", color: "#333", fontSize: 11 }}>
        Repitch · 
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #2A2A4A; border-radius: 3px; }
        textarea::placeholder { color: #333; }
      `}</style>
    </div>
  );
}
