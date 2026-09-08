require("dotenv").config();
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const rateLimit = require("express-rate-limit");

const { pool, initDb } = require("./db");
const { csrfProtection } = require("./middleware/auth");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const logbookRoutes = require("./routes/logbooks");
const permissionRoutes = require("./routes/permissions");
const auditRoutes = require("./routes/audit");
const dashboardRoutes = require("./routes/dashboard");

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

// Render (and most PaaS) sit behind a reverse proxy; this is required for
// secure cookies + correct client IPs to work.
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // inline style="" attrs used in rendered cards
        imgSrc: ["'self'", "data:"], // signatures are data: URLs
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: "600kb" })); // generous enough for signature data URLs

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", globalLimiter);

app.use(
  session({
    store: new pgSession({ pool, tableName: "session", createTableIfMissing: true }),
    name: "iptms.sid",
    secret: process.env.SESSION_SECRET || "dev-only-secret-change-me",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  })
);

app.use("/api", csrfProtection);

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/logbooks", logbookRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use(express.static(path.join(__dirname, "..", "public")));

// SPA fallback for any non-API route.
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// Central error handler: never leak stack traces to the client.
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Hitilafu ya server. Jaribu tena baadaye." });
});

(async () => {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`IPTMS inaendesha kwenye port ${PORT} (${isProd ? "production" : "development"})`);
    });
  } catch (e) {
    console.error("Imeshindwa kuanzisha server:", e);
    process.exit(1);
  }
})();
