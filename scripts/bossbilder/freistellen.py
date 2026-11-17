"""Grün freistellen, Bögen in Posen zerlegen, auf Inhalt zuschneiden, als WebP mit Alpha speichern.
python -I freistellen.py <roh-ordner> <ziel-ordner>"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter

ROH, ZIEL = sys.argv[1], sys.argv[2]
os.makedirs(ZIEL, exist_ok=True)


def freistellen(im):
    a = np.asarray(im.convert("RGBA")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    gruen = g - np.maximum(r, b)  # wie stark grün
    alpha = 1 - np.clip((gruen - 25) / (75 - 25), 0, 1)
    # Manche Bilder kommen schon mit durchsichtigem Hintergrund: beide Masken verbinden
    alpha = np.minimum(alpha, a[..., 3] / 255)
    # Grünstich an Kanten entfernen
    g2 = np.where(gruen > 0, np.maximum(r, b) + np.clip(gruen, 0, None) * 0.15, g)
    out = np.dstack([r, np.minimum(g, g2), b, alpha * 255]).astype(np.uint8)
    o = Image.fromarray(out, "RGBA")
    # Ein Pixel Kante weich
    al = o.getchannel("A").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    o.putalpha(al)
    return o


def splitter_weg(im):
    """Teile, die vom Rand des Bogenfelds hereinragen und klein sind (Reste der Nachbarpose), entfernen."""
    from collections import deque
    al = np.asarray(im.getchannel("A")).copy()
    K = 4  # Raster 4×4 Pixel; Nachbarschaft mit 2 Zellen Abstand (≈ 8 px Lücke gilt noch als zusammenhängend)
    h, w = al.shape
    hk, wk = h // K, w // K
    grob = (al[: hk * K, : wk * K] > 20).reshape(hk, K, wk, K).any(axis=(1, 3))
    lab = np.zeros((hk, wk), np.int32)
    groessen, randteile, n = [], set(), 0
    for y0 in range(hk):
        for x0 in range(wk):
            if not grob[y0, x0] or lab[y0, x0]:
                continue
            n += 1
            q = deque([(y0, x0)]); lab[y0, x0] = n; g = 0
            while q:
                y, x = q.popleft(); g += 1
                if y == 0 or x == 0 or y == hk - 1 or x == wk - 1:
                    randteile.add(n)
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < hk and 0 <= xx < wk and grob[yy, xx] and not lab[yy, xx]:
                            lab[yy, xx] = n; q.append((yy, xx))
            groessen.append(g)
    if n <= 1:
        return im
    gross = max(groessen)
    weg = np.zeros((hk, wk), bool)
    for i, g in enumerate(groessen, start=1):
        if g < gross * 0.02 or (i in randteile and g < gross * 0.35):
            weg |= lab == i
    voll = np.zeros((h, w), bool)
    voll[: hk * K, : wk * K] = np.repeat(np.repeat(weg, K, 0), K, 1)
    al[voll] = 0
    im = im.copy()
    im.putalpha(Image.fromarray(al))
    return im


def zuschneiden(im, rand=12):
    im = splitter_weg(im)
    al = np.asarray(im.getchannel("A"))
    ys, xs = np.where(al > 20)
    if not len(xs):
        return im
    # Kleine Splitter (Ränder anderer Posen) ignorieren: nur Zeilen/Spalten mit genug Inhalt
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    return im.crop((max(0, x0 - rand), max(0, y0 - rand), min(im.width, x1 + rand), min(im.height, y1 + rand)))


def teile(im, spalten, zeilen):
    w, h = im.size
    for j in range(zeilen):
        for i in range(spalten):
            yield im.crop((i * w // spalten, j * h // zeilen, (i + 1) * w // spalten, (j + 1) * h // zeilen))


POSEN4 = ["ruhe", "angriff", "getroffen", "besiegt"]
for datei in sorted(os.listdir(ROH)):
    if not datei.endswith(".png"):
        continue
    name = datei[:-4]
    im = Image.open(os.path.join(ROH, datei))
    if name == "arena":
        im.convert("RGB").save(os.path.join(ZIEL, "arena.webp"), quality=84)
        continue
    frei = freistellen(im)
    if name.startswith("phase-"):
        teile_ = zip(["ruestung", "raserei"], teile(frei, 2, 1))
        name = "boss-" + name[6:]
    elif name == "effekte":
        teile_ = zip(["kugel", "schild", "stern", "hieb"], teile(frei, 2, 2))
    else:
        teile_ = zip(POSEN4, teile(frei, 2, 2))
    for pose, t in teile_:
        z = zuschneiden(t)
        z.save(os.path.join(ZIEL, f"{name}-{pose}.webp"), quality=88, method=4)
        print(name, pose, z.size)
