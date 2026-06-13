const liveStatus = require("./public-live-status");

exports.handler = async () => {
  const result = await liveStatus.handler({ httpMethod: "GET", headers: {}, queryStringParameters: {} });
  let body = {};
  try { body = JSON.parse(result.body || "{}"); } catch (_) { body = {}; }

  console.log("Scheduled playlist history collection", {
    ok: body.ok,
    current: body.snapshot?.current || "",
    artist: body.snapshot?.artist || "",
    title: body.snapshot?.title || "",
    listeners: body.snapshot?.listeners ?? null,
    logged: body.history?.logged ?? false,
    playLogged: body.history?.playLogged ?? false,
    errors: body.errors || []
  });

  return {
    statusCode: result.statusCode || 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: body.ok !== false,
      scheduled: true,
      logged: body.history?.logged ?? false,
      playLogged: body.history?.playLogged ?? false,
      current: body.snapshot?.current || "",
      at: body.snapshot?.at || new Date().toISOString(),
      errors: body.errors || []
    })
  };
};
