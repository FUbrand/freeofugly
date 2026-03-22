require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const chatHandler = require("./api/chat");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  // Route API requests to the serverless handler
  if (req.url === "/api/chat" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        req.body = JSON.parse(body);
      } catch {
        req.body = {};
      }

      // Shim Vercel/Express-style response methods onto the raw Node.js res
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (data) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
        return res;
      };

      chatHandler(req, res);
    });
    return;
  }

  // Serve the HTML file for any other GET request
  if (req.method === "GET") {
    const filePath = path.join(__dirname, "freeofugly_ask.html");
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Running at http://localhost:${PORT}`);
});
