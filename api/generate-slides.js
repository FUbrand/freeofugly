const { createClient } = require("@supabase/supabase-js");
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");
const JSZip = require("jszip");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function buildSlideHTML(slide, slideNum, totalSlides) {
  const themes = {
    hook:    { bg: "#0D0D0B", tagBg: "#E05A2B", tagColor: "#0D0D0B", textColor: "#F0EDE4", rule: false },
    myth:    { bg: "#F5F2EA", tagBg: "#0D0D0B", tagColor: "#F5F2EA", textColor: "#2A2A26", rule: "#0D0D0B" },
    reality: { bg: "#0D0D0B", tagBg: "#F0EDE4", tagColor: "#0D0D0B", textColor: "#9A9890", rule: "#E05A2B" },
    list:    { bg: "#F5F2EA", tagBg: "#0D0D0B", tagColor: "#F5F2EA", textColor: "#2A2A26", rule: "#0D0D0B" },
    close:   { bg: "#E05A2B", tagBg: "#0D0D0B", tagColor: "#F5F2EA", textColor: "#0D0D0B", rule: false },
  };

  const t = themes[slide.type] || themes.hook;
  const ruleHTML = t.rule ? `<div style="width:864px;height:6px;background:${t.rule};margin-bottom:56px;flex-shrink:0;"></div>` : "";

  let contentHTML;
  if (slide.type === "list") {
    const items = slide.content.split(",").map(i => i.trim()).filter(Boolean);
    contentHTML = `<div style="display:flex;flex-direction:column;gap:0;">${items.map(item =>
      `<div style="padding:20px 0;border-bottom:1px solid rgba(0,0,0,0.12);font-size:38px;font-family:'DM Sans',sans-serif;font-weight:300;color:${t.textColor};line-height:1.3;">${item}</div>`
    ).join("")}</div>`;
  } else if (slide.type === "hook") {
    contentHTML = `<p style="font-size:80px;font-family:'Syne',sans-serif;font-weight:800;color:${t.textColor};line-height:1.05;margin:0;letter-spacing:-0.02em;">${slide.content}</p>`;
  } else if (slide.type === "close") {
    const ctaHTML = slide.cta
      ? `<p style="font-size:32px;font-family:'Space Mono',monospace;font-weight:400;color:${t.textColor};opacity:0.7;margin:40px 0 0;letter-spacing:0.04em;">${slide.cta}</p>`
      : "";
    contentHTML = `<div>
      <p style="font-size:64px;font-family:'Syne',sans-serif;font-weight:800;color:${t.textColor};line-height:1.1;margin:0;letter-spacing:-0.02em;">${slide.content}</p>
      ${ctaHTML}
    </div>`;
  } else {
    contentHTML = `<p style="font-size:56px;font-family:'Syne',sans-serif;font-weight:800;color:${t.textColor};line-height:1.1;margin:0;letter-spacing:-0.02em;">${slide.content}</p>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
  body { width: 1080px; height: 1350px; overflow: hidden; background: ${t.bg}; }
</style>
</head>
<body>
<div style="
  width: 1080px;
  height: 1350px;
  background: ${t.bg};
  padding: 108px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
">
  <div style="display:flex;flex-direction:column;">
    <div style="margin-bottom:48px;flex-shrink:0;">
      <span style="
        display: inline-block;
        background: ${t.tagBg};
        padding: 14px 28px;
        font-family: 'Space Mono', monospace;
        font-size: 22px;
        font-weight: 700;
        color: ${t.tagColor};
        letter-spacing: 0.1em;
        text-transform: uppercase;
      ">${slide.tag}</span>
    </div>
    ${ruleHTML}
    ${contentHTML}
  </div>

  <div style="display:flex;justify-content:space-between;align-items:center;">
    <span style="
      font-family: 'Space Mono', monospace;
      font-size: 18px;
      font-weight: 700;
      color: ${t.textColor};
      opacity: 0.35;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    ">Free of Ugly.</span>
    <span style="
      font-family: 'Space Mono', monospace;
      font-size: 18px;
      color: ${t.textColor};
      opacity: 0.35;
      letter-spacing: 0.05em;
    ">${slideNum} / ${totalSlides}</span>
  </div>
</div>
</body>
</html>`;
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

    // Fetch carousel from Supabase
    const { data: carousel, error } = await supabase
      .from("carousel_log")
      .select("*")
      .eq("id", carousel_id)
      .single();

    if (error || !carousel) return res.status(404).json({ error: "Carousel not found" });

    const slides = carousel.slides_json;
    if (!slides || !slides.length) return res.status(400).json({ error: "No slide data found for this carousel. It may have been generated before slide storage was added — regenerate it from the Weekly Generator." });

    // Launch Puppeteer with Chromium
   const browser = await puppeteer.launch({
  args: chromium.args,
  defaultViewport: { width: 1080, height: 1350 },
  executablePath: await chromium.executablePath(),
  headless: chromium.headless,
});
    const zip = new JSZip();
    const topicSlug = (carousel.topic || "carousel").replace(/[^a-zA-Z0-9]/g, "_").substring(0, 24);

    for (let i = 0; i < slides.length; i++) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 2 });
      const html = buildSlideHTML(slides[i], i + 1, slides.length);
      await page.setContent(html, { waitUntil: "networkidle0" });
      // Ensure fonts are fully rendered
      await page.evaluate(() => document.fonts.ready);
      await new Promise(r => setTimeout(r, 800));
      const screenshot = await page.screenshot({ type: "png" });
      zip.file(`${topicSlug}_S${String(i + 1).padStart(2, "0")}.png`, screenshot);
      await page.close();
    }

    await browser.close();

    // Update status to approved in Supabase
    await supabase
      .from("carousel_log")
      .update({ status: "approved" })
      .eq("id", carousel_id);

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${topicSlug}_slides.zip"`);
    return res.send(zipBuffer);

  } catch (err) {
    console.error("Slide generation error:", err);
    return res.status(500).json({ error: "Slide generation failed: " + err.message });
  }
};
