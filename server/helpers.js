const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/; // 8+ chars, letter + number
const PUBLIC_ROLES = ["student", "industrial", "university"]; // faculty/superadmin: admin-created only

function isValidEmail(v) {
  return typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v.trim());
}

function isValidPassword(v) {
  return typeof v === "string" && PASSWORD_RE.test(v);
}

function isValidName(v) {
  return typeof v === "string" && v.trim().length >= 2 && v.trim().length <= 120;
}

function isValidSignature(v) {
  return (
    typeof v === "string" &&
    v.startsWith("data:image/png;base64,") &&
    v.length > 100 &&
    v.length < 400000 // ~300KB cap, plenty for a hand-drawn signature, blocks abuse
  );
}

function isValidRole(v, { allowAdminRoles = false } = {}) {
  if (allowAdminRoles) {
    return ["student", "industrial", "university", "faculty", "superadmin"].includes(v);
  }
  return PUBLIC_ROLES.includes(v);
}

function cleanText(v, maxLen = 4000) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

function isValidDate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
}

async function logAudit(pool, { actorId, actorName, role, action }) {
  await pool.query(
    `INSERT INTO audit_log (actor_id, actor_name, role, action) VALUES ($1,$2,$3,$4)`,
    [actorId, actorName, role, action]
  );
}

module.exports = {
  isValidEmail,
  isValidPassword,
  isValidName,
  isValidSignature,
  isValidRole,
  cleanText,
  isValidDate,
  logAudit,
};
