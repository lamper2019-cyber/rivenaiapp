/**
 * The RIVEN meal bank — the dishes the day-plan brain picks from.
 *
 * This lives in code (not the DB) on purpose: Sean edits dishes in a PR, the
 * picker stays a pure function, and there's nothing to seed on deploy. Every
 * dish is food our members actually cook and order — soul food, Southern,
 * Caribbean, and the real weeknight staples of a busy Black woman 35-55 —
 * portioned for body recomposition: protein forward, nothing moralized,
 * nothing "clean-eating" coded. Macros follow the house calorie philosophy:
 * estimate on the generous side so the plan never quietly under-reports.
 *
 * Tags are how the picker (and future taste-learning) reasons about fit:
 *   soul-food / caribbean / southern — cultural lane
 *   air-fryer / 15-min / no-cook / one-pot — effort level
 *   leftover-friendly — cook once, eat twice
 *   restaurant — orderable when she's out
 *   high-protein — ≥30g (dinner/lunch) or ≥20g (breakfast)
 */

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type MealIdea = {
  /** Stable slug — DayPick.mealId points here. Never recycle an id. */
  id: string;
  slot: MealSlot;
  name: string;
  /** Portion hint, shown small under the name. */
  detail: string;
  calories: number;
  protein: number;
  tags: string[];
};

export const MEAL_BANK: MealIdea[] = [
  // ── Breakfast ──────────────────────────────────────────────────────────
  { id: "bf-yogurt-berries", slot: "breakfast", name: "Greek yogurt + berries", detail: "1 cup yogurt, handful of berries, drizzle of honey", calories: 280, protein: 20, tags: ["no-cook", "15-min"] },
  { id: "bf-cheese-grits-eggs", slot: "breakfast", name: "Cheese grits + scrambled eggs", detail: "Small bowl of grits, 2 eggs", calories: 430, protein: 22, tags: ["soul-food", "southern"] },
  { id: "bf-salmon-croquette-grits", slot: "breakfast", name: "Salmon croquette + grits", detail: "1 croquette, small grits", calories: 470, protein: 26, tags: ["soul-food", "southern", "high-protein"] },
  { id: "bf-turkey-sausage-wrap", slot: "breakfast", name: "Egg + turkey sausage wrap", detail: "1 tortilla, 2 eggs, 2 links", calories: 390, protein: 28, tags: ["15-min", "high-protein"] },
  { id: "bf-oatmeal-pb-banana", slot: "breakfast", name: "Oatmeal + peanut butter + banana", detail: "1 cup oats, 1 tbsp PB, half banana", calories: 420, protein: 14, tags: ["15-min", "one-pot"] },
  { id: "bf-veggie-omelet", slot: "breakfast", name: "Veggie omelet + toast", detail: "3 eggs, peppers + onions, 1 slice toast", calories: 410, protein: 24, tags: ["15-min", "high-protein"] },
  { id: "bf-protein-smoothie", slot: "breakfast", name: "Protein smoothie", detail: "Protein powder, banana, peanut butter, almond milk", calories: 360, protein: 30, tags: ["no-cook", "15-min", "high-protein"] },
  { id: "bf-cottage-pineapple", slot: "breakfast", name: "Cottage cheese + pineapple", detail: "1 cup cottage cheese, half cup pineapple", calories: 250, protein: 24, tags: ["no-cook", "15-min", "high-protein"] },
  { id: "bf-turkey-bacon-muffin", slot: "breakfast", name: "Turkey bacon, egg + cheese muffin", detail: "English muffin, 1 egg, 2 strips, 1 slice cheese", calories: 390, protein: 24, tags: ["15-min", "high-protein"] },
  { id: "bf-french-toast-sausage", slot: "breakfast", name: "French toast + turkey sausage", detail: "2 slices, light syrup, 2 links", calories: 490, protein: 22, tags: ["southern"] },
  { id: "bf-boiled-eggs-plate", slot: "breakfast", name: "Boiled eggs + apple + cheese", detail: "2 eggs, 1 apple, 1 cheese stick", calories: 330, protein: 19, tags: ["no-cook", "15-min"] },
  { id: "bf-potato-egg-bowl", slot: "breakfast", name: "Potato, egg + cheese bowl", detail: "Breakfast potatoes, 2 eggs, sprinkle of cheese", calories: 460, protein: 22, tags: ["one-pot", "leftover-friendly"] },
  { id: "bf-avocado-toast-egg", slot: "breakfast", name: "Avocado toast + fried egg", detail: "1 slice, half avocado, 1 egg", calories: 380, protein: 15, tags: ["15-min"] },
  { id: "bf-protein-pancakes", slot: "breakfast", name: "Protein pancakes", detail: "3 small, sugar-free syrup", calories: 400, protein: 28, tags: ["high-protein"] },
  { id: "bf-shrimp-grits-light", slot: "breakfast", name: "Shrimp + grits, light butter", detail: "Small bowl, 6-8 shrimp", calories: 480, protein: 28, tags: ["soul-food", "southern", "high-protein"] },
  { id: "bf-salmon-bagel", slot: "breakfast", name: "Smoked salmon half-bagel", detail: "Half bagel, 2 oz salmon, light cream cheese", calories: 350, protein: 20, tags: ["no-cook", "15-min", "high-protein"] },
  { id: "bf-overnight-oats", slot: "breakfast", name: "Overnight oats + protein", detail: "Made last night — grab and go", calories: 380, protein: 25, tags: ["no-cook", "high-protein", "leftover-friendly"] },
  { id: "bf-chicken-sausage-eggs", slot: "breakfast", name: "Chicken sausage + eggs + avocado", detail: "2 links, 2 eggs, half avocado", calories: 440, protein: 30, tags: ["15-min", "high-protein"] },
  { id: "bf-fruit-nut-egg-plate", slot: "breakfast", name: "Fruit, almonds + boiled egg plate", detail: "Mixed fruit, small handful almonds, 1 egg", calories: 330, protein: 13, tags: ["no-cook", "15-min"] },
  { id: "bf-mini-chicken-waffle", slot: "breakfast", name: "Chicken + waffle, the smart way", detail: "1 waffle, 1 air-fryer tender, light syrup", calories: 470, protein: 26, tags: ["soul-food", "southern", "air-fryer"] },
  { id: "bf-eggwhite-spinach", slot: "breakfast", name: "Egg-white scramble + spinach", detail: "4 whites, spinach, sprinkle of cheese", calories: 270, protein: 26, tags: ["15-min", "high-protein"] },
  { id: "bf-pb-banana-toast", slot: "breakfast", name: "Peanut butter banana toast", detail: "2 slices, 1 tbsp PB, half banana", calories: 350, protein: 12, tags: ["no-cook", "15-min"] },

  // ── Lunch ──────────────────────────────────────────────────────────────
  { id: "ln-leftover-chicken-rice", slot: "lunch", name: "Leftover chicken + rice bowl", detail: "Last night's chicken over a cup of rice", calories: 520, protein: 38, tags: ["leftover-friendly", "15-min", "high-protein"] },
  { id: "ln-tuna-salad-crackers", slot: "lunch", name: "Tuna salad + crackers", detail: "1 can tuna, light mayo, 8 crackers", calories: 380, protein: 30, tags: ["no-cook", "15-min", "high-protein"] },
  { id: "ln-chicken-salad-croissant", slot: "lunch", name: "Chicken salad on a croissant", detail: "Half-cup chicken salad, 1 croissant", calories: 520, protein: 26, tags: ["southern", "no-cook"] },
  { id: "ln-turkey-cheese-sandwich", slot: "lunch", name: "Turkey + cheese sandwich + fruit", detail: "Wheat bread, 4 oz turkey, 1 apple", calories: 440, protein: 30, tags: ["no-cook", "15-min", "high-protein"] },
  { id: "ln-leftover-spaghetti", slot: "lunch", name: "Leftover turkey spaghetti", detail: "One real bowl, reheated", calories: 520, protein: 28, tags: ["leftover-friendly", "15-min"] },
  { id: "ln-grilled-chicken-wrap", slot: "lunch", name: "Grilled chicken wrap", detail: "6 oz chicken, lettuce, ranch on the side", calories: 480, protein: 40, tags: ["restaurant", "high-protein"] },
  { id: "ln-shrimp-caesar", slot: "lunch", name: "Shrimp Caesar salad", detail: "8 shrimp, dressing on the side", calories: 420, protein: 30, tags: ["restaurant", "15-min", "high-protein"] },
  { id: "ln-red-beans-rice-cup", slot: "lunch", name: "Red beans + rice, lunch portion", detail: "One bowl with turkey sausage", calories: 480, protein: 24, tags: ["soul-food", "southern", "leftover-friendly", "one-pot"] },
  { id: "ln-chicken-noodle-soup", slot: "lunch", name: "Chicken noodle soup + roll", detail: "Big bowl, 1 roll", calories: 400, protein: 24, tags: ["one-pot", "15-min"] },
  { id: "ln-blackened-fish-sandwich", slot: "lunch", name: "Blackened fish sandwich", detail: "Grilled not fried, hold heavy sauce", calories: 470, protein: 32, tags: ["restaurant", "high-protein"] },
  { id: "ln-chipotle-bowl", slot: "lunch", name: "Burrito bowl, double chicken", detail: "Rice, beans, double chicken, salsa — skip the queso", calories: 620, protein: 50, tags: ["restaurant", "high-protein"] },
  { id: "ln-leftover-baked-chicken", slot: "lunch", name: "Leftover baked chicken plate", detail: "Thigh + whatever sides made it to today", calories: 480, protein: 36, tags: ["leftover-friendly", "soul-food", "15-min", "high-protein"] },
  { id: "ln-egg-salad-toast", slot: "lunch", name: "Egg salad on toast", detail: "3 eggs, light mayo, 2 slices", calories: 420, protein: 22, tags: ["no-cook", "15-min"] },
  { id: "ln-chicken-quesadilla", slot: "lunch", name: "Chicken quesadilla, half order", detail: "Half quesadilla + side salad", calories: 540, protein: 32, tags: ["restaurant", "high-protein"] },
  { id: "ln-greens-cornbread-lunch", slot: "lunch", name: "Greens + smoked turkey + cornbread", detail: "Bowl of greens, one square of cornbread", calories: 440, protein: 26, tags: ["soul-food", "southern", "leftover-friendly"] },
  { id: "ln-cobb-salad", slot: "lunch", name: "Cobb salad", detail: "Chicken, egg, bacon bits, dressing on the side", calories: 520, protein: 38, tags: ["restaurant", "high-protein"] },
  { id: "ln-rotisserie-chicken-veg", slot: "lunch", name: "Rotisserie chicken + microwave veggies", detail: "Quarter bird, steam-bag green beans", calories: 450, protein: 42, tags: ["no-cook", "15-min", "high-protein"] },
  { id: "ln-pita-hummus-chicken", slot: "lunch", name: "Chicken pita + hummus", detail: "1 pita, 5 oz chicken, 2 tbsp hummus", calories: 480, protein: 36, tags: ["15-min", "high-protein"] },
  { id: "ln-leftover-taco-bowl", slot: "lunch", name: "Leftover taco meat bowl", detail: "Taco meat over rice, cheese, salsa", calories: 520, protein: 32, tags: ["leftover-friendly", "15-min", "high-protein"] },
  { id: "ln-bbq-chicken-sandwich", slot: "lunch", name: "Pulled BBQ chicken sandwich", detail: "On a bun + small slaw", calories: 510, protein: 34, tags: ["southern", "leftover-friendly", "high-protein"] },
  { id: "ln-veggie-plate-protein", slot: "lunch", name: "Sunday-style veggie plate + protein", detail: "Two sides + a baked thigh", calories: 470, protein: 32, tags: ["soul-food", "southern", "high-protein"] },
  { id: "ln-turkey-burger-no-fries", slot: "lunch", name: "Turkey burger, hold the fries", detail: "Single patty, side salad instead", calories: 520, protein: 34, tags: ["restaurant", "high-protein"] },
  { id: "ln-chicken-tortilla-soup", slot: "lunch", name: "Chicken tortilla soup", detail: "Big bowl, easy on the strips", calories: 420, protein: 28, tags: ["restaurant", "one-pot"] },
  { id: "ln-salmon-cakes-salad", slot: "lunch", name: "Salmon cakes + side salad", detail: "2 small cakes, vinaigrette", calories: 460, protein: 30, tags: ["soul-food", "southern", "high-protein"] },
  { id: "ln-protein-box", slot: "lunch", name: "Protein box", detail: "Boiled eggs, cheese, grapes, nuts — gas station legal", calories: 430, protein: 24, tags: ["no-cook", "15-min"] },
  { id: "ln-subway-turkey-footlong-half", slot: "lunch", name: "6-inch turkey sub + chips swap", detail: "Double meat, skip chips for apple slices", calories: 450, protein: 32, tags: ["restaurant", "15-min", "high-protein"] },

  // ── Dinner ─────────────────────────────────────────────────────────────
  { id: "din-airfryer-wings-potatoes", slot: "dinner", name: "Air-fryer wings + potatoes", detail: "6-8 wings, roasted potatoes — no fryer grease", calories: 620, protein: 48, tags: ["soul-food", "air-fryer", "high-protein"] },
  { id: "din-baked-chicken-thighs", slot: "dinner", name: "Baked chicken thighs + green beans + sweet potato", detail: "2 thighs, real seasoning", calories: 580, protein: 44, tags: ["soul-food", "southern", "leftover-friendly", "high-protein"] },
  { id: "din-salmon-jasmine-rice", slot: "dinner", name: "Salmon + jasmine rice", detail: "6 oz fillet, 1 cup rice, broccoli", calories: 560, protein: 42, tags: ["15-min", "high-protein"] },
  { id: "din-smothered-chops-light", slot: "dinner", name: "Smothered pork chop, light gravy", detail: "1 chop, rice, cabbage on the side", calories: 640, protein: 42, tags: ["soul-food", "southern", "high-protein"] },
  { id: "din-turkey-chili", slot: "dinner", name: "Turkey chili", detail: "Big bowl, sprinkle of cheese — freezes great", calories: 520, protein: 40, tags: ["one-pot", "leftover-friendly", "high-protein"] },
  { id: "din-shrimp-tacos", slot: "dinner", name: "Shrimp tacos", detail: "3 tacos, slaw, lime crema light", calories: 540, protein: 34, tags: ["15-min", "high-protein"] },
  { id: "din-jerk-chicken-cabbage", slot: "dinner", name: "Jerk chicken + steamed cabbage", detail: "Leg quarter, rice + peas small scoop", calories: 600, protein: 46, tags: ["caribbean", "leftover-friendly", "high-protein"] },
  { id: "din-oxtail-small-rice-peas", slot: "dinner", name: "Oxtails + rice and peas, honest portion", detail: "3-4 pieces, one scoop rice", calories: 700, protein: 42, tags: ["caribbean", "soul-food", "high-protein"] },
  { id: "din-red-beans-rice-sausage", slot: "dinner", name: "Red beans + rice + turkey sausage", detail: "Monday classic, one real bowl", calories: 560, protein: 28, tags: ["soul-food", "southern", "one-pot", "leftover-friendly"] },
  { id: "din-turkey-spaghetti", slot: "dinner", name: "Turkey spaghetti", detail: "One plate, garlic bread optional — count it if you eat it", calories: 580, protein: 34, tags: ["one-pot", "leftover-friendly", "high-protein"] },
  { id: "din-baked-catfish-collards", slot: "dinner", name: "Baked catfish + collards + cornbread", detail: "1 fillet, 1 square cornbread", calories: 590, protein: 38, tags: ["soul-food", "southern", "high-protein"] },
  { id: "din-chicken-broccoli-stirfry", slot: "dinner", name: "Chicken + broccoli stir-fry", detail: "Over a cup of rice, sauce light", calories: 540, protein: 40, tags: ["15-min", "one-pot", "high-protein"] },
  { id: "din-stuffed-bell-peppers", slot: "dinner", name: "Stuffed bell peppers", detail: "2 halves — turkey, rice, cheese", calories: 520, protein: 34, tags: ["leftover-friendly", "high-protein"] },
  { id: "din-gumbo-bowl", slot: "dinner", name: "Gumbo, one honest bowl", detail: "Chicken + sausage + shrimp, scoop of rice", calories: 620, protein: 36, tags: ["soul-food", "southern", "one-pot", "leftover-friendly", "high-protein"] },
  { id: "din-pot-roast-veg", slot: "dinner", name: "Pot roast + carrots + potatoes", detail: "Slow cooker did the work", calories: 600, protein: 44, tags: ["one-pot", "leftover-friendly", "high-protein"] },
  { id: "din-taco-night", slot: "dinner", name: "Taco night", detail: "3 tacos, ground turkey, the works", calories: 560, protein: 32, tags: ["15-min", "high-protein"] },
  { id: "din-turkey-meatloaf-mash", slot: "dinner", name: "Turkey meatloaf + mashed potatoes", detail: "1 thick slice, real mash, green beans", calories: 580, protein: 38, tags: ["southern", "leftover-friendly", "high-protein"] },
  { id: "din-baked-turkey-wings-greens", slot: "dinner", name: "Baked turkey wings + greens", detail: "1 wing, big scoop of greens", calories: 620, protein: 48, tags: ["soul-food", "southern", "high-protein"] },
  { id: "din-curry-chicken-rice", slot: "dinner", name: "Curry chicken + white rice", detail: "Dark meat, one scoop rice", calories: 600, protein: 40, tags: ["caribbean", "one-pot", "leftover-friendly", "high-protein"] },
  { id: "din-airfryer-fish-fry", slot: "dinner", name: "Air-fryer fish fry", detail: "2 cornmeal fillets, hot sauce, slaw", calories: 540, protein: 40, tags: ["soul-food", "southern", "air-fryer", "high-protein"] },
  { id: "din-chicken-fajita-bowl", slot: "dinner", name: "Chicken fajita bowl", detail: "Peppers + onions, rice, no tortilla needed", calories: 540, protein: 42, tags: ["15-min", "one-pot", "high-protein"] },
  { id: "din-pork-tenderloin-roast-veg", slot: "dinner", name: "Pork tenderloin + roasted vegetables", detail: "5 oz sliced, sheet-pan veg", calories: 500, protein: 42, tags: ["leftover-friendly", "high-protein"] },
  { id: "din-lemon-pepper-chicken", slot: "dinner", name: "Lemon pepper chicken + rice + asparagus", detail: "2 thighs or 1 breast", calories: 550, protein: 44, tags: ["air-fryer", "15-min", "high-protein"] },
  { id: "din-shrimp-grits-dinner", slot: "dinner", name: "Shrimp + grits for dinner", detail: "Full bowl, turkey bacon crumble", calories: 580, protein: 36, tags: ["soul-food", "southern", "high-protein"] },
  { id: "din-rotisserie-plate", slot: "dinner", name: "Rotisserie chicken plate", detail: "Quarter bird + two microwave sides — zero cooking", calories: 520, protein: 46, tags: ["no-cook", "15-min", "high-protein"] },
  { id: "din-baked-ziti-turkey", slot: "dinner", name: "Baked ziti with turkey", detail: "One square, side salad", calories: 620, protein: 34, tags: ["leftover-friendly", "high-protein"] },
  { id: "din-fried-cabbage-sausage", slot: "dinner", name: "Fried cabbage + turkey sausage", detail: "Big skillet bowl, cornbread square optional", calories: 480, protein: 26, tags: ["soul-food", "southern", "one-pot", "15-min"] },
  { id: "din-steak-baked-potato", slot: "dinner", name: "Steak + baked potato", detail: "6 oz sirloin, potato with light butter", calories: 640, protein: 46, tags: ["restaurant", "high-protein"] },
  { id: "din-chicken-alfredo-half", slot: "dinner", name: "Chicken alfredo, half portion", detail: "Restaurant half-plate or box half for tomorrow", calories: 650, protein: 38, tags: ["restaurant", "leftover-friendly", "high-protein"] },
  { id: "din-neckbones-rice", slot: "dinner", name: "Neckbones + rice + green beans", detail: "Sunday-style, one plate", calories: 640, protein: 38, tags: ["soul-food", "southern", "high-protein"] },
  { id: "din-chicken-veggie-sheetpan", slot: "dinner", name: "Sheet-pan chicken + vegetables", detail: "Everything on one pan, oven does it", calories: 520, protein: 42, tags: ["one-pot", "leftover-friendly", "high-protein"] },
  { id: "din-wingstop-smart-order", slot: "dinner", name: "Wing spot, the smart order", detail: "8 plain or lemon pepper, skip fries, get veggie sticks", calories: 640, protein: 50, tags: ["restaurant", "high-protein"] },

  // ── Snack ──────────────────────────────────────────────────────────────
  { id: "sn-popcorn", slot: "snack", name: "Popcorn", detail: "Air-popped bag, light butter", calories: 160, protein: 4, tags: ["no-cook", "15-min"] },
  { id: "sn-protein-shake", slot: "snack", name: "Protein shake", detail: "1 scoop in water or almond milk", calories: 160, protein: 25, tags: ["no-cook", "15-min", "high-protein"] },
  { id: "sn-greek-yogurt-cup", slot: "snack", name: "Greek yogurt cup", detail: "Single serve, any flavor", calories: 150, protein: 14, tags: ["no-cook", "15-min", "high-protein"] },
  { id: "sn-boiled-egg", slot: "snack", name: "Boiled eggs", detail: "2 eggs, salt + pepper", calories: 140, protein: 12, tags: ["no-cook", "15-min", "high-protein"] },
  { id: "sn-cheese-crackers", slot: "snack", name: "Cheese + crackers", detail: "1 cheese stick, 6 crackers", calories: 200, protein: 9, tags: ["no-cook", "15-min"] },
  { id: "sn-apple-pb", slot: "snack", name: "Apple + peanut butter", detail: "1 apple, 1 tbsp PB", calories: 200, protein: 5, tags: ["no-cook", "15-min"] },
  { id: "sn-tuna-packet", slot: "snack", name: "Tuna packet", detail: "Flavored pouch, eat it anywhere", calories: 110, protein: 16, tags: ["no-cook", "15-min", "high-protein"] },
  { id: "sn-beef-jerky", slot: "snack", name: "Beef jerky", detail: "1 oz bag", calories: 120, protein: 12, tags: ["no-cook", "15-min", "high-protein"] },
  { id: "sn-hummus-veggies", slot: "snack", name: "Hummus + veggies", detail: "2 tbsp hummus, carrots + celery", calories: 150, protein: 5, tags: ["no-cook", "15-min"] },
  { id: "sn-cottage-cheese-cup", slot: "snack", name: "Cottage cheese cup", detail: "Single serve + black pepper or fruit", calories: 130, protein: 14, tags: ["no-cook", "15-min", "high-protein"] },
  { id: "sn-almonds-handful", slot: "snack", name: "Roasted almonds", detail: "One small handful — count it, don't pour it", calories: 170, protein: 6, tags: ["no-cook", "15-min"] },
  { id: "sn-dark-chocolate-almonds", slot: "snack", name: "Dark chocolate + almonds", detail: "2 squares, 8 almonds — the civilized dessert", calories: 190, protein: 5, tags: ["no-cook", "15-min"] },
  { id: "sn-trail-mix-portion", slot: "snack", name: "Trail mix, measured", detail: "Quarter cup in a bowl, not from the bag", calories: 180, protein: 6, tags: ["no-cook", "15-min"] },
  { id: "sn-frozen-yogurt-bar", slot: "snack", name: "Frozen yogurt bar", detail: "1 bar from the box", calories: 100, protein: 4, tags: ["no-cook", "15-min"] },
  { id: "sn-string-cheese-grapes", slot: "snack", name: "String cheese + grapes", detail: "1 stick, small bunch", calories: 160, protein: 8, tags: ["no-cook", "15-min"] },
  { id: "sn-rice-cake-pb", slot: "snack", name: "Rice cakes + peanut butter", detail: "2 cakes, thin spread", calories: 180, protein: 6, tags: ["no-cook", "15-min"] },
  { id: "sn-deli-turkey-rollups", slot: "snack", name: "Turkey roll-ups", detail: "4 slices turkey, rolled with cheese", calories: 160, protein: 18, tags: ["no-cook", "15-min", "high-protein"] },
  { id: "sn-protein-bar", slot: "snack", name: "Protein bar", detail: "One from the stash", calories: 210, protein: 20, tags: ["no-cook", "15-min", "high-protein"] },
  { id: "sn-edamame-cup", slot: "snack", name: "Edamame", detail: "1 cup, sea salt, microwave bag", calories: 150, protein: 14, tags: ["15-min", "high-protein"] },
  { id: "sn-pickle-cheese-plate", slot: "snack", name: "Pickles + cheese cubes", detail: "The fridge-door plate", calories: 140, protein: 8, tags: ["no-cook", "15-min"] },
];

/** Look up one meal by id. Returns null for retired/unknown ids so a stale
 *  DayPick row never crashes a render. */
export function getMeal(id: string): MealIdea | null {
  return MEAL_BANK.find((m) => m.id === id) ?? null;
}

/** All meals for a slot — the picker's candidate pool. */
export function mealsForSlot(slot: MealSlot): MealIdea[] {
  return MEAL_BANK.filter((m) => m.slot === slot);
}
