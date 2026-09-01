const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json(200, {});
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return json(500, { ok: false, error: "Stripe API key is not configured in environment variables (STRIPE_SECRET_KEY missing)." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const { items, shipping_cost, customer_email, order_payload } = payload;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return json(400, { ok: false, error: "Items array is required" });
  }

  try {
    const origin = event.headers.origin || event.headers.referer || "http://localhost:8000";

    const lineItems = items.map((item) => {
      const title = String(item.title || "Product");
      const sizeStr = item.size ? ` (Size: ${item.size})` : "";
      const priceInCents = Math.round(Number(item.price || 0) * 100);

      return {
        price_data: {
          currency: "nzd",
          product_data: {
            name: `${title}${sizeStr}`,
            images: item.image_url ? [item.image_url] : []
          },
          unit_amount: priceInCents
        },
        quantity: Math.max(1, Number(item.qty || 1))
      };
    });

    if (shipping_cost && Number(shipping_cost) > 0) {
      lineItems.push({
        price_data: {
          currency: "nzd",
          product_data: {
            name: `Shipping Fee (${order_payload?.shipping_method || "Delivery"})`
          },
          unit_amount: Math.round(Number(shipping_cost) * 100)
        },
        quantity: 1
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      customer_email: customer_email || undefined,
      success_url: `${origin}/#/shop?session_id={CHECKOUT_SESSION_ID}&order_success=1`,
      cancel_url: `${origin}/#/cart`,
      metadata: {
        order_id: String(order_payload?.order_id || ""),
        customer_name: String(order_payload?.customer_name || ""),
        customer_phone: String(order_payload?.customer_phone || "")
      }
    });

    const supabase = getSupabaseClient();
    if (supabase) {
      const { error: orderInsertError } = await supabase.from("orders").insert([{
        order_id: String(order_payload?.order_id || ""),
        customer_name: String(order_payload?.customer_name || ""),
        customer_email: String(customer_email || ""),
        customer_phone: String(order_payload?.customer_phone || ""),
        address: String(order_payload?.address || ""),
        items: Array.isArray(order_payload?.items) ? order_payload.items : [],
        items_total: Number(order_payload?.items_total || order_payload?.total || 0),
        shipping_method: String(order_payload?.shipping_method || "Standard Shipping"),
        shipping_cost: Number(order_payload?.shipping_cost || shipping_cost || 0),
        total: Number(order_payload?.total || 0),
        status: "pending_payment",
        created_at: order_payload?.created_utc || new Date().toISOString()
      }]);

      if (orderInsertError) {
        if (String(orderInsertError.code || "") === "23505") {
          return json(409, { ok: false, error: "Duplicate order ID. Please place the order again." });
        }
        console.error("Failed to persist pending order before Stripe redirect:", orderInsertError);
        return json(500, { ok: false, error: "Could not save pending order. Please try again." });
      }
    }

    return json(200, { ok: true, url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("Stripe Session Creation Error:", error);
    return json(500, { ok: false, error: error.message });
  }
};
