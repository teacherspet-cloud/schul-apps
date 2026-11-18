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


def teile_hart(im, spalten, zeilen):
    w, h = im.size
    for j in range(zeilen):
        for i in range(spalten):
            yield im.crop((i * w // spalten, j * h // zeilen, (i + 1) * w // spalten, (j + 1) * h // zeilen))


def teile(im, spalten, zeilen):
    """Bogen in Felder zerlegen, OHNE Hände, Füße oder Waffen an der Feldgrenze abzuschneiden (18.11.2026: am Beamer
    fehlten Fuß/Hand). Zusammenhängende Teile gehören ganz zu dem Feld, in dem der größte Teil von ihnen liegt. Berühren
    sich zwei Posen (ein Teil liegt zu ≥ 30 % in einem zweiten Feld), wird dieses Teil wie früher an der Grenze geteilt."""
    from collections import deque
    w, h = im.size
    al = np.asarray(im.getchannel("A"))
    K = 4
    hk, wk = h // K, w // K
    grob = (al[: hk * K, : wk * K] > 20).reshape(hk, K, wk, K).any(axis=(1, 3))
    feld_y = np.minimum((np.arange(hk) * K) * zeilen // h, zeilen - 1)
    feld_x = np.minimum((np.arange(wk) * K) * spalten // w, spalten - 1)
    feld = feld_y[:, None] * spalten + feld_x[None, :]
    lab = np.zeros((hk, wk), np.int32)
    zelle_feld = np.full((hk, wk), -1, np.int32)  # Zuordnung je Rasterzelle
    n = 0
    for y0 in range(hk):
        for x0 in range(wk):
            if not grob[y0, x0] or lab[y0, x0]:
                continue
            n += 1
            q = deque([(y0, x0)]); lab[y0, x0] = n; zellen = []
            while q:
                y, x = q.popleft(); zellen.append((y, x))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < hk and 0 <= xx < wk and grob[yy, xx] and not lab[yy, xx]:
                            lab[yy, xx] = n; q.append((yy, xx))
            ys, xs = np.array([z[0] for z in zellen]), np.array([z[1] for z in zellen])
            f = feld[ys, xs]
            anteile = np.bincount(f, minlength=spalten * zeilen) / len(f)
            haupt = int(anteile.argmax())
            if np.sort(anteile)[-2] >= 0.3:
                zelle_feld[ys, xs] = f  # zwei Posen berühren sich: an der Grenze teilen
            else:
                zelle_feld[ys, xs] = haupt
    voll = np.full((h, w), -1, np.int32)
    voll[: hk * K, : wk * K] = np.repeat(np.repeat(zelle_feld, K, 0), K, 1)
    for j in range(zeilen):
        for i in range(spalten):
            nr = j * spalten + i
            a = np.where(voll == nr, al, 0).astype(np.uint8)
            t = im.copy()
            t.putalpha(Image.fromarray(a))
            # Ausschnitt: das eigene Feld, erweitert um alles, was diesem Feld zugeordnet ist
            ys, xs = np.where(a > 20)
            x0, y0, x1, y1 = i * w // spalten, j * h // zeilen, (i + 1) * w // spalten, (j + 1) * h // zeilen
            if len(xs):
                x0, y0, x1, y1 = min(x0, xs.min()), min(y0, ys.min()), max(x1, xs.max() + 1), max(y1, ys.max() + 1)
            yield t.crop((x0, y0, x1, y1))


POSEN4 = ["ruhe", "angriff", "getroffen", "besiegt"]
# Begleiter (Ausrüstung Stufe 3) – Reihenfolge wie im Motivkatalog
BEGLEITER = {"begleiter-a": ["eule", "minidrache", "roboter", "fuchs"], "begleiter-b": ["stern", "greif", "qualle", "schildkroete"]}
for datei in sorted(os.listdir(ROH)):
    if not datei.endswith(".png"):
        continue
    name = datei[:-4]
    im = Image.open(os.path.join(ROH, datei))
    if name == "arena" or name.startswith("hg-") or name.startswith("szene-"):
        # Hintergründe: auf 1600 px Breite, ohne Freistellen
        bild = im.convert("RGB")
        if bild.width > 1600:
            bild = bild.resize((1600, round(bild.height * 1600 / bild.width)), Image.LANCZOS)
        bild.save(os.path.join(ZIEL, ("hg-burgarena" if name == "arena" else name) + ".webp"), quality=82)
        print(name)
        continue
    frei = freistellen(im)
    if name.startswith("phase-"):
        teile_ = zip(["ruestung", "raserei"], teile(frei, 2, 1))
        name = "boss-" + name[6:]
    elif name in BEGLEITER:
        teile_ = zip(BEGLEITER[name], teile(frei, 2, 2))
        name = "begleiter"
    elif name.startswith("rolle-"):
        teile_ = zip(["rolle1", "rolle2"], teile(frei, 2, 1))
        name = "held-" + name[6:]
    elif name.startswith("bewegung-"):
        # Klassenspiele (18.11.2026): vier Posen je Figur
        teile_ = zip(["klettern", "ziehen", "laufen", "jubeln"], teile(frei, 2, 2))
        name = "held-" + name[9:]
    elif name.startswith("lager-"):
        teile_ = zip(["lager", "fahne", "gipfel", "sturm"], teile(frei, 2, 2))
        name = "ex-" + name[6:]
    elif name in ("fahnen-a", "fahnen-b"):
        teile_ = zip(["rot", "blau", "teal", "gelb"] if name == "fahnen-a" else ["lila", "orange", "weiss", "blitz"], teile(frei, 2, 2))
        name = "fahne"
    elif name in ("requisiten-a", "requisiten-b"):
        teile_ = zip(["seil", "ziel", "staub", "pokal"] if name == "requisiten-a" else ["tisch", "podest", "geist", "konfetti"], teile(frei, 2, 2))
        name = "req"
    elif name.startswith("spezial-"):
        teile_ = [("spezial", frei)]
        name = "held-" + name[8:]
    elif name == "effekte":
        teile_ = zip(["kugel", "schild", "stern", "hieb"], teile(frei, 2, 2))
    else:
        teile_ = zip(POSEN4, teile(frei, 2, 2))
    for pose, t in teile_:
        if os.path.exists(os.path.join(ZIEL, f"{name}-{pose}.webp")):
            continue
        z = zuschneiden(t)
        z.save(os.path.join(ZIEL, f"{name}-{pose}.webp"), quality=88, method=4)
        print(name, pose, z.size)
