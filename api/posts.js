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

  // GET — return all posts ordered by date descending
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("date", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data || []);
  }

  // POST — create a new post entry
  if (req.method === "POST") {
    const { topic, pillar, date, followers, likes, saves, comments, shares, new_followers, reach, stories, status } = req.body || {};
    if (!topic) return res.status(400).json({ error: "topic is required" });
    const { data, error } = await supabase
      .from("posts")
      .insert({ topic, pillar, date, followers: followers||0, likes: likes||0, saves: saves||0, comments: comments||0, shares: shares||0, new_followers: new_followers||0, reach: reach||0, stories: stories||false, status: status||'posted' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // PATCH — update post stats
  if (req.method === "PATCH") {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: "id is required" });
    const allowed = ['topic','pillar','date','followers','likes','saves','comments','shares','new_followers','reach','stories','status'];
    const filtered = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)));
    const { data, error } = await supabase
      .from("posts")
      .update(filtered)
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // DELETE — remove a post
  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id is required" });
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
