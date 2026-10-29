(() => {
  "use strict";

  const KEYS = {
    products: "elisCrunch.products",
    cart: "elisCrunch.cart",
    orders: "elisCrunch.orders",
    settings: "elisCrunch.settings",
    admin: "elisCrunch.admin",
    seen: "elisCrunch.seenOrders",
    lastOrder: "elisCrunch.lastOrder",
    notes: "elisCrunch.cartNotes",
    gcashDrafts: "elisCrunch.gcashDrafts"
  };
  const DEFAULT_SETTINGS = {
    businessName: "Eli's Crunch",
    tagline: "Little Chef, Big Smiles",
    hours: "8 AM – 9 PM",
    address: "Nabunturan, Davao de Oro",
    facebook: "",
    phone: "",
    deliveryEnabled: true,
    pickupEnabled: true,
    minimumOrder: 0,
    deliveryFee: 30,
    freeDeliveryThreshold: 0
  };
  const BUSINESS_HOURS = { open: "08:00", close: "21:00" };
  const SCHEDULE_INTERVAL_MINUTES = 30;
  const SCHEDULE_DAYS_AHEAD = 7;
  const GCASH_SETTINGS = { accountName: "Eli's Crunch", accountNumber: "09XXXXXXXXX", requireSenderName: true };
  const GCASH_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;
  const STATUSES = ["Awaiting Payment", "Payment Verification", "Payment Rejected", "Scheduled", "New", "Confirmed", "Preparing", "Ready", "Out for Delivery", "Delivered", "Cancelled"];
  const PAYMENT_STATUSES = ["Pending Verification", "Verified", "Rejected"];
  const app = document.getElementById("app");
  let toastTimer;
  let activeCategory = "All";
  let detailQuantity = 1;
  let checkoutErrors = {};
  let orderSearchResult = "";
  let paymentModal = null;
  let gcashScreenshotPreviewUrl = "";
  let gcashScreenshotFile = null;
  let gcashScreenshotDraftId = "";

  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.error(`Unable to read ${key} from local storage.`, error);
      notify("Some saved demo data could not be read.");
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Unable to save ${key} to local storage.`, error);
      notify("Your browser could not save this demo change.");
      return false;
    }
  }
  function products() {
    const saved = read(KEYS.products, null);
    if (!Array.isArray(saved)) return INITIAL_PRODUCTS.map(item => ({ ...item }));

    const fixedCategoryIds = new Set([
      "rice99-pork-dinakdakan",
      "rice99-hungarian-sausage",
      "rice99-beef-tapa",
      "rice99-chicken-pepper-steak"
    ]);
    const pastaProductIds = new Set([
      "pasta-carbonara",
      "pasta-carbonara-katsu",
      "pasta-mac-cheese",
      "pasta-mac-cheese-poppers"
    ]);
    let updated = false;
    const normalized = saved.map(item => {
      let category = item.category;
      if (fixedCategoryIds.has(item.id)) category = "Rice Meals";
      if (pastaProductIds.has(item.id) || category === "Pasta") category = "Pasta & Platters";
      const isUploadedImage = item.image?.startsWith("data:image/");
      const imageData = isUploadedImage
        ? { image: item.image, imageSource: "official" }
        : getProductImageData(item.id, item.name, category);
      if (category !== item.category || imageData.image !== item.image || item.imageSource !== imageData.imageSource) {
        updated = true;
        return { ...item, ...imageData, category };
      }
      return item;
    });
    if (updated) write(KEYS.products, normalized);
    return normalized;
  }
  function saveProducts(value) { return write(KEYS.products, value); }
  function cart() { return read(KEYS.cart, {}); }
  function saveCart(value) { return write(KEYS.cart, value); }
  function orders() {
    const saved = read(KEYS.orders, []);
    return Array.isArray(saved) ? saved : [];
  }
  function gcashDrafts() {
    const saved = read(KEYS.gcashDrafts, []);
    return Array.isArray(saved) ? saved : [];
  }
  function saveGcashDrafts(value) { return write(KEYS.gcashDrafts, value); }
  function settings() { return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) }; }
  function money(value) {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value);
  }
  function moneyExact(value) {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }
  function clockMinutes(value) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  }
  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function addDaysToDateKey(value, days) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    return dateKey(date);
  }
  function dateFromKey(value, time = "00:00") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !/^\d{2}:\d{2}$/.test(time)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);
    if (hours > 23 || minutes > 59) return null;
    const date = new Date(year, month - 1, day, hours, minutes);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  function isBusinessOpen(now = new Date()) {
    const minutes = now.getHours() * 60 + now.getMinutes();
    return minutes >= clockMinutes(BUSINESS_HOURS.open) && minutes < clockMinutes(BUSINESS_HOURS.close);
  }
  function scheduleSlotsForDate(value, now = new Date()) {
    const date = dateFromKey(value);
    if (!date) return [];
    const today = dateKey(now);
    const opening = clockMinutes(BUSINESS_HOURS.open);
    const closing = clockMinutes(BUSINESS_HOURS.close);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const slots = [];
    for (let minutes = opening; minutes <= closing; minutes += SCHEDULE_INTERVAL_MINUTES) {
      if (value !== today || minutes > nowMinutes) {
        slots.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
      }
    }
    return slots;
  }
  function firstAvailableSchedule(now = new Date()) {
    const today = dateKey(now);
    for (let offset = 0; offset <= SCHEDULE_DAYS_AHEAD; offset += 1) {
      const date = addDaysToDateKey(today, offset);
      const times = scheduleSlotsForDate(date, now);
      if (times.length) return { date, time: times[0] };
    }
    return { date: addDaysToDateKey(today, 1), time: BUSINESS_HOURS.open };
  }
  function scheduleDateTime(order) {
    return dateFromKey(order.scheduledDate, order.scheduledTime);
  }
  function isScheduleDue(order, now = new Date()) {
    const scheduledAt = scheduleDateTime(order);
    return Boolean(scheduledAt && scheduledAt <= now);
  }
  function formatScheduleDate(value, options = {}) {
    const date = dateFromKey(value);
    return date ? date.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", ...options }) : "";
  }
  function formatScheduleTime(value) {
    const date = dateFromKey(dateKey(new Date()), value);
    return date ? date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : "";
  }
  function formatScheduleShortDate(value) {
    return formatScheduleDate(value, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  function scheduleOrderType(order) {
    return order.orderMode === "Scheduled" ? `Scheduled ${order.orderType}` : order.orderType;
  }
  function availablePayments(orderType, orderMode) {
    if (orderType === "Pickup") return ["Cash on Pickup", "GCash"];
    return orderMode === "Scheduled" ? ["GCash"] : ["Cash on Delivery", "GCash"];
  }
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }
  function notify(message) {
    const region = document.getElementById("toast-region");
    if (!region) return;
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    region.replaceChildren(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), 3000);
  }
  function path() { return decodeURIComponent(location.pathname).replace(/\/+$/, "") || "/"; }
  function go(to) {
    history.pushState({}, "", to);
    activeCategory = to === "/menu" ? activeCategory : "All";
    checkoutErrors = {};
    render();
    window.scrollTo(0, 0);
  }
  function link(to, text, cls = "") {
    return `<a class="${cls}" href="${to}" data-link="${to}">${text}</a>`;
  }
  function cartCount() {
    return Object.values(cart()).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
  }
  function cartRows() {
    const current = cart();
    const catalog = products();
    const notes = read(KEYS.notes, {});
    return Object.entries(current).map(([id, quantity]) => {
      const product = catalog.find(item => item.id === id);
      return product && Number(quantity) > 0 ? { product, quantity: Number(quantity), specialInstructions: notes[id] || "" } : null;
    }).filter(Boolean);
  }
  function subtotal() { return cartRows().reduce((sum, row) => sum + row.product.price * row.quantity, 0); }
  function deliveryFee(type = "Delivery") {
    if (type !== "Delivery") return 0;
    const config = settings();
    if (config.freeDeliveryThreshold > 0 && subtotal() >= config.freeDeliveryThreshold) return 0;
    return Number(config.deliveryFee) || 0;
  }
  function header() {
    const cfg = settings();
    return `<header class="site-header"><div class="nav-wrap">
      <a class="brand" href="/" data-link="/" aria-label="Eli's Crunch home"><img src="/images/eli-icon.jpg" alt="Chef Eli logo"><span>Eli's Crunch</span></a>
      <nav class="nav-links" id="main-nav" aria-label="Main navigation">
        ${link("/", "Home")}${link("/menu", "Menu")}${link("/about", "About")}${link("/contact", "Contact")}${link("/track-order", "Track Order")}
      </nav>
      <div class="nav-actions"><a class="cart-link" href="/cart" data-link="/cart" aria-label="Cart, ${cartCount()} items">Cart <span class="cart-count">${cartCount()}</span></a><a class="button button-primary" href="/menu" data-link="/menu">${isBusinessOpen() ? "Order Now" : "Schedule an Order"}</a></div>
      <button class="menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false" data-action="toggle-nav">☰</button>
    </div></header>`;
  }
  function productImageAlt(item) {
    return item.imageSource === "official"
      ? `Eli's Crunch-provided image for ${item.name}`
      : `Temporary demo food photo for ${item.name}`;
  }
  function footer() {
    const cfg = settings();
    return `<footer class="footer"><div class="container"><div class="footer-grid">
      <div><a class="brand" href="/" data-link="/"><img src="/images/eli-icon.jpg" alt=""><span>${esc(cfg.businessName)}</span></a><p style="margin-top:14px">${esc(cfg.tagline)}</p><p>${esc(cfg.address)}<br>${esc(cfg.hours)}</p></div>
      <div><strong>Explore</strong><div class="footer-links" style="margin-top:14px">${link("/", "Home")}${link("/menu", "Menu")}${link("/track-order", "Track Order")}</div></div>
      <div><strong>More</strong><div class="footer-links" style="margin-top:14px">${link("/about", "About")}${link("/contact", "Contact")}${link("/faq", "FAQ")}${cfg.facebook ? `<a href="${esc(cfg.facebook)}" target="_blank" rel="noopener noreferrer">Facebook</a>` : ""}</div></div>
    </div><div class="footer-bottom">© ${new Date().getFullYear()} ${esc(cfg.businessName)} · Demo online ordering proposal · Food images shown in this demo are for presentation purposes and may be replaced with official Eli's Crunch product photos.</div></div></footer>`;
  }
  function shell(content, options = {}) {
    const floatingCart = cartCount() && options.floating !== false
      ? `<div class="mobile-cart"><a class="button button-primary" href="/cart" data-link="/cart">🛒 View Cart — ${money(subtotal())}</a></div>` : "";
    const closedBanner = !isBusinessOpen()
      ? `<div class="closed-banner" role="status"><div><strong>We're currently closed</strong><br>You can still place an order for our next available opening.</div>${path() === "/checkout"
        ? `<button class="button button-outline" type="button" data-action="select-scheduled">Schedule an Order</button>`
        : `<a class="button button-outline" href="/menu" data-link="/menu">Schedule an Order</a>`}</div>`
      : "";
    document.body.classList.toggle("has-mobile-cart", Boolean(floatingCart));
    app.innerHTML = `${header()}${closedBanner}<main>${content}</main>${footer()}${floatingCart}`;
  }
  function productCard(item) {
    return `<article class="product-card">
      <div class="product-image" data-action="product-detail" data-id="${esc(item.id)}" tabindex="0" role="link" aria-label="View ${esc(item.name)} details">
        <img src="${esc(item.image || "/images/eli-icon.jpg")}" alt="${esc(productImageAlt(item))}" data-image-source="${esc(item.imageSource || "temporary-demo")}" loading="lazy" onerror="this.onerror=null;this.src='/images/eli-icon.jpg'">
        <span class="category-pill">${esc(item.category)}</span>
      </div>
      <div class="product-info"><h3>${esc(item.name)}</h3><div class="product-price">${money(item.price)}</div>
      <div class="product-actions"><button class="button button-outline" type="button" data-action="product-detail" data-id="${esc(item.id)}">Details</button>
      <button class="button button-primary" type="button" data-action="add-cart" data-id="${esc(item.id)}" ${item.available === false ? "disabled" : ""}>${item.available === false ? "Sold Out" : "Add to Cart"}</button></div>
      ${item.available === false ? `<span class="sold-out">SOLD OUT</span>` : ""}</div></article>`;
  }
  function homePage() {
    const catalogue = products();
    const featured = catalogue.filter(item => item.available !== false).slice(0, 8);
    const heroProducts = ["six-piece-wings", "pasta-carbonara", "rice99-chicken-katsu", "rice-meal-pork-sisig"]
      .map(id => catalogue.find(item => item.id === id))
      .filter(Boolean);
    return `<section class="hero"><div class="container hero-grid"><div class="hero-copy"><div class="eyebrow">Nabunturan, Davao de Oro</div>
      <h1>Good Food.<br><span>Big Smiles.</span><br>Delivered.</h1>
      <p class="lead">Order your favorite Eli's Crunch meals online for delivery or pickup in Nabunturan.</p>
      <div class="hero-actions"><a class="button button-primary" href="/menu" data-link="/menu">${isBusinessOpen() ? "Order Now" : "Schedule an Order"}</a><a class="button button-outline" href="/menu" data-link="/menu">View Menu</a></div>
      <div class="trust-row"><span>Browse the menu anytime</span><span>Delivery or pickup</span><span>Order tracking demo</span></div>
      </div><div class="hero-art"><div class="hero-slideshow" role="img" aria-label="Rotating temporary demo food photos from the Eli's Crunch menu"><div class="hero-slides">${heroProducts.map((item, index) => `<figure class="hero-slide" style="--slide-index:${index}" aria-hidden="true"><img src="${esc(item.image)}" alt="" data-image-source="${esc(item.imageSource)}"><figcaption><span>From the menu</span><strong>${esc(item.name)}</strong></figcaption></figure>`).join("")}</div><div class="hero-slide-indicators" aria-hidden="true">${heroProducts.map((_, index) => `<span style="--slide-index:${index}"></span>`).join("")}</div></div></div></div></section>
      <section class="section"><div class="container"><div class="section-heading"><div><div class="eyebrow">From the menu</div><h2>Customer favorites</h2><p>Explore the Eli's Crunch menu and find something to enjoy.</p></div>${link("/menu", "See full menu →", "button button-outline")}</div>
      <div class="product-grid">${featured.map(productCard).join("")}</div></div></section>
      <section class="section-tight"><div class="container"><div class="promo-band"><div class="promo-grid"><div><div class="eyebrow" style="color:#ffdc84">A tasty place to start</div><h2>₱99 Rice Meals</h2><p>Browse the rice meals category for the available choices.</p></div><a class="button button-primary" href="/menu" data-link="/menu" data-category="₱99 Rice Meals">Explore menu</a></div></div></section>
      <section class="section"><div class="container"><div class="section-heading"><div><div class="eyebrow">Find your craving</div><h2>Browse categories</h2></div></div>
      <div class="category-grid">${MENU_CATEGORIES.map((category, index) => {
        const categoryImage = catalogue.find(item => item.category === category)?.image || "/images/eli-icon.jpg";
        const itemCount = catalogue.filter(item => item.category === category).length;
        return `<button class="category-card" type="button" data-action="category-link" data-category="${esc(category)}" style="--category-image:url('${esc(categoryImage)}')"><span class="category-card-number">${String(index + 1).padStart(2, "0")}</span><span class="category-card-content"><strong>${esc(category)}</strong><small>${itemCount} ${itemCount === 1 ? "item" : "items"}</small></span><span class="category-card-arrow" aria-hidden="true">↗</span></button>`;
      }).join("")}</div></div></section>
      <section class="section-tight"><div class="container"><div class="section-heading"><div><div class="eyebrow">Easy as 1, 2, 3</div><h2>How it works</h2></div></div>
      <div class="steps-grid">${[["01","Choose your food","Browse the Eli's Crunch menu."],["02","Add to cart","Review your items and quantities."],["03","Checkout","Choose delivery or pickup and a demo payment method."],["04","Enjoy your order","Save your order number and follow its status."]].map(([n,t,d]) => `<article class="step-card"><div class="step-num">${n}</div><h3>${t}</h3><p>${d}</p></article>`).join("")}</div></div></section>
      <section class="section-tight"><div class="container"><div class="section-heading"><div><div class="eyebrow">Ordering made clearer</div><h2>Why order online?</h2></div></div><div class="benefits"><div class="benefit">Browse the menu anytime</div><div class="benefit">See your complete order before submitting</div><div class="benefit">Get an order number</div><div class="benefit">Track your order status</div></div></div></section>
      <section class="section"><div class="container"><div class="promo-band"><div class="promo-grid"><div><h2>Ready to order?</h2><p>Good Food. Big Smiles. Browse the menu to get started.</p></div><a class="button button-primary" href="/menu" data-link="/menu">${isBusinessOpen() ? "Order Now" : "Schedule an Order"}</a></div></div></section>`;
  }
  function menuPage() {
    const query = new URLSearchParams(location.search).get("q") || "";
    const selected = activeCategory;
    let list = products().filter(item => selected === "All" || item.category === selected);
    if (query) list = list.filter(item => `${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
    const sort = new URLSearchParams(location.search).get("sort") || "recommended";
    if (sort === "low") list.sort((a, b) => a.price - b.price);
    if (sort === "high") list.sort((a, b) => b.price - a.price);
    return `<section class="container page-top"><div class="eyebrow">Made for your cravings</div><h1>Our Menu</h1><p class="lead">Find your favorites from the Eli's Crunch menu.</p></section>
      <section class="container section-tight"><div class="menu-toolbar">
      <div class="field"><label for="menu-search">Search menu</label><input id="menu-search" class="search-input" type="search" placeholder="Search chicken, pasta..." value="${esc(query)}" data-action="menu-search"></div>
      <div class="field"><label for="category-select">Category</label><select id="category-select" data-action="category-select"><option value="All">All categories</option>${MENU_CATEGORIES.map(cat => `<option value="${esc(cat)}" ${selected === cat ? "selected" : ""}>${esc(cat)}</option>`).join("")}</select></div>
      <div class="field"><label for="sort-select">Sort by</label><select id="sort-select" data-action="sort-select"><option value="recommended" ${sort === "recommended" ? "selected" : ""}>Recommended</option><option value="low" ${sort === "low" ? "selected" : ""}>Price: low to high</option><option value="high" ${sort === "high" ? "selected" : ""}>Price: high to low</option></select></div></div>
      <div class="category-filters" aria-label="Filter menu category"><button class="chip ${selected === "All" ? "active" : ""}" type="button" data-action="filter-category" data-category="All">All</button>${MENU_CATEGORIES.map(cat => `<button class="chip ${selected === cat ? "active" : ""}" type="button" data-action="filter-category" data-category="${esc(cat)}">${esc(cat)}</button>`).join("")}</div>
      <div id="menu-results">${list.length ? `<div class="product-grid">${list.map(productCard).join("")}</div>` : `<div class="empty-state"><h3>No matching menu items</h3><p>Try a different search or category.</p><button class="button button-outline" data-action="clear-search">Clear filters</button></div>`}</div>
      </section>`;
  }
  function detailPage(id) {
    const item = products().find(product => product.id === id);
    if (!item) return `<section class="container section"><div class="empty-state"><h1>Product not found</h1><a class="button button-primary" href="/menu" data-link="/menu">Back to menu</a></div></section>`;
    return `<section class="container section"><div class="two-col"><div class="panel detail-image-panel"><img class="detail-product-image" src="${esc(item.image)}" alt="${esc(productImageAlt(item))}" data-image-source="${esc(item.imageSource || "temporary-demo")}" onerror="this.onerror=null;this.src='/images/eli-icon.jpg'"></div>
      <div class="panel"><div class="eyebrow">${esc(item.category)}</div><h1 style="font-size:clamp(34px,5vw,52px)">${esc(item.name)}</h1><div class="product-price" style="font-size:25px">${money(item.price)}</div><p class="muted" style="margin-top:18px">${esc(productImageAlt(item))}; the actual dish may look different.</p>
      ${item.available === false ? `<p class="sold-out">SOLD OUT</p>` : `<div class="field" style="max-width:180px;margin:20px 0"><label for="detail-qty">Quantity</label><div class="qty-control"><button type="button" data-action="detail-qty" data-change="-1" aria-label="Decrease quantity">−</button><span id="detail-qty">${detailQuantity}</span><button type="button" data-action="detail-qty" data-change="1" aria-label="Increase quantity">+</button></div></div>
      <div class="field"><label for="special-instructions">Special instructions (optional)</label><textarea id="special-instructions" placeholder="Add a note for your order"></textarea></div>
      <button class="button button-primary button-block" style="margin-top:16px" data-action="add-cart" data-id="${esc(item.id)}" data-detail="true">Add to Cart — ${money(item.price * detailQuantity)}</button>`}
      <a href="/menu" data-link="/menu" class="button button-outline button-block" style="margin-top:10px">Continue shopping</a></div></div></section>`;
  }
  function cartPage() {
    const rows = cartRows();
    if (!rows.length) return `<section class="container section"><div class="empty-state"><div class="eyebrow">Your basket</div><h1>Your cart is empty</h1><p>Browse the menu and add something delicious.</p><a class="button button-primary" href="/menu" data-link="/menu">Browse Menu</a></div></section>`;
    const fee = deliveryFee();
    return `<section class="container page-top"><div class="eyebrow">Almost there</div><h1>Your Cart</h1></section><section class="container section-tight"><div class="two-col"><div class="panel">
      ${rows.map(({ product, quantity, specialInstructions }) => `<div class="cart-row"><img class="cart-thumb" src="${esc(product.image)}" alt="" onerror="this.onerror=null;this.src='/images/eli-icon.jpg'"><div><strong>${esc(product.name)}</strong><div class="muted small">${esc(product.category)} · ${money(product.price)} each</div>${specialInstructions ? `<div class="small muted">Note: ${esc(specialInstructions)}</div>` : ""}<div class="qty-control" style="margin-top:9px"><button data-action="cart-qty" data-id="${esc(product.id)}" data-change="-1" aria-label="Decrease ${esc(product.name)} quantity">−</button><span>${quantity}</span><button data-action="cart-qty" data-id="${esc(product.id)}" data-change="1" aria-label="Increase ${esc(product.name)} quantity">+</button></div></div><div style="text-align:right"><strong>${money(product.price * quantity)}</strong><button class="button button-danger" style="display:block;margin-top:8px;min-height:32px;padding:6px 9px;font-size:12px" data-action="remove-cart" data-id="${esc(product.id)}">Remove</button></div></div>`).join("")}
      <div style="display:flex;justify-content:space-between;margin-top:17px"><a class="button button-outline" href="/menu" data-link="/menu">Continue Shopping</a><button class="button button-danger" data-action="clear-cart">Clear Cart</button></div>
      </div><aside class="panel"><h2 style="font-size:26px">Order Summary</h2><div class="summary-line"><span>Subtotal</span><strong>${money(subtotal())}</strong></div><div class="summary-line"><span>Demo delivery fee</span><span>${money(fee)}</span></div><p class="small muted">Delivery fee is a configurable demo amount and would be calculated based on your delivery area in the final system.</p><div class="summary-line total"><span>Estimated total</span><span>${money(subtotal() + fee)}</span></div><a class="button button-primary button-block" href="/checkout" data-link="/checkout">Proceed to Checkout</a></aside></div></section>`;
  }
  function checkoutPage() {
    const rows = cartRows();
    if (!rows.length) return `<section class="container section"><div class="empty-state"><h1>Your cart is empty</h1><a class="button button-primary" href="/menu" data-link="/menu">Browse Menu</a></div></section>`;
    const prior = read("elisCrunch.checkoutDraft", {});
    const error = key => checkoutErrors[key] ? `<span class="field-error">${esc(checkoutErrors[key])}</span>` : "";
    const now = new Date();
    const open = isBusinessOpen(now);
    const orderMode = open && prior.orderMode !== "Scheduled" ? "Now" : "Scheduled";
    const firstSchedule = firstAvailableSchedule(now);
    const minDate = dateKey(now);
    const maxDate = addDaysToDateKey(minDate, SCHEDULE_DAYS_AHEAD);
    let scheduledDate = prior.scheduledDate;
    if (!scheduledDate || scheduledDate < minDate || scheduledDate > maxDate || !scheduleSlotsForDate(scheduledDate, now).length) {
      scheduledDate = firstSchedule.date;
    }
    const availableSlots = scheduleSlotsForDate(scheduledDate, now);
    const scheduledTime = availableSlots.includes(prior.scheduledTime) ? prior.scheduledTime : availableSlots[0];
    const orderType = prior.orderType === "Pickup" ? "Pickup" : "Delivery";
    const paymentOptions = availablePayments(orderType, orderMode);
    let payment = paymentOptions.includes(prior.payment) ? prior.payment : paymentOptions[0];
    const dateTimeLabel = `${formatScheduleDate(firstSchedule.date)} at ${formatScheduleTime(firstSchedule.time)}`;
    return `<section class="container page-top"><div class="eyebrow">Secure your demo order</div><h1>Checkout</h1><p class="muted">Demo checkout only — payment options are configurable for the final system.</p></section><section class="container section-tight"><form id="checkout-form" novalidate><div class="two-col"><div>
      <div class="panel"><h2 style="font-size:25px">Customer Information</h2><div class="form-grid">
      <div class="field"><label for="customer-name">Full Name *</label><input id="customer-name" name="name" autocomplete="name" value="${esc(prior.name || "")}" required>${error("name")}</div>
      <div class="field"><label for="customer-phone">Mobile Number *</label><input id="customer-phone" name="phone" type="tel" autocomplete="tel" placeholder="09XXXXXXXXX" value="${esc(prior.phone || "")}" required>${error("phone")}</div></div></div>
      <div class="panel"><h2 style="font-size:25px">Order Type</h2><div class="choice-row"><label class="choice-card"><input type="radio" name="orderType" value="Delivery" ${orderType === "Delivery" ? "checked" : ""}> Delivery</label><label class="choice-card"><input type="radio" name="orderType" value="Pickup" ${orderType === "Pickup" ? "checked" : ""}> Pickup</label></div>${error("orderType")}
      <div id="delivery-fields" style="${orderType === "Pickup" ? "display:none" : ""};margin-top:15px"><div class="form-grid"><div class="field field-full"><label for="address">Address *</label><input id="address" name="address" autocomplete="street-address" value="${esc(prior.address || "")}">${error("address")}</div><div class="field"><label for="barangay">Barangay *</label><input id="barangay" name="barangay" value="${esc(prior.barangay || "")}">${error("barangay")}</div><div class="field"><label for="landmark">Landmark</label><input id="landmark" name="landmark" value="${esc(prior.landmark || "")}"></div><div class="field field-full"><label for="delivery-notes">Delivery Notes</label><textarea id="delivery-notes" name="notes">${esc(prior.notes || "")}</textarea></div></div></div></div>
      <div class="panel"><h2 style="font-size:25px">When would you like your order?</h2><div class="choice-row"><label class="choice-card ${!open ? "choice-disabled" : ""}"><input type="radio" name="orderMode" value="Now" ${orderMode === "Now" ? "checked" : ""} ${!open ? "disabled" : ""}> Order Now</label><label class="choice-card"><input type="radio" name="orderMode" value="Scheduled" ${orderMode === "Scheduled" ? "checked" : ""}> Schedule for Later</label></div>${error("orderMode")}
      ${orderMode === "Scheduled" ? `<div class="schedule-fields"><p class="small muted"><strong>Next available:</strong> ${esc(dateTimeLabel)}</p><div class="form-grid"><div class="field"><label for="scheduled-date">Date</label><input id="scheduled-date" name="scheduledDate" type="date" min="${minDate}" max="${maxDate}" value="${scheduledDate}" required>${error("scheduledDate")}</div><div class="field"><label for="scheduled-time">Time</label><select id="scheduled-time" name="scheduledTime" required>${availableSlots.map(time => `<option value="${time}" ${time === scheduledTime ? "selected" : ""}>${formatScheduleTime(time)}</option>`).join("")}</select>${error("scheduledTime")}</div></div></div>` : open ? `<p class="small muted" style="margin-bottom:0">The business is open now. You can also schedule your order for a later time.</p>` : ""}
      </div>
      <div class="panel"><h2 style="font-size:25px">Payment Method *</h2><div class="choice-row">${paymentOptions.map(method =>
        `<label class="choice-card"><input type="radio" name="payment" value="${method}" ${payment === method ? "checked" : ""}> ${method}</label>`).join("")}</div>${error("payment")}<p class="small muted" style="margin:12px 0 0">${orderMode === "Scheduled" && orderType === "Delivery" ? "Scheduled deliveries require GCash payment verification." : "GCash requires submitting payment proof before the order is placed."}</p></div>
      </div><aside><div class="panel"><h2 style="font-size:25px">Your Order</h2><p><strong>Order Type:</strong> ${orderMode === "Scheduled" ? "Scheduled Order" : "Order Now"}</p>${orderMode === "Scheduled" ? `<p><strong>Scheduled For:</strong><br>${esc(formatScheduleDate(scheduledDate))}<br>${esc(formatScheduleTime(scheduledTime))}</p>` : ""}${rows.map(({product, quantity}) => `<div class="summary-line"><span>${esc(product.name)} × ${quantity}</span><strong>${money(product.price * quantity)}</strong></div>`).join("")}            ${checkoutErrors.cart ? `<p class="alert">${esc(checkoutErrors.cart)}</p>` : ""}<div class="summary-line"><span>Subtotal</span><strong>${money(subtotal())}</strong></div><div class="summary-line"><span>Demo delivery fee</span><span id="checkout-fee">${money(deliveryFee(orderType))}</span></div><div class="summary-line total"><span>Total</span><span id="checkout-total">${money(subtotal() + deliveryFee(orderType))}</span></div><button class="button button-outline button-block" type="button" data-action="edit-order">Edit Order</button><button class="button button-primary button-block" style="margin-top:10px" type="submit">${payment === "GCash" ? "Continue to GCash Payment" : "Place Order"}</button></div></aside></div></form></section>`;
  }
  function orderItems(order) {
    return (order.items || []).map(item => `<div class="summary-line"><span>${esc(item.name)} × ${item.quantity}${item.specialInstructions ? `<br><small class="muted">Note: ${esc(item.specialInstructions)}</small>` : ""}</span><strong>${money(item.price * item.quantity)}</strong></div>`).join("");
  }
  function orderSuccessPage() {
    const id = new URLSearchParams(location.search).get("id") || read(KEYS.lastOrder, "");
    const order = orders().find(item => item.id === id);
    if (!order) return `<section class="container section"><div class="empty-state"><h1>No recent order found</h1><p>Place an order to see its confirmation here.</p><a class="button button-primary" href="/menu" data-link="/menu">Browse Menu</a></div></section>`;
    const scheduled = order.orderMode === "Scheduled";
    const paymentPending = order.paymentStatus === "Pending Verification";
    const paymentRejected = order.paymentStatus === "Rejected";
    const paymentMessage = order.paymentMethod === "GCash" ? `<div class="schedule-tracking"><strong>GCash payment status: ${esc(order.paymentStatus || "Pending Verification")}</strong><br>${order.paymentStatus === "Pending Verification" ? "Your order is awaiting manual payment review. You can track its status using your order number." : order.paymentStatus === "Rejected" ? `Payment was rejected: ${esc(order.paymentRejectionReason || "Please contact the business.")}` : "Payment has been verified."}</div>` : "";
    return `<section class="container section"><div class="panel success-panel"><div class="success-mark ${paymentRejected ? "payment-rejected-mark" : ""}">${paymentRejected ? "!" : "✓"}</div><div class="eyebrow">${paymentRejected ? "Payment needs attention" : paymentPending ? "Payment submitted for review" : scheduled ? "Scheduled order confirmed" : "Order received"}</div><h1 style="font-size:48px">${paymentRejected ? "Payment Rejected" : paymentPending ? "Payment Submitted" : scheduled ? "Scheduled Order Confirmed!" : "Thank you for ordering!"}</h1><p class="lead" style="margin-inline:auto">${paymentRejected ? "Your GCash payment could not be verified. Review the reason below and contact the business." : paymentPending ? "Your order is saved and waiting for manual GCash payment verification." : scheduled ? "Your order has been successfully scheduled." : "Thank you for ordering from Eli's Crunch."}</p>${scheduled && !paymentRejected ? `<div class="schedule-confirmation"><strong>Scheduled For</strong><br>${esc(formatScheduleDate(order.scheduledDate))}<br><strong>${esc(formatScheduleTime(order.scheduledTime))}</strong></div>` : ""}<div class="order-number">Order #${esc(order.id)}</div>${paymentMessage}
      <div class="panel" style="text-align:left;margin-top:22px"><h2 style="font-size:24px">Order Summary</h2>${orderItems(order)}<div class="summary-line"><span>Subtotal</span><strong>${money(order.subtotal)}</strong></div><div class="summary-line"><span>Demo delivery fee</span><strong>${money(order.deliveryFee)}</strong></div><div class="summary-line total"><span>Total</span><strong>${money(order.total)}</strong></div><div class="divider"></div><p><strong>Customer:</strong> ${esc(order.customer)} · ${esc(order.phone)}</p><p><strong>Order type:</strong> ${esc(scheduleOrderType(order))}</p>${scheduled ? `<p><strong>Scheduled for:</strong> ${esc(formatScheduleDate(order.scheduledDate))} at ${esc(formatScheduleTime(order.scheduledTime))}</p>` : ""}${order.orderType === "Delivery" ? `<p><strong>Address:</strong> ${esc(order.address)}, ${esc(order.barangay)}${order.landmark ? ` · ${esc(order.landmark)}` : ""}</p>` : ""}<p><strong>Payment:</strong> ${esc(order.paymentMethod)}</p></div>${scheduled ? `<p class="small muted">Please keep your order number so you can track your order.</p>` : ""}
      <div class="hero-actions" style="justify-content:center"><a class="button button-dark" href="/track-order/${encodeURIComponent(order.id)}" data-link="/track-order/${encodeURIComponent(order.id)}">Track My Order</a><a class="button button-primary" href="/menu" data-link="/menu">Order Again</a></div></div></section>`;
  }
  function trackingCard(order) {
    const scheduled = order.orderMode === "Scheduled";
    const stages = scheduled ? ["Scheduled", "New", "Confirmed", "Preparing", "Ready", "Out for Delivery", "Delivered"] : ["New", "Confirmed", "Preparing", "Ready", "Out for Delivery", "Delivered"];
    const index = stages.indexOf(order.status);
    const isCancelled = order.status === "Cancelled";
    return `<div class="panel" style="margin-top:20px"><div class="admin-order-head"><div><div class="eyebrow">Order tracking</div><h2 style="font-size:25px">Order #${esc(order.id)}</h2></div><span class="status-badge">${esc(order.status)}</span></div>
      ${scheduled ? `<div class="schedule-tracking"><strong>Scheduled Order</strong><br>${esc(formatScheduleDate(order.scheduledDate))} — ${esc(formatScheduleTime(order.scheduledTime))}</div>` : ""}
      ${order.paymentStatus === "Pending Verification" ? `<div class="schedule-tracking"><strong>GCash payment submitted</strong><br>Waiting for the business to review your payment.</div>` : order.paymentStatus === "Rejected" ? `<div class="alert" style="margin:15px 0"><strong>GCash payment rejected.</strong><br>${esc(order.paymentRejectionReason || "Please contact the business for assistance.")}</div>` : order.paymentStatus === "Verified" ? `<div class="schedule-tracking"><strong>GCash payment verified</strong></div>` : ""}
      ${isCancelled ? `<div class="alert" style="margin:15px 0">This order has been cancelled.</div>` : order.status === "Payment Verification" || order.status === "Payment Rejected" ? `<div class="schedule-tracking"><strong>${order.status === "Payment Rejected" ? "Payment needs attention" : "Order waiting for payment review"}</strong><br>${order.status === "Payment Rejected" ? "Contact the business to resolve your payment." : "Order preparation begins after payment is verified."}</div>` : `<div class="timeline">${stages.map((stage, i) => { const complete = (index >= 0 && i < index) || (scheduled && order.status === "Scheduled" && stage === "Scheduled"); const current = i === index && !(scheduled && order.status === "Scheduled" && stage === "Scheduled"); const label = stage === "Scheduled" ? "Order Scheduled" : stage === "New" ? (scheduled ? "Ready for Preparation" : "Order Placed") : stage === "Confirmed" ? "Order Confirmed" : stage; return `<div class="timeline-step ${complete ? "done" : ""} ${current ? "current" : ""}"><span class="timeline-dot">${complete ? "✓" : current ? "●" : "○"}</span><span class="timeline-label">${label}</span></div>`; }).join("")}</div>`}
      <p><strong>Order type:</strong> ${esc(scheduleOrderType(order))} · <strong>Total:</strong> ${money(order.total)}</p>${order.paymentMethod === "GCash" ? `<p><strong>Payment status:</strong> ${esc(order.paymentStatus || "Pending Verification")}</p>` : ""}<p class="small muted">Last updated ${new Date(order.updatedAt || order.createdAt).toLocaleString()}</p></div>`;
  }
  function trackPage(specificId = "") {
    const orderId = specificId || orderSearchResult;
    const order = orderId ? orders().find(item => item.id.toLowerCase() === orderId.trim().toLowerCase()) : null;
    return `<section class="container page-top"><div class="eyebrow">Stay in the know</div><h1>Track Your Order</h1><p class="lead">Enter your order number to view its latest demo status.</p></section><section class="container section-tight"><form id="track-form" class="panel" style="max-width:650px"><div class="form-grid"><div class="field"><label for="track-id">Order Number</label><input id="track-id" name="orderId" placeholder="EC-DEMO-1001" value="${esc(orderId)}" required></div><div style="align-self:end"><button class="button button-primary button-block" type="submit">Track Order</button></div></div>${orderSearchResult && !order ? `<p class="alert" style="margin:12px 0 0">We couldn't find that order number. Please check it and try again.</p>` : ""}</form>${order ? trackingCard(order) : ""}</section>`;
  }
  function aboutPage() {
    return `<section class="container section"><div class="two-col"><div><div class="eyebrow">Meet Chef Eli</div><h1>Little Chef,<br>Big Smiles.</h1><p class="lead">Eli's Crunch is a local food delivery and pickup business in Nabunturan, Davao de Oro.</p><p>Browse the menu, place a demo order, and follow its status with this proposed online ordering experience.</p><a class="button button-primary" href="/menu" data-link="/menu">Explore the Menu</a></div><div class="panel" style="display:grid;place-items:center;background:#fff2d1"><img src="/images/eli-icon.jpg" alt="Chef Eli logo" style="width:min(360px,100%);border-radius:50%"></div></div></section>`;
  }
  function contactPage() {
    const cfg = settings();
    return `<section class="container section"><div class="eyebrow">Get in touch</div><h1>Contact</h1><p class="lead">Eli's Crunch · ${esc(cfg.address)}</p><div class="panel" style="max-width:640px"><p><strong>Location</strong><br>${esc(cfg.address)}</p><p><strong>Business hours</strong><br>${esc(cfg.hours)}</p>${cfg.phone ? `<p><strong>Contact</strong><br><a href="tel:${esc(cfg.phone)}">${esc(cfg.phone)}</a></p>` : `<p class="muted">Contact information can be added to the demo settings.</p>`}${cfg.facebook ? `<a class="button button-outline" href="${esc(cfg.facebook)}" target="_blank" rel="noopener noreferrer">Visit Facebook</a>` : ""}</div></section>`;
  }
  function faqPage() {
    const pairs = [["How do I place an order?", "Browse the menu, add items to your cart, and complete the checkout form."], ["Can I choose delivery or pickup?", "Yes. This demo checkout allows you to choose delivery or pickup."], ["How do I track an order?", "Use the order number from the confirmation page on Track Order."], ["Is payment processed online?", "No. Payment choices in this proposal are demo selections only."]];
    return `<section class="container section"><div class="eyebrow">Helpful answers</div><h1>Frequently Asked Questions</h1><div class="panel">${pairs.map(([q,a]) => `<details style="padding:14px 0;border-bottom:1px solid var(--line)"><summary style="font-weight:800;cursor:pointer">${q}</summary><p class="muted" style="margin:10px 0 0">${a}</p></details>`).join("")}</div></section>`;
  }
  function renderPublic() {
    const current = path();
    let content;
    if (current === "/") content = homePage();
    else if (current === "/menu") content = menuPage();
    else if (current.startsWith("/menu/")) { detailQuantity = Math.max(1, detailQuantity); content = detailPage(current.split("/")[2]); }
    else if (current === "/cart") content = cartPage();
    else if (current === "/checkout") content = checkoutPage();
    else if (current === "/payment/gcash") content = gcashPaymentPage();
    else if (current === "/order-success") content = orderSuccessPage();
    else if (current === "/track-order") content = trackPage();
    else if (current.startsWith("/track-order/")) content = trackPage(decodeURIComponent(current.slice("/track-order/".length)));
    else if (current === "/about") content = aboutPage();
    else if (current === "/contact") content = contactPage();
    else if (current === "/faq") content = faqPage();
    else content = `<section class="container section"><div class="empty-state"><h1>Page not found</h1><a class="button button-primary" href="/" data-link="/">Go Home</a></div></section>`;
    shell(content);
  }
  function saveCheckoutDraft(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    write("elisCrunch.checkoutDraft", data);
  }
  function validateCheckout(data) {
    const errors = {};
    if (!String(data.name || "").trim()) errors.name = "Please enter your name.";
    if (!String(data.phone || "").trim()) errors.phone = "Please enter your mobile number.";
    else if (!/^[+()\d\s-]{7,20}$/.test(data.phone.trim())) errors.phone = "Please enter a valid mobile number.";
    if (!data.orderType) errors.orderType = "Please choose delivery or pickup.";
    if (data.orderType === "Delivery") {
      if (!String(data.address || "").trim()) errors.address = "Please enter your delivery address.";
      if (!String(data.barangay || "").trim()) errors.barangay = "Please enter your barangay.";
    }
    if (!availablePayments(data.orderType, data.orderMode).includes(data.payment)) errors.payment = "Choose a payment method available for this order type and schedule.";
    if (!cartRows().length) errors.cart = "Your cart is empty.";
    const now = new Date();
    const scheduled = data.orderMode === "Scheduled";
    if (!scheduled && !isBusinessOpen(now)) errors.orderMode = "We're currently closed. Please schedule your order for 8:00 AM or later.";
    else if (!scheduled && data.orderMode !== "Now") errors.orderMode = "Please choose when you would like your order.";
    if (scheduled) {
      if (!data.scheduledDate) errors.scheduledDate = "Please choose a date for your scheduled order.";
      if (!data.scheduledTime) errors.scheduledTime = "Please choose a time for your scheduled order.";
      const scheduledAt = dateFromKey(data.scheduledDate || "", data.scheduledTime || "");
      const today = dateKey(now);
      const latestDate = addDaysToDateKey(today, SCHEDULE_DAYS_AHEAD);
      if (data.scheduledDate && (!scheduledAt || data.scheduledDate < today || data.scheduledDate > latestDate)) {
        errors.scheduledDate = `Choose a valid date from today through the next ${SCHEDULE_DAYS_AHEAD} days.`;
      }
      if (scheduledAt) {
        const scheduledMinutes = scheduledAt.getHours() * 60 + scheduledAt.getMinutes();
        if (scheduledMinutes < clockMinutes(BUSINESS_HOURS.open) || scheduledMinutes > clockMinutes(BUSINESS_HOURS.close) || scheduledMinutes % SCHEDULE_INTERVAL_MINUTES !== 0) {
          errors.scheduledTime = "Choose a time during business hours.";
        } else if (scheduledAt <= now) {
          errors.scheduledTime = "Choose a future time that has not passed.";
        }
      }
    }
    if (!availablePayments(data.orderType, data.orderMode).includes(data.payment)) {
      errors.payment = data.orderType === "Delivery" && scheduled
        ? "Scheduled deliveries require GCash."
        : data.orderType === "Pickup"
          ? "Pickup orders require GCash or Cash on Pickup."
          : "Immediate deliveries require Cash on Delivery or GCash.";
    }
    const cfg = settings();
    if (data.orderType === "Delivery" && !cfg.deliveryEnabled) errors.orderType = "Delivery is not enabled in the demo settings.";
    if (data.orderType === "Pickup" && !cfg.pickupEnabled) errors.orderType = "Pickup is not enabled in the demo settings.";
    if (subtotal() < Number(cfg.minimumOrder || 0)) errors.cart = `The demo minimum order is ${money(cfg.minimumOrder)}.`;
    return errors;
  }
  function nextOrderId() {
    const allIds = [...orders(), ...gcashDrafts()].map(order => Number(String(order.id).match(/(\d+)$/)?.[1]) || 1000);
    return `EC-DEMO-${Math.max(1000, ...allIds) + 1}`;
  }
  function buildOrder(data) {
    const now = new Date().toISOString();
    return {
      id: nextOrderId(),
      customer: data.name.trim(),
      phone: data.phone.trim(),
      orderType: data.orderType,
      orderMode: data.orderMode,
      scheduledDate: data.orderMode === "Scheduled" ? data.scheduledDate : "",
      scheduledTime: data.orderMode === "Scheduled" ? data.scheduledTime : "",
      address: data.orderType === "Delivery" ? data.address.trim() : "",
      barangay: data.orderType === "Delivery" ? data.barangay.trim() : "",
      landmark: String(data.landmark || "").trim(),
      notes: String(data.notes || "").trim(),
      paymentMethod: data.payment,
      items: cartRows().map(({ product, quantity, specialInstructions }) => ({ id: product.id, name: product.name, category: product.category, price: product.price, quantity, specialInstructions })),
      subtotal: subtotal(),
      deliveryFee: deliveryFee(data.orderType),
      total: subtotal() + deliveryFee(data.orderType),
      status: data.orderMode === "Scheduled" ? "Scheduled" : "New",
      createdAt: now,
      updatedAt: now
    };
  }
  function placeOrder(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    saveCheckoutDraft(form);
    checkoutErrors = validateCheckout(data);
    if (Object.keys(checkoutErrors).length) {
      render();
      const firstError = document.querySelector(".field-error, .alert");
      if (firstError) firstError.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (data.payment === "GCash") {
      const draft = buildOrder(data);
      draft.status = "Awaiting Payment";
      draft.paymentStatus = "Awaiting Payment";
      if (!saveGcashDrafts([...gcashDrafts(), draft])) return;
      checkoutErrors = {};
      go(`/payment/gcash?id=${encodeURIComponent(draft.id)}`);
      return;
    }
    const order = buildOrder(data);
    if (!write(KEYS.orders, [...orders(), order])) return;
    write(KEYS.lastOrder, order.id);
    write(KEYS.cart, {});
    write(KEYS.notes, {});
    localStorage.removeItem("elisCrunch.checkoutDraft");
    checkoutErrors = {};
    go(`/order-success?id=${encodeURIComponent(order.id)}`);
  }
  function gcashDraftById(id) {
    return gcashDrafts().find(draft => draft.id === id);
  }
  function gcashPaymentPage() {
    const id = new URLSearchParams(location.search).get("id") || "";
    const draft = gcashDraftById(id);
    if (!draft || draft.paymentMethod !== "GCash") {
      return `<section class="container section"><div class="empty-state"><h1>Payment draft not found</h1><p>Return to checkout to start a new GCash payment.</p><a class="button button-primary" href="/checkout" data-link="/checkout">Back to Checkout</a></div></section>`;
    }
    if (gcashScreenshotDraftId !== id) {
      gcashScreenshotDraftId = id;
      gcashScreenshotFile = null;
      if (gcashScreenshotPreviewUrl) URL.revokeObjectURL(gcashScreenshotPreviewUrl);
      gcashScreenshotPreviewUrl = "";
    }
    return `<section class="container page-top"><div class="eyebrow">Demo payment submission</div><h1>Pay with GCash</h1><p class="lead">Submit your payment details for manual review. This proposal does not process or verify real payments.</p></section>
      <section class="container section-tight gcash-layout"><div>
        <div class="panel demo-gcash-banner"><span class="demo-tag">DEMO GCash ACCOUNT</span><p>These are placeholder account details for the proposal only. Do not send real money.</p><div class="gcash-account"><span>Account name</span><strong>${esc(GCASH_SETTINGS.accountName)}</strong><span>Account number</span><strong>${esc(GCASH_SETTINGS.accountNumber)}</strong></div></div>
        <div class="panel"><h2 style="font-size:25px">Payment instructions</h2><ol class="gcash-instructions"><li>Send the exact total shown below using the demo account details.</li><li>Save a screenshot of the transfer confirmation.</li><li>Enter the payment reference number and sender name, then submit for manual verification.</li></ol><p class="small muted">Demo flow only: no GCash gateway, transfer, or notification is connected.</p></div>
      </div><aside><div class="panel gcash-payment-panel"><div class="eyebrow">Order #${esc(draft.id)}</div><h2 style="font-size:25px">Payment summary</h2>${draft.items.map(item => `<div class="summary-line"><span>${esc(item.name)} × ${item.quantity}</span><strong>${money(item.price * item.quantity)}</strong></div>`).join("")}<div class="summary-line"><span>Subtotal</span><strong>${money(draft.subtotal)}</strong></div><div class="summary-line"><span>Demo delivery fee</span><strong>${money(draft.deliveryFee)}</strong></div><div class="summary-line total"><span>Amount to pay</span><strong>${moneyExact(draft.total)}</strong></div><p><strong>Order type:</strong> ${esc(scheduleOrderType(draft))}</p>${draft.orderMode === "Scheduled" ? `<p><strong>Scheduled for:</strong><br>${esc(formatScheduleDate(draft.scheduledDate))} at ${esc(formatScheduleTime(draft.scheduledTime))}</p>` : ""}
        <form id="gcash-payment-form" data-draft-id="${esc(draft.id)}" novalidate><div class="field"><label for="gcash-reference">Payment reference number *</label><input id="gcash-reference" name="referenceNumber" autocomplete="off" maxlength="50" value="${esc(draft.paymentReference || "")}" required></div><div class="field"><label for="gcash-sender">GCash sender name *</label><input id="gcash-sender" name="senderName" autocomplete="name" maxlength="100" value="${esc(draft.paymentSenderName || draft.customer || "")}" required></div>
        <div class="field"><label for="gcash-proof">Payment screenshot * <span class="small muted">(JPG, PNG or WebP; up to 5 MB)</span></label><input id="gcash-proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp" required></div>
        <div id="gcash-proof-preview" class="gcash-proof-preview">${gcashScreenshotPreviewUrl ? `<img src="${esc(gcashScreenshotPreviewUrl)}" alt="Selected payment screenshot preview"><button class="button button-outline" type="button" data-action="remove-gcash-proof">Remove screenshot</button>` : `<p class="small muted">Your selected screenshot preview will appear here. It is not shown on public order pages.</p>`}</div>
        <p id="gcash-form-error" class="alert" role="alert" hidden></p><button class="button button-primary button-block" type="submit">Submit Payment for Verification</button></form>
        <p class="small muted" style="margin-top:12px">After submission, your order number and status will be available for tracking.</p></div></aside></section>`;
  }
  function paymentFormError(message) {
    const region = document.getElementById("gcash-form-error");
    if (!region) return;
    region.textContent = message;
    region.hidden = false;
    region.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  async function compressGcashProof(file) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP payment screenshot.");
    if (file.size > GCASH_SCREENSHOT_MAX_BYTES) throw new Error("The payment screenshot must be 5 MB or smaller.");
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not process the payment screenshot.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.72);
    } finally {
      bitmap.close();
    }
  }
  function clearCartAfterPayment(order) {
    write(KEYS.lastOrder, order.id);
    write(KEYS.cart, {});
    write(KEYS.notes, {});
    localStorage.removeItem("elisCrunch.checkoutDraft");
    checkoutErrors = {};
  }
  async function submitGcashPayment(form) {
    const id = form.dataset.draftId;
    const draft = gcashDraftById(id);
    if (!draft || draft.paymentMethod !== "GCash") {
      paymentFormError("This payment draft is no longer available. Return to checkout to start again.");
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    const reference = String(data.referenceNumber || "").trim();
    const sender = String(data.senderName || "").trim();
    if (!reference || reference.length > 50 || !/^[A-Za-z0-9][A-Za-z0-9 -]*$/.test(reference)) {
      paymentFormError("Enter a valid payment reference number using letters, numbers, spaces, or hyphens.");
      return;
    }
    if (GCASH_SETTINGS.requireSenderName && !sender) {
      paymentFormError("Enter the name shown as the GCash sender.");
      return;
    }
    if (sender.length > 100) {
      paymentFormError("The sender name must be 100 characters or fewer.");
      return;
    }
    const file = gcashScreenshotDraftId === id ? gcashScreenshotFile : data.proof;
    if (!(file instanceof File) || file.size === 0) {
      paymentFormError("Choose a payment screenshot before submitting.");
      return;
    }
    let proofImage;
    try {
      proofImage = await compressGcashProof(file);
    } catch (error) {
      console.error("Unable to process the GCash payment screenshot.", error);
      paymentFormError(error instanceof Error ? error.message : "Unable to process the payment screenshot.");
      return;
    }
    const order = {
      ...draft,
      paymentStatus: "Pending Verification",
      paymentReference: reference,
      paymentSenderName: sender,
      paymentSubmittedAt: new Date().toISOString(),
      paymentProof: { imageData: proofImage, submittedAt: new Date().toISOString() },
      status: "Payment Verification",
      updatedAt: new Date().toISOString()
    };
    const existing = orders().find(item => item.id === order.id);
    if (!existing && !write(KEYS.orders, [...orders(), order])) {
      paymentFormError("This browser could not save the order and payment proof. Please try again or contact the business.");
      return;
    }
    const draftsSaved = saveGcashDrafts(gcashDrafts().filter(item => item.id !== id));
    if (gcashScreenshotPreviewUrl) URL.revokeObjectURL(gcashScreenshotPreviewUrl);
    gcashScreenshotPreviewUrl = "";
    gcashScreenshotFile = null;
    gcashScreenshotDraftId = "";
    clearCartAfterPayment(existing || order);
    if (!draftsSaved) notify("Your order was saved, but this browser could not clear its payment draft.");
    go(`/order-success?id=${encodeURIComponent(order.id)}`);
  }
  function orderActionButtons(order) {
    const buttons = [];
    const scheduled = order.orderMode === "Scheduled";
    const due = !scheduled || isScheduleDue(order);
    if (order.status === "Scheduled" && due) buttons.push(["New", "Prepare Order"]);
    if (due && order.status === "New") buttons.push(["Confirmed", "Accept"]);
    if (due && order.status === "Confirmed") buttons.push(["Preparing", "Start Preparing"]);
    if (due && order.status === "Preparing") buttons.push(["Ready", "Mark Ready"]);
    if (due && order.status === "Ready" && order.orderType === "Delivery") buttons.push(["Out for Delivery", "Out for Delivery"]);
    if (due && order.status === "Ready" && order.orderType === "Pickup") buttons.push(["Delivered", "Mark Picked Up"]);
    if (due && order.status === "Out for Delivery") buttons.push(["Delivered", "Mark Delivered"]);
    if (!["Delivered", "Cancelled"].includes(order.status)) buttons.push(["Cancelled", "Cancel"]);
    return buttons;
  }
  function setOrderStatus(id, status) {
    const list = orders();
    const order = list.find(item => item.id === id);
    if (!order) { notify("Order not found."); return; }
    if (!STATUSES.includes(status)) { notify("That order status is not valid."); return; }
    if (order.orderMode === "Scheduled" && !isScheduleDue(order) && status !== "Cancelled") {
      notify(`This order is scheduled for ${formatScheduleDate(order.scheduledDate)} at ${formatScheduleTime(order.scheduledTime)} and is not ready to prepare yet.`);
      return;
    }
    order.status = status;
    order.updatedAt = new Date().toISOString();
    write(KEYS.orders, list);
    render();
    notify(`Order ${id} updated to ${status}.`);
  }
  function adminNav() {
    const current = path();
    const nav = [["/admin/dashboard","Dashboard"],["/admin/orders","Orders"],["/admin/menu","Menu Management"],["/admin/delivery","Delivery Settings"],["/admin/settings","Business Settings"]];
    return `<aside class="admin-side"><div class="admin-brand"><img src="/images/eli-icon.jpg" alt=""><span>Eli's Crunch<br><small>Admin</small></span></div><div style="margin:0 8px 18px"><span class="demo-tag">DEMO MODE</span></div><nav class="admin-nav">${nav.map(([url,label]) => `<a href="${url}" data-link="${url}" class="${current === url ? "active" : ""}">${label}</a>`).join("")}<button type="button" data-action="admin-logout">Log out</button></nav></aside>`;
  }
  function adminLayout(content, title) {
    document.body.classList.remove("has-mobile-cart");
    app.innerHTML = `<div class="admin-shell">${adminNav()}<div class="admin-main"><header class="admin-top"><div><strong>${esc(title)}</strong><div class="small muted">Eli's Crunch · Proposal demo only</div></div><span class="demo-tag">DEMO MODE</span></header><main class="admin-content">${content}</main></div></div>`;
  }
  function adminLogin() {
    document.body.classList.remove("has-mobile-cart");
    app.innerHTML = `<main class="login-wrap"><form class="login-card" id="admin-login"><img class="login-logo" src="/images/eli-icon.jpg" alt="Chef Eli logo"><h1>Eli's Crunch Admin</h1><p class="muted" style="text-align:center">Sign in to the proposal dashboard</p><div class="demo-note"><strong>Demo Admin Access</strong><br>Email: demo@eliscrunch.local<br>Password: demo123<br><small>This is frontend demo protection, not production authentication.</small></div><div class="field"><label for="admin-email">Email</label><input id="admin-email" name="email" type="email" autocomplete="username" required></div><div class="field" style="margin-top:13px"><label for="admin-password">Password</label><input id="admin-password" name="password" type="password" autocomplete="current-password" required></div><p id="login-error" class="field-error" style="margin-top:10px"></p><button class="button button-primary button-block" style="margin-top:10px">Log In</button><a class="button button-outline button-block" style="margin-top:10px" href="/" data-link="/">Back to website</a></form></main>`;
  }
  function paymentReviewModal(order) {
    if (!paymentModal || paymentModal.id !== order.id) return "";
    if (paymentModal.mode === "proof") {
      if (!order.paymentProof?.imageData) return "";
      return `<div class="gcash-modal-backdrop" role="presentation" data-action="close-payment-modal"><section class="gcash-modal" role="dialog" aria-modal="true" aria-labelledby="gcash-modal-title"><button class="gcash-modal-close" type="button" aria-label="Close" data-action="close-payment-modal">×</button><h2 id="gcash-modal-title">Private payment screenshot</h2><p class="small muted">Admin-only demo review · Order #${esc(order.id)}</p><img class="gcash-modal-image" src="${esc(order.paymentProof.imageData)}" alt="Customer-submitted GCash payment proof"></section></div>`;
    }
    if (paymentModal.mode === "verify") {
      return `<div class="gcash-modal-backdrop"><section class="gcash-modal" role="dialog" aria-modal="true" aria-labelledby="gcash-modal-title"><h2 id="gcash-modal-title">Verify this payment?</h2><p>Confirm that the transfer details and amount for Order #${esc(order.id)} have been checked.</p><div class="admin-actions"><button class="button button-primary" data-action="confirm-payment-verify" data-id="${esc(order.id)}">Confirm Verification</button><button class="button button-outline" data-action="close-payment-modal">Cancel</button></div></section></div>`;
    }
    if (paymentModal.mode === "reject") {
      return `<div class="gcash-modal-backdrop"><form class="gcash-modal" id="reject-payment-form" data-order-id="${esc(order.id)}" aria-labelledby="gcash-modal-title"><h2 id="gcash-modal-title">Reject GCash payment</h2><p>Give the customer a clear reason. This reason will appear in their order tracking.</p><div class="field"><label for="payment-rejection-reason">Reason *</label><textarea id="payment-rejection-reason" name="reason" maxlength="300" required></textarea></div><p id="payment-rejection-error" class="field-error" hidden></p><div class="admin-actions"><button class="button button-danger" type="submit">Reject Payment</button><button class="button button-outline" type="button" data-action="close-payment-modal">Cancel</button></div></form></div>`;
    }
    return "";
  }
  function reviewGcashPayment(id, decision, reason = "") {
    if (!read(KEYS.admin, false)) { go("/admin"); return; }
    const list = orders();
    const order = list.find(item => item.id === id);
    if (!order || order.paymentMethod !== "GCash" || order.paymentStatus !== "Pending Verification") {
      notify("This payment is no longer waiting for verification.");
      paymentModal = null;
      render();
      return;
    }
    if (decision === "Verified") {
      if (!order.paymentProof?.imageData || !order.paymentReference || !order.paymentSenderName) {
        notify("This payment cannot be verified without its screenshot, reference number, and sender name.");
        return;
      }
      order.paymentStatus = "Verified";
      order.paymentVerifiedAt = new Date().toISOString();
      if (order.status !== "Cancelled") {
        order.status = order.orderMode === "Scheduled" && !isScheduleDue(order) ? "Scheduled" : "Confirmed";
      }
    } else if (decision === "Rejected" && reason.trim()) {
      order.paymentStatus = "Rejected";
      order.paymentRejectionReason = reason.trim();
      if (order.status !== "Cancelled") order.status = "Payment Rejected";
    } else {
      notify("Choose a valid payment decision and provide a rejection reason.");
      return;
    }
    order.updatedAt = new Date().toISOString();
    if (!write(KEYS.orders, list)) return;
    paymentModal = null;
    render();
    notify(decision === "Verified" ? `Payment for ${id} verified.` : `Payment for ${id} rejected.`);
  }
  function adminDashboard() {
    const list = orders().sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const paidOrders = list.filter(order => order.paymentMethod !== "GCash" || order.paymentStatus === "Verified");
    const today = new Date().toDateString();
    const todayOrders = paidOrders.filter(order => new Date(order.createdAt).toDateString() === today && order.status !== "Cancelled");
    const sales = todayOrders.reduce((sum, order) => sum + order.total, 0);
    const unseen = list.filter(order => order.status === "New" && !read(KEYS.seen, []).includes(order.id));
    const pendingPayments = list.filter(order => order.paymentStatus === "Pending Verification");
    const delivered = list.filter(order => order.status === "Delivered").length;
    const preparing = list.filter(order => order.status === "Preparing").length;
    const out = list.filter(order => order.status === "Out for Delivery").length;
    const bestSellers = new Map();
    paidOrders.forEach(order => (order.items || []).forEach(item => bestSellers.set(item.name, (bestSellers.get(item.name) || 0) + (Number(item.quantity) || 0))));
    const topProducts = [...bestSellers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const scheduledOrders = list.filter(order => order.orderMode === "Scheduled" && !["Delivered", "Cancelled"].includes(order.status))
      .sort((a, b) => (scheduleDateTime(a)?.getTime() || Infinity) - (scheduleDateTime(b)?.getTime() || Infinity));
    const notification = `${unseen.length ? `<div class="alert" style="margin:18px 0"><strong>🔔 New Order Received</strong><br>${unseen.map(order => `Order #${esc(order.id)} · ${esc(order.customer)} · ${money(order.total)} <button class="button button-outline" style="min-height:32px;padding:5px 9px;font-size:12px" data-action="view-order" data-id="${esc(order.id)}">View Order</button>`).join("<br>")}</div>` : ""}${pendingPayments.length ? `<div class="gcash-admin-notice"><strong>GCash payments awaiting review (${pendingPayments.length})</strong><br>${pendingPayments.map(order => `Order #${esc(order.id)} · ${esc(order.customer)} · ${money(order.total)} <button class="button button-outline" style="min-height:32px;padding:5px 9px;font-size:12px" data-action="view-order" data-id="${esc(order.id)}">Review payment</button>`).join("<br>")}</div>` : ""}`;
    const recent = list.slice(0, 5);
    const scheduledSection = `<section class="panel" style="margin-top:22px"><div class="section-heading"><h2 style="font-size:24px">Scheduled Orders</h2><a href="/admin/orders" data-link="/admin/orders">Manage orders →</a></div>${scheduledOrders.length ? scheduledOrders.map(order => `<article class="admin-order-card"><div class="admin-order-head"><div><strong>#${esc(order.id)} · ${esc(order.customer)}</strong><div class="small muted">${esc(formatScheduleShortDate(order.scheduledDate))} · ${esc(formatScheduleTime(order.scheduledTime))}</div></div><span class="status-badge">${esc(order.status)}</span></div><p class="small muted" style="margin:8px 0">${esc(order.orderType)} · ${esc(order.paymentMethod)} · ${money(order.total)}</p><button class="button button-outline" data-action="view-order" data-id="${esc(order.id)}">View details</button>${orderActionButtons(order).map(([status,label]) => `<button class="button ${status==="Cancelled"?"button-danger":"button-primary"}" data-action="set-status" data-id="${esc(order.id)}" data-status="${esc(status)}">${label}</button>`).join("")}</article>`).join("") : `<p class="muted">No scheduled orders yet.</p>`}</section>`;
    adminLayout(`<div class="eyebrow">Overview · <span class="badge">DEMO DATA + LIVE DEMO ORDERS</span></div><h1 style="font-size:40px">Dashboard</h1><p class="muted">Order statistics update from actual orders placed in this demo. Sales shown are demo order totals.</p>${notification}
      <div class="stat-grid">${[["New Orders",list.filter(o=>o.status==="New").length],["Preparing",preparing],["Out for Delivery",out],["Completed",delivered],["Today's Sales",money(sales)]].map(([label,value]) => `<div class="stat-card"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
      ${scheduledSection}<div class="two-col" style="margin-top:22px"><section class="panel"><div class="section-heading"><h2 style="font-size:24px">Recent Orders</h2><a href="/admin/orders" data-link="/admin/orders">All orders →</a></div>${recent.length ? recent.map(order => `<div class="admin-order-card"><div class="admin-order-head"><strong>#${esc(order.id)} · ${esc(order.customer)}</strong><span class="status-badge">${esc(order.status)}</span></div><p class="small muted" style="margin:8px 0">${money(order.total)} · ${esc(scheduleOrderType(order))} · ${new Date(order.createdAt).toLocaleString()}</p><button class="button button-outline" data-action="view-order" data-id="${esc(order.id)}">View details</button></div>`).join("") : `<div class="empty-state">No customer orders yet. Try placing one from the customer website.</div>`}</section>
      <section class="panel"><h2 style="font-size:24px">Demo Analytics</h2><p>Orders today <strong>${todayOrders.length}</strong></p><p>Sales today <strong>${money(sales)}</strong></p><p>Completed orders <strong>${delivered}</strong></p><p>Delivery orders <strong>${list.filter(o=>o.orderType==="Delivery").length}</strong></p><p>Pickup orders <strong>${list.filter(o=>o.orderType==="Pickup").length}</strong></p><h3>Best-selling products</h3>${topProducts.length ? `<ol>${topProducts.map(([name,quantity]) => `<li>${esc(name)} — ${quantity} ordered</li>`).join("")}</ol>` : `<p class="muted">No demo orders yet.</p>`}<p class="small muted">Analytics use demo order data only. No seeded sales or customer claims are shown.</p></section></div>`, "Dashboard");
  }
  function adminOrders() {
    const allOrders = orders().sort((a, b) => {
      const aScheduled = a.orderMode === "Scheduled" && !["Delivered", "Cancelled"].includes(a.status);
      const bScheduled = b.orderMode === "Scheduled" && !["Delivered", "Cancelled"].includes(b.status);
      if (aScheduled && bScheduled) return (scheduleDateTime(a)?.getTime() || Infinity) - (scheduleDateTime(b)?.getTime() || Infinity);
      if (aScheduled !== bScheduled) return aScheduled ? -1 : 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    const filter = new URLSearchParams(location.search).get("paymentStatus") || "All";
    const list = allOrders.filter(order => filter === "All" || (order.paymentStatus || "Not applicable") === filter);
    const filterOptions = ["All", ...PAYMENT_STATUSES, "Not applicable"].map(status => {
      const label = status === "All" ? "All payment statuses" : status === "Not applicable" ? "Non-GCash orders" : status;
      return `<option value="${esc(status)}" ${filter === status ? "selected" : ""}>${esc(label)}</option>`;
    }).join("");
    const cards = list.map(order => {
      const schedule = order.orderMode === "Scheduled" ? `<div class="schedule-tracking"><strong>Scheduled for ${esc(formatScheduleShortDate(order.scheduledDate))} at ${esc(formatScheduleTime(order.scheduledTime))}</strong></div>` : "";
      const payment = `${esc(order.paymentMethod)}${order.paymentMethod === "GCash" ? ` · Payment ${esc(order.paymentStatus || "Awaiting Payment")}` : ""}`;
      const address = order.orderType === "Delivery" ? ` · ${esc(order.address)}, ${esc(order.barangay)}` : "";
      const reviewButton = order.paymentStatus === "Pending Verification" ? `<button class="button button-primary" data-action="view-order" data-id="${esc(order.id)}">Review payment</button>` : "";
      const statusButtons = orderActionButtons(order).map(([status, label]) => `<button class="button ${status === "Cancelled" ? "button-danger" : "button-primary"}" data-action="set-status" data-id="${esc(order.id)}" data-status="${esc(status)}">${label}</button>`).join("");
      return `<article class="admin-order-card"><div class="admin-order-head"><div><strong>Order #${esc(order.id)}</strong><div class="small muted">${new Date(order.createdAt).toLocaleString()}</div>${schedule}</div><span class="status-badge">${esc(order.status)}</span></div><div class="two-col" style="margin-top:14px;grid-template-columns:1fr 1fr"><div><strong>${esc(order.customer)}</strong><div>${esc(order.phone)}</div><div class="small muted">${esc(scheduleOrderType(order))}${address}</div></div><div><strong>${money(order.total)}</strong><div class="small muted">${payment}</div><div class="small">${order.items.map(item => `${esc(item.name)} × ${item.quantity}`).join(", ")}</div></div></div><div class="admin-actions"><button class="button button-outline" data-action="view-order" data-id="${esc(order.id)}">Details</button>${reviewButton}${statusButtons}</div></article>`;
    }).join("");
    const empty = `<div class="empty-state"><h2>${allOrders.length ? "No matching orders" : "No orders yet"}</h2><p>${allOrders.length ? "Choose another payment status filter." : "Place a customer demo order to see it here."}</p>${allOrders.length ? "" : `<a href="/menu" data-link="/menu" class="button button-primary">Try the customer menu</a>`}</div>`;
    adminLayout(`<div class="eyebrow">Order management</div><h1 style="font-size:40px">Orders</h1><p class="muted">Orders from customer checkout are saved in this browser's local storage. Scheduled orders are listed by soonest schedule first.</p><div class="menu-toolbar"><label for="payment-status-filter">Payment status</label><select id="payment-status-filter" data-action="payment-filter">${filterOptions}</select></div>${list.length ? cards : empty}`, "Orders");
  }
  function adminOrderDetail(id) {
    const order = orders().find(item => item.id === id);
    if (!order) { go("/admin/orders"); notify("Order not found."); return; }
    write(KEYS.seen, [...new Set([...read(KEYS.seen, []), order.id])]);
    const gcashDetails = order.paymentMethod === "GCash" ? `<div class="gcash-review-panel"><h3>GCash payment review</h3><p><strong>Payment status:</strong> ${esc(order.paymentStatus || "Awaiting Payment")}</p>${order.paymentReference ? `<p><strong>Reference number:</strong> ${esc(order.paymentReference)}</p>` : ""}${order.paymentSenderName ? `<p><strong>Sender name:</strong> ${esc(order.paymentSenderName)}</p>` : ""}${order.paymentSubmittedAt ? `<p><strong>Submitted:</strong> ${new Date(order.paymentSubmittedAt).toLocaleString()}</p>` : ""}${order.paymentRejectionReason ? `<p class="alert"><strong>Rejection reason:</strong> ${esc(order.paymentRejectionReason)}</p>` : ""}${order.paymentProof?.imageData ? `<button class="button button-outline" data-action="review-payment-proof" data-id="${esc(order.id)}">View private screenshot</button>` : `<p class="small muted">No payment screenshot is attached.</p>`}${order.paymentStatus === "Pending Verification" ? `<div class="admin-actions"><button class="button button-primary" data-action="open-payment-verify" data-id="${esc(order.id)}">Verify Payment</button><button class="button button-danger" data-action="open-payment-reject" data-id="${esc(order.id)}">Reject Payment</button></div>` : ""}</div>` : "";
    adminLayout(`<a href="/admin/orders" data-link="/admin/orders">← Back to orders</a><div class="panel" style="margin-top:16px"><div class="admin-order-head"><div><div class="eyebrow">Order details</div><h1 style="font-size:36px">#${esc(order.id)}</h1></div><span class="status-badge">${esc(order.status)}</span></div><div class="two-col"><section><h2 style="font-size:23px">Customer</h2><p>${esc(order.customer)}<br>${esc(order.phone)}</p><h3>Order type</h3><p>${esc(scheduleOrderType(order))}</p>${order.orderType === "Delivery" ? `<h3>Address</h3><p>${esc(order.address)}, ${esc(order.barangay)}${order.landmark ? `<br>Landmark: ${esc(order.landmark)}` : ""}${order.notes ? `<br>Notes: ${esc(order.notes)}` : ""}</p>` : ""}${order.orderMode === "Scheduled" ? `<h3>Schedule</h3><p class="schedule-tracking"><strong>Scheduled for ${esc(formatScheduleDate(order.scheduledDate))} at ${esc(formatScheduleTime(order.scheduledTime))}</strong></p>` : ""}<h3>Payment</h3><p>${esc(order.paymentMethod)}</p>${gcashDetails}<h3>Placed</h3><p>${new Date(order.createdAt).toLocaleString()}</p></section><section><h2 style="font-size:23px">Items</h2>${orderItems(order)}<div class="summary-line"><span>Subtotal</span><strong>${money(order.subtotal)}</strong></div><div class="summary-line"><span>Demo delivery fee</span><strong>${money(order.deliveryFee)}</strong></div><div class="summary-line total"><span>Total</span><strong>${money(order.total)}</strong></div><h3 style="margin-top:18px">Status: ${esc(order.status)}</h3><div class="admin-actions">${orderActionButtons(order).map(([status,label]) => `<button class="button ${status==="Cancelled"?"button-danger":"button-primary"}" data-action="set-status" data-id="${esc(order.id)}" data-status="${esc(status)}">${label}</button>`).join("")}</div></section></div></div>${paymentReviewModal(order)}`, "Order Details");
  }
  function adminMenu() {
    const list = products();
    const search = new URLSearchParams(location.search).get("q") || "";
    const filter = new URLSearchParams(location.search).get("category") || "All";
    const shown = list.filter(item => (filter === "All" || item.category === filter) && `${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase()));
    adminLayout(`<div class="admin-order-head"><div><div class="eyebrow">Catalog</div><h1 style="font-size:40px">Menu Management</h1></div><button class="button button-primary" data-action="add-product-form">Add Product</button></div><p class="muted">Changes save to this browser and appear in the customer menu. Uploaded, business-approved images are marked official; fetched menu placeholders are marked temporary demo.</p><div id="new-product-area"></div><div class="menu-toolbar"><input class="search-input" type="search" placeholder="Search products" value="${esc(search)}" data-action="admin-menu-search"><select data-action="admin-menu-category"><option value="All">All categories</option>${MENU_CATEGORIES.map(cat => `<option value="${esc(cat)}" ${filter===cat?"selected":""}>${esc(cat)}</option>`).join("")}</select><span class="badge">${shown.length} products</span></div><div class="panel table-wrap"><table><thead><tr><th>Product</th><th>Image source</th><th>Category</th><th>Price</th><th>Available</th><th>Actions</th></tr></thead><tbody>${shown.map(item => `<tr><td><strong>${esc(item.name)}</strong><br><small>${esc(item.id)}</small></td><td><span class="image-source-badge ${item.imageSource === "official" ? "image-source-official" : "image-source-demo"}">${item.imageSource === "official" ? "OFFICIAL" : "TEMPORARY DEMO"}</span></td><td>${esc(item.category)}</td><td><input aria-label="Price for ${esc(item.name)}" type="number" min="0" step="1" value="${item.price}" style="width:85px" data-action="edit-price" data-id="${esc(item.id)}"></td><td><label><input type="checkbox" data-action="toggle-availability" data-id="${esc(item.id)}" ${item.available===false?"":"checked"}> ${item.available===false?"Sold out":"Available"}</label></td><td><button class="button button-outline" style="min-height:34px;padding:6px 9px;font-size:12px" data-action="edit-product" data-id="${esc(item.id)}">Edit</button> <button class="button button-danger" style="min-height:34px;padding:6px 9px;font-size:12px" data-action="delete-product" data-id="${esc(item.id)}">Delete</button></td></tr>`).join("")}</tbody></table></div>`, "Menu Management");
  }
  function adminDelivery() {
    const cfg = settings();
    adminLayout(`<div class="eyebrow">Proposal configuration</div><h1 style="font-size:40px">Delivery Settings</h1><p class="alert">Demo values only — confirm actual delivery policies and fees with the business before production.</p><form id="delivery-settings-form" class="panel"><div class="form-grid"><label class="choice-card"><input type="checkbox" name="deliveryEnabled" ${cfg.deliveryEnabled?"checked":""}> Delivery enabled</label><label class="choice-card"><input type="checkbox" name="pickupEnabled" ${cfg.pickupEnabled?"checked":""}> Pickup enabled</label><div class="field"><label for="minimum-order">Demo minimum order (₱)</label><input type="number" id="minimum-order" name="minimumOrder" min="0" value="${cfg.minimumOrder}"></div><div class="field"><label for="delivery-fee">Demo delivery fee (₱)</label><input type="number" id="delivery-fee" name="deliveryFee" min="0" value="${cfg.deliveryFee}"></div><div class="field"><label for="free-threshold">Demo free-delivery threshold (₱, 0 = off)</label><input type="number" id="free-threshold" name="freeDeliveryThreshold" min="0" value="${cfg.freeDeliveryThreshold}"></div><div class="field"><label for="hours">Demo operating hours</label><input id="hours" name="hours" value="${esc(cfg.hours)}"></div></div><button class="button button-primary" style="margin-top:18px">Save Demo Settings</button></form>`, "Delivery Settings");
  }
  function adminSettings() {
    const cfg = settings();
    adminLayout(`<div class="eyebrow">Proposal configuration</div><h1 style="font-size:40px">Business Settings</h1><p class="muted">Demo-only settings saved in local storage. Confirm all details with the owner before production.</p><form id="business-settings-form" class="panel"><div class="form-grid"><div class="field"><label for="business-name">Business name</label><input id="business-name" name="businessName" value="${esc(cfg.businessName)}"></div><div class="field"><label for="tagline">Tagline</label><input id="tagline" name="tagline" value="${esc(cfg.tagline)}"></div><div class="field"><label for="business-phone">Contact information</label><input id="business-phone" name="phone" value="${esc(cfg.phone)}" placeholder="Add confirmed contact number"></div><div class="field"><label for="business-hours">Business hours</label><input id="business-hours" name="hours" value="${esc(cfg.hours)}"></div><div class="field"><label for="facebook-url">Facebook page URL</label><input id="facebook-url" name="facebook" type="url" value="${esc(cfg.facebook)}"></div><div class="field"><label for="business-address">Address</label><input id="business-address" name="address" value="${esc(cfg.address)}"></div><div class="field"><label>Logo</label><input value="/images/eli-icon.jpg" readonly></div><label class="choice-card"><input type="checkbox" name="deliveryEnabled" ${cfg.deliveryEnabled?"checked":""}> Delivery available</label><label class="choice-card"><input type="checkbox" name="pickupEnabled" ${cfg.pickupEnabled?"checked":""}> Pickup available</label></div><button class="button button-primary" style="margin-top:18px">Save Business Settings</button></form><section class="panel"><div class="eyebrow">Demo reset</div><h2 style="font-size:25px">Reset Demo Data</h2><p class="muted">Restore the official menu and remove demo orders, cart contents, and saved settings.</p><button class="button button-danger" data-action="reset-demo">Reset Demo Data</button></section>`, "Business Settings");
  }
  function renderAdmin() {
    const current = path();
    if (current === "/admin" || current === "/admin/") { adminLogin(); return; }
    if (!read(KEYS.admin, false)) { history.replaceState({}, "", "/admin"); adminLogin(); return; }
    if (current === "/admin/dashboard") adminDashboard();
    else if (current === "/admin/orders") adminOrders();
    else if (current.startsWith("/admin/orders/")) adminOrderDetail(decodeURIComponent(current.slice("/admin/orders/".length)));
    else if (current === "/admin/menu") adminMenu();
    else if (current === "/admin/delivery") adminDelivery();
    else if (current === "/admin/settings") adminSettings();
    else adminDashboard();
  }
  function render() {
    if (path().startsWith("/admin")) renderAdmin();
    else renderPublic();
  }
  function addToCart(id, quantity = 1, specialInstructions = "") {
    const item = products().find(product => product.id === id);
    if (!item) { notify("That menu item could not be found."); return; }
    if (item.available === false) { notify(`${item.name} is sold out.`); return; }
    if (!Number.isInteger(quantity) || quantity < 1) { notify("Please choose a valid quantity."); return; }
    const next = cart();
    next[id] = (Number(next[id]) || 0) + quantity;
    if (specialInstructions) {
      const notes = read(KEYS.notes, {});
      notes[id] = specialInstructions;
      write(KEYS.notes, notes);
    }
    if (saveCart(next)) {
      notify(`${item.name} added to cart.`);
      render();
    }
  }
  function updateCart(id, change) {
    const item = products().find(product => product.id === id);
    if (!item) { notify("That menu item is no longer available."); return; }
    const next = cart();
    const quantity = (Number(next[id]) || 0) + change;
    if (quantity <= 0) {
      delete next[id];
      const notes = read(KEYS.notes, {});
      delete notes[id];
      write(KEYS.notes, notes);
    }
    else if (quantity > 99) { notify("Maximum quantity per item is 99."); return; }
    else next[id] = quantity;
    saveCart(next);
    render();
  }
  function showProductForm(existing = null) {
    const area = document.getElementById("new-product-area");
    if (!area) return;
    const image = existing?.image || getProductImageData(existing?.id || "new-product", existing?.name || "New product", existing?.category || "").image;
    area.innerHTML = `<form id="product-form" class="panel" data-product-id="${existing ? esc(existing.id) : ""}"><h2 style="font-size:24px">${existing ? "Edit Product" : "Add Product"}</h2><div class="form-grid"><div class="field"><label for="product-name">Product name</label><input id="product-name" name="name" required value="${esc(existing?.name || "")}"></div><div class="field"><label for="product-category">Category</label><select id="product-category" name="category">${MENU_CATEGORIES.map(cat=>`<option ${existing?.category===cat?"selected":""}>${esc(cat)}</option>`).join("")}</select></div><div class="field"><label for="product-price">Price (₱)</label><input id="product-price" name="price" type="number" min="0" step="1" required value="${existing?.price ?? ""}"></div><div class="field"><label for="product-id">ID (unique)</label><input id="product-id" name="id" required value="${esc(existing?.id || "")}" ${existing?"readonly":""}></div><div class="field field-full"><label for="product-image">Product image</label><input id="product-image" name="image" type="file" accept="image/jpeg,image/png,image/webp"><small class="muted">Optional. Upload a business-provided or approved JPG, PNG, or WebP photo to mark it as official. Otherwise, a temporary demo image is used.</small><img id="product-image-preview" class="product-upload-preview" src="${esc(image)}" alt="Product image preview"></div></div><div class="admin-actions"><button class="button button-primary">Save Product</button><button class="button button-outline" type="button" data-action="cancel-product-form">Cancel</button></div></form>`;
    area.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  async function uploadedProductImage(file) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Choose a JPG, PNG, or WebP image.");
    }
    if (file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not process this image.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.82);
    } finally {
      bitmap.close();
    }
  }
  function releaseProductImagePreview(form) {
    const preview = form.querySelector("#product-image-preview");
    if (preview?.dataset.objectUrl) {
      URL.revokeObjectURL(preview.dataset.objectUrl);
      delete preview.dataset.objectUrl;
    }
  }
  async function persistProductForm(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const price = Number(data.price);
    const id = data.id.trim();
    if (!data.name.trim() || !id || !Number.isFinite(price) || price < 0) { notify("Enter a product name, unique ID, and valid price."); return; }
    const list = products();
    const existingId = form.dataset.productId;
    if (!existingId && list.some(item => item.id === id)) { notify("That product ID already exists."); return; }
    const existing = list.find(item => item.id === existingId);
    const file = data.image?.size > 0 ? data.image : null;
    const fallbackImage = getProductImageData(id, data.name.trim(), data.category);
    let image = existing?.image || fallbackImage.image;
    let imageSource = existing?.imageSource || fallbackImage.imageSource;
    if (file) {
      try {
        image = await uploadedProductImage(file);
        imageSource = "official";
      } catch (error) {
        console.error("Unable to process the uploaded product image.", error);
        notify(error instanceof Error ? error.message : "Unable to process the uploaded image.");
        return;
      }
    }
    const nextItem = { id, name: data.name.trim(), category: data.category, price, image, imageSource, available: existing ? existing.available !== false : true };
    if (existing) list[list.indexOf(existing)] = nextItem;
    else list.push(nextItem);
    if (!saveProducts(list)) return;
    releaseProductImagePreview(form);
    notify("Menu product saved.");
    render();
  }
  document.addEventListener("click", event => {
    const linkNode = event.target.closest("[data-link]");
    if (linkNode && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      const target = linkNode.dataset.link;
      history.pushState({}, "", target);
      if (linkNode.dataset.category) activeCategory = linkNode.dataset.category;
      if (target === "/menu" && linkNode.dataset.category) history.replaceState({}, "", "/menu");
      render();
      window.scrollTo(0, 0);
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "select-scheduled") {
      const form = document.getElementById("checkout-form");
      if (form) {
        form.querySelector('input[name="orderMode"][value="Scheduled"]').checked = true;
        saveCheckoutDraft(form);
        render();
        document.querySelector(".schedule-fields")?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        go("/menu");
      }
    } else if (action === "toggle-nav") {
      const nav = document.getElementById("main-nav");
      const open = nav.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
    } else if (action === "add-cart") {
      const qty = button.dataset.detail === "true" ? detailQuantity : 1;
      const instructions = button.dataset.detail === "true" ? document.getElementById("special-instructions")?.value.trim() : "";
      addToCart(id, qty, instructions || "");
    } else if (action === "product-detail") {
      detailQuantity = 1;
      go(`/menu/${encodeURIComponent(id)}`);
    } else if (action === "detail-qty") {
      detailQuantity = Math.max(1, Math.min(99, detailQuantity + Number(button.dataset.change)));
      render();
    } else if (action === "cart-qty") updateCart(id, Number(button.dataset.change));
    else if (action === "remove-cart") updateCart(id, -(Number(cart()[id]) || 0));
    else if (action === "clear-cart") {
      if (confirm("Clear all items from your cart?")) { saveCart({}); write(KEYS.notes, {}); render(); }
    } else if (action === "filter-category" || action === "category-link") {
      activeCategory = button.dataset.category;
      if (action === "category-link") history.pushState({}, "", "/menu");
      render();
      document.querySelector(".page-top")?.scrollIntoView({ behavior: "smooth" });
    } else if (action === "clear-search") {
      activeCategory = "All";
      history.replaceState({}, "", "/menu");
      render();
    } else if (action === "edit-order") go("/cart");
    else if (action === "view-order") go(`/admin/orders/${encodeURIComponent(id)}`);
    else if (action === "set-status") setOrderStatus(id, button.dataset.status);
    else if (action === "review-payment-proof") {
      if (!read(KEYS.admin, false)) { go("/admin"); return; }
      paymentModal = { id, mode: "proof" };
      render();
    } else if (action === "open-payment-verify" || action === "open-payment-reject") {
      if (!read(KEYS.admin, false)) { go("/admin"); return; }
      paymentModal = { id, mode: action === "open-payment-verify" ? "verify" : "reject" };
      render();
    } else if (action === "confirm-payment-verify") reviewGcashPayment(id, "Verified");
    else if (action === "close-payment-modal") {
      paymentModal = null;
      render();
    } else if (action === "remove-gcash-proof") {
      if (gcashScreenshotPreviewUrl) URL.revokeObjectURL(gcashScreenshotPreviewUrl);
      gcashScreenshotPreviewUrl = "";
      gcashScreenshotFile = null;
      const input = document.getElementById("gcash-proof");
      if (input) input.value = "";
      const preview = document.getElementById("gcash-proof-preview");
      if (preview) preview.innerHTML = `<p class="small muted">Your selected screenshot preview will appear here. It is not shown on public order pages.</p>`;
    }
    else if (action === "admin-logout") {
      paymentModal = null;
      write(KEYS.admin, false);
      go("/admin");
    } else if (action === "add-product-form") showProductForm();
    else if (action === "edit-product") showProductForm(products().find(item => item.id === id));
    else if (action === "cancel-product-form") {
      const form = document.getElementById("product-form");
      if (form) releaseProductImagePreview(form);
      document.getElementById("new-product-area").replaceChildren();
    }
    else if (action === "delete-product") {
      if (confirm("Delete this product from the demo menu?")) {
        saveProducts(products().filter(item => item.id !== id));
        const next = cart(); delete next[id]; saveCart(next); render();
      }
    } else if (action === "reset-demo") {
      if (confirm("Reset all demo orders, cart data, menu changes and settings?")) {
        Object.values(KEYS).forEach(key => localStorage.removeItem(key));
        localStorage.removeItem("elisCrunch.checkoutDraft");
        notify("Demo data reset.");
        go("/admin");
      }
    }
  });
  document.addEventListener("input", event => {
    const target = event.target;
    if (target.dataset.action === "menu-search") {
      const cursor = target.selectionStart;
      history.replaceState({}, "", `/menu?q=${encodeURIComponent(target.value)}`);
      const wrapper = document.createElement("div");
      wrapper.innerHTML = menuPage();
      document.getElementById("menu-results").innerHTML = wrapper.querySelector("#menu-results").innerHTML;
      target.setSelectionRange(cursor, cursor);
    } else if (target.dataset.action === "admin-menu-search") {
      const params = new URLSearchParams(location.search);
      params.set("q", target.value);
      history.replaceState({}, "", `/admin/menu?${params}`);
      const area = document.querySelector(".admin-content");
      if (area) render();
    } else if (target.form?.id === "checkout-form") saveCheckoutDraft(target.form);
    else if (target.form?.id === "gcash-payment-form") {
      const draft = gcashDraftById(target.form.dataset.draftId);
      if (draft) {
        draft.paymentReference = target.form.elements.referenceNumber.value;
        draft.paymentSenderName = target.form.elements.senderName.value;
        saveGcashDrafts(gcashDrafts().map(item => item.id === draft.id ? draft : item));
      }
    }
  });
  document.addEventListener("change", event => {
    const target = event.target;
    if (target.form?.id === "checkout-form" && ["orderMode", "scheduledDate", "orderType", "payment"].includes(target.name)) {
      saveCheckoutDraft(target.form);
      render();
    } else if (target.form?.id === "gcash-payment-form" && target.name === "proof") {
      const file = target.files?.[0];
      if (!file) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        target.value = "";
        gcashScreenshotFile = null;
        paymentFormError("Choose a JPG, PNG, or WebP payment screenshot.");
        return;
      }
      if (file.size > GCASH_SCREENSHOT_MAX_BYTES) {
        target.value = "";
        gcashScreenshotFile = null;
        paymentFormError("The payment screenshot must be 5 MB or smaller.");
        return;
      }
      gcashScreenshotDraftId = target.form.dataset.draftId;
      gcashScreenshotFile = file;
      if (gcashScreenshotPreviewUrl) URL.revokeObjectURL(gcashScreenshotPreviewUrl);
      gcashScreenshotPreviewUrl = URL.createObjectURL(file);
      const preview = document.getElementById("gcash-proof-preview");
      if (preview) preview.innerHTML = `<img src="${esc(gcashScreenshotPreviewUrl)}" alt="Selected payment screenshot preview"><button class="button button-outline" type="button" data-action="remove-gcash-proof">Remove screenshot</button>`;
      const error = document.getElementById("gcash-form-error");
      if (error) error.hidden = true;
    } else if (target.id === "product-image" && target.files[0]) {
      const preview = document.getElementById("product-image-preview");
      if (preview) {
        if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
        preview.dataset.objectUrl = URL.createObjectURL(target.files[0]);
        preview.src = preview.dataset.objectUrl;
      }
    } else if (target.dataset.action === "category-select") {
      activeCategory = target.value;
      render();
    } else if (target.dataset.action === "sort-select") {
      const params = new URLSearchParams(location.search);
      params.set("sort", target.value);
      history.replaceState({}, "", `/menu?${params}`);
      render();
    } else if (target.dataset.action === "admin-menu-category") {
      const params = new URLSearchParams(location.search);
      params.set("category", target.value);
      history.replaceState({}, "", `/admin/menu?${params}`);
      render();
    } else if (target.dataset.action === "payment-filter") {
      const filter = target.value || "All";
      history.replaceState({}, "", filter === "All" ? "/admin/orders" : `/admin/orders?paymentStatus=${encodeURIComponent(filter)}`);
      render();
    } else if (target.dataset.action === "toggle-availability") {
      const list = products();
      const item = list.find(product => product.id === target.dataset.id);
      if (item) { item.available = target.checked; saveProducts(list); notify(`${item.name}: ${item.available ? "available" : "sold out"}.`); render(); }
    } else if (target.dataset.action === "edit-price") {
      if (target.value === "" || Number(target.value) < 0) { notify("Enter a valid product price."); return; }
      const list = products();
      const item = list.find(product => product.id === target.dataset.id);
      if (item) { item.price = Number(target.value); saveProducts(list); notify("Product price updated."); }
    }
  });
  document.addEventListener("submit", event => {
    const form = event.target;
    if (form.id === "checkout-form") { event.preventDefault(); placeOrder(form); }
    else if (form.id === "gcash-payment-form") { event.preventDefault(); void submitGcashPayment(form); }
    else if (form.id === "reject-payment-form") {
      event.preventDefault();
      const reason = String(new FormData(form).get("reason") || "").trim();
      if (!reason) {
        const error = document.getElementById("payment-rejection-error");
        error.textContent = "Enter a reason to explain why this payment was rejected.";
        error.hidden = false;
        return;
      }
      reviewGcashPayment(form.dataset.orderId, "Rejected", reason);
    }
    else if (form.id === "track-form") {
      event.preventDefault();
      orderSearchResult = new FormData(form).get("orderId").trim();
      history.pushState({}, "", `/track-order/${encodeURIComponent(orderSearchResult)}`);
      render();
    } else if (form.id === "admin-login") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (data.email === "demo@eliscrunch.local" && data.password === "demo123") {
        write(KEYS.admin, true);
        go("/admin/dashboard");
      } else {
        document.getElementById("login-error").textContent = "Those demo credentials don't match. Please try again.";
      }
    } else if (form.getAttribute("id") === "product-form") {
      event.preventDefault();
      void persistProductForm(form);
    } else if (form.id === "delivery-settings-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const cfg = settings();
      write(KEYS.settings, { ...cfg, deliveryEnabled: form.elements.deliveryEnabled.checked, pickupEnabled: form.elements.pickupEnabled.checked, minimumOrder: Number(data.minimumOrder) || 0, deliveryFee: Number(data.deliveryFee) || 0, freeDeliveryThreshold: Number(data.freeDeliveryThreshold) || 0, hours: data.hours.trim() || cfg.hours });
      notify("Demo delivery settings saved.");
      render();
    } else if (form.id === "business-settings-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      write(KEYS.settings, { ...settings(), ...data, deliveryEnabled: form.elements.deliveryEnabled.checked, pickupEnabled: form.elements.pickupEnabled.checked });
      notify("Demo business settings saved.");
      render();
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target.closest('[data-action="product-detail"][role="link"]');
    if (!target) return;
    event.preventDefault();
    detailQuantity = 1;
    go(`/menu/${encodeURIComponent(target.dataset.id)}`);
  });
  window.addEventListener("popstate", render);
  window.addEventListener("storage", event => {
    if ([KEYS.orders, KEYS.products, KEYS.settings, KEYS.cart].includes(event.key)) render();
  });

  render();
})();
