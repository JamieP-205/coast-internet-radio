const { json, readContent } = require("./_auth");
exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { ok: false, error: "Method not allowed." });
  const content = await readContent();
  return json(200, content, { "Cache-Control": "no-store, max-age=0" });
};
