"""Prepara a KAP (imagen de referencia) como RIG POR CAPAS reutilizable: torso (sin cabeza), cabeza (sin ojos ni cejas), ojos/cejas por expresión y bocas por visema.
Fondo -> transparente (relleno desde los bordes: el trazo negro protege el interior). Uso: python3 scripts/prepare-kap-sprite.py <referencia.jpg> <carpeta-salida>
El rig (puntos de giro, posiciones) se escribe en <carpeta-salida>/rig.json. Las expresiones se derivan de los ojos y cejas originales (desplazar, espejar, escalar, cerrar)."""
import sys, os, json
import numpy as np
from collections import deque
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
im = Image.open(src).convert("RGB"); W0, H0 = im.size; KEY = (255, 0, 255)
for seed in [(2, 2), (W0 - 3, 2), (2, H0 - 3), (W0 - 3, H0 - 3), (W0 // 2, 2), (W0 // 2, H0 - 3)]:
    if im.getpixel(seed) != KEY: ImageDraw.floodfill(im, seed, KEY, thresh=46)
a = np.array(im); bg = (a[:, :, 0] == 255) & (a[:, :, 1] == 0) & (a[:, :, 2] == 255)
bg[:170, :330] = True   # marca de agua del generador
rgba = np.dstack([a, np.where(bg, 0, 255).astype(np.uint8)]); img = Image.fromarray(rgba, "RGBA"); img = img.crop(img.getbbox())
# quita la sombra gris del suelo (la escena pone la suya): gris claro sin saturar por debajo de las zapatillas
arr = np.array(img); H, W = arr.shape[:2]; rgb = arr[:, :, :3].astype(int); alpha = arr[:, :, 3]
light = (rgb.min(axis=2) > 175) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 14)
low = np.zeros((H, W), bool); low[int(H * 0.965):, :] = True; arr[light & low, 3] = 0
img = Image.fromarray(arr, "RGBA"); img = img.crop(img.getbbox()); arr = np.array(img); H, W = arr.shape[:2]; rgb = arr[:, :, :3].astype(int); alpha = arr[:, :, 3]
# cabeza: interior blanco conectado desde el centro de la cara
white = (rgb.min(axis=2) > 235) & (alpha > 0); sx, sy = W // 2, int(H * 0.2)
mask = np.zeros((H, W), bool); q = deque([(sx, sy)]); mask[sy, sx] = True
while q:
    x, y = q.popleft()
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < W and 0 <= ny < H and white[ny, nx] and not mask[ny, nx]: mask[ny, nx] = True; q.append((nx, ny))
ys, xs = np.where(mask); cx, cy, r = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2, (xs.max() - xs.min()) / 2
yy, xx = np.mgrid[0:H, 0:W]; R = r + 17
disc = ((xx - cx) ** 2 + (yy - cy) ** 2) < R ** 2
ears = (((xx < cx - r + 40) | (xx > cx + r - 40)) & (yy > cy - 0.35 * r) & (yy < cy + 1.05 * r)) & (np.abs(xx - cx) < r * 1.32) & (alpha > 0)   # orejas + aros
headmask = (disc | ears) & (alpha > 0); headmask[int(cy + r * 1.05):, :] = False
dark = rgb.max(axis=2) < 80; inner = ((xx - cx) ** 2 + (yy - cy) ** 2) < (r - 10) ** 2; face = dark & inner & (yy > cy - r * 0.45)
fr = np.where(face.any(axis=1))[0]; fc = np.where(face.any(axis=0))[0]
brow_y0, eye_y1 = fr.min(), fr.max(); gaps = [(fr[i], fr[i + 1]) for i in range(len(fr) - 1) if fr[i + 1] - fr[i] > 3]; brow_y1, eye_y0 = (gaps[0] if gaps else (brow_y0 + 60, brow_y0 + 70))
# HEAD (sin ojos ni cejas) y TORSO (sin cabeza; hueco bajo la barbilla relleno de capucha)
head = arr.copy(); head[~headmask] = 0
block = inner & (yy >= brow_y0 - 26) & (yy <= eye_y1 + 26) & (xx >= cx - r * 0.84) & (xx <= cx + r * 0.84); head[block & headmask] = [255, 255, 255, 255]   # borra ojos y cejas con su halo de antialias
ys2, xs2 = np.where(head[:, :, 3] > 0); hb = (xs2.min(), ys2.min(), xs2.max() + 1, ys2.max() + 1)
torso = arr.copy(); torso[headmask] = 0
under = disc & (yy > cy + r * 0.35) & (alpha > 0); torso[under] = [26, 26, 30, 255]
Image.fromarray(torso, "RGBA").save(f"{out}/torso.png"); Image.fromarray(head, "RGBA").crop(hb).save(f"{out}/head.png")
# CARA: lienzo común (ojos/cejas y boca comparten caja y centro)
fx0, fx1, fy0, fy1 = int(cx - r * 0.82), int(cx + r * 0.82), int(brow_y0 - 24), int(cy + r * 0.95); FW, FH = fx1 - fx0, fy1 - fy0
base = np.zeros((FH, FW, 4), np.uint8); sub = face[fy0:fy1, fx0:fx1]; base[sub] = [14, 14, 18, 255]
def comp(y0, y1, left):
    c = base.copy(); sel = np.zeros((FH, FW), bool); sel[max(0, y0 - fy0):y1 - fy0 + 1, (0 if left else FW // 2 + int(cx - fx0 - FW // 2)):((int(cx - fx0)) if left else FW)] = True
    out_ = np.zeros_like(c); out_[sel & sub] = [14, 14, 18, 255]; return Image.fromarray(out_, "RGBA")
bl, br = comp(brow_y0, brow_y1, True), comp(brow_y0, brow_y1, False); el, er = comp(eye_y0, eye_y1, True), comp(eye_y0, eye_y1, False)
def shifted(i, dx=0, dy=0, sx=1.0, sy=1.0, flip=False, rot=0):
    bb = i.getbbox(); 
    if not bb: return i
    piece = i.crop(bb)
    if flip: piece = piece.transpose(Image.FLIP_LEFT_RIGHT)
    if sx != 1 or sy != 1: piece = piece.resize((max(1, int(piece.width * sx)), max(1, int(piece.height * sy))), Image.LANCZOS)
    if rot: piece = piece.rotate(rot, expand=True, resample=Image.BICUBIC)
    o = Image.new("RGBA", i.size, (0, 0, 0, 0)); ccx, ccy = (bb[0] + bb[2]) // 2 + dx, (bb[1] + bb[3]) // 2 + dy; o.alpha_composite(piece, (ccx - piece.width // 2, ccy - piece.height // 2)); return o
def arcs(i, up=True):   # ojos cerrados / sonrientes: un arco por ojo
    o = Image.new("RGBA", i.size, (0, 0, 0, 0)); d = ImageDraw.Draw(o)
    for e in (el, er):
        bb = e.getbbox(); 
        if not bb: continue
        w = bb[2] - bb[0]; cxx = (bb[0] + bb[2]) // 2; cyy = (bb[1] + bb[3]) // 2
        d.arc([cxx - w * 0.6, cyy - w * 0.35, cxx + w * 0.6, cyy + w * 0.35], 200 if up else 20, 340 if up else 160, fill=(14, 14, 18, 255), width=16)
    return o
def comb(*ims):
    o = Image.new("RGBA", ims[0].size, (0, 0, 0, 0))
    for i in ims: o.alpha_composite(i)
    return o
E = {}
E["neutral"] = comb(bl, br, el, er)
E["closed"] = comb(bl, br, arcs(el, False))
E["happy"] = comb(shifted(bl, dy=-14), shifted(br, dy=-14), arcs(el, True))
E["relieved"] = comb(shifted(bl, dy=-4, flip=True), shifted(br, dy=-4, flip=True), arcs(el, False))
E["surprised"] = comb(shifted(bl, dy=-30), shifted(br, dy=-30), shifted(el, sx=1.2, sy=1.25), shifted(er, sx=1.2, sy=1.25))
E["scared"] = comb(shifted(bl, dy=-22, flip=True), shifted(br, dy=-22, flip=True), shifted(el, sx=1.15, sy=1.3), shifted(er, sx=1.15, sy=1.3))
E["worried"] = comb(shifted(bl, dy=-10, flip=True), shifted(br, dy=-10, flip=True), shifted(el, dy=6), shifted(er, dy=6))
E["sad"] = comb(shifted(bl, dy=-8, flip=True), shifted(br, dy=-8, flip=True), shifted(el, dy=10, sy=0.85), shifted(er, dy=10, sy=0.85))
E["embarrassed"] = comb(shifted(bl, dy=-6, flip=True), shifted(br, dy=-6, flip=True), shifted(el, dx=-8, dy=12), shifted(er, dx=-8, dy=12))
E["uncomfortable"] = comb(shifted(bl, dy=-6, flip=True), shifted(br, dy=2), shifted(el, dx=10, dy=4), shifted(er, dx=10, dy=4))
E["thinking"] = comb(shifted(bl, dy=-24), br, shifted(el, dx=12, dy=-10), shifted(er, dx=12, dy=-10))
E["confused"] = comb(shifted(bl, dy=8), shifted(br, dy=-26, flip=True), el, er)
E["curious"] = comb(bl, shifted(br, dy=-20), shifted(el, dx=10), shifted(er, dx=10))
E["bored"] = comb(shifted(bl, dy=6), shifted(br, dy=6), shifted(el, sy=0.5, dy=6), shifted(er, sy=0.5, dy=6))
E["angry"] = comb(shifted(bl, dy=12), shifted(br, dy=12), shifted(el, sy=0.85, dy=8), shifted(er, sy=0.85, dy=8))
# BOCAS (la referencia no tiene boca: se dibuja una sencilla, mismo trazo): reposo por expresión y visemas al hablar
mcx, mcy = FW // 2, int((cy + r * 0.5) - fy0); INK = (14, 14, 18, 255); RED = (110, 36, 48, 255)
def mouth(draw_fn): o = Image.new("RGBA", (FW, FH), (0, 0, 0, 0)); draw_fn(ImageDraw.Draw(o)); return o
def ell(rx, ry, fill=RED): return lambda d: d.ellipse([mcx - rx, mcy - ry, mcx + rx, mcy + ry], fill=fill, outline=INK, width=9)
def line(w, dy=0): return lambda d: d.line([mcx - w, mcy + dy, mcx + w, mcy + dy], fill=INK, width=11)
def arc(w, h, up): return lambda d: d.arc([mcx - w, mcy - h, mcx + w, mcy + h], 20 if up else 200, 160 if up else 340, fill=INK, width=11)
M = {"rest": mouth(lambda d: None), "A": mouth(ell(40, 36)), "E": mouth(ell(46, 20)), "I": mouth(ell(44, 12)), "O": mouth(ell(24, 28)), "U": mouth(ell(18, 20)), "WQ": mouth(ell(16, 16)), "FV": mouth(line(34)), "MBP": mouth(line(32)), "L": mouth(ell(32, 18))}
R_ = {"happy": mouth(arc(56, 40, True)), "relieved": mouth(arc(38, 24, True)), "curious": mouth(arc(34, 22, True)), "sad": mouth(arc(44, 28, False)), "worried": mouth(arc(40, 22, False)), "embarrassed": mouth(lambda d: d.line([mcx - 40, mcy, mcx - 20, mcy - 10, mcx, mcy + 4, mcx + 20, mcy - 10, mcx + 40, mcy], fill=INK, width=10)),
      "surprised": mouth(ell(22, 30)), "scared": mouth(ell(26, 34)), "confused": mouth(lambda d: d.line([mcx - 40, mcy + 4, mcx - 14, mcy - 8, mcx + 14, mcy + 10, mcx + 40, mcy - 4], fill=INK, width=10)), "thinking": mouth(line(26)), "bored": mouth(line(36)), "uncomfortable": mouth(lambda d: d.line([mcx - 40, mcy, mcx - 20, mcy + 10, mcx, mcy - 10, mcx + 20, mcy + 10, mcx + 40, mcy], fill=INK, width=10)), "angry": mouth(line(36))}
for k, v in E.items(): v.save(f"{out}/eyes-{k}.png")
for k, v in M.items(): v.save(f"{out}/mouth-{k}.png")
for k, v in R_.items(): v.save(f"{out}/mouth-rest-{k}.png")
rig = {"size": [W, H], "head": {"box": [int(hb[0]), int(hb[1]), int(hb[2]), int(hb[3])], "pivot": [float(cx), float(cy + r * 1.0)]}, "face": {"center": [float(fx0 + FW / 2), float(fy0 + FH / 2)], "size": [FW, FH]}, "feet": [W / 2, H], "eyes": sorted(E), "mouths": sorted(M), "restMouths": sorted(R_)}
json.dump(rig, open(f"{out}/rig.json", "w"), indent=1); print(rig["size"], rig["head"], rig["face"])
