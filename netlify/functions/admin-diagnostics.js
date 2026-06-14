const { json, requireAdmin } = require("./_auth");
exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (auth.error) return auth.error;
  if (event.httpMethod !== "GET") return json(405, { ok: false, error: "Method not allowed." });
  return json(200, {
    ok: true,
    adminUsernameSet: !!process.env.ADMIN_USERNAME,
    adminPasswordHashSet: !!process.env.ADMIN_PASSWORD_HASH,
    sessionSecretSet: !!process.env.SESSION_SECRET,
    sessionSecretLength: process.env.SESSION_SECRET ? process.env.SESSION_SECRET.length : 0,
    node: process.version
  });
};
