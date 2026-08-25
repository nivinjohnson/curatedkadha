import streamlit as st

from store_backend import get_cart_counts, init_state

SIZE_ORDER = ["FREE_SIZE", "XS", "S", "M", "L", "XL", "XXL", "3XL"]

st.set_page_config(
    page_title="Insta shop",
    page_icon=":material/storefront:",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
    [data-testid="stSidebar"] {display: none !important;}
    [data-testid="collapsedControl"] {display: none !important;}
    .block-container {
        padding-top: 3.6rem;
    }
    .st-key-top_nav_row [data-testid="stHorizontalBlock"] {
        flex-wrap: nowrap !important;
        justify-content: flex-end;
        overflow-x: auto;
        gap: 0.35rem;
    }
    .st-key-top_nav_row [data-testid="stHorizontalBlock"] > div {
        flex: 0 0 auto !important;
        min-width: 2.6rem;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

init_state()
cart_products, _ = get_cart_counts()

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

shop_page = st.Page("shop_page.py", title="Shop", icon=":material/storefront:")
product_detail_page = st.Page("product_detail_page.py", title="Product details", icon=":material/info:")
product_info_page = st.Page("product_info_page.py", title="Stock info", icon=":material/edit_square:")
cart_page = st.Page("cart_checkout_page.py", title=f"Cart ({cart_products})", icon=":material/shopping_cart:")

navigation = st.navigation([shop_page, product_detail_page, product_info_page, cart_page], position="hidden")

current_title = getattr(navigation, "title", "Shop")
with st.container(horizontal=True, horizontal_alignment="right", key="top_nav_row"):
    with st.popover("☰", use_container_width=True):
        if st.button("Shop", key="nav_shop", type="primary" if current_title == shop_page.title else "secondary", use_container_width=True):
            st.switch_page("shop_page.py")
        if st.button("Products", key="nav_details", type="primary" if current_title == product_detail_page.title else "secondary", use_container_width=True):
            st.switch_page("product_detail_page.py")
        if st.button("Stock", key="nav_stock", type="primary" if current_title == product_info_page.title else "secondary", use_container_width=True):
            st.switch_page("product_info_page.py")

    st.markdown("<div style='width:2.6rem; height:1px; opacity:0;'>.</div>", unsafe_allow_html=True)

    if st.button(f":material/shopping_cart: {cart_products}", key="nav_cart_button", use_container_width=True):
        st.switch_page("cart_checkout_page.py")

navigation.run()
