const { json, getSession } = require("./_auth");
exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { ok: false, error: "Method not allowed." });
  const session = getSession(event);
  if (!session) return json(200, { ok: true, authenticated: false });
  return json(200, { ok: true, authenticated: true, username: session.payload.u, csrf: session.payload.csrf });
};
