const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();

  // GET — return all topics; high priority first
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("topic_bank")
      .select("*");

    if (error) return res.status(500).json({ error: error.message });

    // Sort by priority: high → normal → low, then by insertion order descending
    const order = { high: 0, normal: 1, low: 2 };
    (data || []).sort((a, b) => {
      const pa = order[a.priority] ?? 1;
      const pb = order[b.priority] ?? 1;
      return pa !== pb ? pa - pb : 0;
    });

    return res.status(200).json(data);
  }

  // POST — add a new topic idea
  if (req.method === "POST") {
    const { topic, pillar, priority, notes, status } = req.body || {};
    if (!topic) return res.status(400).json({ error: "topic is required" });

    const { data, error } = await supabase
      .from("topic_bank")
      .insert({ topic, pillar, priority: priority || "normal", notes, status: status || "pending" })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // PATCH — update status or priority
  if (req.method === "PATCH") {
    const { id, status, priority, notes } = req.body || {};
    if (!id) return res.status(400).json({ error: "id is required" });

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;
    if (notes !== undefined) updates.notes = notes;

    const { data, error } = await supabase
      .from("topic_bank")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // DELETE — remove a topic idea
  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id is required" });

    const { error } = await supabase
      .from("topic_bank")
      .delete()
      .eq("id", id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
