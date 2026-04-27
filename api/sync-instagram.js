const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const META_TOKEN = process.env.META_ACCESS_TOKEN;
const IG_ACCOUNT_ID = process.env.IG_BUSINESS_ACCOUNT_ID;
const META_API = "https://graph.facebook.com/v21.0";

async function fetchAllMedia() {
  const allPosts = [];
  let url = `${META_API}/${IG_ACCOUNT_ID}/media?fields=id,caption,media_type,permalink,timestamp&limit=50&access_token=${META_TOKEN}`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Meta media fetch failed: ${res.status} ${errText}`);
    }
    const data = await res.json();
    if (data.data) allPosts.push(...data.data);
    url = data.paging?.next || null;
  }

  return allPosts;
}

async function fetchInsights(mediaId, mediaType) {
  // Instagram deprecated several metrics — current valid set varies by media type
  // For carousels (CAROUSEL_ALBUM): use views, reach, total_interactions, likes, comments, shares, saved
  // For images (IMAGE): same as carousel
  // Fetch one at a time to avoid one bad metric killing the whole call
  const metricsToTry = ["views", "reach", "total_interactions", "likes", "comments", "shares", "saved", "profile_visits", "follows"];
  const out = {};

  for (const metric of metricsToTry) {
    try {
      const url = `${META_API}/${mediaId}/insights?metric=${metric}&access_token=${META_TOKEN}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errText = await res.text();
        // Silently skip metrics that aren't supported for this media type
        continue;
      }
      const data = await res.json();
      const value = data.data?.[0]?.values?.[0]?.value;
      if (typeof value === "number") {
        out[metric] = value;
      }
    } catch (e) {
      // skip individual metric errors
    }
  }
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (!META_TOKEN || !IG_ACCOUNT_ID) {
    return res.status(500).json({ error: "Missing META_ACCESS_TOKEN or IG_BUSINESS_ACCOUNT_ID env vars" });
  }

  // DEBUG MODE: visit /api/sync-instagram?debug=1 to see raw API responses
  if (req.query?.debug === "1") {
    try {
      const media = await fetchAllMedia();
      const firstPost = media[0];
      const debugResults = {};
      const metricsToTry = ["views", "reach", "total_interactions", "likes", "comments", "shares", "saved", "impressions", "profile_visits", "follows"];

      for (const metric of metricsToTry) {
        const url = `${META_API}/${firstPost.id}/insights?metric=${metric}&access_token=${META_TOKEN}`;
        const r = await fetch(url);
        const body = await r.text();
        debugResults[metric] = { status: r.status, body: body.substring(0, 500) };
      }

      return res.status(200).json({
        firstPost: { id: firstPost.id, media_type: firstPost.media_type, timestamp: firstPost.timestamp },
        metricResults: debugResults
      });
    } catch (e) {
      return res.status(500).json({ debug_error: e.message });
    }
  }

  try {
    const media = await fetchAllMedia();
    let updated = 0;
    let inserted = 0;
    const errors = [];

    for (const post of media) {
      const insights = await fetchInsights(post.id, post.media_type);
      const postedDate = post.timestamp ? post.timestamp.split("T")[0] : null;

      // Try to extract topic from existing post or first line of caption
      const topicFromCaption = post.caption ? post.caption.split("\n")[0].substring(0, 80) : "";

      // Check if this IG post already exists
      const { data: existing } = await supabase
        .from("posts")
        .select("id")
        .eq("ig_post_id", post.id)
        .maybeSingle();

      const payload = {
        ig_post_id: post.id,
        ig_permalink: post.permalink,
        ig_caption: post.caption,
        date: postedDate,
        views: insights.views || insights.impressions || 0,
        accounts_reached: insights.reach || 0,
        impressions: insights.impressions || 0,
        likes: insights.likes || 0,
        comments: insights.comments || 0,
        shares: insights.shares || 0,
        saves: insights.saved || 0,
        profile_visits: insights.profile_visits || 0,
        follows_from_post: insights.follows || 0,
        reach: insights.reach || 0,
        last_synced: new Date().toISOString(),
        status: "posted"
      };

      if (existing) {
        const { error } = await supabase.from("posts").update(payload).eq("id", existing.id);
        if (error) errors.push({ id: post.id, error: error.message });
        else updated++;
      } else {
        const { error } = await supabase.from("posts").insert({
          ...payload,
          topic: topicFromCaption || "Untitled",
          pillar: "unknown",
          followers: 0
        });
        if (error) errors.push({ id: post.id, error: error.message });
        else inserted++;
      }
    }

    return res.status(200).json({
      success: true,
      total: media.length,
      inserted,
      updated,
      errors: errors.length ? errors : undefined
    });
  } catch (err) {
    console.error("Sync error:", err);
    return res.status(500).json({ error: err.message });
  }
};
