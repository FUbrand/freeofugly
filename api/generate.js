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
    ? `\nTOPIC BANK SIGNALS — directional input, not literal assignments. Find the angle within each topic that serves Free of Ugly's mission and earns saves and shares.\n${pendingTopics.map(t => `- ${t.topic} [${t.pillar || "general"}]${t.notes ? " — " + t.notes : ""}`).join("\n")}`
    : "";

  const avoidText = recentTopics.length
    ? `\nAVOID REPEATING THESE RECENTLY COVERED TOPICS:\n${recentTopics.join(", ")}`
    : "";

  return `You are the content strategist for Free of Ugly — a science-first men's health and wellness brand on Instagram. Generate 3 carousel concepts that are genuinely worth saving and sharing.

THE BRAND MISSION:
Free of Ugly gives men honest, science-backed information about health and appearance — without shame, grift, or performance. Core belief: looking good and feeling good are the same signal. The enemy is bad information, not the person who believed it.

TARGET AUDIENCE:
Men 30-45 skeptical of wellness culture but open to real evidence. Women who want this for the men in their lives. People let down by both "just man up" culture and the supplement industry.

BRAND VOICE:
Dry, witty, intelligent, slightly confrontational. Never preachy. Never shaming. Short punchy sentences. Call out grift directly. Trust the audience's intelligence. Tone: the person who read the actual study and will tell you plainly what it says.

BIGGER PICTURE TEST:
Every carousel must make a man feel more informed, less manipulated, and more capable of making good decisions about his health. If it's just a list of tips, it's not on brand.

WHAT MAKES A CAROUSEL WORTH SAVING:
- Tells someone something they thought they knew but didn't
- Gives them something useful they can act on today
- Makes them feel seen, not sold to
- Specific enough to be credible, simple enough to be shareable
- Has a clear point of view — not "it depends"

CONTENT PILLARS — rotate across all, never repeat the same pillar twice in one batch:
- Myth busting: Hook with a widely believed lie, deliver the science, land a practical takeaway
- Young men: Galloway-adjacent — cultural, emotional, economic, broadly shareable
- Science explainer: Mechanism-first. Makes people feel informed not sold to
- Supplements: Evidence-based, calls out grift, specific ingredients and actual dosages
- For the audience: Written for partners and mothers of men — high sharing velocity
${voicesText}${topicsText}${avoidText}

COPY STANDARDS — post-ready, no editing required:
- Max 25 words per slide. Short declarative sentences. No hedging words.
- Hook: One punchy statement. Reads like a fact, lands like a gut punch.
- Myth: State the belief so fairly the audience nods before you flip it.
- Reality slides: Specific numbers, mechanisms. Never "studies show" — name the mechanism or number.
- List: 4 items max. Specific and actionable. Not "eat better" — "400mg magnesium glycinate before bed."
- Close: One dry confident line. Brand voice at its sharpest.
- Caption: Opens with hook reworded not repeated. 3 lines max. Ends exactly: "Ask anything — link in bio."
- Hashtags: 15 only. Mix niche and broad. No hashtag over 2 words.

STORY CARDS — 3 cards that run over 2-3 days after the carousel posts:
- Card 1 (Poll): A yes/no or either/or question that teases the carousel topic. Gets people engaged before they've seen the full content.
- Card 2 (Statement/Reframe): One bold statement that reframes the topic. Standalone — works without seeing the carousel. Ends with a prompt to check the post.
- Card 3 (Question sticker): An open question that invites personal responses. Should feel like the natural conversation starter after someone has absorbed the carousel.

SLIDE STRUCTURE:
1. HOOK (dark slide): Bold provocative statement. One idea. No hedging.
2. MYTH (light slide): The common belief stated fairly.
3. REALITY (dark slide): The science. Specific numbers, mechanisms.
4. LIST (light slide): 4 practical specific actionable items.
5. REALITY 2 (dark slide): The bigger implication.
6. CLOSE (orange slide): Brand voice sign-off. Dry, confident, one line.

Return EXACTLY this JSON structure:
{
  "carousels": [
    {
      "topic": "Short topic name",
      "pillar": "pillar name",
      "angle": "One sentence on the unique angle",
      "slides": [
        {"tag": "tag text", "type": "hook", "content": "slide copy"},
        {"tag": "tag text", "type": "myth", "content": "slide copy"},
        {"tag": "tag text", "type": "reality", "content": "slide copy"},
        {"tag": "tag text", "type": "list", "content": "item one, item two, item three, item four"},
        {"tag": "tag text", "type": "reality", "content": "slide copy"},
        {"tag": "Free of Ugly.", "type": "close", "content": "closing statement", "cta": "link in bio CTA text"}
      ],
      "caption": "Full Instagram caption ending with: Ask anything — link in bio.",
      "hashtags": "15 relevant hashtags space separated",
      "stories": [
        {"type": "poll", "content": "Poll question text", "options": ["Option A", "Option B"]},
        {"type": "statement", "content": "Bold reframe statement. Check the post in our feed."},
        {"type": "question", "content": "Open question for question sticker"}
      ]
    }
  ]
}

Return ONLY the JSON. No preamble, no explanation, no markdown code blocks. Pure JSON only.`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { data: topicsData } = await supabase.from("topic_bank").select("*").eq("status", "pending");
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const pendingTopics = (topicsData || [])
      .sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1))
      .slice(0, 5);

    const { data: voicesData } = await supabase.from("trusted_voices").select("*").eq("active", true);
    const activeVoices = voicesData || [];

    const { data: historyData } = await supabase.from("carousel_log").select("topic").order("date_created", { ascending: false }).limit(20);
    const recentTopics = (historyData || []).map(r => r.topic).filter(Boolean);

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

    const savedCarousels = [];
    for (const carousel of parsed.carousels || []) {
      const slideCopy = (carousel.slides || []).map(s => `[${s.tag}] ${s.content}`).join("\n");

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

    for (const carousel of savedCarousels) {
      const firstWord = carousel.topic?.toLowerCase().split(" ")[0];
      if (!firstWord) continue;
      const match = pendingTopics.find(t => t.topic?.toLowerCase().includes(firstWord));
      if (match) {
        await supabase.from("topic_bank").update({ status: "used" }).eq("id", match.id);
      }
    }

    return res.status(200).json({ carousels: savedCarousels });
  } catch (err) {
    console.error("Generator error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
