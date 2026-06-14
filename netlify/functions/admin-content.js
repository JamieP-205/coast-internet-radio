const { json, requireAdmin, requireCsrf, readContent, writeContent, sameOriginOk } = require("./_auth");

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (auth.error) return auth.error;

  if (event.httpMethod === "GET") {
    const content = await readContent();
    return json(200, { ok: true, content });
  }

  if (event.httpMethod === "POST") {
    if (!sameOriginOk(event)) return json(403, { ok: false, error: "Invalid request origin. Refresh the admin page and try again." });
    const csrfError = requireCsrf(event, auth.session);
    if (csrfError) return csrfError;

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

    try {
      const content = await writeContent(body.content || {});
      return json(200, { ok: true, content });
    } catch (error) {
      return json(500, {
        ok: false,
        error: "The admin panel could not save to Netlify storage. Refresh the admin page and try once more. If it still fails, the Netlify storage connection needs checked.",
        detail: String(error && (error.message || error) || "unknown error").slice(0, 400)
      });
    }
  }

  return json(405, { ok: false, error: "Method not allowed." });
};
