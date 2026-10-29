const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT) || 4173;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Invalid request path");
    return;
  }

  const requestedPath = path.resolve(root, `.${pathname}`);
  if (requestedPath !== root && !requestedPath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  const filePath = pathname === "/" ? path.join(root, "index.html") : requestedPath;
  fs.stat(filePath, (error, stats) => {
    const resolved = !error && stats.isFile() ? filePath : path.join(root, "index.html");
    fs.readFile(resolved, (readError, data) => {
      if (readError) {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Unable to load the website.");
        return;
      }
      response.writeHead(200, {
        "Content-Type": types[path.extname(resolved).toLowerCase()] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(data);
    });
  });
}).listen(port, () => {
  console.log(`Eli's Crunch demo running at http://localhost:${port}`);
});
