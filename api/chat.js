const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function detectCategory(text) {
  const t = text.toLowerCase();

  if (/\b(moistur|spf|sunscreen|retinol|vitamin c|serum|cleanser|face wash|toner|exfoliat|acne|pore|skin|wrinkle|aging|collagen|hyaluronic|niacinamide|peptide cream|dark spot|eye cream|lip|beard skin)\b/.test(t)) return "skincare";
  if (/\b(supplement|vitamin|mineral|magnesium|zinc|omega|fish oil|creatine|protein|whey|probiotic|collagen powder|ashwagandha|lion.s mane|capsule|pill|dose|dosage|stack)\b/.test(t)) return "supplements";
  if (/\b(sleep|insomnia|tired|fatigue|melatonin|circadian|rem|deep sleep|nap|rest|wake|alarm|cortisol morning|night routine)\b/.test(t)) return "sleep";
  if (/\b(stress|anxiety|depress|mental|mood|emotion|therapy|mindful|meditat|burnout|overwhelm|focus|adhd|brain fog|motivation|dopamine|serotonin)\b/.test(t)) return "mental-health";
  if (/\b(biohack|cold plunge|sauna|red light|infrared|hyperbaric|fasting|intermittent|ice bath|breathwork|hrv|oura|whoop|glucose|cgm|longevity|zone 2|vo2)\b/.test(t)) return "biohacking";
  if (/\b(peptide|bpc|tb-500|ghk|ipamorelin|semaglutide|tirzepatide|glp|sermorelin|nad|nmn|nmn)\b/.test(t)) return "peptides";
  if (/\b(eat|diet|food|nutrition|carb|protein|fat|calorie|macro|keto|paleo|mediterranean|sugar|glucose|insulin|gut|microbiome|fiber|vegetable|fruit|meat|processed)\b/.test(t)) return "nutrition";
  if (/\b(testosterone|hormone|cortisol|estrogen|trt|libido|sex|hair loss|dht|finasteride|minoxidil|erectile|energy|muscle|weight|fat loss|body comp)\b/.test(t)) return "hormones";

  return "other";
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

  try {
    // Fetch system prompt from Supabase
    const { data: promptData, error: promptError } = await supabase
      .from("system_prompts")
      .select("prompt")
      .eq("name", "freeofugly_ask")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (promptError || !promptData) {
      console.error("Failed to fetch system prompt:", promptError);
      return res.status(500).json({ error: "Failed to load system configuration" });
    }

    const systemPrompt = promptData.prompt;

    // Log to chat_messages (existing) + questions (dashboard) tables
    if (lastUserMessage) {
      const content = lastUserMessage.content;
      const category = detectCategory(content);
      const now = new Date().toISOString();

      // Existing chat_messages table — keep as-is
      const { error: chatInsertError } = await supabase
        .from("chat_messages")
        .insert({ role: "user", content, sent_at: now });

      if (chatInsertError) console.error("Failed to store chat message:", chatInsertError);

      // New questions table — feeds dashboard Question Log
      const { error: questionInsertError } = await supabase
        .from("questions")
        .insert({
          text: content,
          category,
          date: now.split("T")[0],
          time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          created_at: now,
        });

      if (questionInsertError) console.error("Failed to store question:", questionInsertError);
    }

    // Call Anthropic API
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const errorBody = await anthropicRes.text();
      console.error("Anthropic API error:", anthropicRes.status, errorBody);
      return res.status(502).json({ error: "AI service error" });
    }

    const data = await anthropicRes.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
