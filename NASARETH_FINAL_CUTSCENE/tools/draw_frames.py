"""
PROJECT: NASARETH - final cutscene illustrations.

Draws all 23 frames as pixel art on ONE shared logical grid (960 x 540),
with one palette and one ordered-dither pattern, then exports every frame
at exactly 2x (1920 x 1080) with nearest-neighbour scaling. Every frame is
its own composition; nothing is cropped from a storyboard.

The spacecraft and the five Legendary modules are the game's own sprites
(img/ in the repository), so they match the game exactly:
  returning shuttle = Rocket_Common_Closed.png  (weathered)
  GENESIS           = Rocket_Legendary_Closed.png (white-gray, blue stripes,
                      three engines, dark canopy)
Sprites are only ever scaled DOWN from their native size, never up.

Run from the repository root:   py -3 NASARETH_FINAL_CUTSCENE/tools/draw_frames.py
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

W, H = 960, 540
SCALE = 2
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'NASARETH_FINAL_CUTSCENE', 'assets', 'images')
IMG = os.path.join(ROOT, 'img')


def hx(c):
    c = c.lstrip('#')
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


# ---------------------------------------------------------------- palette
VOID = ['#04060b', '#070b14', '#0b111f', '#111a2e', '#18243e']
STEEL = ['#1b212c', '#2b3340', '#3f4857', '#5b6576', '#828c9c', '#aeb6c2', '#d6dbe2', '#eef1f5']
CYAN = ['#0d2a44', '#174a72', '#2475a8', '#3fa6da', '#7fd3f5', '#c8f0ff']
AMBER = ['#3a1f0c', '#6e3814', '#b05e1c', '#e08d32', '#f6bd62', '#ffe2a8']
RED = ['#2a0709', '#5a0e12', '#9a1a1c', '#d8342c', '#ff6e55', '#ffb19c']
GREEN = ['#08261c', '#0f4a33', '#1b7a52', '#36b07a', '#6fe0a8', '#c2ffe0']
ROCK = ['#09080b', '#141217', '#1e1b21', '#2a262d', '#38333b', '#4a444d', '#5f5862', '#7a727c']
OCEAN = ['#0b2347', '#123a6e', '#1c5694', '#2a74b8', '#4592d4']
LAND = ['#1f3524', '#2d4c2c', '#40693a', '#5b8547', '#82a05a']
DESERT = ['#5a4a2c', '#7f6a40', '#a68f5a', '#c8b07a']
CLOUD = ['#6d7f94', '#9fb0c2', '#cbd6e2', '#eef3f8']
NIGHT = ['#03060c', '#060c18', '#0a1426']

B4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.float32) / 16.0
BAYER = np.tile(B4, (H // 4 + 1, W // 4 + 1))[:H, :W]
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)


class Canvas:
    def __init__(self, color=VOID[0]):
        self.a = np.zeros((H, W, 3), dtype=np.float32)
        self.a[:] = hx(color)

    # mask helpers ------------------------------------------------------
    def paint(self, mask, color):
        self.a[mask] = hx(color)

    def ramp(self, mask, t, colors):
        """Fill mask with a dithered ramp: t (0..1) picks along colors."""
        n = len(colors)
        idx = np.floor(np.clip(t, 0, 1) * (n - 1) + BAYER).astype(int)
        idx = np.clip(idx, 0, n - 1)
        pal = np.stack([hx(c) for c in colors])
        self.a[mask] = pal[idx[mask]]

    def add(self, mask_or_none, amount, color, steps=6):
        """Additive light, quantised with the dither pattern (no smooth blur)."""
        amount = np.clip(amount, 0, 1)
        peak = max(float(amount.max()), 1e-3)
        q = np.floor(amount / peak * steps + BAYER) / steps * peak
        add = q[..., None] * hx(color)[None, None, :]
        if mask_or_none is not None:
            add = add * mask_or_none[..., None]
        self.a = np.minimum(255, self.a + add)

    def mul(self, mask, factor):
        self.a[mask] *= factor

    def tint(self, amount, color, mask=None):
        """Blend towards a colour (dithered)."""
        q = np.floor(np.clip(amount, 0, 1) * 4 + BAYER) / 4
        q = q[..., None]
        target = hx(color)[None, None, :]
        if mask is not None:
            q = q * mask[..., None]
        self.a = self.a * (1 - q) + target * q

    def image(self):
        return Image.fromarray(np.clip(self.a, 0, 255).astype(np.uint8), 'RGB')

    def from_image(self, im):
        self.a = np.asarray(im.convert('RGB'), dtype=np.float32).copy()

    def draw(self, fn):
        im = self.image()
        fn(ImageDraw.Draw(im))
        self.from_image(im)

    def save(self, name):
        im = self.image().resize((W * SCALE, H * SCALE), Image.NEAREST)
        im.save(os.path.join(OUT, name), optimize=True)


def circle(cx, cy, r):
    return (XX - cx) ** 2 + (YY - cy) ** 2 <= r * r


def ellipse(cx, cy, rx, ry):
    return ((XX - cx) / rx) ** 2 + ((YY - cy) / ry) ** 2 <= 1


def rect(x0, y0, x1, y1):
    return (XX >= x0) & (XX < x1) & (YY >= y0) & (YY < y1)


def poly(points):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in points], fill=255)
    return np.asarray(m) > 0


def line_mask(points, width=1):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).line([tuple(p) for p in points], fill=255, width=width)
    return np.asarray(m) > 0


def dotted(points, width=2, on=6, off=5):
    """A dashed polyline mask."""
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    acc = 0.0
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        seg = math.hypot(x1 - x0, y1 - y0)
        steps = max(1, int(seg))
        for i in range(steps):
            if (acc % (on + off)) < on:
                x = x0 + (x1 - x0) * i / steps
                y = y0 + (y1 - y0) * i / steps
                d.rectangle([x - width / 2, y - width / 2, x - width / 2 + max(0, width - 1), y - width / 2 + max(0, width - 1)], fill=255)
            acc += 1
    return np.asarray(m) > 0


def edge(mask, dx, dy):
    """Pixels of mask whose neighbour at (dx, dy) is outside: rim light."""
    sh = np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
    return mask & ~sh


def outline(mask):
    grow = mask.copy()
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        grow |= np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
    return grow & ~mask


def vnoise(h, w, cell, seed, octaves=4):
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), dtype=np.float32)
    amp, tot = 1.0, 0.0
    for _ in range(octaves):
        gh, gw = int(h / cell) + 3, int(w / cell) + 3
        g = rng.random((gh, gw)).astype(np.float32)
        ys = np.arange(h) / cell
        xs = np.arange(w) / cell
        y0 = ys.astype(int)
        x0 = xs.astype(int)
        fy = ys - y0
        fx = xs - x0
        fy = fy * fy * (3 - 2 * fy)
        fx = fx * fx * (3 - 2 * fx)
        a = g[y0][:, x0]
        b = g[y0][:, x0 + 1]
        c = g[y0 + 1][:, x0]
        d = g[y0 + 1][:, x0 + 1]
        top = a + (b - a) * fx[None, :]
        bot = c + (d - c) * fx[None, :]
        out += amp * (top + (bot - top) * fy[:, None])
        tot += amp
        amp *= 0.5
        cell = max(1.0, cell / 2)
    return out / tot


# ---------------------------------------------------------------- scenery
def stars(cv, seed, count=900, mask=None, warm=0.1, bright=1.0):
    rng = np.random.default_rng(seed)
    allowed = np.ones((H, W), bool) if mask is None else mask
    for _ in range(count):
        x = int(rng.integers(0, W))
        y = int(rng.integers(0, H))
        if not allowed[y, x]:
            continue
        r = rng.random()
        col = CYAN[5] if rng.random() < 0.25 else (AMBER[5] if rng.random() < warm else STEEL[7])
        level = (0.25 + 0.75 * rng.random() ** 3) * bright
        c = hx(VOID[1]) * (1 - level) + hx(col) * level
        cv.a[y, x] = c
        if r > 0.985 and 2 < x < W - 3 and 2 < y < H - 3:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                cv.a[y + dy, x + dx] = hx(VOID[2]) * 0.4 + c * 0.6


def space_bg(cv, seed, top=VOID[0], bottom=VOID[2], nebula=None):
    t = YY / H
    cv.ramp(np.ones((H, W), bool), t, [top, VOID[1], bottom])
    if nebula:
        n = vnoise(H, W, 160, seed + 7)
        cv.add(None, np.clip((n - 0.55) * 1.6, 0, 1) * 0.35, nebula, steps=4)
    stars(cv, seed)


def glow(cv, cx, cy, r, color, peak=1.0, steps=6, power=2.0):
    d = np.sqrt((XX - cx) ** 2 + (YY - cy) ** 2)
    t = np.clip(1 - d / r, 0, 1) ** power * peak
    cv.add(None, t, color, max(steps, 8))


def trail(cv, p0, p1, w0, w1, color, peak=1.0, seed=1, grain=0.5):
    """A tapering, broken-up exhaust or dust trail from p0 (wide end w0) to p1."""
    (x0, y0), (x1, y1) = p0, p1
    vx, vy = x1 - x0, y1 - y0
    L2 = vx * vx + vy * vy
    t = np.clip(((XX - x0) * vx + (YY - y0) * vy) / L2, 0, 1)
    px, py = x0 + vx * t, y0 + vy * t
    d = np.sqrt((XX - px) ** 2 + (YY - py) ** 2)
    width = w0 + (w1 - w0) * t
    n = vnoise(H, W, 10, seed, 3)
    amt = np.clip(1 - d / width, 0, 1) ** 1.3 * (1 - t) ** 0.8 * peak * (1 - grain + grain * n * 1.6)
    cv.add(None, amt, color, 8)


def earth(cv, cx, cy, r, seed=3, light=(-0.75, -0.35, 0.55), rot=0.0, night_lights=True, dim=1.0, atmo=True):
    L = np.array(light, dtype=np.float32)
    L /= np.linalg.norm(L)
    m = circle(cx, cy, r)
    nx = (XX - cx) / r
    ny = (YY - cy) / r
    s2 = np.clip(nx * nx + ny * ny, 0, 1)
    nz = np.sqrt(1 - s2)
    lam = nx * L[0] + ny * L[1] + nz * L[2]
    tex = vnoise(256, 512, 36, seed, 5)
    tex2 = vnoise(256, 512, 20, seed + 11, 4)
    cl = vnoise(256, 512, 26, seed + 23, 5)
    u = ((np.arctan2(nx, nz) / math.pi * 0.5 + 0.5 + rot) % 1.0 * 511).astype(int)
    v = ((np.arcsin(np.clip(ny, -1, 1)) / math.pi + 0.5) * 255).astype(int)
    land = tex[v, u] > 0.55
    desert = land & (tex2[v, u] > 0.6) & (np.abs(ny) < 0.5)
    cloud = cl[v, u]
    polar = np.abs(ny) > 0.86
    day = np.clip(lam * 1.1 + 0.15, 0, 1) * dim
    cv.ramp(m & ~land, day, OCEAN)
    cv.ramp(m & land & ~desert, day, LAND)
    cv.ramp(m & desert, day, DESERT)
    cv.ramp(m & polar, day, CLOUD)
    cmask = m & (cloud > 0.6)
    cv.ramp(cmask, day * np.clip((cloud - 0.6) * 4, 0.3, 1), CLOUD)
    night = m & (lam < 0.02)
    cv.ramp(night, np.clip(-lam * 3, 0, 1)[...], [NIGHT[2], NIGHT[1], NIGHT[0]])
    if night_lights:
        rng = np.random.default_rng(seed + 5)
        city = night & land & (rng.random((H, W)) < 0.05) & (lam < -0.05)
        cv.paint(city, AMBER[4])
    # limb brightening + atmosphere
    limb = m & (s2 > 0.86) & (lam > -0.2)
    cv.add(limb, np.clip((s2 - 0.86) * 7, 0, 1) * np.clip(lam + 0.3, 0, 1) * 0.8 * dim, CYAN[4], 4)
    if atmo:
        d = np.sqrt((XX - cx) ** 2 + (YY - cy) ** 2)
        ring = (d > r) & (d < r * 1.06 + 3)
        rl = np.clip((nx * L[0] + ny * L[1]) / np.maximum(np.sqrt(s2), 1e-3) * 0.8 + 0.45, 0, 1)
        fall = np.clip(1 - (d - r) / (r * 0.06 + 3), 0, 1)
        cv.add(ring, fall * rl * 0.9 * dim, CYAN[3], 5)
    return m


def rock_body(cv, cx, cy, R, seed, light=(-0.55, -0.55, 0.62), craters=40, lumps=0.13,
              palette=ROCK, rim_color=AMBER[3], rim=True, extra_light=None):
    """An irregular asteroid with craters, ridges, fractures and a rim light."""
    rng = np.random.default_rng(seed)
    L = np.array(light, dtype=np.float32)
    L /= np.linalg.norm(L)
    dx = XX - cx
    dy = YY - cy
    ang = np.arctan2(dy, dx)
    dist = np.sqrt(dx * dx + dy * dy)
    rad = np.full_like(dist, 1.0)
    for k in range(2, 9):
        rad += rng.uniform(-lumps, lumps) / (k ** 0.7) * np.sin(k * ang + rng.uniform(0, 6.28))
    rad *= R
    m = dist < rad
    s = np.clip(dist / np.maximum(rad, 1), 0, 1)
    nz = np.sqrt(np.clip(1 - s * s, 0, 1))
    nx = np.where(dist > 0, dx / np.maximum(dist, 1e-3) * s, 0)
    ny = np.where(dist > 0, dy / np.maximum(dist, 1e-3) * s, 0)
    lam = nx * L[0] + ny * L[1] + nz * L[2]
    size = int(max(8, R / 2))
    bump = vnoise(H, W, max(4, R / 7), seed + 1, 5)
    lam = lam + (bump - 0.5) * 0.55
    # craters
    for _ in range(craters):
        a = rng.uniform(0, 6.28)
        rr = R * 0.8 * math.sqrt(rng.random())
        ccx = cx + math.cos(a) * rr
        ccy = cy + math.sin(a) * rr
        cr = R * rng.uniform(0.03, 0.16)
        vx = (XX - ccx) / cr
        vy = (YY - ccy) / cr
        vd = np.sqrt(vx * vx + vy * vy)
        inside = m & (vd < 1)
        rimm = m & (vd >= 1) & (vd < 1.22)
        dotL = vx * L[0] + vy * L[1]
        lam = np.where(inside, lam * 0.55 - 0.12 - dotL * 0.45, lam)
        lam = np.where(rimm, lam + dotL * 0.35 + 0.05, lam)
    t = np.clip(lam * 0.55 + 0.42, 0, 1)
    cv.ramp(m, t, palette)
    # fractures: random walks of the darkest colour
    fr = Image.new('L', (W, H), 0)
    fd = ImageDraw.Draw(fr)
    for _ in range(int(6 + R / 25)):
        a = rng.uniform(0, 6.28)
        rr = R * 0.7 * math.sqrt(rng.random())
        x, y = cx + math.cos(a) * rr, cy + math.sin(a) * rr
        heading = rng.uniform(0, 6.28)
        pts = [(x, y)]
        for _ in range(int(4 + R / 30)):
            heading += rng.uniform(-0.7, 0.7)
            x += math.cos(heading) * R * 0.06
            y += math.sin(heading) * R * 0.06
            pts.append((x, y))
        fd.line(pts, fill=255, width=1 if R < 200 else 2)
    frac = (np.asarray(fr) > 0) & m
    cv.paint(frac, palette[0])
    cv.paint(edge(frac, 1, 1) & m, palette[min(3, len(palette) - 1)])
    if rim:
        # rim light on the lit edge, dark outline elsewhere
        lit_edge = edge(m, int(round(-L[0] * 2)) or 1, int(round(-L[1] * 2)) or 1)
        cv.paint(lit_edge & (lam > 0.2), rim_color)
    cv.paint(outline(m) & (nx * L[0] + ny * L[1] < 0), palette[0])
    if extra_light is not None:
        ex, ey, er, ecol, epk = extra_light
        dd = np.sqrt((XX - ex) ** 2 + (YY - ey) ** 2)
        cv.add(m, np.clip(1 - dd / er, 0, 1) ** 1.6 * epk, ecol, 6)
    return m


def fragments(cv, seed, n, area, rmin=1.5, rmax=7, light=(-0.55, -0.55, 0.62), avoid=None, rim_color=AMBER[3]):
    rng = np.random.default_rng(seed)
    x0, y0, x1, y1 = area
    for i in range(n):
        x = rng.uniform(x0, x1)
        y = rng.uniform(y0, y1)
        if avoid is not None and avoid[int(np.clip(y, 0, H - 1)), int(np.clip(x, 0, W - 1))]:
            continue
        r = rmin + (rmax - rmin) * rng.random() ** 3
        if r < 2.2:
            cv.a[int(y) % H, int(x) % W] = hx(ROCK[4 + int(rng.integers(0, 3))])
            continue
        rock_body(cv, x, y, r, int(seed * 100 + i), light=light, craters=int(r / 3), lumps=0.2,
                  rim_color=rim_color)


# ---------------------------------------------------------------- sprites
_sprite_cache = {}


def sprite(name, height, rotate=0.0, tint=None, tint_amt=0.0, dark=1.0):
    key = (name, height, rotate, tint, tint_amt, dark)
    if key in _sprite_cache:
        return _sprite_cache[key]
    im = Image.open(os.path.join(IMG, name)).convert('RGBA')
    im = im.crop(im.getbbox())
    if height < im.height:
        w = max(1, round(im.width * height / im.height))
        im = im.resize((w, height), Image.LANCZOS)
    if rotate:
        im = im.rotate(rotate, resample=Image.NEAREST, expand=True)
    arr = np.asarray(im).astype(np.float32).copy()
    alpha = arr[..., 3] > 110
    rgb = arr[..., :3] * dark
    if tint:
        rgb = rgb * (1 - tint_amt) + hx(tint) * tint_amt
    out = (rgb, alpha)
    _sprite_cache[key] = out
    return out


def paste(cv, spr, x, y, anchor='center'):
    rgb, alpha = spr
    h, w = alpha.shape
    if anchor == 'center':
        x0, y0 = int(round(x - w / 2)), int(round(y - h / 2))
    elif anchor == 'bottom':
        x0, y0 = int(round(x - w / 2)), int(round(y - h))
    else:
        x0, y0 = int(x), int(y)
    sx0, sy0 = max(0, -x0), max(0, -y0)
    dx0, dy0 = max(0, x0), max(0, y0)
    dx1, dy1 = min(W, x0 + w), min(H, y0 + h)
    if dx1 <= dx0 or dy1 <= dy0:
        return np.zeros((H, W), bool)
    region = alpha[sy0:sy0 + dy1 - dy0, sx0:sx0 + dx1 - dx0]
    cv.a[dy0:dy1, dx0:dx1][region] = rgb[sy0:sy0 + dy1 - dy0, sx0:sx0 + dx1 - dx0][region]
    m = np.zeros((H, W), bool)
    m[dy0:dy1, dx0:dx1] = region
    return m


def sprite_box(spr, x, y, anchor='center'):
    rgb, alpha = spr
    h, w = alpha.shape
    if anchor == 'bottom':
        return x - w / 2, y - h, x + w / 2, y
    return x - w / 2, y - h / 2, x + w / 2, y + h / 2


def nozzles(name, height):
    """Centres of the three engine nozzles at the bottom of a ship sprite (sprite space)."""
    rgb, alpha = sprite(name, height)
    h, w = alpha.shape
    row = int(h * 0.94)   # the three nozzles are separate here (native sprite: row 405 of 431)
    cols = np.where(alpha[row])[0]
    groups = []
    for c in cols:
        if groups and c - groups[-1][-1] <= 1:
            groups[-1].append(c)
        else:
            groups.append([c])
    groups = sorted(groups, key=len, reverse=True)[:3]
    return sorted([(sum(g) / len(g), row) for g in groups]), (w, h)


# ---------------------------------------------------------------- people
def commander_rear(cv, x, feet, h, rim=CYAN[4], rim_dx=-1, rim2=None, base=STEEL[1], dark=STEEL[0]):
    u = h / 100.0
    top = feet - h
    parts = []
    parts.append(circle(x, top + 11 * u, 11.5 * u))                                 # helmet
    parts.append(poly([(x - 18 * u, top + 24 * u), (x + 18 * u, top + 24 * u), (x + 14 * u, top + 60 * u), (x - 14 * u, top + 60 * u)]))
    parts.append(poly([(x - 18 * u, top + 24 * u), (x - 23 * u, top + 30 * u), (x - 22 * u, top + 62 * u), (x - 16 * u, top + 63 * u), (x - 14 * u, top + 34 * u)]))
    parts.append(poly([(x + 18 * u, top + 24 * u), (x + 23 * u, top + 30 * u), (x + 22 * u, top + 62 * u), (x + 16 * u, top + 63 * u), (x + 14 * u, top + 34 * u)]))
    parts.append(rect(x - 13 * u, top + 58 * u, x - 1.5 * u, feet - 4 * u))
    parts.append(rect(x + 1.5 * u, top + 58 * u, x + 13 * u, feet - 4 * u))
    parts.append(rect(x - 15 * u, feet - 6 * u, x - 0.5 * u, feet))
    parts.append(rect(x + 0.5 * u, feet - 6 * u, x + 15 * u, feet))
    body = np.zeros((H, W), bool)
    for p in parts:
        body |= p
    pack = rect(x - 13 * u, top + 22 * u, x + 13 * u, top + 52 * u)
    cv.ramp(body, (YY - top) / h * 0.6, [base, dark, VOID[0]])
    cv.ramp(pack, (YY - top) / h * 0.8, [STEEL[2], STEEL[1], dark])
    cv.paint(edge(pack, 0, 1) | edge(pack, 0, -1), VOID[0])
    # helmet ring and pack details
    cv.paint(rect(x - 11 * u, top + 21 * u, x + 11 * u, top + 22.5 * u), STEEL[3])
    cv.paint(rect(x - 6 * u, top + 30 * u, x + 6 * u, top + 33 * u), VOID[0])
    cv.paint(rect(x + 6 * u, top + 40 * u, x + 9 * u, top + 42 * u), CYAN[4])
    cv.paint(rect(x - 1 * u, top + 58 * u, x + 1 * u, feet - 4 * u), VOID[0])
    full = body | pack
    k = max(1, int(round(u)))
    cv.paint(edge(full, -rim_dx * k, 0) | edge(full, 0, k), rim)
    if rim2:
        cv.paint(edge(full, rim_dx * k, 0), rim2)
    cv.paint(outline(full), VOID[0])
    return full


def operator_rear(cv, x, y, s, standing=False, rim=None, body=VOID[2]):
    """A seated (or standing) operator seen from behind. y = shoulder line."""
    head = circle(x, y - 9 * s, 6.5 * s)
    shoulders = ellipse(x, y + 5 * s, 15 * s, 9 * s)
    torso = rect(x - 12 * s, y + 3 * s, x + 12 * s, y + (34 if standing else 20) * s)
    m = head | shoulders | torso
    if standing:
        m |= rect(x - 10 * s, y + 34 * s, x - 1 * s, y + 66 * s) | rect(x + 1 * s, y + 34 * s, x + 10 * s, y + 66 * s)
    cv.paint(m, body)
    cv.paint(rect(x - 6.5 * s, y - 13 * s, x + 6.5 * s, y - 11.5 * s), VOID[1])  # headset band
    if rim:
        cv.paint(edge(m, 0, 1) | edge(m, 1, 0), rim)
    return m


# ---------------------------------------------------------------- interiors
def hangar(cv, seed, floor_y=420, warm=0.0, lights=True, vanish=(480, 300)):
    vx, vy = vanish
    # back wall
    wall = YY < floor_y
    cv.ramp(wall, YY / floor_y, [VOID[1], VOID[2], VOID[3], STEEL[0]])
    for i, x in enumerate(range(-10, W, 64)):
        cv.paint(rect(x, 40, x + 2, floor_y), VOID[1])
        cv.paint(rect(x + 2, 40, x + 3, floor_y), STEEL[1])
        for y in range(70 + (i % 3) * 18, floor_y - 20, 56):
            cv.paint(rect(x + 10, y, x + 54, y + 1), VOID[2])
            if (i + y) % 5 == 0:
                cv.paint(rect(x + 44, y + 6, x + 50, y + 8), CYAN[2] if warm < 0.5 else AMBER[2])
    # ceiling beams and trusses
    cv.ramp(YY < 40, YY / 40, [VOID[0], VOID[1]])
    cv.paint(rect(0, 34, W, 42), STEEL[0])
    cv.paint(rect(0, 34, W, 35), STEEL[2])
    for x in range(0, W, 24):
        cv.paint(line_mask([(x, 42), (x + 12, 58), (x + 24, 42)], 1), STEEL[1])
    cv.paint(rect(0, 58, W, 61), STEEL[0])
    if lights:
        for x in range(40, W, 120):
            cv.paint(rect(x, 61, x + 40, 64), CYAN[5] if warm < 0.5 else AMBER[5])
            glow(cv, x + 20, 66, 70, CYAN[2] if warm < 0.5 else AMBER[2], 0.35, 4)
    # floor with perspective plates
    fl = YY >= floor_y
    cv.ramp(fl, (YY - floor_y) / (H - floor_y), [STEEL[0], STEEL[1], STEEL[2]])
    cv.paint(rect(0, floor_y, W, floor_y + 2), STEEL[3])
    pts = []
    for k in range(-14, 15):
        bx = vx + k * 90
        pts.append(line_mask([(vx + k * 22, floor_y), (bx * 1.0 + (bx - vx) * 1.2, H)], 1) & fl)
    lm = np.zeros((H, W), bool)
    for p in pts:
        lm |= p
    yv = floor_y
    gap = 6
    while yv < H:
        lm |= rect(0, yv, W, yv + 1) & fl
        gap *= 1.35
        yv += gap
    cv.paint(lm, STEEL[0])
    if warm > 0:
        cv.tint(warm * 0.35, AMBER[2])


def scaffold(cv, x0, x1, y0, y1, color=STEEL[2], dark=STEEL[0], step=48):
    m = np.zeros((H, W), bool)
    for x in (x0, x1):
        m |= rect(x - 2, y0, x + 2, y1)
    y = y1
    while y > y0:
        m |= rect(x0, y - 2, x1, y)
        m |= line_mask([(x0, y), (x1, y - step)], 1)
        y -= step
    cv.paint(m, color)
    cv.paint(edge(m, 1, 1), dark)
    return m


def screen(cv, x0, y0, x1, y1, bg=CYAN[0], bezel=STEEL[1], glow_c=None):
    cv.paint(rect(x0 - 4, y0 - 4, x1 + 4, y1 + 4), bezel)
    cv.paint(rect(x0 - 4, y0 - 4, x1 + 4, y0 - 3), STEEL[3])
    cv.paint(rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1), VOID[0])
    sm = rect(x0, y0, x1, y1)
    cv.ramp(sm, (YY - y0) / max(1, (y1 - y0)), [bg, VOID[1]])
    return sm


def scanlines(cv, sm, amount=0.82):
    rows = (YY.astype(int) % 2 == 0) & sm
    cv.a[rows] *= amount


def data_rows(cv, seed, x0, y0, x1, y1, colors, row=6, density=0.8):
    rng = np.random.default_rng(seed)
    y = y0
    while y + 3 < y1:
        x = x0
        while x < x1 - 6:
            w = int(rng.integers(4, 26))
            if rng.random() < density:
                cv.paint(rect(x, y, min(x + w, x1), y + 3), colors[int(rng.integers(0, len(colors)))])
            x += w + int(rng.integers(3, 8))
        y += row


def grid(cv, sm, x0, y0, step, color):
    m = sm & ((((XX - x0) % step) < 1) | (((YY - y0) % step) < 1))
    cv.paint(m, color)


def bracket(cv, x0, y0, x1, y1, color, L=12, w=2):
    m = (rect(x0, y0, x0 + L, y0 + w) | rect(x0, y0, x0 + w, y0 + L) |
         rect(x1 - L, y0, x1, y0 + w) | rect(x1 - w, y0, x1, y0 + L) |
         rect(x0, y1 - w, x0 + L, y1) | rect(x0, y1 - L, x0 + w, y1) |
         rect(x1 - L, y1 - w, x1, y1) | rect(x1 - w, y1 - L, x1, y1))
    cv.paint(m, color)


def ring(cv, cx, cy, r, color, w=2):
    d = np.sqrt((XX - cx) ** 2 + (YY - cy) ** 2)
    cv.paint((d >= r - w / 2) & (d < r + w / 2), color)


def mission_control(cv, seed, alert=True):
    """Shared room for frames 09 and 21 (same layout, different state)."""
    main = RED if alert else GREEN
    cv.ramp(np.ones((H, W), bool), YY / H, [VOID[0], VOID[1], VOID[2]])
    # ceiling strips
    for x in range(30, W, 150):
        cv.paint(rect(x, 14, x + 90, 17), (main[3] if alert else CYAN[4]))
    # monitor wall
    cv.paint(rect(40, 36, 920, 300), VOID[0])
    cols = [(56, 196), (212, 352), (368, 592), (608, 748), (764, 904)]
    screens = []
    for ci, (a, b) in enumerate(cols):
        if ci == 2:
            continue
        for (y0, y1) in ((52, 132), (146, 216), (230, 290)):
            sc = (a, y0, b, y1)
            screens.append(sc)
            sm = screen(cv, *sc, bg=(main[1] if alert else CYAN[1]))
            rng = np.random.default_rng(seed + ci * 10 + y0)
            if alert and rng.random() < 0.85:
                # warning triangle + striped bar
                cx = (a + b) / 2
                cy = (y0 + y1) / 2 - 4
                tri = poly([(cx, cy - 18), (cx + 20, cy + 14), (cx - 20, cy + 14)])
                cv.paint(tri & sm, main[3])
                cv.paint(poly([(cx, cy - 10), (cx + 12, cy + 9), (cx - 12, cy + 9)]) & sm, main[1])
                cv.paint(rect(cx - 1, cy - 4, cx + 2, cy + 3) & sm, main[4])
                cv.paint(rect(cx - 1, cy + 5, cx + 2, cy + 7) & sm, main[4])
                stripes = sm & (YY > y1 - 10) & ((((XX + YY) // 6) % 2) == 0)
                cv.paint(stripes, main[3])
            else:
                data_rows(cv, seed + ci + y0, a + 6, y0 + 6, b - 6, y1 - 6,
                          [CYAN[3], CYAN[4], GREEN[4]] if not alert else [main[3], main[4]])
            scanlines(cv, sm)
    # main screen: Earth and the trajectory
    sm = screen(cv, 368, 52, 592, 290, bg=(main[0] if alert else CYAN[0]))
    grid(cv, sm, 368, 52, 16, (main[1] if alert else CYAN[1]))
    earth(cv, 520, 200, 46, seed=3, light=(-0.6, -0.4, 0.7), atmo=True)
    rock_body(cv, 410, 92, 16, seed + 3, craters=4, rim_color=main[4])
    if alert:
        cv.paint(dotted([(424, 100), (460, 130), (495, 168), (516, 196)], 2, 5, 3), main[4])
        ring(cv, 518, 198, 16, main[4], 2)
        ring(cv, 518, 198, 26, main[3], 1)
    else:
        cv.paint(dotted([(424, 100), (460, 124), (520, 136), (575, 120)], 2, 5, 3), GREEN[4])
        cv.paint(dotted([(424, 100), (470, 140), (500, 170)], 1, 2, 4), GREEN[1])
    scanlines(cv, sm)
    # wall light wash
    glow(cv, 480, 170, 620, main[2] if alert else CYAN[2], 0.45, 5, 1.4)
    # consoles (two tiers) and operators seen from behind
    for tier, (y, s, n) in enumerate(((372, 1.25, 6), (470, 1.7, 4))):
        xs = np.linspace(130, 830, n)
        if tier == 0:
            for i, x in enumerate(xs):
                standing = alert and i in (1, 4)
                operator_rear(cv, x, y - (30 if standing else 18) * s, s, standing=standing,
                              rim=(main[3] if alert else CYAN[3]))
        desk = poly([(40, y), (920, y), (940, y + 26 * s), (20, y + 26 * s)])
        cv.ramp(desk, (YY - y) / (26 * s), [STEEL[1], STEEL[0], VOID[1]])
        cv.paint(rect(40, y, 920, y + 2), STEEL[3])
        rng = np.random.default_rng(seed + tier)
        for k in range(60):
            bx = rng.uniform(60, 900)
            by = y + 5 * s + rng.uniform(0, 12 * s)
            col = (main if alert else [CYAN[3], GREEN[4], CYAN[4], GREEN[3]])
            cv.paint(rect(bx, by, bx + 3, by + 2), col[int(rng.integers(2, 4))] if alert else col[int(rng.integers(0, 4))])
        if tier == 1:
            for i, x in enumerate(xs):
                operator_rear(cv, x, y - 14 * s, s, rim=(main[3] if alert else CYAN[3]))
    if alert:
        cv.tint(0.22, RED[2], (YY > 300))


# ---------------------------------------------------------------- frames
SHUTTLE = 'Rocket_Common_Closed.png'
GENESIS = 'Rocket_Legendary_Closed.png'
MODULES = [
    ('Hull_and_Cargo_Legendary.png', 'Hull & Cargo'),
    ('Control_Center_Legendary.png', 'Computer'),
    ('Energy_Module_Legendary.png', 'Energy'),
    ('Engine_Legendary.png', 'Engine'),
    ('Fuel_Tank_Legendary.png', 'Fuel Tank'),
]
ANCHORS = {}


def f01():
    cv = Canvas()
    space_bg(cv, 101, nebula=CYAN[0])
    glow(cv, -40, 120, 300, AMBER[2], 0.3, 4)            # distant sun beyond the left edge
    earth(cv, 660, 285, 245, seed=3, light=(-0.8, -0.3, 0.5), rot=0.12)
    s = sprite(SHUTTLE, 44, rotate=-58)
    glow(cv, 162, 452, 26, CYAN[3], 0.6, 4)
    paste(cv, s, 176, 440)
    ANCHORS['f01'] = {'shuttle': [176, 440], 'earth': [660, 285, 245]}
    return cv


def f02():
    cv = Canvas()
    # overhead diagonal hangar floor
    cv.ramp(np.ones((H, W), bool), (XX * 0.4 + YY) / (W * 0.4 + H), [STEEL[0], STEEL[1], STEEL[0], VOID[2]])
    plates = (((XX + YY * 1.6) % 80) < 1.5) | (((XX - YY * 0.9) % 96) < 1.5)
    cv.paint(plates, VOID[2])
    cv.paint(((((XX + YY * 1.6) % 80) >= 1.5) & (((XX + YY * 1.6) % 80) < 2.5)), STEEL[2])
    # hazard lane
    lane = poly([(0, 470), (W, 120), (W, 150), (0, 500)])
    cv.paint(lane, VOID[1])
    cv.paint(lane & ((((XX - YY) // 10) % 2) == 0), AMBER[2])
    # overhead gantries (shadows + beams)
    for k, y in enumerate((-10, 250)):
        beam = poly([(0, y + 40), (W, y - 120 + 40), (W, y - 120 + 64), (0, y + 64)])
        cv.ramp(beam, np.full((H, W), 0.4), [STEEL[2], STEEL[1]])
        cv.paint(edge(beam, 0, -1), STEEL[5])
        cv.paint(edge(beam, 0, 1), VOID[0])
        for x in range(10, W, 36):
            yy = y + 40 - x * 120 / W
            cv.paint(rect(x, yy + 8, x + 6, yy + 16), VOID[1])
    pads = [(150, 385), (330, 330), (500, 270), (670, 215), (835, 160)]
    pads = [(140, 400), (320, 345), (495, 290), (668, 236), (838, 182)]
    for i, ((px, py), (file, _)) in enumerate(zip(pads, MODULES)):
        base = ellipse(px, py + 30, 86, 30)
        cv.ramp(base, (YY - py) / 60 + 0.3, [STEEL[3], STEEL[2], STEEL[1]])
        cv.paint(outline(base), VOID[0])
        top = ellipse(px, py + 24, 76, 25)
        cv.ramp(top, (YY - py) / 50 + 0.2, [STEEL[4], STEEL[3]])
        d = np.sqrt(((XX - px) / 72) ** 2 + ((YY - py - 24) / 23) ** 2)
        cv.paint((d > 0.9) & (d < 1.0), CYAN[4])
        glow(cv, px, py + 24, 110, CYAN[2], 0.45, 4)
        spr = sprite(file, 112)
        paste(cv, spr, px, py + 30, 'bottom')
    # module light reflected on the floor
    ANCHORS['f02'] = {'pads': pads}
    return cv


def damaged_overlay(cv, mask, seed):
    rng = np.random.default_rng(seed)
    ys, xs = np.where(mask)
    for _ in range(14):
        i = int(rng.integers(0, len(xs)))
        x, y = xs[i], ys[i]
        w, h = rng.integers(10, 34), rng.integers(8, 26)
        hole = rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2) & mask
        cv.paint(hole, VOID[1])
        cv.paint(edge(hole, 1, 1), STEEL[1])
        cv.paint(outline(hole) & mask, STEEL[0])
        for k in range(3):
            yy = y - h / 2 + 3 + k * 6
            cv.paint(rect(x - w / 2 + 2, yy, x + w / 2 - 2, yy + 1) & hole, [CYAN[2], AMBER[2], STEEL[2]][k])
    scorch = vnoise(H, W, 18, seed + 3) > 0.62
    cv.mul(mask & scorch, 0.55)


def f03():
    cv = Canvas()
    hangar(cv, 3, floor_y=440)
    glow(cv, 480, 150, 420, CYAN[1], 0.35, 4)
    spr = sprite(GENESIS, 431, dark=0.92)
    m = paste(cv, spr, 520, 452, 'bottom')
    damaged_overlay(cv, m, 33)
    # missing hull section: open frame with machinery
    sec = rect(470, 200, 570, 250) & m
    cv.paint(sec, VOID[1])
    for y in range(204, 248, 8):
        cv.paint(rect(474, y, 566, y + 2) & m, STEEL[1])
    cv.paint(rect(510, 200, 514, 250) & m, AMBER[2])
    scaffold(cv, 330, 400, 90, 452)
    scaffold(cv, 640, 720, 140, 452)
    cv.paint(rect(400, 180, 640, 184), STEEL[2])
    cv.paint(rect(400, 300, 640, 304), STEEL[2])
    cv.paint(rect(398, 184, 402, 452), STEEL[1])
    # work lights on the scaffold
    for (x, y) in ((360, 170), (690, 230), (400, 300)):
        cv.paint(rect(x - 3, y - 2, x + 3, y + 2), AMBER[5])
        glow(cv, x, y, 60, AMBER[2], 0.4, 4)
    # commander foreground (low angle, from behind)
    commander_rear(cv, 250, 532, 150, rim=CYAN[4], rim_dx=1, rim2=AMBER[3])
    ANCHORS['f03'] = {'lights': [[360, 170], [690, 230], [400, 300]]}
    return cv


def f04():
    cv = Canvas()
    hangar(cv, 4, floor_y=420)
    glow(cv, 520, 220, 380, CYAN[1], 0.4, 4)
    spr = sprite(GENESIS, 352)
    paste(cv, spr, 540, 440, 'bottom')
    # reflection on the floor
    r_rgb, r_a = spr
    flip = (r_rgb[::-1] * 0.25 + hx(STEEL[1]) * 0.25, r_a[::-1])
    refl_m = paste(cv, (flip[0], flip[1]), 540, 440, 'top') if False else None
    rh = 70
    h, w = r_a.shape
    x0 = int(540 - w / 2)
    for k in range(rh):
        src_row = h - 1 - k * 2
        if src_row < 0:
            break
        row_a = r_a[src_row]
        y = 441 + k
        if y >= H:
            break
        cols = np.where(row_a)[0] + x0
        cols = cols[(cols >= 0) & (cols < W)]
        if (k % 2) == 0:
            cv.a[y, cols] = cv.a[y, cols] * 0.6 + r_rgb[src_row][cols - x0] * 0.25
    # retracted scaffolding at the sides
    scaffold(cv, 150, 220, 120, 440)
    scaffold(cv, 820, 890, 120, 440)
    cv.paint(rect(220, 160, 330, 163), STEEL[2])
    cv.paint(rect(720, 160, 820, 163), STEEL[2])
    # floor light strip leading to the ship
    for x in range(260, 820, 40):
        cv.paint(rect(x, 470, x + 14, 472), CYAN[4])
    ANCHORS['f04'] = {'ceiling': [[60 + i * 120, 62] for i in range(8)]}
    return cv


def wire_ship(cv, name, cx, cy, height, color, rot=0):
    spr = sprite(name, height, rotate=rot)
    rgb, a = spr
    h, w = a.shape
    x0, y0 = int(cx - w / 2), int(cy - h / 2)
    m = np.zeros((H, W), bool)
    m[y0:y0 + h, x0:x0 + w] = a
    cv.paint(outline(m) | (m & ((YY.astype(int) % 4) == 0)), color)
    return m


def f05():
    cv = Canvas(VOID[0])
    sm = screen(cv, 40, 30, 920, 470, bg=GREEN[0], bezel=STEEL[1])
    grid(cv, sm, 40, 30, 24, GREEN[0])
    cv.paint(rect(40, 30, 920, 52) & sm, GREEN[1])
    data_rows(cv, 5, 50, 36, 400, 48, [GREEN[4], CYAN[4]], 6, 0.9)
    # ship schematic
    cv.paint(rect(70, 70, 400, 450) & sm, VOID[1])
    bracket(cv, 70, 70, 400, 450, CYAN[4], 16, 2)
    wire_ship(cv, GENESIS, 235, 258, 330, CYAN[4])
    for (x, y) in ((235, 160), (235, 300), (185, 330), (285, 330), (235, 400)):
        ring(cv, x, y, 9, GREEN[4], 2)
    # five system bars
    names_y = [88, 152, 216, 280, 344]
    for i, y in enumerate(names_y):
        cv.paint(rect(430, y, 470, y + 40) & sm, GREEN[1])
        spr = sprite(MODULES[i][0], 36)
        paste(cv, spr, 450, y + 20)
        cv.paint(rect(484, y + 6, 880, y + 34), VOID[1])
        cv.paint(rect(486, y + 8, 486 + 390, y + 32), GREEN[2])
        cv.paint(rect(486, y + 8, 486 + 390, y + 10), GREEN[4])
        data_rows(cv, 50 + i, 492, y + 14, 860, y + 30, [GREEN[5], GREEN[4]], 6, 0.7)
    # archive folder grid
    for i in range(10):
        x = 430 + i * 45
        cv.paint(rect(x, 404, x + 36, 448), CYAN[1])
        cv.paint(rect(x, 400, x + 16, 404), CYAN[2])
        cv.paint(rect(x + 4, 412, x + 32, 414), CYAN[4])
    scanlines(cv, sm)
    glow(cv, 480, 250, 520, GREEN[2], 0.25, 4, 1.2)
    # technician silhouettes at the bottom edge
    cv.paint(rect(0, 478, W, H), VOID[0])
    for x, s in ((150, 2.6), (420, 3.0), (760, 2.7)):
        operator_rear(cv, x, 520, s, rim=GREEN[3], body=VOID[0])
    ANCHORS['f05'] = {'bars': [[486, y + 8, 876, y + 32] for y in names_y], 'folders': [430, 400, 880, 448]}
    return cv


def f06():
    cv = Canvas(VOID[0])
    sm = screen(cv, 24, 20, 936, 520, bg=CYAN[0], bezel=STEEL[0])
    grid(cv, sm, 24, 20, 32, VOID[3])
    for r in (90, 180, 270, 360):
        ring(cv, 400, 300, r, CYAN[1], 1)
    rng = np.random.default_rng(66)
    for _ in range(520):
        x, y = rng.uniform(40, 900), rng.uniform(40, 500)
        if 640 < x < 920 and 40 < y < 260:
            continue
        cv.paint(rect(x, y, x + 2, y + 2), CYAN[3] if rng.random() < 0.7 else CYAN[4])
    # the hidden mass
    m = rock_body(cv, 300, 330, 46, 606, craters=8, palette=[RED[0], RED[1], RED[2], RED[3]], rim_color=RED[4])
    bracket(cv, 238, 268, 362, 392, RED[4], 16, 2)
    ring(cv, 300, 330, 70, RED[3], 1)
    cv.paint(dotted([(362, 300), (520, 190), (640, 150)], 1, 4, 3), RED[3])
    # scan window
    win = screen(cv, 650, 50, 900, 250, bg=VOID[1], bezel=RED[2])
    rock_body(cv, 775, 152, 72, 607, craters=14, palette=[ROCK[1], ROCK[3], ROCK[5], RED[3], RED[4]], rim_color=RED[5])
    cv.paint(rect(650, 50, 900, 64) & win, RED[1])
    data_rows(cv, 6, 656, 54, 880, 62, [RED[4], RED[5]], 6, 0.9)
    data_rows(cv, 7, 40, 470, 600, 510, [CYAN[3], CYAN[4]], 7, 0.8)
    scanlines(cv, sm)
    ANCHORS['f06'] = {'target': [300, 330], 'window': [650, 50, 900, 250]}
    return cv


def f07():
    cv = Canvas()
    space_bg(cv, 707, VOID[0], VOID[1])
    m = rock_body(cv, 470, 285, 245, 7007, craters=70, lumps=0.14, light=(0.6, -0.55, 0.55), rim_color=AMBER[4])
    fragments(cv, 77, 420, (0, 0, W, H), 1.5, 14, light=(0.6, -0.55, 0.55), avoid=m)
    glow(cv, 990, -40, 380, AMBER[2], 0.28, 4)
    ANCHORS['f07'] = {}
    return cv


def f08():
    cv = Canvas(VOID[0])
    sm = rect(0, 0, W, H)
    cv.ramp(sm, (XX + YY) / (W + H), [CYAN[0], VOID[2], VOID[1]])
    grid(cv, sm, 0, 0, 30, VOID[3])
    # diagonal panel division
    band = poly([(0, 380), (W, 40), (W, 76), (0, 416)])
    cv.paint(band, VOID[1])
    cv.paint(edge(band, 0, -1) | edge(band, 0, 1), CYAN[3])
    side = poly([(640, 330), (940, 220), (940, 520), (640, 520)])
    cv.paint(side, VOID[1])
    cv.paint(outline(side), CYAN[3])
    data_rows(cv, 8, 670, 360, 920, 510, [CYAN[3], CYAN[4], RED[3]], 8, 0.8)
    # orbits
    d = np.sqrt(((XX - 720) / 420) ** 2 + ((YY - 430) / 170) ** 2)
    cv.paint((d > 0.995) & (d < 1.005) & (((XX // 6) % 2) == 0), CYAN[2])
    earth(cv, 720, 430, 62, seed=3, light=(-0.6, -0.5, 0.6))
    rock_body(cv, 130, 90, 30, 808, craters=6, rim_color=RED[4])
    path = [(150, 104), (300, 190), (450, 280), (600, 370), (700, 420)]
    cv.paint(dotted(path, 2, 6, 4), RED[2])
    ring(cv, 720, 430, 82, RED[3], 2)
    ring(cv, 720, 430, 94, RED[2], 1)
    cv.paint(line_mask([(700, 410), (740, 450)], 3) | line_mask([(740, 410), (700, 450)], 3), RED[4])
    ANCHORS['f08'] = {'path': path, 'target': [720, 430]}
    return cv


def f09():
    cv = Canvas()
    mission_control(cv, 909, alert=True)
    ANCHORS['f09'] = {}
    return cv


def f10():
    cv = Canvas(VOID[0])
    wall = rect(0, 0, W, 420)
    cv.ramp(wall, YY / 420, [VOID[0], VOID[1]])
    stars(cv, 1010, 260, wall, bright=0.5)
    path = [(70, 60), (240, 70), (420, 110), (600, 180), (760, 280), (850, 350)]
    cv.paint(line_mask(path, 9), RED[1])
    cv.paint(line_mask(path, 5), RED[2])
    cv.paint(line_mask(path, 1), RED[4])
    rock_body(cv, 70, 60, 34, 1011, craters=6, rim_color=RED[4])
    earth(cv, 860, 360, 40, seed=3, light=(-0.6, -0.5, 0.6), dim=0.8)
    ring(cv, 860, 360, 56, RED[3], 2)
    glow(cv, 480, 160, 520, RED[2], 0.3, 4, 1.3)
    fl = YY >= 420
    cv.ramp(fl, (YY - 420) / 120, [VOID[2], VOID[1], VOID[0]])
    cv.paint(rect(0, 420, W, 421), RED[2])
    refl = line_mask([(x, 840 - y) for x, y in path], 3) & fl & (((YY.astype(int)) % 3) == 0)
    cv.paint(refl, RED[1])
    commander_rear(cv, 480, 500, 175, rim=RED[4], rim_dx=0, rim2=RED[3])
    ANCHORS['f10'] = {'path': path}
    return cv


def f11():
    cv = Canvas(VOID[0])
    sm = rect(0, 0, W, H)
    cv.ramp(sm, YY / H, [VOID[1], CYAN[0], VOID[1]])
    # holographic floor grid in perspective
    for k in range(-20, 21):
        cv.paint(line_mask([(480 + k * 14, 300), (480 + k * 70, H)], 1), CYAN[1])
    y, g = 300, 4
    while y < H:
        cv.paint(rect(0, y, W, y + 1), CYAN[1])
        g *= 1.3
        y += g
    for r in (60, 120, 180):
        ring(cv, 700, 220, r, VOID[3], 1)
    m = rock_body(cv, 700, 220, 105, 1111, craters=14, palette=[CYAN[0], CYAN[1], VOID[3], RED[1], RED[2]], rim_color=RED[3])
    cv.paint(outline(m), RED[3])
    earth(cv, 120, 430, 42, seed=3, light=(-0.6, -0.5, 0.6))
    approach = [(150, 410), (300, 360), (450, 300), (560, 260), (605, 245)]
    cv.paint(dotted(approach, 2, 6, 4), CYAN[2])
    ret = [(605, 245), (560, 330), (450, 400), (300, 450)]
    cv.paint(dotted(ret, 1, 3, 6), VOID[3])
    for (x, y) in ret[1:]:
        cv.paint(line_mask([(x - 7, y - 7), (x + 7, y + 7)], 2) | line_mask([(x + 7, y - 7), (x - 7, y + 7)], 2), RED[3])
    ring(cv, 605, 245, 12, RED[4], 2)
    bracket(cv, 40, 30, 300, 120, CYAN[3], 12, 2)
    data_rows(cv, 11, 52, 42, 290, 112, [CYAN[3], CYAN[4]], 7, 0.8)
    ANCHORS['f11'] = {'approach': approach, 'impact': [605, 245]}
    return cv


def f12():
    cv = Canvas()
    space_bg(cv, 1212, VOID[0], VOID[2])
    cx, cy, R = 480, 300, 300
    shell = circle(cx, cy, R)
    nx = (XX - cx) / R
    ny = (YY - cy) / R
    lam = -nx * 0.5 - ny * 0.6 + np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1)) * 0.6
    cv.ramp(shell, np.clip(lam, 0, 1), [STEEL[1], STEEL[2], STEEL[3], STEEL[4], STEEL[5], STEEL[6]])
    for (x0, x1) in ((150, 175), (785, 810)):
        side = rect(x0, 230, x1, 380) & shell
        cv.ramp(side, (YY - 230) / 150, [STEEL[3], STEEL[1]])
        cv.paint(outline(side) & shell, STEEL[0])
    seams = (line_mask([(480, 0), (480, 60)], 1) | line_mask([(250, 90), (330, 40)], 1) |
             line_mask([(710, 90), (630, 40)], 1)) & shell
    cv.paint(seams, STEEL[1])
    cv.paint(rect(456, 26, 504, 34) & shell, CYAN[3])
    visor = ellipse(cx, cy - 10, 232, 178)
    rim_v = ellipse(cx, cy - 10, 246, 190) & ~visor
    cv.ramp(rim_v, (YY - 120) / 380, [STEEL[5], STEEL[3], STEEL[1]])
    vnx = (XX - cx) / 232
    vny = (YY - cy + 10) / 178
    cv.ramp(visor, np.clip(0.2 + vnx * 0.25 - vny * 0.2, 0, 1), [VOID[0], VOID[1], VOID[2], CYAN[0]])
    # Earth reflected in the dark visor
    em = earth(cv, 420, 250, 98, seed=3, light=(-0.6, -0.4, 0.7), dim=0.75)
    cv.mul(em & visor, 0.82)
    stars(cv, 1213, 160, visor & ~em, bright=0.35)
    hl = ellipse(cx - 90, cy - 120, 120, 30) & visor & ~ellipse(cx - 90, cy - 104, 116, 28)
    cv.paint(hl, STEEL[6])
    cv.paint(ellipse(cx + 150, cy + 60, 10, 6) & visor, STEEL[5])
    cv.paint(outline(visor), VOID[0])
    neck = rect(200, 505, 760, H)
    cv.ramp(neck, (YY - 505) / 35, [STEEL[3], STEEL[1]])
    cv.paint(rect(200, 505, 760, 507), STEEL[5])
    ANCHORS['f12'] = {'earth': [420, 250, 98], 'visor': [cx, cy - 10, 232, 178]}
    return cv


def f13():
    cv = Canvas(VOID[0])
    # distant silhouetted personnel (low contrast)
    cv.ramp(rect(0, 0, W, 300), YY / 300, [VOID[0], VOID[2]])
    for x in (90, 250, 700, 860):
        operator_rear(cv, x, 210, 2.2, standing=True, body=VOID[3])
    for x in range(40, W, 160):
        cv.paint(rect(x, 60, x + 110, 120), CYAN[0])
        data_rows(cv, x, x + 6, 66, x + 104, 114, [CYAN[1], CYAN[2]], 6, 0.6)
    # console surface in perspective
    desk = poly([(0, 300), (W, 300), (W, H), (0, H)])
    cv.ramp(desk, (YY - 300) / 240, [STEEL[2], STEEL[1], STEEL[0]])
    cv.paint(rect(0, 300, W, 303), STEEL[4])
    rng = np.random.default_rng(1313)
    for _ in range(40):
        x, y = rng.uniform(20, 940), rng.uniform(320, 520)
        if 300 < x < 700 and y > 340:
            continue
        cv.paint(rect(x, y, x + 10, y + 4), [CYAN[2], AMBER[2], STEEL[3]][int(rng.integers(0, 3))])
    # authorization button (amber = armed)
    btn = poly([(380, 420), (600, 420), (640, 500), (340, 500)])
    cv.paint(btn, STEEL[0])
    inner = poly([(392, 428), (588, 428), (624, 492), (356, 492)])
    cv.ramp(inner, (YY - 428) / 64, [AMBER[4], AMBER[3], AMBER[2]])
    cv.paint(outline(inner), AMBER[5])
    for k in range(4):
        cv.paint(rect(400 + k * 48, 472, 430 + k * 48, 476), AMBER[1])
    glow(cv, 490, 460, 200, AMBER[2], 0.45, 4)
    # gloved hand (from upper right, fingers over the button)
    glove = poly([(960, 170), (760, 200), (620, 280), (560, 360), (540, 405), (600, 410), (650, 360), (700, 340), (960, 330)])
    fingers = [poly([(560, 330), (500, 380), (494, 410), (520, 418), (580, 370)]),
               poly([(600, 330), (548, 392), (546, 420), (574, 424), (628, 360)]),
               poly([(640, 334), (600, 396), (602, 422), (630, 422), (666, 360)]),
               poly([(680, 336), (650, 390), (654, 412), (680, 410), (706, 360)])]
    thumb = poly([(640, 290), (560, 300), (520, 330), (528, 348), (600, 330), (660, 320)])
    hand = glove | thumb
    for f in fingers:
        hand |= f
    lam = np.clip(0.75 - (XX - 500) / 700 + (YY - 300) / 900, 0, 1)
    cv.ramp(hand, lam, [STEEL[1], STEEL[2], STEEL[3], STEEL[4], STEEL[5]])
    for f in fingers + [thumb]:
        cv.paint(outline(f) & hand, STEEL[0])
        cv.paint(edge(f, 0, -1) & f & (YY > 380), AMBER[4])
    # knuckle plates and seams on the back of the glove
    for (kx, ky) in ((585, 322), (622, 326), (660, 330), (698, 334)):
        plate = ellipse(kx, ky, 16, 9) & glove
        cv.ramp(plate, (YY - ky + 9) / 18, [STEEL[6], STEEL[4], STEEL[2]])
        cv.paint(outline(plate) & hand, STEEL[1])
    cv.paint(line_mask([(700, 230), (620, 300)], 1) & glove, STEEL[2])
    cv.paint(line_mask([(780, 210), (720, 300)], 1) & glove, STEEL[2])
    cv.paint(edge(hand, 0, -2) & (YY > 360), CYAN[2])
    cuff = poly([(960, 160), (840, 175), (850, 340), (960, 340)])
    cv.ramp(cuff, (XX - 840) / 120, [STEEL[3], STEEL[1]])
    cv.paint(rect(846, 170, 852, 340) & cuff, CYAN[3])
    cv.paint(outline(hand | cuff), VOID[0])
    ANCHORS['f13'] = {'button': [356, 428, 624, 492]}
    return cv


def f14():
    cv = Canvas()
    hangar(cv, 14, floor_y=430, warm=0.7, lights=True)
    # open bay doors with amber light beyond
    door = rect(330, 60, 750, 430)
    cv.ramp(door, YY / 430, [AMBER[1], AMBER[2], AMBER[3]])
    cv.paint(rect(326, 60, 330, 430) | rect(750, 60, 754, 430), STEEL[0])
    glow(cv, 540, 260, 520, AMBER[2], 0.45, 5, 1.4)
    spr = sprite(GENESIS, 431, tint=AMBER[2], tint_amt=0.12)
    m = paste(cv, spr, 540, 470, 'bottom')
    # warm rim from the bay, cold underside
    cv.paint(edge(m, -2, 0) & (YY < 420), AMBER[5])
    cv.paint(edge(m, 2, 0) & (YY < 420), AMBER[4])
    noz, (w, h) = nozzles(GENESIS, 431)
    pts = [[540 - w / 2 + nx, 470 - h + ny] for nx, ny in noz]
    for x, y in pts:
        glow(cv, x, y + 4, 34, CYAN[3], 0.7, 4)
    floor_glow = rect(0, 430, W, H)
    cv.add(floor_glow, np.clip(1 - np.abs(XX - 540) / 360, 0, 1) * 0.35, AMBER[2], 4)
    ANCHORS['f14'] = {'nozzles': pts}
    return cv


def f15():
    cv = Canvas()
    sky = rect(0, 0, W, H)
    cv.ramp(sky, YY / H, [VOID[0], VOID[2], CYAN[0], CYAN[1]])
    stars(cv, 1515, 220, YY < 220, bright=0.6)
    spr = sprite(GENESIS, 250)
    noz, (w, h) = nozzles(GENESIS, 250)
    x0, y_bottom = 470, 300
    pts = [[x0 - w / 2 + nx, y_bottom - h + ny] for nx, ny in noz]
    # exhaust plumes down to the pad
    for x, y in pts:
        plume = poly([(x - 7, y), (x + 7, y), (x + 34, H), (x - 34, H)])
        t = (YY - y) / (H - y)
        cv.ramp(plume, t, [CYAN[5], CYAN[4], AMBER[5], AMBER[4], AMBER[3]])
    glow(cv, 470, 330, 160, CYAN[4], 0.8, 5)
    # illuminated cloud bank
    cl = vnoise(H, W, 40, 1516, 4)
    clouds = (YY > 400 + (cl - 0.5) * 120) & (YY > 360)
    lit = np.clip(1 - np.abs(XX - 470) / 420, 0, 1)
    cv.ramp(clouds, np.clip(lit * 0.9 + (cl - 0.5), 0, 1), [STEEL[1], STEEL[3], AMBER[3], AMBER[4], AMBER[5]])
    # launch tower (left) and pad structures
    tower = rect(180, 140, 230, H)
    cv.paint(tower, VOID[1])
    for y in range(140, H, 24):
        cv.paint(line_mask([(180, y), (230, y + 24)], 1) | line_mask([(230, y), (180, y + 24)], 1), STEEL[1])
    cv.paint(edge(tower, -1, 0), AMBER[3])
    cv.paint(rect(230, 250, 330, 256), VOID[1])
    cv.paint(rect(326, 240, 332, 256), AMBER[4])
    cv.paint(rect(700, 300, 730, H), VOID[1])
    cv.paint(edge(rect(700, 300, 730, H), 1, 0), AMBER[3])
    paste(cv, spr, x0, y_bottom, 'bottom')
    ANCHORS['f15'] = {'nozzles': pts}
    return cv


def f16():
    cv = Canvas()
    space_bg(cv, 1616, VOID[0], VOID[1])
    earth(cv, 170, 600, 380, seed=3, light=(0.6, -0.6, 0.5), rot=0.3)
    spr = sprite(GENESIS, 96, rotate=-38)
    sx, sy = 690, 170
    # long engine trail back towards Earth
    trail(cv, (sx - 16, sy + 44), (330, 470), 9, 2, CYAN[3], 0.95, seed=1617, grain=0.35)
    trail(cv, (sx - 16, sy + 44), (520, 300), 4, 1, CYAN[5], 0.9, seed=1618, grain=0.2)
    glow(cv, sx - 18, sy + 40, 46, CYAN[4], 0.8, 4)
    paste(cv, spr, sx, sy)
    ANCHORS['f16'] = {'ship': [sx, sy], 'tail': [sx - 14, sy + 44]}
    return cv


def f17():
    cv = Canvas()
    space_bg(cv, 1717, VOID[0], VOID[1])
    m = rock_body(cv, 560, 250, 300, 1777, craters=80, lumps=0.12, light=(-0.6, 0.45, 0.6), rim_color=CYAN[4])
    fragments(cv, 1718, 160, (0, 0, W, H), 1.5, 9, light=(-0.6, 0.45, 0.6), avoid=m, rim_color=CYAN[4])
    spr = sprite(GENESIS, 22, rotate=-55)
    cv.paint(line_mask([(70, 520), (112, 478)], 2), CYAN[2])
    glow(cv, 108, 482, 14, CYAN[4], 0.8, 4)
    paste(cv, spr, 118, 472)
    ANCHORS['f17'] = {'ship': [118, 472]}
    return cv


def f18():
    cv = Canvas()
    space_bg(cv, 1818, VOID[0], VOID[1])
    # rear of the fuselage (same ship: white-gray, blue wing stripes, three engines)
    wing = poly([(30, 360), (300, 250), (660, 250), (930, 360), (930, 392), (30, 392)])
    cv.ramp(wing, (YY - 250) / 140, [STEEL[5], STEEL[4], STEEL[3], STEEL[2]])
    cv.paint(poly([(60, 366), (300, 268), (318, 276), (86, 372)]), CYAN[3])
    cv.paint(poly([(900, 366), (660, 268), (642, 276), (874, 372)]), CYAN[3])
    body = ellipse(480, 280, 230, 150)
    cv.ramp(body, np.clip((YY - 130) / 300 + (np.abs(XX - 480) / 600), 0, 1), [STEEL[6], STEEL[5], STEEL[4], STEEL[3], STEEL[2]])
    for x in (330, 400, 560, 630):
        cv.paint(line_mask([(x, 150), (x, 420)], 1) & body, STEEL[2])
    cv.paint(rect(250, 268, 710, 270) & body, STEEL[2])
    cv.paint(outline(body | wing), VOID[0])
    centers = [(360, 330, 64), (480, 336, 70), (600, 330, 64)]
    for (x, y, r) in centers:
        cv.paint(circle(x, y, r + 8), STEEL[1])
        cv.paint(circle(x, y, r + 2), STEEL[0])
        cv.paint(circle(x, y, r), VOID[1])
        for k, rr in enumerate((r * 0.86, r * 0.66, r * 0.42, r * 0.22)):
            cv.paint(circle(x, y, rr), [CYAN[1], CYAN[3], CYAN[4], CYAN[5]][k])
        ring(cv, x, y, r - 4, STEEL[2], 2)
    glow(cv, 480, 336, 360, CYAN[3], 0.5, 5, 1.6)
    rng = np.random.default_rng(1819)
    for _ in range(90):
        x, y = rng.uniform(150, 810), rng.uniform(380, 540)
        cv.paint(rect(x, y, x + 2, y + 2), CYAN[4] if rng.random() < 0.6 else STEEL[5])
    # navigation indicator (bracket, upper right)
    bracket(cv, 760, 60, 900, 140, CYAN[4], 14, 2)
    ring(cv, 830, 100, 18, CYAN[4], 2)
    cv.paint(rect(828, 76, 832, 124) | rect(806, 98, 854, 102), CYAN[3])
    ANCHORS['f18'] = {'nozzles': [[x, y, r] for x, y, r in centers], 'nav': [830, 100]}
    return cv


def f19():
    cv = Canvas()
    space_bg(cv, 1919, VOID[0], VOID[1])
    impact = (330, 360)
    m = rock_body(cv, 580, 250, 290, 1777, craters=80, lumps=0.12, light=(-0.6, 0.45, 0.6), rim_color=CYAN[5],
                  extra_light=(impact[0], impact[1], 420, CYAN[4], 0.9))
    fragments(cv, 1920, 140, (0, 0, W, H), 1.5, 8, light=(-0.6, 0.45, 0.6), avoid=m, rim_color=CYAN[5])
    # the flash at the point of contact
    glow(cv, *impact, 260, CYAN[3], 0.9, 6, 1.5)
    glow(cv, *impact, 110, CYAN[5], 1.0, 6, 1.2)
    cv.paint(circle(*impact, 22), STEEL[7])
    rng = np.random.default_rng(19)
    for k in range(18):
        a = k / 18 * 6.283 + rng.uniform(-0.1, 0.1)
        L = rng.uniform(60, 190)
        cv.paint(line_mask([impact, (impact[0] + math.cos(a) * L, impact[1] + math.sin(a) * L)], 1), CYAN[5])
    ring(cv, *impact, 140, CYAN[4], 2)
    # shower of debris away from the impact
    for _ in range(80):
        a = rng.uniform(1.8, 4.4)
        L = rng.uniform(40, 260)
        x, y = impact[0] + math.cos(a) * L, impact[1] + math.sin(a) * L
        cv.paint(rect(x, y, x + 2, y + 2), STEEL[6] if rng.random() < 0.5 else CYAN[4])
    ANCHORS['f19'] = {'impact': list(impact)}
    return cv


def f20():
    cv = Canvas()
    space_bg(cv, 2020, VOID[0], VOID[1])
    # dust trail shows the new heading (away, up and to the right)
    trail(cv, (585, 285), (300, 470), 46, 14, ROCK[6], 0.55, seed=2022, grain=0.7)
    m = rock_body(cv, 640, 220, 110, 1777, craters=40, lumps=0.12, light=(-0.6, 0.45, 0.6), rim_color=CYAN[4])
    glow(cv, 560, 268, 50, CYAN[4], 0.55, 4)
    cv.paint(circle(560, 268, 3), STEEL[7])
    fragments(cv, 2021, 70, (300, 150, 900, 450), 1.5, 5, light=(-0.6, 0.45, 0.6), avoid=m, rim_color=CYAN[4])
    earth(cv, 110, 470, 12, seed=3, light=(0.5, -0.5, 0.7), atmo=True)
    ANCHORS['f20'] = {'glow': [560, 268]}
    return cv


def f21():
    cv = Canvas()
    mission_control(cv, 909, alert=False)
    ANCHORS['f21'] = {'path': [[424, 100], [460, 124], [520, 136], [575, 120]]}
    return cv


def f22():
    cv = Canvas(VOID[0])
    win = rect(120, 40, 840, 430)
    space_bg_local = Canvas()
    space_bg(space_bg_local, 2222, VOID[0], VOID[1])
    cv.a[win] = space_bg_local.a[win]
    em = earth(cv, 520, 300, 200, seed=3, light=(-0.7, -0.4, 0.6), rot=0.2)
    cv.a[~win] = hx(VOID[0])
    # window frame and mullions
    frame = (rect(110, 30, 850, 40) | rect(110, 430, 850, 444) | rect(110, 30, 120, 444) | rect(840, 30, 850, 444) |
             rect(356, 40, 362, 430) | rect(598, 40, 604, 430))
    cv.paint(frame, STEEL[1])
    cv.paint(edge(frame, 0, 1), STEEL[3])
    # room floor and Earth light on it
    fl = rect(0, 444, W, H)
    cv.ramp(fl, (YY - 444) / 96, [VOID[2], VOID[1], VOID[0]])
    cv.add(fl, np.clip(1 - np.abs(XX - 480) / 400, 0, 1) * 0.3, CYAN[2], 4)
    commander_rear(cv, 430, 530, 160, rim=CYAN[4], rim_dx=0, rim2=CYAN[3])
    ANCHORS['f22'] = {'earth': [520, 300, 200]}
    return cv


def f23():
    cv = Canvas()
    sky = rect(0, 0, W, H)
    cv.ramp(sky, YY / H, [VOID[0], VOID[1], VOID[3], CYAN[1]])
    stars(cv, 2323, 300, YY < 200, bright=0.5)
    cx, cy, R = 480, 1640, 1240
    d = np.sqrt((XX - cx) ** 2 + (YY - cy) ** 2)
    planet = d <= R
    cv.ramp(planet, np.clip((d - R + 140) / 140, 0, 1), [NIGHT[0], NIGHT[2], OCEAN[0], OCEAN[1]])
    land_n = vnoise(H, W, 50, 2324, 4)
    land = planet & (land_n > 0.58) & (d > R - 120)
    cv.ramp(land, np.clip((d - R + 120) / 120, 0, 1), [NIGHT[1], LAND[0], LAND[1]])
    cl = vnoise(H, W, 30, 2325, 4)
    cv.ramp(planet & (cl > 0.62) & (d > R - 100), np.clip((d - R + 100) / 100, 0, 1), [NIGHT[2], CLOUD[0], CLOUD[1]])
    # atmosphere band: blue, then gold where the sun rises
    band = (d > R - 4) & (d < R + 26)
    sun_x = 380
    near = np.clip(1 - np.abs(XX - sun_x) / 420, 0, 1)
    cv.ramp(band, np.clip(1 - (d - R + 4) / 30, 0, 1) * (0.6 + 0.4 * near), [CYAN[1], CYAN[3], CYAN[4], AMBER[4], AMBER[5]])
    sun_y = cy - R - 6
    glow(cv, sun_x, sun_y, 420, AMBER[3], 0.6, 6, 1.6)
    glow(cv, sun_x, sun_y, 150, AMBER[5], 0.9, 6, 1.4)
    glow(cv, sun_x, sun_y, 40, STEEL[7], 1.0, 4, 1.0)
    cv.paint(rect(sun_x - 300, sun_y - 1, sun_x + 300, sun_y + 1) & (np.abs(XX - sun_x) < 300 - np.abs(YY - sun_y) * 10), AMBER[5])
    ANCHORS['f23'] = {'sun': [sun_x, sun_y]}
    return cv


FRAMES = [f01, f02, f03, f04, f05, f06, f07, f08, f09, f10, f11, f12,
          f13, f14, f15, f16, f17, f18, f19, f20, f21, f22, f23]


def main():
    os.makedirs(OUT, exist_ok=True)
    only = set(int(a) for a in sys.argv[1:])
    manifest = []
    for i, fn in enumerate(FRAMES, 1):
        name = f'frame_{i:02d}.png'
        if only and i not in only:
            continue
        cv = fn()
        cv.save(name)
        print('drew', name, flush=True)
    anchors_path = os.path.join(ROOT, 'NASARETH_FINAL_CUTSCENE', 'tools', 'anchors.json')
    with open(anchors_path, 'w') as f:
        json.dump(ANCHORS, f, indent=1, default=float)


if __name__ == '__main__':
    main()
