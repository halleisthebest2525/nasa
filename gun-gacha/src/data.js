// All game content lives here: rarities, wear levels, and every skin in both cases.
// Pictures come from the sheets in art-source/ (cut out by tools/crop_sheets.py into img/).

// weight = drop chance in % (adds up to 100). gunClick / attCps = base bonus for that tier.
export const RARITIES = [
  { id: 'common',    name: 'Common',    color: '#9aa3ad', weight: 75,  gunClick: 1,   attCps: 0.2 },
  { id: 'uncommon',  name: 'Uncommon',  color: '#4cd964', weight: 19,  gunClick: 4,   attCps: 0.8 },
  { id: 'rare',      name: 'Rare',      color: '#3d8bff', weight: 5,   gunClick: 15,  attCps: 3 },
  { id: 'mythic',    name: 'Mythic',    color: '#b05cff', weight: 0.8, gunClick: 60,  attCps: 12 },
  { id: 'legendary', name: 'Legendary', color: '#f5c242', weight: 0.2, gunClick: 400, attCps: 80 },
  // Secret: 1 in 10,000 Weapon Case opens. hidden = not shown in the odds or case contents,
  // and pity can never give it. Only guns exist at this tier.
  { id: 'secret',    name: 'Secret',    color: '#ff4fd8', weight: 0.01, gunClick: 3000, attCps: 0, hidden: true },
];

// Pity: if you go this many opens of one case without a Mythic (or better) / Legendary,
// the next open is guaranteed to be one.
export const PITY = { mythic: 60, legendary: 250 };

// Wear changes the bonus a little: Factory New is best, Battle-Scarred is worst.
export const WEARS = [
  { id: 'fn', name: 'Factory New',    weight: 10, mult: 1.25 },
  { id: 'mw', name: 'Minimal Wear',   weight: 25, mult: 1.1 },
  { id: 'ft', name: 'Field-Tested',   weight: 35, mult: 1.0 },
  { id: 'ww', name: 'Well-Worn',      weight: 15, mult: 0.9 },
  { id: 'bs', name: 'Battle-Scarred', weight: 15, mult: 0.75 },
];

// Display name of each picture shape.
const GUN_NAMES = { rifle: 'M4A4', pistol: 'Desert Eagle', sniper: 'AWP', shotgun: 'Nova' };
const ATT_NAMES = { reddot: 'Red Dot', scope: 'Scope', suppressor: 'Suppressor', grip: 'Grip' };

// Skin name for each theme and rarity. Every entry must have a picture in img/.
const GUN_SKINS = {
  factory:   { common: 'Factory Black' },
  jungle:    { uncommon: 'Jungle Camo' },
  storm:     { rare: 'Blue Lightning', mythic: 'Void Storm',     legendary: 'Seraph' },
  cyberpunk: { rare: 'Neon Circuit',   mythic: 'Overclock',      legendary: 'Singularity' },
  inferno:   { rare: 'Ember Crack',    mythic: 'Hellfire',       legendary: 'Phoenix Wrath' },
  frozen:    { rare: 'Frostbite',      mythic: 'Glacial Shard',  legendary: 'Absolute Zero' },
  egyptian:  { rare: 'Sand Scribe',    mythic: "Pharaoh's Gold", legendary: 'Eye of Ra' },
  dragon:    { rare: 'Red Scale',      mythic: "Dragon's Blood", legendary: 'Elder Wyrm' },
  military:  { rare: 'Urban Digital',  mythic: 'Blackout Ops',   legendary: 'Gold Commander' },
  holo:      { rare: 'Prism Line',     mythic: 'Hologram',       legendary: 'Spectral Core' },
  anime:     { rare: 'Petal Drift',    mythic: 'Twilight Sakura', legendary: 'Hanami Spirit' },
  plant:     { rare: 'Overgrowth',     mythic: 'Blossom Vine',   legendary: 'Golden Grove' },
  water:     { rare: 'Riptide',        mythic: 'Deep Tide',      legendary: 'Tsunami' },
  fire:      { rare: 'Wildfire',       mythic: 'Blaze Runner',   legendary: 'Solar Flare' },
  // Secret tier (sheet-secret.png)
  leviathan:    { secret: 'Leviathan' },
  ifrit:        { secret: 'Ifrit' },
  worldtree:    { secret: 'World Tree' },
  archangel:    { secret: 'Archangel' },
  eventhorizon: { secret: 'Event Horizon' },
};
const ATT_SKINS = {
  factory: { common: 'Factory Black' },
  jungle:  { uncommon: 'Jungle Camo' },
  storm:   { rare: 'Blue Lightning', mythic: 'Void Storm', legendary: 'Seraph' },
};

// Which shapes exist for each rarity (matches the pictures).
const GUN_SHAPES = { common: ['rifle', 'pistol', 'shotgun'], uncommon: ['rifle', 'pistol', 'shotgun'], other: ['rifle', 'pistol', 'sniper'] };
const ATT_SHAPES = { common: ['reddot', 'suppressor', 'grip'], uncommon: ['reddot', 'suppressor', 'grip'], other: ['scope', 'suppressor', 'grip'] };

function buildSkins(kind, table, shapes, names, folder) {
  const skins = [];
  for (const [theme, byRarity] of Object.entries(table)) {
    for (const [rarity, name] of Object.entries(byRarity)) {
      for (const shape of shapes[rarity] ?? shapes.other) {
        skins.push({
          id: `${kind}:${rarity}-${theme}-${shape}`,
          kind, base: names[shape], name, rarity, theme, shape,
          image: `img/${folder}/${rarity}-${theme}-${shape}.webp`,
        });
      }
    }
  }
  return skins;
}

// kind 'gun' adds money per click, kind 'att' adds auto clicks per second.
export const SKINS = [
  ...buildSkins('gun', GUN_SKINS, GUN_SHAPES, GUN_NAMES, 'guns'),
  ...buildSkins('att', ATT_SKINS, ATT_SHAPES, ATT_NAMES, 'attachments'),
];

export const SKIN_BY_ID = Object.fromEntries(SKINS.map(skin => [skin.id, skin]));
export const RARITY_BY_ID = Object.fromEntries(RARITIES.map(r => [r.id, r]));
export const WEAR_BY_ID = Object.fromEntries(WEARS.map(w => [w.id, w]));

// The plain gun you start with before your first roll. It is not in any case.
export const STARTER_GUN = { ...SKIN_BY_ID['gun:common-factory-pistol'], id: 'gun:starter', name: 'Starter' };

// Case prices: price of open number n = base * growth^n (gets more expensive every open).
export const CASES = {
  gun: { id: 'gun', name: 'Weapon Case',     blurb: 'Gun skins: more $ per click',          base: 50,  growth: 1.08, showcase: 'gun:legendary-dragon-rifle' },
  att: { id: 'att', name: 'Attachment Case', blurb: 'Attachments: more auto clicks per sec', base: 150, growth: 1.08, showcase: 'att:legendary-storm-scope' },
};
