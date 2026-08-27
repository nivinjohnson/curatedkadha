const { createClient } = require("@supabase/supabase-js");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function parseImageFiles(value) {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(";")
    .map(part => part.trim())
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
  tokens.forEach(token => {
    if (SIZE_ORDER.includes(token) && !found.includes(token)) {
      found.push(token);
    }
  });
  return found;
}

function categorizeDescription(description) {
  const lines = String(description || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const soldSizes = [];
  const sizeMentions = [];
  const cleanLines = [];
  const tags = [];

  const soldPattern = /(?:sold\s*out|sold|booking\s*done|booked)\s*[-:]?\s*([a-z0-9\s,/_]+)/i;

  lines.forEach(line => {
    const lower = line.toLowerCase();
    const tagMatches = line.match(/#[a-z0-9_]+/gi);
    if (tagMatches) {
      tags.push(...tagMatches);
    }

    const soldMatch = line.match(soldPattern);
    if (soldMatch) {
      splitSizes(soldMatch[1]).forEach(size => {
        if (!soldSizes.includes(size)) soldSizes.push(size);
        if (!sizeMentions.includes(size)) sizeMentions.push(size);
      });
      return;
    }

    if (lower.includes("sold out") || lower.includes("booking done") || lower.includes("booked")) {
      splitSizes(line).forEach(size => {
        if (!soldSizes.includes(size)) soldSizes.push(size);
        if (!sizeMentions.includes(size)) sizeMentions.push(size);
      });
      return;
    }

    const lineSizes = splitSizes(line);
    if (lineSizes.length > 0) {
      lineSizes.forEach(size => {
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
    const rawImageFiles = groupRows.flatMap(row => {
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

    const firstCaptionLine = description.split(/\r?\n/).map(l => l.trim()).find(Boolean) || "";
    const fallbackTitle = parsed.dressDescription.split(/\r?\n/).map(l => l.trim()).find(Boolean) || firstCaptionLine;
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
  const catalogPath = path.join(process.cwd(), "product_info/product_catalog.xlsx");
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
      image_files: imageFiles.join(";"),
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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS"
      },
      body: ""
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return json(500, { ok: false, error: "Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are missing." });
  }

  // GET: Fetch catalog from Supabase
  if (event.httpMethod === "GET") {
    try {
      const { data, error } = await supabase
        .from("product_info")
        .select("*")
        .order("product_date", { ascending: false });

      if (error) {
        return json(500, { ok: false, error: error.message });
      }

      // Format data to match app structure
      const products = (data || []).map(row => ({
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

      return json(200, { ok: true, products });
    } catch (err) {
      return json(500, { ok: false, error: err.message });
    }
  }

  // POST: Sync/Insert new Products into Supabase (insert-only, preserves existing records)
  // PUT: Update/Upsert Products into Supabase (explicit edits)
  if (event.httpMethod === "POST" || event.httpMethod === "PUT") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { ok: false, error: "Invalid JSON body" });
    }

    const isInsertOnly = event.httpMethod === "POST" || body.mode === "insert_only" || body.source === "excel";
    let incomingProducts = [];

    if (body.source === "excel" || body.source === "catalog") {
      incomingProducts = loadLocalExcelCatalog();
    } else if (body.source === "instagram") {
      const instaFilePath = path.join(process.cwd(), "data_from_insta/instagram_media_curatedkadha_20260822_043644.xlsx");
      if (!fs.existsSync(instaFilePath)) {
        return json(404, { ok: false, error: `Instagram source file not found at ${instaFilePath}` });
      }
      const workbook = XLSX.readFile(instaFilePath);
      const firstSheet = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });
      incomingProducts = normalizeInstagramRowsToCatalog(rows);
    } else if (Array.isArray(body.products)) {
      incomingProducts = body.products.map(p => ({
        ...p,
        image_files: Array.isArray(p.image_files) ? p.image_files.join(";") : String(p.image_files || "")
      }));
    } else {
      return json(400, { ok: false, error: "Invalid request payload. Provide 'products' array or 'source': 'excel'." });
    }

    try {
      if (isInsertOnly) {
        // Fetch existing group_ids from Supabase so we NEVER edit existing products
        const { data: existingRows, error: fetchErr } = await supabase
          .from("product_info")
          .select("group_id");

        if (fetchErr) {
          return json(500, { ok: false, error: fetchErr.message });
        }

        const existingSet = new Set((existingRows || []).map((r) => String(r.group_id)));
        const newProducts = incomingProducts.filter((p) => !existingSet.has(String(p.group_id)));

        if (newProducts.length > 0) {
          const { data, error } = await supabase
            .from("product_info")
            .insert(newProducts)
            .select();

          if (error) {
            return json(500, { ok: false, error: error.message });
          }

          return json(200, {
            ok: true,
            insertedCount: newProducts.length,
            skippedCount: incomingProducts.length - newProducts.length,
            totalExisting: existingSet.size,
            products: data,
            message: `Inserted ${newProducts.length} new products. Preserved ${incomingProducts.length - newProducts.length} existing products without modifications.`
          });
        } else {
          return json(200, {
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
          return json(500, { ok: false, error: error.message });
        }

        return json(200, { ok: true, count: data.length, products: data });
      }
    } catch (err) {
      return json(500, { ok: false, error: err.message });
    }
  }

  return json(405, { ok: false, error: "Method not allowed" });
};
