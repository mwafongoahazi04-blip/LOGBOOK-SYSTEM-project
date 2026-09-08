const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

if (!process.env.DATABASE_URL) {
  console.error(
    "FATAL: DATABASE_URL haijawekwa. Weka PostgreSQL connection string kwenye .env (au Render env vars)."
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

pool.on("error", (err) => {
  // A background/idle client error should never crash the whole process.
  console.error("Hitilafu isiyotarajiwa kwenye Postgres pool:", err);
});

// A tiny 1x1 transparent PNG used only as a placeholder signature for the
// auto-created bootstrap superadmin account. They are prompted to replace
// it with a real signature from their profile page after first login.
const BLANK_SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);
  await seedSuperadmin();
}

async function seedSuperadmin() {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM users WHERE role = 'superadmin'"
  );
  if (rows[0].n > 0) return;

  const name = process.env.SUPERADMIN_NAME || "Msimamizi Mkuu";
  const email = (process.env.SUPERADMIN_EMAIL || "superadmin@iptms.local").toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD || "ChangeMe123!";

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, signature)
     VALUES ($1, $2, $3, 'superadmin', $4)`,
    [name, email, hash, BLANK_SIGNATURE]
  );
  console.log(
    `Akaunti ya Superadmin ya awali imeundwa: ${email}. TAFADHALI ingia na ubadilishe password mara moja.`
  );
}

module.exports = { pool, initDb };
