const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { requireRole } = require("../middleware/auth");
const {
  isValidEmail,
  isValidPassword,
  isValidName,
  isValidSignature,
  isValidRole,
  logAudit,
} = require("../helpers");

const router = express.Router();

router.use(requireRole("superadmin"));

router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC"
  );
  res.json({ users: rows });
});

// Superadmin can create a user of ANY role (including faculty/superadmin),
// which is how those admin-only roles get onboarded. A signature and a
// temporary password are required up front so the account is fully usable
// (and consistent with "every user has a signature from registration").
router.post("/", async (req, res) => {
  const { name, email, password, role, signature } = req.body || {};
  if (!isValidName(name)) return res.status(400).json({ error: "Jina si sahihi." });
  if (!isValidEmail(email)) return res.status(400).json({ error: "Barua pepe si sahihi." });
  if (!isValidPassword(password))
    return res.status(400).json({ error: "Password lazima iwe herufi 8+, na namba moja." });
  if (!isValidRole(role, { allowAdminRoles: true }))
    return res.status(400).json({ error: "Role si sahihi." });
  if (!isValidSignature(signature))
    return res.status(400).json({ error: "Tafadhali weka saini ya mtumiaji huyu." });

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
  if (existing.rows.length) return res.status(409).json({ error: "Barua pepe hii tayari ipo." });

  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, signature)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, created_at`,
    [name.trim(), normalizedEmail, hash, role, signature]
  );
  await logAudit(pool, {
    actorId: req.session.userId,
    actorName: req.session.name,
    role: "superadmin",
    action: `Aliongeza mtumiaji mpya: ${rows[0].name} (${role})`,
  });
  res.status(201).json({ user: rows[0] });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID si sahihi." });
  if (id === req.session.userId) {
    return res.status(400).json({ error: "Huwezi kujifuta mwenyewe." });
  }
  const target = await pool.query("SELECT name, role FROM users WHERE id = $1", [id]);
  if (!target.rows.length) return res.status(404).json({ error: "Mtumiaji hajapatikana." });

  if (target.rows[0].role === "superadmin") {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE role = 'superadmin'"
    );
    if (rows[0].n <= 1) {
      return res.status(400).json({ error: "Haiwezekani kufuta Superadmin pekee aliyebaki." });
    }
  }

  await pool.query("DELETE FROM users WHERE id = $1", [id]);
  await logAudit(pool, {
    actorId: req.session.userId,
    actorName: req.session.name,
    role: "superadmin",
    action: `Alifuta mtumiaji: ${target.rows[0].name}`,
  });
  res.json({ ok: true });
});

module.exports = router;
