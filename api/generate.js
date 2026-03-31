const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function buildPrompt(pendingTopics, activeVoices, recentTopics) {
  const voicesText = activeVoices.length
    ? `\nTRUSTED VOICES — reference their frameworks, cite their work, use their findings as proof points:\n${activeVoices.map(v => `- ${v.name}: ${v.expertise}. Key points: ${v.talking_points}`).join("\n")}`
    : "";

  const topicsText = pendingTopics.length
    ? `\nTOPIC BANK SIGNALS — these are areas the audience is interested in. Use them as directional input, not literal assignments. Your job is to find the angle within each topic that serves Free of Ugly's mission and earns saves and shares — not just reads. A topic bank entry is a starting point, not a brief.\n${pendingTopics.map(t => `- ${t.topic} [${t.pillar || "general"}]${t.notes ? " — " + t.notes : ""}`).join("\n")}`
    : "";

  const avoidText = recentTopics.length
    ? `\nAVOID REPEATING THESE RECENTLY COVERED TOPICS:\n${recentTopics.join(", ")}`
    : "";

  return `You are the content strategist for Free of Ugly — a science-first men's health and wellness brand on Instagram. Your job is to generate 3 carousel concepts that are genuinely worth saving and sharing.

THE BRAND MISSION:
Free of Ugly exists to give men honest, science-backed information about their health and appearance — without shame, grift, or performance. The core belief is that looking good and feeling good are the same signal. The enemy is bad information, not the person who believed it.

THE TARGET AUDIENCE:
Men 30-45 who are skeptical of wellness culture but open to real evidence. Women who want this information for the men in their lives. People who have been let down by either the "just man up" crowd or the supplement industry.

BRAND VOICE:
Dry, witty, intelligent, slightly confrontational. Never preachy. Never shaming. Short punchy sentences. Call out grift directly. Trust the audience's intelligence. The tone is: the person who read the actual study and will tell you plainly what it says.

ALWAYS THINK BIGGER PICTURE:
Every carousel should connect back to Free of Ugly's core mission. Ask yourself: does this carousel make a man feel more informed, less manipulated, and more capable of making good decisions about his health? If yes, it's on brand. If it's just a list of tips, it's not.

WHAT MAKES A CAROUSEL WORTH SAVING:
- It tells someone something they thought they knew but didn't
- It gives them something useful they can act on today
- It makes them feel seen, not sold to
- It's specific enough to be credible, simple enough to be shareable
- It has a clear point of view — not "it depends"

CONTENT PILLARS — rotate across all of them, never repeat the same pillar twice in one batch:
- Myth busting: Hook with a widely believed lie, deliver the science, land a practical takeaway
- Young men: Galloway-adjacent — cultural, emotional, economic, broadly shareable beyond health
- Science explainer: Mechanism-first. Makes people feel informed not sold to. Explain why something works
- Supplements: Evidence-based, calls out grift, specific ingredients and actual dosages
- For the audience: Written for partners and mothers of men — high sharing velocity, empathetic framing
${voicesText}${topicsText}${avoidText}

COPY STANDARDS — every word must be post-ready, no editing required:
- Slide copy: Maximum 25 words per slide. Short declarative sentences. No hedging words (may, might, could, can). No qualifiers unless the science demands it. No bullet points in copy — commas only for list slides.
- Hook slide: One punchy statement that stops the scroll. Reads like a fact, lands like a gut punch.
- Myth slide: State the belief so fairly that the audience nods along before you flip it.
- Reality slides: Specific numbers, mechanisms, study references where relevant. "Studies show" is banned — name the mechanism or the number instead.
- List slide: 4 items maximum. Each one specific and actionable. Not "eat better" — "400mg magnesium glycinate before bed."
- Close slide: One dry, confident line. Brand voice at its sharpest. Then the CTA.
- Caption: Opens with the hook reworded, not repeated. 3 lines max. Ends exactly with: "Ask anything — link in bio."
- Hashtags: 15 only. Mix of niche and broad. No hashtag over 2 words.


1. HOOK (dark slide): Bold provocative statement that stops the scroll. One idea. No hedging.
2. MYTH (light slide): State the common belief clearly. Don't strawman it — make it sound reasonable.
3. REALITY (dark slide): The science. What actually happens. Be specific — numbers, mechanisms, studies.
4. LIST (light slide): 3-5 practical, specific, actionable items. Not generic advice.
5. REALITY 2 (dark slide): The bigger implication. Why this matters beyond the surface topic.
6. CLOSE (orange slide): Brand voice sign-off. Dry, confident, one line. CTA to link in bio.

For each carousel concept return EXACTLY this JSON structure:
{
  "carousels": [
    {
      "topic": "Short topic name",
      "pillar": "pillar name",
      "angle": "One sentence on the unique angle — what makes this carousel different from generic content on this topic",
      "slides": [
        {"tag": "tag text", "type": "hook", "content": "slide copy"},
        {"tag": "tag text", "type": "myth", "content": "slide copy"},
        {"tag": "tag text", "type": "reality", "content": "slide copy"},
        {"tag": "tag text", "type": "list", "content": "item one, item two, item three, item four"},
        {"tag": "tag text", "type": "reality", "content": "slide copy"},
        {"tag": "Free of Ugly.", "type": "close", "content": "closing statement", "cta": "link in bio CTA text"}
      ],
      "caption": "Full Instagram caption. Open with the hook, expand the point in 2-3 lines, close with a question or CTA. End with: Ask anything — link in bio.",
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
          slides_json: carousel.slides || [],
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
