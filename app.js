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
    stockFilter: "available",
    sortBy: "newest"
  },
  stockFilters: {
    stockState: "all",
    activeState: "all",
    size: "all"
  },
  stockTab: "products",
  ordersList: [],
  shippingMethod: "normal",
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
    .shop-layout {
      min-height: calc(100vh - 1.6rem);
      display: flex;
      flex-direction: column;
    }
    .about-wrap {
      margin-top: auto;
    }
    .shop-grid-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }
    .shop-grid-header p {
      margin: 0;
      color: #ffffff;
      font-weight: 500;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
    }
    #shopNavCartBtn {
      flex: 0 0 auto;
      width: auto;
      min-width: 0;
      min-height: 32px;
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      font-size: 0.82rem;
      line-height: 1;
      white-space: nowrap;
    }
    .cart-pill-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      margin-left: 4px;
      border-radius: 999px;
      background: rgba(123, 145, 111, 0.16);
    }
    .about-footer {
      margin-top: 1.25rem;
      padding: 0.9rem 0;
      border-top: 1px solid var(--line);
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: nowrap;
      text-align: center;
      color: #f5f2eb;
      text-shadow: 0 1px 2px rgba(0,0,0,0.6);
    }
    .about-footer a,
    .about-footer #footerLoginBtn {
      color: #e5e0d3;
      text-decoration: none;
      white-space: nowrap;
      font-size: 0.9rem;
      font-weight: 500;
    }
    .about-footer a:hover,
    .about-footer #footerLoginBtn:hover {
      text-decoration: underline;
      color: #ffffff;
    }
    .footer-separator {
      opacity: .6;
      user-select: none;
    }
    .about-footer #footerLoginBtn {
      background:none;
      border:none;
      padding:0;
      margin:0;
      min-height:0;
      box-shadow:none;
      cursor:pointer;
    }
    @media (max-width: 700px) {
      .about-footer {
        gap: 0.4rem;
        font-size: 0.8rem;
      }
      .about-footer a,
      .about-footer #footerLoginBtn {
        font-size: 0.8rem;
      }
      .shop-grid-header {
        gap: 0.5rem;
        margin-bottom: 0.6rem;
      }
      #shopNavCartBtn {
        min-height: 30px;
        padding: 0.32rem 0.65rem;
        font-size: 0.78rem;
      }
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

  return payload.products.map(normalizeCatalogProduct).map((product) => {
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
        return result.products.map(normalizeCatalogProduct);
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
  return parseExcelBufferToCatalog(buffer);
}

function parseExcelBufferToCatalog(buffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new Error("Excel workbook has no sheets.");
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });
  if (rows.length === 0) {
    throw new Error("Excel workbook contains no rows.");
  }

  const hasCatalogCols = rows.some((r) => Boolean(r.group_id || r.product_date || r.primary_image_file || r.item_count));
  if (!hasCatalogCols && rows.some((r) => Boolean(r.caption || r.media_id || r.id))) {
    return normalizeInstagramRowsToCatalog(rows);
  }

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
      caption_has_sold: boolFromCell(row.caption_has_sold, false),
      item_count: Number(row.item_count || imageFiles.length || 1),
      active: row.active === "" ? true : boolFromCell(row.active, true)
    };
  });
}

async function syncExcelDataToDatabase(options = {}) {
  let buffer;
  let sourceName = "product_catalog.xlsx";

  if (options.file && options.file instanceof File) {
    sourceName = options.file.name;
    buffer = await options.file.arrayBuffer();
  } else {
    const targetUrl = options.url || CATALOG_URL;
    sourceName = targetUrl;
    const response = await fetch(`${targetUrl}${targetUrl.includes("?") ? "&" : "?"}v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${targetUrl}`);
    }
    buffer = await response.arrayBuffer();
  }

  const incomingProducts = parseExcelBufferToCatalog(buffer);
  if (!incomingProducts || incomingProducts.length === 0) {
    throw new Error("No products found in Excel sheet.");
  }

  // Identify existing products to strictly preserve existing data without overwriting
  const existingGroupIdSet = new Set((state.products || []).map((p) => String(p.group_id)));
  const newOnlyProducts = incomingProducts.filter((item) => !existingGroupIdSet.has(String(item.group_id)));
  const skippedCount = incomingProducts.length - newOnlyProducts.length;

  // Format new products with joined image_files for database table insertion
  const payloadProducts = (newOnlyProducts.length > 0 ? newOnlyProducts : incomingProducts).map((item) => ({
    ...item,
    image_files: Array.isArray(item.image_files) ? item.image_files.join(";") : String(item.image_files || "")
  }));

  // Send product records to DB table with mode="insert_only"
  let syncedToSupabase = false;
  let insertedCount = newOnlyProducts.length;
  try {
    const syncRes = await fetch(CATALOG_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        products: payloadProducts,
        mode: "insert_only"
      })
    });
    if (syncRes.ok) {
      const syncResult = await syncRes.json();
      if (syncResult.ok) {
        syncedToSupabase = true;
        if (typeof syncResult.insertedCount === "number") {
          insertedCount = syncResult.insertedCount;
        }
      }
    }
  } catch (err) {
    console.warn("Direct DB sync API call error:", err);
  }

  // Only append genuinely new products to local state; preserve all existing product state and pricing
  if (newOnlyProducts.length > 0) {
    const formattedNew = newOnlyProducts.map((item) => ({
      ...item,
      image_files: parseImageFiles(item.image_files)
    }));
    state.products = [...state.products, ...formattedNew];
    saveCatalogCache(state.products);
    applyStockEdits();
    updateCartCount();
  }

  return {
    sourceName,
    insertedCount,
    skippedCount,
    total: state.products.length,
    syncedToSupabase
  };
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
function normalizeCatalogProduct(product) {
  const normalized = { ...product };
  normalized.group_id = String(normalized.group_id || "").trim();
  normalized.image_files = Array.isArray(normalized.image_files)
    ? normalized.image_files.filter(Boolean)
    : parseImageFiles(normalized.image_files);
  normalized.active = boolFromCell(normalized.active, true);
  normalized.caption_has_sold = boolFromCell(normalized.caption_has_sold, false);
  normalized.size_mentions = splitSizes(normalized.size_mentions).join(";");
  normalized.sold_sizes = splitSizes(normalized.sold_sizes).join(";");
  return normalized;
}
function isProductSoldOut(item) {
  if (!item || !boolFromCell(item.active, true)) return true;
  if (boolFromCell(item.caption_has_sold, false)) return true;
  const mentioned = splitSizes(item.size_mentions);
  if (mentioned.length === 0) return false;
  const sold = new Set(splitSizes(item.sold_sizes));
  return mentioned.every((size) => sold.has(size));
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
      price: Number(pickFirstValue(first, ["price"])) || computeDefaultPrice(title, caption, pickFirstValue(first, ["tags"]) || parsed.tags, imageFiles.length),
      caption_has_sold: boolFromCell(first.caption_has_sold, soldSizesSheet ? true : false),
      item_count: Number(pickFirstValue(first, ["item_count"]) || imageFiles.length || 1),
      active: boolFromCell(first.active, true)
    };
  });
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback to execCommand below
  }
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    textArea.remove();
    return successful;
  } catch {
    return false;
  }
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
  Object.entries(state.cart).forEach(([cartKey, qtyRaw]) => {
    const qty = Number(qtyRaw || 0);
    if (qty <= 0) {
      return;
    }
    const [groupId, size] = cartKey.split("::");
    const product = state.products.find((p) => p.group_id === groupId);
    if (!product) {
      return;
    }
    rows.push({
      cartKey,
      group_id: groupId,
      size: size || "",
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

function setCartQty(cartKey, qty) {
  const value = Math.max(0, Number(qty || 0));
  if (value <= 0) {
    delete state.cart[cartKey];
  } else {
    state.cart[cartKey] = value;
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
        <details class="shop-filters-parent">
          <summary class="shop-filters-summary">
            <span class="filters-title">Filters</span>
          </summary>
          <div class="shop-filters-group">
            <div class="filter-field">
              <label for="fSize" class="filter-label">Size</label>
              <select id="fSize" class="shop-filter-select">
                <option value="all" ${selectedSize === "all" ? "selected" : ""}>All sizes</option>
                ${SIZE_ORDER.map((size) => `<option value="${size}" ${selectedSize === size ? "selected" : ""}>${formatSizeLabel(size)}</option>`).join("")}
              </select>
            </div>

            <div class="filter-field">
              <label for="fStock" class="filter-label">Stock</label>
              <select id="fStock" class="shop-filter-select">
                <option value="available" ${state.filters.stockFilter === "available" ? "selected" : ""}>In Stock</option>
                <option value="sold" ${state.filters.stockFilter === "sold" ? "selected" : ""}>Sold Out</option>
              </select>
            </div>

            <div class="filter-field">
              <label for="fSort" class="filter-label">Sort</label>
              <select id="fSort" class="shop-filter-select">
                <option value="newest" ${state.filters.sortBy === "newest" ? "selected" : ""}>Newest</option>
                <option value="oldest" ${state.filters.sortBy === "oldest" ? "selected" : ""}>Oldest</option>
                <option value="priceLow" ${state.filters.sortBy === "priceLow" ? "selected" : ""}>Price low to high</option>
                <option value="priceHigh" ${state.filters.sortBy === "priceHigh" ? "selected" : ""}>Price high to low</option>
              </select>
            </div>
          </div>
        </details>
      </div>

      <section class="panel shop-grid-panel">
        <div class="shop-grid-header">
          <p>${filtered.length} products found</p>
          <button class="secondary" id="shopNavCartBtn" type="button">Cart <span class="cart-pill-count" data-cart-count>0</span></button>
        </div>
        <div id="shopGrid" class="grid"></div>
        <div id="shopLoadMoreWrap" class="field"></div>
      </section>

      <section class="about-wrap">
        <article class="about-content">
          <div class="about-media">
            ${aboutPhotoMarkup}
          </div>
          <div class="about-copy">
            <p>Hey there!</p>
            <p>I'm <a href="#/stock" id="chelsiiLoginBtn" style="color:inherit; text-decoration:none; cursor:pointer;">Chelsii</a></p>
            <p>
            Curated Kadha began as a spark of passion, a dream born from my love for meaningful design and the joy of discovering pieces that just feel right.
            </p>
            <p>
            When I first thought about starting a business, I listed everything that truly inspired me, and fashion, with its blend of art, culture, and emotion, stood out.
            </p>
            <p>
            At Curated Kadha, every piece tells a story of culture, craftsmanship, and conscious style. Rooted in a love for timeless design and thoughtful details, each piece is chosen to celebrate individuality and comfort, made for slow mornings, festive evenings, and everything in between.
            </p>
            <p>
            Based in New Zealand, we work closely with artisans and small creatives to bring you unique, sustainable pieces. Most of our collections are carefully curated by us, while some are thoughtfully sourced from other creators, all chosen to share something truly special.
            </p>
            <p>
            Curated pieces, thoughtfully chosen ✨
            </p>
          </div>
        </article>
        <!-- Removed duplicate closing article tag -->
        <footer class="about-footer">
          <div class="footer-line">
            <a href="https://www.instagram.com/curatedkadha/" target="_blank" rel="noopener noreferrer">
              📷 @curatedkadha
            </a>
            <span class="footer-separator">|</span>
            <a href="https://www.facebook.com/share/1HZqjVJfEM/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer">
              📘 Curated Kadha
            </a>
            <span class="footer-separator">|</span>
            <a href="mailto:info@curatedkadha.com">
              ✉️ info@curatedkadha.com
            </a>
          </div>
        </footer>
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
      node.addEventListener("change", fn)
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
  wire("#fStock", (event) => {
    state.filters.stockFilter = event.target.value;
    state.visibleCount = 24;
    renderShop();
  });

  wire("#fSort", (event) => {
    state.filters.sortBy = event.target.value;
    renderShop();
  });

  const chelsiiLoginBtn = document.getElementById("chelsiiLoginBtn");
  if (chelsiiLoginBtn) {
    chelsiiLoginBtn.addEventListener("click", () => {
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

  if (state.filters.stockFilter === "available") {
    result = result.filter((item) => !isProductSoldOut(item));
  } else if (state.filters.stockFilter === "sold") {
    result = result.filter((item) => isProductSoldOut(item));
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
      const product = state.products.find((p) => p.group_id === groupId);
      const avail = product ? availableSizes(product) : [];
      const defaultSize = avail.length > 0 ? avail[0] : "";
      const cartKey = defaultSize ? `${groupId}::${defaultSize}` : groupId;
      const current = Number(state.cart[cartKey] || 0);
      setCartQty(cartKey, current + 1);
      openCartModal();
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
  const availSizes = availableSizes(item);
  const sizeText = availSizes.map(formatSizeLabel).join(", ");
  const isSold = isProductSoldOut(item);
  const dots = images.length > 1
    ? `<div class="card-dots">${images.map((_, idx) => `<span class="card-dot ${idx === 0 ? "active" : ""}" data-dot="${idx}"></span>`).join("")}</div>`
    : "";

  return `
    <article class="card ${isSold ? "card-sold-out" : ""}" data-id="${escapeHtml(item.group_id)}">
      <div class="card-media-wrap">
        <img class="card-media" data-main-image src="${firstImage}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" />
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

  const allSizesSet = new Set([...effectiveMentions, ...effectiveSold]);
  const sizes = SIZE_ORDER.filter((size) => allSizesSet.has(size));
  Array.from(allSizesSet).forEach((size) => {
    if (size && !sizes.includes(size)) {
      sizes.push(size);
    }
  });

  const availableSizes = sizes.filter((size) => !soldSizes.has(size));
  const soldSizesList = sizes.filter((size) => soldSizes.has(size));
  const availableSizeCount = availableSizes.length;
  const fullySoldOut =
    Boolean(product.caption_has_sold) ||
    (sizes.length > 0 && availableSizeCount === 0);
  const description = String(product.dress_description || product.description || "").trim();
  const cleanTitle = String(product.title || "Untitled product")
    .replace(/^\s*sold\s*out\s*[❌✖✕x-]*\s*/i, "")
    .replace(/^\s*sold\s*[❌✖✕x-]*\s*/i, "")
    .trim() || "Product";

  let selectedSize = availableSizes.length > 0 ? availableSizes[0] : (sizes[0] || "");

  const sizeMarkup = sizes.length
    ? sizes.map((size) => {
        const sold = soldSizes.has(size);
        const isSelected = size === selectedSize;
        return `<button type="button" class="detail-size ${sold ? "detail-size-sold" : "detail-size-avail"} ${isSelected ? "selected" : ""}" data-size="${escapeHtml(size)}" ${sold ? 'disabled aria-disabled="true" title="Sold out"' : ""}>
          <span>${escapeHtml(formatSizeLabel(size))}</span>
          ${sold ? '<small class="sold-tag">Sold</small>' : ""}
        </button>`;
      }).join("")
    : '<span class="detail-size-empty">Size not specified</span>';

  const carouselMarkup = imageUrls.length
    ? `<div class="detail-carousel" id="detailCarousel">
        <div class="detail-pill-actions">
          <button id="detailClosePillBtn" class="detail-pill-btn" type="button" aria-label="Close product info" title="Close">
            <span aria-hidden="true" class="detail-pill-close-x">✕</span>
          </button>
          <button id="detailCopyLinkPillBtn" class="detail-pill-btn" type="button" aria-label="Copy product link" title="Copy product link">
            <span id="detailLinkSymbol" aria-hidden="true" class="detail-pill-link-sym">🔗</span>
          </button>
        </div>
        <img id="detailMainImage" class="detail-carousel-image" src="${escapeHtml(imageUrls[0])}" alt="${escapeHtml(cleanTitle)}" />
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
    : `<div class="detail-no-image" style="position:relative">
        <div class="detail-pill-actions">
          <button id="detailClosePillBtn" class="detail-pill-btn" type="button" aria-label="Close product info" title="Close">
            <span aria-hidden="true" class="detail-pill-close-x">✕</span>
          </button>
          <button id="detailCopyLinkPillBtn" class="detail-pill-btn" type="button" aria-label="Copy product link" title="Copy product link">
            <span id="detailLinkSymbol" aria-hidden="true" class="detail-pill-link-sym">🔗</span>
          </button>
        </div>
        No product image
      </div>`;

  app.innerHTML = `
    <style>
      .product-detail-page{max-width:1220px;margin:1rem auto 2rem;padding:0 1.25rem 2.5rem}
      .product-detail-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,.9fr);gap:clamp(1.75rem,4.5vw,3.5rem);align-items:start}
      .detail-carousel{position:relative;display:grid;place-items:center;min-height:420px;overflow:hidden;border-radius:16px;background:#f5f3f1;touch-action:pan-y}
      .detail-pill-actions{position:absolute;top:12px;right:12px;z-index:10;display:flex;flex-direction:column;gap:8px}
      .detail-pill-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:1px solid rgba(0,0,0,0.09);border-radius:999px;background:rgba(255,255,255,0.94);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#332d27;box-shadow:0 2px 8px rgba(0,0,0,0.12);cursor:pointer;transition:all 0.15s ease}
      .detail-pill-btn:hover{background:#ffffff;color:#000000;transform:scale(1.08);box-shadow:0 4px 12px rgba(0,0,0,0.18)}
      .detail-pill-btn:active{transform:scale(0.95)}
      .detail-pill-btn.copied{background:#eef6eb;color:#284521;border-color:#84a97b}
      .detail-pill-close-x{font-size:0.78rem;font-weight:700;line-height:1}
      .detail-pill-link-sym{font-size:0.78rem;line-height:1}
      .detail-carousel-image{display:block;width:100%;height:min(68vh,700px);object-fit:contain;user-select:none}
      .detail-arrow{position:absolute;z-index:3;display:grid;place-items:center;border:0;border-radius:999px;background:rgba(255,255,255,.94);color:#231a16;box-shadow:0 6px 20px rgba(0,0,0,.2);cursor:pointer}
      .detail-arrow{top:50%;width:48px;height:48px;transform:translateY(-50%);font-size:2.3rem;line-height:1}
      .detail-arrow:hover{transform:translateY(-50%) scale(1.06)}
      .detail-arrow-prev{left:14px}.detail-arrow-next{right:14px}
      .detail-counter{position:absolute;right:14px;bottom:14px;padding:.42rem .72rem;border-radius:999px;background:rgba(25,19,16,.76);color:#fff;font-size:.82rem;font-weight:700}
      .detail-dots{position:absolute;bottom:18px;left:50%;display:flex;gap:7px;transform:translateX(-50%)}
      .detail-dot{width:10px;height:10px;min-width:10px;padding:0;border:1px solid #fff;border-radius:50%;background:rgba(40,30,25,.42);cursor:pointer}.detail-dot.active{background:#fff;transform:scale(1.25)}
      .detail-thumbnails{display:flex;gap:10px;margin-top:14px;padding-bottom:4px;overflow-x:auto}
      .detail-thumb{flex:0 0 auto;padding:2px;border:2px solid transparent;border-radius:10px;background:transparent;cursor:pointer}.detail-thumb.active{border-color:var(--brand,#7b916f)}
      .detail-thumb img{display:block;width:72px;height:72px;border-radius:7px;object-fit:cover}
      .detail-price-tag{font-size:1.65rem;font-weight:700;color:#24201c;margin:0.85rem 0 1.25rem;line-height:1.2}
      .detail-description{font-size:1rem;white-space:pre-line;line-height:1.8;color:#3d3630;margin:0 0 1.5rem;letter-spacing:0.01em}
      .detail-section-block{margin:1.6rem 0}
      .detail-section-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.6rem}
      .detail-sizes{display:flex;flex-wrap:wrap;gap:10px;margin-top:0.4rem}
      .detail-size{display:inline-flex;align-items:center;gap:6px;min-width:48px;justify-content:center;padding:.58rem .85rem;border:1px solid #cfc8c3;border-radius:9px;background:#fff;font-weight:700;line-height:1.3}
      .detail-size-sold{border-color:#e0d0cb;background:#f8ece8;color:#934638;opacity:.88;cursor:not-allowed}
      .detail-size-sold small{font-size:.62rem;text-transform:uppercase;background:#e8cfc9;color:#782c1f;padding:0.12rem 0.35rem;border-radius:4px;font-weight:700}
      .detail-size-avail{border-color:#cbd6c3;background:#f7fbf4;color:#284521}
      .detail-size-empty{color:#777;line-height:1.6}
      .detail-sold-banner{margin-top:0.9rem;padding:0.65rem 0.85rem;border-radius:8px;background:#fdf2f0;border:1px solid #f2d4ce;font-size:0.88rem;line-height:1.6;color:#802b20}
      .detail-size-chart-details{margin-top:1.2rem;border:1px solid #e2dad2;border-radius:10px;overflow:hidden;background:#faf8f5}
      .detail-size-chart-summary{padding:0.7rem 1rem;font-weight:600;font-size:0.9rem;color:var(--brand,#7b916f);cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:space-between;list-style:none}
      .detail-size-chart-summary::-webkit-details-marker{display:none}
      .detail-size-chart-summary::after{content:"▼";font-size:0.7rem;margin-left:0.5rem;transition:transform 0.2s ease}
      .detail-size-chart-details[open] .detail-size-chart-summary::after{content:"▲"}
      .detail-size-chart-body{padding:0.8rem 1rem 1rem;border-top:1px solid #e2dad2;text-align:center;background:#ffffff}
      .detail-size-chart-img{max-width:100%;height:auto;border-radius:8px;display:block;margin:0 auto}
      .detail-no-image{min-height:380px;display:grid;place-items:center;border-radius:16px;background:#f1f1f1}
      @media(max-width:820px){
        .product-detail-page{margin:.5rem auto;padding:0 .75rem 1.5rem}
        .product-detail-page .panel{padding:1.15rem}
        .product-detail-grid{grid-template-columns:minmax(0,1fr);gap:1.35rem}
        .detail-carousel{width:100%;min-height:0;aspect-ratio:4/5;border-radius:13px}
        .detail-carousel-image{width:100%;height:100%;max-height:none;object-fit:contain}
        .detail-thumbnails{gap:8px;margin-top:10px}
        .detail-thumb img{width:58px;height:58px}
        .detail-description{line-height:1.75;margin-bottom:1.25rem}
      }
      @media(max-width:520px){
        .product-detail-page{padding-inline:.45rem}
        .product-detail-page .panel{padding:.85rem;border-radius:12px}
        .product-detail-grid{gap:1.15rem}
        .detail-carousel{aspect-ratio:3/4;border-radius:11px}
        .detail-pill-actions{top:9px;right:9px;gap:7px}
        .detail-pill-btn{width:28px;height:28px}
        .detail-pill-close-x{font-size:0.72rem}
        .detail-pill-link-sym{font-size:0.72rem}
        .detail-arrow{width:32px;height:32px;font-size:1rem;box-shadow:0 3px 10px rgba(0,0,0,.18)}
        .detail-arrow-prev{left:6px}.detail-arrow-next{right:6px}
        .detail-counter{right:7px;bottom:8px;padding:.27rem .48rem;font-size:.68rem}
        .detail-dots{bottom:11px;gap:5px;align-items:center;height:7px;min-height:7px;max-height:7px}
        .detail-dot{width:7px!important;height:7px!important;min-width:7px!important;min-height:7px!important;max-width:7px!important;max-height:7px!important;padding:0!important;margin:0!important;line-height:0!important;flex:0 0 7px!important;appearance:none;-webkit-appearance:none}
        .detail-thumbnails{gap:6px;scrollbar-width:thin}
        .detail-thumb{padding:1px;border-radius:8px}
        .detail-thumb img{width:49px;height:49px;border-radius:6px}
        .detail-price-tag{font-size:1.45rem;margin:0.7rem 0 1rem}
        .detail-description{font-size:.95rem;line-height:1.7}
        .detail-sizes{gap:7px}
        .detail-size{min-width:42px;padding:.45rem .62rem;font-size:.84rem}
        .detail-size-sold small{font-size:.54rem}
        .product-detail-grid h1{font-size:clamp(1.45rem,7vw,1.85rem);line-height:1.2;margin-bottom:.55rem}
        #addDetailToCartBtn{max-width:none!important;min-height:44px}
      }
      @media(max-width:360px){
        .product-detail-page{padding-inline:.25rem}
        .product-detail-page .panel{padding:.65rem}
        .detail-carousel{aspect-ratio:1/1.28}
        .detail-arrow{width:27px;height:27px;font-size:.88rem}
        .detail-counter{display:none}
        .detail-thumb img{width:44px;height:44px}
      }
    </style>
    <section class="product-detail-page">
      <article class="panel">
        <div class="product-detail-grid">
          <div>${carouselMarkup}</div>
          <div>
            <div class="detail-price-tag">${formatMoney(product.price)}</div>
            ${description ? `<p class="detail-description">${escapeHtml(description)}</p>` : ""}
            <div class="detail-section-block">
              <div class="detail-section-header">
                <strong>Sizes</strong>
                ${soldSizesList.length > 0 ? `<span style="font-size:0.82rem; color:#853838; font-weight:600">${soldSizesList.length} size${soldSizesList.length > 1 ? "s" : ""} sold out</span>` : ""}
              </div>
              <div class="detail-sizes">${sizeMarkup}</div>
              ${soldSizesList.length > 0 ? `
                <div class="detail-sold-banner">
                  <strong>Sold out:</strong> ${soldSizesList.map(formatSizeLabel).join(", ")}
                </div>
              ` : ""}
              <details class="detail-size-chart-details">
                <summary class="detail-size-chart-summary">
                  <span>View Size Chart</span>
                </summary>
                <div class="detail-size-chart-body">
                  <img src="static/Size%20Chart.jpeg" alt="Size Chart" class="detail-size-chart-img" loading="lazy" />
                </div>
              </details>
              <details class="detail-size-chart-details" style="margin-top:0.6rem;">
                <summary class="detail-size-chart-summary">
                  <span>Returns, Refunds &amp; Exchanges Policy</span>
                </summary>
                <div class="detail-size-chart-body" style="text-align:left; font-size:0.88rem; line-height:1.6; color:#4a423a;">
                  <strong style="display:block; margin-bottom:0.25rem; color:#2c241d;">Change of Mind</strong>
                  <p style="margin:0 0 0.75rem;">We do not offer refunds, exchanges, or store credits for change-of-mind purchases. Please choose carefully before placing your order.</p>
                  
                  <strong style="display:block; margin-bottom:0.25rem; color:#2c241d;">Faulty, Damaged, or Incorrect Items</strong>
                  <p style="margin:0 0 0.75rem;">If an item arrives damaged, faulty, or is not as described, you may be entitled to a repair, replacement, or refund under the Consumer Guarantees Act 1993. Please contact us within a reasonable time of discovering the issue and provide your order number and photos of the item.</p>
                  
                  <strong style="display:block; margin-bottom:0.25rem; color:#2c241d;">Consumer Guarantees Act</strong>
                  <p style="margin:0;">Nothing in this policy limits or excludes your rights under the Consumer Guarantees Act 1993 or any other applicable New Zealand consumer laws.</p>
                </div>
              </details>
            </div>
            <div class="detail-order-actions">
              <label for="detailQtyInput" style="display:block; font-size:0.88rem; font-weight:600; margin-bottom:0.45rem; letter-spacing:0.01em;">Order Quantity</label>
              <div class="detail-order-row">
                <div class="qty-stepper" id="detailQtyStepper">
                  <button type="button" class="qty-step-btn" id="detailQtyDec" aria-label="Decrease quantity" ${fullySoldOut ? "disabled" : ""}>−</button>
                  <input type="number" id="detailQtyInput" class="qty-step-input" min="1" max="99" value="1" ${fullySoldOut ? "disabled" : ""} />
                  <button type="button" class="qty-step-btn" id="detailQtyInc" aria-label="Increase quantity" ${fullySoldOut ? "disabled" : ""}>+</button>
                </div>
                ${fullySoldOut ? '<button type="button" disabled style="flex:1; min-width:160px; max-width:320px">Sold Out</button>' : '<button id="addDetailToCartBtn" type="button" style="flex:1; min-width:160px; max-width:320px">+ Add to Order</button>'}
              </div>
              <div id="productDetailMessage" style="margin-top:0.85rem"></div>
            </div>
          </div>
        </div>
      </article>
      <div id="cartModalRoot"></div><div id="imageViewerRoot"></div>
    </section>`;

  document.getElementById("detailClosePillBtn")?.addEventListener("click", () => {
    location.hash = "#/shop";
  });

  const detailCopyLinkPillBtn = document.getElementById("detailCopyLinkPillBtn");
  const detailLinkSymbol = document.getElementById("detailLinkSymbol");
  if (detailCopyLinkPillBtn) {
    detailCopyLinkPillBtn.addEventListener("click", async () => {
      const productUrl = `${window.location.origin}${window.location.pathname}#/product/${encodeURIComponent(product.group_id)}`;
      const success = await copyToClipboard(productUrl);
      if (detailLinkSymbol) {
        detailLinkSymbol.textContent = success ? "✓" : "✓";
        detailCopyLinkPillBtn.classList.add("copied");
        detailCopyLinkPillBtn.title = "Copied!";
        setTimeout(() => {
          if (detailLinkSymbol) detailLinkSymbol.textContent = "🔗";
          detailCopyLinkPillBtn.classList.remove("copied");
          detailCopyLinkPillBtn.title = "Copy product link";
        }, 1800);
      }
    });
  }

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

  document.querySelectorAll("[data-size]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled || btn.classList.contains("detail-size-sold")) return;
      selectedSize = btn.getAttribute("data-size");
      document.querySelectorAll("[data-size]").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });

  const detailQtyInput = document.getElementById("detailQtyInput");
  document.getElementById("detailQtyDec")?.addEventListener("click", () => {
    if (detailQtyInput) {
      const current = Math.max(1, Number(detailQtyInput.value || 1));
      detailQtyInput.value = String(Math.max(1, current - 1));
    }
  });
  document.getElementById("detailQtyInc")?.addEventListener("click", () => {
    if (detailQtyInput) {
      const current = Math.max(1, Number(detailQtyInput.value || 1));
      detailQtyInput.value = String(Math.min(99, current + 1));
    }
  });
  detailQtyInput?.addEventListener("change", () => {
    const val = Math.max(1, Math.min(99, Number(detailQtyInput.value || 1)));
    detailQtyInput.value = String(val);
  });

  document.getElementById("addDetailToCartBtn")?.addEventListener("click", () => {
    const qtyToAdd = Math.max(1, Number(detailQtyInput?.value || 1));
    const cartKey = selectedSize ? `${product.group_id}::${selectedSize}` : product.group_id;
    setCartQty(cartKey, Number(state.cart[cartKey] || 0) + qtyToAdd);
    const message = document.getElementById("productDetailMessage");
    if (message) message.innerHTML = `<p class="notice">Added ${qtyToAdd} item${qtyToAdd > 1 ? "s" : ""} ${selectedSize ? `(${formatSizeLabel(selectedSize)})` : ""} to your order.</p>`;
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
  const itemsTotal = rows.reduce((sum, row) => sum + row.line_total, 0);
  const shippingCost = state.shippingMethod === "express" ? 9 : 7;
  const grandTotal = itemsTotal + shippingCost;

  modalRoot.innerHTML = `
    <div class="cart-modal-backdrop" id="cartModalBackdrop"></div>
    <section class="cart-modal" id="cartModalPanelRoot" role="dialog" aria-modal="true" aria-label="Cart and checkout">
      <article class="panel cart-modal-panel cart-items-panel">
        <div class="cart-modal-header-row">
          <h1>Checkout</h1>
          <button class="secondary" id="cartModalCloseBtn" type="button" aria-label="Close">✕</button>
        </div>
        <p>Items total: <b>${formatMoney(itemsTotal)}</b></p>
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
        
        <div class="field" style="margin-top:1rem; padding:0.85rem; border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,0.6); box-sizing:border-box;">
          <label style="font-weight:700; margin-bottom:0.6rem; display:block;">Shipping Options</label>
          <div style="display:flex; flex-direction:column; gap:0.6rem;">
            <label style="display:flex; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box; font-size:0.9rem; cursor:pointer; padding:0.6rem 0.85rem; border:1px solid var(--line); border-radius:6px; background:#fff;">
              <span style="display:inline-flex; align-items:center; gap:0.55rem;">
                <input type="radio" name="shippingOption" value="normal" style="margin:0; vertical-align:middle;" ${state.shippingMethod === "normal" ? "checked" : ""} />
                <span style="line-height:1.2;">Standard Shipping</span>
              </span>
              <strong style="color:var(--brand); line-height:1.2; text-align:right; font-variant-numeric:tabular-nums;">$7.00</strong>
            </label>
            <label style="display:flex; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box; font-size:0.9rem; cursor:pointer; padding:0.6rem 0.85rem; border:1px solid var(--line); border-radius:6px; background:#fff;">
              <span style="display:inline-flex; align-items:center; gap:0.55rem;">
                <input type="radio" name="shippingOption" value="express" style="margin:0; vertical-align:middle;" ${state.shippingMethod === "express" ? "checked" : ""} />
                <span style="line-height:1.2;">Express Shipping</span>
              </span>
              <strong style="color:var(--brand); line-height:1.2; text-align:right; font-variant-numeric:tabular-nums;">$9.00</strong>
            </label>
          </div>
        </div>

        <div class="checkout-summary" style="margin:1rem 0; padding:0.85rem; border-radius:8px; background:var(--brand-soft,#f4f7f2); border:1px solid #d5e0cf;">
          <div style="display:flex; justify-content:space-between; margin-bottom:0.35rem; font-size:0.9rem;">
            <span>Items Subtotal:</span>
            <span>${formatMoney(itemsTotal)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:0.35rem; font-size:0.9rem;">
            <span>Shipping (<span id="shippingSummaryLabel">${state.shippingMethod === "express" ? "Express" : "Standard"}</span>):</span>
            <span id="shippingSummaryCost">${formatMoney(shippingCost)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-weight:700; font-size:1.1rem; border-top:1px solid #c4d4bd; padding-top:0.35rem; margin-top:0.35rem; color:#1c140d;">
            <span>Total:</span>
            <span id="grandTotalSummaryCost">${formatMoney(grandTotal)}</span>
          </div>
        </div>

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
        <div class="cart-item-info">
          <b>${escapeHtml(row.title)}</b>
          ${row.size ? `<p style="font-size:0.84rem; color:var(--brand); font-weight:600; margin:0.15rem 0;">Size: ${escapeHtml(formatSizeLabel(row.size))}</p>` : ""}
          <p>${formatMoney(row.price)}</p>
          <p>Total: ${formatMoney(row.line_total)}</p>
        </div>
        <div class="cart-item-qty-wrap">
          <label for="qty_${escapeHtml(row.cartKey)}">Qty</label>
          <div class="qty-stepper">
            <button type="button" class="qty-step-btn" data-qty-dec="${escapeHtml(row.cartKey)}" aria-label="Decrease quantity for ${escapeHtml(row.title)}">−</button>
            <input id="qty_${escapeHtml(row.cartKey)}" class="qty-step-input" type="number" min="0" max="99" value="${row.qty}" data-qty-id="${escapeHtml(row.cartKey)}" />
            <button type="button" class="qty-step-btn" data-qty-inc="${escapeHtml(row.cartKey)}" aria-label="Increase quantity for ${escapeHtml(row.title)}">+</button>
          </div>
        </div>
      </div>
    `).join("");
  }

  rowsWrap.querySelectorAll("[data-qty-dec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cartKey = btn.getAttribute("data-qty-dec");
      const current = Number(state.cart[cartKey] || 0);
      setCartQty(cartKey, Math.max(0, current - 1));
      renderCartModal();
    });
  });

  rowsWrap.querySelectorAll("[data-qty-inc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cartKey = btn.getAttribute("data-qty-inc");
      const current = Number(state.cart[cartKey] || 0);
      setCartQty(cartKey, Math.min(99, current + 1));
      renderCartModal();
    });
  });

  rowsWrap.querySelectorAll("input[data-qty-id]").forEach((node) => {
    node.addEventListener("change", (event) => {
      const cartKey = event.target.getAttribute("data-qty-id");
      const val = Math.max(0, Math.min(99, Number(event.target.value || 0)));
      setCartQty(cartKey, val);
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

  document.querySelectorAll('input[name="shippingOption"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      state.shippingMethod = e.target.value;
      const isExpress = state.shippingMethod === "express";
      const cost = isExpress ? 9 : 7;
      const newGrandTotal = itemsTotal + cost;
      
      const label = document.getElementById("shippingSummaryLabel");
      const costSpan = document.getElementById("shippingSummaryCost");
      const grandTotalSpan = document.getElementById("grandTotalSummaryCost");
      
      if (label) label.textContent = isExpress ? "Express" : "Standard";
      if (costSpan) costSpan.textContent = formatMoney(cost);
      if (grandTotalSpan) grandTotalSpan.textContent = formatMoney(newGrandTotal);
    });
  });

  document.getElementById("placeOrderBtn").addEventListener("click", () => placeOrder(rows, itemsTotal));
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

async function placeOrder(rows, itemsTotal) {
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

  const shippingMethod = state.shippingMethod === "express" ? "express" : "normal";
  const shippingCost = shippingMethod === "express" ? 9 : 7;
  const shippingTitle = shippingMethod === "express" ? "Express Shipping" : "Normal Shipping";
  const grandTotal = itemsTotal + shippingCost;

  const orderId = String(Math.floor(10000 + Math.random() * 90000));
  const payload = {
    order_id: orderId,
    created_utc: new Date().toISOString(),
    customer_name: name,
    customer_email: email,
    customer_phone: phone,
    address,
    items_total: itemsTotal,
    shipping_method: shippingTitle,
    shipping_cost: shippingCost,
    total: grandTotal,
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

  const lines = rows.map((row) => `- ${row.title}${row.size ? ` (Size: ${formatSizeLabel(row.size)})` : ""} | qty ${row.qty} | ${formatMoney(row.line_total)}`).join("%0D%0A");
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
    `Subtotal: ${formatMoney(itemsTotal)}`,
    `Shipping (${shippingTitle}): ${formatMoney(shippingCost)}`,
    `Grand total: ${formatMoney(grandTotal)}`
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
      items_total: itemsTotal,
      shipping_method: shippingTitle,
      shipping_cost: shippingCost,
      total: grandTotal,
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
        <div id="stockLoginMessage"></div>
        <div class="field"><label for="stockUser">Username</label><input id="stockUser" type="text" /></div>
        <div class="field"><label for="stockPass">Password</label><input id="stockPass" type="password" /></div>
        <button id="stockLoginBtn" style="width:100%; min-height:44px;">Login</button>
      </section>
    `;

    document.getElementById("stockLoginBtn").addEventListener("click", () => {
      const user = document.getElementById("stockUser").value.trim();
      const pass = document.getElementById("stockPass").value;
      const msgNode = document.getElementById("stockLoginMessage");
      if (!user || !pass) {
        if (msgNode) msgNode.innerHTML = '<p class="notice error">Please enter both username and password.</p>';
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
          <button class="secondary" id="stockSyncExcelBtn" title="Fetch raw data directly from product_info/product_catalog.xlsx and update DB table">Fetch Excel & Update DB</button>
          <label class="button secondary stock-upload-label" style="display:inline-flex;align-items:center;justify-content:center;cursor:pointer;margin:0;" title="Select an Excel file from your computer to update DB table">
            Upload Excel to DB
            <input type="file" id="stockExcelFileInput" accept=".xlsx,.xls" style="display:none;" />
          </label>
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
        <div id="stockSyncMessage"></div>

        <div class="chip-row" style="margin-top: 1.25rem; border-bottom: 1px solid var(--line); padding-bottom: 0.5rem;">
          <button type="button" class="chip ${state.stockTab === "products" ? "active" : ""}" id="tabProductsBtn">📦 Products Catalog</button>
          <button type="button" class="chip ${state.stockTab === "orders" ? "active" : ""}" id="tabOrdersBtn">🛍️ Orders Received</button>
        </div>
      </article>

      <div id="stockTabContent"></div>
    </section>
  `;

  document.getElementById("stockBackBtn").addEventListener("click", () => {
    location.hash = "#/shop";
  });

  const tabProductsBtn = document.getElementById("tabProductsBtn");
  if (tabProductsBtn) {
    tabProductsBtn.addEventListener("click", () => {
      state.stockTab = "products";
      renderStock();
    });
  }

  const tabOrdersBtn = document.getElementById("tabOrdersBtn");
  if (tabOrdersBtn) {
    tabOrdersBtn.addEventListener("click", () => {
      state.stockTab = "orders";
      renderStock();
    });
  }

  if (state.stockTab === "orders") {
    renderOrdersTab();
    return;
  }

  renderProductsTab(filtered);
}

function renderProductsTab(filtered) {
  const tabContent = document.getElementById("stockTabContent");
  if (!tabContent) return;

  tabContent.innerHTML = `
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
  `;

  const stockSyncExcelBtn = document.getElementById("stockSyncExcelBtn");
  if (stockSyncExcelBtn) {
    stockSyncExcelBtn.addEventListener("click", async () => {
      const messageNode = document.getElementById("stockSyncMessage");
      stockSyncExcelBtn.disabled = true;
      if (messageNode) {
        messageNode.innerHTML = '<p class="notice">Fetching raw data from Excel file and updating database table...</p>';
      }

      try {
        const result = await syncExcelDataToDatabase({ url: CATALOG_URL });
        if (messageNode) {
          const syncInfo = result.syncedToSupabase
            ? " (Synced to Supabase DB table)"
            : " (Saved to local catalog)";
          if (result.insertedCount > 0) {
            messageNode.innerHTML = `<p class="notice">✓ Added ${result.insertedCount} new products. Preserved ${result.skippedCount} existing products in database without changes.${syncInfo}</p>`;
          } else {
            messageNode.innerHTML = `<p class="notice">✓ All ${result.skippedCount} products already exist in database. Existing records, prices & details were kept unchanged.${syncInfo}</p>`;
          }
        }
        renderRoute();
      } catch (error) {
        if (messageNode) {
          messageNode.innerHTML = `<p class="notice error">Sync failed: ${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
        }
      } finally {
        stockSyncExcelBtn.disabled = false;
      }
    });
  }

  const stockExcelFileInput = document.getElementById("stockExcelFileInput");
  if (stockExcelFileInput) {
    stockExcelFileInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const messageNode = document.getElementById("stockSyncMessage");
      if (messageNode) {
        messageNode.innerHTML = `<p class="notice">Reading raw data from ${escapeHtml(file.name)} and checking for new products...</p>`;
      }

      try {
        const result = await syncExcelDataToDatabase({ file });
        if (messageNode) {
          const syncInfo = result.syncedToSupabase
            ? " (Synced to Supabase DB table)"
            : " (Saved to local catalog)";
          if (result.insertedCount > 0) {
            messageNode.innerHTML = `<p class="notice">✓ Added ${result.insertedCount} new products from ${escapeHtml(file.name)}. Preserved ${result.skippedCount} existing products without overwriting.${syncInfo}</p>`;
          } else {
            messageNode.innerHTML = `<p class="notice">✓ All ${result.skippedCount} products from ${escapeHtml(file.name)} already exist in database. Existing records & prices were kept unchanged.${syncInfo}</p>`;
          }
        }
        renderRoute();
      } catch (error) {
        if (messageNode) {
          messageNode.innerHTML = `<p class="notice error">Excel import failed: ${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
        }
      } finally {
        stockExcelFileInput.value = "";
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

  renderStockTable(filtered);
  renderStockEditor(filtered);
}

async function renderOrdersTab() {
  const tabContent = document.getElementById("stockTabContent");
  if (!tabContent) return;

  tabContent.innerHTML = `
    <article class="panel">
      <h2>Orders Received</h2>
      <p>Customer details and placed order history.</p>
      <div id="ordersLoadingMsg"><p class="notice">Loading orders...</p></div>
      <div id="ordersContainer"></div>
    </article>
  `;

  try {
    const res = await fetch(`${CATALOG_API_URL}?type=orders`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.ordersList = data.orders || [];
  } catch (err) {
    console.warn("Could not fetch orders from API:", err);
  }

  const container = document.getElementById("ordersContainer");
  const loadingMsg = document.getElementById("ordersLoadingMsg");
  if (loadingMsg) loadingMsg.style.display = "none";

  if (!container) return;

  if (state.ordersList.length === 0) {
    container.innerHTML = '<p class="notice warning">No orders found yet.</p>';
    return;
  }

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:1.2rem;">
      ${state.ordersList.map((order) => {
        const orderDate = new Date(order.created_at || order.created_utc || Date.now()).toLocaleString("en-NZ", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true
        });

        const itemsArr = Array.isArray(order.items) ? order.items : [];

        return `
          <div style="border:1px solid var(--line); border-radius:10px; padding:1.2rem; background:#ffffff; box-shadow:0 2px 6px rgba(0,0,0,0.04);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem; border-bottom:1px solid #eee; padding-bottom:0.75rem; margin-bottom:0.85rem;">
              <div>
                <strong style="font-size:1.1rem; color:var(--brand);">Order #${escapeHtml(order.order_id)}</strong>
                <span style="font-size:0.82rem; color:#777; margin-left:0.5rem;">${escapeHtml(orderDate)}</span>
              </div>
              <div style="font-size:1.1rem; font-weight:700; color:#1c140d;">
                ${formatMoney(order.total)}
              </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1rem; margin-bottom:1rem; background:#fbf9f6; padding:0.85rem; border-radius:8px; border:1px solid #efe8e0;">
              <div>
                <strong style="font-size:0.85rem; text-transform:uppercase; color:#6e5440; display:block; margin-bottom:0.3rem;">Customer Info</strong>
                <div style="font-weight:600; color:#2a2017;">👤 ${escapeHtml(order.customer_name)}</div>
                <div style="font-size:0.88rem; color:#4a3729; margin-top:0.2rem;">✉️ <a href="mailto:${escapeHtml(order.customer_email)}" style="color:inherit;">${escapeHtml(order.customer_email)}</a></div>
                <div style="font-size:0.88rem; color:#4a3729; margin-top:0.2rem;">📞 ${escapeHtml(order.customer_phone)}</div>
              </div>

              <div>
                <strong style="font-size:0.85rem; text-transform:uppercase; color:#6e5440; display:block; margin-bottom:0.3rem;">Delivery Address</strong>
                <div style="font-size:0.88rem; color:#2a2017; line-height:1.4;">📍 ${escapeHtml(order.address)}</div>
                <div style="font-size:0.85rem; color:var(--brand); margin-top:0.4rem; font-weight:600;">🚚 ${escapeHtml(order.shipping_method || "Standard Shipping")} (${formatMoney(order.shipping_cost || 7)})</div>
              </div>
            </div>

            <strong style="font-size:0.85rem; text-transform:uppercase; color:#6e5440; display:block; margin-bottom:0.5rem;">Ordered Items</strong>
            <div style="display:flex; flex-direction:column; gap:0.5rem;">
              ${itemsArr.map((item) => `
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.9rem; padding:0.4rem 0.6rem; background:#fff; border:1px solid #ece6de; border-radius:6px;">
                  <div>
                    <strong>${escapeHtml(item.title || "Item")}</strong>
                    ${item.size ? `<span style="font-size:0.8rem; background:#f0f4ee; color:#284521; padding:0.1rem 0.4rem; border-radius:4px; font-weight:600; margin-left:0.4rem;">Size: ${escapeHtml(formatSizeLabel(item.size))}</span>` : ""}
                    <span style="font-size:0.82rem; color:#777; margin-left:0.5rem;">Qty: ${item.qty || 1}</span>
                  </div>
                  <strong>${formatMoney(item.line_total || item.price || 0)}</strong>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderProductsTab(filtered) {
  const tabContent = document.getElementById("stockTabContent");
  if (!tabContent) return;

  tabContent.innerHTML = `
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
  `;

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
    <div class="stock-product-list" role="list">
      ${filteredRows.map((item) => {
        const previewFile = item.primary_image_file || item.image_files[0] || "";
        const previewUrl = imageUrl(previewFile);
        const isSelected = item.group_id === state.selectedStockGroupId;
        const thumbnail = previewUrl
          ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(item.title)}" class="stock-item-thumb" loading="lazy" />`
          : '<div class="stock-item-thumb stock-thumb-placeholder">No image</div>';
        return `
          <div class="stock-item-row ${isSelected ? "selected" : ""}" data-stock-item="${escapeHtml(item.group_id)}" role="button" tabindex="0" aria-label="Edit ${escapeHtml(item.title)}">
            ${thumbnail}
            <div class="stock-item-info">
              <span class="stock-item-title">${escapeHtml(item.title)}</span>
            </div>
            <button type="button" class="button secondary stock-item-edit-btn" data-stock-btn="${escapeHtml(item.group_id)}">
              ${isSelected ? "✓ Editing" : "Edit"}
            </button>
          </div>
        `;
      }).join("")}
    </div>
  `;

  const selectProduct = (groupId) => {
    if (!groupId) {
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

  tableWrap.querySelectorAll("[data-stock-item]").forEach((row) => {
    row.addEventListener("click", () => {
      const groupId = row.getAttribute("data-stock-item");
      selectProduct(groupId);
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const groupId = row.getAttribute("data-stock-item");
        selectProduct(groupId);
      }
    });
  });

  tableWrap.querySelectorAll("[data-stock-btn]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const groupId = btn.getAttribute("data-stock-btn");
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
    rows = rows.filter((item) => !isProductSoldOut(item));
  }
  if (state.stockFilters.stockState === "sold") {
    rows = rows.filter((item) => isProductSoldOut(item));
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
          <label for="seTitle">Product title</label>
          <input id="seTitle" type="text" value="${escapeHtml(current.title || "")}" />
        </div>
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

        <div class="field" style="margin-top: 1rem;">
          <button id="saveStockBtn" style="width: 100%; min-height: 46px; font-size: 1rem;">Update product</button>
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

    const title = document.getElementById("seTitle").value.trim();
    if (!title) {
      const messageNode = document.getElementById("stockSaveMessage");
      if (messageNode) {
        messageNode.innerHTML = '<p class="notice error">Please enter a product title.</p>';
      }
      document.getElementById("seTitle").focus();
      return;
    }
    const patch = {
      title,
      description,
      size_mentions: orderedMentions.join(";"),
      sold_sizes: orderedSold.join(";"),
      item_count: Number(document.getElementById("seItemCount").value || 0),
      price: Number(document.getElementById("sePrice").value || 0),
      active: document.getElementById("seActive").checked,
      caption_has_sold: document.getElementById("seCaptionSold").checked,
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
      state.products = updatedProducts.map(normalizeCatalogProduct);
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
