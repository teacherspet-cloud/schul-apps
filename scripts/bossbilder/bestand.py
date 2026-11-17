"""Bestand des Boss-Kampfs aus den vorhandenen Bildern erzeugen (17.11.2026).

Liest renderer/src/assets/klassenspiele/boss/ und den Motivkatalog (Namen, Welten) und schreibt
src/shared/klassenspiel/bossBestandDaten.ts. Aufgenommen wird nur, was vollständig da ist:
  Figur: held-<id>-{ruhe,angriff,getroffen,besiegt}   Monster: boss-<id>-{ruhe,angriff,getroffen,besiegt}
  Hintergrund: hg-<id>   Begleiter: begleiter-<id>
Rollen (Boss-Kampf mit Rollen, Entscheidung der Lehrkraft 17.11.2026): eigene Tank-/Heiler-Figuren (tank-*, heiler-*)
und bis dahin passende vorhandene Figuren (Ritter, Schildträger, Schmied, Ingenieur, Lanze bzw. Heiler, Alchemist,
Barde, Gärtnerin); alle übrigen sind Angreifer.

  python -I scripts/bossbilder/bestand.py
"""
import json
import os
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HIER)
from katalog import MONSTER, BAENDER  # noqa: E402

WURZEL = os.path.normpath(os.path.join(HIER, '..', '..'))
BILDER = os.path.join(WURZEL, 'src', 'renderer', 'src', 'assets', 'klassenspiele', 'boss')
ZIEL = os.path.join(WURZEL, 'src', 'shared', 'klassenspiel', 'bossBestandDaten.ts')

POSEN = ['ruhe', 'angriff', 'getroffen', 'besiegt']
TANK = {'ritter', 'ritterin', 'schild', 'schmied', 'ingenieur', 'lanze'}
HEILER = {'heiler', 'heilerin', 'alchemist', 'barde', 'gaertner'}
BAND_VON_KUERZEL = {k: v['band'] for k, v in BAENDER.items()}
SCHON_56_MONSTER = {
    'drache': ('fantasy', '🐉', ['Grammatik-Drache', 'Grammar Dragon', 'Dragon de grammaire', 'Dragón gramatical', 'Drago della grammatica', 'Draco grammaticus']),
    'krake': ('fantasy', '🐙', ['Vokabel-Krake', 'Vocab Kraken', 'Kraken du vocabulaire', 'Kraken del vocabulario', 'Kraken del lessico', 'Polypus verborum']),
    'teufel': ('fantasy', '👹', ['Fehlerteufel', 'Mistake Devil', 'Diable des fautes', 'Diablo de errores', 'Diavolo degli errori', 'Daemon errorum']),
    'golem': ('fantasy', '🗿', ['Wort-Golem', 'Word Golem', 'Golem des mots', 'Gólem de palabras', 'Golem delle parole', 'Golem verborum']),
}
WELT_SYMBOL = {'fantasy': '🐉', 'weltraum': '👾', 'natur': '🦖', 'mythos': '🏛️'}
SPRACHEN = ['de', 'en', 'fr', 'es', 'it', 'la']


def band_und_basis(fid):
    """'ritter-78' → ('7-8', 'ritter'); 'ritterin' → ('5-6', 'ritterin'); 'tank-schildritter-910' → ('9-10', ...)"""
    teile = fid.rsplit('-', 1)
    if len(teile) == 2 and teile[1] in BAND_VON_KUERZEL:
        return BAND_VON_KUERZEL[teile[1]], teile[0]
    return '5-6', fid


def rolle_von(fid, basis):
    if fid.startswith('tank-'):
        return 'tank'
    if fid.startswith('heiler-'):
        return 'heiler'
    if basis in TANK:
        return 'tank'
    if basis in HEILER:
        return 'heiler'
    return None


def main():
    dateien = {f[:-5] for f in os.listdir(BILDER) if f.endswith('.webp')}
    figuren, monster, hg, begleiter = [], [], [], []
    ids = sorted({d[5:].rsplit('-', 1)[0] for d in dateien if d.startswith('held-') and d.endswith('-ruhe')})
    for fid in ids:
        if not all(f'held-{fid}-{p}' in dateien for p in POSEN):
            continue
        band, basis = band_und_basis(fid)
        r = rolle_von(fid, basis)
        figuren.append({'id': fid, 'band': band, **({'rolle': r} if r else {}),
                        **({'spezial': True} if f'held-{fid}-spezial' in dateien else {}),
                        **({'rollenposen': True} if f'held-{fid}-rolle1' in dateien else {})})
    katalog = {m[0]: m for m in MONSTER}
    mids = sorted({d[5:].rsplit('-', 1)[0] for d in dateien if d.startswith('boss-') and d.endswith('-ruhe')})
    for mid in mids:
        if not all(f'boss-{mid}-{p}' in dateien for p in POSEN):
            continue
        if mid in SCHON_56_MONSTER:
            welt, sym, namen = SCHON_56_MONSTER[mid]
            band = '5-6'
        elif mid in katalog:
            _, b, welt, _, _, namen = katalog[mid]
            band, sym = BAND_VON_KUERZEL[b], WELT_SYMBOL[welt]
        else:
            continue
        monster.append({'id': mid, 'band': band, 'welt': welt, 'symbol': sym, 'namen': dict(zip(SPRACHEN, namen)),
                        'phasen': f'boss-{mid}-ruestung' in dateien and f'boss-{mid}-raserei' in dateien})
    for d in sorted(dateien):
        if d.startswith('hg-'):
            hid = d[3:]
            if hid == 'burgarena':
                hg.append({'id': hid, 'band': '5-6', 'welt': 'fantasy'})
                continue
            band, basis = band_und_basis(hid)
            welt = next((w for w, ideen in __import__('katalog').HG_IDEEN.items() if any(i[0] == basis for i in ideen)), 'fantasy')
            hg.append({'id': hid, 'band': band, 'welt': welt})
        elif d.startswith('begleiter-'):
            begleiter.append(d[10:])
    with open(ZIEL, 'w', newline='\n', encoding='utf-8') as f:
        f.write('/**\n * ERZEUGT von scripts/bossbilder/bestand.py aus den vorhandenen Bildern – nicht von Hand ändern.\n */\n')
        f.write("import type { BossBand, BossWelt } from './bossBestand'\n\n")
        f.write('export const FIGUREN_DATEN: { id: string; band: BossBand; rolle?: \'tank\' | \'heiler\'; spezial?: boolean; rollenposen?: boolean }[] = ')
        f.write(json.dumps(figuren, ensure_ascii=False, indent=1) + '\n\n')
        f.write('export const MONSTER_DATEN: { id: string; band: BossBand; welt: BossWelt; symbol: string; namen: Record<\'de\' | \'en\' | \'fr\' | \'es\' | \'it\' | \'la\', string>; phasen: boolean }[] = ')
        f.write(json.dumps(monster, ensure_ascii=False, indent=1) + '\n\n')
        f.write('export const HINTERGRUND_DATEN: { id: string; band: BossBand; welt: BossWelt }[] = ')
        f.write(json.dumps(hg, ensure_ascii=False, indent=1) + '\n\n')
        f.write('export const BEGLEITER_DATEN: string[] = ' + json.dumps(begleiter, ensure_ascii=False) + '\n')
    print(len(figuren), 'Figuren,', len(monster), 'Monster,', len(hg), 'Hintergründe,', len(begleiter), 'Begleiter')
    print('Rollen:', sum(1 for f in figuren if f.get('rolle') == 'tank'), 'Tank,', sum(1 for f in figuren if f.get('rolle') == 'heiler'), 'Heiler')


if __name__ == '__main__':
    main()
