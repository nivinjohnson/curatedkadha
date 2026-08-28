const nodemailer = require("nodemailer");

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildOrderEmailHtml(payload, toEmail) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const itemRows = items.map((row) => {
    const title = escapeHtml(row.title || "Item");
    const qty = Number(row.qty || 0);
    const unitPrice = Number(row.price || 0);
    const lineTotal = Number(row.line_total || 0);
    const imageUrl = String(row.image_url || "").trim();
    const imageBlock = imageUrl
      ? `<img src="${escapeHtml(imageUrl)}" alt="${title}" style="width:100%;max-width:180px;height:180px;object-fit:cover;border-radius:14px;border:1px solid #eadccc;display:block;" />`
      : '<div style="width:100%;max-width:180px;height:180px;border-radius:14px;border:1px solid #eadccc;background:#f6efe6;color:#8b6f4e;display:flex;align-items:center;justify-content:center;font-size:13px;">No image</div>';

    return [
      "<tr>",
      `<td style="padding:14px 0;border-bottom:1px solid #f0e6d8;vertical-align:top;">${imageBlock}</td>`,
      '<td style="padding:14px 0 14px 14px;border-bottom:1px solid #f0e6d8;vertical-align:top;">',
      `<div style="font-size:16px;font-weight:700;color:#1c140d;">${title}</div>`,
      `<div style="font-size:13px;color:#6e5440;margin-top:6px;">Qty: ${qty}</div>`,
      `<div style="font-size:13px;color:#6e5440;">Unit price: ${money(unitPrice)}</div>`,
      `<div style="font-size:14px;color:#1c140d;font-weight:700;margin-top:8px;">Line total: ${money(lineTotal)}</div>`,
      "</td>",
      "</tr>"
    ].join("");
  }).join("");

  const orderId = escapeHtml(payload.order_id || "");
    const createdUtc = new Date(payload.created_utc).toLocaleString("en-NZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
    });
  const customerName = escapeHtml(payload.customer_name || "");
  const customerPhone = escapeHtml(payload.customer_phone || "");
  const customerAddress = escapeHtml(payload.address || "");
  const grandTotal = money(payload.total || 0);

  return [
    "<!doctype html>",
    "<html>",
    '<body style="margin:0;padding:0;background:#f7f2ea;font-family:Segoe UI,Arial,sans-serif;color:#2a2017;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">',
    "<tr>",
    '<td align="center">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#ffffff;border:1px solid #eadccc;border-radius:18px;overflow:hidden;">',
    "<tr>",
    '<td style="padding:22px 24px;background:linear-gradient(120deg,#e7d2b8,#f6e8d6);border-bottom:1px solid #eadccc;">',
    '<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#7e6044;font-weight:700;">Curated Kadha</div>',
    '<h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;color:#20150b;">Order Placed Successfully</h1>',
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:20px 24px 0;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #efe3d5;border-radius:12px;background:#fffaf4;">',
    `<tr><td style="padding:14px 16px;font-size:14px;color:#5f4836;"><strong style="color:#2a2017;">Order ID:</strong> ${orderId}</td></tr>`,
    `<tr><td style="padding:0 16px 14px;font-size:14px;color:#5f4836;"><strong style="color:#2a2017;">Placed At (UTC):</strong> ${createdUtc}</td></tr>`,
    "</table>",
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:20px 24px 0;">',
    '<h2 style="margin:0 0 10px;font-size:18px;color:#24190f;">Customer Details</h2>',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #efe3d5;border-radius:12px;">',
    `<tr><td style="padding:12px 16px;font-size:14px;color:#5f4836;"><strong style="color:#2a2017;">Name:</strong> ${customerName}</td></tr>`,
    `<tr><td style="padding:0 16px 12px;font-size:14px;color:#5f4836;"><strong style="color:#2a2017;">Email:</strong> ${escapeHtml(toEmail)}</td></tr>`,
    `<tr><td style="padding:0 16px 12px;font-size:14px;color:#5f4836;"><strong style="color:#2a2017;">Phone:</strong> ${customerPhone}</td></tr>`,
    `<tr><td style="padding:0 16px 12px;font-size:14px;color:#5f4836;"><strong style="color:#2a2017;">Delivery Address:</strong> ${customerAddress}</td></tr>`,
    "</table>",
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:20px 24px 0;">',
    '<h2 style="margin:0 0 10px;font-size:18px;color:#24190f;">Order Items</h2>',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0">',
    itemRows || '<tr><td style="padding:12px 0;color:#7a634d;">No items listed.</td></tr>',
    "</table>",
    "</td>",
    "</tr>",

    "<tr>",
    '<td style="padding:20px 24px 0;">',
    '<div style="background:#fff7ee;border:1px solid #eadccc;border-radius:12px;padding:18px;">',
    '<h2 style="margin:0 0 12px;font-size:18px;color:#24190f;">Payment Instructions</h2>',
    `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#5f4836;">Please pay <strong>${grandTotal}</strong> to the following bank account to start the shipping process.</p>`,
    '<div style="font-size:20px;font-weight:700;color:#20150b;margin-bottom:10px;">06-0301-0600835-01</div>',
    '<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#5f4836;"><strong>Reference:</strong> Your Name</p>',
    '<p style="margin:0;font-size:14px;line-height:1.6;color:#5f4836;">Once payment is received, we will begin processing and shipping your order.</p>',
    '<p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#5f4836;">If you need to get in touch, please contact us via mail or message <strong>@curatedkadha</strong> on Instagram.</p>',
    '</div>',
    "</td>",
    "</tr>",

    "<tr>",
    '<td style="padding:18px 24px 24px;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:2px dashed #eddcc7;padding-top:14px;">',
    "<tr>",
    '<td style="font-size:16px;color:#4a3729;"><strong>Grand Total</strong></td>',
    `<td align="right" style="font-size:20px;color:#20150b;"><strong>${grandTotal}</strong></td>`,
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    "</table>",
    "</body>",
    "</html>"
  ].join("");
}

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
  const htmlBody = buildOrderEmailHtml(payload, toEmail);

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
    text: body,
    html: htmlBody
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
