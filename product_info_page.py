from __future__ import annotations

import streamlit as st

from store_backend import (
    categorize_description,
    PRODUCT_INFO_FILE,
    resolve_image_paths,
    SIZE_OPTIONS,
    load_product_info,
    refresh_catalog_parsed_fields,
    save_product_info,
)

st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap');

    :root {
        --brand-ink: #14342b;
        --brand-teal: #1f8a70;
        --brand-mint: #eef9f5;
        --brand-sand: #f7f2e8;
    }

    html, body, [class*="css"]  {
        font-family: 'Manrope', 'Segoe UI', sans-serif;
    }

    .stock-hero {
        background: linear-gradient(120deg, var(--brand-mint) 0%, var(--brand-sand) 100%);
        border: 1px solid #dbece6;
        border-radius: 16px;
        padding: 1rem 1.2rem;
        margin-bottom: 0.8rem;
    }

    .stock-hero h1 {
        margin: 0;
        color: var(--brand-ink);
        font-weight: 800;
        letter-spacing: 0.2px;
        font-size: 1.45rem;
    }

    .stock-hero p {
        margin: 0.35rem 0 0;
        color: #33574e;
        font-size: 0.94rem;
    }

    .tiny-note {
        color: #4d6f66;
        font-size: 0.82rem;
        margin-top: 0.1rem;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


def _split_semicolon(value: str) -> set[str]:
    return {part.strip().upper() for part in str(value or "").split(";") if part.strip()}


def _compute_available_sizes(size_mentions: str, sold_sizes: str) -> str:
    sizes = _split_semicolon(size_mentions)
    sold = _split_semicolon(sold_sizes)
    available = [size for size in sorted(sizes) if size not in sold]
    return ";".join(available)


def _ordered_size_join(values: list[str]) -> str:
    normalized = {str(v or "").strip().upper() for v in values if str(v or "").strip()}
    ordered = [size for size in SIZE_OPTIONS if size in normalized]
    if not ordered:
        ordered = ["FREE_SIZE"]
    return ";".join(ordered)


st.markdown(
        """
        <div class="stock-hero">
            <h1>Stock info studio</h1>
            <p>Filter, review, and update product stock details with parser-assisted fields and size controls.</p>
        </div>
        """,
        unsafe_allow_html=True,
)

try:
    products_df = load_product_info()
except Exception as exc:
    st.error(f"Could not load product info: {exc}")
    st.stop()

if products_df.empty:
    st.warning("No products available in product info file.")
    st.stop()

overview_df = products_df.copy()
overview_df["available_sizes"] = overview_df.apply(
    lambda row: _compute_available_sizes(row.get("size_mentions", ""), row.get("sold_sizes", "")),
    axis=1,
)
overview_df["has_available_stock"] = overview_df["available_sizes"].str.len() > 0
overview_df["is_available"] = overview_df["active"] & (
    overview_df["has_available_stock"] | (~overview_df["caption_has_sold"])
)

total_products = int(len(overview_df))
active_products = int(overview_df["active"].sum())
available_products = int(overview_df["is_available"].sum())
sold_out_products = int(total_products - available_products)

st.markdown("<div class='tiny-note'>Catalog status overview</div>", unsafe_allow_html=True)
with st.container(horizontal=True):
    st.metric("Total products", total_products, border=True)
    st.metric("Active products", active_products, border=True)
    st.metric("Available stock", available_products, border=True)
    st.metric("Sold out / unavailable", sold_out_products, border=True)

with st.expander("Stock by size overview", expanded=False):
    size_rows: list[dict[str, int | str]] = []
    all_sizes = sorted({size for value in overview_df["size_mentions"] for size in _split_semicolon(value)})
    for size in all_sizes:
        mentioned_count = int(overview_df["size_mentions"].fillna("").str.contains(fr"(^|;){size}(;|$)", case=False, regex=True).sum())
        sold_count = int(overview_df["sold_sizes"].fillna("").str.contains(fr"(^|;){size}(;|$)", case=False, regex=True).sum())
        available_count = max(0, mentioned_count - sold_count)
        size_rows.append(
            {
                "size": size,
                "products_with_size": mentioned_count,
                "products_sold_in_size": sold_count,
                "products_available_in_size": available_count,
            }
        )
    if size_rows:
        st.dataframe(
            size_rows,
            hide_index=True,
            column_config={
                "size": st.column_config.TextColumn("Size"),
                "products_with_size": st.column_config.NumberColumn("Products with size"),
                "products_sold_in_size": st.column_config.NumberColumn("Sold in size"),
                "products_available_in_size": st.column_config.NumberColumn("Available in size"),
            },
        )
    else:
        st.info("No parsed size information found yet.")

st.caption(f"Editing file: {PRODUCT_INFO_FILE}")

workspace_col, editor_col = st.columns([0.95, 1.55], gap="large")

with workspace_col:
    with st.container(border=True):
        st.markdown("**Filters**")
        st.markdown("<div class='tiny-note'>Narrow products before choosing one to edit.</div>", unsafe_allow_html=True)
        with st.form("stock_filter_form", border=False):
            filter_query = st.text_input("Search description")
            filter_stock_state = st.selectbox("Stock state", ["All", "Available", "Sold out / unavailable"])
            filter_active_state = st.selectbox("Active flag", ["All", "Active only", "Inactive only"])
            filter_tag = st.text_input("Tag contains")
            apply_filters = st.form_submit_button("Apply filters", icon=":material/filter_alt:")

if "stock_filters" not in st.session_state:
    st.session_state.stock_filters = {
        "query": "",
        "stock_state": "All",
        "active_state": "All",
        "tag": "",
    }

if apply_filters:
    st.session_state.stock_filters = {
        "query": filter_query,
        "stock_state": filter_stock_state,
        "active_state": filter_active_state,
        "tag": filter_tag,
    }

filters = st.session_state.stock_filters
filtered_df = overview_df.copy()

query = str(filters.get("query", "")).strip().lower()
if query:
    filtered_df = filtered_df[
        filtered_df["description"].fillna("").str.lower().str.contains(query, na=False)
    ]

stock_state = str(filters.get("stock_state", "All"))
if stock_state == "Available":
    filtered_df = filtered_df[filtered_df["is_available"]]
elif stock_state == "Sold out / unavailable":
    filtered_df = filtered_df[~filtered_df["is_available"]]

active_state = str(filters.get("active_state", "All"))
if active_state == "Active only":
    filtered_df = filtered_df[filtered_df["active"]]
elif active_state == "Inactive only":
    filtered_df = filtered_df[~filtered_df["active"]]

tag_filter = str(filters.get("tag", "")).strip().lower()
if tag_filter:
    filtered_df = filtered_df[filtered_df["tags"].fillna("").str.lower().str.contains(tag_filter, na=False)]

if not filtered_df.empty and "selected_group_id" not in st.session_state:
    st.session_state.selected_group_id = str(filtered_df.iloc[0]["group_id"])

with workspace_col:
    with st.container(border=True):
        st.markdown("**Filtered products**")
        st.caption(f"Showing {len(filtered_df)} of {len(products_df)} products")
        st.caption("Click a product row (group ID) to open it in the editor.")

        if not filtered_df.empty:
            preview_df = filtered_df[["group_id", "size_mentions", "sold_sizes", "active", "available_sizes"]].copy()
            table_event = st.dataframe(
                preview_df,
                hide_index=True,
                height=250,
                selection_mode="single-row",
                on_select="rerun",
                key="filtered_products_table",
                column_config={
                    "group_id": st.column_config.TextColumn("Group ID"),
                    "size_mentions": st.column_config.TextColumn("Sizes"),
                    "sold_sizes": st.column_config.TextColumn("Sold sizes"),
                    "active": st.column_config.CheckboxColumn("Active"),
                    "available_sizes": st.column_config.TextColumn("Available sizes"),
                },
            )

            if table_event and table_event.selection and table_event.selection.rows:
                row_index = int(table_event.selection.rows[0])
                if 0 <= row_index < len(preview_df):
                    st.session_state.selected_group_id = str(preview_df.iloc[row_index]["group_id"])

            selected_group_id = str(st.session_state.get("selected_group_id", ""))
            preview_row_match = filtered_df[filtered_df["group_id"].astype(str) == selected_group_id]
            if not preview_row_match.empty:
                preview_row = preview_row_match.iloc[0]
                st.markdown("**Selected product preview**")
                preview_images = resolve_image_paths(str(preview_row.get("image_files") or ""))
                if preview_images:
                    st.image(preview_images[0], caption=f"group_id: {selected_group_id}")
                else:
                    st.info("No image available for the selected filtered product.")

if filtered_df.empty:
    st.warning("No products match the current filters.")
    st.stop()

def _row_label(row) -> str:
    group_id = str(row.get("group_id", "")).strip()
    description = str(row.get("description", "")).strip().replace("\n", " ")
    preview = description[:64] + ("..." if len(description) > 64 else "")
    return f"{group_id} | {preview}"


filtered_rows = filtered_df.to_dict("records")
label_to_row = {_row_label(row): row for row in filtered_rows}
group_to_label = {str(row.get("group_id", "")).strip(): label for label, row in label_to_row.items()}

if "selected_group_id" not in st.session_state:
    st.session_state.selected_group_id = str(filtered_rows[0].get("group_id", ""))

if st.session_state.selected_group_id not in group_to_label:
    st.session_state.selected_group_id = str(filtered_rows[0].get("group_id", ""))

selected_label_default = group_to_label.get(st.session_state.selected_group_id, list(label_to_row.keys())[0])
selected_label_options = list(label_to_row.keys())
selected_label_index = selected_label_options.index(selected_label_default)

with editor_col:
    with st.container(border=True):
        st.markdown("**Product editor**")
        selected_label = st.selectbox("Select product to edit", options=selected_label_options, index=selected_label_index)
        selected = label_to_row[selected_label]
        st.session_state.selected_group_id = str(selected.get("group_id", ""))
        st.caption(f"Editing group_id: {selected['group_id']}")

with editor_col:
    with st.form("stock_edit_form", border=True):
        description = st.text_area("Description", value=str(selected.get("description") or ""), height=180)

        current_mentions = _split_semicolon(str(selected.get("size_mentions") or ""))
        current_sold = _split_semicolon(str(selected.get("sold_sizes") or ""))
        default_available = [size for size in SIZE_OPTIONS if size in current_mentions and size not in current_sold]
        default_sold = [size for size in SIZE_OPTIONS if size in current_sold]

        st.markdown("**Size availability**")
        size_available = st.multiselect(
            "Available sizes",
            options=SIZE_OPTIONS,
            default=default_available,
            help="Use FREE_SIZE when this item is one-size/free-size.",
        )
        size_sold = st.multiselect(
            "Sold sizes",
            options=SIZE_OPTIONS,
            default=default_sold,
        )

        manual_size_mentions = _ordered_size_join(size_available + size_sold)
        manual_sold_sizes = _ordered_size_join(size_sold) if size_sold else ""

        row_a, row_b = st.columns(2)
        with row_a:
            item_count = st.number_input(
                "Item count",
                min_value=0,
                max_value=999,
                value=int(selected.get("item_count") or 0),
                step=1,
            )
            price = st.number_input(
                "Price",
                min_value=0.0,
                value=float(selected.get("price") or 0.0),
                step=0.5,
                format="%.2f",
            )
            active = st.checkbox("Active", value=bool(selected.get("active")))
        with row_b:
            caption_has_sold = st.checkbox("Caption has sold", value=bool(selected.get("caption_has_sold")))
            primary_image_file = st.text_input("Primary image file", value=str(selected.get("primary_image_file") or ""))
            image_files = st.text_area("Image files (semicolon separated)", value=str(selected.get("image_files") or ""), height=100)

        parsed_preview = categorize_description(description)
        st.markdown("**Auto-derived stock fields (from description)**")
        prev_a, prev_b = st.columns(2)
        with prev_a:
            st.text_input("Dress description", value=str(parsed_preview["dress_description"]), disabled=True)
            st.text_input("Sizes from parser", value=str(parsed_preview["size_mentions"]), disabled=True)
            st.text_input("Sold sizes from parser", value=str(parsed_preview["sold_sizes"]), disabled=True)
        with prev_b:
            st.text_input("Available sizes (manual)", value=_compute_available_sizes(manual_size_mentions, manual_sold_sizes), disabled=True)
            st.checkbox("DM mentioned", value=bool(parsed_preview["dm_us"]), disabled=True)
            st.text_input("Tags", value=str(parsed_preview["tags"]), disabled=True)

        submit_update = st.form_submit_button("Update product", icon=":material/save:")

if submit_update:
    merged = products_df.copy()
    row_mask = merged["group_id"].astype(str) == str(selected["group_id"])
    if not row_mask.any():
        st.error("Could not find selected product in catalog.")
        st.stop()

    merged.loc[row_mask, "description"] = description
    merged.loc[row_mask, "size_mentions"] = manual_size_mentions
    merged.loc[row_mask, "sold_sizes"] = manual_sold_sizes
    merged.loc[row_mask, "item_count"] = int(item_count)
    merged.loc[row_mask, "price"] = float(price)
    merged.loc[row_mask, "active"] = bool(active)
    merged.loc[row_mask, "caption_has_sold"] = bool(caption_has_sold or bool(manual_sold_sizes))
    merged.loc[row_mask, "primary_image_file"] = str(primary_image_file).strip()
    merged.loc[row_mask, "image_files"] = str(image_files).strip()

    save_product_info(merged)
    saved_path = refresh_catalog_parsed_fields(overwrite_sizes=False)
    st.success(f"Updated and saved to {saved_path}")
    st.cache_data.clear()
    st.rerun()

with workspace_col:
    if st.button("Reload from disk", icon=":material/refresh:"):
        st.cache_data.clear()
        st.rerun()
