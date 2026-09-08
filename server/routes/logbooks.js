const express = require("express");
const { pool } = require("../db");
const { requireRole } = require("../middleware/auth");
const { cleanText, isValidDate, logAudit } = require("../helpers");

const router = express.Router();

async function getOwnSignature(userId) {
  const { rows } = await pool.query("SELECT signature, name FROM users WHERE id = $1", [userId]);
  if (!rows.length) throw new Error("Mtumiaji hajapatikana.");
  return rows[0];
}

// ---- STUDENT: submit a new daily logbook entry, auto-signed with the
// student's own saved signature (no drawing needed each time). ----
router.post("/", requireRole("student"), async (req, res) => {
  try {
    const { date, activity, observations, remarks } = req.body || {};
    const entryDate = isValidDate(date) ? date : new Date().toISOString().slice(0, 10);
    const cleanActivity = cleanText(activity, 4000);
    if (!cleanActivity) return res.status(400).json({ error: "Jaza sehemu ya 'Kazi Iliyofanyika'." });

    const me = await getOwnSignature(req.session.userId);
    const { rows } = await pool.query(
      `INSERT INTO logbooks
        (student_id, student_name, entry_date, activity, observations, remarks, student_sig, student_signed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now()) RETURNING id`,
      [
        req.session.userId,
        req.session.name,
        entryDate,
        cleanActivity,
        cleanText(observations, 4000),
        cleanText(remarks, 4000),
        me.signature,
      ]
    );
    await logAudit(pool, {
      actorId: req.session.userId,
      actorName: req.session.name,
      role: "student",
      action: `Aliwasilisha logbook ya ${entryDate}`,
    });
    res.status(201).json({ id: rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Imeshindikana kuwasilisha logbook." });
  }
});

router.get("/mine", requireRole("student"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM logbooks WHERE student_id = $1 ORDER BY submitted_at DESC`,
    [req.session.userId]
  );
  res.json({ logbooks: rows });
});

router.get("/printable", requireRole("student"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM logbooks WHERE student_id = $1 ORDER BY submitted_at DESC`,
    [req.session.userId]
  );
  res.json({
    ready: rows.filter((r) => r.print_enabled),
    notReady: rows.filter((r) => !r.print_enabled),
  });
});

// ---- INDUSTRIAL SUPERVISOR: approve with own saved signature ----
router.get("/pending/industrial", requireRole("industrial"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM logbooks WHERE industrial_sig IS NULL ORDER BY submitted_at ASC`
  );
  res.json({ logbooks: rows });
});

router.post("/:id/industrial-sign", requireRole("industrial"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID si sahihi." });
  const entry = await pool.query("SELECT * FROM logbooks WHERE id = $1", [id]);
  if (!entry.rows.length) return res.status(404).json({ error: "Logbook haipo." });
  if (entry.rows[0].industrial_sig) return res.status(409).json({ error: "Tayari imeidhinishwa." });

  const me = await getOwnSignature(req.session.userId);
  await pool.query(
    `UPDATE logbooks SET industrial_id=$1, industrial_sig=$2, industrial_signed_at=now() WHERE id=$3`,
    [req.session.userId, me.signature, id]
  );
  await logAudit(pool, {
    actorId: req.session.userId,
    actorName: req.session.name,
    role: "industrial",
    action: `Aliidhinisha logbook ya ${entry.rows[0].student_name} (${entry.rows[0].entry_date})`,
  });
  res.json({ ok: true });
});

// ---- UNIVERSITY SUPERVISOR: assess with own saved signature ----
router.get("/pending/university", requireRole("university"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM logbooks WHERE industrial_sig IS NOT NULL AND university_sig IS NULL ORDER BY submitted_at ASC`
  );
  res.json({ logbooks: rows });
});

router.post("/:id/university-sign", requireRole("university"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID si sahihi." });
  const entry = await pool.query("SELECT * FROM logbooks WHERE id = $1", [id]);
  if (!entry.rows.length) return res.status(404).json({ error: "Logbook haipo." });
  if (!entry.rows[0].industrial_sig)
    return res.status(409).json({ error: "Bado haijaidhinishwa na Industrial Supervisor." });
  if (entry.rows[0].university_sig) return res.status(409).json({ error: "Tayari imetathminiwa." });

  const notes = cleanText((req.body || {}).notes, 4000);
  const me = await getOwnSignature(req.session.userId);
  await pool.query(
    `UPDATE logbooks SET university_id=$1, university_notes=$2, university_sig=$3, university_signed_at=now() WHERE id=$4`,
    [req.session.userId, notes, me.signature, id]
  );
  await logAudit(pool, {
    actorId: req.session.userId,
    actorName: req.session.name,
    role: "university",
    action: `Aliwasilisha tathmini ya ${entry.rows[0].student_name} kwa Head of Faculty`,
  });
  res.json({ ok: true });
});

// ---- HEAD OF FACULTY: final approval + print control, own saved signature ----
router.get("/pending/faculty", requireRole("faculty"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM logbooks WHERE university_sig IS NOT NULL AND faculty_sig IS NULL ORDER BY submitted_at ASC`
  );
  res.json({ logbooks: rows });
});

router.get("/completed/faculty", requireRole("faculty"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM logbooks WHERE faculty_sig IS NOT NULL ORDER BY faculty_signed_at DESC LIMIT 20`
  );
  res.json({ logbooks: rows });
});

router.post("/:id/faculty-sign", requireRole("faculty"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID si sahihi." });
  const entry = await pool.query("SELECT * FROM logbooks WHERE id = $1", [id]);
  if (!entry.rows.length) return res.status(404).json({ error: "Logbook haipo." });
  if (!entry.rows[0].university_sig)
    return res.status(409).json({ error: "Bado haijatathminiwa na University Supervisor." });
  if (entry.rows[0].faculty_sig) return res.status(409).json({ error: "Tayari imekamilika." });

  const remarks = cleanText((req.body || {}).remarks, 4000);
  const printEnabled = !!(req.body || {}).printEnabled;
  const me = await getOwnSignature(req.session.userId);
  await pool.query(
    `UPDATE logbooks SET faculty_id=$1, faculty_remarks=$2, faculty_sig=$3, faculty_signed_at=now(), print_enabled=$4 WHERE id=$5`,
    [req.session.userId, remarks, me.signature, printEnabled, id]
  );
  await logAudit(pool, {
    actorId: req.session.userId,
    actorName: req.session.name,
    role: "faculty",
    action: `Alitoa idhini ya mwisho kwa logbook ya ${entry.rows[0].student_name}${
      printEnabled ? " na kuruhusu printing" : ""
    }`,
  });
  res.json({ ok: true });
});

router.post("/:id/print-toggle", requireRole("faculty"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID si sahihi." });
  const entry = await pool.query("SELECT * FROM logbooks WHERE id = $1", [id]);
  if (!entry.rows.length) return res.status(404).json({ error: "Logbook haipo." });
  if (!entry.rows[0].faculty_sig)
    return res.status(409).json({ error: "Idhini ya mwisho haijatolewa bado." });

  const next = !entry.rows[0].print_enabled;
  await pool.query("UPDATE logbooks SET print_enabled = $1 WHERE id = $2", [next, id]);
  await logAudit(pool, {
    actorId: req.session.userId,
    actorName: req.session.name,
    role: "faculty",
    action: `${next ? "Aliruhusu" : "Alizuia"} print kwa logbook ya ${entry.rows[0].student_name}`,
  });
  res.json({ ok: true, printEnabled: next });
});

module.exports = router;
