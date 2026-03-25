const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function buildPrompt(pendingTopics, activeVoices, recentTopics) {
  const voicesText = activeVoices.length
    ? `\nTRUSTED VOICES TO REFERENCE:\n${activeVoices.map(v => `- ${v.name}: ${v.expertise}. Key points: ${v.talking_points}`).join("\n")}`
    : "";
  const topicsText = pendingTopics.length
    ? `\nPRIORITY TOPICS FROM TOPIC BANK (use these first if relevant):\n${pendingTopics.map(t => `- ${t.topic} [${t.pillar || "general"}]${t.notes ? " — " + t.notes : ""}`).join("\n")}`
    : "";
  const avoidText = recentTopics.length
    ? `\nAVOID THESE RECENTLY COVERED TOPICS (do not repeat any of these):\n${recentTopics.join(", ")}`
    : "";

  return `You are the content strategist for Free of Ugly — a science-first men's health and wellness brand. Generate exactly 3 carousel concepts for Instagram.

BRAND VOICE: Dry, witty, science-grounded, slightly confrontational. Never preachy. The enemy is bad information not the person who believed it. Looking good and feeling good are the same signal.

CONTENT PILLARS (rotate across them, avoid repeating the same pillar twice):
- Myth busting: Hook with a lie, deliver the science, practical takeaway
- Young men: Galloway-adjacent, cultural, emotional, broadly shareable
- Science explainer: Mechanism-first, makes people feel informed not sold to
- Supplements: Evidence-based, calls out grift, specific ingredients
- For the audience: Written for partners and mothers of men, high sharing velocity
${voicesText}${topicsText}${avoidText}

For each carousel concept return EXACTLY this JSON structure:
{
  "carousels": [
    {
      "topic": "Short topic name",
      "pillar": "pillar name",
      "angle": "One sentence on the unique angle or hook",
      "slides": [
        {"tag": "tag text", "type": "hook", "content": "slide copy"},
        {"tag": "tag text", "type": "myth", "content": "slide copy"},
        {"tag": "tag text", "type": "reality", "content": "slide copy"},
        {"tag": "tag text", "type": "list", "content": "comma-separated list items"},
        {"tag": "tag text", "type": "reality", "content": "slide copy"},
        {"tag": "Free of Ugly.", "type": "close", "content": "closing statement", "cta": "link in bio CTA text"}
      ],
      "caption": "Full Instagram caption with hook, 2-3 lines expanding the point, and CTA ending with ask anything dash link in bio",
      "hashtags": "15 relevant hashtags space separated"
    }
  ]
}

Return ONLY the JSON. No preamble, no explanation, no markdown code blocks. Pure JSON only.`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // 1. Read pending topics from topic_bank (up to 5, high priority first)
    const { data: topicsData } = await supabase
      .from("topic_bank")
      .select("*")
      .eq("status", "pending");

    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const pendingTopics = (topicsData || [])
      .sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1))
      .slice(0, 5);

    // 2. Read active trusted voices
    const { data: voicesData } = await supabase
      .from("trusted_voices")
      .select("*")
      .eq("active", true);

    const activeVoices = voicesData || [];

    // 3. Read last 20 carousel topics to avoid repeats
    const { data: historyData } = await supabase
      .from("carousel_log")
      .select("topic")
      .order("date_created", { ascending: false })
      .limit(20);

    const recentTopics = (historyData || []).map(r => r.topic).filter(Boolean);

    // 4. Build prompt and call Claude
    const systemPrompt = buildPrompt(pendingTopics, activeVoices, recentTopics);

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: "Generate this week's 3 carousel concepts for Free of Ugly. Return only JSON." }],
      }),
    });

    if (!anthropicRes.ok) {
      const errorBody = await anthropicRes.text();
      console.error("Anthropic API error:", anthropicRes.status, errorBody);
      return res.status(502).json({ error: "AI service error" });
    }

    const apiData = await anthropicRes.json();
    const text = apiData.content?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    // 5. Write each generated carousel to carousel_log
    const savedCarousels = [];
    for (const carousel of parsed.carousels || []) {
      const slideCopy = (carousel.slides || [])
        .map(s => `[${s.tag}] ${s.content}`)
        .join("\n");

      const { data: inserted, error: insertError } = await supabase
        .from("carousel_log")
        .insert({
          topic: carousel.topic,
          pillar: carousel.pillar,
          slide_copy: slideCopy,
          caption: carousel.caption,
          hashtags: carousel.hashtags,
          status: "generated",
        })
        .select()
        .single();

      if (!insertError && inserted) {
        savedCarousels.push({ ...carousel, id: inserted.id, date_created: inserted.date_created });
      } else {
        console.error("Failed to save carousel:", insertError);
        savedCarousels.push(carousel);
      }
    }

    // 6. Mark any matching topic_bank items as used
    for (const carousel of savedCarousels) {
      const firstWord = carousel.topic?.toLowerCase().split(" ")[0];
      if (!firstWord) continue;
      const match = pendingTopics.find(t =>
        t.topic?.toLowerCase().includes(firstWord)
      );
      if (match) {
        await supabase
          .from("topic_bank")
          .update({ status: "used" })
          .eq("id", match.id);
      }
    }

    return res.status(200).json({ carousels: savedCarousels });
  } catch (err) {
    console.error("Generator error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
