// All authorization decisions are made from req.session — a value the
// browser cannot forge — never from anything the client sends in the body.
// This is the single most important security property of this app: a
// student can never act as an industrial supervisor, faculty, etc.,
// because every protected route re-checks req.session.role on the server.

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Tafadhali ingia (login) kwanza." });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: "Tafadhali ingia (login) kwanza." });
    }
    if (!roles.includes(req.session.role)) {
      return res.status(403).json({ error: "Huna ruhusa ya kufanya kitendo hiki." });
    }
    next();
  };
}

// Double-submit style CSRF check: a per-session random token is issued via
// GET /api/auth/csrf and must be echoed back in the X-CSRF-Token header on
// every state-changing request. An attacker's cross-site form/script can
// never read that header value, so this blocks classic CSRF even though
// the session cookie itself is sent automatically by the browser.
function csrfProtection(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const sent = req.headers["x-csrf-token"];
  const expected = req.session && req.session.csrfToken;
  if (!sent || !expected || sent !== expected) {
    return res.status(403).json({
      error: "Ombi halikuthibitishwa (CSRF token haipo au si sahihi). Pakia upya ukurasa.",
    });
  }
  next();
}

module.exports = { requireAuth, requireRole, csrfProtection };
