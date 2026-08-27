const SIZE_ORDER = ["FREE_SIZE", "XS", "S", "M", "L", "XL", "XXL", "3XL"];
const CATALOG_URL = "product_info/product_catalog.xlsx";
const CATALOG_API_URL = (window.CK_CONFIG && window.CK_CONFIG.catalogApiUrl)
  ? String(window.CK_CONFIG.catalogApiUrl).trim()
  : `${location.origin}/api/product-catalog`;
const INSTAGRAM_SOURCE_URL = "data_from_insta/instagram_media_curatedkadha_20260822_043644.xlsx";
const SECURE_ORDER_API_URL = (window.CK_CONFIG && window.CK_CONFIG.secureOrderApiUrl)
  ? String(window.CK_CONFIG.secureOrderApiUrl).trim()
  : `${location.origin}/api/send-order-email`;
const CATALOG_CACHE_KEY = "ck_catalog_cache_v1";
const CART_KEY = "ck_cart";
const EDITS_KEY = "ck_stock_edits";
const ABOUT_PHOTO_SRC = "static/Chelsi.jpeg";
const SESSION_KEY = "ck_session";
const SESSION_TTL_MS = 30 * 60 * 1000;
const NZ_CITY_POSTCODE = {
  Auckland: "1010",
  Wellington: "6011",
  Christchurch: "8011",
  Hamilton: "3204",
  Tauranga: "3110",
  Dunedin: "9016",
  Palmerston_North: "4410",
  Napier: "4110",
  Nelson: "7010",
  Rotorua: "3010",
  New_Plymouth: "4310",
  Whangarei: "0110",
  Invercargill: "9810"
};
const NZ_SUBURB_POSTCODE = {
  ponsonby: "1011",
  parnell: "1052",
  remuera: "1050",
  mt_eden: "1024",
  epsom: "1023",
  sandringham: "1025",
  newmarket: "1023",
  papatoetoe: "2025",
  takapuna: "0622",
  hamilton_central: "3204",
  chartwell: "3210",
  te_rapa: "3200",
  wellington_central: "6011",
  te_aro: "6011",
  kilbirnie: "6022",
  miramar: "6022",
  christchurch_central: "8011",
  riccarton: "8041",
  sydenham: "8023",
  ilam: "8041",
  mount_maunganui: "3116",
  papamoa: "3118",
  tauranga_south: "3112",
  dunedin_central: "9016",
  st_kilda: "9012",
  saint_kilda: "9012",
  mosgiel: "9024",
  napier_south: "4110",
  hastings_central: "4122",
  nelson_south: "7010",
  rotorua_central: "3010",
  whangarei_central: "0110",
  invercargill_central: "9810"
};

function normalizeNzPlace(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const state = {
  products: [],
  filteredProducts: [],
  cart: loadJson(CART_KEY, {}),
  stockEdits: loadJson(EDITS_KEY, {}),
  stockAuth: false,
  session: {
    id: "",
    stockAuth: false,
    expiresAt: 0,
    username: ""
  },
  filters: {
    sizeFilter: [],
    sortBy: "newest"
  },
  stockFilters: {
    stockState: "all",
    activeState: "all",
    size: "all"
  },
  isCartModalOpen: false,
  orderSuccessMessage: "",
  visibleCount: 24,
  selectedProductId: "",
  selectedStockGroupId: ""
};

const app = document.getElementById("app");
let shopLoadObserver = null;
installWideScreenBannerStyles();

start();

function installWideScreenBannerStyles() {
  if (document.getElementById("ckWideBannerStyles")) return;
  const style = document.createElement("style");
  style.id = "ckWideBannerStyles";
  style.textContent = `
    :is(.top-banner, .hero-banner, .home-banner, .banner, #topBanner, #heroBanner) {
      width: min(100%, 1920px);
      margin-inline: auto;
      position: relative;
      overflow: hidden;
    }
    :is(.top-banner, .hero-banner, .home-banner, .banner, #topBanner, #heroBanner) > img,
    :is(.top-banner, .hero-banner, .home-banner, .banner, #topBanner, #heroBanner) > picture > img,
    :is(.top-banner, .hero-banner, .home-banner, .banner, #topBanner, #heroBanner) > video {
      display: block;
      width: 100%;
      height: clamp(280px, 34vw, 680px);
      object-fit: cover;
      object-position: center 35%;
    }
    :is(.top-banner-content, .banner-content, .hero-content, .banner-overlay) {
      width: min(90%, 780px);
    }
    :is(.top-banner-content, .banner-content, .hero-content, .banner-overlay) :is(h1, .banner-title, .hero-title) {
      font-size: clamp(2rem, 4.4vw, 5.25rem);
      line-height: 1.04;
      text-wrap: balance;
    }
    @media (min-width: 1440px) {
      :is(.top-banner, .hero-banner, .home-banner, .banner, #topBanner, #heroBanner) > img,
      :is(.top-banner, .hero-banner, .home-banner, .banner, #topBanner, #heroBanner) > picture > img,
      :is(.top-banner, .hero-banner, .home-banner, .banner, #topBanner, #heroBanner) > video {
        height: clamp(500px, 36vw, 680px);
      }
    }
    @media (max-width: 700px) {
      :is(.top-banner, .hero-banner, .home-banner, .banner, #topBanner, #heroBanner) > img,
      :is(.top-banner, .hero-banner, .home-banner, .banner, #topBanner, #heroBanner) > picture > img,
      :is(.top-banner, .hero-banner, .home-banner, .banner, #topBanner, #heroBanner) > video {
        height: clamp(230px, 72vw, 390px);
        object-position: center;
      }
    }
  `;
  document.head.appendChild(style);
}

async function start() {
  renderLoading();
  try {
    hydrateSession();
    registerSessionActivityHooks();
    const cachedProducts = loadCatalogCache();

    if (cachedProducts.length > 0) {
      state.products = cachedProducts;
      applyStockEdits();
      updateCartCount();
      ensureRoute();
      window.addEventListener("hashchange", renderRoute);
      renderRoute();
      refreshCatalogInBackground();
      return;
    }

    state.products = await loadCatalog();
    saveCatalogCache(state.products);
    applyStockEdits();
    updateCartCount();
    ensureRoute();
    window.addEventListener("hashchange", renderRoute);
    renderRoute();
  } catch (error) {
    renderError(error instanceof Error ? error.message : String(error));
  }
}

async function refreshCatalogInBackground() {
  try {
    const freshProducts = await loadCatalog();
    saveCatalogCache(freshProducts);
    state.products = freshProducts;
    applyStockEdits();
    updateCartCount();
    renderRoute();
  } catch {
    // Ignore background refresh failures and keep cached data.
  }
}

function renderLoading() {
  app.innerHTML = document.getElementById("loadingTemplate").innerHTML;
}

function renderError(message) {
  app.innerHTML = document.getElementById("errorTemplate").innerHTML;
  const target = document.getElementById("errorText");
  if (target) {
    target.textContent = message;
  }
}

function ensureRoute() {
  if (!location.hash || location.hash === "#") {
    location.hash = "#/shop";
  }
}

function getRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [pathPart] = raw.split("?");
  const lowerRaw = (raw || "shop").toLowerCase();
  const path = (pathPart || "shop").toLowerCase();
  return { path, raw, lowerRaw };
}

function renderRoute() {
  ensureSessionValidity();
  const { path, raw, lowerRaw } = getRoute();
  setActiveNav(path);

  if (path === "shop") {
    renderShop();
    return;
  }
  if (path === "cart") {
    state.isCartModalOpen = true;
    location.hash = "#/shop";
    return;
  }
  if (lowerRaw.startsWith("product/")) {
    const rawProductId = raw.slice("product/".length);
    const productId = decodeURIComponent(rawProductId);
    renderProductDetails(productId);
    return;
  }
  if (path === "stock") {
    renderStock();
    return;
  }

  location.hash = "#/shop";
}

function setActiveNav(path) {
  document.querySelectorAll(".nav-link").forEach((item) => {
    const route = item.getAttribute("data-route");
    item.classList.toggle("active", route === path);
  });
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadCatalogCache() {
  const payload = loadJson(CATALOG_CACHE_KEY, null);
  if (!payload || typeof payload !== "object") {
    return [];
  }
  if (!Array.isArray(payload.products)) {
    return [];
  }

  return payload.products.map((product) => {
    const parsed = categorizeDescription(product.description || product.dress_description || "");
    const parsedMentions = splitSizes(parsed.sizeMentions);
    const parsedSold = splitSizes(parsed.soldSizes);
    if (parsedMentions.length === 0) return product;
    return { ...product, size_mentions: parsedMentions.join(";"), sold_sizes: parsedSold.join(";") };
  });
}

function saveCatalogCache(products) {
  try {
    saveJson(CATALOG_CACHE_KEY, {
      version: 1,
      savedAt: Date.now(),
      products
    });
  } catch {
    // Ignore cache write failures (e.g., storage quota exceeded).
  }
}

function loadSessionJson(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveSessionJson(key, value) {
  sessionStorage.setItem(key, JSON.stringify(value));
}

function generateSessionId() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `sess_${Date.now().toString(36)}_${rand}`;
}

function hydrateSession() {
  const loaded = loadSessionJson(SESSION_KEY, null);
  if (!loaded || typeof loaded !== "object") {
    state.session = {
      id: generateSessionId(),
      stockAuth: false,
      expiresAt: 0,
      username: ""
    };
    state.stockAuth = false;
    saveSessionJson(SESSION_KEY, state.session);
    return;
  }

  state.session = {
    id: String(loaded.id || generateSessionId()),
    stockAuth: Boolean(loaded.stockAuth),
    expiresAt: Number(loaded.expiresAt || 0),
    username: String(loaded.username || "")
  };

  if (isSessionExpired()) {
    clearStockSession();
  } else {
    state.stockAuth = Boolean(state.session.stockAuth);
  }

  saveSessionJson(SESSION_KEY, state.session);
}

function isSessionExpired() {
  if (!state.session.stockAuth) {
    return false;
  }
  return Date.now() >= Number(state.session.expiresAt || 0);
}

function touchSession() {
  if (!state.session.stockAuth) {
    return;
  }
  state.session.expiresAt = Date.now() + SESSION_TTL_MS;
  saveSessionJson(SESSION_KEY, state.session);
}

function startStockSession(username) {
  state.session.stockAuth = true;
  state.session.username = String(username || "").trim();
  state.session.expiresAt = Date.now() + SESSION_TTL_MS;
  state.stockAuth = true;
  saveSessionJson(SESSION_KEY, state.session);
}

function clearStockSession() {
  state.session.stockAuth = false;
  state.session.username = "";
  state.session.expiresAt = 0;
  state.stockAuth = false;
  saveSessionJson(SESSION_KEY, state.session);
}

function ensureSessionValidity() {
  if (isSessionExpired()) {
    clearStockSession();
  }
}

function registerSessionActivityHooks() {
  const events = ["click", "keydown", "mousemove", "touchstart", "scroll"];
  events.forEach((eventName) => {
    window.addEventListener(eventName, () => {
      touchSession();
    }, { passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      ensureSessionValidity();
      touchSession();
    }
  });
}

function splitSizes(value) {
  return String(value || "")
    .split(";")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
}

function normalizeDate(raw) {
  if (!raw) {
    return 0;
  }
  if (typeof raw === "number") {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed) {
      return 0;
    }
    return Date.UTC(parsed.y, parsed.m - 1, parsed.d);
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function categorizeDescription(description) {
  const text = String(description || "").trim();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const tokenRegex = /\b(?:xxs|xs|s|m|l|xl|xxl|2xl|xxxl|3xl|small|medium|large|free\s*size|one\s*size|onesize|os)\b/gi;
  const soldRegex = /\b(sold|booked|unavailable|gone|out\s+of\s+stock)\b/i;
  const dmRegex = /\b(dm\s*(us|for|to)?|inbox\s*us|message\s*us|direct\s*message)\b/i;

  const aliases = {
    SMALL: "S",
    MEDIUM: "M",
    LARGE: "L",
    "2XL": "XXL",
    XXXL: "3XL",
    ONESIZE: "FREE_SIZE",
    FREESIZE: "FREE_SIZE",
    FREE: "FREE_SIZE",
    OS: "FREE_SIZE"
  };

  const normalize = (token) => aliases[token.toUpperCase().replace(/\s+/g, "")] || token.toUpperCase().replace(/\s+/g, "");
  const extractSizes = (input) => {
    const set = new Set();
    let match;
    const work = String(input || "");
    while ((match = tokenRegex.exec(work)) !== null) {
      const normalized = normalize(match[0]);
      if (SIZE_ORDER.includes(normalized)) {
        set.add(normalized);
      }
    }
    tokenRegex.lastIndex = 0;
    return Array.from(set);
  };

  const sizeMentions = extractSizes(text);
  const soldSizes = [];

  lines.forEach((line) => {
    if (!soldRegex.test(line)) {
      return;
    }
    extractSizes(line).forEach((size) => {
      if (!soldSizes.includes(size)) {
        soldSizes.push(size);
      }
    });
  });

  soldSizes.forEach((size) => {
    if (!sizeMentions.includes(size)) {
      sizeMentions.push(size);
    }
  });

  const dressDescription = lines
    .filter((line) => !dmRegex.test(line))
    .filter((line) => !line.startsWith("#"))
    .filter((line) => !/size/i.test(line))
    .filter((line) => !soldRegex.test(line))
    .join("\n");

  const tags = Array.from(
    new Set(
      Array.from(text.matchAll(/#([A-Za-z0-9_]+)/g)).map((value) => value[1].toLowerCase())
    )
  );

  return {
    dressDescription,
    sizeMentions: sizeMentions.join(";"),
    soldSizes: soldSizes.join(";"),
    tags: tags.join(";")
  };
}

async function loadCatalog(options = {}) {
  const forceReload = Boolean(options.forceReload);
  
  // Try loading from Supabase via API endpoint first
  try {
    const apiRequestUrl = forceReload
      ? `${CATALOG_API_URL}${CATALOG_API_URL.includes("?") ? "&" : "?"}v=${Date.now()}`
      : CATALOG_API_URL;
    const apiRes = await fetch(apiRequestUrl, { cache: forceReload ? "no-store" : "default" });
    if (apiRes.ok) {
      const result = await apiRes.json();
      if (result.ok && Array.isArray(result.products) && result.products.length > 0) {
        return result.products;
      }
    }
  } catch (err) {
    console.warn("Catalog API fetch failed, falling back to local file:", err);
  }

  // Fallback to local Excel catalog file
  const requestUrl = forceReload
    ? `${CATALOG_URL}${CATALOG_URL.includes("?") ? "&" : "?"}v=${Date.now()}`
    : CATALOG_URL;
  const response = await fetch(requestUrl, { cache: forceReload ? "no-store" : "default" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${CATALOG_URL}`);
  }

  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new Error("Catalog workbook has no sheets.");
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });
  return rows.map((row, index) => {
    const groupId = String(row.group_id || row.parent_media_id || row.record_id || `item-${index}`).trim();
    const imageFiles = String(row.image_files || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);
    const primaryImage = String(row.primary_image_file || imageFiles[0] || "").trim();

    const hasPreParsedFields = Boolean(
      String(row.dress_description || "").trim()
      || String(row.size_mentions || "").trim()
      || String(row.sold_sizes || "").trim()
      || String(row.tags || "").trim()
    );
    const parsed = hasPreParsedFields ? null : categorizeDescription(String(row.description || ""));

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
      product_date: normalizeDate(row.product_date),
      price: Number(row.price || 0),
      caption_has_sold: String(row.caption_has_sold).toLowerCase() === "true" || Boolean(row.caption_has_sold),
      item_count: Number(row.item_count || imageFiles.length || 1),
      active: row.active === "" ? true : Boolean(row.active)
    };
  });
}

async function saveCatalogToServer(products) {
  const response = await fetch(CATALOG_API_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      target_file: CATALOG_URL,
      products: products.map((item) => ({
        ...item,
        image_files: Array.isArray(item.image_files) ? item.image_files.join(";") : String(item.image_files || "")
      }))
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Catalog update failed: ${response.status} ${errorText}`);
  }
  return response.json();
}

async function reloadCatalogFromFile(button, messageNode) {
  const originalText = button ? button.textContent : "Reload catalog";
  if (button) {
    button.disabled = true;
    button.textContent = "Reloading...";
  }
  if (messageNode) {
    messageNode.innerHTML = '<p class="notice">Reloading the full app from product_info/product_catalog.xlsx...</p>';
  }
  try {
    localStorage.removeItem(CATALOG_CACHE_KEY);
    localStorage.removeItem(EDITS_KEY);
    state.stockEdits = {};
    state.products = await loadCatalog({ forceReload: true });
    saveCatalogCache(state.products);
    state.selectedStockGroupId = "";
    state.visibleCount = 24;
    updateCartCount();
    renderRoute();
  } catch (error) {
    if (messageNode) {
      messageNode.innerHTML = `<p class="notice error">Reload failed: ${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
    }
  } finally {
    if (button && document.body.contains(button)) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function applyStockEdits() {
  state.products = state.products.map((product) => {
    const patch = state.stockEdits[product.group_id];
    return patch ? { ...product, ...patch } : product;
  });
}

function pickFirstValue(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function boolFromCell(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseImageFiles(value) {
  return String(value || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeInstagramRowsToCatalog(rows) {
  const grouped = new Map();

  rows.forEach((row, index) => {
    const rowMediaId = pickFirstValue(row, ["media_id", "id", "record_id"]);
    const parentId = pickFirstValue(row, ["parent_media_id", "group_id"]) || rowMediaId || `item-${index + 1}`;
    if (!grouped.has(parentId)) {
      grouped.set(parentId, []);
    }
    grouped.get(parentId).push(row);
  });

  return Array.from(grouped.entries()).map(([groupId, groupRows], index) => {
    const first = groupRows[0] || {};
    const caption = pickFirstValue(first, ["description", "caption", "text", "message"]);
    const parsed = categorizeDescription(caption);

    const rawImageFiles = groupRows.flatMap((row) => {
      const directList = parseImageFiles(pickFirstValue(row, ["image_files", "image_file", "filename", "file_name"]));
      if (directList.length > 0) {
        return directList;
      }

      const fromPath = pickFirstValue(row, ["local_path", "path", "media_path", "media_url", "file_url"]);
      if (!fromPath) {
        return [];
      }
      const lastSegment = fromPath.split(/[\\/]/).pop() || "";
      return lastSegment ? [lastSegment] : [];
    });

    const imageFiles = Array.from(new Set(rawImageFiles));
    const primaryImage = pickFirstValue(first, ["primary_image_file"]) || imageFiles[0] || "";
    const titleFromSheet = pickFirstValue(first, ["title", "product_title", "name"]);
    const firstCaptionLine = caption.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
    const fallbackTitle = parsed.dressDescription.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || firstCaptionLine;
    const title = titleFromSheet || fallbackTitle || `Product ${index + 1}`;

    const productDateRaw = pickFirstValue(first, ["product_date", "timestamp", "created_time", "created_at", "date"]);
    const soldSizesSheet = pickFirstValue(first, ["sold_sizes"]);
    const sizeMentionsSheet = pickFirstValue(first, ["size_mentions"]);

    return {
      group_id: String(groupId),
      title,
      description: caption,
      dress_description: pickFirstValue(first, ["dress_description"]) || parsed.dressDescription,
      size_mentions: sizeMentionsSheet || parsed.sizeMentions,
      sold_sizes: soldSizesSheet || parsed.soldSizes,
      tags: pickFirstValue(first, ["tags"]) || parsed.tags,
      primary_image_file: primaryImage,
      image_files: imageFiles.join(";"),
      permalink: pickFirstValue(first, ["permalink", "post_url", "url"]),
      product_type: pickFirstValue(first, ["product_type", "media_type"]) || "IMAGE",
      product_date: normalizeDate(productDateRaw),
      price: Number(pickFirstValue(first, ["price"]) || 0),
      caption_has_sold: boolFromCell(first.caption_has_sold, soldSizesSheet ? true : false),
      item_count: Number(pickFirstValue(first, ["item_count"]) || imageFiles.length || 1),
      active: boolFromCell(first.active, true)
    };
  });
}

async function rebuildCatalogFromInstagram() {
  const response = await fetch(INSTAGRAM_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${INSTAGRAM_SOURCE_URL}`);
  }

  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new Error("Instagram workbook has no sheets.");
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });
  if (rows.length === 0) {
    throw new Error("Instagram workbook is empty.");
  }

  const rebuilt = normalizeInstagramRowsToCatalog(rows);

  // Send converted product catalog directly to Supabase via Netlify function
  let syncedToSupabase = false;
  try {
    const syncRes = await fetch(CATALOG_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products: rebuilt })
    });
    if (syncRes.ok) {
      const syncResult = await syncRes.json();
      if (syncResult.ok) {
        syncedToSupabase = true;
      }
    }
  } catch (err) {
    console.warn("Could not sync converted catalog to Supabase directly:", err);
  }

  // Instantly update local app state with new converted products so reload is not needed
  state.products = rebuilt.map((item) => ({
    ...item,
    image_files: parseImageFiles(item.image_files)
  }));
  saveCatalogCache(state.products);
  updateCartCount();

  const outputHeaders = [
    "group_id",
    "title",
    "description",
    "dress_description",
    "size_mentions",
    "sold_sizes",
    "tags",
    "primary_image_file",
    "image_files",
    "permalink",
    "product_type",
    "product_date",
    "price",
    "caption_has_sold",
    "item_count",
    "active"
  ];

  const outWorkbook = XLSX.utils.book_new();
  const outSheet = XLSX.utils.json_to_sheet(rebuilt, { header: outputHeaders });
  XLSX.utils.book_append_sheet(outWorkbook, outSheet, "catalog");
    const dateToken = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const fileName = `new_product_catalog_${dateToken}.xlsx`;
    XLSX.writeFile(outWorkbook, fileName);

    return {
      fileName,
      count: rebuilt.length,
      syncedToSupabase
    };
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatSizeLabel(size) {
  return String(size).toUpperCase() === "FREE_SIZE" ? "Free Size" : String(size);
}

function availableSizes(item) {
  const mentions = new Set(splitSizes(item.size_mentions));
  splitSizes(item.sold_sizes).forEach((size) => mentions.delete(size));
  return SIZE_ORDER.filter((size) => mentions.has(size));
}

function getCartRows() {
  const rows = [];
  Object.entries(state.cart).forEach(([groupId, qtyRaw]) => {
    const qty = Number(qtyRaw || 0);
    if (qty <= 0) {
      return;
    }
    const product = state.products.find((p) => p.group_id === groupId);
    if (!product) {
      return;
    }
    rows.push({
      group_id: groupId,
      title: product.title,
      price: product.price,
      qty,
      line_total: product.price * qty,
      item_count: product.item_count,
      image: product.image_files[0] || ""
    });
  });
  return rows;
}

function getCartCount() {
  return Object.values(state.cart)
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((sum, value) => sum + value, 0);
}

function updateCartCount() {
  const count = getCartCount();

  document.querySelectorAll("[data-cart-count]").forEach((target) => {
    target.textContent = String(count);
  });
}

function clearCart() {
  state.cart = {};
  saveJson(CART_KEY, state.cart);
  updateCartCount();
}

function setCartQty(groupId, qty) {
  const value = Math.max(0, Number(qty || 0));
  if (value <= 0) {
    delete state.cart[groupId];
  } else {
    state.cart[groupId] = value;
  }
  saveJson(CART_KEY, state.cart);
  updateCartCount();
}

function renderShop() {
  const filtered = filterProducts();
  state.filteredProducts = filtered;
  const selectedSize = state.filters.sizeFilter[0] || "all";
  const aboutPhoto = ABOUT_PHOTO_SRC.trim();
  const aboutPhotoMarkup = aboutPhoto
    ? `<img class="about-photo" src="${escapeHtml(aboutPhoto)}" alt="Holland Designs Crochet" />`
    : `<div class="about-photo-placeholder">Add about photo</div>`;

  app.innerHTML = `
    <section class="shop-layout">
      <div class="shop-toolbar">

        <select id="fSize" class="shop-filter-select">
          <option value="all" ${selectedSize === "all" ? "selected" : ""}>All sizes</option>
          ${SIZE_ORDER.map((size) => `<option value="${size}" ${selectedSize === size ? "selected" : ""}>${formatSizeLabel(size)}</option>`).join("")}
        </select>

        <select id="fSort" class="shop-filter-select">
          <option value="newest" ${state.filters.sortBy === "newest" ? "selected" : ""}>Newest</option>
          <option value="oldest" ${state.filters.sortBy === "oldest" ? "selected" : ""}>Oldest</option>
          <option value="priceLow" ${state.filters.sortBy === "priceLow" ? "selected" : ""}>Price low to high</option>
          <option value="priceHigh" ${state.filters.sortBy === "priceHigh" ? "selected" : ""}>Price high to low</option>
        </select>

        <div class="shop-tools">
          <button class="secondary" id="shopNavStockBtn" type="button">Login</button>
          <button class="secondary" id="shopNavCartBtn" type="button">Cart (<span data-cart-count>0</span>)</button>
        </div>

      </div>

      <section class="panel shop-grid-panel">
        <p>${filtered.length} products found</p>
        <div id="shopGrid" class="grid"></div>
        <div id="shopLoadMoreWrap" class="field"></div>
      </section>

      <section class="about-wrap">
        <article class="about-content">
          <div class="about-media">
            ${aboutPhotoMarkup}
          </div>
          <div class="about-copy">
            <h2>About Holland Designs Crochet</h2>
            <p>Holland Designs Crochet is a family business run by Gilbert and Lisa van Klaveren, based in Auckland, New Zealand.</p>
            <p>Lisa has been designing crochet patterns since 2008, with more than 700 original designs including blankets, garments, accessories and baby wear. On Etsy, her work speaks for itself: 140k+ sales, a 4.9-star rating from 18k reviews, and 17 years of loyal customers at <a href="https://www.etsy.com/nz/shop/hollanddesigns" target="_blank" rel="noreferrer">etsy.com/nz/shop/hollanddesigns</a>.</p>
            <p>Quality printed crochet patterns have been hard to find in New Zealand. This website changes that. We showcase our handpicked collection of printed patterns, 226 of Lisa's most popular designs, printed locally on premium durable paper and ready to stock.</p>
            <p>We partner with independent retailers across New Zealand who want to stock something made right here at home. Original patterns designed in Auckland, printed in New Zealand, and loved by crochet fans worldwide.</p>
            <p>Interested in stocking our patterns? We'd love to hear from you. Contact us at <a href="mailto:contact@hdpublishing.co.nz">contact@hdpublishing.co.nz</a></p>
          </div>
        </article>
        <footer class="about-footer">© Holland Designs Crochet · Wholesale enquiries: <a href="mailto:contact@hdpublishing.co.nz">contact@hdpublishing.co.nz</a></footer>
      </section>

      <div id="cartModalRoot"></div>
      <div id="imageViewerRoot"></div>

      <button id="backToTopBtn" class="back-to-top-pill" type="button" aria-label="Back to top">↑</button>
    </section>
  `;

  updateCartCount();
  bindShopFilterHandlers();
  renderShopGrid();
  if (state.isCartModalOpen) {
    openCartModal();
  }
}

function bindShopFilterHandlers() {
  const wire = (selector, fn, options = {}) => {
    const node = document.querySelector(selector);
    if (node) {
      node.addEventListener("change", fn);
      if (options.liveInput && node.tagName === "INPUT" && node.type === "text") {
        node.addEventListener("input", fn);
      }
    }
  };

  wire("#fSize", (event) => {
    const value = event.target.value;
    state.filters.sizeFilter = value === "all" ? [] : [value];
    state.visibleCount = 24;
    renderShop();
  });
  wire("#fSort", (event) => {
    state.filters.sortBy = event.target.value;
    renderShop();
  });

  const shopNavStock = document.getElementById("shopNavStockBtn");
  if (shopNavStock) {
    shopNavStock.addEventListener("click", () => {
      location.hash = "#/stock";
    });
  }

  const shopNavCart = document.getElementById("shopNavCartBtn");
  if (shopNavCart) {
    shopNavCart.addEventListener("click", () => {
      openCartModal();
    });
  }

  const backToTopButton = document.getElementById("backToTopBtn");
  if (backToTopButton) {
    backToTopButton.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

}


function filterProducts() {
  let result = [...state.products];
  result = result.filter((item) => item.active);

  if (state.filters.sizeFilter.length > 0) {
    const selected = new Set(state.filters.sizeFilter);
    result = result.filter((item) => {
      const target = splitSizes(item.size_mentions);
      return target.some((size) => selected.has(size));
    });
  }

  const byDate = (item) => Number(item.product_date || 0);
  if (state.filters.sortBy === "newest") {
    result.sort((a, b) => byDate(b) - byDate(a));
  } else if (state.filters.sortBy === "oldest") {
    result.sort((a, b) => byDate(a) - byDate(b));
  } else if (state.filters.sortBy === "priceLow") {
    result.sort((a, b) => a.price - b.price);
  } else if (state.filters.sortBy === "priceHigh") {
    result.sort((a, b) => b.price - a.price);
  } else {
    result.sort((a, b) => byDate(b) - byDate(a));
  }

  return result;
}

function renderShopGrid() {
  const grid = document.getElementById("shopGrid");
  const loadWrap = document.getElementById("shopLoadMoreWrap");
  if (!grid || !loadWrap) {
    return;
  }

  const visible = state.filteredProducts.slice(0, state.visibleCount);
  if (visible.length === 0) {
    grid.innerHTML = `<div class="notice warning">No products match your filters.</div>`;
    loadWrap.innerHTML = "";
    return;
  }

  grid.innerHTML = visible.map((item) => renderProductCard(item)).join("");
  visible.forEach((item) => initCardCarousel(item.group_id, item.image_files));
  grid.querySelectorAll(".card").forEach((card) => {
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "link");
    const openDetails = () => {
      const groupId = card.getAttribute("data-id");
      if (groupId) {
        location.hash = `#/product/${encodeURIComponent(groupId)}`;
      }
    };
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, a, input, select, textarea")) {
        return;
      }
      openDetails();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetails();
      }
    });
  });
  grid.querySelectorAll(".card-action").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const card = button.closest(".card");
      if (!card) {
        return;
      }
      const groupId = card.getAttribute("data-id");
      const current = Number(state.cart[groupId] || 0);
      setCartQty(groupId, current + 1);
      openCartModal();
    });
  });

  grid.querySelectorAll(".card-enlarge-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const card = button.closest(".card");
      if (!card) {
        return;
      }
      const imageNode = card.querySelector("[data-main-image]");
      if (!imageNode || !imageNode.getAttribute("src")) {
        return;
      }
      const groupId = card.getAttribute("data-id");
      const product = state.filteredProducts.find((item) => item.group_id === groupId) || state.products.find((item) => item.group_id === groupId);
      const images = product && product.image_files.length > 0
        ? product.image_files.map((file) => imageUrl(file)).filter(Boolean)
        : [imageNode.getAttribute("src")];
      const currentSrc = imageNode.getAttribute("src");
      const startIndex = Math.max(0, images.findIndex((src) => src === currentSrc));
      const titleNode = card.querySelector(".card-title");
      openImageViewer(images, startIndex, titleNode ? titleNode.textContent : "Product image");
    });
  });

  if (state.visibleCount < state.filteredProducts.length) {
    loadWrap.innerHTML = `
      <div class="notice" style="text-align:center; margin-top: 0.3rem;">Loading more as you scroll...</div>
      <div id="shopLoadSentinel" style="height: 1px;"></div>
    `;
    setupShopAutoLoad();
  } else {
    loadWrap.innerHTML = "";
    teardownShopAutoLoad();
  }
}

function setupShopAutoLoad() {
  const sentinel = document.getElementById("shopLoadSentinel");
  if (!sentinel) {
    teardownShopAutoLoad();
    return;
  }

  teardownShopAutoLoad();
  shopLoadObserver = new IntersectionObserver(
    (entries) => {
      const first = entries[0];
      if (!first || !first.isIntersecting) {
        return;
      }

      if (state.visibleCount >= state.filteredProducts.length) {
        teardownShopAutoLoad();
        return;
      }

      state.visibleCount = Math.min(state.visibleCount + 24, state.filteredProducts.length);
      renderShopGrid();
    },
    {
      root: null,
      rootMargin: "320px 0px",
      threshold: 0.01
    }
  );

  shopLoadObserver.observe(sentinel);
}

function teardownShopAutoLoad() {
  if (shopLoadObserver) {
    shopLoadObserver.disconnect();
    shopLoadObserver = null;
  }
}

function renderProductCard(item) {
  const images = item.image_files.length > 0 ? item.image_files : [""];
  const firstImage = imageUrl(images[0]);
  const canEnlarge = Boolean(images[0]);
  const sizeText = splitSizes(item.size_mentions).slice(0, 1).map(formatSizeLabel).join(" ");
  const isSold = Boolean(item.caption_has_sold);
  const dots = images.length > 1
    ? `<div class="card-dots">${images.map((_, idx) => `<span class="card-dot ${idx === 0 ? "active" : ""}" data-dot="${idx}"></span>`).join("")}</div>`
    : "";

  return `
    <article class="card ${isSold ? "card-sold-out" : ""}" data-id="${escapeHtml(item.group_id)}">
      <div class="card-media-wrap">
        <img class="card-media" data-main-image src="${firstImage}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" />
        ${canEnlarge ? '<button class="card-enlarge-btn" type="button" aria-label="Enlarge image">⤢</button>' : ""}
        ${images.length > 1 ? `<div class="card-counter" data-counter>1/${images.length}</div>` : ""}
        ${dots}
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(item.title)}</div>
        <div class="card-bottom">
          <div class="card-price">${formatMoney(item.price)}</div>
          <div class="card-meta">
            ${sizeText ? `<span class="card-tag">${escapeHtml(sizeText)}</span>` : ""}
            ${isSold ? '<span class="card-tag sold-tag">Sold Out</span>' : ""}
          </div>
          <button class="card-action" type="button" ${isSold ? "disabled" : ""}>${isSold ? "Sold Out" : "+ Add to Order"}</button>
        </div>
      </div>
    </article>
  `;
}

function renderProductDetails(productId) {
  const targetId = String(productId || "").trim();
  const product = state.products.find((item) => String(item.group_id).trim() === targetId)
    || state.products.find((item) => String(item.group_id).trim().toLowerCase() === targetId.toLowerCase());

  if (!product) {
    app.innerHTML = `
      <section class="panel" style="max-width:760px; margin:1rem auto; text-align:center;">
        <h1>Product not found</h1>
        <p>The requested product is unavailable.</p>
        <button id="productNotFoundBackBtn" type="button">Back to shop</button>
      </section>`;
    document.getElementById("productNotFoundBackBtn")?.addEventListener("click", () => {
      location.hash = "#/shop";
    });
    return;
  }

  const imageFiles = Array.isArray(product.image_files)
    ? product.image_files.filter(Boolean)
    : parseImageFiles(product.image_files);
  if (imageFiles.length === 0 && product.primary_image_file) {
    imageFiles.push(product.primary_image_file);
  }
  const imageUrls = Array.from(new Set(imageFiles.map(imageUrl).filter(Boolean)));
  const parsedProductText = categorizeDescription(product.description || product.dress_description || "");
  const parsedMentions = splitSizes(parsedProductText.sizeMentions);
  const parsedSold = splitSizes(parsedProductText.soldSizes);
  const effectiveMentions = parsedMentions.length ? parsedMentions : splitSizes(product.size_mentions);
  const effectiveSold = parsedSold.length ? parsedSold : splitSizes(product.sold_sizes);
  const mentionedSizes = new Set(effectiveMentions);
  const soldSizes = new Set(effectiveSold);
  const sizes = SIZE_ORDER.filter((size) => mentionedSizes.has(size));
  const availableSizeCount = sizes.filter((size) => !soldSizes.has(size)).length;
  const fullySoldOut =
  Boolean(product.caption_has_sold) ||
  (sizes.length > 0 && availableSizeCount === 0);
  const description = String(product.dress_description || product.description || "").trim();
  const cleanTitle = String(product.title || "Untitled product")
    .replace(/^\s*sold\s*out\s*[❌✖✕x-]*\s*/i, "")
    .replace(/^\s*sold\s*[❌✖✕x-]*\s*/i, "")
    .trim() || "Product";

  const sizeMarkup = sizes.length
    ? sizes.map((size) => {
        const sold = soldSizes.has(size);
        return `<span class="detail-size ${sold ? "detail-size-sold" : ""}" ${sold ? 'aria-disabled="true" title="Sold out"' : ""}>
          <span>${escapeHtml(formatSizeLabel(size))}</span>
          ${sold ? '<small>Sold</small>' : ""}
        </span>`;
      }).join("")
    : '<span class="detail-size-empty">Size not specified</span>';

  const carouselMarkup = imageUrls.length
    ? `<div class="detail-carousel" id="detailCarousel">
        <img id="detailMainImage" class="detail-carousel-image" src="${escapeHtml(imageUrls[0])}" alt="${escapeHtml(cleanTitle)}" />
        <button id="detailEnlargeBtn" class="detail-enlarge" type="button" aria-label="Enlarge product image" title="Enlarge image"><span aria-hidden="true">⤢</span></button>
        ${imageUrls.length > 1 ? `
          <button id="detailPrevBtn" class="detail-arrow detail-arrow-prev" type="button" aria-label="Previous image"><span aria-hidden="true">˂</span></button>
          <button id="detailNextBtn" class="detail-arrow detail-arrow-next" type="button" aria-label="Next image"><span aria-hidden="true">˃</span></button>
          <span id="detailCounter" class="detail-counter">1 / ${imageUrls.length}</span>
          <div class="detail-dots" aria-label="Choose product image">
            ${imageUrls.map((_, index) => `<button type="button" class="detail-dot ${index === 0 ? "active" : ""}" data-detail-dot="${index}" aria-label="Show image ${index + 1}"></button>`).join("")}
          </div>` : ""}
      </div>
      ${imageUrls.length > 1 ? `<div class="detail-thumbnails">
        ${imageUrls.map((url, index) => `<button type="button" class="detail-thumb ${index === 0 ? "active" : ""}" data-detail-thumb="${index}" aria-label="Show image ${index + 1}"><img src="${escapeHtml(url)}" alt="" /></button>`).join("")}
      </div>` : ""}`
    : '<div class="detail-no-image">No product image</div>';

  app.innerHTML = `
    <style>
      .product-detail-page{max-width:1220px;margin:1rem auto;padding:0 1rem 2rem}
      .product-detail-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.9fr);gap:clamp(1.5rem,4vw,3.25rem);align-items:start}
      .detail-carousel{position:relative;display:grid;place-items:center;min-height:420px;overflow:hidden;border-radius:16px;background:#f5f3f1;touch-action:pan-y}
      .detail-carousel-image{display:block;width:100%;height:min(68vh,700px);object-fit:contain;cursor:zoom-in;user-select:none}
      .detail-arrow,.detail-enlarge{position:absolute;z-index:3;display:grid;place-items:center;border:0;border-radius:999px;background:rgba(255,255,255,.94);color:#231a16;box-shadow:0 6px 20px rgba(0,0,0,.2);cursor:pointer}
      .detail-arrow{top:50%;width:48px;height:48px;transform:translateY(-50%);font-size:2.3rem;line-height:1}
      .detail-arrow:hover{transform:translateY(-50%) scale(1.06)}
      .detail-arrow-prev{left:14px}.detail-arrow-next{right:14px}
      .detail-enlarge{top:14px;right:14px;width:44px;height:44px;font-size:1.35rem}
      .detail-enlarge:hover{transform:scale(1.06)}
      .detail-counter{position:absolute;right:14px;bottom:14px;padding:.42rem .72rem;border-radius:999px;background:rgba(25,19,16,.76);color:#fff;font-size:.82rem;font-weight:700}
      .detail-dots{position:absolute;bottom:18px;left:50%;display:flex;gap:7px;transform:translateX(-50%)}
      .detail-dot{width:10px;height:10px;min-width:10px;padding:0;border:1px solid #fff;border-radius:50%;background:rgba(40,30,25,.42);cursor:pointer}.detail-dot.active{background:#fff;transform:scale(1.25)}
      .detail-thumbnails{display:flex;gap:10px;margin-top:12px;padding-bottom:4px;overflow-x:auto}
      .detail-thumb{flex:0 0 auto;padding:2px;border:2px solid transparent;border-radius:10px;background:transparent;cursor:pointer}.detail-thumb.active{border-color:var(--brand,#7b916f)}
      .detail-thumb img{display:block;width:72px;height:72px;border-radius:7px;object-fit:cover}
      .detail-sizes{display:flex;flex-wrap:wrap;gap:9px;margin-top:9px}.detail-size{display:inline-flex;align-items:center;gap:6px;min-width:48px;justify-content:center;padding:.58rem .8rem;border:1px solid #cfc8c3;border-radius:9px;background:#fff;font-weight:700}
      .detail-size-sold{border-color:#d7d7d7;background:#e7e7e7;color:#8a8a8a;opacity:.78;text-decoration:line-through;cursor:not-allowed}.detail-size-sold small{font-size:.62rem;text-transform:uppercase;text-decoration:none}.detail-size-empty{color:#777}
      .detail-no-image{min-height:380px;display:grid;place-items:center;border-radius:16px;background:#f1f1f1}
      @media(max-width:820px){
        .product-detail-page{margin:.45rem auto;padding:0 .65rem 1.25rem}
        .product-detail-page>.secondary{margin-left:.1rem}
        .product-detail-page .panel{padding:1rem}
        .product-detail-grid{grid-template-columns:minmax(0,1fr);gap:1.2rem}
        .detail-carousel{width:100%;min-height:0;aspect-ratio:4/5;border-radius:13px}
        .detail-carousel-image{width:100%;height:100%;max-height:none;object-fit:contain}
        .detail-thumbnails{gap:7px;margin-top:8px}
        .detail-thumb img{width:58px;height:58px}
      }
      @media(max-width:520px){
        .product-detail-page{padding-inline:.45rem}
        .product-detail-page .panel{padding:.72rem;border-radius:12px}
        .product-detail-grid{gap:1rem}
        .detail-carousel{aspect-ratio:3/4;border-radius:11px}
        .detail-arrow{width:30px;height:30px;font-size:1rem;box-shadow:0 3px 10px rgba(0,0,0,.18)}
        .detail-arrow-prev{left:6px}.detail-arrow-next{right:6px}
        .detail-enlarge{top:7px;right:7px;width:30px;height:30px;font-size:.8rem;box-shadow:0 3px 10px rgba(0,0,0,.18)}
        .detail-counter{right:7px;bottom:8px;padding:.27rem .48rem;font-size:.68rem}
        .detail-dots{bottom:11px;gap:5px}
        .detail-dot{width:7px;height:7px;min-width:7px}
        .detail-thumbnails{gap:6px;scrollbar-width:thin}
        .detail-thumb{padding:1px;border-radius:8px}
        .detail-thumb img{width:49px;height:49px;border-radius:6px}
        .detail-sizes{gap:6px}
        .detail-size{min-width:40px;padding:.43rem .58rem;font-size:.82rem}
        .detail-size-sold small{font-size:.52rem}
        .product-detail-grid h1{font-size:clamp(1.45rem,7vw,1.85rem);line-height:1.15;margin-bottom:.45rem}
        .product-detail-grid p{font-size:.92rem;line-height:1.5}
        #addDetailToCartBtn{max-width:none!important;min-height:44px}
      }
      @media(max-width:360px){
        .product-detail-page{padding-inline:.25rem}
        .product-detail-page .panel{padding:.55rem}
        .detail-carousel{aspect-ratio:1/1.28}
        .detail-arrow{width:27px;height:27px;font-size:.88rem}
        .detail-enlarge{width:27px;height:27px;font-size:.72rem}
        .detail-counter{display:none}
        .detail-thumb img{width:44px;height:44px}
      }
    </style>
    <section class="product-detail-page">
      <button class="secondary" id="backToShopBtn" type="button" style="margin-bottom:1rem">← Back to shop</button>
      <article class="panel">
        <div class="product-detail-grid">
          <div>${carouselMarkup}</div>
          <div>
            <div style="font-size:1.6rem;font-weight:700;margin:.75rem 0">${formatMoney(product.price)}</div>
            ${description ? `<p style="white-space:pre-line;line-height:1.65">${escapeHtml(description)}</p>` : ""}
            <div style="margin:1.25rem 0"><strong>Sizes</strong><div class="detail-sizes">${sizeMarkup}</div></div>
            ${product.item_count ? `<p><strong>Items:</strong> ${Number(product.item_count)}</p>` : ""}
            ${fullySoldOut ? '<button type="button" disabled style="width:100%;max-width:360px">Sold Out</button>' : '<button id="addDetailToCartBtn" type="button" style="width:100%;max-width:360px">+ Add to Order</button>'}
            <div id="productDetailMessage" style="margin-top:1rem"></div>
          </div>
        </div>
      </article>
      <div id="cartModalRoot"></div><div id="imageViewerRoot"></div>
    </section>`;

  document.getElementById("backToShopBtn")?.addEventListener("click", () => { location.hash = "#/shop"; });

  let currentIndex = 0;
  let touchStartX = null;
  const paint = () => {
    const image = document.getElementById("detailMainImage");
    const counter = document.getElementById("detailCounter");
    if (image) image.src = imageUrls[currentIndex];
    if (counter) counter.textContent = `${currentIndex + 1} / ${imageUrls.length}`;
    document.querySelectorAll("[data-detail-dot]").forEach((node, index) => node.classList.toggle("active", index === currentIndex));
    document.querySelectorAll("[data-detail-thumb]").forEach((node, index) => node.classList.toggle("active", index === currentIndex));
  };
  const previous = () => { if (imageUrls.length > 1) { currentIndex = (currentIndex - 1 + imageUrls.length) % imageUrls.length; paint(); } };
  const next = () => { if (imageUrls.length > 1) { currentIndex = (currentIndex + 1) % imageUrls.length; paint(); } };

  document.getElementById("detailPrevBtn")?.addEventListener("click", previous);
  document.getElementById("detailNextBtn")?.addEventListener("click", next);
  document.querySelectorAll("[data-detail-dot],[data-detail-thumb]").forEach((node) => {
    node.addEventListener("click", () => { currentIndex = Number(node.dataset.detailDot ?? node.dataset.detailThumb); paint(); });
  });
  const carousel = document.getElementById("detailCarousel");
  carousel?.addEventListener("touchstart", (event) => { touchStartX = event.changedTouches[0].clientX; }, { passive:true });
  carousel?.addEventListener("touchend", (event) => {
    if (touchStartX === null) return;
    const dx = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 35) dx < 0 ? next() : previous();
    touchStartX = null;
  }, { passive:true });

  const enlarge = () => { if (imageUrls.length) openImageViewer(imageUrls, currentIndex, cleanTitle); };
  document.getElementById("detailEnlargeBtn")?.addEventListener("click", (event) => { event.stopPropagation(); enlarge(); });
  document.getElementById("detailMainImage")?.addEventListener("click", enlarge);

  document.getElementById("addDetailToCartBtn")?.addEventListener("click", () => {
    setCartQty(product.group_id, Number(state.cart[product.group_id] || 0) + 1);
    const message = document.getElementById("productDetailMessage");
    if (message) message.innerHTML = '<p class="notice">Product added to your order.</p>';
    openCartModal();
  });
  updateCartCount();
}

function initCardCarousel(groupId, images) {
  if (!images || images.length < 2) {
    return;
  }
  const card = document.querySelector(`.card[data-id="${cssEscape(groupId)}"]`);
  if (!card) {
    return;
  }
  const imageNode = card.querySelector("[data-main-image]");
  const counterNode = card.querySelector("[data-counter]");
  const dotNodes = Array.from(card.querySelectorAll("[data-dot]"));

  let index = 0;
  let startX = null;

  const paint = () => {
    imageNode.src = imageUrl(images[index]);
    if (counterNode) {
      counterNode.textContent = `${index + 1}/${images.length}`;
    }
    dotNodes.forEach((dot, idx) => dot.classList.toggle("active", idx === index));
  };

  const next = () => {
    index = (index + 1) % images.length;
    paint();
  };
  const prev = () => {
    index = (index - 1 + images.length) % images.length;
    paint();
  };

  imageNode.addEventListener("touchstart", (event) => {
    startX = event.changedTouches[0].clientX;
  }, { passive: true });
  imageNode.addEventListener("touchend", (event) => {
    if (startX === null) {
      return;
    }
    const dx = event.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 35) {
      if (dx < 0) {
        next();
      } else {
        prev();
      }
    }
    startX = null;
  }, { passive: true });
}

function openCartModal() {
  state.isCartModalOpen = true;
  renderCartModal();
}

function closeCartModal() {
  state.isCartModalOpen = false;
  const modalRoot = document.getElementById("cartModalRoot");
  if (modalRoot) {
    modalRoot.innerHTML = "";
  }
  if (location.hash !== "#/shop") {
    location.hash = "#/shop";
  }
}

function openImageViewer(images, startIndex, altText) {
  const viewerRoot = document.getElementById("imageViewerRoot");
  const safeImages = Array.isArray(images) ? images.filter(Boolean) : [];
  if (!viewerRoot || safeImages.length === 0) {
    return;
  }

  let currentIndex = Math.min(Math.max(Number(startIndex) || 0, 0), safeImages.length - 1);

  viewerRoot.innerHTML = `
    <div class="image-viewer-backdrop" id="imageViewerBackdrop"></div>
    <section class="image-viewer" role="dialog" aria-modal="true" aria-label="Enlarged product image">
      <div class="image-viewer-toolbar">
        <button class="secondary image-viewer-close" id="imageViewerCloseBtn" type="button" aria-label="Close">✕</button>
        <div class="image-viewer-counter" id="imageViewerCounter"></div>
      </div>
      <img class="image-viewer-image" id="imageViewerImage" src="" alt="${escapeHtml(altText || "Product image")}" />
      <div class="image-viewer-dots" id="imageViewerDots"></div>
    </section>
  `;

  const imageNode = document.getElementById("imageViewerImage");
  const counterNode = document.getElementById("imageViewerCounter");
  const dotsNode = document.getElementById("imageViewerDots");
  let swipeStartX = null;

  if (dotsNode) {
    dotsNode.innerHTML = safeImages.map((_, index) => (
      `<button class="image-viewer-dot ${index === currentIndex ? "active" : ""}" type="button" data-viewer-dot="${index}" aria-label="Go to image ${index + 1}"></button>`
    )).join("");
  }

  const paint = () => {
    imageNode.src = safeImages[currentIndex];
    counterNode.textContent = `${currentIndex + 1} / ${safeImages.length}`;
    if (dotsNode) {
      dotsNode.querySelectorAll("button[data-viewer-dot]").forEach((dot, index) => {
        dot.classList.toggle("active", index === currentIndex);
      });
    }
  };

  const closeViewer = () => {
    document.removeEventListener("keydown", onViewerKeydown);
    viewerRoot.innerHTML = "";
  };

  const showPrev = () => {
    currentIndex = (currentIndex - 1 + safeImages.length) % safeImages.length;
    paint();
  };

  const showNext = () => {
    currentIndex = (currentIndex + 1) % safeImages.length;
    paint();
  };

  const onViewerKeydown = (event) => {
    if (!viewerRoot.firstElementChild) {
      document.removeEventListener("keydown", onViewerKeydown);
      return;
    }
    if (event.key === "Escape") {
      closeViewer();
      return;
    }
    if (event.key === "ArrowLeft") {
      showPrev();
      return;
    }
    if (event.key === "ArrowRight") {
      showNext();
    }
  };

  paint();

  const closeButton = document.getElementById("imageViewerCloseBtn");
  if (closeButton) {
    closeButton.addEventListener("click", closeViewer);
  }

  if (dotsNode) {
    dotsNode.querySelectorAll("button[data-viewer-dot]").forEach((dot) => {
      dot.addEventListener("click", () => {
        const targetIndex = Number(dot.getAttribute("data-viewer-dot"));
        if (!Number.isNaN(targetIndex)) {
          currentIndex = Math.min(Math.max(targetIndex, 0), safeImages.length - 1);
          paint();
        }
      });
    });
  }

  imageNode.addEventListener("touchstart", (event) => {
    swipeStartX = event.changedTouches[0].clientX;
  }, { passive: true });

  imageNode.addEventListener("touchend", (event) => {
    if (swipeStartX === null) {
      return;
    }
    const swipeDelta = event.changedTouches[0].clientX - swipeStartX;
    if (Math.abs(swipeDelta) > 35) {
      if (swipeDelta < 0) {
        showNext();
      } else {
        showPrev();
      }
    }
    swipeStartX = null;
  }, { passive: true });

  const backdrop = document.getElementById("imageViewerBackdrop");
  if (backdrop) {
    backdrop.addEventListener("click", closeViewer);
  }

  document.addEventListener("keydown", onViewerKeydown);
}

function renderCart() {
  openCartModal();
}

function renderCartModal() {
  const modalRoot = document.getElementById("cartModalRoot");
  if (!modalRoot) {
    return;
  }

  const rows = getCartRows();
  const total = rows.reduce((sum, row) => sum + row.line_total, 0);

  modalRoot.innerHTML = `
    <div class="cart-modal-backdrop" id="cartModalBackdrop"></div>
    <section class="cart-modal" id="cartModalPanelRoot" role="dialog" aria-modal="true" aria-label="Cart and checkout">
      <article class="panel cart-modal-panel cart-items-panel">
        <div class="cart-modal-header-row">
          <h1>Checkout</h1>
          <button class="secondary" id="cartModalCloseBtn" type="button" aria-label="Close">✕</button>
        </div>
        <p>Cart total: <b>${formatMoney(total)}</b></p>
        <div id="cartRows"></div>
        <div class="field cart-clear-wrap">
          <div class="cart-clear-actions">
            <button class="danger" id="clearCartBtn">Clear order</button>
            <button id="checkoutPlaceOrderNavBtn" type="button">Place order</button>
          </div>
        </div>
      </article>

      <article class="panel cart-modal-panel" id="checkoutPanel">
        <div class="cart-modal-header-row">
          <h2>Place order</h2>
          <button class="secondary" id="checkoutPanelCloseBtn" type="button" aria-label="Close">✕</button>
        </div>
        <div class="field"><label for="customerName">Full name</label><input id="customerName" type="text" /></div>
        <div class="field"><label for="customerPhone">Phone number</label><input id="customerPhone" type="text" /></div>
        <div class="field"><label for="customerEmail">Email</label><input id="customerEmail" type="email" /></div>
        <div class="field"><label for="nzAddressLine1">Delivery address line</label><input id="nzAddressLine1" type="text" placeholder="Street number and street" /></div>
        <div class="field"><label for="nzSuburb">Suburb</label><input id="nzSuburb" type="text" placeholder="Suburb" /></div>
        <div class="field"><label for="nzCity">City</label><input id="nzCity" type="text" list="nzCityList" placeholder="Select or type city" /></div>
        <datalist id="nzCityList">${Object.keys(NZ_CITY_POSTCODE).map((city) => `<option value="${city.replaceAll("_", " ")}"></option>`).join("")}</datalist>
        <div class="field"><label for="nzPostcode">Postcode</label><input id="nzPostcode" type="text" maxlength="4" inputmode="numeric" placeholder="4-digit NZ postcode" /></div>
        <div class="field"><label for="nzCountry">Country</label><input id="nzCountry" type="text" value="New Zealand" readonly /></div>
        <div class="checkout-actions">
          <button id="placeOrderBtn">Place order</button>
          <button class="secondary" id="backToCartBtn" type="button">Back to cart</button>
        </div>
        <div id="orderMessage">${state.orderSuccessMessage ? `<p class="notice">${escapeHtml(state.orderSuccessMessage)}</p>` : ""}</div>
      </article>
    </section>
  `;

  const rowsWrap = document.getElementById("cartRows");
  if (rows.length === 0) {
    rowsWrap.innerHTML = `<div class="notice warning">Your cart is empty.</div>`;
  } else {
    rowsWrap.innerHTML = rows.map((row) => `
      <div class="cart-item">
        <img class="cart-thumb" src="${imageUrl(row.image)}" alt="${escapeHtml(row.title)}" />
        <div>
          <b>${escapeHtml(row.title)}</b>
          <p>${formatMoney(row.price)}</p>
          <p>Total: ${formatMoney(row.line_total)}</p>
        </div>
        <div>
          <label for="qty_${escapeHtml(row.group_id)}">Qty</label>
          <input id="qty_${escapeHtml(row.group_id)}" type="number" min="0" max="99" value="${row.qty}" data-qty-id="${escapeHtml(row.group_id)}" />
        </div>
      </div>
    `).join("");
  }

  rowsWrap.querySelectorAll("input[data-qty-id]").forEach((node) => {
    node.addEventListener("change", (event) => {
      setCartQty(event.target.getAttribute("data-qty-id"), Number(event.target.value || 0));
      renderCartModal();
    });
  });

  const closeBtn = document.getElementById("cartModalCloseBtn");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeCartModal);
  }

  const backdrop = document.getElementById("cartModalBackdrop");
  if (backdrop) {
    backdrop.addEventListener("click", closeCartModal);
  }

  window.onkeydown = (event) => {
    if (event.key === "Escape" && state.isCartModalOpen) {
      closeCartModal();
    }
  };

  const clearCartBtn = document.getElementById("clearCartBtn");
  if (clearCartBtn) {
    clearCartBtn.addEventListener("click", () => {
      clearCart();
      renderCartModal();
    });
  }

  const showPlaceOrderOnly = () => {
    const modalPanelRoot = document.getElementById("cartModalPanelRoot");
    const checkoutPanel = document.getElementById("checkoutPanel");
    if (modalPanelRoot) {
      modalPanelRoot.classList.add("order-only");
    }
    if (checkoutPanel) {
      checkoutPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const checkoutPlaceOrderNavBtn = document.getElementById("checkoutPlaceOrderNavBtn");
  if (checkoutPlaceOrderNavBtn) {
    checkoutPlaceOrderNavBtn.addEventListener("click", showPlaceOrderOnly);
  }

  const checkoutPanelCloseBtn = document.getElementById("checkoutPanelCloseBtn");
  if (checkoutPanelCloseBtn) {
    checkoutPanelCloseBtn.addEventListener("click", closeCartModal);
  }

  const nzSuburbInput = document.getElementById("nzSuburb");
  const nzCityInput = document.getElementById("nzCity");
  const nzPostcodeInput = document.getElementById("nzPostcode");
  if (nzPostcodeInput) {
    const autofillNzPostcode = () => {
      if (nzPostcodeInput.value.trim()) {
        return;
      }

      const suburbKey = normalizeNzPlace(nzSuburbInput ? nzSuburbInput.value : "");
      if (suburbKey && NZ_SUBURB_POSTCODE[suburbKey]) {
        nzPostcodeInput.value = NZ_SUBURB_POSTCODE[suburbKey];
        return;
      }

      const cityInputKey = normalizeNzPlace(nzCityInput ? nzCityInput.value : "");
      if (!cityInputKey) {
        return;
      }
      const matchedCityKey = Object.keys(NZ_CITY_POSTCODE).find((cityKey) => normalizeNzPlace(cityKey) === cityInputKey);
      if (matchedCityKey) {
        nzPostcodeInput.value = NZ_CITY_POSTCODE[matchedCityKey];
      }
    };

    if (nzSuburbInput) {
      nzSuburbInput.addEventListener("change", autofillNzPostcode);
      nzSuburbInput.addEventListener("blur", autofillNzPostcode);
    }
    if (nzCityInput) {
      nzCityInput.addEventListener("change", autofillNzPostcode);
      nzCityInput.addEventListener("blur", autofillNzPostcode);
    }
  }

  document.getElementById("placeOrderBtn").addEventListener("click", () => placeOrder(rows, total));
  const backToCartBtn = document.getElementById("backToCartBtn");
  if (backToCartBtn) {
    backToCartBtn.addEventListener("click", () => {
      const modalPanelRoot = document.getElementById("cartModalPanelRoot");
      if (modalPanelRoot) {
        modalPanelRoot.classList.remove("order-only");
      }
    });
  }
}

async function placeOrder(rows, total) {
  const name = document.getElementById("customerName").value.trim();
  const phone = document.getElementById("customerPhone").value.trim();
  const email = document.getElementById("customerEmail").value.trim();
  const addressLine1 = document.getElementById("nzAddressLine1").value.trim();
  const suburb = document.getElementById("nzSuburb").value.trim();
  const city = document.getElementById("nzCity").value.trim();
  const postcode = document.getElementById("nzPostcode").value.trim();
  const country = document.getElementById("nzCountry").value.trim() || "New Zealand";
  const address = [addressLine1, suburb, city, postcode, country].filter(Boolean).join(", ");
  const messageWrap = document.getElementById("orderMessage");
  state.orderSuccessMessage = "";

  if (!name || !phone || !email || !addressLine1 || !city || !postcode) {
    messageWrap.innerHTML = '<p class="notice error">Please complete name, phone, email, and NZ delivery address fields (line, city, postcode).</p>';
    return;
  }
  if (rows.length === 0) {
    messageWrap.innerHTML = '<p class="notice error">Your cart is empty.</p>';
    return;
  }

  const orderId = String(Math.floor(10000 + Math.random() * 90000));
  const payload = {
    order_id: orderId,
    created_utc: new Date().toISOString(),
    customer_name: name,
    customer_email: email,
    customer_phone: phone,
    address,
    total,
    items: rows
  };

  const emailItems = rows.map((row) => {
    const relativeImage = imageUrl(row.image || "");
    const absoluteImage = relativeImage ? new URL(relativeImage, location.href).toString() : "";
    return {
      ...row,
      image_url: absoluteImage
    };
  });

  const lines = rows.map((row) => `- ${row.title} | qty ${row.qty} | ${formatMoney(row.line_total)}`).join("%0D%0A");
  const body = [
    `Order ID: ${orderId}`,
    `Customer: ${name}`,
    `Customer email: ${email}`,
    `Phone: ${phone}`,
    `Address: ${address}`,
    "",
    "Items:",
    lines,
    "",
    `Grand total: ${formatMoney(total)}`
  ].join("%0D%0A");

  const plainBody = decodeURIComponent(body);
  try {
    await sendOrderEmailSecure({
      order_id: orderId,
      created_utc: payload.created_utc,
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      address,
      total,
      items: emailItems,
      body: plainBody
    });
  } catch {
    messageWrap.innerHTML = '<p class="notice error">Could not send order email from server. Please try again in a moment.</p>';
    return;
  }

    clearCart();

    const modalRoot = document.getElementById("cartModalRoot");

    if (modalRoot) {
    modalRoot.innerHTML = `
        <div class="cart-modal-backdrop"></div>
        <section class="cart-modal success-modal">
        <div class="panel" style="text-align:center; padding:2rem;">
            <div style="font-size:4rem; color:#28a745;">✓</div>
            <h2>Order Placed Successfully!</h2>
            <p>
            Thank you for your order.
            Details have been sent to your email address.
            </p>
            <p>
            <strong>Order ID:</strong> ${orderId}
            </p>
            <button id="successCloseBtn">
            Continue Shopping
            </button>
        </div>
        </section>
    `;

    document.getElementById("successCloseBtn")?.addEventListener("click", () => {
        closeCartModal();
    });
    }
}

async function sendOrderEmailSecure(orderPayload) {
  const response = await fetch(SECURE_ORDER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(orderPayload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Secure email relay failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

function renderStock() {
  ensureSessionValidity();
  if (!state.stockAuth) {
    app.innerHTML = `
      <section class="panel" style="max-width: 520px; margin: 1rem auto;">
        <h1>Stock login</h1>
        <div class="field"><label for="stockUser">Username</label><input id="stockUser" type="text" /></div>
        <div class="field"><label for="stockPass">Password</label><input id="stockPass" type="password" /></div>
        <button id="stockLoginBtn">Login</button>
      </section>
    `;

    document.getElementById("stockLoginBtn").addEventListener("click", () => {
      const user = document.getElementById("stockUser").value.trim();
      const pass = document.getElementById("stockPass").value;
      if (!user || !pass) {
        alert("Enter username and password");
        return;
      }
      startStockSession(user);
      renderStock();
    });
    return;
  }

  touchSession();

  const overview = buildStockOverview();
  const filtered = filterStockRows();

  app.innerHTML = `
    <section class="stock-layout">
      <article class="panel">
        <div class="stock-action-row">
          <button class="secondary" id="stockBackBtn">Back to shop</button>
          <button class="secondary" id="stockConvertBtn">Convert Insta Data</button>
          <button class="secondary" id="stockLogoutBtn">Logout</button>
        </div>
        <h1>Stock Info Studio</h1>
        <p>Filter, review, and update product stock details with parser-assisted fields.</p>
        <div class="metric-row">
          <div class="metric">Total products<b>${overview.total}</b></div>
          <div class="metric">Active products<b>${overview.active}</b></div>
          <div class="metric">Available stock<b>${overview.available}</b></div>
          <div class="metric">Sold out / unavailable<b>${overview.soldOut}</b></div>
        </div>
        <div id="stockConvertMessage"></div>
      </article>

      <article class="panel">
        <h2>Filters</h2>
        <div class="field"><label for="sfStock">Stock state</label>
          <select id="sfStock">
            <option value="all" ${state.stockFilters.stockState === "all" ? "selected" : ""}>All</option>
            <option value="available" ${state.stockFilters.stockState === "available" ? "selected" : ""}>Available</option>
            <option value="sold" ${state.stockFilters.stockState === "sold" ? "selected" : ""}>Sold out / unavailable</option>
          </select>
        </div>
        <div class="field"><label for="sfActive">Active flag</label>
          <select id="sfActive">
            <option value="all" ${state.stockFilters.activeState === "all" ? "selected" : ""}>All</option>
            <option value="active" ${state.stockFilters.activeState === "active" ? "selected" : ""}>Active only</option>
            <option value="inactive" ${state.stockFilters.activeState === "inactive" ? "selected" : ""}>Inactive only</option>
          </select>
        </div>
        <div class="field"><label for="sfSize">Size</label>
          <select id="sfSize">
            <option value="all" ${state.stockFilters.size === "all" ? "selected" : ""}>All sizes</option>
            ${SIZE_ORDER.map((size) => `<option value="${size}" ${state.stockFilters.size === size ? "selected" : ""}>${formatSizeLabel(size)}</option>`).join("")}
          </select>
        </div>
      </article>

      <article class="panel">
        <h2>Products</h2>
        <p>Select a product to open it in the product editor.</p>
        <div id="stockProductTable"></div>
      </article>
      <article class="panel" id="stockEditorPanel"></article>
    </section>
  `;

  document.getElementById("stockBackBtn").addEventListener("click", () => {
    location.hash = "#/shop";
  });

  const stockConvertBtn = document.getElementById("stockConvertBtn");
  if (stockConvertBtn) {
    stockConvertBtn.addEventListener("click", async () => {
      const messageNode = document.getElementById("stockConvertMessage");
      stockConvertBtn.disabled = true;
      if (messageNode) {
        messageNode.innerHTML = '<p class="notice">Converting Instagram data & updating Supabase database...</p>';
      }

      try {
        const result = await rebuildCatalogFromInstagram();
        if (messageNode) {
          const syncInfo = result.syncedToSupabase
            ? " All products synced to Supabase DB!"
            : "";
          messageNode.innerHTML = `<p class="notice">Catalog updated successfully (${result.count} products).${syncInfo}</p>`;
        }
        renderRoute();
      } catch (error) {
        if (messageNode) {
          messageNode.innerHTML = `<p class="notice error">Conversion failed: ${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
        }
      } finally {
        stockConvertBtn.disabled = false;
      }
    });
  }

  document.getElementById("stockLogoutBtn").addEventListener("click", () => {
    clearStockSession();
    renderStock();
  });

  wireStockFilter("#sfStock", "stockState");
  wireStockFilter("#sfActive", "activeState");
  wireStockFilter("#sfSize", "size");

  if (!state.selectedStockGroupId && filtered.length > 0) {
    state.selectedStockGroupId = filtered[0].group_id;
  }
  renderStockTable(filtered);
  renderStockEditor(filtered);
}

function renderStockTable(filteredRows) {
  const tableWrap = document.getElementById("stockProductTable");
  if (!tableWrap) {
    return;
  }
  if (filteredRows.length === 0) {
    tableWrap.innerHTML = '<p class="notice warning">No products match current filters.</p>';
    return;
  }
  tableWrap.innerHTML = `
    <div style="overflow-x:auto; max-height:520px; overflow-y:auto; border:1px solid #e2e2e2; border-radius:10px;">
      <table style="width:100%; border-collapse:collapse; min-width:760px;">
        <thead style="position:sticky; top:0; z-index:1; background:#f7f7f7;">
          <tr>
            <th style="padding:10px; text-align:center; border-bottom:1px solid #ddd; width:70px;">Select</th>
            <th style="padding:10px; text-align:left; border-bottom:1px solid #ddd; width:90px;">Photo</th>
            <th style="padding:10px; text-align:left; border-bottom:1px solid #ddd;">Product</th>
            <th style="padding:10px; text-align:left; border-bottom:1px solid #ddd;">Price</th>
            <th style="padding:10px; text-align:left; border-bottom:1px solid #ddd;">Sizes</th>
            <th style="padding:10px; text-align:left; border-bottom:1px solid #ddd;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${filteredRows.map((item) => {
            const previewFile = item.primary_image_file || item.image_files[0] || "";
            const previewUrl = imageUrl(previewFile);
            const isSelected = item.group_id === state.selectedStockGroupId;
            const sizes = splitSizes(item.size_mentions).map(formatSizeLabel).join(", ") || "Not set";
            const status = item.active ? "Active" : "Inactive";
            const thumbnail = previewUrl
              ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(item.title)}" style="width:64px; height:64px; object-fit:cover; border-radius:8px; display:block;" loading="lazy" />`
              : '<div style="width:64px; height:64px; border-radius:8px; background:#eee; display:grid; place-items:center; font-size:11px; text-align:center;">No image</div>';
            return `
              <tr data-stock-row="${escapeHtml(item.group_id)}" style="cursor:pointer; background:${isSelected ? "#eef6ff" : "transparent"};">
                <td style="padding:10px; text-align:center; border-bottom:1px solid #eee;">
                  <input type="radio" name="stockProductRadio" value="${escapeHtml(item.group_id)}" ${isSelected ? "checked" : ""} aria-label="Select ${escapeHtml(item.title)}" />
                </td>
                <td style="padding:10px; border-bottom:1px solid #eee;">${thumbnail}</td>
                <td style="padding:10px; border-bottom:1px solid #eee;">
                  <strong>${escapeHtml(item.title)}</strong>
                  <div style="font-size:12px; opacity:0.7; margin-top:3px;">${escapeHtml(item.group_id)}</div>
                </td>
                <td style="padding:10px; border-bottom:1px solid #eee;">${formatMoney(item.price)}</td>
                <td style="padding:10px; border-bottom:1px solid #eee;">${escapeHtml(sizes)}</td>
                <td style="padding:10px; border-bottom:1px solid #eee;">${status}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
  const selectProduct = (groupId) => {
    if (!groupId || groupId === state.selectedStockGroupId) {
      return;
    }
    state.selectedStockGroupId = groupId;
    renderStockTable(filteredRows);
    renderStockEditor(filteredRows);
    const editorPanel = document.getElementById("stockEditorPanel");
    if (editorPanel) {
      editorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  tableWrap.querySelectorAll('input[name="stockProductRadio"]').forEach((radio) => {
    radio.addEventListener("change", () => selectProduct(radio.value));
  });
  tableWrap.querySelectorAll("tr[data-stock-row]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === "radio") {
        return;
      }
      const groupId = row.getAttribute("data-stock-row");
      const radio = row.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
      }
      selectProduct(groupId);
    });
  });
}

function wireStockFilter(selector, field) {
  const node = document.querySelector(selector);
  if (!node) {
    return;
  }
  const handler = () => {
    state.stockFilters[field] = node.value;
    renderStock();
  };
  node.addEventListener("change", handler);
  if (node.tagName === "INPUT") {
    node.addEventListener("input", handler);
  }
}

function buildStockOverview() {
  const total = state.products.length;
  const active = state.products.filter((item) => item.active).length;
  const available = state.products.filter((item) => {
    const hasAvailable = availableSizes(item).length > 0;
    return item.active && (hasAvailable || !item.caption_has_sold);
  }).length;
  return {
    total,
    active,
    available,
    soldOut: total - available
  };
}

function filterStockRows() {
  let rows = [...state.products];
  const size = String(state.stockFilters.size || "all").toUpperCase();

  if (state.stockFilters.stockState === "available") {
    rows = rows.filter((item) => item.active && (availableSizes(item).length > 0 || !item.caption_has_sold));
  }
  if (state.stockFilters.stockState === "sold") {
    rows = rows.filter((item) => !(item.active && (availableSizes(item).length > 0 || !item.caption_has_sold)));
  }

  if (state.stockFilters.activeState === "active") {
    rows = rows.filter((item) => item.active);
  }
  if (state.stockFilters.activeState === "inactive") {
    rows = rows.filter((item) => !item.active);
  }

  if (size !== "ALL") {
    rows = rows.filter((item) => splitSizes(item.size_mentions).includes(size));
  }

  return rows;
}

function renderStockEditor(filteredRows) {
  const panel = document.getElementById("stockEditorPanel");
  if (!panel) {
    return;
  }

  const current = filteredRows.find((item) => item.group_id === state.selectedStockGroupId) || filteredRows[0];
  if (!current) {
    panel.innerHTML = '<p class="notice warning">No products match current filters.</p>';
    return;
  }

  state.selectedStockGroupId = current.group_id;


  const mentions = new Set(splitSizes(current.size_mentions));
  const sold = new Set(splitSizes(current.sold_sizes));
  const availableDefault = SIZE_ORDER.filter((size) => mentions.has(size) && !sold.has(size));
  const soldDefault = SIZE_ORDER.filter((size) => sold.has(size));
  const parsed = categorizeDescription(current.description);
  const previewFile = current.primary_image_file || current.image_files[0] || "";
  const previewUrl = imageUrl(previewFile);
  const imagePane = previewUrl
    ? `<img class="stock-editor-image" src="${escapeHtml(previewUrl)}" alt="${escapeHtml(current.group_id)}" />`
    : '<div class="stock-editor-image-placeholder">No image selected</div>';

  panel.innerHTML = `
    <h2>Product editor</h2>
    <p>Filtered products: <b>${filteredRows.length}</b></p>
    <div class="notice" style="margin-bottom:1rem;">
      Editing: <strong>${escapeHtml(current.title)}</strong>
      <span style="opacity:0.7;">(${escapeHtml(current.group_id)})</span>
    </div>
    <div class="stock-editor-split">
      <aside class="stock-editor-media">
        ${imagePane}
        <p class="stock-editor-image-label">${escapeHtml(previewFile || "No primary image file")}</p>
      </aside>

      <div class="stock-editor-form">
        <div class="field">
          <label for="seDescription">Description</label>
          <textarea id="seDescription" rows="8">${escapeHtml(current.description)}</textarea>
        </div>

        <div class="field">
          <label>Available sizes</label>
          <div class="size-check-row">
            ${SIZE_ORDER.map((size) => `<label class="inline-check"><input type="checkbox" data-se-available="${size}" ${availableDefault.includes(size) ? "checked" : ""} /> ${formatSizeLabel(size)}</label>`).join("")}
          </div>
        </div>

        <div class="field">
          <label>Sold sizes</label>
          <div class="size-check-row">
            ${SIZE_ORDER.map((size) => `<label class="inline-check"><input type="checkbox" data-se-sold="${size}" ${soldDefault.includes(size) ? "checked" : ""} /> ${formatSizeLabel(size)}</label>`).join("")}
          </div>
        </div>

        <div class="field"><label for="seItemCount">Item count</label><input id="seItemCount" type="number" min="0" max="999" value="${current.item_count}" /></div>
        <div class="field"><label for="sePrice">Price</label><input id="sePrice" type="number" min="0" step="0.5" value="${current.price}" /></div>
        <label class="inline-check"><input id="seActive" type="checkbox" ${current.active ? "checked" : ""} /> Active</label>
        <label class="inline-check"><input id="seCaptionSold" type="checkbox" ${current.caption_has_sold ? "checked" : ""} /> Mark as Sold Out</label>

        <div class="field"><label for="sePrimary">Primary image file</label><input id="sePrimary" type="text" value="${escapeHtml(current.primary_image_file)}" /></div>
        <div class="field"><label for="seImages">Image files (semicolon separated)</label><textarea id="seImages" rows="3">${escapeHtml(current.image_files.join(";"))}</textarea></div>

        <h3>Auto-derived stock fields (from description)</h3>
        <p>Dress description: ${escapeHtml(parsed.dressDescription || "")}</p>
        <p>Sizes from parser: ${escapeHtml(parsed.sizeMentions || "")}</p>
        <p>Sold sizes from parser: ${escapeHtml(parsed.soldSizes || "")}</p>

        <div class="field">
          <button id="saveStockBtn">Update product</button>
        </div>
        <div id="stockSaveMessage"></div>
      </div>
    </div>
  `;


  document.getElementById("saveStockBtn").addEventListener("click", async () => {
    const description = document.getElementById("seDescription").value;
    const availableSizesSelected = Array.from(document.querySelectorAll("input[data-se-available]:checked")).map((node) => node.getAttribute("data-se-available"));
    const soldSizesSelected = Array.from(document.querySelectorAll("input[data-se-sold]:checked")).map((node) => node.getAttribute("data-se-sold"));

    const orderedMentions = SIZE_ORDER.filter((size) => availableSizesSelected.includes(size) || soldSizesSelected.includes(size));
    const orderedSold = SIZE_ORDER.filter((size) => soldSizesSelected.includes(size));

    const patch = {
      description,
      size_mentions: orderedMentions.join(";"),
      sold_sizes: orderedSold.join(";"),
      item_count: Number(document.getElementById("seItemCount").value || 0),
      price: Number(document.getElementById("sePrice").value || 0),
      active: document.getElementById("seActive").checked,
      caption_has_sold: document.getElementById("seCaptionSold").checked || orderedSold.length > 0,
      primary_image_file: document.getElementById("sePrimary").value.trim(),
      image_files: document.getElementById("seImages").value.split(";").map((part) => part.trim()).filter(Boolean)
    };

    const saveButton = document.getElementById("saveStockBtn");
    const messageNode = document.getElementById("stockSaveMessage");
    const previousProducts = state.products;
    const updatedProducts = state.products.map((item) => item.group_id === current.group_id ? { ...item, ...patch } : item);
    saveButton.disabled = true;
    saveButton.textContent = "Updating Excel...";
    messageNode.innerHTML = '<p class="notice">Updating product_info/product_catalog.xlsx...</p>';
    try {
      await saveCatalogToServer(updatedProducts);
      state.products = updatedProducts;
      state.stockEdits = {};
      localStorage.removeItem(EDITS_KEY);
      saveCatalogCache(state.products);
      renderStock();
      const refreshedMessage = document.getElementById("stockSaveMessage");
      if (refreshedMessage) {
        refreshedMessage.innerHTML = '<p class="notice">Product updated successfully in product_info/product_catalog.xlsx.</p>';
      }
    } catch (error) {
      state.products = previousProducts;
      saveButton.disabled = false;
      saveButton.textContent = "Update product";
      messageNode.innerHTML = `<p class="notice error">Could not update the Excel file: ${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
    }
  });
}

function imageUrl(fileName) {
  if (!fileName) {
    return "";
  }
  return `pictures_from_insta/${encodeURIComponent(fileName)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nl2br(value) {
  return String(value || "").replaceAll("\n", "<br />");
}

function cssEscape(value) {
  return String(value).replace(/([#.;?+*~':"!^$\[\]()=>|/ @])/g, "\\$1");
}

function downloadJson(fileName, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
