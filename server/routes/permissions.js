const express = require("express");
const { pool } = require("../db");
const { requireRole } = require("../middleware/auth");
const { cleanText, isValidDate, logAudit } = require("../helpers");

const router = express.Router();

router.post("/", requireRole("student"), async (req, res) => {
  const { date, reason } = req.body || {};
  const cleanReason = cleanText(reason, 2000);
  if (!cleanReason) return res.status(400).json({ error: "Andika sababu ya ruhusa." });
  const permDate = isValidDate(date) ? date : new Date().toISOString().slice(0, 10);

  const { rows } = await pool.query(
    `INSERT INTO permissions (student_id, student_name, perm_date, reason)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [req.session.userId, req.session.name, permDate, cleanReason]
  );
  await logAudit(pool, {
    actorId: req.session.userId,
    actorName: req.session.name,
    role: "student",
    action: "Aliomba ruhusa ya kutokuwepo field",
  });
  res.status(201).json({ id: rows[0].id });
});

router.get("/mine", requireRole("student"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM permissions WHERE student_id = $1 ORDER BY requested_at DESC`,
    [req.session.userId]
  );
  res.json({ permissions: rows });
});

router.get("/pending", requireRole("industrial"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM permissions WHERE status = 'pending' ORDER BY requested_at ASC`
  );
  res.json({ permissions: rows });
});

router.get("/history", requireRole("industrial"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM permissions WHERE status != 'pending' ORDER BY requested_at DESC LIMIT 20`
  );
  res.json({ permissions: rows });
});

router.post("/:id/approve", requireRole("industrial"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID si sahihi." });
  const p = await pool.query("SELECT * FROM permissions WHERE id = $1", [id]);
  if (!p.rows.length) return res.status(404).json({ error: "Ombi halipo." });
  if (p.rows[0].status !== "pending") return res.status(409).json({ error: "Ombi tayari limeshughulikiwa." });

  const { rows } = await pool.query("SELECT signature FROM users WHERE id = $1", [req.session.userId]);
  await pool.query(
    `UPDATE permissions SET status='approved', industrial_id=$1, industrial_sig=$2, industrial_signed_at=now() WHERE id=$3`,
    [req.session.userId, rows[0].signature, id]
  );
  await logAudit(pool, {
    actorId: req.session.userId,
    actorName: req.session.name,
    role: "industrial",
    action: `Aliidhinisha ruhusa ya ${p.rows[0].student_name} (${p.rows[0].perm_date})`,
  });
  res.json({ ok: true });
});

router.post("/:id/deny", requireRole("industrial"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID si sahihi." });
  const p = await pool.query("SELECT * FROM permissions WHERE id = $1", [id]);
  if (!p.rows.length) return res.status(404).json({ error: "Ombi halipo." });
  if (p.rows[0].status !== "pending") return res.status(409).json({ error: "Ombi tayari limeshughulikiwa." });

  await pool.query("UPDATE permissions SET status = 'denied' WHERE id = $1", [id]);
  await logAudit(pool, {
    actorId: req.session.userId,
    actorName: req.session.name,
    role: "industrial",
    action: `Alikataa ruhusa ya ${p.rows[0].student_name} (${p.rows[0].perm_date})`,
  });
  res.json({ ok: true });
});

module.exports = router;
