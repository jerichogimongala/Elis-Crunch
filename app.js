(() => {
  "use strict";

  const KEYS = {
    products: "elisCrunch.products",
    cart: "elisCrunch.cart",
    settings: "elisCrunch.settings",
  };
  const ADMIN_DEMO_SESSION_KEY = "elisCrunch.adminDemoSession";
  const ADMIN_DEMO_CODE = "CRUNCH-DEMO";
  const DEFAULT_SETTINGS = {
    businessName: "Eli's Crunch",
    tagline: "Little Chef, Big Smiles",
    hours: "8 AM – 9 PM (sample hours; not confirmed)",
    address: "Nabunturan, Davao de Oro",
    deliveryAreas: "",
    facebook: "",
    phone: "",
    messengerUrl: "",
    deliveryEnabled: true,
    pickupEnabled: true,
    minimumOrder: 0,
    deliveryFee: null,
    deliveryFeeConfirmed: false,
    freeDeliveryThreshold: 0,
    gcashEnabled: false,
    codEnabled: true,
    cashOnPickupEnabled: true,
    codScheduledEnabled: false,
    scheduledOrdersEnabled: true,
    maxScheduleDays: 7,
    businessOpenTime: "08:00",
    businessCloseTime: "21:00"
  };
  const SCHEDULE_INTERVAL_MINUTES = 30;
  const LEGACY_ORDER_KEYS = ["elisCrunch.orders", "elisCrunch.gcashDrafts", "elisCrunch.lastOrder", "elisCrunch.seenOrders", "elisCrunch.admin", "elisCrunch.checkoutDraft", "elisCrunch.cartNotes"];
  const app = document.getElementById("app");
  let toastTimer;
  let activeCategory = "All";
  let detailQuantity = 1;
  let cartNotes = {};
  let checkoutErrors = {};
  let checkoutDraft = {};
  let messengerResult = null;
  let messengerRequestPending = false;
  let renderedPath = null;

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
  function settings() {
    const saved = read(KEYS.settings, {});
    const candidate = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    const merged = { ...DEFAULT_SETTINGS, ...candidate };
    if (!Number.isFinite(Number(merged.minimumOrder)) || Number(merged.minimumOrder) < 0) merged.minimumOrder = 0;
    if (merged.deliveryFee === "" || merged.deliveryFee === undefined || merged.deliveryFee === null || !Number.isFinite(Number(merged.deliveryFee)) || Number(merged.deliveryFee) < 0) merged.deliveryFee = null;
    else merged.deliveryFee = Number(merged.deliveryFee);
    if (!Number.isFinite(Number(merged.freeDeliveryThreshold)) || Number(merged.freeDeliveryThreshold) < 0) merged.freeDeliveryThreshold = 0;
    if (!Number.isInteger(Number(merged.maxScheduleDays)) || Number(merged.maxScheduleDays) < 1 || Number(merged.maxScheduleDays) > 30) merged.maxScheduleDays = DEFAULT_SETTINGS.maxScheduleDays;
    if (!validClockTime(merged.businessOpenTime) || !validClockTime(merged.businessCloseTime) || clockMinutes(merged.businessOpenTime) >= clockMinutes(merged.businessCloseTime)) {
      merged.businessOpenTime = DEFAULT_SETTINGS.businessOpenTime;
      merged.businessCloseTime = DEFAULT_SETTINGS.businessCloseTime;
    }
    for (const key of ["deliveryEnabled", "pickupEnabled", "deliveryFeeConfirmed", "gcashEnabled", "codEnabled", "cashOnPickupEnabled", "codScheduledEnabled", "scheduledOrdersEnabled"]) {
      if (typeof merged[key] !== "boolean") merged[key] = DEFAULT_SETTINGS[key];
    }
    if (typeof merged.messengerUrl !== "string" || (merged.messengerUrl && !isValidMessengerUrl(merged.messengerUrl))) merged.messengerUrl = "";
    return merged;
  }
  try {
    if (localStorage.getItem("elisCrunch.messengerFlowVersion") !== "2") {
      LEGACY_ORDER_KEYS.forEach(key => localStorage.removeItem(key));
      localStorage.setItem("elisCrunch.messengerFlowVersion", "2");
    }
  } catch (error) {
    console.error("Unable to clear legacy local demo orders and payment proofs.", error);
    notify("Old demo order data could not be removed from this browser. Clear site storage before presenting.");
  }
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
  function validClockTime(value) {
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
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
    const config = settings();
    return minutes >= clockMinutes(config.businessOpenTime) && minutes < clockMinutes(config.businessCloseTime);
  }
  function scheduleSlotsForDate(value, now = new Date()) {
    const date = dateFromKey(value);
    if (!date) return [];
    const config = settings();
    const today = dateKey(now);
    const opening = clockMinutes(config.businessOpenTime);
    const closing = clockMinutes(config.businessCloseTime);
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
    const config = settings();
    const today = dateKey(now);
    for (let offset = 0; offset <= Number(config.maxScheduleDays); offset += 1) {
      const date = addDaysToDateKey(today, offset);
      const times = scheduleSlotsForDate(date, now);
      if (times.length) return { date, time: times[0] };
    }
    return { date: addDaysToDateKey(today, 1), time: config.businessOpenTime };
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
  function orderCtaLabel() {
    if (isBusinessOpen()) return "Order Now";
    return settings().scheduledOrdersEnabled ? "Schedule an Order" : "View Menu";
  }
  function availablePayments(orderType, orderMode) {
    const config = settings();
    const methods = [];
    if (orderType === "Pickup") {
      if (config.cashOnPickupEnabled) methods.push("Cash on Pickup");
      return methods;
    }
    if (config.codEnabled && (orderMode !== "Scheduled" || config.codScheduledEnabled)) methods.push("Cash on Delivery");
    return methods;
  }
  function isValidMessengerUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password) return false;
      const host = url.hostname.toLowerCase();
      if (host === "m.me") return /^\/[A-Za-z0-9._-]+\/?$/.test(url.pathname);
      if (host === "messenger.com" || host === "www.messenger.com") return /^\/t\/[^/]+\/?$/.test(url.pathname);
      if (host === "facebook.com" || host === "www.facebook.com") return /^\/messages\/t\/[^/]+\/?$/.test(url.pathname);
      return false;
    } catch {
      return false;
    }
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
    return Object.entries(current).map(([id, quantity]) => {
      const product = catalog.find(item => item.id === id);
      return product && Number(quantity) > 0 ? { product, quantity: Number(quantity), specialInstructions: cartNotes[id] || "" } : null;
    }).filter(Boolean);
  }
  function subtotal() { return cartRows().reduce((sum, row) => sum + row.product.price * row.quantity, 0); }
  function deliveryFee(type = "Delivery") {
    if (type !== "Delivery") return 0;
    const config = settings();
    if (!config.deliveryFeeConfirmed || config.deliveryFee === null) return null;
    if (config.freeDeliveryThreshold > 0 && subtotal() >= config.freeDeliveryThreshold) return 0;
    return config.deliveryFee;
  }
  function header() {
    const cfg = settings();
    return `<header class="site-header"><div class="nav-wrap">
      <a class="brand" href="/" data-link="/" aria-label="Eli's Crunch home"><img src="/images/eli-icon.jpg" alt="Chef Eli logo"><span>Eli's Crunch</span></a>
      <nav class="nav-links" id="main-nav" aria-label="Main navigation">
        ${link("/", "Home")}${link("/menu", "Menu")}${link("/about", "About")}${link("/contact", "Contact")}
      </nav>
      <div class="nav-actions"><a class="cart-link" href="/cart" data-link="/cart" aria-label="Cart, ${cartCount()} items">Cart <span class="cart-count">${cartCount()}</span></a><a class="button button-primary" href="/menu" data-link="/menu">${orderCtaLabel()}</a></div>
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
      <div><a class="brand" href="/" data-link="/"><img src="/images/eli-icon.jpg" alt=""><span>${esc(cfg.businessName)}</span></a><p style="margin-top:14px">${esc(cfg.tagline)}</p><p>Proposed location: ${esc(cfg.address)}<br>Sample hours: ${esc(cfg.hours)}</p></div>
      <div><strong>Explore</strong><div class="footer-links" style="margin-top:14px">${link("/", "Home")}${link("/menu", "Menu")}</div></div>
      <div><strong>More</strong><div class="footer-links" style="margin-top:14px">${link("/about", "About")}${link("/contact", "Contact")}${link("/faq", "FAQ")}${cfg.facebook ? `<a href="${esc(cfg.facebook)}" target="_blank" rel="noopener noreferrer">Facebook</a>` : ""}</div></div>
    </div><div class="footer-bottom">© ${new Date().getFullYear()} ${esc(cfg.businessName)} · Proposal demo only · Food images are presentation placeholders and may be replaced by owner-approved photos · Hours, delivery coverage and fees require confirmation · No real payment is processed.</div></div></footer>`;
  }
  function shell(content, options = {}) {
    const config = settings();
    const floatingCart = cartCount() && options.floating !== false
      ? `<div class="mobile-cart"><a class="button button-primary" href="/cart" data-link="/cart">🛒 View Cart — ${money(subtotal())}</a></div>` : "";
    const closedBanner = !isBusinessOpen()
      ? `<div class="closed-banner" role="status"><div><strong>Outside this demo's sample hours</strong><br>Configured sample schedule: ${esc(formatScheduleTime(config.businessOpenTime))}–${esc(formatScheduleTime(config.businessCloseTime))}. The owner has not confirmed business hours.</div>${config.scheduledOrdersEnabled
        ? path() === "/checkout"
          ? `<button class="button button-outline" type="button" data-action="select-scheduled">Schedule an Order</button>`
          : `<a class="button button-outline" href="/menu" data-link="/menu">Schedule an Order</a>`
        : ""}</div>`
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
    return `<section class="hero"><div class="container hero-grid"><div class="hero-copy"><div class="eyebrow">Proposed service area: ${esc(settings().address)}</div>
      <h1>Good Food.<br><span>Big Smiles.</span><br>Delivered.</h1>
      <p class="lead">Explore the Eli's Crunch menu and preview a proposed delivery and pickup ordering experience.</p>
      <div class="hero-actions"><a class="button button-primary" href="/menu" data-link="/menu">${orderCtaLabel()}</a><a class="button button-outline" href="/menu" data-link="/menu">View Menu</a></div>
      <div class="trust-row"><span>Browse the menu anytime</span><span>Review your order before sending</span><span>Confirm details through Messenger</span></div>
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
      <div class="steps-grid">${[["01","Choose your food","Browse the Eli's Crunch menu."],["02","Add to cart","Review your items and quantities."],["03","Checkout","Choose fulfillment, schedule, and payment preference."],["04","Message the business","Review, copy, and send your order details through Messenger."]].map(([n,t,d]) => `<article class="step-card"><div class="step-num">${n}</div><h3>${t}</h3><p>${d}</p></article>`).join("")}</div></div></section>
      <section class="section-tight"><div class="container"><div class="section-heading"><div><div class="eyebrow">Ordering made clearer</div><h2>Why use the menu?</h2></div></div><div class="benefits"><div class="benefit">Browse the menu anytime</div><div class="benefit">Review your complete order first</div><div class="benefit">Copy order details with one tap</div><div class="benefit">Confirm directly with the business</div></div></div></section>
      <section class="section"><div class="container"><div class="promo-band"><div class="promo-grid"><div><h2>Ready to order?</h2><p>Good Food. Big Smiles. Browse the menu to get started.</p></div><a class="button button-primary" href="/menu" data-link="/menu">${orderCtaLabel()}</a></div></div></section>`;
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
      <div class="panel"><div class="eyebrow">${esc(item.category)}</div><h1 class="detail-title">${esc(item.name)}</h1><div class="product-price" style="font-size:25px">${money(item.price)}</div><p class="muted" style="margin-top:18px">${esc(productImageAlt(item))}; the actual dish may look different.</p>
      ${item.available === false ? `<p class="sold-out">SOLD OUT</p>` : `<div class="field" style="max-width:180px;margin:20px 0"><label for="detail-qty">Quantity</label><div class="qty-control"><button type="button" data-action="detail-qty" data-change="-1" aria-label="Decrease quantity">−</button><span id="detail-qty">${detailQuantity}</span><button type="button" data-action="detail-qty" data-change="1" aria-label="Increase quantity">+</button></div></div>
      <div class="field"><label for="special-instructions">Special instructions (optional)</label><textarea id="special-instructions" placeholder="Add a note for your order"></textarea></div>
      <button class="button button-primary button-block" style="margin-top:16px" data-action="add-cart" data-id="${esc(item.id)}" data-detail="true">Add to Cart — ${money(item.price * detailQuantity)}</button>`}
      <a href="/menu" data-link="/menu" class="button button-outline button-block" style="margin-top:10px">Continue shopping</a></div></div></section>`;
  }
  function cartPage() {
    const rows = cartRows();
    if (!rows.length) return `<section class="container section"><div class="empty-state"><div class="eyebrow">Your basket</div><h1>Your cart is empty</h1><p>Browse the menu and add something delicious.</p><a class="button button-primary" href="/menu" data-link="/menu">Browse Menu</a></div></section>`;
    const fee = deliveryFee();
    const feeText = fee === null ? "To be confirmed in Messenger" : money(fee);
    const estimated = fee === null ? "To be confirmed" : money(subtotal() + fee);
    return `<section class="container page-top"><div class="eyebrow">Almost there</div><h1>Your Cart</h1></section><section class="container section-tight"><div class="two-col"><div class="panel">
      ${rows.map(({ product, quantity, specialInstructions }) => `<div class="cart-row"><img class="cart-thumb" src="${esc(product.image)}" alt="" onerror="this.onerror=null;this.src='/images/eli-icon.jpg'"><div><strong>${esc(product.name)}</strong><div class="muted small">${esc(product.category)} · ${money(product.price)} each</div>${specialInstructions ? `<div class="small muted">Note: ${esc(specialInstructions)}</div>` : ""}<div class="qty-control" style="margin-top:9px"><button data-action="cart-qty" data-id="${esc(product.id)}" data-change="-1" aria-label="Decrease ${esc(product.name)} quantity">−</button><span>${quantity}</span><button data-action="cart-qty" data-id="${esc(product.id)}" data-change="1" aria-label="Increase ${esc(product.name)} quantity">+</button></div></div><div style="text-align:right"><strong>${money(product.price * quantity)}</strong><button class="button button-danger" style="display:block;margin-top:8px;min-height:32px;padding:6px 9px;font-size:12px" data-action="remove-cart" data-id="${esc(product.id)}">Remove</button></div></div>`).join("")}
      <div style="display:flex;justify-content:space-between;margin-top:17px"><a class="button button-outline" href="/menu" data-link="/menu">Continue Shopping</a><button class="button button-danger" data-action="clear-cart">Clear Cart</button></div>
      </div><aside class="panel"><h2 style="font-size:26px">Order Summary</h2><div class="summary-line"><span>Item subtotal</span><strong>${money(subtotal())}</strong></div><div class="summary-line"><span>Delivery fee</span><span>${esc(feeText)}</span></div><p class="small muted">The business will confirm delivery fees and the final total through Messenger.</p><div class="summary-line total"><span>Final total</span><span>${esc(estimated)}</span></div><a class="button button-primary button-block" href="/checkout" data-link="/checkout">Proceed to Checkout</a></aside></div></section>`;
  }
  function checkoutPage() {
    const rows = cartRows();
    if (!rows.length) return `<section class="container section"><div class="empty-state"><h1>Your cart is empty</h1><a class="button button-primary" href="/menu" data-link="/menu">Browse Menu</a></div></section>`;
    const config = settings();
    const prior = checkoutDraft;
    const error = key => checkoutErrors[key] ? `<span class="field-error">${esc(checkoutErrors[key])}</span>` : "";
    const now = new Date();
    const open = isBusinessOpen(now);
    const canSchedule = config.scheduledOrdersEnabled;
    const orderMode = canSchedule && (!open || prior.orderMode === "Scheduled") ? "Scheduled" : "Now";
    const firstSchedule = firstAvailableSchedule(now);
    const minDate = dateKey(now);
    const maxDate = addDaysToDateKey(minDate, Number(config.maxScheduleDays));
    let scheduledDate = prior.scheduledDate;
    if (!scheduledDate || scheduledDate < minDate || scheduledDate > maxDate || !scheduleSlotsForDate(scheduledDate, now).length) {
      scheduledDate = firstSchedule.date;
    }
    const availableSlots = scheduleSlotsForDate(scheduledDate, now);
    const scheduledTime = availableSlots.includes(prior.scheduledTime) ? prior.scheduledTime : availableSlots[0];
    const fallbackOrderType = config.deliveryEnabled ? "Delivery" : "Pickup";
    const orderType = prior.orderType === "Pickup" && config.pickupEnabled ? "Pickup"
      : prior.orderType === "Delivery" && config.deliveryEnabled ? "Delivery" : fallbackOrderType;
    const paymentOptions = availablePayments(orderType, orderMode);
    const payment = paymentOptions.includes(prior.payment) ? prior.payment : paymentOptions[0] || "";
    const dateTimeLabel = `${formatScheduleDate(firstSchedule.date)} at ${formatScheduleTime(firstSchedule.time)}`;
    const configuredFee = config.deliveryFeeConfirmed && config.deliveryFee !== null ? (config.freeDeliveryThreshold > 0 && subtotal() >= config.freeDeliveryThreshold ? 0 : config.deliveryFee) : null;
    const feeLine = orderType === "Pickup" ? `<div class="summary-line"><span>Delivery fee</span><span>Not applicable</span></div>` : `<div class="summary-line"><span>Delivery fee</span><span>${configuredFee === null ? "To be confirmed in Messenger" : money(configuredFee)}</span></div>`;
    const feeNote = orderType === "Delivery" && configuredFee === null ? "Delivery charge is not configured. Eli's Crunch will confirm it and the final total in Messenger." : "The business must confirm order availability and the final total in Messenger.";
    const paymentNotice = paymentOptions.length ? "" : `<p class="alert">No payment methods are currently enabled for this order type. Ask the owner to enable a method in Ordering & Checkout Settings.</p>`;
    const scheduleFields = orderMode === "Scheduled"
      ? `<div class="schedule-fields"><p class="small muted"><strong>Preferred schedule</strong> · ${esc(dateTimeLabel)} · Owner-confirmed hours required.</p><div class="form-grid"><div class="field"><label for="scheduled-date">Preferred date *</label><input id="scheduled-date" name="scheduledDate" type="date" min="${minDate}" max="${maxDate}" value="${esc(scheduledDate)}" required>${error("scheduledDate")}</div><div class="field"><label for="scheduled-time">Preferred time *</label><select id="scheduled-time" name="scheduledTime" required>${availableSlots.map(time => `<option value="${time}" ${time === scheduledTime ? "selected" : ""}>${formatScheduleTime(time)}</option>`).join("")}</select>${error("scheduledTime")}</div></div></div>` : "";
    const result = messengerResult ? `<div class="messenger-result panel" id="messenger-result" role="status" aria-live="polite">
      <div class="messenger-result-header">
        <span class="eyebrow">Next step required</span>
        <span class="messenger-status-pill">${messengerResult.opened ? "Messenger opened" : "Message ready"}</span>
      </div>
      <h2>Review and send your message</h2>
      <p class="messenger-intro">${esc(messengerResult.status)}</p>
      <div class="messenger-warning">
        <strong>Your order is not confirmed until Eli's Crunch replies through Messenger.</strong>
        Please verify your details before sending.
      </div>

      <div class="messenger-message-shell">
        <div class="messenger-message">
          <div class="message-header">
            <span class="message-avatar" aria-hidden="true">EC</span>
            <span><strong>Message draft</strong><small>For Eli's Crunch in Messenger</small></span>
            <span class="messenger-status-pill">Ready to copy</span>
          </div>
          <label for="order-message" class="field-label">Your complete order message</label>
          <textarea id="order-message" readonly rows="18">${esc(messengerResult.message)}</textarea>
        </div>
      </div>
      <div class="messenger-actions">
        <button class="button button-primary button-block" type="button" data-action="copy-order-message">Copy Order Details</button>
      </div>
      <p class="small muted messenger-note">${messengerResult.opened ? "Messenger was opened in a new tab. Paste the copied message into that conversation and press Send." : "Messenger did not open. Copy the message, then open the official Messenger link after configuring it."}</p>
    </div>` : "";
    return `<section class="container page-top"><div class="eyebrow">Checkout</div><h1>Review Your Order</h1><p class="lead">Prepare a message for Eli's Crunch. Nothing is sent until you paste and send it in Messenger.</p></section><section class="container section-tight"><form id="checkout-form" novalidate><div class="two-col"><div>
      <div class="panel"><h2 style="font-size:25px">Customer Information</h2><div class="form-grid"><div class="field"><label for="customer-name">Full name *</label><input id="customer-name" name="name" autocomplete="name" value="${esc(prior.name || "")}" required aria-describedby="error-name">${error("name")}</div><div class="field"><label for="customer-phone">Contact number *</label><input id="customer-phone" name="phone" type="tel" autocomplete="tel" value="${esc(prior.phone || "")}" required aria-describedby="error-phone">${error("phone")}</div></div></div>
      <div class="panel"><h2 style="font-size:25px">Fulfillment</h2><div class="choice-row"><label class="choice-card ${config.deliveryEnabled ? "" : "choice-disabled"}"><input type="radio" name="orderType" value="Delivery" ${orderType === "Delivery" ? "checked" : ""} ${config.deliveryEnabled ? "" : "disabled"}> Delivery</label><label class="choice-card ${config.pickupEnabled ? "" : "choice-disabled"}"><input type="radio" name="orderType" value="Pickup" ${orderType === "Pickup" ? "checked" : ""} ${config.pickupEnabled ? "" : "disabled"}> Pickup</label></div>${error("orderType")}
      <div id="delivery-fields" class="form-grid" style="${orderType === "Pickup" ? "display:none" : "margin-top:15px"}"><div class="field field-full"><label for="address">Complete delivery address *</label><input id="address" name="address" autocomplete="street-address" placeholder="House/building, street, purok/sitio, barangay, city" value="${esc(prior.address || "")}" required>${error("address")}</div><div class="field field-full"><label for="landmark">Nearby landmark</label><input id="landmark" name="landmark" value="${esc(prior.landmark || "")}"></div><div class="field field-full"><label for="delivery-notes">Delivery instructions</label><textarea id="delivery-notes" name="notes">${esc(prior.notes || "")}</textarea></div></div></div>
      <div class="panel"><h2 style="font-size:25px">Preferred timing</h2><div class="choice-row"><label class="choice-card"><input type="radio" name="orderMode" value="Now" ${orderMode === "Now" ? "checked" : ""}> ASAP (subject to confirmation)</label>${canSchedule ? `<label class="choice-card"><input type="radio" name="orderMode" value="Scheduled" ${orderMode === "Scheduled" ? "checked" : ""}> Schedule for later</label>` : ""}</div>${error("orderMode")}${scheduleFields}</div>
      <div class="panel"><h2 style="font-size:25px">Payment preference</h2><p class="small muted"><strong>Demo only:</strong> selecting a method does not charge you or mark payment as received. Confirm payment instructions directly with the business.</p>${paymentNotice}<div class="choice-row">${paymentOptions.map(method => `<label class="choice-card"><input type="radio" name="payment" value="${esc(method)}" ${payment === method ? "checked" : ""}> ${esc(method)}</label>`).join("")}</div>${error("payment")}</div>
      </div><aside><div class="panel checkout-summary"><h2 style="font-size:25px">Order Summary</h2>${rows.map(({product, quantity, specialInstructions}) => `<div class="summary-line"><span>${esc(product.name)} × ${quantity}${specialInstructions ? `<br><small class="muted">${esc(specialInstructions)}</small>` : ""}</span><strong>${money(product.price * quantity)}</strong></div>`).join("")}<div class="summary-line"><span>Item subtotal</span><strong>${money(subtotal())}</strong></div>${feeLine}<div class="summary-line total"><span>${orderType === "Delivery" && configuredFee === null ? "Final total" : "Estimated total"}</span><strong>${orderType === "Delivery" && configuredFee === null ? "To be confirmed" : money(subtotal() + (configuredFee || 0))}</strong></div><p class="small muted">${esc(feeNote)}</p><p class="checkout-confirmation">Your order will be sent through Facebook Messenger. After Messenger opens, paste your copied order details and press Send. Your order is not confirmed until Eli's Crunch replies to you.</p><button class="button button-outline button-block" type="button" data-action="copy-order-message" ${messengerResult ? "" : "disabled"}>Copy Order Details</button><button class="button button-primary button-block messenger-submit" type="button" data-action="place-order-messenger" ${messengerRequestPending || !paymentOptions.length ? "disabled" : ""}>${messengerRequestPending ? "Preparing Message..." : "Place Order via Messenger"}</button><p class="small muted messenger-url-hint">${config.messengerUrl ? "Messenger destination is configured in this browser." : "Messenger checkout is not configured yet. Ask the owner to add and test the official Messenger URL."}</p></div></aside></div></form>${result}</section>`;
  }
  function orderItems(order) {
    return (order.items || []).map(item => `<div class="summary-line"><span>${esc(item.name)} × ${item.quantity}${item.specialInstructions ? `<br><small class="muted">Note: ${esc(item.specialInstructions)}</small>` : ""}</span><strong>${money(item.price * item.quantity)}</strong></div>`).join("");
  }
  function orderSuccessPage() {
    const id = new URLSearchParams(location.search).get("id") || read(KEYS.lastOrder, "");
    const order = orders().find(item => item.id === id);
    if (!order) return `<section class="container section"><div class="empty-state"><h1>No recent order found</h1><p>Place an order to see its confirmation here.</p><a class="button button-primary" href="/menu" data-link="/menu">Browse Menu</a></div></section>`;
    const scheduled = order.orderMode === "Scheduled";
    const paymentPending = paymentReviewPending(order);
    const paymentRejected = paymentReviewRejected(order);
    const isGcashDemo = order.paymentMethod === "GCash";
    const paymentMessage = isGcashDemo ? `<div class="demo-payment-callout"><strong>DEMO · ${esc(paymentStatusLabel(order.paymentStatus))}</strong><br>${paymentPending ? "The sample screenshot is waiting in the simulated admin review queue. No GCash transaction or payment confirmation exists." : paymentRejected ? `The demo screenshot was not accepted: ${esc(order.paymentRejectionReason || "Please contact the presenter.")}` : "The simulated review step is complete. This does not confirm that money was sent or received."}</div>` : "";
    return `<section class="container section"><div class="panel success-panel"><div class="success-mark ${paymentRejected ? "payment-rejected-mark" : ""}">${paymentRejected ? "!" : "✓"}</div><div class="eyebrow">${isGcashDemo ? paymentRejected ? "Demo review needs attention" : "Demo flow only" : scheduled ? "Scheduled demo order" : "Demo order saved"}</div><h1 style="font-size:48px">${isGcashDemo ? paymentRejected ? "Demo Review Rejected" : paymentPending ? "Demo Screenshot Submitted" : "Demo Order Saved" : scheduled ? "Scheduled Demo Order Saved" : "Demo Order Saved"}</h1><p class="lead" style="margin-inline:auto">${isGcashDemo ? paymentRejected ? "This screenshot was rejected in the simulated review. No GCash payment was made." : paymentPending ? "The sample screenshot is in the simulated review queue. This is not a real order or payment." : "The simulated demo review is complete. No GCash payment was made and this is not a real order." : "This sample order is saved only in this browser and has not been sent to Eli's Crunch."}</p>${scheduled ? `<div class="schedule-confirmation"><strong>Sample schedule</strong><br>${esc(formatScheduleDate(order.scheduledDate))}<br><strong>${esc(formatScheduleTime(order.scheduledTime))}</strong></div>` : ""}<div class="order-number">Demo Order #${esc(order.id)}</div>${paymentMessage}
      <div class="panel" style="text-align:left;margin-top:22px"><h2 style="font-size:24px">Demo Order Summary</h2>${orderItems(order)}<div class="summary-line"><span>Subtotal</span><strong>${money(order.subtotal)}</strong></div><div class="summary-line"><span>Unconfirmed demo delivery fee</span><strong>${money(order.deliveryFee)}</strong></div><div class="summary-line total"><span>Demo total (not charged)</span><strong>${money(order.total)}</strong></div><div class="divider"></div><p><strong>Demo customer:</strong> ${esc(order.customer)} · ${esc(order.phone)}</p><p><strong>Order type:</strong> ${esc(scheduleOrderType(order))}</p>${scheduled ? `<p><strong>Sample schedule:</strong> ${esc(formatScheduleDate(order.scheduledDate))} at ${esc(formatScheduleTime(order.scheduledTime))}</p>` : ""}${order.orderType === "Delivery" ? `<p><strong>Sample address:</strong> ${esc(order.address)}${order.barangay ? `, ${esc(order.barangay)}` : ""}${order.landmark ? ` · ${esc(order.landmark)}` : ""}</p>` : ""}<p><strong>Demo payment method:</strong> ${esc(order.paymentMethod)}</p></div>${scheduled ? `<p class="small muted">This sample scheduled order is not sent to the business.</p>` : ""}
      <div class="hero-actions" style="justify-content:center"><a class="button button-dark" href="/track-order/${encodeURIComponent(order.id)}" data-link="/track-order/${encodeURIComponent(order.id)}">Track My Order</a><a class="button button-primary" href="/menu" data-link="/menu">Order Again</a></div></div></section>`;
  }
  function trackingCard(order) {
    const scheduled = order.orderMode === "Scheduled";
    const isGcashDemo = order.paymentMethod === "GCash";
    const stages = scheduled ? ["Scheduled", "New", "Confirmed", "Preparing", "Ready", "Out for Delivery", "Delivered"] : ["New", "Confirmed", "Preparing", "Ready", "Out for Delivery", "Delivered"];
    const index = stages.indexOf(order.status);
    const isCancelled = order.status === "Cancelled";
    const displayStatus = demoOrderStatusLabel(order);
    return `<div class="panel" style="margin-top:20px"><div class="admin-order-head"><div><div class="eyebrow">${isGcashDemo ? "Demo order tracking" : "Order tracking"}</div><h2 style="font-size:25px">Order #${esc(order.id)}</h2></div><span class="status-badge">${esc(displayStatus)}</span></div>
      ${isGcashDemo ? `<div class="demo-payment-callout"><strong>DEMO ONLY · No transaction occurred</strong><br>These walkthrough statuses are simulated in this browser. They do not confirm payment receipt, business acceptance, or a real order.</div>` : ""}
      ${scheduled ? `<div class="schedule-tracking"><strong>Sample scheduled order</strong><br>${esc(formatScheduleDate(order.scheduledDate))} — ${esc(formatScheduleTime(order.scheduledTime))}</div>` : ""}
      ${paymentReviewPending(order) ? `<div class="schedule-tracking"><strong>DEMO · Screenshot review pending</strong><br>Waiting for the simulated admin review.</div>` : paymentReviewRejected(order) ? `<div class="alert" style="margin:15px 0"><strong>DEMO · Screenshot review rejected.</strong><br>${esc(order.paymentRejectionReason || "Please contact the presenter.")}</div>` : paymentReviewComplete(order) ? `<div class="schedule-tracking"><strong>DEMO · Screenshot review complete</strong><br>This is not proof of money sent or received.</div>` : ""}
      ${isCancelled ? `<div class="alert" style="margin:15px 0">This demo order has been cancelled.</div>` : order.status === "Payment Verification" || order.status === "Payment Rejected" ? `<div class="schedule-tracking"><strong>DEMO · ${order.status === "Payment Rejected" ? "Review needs attention" : "Review pending"}</strong><br>${order.status === "Payment Rejected" ? "The sample screenshot was rejected in this simulated flow." : "The simulated review is pending. No order has been sent to the business."}</div>` : `<div class="timeline">${stages.map((stage, i) => { const complete = (index >= 0 && i < index) || (scheduled && order.status === "Scheduled" && stage === "Scheduled"); const current = i === index && !(scheduled && order.status === "Scheduled" && stage === "Scheduled"); const label = stage === "Scheduled" ? "Sample Order Scheduled" : stage === "New" ? (scheduled ? "Ready for Demo Preparation" : "Demo Order Placed") : stage === "Confirmed" ? "Demo Review Complete" : `Demo ${stage}`; return `<div class="timeline-step ${complete ? "done" : ""} ${current ? "current" : ""}"><span class="timeline-dot">${complete ? "✓" : current ? "●" : "○"}</span><span class="timeline-label">${label}</span></div>`; }).join("")}</div>`}
      <p><strong>Demo order type:</strong> ${esc(scheduleOrderType(order))} · <strong>Total (not charged):</strong> ${money(order.total)}</p>${isGcashDemo ? `<p><strong>Demo review status:</strong> ${esc(paymentStatusLabel(order.paymentStatus))}</p>` : ""}<p class="small muted">Last updated ${new Date(order.updatedAt || order.createdAt).toLocaleString()}</p></div>`;
  }
  function trackPage(specificId = "") {
    const orderId = specificId || orderSearchResult;
    const order = orderId ? orders().find(item => item.id.toLowerCase() === orderId.trim().toLowerCase()) : null;
    return `<section class="container page-top"><div class="eyebrow">Stay in the know</div><h1>Track Your Order</h1><p class="lead">Enter your order number to view its latest demo status.</p></section><section class="container section-tight"><form id="track-form" class="panel" style="max-width:650px"><div class="form-grid"><div class="field"><label for="track-id">Order Number</label><input id="track-id" name="orderId" placeholder="EC-DEMO-1001" value="${esc(orderId)}" required></div><div style="align-self:end"><button class="button button-primary button-block" type="submit">Track Order</button></div></div>${orderSearchResult && !order ? `<p class="alert" style="margin:12px 0 0">We couldn't find that order number. Please check it and try again.</p>` : ""}</form>${order ? trackingCard(order) : ""}</section>`;
  }
  function aboutPage() {
    return `<section class="container section"><div class="two-col"><div><div class="eyebrow">Proposal demo</div><h1>Little Chef,<br>Big Smiles.</h1><p class="lead">A proposed local delivery and pickup ordering experience for Eli's Crunch. The service area and fulfillment options shown here have not been confirmed by the owner.</p><p>Food images shown in this demo are for presentation purposes and may be replaced with official Eli's Crunch product photos supplied or approved by the owner.</p><a class="button button-primary" href="/menu" data-link="/menu">Explore the Menu</a></div><div class="panel" style="display:grid;place-items:center;background:#fff2d1"><img src="/images/eli-icon.jpg" alt="Eli's Crunch logo placeholder" style="width:min(360px,100%);border-radius:50%"></div></div></section>`;
  }
  function contactPage() {
    const cfg = settings();
    return `<section class="container section"><div class="eyebrow">Proposal demo · Owner confirmation needed</div><h1>Contact & Service Details</h1><p class="lead">Confirm these details directly with Eli's Crunch. Messenger orders will not appear in a website inbox.</p><div class="panel" style="max-width:640px"><p><strong>Proposed locality (unconfirmed)</strong><br>${esc(cfg.address)}</p><p><strong>Sample hours (unconfirmed)</strong><br>${esc(cfg.hours)}</p><p><strong>Delivery coverage (unconfirmed)</strong><br>${cfg.deliveryAreas ? esc(cfg.deliveryAreas) : "Not provided for this proposal."}</p><p><strong>Delivery fees</strong><br>Not confirmed. The business will confirm any delivery charge and final total through Messenger.</p><p><strong>Pickup availability & location</strong><br>Not confirmed.</p>${cfg.phone ? `<p><strong>Contact number (confirm with owner)</strong><br><a href="tel:${esc(cfg.phone)}">${esc(cfg.phone)}</a></p>` : `<p><strong>Contact information</strong><br>Not provided for this proposal.</p>`}${cfg.facebook ? `<a class="button button-outline" href="${esc(cfg.facebook)}" target="_blank" rel="noopener noreferrer">Facebook page (confirm destination)</a>` : `<p>Facebook page information has not been provided.</p>`}</div></section>`;
  }
  function faqPage() {
    const pairs = [["How do I place an order?", "Add menu items to your cart, complete checkout, then paste the generated message into Messenger and press Send."], ["Is my order confirmed when Messenger opens?", "No. Your order is not confirmed until Eli's Crunch replies through Messenger."], ["Can I choose delivery or pickup?", "Choose an option shown at checkout; availability and pickup details must be confirmed by the owner."], ["Is payment processed on this website?", "No. Payment is not processed or verified here. The business confirms order availability, final total, and payment instructions through Messenger."], ["Can I track a Messenger order here?", "No. Facebook Messenger orders are not automatically imported into or synchronized with this website."]];
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
    else if (["/payment/gcash", "/order-success", "/track-order"].includes(current) || current.startsWith("/track-order/")) content = `<section class="container section"><div class="empty-state"><div class="eyebrow">Messenger ordering</div><h1>Orders are handled in Messenger</h1><p>This website does not submit orders to a dashboard or provide order tracking. Paste your prepared order details into the official Messenger conversation and press Send. The order is not confirmed until Eli's Crunch replies.</p><a class="button button-primary" href="/checkout" data-link="/checkout">Return to Checkout</a></div></section>`;
    else if (current === "/about") content = aboutPage();
    else if (current === "/contact") content = contactPage();
    else if (current === "/faq") content = faqPage();
    else content = `<section class="container section"><div class="empty-state"><h1>Page not found</h1><a class="button button-primary" href="/" data-link="/">Go Home</a></div></section>`;
    shell(content, { floating: !["/cart", "/checkout"].includes(current) });
  }
  function saveCheckoutDraft(form) {
    checkoutDraft = Object.fromEntries(new FormData(form).entries());
    messengerResult = null;
  }
  function validateCheckout(data) {
    const errors = {};
    const config = settings();
    if (!String(data.name || "").trim()) errors.name = "Please enter your full name.";
    else if (String(data.name).trim().length > 120) errors.name = "Name must be 120 characters or fewer.";
    if (!String(data.phone || "").trim()) errors.phone = "Please enter your mobile number.";
    else if (!/^[+()\d\s-]{7,20}$/.test(data.phone.trim())) errors.phone = "Enter a valid contact number.";
    if (!["Delivery", "Pickup"].includes(data.orderType)) errors.orderType = "Choose delivery or pickup.";
    if (data.orderType === "Delivery" && !config.deliveryEnabled) errors.orderType = "Delivery is not currently enabled. Choose pickup or contact the owner.";
    if (data.orderType === "Pickup" && !config.pickupEnabled) errors.orderType = "Pickup is not currently enabled. Choose delivery or contact the owner.";
    if (data.orderType === "Delivery") {
      if (!String(data.address || "").trim()) errors.address = "Enter your complete delivery address.";
    }
    const cartContents = cart();
    const catalog = products();
    const selectedRows = Object.entries(cartContents);
    if (!selectedRows.length) errors.cart = "Your cart is empty. Add at least one available menu item.";
    for (const [id, quantity] of selectedRows) {
      const item = catalog.find(product => product.id === id);
      if (!item) errors.cart = "A menu item in your cart is no longer available. Review your cart.";
      else if (item.available === false) errors.cart = `${item.name} is no longer available. Remove it from your cart to continue.`;
      else if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > 99) errors.cart = "A cart quantity is invalid. Update your cart and try again.";
      else if (!Number.isFinite(Number(item.price)) || Number(item.price) < 0) errors.cart = `${item.name} has an invalid current price. Contact the owner.`;
    }
    const currentSubtotal = selectedRows.reduce((sum, [id, quantity]) => {
      const item = catalog.find(product => product.id === id);
      return item && Number.isInteger(Number(quantity)) ? sum + Number(item.price) * Number(quantity) : sum;
    }, 0);
    if (currentSubtotal < Number(config.minimumOrder || 0)) errors.cart = `The current minimum order is ${money(config.minimumOrder)}.`;
    const now = new Date();
    const scheduled = data.orderMode === "Scheduled";
    if (scheduled && !config.scheduledOrdersEnabled) errors.orderMode = "Scheduled orders are currently disabled. Choose ASAP.";
    if (!scheduled && data.orderMode !== "Now") errors.orderMode = "Choose ASAP or schedule your order.";
    if (scheduled) {
      if (!data.scheduledDate) errors.scheduledDate = "Choose a preferred date.";
      if (!data.scheduledTime) errors.scheduledTime = "Choose a preferred time.";
      const scheduledAt = dateFromKey(data.scheduledDate || "", data.scheduledTime || "");
      const today = dateKey(now);
      const latestDate = addDaysToDateKey(today, Number(config.maxScheduleDays));
      if (data.scheduledDate && (!scheduledAt || data.scheduledDate < today || data.scheduledDate > latestDate)) {
        errors.scheduledDate = `Choose a valid date from today through the next ${config.maxScheduleDays} days.`;
      }
      if (scheduledAt) {
        const scheduledMinutes = scheduledAt.getHours() * 60 + scheduledAt.getMinutes();
        if (scheduledMinutes < clockMinutes(config.businessOpenTime) || scheduledMinutes > clockMinutes(config.businessCloseTime) || scheduledMinutes % SCHEDULE_INTERVAL_MINUTES !== 0) {
          errors.scheduledTime = "Choose a time within the configured sample business hours.";
        } else if (scheduledAt <= now) {
          errors.scheduledTime = "Choose a future time.";
        }
      }
    }
    const enabledMethods = availablePayments(data.orderType, data.orderMode);
    if (!enabledMethods.length) errors.payment = "No payment methods are enabled for this order. Ask the owner to configure one.";
    else if (!enabledMethods.includes(data.payment)) errors.payment = "This payment method is disabled or unavailable for the selected fulfillment and schedule. Choose an enabled method.";
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
  function messageValue(value) {
    return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  }
  function buildMessengerOrderMessage(data) {
    const config = settings();
    const selectedRows = Object.entries(cart()).map(([id, quantity]) => {
      const product = products().find(item => item.id === id);
      return { product, quantity: Number(quantity), specialInstructions: cartNotes[id] || "" };
    }).filter(row => row.product);
    const orderSubtotal = selectedRows.reduce((sum, row) => sum + row.product.price * row.quantity, 0);
    const confirmedFee = data.orderType === "Delivery" ? deliveryFee("Delivery") : 0;
    const paymentSummary = data.payment === "GCash"
      ? "Payment status: Not yet paid — awaiting confirmation and payment instructions."
      : data.payment === "Cash on Delivery"
        ? "Payment method: Cash on Delivery — payment due upon delivery, subject to order confirmation."
        : data.payment === "Cash on Pickup"
          ? "Payment method: Cash on Pickup — payment due upon pickup, subject to order confirmation."
          : `Payment method: ${messageValue(data.payment)} — payment confirmation is subject to order review and the business's Messenger instructions.`;
    const lines = [
      `Hi, ${messageValue(config.businessName)}! 👋 I'd like to place an order.`,
      "",
      "🛒 MY ORDER",
      ...selectedRows.flatMap(({ product, quantity, specialInstructions }) => [
        `${messageValue(product.name)} × ${quantity} — ${moneyExact(product.price)} each = ${moneyExact(product.price * quantity)}`,
        ...(specialInstructions ? [`  Note: ${messageValue(specialInstructions)}`] : [])
      ]),
      "",
      `Subtotal: ${moneyExact(orderSubtotal)}`,
      ...(data.orderType === "Delivery"
        ? [`Delivery fee: ${confirmedFee === null ? "Please confirm through Messenger" : moneyExact(confirmedFee)}`,
          `Final total: ${confirmedFee === null ? "Please confirm through Messenger" : moneyExact(orderSubtotal + confirmedFee)}`]
        : ["Delivery fee: Not applicable (pickup)", `Pickup subtotal: ${moneyExact(orderSubtotal)} — please confirm final total`]),
      "",
      "📦 ORDER DETAILS",
      `Order type: ${data.orderType}`,
      `Preferred date: ${data.orderMode === "Scheduled" ? messageValue(formatScheduleDate(data.scheduledDate)) : "ASAP (subject to confirmation)"}`,
      ...(data.orderMode === "Scheduled" ? [`Preferred time: ${messageValue(formatScheduleTime(data.scheduledTime))}`] : []),
      "",
      "👤 CUSTOMER INFORMATION",
      `Full name: ${messageValue(data.name)}`,
      `Contact number: ${messageValue(data.phone)}`,
      ...(data.orderType === "Delivery" ? [
        "",
        "📍 DELIVERY ADDRESS",
        `Address: ${messageValue(data.address)}`,
        ...(messageValue(data.landmark) ? [`Landmark: ${messageValue(data.landmark)}`] : []),
        ...(messageValue(data.notes) ? [`Delivery instructions: ${messageValue(data.notes)}`] : [])
      ] : []),
      "",
      "💳 PAYMENT INFORMATION",
      `Preferred payment method: ${messageValue(data.payment)}`,
      paymentSummary,
      "",
      "Please confirm the availability of my order, delivery fee if applicable, and final total before preparation. Thank you! 😊"
    ];
    return lines.join("\n");
  }
  async function copyOrderMessage(message) {
    if (!message) return false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(message);
        return true;
      } catch (error) {
        console.warn("Clipboard permission was not granted; the order message remains available for manual copying.", error);
      }
    }
    const textarea = document.getElementById("order-message");
    if (!textarea) return false;
    textarea.focus();
    textarea.select();
    try {
      return document.execCommand("copy");
    } catch (error) {
      console.warn("The browser could not copy the order message.", error);
      return false;
    }
  }
  async function placeOrderViaMessenger(button) {
    if (messengerRequestPending) return;
    const form = document.getElementById("checkout-form");
    if (!form) return;
    const data = Object.fromEntries(new FormData(form).entries());
    checkoutDraft = data;
    checkoutErrors = validateCheckout(data);
    if (Object.keys(checkoutErrors).length) {
      messengerResult = null;
      render();
      document.querySelector(".field-error, .alert")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const message = buildMessengerOrderMessage(data);
    const destination = settings().messengerUrl;
    let messengerWindow = null;
    let opened = false;
    let status;
    if (!destination) {
      status = "The official Messenger URL is missing or invalid. Your message is ready below; configure and test the correct Facebook/Messenger destination before using checkout.";
    } else {
      try {
        messengerWindow = window.open(destination, "_blank");
      } catch (error) {
        console.warn("The browser could not open Messenger.", error);
      }
      if (messengerWindow) {
        opened = true;
        try { messengerWindow.opener = null; } catch (error) {
          console.warn("The Messenger tab opener could not be isolated.", error);
        }
        status = "Messenger opened. The website has not sent your order. Paste the message below into the conversation and press Send.";
      } else {
        status = "Your browser blocked the Messenger tab. Your order message is still available below; copy it and open the configured conversation manually.";
      }
    }
    messengerRequestPending = true;
    if (button) button.disabled = true;
    const copied = await copyOrderMessage(message);
    messengerRequestPending = false;
    messengerResult = {
      message,
      opened,
      status: `${status}${copied ? " The message was copied to your clipboard." : " Clipboard access was unavailable; use Copy Order Details or select and copy the message below."} After Messenger opens, paste the copied order details and press Send. Your order is not confirmed until Eli's Crunch replies to you.`
    };
    render();
    document.getElementById("messenger-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    return `<section class="container page-top"><div class="eyebrow">SIMULATED GCash WALKTHROUGH</div><h1>Demo payment review</h1><p class="lead">No GCash account or payment connection is configured. This page only demonstrates a screenshot review workflow.</p></section>
      <section class="container section-tight gcash-layout"><div>
        <div class="panel demo-gcash-banner"><span class="demo-tag">SIMULATED PAYMENT · NO ACCOUNT</span><p>Do not send money, enter real GCash details, or upload a real receipt. No transaction can be made from this proposal.</p></div>
        <div class="panel"><h2 style="font-size:25px">Demo walkthrough</h2><ol class="gcash-instructions"><li>Use a fictional reference and sender name.</li><li>Attach a made-up or blank sample image to exercise the review controls.</li><li>Submit it to the simulated admin queue. Completing review only changes demo statuses; it does not verify a transfer.</li></ol><p class="small muted">The sample image is stored in this browser only. Do not use personal or financial information.</p></div>
      </div><aside><div class="panel gcash-payment-panel"><div class="eyebrow">Demo Order #${esc(draft.id)}</div><h2 style="font-size:25px">Walkthrough summary</h2>${draft.items.map(item => `<div class="summary-line"><span>${esc(item.name)} × ${item.quantity}</span><strong>${money(item.price * item.quantity)}</strong></div>`).join("")}<div class="summary-line"><span>Subtotal</span><strong>${money(draft.subtotal)}</strong></div><div class="summary-line"><span>Unconfirmed demo delivery fee</span><strong>${money(draft.deliveryFee)}</strong></div><div class="summary-line total"><span>Demo total (not charged)</span><strong>${moneyExact(draft.total)}</strong></div><p><strong>Demo order type:</strong> ${esc(scheduleOrderType(draft))}</p>${draft.orderMode === "Scheduled" ? `<p><strong>Sample schedule:</strong><br>${esc(formatScheduleDate(draft.scheduledDate))} at ${esc(formatScheduleTime(draft.scheduledTime))}</p>` : ""}
        <form id="gcash-payment-form" data-draft-id="${esc(draft.id)}" novalidate><div class="field"><label for="gcash-reference">Fictional demo reference *</label><input id="gcash-reference" name="referenceNumber" autocomplete="off" maxlength="50" placeholder="DEMO-REF-001" value="${esc(draft.paymentReference || "")}" required></div><div class="field"><label for="gcash-sender">Fictional demo sender name *</label><input id="gcash-sender" name="senderName" autocomplete="off" maxlength="100" placeholder="Demo Sender" value="${esc(draft.paymentSenderName || "")}" required></div>
        <div class="field"><label for="gcash-proof">Sample screenshot for demo * <span class="small muted">(JPG, PNG or WebP; up to 5 MB)</span></label><input id="gcash-proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp" required></div>
        <div id="gcash-proof-preview" class="gcash-proof-preview">${gcashScreenshotPreviewUrl ? `<img src="${esc(gcashScreenshotPreviewUrl)}" alt="Selected demo screenshot preview"><button class="button button-outline" type="button" data-action="remove-gcash-proof">Remove sample</button>` : `<p class="small muted">Choose a non-sensitive sample image. It is not shown on customer tracking pages.</p>`}</div>
        <p id="gcash-form-error" class="alert" role="alert" hidden></p><button class="button button-primary button-block" type="submit">Submit Sample to Demo Review</button></form>
        <p class="small muted" style="margin-top:12px">Submitting creates only a local demo order. It does not send an order, charge a customer, or indicate a successful transaction.</p></div></aside></section>`;
  }
  function paymentFormError(message) {
    const region = document.getElementById("gcash-form-error");
    if (!region) return;
    region.textContent = message;
    region.hidden = false;
    region.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  async function compressGcashProof(file) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP sample image.");
    if (file.size > GCASH_SCREENSHOT_MAX_BYTES) throw new Error("The sample image must be 5 MB or smaller.");
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not process the sample image.");
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
    cartNotes = {};
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
      paymentFormError("Enter a fictional demo reference using letters, numbers, spaces, or hyphens.");
      return;
    }
    if (GCASH_SETTINGS.requireSenderName && !sender) {
      paymentFormError("Enter a fictional demo sender name.");
      return;
    }
    if (sender.length > 100) {
      paymentFormError("The sender name must be 100 characters or fewer.");
      return;
    }
    const file = gcashScreenshotDraftId === id ? gcashScreenshotFile : data.proof;
    if (!(file instanceof File) || file.size === 0) {
      paymentFormError("Choose a harmless sample image before submitting.");
      return;
    }
    let proofImage;
    try {
      proofImage = await compressGcashProof(file);
    } catch (error) {
      console.error("Unable to process the demo screenshot.", error);
      paymentFormError(error instanceof Error ? error.message : "Unable to process the sample image.");
      return;
    }
    const order = {
      ...draft,
      paymentStatus: "Demo Review Pending",
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
    if (order.status === "Scheduled" && due) buttons.push(["New", "Queue Demo Order"]);
    if (due && order.status === "New") buttons.push(["Confirmed", "Confirm Demo"]);
    if (due && order.status === "Confirmed") buttons.push(["Preparing", "Start Demo Prep"]);
    if (due && order.status === "Preparing") buttons.push(["Ready", "Mark Demo Ready"]);
    if (due && order.status === "Ready" && order.orderType === "Delivery") buttons.push(["Out for Delivery", "Demo Out for Delivery"]);
    if (due && order.status === "Ready" && order.orderType === "Pickup") buttons.push(["Delivered", "Complete Demo Pickup"]);
    if (due && order.status === "Out for Delivery") buttons.push(["Delivered", "Complete Demo Delivery"]);
    if (!["Delivered", "Cancelled"].includes(order.status)) buttons.push(["Cancelled", "Cancel Demo"]);
    return buttons;
  }
  function setOrderStatus(id, status) {
    const list = orders();
    const order = list.find(item => item.id === id);
    if (!order) { notify("Order not found."); return; }
    if (!STATUSES.includes(status)) { notify("That order status is not valid."); return; }
    if (order.orderMode === "Scheduled" && !isScheduleDue(order) && status !== "Cancelled") {
      notify(`This demo order is scheduled for ${formatScheduleDate(order.scheduledDate)} at ${formatScheduleTime(order.scheduledTime)} and cannot be advanced yet.`);
      return;
    }
    order.status = status;
    order.updatedAt = new Date().toISOString();
    write(KEYS.orders, list);
    render();
    notify(`Demo order ${id} updated to ${status}.`);
  }
  function adminLogin() {
    document.body.classList.remove("has-mobile-cart");
    app.innerHTML = `<main class="login-wrap"><form id="admin-login-form" class="login-card">
      <img class="login-logo" src="/images/eli-icon.jpg" alt="Eli's Crunch">
      <div class="eyebrow">Browser-only demo</div>
      <h1>Admin sign in</h1>
      <p class="muted">Enter the demo access code to open the admin preview.</p>
      <div class="demo-note"><strong>Demo gate only, not security.</strong><br>This static page exposes its code in the browser and can be bypassed.<br><strong>Demo code: ${ADMIN_DEMO_CODE}</strong></div>
      <div class="field"><label for="admin-demo-code">Demo access code</label><input id="admin-demo-code" name="passcode" type="password" autocomplete="current-password" required></div>
      <p id="admin-login-error" class="field-error" role="alert" hidden></p>
      <button class="button button-primary button-block" type="submit">Sign In</button>
      <a class="button button-outline button-block" href="/" data-link="/">Return to storefront</a>
    </form></main>`;
  }
  function adminNav() {
    const current = path();
    const nav = [["/admin/dashboard","Dashboard"],["/admin/menu","Menu Management"],["/admin/settings","Ordering & Checkout Settings"]];
    return `<aside class="admin-side"><div class="admin-brand"><img src="/images/eli-icon.jpg" alt=""><span>Eli's Crunch<br><small>Admin</small></span></div><div style="margin:0 8px 18px"><span class="demo-tag">BROWSER-ONLY</span></div><nav class="admin-nav">${nav.map(([url,label]) => `<a href="${url}" data-link="${url}" class="${current === url ? "active" : ""}">${label}</a>`).join("")}<button type="button" data-action="admin-logout">Sign Out</button></nav></aside>`;
  }
  function adminLayout(content, title) {
    document.body.classList.remove("has-mobile-cart");
    app.innerHTML = `<div class="admin-shell">${adminNav()}<div class="admin-main"><header class="admin-top"><div><strong>${esc(title)}</strong><div class="small muted">Eli's Crunch · Proposal demo only</div></div><span class="demo-tag">DEMO MODE</span></header><main class="admin-content">${content}</main></div></div>`;
  }
  function paymentReviewModal(order) {
    if (!paymentModal || paymentModal.id !== order.id) return "";
    if (paymentModal.mode === "proof") {
      if (!order.paymentProof?.imageData) return "";
      return `<div class="gcash-modal-backdrop" role="presentation" data-action="close-payment-modal"><section class="gcash-modal" role="dialog" aria-modal="true" aria-labelledby="gcash-modal-title"><button class="gcash-modal-close" type="button" aria-label="Close" data-action="close-payment-modal">×</button><h2 id="gcash-modal-title">Private sample screenshot</h2><p class="small muted">Admin-only simulated review · Order #${esc(order.id)} · Not a payment receipt</p><img class="gcash-modal-image" src="${esc(order.paymentProof.imageData)}" alt="Customer-submitted demo screenshot"></section></div>`;
    }
    if (paymentModal.mode === "verify") {
      return `<div class="gcash-modal-backdrop"><section class="gcash-modal" role="dialog" aria-modal="true" aria-labelledby="gcash-modal-title"><h2 id="gcash-modal-title">Complete simulated review?</h2><p>For demo purposes only, mark Order #${esc(order.id)} as review-complete. This does not verify a transfer, confirm funds, or accept a real business order.</p><div class="admin-actions"><button class="button button-primary" data-action="confirm-payment-verify" data-id="${esc(order.id)}">Mark Demo Review Complete</button><button class="button button-outline" data-action="close-payment-modal">Cancel</button></div></section></div>`;
    }
    if (paymentModal.mode === "reject") {
      return `<div class="gcash-modal-backdrop"><form class="gcash-modal" id="reject-payment-form" data-order-id="${esc(order.id)}" aria-labelledby="gcash-modal-title"><h2 id="gcash-modal-title">Reject sample screenshot</h2><p>Enter a demo reason, which appears on the demo tracking page. No funds or real payment are involved.</p><div class="field"><label for="payment-rejection-reason">Demo reason *</label><textarea id="payment-rejection-reason" name="reason" maxlength="300" required></textarea></div><p id="payment-rejection-error" class="field-error" hidden></p><div class="admin-actions"><button class="button button-danger" type="submit">Reject Demo Screenshot</button><button class="button button-outline" type="button" data-action="close-payment-modal">Cancel</button></div></form></div>`;
    }
    return "";
  }
  function reviewGcashPayment(id, decision, reason = "") {
    if (!read(KEYS.admin, false)) { go("/admin"); return; }
    const list = orders();
    const order = list.find(item => item.id === id);
    if (!order || order.paymentMethod !== "GCash" || !paymentReviewPending(order)) {
      notify("This demo screenshot is no longer waiting for review.");
      paymentModal = null;
      render();
      return;
    }
    if (decision === "Demo Review Complete") {
      if (!order.paymentProof?.imageData || !order.paymentReference || !order.paymentSenderName) {
        notify("The demo review needs a sample screenshot, fictional reference, and fictional sender name.");
        return;
      }
      order.paymentStatus = "Demo Review Complete";
      order.paymentVerifiedAt = new Date().toISOString();
      if (order.status !== "Cancelled") {
        order.status = order.orderMode === "Scheduled" && !isScheduleDue(order) ? "Scheduled" : "Confirmed";
      }
    } else if (decision === "Demo Review Rejected" && reason.trim()) {
      order.paymentStatus = "Demo Review Rejected";
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
    notify(decision === "Demo Review Complete" ? `Demo review for ${id} marked complete. No payment was verified.` : `Demo screenshot for ${id} rejected.`);
  }
  function adminDashboard() {
    adminLayout(`<div class="eyebrow">Messenger-first ordering</div><h1 style="font-size:40px">Dashboard</h1><div class="demo-payment-callout"><strong>Orders placed through Facebook Messenger are received in Messenger, not automatically in this dashboard. Confirm orders directly with customers through Messenger.</strong></div><p class="muted">This website does not read Facebook messages, record orders, show an inbox, synchronize conversations, or provide order tracking. No order activity or sales statistics are available here.</p><div class="two-col" style="margin-top:22px"><section class="panel"><h2 style="font-size:24px">Checkout setup</h2><p>Enter and test the official Messenger conversation URL, then confirm enabled payment and fulfillment options.</p><a class="button button-primary" href="/admin/settings" data-link="/admin/settings">Ordering & Checkout Settings</a></section><section class="panel"><h2 style="font-size:24px">Menu management</h2><p>Manage menu item prices, availability, categories, and owner-approved product photos in this browser.</p><a class="button button-outline" href="/admin/menu" data-link="/admin/menu">Open Menu Management</a></section></div><div class="panel" style="margin-top:18px"><h2 style="font-size:22px">Browser-local limitations</h2><p>Settings and menu edits are stored in this browser only. They are not shared with other devices or public visitors, and this static demo has no authentication. Do not enter real customer information or secrets.</p></div>`, "Dashboard");
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
      const payment = `${esc(order.paymentMethod)}${order.paymentMethod === "GCash" ? ` · DEMO ${esc(paymentStatusLabel(order.paymentStatus))}` : " · demo selection"}`;
      const address = order.orderType === "Delivery" ? ` · ${esc(order.address)}${order.barangay ? `, ${esc(order.barangay)}` : ""}` : "";
      const reviewButton = paymentReviewPending(order) ? `<button class="button button-primary" data-action="view-order" data-id="${esc(order.id)}">Review sample</button>` : "";
      const statusButtons = orderActionButtons(order).map(([status, label]) => `<button class="button ${status === "Cancelled" ? "button-danger" : "button-primary"}" data-action="set-status" data-id="${esc(order.id)}" data-status="${esc(status)}">${label}</button>`).join("");
      return `<article class="admin-order-card"><div class="admin-order-head"><div><strong>Demo Order #${esc(order.id)}</strong><div class="small muted">${new Date(order.createdAt).toLocaleString()}</div>${schedule}</div><span class="status-badge">${esc(demoOrderStatusLabel(order))}</span></div><div class="two-col" style="margin-top:14px;grid-template-columns:1fr 1fr"><div><strong>${esc(order.customer)}</strong><div>${esc(order.phone)}</div><div class="small muted">${esc(scheduleOrderType(order))}${address}</div></div><div><strong>Demo total ${money(order.total)}</strong><div class="small muted">${payment}</div><div class="small">${order.items.map(item => `${esc(item.name)} × ${item.quantity}`).join(", ")}</div></div></div><div class="admin-actions"><button class="button button-outline" data-action="view-order" data-id="${esc(order.id)}">Demo details</button>${reviewButton}${statusButtons}</div></article>`;
    }).join("");
    const empty = `<div class="empty-state"><h2>${allOrders.length ? "No matching orders" : "No orders yet"}</h2><p>${allOrders.length ? "Choose another payment status filter." : "Place a customer demo order to see it here."}</p>${allOrders.length ? "" : `<a href="/menu" data-link="/menu" class="button button-primary">Try the customer menu</a>`}</div>`;
    adminLayout(`<div class="eyebrow">Order management · DEMO ONLY</div><h1 style="font-size:40px">Demo Orders</h1><p class="muted">Fictional orders are saved in this browser's local storage. Do not enter real customer information. GCash “review” changes only simulated statuses and is not payment verification.</p><div class="menu-toolbar"><label for="payment-status-filter">Demo review status</label><select id="payment-status-filter" data-action="payment-filter">${filterOptions}</select></div>${list.length ? cards : empty}`, "Demo Orders");
  }
  function adminOrderDetail(id) {
    const order = orders().find(item => item.id === id);
    if (!order) { go("/admin/orders"); notify("Order not found."); return; }
    write(KEYS.seen, [...new Set([...read(KEYS.seen, []), order.id])]);
    const gcashDetails = order.paymentMethod === "GCash" ? `<div class="gcash-review-panel"><h3>Simulated GCash Review · No Transaction</h3><p><strong>Demo status:</strong> ${esc(paymentStatusLabel(order.paymentStatus))}</p>${order.paymentReference ? `<p><strong>Fictional reference:</strong> ${esc(order.paymentReference)}</p>` : ""}${order.paymentSenderName ? `<p><strong>Fictional sender:</strong> ${esc(order.paymentSenderName)}</p>` : ""}${order.paymentSubmittedAt ? `<p><strong>Demo submitted:</strong> ${new Date(order.paymentSubmittedAt).toLocaleString()}</p>` : ""}${order.paymentRejectionReason ? `<p class="alert"><strong>Demo rejection reason:</strong> ${esc(order.paymentRejectionReason)}</p>` : ""}${order.paymentProof?.imageData ? `<button class="button button-outline" data-action="review-payment-proof" data-id="${esc(order.id)}">View private sample</button>` : `<p class="small muted">No sample image is attached.</p>`}${paymentReviewPending(order) ? `<div class="admin-actions"><button class="button button-primary" data-action="open-payment-verify" data-id="${esc(order.id)}">Complete Demo Review</button><button class="button button-danger" data-action="open-payment-reject" data-id="${esc(order.id)}">Reject Sample</button></div>` : ""}</div>` : "";
    adminLayout(`<a href="/admin/orders" data-link="/admin/orders">← Back to demo orders</a><div class="panel" style="margin-top:16px"><div class="demo-payment-callout"><strong>DEMO DATA ONLY</strong><br>Use fictional customer information. Nothing on this page is sent to Eli's Crunch or represents a real order or payment.</div><div class="admin-order-head"><div><div class="eyebrow">Demo order details</div><h1 style="font-size:36px">#${esc(order.id)}</h1></div><span class="status-badge">${esc(demoOrderStatusLabel(order))}</span></div><div class="two-col"><section><h2 style="font-size:23px">Fictional customer</h2><p>${esc(order.customer)}<br>${esc(order.phone)}</p><h3>Demo order type</h3><p>${esc(scheduleOrderType(order))}</p>${order.orderType === "Delivery" ? `<h3>Sample address</h3><p>${esc(order.address)}, ${esc(order.barangay)}${order.landmark ? `<br>Landmark: ${esc(order.landmark)}` : ""}${order.notes ? `<br>Notes: ${esc(order.notes)}` : ""}</p>` : ""}${order.orderMode === "Scheduled" ? `<h3>Sample schedule</h3><p class="schedule-tracking"><strong>${esc(formatScheduleDate(order.scheduledDate))} at ${esc(formatScheduleTime(order.scheduledTime))}</strong></p>` : ""}<h3>Demo payment selection</h3><p>${esc(order.paymentMethod)}</p>${gcashDetails}<h3>Demo record created</h3><p>${new Date(order.createdAt).toLocaleString()}</p></section><section><h2 style="font-size:23px">Sample items</h2>${orderItems(order)}<div class="summary-line"><span>Subtotal</span><strong>${money(order.subtotal)}</strong></div><div class="summary-line"><span>Unconfirmed demo delivery fee</span><strong>${money(order.deliveryFee)}</strong></div><div class="summary-line total"><span>Demo total (not charged)</span><strong>${money(order.total)}</strong></div><h3 style="margin-top:18px">Demo status: ${esc(demoOrderStatusLabel(order))}</h3><div class="admin-actions">${orderActionButtons(order).map(([status,label]) => `<button class="button ${status==="Cancelled"?"button-danger":"button-primary"}" data-action="set-status" data-id="${esc(order.id)}" data-status="${esc(status)}">${label}</button>`).join("")}</div></section></div></div>${paymentReviewModal(order)}`, "Demo Order Details");
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
    adminLayout(`<div class="eyebrow">Proposal configuration</div><h1 style="font-size:40px">Ordering & Checkout Settings</h1><div class="demo-payment-callout"><strong>Browser-only demo settings</strong><br>Changes are saved only in this browser. They do not update the deployed site for other visitors. Do not enter real customer or payment information.</div><p class="muted">All business policies below require owner confirmation. To configure one shared Messenger destination for public customers, update the site's public configuration or add a real shared backend before production.</p><form id="business-settings-form" class="panel">
      <h2 style="font-size:25px">Messenger destination</h2><div class="field"><label for="messenger-url">Official Messenger conversation URL</label><input id="messenger-url" name="messengerUrl" type="url" inputmode="url" autocomplete="url" placeholder="https://m.me/your-confirmed-page" value="${esc(cfg.messengerUrl)}"><p class="small muted">Enter an owner-confirmed https://m.me/, Messenger, or Facebook messages URL. Checkout will never send a message automatically.</p></div>
      <h2 style="font-size:25px;margin-top:24px">Business information (unconfirmed)</h2><div class="form-grid"><div class="field"><label for="business-name">Business name</label><input id="business-name" name="businessName" maxlength="100" value="${esc(cfg.businessName)}"></div><div class="field"><label for="tagline">Tagline</label><input id="tagline" name="tagline" maxlength="160" value="${esc(cfg.tagline)}"></div><div class="field"><label for="business-phone">Contact number</label><input id="business-phone" name="phone" maxlength="40" value="${esc(cfg.phone)}" placeholder="Owner-confirmed number"></div><div class="field"><label for="facebook-url">Facebook page URL</label><input id="facebook-url" name="facebook" type="url" value="${esc(cfg.facebook)}" placeholder="Owner-confirmed page URL"></div><div class="field"><label for="business-address">Proposed locality / pickup location</label><input id="business-address" name="address" maxlength="160" value="${esc(cfg.address)}"></div><div class="field"><label for="delivery-areas">Delivery coverage / barangays</label><input id="delivery-areas" name="deliveryAreas" maxlength="240" value="${esc(cfg.deliveryAreas)}" placeholder="Owner-confirmed service area"></div></div>
      <h2 style="font-size:25px;margin-top:24px">Fulfillment & fees (unconfirmed)</h2><div class="form-grid"><label class="choice-card"><input type="checkbox" name="deliveryEnabled" ${cfg.deliveryEnabled?"checked":""}> Show delivery at checkout</label><label class="choice-card"><input type="checkbox" name="pickupEnabled" ${cfg.pickupEnabled?"checked":""}> Show pickup at checkout</label><div class="field"><label for="minimum-order">Minimum order (₱; 0 = none)</label><input id="minimum-order" name="minimumOrder" type="number" min="0" step="1" value="${cfg.minimumOrder}"></div><div class="field"><label for="delivery-fee">Delivery fee (₱)</label><input id="delivery-fee" name="deliveryFee" type="number" min="0" step="1" value="${cfg.deliveryFee === null ? "" : cfg.deliveryFee}"></div><label class="choice-card"><input type="checkbox" name="deliveryFeeConfirmed" ${cfg.deliveryFeeConfirmed?"checked":""}> Owner confirmed this delivery fee</label><div class="field"><label for="free-threshold">Free delivery threshold (₱; 0 = off)</label><input id="free-threshold" name="freeDeliveryThreshold" type="number" min="0" step="1" value="${cfg.freeDeliveryThreshold}"></div></div>
      <h2 style="font-size:25px;margin-top:24px">Payment preferences</h2><p class="small muted">Cash options are message preferences only. This website does not process, receive, or verify payments. GCash is temporarily unavailable.</p><div class="choice-row"><label class="choice-card"><input type="checkbox" name="codEnabled" ${cfg.codEnabled?"checked":""}> Cash on Delivery</label><label class="choice-card"><input type="checkbox" name="cashOnPickupEnabled" ${cfg.cashOnPickupEnabled?"checked":""}> Cash on Pickup</label><label class="choice-card"><input type="checkbox" name="codScheduledEnabled" ${cfg.codScheduledEnabled?"checked":""}> Allow Cash on Delivery for scheduled orders</label></div>
      <h2 style="font-size:25px;margin-top:24px">Scheduling (unconfirmed hours)</h2><div class="form-grid"><label class="choice-card"><input type="checkbox" name="scheduledOrdersEnabled" ${cfg.scheduledOrdersEnabled?"checked":""}> Allow customers to request scheduled orders</label><div class="field"><label for="max-schedule-days">Maximum days ahead (1–30)</label><input id="max-schedule-days" name="maxScheduleDays" type="number" min="1" max="30" step="1" value="${cfg.maxScheduleDays}"></div><div class="field"><label for="business-open-time">Opening time</label><input id="business-open-time" name="businessOpenTime" type="time" value="${esc(cfg.businessOpenTime)}" required></div><div class="field"><label for="business-close-time">Closing time</label><input id="business-close-time" name="businessCloseTime" type="time" value="${esc(cfg.businessCloseTime)}" required></div></div>
      <p id="settings-error" class="field-error" role="alert" hidden></p><button class="button button-primary" style="margin-top:20px">Save Ordering Settings</button></form><section class="panel"><div class="eyebrow">Menu and browser data</div><h2 style="font-size:25px">Browser-local limitations</h2><p class="muted">Menu edits and these settings remain in this browser only. The site has no admin authentication, shared database, Messenger inbox, or order tracking. Avoid storing secrets and real customer information.</p><button class="button button-danger" data-action="reset-demo">Reset Local Demo Settings</button></section>`, "Ordering & Checkout Settings");
  }
  function renderAdmin() {
    if (sessionStorage.getItem(ADMIN_DEMO_SESSION_KEY) !== "granted") {
      adminLogin();
      return;
    }
    const current = path();
    if (current === "/admin" || current === "/admin/") { history.replaceState({}, "", "/admin/dashboard"); adminDashboard(); }
    else if (current === "/admin/orders" || current.startsWith("/admin/orders/")) { history.replaceState({}, "", "/admin/dashboard"); adminDashboard(); }
    else if (current === "/admin/menu") adminMenu();
    else if (current === "/admin/delivery") { history.replaceState({}, "", "/admin/settings"); adminSettings(); }
    else if (current === "/admin/settings") adminSettings();
    else adminDashboard();
  }
  function render() {
    const current = path();
    if (renderedPath === "/checkout" && current !== "/checkout") {
      checkoutDraft = {};
      checkoutErrors = {};
      messengerResult = null;
    }
    renderedPath = current;
    if (current.startsWith("/admin")) renderAdmin();
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
      cartNotes[id] = specialInstructions;
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
      delete cartNotes[id];
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
    if (action === "admin-logout") {
      sessionStorage.removeItem(ADMIN_DEMO_SESSION_KEY);
      history.replaceState({}, "", "/admin");
      render();
    } else if (action === "place-order-messenger") {
      void placeOrderViaMessenger(button);
    } else if (action === "copy-order-message") {
      if (!messengerResult?.message) { notify("Prepare your checkout message before copying it."); return; }
      void copyOrderMessage(messengerResult.message).then(copied => notify(copied ? "Order details copied. Paste and send them in Messenger." : "Copy was unavailable. Select the message and copy it manually."));
    } else if (action === "select-scheduled") {
      const form = document.getElementById("checkout-form");
      const scheduledOption = form?.querySelector('input[name="orderMode"][value="Scheduled"]');
      if (scheduledOption) {
        scheduledOption.checked = true;
        saveCheckoutDraft(form);
        render();
        document.querySelector(".schedule-fields")?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        notify("Scheduled orders are disabled in this demo's settings.");
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
      if (confirm("Clear all items from your cart?")) { saveCart({}); cartNotes = {}; render(); }
    } else if (action === "filter-category" || action === "category-link") {
      activeCategory = button.dataset.category;
      if (action === "category-link") history.pushState({}, "", "/menu");
      render();
      document.querySelector(".page-top")?.scrollIntoView({ behavior: "smooth" });
    } else if (action === "clear-search") {
      activeCategory = "All";
      history.replaceState({}, "", "/menu");
      render();
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
      if (confirm("Reset browser-local settings and menu changes? Your cart will be cleared too.")) {
        [KEYS.settings, KEYS.products, KEYS.cart].forEach(key => localStorage.removeItem(key));
        cartNotes = {};
        checkoutDraft = {};
        checkoutErrors = {};
        messengerResult = null;
        notify("Local demo settings and menu data reset.");
        go("/admin/dashboard");
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
        paymentFormError("Choose a JPG, PNG, or WebP sample image.");
        return;
      }
      if (file.size > GCASH_SCREENSHOT_MAX_BYTES) {
        target.value = "";
        gcashScreenshotFile = null;
        paymentFormError("The sample image must be 5 MB or smaller.");
        return;
      }
      gcashScreenshotDraftId = target.form.dataset.draftId;
      gcashScreenshotFile = file;
      if (gcashScreenshotPreviewUrl) URL.revokeObjectURL(gcashScreenshotPreviewUrl);
      gcashScreenshotPreviewUrl = URL.createObjectURL(file);
      const preview = document.getElementById("gcash-proof-preview");
      if (preview) preview.innerHTML = `<img src="${esc(gcashScreenshotPreviewUrl)}" alt="Selected demo screenshot preview"><button class="button button-outline" type="button" data-action="remove-gcash-proof">Remove sample</button>`;
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
    if (form.id === "admin-login-form") {
      event.preventDefault();
      const error = document.getElementById("admin-login-error");
      if (form.elements.passcode.value !== ADMIN_DEMO_CODE) {
        error.textContent = "That demo access code is not correct.";
        error.hidden = false;
        form.elements.passcode.select();
        return;
      }
      sessionStorage.setItem(ADMIN_DEMO_SESSION_KEY, "granted");
      history.replaceState({}, "", "/admin/dashboard");
      render();
    } else if (form.id === "checkout-form") {
      event.preventDefault();
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
      const error = document.getElementById("settings-error");
      const showError = message => {
        error.textContent = message;
        error.hidden = false;
        error.scrollIntoView({ behavior: "smooth", block: "center" });
      };
      const messengerUrl = String(data.messengerUrl || "").trim();
      if (messengerUrl && !isValidMessengerUrl(messengerUrl)) { showError("Enter an owner-confirmed https://m.me/, Messenger, or Facebook messages URL."); return; }
      const facebook = String(data.facebook || "").trim();
      if (facebook) {
        try {
          const parsed = new URL(facebook);
          if (parsed.protocol !== "https:" || !["facebook.com", "www.facebook.com"].includes(parsed.hostname.toLowerCase())) throw new Error("invalid");
        } catch {
          showError("Enter a valid https://www.facebook.com/ page URL or leave it blank."); return;
        }
      }
      const openTime = String(data.businessOpenTime || "");
      const closeTime = String(data.businessCloseTime || "");
      if (!validClockTime(openTime) || !validClockTime(closeTime) || clockMinutes(openTime) >= clockMinutes(closeTime)) { showError("Choose valid opening and closing times; closing must be later than opening."); return; }
      const maxScheduleDays = Number(data.maxScheduleDays);
      if (!Number.isInteger(maxScheduleDays) || maxScheduleDays < 1 || maxScheduleDays > 30) { showError("Maximum scheduling range must be a whole number from 1 to 30 days."); return; }
      const minimumOrder = Number(data.minimumOrder);
      const deliveryFee = data.deliveryFee === "" ? null : Number(data.deliveryFee);
      const freeDeliveryThreshold = Number(data.freeDeliveryThreshold);
      if (!Number.isFinite(minimumOrder) || minimumOrder < 0 || !Number.isFinite(freeDeliveryThreshold) || freeDeliveryThreshold < 0 || (deliveryFee !== null && (!Number.isFinite(deliveryFee) || deliveryFee < 0))) {
        showError("Minimum order, delivery fee, and free-delivery threshold must be valid non-negative amounts."); return;
      }
      const formatTime = value => {
        const [hour, minute] = value.split(":").map(Number);
        const date = new Date(2000, 0, 1, hour, minute);
        return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
      };
      const next = {
        ...settings(),
        messengerUrl,
        businessName: String(data.businessName || "").trim(),
        tagline: String(data.tagline || "").trim(),
        phone: String(data.phone || "").trim(),
        facebook,
        address: String(data.address || "").trim(),
        deliveryAreas: String(data.deliveryAreas || "").trim(),
        deliveryEnabled: form.elements.deliveryEnabled.checked,
        pickupEnabled: form.elements.pickupEnabled.checked,
        minimumOrder,
        deliveryFee,
        deliveryFeeConfirmed: Boolean(form.elements.deliveryFeeConfirmed.checked && deliveryFee !== null),
        freeDeliveryThreshold,
        gcashEnabled: false,
        codEnabled: form.elements.codEnabled.checked,
        cashOnPickupEnabled: form.elements.cashOnPickupEnabled.checked,
        codScheduledEnabled: form.elements.codScheduledEnabled.checked,
        scheduledOrdersEnabled: form.elements.scheduledOrdersEnabled.checked,
        maxScheduleDays,
        businessOpenTime: openTime,
        businessCloseTime: closeTime,
        hours: `${formatTime(openTime)}–${formatTime(closeTime)} (sample; owner confirmation required)`
      };
      if (!next.businessName) { showError("Enter the business name."); return; }
      if (next.deliveryFeeConfirmed === false && form.elements.deliveryFeeConfirmed.checked) {
        showError("Enter a delivery fee before marking it owner-confirmed."); return;
      }
      if (!write(KEYS.settings, next)) return;
      notify("Browser-local ordering settings saved. Public visitors on other devices will not receive these changes.");
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
    if ([KEYS.products, KEYS.settings, KEYS.cart].includes(event.key)) render();
  });

  render();
})();
