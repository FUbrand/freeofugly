const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // GET — return all carousel log entries newest first
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("carousel_log")
      .select("*")
      .order("date_created", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST — create a new carousel log entry
  if (req.method === "POST") {
    const { topic, pillar, slide_copy, caption, hashtags, status } = req.body || {};
    const { data, error } = await supabase
      .from("carousel_log")
      .insert({ topic, pillar, slide_copy, caption, hashtags, status: status || "generated" })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // PATCH — update status (generated → approved → posted) or posted_date
  if (req.method === "PATCH") {
    const { id, status, posted_date } = req.body || {};
    if (!id) return res.status(400).json({ error: "id is required" });

    const updates = {};
    if (status) updates.status = status;
    if (posted_date) updates.posted_date = posted_date;

    const { data, error } = await supabase
      .from("carousel_log")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
};
