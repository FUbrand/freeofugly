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

  // GET — return all voices ordered by name
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("trusted_voices")
      .select("*")
      .order("name");

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST — add a new trusted voice
  if (req.method === "POST") {
    const { name, expertise, talking_points, active } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const { data, error } = await supabase
      .from("trusted_voices")
      .insert({ name, expertise, talking_points, active: active !== false })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // PATCH — update active status or voice details
  if (req.method === "PATCH") {
    const { id, active, name, expertise, talking_points } = req.body || {};
    if (!id) return res.status(400).json({ error: "id is required" });

    const updates = {};
    if (active !== undefined) updates.active = active;
    if (name !== undefined) updates.name = name;
    if (expertise !== undefined) updates.expertise = expertise;
    if (talking_points !== undefined) updates.talking_points = talking_points;

    const { data, error } = await supabase
      .from("trusted_voices")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // DELETE — remove a voice
  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id is required" });

    const { error } = await supabase
      .from("trusted_voices")
      .delete()
      .eq("id", id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
