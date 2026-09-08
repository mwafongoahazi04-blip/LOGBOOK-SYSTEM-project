const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");
const {
  isValidEmail,
  isValidPassword,
  isValidName,
  isValidSignature,
  isValidRole,
  logAudit,
} = require("../helpers");

const router = express.Router();

const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Majaribio mengi sana. Tafadhali subiri kisha ujaribu tena." },
});

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, signature: u.signature };
}

function newCsrfToken(req) {
  req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  return req.session.csrfToken;
}

// Issue (or return existing) CSRF token bound to this browser session.
// Safe to call before login — session cookie is created on first response.
router.get("/csrf", (req, res) => {
  const token = req.session.csrfToken || newCsrfToken(req);
  res.json({ csrfToken: token });
});

router.get("/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  res.json({
    user: {
      id: req.session.userId,
      name: req.session.name,
      role: req.session.role,
      email: req.session.email,
    },
  });
});

router.post("/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password, role, signature } = req.body || {};
    if (!isValidName(name)) return res.status(400).json({ error: "Jina si sahihi (angalau herufi 2)." });
    if (!isValidEmail(email)) return res.status(400).json({ error: "Barua pepe si sahihi." });
    if (!isValidPassword(password))
      return res
        .status(400)
        .json({ error: "Password lazima iwe na herufi 8+, angalau herufi moja na namba moja." });
    if (!isValidRole(role))
      return res.status(400).json({ error: "Chagua role sahihi (Student/Industrial/University)." });
    if (!isValidSignature(signature))
      return res.status(400).json({ error: "Tafadhali chora saini yako kabla ya kujisajili." });

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.rows.length) {
      return res.status(409).json({ error: "Barua pepe hii tayari imesajiliwa." });
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, signature)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, signature`,
      [name.trim(), normalizedEmail, hash, role, signature]
    );
    const user = rows[0];

    await logAudit(pool, {
      actorId: user.id,
      actorName: user.name,
      role: user.role,
      action: "Alijisajili kwenye mfumo",
    });

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Hitilafu ya server. Jaribu tena." });
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.name = user.name;
      req.session.email = user.email;
      const csrfToken = newCsrfToken(req);
      req.session.save((err2) => {
        if (err2) return res.status(500).json({ error: "Hitilafu ya server. Jaribu tena." });
        res.status(201).json({ user: publicUser(user), csrfToken });
      });
    });
  } catch (e) {
    console.error("register error:", e);
    res.status(500).json({ error: "Hitilafu ya server. Jaribu tena baadaye." });
  }
});

router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!isValidEmail(email) || typeof password !== "string" || !password) {
      return res.status(400).json({ error: "Barua pepe au password si sahihi." });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [normalizedEmail]);
    // Generic error message on every failure path below — never reveal
    // whether the email exists, to avoid account enumeration.
    const GENERIC = "Barua pepe au password si sahihi.";
    if (!rows.length) return res.status(401).json({ error: GENERIC });
    const user = rows[0];

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({
        error: `Akaunti imefungwa kwa muda kutokana na majaribio mengi. Jaribu tena baada ya dakika chache.`,
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      const attempts = user.failed_attempts + 1;
      const lock = attempts >= LOCK_THRESHOLD;
      await pool.query(
        `UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3`,
        [
          lock ? 0 : attempts,
          lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
          user.id,
        ]
      );
      return res.status(401).json({ error: GENERIC });
    }

    await pool.query(
      `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1`,
      [user.id]
    );

    await logAudit(pool, {
      actorId: user.id,
      actorName: user.name,
      role: user.role,
      action: "Aliingia kwenye mfumo (login)",
    });

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Hitilafu ya server. Jaribu tena." });
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.name = user.name;
      req.session.email = user.email;
      const csrfToken = newCsrfToken(req);
      req.session.save((err2) => {
        if (err2) return res.status(500).json({ error: "Hitilafu ya server. Jaribu tena." });
        res.json({ user: publicUser(user), csrfToken });
      });
    });
  } catch (e) {
    console.error("login error:", e);
    res.status(500).json({ error: "Hitilafu ya server. Jaribu tena baadaye." });
  }
});

router.post("/logout", requireAuth, (req, res) => {
  const name = req.session.name,
    role = req.session.role,
    id = req.session.userId;
  req.session.destroy(async (err) => {
    res.clearCookie("iptms.sid");
    if (!err) {
      try {
        await logAudit(pool, { actorId: id, actorName: name, role, action: "Alitoka (logout)" });
      } catch (_) {}
    }
    res.json({ ok: true });
  });
});

// Let a logged-in user replace their saved signature (e.g. they made a
// mistake at registration, or want to update it). Past signed documents
// keep the signature image that was actually used at the time — this only
// changes what will be used for future signing actions.
router.post("/signature", requireAuth, async (req, res) => {
  const { signature } = req.body || {};
  if (!isValidSignature(signature)) {
    return res.status(400).json({ error: "Saini si sahihi. Chora saini kwenye eneo lililoainishwa." });
  }
  await pool.query("UPDATE users SET signature = $1 WHERE id = $2", [signature, req.session.userId]);
  await logAudit(pool, {
    actorId: req.session.userId,
    actorName: req.session.name,
    role: req.session.role,
    action: "Alibadilisha saini yake iliyohifadhiwa",
  });
  res.json({ ok: true, signature });
});

router.post("/password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!isValidPassword(newPassword)) {
    return res
      .status(400)
      .json({ error: "Password mpya lazima iwe na herufi 8+, angalau herufi moja na namba moja." });
  }
  const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [
    req.session.userId,
  ]);
  if (!rows.length) return res.status(404).json({ error: "Mtumiaji hajapatikana." });
  const ok = await bcrypt.compare(currentPassword || "", rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: "Password ya sasa si sahihi." });

  const hash = await bcrypt.hash(newPassword, 12);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, req.session.userId]);
  await logAudit(pool, {
    actorId: req.session.userId,
    actorName: req.session.name,
    role: req.session.role,
    action: "Alibadilisha password yake",
  });
  res.json({ ok: true });
});

// Return the caller's own saved signature (used by the frontend right
// before a signing action, so the UI can preview "this is what will be
// stamped onto this document").
router.get("/my-signature", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT signature FROM users WHERE id = $1", [
    req.session.userId,
  ]);
  if (!rows.length) return res.status(404).json({ error: "Mtumiaji hajapatikana." });
  res.json({ signature: rows[0].signature });
});

module.exports = router;
