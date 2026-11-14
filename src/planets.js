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
    enemies: true,     // Lunar Crawlers live here
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
    enemies: false,
    chestQuest: false,
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
