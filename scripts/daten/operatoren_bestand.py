"""Erzeugt src/shared/operatoren/daten/<LAND>.json aus recherche/operatoren/<LAND>.json.

Rechercheformat -> App-Format:
- beispiel (Einzahl, Text) -> beispiele[]
- afb [..] -> 'I' | 'II' | 'III' | 'I–II' | 'II–III' | 'I–III'
- zusatz.Kompetenzbereich / Teilbereich -> kompetenzbereich (vereinheitlicht)
- strukturelle und bibliografische Spalten fallen weg; Fußnoten, Hinweise, AFB-Bandbreite,
  empfohlene Arbeitsaufträge usw. bleiben im Wortlaut als zusatz.
"""
import json, glob, os, sys

ROOT = sys.argv[1]
QUELLE = os.path.join(ROOT, 'recherche', 'operatoren')
ZIEL = os.path.join(ROOT, 'src', 'shared', 'operatoren', 'daten')
os.makedirs(ZIEL, exist_ok=True)

WEG = {'Operator', 'Operator(en)', 'Seite im IQB-Original', 'Druck', 'Tabellenüberschrift', 'Abschnitt', 'Kategorie',
       'Kompetenzbereich', 'Teilbereich', 'AFB', 'Zwischenüberschrift'}
BEREICH = {
    'Schreiben / Leseverstehen integriert': 'Schreiben',
    'Hörverstehen': 'Hör-/Hörsehverstehen',
    'Hören': 'Hör-/Hörsehverstehen',
    'Lesen': 'Leseverstehen',
}
ORDNUNG = ['I', 'II', 'III']


def afb(liste):
    werte = sorted({a for a in (liste or []) if a in ORDNUNG}, key=ORDNUNG.index)
    if not werte:
        return None
    if len(werte) == 1:
        return werte[0]
    return f'{werte[0]}–{werte[-1]}'


def quelle_text(q):
    teile = [q.get('titel', '').strip()]
    if q.get('herausgeber'):
        teile.append(q['herausgeber'].strip())
    if q.get('jahr'):
        teile.append(str(q['jahr']))
    return ', '.join(t for t in teile if t)


gesamt = 0
for f in sorted(glob.glob(os.path.join(QUELLE, '*.json'))):
    d = json.load(open(f, encoding='utf-8'))
    land = d['stateId']
    quellen = {q['id']: q for q in d['quellen']}
    listen = []
    for l in d['listen']:
        q = quellen.get(l.get('quelleId'), {})
        ops = []
        for o in l['operatoren']:
            z = o.get('zusatz') or {}
            bereich = z.get('Kompetenzbereich') or z.get('Teilbereich')
            bereich = BEREICH.get(bereich, bereich) if bereich else None
            zusatz = {}
            for k, v in z.items():
                if k in WEG or not isinstance(v, str) or not v.strip():
                    continue
                if k in ('Operator (EN)',) and v.strip().lower() == o['wortlaut'].strip().lower():
                    continue
                zusatz[k] = v.strip()
            e = {'operator': o['wortlaut'].strip(), 'definition': (o.get('definition') or '').strip()}
            a = afb(o.get('afb'))
            if a:
                e['afb'] = a
            formen = [x for x in (o.get('formen') or []) if x and x.strip()]
            if formen:
                e['formen'] = formen
            b = (o.get('beispiel') or '').strip() if isinstance(o.get('beispiel'), str) else ''
            if b:
                e['beispiele'] = [b]
            if bereich:
                e['kompetenzbereich'] = bereich
            if zusatz:
                e['zusatz'] = zusatz
            ops.append(e)
        gesamt += len(ops)
        listen.append({
            'quelle': quelle_text(q),
            'url': q.get('url', ''),
            'belegt': q.get('belegt', 'volltext'),
            'faecher': l.get('faecher', []),
            'stufe': l.get('stufe', 'sek2'),
            'sprache': l.get('sprache', 'de'),
            'afbLogik': l.get('afbLogik', 'keine'),
            'operatoren': ops,
        })
    aus = {'stateId': land, 'stand': d.get('stand', ''), 'listen': listen}
    with open(os.path.join(ZIEL, f'{land}.json'), 'w', encoding='utf-8', newline='\n') as h:
        json.dump(aus, h, ensure_ascii=False, indent=1)
        h.write('\n')
    print(land, len(listen), sum(len(x['operatoren']) for x in listen))
print('gesamt', gesamt)
