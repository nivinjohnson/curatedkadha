const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require("@supabase/supabase-js");
const { handler: sendOrderEmailHandler } = require("./send-order-email");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function buildOrderEmailPayloadFromRecord(order) {
  if (!order || typeof order !== "object") return null;
  const normalizedItems = Array.isArray(order.items)
    ? order.items.map((item) => {
      const normalized = item && typeof item === "object" ? { ...item } : {};
      if (!normalized.image_url && normalized.image) {
        normalized.image_url = String(normalized.image);
      }
      return normalized;
    })
    : [];

  return {
    order_id: String(order.order_id || "").trim(),
    created_utc: order.created_at || new Date().toISOString(),
    customer_name: String(order.customer_name || ""),
    customer_email: String(order.customer_email || ""),
    customer_phone: String(order.customer_phone || ""),
    address: String(order.address || ""),
    items_total: Number(order.items_total || order.total || 0),
    shipping_method: String(order.shipping_method || "Standard Shipping"),
    shipping_cost: Number(order.shipping_cost || 0),
    total: Number(order.total || 0),
    items: normalizedItems,
    skip_db_updates: true
  };
}

function fromBase64Utf8(value) {
  try {
    return Buffer.from(String(value || ""), "base64").toString("utf8");
  } catch {
    return "";
  }
}

function decodeOrderPayloadFromSessionMetadata(session) {
  const metadata = session && session.metadata ? session.metadata : {};
  const count = Number(metadata.order_payload_chunk_count || 0);
  if (!count || count < 1) return null;

  let base64 = "";
  for (let i = 1; i <= count; i += 1) {
    base64 += String(metadata[`order_payload_chunk_${i}`] || "");
  }

  if (!base64) return null;

  try {
    const parsed = JSON.parse(fromBase64Utf8(base64));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function buildOrderEmailPayloadFromSession(checkoutSession) {
  const decoded = decodeOrderPayloadFromSessionMetadata(checkoutSession);
  if (!decoded) return null;

  const fallbackEmail = String(
    (checkoutSession && checkoutSession.customer_details && checkoutSession.customer_details.email)
      || checkoutSession.customer_email
      || ""
  ).trim();

  return {
    order_id: String(decoded.order_id || (checkoutSession && checkoutSession.id) || "").trim(),
    created_utc: decoded.created_utc || new Date().toISOString(),
    customer_name: String(decoded.customer_name || ""),
    customer_email: String(decoded.customer_email || fallbackEmail),
    customer_phone: String(decoded.customer_phone || ""),
    address: String(decoded.address || ""),
    items_total: Number(decoded.items_total || decoded.total || 0),
    shipping_method: String(decoded.shipping_method || "Standard Shipping"),
    shipping_cost: Number(decoded.shipping_cost || 0),
    total: Number(decoded.total || 0),
    items: Array.isArray(decoded.items) ? decoded.items : [],
    skip_db_updates: true
  };
}

async function applyStockAdjustments(supabase, items) {
  const itemsList = Array.isArray(items) ? items : [];

  for (const item of itemsList) {
    const groupId = item.group_id;
    const orderedQty = Number(item.qty || 1);
    const orderedSize = String(item.size || "").trim().toUpperCase();

    if (!groupId) continue;

    const { data: currentProduct, error: fetchErr } = await supabase
      .from("product_info")
      .select("group_id, item_count, sold_sizes, caption_has_sold")
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

    const { error: stockUpdateError } = await supabase
      .from("product_info")
      .update({
        item_count: newCount,
        sold_sizes: currentSoldSizes.join(";"),
        caption_has_sold: newCount === 0 ? true : currentProduct.caption_has_sold,
        updated_at: new Date().toISOString()
      })
      .eq("group_id", groupId);

    if (stockUpdateError) {
      throw stockUpdateError;
    }
  }
}

async function finalizePaidSession(checkoutSession) {
  const orderId = String((checkoutSession.metadata && checkoutSession.metadata.order_id) || "").trim();
  const supabase = getSupabaseClient();

  let order = null;
  if (supabase && orderId) {
    const { data: foundOrder } = await supabase
      .from("orders")
      .select("order_id, customer_name, customer_email, customer_phone, address, items, items_total, shipping_method, shipping_cost, total, status, created_at")
      .eq("order_id", orderId)
      .single();

    if (foundOrder) {
      order = foundOrder;
      const currentStatus = String(foundOrder.status || "").toLowerCase();
      if (currentStatus === "completed" || currentStatus === "shipped") {
        return { finalized: true, already_processed: true, order_id: foundOrder.order_id || orderId, stock_updated: true };
      }
    }
  }

  const emailPayload = order
    ? buildOrderEmailPayloadFromRecord(order)
    : buildOrderEmailPayloadFromSession(checkoutSession);

  if (!emailPayload || !emailPayload.customer_email) {
    return { finalized: false, reason: "Insufficient order data to send confirmation email" };
  }

  const emailResponse = await sendOrderEmailHandler({
    httpMethod: "POST",
    body: JSON.stringify(emailPayload)
  });

  if (!emailResponse || Number(emailResponse.statusCode || 500) >= 400) {
    const text = emailResponse && emailResponse.body ? String(emailResponse.body) : "Unknown email error";
    throw new Error(`Could not send confirmation email: ${text}`);
  }

  if (!supabase) {
    return {
      finalized: true,
      email_sent: true,
      stock_updated: false,
      order_id: emailPayload.order_id || orderId,
      warning: "Supabase service client is not configured; stock was not updated."
    };
  }

  const itemsForStock = Array.isArray(emailPayload.items) ? emailPayload.items : [];
  await applyStockAdjustments(supabase, itemsForStock);

  if (order) {
    const { error: statusUpdateError } = await supabase
      .from("orders")
      .update({ status: "completed" })
      .eq("order_id", order.order_id);
    if (statusUpdateError) throw statusUpdateError;
  } else {
    const fallbackOrderId = String(emailPayload.order_id || orderId || checkoutSession.id || "").trim();
    const { error: insertError } = await supabase.from("orders").insert([{
      order_id: fallbackOrderId,
      customer_name: String(emailPayload.customer_name || ""),
      customer_email: String(emailPayload.customer_email || ""),
      customer_phone: String(emailPayload.customer_phone || ""),
      address: String(emailPayload.address || ""),
      items: itemsForStock,
      items_total: Number(emailPayload.items_total || emailPayload.total || 0),
      shipping_method: String(emailPayload.shipping_method || "Standard Shipping"),
      shipping_cost: Number(emailPayload.shipping_cost || 0),
      total: Number(emailPayload.total || 0),
      status: "completed",
      created_at: emailPayload.created_utc || new Date().toISOString()
    }]);

    if (insertError && String(insertError.code || "") !== "23505") {
      throw insertError;
    }
  }

  return {
    finalized: true,
    email_sent: true,
    stock_updated: true,
    order_id: String(emailPayload.order_id || orderId || "").trim()
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json(200, {});
  }

  if (event.httpMethod !== "GET") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return json(500, { ok: false, error: "STRIPE_SECRET_KEY is missing" });
  }

  const params = event.queryStringParameters || {};
  const sessionId = String(params.session_id || "").trim();
  if (!sessionId) {
    return json(400, { ok: false, error: "session_id is required" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid = session && session.payment_status === "paid";
    const orderId = String((session && session.metadata && session.metadata.order_id) || "").trim();

    let finalizeResult = null;
    if (paid) {
      try {
        finalizeResult = await finalizePaidSession(session);
      } catch (fulfillmentErr) {
        return json(500, {
          ok: false,
          paid,
          order_id: orderId,
          error: fulfillmentErr.message || "Could not finalize paid order"
        });
      }
    }

    let orderStatus = "";
    const supabase = getSupabaseClient();
    if (supabase && orderId) {
      const { data: order } = await supabase
        .from("orders")
        .select("status")
        .eq("order_id", orderId)
        .single();
      orderStatus = String((order && order.status) || "");
    }

    return json(200, {
      ok: true,
      session_id: sessionId,
      paid,
      order_id: orderId,
      order_status: orderStatus,
      finalize: finalizeResult
    });
  } catch (err) {
    return json(500, { ok: false, error: err.message || "Could not retrieve session status" });
  }
};
