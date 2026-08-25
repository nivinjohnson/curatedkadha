from __future__ import annotations

import base64
import json
from pathlib import Path
from uuid import uuid4

import streamlit as st

from store_backend import (
    find_latest_export_excel,
    init_state,
    load_product_info,
    resolve_image_paths,
)

st.markdown(
    """
    <style>
    .shop-filter-note {
        font-size: 0.82rem;
        color: #4d6f66;
        margin-top: -0.2rem;
        margin-bottom: 0.45rem;
    }

    .product-card-link {
        display: block;
        text-decoration: none !important;
        color: inherit;
        border: 1px solid #e7e3d8;
        border-radius: 12px;
        background: #fffdfa;
        overflow: hidden;
        margin-bottom: 1.1rem;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .product-card-link,
    .product-card-link:link,
    .product-card-link:visited,
    .product-card-link:hover,
    .product-card-link:active,
    .product-card-link * {
        text-decoration: none !important;
    }

    .product-card-link:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(22, 48, 40, 0.12);
    }

    .product-card-media {
        width: calc(100% - 1rem);
        margin: 0.5rem auto 0;
        aspect-ratio: 4 / 5;
        height: auto;
        object-fit: cover;
        display: block;
        background: #f6f3ec;
        border-radius: 10px;
    }

    .product-card-media-wrap {
        position: relative;
    }

    .product-card-counter {
        position: absolute;
        top: 0.95rem;
        right: 0.9rem;
        font-size: 0.72rem;
        color: #fff;
        background: rgba(0, 0, 0, 0.45);
        padding: 0.15rem 0.42rem;
        border-radius: 999px;
    }

    .product-card-dots {
        position: absolute;
        left: 50%;
        bottom: 0.9rem;
        transform: translateX(-50%);
        display: flex;
        gap: 0.34rem;
        background: rgba(0, 0, 0, 0.22);
        border-radius: 999px;
        padding: 0.2rem 0.4rem;
    }

    .product-card-dot {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.5);
    }

    .product-card-dot-active {
        background: #ffffff;
    }

    .product-card-body {
        padding: 0.62rem 0.86rem 0.92rem;
    }

    .product-card-title {
        font-weight: 700;
        color: #173730;
        margin: 0 0 0.2rem;
        line-height: 1.3;
    }

    .product-card-meta {
        font-size: 0.82rem;
        color: #52746b;
        margin-bottom: 0.2rem;
    }

    .product-card-price {
        font-size: 1rem;
        font-weight: 700;
        color: #1f8a70;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

DETAIL_PAGE_PATH = Path(__file__).with_name("product_detail_page.py")
INITIAL_LOAD_COUNT = 24
LOAD_MORE_STEP = 24
SIZE_ORDER = ["FREE_SIZE", "XS", "S", "M", "L", "XL", "XXL", "3XL"]


def split_sizes(value: str) -> set[str]:
    return {part.strip().upper() for part in str(value or "").split(";") if part.strip()}


def available_sizes_for_row(row: st.runtime.state.session_state_proxy.SessionStateProxy | dict) -> set[str]:
    mentions = split_sizes(str(row.get("size_mentions") or ""))
    sold = split_sizes(str(row.get("sold_sizes") or ""))
    return mentions - sold


def size_rank_for_row(row: st.runtime.state.session_state_proxy.SessionStateProxy | dict) -> int:
    mentions = split_sizes(str(row.get("size_mentions") or ""))
    for idx, size in enumerate(SIZE_ORDER):
        if size in mentions:
            return idx
    return len(SIZE_ORDER)


@st.cache_data(ttl="30m", max_entries=1500)
def image_to_data_uri(image_path: str) -> str:
    path = Path(image_path)
    if not path.exists():
        return ""
    suffix = path.suffix.lower()
    mime = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(suffix, "image/jpeg")
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def render_swipe_carousel(image_paths: list[str], component_key: str) -> None:
    uris = [image_to_data_uri(p) for p in image_paths]
    uris = [u for u in uris if u]

    if not uris:
        st.caption("No image available")
        return

    if len(uris) == 1:
        st.image(image_paths[0])
        return

    dom_id = f"swipe_{component_key}_{uuid4().hex[:8]}"
    js_list = json.dumps(uris)
    html = f"""
<div id='{dom_id}' style='position:relative; width:100%; max-width:100%; user-select:none;'>
    <img id='{dom_id}_img' src='{uris[0]}' style='width:100%; border-radius:0.6rem; display:block; object-fit:cover;' />
    <div style='position:absolute; left:8px; top:8px; background:rgba(0,0,0,0.55); color:white; padding:2px 8px; border-radius:999px; font-size:12px;' id='{dom_id}_counter'>1/{len(uris)}</div>
</div>
<script>
(function() {{
    const images = {js_list};
    const img = document.getElementById('{dom_id}_img');
    const counter = document.getElementById('{dom_id}_counter');
    let idx = 0;
    let startX = null;

    function paint() {{
        img.src = images[idx];
        counter.textContent = `${{idx + 1}}/{len(uris)}`;
    }}

    function next() {{
        idx = (idx + 1) % images.length;
        paint();
    }}

    function prev() {{
        idx = (idx - 1 + images.length) % images.length;
        paint();
    }}

    img.addEventListener('touchstart', (e) => {{
        startX = e.changedTouches[0].clientX;
    }}, {{ passive: true }});

    img.addEventListener('touchend', (e) => {{
        if (startX === null) return;
        const endX = e.changedTouches[0].clientX;
        const dx = endX - startX;
        if (Math.abs(dx) > 35) {{
            if (dx < 0) next(); else prev();
        }}
        startX = null;
    }}, {{ passive: true }});

    img.addEventListener('mousedown', (e) => {{ startX = e.clientX; }});
    img.addEventListener('mouseup', (e) => {{
        if (startX === null) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 35) {{
            if (dx < 0) next(); else prev();
        }}
        startX = null;
    }});

    img.addEventListener('click', (e) => {{
        const rect = img.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x > rect.width * 0.5) next(); else prev();
    }});
}})();
</script>
"""
    st.html(html, unsafe_allow_javascript=True)

init_state()

if "shop_hide_sold" not in st.session_state:
    st.session_state.shop_hide_sold = True
if "shop_only_active" not in st.session_state:
    st.session_state.shop_only_active = True
if "shop_query" not in st.session_state:
    st.session_state.shop_query = ""
if "shop_size_filter" not in st.session_state:
    st.session_state.shop_size_filter = []
if "shop_size_scope" not in st.session_state:
    st.session_state.shop_size_scope = "Available sizes"
if "shop_sort_by" not in st.session_state:
    st.session_state.shop_sort_by = "Newest"

st.title("Curated Kadha")

with st.popover(":material/tune: Filters", use_container_width=False):
    st.checkbox("Hide captions containing SOLD", key="shop_hide_sold")
    st.checkbox("Show active items only", key="shop_only_active")
    st.text_input("Search products", key="shop_query", placeholder="Search title or description")
    st.multiselect("Filter by size", options=SIZE_ORDER, key="shop_size_filter", placeholder="Select one or more sizes")
    st.segmented_control(
        "Size filter scope",
        ["Available sizes", "All mentioned sizes"],
        key="shop_size_scope",
    )
    st.selectbox(
        "Sort",
        ["Newest", "Oldest", "Price low to high", "Price high to low", "Title A-Z", "Size priority"],
        key="shop_sort_by",
    )
    if st.button("Reload from disk", icon=":material/refresh:", key="shop_reload_local", use_container_width=True):
        st.cache_data.clear()
        st.rerun()

product_from_query = str(st.query_params.get("product", "")).strip()
if product_from_query:
    st.session_state.selected_group_id = product_from_query
    st.query_params.clear()
    st.switch_page(str(DETAIL_PAGE_PATH))

latest_export = find_latest_export_excel()
if latest_export is None:
    st.error("No export Excel file found in data_from_insta. Run the Instagram exporter first.")
    st.stop()

try:
    products_df = load_product_info()
except Exception as exc:
    st.error(f"Could not load product info: {exc}")
    st.stop()

if products_df.empty:
    st.warning("No products available in product info file.")
    st.stop()


@st.fragment
def render_catalog() -> None:
    filtered = products_df.copy()
    hide_sold = bool(st.session_state.shop_hide_sold)
    show_only_active = bool(st.session_state.shop_only_active)
    query = str(st.session_state.shop_query or "")
    size_filter = [str(size) for size in st.session_state.shop_size_filter]
    size_scope = str(st.session_state.shop_size_scope or "Available sizes")
    sort_by = str(st.session_state.shop_sort_by or "Newest")

    filtered["_size_mentions_set"] = filtered["size_mentions"].fillna("").astype(str).apply(split_sizes)
    filtered["_sold_sizes_set"] = filtered["sold_sizes"].fillna("").astype(str).apply(split_sizes)
    filtered["_available_sizes_set"] = filtered.apply(lambda row: row["_size_mentions_set"] - row["_sold_sizes_set"], axis=1)

    if hide_sold:
        filtered = filtered[~filtered["caption_has_sold"]].copy()
    if show_only_active:
        filtered = filtered[filtered["active"]].copy()

    if query:
        q = query.strip().lower()
        filtered = filtered[
            filtered["title"].str.lower().str.contains(q, na=False)
            | filtered["description"].str.lower().str.contains(q, na=False)
        ]

    if size_filter:
        selected_sizes = {s.upper() for s in size_filter}
        if size_scope == "Available sizes":
            filtered = filtered[filtered["_available_sizes_set"].apply(lambda value: bool(value.intersection(selected_sizes)))]
        else:
            filtered = filtered[filtered["_size_mentions_set"].apply(lambda value: bool(value.intersection(selected_sizes)))]

    if sort_by == "Newest":
        filtered = filtered.sort_values("product_date", ascending=False)
    elif sort_by == "Oldest":
        filtered = filtered.sort_values("product_date", ascending=True)
    elif sort_by == "Price low to high":
        filtered = filtered.sort_values("price", ascending=True)
    elif sort_by == "Price high to low":
        filtered = filtered.sort_values("price", ascending=False)
    elif sort_by == "Size priority":
        filtered["_size_rank"] = filtered.apply(size_rank_for_row, axis=1)
        filtered = filtered.sort_values(["_size_rank", "title"], ascending=[True, True])
    else:
        filtered = filtered.sort_values("title", ascending=True)

    if "visible_count" not in st.session_state:
        st.session_state.visible_count = INITIAL_LOAD_COUNT
    signature = f"{hide_sold}|{show_only_active}|{size_filter}|{size_scope}|{query}|{sort_by}|{len(filtered)}"
    if st.session_state.get("visible_signature") != signature:
        st.session_state.visible_signature = signature
        st.session_state.visible_count = INITIAL_LOAD_COUNT

    visible_count = min(int(st.session_state.visible_count), len(filtered))
    page_df = filtered.iloc[:visible_count]

    if page_df.empty:
        st.info("No products match your filters.")
        return

    for idx in range(0, len(page_df), 3):
        cols = st.columns(3)
        for col_idx, col in enumerate(cols):
            row_idx = idx + col_idx
            if row_idx >= len(page_df):
                continue

            item = page_df.iloc[row_idx]
            with col:
                image_paths = resolve_image_paths(item["image_files"])
                image_uris = [image_to_data_uri(path) for path in image_paths]
                image_uris = [uri for uri in image_uris if uri]
                dom_id = f"card_{item['group_id']}_{row_idx}_{uuid4().hex[:8]}"

                if image_uris:
                    controls_html = ""
                    if len(image_uris) > 1:
                        dot_parts: list[str] = []
                        for dot_idx in range(len(image_uris)):
                            active_class = " product-card-dot-active" if dot_idx == 0 else ""
                            dot_parts.append(
                                f"<span class='product-card-dot{active_class}' id='{dom_id}_dot_{dot_idx}'></span>"
                            )
                        dots_html = "".join(dot_parts)
                        controls_html = f"""
    <div class='product-card-counter' id='{dom_id}_counter'>1/{len(image_uris)}</div>
    <div class='product-card-dots' id='{dom_id}_dots'>{dots_html}</div>
"""
                    image_html = f"""
  <div class='product-card-media-wrap'>
    <img class='product-card-media' id='{dom_id}_img' src='{image_uris[0]}' alt='Product image' />
    {controls_html}
  </div>
"""
                else:
                    image_html = "<div class='product-card-media'></div>"

                card_html = f"""
<div class='product-card-link' id='{dom_id}' role='link' tabindex='0'>
  {image_html}
  <div class='product-card-body'>
    <div class='product-card-title'>{item['title']}</div>
    <div class='product-card-price'>${float(item['price']):.2f}</div>
  </div>
</div>
<script>
(function() {{
    const card = document.getElementById('{dom_id}');
    if (!card) return;
    const targetQuery = '?product={item['group_id']}';
    const openDetails = () => {{ window.location.search = targetQuery; }};

    card.addEventListener('click', (event) => {{
        if (card.dataset.justSwiped === '1') {{
            card.dataset.justSwiped = '0';
            return;
        }}
        openDetails();
    }});

    card.addEventListener('keydown', (event) => {{
        if (event.key === 'Enter' || event.key === ' ') {{
            event.preventDefault();
            openDetails();
        }}
    }});

    const images = {json.dumps(image_uris)};
    if (images.length <= 1) return;

    const img = document.getElementById('{dom_id}_img');
    const counter = document.getElementById('{dom_id}_counter');
    const dots = Array.from(card.querySelectorAll('.product-card-dot'));
    let idx = 0;
    let startX = null;

    const paint = () => {{
        img.src = images[idx];
        counter.textContent = `${{idx + 1}}/{len(image_uris)}`;
        dots.forEach((dot, dotIdx) => {{
            dot.classList.toggle('product-card-dot-active', dotIdx === idx);
        }});
    }};

    const showNext = () => {{ idx = (idx + 1) % images.length; paint(); }};
    const showPrev = () => {{ idx = (idx - 1 + images.length) % images.length; paint(); }};

    img.addEventListener('touchstart', (event) => {{
        startX = event.changedTouches[0].clientX;
        card.dataset.justSwiped = '0';
    }}, {{ passive: true }});

    img.addEventListener('touchend', (event) => {{
        if (startX === null) return;
        const endX = event.changedTouches[0].clientX;
        const dx = endX - startX;
        if (Math.abs(dx) > 35) {{
            if (dx < 0) showNext(); else showPrev();
            card.dataset.justSwiped = '1';
        }}
        startX = null;
    }}, {{ passive: true }});
}})();
</script>
"""
                st.html(card_html, unsafe_allow_javascript=True)

    if visible_count < len(filtered):
        if st.button("Load more", icon=":material/expand_more:"):
            st.session_state.visible_count = min(visible_count + LOAD_MORE_STEP, len(filtered))


render_catalog()
