const crypto = require("crypto");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json(200, {});
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  const expectedUsername = String(process.env.STOCK_LOGIN_USERNAME || "").trim();
  const expectedPassword = String(process.env.STOCK_LOGIN_PASSWORD || "");

  if (!expectedUsername || !expectedPassword) {
    return json(500, {
      ok: false,
      error: "Stock login is not configured on the server."
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const username = String(payload.username || "").trim();
  const password = String(payload.password || "");

  if (!username || !password) {
    return json(400, { ok: false, error: "Username and password are required." });
  }

  const usernameOk = safeEqual(username, expectedUsername);
  const passwordOk = safeEqual(password, expectedPassword);

  if (!usernameOk || !passwordOk) {
    return json(401, { ok: false, error: "Invalid username or password." });
  }

  return json(200, { ok: true });
};
