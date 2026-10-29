// Centralized proposal menu; category-specific duplicates intentionally have unique IDs.
const MENU_CATEGORIES = [
  "₱99 Rice Meals",
  "Rice Meals",
  "Chicken Wings",
  "Pasta & Platters",
  "Combo Rice Meals",
  "Overload Rice Meals",
  "À La Carte",
  "Combo Meals",
  "Overload Meals",
  "Additional"
];

const CATEGORY_IMAGES = {
  "₱99 Rice Meals": "/images/products/chicken-fillet-1.jpg",
  "Rice Meals": "/images/products/chicken-fillet-1.jpg",
  "Chicken Wings": "/images/products/wings-glazed.jpg",
  "Pasta & Platters": "/images/products/carbonara-1.jpg",
  "Combo Rice Meals": "/images/products/combo-rice-1.jpg",
  "Overload Rice Meals": "/images/products/combo-rice-2.jpg",
  "À La Carte": "/images/products/dinakdakan.jpg",
  "Combo Meals": "/images/products/combo-rice-3.jpg",
  "Overload Meals": "/images/products/combo-rice-2.jpg",
  Additional: "/images/eli-icon.jpg"
};

const PRODUCT_IMAGE_GROUPS = {
  wings: ["/images/products/wings-glazed.jpg", "/images/products/wings-sauced.jpg", "/images/products/wings-assorted.jpg", "/images/products/wings-spiced.jpg"],
  chicken: ["/images/products/chicken-fillet-1.jpg", "/images/products/chicken-fillet-2.jpg", "/images/products/chicken-fillet-3.jpg"],
  katsu: ["/images/products/chicken-katsu-1.jpg", "/images/products/chicken-katsu-2.jpg", "/images/products/chicken-katsu-rice.jpg"],
  beef: ["/images/products/beef-tapa-1.jpg", "/images/products/beef-tapa-2.jpg"],
  sisig: ["/images/products/pork-sisig-1.jpg"],
  chickenSisig: ["/images/products/chicken-sisig-1.jpg", "/images/products/chicken-sisig-2.jpg"],
  chop: ["/images/products/pork-chop-rice.jpg"],
  sausage: ["/images/products/hungarian-sausage-2.jpg"],
  pepperSteak: ["/images/products/pepper-steak.jpg"],
  carbonara: ["/images/products/carbonara-1.jpg", "/images/products/carbonara-2.jpg", "/images/products/carbonara-3.jpg"],
  mac: ["/images/products/mac-cheese-1.jpg", "/images/products/mac-cheese-2.jpg", "/images/products/mac-cheese-3.jpg"],
  poppers: ["/images/products/chicken-poppers-1.jpg", "/images/products/chicken-poppers-2.jpg"],
  combo: ["/images/products/combo-rice-1.jpg", "/images/products/combo-rice-2.jpg", "/images/products/combo-rice-3.jpg"],
  rice: ["/images/products/fried-rice-1.jpg", "/images/products/fried-rice-2.jpg"],
  plainRice: ["/images/products/plain-rice.jpg"],
  egg: ["/images/products/rice-egg.jpg"],
  coke: ["/images/products/coke.jpg"],
  dinakdakan: ["/images/products/dinakdakan.jpg"],
  sauce: ["/images/products/extra-sauce.jpg"]
};

const OFFICIAL_PRODUCT_IMAGES = new Set([
  "/images/products/dinakdakan.jpg"
]);

const PRODUCT_IMAGE_ASSIGNMENTS = {
  "six-piece-wings": "/images/products/wings-glazed.jpg",
  "twelve-piece-wings": "/images/products/wings-sauced.jpg",
  "twenty-four-piece-wings": "/images/products/wings-assorted.jpg",
  "rice99-chicken-wings": "/images/products/wings-spiced.jpg",
  "platter-six-piece-wings": "/images/products/wings-glazed.jpg",
  "platter-twelve-piece-wings": "/images/products/wings-sauced.jpg",
  "platter-twenty-four-piece-wings": "/images/products/wings-assorted.jpg"
};

function chooseProductImage(group, id) {
  const options = PRODUCT_IMAGE_GROUPS[group];
  if (!options) return null;
  const hash = [...id].reduce((value, character) => {
    value ^= character.charCodeAt(0);
    return Math.imul(value, 16777619);
  }, 2166136261) >>> 0;
  const index = hash % options.length;
  return options[index];
}

function getProductImageData(id, name, category) {
  let image = PRODUCT_IMAGE_ASSIGNMENTS[id];
  if (!image) {
    if (category === "Combo Rice Meals" || category === "Combo Meals" || category === "Overload Rice Meals" || category === "Overload Meals") {
      image = chooseProductImage("combo", id);
    } else {
      const lowerName = name.toLowerCase();
      if (lowerName.includes("wings")) image = chooseProductImage("wings", id);
      else if (lowerName.includes("dinakdakan") || lowerName.includes("dakan")) image = chooseProductImage("dinakdakan", id);
      else if (lowerName.includes("sisig")) image = chooseProductImage(lowerName.includes("chicken") ? "chickenSisig" : "sisig", id);
      else if (lowerName.includes("carbonara")) image = chooseProductImage(lowerName.includes("katsu") ? "katsu" : "carbonara", id);
      else if (lowerName.includes("mac & cheese")) image = chooseProductImage("mac", id);
      else if (lowerName.includes("poppers") || lowerName.includes("fries")) image = chooseProductImage("poppers", id);
      else if (lowerName.includes("katsu")) image = chooseProductImage("katsu", id);
      else if (lowerName.includes("tapa")) image = chooseProductImage("beef", id);
      else if (lowerName.includes("hungarian")) image = chooseProductImage("sausage", id);
      else if (lowerName.includes("pork chop")) image = chooseProductImage("chop", id);
      else if (lowerName.includes("pepper steak")) image = chooseProductImage("pepperSteak", id);
      else if (lowerName.includes("coke")) image = chooseProductImage("coke", id);
      else if (lowerName.includes("sauce")) image = chooseProductImage("sauce", id);
      else if (lowerName === "egg") image = chooseProductImage("egg", id);
      else if (lowerName === "rice") image = chooseProductImage("plainRice", id);
      else if (lowerName.includes("rice")) image = chooseProductImage("rice", id);
      else if (lowerName.includes("chicken")) image = chooseProductImage("chicken", id);
      else image = CATEGORY_IMAGES[category] || "/images/eli-icon.jpg";
    }
  }
  return {
    image,
    imageSource: OFFICIAL_PRODUCT_IMAGES.has(image) ? "official" : "temporary-demo"
  };
}

const INITIAL_PRODUCTS = [
  ["six-piece-wings", "6pcs Chicken Wings", "Chicken Wings", 159],
  ["twelve-piece-wings", "12pcs Chicken Wings", "Chicken Wings", 299],
  ["twenty-four-piece-wings", "24pcs Chicken Wings", "Chicken Wings", 530],
  ["rice99-chicken-wings", "Chicken Wings", "₱99 Rice Meals", 99],
  ["rice99-chicken-fillet", "Chicken Fillet", "₱99 Rice Meals", 99],
  ["rice99-chicken-katsu", "Chicken Katsu", "₱99 Rice Meals", 99],
  ["rice99-pork-dinakdakan", "Pork Dinakdakan", "Rice Meals", 120],
  ["rice99-hungarian-sausage", "Hungarian Sausage", "Rice Meals", 110],
  ["rice99-beef-tapa", "Beef Tapa", "Rice Meals", 125],
  ["rice99-chicken-pepper-steak", "Chicken Pepper Steak", "Rice Meals", 120],
  ["rice-meal-pork-chop", "Pork Chop", "Rice Meals", 110],
  ["rice-meal-chicken-ala-king", "Chicken Ala King", "Rice Meals", 120],
  ["rice-meal-pork-sisig", "Pork Sisig", "Rice Meals", 130],
  ["rice-meal-chicken-sisig", "Chicken Sisig", "Rice Meals", 130],
  ["pasta-carbonara", "Carbonara", "Pasta & Platters", 130],
  ["pasta-carbonara-katsu", "Carbonara / Katsu", "Pasta & Platters", 175],
  ["pasta-mac-cheese", "Mac & Cheese", "Pasta & Platters", 125],
  ["pasta-mac-cheese-poppers", "Mac & Cheese / Poppers", "Pasta & Platters", 155],
  ["platter-mac-cheese", "Mac & Cheese", "Pasta & Platters", 120],
  ["platter-mac-cheese-poppers", "Mac & Cheese / Poppers", "Pasta & Platters", 160],
  ["platter-creamy-carbonara", "Creamy Carbonara", "Pasta & Platters", 135],
  ["platter-creamy-carbonara-katsu", "Creamy Carbonara / Katsu", "Pasta & Platters", 190],
  ["platter-chicken-poppers-fries", "Chicken Poppers / Fries", "Pasta & Platters", 145],
  ["platter-dinakdakan", "Dinakdakan Plater", "Pasta & Platters", 185],
  ["platter-pork-sisig", "Pork Sisig Plater", "Pasta & Platters", 180],
  ["platter-chicken-sisig", "Chicken Sisig Plater", "Pasta & Platters", 170],
  ["platter-six-piece-wings", "6pcs Chicken Wings / 2 Flavors", "Pasta & Platters", 175],
  ["platter-twelve-piece-wings", "12pcs Chicken Wings / 3 Flavors", "Pasta & Platters", 320],
  ["platter-twenty-four-piece-wings", "24pcs Chicken Wings / All Flavors", "Pasta & Platters", 559],
  ["combo-hungarian-sisig", "Hungarian / Sisig & Rice", "Combo Rice Meals", 199],
  ["combo-sisig-fillet", "Sisig / Chicken Fillet & Rice", "Combo Rice Meals", 199],
  ["combo-wing-katsu", "Chicken Wing / Katsu & Rice", "Combo Rice Meals", 199],
  ["combo-dinakdakan-pork-chop", "Dinakdakan / Pork Chop & Rice", "Combo Rice Meals", 230],
  ["combo-sisig-pork-chop", "Sisig / Pork Chop & Rice", "Combo Rice Meals", 220],
  ["combo-dinakdakan-hungarian", "Dinakdakan / Hungarian & Rice", "Combo Rice Meals", 210],
  ["combo-hungarian-ala-king", "Hungarian / Ala King & Rice", "Combo Rice Meals", 220],
  ["combo-carbonara-wings", "Carbonara / Wings", "Combo Rice Meals", 195],
  ["combo-carbonara-pork-chop", "Carbonara / Pork Chop", "Combo Rice Meals", 195],
  ["combo-mac-wings", "Mac & Cheese / Wings", "Combo Rice Meals", 195],
  ["combo-mac-katsu", "Mac & Cheese / Katsu", "Combo Rice Meals", 195],
  ["overload-rice-hungarian-dakan-tocino", "Hungarian / Dakan / Tocino", "Overload Rice Meals", 299],
  ["overload-rice-dakan-tapa-hungarian", "Dakan / Beef Tapa / Hungarian", "Overload Rice Meals", 340],
  ["overload-rice-tapa-sisig-chop", "Beef Tapa / Sisig / Pork Chop", "Overload Rice Meals", 299],
  ["overload-rice-dakan-sisig-tocino", "Dakan / Sisig / Tocino", "Overload Rice Meals", 299],
  ["overload-rice-hungarian-tapa-chop", "Hungarian / Tapa / Pork Chop", "Overload Rice Meals", 320],
  ["overload-rice-sisig-dakan-hungarian", "Sisig / Dakan / Hungarian", "Overload Rice Meals", 299],
  ["overload-rice-fillet-dakan-sisig", "Chicken Fillet / Dakan / Sisig", "Overload Rice Meals", 299],
  ["overload-rice-fillet-hungarian-tocino", "Chicken Fillet / Hungarian / Tocino", "Overload Rice Meals", 299],
  ["additional-egg", "Egg", "Additional", 15],
  ["additional-rice", "Rice", "Additional", 15],
  ["additional-coke", "Coke", "Additional", 25],
  ["additional-java-rice", "Java Rice", "Additional", 15],
  ["additional-extra-sauce", "Extra Sauce", "Additional", 20],
  ["a-la-carte-pork-dinakdakan", "Pork Dinakdakan", "À La Carte", 165],
  ["a-la-carte-chicken-sisig", "Chicken Sisig", "À La Carte", 170],
  ["a-la-carte-pork-sisig", "Pork Sisig", "À La Carte", 170],
  ["a-la-carte-chicken-pepper-steak", "Chicken Pepper Steak", "À La Carte", 175],
  ["combo-meal-cm1", "CM1 — Rice, Pork Chop & Tapa", "Combo Meals", 220],
  ["combo-meal-cm2", "CM2 — Rice, Dinakdakan & Sisig", "Combo Meals", 210],
  ["combo-meal-cm3", "CM3 — Rice, Dinakdakan & Pork Chop", "Combo Meals", 210],
  ["combo-meal-cm4", "CM4 — Rice, Chicken Sisig & Chicken Fillet", "Combo Meals", 210],
  ["overload-meal-om1", "OM1 — Rice, Hungarian, Dakan & Tapa", "Overload Meals", 330],
  ["overload-meal-om2", "OM2 — Rice, Hungarian, Pork Chop & Dakan", "Overload Meals", 320],
  ["overload-meal-om3", "OM3 — Rice, Pork Chop, Tapa & Hungarian", "Overload Meals", 330],
  ["overload-meal-om4", "OM4 — Rice, Sisig, Pork Chop & Dakan", "Overload Meals", 330]
].map(([id, name, category, price]) => ({
  id,
  name,
  category,
  price,
  ...getProductImageData(id, name, category),
  available: true
}));
