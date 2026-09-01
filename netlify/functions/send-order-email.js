const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

async function isStripeSessionPaid(sessionId) {
  if (!sessionId) {
    return { ok: false, reason: "stripe_session_id is required" };
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false, reason: "STRIPE_SECRET_KEY is missing" };
  }
  try {
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(String(sessionId));
    if (!session) {
      return { ok: false, reason: "Stripe session not found" };
    }
    if (session.payment_status !== "paid") {
      return { ok: false, reason: `Stripe payment not completed (status: ${session.payment_status || "unknown"})` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err && err.message ? err.message : "Failed to verify Stripe payment" };
  }
}

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

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

function resolveEmailImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || /^data:/i.test(raw)) {
    return raw;
  }
  const siteBase = String(process.env.ORDER_SITE_URL || process.env.SITE_URL || process.env.URL || "").trim();
  if (!siteBase) {
    return raw;
  }
  try {
    return new URL(raw, siteBase.endsWith("/") ? siteBase : `${siteBase}/`).toString();
  } catch {
    return raw;
  }
}

function buildOrderEmailHtml(payload, toEmail) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const itemRows = items.map((row) => {
    const title = escapeHtml(row.title || "Item");
    const size = escapeHtml(row.size || "");
    const qty = Number(row.qty || 0);
    const unitPrice = Number(row.price || 0);
    const lineTotal = Number(row.line_total || 0);
    const imageUrl = resolveEmailImageUrl(row.image_url || row.image || "");
    const imageBlock = imageUrl
      ? `<img src="${escapeHtml(imageUrl)}" alt="${title}" style="width:100%;max-width:120px;height:120px;object-fit:cover;border-radius:12px;border:1px solid #eadccc;display:block;" />`
      : '<div style="width:100%;max-width:120px;height:120px;border-radius:12px;border:1px solid #eadccc;background:#f6efe6;color:#8b6f4e;display:flex;align-items:center;justify-content:center;font-size:12px;">No image</div>';

    return [
      "<tr>",
      `<td style="padding:14px 0;border-bottom:1px solid #f0e6d8;vertical-align:top;">${imageBlock}</td>`,
      '<td style="padding:14px 0 14px 14px;border-bottom:1px solid #f0e6d8;vertical-align:top;">',
      `<div style="font-size:16px;font-weight:700;color:#1c140d;">${title}</div>`,
      size ? `<div style="font-size:13px;font-weight:600;color:#7b916f;margin-top:4px;">Size: ${size}</div>` : "",
      `<div style="font-size:13px;color:#6e5440;margin-top:4px;">Qty: ${qty}</div>`,
      `<div style="font-size:13px;color:#6e5440;">Unit price: ${money(unitPrice)}</div>`,
      `<div style="font-size:14px;color:#1c140d;font-weight:700;margin-top:8px;">Line total: ${money(lineTotal)}</div>`,
      "</td>",
      "</tr>"
    ].join("");
  }).join("");

  const orderId = escapeHtml(payload.order_id || "");
    const createdUtc = new Date(payload.created_utc).toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
    });
  const customerName = escapeHtml(payload.customer_name || "");
  const customerPhone = escapeHtml(payload.customer_phone || "");
  const customerAddress = escapeHtml(payload.address || "");
  const grandTotal = money(payload.total || 0);
  const itemsTotal = money(payload.items_total || payload.total);
  const shippingMethod = escapeHtml(payload.shipping_method || "Standard Shipping");
  const shippingCost = money(payload.shipping_cost || 0);

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
    `<tr><td style="padding:0 16px 14px;font-size:14px;color:#5f4836;"><strong style="color:#2a2017;">Placed At:</strong> ${createdUtc}</td></tr>`,
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
    '<td style="padding:18px 24px 24px;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:2px dashed #eddcc7;padding-top:14px;">',
    "<tr>",
    '<td style="font-size:14px;color:#5f4836;padding-bottom:4px;">Items Subtotal</td>',
    `<td align="right" style="font-size:14px;color:#20150b;padding-bottom:4px;">${itemsTotal}</td>`,
    "</tr>",
    "<tr>",
    `<td style="font-size:14px;color:#5f4836;padding-bottom:8px;">Shipping (${shippingMethod})</td>`,
    `<td align="right" style="font-size:14px;color:#20150b;padding-bottom:8px;">${shippingCost}</td>`,
    "</tr>",
    "<tr>",
    '<td style="font-size:16px;color:#4a3729;border-top:1px solid #eddcc7;padding-top:8px;"><strong>Grand Total</strong></td>',
    `<td align="right" style="font-size:20px;color:#20150b;border-top:1px solid #eddcc7;padding-top:8px;"><strong>${grandTotal}</strong></td>`,
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

function buildShippedEmailHtml(payload, toEmail) {
  const orderId = escapeHtml(payload.order_id || "");
  const customerName = escapeHtml(payload.customer_name || "");
  const customerAddress = escapeHtml(payload.address || "");
  const shippingMethod = escapeHtml(payload.shipping_method || "Standard Shipping");
  const createdUtc = new Date(payload.created_utc || payload.created_at || Date.now()).toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });

  const items = Array.isArray(payload.items) ? payload.items : [];
  const itemRows = items.map((row) => {
    const title = escapeHtml(row.title || "Item");
    const size = escapeHtml(row.size || "");
    const qty = Number(row.qty || 0);
    return `<li style="margin:0 0 6px;">${title}${size ? ` (Size: ${size})` : ""} x ${qty}</li>`;
  }).join("");

  return [
    "<!doctype html>",
    "<html>",
    '<body style="margin:0;padding:0;background:#f7f2ea;font-family:Segoe UI,Arial,sans-serif;color:#2a2017;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">',
    "<tr><td align=\"center\">",
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #eadccc;border-radius:16px;overflow:hidden;">',
    '<tr><td style="padding:20px 24px;background:linear-gradient(120deg,#dcead7,#eef7ea);border-bottom:1px solid #d6e6cf;">',
    '<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#406437;font-weight:700;">Curated Kadha</div>',
    '<h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;color:#1f3b18;">Your order has been shipped</h1>',
    '</td></tr>',
    '<tr><td style="padding:20px 24px;">',
    `<p style="margin:0 0 12px;font-size:14px;color:#4e3a2a;">Hi ${customerName || "there"}, your order is now on the way.</p>`,
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #efe3d5;border-radius:12px;background:#fffaf4;">',
    `<tr><td style="padding:12px 16px;font-size:14px;color:#5f4836;"><strong>Order ID:</strong> ${orderId}</td></tr>`,
    `<tr><td style="padding:0 16px 12px;font-size:14px;color:#5f4836;"><strong>Email:</strong> ${escapeHtml(toEmail)}</td></tr>`,
    `<tr><td style="padding:0 16px 12px;font-size:14px;color:#5f4836;"><strong>Delivery Address:</strong> ${customerAddress}</td></tr>`,
    `<tr><td style="padding:0 16px 12px;font-size:14px;color:#5f4836;"><strong>Shipping Method:</strong> ${shippingMethod}</td></tr>`,
    `<tr><td style="padding:0 16px 12px;font-size:14px;color:#5f4836;"><strong>Placed At:</strong> ${escapeHtml(createdUtc)}</td></tr>`,
    "</table>",
    '<h2 style="margin:18px 0 10px;font-size:17px;color:#24190f;">Items in this shipment</h2>',
    `<ul style="margin:0;padding-left:20px;font-size:14px;color:#4e3a2a;">${itemRows || "<li>No items listed.</li>"}</ul>`,
    '<p style="margin:16px 0 0;font-size:14px;color:#5f4836;">Thank you for shopping with Curated Kadha.</p>',
    "</td></tr>",
    "</table>",
    "</td></tr>",
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

  const emailType = String(payload.email_type || "order_confirmed").trim().toLowerCase();
  const isShippedEmail = emailType === "shipped";
  const skipDbUpdates = Boolean(payload.skip_db_updates);
  const stripeSessionId = String(payload.stripe_session_id || "").trim();

  if (!isShippedEmail && !skipDbUpdates) {
    const paymentCheck = await isStripeSessionPaid(stripeSessionId);
    if (!paymentCheck.ok) {
      return json(400, { ok: false, error: `Payment not completed. ${paymentCheck.reason}` });
    }
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

  const supabase = getSupabaseClient();
  if (!isShippedEmail && !skipDbUpdates && supabase) {
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("order_id")
      .eq("order_id", String(payload.order_id))
      .limit(1);

    if (Array.isArray(existingOrder) && existingOrder.length > 0) {
      return json(200, { ok: true, order_id: payload.order_id, already_processed: true });
    }
  }

  const soldOutWarnings = [];

  if (!isShippedEmail && !skipDbUpdates && supabase) {
    try {
      const { error: insertError } = await supabase.from("orders").insert([{
        order_id: String(payload.order_id),
        customer_name: String(payload.customer_name),
        customer_email: toEmail,
        customer_phone: String(payload.customer_phone),
        address: String(payload.address),
        items: payload.items || [],
        items_total: Number(payload.items_total || payload.total || 0),
        shipping_method: String(payload.shipping_method || "Standard Shipping"),
        shipping_cost: Number(payload.shipping_cost || 0),
        total: Number(payload.total || 0),
        status: "completed",
        created_at: payload.created_utc || new Date().toISOString()
      }]);

      if (insertError) {
        if (String(insertError.code || "") === "23505") {
          return json(200, { ok: true, order_id: payload.order_id, already_processed: true });
        }
        throw insertError;
      }

      // Stock is adjusted only after payment is confirmed and the order insert succeeds.
      const itemsList = Array.isArray(payload.items) ? payload.items : [];
      for (const item of itemsList) {
        const groupId = item.group_id;
        const orderedQty = Number(item.qty || 1);
        const orderedSize = String(item.size || "").trim().toUpperCase();

        if (!groupId) continue;

        const { data: currentProduct, error: fetchErr } = await supabase
          .from("product_info")
          .select("group_id, title, item_count, sold_sizes, caption_has_sold")
          .eq("group_id", groupId)
          .single();

        if (fetchErr || !currentProduct) continue;

        const newCount = Math.max(0, Number(currentProduct.item_count || 1) - orderedQty);
        let currentSoldSizes = String(currentProduct.sold_sizes || "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean);

        if (orderedSize && !currentSoldSizes.includes(orderedSize)) {
          currentSoldSizes.push(orderedSize);
        }

        const isNowSoldOut = newCount === 0;
        if (isNowSoldOut) {
          soldOutWarnings.push({
            title: currentProduct.title || item.title || groupId,
            group_id: groupId,
            size: orderedSize
          });
        }

        await supabase
          .from("product_info")
          .update({
            item_count: newCount,
            sold_sizes: currentSoldSizes.join(";"),
            caption_has_sold: isNowSoldOut ? true : currentProduct.caption_has_sold,
            updated_at: new Date().toISOString()
          })
          .eq("group_id", groupId);
      }
    } catch (dbErr) {
      console.error("Failed to update orders or inventory in Supabase:", dbErr);
      return json(500, { ok: false, error: "Could not finalize order in database." });
    }
  }

  const lines = Array.isArray(payload.items)
    ? payload.items.map((row) => `- ${row.title || "Item"} | qty ${Number(row.qty || 0)} | $${Number(row.line_total || 0).toFixed(2)}`)
    : [];

  const body = payload.body || (
    isShippedEmail
      ? [
        `Order ID: ${payload.order_id}`,
        `Customer: ${payload.customer_name}`,
        `Customer email: ${toEmail}`,
        "",
        "Good news: your order has been shipped.",
        "",
        "Items:",
        lines.join("\n")
      ].join("\n")
      : [
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
      ].join("\n")
  );
  const htmlBody = isShippedEmail ? buildShippedEmailHtml(payload, toEmail) : buildOrderEmailHtml(payload, toEmail);

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
    subject: isShippedEmail
      ? `Your Curated Kadha Order Has Shipped - ${payload.order_id}`
      : `Your Curated Kadha Order - ${payload.order_id}`,
    text: body,
    html: htmlBody
  };

  // Construct store owner notifications
  const storeOwnerEmail = process.env.ORDER_BCC_EMAIL || process.env.ORDER_SMTP_USER || smtpUser;

  const bccRecipients = [bccEmail].filter(Boolean);
  if (storeOwnerEmail && !bccRecipients.includes(storeOwnerEmail) && storeOwnerEmail !== toEmail) {
    bccRecipients.push(storeOwnerEmail);
  }

  if (bccRecipients.length > 0) {
    message.bcc = bccRecipients.join(", ");
  }

  if (!isShippedEmail && soldOutWarnings.length > 0) {
    const warningTextLines = [
      "",
      "⚠️ SOLD OUT WARNING ⚠️",
      "The following product(s) have reached 0 stock and are now marked as SOLD OUT:",
      ...soldOutWarnings.map((w) => `- ${w.title} (Group ID: ${w.group_id})${w.size ? ` [Size: ${w.size}]` : ""}`),
      ""
    ];
    message.text = message.text + "\n" + warningTextLines.join("\n");

    const warningHtml = `
      <div style="margin:20px 24px 0;padding:16px 20px;background:#fff2f0;border:1px solid #f5c4c0;border-radius:12px;color:#900c0c;">
        <strong style="font-size:16px;display:block;margin-bottom:8px;">⚠️ SOLD OUT WARNING</strong>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.5;">The following product(s) reached 0 quantity with this order and are now marked as <strong>SOLD OUT</strong>:</p>
        <ul style="margin:0;padding-left:20px;font-size:14px;">
          ${soldOutWarnings.map((w) => `<li><strong>${escapeHtml(w.title)}</strong> (${escapeHtml(w.group_id)}) ${w.size ? `[Size: ${escapeHtml(w.size)}]` : ""}</li>`).join("")}
        </ul>
      </div>
    `;
    message.html = message.html.replace("</table>\n    </td>\n    </tr>\n    </table>\n    </body>", warningHtml + "</table>\n    </td>\n    </tr>\n    </table>\n    </body>");
  }

  try {
    await transporter.sendMail(message);
    return json(200, { ok: true, order_id: payload.order_id, sent_to: toEmail });
  } catch (error) {
    return json(502, { ok: false, error: `Email send failed: ${error.message}` });
  }
};
