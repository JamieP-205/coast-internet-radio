const {
  json, makeSession, sessionCookie, verifyPassword,
  checkLoginLimit, recordFailedLogin, clearLoginLimit, sameOriginOk
} = require("./_auth");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed." });
    if (!sameOriginOk(event)) return json(403, { ok: false, error: "Invalid request origin." });

    let limit = { blocked: false };
    try {
      limit = await checkLoginLimit(event);
    } catch (err) {
      // If Netlify Blobs/rate limiting is unavailable, do not block the actual login.
      // This keeps the private editor usable while the main username/password/session checks still protect it.
      limit = { blocked: false, rateLimitUnavailable: true };
    }

    if (limit.blocked) {
      return json(429, { ok: false, error: "Too many failed attempts. Try again later." });
    }

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    const expectedUser = process.env.ADMIN_USERNAME || "";
    const expectedHash = process.env.ADMIN_PASSWORD_HASH || "";
    const backupHash = process.env.ADMIN_BACKUP_PASSWORD_HASH || "";
    if (!expectedUser || !expectedHash) {
      return json(500, { ok: false, error: "Admin login is not configured yet. Check ADMIN_USERNAME and ADMIN_PASSWORD_HASH in Netlify environment variables." });
    }

    const userOk = username === expectedUser;
    let passOk = false;
    try {
      passOk = verifyPassword(password, expectedHash) || (!!backupHash && verifyPassword(password, backupHash));
    } catch {
      passOk = false;
    }

    if (!userOk || !passOk) {
      try { await recordFailedLogin(limit); } catch {}
      return json(401, { ok: false, error: "Incorrect username or password." });
    }

    try { await clearLoginLimit(limit); } catch {}
    const session = makeSession(username);
    return json(200, { ok: true, csrf: session.payload.csrf, username }, { "Set-Cookie": sessionCookie(session.token) });
  } catch (err) {
    return json(500, { ok: false, error: "Login server error: " + (err && err.message ? err.message : "Unknown error") });
  }
};
