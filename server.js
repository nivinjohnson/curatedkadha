const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// -------------------------------------------------------------
// Helper Functions for Catalog & Email
// -------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  try {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  } catch (err) {
    console.warn("Error creating Supabase client:", err.message);
    return null;
  }
}

function parseImageFiles(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitSizes(text) {
  const SIZE_ORDER = ["FREE_SIZE", "XS", "S", "M", "L", "XL", "XXL", "3XL"];
  const tokens = String(text || "")
    .toUpperCase()
    .replace(/FREE\s*SIZE/g, "FREE_SIZE")
    .replace(/[^A-Z0-9_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const found = [];
  tokens.forEach((token) => {
    if (SIZE_ORDER.includes(token) && !found.includes(token)) {
      found.push(token);
    }
  });
  return found;
}

function categorizeDescription(description) {
  const lines = String(description || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const soldSizes = [];
  const sizeMentions = [];
  const cleanLines = [];
  const tags = [];

  const soldPattern = /(?:sold\s*out|sold|booking\s*done|booked)\s*[-:]?\s*([a-z0-9\s,/_]+)/i;

  lines.forEach((line) => {
    const lower = line.toLowerCase();
    const tagMatches = line.match(/#[a-z0-9_]+/gi);
    if (tagMatches) {
      tags.push(...tagMatches);
    }

    const soldMatch = line.match(soldPattern);
    if (soldMatch) {
      splitSizes(soldMatch[1]).forEach((size) => {
        if (!soldSizes.includes(size)) soldSizes.push(size);
        if (!sizeMentions.includes(size)) sizeMentions.push(size);
      });
      return;
    }

    if (lower.includes("sold out") || lower.includes("booking done") || lower.includes("booked")) {
      splitSizes(line).forEach((size) => {
        if (!soldSizes.includes(size)) soldSizes.push(size);
        if (!sizeMentions.includes(size)) sizeMentions.push(size);
      });
      return;
    }

    const lineSizes = splitSizes(line);
    if (lineSizes.length > 0) {
      lineSizes.forEach((size) => {
        if (!sizeMentions.includes(size)) sizeMentions.push(size);
      });
    }

    cleanLines.push(line);
  });

  return {
    dressDescription: cleanLines.join("\n"),
    sizeMentions: sizeMentions.join(";"),
    soldSizes: soldSizes.join(";"),
    tags: Array.from(new Set(tags)).join(" ")
  };
}

function pickFirstValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return String(row[key]).trim();
    }
  }
  return "";
}

function boolFromCell(val, defaultVal = false) {
  if (val === undefined || val === null || val === "") return defaultVal;
  if (typeof val === "boolean") return val;
  const s = String(val).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return defaultVal;
}

function computeDefaultPrice(title, description, tags, itemCount) {
  const text = `${title || ""} ${description || ""} ${tags || ""}`.toLowerCase();
  if (
    text.includes("dress") ||
    text.includes("coord") ||
    text.includes("co-ord") ||
    text.includes("set") ||
    text.includes("maxi") ||
    text.includes("gown") ||
    text.includes("anarkali") ||
    text.includes("kurta") ||
    text.includes("suit") ||
    text.includes("jacket") ||
    text.includes("skirt") ||
    Number(itemCount || 1) > 2
  ) {
    return 39;
  }
  return 29;
}

function normalizeInstagramRowsToCatalog(rows) {
  const groups = new Map();
  rows.forEach((row, index) => {
    const parentId = pickFirstValue(row, ["parent_media_id", "group_id", "id"]);
    const mediaId = pickFirstValue(row, ["media_id", "id"]) || `row-${index}`;
    const groupId = parentId || mediaId || `group-${index}`;

    if (!groups.has(groupId)) {
      groups.set(groupId, []);
    }
    groups.get(groupId).push(row);
  });

  const catalog = [];
  Array.from(groups.entries()).forEach(([groupId, groupRows], index) => {
    const first = groupRows[0] || {};
    const rawImageFiles = groupRows.flatMap((row) => {
      const directList = parseImageFiles(pickFirstValue(row, ["image_files", "image_file", "filename", "file_name"]));
      if (directList.length > 0) return directList;
      const mediaUrl = pickFirstValue(row, ["media_url", "url"]);
      return mediaUrl ? [mediaUrl] : [];
    });

    const imageFiles = Array.from(new Set(rawImageFiles));
    const primaryImage = pickFirstValue(first, ["primary_image_file"]) || imageFiles[0] || "";
    const titleFromSheet = pickFirstValue(first, ["title", "product_title", "name"]);
    const description = pickFirstValue(first, ["description", "caption"]);

    const hasPreParsedFields = Boolean(
      pickFirstValue(first, ["dress_description"]) ||
      pickFirstValue(first, ["size_mentions"]) ||
      pickFirstValue(first, ["sold_sizes"]) ||
      pickFirstValue(first, ["tags"])
    );

    const parsed = hasPreParsedFields
      ? { dressDescription: "", sizeMentions: "", soldSizes: "", tags: "" }
      : categorizeDescription(description);

    const firstCaptionLine = description.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || "";
    const fallbackTitle = parsed.dressDescription.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || firstCaptionLine;
    const title = titleFromSheet || fallbackTitle || `Product ${index + 1}`;

    const dateRaw = pickFirstValue(first, ["product_date", "timestamp", "date"]);

    catalog.push({
      group_id: groupId,
      title,
      description,
      dress_description: pickFirstValue(first, ["dress_description"]) || parsed.dressDescription,
      size_mentions: pickFirstValue(first, ["size_mentions"]) || parsed.sizeMentions,
      sold_sizes: pickFirstValue(first, ["sold_sizes"]) || parsed.soldSizes,
      tags: pickFirstValue(first, ["tags"]) || parsed.tags,
      primary_image_file: primaryImage,
      image_files: imageFiles.join(";"),
      permalink: pickFirstValue(first, ["permalink", "post_url", "url"]),
      product_type: pickFirstValue(first, ["product_type", "media_type"]) || "IMAGE",
      product_date: dateRaw ? new Date(dateRaw).toISOString() : new Date().toISOString(),
      price: Number(pickFirstValue(first, ["price"])) || computeDefaultPrice(title, description, pickFirstValue(first, ["tags"]) || parsed.tags, imageFiles.length),
      caption_has_sold: boolFromCell(first.caption_has_sold, false),
      item_count: Number(pickFirstValue(first, ["item_count"]) || imageFiles.length || 1),
      active: boolFromCell(first.active, true)
    });
  });

  return catalog;
}

function loadLocalExcelCatalog() {
  const catalogPath = path.join(__dirname, "product_info", "product_catalog.xlsx");
  if (!fs.existsSync(catalogPath)) {
    return [];
  }
  const workbook = XLSX.readFile(catalogPath);
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });

  return rows.map((row, index) => {
    const groupId = String(row.group_id || row.parent_media_id || row.record_id || `item-${index}`).trim();
    const imageFiles = String(row.image_files || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);
    const primaryImage = String(row.primary_image_file || imageFiles[0] || "").trim();

    const hasPreParsedFields = Boolean(
      String(row.dress_description || "").trim() ||
      String(row.size_mentions || "").trim() ||
      String(row.sold_sizes || "").trim() ||
      String(row.tags || "").trim()
    );
    const parsed = hasPreParsedFields ? null : categorizeDescription(String(row.description || ""));

    let productDate = "";
    if (row.product_date) {
      if (typeof row.product_date === "number") {
        const parsedDate = XLSX.SSF.parse_date_code(row.product_date);
        if (parsedDate) {
          productDate = new Date(Date.UTC(parsedDate.y, parsedDate.m - 1, parsedDate.d)).toISOString();
        }
      } else {
        const d = new Date(row.product_date);
        productDate = Number.isNaN(d.getTime()) ? "" : d.toISOString();
      }
    }

    return {
      group_id: groupId,
      title: String(row.title || "Untitled product").trim() || "Untitled product",
      description: String(row.description || ""),
      dress_description: String(row.dress_description || parsed?.dressDescription || ""),
      size_mentions: String(row.size_mentions || parsed?.sizeMentions || ""),
      sold_sizes: String(row.sold_sizes || parsed?.soldSizes || ""),
      tags: String(row.tags || parsed?.tags || ""),
      primary_image_file: primaryImage,
      image_files: imageFiles,
      permalink: String(row.permalink || ""),
      product_type: String(row.product_type || "IMAGE"),
      product_date: productDate,
      price: Number(row.price || 0),
      caption_has_sold: boolFromCell(row.caption_has_sold, false),
      item_count: Number(row.item_count || imageFiles.length || 1),
      active: boolFromCell(row.active, true)
    };
  });
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

function buildOrderEmailHtml(payload, toEmail) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const itemRows = items
    .map((row) => {
      const title = escapeHtml(row.title || "Item");
      const qty = Number(row.qty || 0);
      const unitPrice = Number(row.price || 0);
      const lineTotal = Number(row.line_total || 0);
      const imageUrl = String(row.image_url || "").trim();
      const imageBlock = imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${title}" style="width:100%;max-width:120px;height:120px;object-fit:cover;border-radius:12px;border:1px solid #eadccc;display:block;" />`
        : '<div style="width:100%;max-width:120px;height:120px;border-radius:12px;border:1px solid #eadccc;background:#f6efe6;color:#8b6f4e;display:flex;align-items:center;justify-content:center;font-size:12px;">No image</div>';

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
    })
    .join("");

  const orderId = escapeHtml(payload.order_id || "");
  const createdUtc = escapeHtml(payload.created_utc || new Date().toUTCString());
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
    '<p style="margin:10px 0 0;font-size:14px;color:#5b4636;">Order details are sent to your email.</p>',
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
  const itemRows = items
    .map((row) => {
      const title = escapeHtml(row.title || "Item");
      const size = escapeHtml(row.size || "");
      const qty = Number(row.qty || 0);
      return `<li style="margin:0 0 6px;">${title}${size ? ` (Size: ${size})` : ""} x ${qty}</li>`;
    })
    .join("");

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

// -------------------------------------------------------------
// API Endpoints
// -------------------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GET /api/product-catalog
app.get("/api/product-catalog", async (req, res) => {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("product_info")
        .select("*")
        .order("product_date", { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        const products = data.map((row) => ({
          group_id: row.group_id,
          title: row.title || "Untitled product",
          description: row.description || "",
          dress_description: row.dress_description || "",
          size_mentions: row.size_mentions || "",
          sold_sizes: row.sold_sizes || "",
          tags: row.tags || "",
          primary_image_file: row.primary_image_file || "",
          image_files: parseImageFiles(row.image_files),
          permalink: row.permalink || "",
          product_type: row.product_type || "IMAGE",
          product_date: row.product_date || "",
          price: Number(row.price || 0),
          caption_has_sold: Boolean(row.caption_has_sold),
          item_count: Number(row.item_count || 1),
          active: Boolean(row.active)
        }));
        return res.json({ ok: true, products });
      }
    } catch (err) {
      console.warn("Supabase fetch failed, using local excel:", err.message);
    }
  }

  // Fallback to local catalog Excel
  try {
    const products = loadLocalExcelCatalog();
    return res.json({ ok: true, products });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/product-catalog (Excel sync & upload: non-destructive, insert-only)
app.post("/api/product-catalog", (req, res) => handleCatalogSave(req, res, { insertOnly: true }));

// PUT /api/product-catalog (Explicit manual edits from Studio)
app.put("/api/product-catalog", (req, res) => handleCatalogSave(req, res, { insertOnly: false }));

async function handleCatalogSave(req, res, options = {}) {
  const body = req.body || {};

  if (body.mode === "update") {
    const groupId = String(body.group_id || "").trim();
    const product = body.product;
    if (!groupId) {
      return res.status(400).json({ ok: false, error: "A group_id is required to update a product." });
    }
    if (!product || typeof product !== "object" || Array.isArray(product)) {
      return res.status(400).json({ ok: false, error: "A valid product object is required." });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({ ok: false, error: "Supabase is not configured for DB updates." });
    }

    const parsedProductDate = product.product_date ? new Date(product.product_date) : null;
    const safeProductDate = parsedProductDate && !Number.isNaN(parsedProductDate.getTime())
      ? parsedProductDate.toISOString()
      : null;

    const updatePayload = {
      title: String(product.title || "").trim() || "Untitled product",
      description: String(product.description || ""),
      dress_description: String(product.dress_description || ""),
      size_mentions: String(product.size_mentions || ""),
      sold_sizes: String(product.sold_sizes || ""),
      tags: String(product.tags || ""),
      primary_image_file: String(product.primary_image_file || ""),
      image_files: Array.isArray(product.image_files) ? product.image_files.join(";") : String(product.image_files || ""),
      permalink: String(product.permalink || ""),
      product_type: String(product.product_type || "IMAGE"),
      product_date: safeProductDate,
      price: Number(product.price || 0),
      caption_has_sold: Boolean(product.caption_has_sold),
      item_count: Number(product.item_count || 0),
      active: Boolean(product.active)
    };

    if (!Number.isFinite(updatePayload.item_count)) {
      return res.status(400).json({ ok: false, error: "Item count must be a valid number." });
    }
    if (!Number.isFinite(updatePayload.price)) {
      return res.status(400).json({ ok: false, error: "Price must be a valid number." });
    }

    try {
      const { data: rows, error: lookupErr } = await supabase.from("product_info").select("group_id");
      if (lookupErr) return res.status(500).json({ ok: false, error: lookupErr.message });

      const normalized = groupId.toLowerCase();
      const found = (rows || []).find((row) => String(row.group_id || "").trim().toLowerCase() === normalized);
      if (!found) {
        return res.status(404).json({ ok: false, error: `No product found for group_id "${groupId}".` });
      }

      const dbGroupId = String(found.group_id);
      const { data, error } = await supabase
        .from("product_info")
        .update(updatePayload)
        .eq("group_id", dbGroupId)
        .select();

      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, count: data?.length || 0, product: data?.[0] || null, matched_group_id: dbGroupId });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  if (body.mode === "delete") {
    const groupId = String(body.group_id || "").trim();
    if (!groupId) {
      return res.status(400).json({ ok: false, error: "A group_id is required to delete a product." });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({ ok: false, error: "Supabase is not configured for DB deletes." });
    }

    try {
      const { data: rows, error: lookupErr } = await supabase.from("product_info").select("group_id");
      if (lookupErr) return res.status(500).json({ ok: false, error: lookupErr.message });

      const normalized = groupId.toLowerCase();
      const found = (rows || []).find((row) => String(row.group_id || "").trim().toLowerCase() === normalized);
      if (!found) {
        return res.status(404).json({ ok: false, error: `No product found for group_id "${groupId}".` });
      }

      const dbGroupId = String(found.group_id);
      const { error } = await supabase.from("product_info").delete().eq("group_id", dbGroupId);
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, deleted: true, matched_group_id: dbGroupId });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  const isInsertOnly = options.insertOnly || body.mode === "insert_only" || body.source === "excel";
  let incomingProducts = [];

  if (body.source === "excel" || body.source === "catalog") {
    incomingProducts = loadLocalExcelCatalog();
  } else if (body.source === "instagram") {
    const instaFilePath = path.join(__dirname, "data_from_insta", "instagram_media_curatedkadha_20260822_043644.xlsx");
    if (!fs.existsSync(instaFilePath)) {
      return res.status(404).json({ ok: false, error: `Instagram source file not found at ${instaFilePath}` });
    }
    const workbook = XLSX.readFile(instaFilePath);
    const firstSheet = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });
    incomingProducts = normalizeInstagramRowsToCatalog(rows);
  } else if (Array.isArray(body.products)) {
    incomingProducts = body.products.map((p) => ({
      ...p,
      image_files: Array.isArray(p.image_files) ? p.image_files.join(";") : String(p.image_files || "")
    }));
  } else {
    return res.status(400).json({ ok: false, error: "Invalid request payload. Provide 'products' array or 'source': 'excel'." });
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (isInsertOnly) {
        // Fetch existing group_ids from Supabase so we NEVER edit existing products
        const { data: existingRows, error: fetchErr } = await supabase
          .from("product_info")
          .select("group_id");

        if (fetchErr) {
          return res.status(500).json({ ok: false, error: fetchErr.message });
        }

        const existingSet = new Set((existingRows || []).map((r) => String(r.group_id)));
        const newProducts = incomingProducts.filter((p) => !existingSet.has(String(p.group_id)));

        if (newProducts.length > 0) {
          const { data, error } = await supabase
            .from("product_info")
            .insert(newProducts)
            .select();

          if (error) {
            return res.status(500).json({ ok: false, error: error.message });
          }

          return res.json({
            ok: true,
            insertedCount: newProducts.length,
            skippedCount: incomingProducts.length - newProducts.length,
            totalExisting: existingSet.size,
            products: data,
            message: `Inserted ${newProducts.length} new products. Preserved ${incomingProducts.length - newProducts.length} existing products without modifications.`
          });
        } else {
          return res.json({
            ok: true,
            insertedCount: 0,
            skippedCount: incomingProducts.length,
            totalExisting: existingSet.size,
            products: [],
            message: "All products already exist in database. Existing products were preserved without modifications."
          });
        }
      } else {
        // Explicit manual edit (PUT)
        const { data, error } = await supabase
          .from("product_info")
          .upsert(incomingProducts, { onConflict: "group_id" })
          .select();

        if (error) {
          return res.status(500).json({ ok: false, error: error.message });
        }
        return res.json({ ok: true, count: data.length, products: data });
      }
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // Local Excel handling (when Supabase is not configured):
  try {
    const catalogPath = path.join(__dirname, "product_info", "product_catalog.xlsx");
    const currentLocal = loadLocalExcelCatalog();
    const currentMap = new Map(currentLocal.map((p) => [String(p.group_id), p]));

    if (isInsertOnly) {
      let newCount = 0;
      incomingProducts.forEach((p) => {
        if (!currentMap.has(String(p.group_id))) {
          currentMap.set(String(p.group_id), p);
          newCount++;
        }
      });
      const mergedList = Array.from(currentMap.values());
      const outWorkbook = XLSX.utils.book_new();
      const outSheet = XLSX.utils.json_to_sheet(mergedList);
      XLSX.utils.book_append_sheet(outWorkbook, outSheet, "catalog");
      XLSX.writeFile(outWorkbook, catalogPath);

      return res.json({
        ok: true,
        insertedCount: newCount,
        skippedCount: incomingProducts.length - newCount,
        total: mergedList.length,
        note: `Preserved existing records. Added ${newCount} new products to local catalog.`
      });
    } else {
      incomingProducts.forEach((p) => {
        currentMap.set(String(p.group_id), p);
      });
      const mergedList = Array.from(currentMap.values());
      const outWorkbook = XLSX.utils.book_new();
      const outSheet = XLSX.utils.json_to_sheet(mergedList);
      XLSX.utils.book_append_sheet(outWorkbook, outSheet, "catalog");
      XLSX.writeFile(outWorkbook, catalogPath);

      return res.json({ ok: true, count: incomingProducts.length, note: "Saved to local catalog" });
    }
  } catch (excelErr) {
    console.warn("Could not save to local Excel file:", excelErr.message);
  }

  return res.json({ ok: true, count: incomingProducts.length, products: incomingProducts, note: "Processed" });
}

// POST /api/send-order-email
app.post("/api/send-order-email", async (req, res) => {
  const payload = req.body || {};

  const requiredFields = ["order_id", "customer_name", "customer_email", "customer_phone", "address", "total", "items"];
  const missing = requiredFields.filter((field) => !(field in payload) || payload[field] === "" || payload[field] === null);
  if (missing.length > 0) {
    return res.status(400).json({ ok: false, error: `Missing fields: ${missing.join(", ")}` });
  }

  const toEmail = String(payload.customer_email || "").trim();
  if (!toEmail || !toEmail.includes("@")) {
    return res.status(400).json({ ok: false, error: "customer_email must be a valid email address" });
  }

  const emailType = String(payload.email_type || "order_confirmed").trim().toLowerCase();
  const isShippedEmail = emailType === "shipped";

  const smtpHost = process.env.ORDER_SMTP_HOST;
  const smtpPort = Number(process.env.ORDER_SMTP_PORT || 465);
  const smtpUser = process.env.ORDER_SMTP_USER;
  const smtpPass = process.env.ORDER_SMTP_PASS;
  const fromEmail = process.env.ORDER_FROM_EMAIL || smtpUser;
  const bccEmail = process.env.ORDER_BCC_EMAIL || "";

  if (!smtpHost || !smtpUser || !smtpPass) {
    // When SMTP credentials are not yet configured in environment variables
    console.log(`[Order Placed - Mock Email] Order ${payload.order_id} for ${payload.customer_name} (${toEmail}) Total: $${payload.total}`);
    return res.json({
      ok: true,
      order_id: payload.order_id,
      sent_to: toEmail,
      mock: true,
      message: "Order placed successfully! (Configure ORDER_SMTP_* environment variables for live SMTP email delivery)"
    });
  }

  const lines = Array.isArray(payload.items)
    ? payload.items.map((row) => `- ${row.title || "Item"} | qty ${Number(row.qty || 0)} | $${Number(row.line_total || 0).toFixed(2)}`)
    : [];

  const body = payload.body || [
    ...(isShippedEmail
      ? [
        `Order ID: ${payload.order_id}`,
        `Customer: ${payload.customer_name}`,
        `Customer email: ${toEmail}`,
        "",
        "Good news: your order has been shipped.",
        "",
        "Items:",
        lines.join("\n")
      ]
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
      ])
  ].join("\n");
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

  if (bccEmail) {
    message.bcc = bccEmail;
  }

  try {
    await transporter.sendMail(message);
    return res.json({ ok: true, order_id: payload.order_id, sent_to: toEmail });
  } catch (error) {
    return res.status(502).json({ ok: false, error: `Email send failed: ${error.message}` });
  }
});

// -------------------------------------------------------------
// Serve Static Frontend Assets & Fallback
// -------------------------------------------------------------
app.use(express.static(__dirname));

app.get("*all", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Curated Kadha server running on http://0.0.0.0:${PORT}`);
});
