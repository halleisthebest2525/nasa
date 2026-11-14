// ==========================================
// PLANET SURFACES
// Every landable world uses the same surface system (moonSurface.js),
// just with different settings: size, terrain amounts and colours.
// ==========================================

export const PLANETS = {
  moon: {
    id: 'moon',
    name: 'THE MOON',
    mapTitle: 'LUNAR SURFACE MAP',
    radius: 4800,
    craters: 190,
    rocks: 1400,
    ridges: 65,
    seed: 0,           // terrain seed offset (same seed = same terrain)
    enemies: 'moon',   // Lunar Crawlers live here
    modules: 6,        // modules lying on the surface
    // Scrap per day: count range and rarity mix (percent).
    scrap: { min: 20, max: 30, common: 68, rare: 25, epic: 7 },
    landing: { fillSeconds: 1.25, zoneSize: 13 },
    chestQuest: true,  // the Mars-map chest is on the Moon
    palette: {
      space: '#111211',
      ground: '#77766f',
      patches: '#85837b',
      ridge: '#68675f',
      ridgeLight: '#a09d92',
      craterShadow: '#56554f',
      craterRim: '#aaa69a',
      craterInside: '#45443f',
      craterFloor: '#5b5952',
      rocks: ['#55544e', '#69675f', '#929087', '#45443f'],
      mapGround: '#77766e'
    }
  },

  // Mars: same texture style as the Moon, rust coloured, more craters,
  // and a little bigger.
  mars: {
    id: 'mars',
    name: 'MARS',
    mapTitle: 'MARTIAN SURFACE MAP',
    radius: 5200,
    craters: 340,
    rocks: 1700,
    ridges: 80,
    seed: 50000,
    enemies: 'mars',   // Dust Stalkers + Ares Colossus (boss)
    // A little more (and better) salvage than the Moon.
    modules: 7,
    scrap: { min: 25, max: 35, common: 55, rare: 33, epic: 12 },
    // Harder landing: faster gauge, tighter green zone.
    landing: { fillSeconds: 1.05, zoneSize: 9 },
    chestQuest: true,  // the Europa-map chest is on Mars
    palette: {
      space: '#140d0b',
      ground: '#8a5a43',
      patches: '#9c6a4f',
      ridge: '#7a4c38',
      ridgeLight: '#b88466',
      craterShadow: '#6a4232',
      craterRim: '#c08f72',
      craterInside: '#55352a',
      craterFloor: '#704636',
      rocks: ['#65402f', '#7d503b', '#a8775c', '#553427'],
      mapGround: '#8a5a43'
    }
  }
};
