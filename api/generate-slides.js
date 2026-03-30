const { createClient } = require("@supabase/supabase-js");
const satori = require("satori").default;
const { Resvg } = require("@resvg/resvg-js");
const JSZip = require("jszip");
const https = require("https");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function fetchFont(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

const COLORS = {
  black: "#0D0D0B",
  cream: "#F5F2EA",
  offWhite: "#F0EDE4",
  orange: "#E05A2B",
  gray: "#9A9890",
  darkGray: "#2A2A26",
};

const THEMES = {
  hook:    { bg: "#0D0D0B", tagBg: "#E05A2B", tagColor: "#0D0D0B",  textColor: "#F0EDE4", ruleColor: null },
  myth:    { bg: "#F5F2EA", tagBg: "#0D0D0B", tagColor: "#F0EDE4",  textColor: "#2A2A26", ruleColor: "#0D0D0B" },
  reality: { bg: "#0D0D0B", tagBg: "#F0EDE4", tagColor: "#0D0D0B",  textColor: "#9A9890", ruleColor: "#E05A2B" },
  list:    { bg: "#F5F2EA", tagBg: "#0D0D0B", tagColor: "#F0EDE4",  textColor: "#2A2A26", ruleColor: "#0D0D0B" },
  close:   { bg: "#E05A2B", tagBg: "#0D0D0B", tagColor: "#F0EDE4",  textColor: "#0D0D0B", ruleColor: null },
};

function buildSlideElement(slide, slideNum, totalSlides) {
  const t = THEMES[slide.type] || THEMES.hook;

  const tagEl = {
    type: "div",
    props: {
      style: { display: "flex", backgroundColor: t.tagBg, padding: "14px 28px", marginBottom: 48, alignSelf: "flex-start" },
      children: { type: "span", props: { style: { fontFamily: "Space Mono", fontSize: 22, fontWeight: 700, color: t.tagColor, letterSpacing: "0.1em", textTransform: "uppercase" }, children: slide.tag } },
    },
  };

  const ruleEl = t.ruleColor ? {
    type: "div",
    props: { style: { width: 864, height: 6, backgroundColor: t.ruleColor, marginBottom: 56 }, children: "" },
  } : null;

  let contentEl;
  if (slide.type === "hook") {
    contentEl = { type: "div", props: { style: { display: "flex" }, children: { type: "span", props: { style: { fontFamily: "Syne", fontSize: 80, fontWeight: 800, color: t.textColor, lineHeight: 1.05, letterSpacing: "-0.02em" }, children: slide.content } } } };
  } else if (slide.type === "list") {
    const items = slide.content.split(",").map(i => i.trim()).filter(Boolean);
    contentEl = { type: "div", props: { style: { display: "flex", flexDirection: "column", width: "100%" }, children: items.map(item => ({ type: "div", props: { style: { display: "flex", padding: "20px 0", borderBottom: "1px solid rgba(0,0,0,0.12)", fontFamily: "DM Sans", fontSize: 38, fontWeight: 300, color: t.textColor, lineHeight: 1.3 }, children: item } })) } };
  } else if (slide.type === "close") {
    const children = [
      { type: "span", props: { style: { fontFamily: "Syne", fontSize: 64, fontWeight: 800, color: t.textColor, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: slide.cta ? 40 : 0 }, children: slide.content } },
    ];
    if (slide.cta) children.push({ type: "span", props: { style: { fontFamily: "Space Mono", fontSize: 28, fontWeight: 400, color: t.textColor, opacity: 0.7, letterSpacing: "0.04em" }, children: slide.cta } });
    contentEl = { type: "div", props: { style: { display: "flex", flexDirection: "column" }, children } };
  } else {
    contentEl = { type: "div", props: { style: { display: "flex" }, children: { type: "span", props: { style: { fontFamily: "Syne", fontSize: 56, fontWeight: 800, color: t.textColor, lineHeight: 1.1, letterSpacing: "-0.02em" }, children: slide.content } } } };
  }

  const footerEl = {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%" },
      children: [
        { type: "span", props: { style: { fontFamily: "Space Mono", fontSize: 18, fontWeight: 700, color: t.textColor, opacity: 0.35, letterSpacing: "0.1em", textTransform: "uppercase" }, children: "Free of Ugly." } },
        { type: "span", props: { style: { fontFamily: "Space Mono", fontSize: 18, color: t.textColor, opacity: 0.35, letterSpacing: "0.05em" }, children: `${slideNum} / ${totalSlides}` } },
      ],
    },
  };

  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", justifyContent: "space-between", width: 1080, height: 1350, backgroundColor: t.bg, padding: "108px" },
      children: [
        { type: "div", props: { style: { display: "flex", flexDirection: "column" }, children: [tagEl, ruleEl, contentEl].filter(Boolean) } },
        footerEl,
      ],
    },
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { carousel_id } = req.body;
    if (!carousel_id) return res.status(400).json({ error: "carousel_id required" });

    const { data: carousel, error } = await supabase
      .from("carousel_log")
      .select("*")
      .eq("id", carousel_id)
      .single();

    if (error || !carousel) return res.status(404).json({ error: "Carousel not found" });

    const slides = carousel.slides_json;
    if (!slides || !slides.length) {
      return res.status(400).json({ error: "No slide data found. This carousel was generated before slide storage was added — please regenerate it." });
    }

    const [syneFont, spaceMono, dmSans] = await Promise.all([
      fetchFont("https://fonts.gstatic.com/s/syne/v22/8vIS7w4qzmVxsWxjBZRjr0FKM_04uQ.woff"),
      fetchFont("https://fonts.gstatic.com/s/spacemono/v13/i7dPIFZifjKcF5UAWdDRYEF8RQ.woff"),
      fetchFont("https://fonts.gstatic.com/s/dmsans/v15/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu6-K63MA.woff"),
    ]);

    const fontConfig = [
      { name: "Syne", data: syneFont, weight: 800, style: "normal" },
      { name: "Space Mono", data: spaceMono, weight: 700, style: "normal" },
      { name: "DM Sans", data: dmSans, weight: 300, style: "normal" },
    ];

    const zip = new JSZip();
    const topicSlug = (carousel.topic || "carousel").replace(/[^a-zA-Z0-9]/g, "_").substring(0, 24);

    for (let i = 0; i < slides.length; i++) {
      const element = buildSlideElement(slides[i], i + 1, slides.length);
      const svg = await satori(element, { width: 1080, height: 1350, fonts: fontConfig });
      const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } });
      const pngBuffer = resvg.render().asPng();
      zip.file(`${topicSlug}_S${String(i + 1).padStart(2, "0")}.png`, pngBuffer);
    }

    await supabase.from("carousel_log").update({ status: "approved" }).eq("id", carousel_id);

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${topicSlug}_slides.zip"`);
    return res.send(zipBuffer);

  } catch (err) {
    console.error("Slide generation error:", err);
    return res.status(500).json({ error: "Slide generation failed: " + err.message });
  }
};
