const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  // Get the latest user message for logging
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");

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
      return res
        .status(500)
        .json({ error: "Failed to load system configuration" });
    }

    const systemPrompt = promptData.prompt;

    // Store the user message in Supabase
    if (lastUserMessage) {
      const { error: insertError } = await supabase
        .from("chat_messages")
        .insert({
          role: "user",
          content: lastUserMessage.content,
          sent_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error("Failed to store message:", insertError);
        // Don't block the response for logging failures
      }
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
        messages: messages,
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
