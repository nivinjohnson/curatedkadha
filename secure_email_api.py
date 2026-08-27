import os
import smtplib
from html import escape
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


def money(value) -> str:
    return f"${float(value or 0):.2f}"


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


def build_email_html(payload: dict) -> str:
    order_id = escape(str(payload.get("order_id", "")))
    name = escape(str(payload.get("customer_name", "")))
    customer_email = escape(str(payload.get("customer_email", "")))
    phone = escape(str(payload.get("customer_phone", "")))
    address = escape(str(payload.get("address", "")))
    total = float(payload.get("total", 0) or 0)
    items = payload.get("items", []) if isinstance(payload.get("items", []), list) else []

    item_cards = []
    for item in items:
        title = escape(str(item.get("title", "Item")))
        qty = int(item.get("qty", 0) or 0)
        unit_price = float(item.get("price", 0) or 0)
        line_total = float(item.get("line_total", 0) or 0)
        image_url = escape(str(item.get("image_url", "")).strip())
        image_block = (
            f'<img src="{image_url}" alt="{title}" style="width:100%;max-width:180px;height:180px;object-fit:cover;border-radius:14px;border:1px solid #eadccc;display:block;" />'
            if image_url else
            '<div style="width:100%;max-width:180px;height:180px;border-radius:14px;border:1px solid #eadccc;background:#f6efe6;color:#8b6f4e;display:flex;align-items:center;justify-content:center;font-size:13px;">No image</div>'
        )
        item_cards.append(
            "<tr>"
            f"<td style=\"padding:14px 0;border-bottom:1px solid #f0e6d8;vertical-align:top;\">{image_block}</td>"
            "<td style=\"padding:14px 0 14px 14px;border-bottom:1px solid #f0e6d8;vertical-align:top;\">"
            f"<div style=\"font-size:16px;font-weight:700;color:#1c140d;\">{title}</div>"
            f"<div style=\"font-size:13px;color:#6e5440;margin-top:6px;\">Qty: {qty}</div>"
            f"<div style=\"font-size:13px;color:#6e5440;\">Unit price: {money(unit_price)}</div>"
            f"<div style=\"font-size:14px;color:#1c140d;font-weight:700;margin-top:8px;\">Line total: {money(line_total)}</div>"
            "</td>"
            "</tr>"
        )

    items_html = "".join(item_cards) if item_cards else "<tr><td style=\"padding:12px 0;color:#7a634d;\">No items listed.</td></tr>"

    return f"""
<!doctype html>
<html>and 
    <body style="margin:0;padding:0;background:#f7f2ea;font-family:Segoe UI,Arial,sans-serif;color:#2a2017;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#ffffff;border:1px solid #eadccc;border-radius:18px;overflow:hidden;">
                        <tr>
                            <td style="padding:22px 24px;background:linear-gradient(120deg,#e7d2b8,#f6e8d6);border-bottom:1px solid #eadccc;">
                                <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#7e6044;font-weight:700;">Curated Kadha</div>
                                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;color:#20150b;">Order Placed Successfully</h1>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:20px 24px 0;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #efe3d5;border-radius:12px;background:#fffaf4;">
                                    <tr><td style="padding:14px 16px;font-size:14px;color:#5f4836;"><strong style="color:#2a2017;">Order ID:</strong> {order_id}</td></tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:20px 24px 0;">
                                <h2 style="margin:0 0 10px;font-size:18px;color:#24190f;">Customer Details</h2>
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #efe3d5;border-radius:12px;">
                                    <tr><td style="padding:12px 16px;font-size:14px;color:#5f4836;"><strong style="color:#2a2017;">Name:</strong> {name}</td></tr>
                                    <tr><td style="padding:0 16px 12px;font-size:14px;color:#5f4836;"><strong style="color:#2a2017;">Email:</strong> {customer_email}</td></tr>
                                    <tr><td style="padding:0 16px 12px;font-size:14px;color:#5f4836;"><strong style="color:#2a2017;">Phone:</strong> {phone}</td></tr>
                                    <tr><td style="padding:0 16px 12px;font-size:14px;color:#5f4836;"><strong style="color:#2a2017;">Delivery Address:</strong> {address}</td></tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:20px 24px 0;">
                                <h2 style="margin:0 0 10px;font-size:18px;color:#24190f;">Order Items</h2>
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                    {items_html}
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:18px 24px 24px;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:2px dashed #eddcc7;padding-top:14px;">
                                    <tr>
                                        <td style="font-size:16px;color:#4a3729;"><strong>Grand Total</strong></td>
                                        <td align="right" style="font-size:20px;color:#20150b;"><strong>{money(total)}</strong></td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>
"""


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
    html_body = build_email_html(payload)

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = from_email
    message["To"] = to_email
    if bcc_email:
        message["Bcc"] = bcc_email
    message.set_content(body)
    message.add_alternative(html_body, subtype="html")

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

# End of secure email API script
