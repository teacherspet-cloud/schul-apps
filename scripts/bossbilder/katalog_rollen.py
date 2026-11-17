"""Rollenfiguren und Spezialposen für den Boss-Kampf mit Rollen (17.11.2026, abgestimmt mit der Lehrkraft).

- Je Band 12 Tank- und 12 Heiler-Figuren: Bogen mit den vier Grundposen + zweiter Bogen mit zwei Rollenposen
  (Tank: Schild hochhalten / unter dem Schild in die Knie; Heiler: Heilzauber / große Heilwelle), mit Vorlage.
- Alle normalen Figuren (Angreifer) bekommen eine Spezialangriff-Pose (eigenes Bild, mit Vorlage des Grundbogens).

  python -I katalog_rollen.py <ausgabeordner>   → <name>.txt, auftraege-rollen.txt (Zeilen „name|vorlage"), katalog-rollen.json
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from katalog import ARCHETYPEN, BAENDER, SCHON_56, aussehen  # noqa: E402

GRUEN = ("Background: one completely flat, uniform, solid chroma-key green (#00B140) everywhere, no gradient, no floor, no cast shadows, "
         "no ground line, no vignette. Do not use any green on the character.\n"
         "Absolutely no text, letters, numbers, labels, frames, grid lines, logos or watermark. Not a copy of any existing game, film or franchise character.")

TANKS = [
    ("schildritter", "a heavily armoured knight with a huge rectangular tower shield and a short sword", "steel grey and royal blue"),
    ("waechter", "a guardian with a glowing round energy shield projected from a bracer", "white and electric blue"),
    ("bollwerk", "a broad-shouldered defender in thick plate armour with a large kite shield and a mace", "bronze and dark red"),
    ("felsenherz", "a sturdy defender wearing stone-like armour plates with a big stone shield", "slate grey and amber"),
    ("panzerbot", "a hero in a chunky protective robot suit with a deployable shield plate on one arm", "orange and gunmetal"),
    ("kristallwall", "a defender holding a large shield made of glowing crystal", "violet and silver"),
    ("schildkroete", "a defender in armour shaped like a turtle shell with a matching round shield", "teal-blue and sand"),
    ("eisenfaust", "a defender with two huge armoured gauntlets that form a shield when crossed", "black and gold"),
    ("sonnenschild", "a paladin-like defender with a golden sun-emblem shield (no letters) and a short lance", "white and gold"),
    ("sturmwall", "a defender with a big shield crackling with lightning", "navy and yellow"),
    ("wurzelwacht", "a nature defender with a shield grown from wood and golden leaves", "brown and orange"),
    ("nebelwacht", "a defender in a long coat with a shimmering misty shield", "midnight blue and pale cyan"),
]
HEILER = [
    ("lichtheiler", "a healer with a golden staff topped by a shining sun disc", "white and gold"),
    ("sani", "a modern adventure medic with a glowing first-aid backpack and bandage scroll", "red and white"),
    ("kraeuterkundige", "an herbalist with a satchel of glowing herbs and a mortar", "brown and lavender"),
    ("wasserheiler", "a healer who bends floating orbs of clear healing water", "aqua blue and white"),
    ("sternenheiler", "a healer with a staff of starlight and a cape of small stars", "midnight blue and silver"),
    ("sangesheiler", "a healer who sings, with a small golden harp, musical light notes around", "rose and gold"),
    ("blumenheiler", "a healer with a staff of blooming flowers (petals in pink and yellow)", "pink and cream"),
    ("techheiler", "a healer with a small floating healing drone and a scanner bracelet", "silver and turquoise"),
    ("mondheiler", "a healer with a crescent-moon staff and soft silver light", "pale violet and silver"),
    ("feuerheiler", "a healer of warm phoenix-like light with a feathered cloak (not burning)", "orange and gold"),
    ("kristallheiler", "a healer holding a glowing pink healing crystal", "magenta and white"),
    ("windheiler", "a healer whose light wind ribbons carry glowing sparkles", "sky blue and white"),
]


def grundbogen(b, rolle_id, beschr, farben, i, bandnr, angriff, getroffen, besiegt):
    st = BAENDER[b]
    geschlecht, look = aussehen(i + 11, bandnr)
    person = {"56": geschlecht, "78": f"teen {geschlecht}", "910": f"teenage {geschlecht}", "1113": "young woman" if geschlecht == "girl" else "young man"}[b]
    return f"""Character sheet for a classroom video game, {st['stil']}.
The character: a {person}, {st['alter']}, {look}; {beschr}; clothing colours {farben}. Determined, likeable expression. Full body, shoes visible.
Layout: exactly four poses of the SAME character arranged in a 2x2 grid, one pose centred in each quadrant, full body, every pose facing to the RIGHT (three-quarter view toward the right side), generous empty space around each pose, no part of a pose crossing into another quadrant:
top-left: idle battle stance, ready and confident;
top-right: {angriff};
bottom-left: {getroffen};
bottom-right: {besiegt}.
{GRUEN}"""


def rollenbogen(links, rechts):
    return f"""The attached image shows a character sheet. Draw the EXACT same character (same face, hair, clothes, colours, proportions and art style) as a new image with two poses side by side, left half and right half, both full body facing to the RIGHT, generous empty space around each, nothing crossing the middle:
left: {links};
right: {rechts}.
{GRUEN}"""


def spezialbild():
    return f"""The attached image shows a character sheet. Draw the EXACT same character (same face, hair, clothes, colours, proportions and art style) as ONE new full-body pose, centred with generous empty space: a powerful special attack toward the RIGHT, dynamic heroic action with a big bright energy effect in the character's own colours (never green), the strongest move of the character.
{GRUEN}"""


def katalog():
    auftraege, eintraege = [], {"tanks": [], "heiler": [], "spezial": []}
    reihenfolge = ["78", "910", "1113", "56"]
    for b in reihenfolge:
        bandnr = ["56", "78", "910", "1113"].index(b)
        for i, (rid, beschr, farben) in enumerate(TANKS):
            fid = f"tank-{rid}-{b}"
            auftraege.append((f"held-{fid}", grundbogen(b, rid, beschr, farben, i, bandnr, "a shield bash toward the right with a shockwave",
                                                       "getting hit, recoiling backward to the left behind the shield, eyes squeezed shut (no blood)",
                                                       "defeated, kneeling exhausted behind the lowered shield, dizzy"), None))
            auftraege.append((f"rolle-{fid}", rollenbogen("raising the shield high in front of the body, bracing against an impact from the right, a glowing protective barrier in front of the shield",
                                                          "kneeling down behind the shield, the barrier cracking, but still holding on"), f"held-{fid}"))
            eintraege["tanks"].append({"id": fid, "band": BAENDER[b]["band"], "rolle": "tank"})
        for i, (rid, beschr, farben) in enumerate(HEILER):
            fid = f"heiler-{rid}-{b}"
            auftraege.append((f"held-{fid}", grundbogen(b, rid, beschr, farben, i + 20, bandnr, "sending a radiant healing light toward the right (not an attack)",
                                                       "getting hit, recoiling backward to the left, eyes squeezed shut (no blood)",
                                                       "defeated, sitting on the ground exhausted and dizzy"), None))
            auftraege.append((f"rolle-{fid}", rollenbogen("casting a healing spell with both hands raised, soft golden-white light and small sparkles rising upward (not green)",
                                                          "releasing a big circular wave of warm healing light around the body"), f"held-{fid}"))
            eintraege["heiler"].append({"id": fid, "band": BAENDER[b]["band"], "rolle": "heiler"})
        # Spezialangriff für alle normalen Figuren dieses Bands (Vorlage: Grundbogen aus dem ersten Lauf)
        for arch in ARCHETYPEN:
            fid = (SCHON_56.get(arch[0], arch[0])) if b == "56" else f"{arch[0]}-{b}"
            auftraege.append((f"spezial-{fid}", spezialbild(), f"held-{fid}"))
            eintraege["spezial"].append({"id": fid, "band": BAENDER[b]["band"]})
    return auftraege, eintraege


if __name__ == "__main__":
    ziel = sys.argv[1]
    os.makedirs(ziel, exist_ok=True)
    auftraege, eintraege = katalog()
    with open(os.path.join(ziel, "auftraege-rollen.txt"), "w", newline="\n", encoding="utf-8") as f:
        for name, text, ref in auftraege:
            f.write(f"{name}|{ref or ''}\n")
            with open(os.path.join(ziel, f"{name}.txt"), "w", newline="\n", encoding="utf-8") as g:
                g.write(text)
    with open(os.path.join(ziel, "katalog-rollen.json"), "w", newline="\n", encoding="utf-8") as f:
        json.dump(eintraege, f, ensure_ascii=False, indent=1)
    print(len(auftraege), "Aufträge;", {k: len(v) for k, v in eintraege.items()})
