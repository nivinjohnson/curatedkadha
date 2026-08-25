from __future__ import annotations

import os
import re
import smtplib
import ssl
from datetime import UTC, datetime
from email.message import EmailMessage
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data_from_insta"
PICTURES_DIR = BASE_DIR / "pictures_from_insta"
PRODUCT_INFO_DIR = BASE_DIR / "product_info"
PRODUCT_INFO_FILE = PRODUCT_INFO_DIR / "product_catalog.xlsx"
ORDERS_DIR = BASE_DIR / "orders_info"

PRODUCT_INFO_COLUMNS = [
    "group_id",
    "title",
    "description",
    "dress_description",
    "size_mentions",
    "sold_sizes",
    "dm_us",
    "tags",
    "primary_image_file",
    "image_files",
    "permalink",
    "product_type",
    "product_date",
    "price",
    "caption_has_sold",
    "item_count",
    "active",
]

ADMIN_ORDER_EMAIL = "curatedkadha@gmail.com"

SIZE_OPTIONS = ["FREE_SIZE", "XS", "S", "M", "L", "XL", "XXL", "3XL"]
SIZE_TOKEN_PATTERN = re.compile(
    r"\b(?:xxs|xs|s|m|l|xl|xxl|2xl|xxxl|3xl|small|medium|large|free\s*size|one\s*size|onesize|os)\b",
    re.IGNORECASE,
)
SOLD_CONTEXT_PATTERN = re.compile(r"\b(sold|booked|unavailable|gone|out\s+of\s+stock)\b", re.IGNORECASE)
DM_PATTERN = re.compile(r"\b(dm\s*(us|for|to)?|inbox\s*us|message\s*us|direct\s*message)\b", re.IGNORECASE)
TAG_PATTERN = re.compile(r"#([A-Za-z0-9_]+)")


def _normalize_size(token: str) -> str:
    value = token.strip().upper().replace(" ", "")
    aliases = {
        "SMALL": "S",
        "MEDIUM": "M",
        "LARGE": "L",
        "2XL": "XXL",
        "XXXL": "3XL",
        "ONESIZE": "FREE_SIZE",
        "FREESIZE": "FREE_SIZE",
        "FREE": "FREE_SIZE",
        "OS": "FREE_SIZE",
    }
    return aliases.get(value, value)


def _extract_sizes(text: str) -> list[str]:
    seen: set[str] = set()
    sizes: list[str] = []
    for token in SIZE_TOKEN_PATTERN.findall(text or ""):
        normalized = _normalize_size(token)
        if normalized not in SIZE_OPTIONS:
            continue
        if normalized not in seen:
            seen.add(normalized)
            sizes.append(normalized)

    if not sizes:
        sizes.append("FREE_SIZE")
    return sizes


def categorize_description(description: str) -> dict[str, Any]:
    """Parse a product caption into structured merchandising fields."""
    text = str(description or "").strip()
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    tags = [tag.lower() for tag in TAG_PATTERN.findall(text)]
    dedup_tags = list(dict.fromkeys(tags))

    dm_us = bool(DM_PATTERN.search(text))

    size_mentions = _extract_sizes(text)
    sold_sizes: list[str] = []
    for line in lines:
        if SOLD_CONTEXT_PATTERN.search(line):
            line_sizes = [size for size in _extract_sizes(line) if size in SIZE_OPTIONS]
            for size in line_sizes:
                if size not in sold_sizes:
                    sold_sizes.append(size)

    for size in sold_sizes:
        if size not in size_mentions:
            size_mentions.append(size)

    description_lines: list[str] = []
    for line in lines:
        lower_line = line.lower()
        if DM_PATTERN.search(line):
            continue
        if lower_line.startswith("#"):
            continue
        if "size" in lower_line or SOLD_CONTEXT_PATTERN.search(line):
            continue
        description_lines.append(line)

    return {
        "dress_description": "\n".join(description_lines),
        "size_mentions": ";".join(size_mentions),
        "sold_sizes": ";".join(sold_sizes),
        "dm_us": dm_us,
        "tags": ";".join(dedup_tags),
    }


def init_state() -> None:
    if "cart" not in st.session_state:
        st.session_state.cart = {}


@st.cache_data(ttl="2m", max_entries=5)
def find_latest_export_excel() -> Path | None:
    files = sorted(DATA_DIR.glob("instagram_media_*.xlsx"), key=lambda p: p.stat().st_mtime, reverse=True)
    return files[0] if files else None


@st.cache_data(ttl="2m", max_entries=10)
def load_export_products(excel_path: str) -> pd.DataFrame:
    raw_df = pd.read_excel(excel_path)

    expected = [
        "record_id",
        "parent_media_id",
        "media_type",
        "file_name",
        "file_path",
        "caption",
        "permalink",
        "timestamp",
        "downloaded",
    ]
    for col in expected:
        if col not in raw_df.columns:
            raw_df[col] = ""

    raw_df = raw_df[raw_df["downloaded"].astype(str).str.lower() == "yes"].copy()
    raw_df = raw_df.drop_duplicates(subset=["record_id"], keep="first")

    raw_df["caption"] = raw_df["caption"].fillna("").astype(str)
    raw_df["caption_norm"] = raw_df["caption"].str.replace(r"\s+", " ", regex=True).str.strip()
    raw_df["timestamp"] = pd.to_datetime(raw_df["timestamp"], errors="coerce", utc=True)
    raw_df["product_date"] = raw_df["timestamp"].dt.date
    raw_df["caption_has_sold"] = raw_df["caption_norm"].str.contains("sold", case=False, na=False)

    def title_from_caption(caption: str, fallback: str) -> str:
        if caption and caption.strip():
            return caption.split("\n")[0][:72]
        return fallback

    def compute_price(seed: str) -> float:
        bucket = sum(ord(ch) for ch in seed) % 120
        return round(19.0 + bucket * 1.35, 2)

    def choose_file_name(row: pd.Series) -> str:
        file_name = str(row.get("file_name") or "").strip()
        if file_name:
            return file_name
        file_path = str(row.get("file_path") or "").strip()
        return Path(file_path).name if file_path else ""

    raw_df["parent_media_id"] = raw_df["parent_media_id"].fillna("").astype(str).str.strip()
    raw_df["group_key"] = raw_df["parent_media_id"].where(
        raw_df["parent_media_id"].str.len() > 0,
        raw_df["record_id"].astype(str),
    )
    raw_df["resolved_file_name"] = raw_df.apply(choose_file_name, axis=1)

    groups: list[dict[str, Any]] = []
    for group_id, group in raw_df.groupby("group_key", dropna=False):
        first = group.iloc[0]
        caption = str(first.get("caption") or "")
        fallback = f"Product {str(first.get('record_id', 'item'))[-8:]}"
        title = title_from_caption(caption, fallback)
        parsed = categorize_description(caption)

        image_files = [f for f in group["resolved_file_name"].astype(str).tolist() if f]
        image_files = list(dict.fromkeys(image_files))
        primary = image_files[0] if image_files else ""

        groups.append(
            {
                "group_id": str(group_id),
                "title": title,
                "description": caption,
                "dress_description": str(parsed["dress_description"]),
                "size_mentions": str(parsed["size_mentions"]),
                "sold_sizes": str(parsed["sold_sizes"]),
                "dm_us": bool(parsed["dm_us"]),
                "tags": str(parsed["tags"]),
                "primary_image_file": primary,
                "image_files": ";".join(image_files),
                "permalink": str(first.get("permalink") or ""),
                "product_type": str(first.get("media_type") or "IMAGE"),
                "product_date": group["product_date"].dropna().max(),
                "price": compute_price(str(group_id)),
                "caption_has_sold": bool(group["caption_has_sold"].any()),
                "item_count": int(len(group)),
                "active": True,
            }
        )

    return pd.DataFrame(groups, columns=PRODUCT_INFO_COLUMNS)


@st.cache_data(ttl="2m", max_entries=10)
def load_parent_id_lookup(excel_path: str) -> dict[str, str]:
    raw_df = pd.read_excel(excel_path)

    expected = ["record_id", "parent_media_id", "file_name", "file_path", "downloaded"]
    for col in expected:
        if col not in raw_df.columns:
            raw_df[col] = ""

    raw_df = raw_df[raw_df["downloaded"].astype(str).str.lower() == "yes"].copy()

    def choose_file_name(row: pd.Series) -> str:
        file_name = str(row.get("file_name") or "").strip()
        if file_name:
            return file_name
        file_path = str(row.get("file_path") or "").strip()
        return Path(file_path).name if file_path else ""

    raw_df["resolved_file_name"] = raw_df.apply(choose_file_name, axis=1)
    raw_df["parent_media_id"] = raw_df["parent_media_id"].fillna("").astype(str).str.strip()
    raw_df["record_id"] = raw_df["record_id"].fillna("").astype(str).str.strip()
    raw_df["resolved_parent_id"] = raw_df["parent_media_id"].where(
        raw_df["parent_media_id"].str.len() > 0,
        raw_df["record_id"],
    )

    mapping: dict[str, str] = {}
    for _, row in raw_df.iterrows():
        image_name = str(row.get("resolved_file_name") or "").strip()
        parent_id = str(row.get("resolved_parent_id") or "").strip()
        if image_name and parent_id and image_name not in mapping:
            mapping[image_name] = parent_id
    return mapping


def ensure_product_info_file() -> Path:
    PRODUCT_INFO_DIR.mkdir(parents=True, exist_ok=True)
    if PRODUCT_INFO_FILE.exists():
        return PRODUCT_INFO_FILE

    latest = find_latest_export_excel()
    if latest is None:
        raise FileNotFoundError("No instagram export file found in data_from_insta folder.")

    catalog_df = load_export_products(str(latest))
    if catalog_df.empty:
        raise ValueError("Latest export file has no downloadable image products.")

    catalog_df.to_excel(PRODUCT_INFO_FILE, index=False)
    return PRODUCT_INFO_FILE


@st.cache_data(ttl="2m", max_entries=10)
def load_product_info() -> pd.DataFrame:
    product_info_path = ensure_product_info_file()
    df = pd.read_excel(product_info_path)

    for col in PRODUCT_INFO_COLUMNS:
        if col not in df.columns:
            if col == "active":
                df[col] = True
            else:
                df[col] = ""

    df["description"] = df["description"].fillna("").astype(str)
    df["group_id"] = df["group_id"].fillna("").astype(str).str.strip()
    df["dress_description"] = df["dress_description"].fillna("").astype(str)
    df["size_mentions"] = df["size_mentions"].fillna("").astype(str)
    df["sold_sizes"] = df["sold_sizes"].fillna("").astype(str)
    df["tags"] = df["tags"].fillna("").astype(str)
    df["title"] = df["title"].fillna("").astype(str)
    df["image_files"] = df["image_files"].fillna("").astype(str)
    df["primary_image_file"] = df["primary_image_file"].fillna("").astype(str)
    df["dm_us"] = df["dm_us"].fillna(False).astype(bool)
    df["caption_has_sold"] = df["caption_has_sold"].fillna(False).astype(bool)
    df["active"] = df["active"].fillna(True).astype(bool)
    df["item_count"] = pd.to_numeric(df["item_count"], errors="coerce").fillna(1).astype(int)
    df["price"] = pd.to_numeric(df["price"], errors="coerce").fillna(0.0).astype(float)

    latest = find_latest_export_excel()
    if latest is not None:
        parent_lookup = load_parent_id_lookup(str(latest))

        def image_key_for_row(row: pd.Series) -> str:
            primary = str(row.get("primary_image_file") or "").strip()
            if primary:
                return primary
            images = [part.strip() for part in str(row.get("image_files") or "").split(";") if part.strip()]
            return images[0] if images else ""

        df["_image_key"] = df.apply(image_key_for_row, axis=1)
        df["group_id"] = df.apply(
            lambda row: parent_lookup.get(str(row.get("_image_key") or "").strip(), str(row.get("group_id") or "")),
            axis=1,
        )
        df = df.drop(columns=["_image_key"], errors="ignore")

    return df[PRODUCT_INFO_COLUMNS].copy()


def save_product_info(updated_df: pd.DataFrame) -> Path:
    PRODUCT_INFO_DIR.mkdir(parents=True, exist_ok=True)

    writable = updated_df.copy()
    for col in PRODUCT_INFO_COLUMNS:
        if col not in writable.columns:
            writable[col] = ""
    writable = writable[PRODUCT_INFO_COLUMNS]

    writable.to_excel(PRODUCT_INFO_FILE, index=False)
    load_product_info.clear()
    return PRODUCT_INFO_FILE


def refresh_catalog_parsed_fields(overwrite_sizes: bool = False) -> Path:
    """Rebuild parsed stock fields from description for the Excel catalog."""
    product_info_path = ensure_product_info_file()
    df = pd.read_excel(product_info_path)

    for col in PRODUCT_INFO_COLUMNS:
        if col not in df.columns:
            if col in {"active", "dm_us"}:
                df[col] = False
            else:
                df[col] = ""

    parsed_series = df["description"].fillna("").astype(str).apply(categorize_description)
    df["dress_description"] = parsed_series.apply(lambda value: str(value["dress_description"]))
    if overwrite_sizes:
        df["size_mentions"] = parsed_series.apply(lambda value: str(value["size_mentions"]))
        df["sold_sizes"] = parsed_series.apply(lambda value: str(value["sold_sizes"]))
    df["dm_us"] = parsed_series.apply(lambda value: bool(value["dm_us"]))
    df["tags"] = parsed_series.apply(lambda value: str(value["tags"]))

    df = df[PRODUCT_INFO_COLUMNS]
    df.to_excel(PRODUCT_INFO_FILE, index=False)
    load_product_info.clear()
    return PRODUCT_INFO_FILE


def update_product_info_columns(base_df: pd.DataFrame, edits_df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    merged = base_df.copy()
    for col in columns:
        if col in edits_df.columns:
            merged[col] = edits_df[col]
    return merged


def resolve_image_paths(image_files_value: str) -> list[str]:
    files = [part.strip() for part in str(image_files_value or "").split(";") if part.strip()]
    paths: list[str] = []
    for name in files:
        candidate = PICTURES_DIR / name
        if candidate.exists():
            paths.append(str(candidate))
    return paths


def add_to_cart(group_id: str) -> None:
    group_id = str(group_id).strip()
    if not group_id:
        return
    cart = st.session_state.cart
    cart[group_id] = cart.get(group_id, 0) + 1


def update_cart_quantity(group_id: str, qty: int) -> None:
    group_id = str(group_id).strip()
    if not group_id:
        return
    cart = st.session_state.cart
    if qty <= 0:
        cart.pop(group_id, None)
    else:
        cart[group_id] = qty


def clear_cart() -> None:
    st.session_state.cart = {}


def get_cart_counts() -> tuple[int, int]:
    init_state()
    cart = st.session_state.get("cart", {})
    product_count = 0
    item_count = 0
    for qty in cart.values():
        try:
            qty_int = int(qty)
        except (TypeError, ValueError):
            continue
        if qty_int > 0:
            product_count += 1
            item_count += qty_int
    return product_count, item_count


def get_cart_df(products_df: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    products = products_df.copy()
    products["group_id"] = products["group_id"].fillna("").astype(str).str.strip()
    for group_id, qty in st.session_state.cart.items():
        group_id = str(group_id).strip()
        if not group_id:
            continue
        match = products[products["group_id"] == group_id]
        if match.empty:
            continue
        item = match.iloc[0]
        line_total = float(item["price"]) * int(qty)
        rows.append(
            {
                "group_id": group_id,
                "title": item["title"],
                "price": float(item["price"]),
                "qty": int(qty),
                "line_total": line_total,
                "item_count": int(item["item_count"]),
            }
        )

    return pd.DataFrame(rows)


def save_order(cart_df: pd.DataFrame, customer_name: str, email: str, address: str, phone: str = "") -> Path:
    ORDERS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    order_id = f"order_{ts}"

    out = cart_df.copy()
    out["customer_name"] = customer_name
    out["email"] = email
    out["address"] = address
    out["phone"] = phone
    out["order_id"] = order_id
    out["created_utc"] = datetime.now(UTC).isoformat()

    file_path = ORDERS_DIR / f"{order_id}.xlsx"
    out.to_excel(file_path, index=False)
    return file_path


def _secret_or_env(key: str, default: str = "") -> str:
    try:
        if key in st.secrets:
            return str(st.secrets[key])
    except Exception:
        pass
    return os.getenv(key, default)


def _smtp_config() -> dict[str, Any]:
    return {
        "host": _secret_or_env("SHOP_SMTP_HOST"),
        "port": int(_secret_or_env("SHOP_SMTP_PORT", "587")),
        "user": _secret_or_env("SHOP_SMTP_USER"),
        "password": _secret_or_env("SHOP_SMTP_PASSWORD"),
        "from_email": _secret_or_env("SHOP_FROM_EMAIL"),
        "use_tls": _secret_or_env("SHOP_SMTP_USE_TLS", "true").strip().lower() != "false",
    }


def email_config_ready() -> bool:
    cfg = _smtp_config()
    required = ["host", "user", "password", "from_email"]
    return all(bool(str(cfg.get(k, "")).strip()) for k in required)


def _build_order_email_body(
    order_file: Path,
    cart_df: pd.DataFrame,
    customer_name: str,
    customer_email: str,
    address: str,
    customer_phone: str,
) -> str:
    total = float(cart_df["line_total"].sum()) if not cart_df.empty else 0.0
    lines = [
        f"Order file: {order_file.name}",
        f"Customer: {customer_name}",
        f"Customer email: {customer_email}",
        f"Delivery address: {address}",
        f"Phone: {customer_phone}",
        "",
        "Items:",
    ]
    for _, row in cart_df.iterrows():
        lines.append(
            f"- {row['title']} | qty: {int(row['qty'])} | price: ${float(row['price']):.2f} | line total: ${float(row['line_total']):.2f}"
        )
    lines.append("")
    lines.append(f"Grand total: ${total:.2f}")
    return "\n".join(lines)


def send_order_emails(
    order_file: Path,
    cart_df: pd.DataFrame,
    customer_name: str,
    customer_email: str,
    address: str,
    customer_phone: str = "",
) -> dict[str, Any]:
    cfg = _smtp_config()
    if not email_config_ready():
        return {
            "sent": False,
            "message": "Email not sent. Configure SHOP_SMTP_HOST, SHOP_SMTP_USER, SHOP_SMTP_PASSWORD, and SHOP_FROM_EMAIL.",
            "recipients": [customer_email, ADMIN_ORDER_EMAIL],
        }

    recipients = [customer_email, ADMIN_ORDER_EMAIL]
    subject = f"Order confirmation: {order_file.stem}"
    body = _build_order_email_body(order_file, cart_df, customer_name, customer_email, address, customer_phone)

    msg = EmailMessage()
    msg["From"] = cfg["from_email"]
    msg["To"] = customer_email
    msg["Cc"] = ADMIN_ORDER_EMAIL
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=30) as server:
            if cfg["use_tls"]:
                server.starttls(context=context)
            server.login(cfg["user"], cfg["password"])
            server.send_message(msg, to_addrs=recipients)
        return {"sent": True, "message": "Order email sent.", "recipients": recipients}
    except Exception as exc:
        return {"sent": False, "message": f"Email failed: {exc}", "recipients": recipients}
