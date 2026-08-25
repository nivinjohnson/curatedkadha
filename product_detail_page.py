from __future__ import annotations

from pathlib import Path

import streamlit as st

from store_backend import add_to_cart, init_state, load_product_info, resolve_image_paths

SHOP_PAGE_PATH = Path(__file__).with_name("shop_page.py")
CART_PAGE_PATH = Path(__file__).with_name("cart_checkout_page.py")


def split_sizes(value: str) -> set[str]:
    return {part.strip().upper() for part in str(value or "").split(";") if part.strip()}


def format_size_label(size: str) -> str:
    return "Free Size" if str(size).upper() == "FREE_SIZE" else str(size)


def available_sizes(size_mentions: str, sold_sizes: str) -> str:
    mentions = split_sizes(size_mentions)
    sold = split_sizes(sold_sizes)
    ordered = [s for s in ["FREE_SIZE", "XS", "S", "M", "L", "XL", "XXL", "3XL"] if s in (mentions - sold)]
    return ";".join(format_size_label(s) for s in ordered)


def sold_sizes_display(sold_sizes: str) -> str:
    ordered = [s for s in ["FREE_SIZE", "XS", "S", "M", "L", "XL", "XXL", "3XL"] if s in split_sizes(sold_sizes)]
    return ";".join(format_size_label(s) for s in ordered)


st.title("Product details")

init_state()

selected_group_id = str(st.session_state.get("selected_group_id", "")).strip()
if not selected_group_id:
    st.warning("No product selected yet.")
    if st.button("Back to shop", icon=":material/storefront:"):
        st.switch_page(str(SHOP_PAGE_PATH))
    st.stop()

try:
    products_df = load_product_info()
except Exception as exc:
    st.error(f"Could not load product info: {exc}")
    st.stop()

match = products_df[products_df["group_id"].astype(str) == selected_group_id]
if match.empty:
    st.warning("Selected product is not available.")
    if st.button("Back to shop", icon=":material/storefront:"):
        st.switch_page(str(SHOP_PAGE_PATH))
    st.stop()

item = match.iloc[0]

BACK_ACTION = ":material/arrow_back: Back"
CART_ACTION = ":material/shopping_cart: Go to Cart"

nav_action = st.segmented_control(
    "Product navigation",
    options=[BACK_ACTION, CART_ACTION],
    default=None,
    label_visibility="collapsed",
)
if nav_action == BACK_ACTION:
    st.switch_page(str(SHOP_PAGE_PATH))
elif nav_action == CART_ACTION:
    st.switch_page(str(CART_PAGE_PATH))

image_paths = resolve_image_paths(str(item.get("image_files") or ""))

content_left, content_right = st.columns([1.25, 1], gap="large")

with content_left:
    if image_paths:
        st.image(image_paths)
    else:
        st.info("No image available for this product.")

with content_right:
    st.subheader(str(item.get("title") or "Untitled product"))
    st.write(f"${float(item.get('price', 0.0)):.2f}")

    available = available_sizes(str(item.get("size_mentions") or ""), str(item.get("sold_sizes") or ""))
    st.text_input("Available sizes", value=available or "None listed", disabled=True)
    sold_display = sold_sizes_display(str(item.get("sold_sizes") or ""))
    st.text_input("Sold sizes", value=sold_display or "", disabled=True)

    with st.container(border=True):
        st.markdown("**Ready to order?**")
        if st.button("Add to cart", icon=":material/add_shopping_cart:", width="stretch"):
            add_to_cart(selected_group_id)
            st.switch_page(str(CART_PAGE_PATH))

st.markdown("**Description**")
st.write(str(item.get("description") or "No description provided."))

if str(item.get("dress_description") or "").strip():
    st.markdown("**Dress details**")
    st.write(str(item.get("dress_description") or ""))

if str(item.get("tags") or "").strip():
    st.markdown("**Tags**")
    st.write(str(item.get("tags") or ""))
