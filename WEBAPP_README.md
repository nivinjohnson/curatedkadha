# Curated Kadha Web App (HTML/CSS/JS)

This is a standalone browser-based web app.

## What is included

- Shop page with:
  - search, sold/active filters, size filters, sort
  - product cards with swipe image carousel
  - load more pagination
- Product detail page with:
  - full gallery
  - available/sold sizes
  - add to cart
- Cart/checkout page with:
  - quantity updates and cart total
  - secure email send from server-side relay to customer email
  - NZ-assisted delivery address inputs (city suggestions + postcode assist)
- Stock page with:
  - local login gate
  - catalog metrics
  - filterable stock table
  - product editing and parser preview
  - edits persisted in browser localStorage

## Notes

- SMTP credentials are kept on the relay server, not in browser JavaScript.
- Browser-only JavaScript cannot write changes back to Excel files in place.
- This app reads `product_info/product_catalog.xlsx` but stores cart and stock edits in localStorage.

## Secure Email Relay (recommended)

Use the included relay API so SMTP credentials stay server-side.

1. Install dependencies:

```powershell
pip install -r requirements.txt
```

2. Set environment variables from `.env.email.example`.

3. Start the relay API:

```powershell
python secure_email_api.py
```

4. Start the web app static server:

```powershell
python -m http.server 8000
```

When relay is running, checkout sends email through `/api/send-order-email` by default.
If relay is unavailable, checkout shows an error and does not place the order.

## Netlify production setup

This repository includes a Netlify Function at `netlify/functions/send-order-email.js` and a redirect in `netlify.toml`.

Result:
- Mail is sent from the address configured in `ORDER_FROM_EMAIL` (or `ORDER_SMTP_USER` if not set)
- Mail is sent to the customer email entered in checkout
- Curated Kadha receives a BCC copy (optional)

### Netlify secrets scanning note

Netlify blocks deploys if an environment variable value appears in repository files or build output.

To avoid failures:
- Do not place real SMTP usernames, hosts, passwords, or tokens in docs or committed files.
- Keep sample values generic in `.env.email.example`.
- Keep secrets only in Netlify environment variables.

This repo also includes a targeted false-positive exemption in `netlify.toml`:

```toml
[build.environment]
SECRETS_SCAN_OMIT_PATHS = "node_modules/nodemailer/lib/well-known/services.json"
```

Use omit paths only for known dependency false positives. Do not disable scanning globally.

## Hosting on platforms

For production hosting, deploy in either of these patterns:

1. Same domain (recommended):
- Host frontend and API on one domain.
- Keep frontend default API path: `/api/send-order-email`.

2. Split hosting (frontend + separate API host):
- Set runtime config in `index.html`:

```html
<script>
  window.CK_CONFIG = {
    secureOrderApiUrl: "https://your-api-host.example.com/api/send-order-email"
  };
</script>
```

- Set `ORDER_ALLOW_ORIGIN` on API to your frontend origin, for example:

```text
ORDER_ALLOW_ORIGIN=https://your-frontend-domain.example.com
```

Security checklist:
- Use HTTPS for frontend and API.
- Keep SMTP credentials only in server environment variables.
- Do not commit secrets to the repository.

## Run locally

Use a local static server from the workspace root so the browser can fetch the Excel file.

```powershell
python -m http.server 8000
```

Then open:

- http://localhost:8000

## Files added

- `index.html`
- `styles.css`
- `app.js`
- `WEBAPP_README.md`
- `secure_email_api.py`
- `.env.email.example`
- `netlify/functions/send-order-email.js`
- `netlify.toml`
- `package.json`
