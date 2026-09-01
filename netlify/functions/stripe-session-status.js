const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require("@supabase/supabase-js");

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
      order_status: orderStatus
    });
  } catch (err) {
    return json(500, { ok: false, error: err.message || "Could not retrieve session status" });
  }
};
