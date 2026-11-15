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
    modules: 8,        // modules lying on the surface
    // Scrap per day: count range and rarity mix (percent).
    // Scrap keeps spawning: "start" lie around on arrival, then a new one
    // every "interval" seconds until "maxActive" exist. Later planets pay more.
    scrap: { start: 18, maxActive: 30, interval: [5, 11], minPlayerDistance: 320, valueMultiplier: 1, common: 68, rare: 25, epic: 7 },
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
    modules: 10,
    scrap: { start: 20, maxActive: 34, interval: [5, 10], minPlayerDistance: 320, valueMultiplier: 1.3, common: 55, rare: 33, epic: 12 },
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
  },

  // Europa (moon of Jupiter): a bright, cracked ice world past the
  // Asteroid Belt. Few craters, many ridges (ice cracks).
  europa: {
    id: 'europa',
    name: 'EUROPA',
    mapTitle: 'EUROPA ICE MAP',
    radius: 5600,
    craters: 120,
    rocks: 1500,
    ridges: 170,
    seed: 100000,
    enemies: 'europa', // Frost Skitters + Cryolith Leviathan (boss)
    modules: 12,
    scrap: { start: 22, maxActive: 36, interval: [4, 9], minPlayerDistance: 320, valueMultiplier: 1.7, common: 45, rare: 38, epic: 17 },
    landing: { fillSeconds: 0.95, zoneSize: 8 },
    chestQuest: true,  // the Titan-map chest is on Europa
    palette: {
      space: '#0a0f14',
      ground: '#9fb4c2',
      patches: '#b4c7d2',
      ridge: '#7d93a5',
      ridgeLight: '#dbe8ee',
      craterShadow: '#6f8496',
      craterRim: '#e2edf2',
      craterInside: '#5b6f80',
      craterFloor: '#7f95a6',
      rocks: ['#6c8192', '#8499a9', '#c3d3dc', '#56697a'],
      mapGround: '#9fb4c2'
    }
  },

  // Titan (moon of Saturn): hazy orange dunes.
  titan: {
    id: 'titan',
    name: 'TITAN',
    mapTitle: 'TITAN SURFACE MAP',
    radius: 6000,
    craters: 220,
    rocks: 1900,
    ridges: 120,
    seed: 150000,
    enemies: 'titan',  // Methane Crawlers + Nitrogen Wraith (boss)
    modules: 14,
    scrap: { start: 24, maxActive: 40, interval: [4, 8], minPlayerDistance: 320, valueMultiplier: 2.2, common: 38, rare: 40, epic: 22 },
    landing: { fillSeconds: 0.88, zoneSize: 7 },
    chestQuest: true,  // the Uranus-map chest is on Titan
    palette: {
      space: '#120e07',
      ground: '#a8853f',
      patches: '#b9964d',
      ridge: '#8c6c30',
      ridgeLight: '#d8b872',
      craterShadow: '#7a5d29',
      craterRim: '#dcc084',
      craterInside: '#5f481f',
      craterFloor: '#806228',
      rocks: ['#75592a', '#927238', '#c9a862', '#5a431d'],
      mapGround: '#a8853f'
    }
  },

  // Umbriel (moon of Uranus): the darkest moon. Cold charcoal ground with
  // a faint blue tint and a great many craters. No monsters yet.
  umbriel: {
    id: 'umbriel',
    name: 'UMBRIEL',
    mapTitle: 'UMBRIEL SURFACE MAP',
    radius: 6400,
    craters: 420,
    rocks: 2100,
    ridges: 90,
    seed: 200000,
    modules: 16,
    scrap: { start: 26, maxActive: 44, interval: [3, 7], minPlayerDistance: 320, valueMultiplier: 2.8, common: 30, rare: 42, epic: 28 },
    landing: { fillSeconds: 0.82, zoneSize: 6.5 },
    chestQuest: true,  // the last chest (Neptune star map, for a later update)
    palette: {
      space: '#07090c',
      ground: '#4a5158',
      patches: '#565e66',
      ridge: '#3b4147',
      ridgeLight: '#7c8892',
      craterShadow: '#32373c',
      craterRim: '#8a96a0',
      craterInside: '#262a2e',
      craterFloor: '#3a4046',
      rocks: ['#33383d', '#454c53', '#76828c', '#272b2f'],
      mapGround: '#4a5158'
    }
  }
};
