from __future__ import annotations

from pathlib import Path

import streamlit as st

from store_backend import (
    clear_cart,
    email_config_ready,
    get_cart_df,
    init_state,
    load_product_info,
    resolve_image_paths,
    save_order,
    send_order_emails,
    update_cart_quantity,
)

SHOP_PAGE_PATH = Path(__file__).with_name("shop_page.py")

st.title("Checkout")

init_state()

try:
    products_df = load_product_info()
except Exception as exc:
    st.error(f"Could not load product info: {exc}")
    st.stop()

cart_df = get_cart_df(products_df)

if cart_df.empty:
    st.info("Your cart is empty.")
    if st.button("Back to shop", icon=":material/storefront:"):
        st.switch_page(str(SHOP_PAGE_PATH))
    st.stop()

cart_total_placeholder = st.empty()
cart_total_placeholder.metric("Cart total", f"${float(cart_df['line_total'].sum()):.2f}")

for _, line in cart_df.iterrows():
    with st.container(border=True):
        title_col, meta_col = st.columns([1, 8], gap="small")
        with title_col:
            product_match = products_df[products_df["group_id"].astype(str) == str(line["group_id"])]
            image_files_value = str(product_match.iloc[0]["image_files"]) if not product_match.empty else ""
            image_paths = resolve_image_paths(image_files_value)
            if image_paths:
                st.image(image_paths[0], width=42)
        with meta_col:
            st.write(line["title"])
        st.caption(f"${line['price']:.2f} each | includes {int(line['item_count'])} image(s)")
        qty_key = f"qty_{line['group_id']}"
        qty_value = st.number_input(
            "Quantity",
            min_value=0,
            max_value=99,
            value=int(line["qty"]),
            step=1,
            key=qty_key,
        )
        update_cart_quantity(str(line["group_id"]), int(qty_value))
        current_line_total = float(line["price"]) * int(qty_value)
        st.caption(f"Line total: ${current_line_total:.2f}")

cart_df = get_cart_df(products_df)
cart_total_placeholder.metric("Cart total", f"${float(cart_df['line_total'].sum()):.2f}")

BACK_ACTION = ":material/arrow_back: Back"
CLEAR_ACTION = ":material/remove_shopping_cart: Clear cart"

cart_action = st.segmented_control(
    "Cart actions",
    options=[BACK_ACTION, CLEAR_ACTION],
    default=None,
    label_visibility="collapsed",
)
if cart_action == BACK_ACTION:
    st.switch_page(str(SHOP_PAGE_PATH))
elif cart_action == CLEAR_ACTION:
    clear_cart()
    st.rerun()

st.divider()
if not email_config_ready():
    st.info(
        "Email sending is not configured yet. Set SHOP_SMTP_HOST, SHOP_SMTP_USER, SHOP_SMTP_PASSWORD, and SHOP_FROM_EMAIL in environment variables or Streamlit secrets."
    )

with st.form("checkout_form", border=True):
    customer_name = st.text_input("Full name")
    phone = st.text_input("Phone number")
    email = st.text_input("Email")
    address = st.text_area("Delivery address")
    submitted = st.form_submit_button("Place order", icon=":material/payment:")

if submitted:
    if not customer_name.strip() or not phone.strip() or not email.strip() or not address.strip():
        st.error("Please complete name, phone number, email, and address before placing the order.")
    else:
        order_file = save_order(
            cart_df=cart_df,
            customer_name=customer_name.strip(),
            email=email.strip(),
            address=address.strip(),
            phone=phone.strip(),
        )

        email_result = send_order_emails(
            order_file=order_file,
            cart_df=cart_df,
            customer_name=customer_name.strip(),
            customer_email=email.strip(),
            address=address.strip(),
            customer_phone=phone.strip(),
        )
        st.success("Order placed successfully.")
        if email_result.get("sent"):
            st.success("Order email sent to customer and curatedkadha@gmail.com")
        else:
            st.warning(email_result.get("message", "Order email could not be sent."))

        clear_cart()
