const UI_TEXT_JA = {
  ui_label_inventory: "道具袋",
  ui_label_inventory_window_title: "Inventory",
  ui_label_inventory_empty: "空きスロット",
  ui_label_inventory_placeholder: "アイテムを選択してください。",
  ui_label_inventory_effect_placeholder: "効果: -",
  ui_label_use: "USE",
  ui_label_drop: "DROP",
  ui_hint_slot_empty: "このスロットは空です。",
  ui_hint_item_used: "アイテムを使用しました。",
  ui_hint_item_not_usable: "装備アイテムはここでは使用できません。",
  ui_hint_item_not_found: "アイテムが見つかりません。",
  ui_hint_item_dropped: "アイテムを捨てました。",
  ui_hint_item_drop_failed: "近くにアイテムを置ける場所がありません。",
  ui_hint_item_none_selected: "選択中のアイテムがありません。",
  ui_hint_inventory_full: "道具袋がいっぱいで拾えない。",
  ui_hint_pickup_herb: "薬草を拾った。",
  item_name_potion_small: "小回復ポーション",
  item_desc_potion_small: "携帯しやすい回復薬。少量のHPを回復する。",
  item_effect_potion_small: "効果: HPを少し回復",
  item_name_bomb_small: "小型ボム",
  item_desc_bomb_small: "足元に投げて使う簡易爆弾。",
  item_effect_bomb_small: "効果: 爆発ダメージ",
  item_name_antidote: "解毒薬",
  item_desc_antidote: "毒状態を緩和する薬。",
  item_effect_antidote: "効果: 毒を解除",
  item_name_scroll_fire: "火炎スクロール",
  item_desc_scroll_fire: "封印された火の術式が書かれている。",
  item_effect_scroll_fire: "効果: 前方に火球",
  item_name_food_ration: "保存食",
  item_desc_food_ration: "最低限の栄養を補給できる。",
  item_effect_food_ration: "効果: HPを微回復",
  item_name_throwing_knife: "投擲ナイフ",
  item_desc_throwing_knife: "扱いやすい小型ナイフ。",
  item_effect_throwing_knife: "効果: 単体遠隔ダメージ",
  item_name_short_sword: "ショートソード",
  item_desc_short_sword: "バランスの取れた片手剣。",
  item_effect_short_sword: "効果: 装備品",
  item_name_leather_boots: "革のブーツ",
  item_desc_leather_boots: "軽量で歩きやすいブーツ。",
  item_effect_leather_boots: "効果: 装備品",
  name_item_herb_01: "薬草",
  desc_item_herb_01: "香りの強い薬草。傷をやわらげる。",
  item_effect_herb_01: "効果: HPを50回復",
};

const ITEM_ICON_LABELS = {
  potion_red: "HP",
  bomb: "BM",
  antidote: "AD",
  scroll: "SC",
  food: "FD",
  knife: "KN",
  sword: "SW",
  boots: "BT",
  herb: "HB",
  empty: "--",
  buff: "BF",
  debuff: "DB",
};

function toInt(value, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.floor(Number(value));
}

export function tJa(key, fallback = "") {
  if (typeof key !== "string" || key.length <= 0) {
    return fallback;
  }

  return UI_TEXT_JA[key] ?? key;
}

export function formatGold(value) {
  const gold = Math.max(0, toInt(value, 0));
  return `$${gold.toLocaleString("en-US")}`;
}

export function getIconLabelForKey(iconKey) {
  if (typeof iconKey !== "string" || iconKey.length <= 0) {
    return ITEM_ICON_LABELS.empty;
  }

  return ITEM_ICON_LABELS[iconKey] ?? iconKey.slice(0, 2).toUpperCase();
}
