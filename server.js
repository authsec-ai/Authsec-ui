const express = require("express");
const compression = require("compression");
const path = require("path");
const app = express();
const port = process.env.PORT || 3000;

// Middleware to log all incoming requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url} - Request received`);
  next();
});

// Compress text responses (brotli where the browser accepts it, else gzip).
//
// This server used to send everything raw: the 1.27 MB application bundle and
// 463 KB stylesheet crossed the wire byte for byte, and every lazy page chunk
// after them. Compression is the single largest cut to how long a page, and
// each first visit to a route, takes to appear.
app.use(compression());

// Dynamic config endpoint
app.get("/config.js", (req, res) => {
  const config = {
    VITE_API_URL: process.env.VITE_API_URL || "http://localhost:7468",
    VITE_OAUTH_BASE_URL:
      process.env.VITE_OAUTH_BASE_URL ||
      process.env.VITE_API_URL ||
      "http://localhost:4444",
  };
  // Everything here is public: /config.js is served to every visitor. Never
  // put a secret in it (UI-005 removed the HubSpot access token).

  const configScript = `window.ENV = ${JSON.stringify(config)};`;

  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.send(configScript);

  console.log(`[${new Date().toISOString()}] Config served:`, config);
});

// Which commit is actually serving.
//
// The same contract as the backend's /authsec/uflow/version, deliberately: one
// verification script checks both, and a shape that differs between the two
// services is a shape somebody will read wrong at 2am.
//
// This answers a question that had no answer. The deployment references a
// floating `ui:production` tag, so the tag identifies no commit AND a rollout
// to it is a no-op -- Kubernetes sees no diff and keeps the cached image. You
// could build, push, "deploy", and still be serving the old bundle.
//
// Unauthenticated on purpose: a commit SHA is already public in the repo, and a
// deploy check that needs a token is a deploy check nobody runs. Build identity
// only -- no configuration, no environment, nothing about the host.
const BUILD_STARTED_AT = new Date().toISOString();
app.get("/version", (req, res) => {
  const commit = process.env.GIT_COMMIT || "unknown";
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.json({
    commit,
    short_commit: commit.slice(0, 12),
    branch: process.env.GIT_BRANCH || "unknown",
    built_at: process.env.BUILT_AT || "unknown",
    // started_at is when this PROCESS began, which is a different fact from
    // built_at: a pod restarted an hour ago may be running a month-old bundle,
    // and only one of those two times reveals it.
    started_at: BUILD_STARTED_AT,
    uptime_seconds: Math.round(process.uptime()),
    // False when the image was built without build args. A caller comparing
    // commits must not treat "unknown" as a mismatch with everything — it
    // means nobody can say what is running, which is a different problem.
    injected: commit !== "unknown",
  });
});

// Serve static files from the React app's dist directory.
//
// Caching follows what each file is:
//   /assets/*   Vite names these by content hash, so a given URL never changes
//               meaning. Cache for a year and mark immutable: a page the browser
//               has seen before costs no network at all. With express's default
//               (max-age=0) every one of them was re-checked with the server on
//               every load, one round trip per file, which is what each click
//               onto a lazy page paid for.
//   *.html      The entry point names the current hashed files, so it must be
//               re-checked every time or a deploy would not be picked up.
const DIST = path.join(__dirname, "dist");
const YEAR = 60 * 60 * 24 * 365;
app.use(
  express.static(DIST, {
    setHeaders(res, filePath) {
      const rel = path.relative(DIST, filePath).split(path.sep);
      if (rel[0] === "assets") {
        res.setHeader("Cache-Control", `public, max-age=${YEAR}, immutable`);
      } else if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }),
);

// A hashed asset that no longer exists is gone, not "the app". After a deploy an
// already-open tab asks for chunk names from the previous build. Answering with
// index.html (200, text/html) makes the browser try to run HTML as JavaScript
// and fail with a parse error, and it would be cached as the file's content.
// A 404 is what lets the browser report a plain missing chunk.
app.use("/assets", (req, res) => {
  res.status(404).type("text/plain").send("asset not found");
});

// Health check endpoint
app.get("/health", (req, res) => {
  const healthStatus = {
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: {
      VITE_API_URL: process.env.VITE_API_URL || "not set",
      VITE_OAUTH_BASE_URL: process.env.VITE_OAUTH_BASE_URL || "not set",
    },
  };
  console.log(
    `[${healthStatus.timestamp}] Health check - VITE_API_URL: ${healthStatus.environment.VITE_API_URL}, VITE_OAUTH_BASE_URL: ${healthStatus.environment.VITE_OAUTH_BASE_URL}`,
  );
  res.status(200).json(healthStatus);
});

// Catch-all route to serve React app
app.get("*", (req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(DIST, "index.html"));
});

// Start the server
app.listen(port, () => {
  console.log(`[${new Date().toISOString()}] Server running on port ${port}`);
  console.log(
    `[${new Date().toISOString()}] VITE_API_URL: ${process.env.VITE_API_URL || "not set"}`,
  );
});
