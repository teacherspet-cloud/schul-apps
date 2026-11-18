"""Spielbilder verkleinern (18.11.2026, Plan cozy-pondering-cat): Exe und iPad-App tragen alle Bilder mit – der volle
Bestand wäre sonst weit über 100 MB. Gezeigt werden die Figuren am Beamer höchstens etwa 36 % der Arena hoch (Full HD
≈ 330 px), Monster etwa 60 % – darum:
  Figuren, Begleiter, Effekte, Requisiten: höchstens 512 px hoch    Monster (boss-): höchstens 640 px hoch
  Hintergründe (hg-, szene-): höchstens 1600 px breit
Neu kodiert wird als WebP (Qualität 70 – im Vergleich mit dem Original kein sichtbarer Unterschied); übernommen wird das Ergebnis nur, wenn es kleiner ist. Mehrfach ausführbar:
Bereits verkleinerte Bilder bleiben (fast) gleich und werden dann nicht ersetzt.

  python -I scripts/bossbilder/verkleinern.py [ordner]   (Vorgabe: src/renderer/src/assets/klassenspiele/boss)
"""
import io
import os
import sys
from concurrent.futures import ProcessPoolExecutor

from PIL import Image

HIER = os.path.dirname(os.path.abspath(__file__))
ORDNER = sys.argv[1] if len(sys.argv) > 1 else os.path.normpath(os.path.join(HIER, '..', '..', 'src', 'renderer', 'src', 'assets', 'klassenspiele', 'boss'))
QUALITAET = 70


def grenze(name):
    if name.startswith(('hg-', 'szene-')):
        return ('breite', 1600)
    if name.startswith('boss-'):
        return ('hoehe', 640)
    return ('hoehe', 512)


def eines(pfad):
    name = os.path.basename(pfad)
    vorher = os.path.getsize(pfad)
    im = Image.open(pfad)
    im.load()
    art, mass = grenze(name)
    if art == 'breite' and im.width > mass:
        im = im.resize((mass, round(im.height * mass / im.width)), Image.LANCZOS)
    elif art == 'hoehe' and im.height > mass:
        im = im.resize((round(im.width * mass / im.height), mass), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=QUALITAET, method=4)
    neu = buf.getvalue()
    # Nur deutlich kleiner lohnt (sonst bei jedem Lauf erneute Verluste)
    if len(neu) < vorher * 0.9:
        with open(pfad, 'wb') as f:
            f.write(neu)
        return vorher, len(neu)
    return vorher, vorher


if __name__ == '__main__':
    dateien = [os.path.join(ORDNER, f) for f in sorted(os.listdir(ORDNER)) if f.endswith('.webp')]
    with ProcessPoolExecutor() as p:
        erg = list(p.map(eines, dateien, chunksize=16))
    a = sum(x for x, _ in erg)
    b = sum(y for _, y in erg)
    print(f'{len(dateien)} Bilder: {a / 1e6:.1f} MB -> {b / 1e6:.1f} MB ({sum(1 for x, y in erg if y < x)} ersetzt)')
