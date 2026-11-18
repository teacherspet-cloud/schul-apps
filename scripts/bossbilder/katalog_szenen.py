"""Bildkatalog für die grafische Aufwertung der Klassenspiele (18.11.2026, Plan cozy-pondering-cat, abgestimmt mit der
Lehrkraft): Szenen für Klassen-Expedition, Tauziehen & Rennen, Gebietseroberung und die übrigen Klassenspiele, dazu
vier neue Posen je Figur (klettern, ziehen, laufen, jubeln) mit dem Grundbogen der Figur als Vorlage.

Reihenfolge: erst Szenen (ohne Vorlage), dann die Posen-Bögen Band für Band (7–8, 9–10, 5–6, 11–13).

  python -I katalog_szenen.py <ausgabeordner> <bossBestandDaten.ts>   → <name>.txt, auftraege-szenen.txt („name|vorlage")

Dateinamen in der App (freistellen.py): szene-<id> (Hintergrund, nicht freigestellt), held-<fid>-{klettern,ziehen,laufen,
jubeln}, ex-<welt>-{lager,fahne,gipfel,sturm}, fahne-<farbe>, req-<ding>.
"""
import json
import os
import re
import sys

GRUEN = ("Background: one completely flat, uniform, solid chroma-key green (#00B140) everywhere, no gradient, no floor, no cast shadows, "
         "no ground line, no vignette. Do not use any green on the objects or characters.\n"
         "Absolutely no text, letters, numbers, labels, frames, grid lines, logos or watermark. Not a copy of any existing game, film or franchise.")
STIL = ("stylized painterly video-game background art, rich warm colours, soft cinematic light, clean readable shapes, "
        "suitable for a classroom game shown on a projector")
OHNE = "No characters, no creatures, no animals, no people. Absolutely no text, letters, numbers, logos or watermark. Full-bleed, no frame."

# ---------------------------------------------------------------- Klassen-Expedition: 4 Welten × 2 Fassungen
EXPEDITION = {
    "gebirge": ("a high alpine mountain range: forest at the bottom left, rocky cliffs and a glacier in the middle, a snowy summit at the top right",
                "a wooden tent, a small campfire and a backpack", "an alpine summit cross made of wood with prayer-flag-like plain coloured cloths (no symbols)"),
    "vulkan": ("a tropical volcano island: beach and palm trees at the bottom left, black lava rock and steam vents in the middle, a smoking crater rim at the top right",
               "a small bamboo hut with a hammock", "a glowing obsidian stone marker"),
    "dschungel": ("an ancient jungle temple mountain: giant ferns and waterfalls at the bottom left, overgrown stone stairs and ruins in the middle, a golden temple top at the top right; foliage in teal and blue tones rather than green",
                  "a canvas jungle tent with a lantern", "a small golden temple bell on a stone pedestal"),
    "raumstation": ("a huge space station tower seen from the side against a starry sky and a planet: docking bays at the bottom left, glowing walkways and ladders in the middle, an antenna platform at the top right",
                    "a small sci-fi camp module with glowing windows", "a glowing beacon antenna"),
}


def expedition_hg(welt, beschr, fassung):
    tag = "early morning light" if fassung == 1 else "golden evening light"
    return f"""A wide panoramic background for a classroom team game, {STIL}. Landscape 16:9.
Scene: {beschr}; {tag}.
Composition: a long climb that rises from the BOTTOM LEFT corner diagonally to the TOP RIGHT corner. Along this diagonal there is a clearly walkable route of open ledges and slopes so that small game characters can be placed along it later. Keep the diagonal route free of objects.
Slightly less saturated than foreground characters would be, so characters stand out.
{OHNE}"""


def lager_bogen(welt, lager, gipfel):
    return f"""Sprite sheet of four separate game props for a classroom climbing game ({welt} world), stylized 3D cartoon render with soft lighting and rich colours, each prop centred in its own quadrant of a 2x2 grid with generous empty space around it, nothing crossing quadrant boundaries:
top-left: a camp: {lager}, small and cosy, seen slightly from the side;
top-right: a tall flag pole with a plain WHITE cloth flag waving to the right (no symbol on the flag);
bottom-left: the summit goal: {gipfel};
bottom-right: a grey storm cloud with wind streaks and a few snowflakes or raindrops (no lightning faces).
{GRUEN}"""


# ---------------------------------------------------------------- Tauziehen & Rennen
SEIL = {
    "wiese": "a sunny meadow festival ground with banners in plain colours and hills in the background",
    "strand": "a sandy beach at sunset with the sea, palm trees and a small pier",
    "eis": "a frozen lake surrounded by snowy pine trees under a pale blue sky",
}
BAHN = {
    "stadion": "a big sports stadium with a running track seen from the side, stands with blurred crowd shapes far away (no faces)",
    "wald": "a forest race path seen from the side with tall trees and light rays",
    "wueste": "a desert canyon race course seen from the side with red rocks and a blue sky",
}


def seil_hg(beschr):
    return f"""A wide background for a tug-of-war game in a classroom, {STIL}. Landscape 16:9. Side view.
Scene: {beschr}.
The lower half is a wide, flat, EMPTY ground strip across the whole width where two teams of small characters will stand and pull a rope (drawn later). Nothing stands on this ground.
{OHNE}"""


def bahn_hg(beschr):
    return f"""A wide background for a running race game in a classroom, {STIL}. Landscape 16:9. Side view.
Scene: {beschr}.
The lower two thirds are a wide, flat, EMPTY ground area across the whole width where several lanes of small runners will be drawn later. Nothing stands on it.
{OHNE}"""


# ---------------------------------------------------------------- Gebietseroberung: Inselkarten (Raster legt die App darüber)
KARTEN = {
    "insel": "a large tropical island with beaches, forests, a river, hills and a small mountain in the middle",
    "archipel": "a group of several close islands connected by shallow sandbanks, with coves, cliffs and forests",
    "frostinsel": "a northern island with snowy mountains, pine forests, a frozen lake and fjord-like coasts",
}


def karte(beschr):
    return f"""A top-down painted game map for a classroom strategy game, {STIL}, like a beautiful illustrated board-game map. Landscape 4:3, seen straight from above.
Map: {beschr}. The land fills most of the image (at least 80 %), surrounded by a narrow band of sea at the edges. Varied terrain everywhere so that every part of the map looks interesting when a grid of 8 x 6 squares is laid over it later.
No roads with signs, no castles with flags, no grid, no compass rose with letters.
{OHNE}"""


FAHNEN_A = ["red", "blue", "teal-turquoise", "yellow"]
FAHNEN_B = ["purple", "orange", "white"]


def fahnen_bogen(farben, viertes):
    teile = [f"a small flag on a short wooden pole stuck in the ground, cloth in solid {f} waving to the right, no symbol" for f in farben]
    if viertes:
        teile.append(viertes)
    ecken = ["top-left", "top-right", "bottom-left", "bottom-right"]
    zeilen = ";\n".join(f"{ecken[i]}: {t}" for i, t in enumerate(teile))
    return f"""Sprite sheet of four separate game props for a classroom map game, stylized 3D cartoon render with soft lighting, each centred in its own quadrant of a 2x2 grid with generous empty space, nothing crossing quadrant boundaries:
{zeilen}.
{GRUEN}"""


# ---------------------------------------------------------------- Übrige Klassenspiele
UEBRIGE = {
    "turnier-halle": "a bright, friendly tournament hall seen from the front with wooden floor, banners in plain colours and soft light; the floor area in the lower two thirds is EMPTY (tables are drawn later)",
    "wette-buehne": "a colourful quiz show stage with spotlights and a big empty stage floor in the lower half (no screens with text)",
}


def uebrig_hg(beschr):
    return f"""A wide background for a classroom quiz game, {STIL}. Landscape 16:9.
Scene: {beschr}.
{OHNE}"""


REQ_A = ["a long thick rope lying horizontally (straight, fills the quadrant width)", "a finish-line arch made of two poles and a plain chequered banner (no letters)",
         "a cartoon dust cloud puff", "a shiny golden trophy cup"]
REQ_B = ["a round wooden table seen slightly from above, empty", "a three-step winner podium in gold, silver and bronze colours (no numbers)",
         "a translucent glowing white ghost runner silhouette in a running pose (friendly, not scary)", "a colourful confetti burst"]


def req_bogen(dinge):
    ecken = ["top-left", "top-right", "bottom-left", "bottom-right"]
    zeilen = ";\n".join(f"{ecken[i]}: {t}" for i, t in enumerate(dinge))
    return f"""Sprite sheet of four separate game props for a classroom game, stylized 3D cartoon render with soft lighting and rich colours, each centred in its own quadrant of a 2x2 grid with generous empty space, nothing crossing quadrant boundaries:
{zeilen}.
{GRUEN}"""


# ---------------------------------------------------------------- Posen je Figur (Vorlage: Grundbogen der Figur)
def bewegung(rollstuhl):
    if rollstuhl:
        posen = ("pushing the wheelchair up a steep slope toward the upper right with strong arms, determined",
                 "seated in the wheelchair with the wheels braked, leaning back and pulling hard with both fists held close together in front of the chest as if gripping a horizontal rope (do NOT draw the rope)",
                 "racing forward to the right in the wheelchair at high speed with speed lines",
                 "cheering with both arms raised high while seated in the wheelchair, big happy smile")
    else:
        posen = ("climbing a steep slope toward the upper right, one hand reaching forward and up, one knee bent high, determined",
                 "leaning far back and pulling hard toward the LEFT with both fists held close together in front of the chest as if gripping a horizontal rope (do NOT draw the rope), feet braced",
                 "sprinting fast to the right, dynamic running pose with motion streaks",
                 "jumping and cheering with both arms raised high, big happy smile")
    return f"""The attached image shows a character sheet. Draw the EXACT same character (same face, hair, clothes, equipment, colours, proportions and art style) as a new character sheet with exactly four poses arranged in a 2x2 grid, one pose centred in each quadrant, full body, every pose facing to the RIGHT, generous empty space around each pose, no part of a pose crossing into another quadrant:
top-left: {posen[0]};
top-right: {posen[1]};
bottom-left: {posen[2]};
bottom-right: {posen[3]}.
{GRUEN}"""


def figuren_aus(daten_ts):
    s = open(daten_ts, encoding="utf-8").read()
    teil = s.split("FIGUREN_DATEN")[1].split("= ", 1)[1].split("\n\nexport")[0]
    return json.loads(teil)


def katalog(daten_ts):
    auftraege = []
    for welt, (beschr, lager, gipfel) in EXPEDITION.items():
        for n in (1, 2):
            auftraege.append((f"szene-ex-{welt}-{n}", expedition_hg(welt, beschr, n), None))
        auftraege.append((f"lager-{welt}", lager_bogen(welt, lager, gipfel), None))
    for k, b in SEIL.items():
        auftraege.append((f"szene-seil-{k}", seil_hg(b), None))
    for k, b in BAHN.items():
        auftraege.append((f"szene-bahn-{k}", bahn_hg(b), None))
    auftraege.append(("requisiten-a", req_bogen(REQ_A), None))
    for k, b in KARTEN.items():
        auftraege.append((f"szene-karte-{k}", karte(b), None))
    auftraege.append(("fahnen-a", fahnen_bogen(FAHNEN_A, None), None))
    auftraege.append(("fahnen-b", fahnen_bogen(FAHNEN_B, "a bright yellow cartoon lightning bolt"), None))
    for k, b in UEBRIGE.items():
        auftraege.append((f"szene-{k}", uebrig_hg(b), None))
    auftraege.append(("requisiten-b", req_bogen(REQ_B), None))
    reihenfolge = {"7-8": 0, "9-10": 1, "5-6": 2, "11-13": 3}
    for f in sorted(figuren_aus(daten_ts), key=lambda f: (reihenfolge[f["band"]], f["id"])):
        fid = f["id"]
        auftraege.append((f"bewegung-{fid}", bewegung("rollstuhl" in fid), f"held-{fid}"))
    return auftraege


if __name__ == "__main__":
    ziel, daten = sys.argv[1], sys.argv[2]
    os.makedirs(ziel, exist_ok=True)
    auftraege = katalog(daten)
    with open(os.path.join(ziel, "auftraege-szenen.txt"), "w", newline="\n", encoding="utf-8") as f:
        for name, text, ref in auftraege:
            assert re.fullmatch(r"[a-z0-9-]+", name), name
            f.write(f"{name}|{ref or ''}\n")
            with open(os.path.join(ziel, f"{name}.txt"), "w", newline="\n", encoding="utf-8") as g:
                g.write(text)
    print(len(auftraege), "Aufträge;", sum(1 for a in auftraege if a[0].startswith("bewegung-")), "Posen-Bögen")
