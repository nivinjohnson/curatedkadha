import os
import smtplib
from email.message import EmailMessage
from flask import Flask, jsonify, request

app = Flask(__name__)


def env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default)).strip()


def require_env(name: str) -> str:
    value = env(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def add_cors_headers(response):
    allow_origin = env("ORDER_ALLOW_ORIGIN", "http://localhost:8000")
    response.headers["Access-Control-Allow-Origin"] = allow_origin
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return response


def format_items(items) -> str:
    if not isinstance(items, list) or not items:
        return "(No items provided)"

    lines = []
    for item in items:
        title = str(item.get("title", "Unknown item"))
        qty = item.get("qty", 0)
        line_total = item.get("line_total", 0)
        lines.append(f"- {title} | qty {qty} | ${float(line_total):.2f}")
    return "\n".join(lines)


def build_email_body(payload: dict) -> str:
    if payload.get("body"):
        return str(payload["body"])

    order_id = payload.get("order_id", "")
    name = payload.get("customer_name", "")
    customer_email = payload.get("customer_email", "")
    phone = payload.get("customer_phone", "")
    address = payload.get("address", "")
    total = float(payload.get("total", 0) or 0)
    items = format_items(payload.get("items", []))

    return "\n".join([
        f"Order ID: {order_id}",
        f"Customer: {name}",
        f"Customer email: {customer_email}",
        f"Phone: {phone}",
        f"Address: {address}",
        "",
        "Items:",
        items,
        "",
        f"Grand total: ${total:.2f}"
    ])


@app.route("/api/send-order-email", methods=["OPTIONS"])
def send_order_email_options():
    response = jsonify({"ok": True})
    return add_cors_headers(response)


@app.route("/api/send-order-email", methods=["POST"])
def send_order_email():
    payload = request.get_json(silent=True) or {}

    required_fields = ["order_id", "customer_name", "customer_email", "customer_phone", "address", "total", "items"]
    missing = [field for field in required_fields if field not in payload or payload[field] in (None, "")]
    if missing:
        response = jsonify({"ok": False, "error": f"Missing fields: {', '.join(missing)}"})
        response.status_code = 400
        return add_cors_headers(response)

    smtp_host = require_env("ORDER_SMTP_HOST")
    smtp_port = int(env("ORDER_SMTP_PORT", "465"))
    smtp_user = require_env("ORDER_SMTP_USER")
    smtp_pass = require_env("ORDER_SMTP_PASS")
    from_email = env("ORDER_FROM_EMAIL", smtp_user)
    to_email = str(payload.get("customer_email", "")).strip()
    bcc_email = env("ORDER_BCC_EMAIL", "")
    if "@" not in to_email:
        response = jsonify({"ok": False, "error": "customer_email must be a valid email address"})
        response.status_code = 400
        return add_cors_headers(response)

    order_id = str(payload.get("order_id", "order"))
    subject = f"Order confirmation: {order_id}"
    body = build_email_body(payload)

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = from_email
    message["To"] = to_email
    if bcc_email:
        message["Bcc"] = bcc_email
    message.set_content(body)

    try:
        with smtplib.SMTP_SSL(host=smtp_host, port=smtp_port, timeout=25) as server:
            server.login(smtp_user, smtp_pass)
            server.send_message(message)
    except Exception as exc:
        response = jsonify({"ok": False, "error": f"Email send failed: {exc}"})
        response.status_code = 502
        return add_cors_headers(response)

    response = jsonify({"ok": True, "order_id": order_id})
    return add_cors_headers(response)


if __name__ == "__main__":
    port = int(env("ORDER_API_PORT", "8787"))
    app.run(host="0.0.0.0", port=port, debug=False)
