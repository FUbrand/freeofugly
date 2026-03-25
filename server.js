require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

// API route registry
const apiRoutes = {
  "/api/chat": require("./api/chat"),
  "/api/carousel-log": require("./api/carousel-log"),
  "/api/trusted-voices": require("./api/trusted-voices"),
  "/api/topic-bank": require("./api/topic-bank"),
  "/api/generate": require("./api/generate"),
};

// Shim Vercel/Express-style methods onto raw Node.js res
function shimRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
    return res;
  };
  return res;
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];
  const handler = apiRoutes[urlPath];

  // Route to matching API handler
  if (handler) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { req.body = JSON.parse(body); } catch { req.body = {}; }
      handler(req, shimRes(res));
    });
    return;
  }

  // Serve HTML files for GET requests
  if (req.method === "GET") {
    const htmlFiles = {
      "/": "freeofugly_ask.html",
      "/dashboard": "FreeOfUgly_Dashboard.html",
      "/FreeOfUgly_Dashboard.html": "FreeOfUgly_Dashboard.html",
    };
    const filename = htmlFiles[urlPath];
    if (filename) {
      const filePath = path.join(__dirname, filename);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end("Not found"); return; }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data);
      });
      return;
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Running at http://localhost:${PORT}`);
});
