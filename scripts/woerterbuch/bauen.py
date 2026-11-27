"""Baut das Schulwörterbuch woerterbuch.sqlite aus Wiktionary (kaikki.org) und OpenThesaurus.

Aufruf (nur Python-Standardbibliothek):
    python -I scripts/woerterbuch/bauen.py [--arbeitsordner D:\\woerterbuch-bau] [--nur-laden] [--prozesse 4]

Ablauf:
 1. Laden: Rohdateien nach <arbeitsordner>/roh (mit Fortsetzen; vorhandene vollständige Dateien werden übersprungen).
 2. Auswerten: je Wiktionary-Ausgabe ein Prozess (de, en, fr, es), Zwischenstand als Pickle in <arbeitsordner>/werk.
 3. Zusammenführen: zweisprachige Einträge mischen, Umkehrpaare ergänzen, Synonyme, Formen-Tabelle.
 4. Schreiben: <arbeitsordner>/aus/woerterbuch.sqlite (VACUUM am Ende).

Heruntergeladene Daten werden ausschließlich als JSON/Text gelesen, nie ausgeführt.
"""

import argparse
import datetime
import gzip
import json
import multiprocessing
import os
import pickle
import re
import sqlite3
import sys
import time
import unicodedata
import urllib.request
import zipfile

USER_AGENT = 'schulapps-woerterbuch-bau'

QUELLEN_DATEIEN = {
    'de': ('de-extract.jsonl.gz', 'https://kaikki.org/dictionary/downloads/de/de-extract.jsonl.gz'),
    'fr': ('fr-extract.jsonl.gz', 'https://kaikki.org/dictionary/downloads/fr/fr-extract.jsonl.gz'),
    'es': ('es-extract.jsonl.gz', 'https://kaikki.org/dictionary/downloads/es/es-extract.jsonl.gz'),
    'en': ('kaikki.org-dictionary-English.jsonl.gz',
           'https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz'),
    'ot': ('OpenThesaurus-Textversion.zip', 'https://www.openthesaurus.de/export/OpenThesaurus-Textversion.zip'),
}

QUELLEN_META = [
    {'name': 'Wiktionary (deutschsprachige Ausgabe), aufbereitet von kaikki.org/wiktextract',
     'lizenz': 'CC BY-SA 4.0', 'url': 'https://kaikki.org/dictionary/rawdata.html'},
    {'name': 'Wiktionary (englischsprachige Ausgabe, englische Wörter), aufbereitet von kaikki.org/wiktextract',
     'lizenz': 'CC BY-SA 4.0', 'url': 'https://kaikki.org/dictionary/English/'},
    {'name': 'Wiktionary (französischsprachige Ausgabe), aufbereitet von kaikki.org/wiktextract',
     'lizenz': 'CC BY-SA 4.0', 'url': 'https://kaikki.org/dictionary/rawdata.html'},
    {'name': 'Wiktionary (spanischsprachige Ausgabe), aufbereitet von kaikki.org/wiktextract',
     'lizenz': 'CC BY-SA 4.0', 'url': 'https://kaikki.org/dictionary/rawdata.html'},
    {'name': 'OpenThesaurus (deutsche Synonyme)', 'lizenz': 'CC BY-SA 4.0 (wahlweise LGPL 2.1)',
     'url': 'https://www.openthesaurus.de/about/download'},
]

FREMDSPRACHEN = ('en', 'fr', 'es', 'la')

# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------


def norm(text):
    """Suchschlüssel: klein, ohne diakritische Zeichen, ß→ss, æ→ae, œ→oe, Leerraum zusammengefasst."""
    t = text.lower().replace('ß', 'ss').replace('ẞ', 'ss').replace('æ', 'ae').replace('œ', 'oe')
    t = unicodedata.normalize('NFD', t)
    t = ''.join(c for c in t if not unicodedata.combining(c))
    return ' '.join(t.split())


def kuerzen(text, n):
    text = ' '.join(text.split())
    if len(text) <= n:
        return text
    cut = text[:n - 1]
    if ' ' in cut[n // 2:]:
        cut = cut[:cut.rfind(' ')]
    return cut.rstrip(' ,;:') + '…'


# Wortarten (wiktextract-"pos") → deutsche Bezeichnung. None = Eintrag verwerfen.
WORTART = {
    'noun': 'Substantiv', 'verb': 'Verb', 'adj': 'Adjektiv', 'adv': 'Adverb',
    'prep': 'Präposition', 'postp': 'Präposition', 'circumpos': 'Präposition',
    'conj': 'Konjunktion', 'pron': 'Pronomen', 'det': 'Artikel', 'article': 'Artikel',
    'num': 'Numerale', 'intj': 'Interjektion', 'onomatopoeia': 'Interjektion',
    'phrase': 'Wendung', 'proverb': 'Wendung', 'idiom': 'Wendung', 'prep_phrase': 'Wendung',
    'adv_phrase': 'Wendung', 'abbrev': 'Abkürzung', 'name': 'Eigenname',
    'particle': '', 'prefix': '', 'suffix': '', 'contraction': '', 'participle': 'Verb',
    'character': None, 'symbol': None, 'punct': None, 'infix': None, 'interfix': None,
    'circumfix': None, 'typographic variant': None, 'romanization': None,
}
# Eigennamen: nur diese Untertypen (pos_title der deutschen Ausgabe) bleiben im Wörterbuch.
EIGENNAME_BEHALTEN = {'Toponym', 'Eigenname'}
EIGENNAME_MIN_UEBERSETZUNGEN = 3  # en/fr/es-Ausgaben: Eigennamen nur mit ≥3 Übersetzungen (Länder, Städte …)

# Schulfilter --------------------------------------------------------------
# Normalisierte wiktextract-Tags, die eine Bedeutung entfernen.
TAGS_ANSTOESSIG = {'vulgar', 'offensive', 'derogatory', 'slur', 'ethnic', 'pejorative', 'impolite',
                   'swear-word', 'insult'}
TAGS_VERALTET_SELTEN = {'obsolete', 'archaic', 'dated', 'outdated', 'rare', 'misspelling', 'nonstandard',
                        'no-gloss'}
TAGS_WEG = TAGS_ANSTOESSIG | TAGS_VERALTET_SELTEN
# Freie Etiketten (raw_tags), je Ausgabe unterschiedlich; Vergleich als ganzes kommagetrenntes Stück, klein.
RAW_ANSTOESSIG = {'vulgär', 'derb', 'abwertend', 'pejorativ', 'beleidigend', 'schimpfwort', 'obszön',
                  'rassistisch', 'diskriminierend', 'fäkalsprache', 'vulgärsprache', 'trans, vulgär',
                  'insulto', 'vulgar', 'despectivo', 'peyorativo', 'malsonante', 'ofensivo',
                  'vulgaire', 'injurieux', 'péjoratif', 'insultant'}
RAW_VERALTET = {'veraltet', 'veraltend', 'selten', 'sehr selten', 'archaisch', 'archaïque', 'extrêmement rare',
                'très rare', 'rare', 'orthographe d’avant 1835', "orthographe d'avant 1835", 'désuet', 'vieilli',
                'anticuado', 'desusado', 'obsoleto', 'arcaico', 'poco usado'}
# Kategorien an der Bedeutung (nur fr/es zuverlässig bedeutungsbezogen; en nur Schimpf-/Slur-Listen)
KAT_WEG_ROMANISCH = re.compile(r'vulgair|vulgar|injurieu|péjorati|despectiv|malsonante|insult|obsc[eè]n|'
                               r'archaïsme|désuet|vieilli|anticuad|obsolet|desusad|ofensiv', re.I)
KAT_WEG_EN = re.compile(r'swear words|ethnic slurs|\bslurs\b|vulgarities', re.I)

FORM_TAGS_WEG = {'obsolete', 'archaic', 'dated', 'rare', 'misspelling', 'nonstandard', 'table-tags',
                 'inflection-template', 'class', 'romanization', 'auxiliary', 'canonical', 'error-lua-exec',
                 'vulgar', 'offensive', 'derogatory', 'dialectal'}
FORM_LABEL = {'positiv', 'komparativ', 'superlativ', 'singular', 'plural', 'nominativ', 'genitiv', 'dativ',
              'akkusativ', 'ablativ', 'vokativ', 'maskulinum', 'femininum', 'neutrum', 'präsens', 'perfekt',
              'imperfekt', 'futur', 'imperativ', 'infinitiv', 'partizip', 'aktiv', 'passiv', 'indikativ',
              'konjunktiv', 'ppp', 'ppa', 'pfa', 'gerundium', 'gerundivum', 'supinum', '—', '-', '–'}

GLOSS_ZEICHEN = 500
BEISPIEL_ZEICHEN = 200
MAX_SINNE = 6
MAX_BEISPIELE = 2
MAX_UEBERSETZUNGEN = 12
MAX_SYNONYME = 8
MAX_WOERTER = 5


def raw_stuecke(liste):
    for r in liste or ():
        for teil in str(r).split(','):
            t = teil.strip().lower()
            if t:
                yield t


def sinn_urteil(s, ausgabe, eintrag_tags):
    """'form' / 'alt' / 'leer' / 'anstoessig' / 'veraltet' / 'ok'."""
    tags = set(s.get('tags') or ()) | eintrag_tags
    if s.get('form_of') or 'form-of' in tags:
        return 'form'
    if s.get('alt_of') or 'alt-of' in tags:
        return 'alt'
    if not s.get('glosses') or 'no-gloss' in tags:
        return 'leer'
    if tags & TAGS_ANSTOESSIG:
        return 'anstoessig'
    raws = set(raw_stuecke(s.get('raw_tags')))
    if raws & RAW_ANSTOESSIG:
        return 'anstoessig'
    if tags & TAGS_VERALTET_SELTEN or raws & RAW_VERALTET:
        return 'veraltet'
    kats = s.get('categories') or ()
    if kats:
        namen = [k['name'] if isinstance(k, dict) else str(k) for k in kats]
        muster = KAT_WEG_EN if ausgabe == 'en' else (KAT_WEG_ROMANISCH if ausgabe in ('fr', 'es') else None)
        if muster is not None:
            for nm in namen:
                if muster.search(nm):
                    return 'anstoessig' if re.search(r'vulg|injur|péjor|despect|malson|insult|obsc|ofens|swear|slur',
                                                     nm, re.I) else 'veraltet'
    return 'ok'


def gloss_text(s, ausgabe):
    g = [x for x in (s.get('glosses') or ()) if x and x.strip()]
    if not g:
        return ''
    t = g[-1] if ausgabe in ('en', 'fr') else ' '.join(g)
    return kuerzen(t, GLOSS_ZEICHEN)


BEISPIEL_UNSINN = re.compile(r'^(near-)?(synonyms?|antonyms?|hypernyms?|hyponyms?|coordinate terms?|see also)\s*:', re.I)


def beispiele(s, ausgabe):
    erste, zweite = [], []
    for e in s.get('examples') or ():
        t = ' '.join((e.get('text') or '').split())
        if len(t) < 3 or len(t) > BEISPIEL_ZEICHEN or BEISPIEL_UNSINN.match(t):
            continue
        zitat = e.get('type') == 'quotation' or bool(e.get('ref'))
        if ausgabe == 'en' and zitat:
            continue  # englische Ausgabe: nur Gebrauchsbeispiele, keine Belegzitate
        (zweite if zitat else erste).append(t)
    return (erste + zweite)[:MAX_BEISPIELE]


def sinn_status(o, ausgabe):
    """Bewertet alle Bedeutungen; liefert (behalten, status_je_index, flags)."""
    etags = set(o.get('tags') or ())
    etags_filter = etags & (TAGS_WEG | {'form-of', 'alt-of'})
    behalten, status, form_ziele, alt_ziele = [], [], [], []
    anstoessig = False
    for i, s in enumerate(o.get('senses') or ()):
        u = sinn_urteil(s, ausgabe, etags_filter)
        status.append(u)
        if u == 'ok':
            behalten.append((i, s))
        elif u == 'form':
            form_ziele += [f.get('word') for f in s.get('form_of') or () if f.get('word')]
        elif u == 'alt':
            alt_ziele += [f.get('word') for f in s.get('alt_of') or () if f.get('word')]
        elif u == 'anstoessig':
            anstoessig = True
    return behalten, status, form_ziele, alt_ziele, anstoessig


def index_karte(o, status):
    """sense_index (Text) → behalten? ; für Übersetzungen/Synonyme mit sense_index."""
    exakt, nummer = {}, {}
    for i, s in enumerate(o.get('senses') or ()):
        si = str(s.get('sense_index') or (i + 1)).strip()
        ok = status[i] == 'ok'
        exakt[si] = exakt.get(si, False) or ok
        m = re.match(r'\d+', si)
        if m:
            nummer[m.group()] = nummer.get(m.group(), False) or ok
    return exakt, nummer


def index_behalten(si, karte):
    if si is None or str(si).strip() == '':
        return True
    exakt, nummer = karte
    stuecke = [p for p in re.split(r'[,\s]+', str(si).strip()) if p]
    bekannt = False
    for p in stuecke:
        if p in exakt:
            bekannt = True
            if exakt[p]:
                return True
            continue
        m = re.match(r'\d+', p)
        if m and m.group() in nummer:
            bekannt = True
            if nummer[m.group()]:
                return True
    return not bekannt


def wortart_von(o):
    pos = o.get('pos') or ''
    if pos in WORTART:
        return WORTART[pos]
    return ''


def ist_eigenname_ok(o, ausgabe, n_trans):
    if o.get('pos') != 'name':
        return True
    if ausgabe == 'de':
        return (o.get('pos_title') or '') in EIGENNAME_BEHALTEN
    tags = set(o.get('tags') or ())
    if tags & {'surename', 'first-name', 'surname', 'given-name'}:
        return False
    return n_trans >= EIGENNAME_MIN_UEBERSETZUNGEN


def form_text_ok(f):
    if not f or ' ' in f or len(f) > 60:
        return False
    if f.lower() in FORM_LABEL or f.startswith('-') and len(f) < 2:
        return False
    return True


def formen_sammeln(o, lemma_norm, ziel):
    """Einwortformen aus forms[] eines Grundformeintrags → ziel[lemma_norm]."""
    for fo in o.get('forms') or ():
        f = (fo.get('form') or '').strip().rstrip('!').strip()
        tags = set(fo.get('tags') or ())
        if tags & FORM_TAGS_WEG or not form_text_ok(f):
            continue
        fn = norm(f)
        if fn and fn != lemma_norm:
            ziel.setdefault(lemma_norm, set()).add(fn)


def erste_ipa(o):
    for s in o.get('sounds') or ():
        ipa = s.get('ipa')
        if ipa:
            ipa = ipa.strip()
            if ipa.startswith('\\') and ipa.endswith('\\'):
                ipa = '/' + ipa.strip('\\') + '/'
            return ipa
    return None


def alle_uebersetzungen(o):
    out = list(o.get('translations') or ())
    for s in o.get('senses') or ():
        out += s.get('translations') or ()
    return out


UEB_TAGS_WEG = TAGS_WEG
UEB_RAW_WEG = RAW_ANSTOESSIG | RAW_VERALTET


def uebersetzung_ok(t):
    w = (t.get('word') or '').strip()
    if not w or len(w) > 80 or w in ('-', '—', '?'):
        return None
    tags = set(t.get('tags') or ())
    if tags & UEB_TAGS_WEG:
        return None
    if any('German' in x and x != 'German' for x in tags):  # Dialekte (Alemannic-German, Low-German …)
        return None
    if set(raw_stuecke(t.get('raw_tags'))) & UEB_RAW_WEG:
        return None
    return w


GENUS_DE = {'masculine': 'der', 'feminine': 'die', 'neuter': 'das'}
GENUS_KURZ = {'masculine': 'm.', 'feminine': 'f.', 'neuter': 'n.'}


def genus_aus_tags(tags, deutsch):
    tabelle = GENUS_DE if deutsch else GENUS_KURZ
    g = [tabelle[t] for t in ('masculine', 'feminine', 'neuter') if t in (tags or ())]
    return '/'.join(g) if g else None


def uebersetzung_eintrag(t, hinweis_feld, ziel_deutsch):
    w = uebersetzung_ok(t)
    if not w:
        return None
    e = {'wort': w}
    h = (t.get(hinweis_feld) or '').strip() if hinweis_feld else ''
    if h:
        e['hinweis'] = kuerzen(h, 80)
    g = genus_aus_tags(t.get('tags'), ziel_deutsch)
    if g:
        e['genus'] = g
    return e


def en_dis_index(t):
    d = t.get('_dis1')
    if not d:
        return None
    try:
        werte = [int(x) for x in d.split()]
    except ValueError:
        return None
    if not werte or max(werte) <= 0:
        return None
    return werte.index(max(werte))


# ---------------------------------------------------------------------------
# Deutsche Einzelheiten
# ---------------------------------------------------------------------------

HERKUNFT_PFEIL = re.compile(r'\s*\^\(→ ?[\w-]+\)')
FREMD = re.compile(r'\b(alt|neu|spät|mittel|kirchen|vulgär|mittellateinisch|)?(lateinisch|latein|lat\.|griechisch|'
                   r'französisch|franz\.|frz\.|englisch|engl\.|italienisch|ital\.|spanisch|portugiesisch|arabisch|'
                   r'türkisch|osmanisch|russisch|japanisch|chinesisch|hebräisch|jiddisch|persisch|niederländisch|'
                   r'sanskrit|hindi|polnisch|tschechisch|ungarisch|malaiisch|indianisch|aztekisch|nahuatl|'
                   r'quechua|amerikanisch|skandinavisch|norwegisch|schwedisch|dänisch|isländisch|finnisch|'
                   r'keltisch|gallisch|slawisch|indisch|tamil|tupí|tupi)', re.I)
HEIMISCH = re.compile(r'(althochdeutsch|mittelhochdeutsch|frühneuhochdeutsch|urgermanisch|germanisch|'
                      r'indogermanisch|niederdeutsch|mittelniederdeutsch|altsächsisch|gotisch|'
                      r'kompositum|ableitung|derivation|zusammensetzung|zusammenrückung|konversion|kurzwort|'
                      r'rückbildung|wortbildung|lautmalerei|onomatopoetisch|zusammenbildung|kontamination)', re.I)


def herkunft_de(o):
    texte = o.get('etymology_texts') or ([o['etymology_text']] if o.get('etymology_text') else [])
    if not texte:
        return None, False
    t = HERKUNFT_PFEIL.sub('', ' '.join(texte))
    t = re.sub(r'^\s*\[\d+\]\s*', '', t)
    t = ' '.join(t.split())
    if not t:
        return None, False
    f = FREMD.search(t)
    h = HEIMISCH.search(t)
    fremd = bool(f) and (not h or f.start() < h.start())
    return kuerzen(t, 200), fremd


def formen_de(o, wortart):
    forms = o.get('forms') or ()
    out, plural, genus = [], None, None

    def finde(pred):
        for fo in forms:
            if pred(set(fo.get('tags') or ()), fo):
                f = (fo.get('form') or '').strip()
                if f and f not in ('—', '-', '–'):
                    return f, fo
        return None, None

    if wortart == 'Substantiv':
        genus = genus_aus_tags(o.get('tags'), True)
        if not genus:
            arts = []
            for fo in forms:
                tg = set(fo.get('tags') or ())
                if {'nominative', 'singular'} <= tg and fo.get('article') in ('der', 'die', 'das'):
                    if fo['article'] not in arts:
                        arts.append(fo['article'])
            genus = '/'.join(arts) or None
        plural, _ = finde(lambda tg, fo: {'nominative', 'plural'} <= tg)
        gen, fo = finde(lambda tg, fo: {'genitive', 'singular'} <= tg)
        if gen:
            out.append('Genitiv: ' + ((fo.get('article') + ' ') if fo.get('article') else '') + gen)
    elif wortart == 'Verb':
        regeln = [
            ('Präsens', lambda tg, fo: tg == {'present'} and 'er' in (fo.get('pronouns') or ())),
            ('Präteritum', lambda tg, fo: tg == {'past'} and 'ich' in (fo.get('pronouns') or ())),
            ('Partizip II', lambda tg, fo: 'participle-2' in tg),
            ('Konjunktiv II', lambda tg, fo: tg == {'subjunctive-ii'}),
            ('Imperativ', lambda tg, fo: tg == {'imperative', 'singular'}),
        ]
        for label, pred in regeln:
            f, fo = finde(pred)
            if f:
                if label == 'Präsens':
                    f = 'er/sie/es ' + f
                out.append(label + ': ' + f)
        hilfs = []
        for fo in forms:
            if 'auxiliary' in (fo.get('tags') or ()) and fo.get('form') in ('haben', 'sein') and fo['form'] not in hilfs:
                hilfs.append(fo['form'])
        if hilfs:
            out.insert(3 if len(out) >= 3 else len(out), 'Hilfsverb: ' + '/'.join(hilfs))
    elif wortart == 'Adjektiv':
        k, _ = finde(lambda tg, fo: tg == {'comparative'})
        s, _ = finde(lambda tg, fo: tg == {'superlative'})
        if k:
            out.append('Komparativ: ' + k)
        if s:
            out.append('Superlativ: ' + s)
    return out[:6], plural, genus


def formen_latein(o, wortart):
    forms = o.get('forms') or ()
    lemma = o.get('word')

    def echte():
        for fo in forms:
            f = (fo.get('form') or '').strip()
            if not f or ' ' in f or f.lower() in FORM_LABEL:
                continue
            yield f, fo

    if wortart == 'Substantiv':
        nom = gen = None
        for f, fo in echte():
            tg = set(fo.get('tags') or ())
            if not nom and {'nominative', 'singular'} <= tg:
                nom = f
            if not gen and {'genitive', 'singular'} <= tg:
                gen = f
        g = genus_aus_tags(o.get('tags'), False)
        if gen:
            return [', '.join([nom or lemma, gen]) + (' ' + g if g else '')]
    elif wortart == 'Verb':
        praes = perf = ppp = inf = None
        for f, fo in echte():
            raws = set(raw_stuecke(fo.get('raw_tags')))
            tg = set(fo.get('tags') or ())
            if not inf and ('infinitiv' in raws or {'infinitive', 'present', 'active'} <= tg):
                inf = f
            if not praes and 'präsens' in raws:
                praes = f
            elif not perf and 'perfekt' in raws:
                perf = f
            elif not ppp and ('ppp' in raws or 'supinum' in raws):
                ppp = f
        if praes:
            teile = [inf or lemma, praes]
            if perf:
                teile.append(perf)
            if ppp:
                teile.append(re.sub(r'us$', 'um', ppp))
            return [', '.join(teile)]
    elif wortart == 'Adjektiv':
        drei = []
        for f, fo in echte():
            raws = list(raw_stuecke(fo.get('raw_tags')))
            if f.lower() in ('positiv',):
                continue
            if drei and any('steigerung' in r for r in raws):
                break
            drei.append(f)
            if len(drei) == 3:
                break
        if len(drei) >= 2:
            return [', '.join(drei)]
    return None


# ---------------------------------------------------------------------------
# Auswertung je Ausgabe (läuft in eigenem Prozess)
# ---------------------------------------------------------------------------

FORMEN_LABEL_EN = [
    ('plural', lambda tg: tg == {'plural'}),
    ('3rd person singular', lambda tg: {'third-person', 'singular', 'present'} <= tg),
    ('present participle', lambda tg: {'present', 'participle'} <= tg),
    ('past', lambda tg: tg == {'past'}),
    ('past participle', lambda tg: {'past', 'participle'} <= tg),
    ('comparative', lambda tg: tg == {'comparative'}),
    ('superlative', lambda tg: tg == {'superlative'}),
]
FORMEN_LABEL_FR = [
    ('pluriel', lambda tg: tg in ({'plural'}, {'plural', 'masculine'})),
    ('féminin', lambda tg: tg in ({'feminine'}, {'singular', 'feminine'})),
    ('féminin pluriel', lambda tg: tg == {'plural', 'feminine'}),
    ('participe présent', lambda tg: tg == {'participle', 'present'}),
    ('participe passé', lambda tg: tg == {'participle', 'past'}),
]
FORMEN_LABEL_ES = [
    ('plural', lambda tg: tg == {'plural'}),
    ('femenino', lambda tg: tg == {'feminine'}),
    ('femenino plural', lambda tg: tg == {'feminine', 'plural'}),
    ('gerundio', lambda tg: tg == {'impersonal', 'gerund'}),
    ('participio', lambda tg: tg == {'impersonal', 'participle'}),
    ('comparativo', lambda tg: tg == {'comparative'}),
    ('superlativo', lambda tg: tg == {'superlative'}),
]


def formen_mono(o, ausgabe):
    tabelle = {'en': FORMEN_LABEL_EN, 'fr': FORMEN_LABEL_FR, 'es': FORMEN_LABEL_ES}[ausgabe]
    out = []
    for label, pred in tabelle:
        for fo in o.get('forms') or ():
            tg = set(fo.get('tags') or ())
            f = (fo.get('form') or '').strip()
            if not f or tg & FORM_TAGS_WEG or fo.get('topics'):
                continue
            if pred(tg):
                out.append('%s: %s' % (label, f))
                break
    return out[:6]


def werte_aus(args):
    ausgabe, pfad, werk = args
    t0 = time.time()
    mono = []            # (lemma, wortart, score, daten)
    mono_anstoessig = set()   # norms mit mind. einer anstößigen Bedeutung
    mono_ganz_weg = set()     # norms, deren Eintrag nur aus anstößigen Bedeutungen bestand
    formen = {}               # sprache → {lemma_norm → set(form_norm)}
    bi = []                   # (wb, lemma, wortart, score, daten, quelle)
    statistik = {'zeilen': 0}
    eigene = ausgabe          # Sprache der Monolingual-Einträge
    sprachen_wanted = {eigene} | (set(FREMDSPRACHEN) if ausgabe == 'de' else set())
    vorfilter = ['"lang_code": "%s"' % s for s in sprachen_wanted]

    with gzip.open(pfad, 'rt', encoding='utf-8') as f:
        for zeile in f:
            statistik['zeilen'] += 1
            # Schneller Vorfilter ohne JSON-Parsen (Zeilen ohne gewünschten Sprachcode überspringen)
            if not any(m in zeile for m in vorfilter):
                continue
            try:
                o = json.loads(zeile)
            except ValueError:
                continue
            lc = o.get('lang_code')
            if lc not in sprachen_wanted:
                continue
            wort = (o.get('word') or '').strip()
            if not wort:
                continue
            wortart = wortart_von(o)
            if wortart is None:
                continue
            if len(wort.split()) > MAX_WOERTER:
                continue
            wn = norm(wort)
            behalten, status, form_ziele, alt_ziele, anstoessig = sinn_status(o, ausgabe)
            fz = formen.setdefault(lc, {})
            for ziel in form_ziele + alt_ziele:
                zn = norm(ziel)
                if zn and zn != wn:
                    fz.setdefault(zn, set()).add(wn)
            if not behalten:
                if anstoessig and not form_ziele and not alt_ziele:
                    if lc == eigene:
                        mono_ganz_weg.add(wn)
                continue
            if anstoessig and lc == eigene:
                mono_anstoessig.add(wn)
            uebs = alle_uebersetzungen(o)
            if not ist_eigenname_ok(o, ausgabe, len(uebs)):
                continue
            formen_sammeln(o, wn, fz)
            karte = index_karte(o, status)
            senses = o.get('senses') or ()
            # Übersetzungen filtern (Bedeutung verworfen → Übersetzung weg)
            if ausgabe == 'en':
                gut = []
                for t in o.get('translations') or ():
                    k = en_dis_index(t)
                    if k is not None and k < len(status) and status[k] != 'ok':
                        continue
                    gut.append(t)
                for i, s in enumerate(senses):
                    if status[i] == 'ok':
                        gut += s.get('translations') or ()
                uebs_gut = gut
            else:
                uebs_gut = [t for t in uebs if index_behalten(t.get('sense_index'), karte)]
            score = len(uebs) + 3 * len(behalten)
            if lc == eigene:
                bed = []
                for i, s in behalten[:MAX_SINNE]:
                    txt = gloss_text(s, ausgabe)
                    if not txt:
                        continue
                    b = {'text': txt}
                    bsp = beispiele(s, ausgabe)
                    if bsp:
                        b['beispiele'] = bsp
                    bed.append(b)
                if not bed:
                    continue
                daten = {'bedeutungen': bed}
                if ausgabe == 'de':
                    hy = o.get('hyphenations') or []
                    if hy and hy[0].get('parts'):
                        daten['silben'] = '·'.join(hy[0]['parts'])
                    elif o.get('hyphenation'):
                        daten['silben'] = str(o['hyphenation']).replace('-', '·')
                    fm, plural, genus = formen_de(o, wortart)
                    if genus:
                        daten['genus'] = genus
                    if plural:
                        daten['plural'] = plural
                    if fm:
                        daten['formen'] = fm
                    ipa = erste_ipa(o)
                    if ipa:
                        daten['ipa'] = ipa
                    hk, fremd = herkunft_de(o)
                    if hk:
                        daten['herkunft'] = hk
                    if fremd:
                        daten['fremdwort'] = True
                    syn = []
                    for sy in o.get('synonyms') or ():
                        w = (sy.get('word') or '').strip()
                        if w and index_behalten(sy.get('sense_index'), karte) and w not in syn:
                            if set(sy.get('tags') or ()) & TAGS_WEG:
                                continue
                            syn.append(w)
                    if syn:
                        daten['_syn'] = syn[:MAX_SYNONYME * 2]
                    # de → Fremdsprachen
                    je = {}
                    for t in uebs_gut:
                        sp = t.get('lang_code')
                        if sp in FREMDSPRACHEN:
                            e = uebersetzung_eintrag(t, 'sense', False)
                            if e:
                                je.setdefault(sp, []).append(e)
                    for sp, liste in je.items():
                        bd = {'uebersetzungen': liste}
                        if genus:
                            bd['genus'] = genus
                        bi.append(('de-' + sp, wort, wortart, score, bd, 'de'))
                else:
                    ipa = erste_ipa(o)
                    if ipa:
                        daten['ipa'] = ipa
                    fm = formen_mono(o, ausgabe)
                    if fm:
                        daten['formen'] = fm
                    # Fremdsprache → Deutsch aus den Übersetzungen dieser Ausgabe
                    liste = []
                    for t in uebs_gut:
                        if t.get('lang_code') == 'de':
                            e = uebersetzung_eintrag(t, 'sense', True)
                            if e:
                                liste.append(e)
                    if liste:
                        bd = {'uebersetzungen': liste}
                        g = genus_aus_tags(o.get('tags'), False) if ausgabe in ('fr', 'es') and wortart == 'Substantiv' else None
                        if g:
                            bd['genus'] = g
                        bi.append((ausgabe + '-de', wort, wortart, score, bd, ausgabe))
                mono.append((wort, wortart, score, daten))
            else:
                # Deutsche Ausgabe, Fremdsprachen-Eintrag (la/en/fr/es) → xx-de mit deutschen Bedeutungen
                bed = []
                for i, s in behalten[:MAX_SINNE]:
                    txt = gloss_text(s, 'de')
                    if txt:
                        bed.append({'text': txt})
                if not bed:
                    continue
                bd = {'bedeutungen': bed}
                liste = []
                for t in uebs_gut:
                    if t.get('lang_code') == 'de':
                        e = uebersetzung_eintrag(t, None, True)
                        if e:
                            liste.append(e)
                if liste:
                    bd['uebersetzungen'] = liste
                if wortart == 'Substantiv' and lc != 'en':
                    g = genus_aus_tags(o.get('tags'), False)
                    if g:
                        bd['genus'] = g
                if lc == 'la':
                    fm = formen_latein(o, wortart)
                    if fm:
                        bd['formen'] = fm
                bi.append((lc + '-de', wort, wortart, score, bd, 'de'))
    statistik['sekunden'] = round(time.time() - t0)
    ergebnis = {'mono': mono, 'anstoessig': mono_anstoessig, 'ganz_weg': mono_ganz_weg,
                'formen': formen, 'bi': bi, 'statistik': statistik}
    ziel = os.path.join(werk, 'teil-%s.pickle' % ausgabe)
    with open(ziel + '.tmp', 'wb') as g:
        pickle.dump(ergebnis, g, protocol=pickle.HIGHEST_PROTOCOL)
    os.replace(ziel + '.tmp', ziel)
    return ausgabe, statistik


# ---------------------------------------------------------------------------
# OpenThesaurus
# ---------------------------------------------------------------------------

OT_WEG = re.compile(r'\b(vulg|derb|abwertend|beleidigend|Schimpfwort|veraltet|veraltend|selten|obszön|'
                    r'diskriminierend|rassistisch|NS-Jargon)', re.I)


def lies_openthesaurus(pfad):
    syn = {}
    with zipfile.ZipFile(pfad) as z:
        text = z.read('openthesaurus.txt').decode('utf-8')
    for zeile in text.splitlines():
        if not zeile or zeile.startswith('#'):
            continue
        woerter = []
        for teil in zeile.split(';'):
            if OT_WEG.search(teil):
                continue
            w = ' '.join(re.sub(r'\([^)]*\)', ' ', teil).split())
            if not w or '...' in w or '…' in w or len(w.split()) > 3:
                continue
            woerter.append(w)
        for w in woerter:
            liste = syn.setdefault(norm(w), [])
            for x in woerter:
                if x != w and x not in liste:
                    liste.append(x)
    return syn


# ---------------------------------------------------------------------------
# Laden
# ---------------------------------------------------------------------------


def lade(url, ziel):
    req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        laenge = int(r.headers.get('Content-Length') or 0)
    vorhanden = os.path.getsize(ziel) if os.path.exists(ziel) else 0
    if laenge and vorhanden == laenge:
        print('  vorhanden:', os.path.basename(ziel), flush=True)
        return
    if vorhanden > laenge > 0:
        vorhanden = 0
    kopf = {'User-Agent': USER_AGENT}
    if vorhanden:
        kopf['Range'] = 'bytes=%d-' % vorhanden
    print('  lade %s (ab Byte %d von %d)' % (os.path.basename(ziel), vorhanden, laenge), flush=True)
    req = urllib.request.Request(url, headers=kopf)
    with urllib.request.urlopen(req, timeout=120) as r:
        modus = 'ab' if vorhanden and r.status == 206 else 'wb'
        with open(ziel, modus) as g:
            while True:
                block = r.read(1 << 20)
                if not block:
                    break
                g.write(block)
    if laenge and os.path.getsize(ziel) != laenge:
        raise RuntimeError('Unvollständig: %s – bitte erneut starten (setzt fort).' % ziel)


# ---------------------------------------------------------------------------
# Zusammenführen und Schreiben
# ---------------------------------------------------------------------------


def misch_uebersetzungen(ziel, neu):
    gesehen = {norm(u['wort']) for u in ziel}
    for u in neu:
        k = norm(u['wort'])
        if k not in gesehen and len(ziel) < MAX_UEBERSETZUNGEN:
            ziel.append(u)
            gesehen.add(k)


def zusammenfuehren(werk, ot_pfad):
    teile = {}
    for a in ('de', 'en', 'fr', 'es'):
        with open(os.path.join(werk, 'teil-%s.pickle' % a), 'rb') as g:
            teile[a] = pickle.load(g)
        print('  Teil %s: %d Einträge, %d zweisprachige Rohpaare, %s' % (
            a, len(teile[a]['mono']), len(teile[a]['bi']), teile[a]['statistik']), flush=True)

    # Sprachweite Mengen
    ganz_weg = {a: teile[a]['ganz_weg'] for a in teile}
    anstoessig = {a: teile[a]['anstoessig'] for a in teile}
    formen = {}
    for a in teile:
        for sp, d in teile[a]['formen'].items():
            z = formen.setdefault(sp, {})
            for k, v in d.items():
                z.setdefault(k, set()).update(v)

    # Monolinguale Wörterbücher
    eintraege = {}   # wb → list of [lemma, wortart, score, daten]
    for a in ('de', 'en', 'fr', 'es'):
        eintraege[a] = [list(x) for x in teile[a]['mono']]
    mono_norm = {a: {} for a in eintraege}   # norm → [wortart…]
    for a, liste in eintraege.items():
        for lemma, wa, sc, d in liste:
            mono_norm[a].setdefault(norm(lemma), []).append(wa)

    # Synonyme Deutsch: Wiktionary + OpenThesaurus, ohne anstößige Wörter
    ot = lies_openthesaurus(ot_pfad)
    schlecht = ganz_weg['de'] | anstoessig['de']
    for e in eintraege['de']:
        d = e[3]
        n = norm(e[0])
        liste, seen = [], {n}
        for w in d.pop('_syn', []) + ot.get(n, []):
            k = norm(w)
            if k in seen or k in schlecht:
                continue
            seen.add(k)
            liste.append(w)
            if len(liste) >= MAX_SYNONYME:
                break
        if liste:
            d['synonyme'] = liste

    # Zweisprachig: mischen nach (wb, lemma, wortart)
    bi = {}
    reihenfolge = {'de': 0, 'en': 1, 'fr': 1, 'es': 1}
    roh = []
    for a in teile:
        roh += teile[a]['bi']
    # deutsche Ausgabe zuerst (deutsche Bedeutungen), dann die anderen Ausgaben
    roh.sort(key=lambda x: reihenfolge[x[5]])
    for wb, lemma, wa, sc, d, quelle in roh:
        key = (wb, lemma, wa)
        e = bi.get(key)
        if e is None:
            bi[key] = [sc, {k: (list(v) if isinstance(v, list) else v) for k, v in d.items()}]
            if 'uebersetzungen' in bi[key][1]:
                liste = []
                misch_uebersetzungen(liste, bi[key][1]['uebersetzungen'])  # doppelte Wörter zusammenfassen
                bi[key][1]['uebersetzungen'] = liste
            continue
        e[0] = max(e[0], sc)
        z = e[1]
        if d.get('bedeutungen') and not z.get('bedeutungen'):
            z['bedeutungen'] = d['bedeutungen']
        if d.get('uebersetzungen'):
            misch_uebersetzungen(z.setdefault('uebersetzungen', []), d['uebersetzungen'])
        for k in ('genus', 'formen'):
            if d.get(k) and not z.get(k):
                z[k] = d[k]

    # Übersetzungen auf anstößige/ganz verworfene Wörter entfernen
    def ziel_sprache(wb):
        return wb.split('-')[1]

    for (wb, lemma, wa), (sc, d) in bi.items():
        sp = ziel_sprache(wb)
        if sp in ganz_weg and d.get('uebersetzungen'):
            d['uebersetzungen'] = [u for u in d['uebersetzungen'] if norm(u['wort']) not in ganz_weg[sp]]

    # Umkehrpaare
    index = {}   # (wb, norm) → [keys]
    for key in bi:
        index.setdefault((key[0], norm(key[1])), []).append(key)

    def suche_ziel(wb, wort, wa, quelle_sp):
        n = norm(wort)
        if quelle_sp == 'en' and n.startswith('to '):
            n = n[3:]
        keys = index.get((wb, n))
        if keys:
            for k in keys:
                if k[2] == wa:
                    return k
            return keys[0]
        sp = wb.split('-')[0]
        if sp in mono_norm and n in mono_norm[sp]:
            arten = mono_norm[sp][n]
            wa_neu = wa if wa in arten else arten[0]
            # Schreibweise des Lemmas aus dem Monolingual übernehmen
            k = (wb, wort[3:] if quelle_sp == 'en' and wort.lower().startswith('to ') else wort, wa_neu)
            if k not in bi:
                bi[k] = [0, {}]
                index.setdefault((wb, n), []).append(k)
            return k
        return None

    neue_paare = []
    for (wb, lemma, wa), (sc, d) in list(bi.items()):
        q, z = wb.split('-')
        if not d.get('uebersetzungen'):
            continue
        umgekehrt = z + '-' + q
        for u in d['uebersetzungen']:
            if len(u['wort'].split()) > 4:
                continue
            neue_paare.append((umgekehrt, u['wort'], wa, lemma, u.get('hinweis'), sc, q))
    for umgekehrt, wort, wa, lemma, hinweis, sc, q in neue_paare:
        k = suche_ziel(umgekehrt, wort, wa, umgekehrt.split('-')[0])
        if k is None:
            continue
        e = bi[k]
        e[0] = max(e[0], sc // 4)
        neu = {'wort': lemma}
        if hinweis:
            neu['hinweis'] = hinweis
        misch_uebersetzungen(e[1].setdefault('uebersetzungen', []), [neu])

    for (wb, lemma, wa), (sc, d) in bi.items():
        if not d.get('uebersetzungen') and not d.get('bedeutungen'):
            continue
        eintraege.setdefault(wb, []).append([lemma, wa, sc, d])

    # Bedeutungen auf 6 begrenzen (sind schon) – leere Felder entfernen
    for wb, liste in eintraege.items():
        for e in liste:
            e[3] = {k: v for k, v in e[3].items() if v not in (None, [], '')}
    return eintraege, formen


def quellsprache(wb):
    return wb.split('-')[0]


def schreibe(eintraege, formen, ziel, mit_formen_bi=True):
    if os.path.exists(ziel):
        os.remove(ziel)
    db = sqlite3.connect(ziel)
    db.execute('PRAGMA journal_mode=OFF')
    db.execute('PRAGMA synchronous=OFF')
    db.execute('PRAGMA page_size=4096')
    db.executescript('''
CREATE TABLE meta (schluessel TEXT PRIMARY KEY, wert TEXT);
CREATE TABLE eintrag (id INTEGER PRIMARY KEY, wb TEXT NOT NULL, lemma TEXT NOT NULL, norm TEXT NOT NULL,
  wortart TEXT NOT NULL DEFAULT '', rang INTEGER NOT NULL DEFAULT 0, daten TEXT NOT NULL);
CREATE TABLE form (wb TEXT NOT NULL, norm TEXT NOT NULL, lemma_id INTEGER NOT NULL,
  PRIMARY KEY (wb, norm, lemma_id)) WITHOUT ROWID;
''')
    db.execute("INSERT INTO meta VALUES ('gebaut', ?)", (datetime.date.today().isoformat(),))
    db.execute("INSERT INTO meta VALUES ('quellen', ?)", (json.dumps(QUELLEN_META, ensure_ascii=False),))
    db.execute("INSERT INTO meta VALUES ('version', '1')")
    zaehler = {}
    for wb in sorted(eintraege):
        liste = eintraege[wb]
        liste.sort(key=lambda e: (-e[2], norm(e[0]), e[1]))
        ids = {}
        zeilen = []
        for lemma, wa, sc, d in liste:
            n = norm(lemma)
            zeilen.append((wb, lemma, n, wa, -sc, json.dumps(d, ensure_ascii=False, separators=(',', ':'))))
        cur = db.cursor()
        start = (db.execute('SELECT COALESCE(MAX(id), 0) FROM eintrag').fetchone()[0]) + 1
        cur.executemany('INSERT INTO eintrag (wb, lemma, norm, wortart, rang, daten) VALUES (?,?,?,?,?,?)', zeilen)
        for i, z in enumerate(zeilen):
            ids.setdefault(z[2], []).append(start + i)
        zaehler[wb] = [len(zeilen), 0]
        sp = quellsprache(wb)
        if '-' in wb and not mit_formen_bi:
            continue
        fz = formen.get(sp, {})
        frows = []
        for n, idliste in ids.items():
            for f in fz.get(n, ()):
                for i in idliste:
                    frows.append((wb, f, i))
        db.executemany('INSERT OR IGNORE INTO form VALUES (?,?,?)', frows)
        zaehler[wb][1] = len(frows)
        db.commit()
        print('  %-6s %8d Einträge, %8d Formen' % (wb, zaehler[wb][0], zaehler[wb][1]), flush=True)
    print('  Indizes …', flush=True)
    db.execute('CREATE INDEX eintrag_suche ON eintrag (wb, norm)')
    try:
        db.execute('CREATE INDEX eintrag_lang ON eintrag (wb, length(norm))')
    except sqlite3.DatabaseError as fehler:
        print('  (eintrag_lang übersprungen: %s)' % fehler)
    db.commit()
    db.execute('ANALYZE')
    db.commit()
    print('  VACUUM …', flush=True)
    db.execute('VACUUM')
    db.close()
    return zaehler


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--arbeitsordner', default=r'D:\woerterbuch-bau')
    ap.add_argument('--nur-laden', action='store_true')
    ap.add_argument('--neu-auswerten', action='store_true', help='Zwischenstände (werk/teil-*.pickle) neu erzeugen')
    ap.add_argument('--prozesse', type=int, default=4)
    ap.add_argument('--ohne-formen-zweisprachig', action='store_true',
                    help='Formen-Tabelle nur für de/en/fr/es (kleiner)')
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    roh = os.path.join(args.arbeitsordner, 'roh')
    werk = os.path.join(args.arbeitsordner, 'werk')
    aus = os.path.join(args.arbeitsordner, 'aus')
    for d in (roh, werk, aus):
        os.makedirs(d, exist_ok=True)

    print('1. Laden', flush=True)
    for key, (name, url) in QUELLEN_DATEIEN.items():
        lade(url, os.path.join(roh, name))
    if args.nur_laden:
        return

    print('2. Auswerten', flush=True)
    auftraege = []
    for a in ('fr', 'en', 'de', 'es'):   # größte zuerst
        if args.neu_auswerten or not os.path.exists(os.path.join(werk, 'teil-%s.pickle' % a)):
            auftraege.append((a, os.path.join(roh, QUELLEN_DATEIEN[a][0]), werk))
    if auftraege:
        with multiprocessing.Pool(min(args.prozesse, len(auftraege))) as pool:
            for a, st in pool.imap_unordered(werte_aus, auftraege):
                print('  fertig: %s %s' % (a, st), flush=True)

    print('3. Zusammenführen', flush=True)
    eintraege, formen = zusammenfuehren(werk, os.path.join(roh, QUELLEN_DATEIEN['ot'][0]))

    print('4. Schreiben', flush=True)
    ziel = os.path.join(aus, 'woerterbuch.sqlite')
    tmp = ziel + '.neu'
    zaehler = schreibe(eintraege, formen, tmp, not args.ohne_formen_zweisprachig)
    os.replace(tmp, ziel)
    groesse = os.path.getsize(ziel)
    print('Fertig: %s (%.1f MB)' % (ziel, groesse / 1e6))
    with open(os.path.join(aus, 'statistik.json'), 'w', encoding='utf-8', newline='\n') as g:
        json.dump({'groesse_bytes': groesse, 'je_wb': zaehler}, g, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
