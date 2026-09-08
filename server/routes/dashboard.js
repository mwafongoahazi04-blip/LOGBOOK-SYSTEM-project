const express = require("express");
const { pool } = require("../db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/stats", requireRole("superadmin"), async (req, res) => {
  const [total, completed, approved, denied] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS n FROM logbooks"),
    pool.query("SELECT COUNT(*)::int AS n FROM logbooks WHERE faculty_sig IS NOT NULL"),
    pool.query("SELECT COUNT(*)::int AS n FROM permissions WHERE status = 'approved'"),
    pool.query("SELECT COUNT(*)::int AS n FROM permissions WHERE status = 'denied'"),
  ]);
  res.json({
    total: total.rows[0].n,
    completed: completed.rows[0].n,
    permApproved: approved.rows[0].n,
    permDenied: denied.rows[0].n,
  });
});

module.exports = router;
