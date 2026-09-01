const { createClient } = require("@supabase/supabase-js");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TABLE_NAME = "product_info";
const SIZE_ORDER = ["FREE_SIZE", "XS", "S", "M", "L", "XL", "XXL", "3XL"];

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
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function parseImageFiles(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || "").split(";").map((item) => item.trim()).filter(Boolean);
}

function splitSizes(text) {
  const tokens = String(text || "")
    .toUpperCase()
    .replace(/FREE\s*SIZE/g, "FREE_SIZE")
    .replace(/[^A-Z0-9_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const found = [];
  tokens.forEach((token) => {
    if (SIZE_ORDER.includes(token) && !found.includes(token)) found.push(token);
  });
  return found;
}

function categorizeDescription(description) {
  const lines = String(description || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const soldSizes = [];
  const sizeMentions = [];
  const cleanLines = [];
  const tags = [];
  const soldPattern = /(?:sold\s*out|sold|booking\s*done|booked)\s*[-:]?\s*([a-z0-9\s,/_]+)/i;

  lines.forEach((line) => {
    const lower = line.toLowerCase();
    const tagMatches = line.match(/#[a-z0-9_]+/gi);
    if (tagMatches) tags.push(...tagMatches);

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

    splitSizes(line).forEach((size) => {
      if (!sizeMentions.includes(size)) sizeMentions.push(size);
    });
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

function boolFromCell(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return defaultValue;
}

function computeDefaultPrice(title, description, tags, itemCount) {
  const text = `${title || ""} ${description || ""} ${tags || ""}`.toLowerCase();
  if (
    text.includes("dress") || text.includes("coord") || text.includes("co-ord") ||
    text.includes("set") || text.includes("maxi") || text.includes("gown") ||
    text.includes("anarkali") || text.includes("kurta") || text.includes("suit") ||
    text.includes("jacket") || text.includes("skirt") || Number(itemCount || 1) > 2
  ) return 39;
  return 29;
}

function safeIsoDate(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function canonicalGroupId(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeInstagramRowsToCatalog(rows) {
  const groups = new Map();
  rows.forEach((row, index) => {
    const parentId = pickFirstValue(row, ["parent_media_id", "group_id", "id"]);
    const mediaId = pickFirstValue(row, ["media_id", "id"]) || `row-${index}`;
    const groupId = parentId || mediaId || `group-${index}`;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(row);
  });

  return Array.from(groups.entries()).map(([groupId, groupRows], index) => {
    const first = groupRows[0] || {};
    const rawImageFiles = groupRows.flatMap((row) => {
      const direct = parseImageFiles(pickFirstValue(row, ["image_files", "image_file", "filename", "file_name"]));
      if (direct.length > 0) return direct;
      const mediaUrl = pickFirstValue(row, ["media_url", "url"]);
      return mediaUrl ? [mediaUrl] : [];
    });
    const imageFiles = Array.from(new Set(rawImageFiles));
    const primaryImage = pickFirstValue(first, ["primary_image_file"]) || imageFiles[0] || "";
    const titleFromSheet = pickFirstValue(first, ["title", "product_title", "name"]);
    const description = pickFirstValue(first, ["description", "caption"]);
    const hasParsed = Boolean(
      pickFirstValue(first, ["dress_description"]) || pickFirstValue(first, ["size_mentions"]) ||
      pickFirstValue(first, ["sold_sizes"]) || pickFirstValue(first, ["tags"])
    );
    const parsed = hasParsed
      ? { dressDescription: "", sizeMentions: "", soldSizes: "", tags: "" }
      : categorizeDescription(description);
    const firstCaptionLine = description.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
    const fallbackTitle = parsed.dressDescription.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || firstCaptionLine;
    const title = titleFromSheet || fallbackTitle || `Product ${index + 1}`;
    const dateRaw = pickFirstValue(first, ["product_date", "timestamp", "date"]);

    return {
      group_id: String(groupId),
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
      product_date: safeIsoDate(dateRaw, new Date().toISOString()),
      price: Number(pickFirstValue(first, ["price"])) || computeDefaultPrice(title, description, pickFirstValue(first, ["tags"]) || parsed.tags, imageFiles.length),
      caption_has_sold: boolFromCell(first.caption_has_sold, false),
      item_count: Number(pickFirstValue(first, ["item_count"]) || imageFiles.length || 1),
      active: boolFromCell(first.active, true)
    };
  });
}

function loadLocalExcelCatalog() {
  const catalogPath = path.join(process.cwd(), "product_info/product_catalog.xlsx");
  if (!fs.existsSync(catalogPath)) return [];
  const workbook = XLSX.readFile(catalogPath);
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });

  return rows.map((row, index) => {
    const groupId = String(row.group_id || row.parent_media_id || row.record_id || `item-${index}`).trim();
    const imageFiles = parseImageFiles(row.image_files);
    const primaryImage = String(row.primary_image_file || imageFiles[0] || "").trim();
    const hasParsed = Boolean(
      String(row.dress_description || "").trim() || String(row.size_mentions || "").trim() ||
      String(row.sold_sizes || "").trim() || String(row.tags || "").trim()
    );
    const parsed = hasParsed ? null : categorizeDescription(String(row.description || ""));
    let productDate = null;
    if (row.product_date) {
      if (typeof row.product_date === "number") {
        const excelDate = XLSX.SSF.parse_date_code(row.product_date);
        if (excelDate) productDate = new Date(Date.UTC(excelDate.y, excelDate.m - 1, excelDate.d)).toISOString();
      } else {
        productDate = safeIsoDate(row.product_date, null);
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

function resolveInstagramSourcePath(requestedPath = "") {
  const explicit = String(requestedPath || process.env.INSTAGRAM_SOURCE_FILE || "").trim();
  const defaultFileName = "instagram_media_curatedkadha_20260822_043644.xlsx";

  const candidateDirectories = [
    path.join(process.cwd(), "data_from_insta"),
    path.join(process.cwd(), "static", "data_from_insta"),
    path.join(__dirname, "..", "..", "data_from_insta"),
    path.join(__dirname, "..", "..", "static", "data_from_insta")
  ];

  if (explicit) {
    const explicitPath = path.isAbsolute(explicit) ? explicit : path.join(process.cwd(), explicit);
    if (fs.existsSync(explicitPath)) {
      return explicitPath;
    }
  }

  for (const dir of candidateDirectories) {
    const defaultPath = path.join(dir, defaultFileName);
    if (fs.existsSync(defaultPath)) {
      return defaultPath;
    }
  }

  for (const dir of candidateDirectories) {
    if (!fs.existsSync(dir)) continue;
    const xlsxFiles = fs
      .readdirSync(dir)
      .filter((name) => /\.xlsx$/i.test(name) && /^instagram_media_curatedkadha_/i.test(name))
      .map((name) => {
        const fullPath = path.join(dir, name);
        const stat = fs.statSync(fullPath);
        return { fullPath, mtimeMs: stat.mtimeMs || 0 };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (xlsxFiles.length > 0) {
      return xlsxFiles[0].fullPath;
    }
  }

  return "";
}

function sanitizeInsertProduct(product) {
  const clean = {
    ...product,
    group_id: String(product.group_id || "").trim(),
    image_files: Array.isArray(product.image_files) ? product.image_files.join(";") : String(product.image_files || "")
  };
  clean.product_date = safeIsoDate(product.product_date, null);
  return clean;
}

function summarizeProductForResult(product) {
  return {
    group_id: String(product?.group_id || "").trim(),
    title: String(product?.title || "").trim() || "Untitled product"
  };
}

function buildProductFailure(product, error) {
  return {
    ...summarizeProductForResult(product),
    error: String(error?.message || "Unknown database error"),
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});

  const supabase = getSupabaseClient();
  if (!supabase) {
    return json(500, { ok: false, error: "Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are missing." });
  }

  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};
    if (params.type === "orders") {
      try {
        const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
        if (error) return json(500, { ok: false, error: error.message });
        return json(200, { ok: true, orders: data || [] });
      } catch (error) {
        return json(500, { ok: false, error: error.message });
      }
    }

    try {
      const { data, error } = await supabase.from(TABLE_NAME).select("*").order("product_date", { ascending: false });
      if (error) return json(500, { ok: false, error: error.message });
      const products = (data || []).map((row) => ({
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
    } catch (error) {
      return json(500, { ok: false, error: error.message });
    }
  }

  if (event.httpMethod === "POST" || event.httpMethod === "PUT") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { ok: false, error: "Invalid JSON body" });
    }

    if (body.mode === "update_order_status") {
      const orderId = String(body.order_id || "").trim();
      const status = String(body.status || "pending").trim();
      const shippingId = body.shipping_id !== undefined ? String(body.shipping_id).trim() : null;

      if (!orderId) return json(400, { ok: false, error: "order_id is required." });

      try {
        const updateData = { status };
        if (shippingId !== null) {
          updateData.shipping_id = shippingId;
        }

        let { data, error } = await supabase
          .from("orders")
          .update(updateData)
          .eq("order_id", orderId)
          .select();

        if (error && shippingId !== null) {
          // Fallback if shipping_id column does not exist yet in Supabase orders table
          const fallback = await supabase
            .from("orders")
            .update({ status })
            .eq("order_id", orderId)
            .select();
          data = fallback.data;
          error = fallback.error;
        }

        if (error) return json(500, { ok: false, error: error.message });
        return json(200, { ok: true, order: data?.[0] });
      } catch (err) {
        return json(500, { ok: false, error: err.message });
      }
    }

    // Single-product database update. This must run before import validation.
    if (body.mode === "update") {
      const groupId = String(body.group_id || "").trim();
      const product = body.product;

      if (!groupId) return json(400, { ok: false, error: "A group_id is required to update a product." });
      if (!product || typeof product !== "object" || Array.isArray(product)) {
        return json(400, { ok: false, error: "A valid product object is required." });
      }

      const updatePayload = {
        title: String(product.title || "").trim() || "Untitled product",
        description: String(product.description || ""),
        size_mentions: String(product.size_mentions || ""),
        sold_sizes: String(product.sold_sizes || ""),
        item_count: Number(product.item_count || 0),
        price: Number(product.price || 0),
        active: Boolean(product.active),
        caption_has_sold: Boolean(product.caption_has_sold),
        primary_image_file: String(product.primary_image_file || ""),
        image_files: Array.isArray(product.image_files) ? product.image_files.join(";") : String(product.image_files || "")
      };

      if (Object.prototype.hasOwnProperty.call(product, "dress_description")) {
        updatePayload.dress_description = String(product.dress_description || "");
      }
      if (Object.prototype.hasOwnProperty.call(product, "tags")) {
        updatePayload.tags = String(product.tags || "");
      }
      if (Object.prototype.hasOwnProperty.call(product, "permalink")) {
        updatePayload.permalink = String(product.permalink || "");
      }
      if (Object.prototype.hasOwnProperty.call(product, "product_type")) {
        updatePayload.product_type = String(product.product_type || "IMAGE");
      }
      if (Object.prototype.hasOwnProperty.call(product, "product_date")) {
        updatePayload.product_date = safeIsoDate(product.product_date, null);
      }
      if (!Number.isFinite(updatePayload.item_count)) return json(400, { ok: false, error: "Item count must be a valid number." });
      if (!Number.isFinite(updatePayload.price)) return json(400, { ok: false, error: "Price must be a valid number." });

      try {
        // Resolve the database ID first. This tolerates case differences,
        // numeric/string conversion, and hidden leading or trailing spaces.
        const { data: candidateRows, error: lookupError } = await supabase
          .from(TABLE_NAME)
          .select("group_id");

        if (lookupError) {
          console.error("Supabase product lookup error:", lookupError);
          return json(500, {
            ok: false,
            error: lookupError.message,
            details: lookupError.details || null,
            hint: lookupError.hint || null,
            code: lookupError.code || null
          });
        }

        const normalizedRequestedId = groupId.trim().toLowerCase();
        const matchingRow = (candidateRows || []).find((row) =>
          String(row.group_id ?? "").trim().toLowerCase() === normalizedRequestedId
        );

        if (!matchingRow) {
          console.error("Product group_id not found", {
            receivedGroupId: groupId,
            availableIdCount: (candidateRows || []).length
          });
          return json(404, {
            ok: false,
            error: `No product was found with group_id "${groupId}". Clear the browser catalogue cache and try again.`,
            received_group_id: groupId
          });
        }

        const databaseGroupId = matchingRow.group_id;
        const { data, error } = await supabase
          .from(TABLE_NAME)
          .update(updatePayload)
          .eq("group_id", databaseGroupId)
          .select();

        if (error) {
          console.error("Supabase product update error:", error);
          return json(500, {
            ok: false,
            error: error.message,
            details: error.details || null,
            hint: error.hint || null,
            code: error.code || null
          });
        }
        if (!data || data.length === 0) {
          return json(404, {
            ok: false,
            error: `The product was located but could not be updated for group_id "${groupId}".`
          });
        }
        return json(200, {
          ok: true,
          count: data.length,
          product: data[0],
          matched_group_id: String(databaseGroupId),
          message: "Product updated successfully."
        });
      } catch (error) {
        console.error("Unexpected product update error:", error);
        return json(500, { ok: false, error: error instanceof Error ? error.message : "Unexpected database update error." });
      }
    }

    if (body.mode === "delete") {
      const groupId = String(body.group_id || "").trim();
      if (!groupId) {
        return json(400, { ok: false, error: "A group_id is required to delete a product." });
      }

      try {
        const { data: candidateRows, error: lookupError } = await supabase
          .from(TABLE_NAME)
          .select("group_id")
          .limit(5000);

        if (lookupError) {
          return json(500, {
            ok: false,
            error: lookupError.message,
            details: lookupError.details || null,
            hint: lookupError.hint || null,
            code: lookupError.code || null
          });
        }

        const normalizedRequestedId = groupId.trim().toLowerCase();
        const matchingRow = (candidateRows || []).find((row) =>
          String(row.group_id ?? "").trim().toLowerCase() === normalizedRequestedId
        );

        if (!matchingRow) {
          return json(404, { ok: false, error: `No product found for group_id \"${groupId}\".` });
        }

        const databaseGroupId = String(matchingRow.group_id);
        const { error: deleteError } = await supabase
          .from(TABLE_NAME)
          .delete()
          .eq("group_id", databaseGroupId);

        if (deleteError) {
          return json(500, {
            ok: false,
            error: deleteError.message,
            details: deleteError.details || null,
            hint: deleteError.hint || null,
            code: deleteError.code || null
          });
        }

        return json(200, {
          ok: true,
          deleted: true,
          matched_group_id: databaseGroupId,
          message: "Product deleted successfully."
        });
      } catch (error) {
        return json(500, { ok: false, error: error instanceof Error ? error.message : "Unexpected database delete error." });
      }
    }

    const mode = String(body.mode || "").trim().toLowerCase();
    const isInsertOnly =
      mode === "insert_only" ||
      body.source === "excel" ||
      body.source === "catalog" ||
      (event.httpMethod === "POST" && mode !== "upsert");

    let incomingProducts = [];
    if (body.source === "excel" || body.source === "catalog") {
      incomingProducts = loadLocalExcelCatalog();
    } else if (body.source === "instagram") {
      const instaPath = resolveInstagramSourcePath(body.sourceFile);
      if (!instaPath) {
        return json(404, {
          ok: false,
          error: "Instagram source file not found. Place an xlsx file under data_from_insta/ (or static/data_from_insta/) and include it in Netlify functions bundle via netlify.toml [functions].included_files, or set INSTAGRAM_SOURCE_FILE."
        });
      }
      const workbook = XLSX.readFile(instaPath);
      const firstSheet = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });
      incomingProducts = normalizeInstagramRowsToCatalog(rows);
    } else if (Array.isArray(body.products)) {
      incomingProducts = body.products.map(sanitizeInsertProduct);
    } else {
      return json(400, { ok: false, error: "Invalid request payload. Provide 'products' array, 'source': 'excel', or mode: 'update'." });
    }

    incomingProducts = incomingProducts.map(sanitizeInsertProduct).filter((product) => product.group_id);
    if (incomingProducts.length === 0) return json(400, { ok: false, error: "No valid products were supplied." });

    try {
      if (isInsertOnly) {
        const { data: existingRows, error: fetchError } = await supabase.from(TABLE_NAME).select("group_id");
        if (fetchError) return json(500, { ok: false, error: fetchError.message });
        const existingSet = new Set((existingRows || []).map((row) => canonicalGroupId(row.group_id)).filter(Boolean));
        const seenIncoming = new Set();
        const dedupedIncoming = [];
        let duplicateInputCount = 0;

        incomingProducts.forEach((product) => {
          const canonical = canonicalGroupId(product.group_id);
          if (!canonical) return;
          if (seenIncoming.has(canonical)) {
            duplicateInputCount += 1;
            return;
          }
          seenIncoming.add(canonical);
          dedupedIncoming.push(product);
        });

        const newProducts = dedupedIncoming.filter((product) => !existingSet.has(canonicalGroupId(product.group_id)));

        if (newProducts.length === 0) {
          return json(200, {
            ok: true,
            insertedCount: 0,
            skippedCount: dedupedIncoming.length,
            duplicateInputCount,
            totalExisting: existingSet.size,
            products: [],
            message: "All products already exist in database. Existing products were preserved without modifications."
          });
        }

        const insertedProducts = [];
        const failedProducts = [];
        for (const product of newProducts) {
          const { data, error } = await supabase.from(TABLE_NAME).insert([product]).select();
          if (error) {
            failedProducts.push(buildProductFailure(product, error));
            continue;
          }
          if (Array.isArray(data) && data[0]) {
            insertedProducts.push(data[0]);
          } else {
            insertedProducts.push(summarizeProductForResult(product));
          }
        }

        const insertedCount = insertedProducts.length;
        const failedCount = failedProducts.length;
        const skippedCount = dedupedIncoming.length - newProducts.length;
        const partial = failedCount > 0;

        return json(partial ? 207 : 200, {
          ok: true,
          partial,
          insertedCount,
          failedCount,
          skippedCount,
          duplicateInputCount,
          totalExisting: existingSet.size,
          products: insertedProducts,
          failedProducts,
          message: partial
            ? `Partial insert completed: ${insertedCount} inserted, ${failedCount} failed, ${skippedCount} skipped.`
            : `Inserted ${insertedCount} new products. Preserved ${skippedCount} existing products without modifications.`
        });
      }

      const { data: existingRows, error: fetchError } = await supabase.from(TABLE_NAME).select("group_id");
      if (fetchError) return json(500, { ok: false, error: fetchError.message });

      const existingMap = new Map(
        (existingRows || [])
          .map((row) => [canonicalGroupId(row.group_id), String(row.group_id)])
          .filter(([canonical]) => Boolean(canonical))
      );

      const seenIncoming = new Set();
      const upsertProducts = [];
      let duplicateInputCount = 0;

      incomingProducts.forEach((product) => {
        const canonical = canonicalGroupId(product.group_id);
        if (!canonical) return;
        if (seenIncoming.has(canonical)) {
          duplicateInputCount += 1;
          return;
        }
        seenIncoming.add(canonical);
        const matchedExistingGroupId = existingMap.get(canonical);
        upsertProducts.push({
          ...product,
          group_id: matchedExistingGroupId || String(product.group_id).trim()
        });
      });

      const syncedProducts = [];
      const failedProducts = [];
      for (const product of upsertProducts) {
        const { data, error } = await supabase.from(TABLE_NAME).upsert([product], { onConflict: "group_id" }).select();
        if (error) {
          failedProducts.push(buildProductFailure(product, error));
          continue;
        }
        if (Array.isArray(data) && data[0]) {
          syncedProducts.push(data[0]);
        } else {
          syncedProducts.push(summarizeProductForResult(product));
        }
      }

      const count = syncedProducts.length;
      const failedCount = failedProducts.length;
      const partial = failedCount > 0;

      return json(partial ? 207 : 200, {
        ok: true,
        partial,
        count,
        insertedCount: count,
        failedCount,
        duplicateInputCount,
        products: syncedProducts,
        failedProducts,
        message: partial
          ? `Partial sync completed: ${count} succeeded, ${failedCount} failed.`
          : `Sync completed successfully for ${count} products.`
      });
    } catch (error) {
      return json(500, { ok: false, error: error.message });
    }
  }

  return json(405, { ok: false, error: "Method not allowed" });
};
