"""Zusätzliche Figuren mit hellen Hauttönen (18.11.2026, Wunsch der Lehrkraft): In den fertigen Bildern fielen „helle"
Hauttöne oft eher gebräunt aus. Je Band (5–6, 7–8, 9–10, 11–13):
  - 3 weitere Tanks und 3 weitere Heiler (ohne Rollstuhl) mit ausdrücklich sehr heller Haut,
  - 3 Figuren im Rollstuhl mit heller Haut: ein Tank, ein Heiler, ein Angreifer.
Jede Figur: Grundbogen (4 Posen) → Rollenbogen (Tank/Heiler) bzw. Spezialangriff (Angreifer) → Bewegungsbogen
(klettern, ziehen, laufen, jubeln), jeweils mit dem Grundbogen als Vorlage.

  python -I katalog_extra.py <ausgabeordner>   → <name>.txt, auftraege-extra.txt (Grundbögen/Rollen) und
                                                   auftraege-extra-bewegung.txt (Bewegungsbögen, ans Ende des Laufs)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from katalog import BAENDER  # noqa: E402
from katalog_rollen import GRUEN, rollenbogen, spezialbild  # noqa: E402
from katalog_szenen import bewegung  # noqa: E402

HELL = [
    ("girl", "very fair, pale skin with light freckles, long wavy red hair"),
    ("boy", "very fair, pale skin, messy light-blond hair"),
    ("girl", "very fair skin with rosy cheeks, a platinum-blonde bob"),
    ("boy", "pale skin with many freckles, short ginger hair"),
    ("girl", "very fair, pale skin, a long light-brown braid"),
    ("boy", "pale skin, wavy dark-brown hair and round glasses"),
    ("girl", "very fair skin, a high blonde ponytail"),
    ("boy", "pale skin with rosy cheeks, short curly auburn hair"),
    ("girl", "very fair skin with freckles, two light-brown buns"),
]

TANKS = [
    ("glanzschild", "a knight with a polished mirror-like round shield and a short sword", "silver and sky blue"),
    ("bergwacht", "a mountain guardian with a big wooden shield banded with iron and a fur collar", "brown and dark red"),
    ("wellenwall", "a defender with a shield shaped like a curling ocean wave and a short trident", "navy and white"),
]
HEILER = [
    ("taukraut", "a healer with a staff of glowing dewdrops and a cape with leaf patterns (leaves in gold and orange)", "cream and gold"),
    ("glockenheiler", "a healer with small golden chime bells that ring out rings of healing light", "lavender and gold"),
    ("nordlicht", "a healer whose hands glow with soft aurora light in pink and violet", "white and violet"),
]
ROLLSTUHL = [
    ("tank", "schildrad", "a defender in a sturdy armoured wheelchair with a large shield mounted at the front of the chair and a short mace", "steel grey and royal blue",
     "a shield bash forward to the right with the mounted shield, shockwave"),
    ("heiler", "lichtrad", "a healer in a wheelchair with softly glowing golden wheels, holding a staff topped with a sun disc", "white and gold",
     "sending a radiant healing light toward the right while seated (not an attack)"),
    ("angreifer", "sternenrad", "a star mage in a sleek wheelchair with a wand and a cape of small stars", "midnight blue and silver",
     "firing a bright beam of starlight from the wand to the right while seated"),
]


def person(b, geschlecht):
    return {"56": geschlecht, "78": f"teen {geschlecht}", "910": f"teenage {geschlecht}", "1113": "young woman" if geschlecht == "girl" else "young man"}[b]


def grundbogen(b, look, beschr, farben, angriff, rollstuhl):
    st = BAENDER[b]
    geschlecht, aussehen = look
    if rollstuhl:
        getroffen = "getting hit: the wheelchair tilting back on two wheels, the hero bracing with eyes squeezed shut, cartoon impact (no blood)"
        besiegt = "defeated: slumped exhausted and dizzy in the wheelchair, dizzy stars above the head (still sitting in the chair)"
    else:
        getroffen = "getting hit, recoiling backward to the left, eyes squeezed shut, cartoon impact (no blood)"
        besiegt = "defeated, sitting on the ground exhausted and dizzy"
    return f"""Character sheet for a classroom video game, {st['stil']}.
The character: a {person(b, geschlecht)}, {st['alter']}, {aussehen} (the skin must clearly look very light / pale, not tanned); {beschr}; clothing colours {farben}. Determined, likeable expression. Full body{'' if rollstuhl else ', shoes visible'}.
Layout: exactly four poses of the SAME character arranged in a 2x2 grid, one pose centred in each quadrant, full body, every pose facing to the RIGHT (three-quarter view toward the right side), generous empty space around each pose, no part of a pose crossing into another quadrant:
top-left: idle battle stance, ready and confident{' (seated in the wheelchair)' if rollstuhl else ''};
top-right: {angriff};
bottom-left: {getroffen};
bottom-right: {besiegt}.
{GRUEN}"""


def katalog():
    grund, folge, beweg = [], [], []
    for bandnr, b in enumerate(["78", "910", "56", "1113"]):
        k = 0
        looks = HELL[bandnr * 2:] + HELL[:bandnr * 2]
        for rid, beschr, farben in TANKS:
            fid = f"tank-{rid}-{b}"
            grund.append((f"held-{fid}", grundbogen(b, looks[k % 9], beschr, farben, "a shield bash toward the right with a shockwave", False), None))
            folge.append((f"rolle-{fid}", rollenbogen("raising the shield high in front of the body, bracing against an impact from the right, a glowing protective barrier in front of the shield",
                                                     "kneeling down behind the shield, the barrier cracking, but still holding on"), f"held-{fid}"))
            beweg.append((f"bewegung-{fid}", bewegung(False), f"held-{fid}"))
            k += 1
        for rid, beschr, farben in HEILER:
            fid = f"heiler-{rid}-{b}"
            grund.append((f"held-{fid}", grundbogen(b, looks[k % 9], beschr, farben, "sending a radiant healing light toward the right (not an attack)", False), None))
            folge.append((f"rolle-{fid}", rollenbogen("casting a healing spell with both hands raised, soft golden-white light and small sparkles rising upward (not green)",
                                                     "releasing a big circular wave of warm healing light around the body"), f"held-{fid}"))
            beweg.append((f"bewegung-{fid}", bewegung(False), f"held-{fid}"))
            k += 1
        for rolle, rid, beschr, farben, angriff in ROLLSTUHL:
            fid = f"rollstuhl-{rid}-{b}" if rolle == "angreifer" else f"{rolle}-rollstuhl-{rid}-{b}"
            grund.append((f"held-{fid}", grundbogen(b, looks[k % 9], beschr, farben, angriff, True), None))
            if rolle == "tank":
                folge.append((f"rolle-{fid}", rollenbogen("raising the mounted shield high in front of the wheelchair, bracing against an impact from the right, a glowing protective barrier in front of the shield",
                                                         "ducking low in the wheelchair behind the shield, the barrier cracking, but still holding on"), f"held-{fid}"))
            elif rolle == "heiler":
                folge.append((f"rolle-{fid}", rollenbogen("casting a healing spell with both hands raised while seated in the wheelchair, soft golden-white light and small sparkles rising upward (not green)",
                                                         "releasing a big circular wave of warm healing light around the wheelchair"), f"held-{fid}"))
            else:
                folge.append((f"spezial-{fid}", spezialbild(), f"held-{fid}"))
            beweg.append((f"bewegung-{fid}", bewegung(True), f"held-{fid}"))
            k += 1
    return grund + folge, beweg


if __name__ == "__main__":
    ziel = sys.argv[1]
    os.makedirs(ziel, exist_ok=True)
    vorn, hinten = katalog()
    for datei, liste in (("auftraege-extra.txt", vorn), ("auftraege-extra-bewegung.txt", hinten)):
        with open(os.path.join(ziel, datei), "w", newline="\n", encoding="utf-8") as f:
            for name, text, ref in liste:
                f.write(f"{name}|{ref or ''}\n")
                with open(os.path.join(ziel, f"{name}.txt"), "w", newline="\n", encoding="utf-8") as g:
                    g.write(text)
    print(len(vorn), "Grund-/Rollenbögen,", len(hinten), "Bewegungsbögen")
