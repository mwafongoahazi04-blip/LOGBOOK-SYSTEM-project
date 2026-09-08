const express = require("express");
const { pool } = require("../db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireRole("superadmin"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, actor_name, role, action, created_at
     FROM audit_log ORDER BY created_at DESC LIMIT 300`
  );
  res.json({ audit: rows });
});

module.exports = router;
