const nodemailer = require("nodemailer");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const requiredFields = ["order_id", "customer_name", "customer_email", "customer_phone", "address", "total", "items"];
  const missing = requiredFields.filter((field) => !(field in payload) || payload[field] === "" || payload[field] === null);
  if (missing.length > 0) {
    return json(400, { ok: false, error: `Missing fields: ${missing.join(", ")}` });
  }

  const smtpHost = process.env.ORDER_SMTP_HOST;
  const smtpPort = Number(process.env.ORDER_SMTP_PORT || 465);
  const smtpUser = process.env.ORDER_SMTP_USER;
  const smtpPass = process.env.ORDER_SMTP_PASS;
  const fromEmail = process.env.ORDER_FROM_EMAIL || smtpUser;
  const bccEmail = process.env.ORDER_BCC_EMAIL || "";

  if (!smtpHost || !smtpUser || !smtpPass) {
    return json(500, { ok: false, error: "SMTP environment variables are missing" });
  }

  const toEmail = String(payload.customer_email || "").trim();
  if (!toEmail || !toEmail.includes("@")) {
    return json(400, { ok: false, error: "customer_email must be a valid email address" });
  }

  const lines = Array.isArray(payload.items)
    ? payload.items.map((row) => `- ${row.title || "Item"} | qty ${Number(row.qty || 0)} | $${Number(row.line_total || 0).toFixed(2)}`)
    : [];

  const body = payload.body || [
    `Order ID: ${payload.order_id}`,
    `Customer: ${payload.customer_name}`,
    `Customer email: ${toEmail}`,
    `Phone: ${payload.customer_phone}`,
    `Address: ${payload.address}`,
    "",
    "Items:",
    lines.join("\n"),
    "",
    `Grand total: $${Number(payload.total || 0).toFixed(2)}`
  ].join("\n");

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  const message = {
    from: fromEmail,
    to: toEmail,
    subject: `Your Curated Kadha Order - ${payload.order_id}`,
    text: body
  };

  if (bccEmail) {
    message.bcc = bccEmail;
  }

  try {
    await transporter.sendMail(message);
    return json(200, { ok: true, order_id: payload.order_id, sent_to: toEmail });
  } catch (error) {
    return json(502, { ok: false, error: `Email send failed: ${error.message}` });
  }
};
