// ==========================================
// PROJECT: NASARETH - FINAL CUTSCENE · SCENE DATA
// One entry per storyboard frame (order is locked). Coordinates for effects
// are in the illustrations' logical pixel grid: 960 x 540 (images are 2x).
//
// mode:        'full'  = full-screen cinematic frame (Mode A)
//              'panel' = comic panel over the current full frame (Mode C)
// slot:        panel position 'A' (upper left) or 'B' (lower right)
// transitionIn: fadeBlack · fade · dissolve · cut · flashCut ·
//               slideLeft · slideRight · slideUp · diagonal · settle
// caption:     { text, kind: 'narration' | 'system' | 'dialogue', tone, at }
// audio:       cue names; files are optional (see assets/audio/README.txt)
// ==========================================

const C = {
  cyan: '#7fd3f5', cyanHot: '#c8f0ff', blue: '#3fa6da', amber: '#f6bd62', amberHot: '#ffe2a8',
  red: '#ff6e55', redDeep: '#d8342c', green: '#6fe0a8', white: '#eef1f5', void: '#04060b'
};

export const COLORS = C;

export const SCENES = [
  // ---------------- CHAPTER I · GENESIS REBORN ----------------
  {
    id: 'frame_01', chapter: 1, image: 'assets/images/frame_01.png', duration: 5000,
    mode: 'full', transitionIn: 'fadeBlack',
    caption: { text: 'After a journey across the solar system, the commander returned.', kind: 'narration', at: 900 },
    audio: [{ cue: 'ch1_ambient', at: 0, loop: true }],
    effects: [
      { type: 'twinkle', n: 70, rect: [0, 0, 960, 540], color: C.white },
      { type: 'glow', x: 455, y: 205, r: 150, color: C.cyan, min: 0.04, max: 0.13, period: 3600 },
      { type: 'glow', x: 160, y: 454, r: 16, color: C.cyanHot, min: 0.3, max: 0.7, period: 500 }
    ]
  },
  {
    id: 'frame_02', chapter: 1, image: 'assets/images/frame_02.png', duration: 5000,
    mode: 'panel', slot: 'A', transitionIn: 'slideLeft',
    caption: { text: 'Five lost components. One final hope.', kind: 'narration', at: 600 },
    effects: [
      { type: 'unveil', points: [[140, 370], [320, 315], [495, 260], [668, 206], [838, 152]], r: 92, start: 350, interval: 650, color: C.cyan }
    ]
  },
  {
    id: 'frame_03', chapter: 1, image: 'assets/images/frame_03.png', duration: 5000,
    mode: 'panel', slot: 'B', transitionIn: 'diagonal',
    caption: { text: 'The mission that began in tragedy had reached its final stage.', kind: 'narration', at: 500 },
    effects: [
      { type: 'sweep', color: C.amberHot, alpha: 0.13, width: 140, start: 0, dur: 4800 },
      { type: 'glow', x: 360, y: 170, r: 40, color: C.amber, min: 0.15, max: 0.35, period: 1700 },
      { type: 'glow', x: 690, y: 230, r: 40, color: C.amber, min: 0.15, max: 0.35, period: 2100 }
    ]
  },
  {
    id: 'frame_04', chapter: 1, image: 'assets/images/frame_04.png', duration: 5000,
    mode: 'full', transitionIn: 'fade',
    caption: { text: 'PROJECT: GENESIS — RESTORATION COMPLETE.', kind: 'system', tone: 'cyan', at: 2600 },
    effects: [
      { type: 'lightsUp', from: 0.78, start: 200, dur: 2400 },
      { type: 'sequence', points: [[60, 62], [180, 62], [300, 62], [420, 62], [540, 62], [660, 62], [780, 62], [900, 62]], r: 34, color: C.cyanHot, start: 200, interval: 280, alpha: 0.5 }
    ]
  },
  {
    id: 'frame_05', chapter: 1, image: 'assets/images/frame_05.png', duration: 5000,
    mode: 'panel', slot: 'A', transitionIn: 'slideUp',
    caption: { text: 'The recovered data was finally accessible.', kind: 'narration', at: 700 },
    effects: [
      { type: 'activate', rects: [[486, 96, 876, 120], [486, 160, 876, 184], [486, 224, 876, 248], [486, 288, 876, 312], [486, 352, 876, 376]], start: 300, interval: 500, color: C.green },
      { type: 'activate', rects: [[430, 398, 880, 450]], start: 3200, interval: 0, color: C.cyan },
      { type: 'scan', rect: [40, 30, 920, 470], color: C.green, period: 2200 }
    ]
  },

  // ---------------- CHAPTER II · THE HIDDEN THREAT ----------------
  {
    id: 'frame_06', chapter: 2, image: 'assets/images/frame_06.png', duration: 5000,
    mode: 'panel', slot: 'B', transitionIn: 'settle',
    caption: { text: 'An unidentified mass appeared in the recovered records.', kind: 'narration', at: 600 },
    audio: [{ cue: 'ch2_tension', at: 0, loop: true, fadeOut: ['ch1_ambient'] }],
    effects: [
      { type: 'scan', rect: [24, 20, 936, 520], color: C.cyan, period: 1600 },
      { type: 'pulse', x: 300, y: 330, r: 110, color: C.redDeep, at: 1700, dur: 900, alpha: 0.6 }
    ]
  },
  {
    id: 'frame_07', chapter: 2, image: 'assets/images/frame_07.png', duration: 5000,
    mode: 'full', transitionIn: 'cut',
    caption: { text: 'It had been there all along.', kind: 'narration', at: 1600 },
    audio: [{ cue: 'sting_reveal', at: 0 }],
    effects: [
      { type: 'twinkle', n: 40, rect: [0, 0, 960, 540], color: C.white },
      { type: 'drift', n: 26, rect: [0, 0, 960, 540], vx: -4, vy: 2, color: '#5f5862', size: 2 }
    ]
  },
  {
    id: 'frame_08', chapter: 2, image: 'assets/images/frame_08.png', duration: 5000,
    mode: 'panel', slot: 'A', transitionIn: 'diagonal',
    caption: { text: 'COLLISION COURSE CONFIRMED.', kind: 'system', tone: 'red', at: 2500 },
    effects: [
      { type: 'line', points: [[150, 104], [300, 190], [450, 280], [600, 370], [706, 424]], color: C.red, width: 3, start: 200, dur: 2100 },
      { type: 'glow', x: 720, y: 430, r: 110, color: C.redDeep, min: 0, max: 0.45, period: 800, start: 2300 }
    ]
  },
  {
    id: 'frame_09', chapter: 2, image: 'assets/images/frame_09.png', duration: 5000,
    mode: 'panel', slot: 'B', transitionIn: 'slideRight',
    caption: { text: 'Earth was still in danger.', kind: 'narration', at: 900 },
    effects: [
      { type: 'cover', rect: [40, 36, 920, 300], color: '#123a6e', alpha: 0.72, until: 700, flicker: true },
      { type: 'tint', color: C.redDeep, min: 0.0, max: 0.14, period: 1000, start: 700 }
    ]
  },
  {
    id: 'frame_10', chapter: 2, image: 'assets/images/frame_10.png', duration: 5000,
    mode: 'full', transitionIn: 'fade',
    caption: { text: 'There was only one remaining option.', kind: 'narration', at: 1100 },
    effects: [
      { type: 'glow', x: 480, y: 160, r: 260, color: C.redDeep, min: 0.04, max: 0.12, period: 2600 },
      { type: 'dim', start: 1400, dur: 3200, to: 0.45 }
    ]
  },

  // ---------------- CHAPTER III · THE FINAL DECISION ----------------
  {
    id: 'frame_11', chapter: 3, image: 'assets/images/frame_11.png', duration: 5000,
    mode: 'panel', slot: 'A', transitionIn: 'settle',
    caption: { text: 'The maneuver would destroy Genesis.', kind: 'narration', at: 3300 },
    audio: [{ cue: 'ch3_sparse', at: 0, loop: true, fadeOut: ['ch2_tension'] }],
    effects: [
      { type: 'mover', points: [[150, 410], [300, 360], [450, 300], [560, 260], [605, 245]], color: C.cyanHot, start: 300, dur: 2600, vanishColor: C.red }
    ]
  },
  {
    id: 'frame_12', chapter: 3, image: 'assets/images/frame_12.png', duration: 5000,
    mode: 'full', transitionIn: 'dissolve',
    caption: { text: 'No crew would be sent. This time, Genesis would fly alone.', kind: 'narration', at: 1000 },
    effects: [
      { type: 'glow', x: 420, y: 250, r: 120, color: C.cyan, min: 0.03, max: 0.11, period: 4200 },
      { type: 'sweep', color: C.white, alpha: 0.06, width: 60, start: 300, dur: 4600, clip: [248, 112, 712, 468] }
    ]
  },
  {
    id: 'frame_13', chapter: 3, image: 'assets/images/frame_13.png', duration: 5000,
    mode: 'panel', slot: 'B', transitionIn: 'slideUp',
    caption: { text: 'Authorize Genesis. Final interception.', kind: 'dialogue', speaker: 'COMMANDER', at: 500 },
    effects: [
      { type: 'glow', x: 490, y: 460, r: 120, color: C.amber, min: 0.05, max: 0.2, period: 900, end: 2300 },
      { type: 'switch', rect: [356, 428, 624, 492], at: 2300, color: C.blue, glow: C.cyanHot },
      { type: 'shake', start: 2300, dur: 160, amp: 1 }
    ]
  },
  {
    id: 'frame_14', chapter: 3, image: 'assets/images/frame_14.png', duration: 5000,
    mode: 'full', transitionIn: 'flashCut',
    caption: { text: 'For the final time, Genesis was ready.', kind: 'narration', at: 2800 },
    audio: [{ cue: 'engine_ignite', at: 2300 }],
    effects: [
      { type: 'engines', points: [[482, 446], [540, 446], [598, 446]], r: 30, color: C.cyanHot, start: 500, interval: 450, ignite: 2300 },
      { type: 'glow', x: 540, y: 470, r: 300, color: C.amber, min: 0.05, max: 0.18, period: 700, start: 2300 },
      { type: 'shake', start: 2300, dur: 2600, amp: 1 }
    ]
  },

  // ---------------- CHAPTER IV · THE SACRIFICE ----------------
  {
    id: 'frame_15', chapter: 4, image: 'assets/images/frame_15.png', duration: 5000,
    mode: 'full', transitionIn: 'cut',
    caption: { text: 'GENESIS — FINAL LAUNCH.', kind: 'system', tone: 'amber', at: 1200 },
    audio: [{ cue: 'launch', at: 0, fadeOut: ['ch3_sparse'] }, { cue: 'ch4_rising', at: 600, loop: true }],
    effects: [
      { type: 'engines', points: [[436, 290], [470, 290], [503, 290]], r: 26, color: C.cyanHot, start: 0, interval: 0, ignite: 0 },
      { type: 'shake', start: 0, dur: 4800, amp: 2, decay: true },
      { type: 'drift', n: 40, rect: [0, 360, 960, 540], vx: 28, vy: -6, color: '#f6bd62', size: 2 }
    ]
  },
  {
    id: 'frame_16', chapter: 4, image: 'assets/images/frame_16.png', duration: 5000,
    mode: 'panel', slot: 'A', transitionIn: 'diagonal',
    caption: null,
    effects: [
      { type: 'stream', from: [674, 214], to: [330, 470], n: 26, color: C.cyanHot, speed: 260 },
      { type: 'glow', x: 674, y: 214, r: 34, color: C.cyanHot, min: 0.35, max: 0.7, period: 260 },
      { type: 'twinkle', n: 30, rect: [380, 0, 960, 540], color: C.white }
    ]
  },
  {
    id: 'frame_17', chapter: 4, image: 'assets/images/frame_17.png', duration: 5000,
    mode: 'full', transitionIn: 'fade',
    caption: { text: 'TARGET ACQUIRED.', kind: 'system', tone: 'red', at: 1500 },
    effects: [
      { type: 'glow', x: 112, y: 478, r: 14, color: C.cyanHot, min: 0.4, max: 0.9, period: 300 },
      { type: 'drift', n: 18, rect: [0, 0, 960, 540], vx: -3, vy: 1, color: '#7a727c', size: 2 },
      { type: 'twinkle', n: 30, rect: [0, 0, 960, 540], color: C.white }
    ]
  },
  {
    id: 'frame_18', chapter: 4, image: 'assets/images/frame_18.png', duration: 5000,
    mode: 'panel', slot: 'B', transitionIn: 'slideLeft',
    caption: { text: 'FINAL COURSE LOCKED.', kind: 'system', tone: 'cyan', at: 2600 },
    effects: [
      { type: 'engines', points: [[360, 330], [480, 336], [600, 330]], r: 70, color: C.cyanHot, start: 0, interval: 0, ignite: 0, grow: 4200 },
      { type: 'shake', start: 0, dur: 5000, amp: 1 },
      { type: 'pulse', x: 830, y: 100, r: 40, color: C.cyan, at: 2400, dur: 700, alpha: 0.7, repeat: 900 }
    ]
  },
  {
    id: 'frame_19', chapter: 4, image: 'assets/images/frame_19.png', duration: 8000,
    mode: 'full', transitionIn: 'cut',
    caption: null,
    audio: [{ cue: 'silence', at: 2000, fadeOut: ['ch4_rising'] }, { cue: 'impact', at: 3400 }],
    effects: [
      // Before contact the flash is hidden, Genesis closes in, then everything holds still.
      { type: 'veil', x: 330, y: 360, r: 330, until: 3400 },
      { type: 'mover', points: [[40, 540], [180, 452], [300, 378], [322, 366]], color: C.cyanHot, start: 0, dur: 2200, trail: true, keep: 3400 },
      { type: 'flash', at: 3400, dur: 900, color: '#ffffff' },
      { type: 'shake', start: 3400, dur: 700, amp: 3, decay: true },
      { type: 'bloom', x: 330, y: 360, start: 3400, dur: 4400, r0: 60, r1: 420, color: C.cyanHot }
    ]
  },
  {
    id: 'frame_20', chapter: 4, image: 'assets/images/frame_20.png', duration: 7000,
    mode: 'full', transitionIn: 'dissolve',
    caption: null,
    effects: [
      { type: 'glow', x: 560, y: 268, r: 40, color: C.cyanHot, min: 0.1, max: 0.4, period: 3000, fadeTo: 0.15 },
      { type: 'drift', n: 22, rect: [300, 150, 900, 450], vx: 4, vy: -2, color: '#847d86', size: 1 },
      { type: 'twinkle', n: 40, rect: [0, 0, 960, 540], color: C.white }
    ]
  },

  // ---------------- CHAPTER V · HUMANITY'S SECOND CHANCE ----------------
  {
    id: 'frame_21', chapter: 5, image: 'assets/images/frame_21.png', duration: 5000,
    mode: 'full', transitionIn: 'fade',
    caption: { text: 'IMPACT THREAT ELIMINATED.', kind: 'system', tone: 'green', at: 2400 },
    audio: [{ cue: 'ch5_hope', at: 600, loop: true }],
    effects: [
      { type: 'cover', rect: [40, 36, 920, 300], color: '#9a1a1c', alpha: 0.55, until: 1300, fade: 900 },
      { type: 'line', points: [[424, 100], [460, 124], [520, 136], [575, 120]], color: C.green, width: 2, start: 900, dur: 1600 }
    ]
  },
  {
    id: 'frame_22', chapter: 5, image: 'assets/images/frame_22.png', duration: 5000,
    mode: 'full', transitionIn: 'fade',
    caption: { text: 'Genesis gave humanity its first hope.', kind: 'narration', at: 1000 },
    effects: [
      { type: 'glow', x: 520, y: 300, r: 260, color: C.cyan, min: 0.03, max: 0.08, period: 5000 },
      { type: 'twinkle', n: 26, rect: [120, 40, 840, 430], color: C.white }
    ]
  },
  {
    id: 'frame_23', chapter: 5, image: 'assets/images/frame_23.png', duration: 9000,
    mode: 'full', transitionIn: 'dissolve',
    caption: { text: 'Nasareth gave it a second chance.', kind: 'narration', at: 900, until: 4600 },
    title: { lines: ['PROJECT: NASARETH', 'MISSION COMPLETE'], at: 5000 },
    effects: [
      { type: 'bloom', x: 380, y: 394, start: 0, dur: 9000, r0: 120, r1: 300, color: C.amberHot, peak: 0.22, rise: true },
      { type: 'twinkle', n: 30, rect: [0, 0, 960, 200], color: C.white }
    ]
  }
];

// Panel slots inside the 16:9 art box (percent). Panels keep the 16:9 ratio,
// so every panel shows its whole illustration.
export const SLOTS = {
  A: { left: 3, top: 4, width: 57, rotate: -1.1 },
  B: { left: 40, top: 39, width: 57, rotate: 0.9 }
};

export const TOTAL_DURATION = SCENES.reduce((sum, scene) => sum + scene.duration, 0);
