/**
 * Sprachliche Bewertungsmaßstäbe (29.09.2026, Fehlerbericht der Lehrkraft): Eine Sprachmittlung in
 * Englisch Kl. 13 (E-Mail, ca. 200 Wörter verlangt) bekam für eine Abgabe von gut 20 Wörtern
 * 6 Notenpunkte – die KI hatte 18 von 20 Punkten für Sprachrichtigkeit gegeben, weil die wenigen
 * einfachen Sätze fehlerfrei waren. „Völlig absurd bei der Länge und der Aufgabenvorgabe."
 *
 * Die Bewertungsraster der Länder und des IQB bewerten die sprachliche Leistung nie isoliert:
 * Sprachrichtigkeit zählt im Verhältnis zu Spektrum und Komplexität der verwendeten Mittel, ein
 * deutlich zu kurzer Text lässt die Sprachleistung nur eingeschränkt erkennen, und in der
 * Oberstufe deckelt ein ungenügender Bereich den ganzen Prüfungsteil.
 * Quellen: recherche/sprachliche-bewertungsmassstaebe-2026-09-29.md.
 *
 * WAS DIE APP DETERMINISTISCH TUT (Leitplanke, nicht nur Anweisung an die KI):
 * - Umfang: Wortzahl der Abgabe gegen den verlangten Umfang (aus Aufgabe, Erwartungshorizont oder
 *   Tabelle; sonst Richtwert nach Jahrgang). Die Sprachkriterien der Tabelle und der Sprachanteil
 *   von Schreib-/Sprachmittlungsteilen erreichen höchstens den Anteil des erreichten Umfangs.
 * - Komplexität: Sprachrichtigkeit liegt höchstens 40 Prozentpunkte über Spektrum/Ausdruck.
 * - Oberstufe: Inhalt oder Sprache ungenügend → Prüfungsteil höchstens 3 Notenpunkte – bei Teilen
 *   (teilbewertung.ts) und bei der Tabelle (art.ts, `tabellenSumme` mit Lerngruppe).
 * Die Begründung steht in der Begründung der Einstufung; die Lehrkraft kann alles ändern.
 *
 * Diese Datei kennt kein React – die Tests prüfen sie ohne Oberfläche.
 */
import { gehoertZurSekII } from "../arbeitsblatt/didactics/bildungsgang";
import { klartext, ohneKiTest } from "./abgabeTrennen";
import {
  fremdsprachlich,
  getrennt,
  OBERSTUFEN_DECKEL,
  UNGENUEGEND,
  type BewertungsTeil,
  type TeilWertung,
} from "./teilbewertung";
import type {
  Abgabe,
  Bewertungstabelle,
  Rueckmeldung,
  RueckmeldungMeta,
  TabellenKriterium,
  TabellenWertung,
} from "./model/types";

// ---------- Wortzahl ----------

/** Wörter der Abgabe (ohne HTML, ohne KI-Test, ohne Hinweis auf Unleserliches) */
export function wortzahl(text: string): number {
  const t = ohneKiTest(klartext(text ?? "")).text.replace(
    /\[unleserlich:[^\]]*\]/g,
    " ",
  );
  return (t.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;
}

// ---------- Verlangter Umfang ----------

const WOERTER = "(?:words?|w[öo]rtern?|worte|mots|palabras|parole|слов[а]?)";
const SPANNE = "(\\d{2,4})(?:\\s*(?:[-–—]|bis|to|à|a|y|e)\\s*(\\d{2,4}))?";
const UMFANG_MUSTER = [
  new RegExp(`${SPANNE}\\s*${WOERTER}(?![\\p{L}])`, "giu"),
  /(?:wortzahl|word count|word limit|nombre de mots)\s*:?\s*(?:ca\.?|circa|etwa|about|approx\.?|environ)?\s*(\d{2,4})()/giu,
];
/** Längenangaben zu Vorlagen („ein Artikel von ca. 800 Wörtern") sind kein verlangter Umfang */
const VORLAGE =
  /\b(text|artikel|article|quelle|source|auszug|extract|excerpt|passage|vorlage|rezension im umfang)\b/i;
const SCHREIBEN =
  /(write|schreib|verfass|formulier|écri|escrib|scriv|compose|e-?mail|letter|brief|essay|comment|kommentar|mediat|sprachmittl|answer|antwort)/i;

export interface VerlangterUmfang {
  woerter: number;
  /** Die Stelle, an der der Umfang steht („ca. 200 Wörter") */
  stelle: string;
}

/**
 * Verlangter Umfang aus Aufgabe, Erwartungshorizont und Tabelle („ca. 200 Wörter", „about 250 words",
 * „200–250 words", „environ 120 mots"). Bei einer Spanne gilt die Untergrenze, bei mehreren Angaben
 * die kleinste – so deckelt die App im Zweifel zu wenig, nie zu viel.
 */
export function umfangAusText(
  ...texte: (string | undefined)[]
): VerlangterUmfang | null {
  let best: VerlangterUmfang | null = null;
  for (const text of texte) {
    if (!text) continue;
    for (const muster of UMFANG_MUSTER) {
      for (const m of text.matchAll(muster)) {
        const davor = text.slice(
          Math.max(0, (m.index ?? 0) - 60),
          m.index ?? 0,
        );
        if (VORLAGE.test(davor) && !SCHREIBEN.test(davor)) continue;
        const a = Number(m[1]);
        const b = m[2] ? Number(m[2]) : a;
        const woerter = Math.min(a, b);
        if (!(woerter >= 30 && woerter <= 2000)) continue;
        if (!best || woerter < best.woerter)
          best = { woerter, stelle: m[0].trim() };
      }
    }
  }
  return best;
}

/**
 * Richtwert für Schreib- und Sprachmittlungsaufgaben in den modernen Fremdsprachen, wenn die
 * Aufgabe keinen Umfang nennt (Recherche 29.09.2026, „Richtwerte Wortzahlen"): Sachsen-Anhalt
 * Gymnasium Englisch Kl. 5/6 bis ca. 70, Kl. 7/8 bis ca. 150, Kl. 9 ca. 200; Brandenburg Kl. 8
 * mind. 70–120; NRW ZP10 (ESA) mind. 120; MV Mittlere Reife mind. 150; Bremen Abitur-Sprachmittlung
 * ca. 250. Die App nimmt die unteren Enden und greift beim Richtwert erst unter der Hälfte ein.
 * Weitere Fremdsprachen: abgeleitet (später begonnen, kürzere Texte).
 */
export function richtwertWoerter(
  grade: number,
  subjectId: string,
  oberstufe: boolean,
): number {
  const zweite = subjectId !== "englisch";
  if (oberstufe) return zweite ? 150 : 200;
  if (grade <= 6) return zweite ? 40 : 60;
  if (grade <= 8) return zweite ? 60 : 100;
  return zweite ? 100 : 150;
}

/**
 * Deckel nach dem Umfang (Vorbild: Bayern, Realschul-Abschlussprüfung Englisch, ISB-Q&A Guided
 * Writing 2023 – „Grundlage für die Beurteilung der Textmenge ist die tatsächlich geschriebene
 * Wörterzahl"): bis 25 / 50 / 75 % des Umfangs in Kohärenz, Grammatik und Wortschatz höchstens
 * Band 1 / 3 / 5 von 7. Belegt dort für Kl. 10; die Übertragung auf andere Stufen ist abgeleitet
 * (Recherche, Abschnitt „Was die App daraus ableiten kann"). Inhalt bleibt ohne Längendeckel.
 */
export const UMFANG_STUFEN: [bisAnteil: number, hoechstens: number][] = [
  [0.25, 1 / 7],
  [0.5, 3 / 7],
  [0.75, 5 / 7],
];

/** Höchster Anteil der Sprachkriterien bei diesem Umfang; beim Richtwert nur die unteren Stufen (bis 50 %) */
export function umfangFaktor(
  ist: number,
  soll: number,
  richtwert = false,
): number {
  const q = soll > 0 ? ist / soll : 1;
  const stufe = UMFANG_STUFEN.filter(([bis]) => !richtwert || bis <= 0.5).find(
    ([bis]) => q <= bis,
  );
  return stufe ? Math.round(stufe[1] * 1000) / 1000 : 1;
}

export interface UmfangBefund {
  ist: number;
  soll: number;
  quelle: "aufgabe" | "richtwert";
  stelle?: string;
  /** Höchster Anteil (0–1), den die Sprachkriterien erreichen können */
  faktor: number;
}

type Lerngruppe = Pick<
  RueckmeldungMeta,
  "grade" | "schoolTypeId" | "stateId" | "subjectId"
>;

export const oberstufeVon = (
  m: Pick<RueckmeldungMeta, "grade" | "schoolTypeId" | "stateId">,
): boolean =>
  m.grade >= 11 || gehoertZurSekII(m.grade, m.schoolTypeId, m.stateId);

/** Sprachfach: moderne Fremdsprache oder Deutsch/DaZ (Latein ausgenommen) */
export const sprachfach = (subjectId: string | undefined): boolean =>
  Boolean(subjectId) &&
  (fremdsprachlich(subjectId!) ||
    subjectId === "deutsch" ||
    subjectId === "daz");

/** Hat die Bewertung überhaupt einen getrennten Sprachbereich (Teile oder Tabelle)? */
export function hatSprachbereich(
  r: Pick<Rueckmeldung, "grundlage" | "tabelle">,
): boolean {
  return Boolean(
    r.grundlage.teile?.some(getrennt) ||
    r.tabelle?.kriterien.some(istSprachKriterium),
  );
}

/**
 * Umfang der Abgabe gegen den verlangten Umfang. null, wenn es nichts zu deckeln gibt: kein Text
 * (etwa nur Scan), kein Sprachbereich, kein erkennbarer Umfang. Den Richtwert nutzt die App nur in
 * den modernen Fremdsprachen – in Deutsch und anderen Fächern nur eine ausdrückliche Angabe.
 */
export function umfangBefund(
  r: Pick<Rueckmeldung, "grundlage" | "tabelle"> & { meta: Lerngruppe },
  a: Pick<Abgabe, "text">,
): UmfangBefund | null {
  const ist = wortzahl(a.text);
  if (!ist || !hatSprachbereich(r)) return null;
  const tabelle = r.tabelle?.kriterien.map((k) => k.kriterium).join("\n");
  const verlangt = umfangAusText(
    r.grundlage.aufgaben,
    r.grundlage.erwartung,
    tabelle,
  );
  if (verlangt) {
    return {
      ist,
      soll: verlangt.woerter,
      quelle: "aufgabe",
      stelle: verlangt.stelle,
      faktor: umfangFaktor(ist, verlangt.woerter),
    };
  }
  if (!r.meta.subjectId || !fremdsprachlich(r.meta.subjectId)) return null;
  const soll = richtwertWoerter(
    r.meta.grade,
    r.meta.subjectId,
    oberstufeVon(r.meta),
  );
  return {
    ist,
    soll,
    quelle: "richtwert",
    faktor: umfangFaktor(ist, soll, true),
  };
}

/** Satz für Begründung und Hinweis: „Umfang: 23 von 200 verlangten Wörtern („200 words", 12 %) …" */
export function umfangSatz(u: UmfangBefund): string {
  const q = Math.round((u.ist / u.soll) * 100);
  const soll =
    u.quelle === "aufgabe"
      ? `${u.soll} verlangten Wörtern („${u.stelle}", ${q} %)`
      : `etwa ${u.soll} Wörtern (Richtwert für den Jahrgang, ${q} %)`;
  return `Umfang: ${u.ist} von ${soll} – Sprachkriterien höchstens ${Math.round(u.faktor * 100)} % (von der App gedeckelt; ein zu kurzer Text lässt die sprachliche Leistung nur eingeschränkt erkennen).`;
}

// ---------- Sprachkriterien der Tabelle ----------

const INHALT =
  /inhalt|content|contenu|contenido|contenuto|aufgabenerf|task achievement|task fulfil|verstehensleistung/i;
const SPRACHE =
  /sprach|darstellung|language|langue|lengua|lingua|ausdruck|kommunikativ|textgestaltung|use of english|stil|style|wortschatz|vocabul|grammat|richtigkeit|korrektheit|orthogra|rechtschreib|zeichensetz|accuracy|range|register|kohärenz|coherence|satzbau|idiomat/i;
const RICHTIGKEIT =
  /richtigkeit|korrektheit|accuracy|correctness|correction|grammat|orthogra|rechtschreib|zeichensetz/i;
const SPEKTRUM =
  /ausdruck|spektrum|verfügbarkeit|sprachliche mittel|wortschatz|vocabul|range|komplex|satzbau|idiomat|lexi|variab/i;

/** Überschrift eines Kriteriums (vor dem Doppelpunkt) – die Beschreibung danach nennt oft beides */
const kopf = (k: TabellenKriterium): string =>
  k.kriterium.split(/[:–]/)[0].slice(0, 80);

export function istSprachKriterium(k: TabellenKriterium): boolean {
  if (k.bereich) {
    if (INHALT.test(k.bereich)) return false;
    if (SPRACHE.test(k.bereich)) return true;
  }
  return !INHALT.test(kopf(k)) && SPRACHE.test(kopf(k));
}

export const istRichtigkeit = (k: TabellenKriterium): boolean =>
  istSprachKriterium(k) && RICHTIGKEIT.test(kopf(k)) && !SPEKTRUM.test(kopf(k));
export const istSpektrum = (k: TabellenKriterium): boolean =>
  istSprachKriterium(k) && SPEKTRUM.test(kopf(k)) && !RICHTIGKEIT.test(kopf(k));

/** Anteil (0–1) eines Kriteriums aus seiner Wertung – null ohne Wertung */
export function kriteriumAnteil(
  t: Bewertungstabelle,
  k: TabellenKriterium,
  w: TabellenWertung | undefined,
): number | null {
  if (!w) return null;
  if (k.punkte && k.punkte > 0)
    return w.punkte == null
      ? null
      : Math.max(0, Math.min(k.punkte, w.punkte)) / k.punkte;
  const n = t.stufen.length;
  if (w.stufe == null || n < 2) return null;
  return (n - 1 - Math.max(0, Math.min(n - 1, w.stufe))) / (n - 1);
}

/** Wertung so senken, dass das Kriterium höchstens `max` (0–1) erreicht */
function kappe(
  t: Bewertungstabelle,
  k: TabellenKriterium,
  w: TabellenWertung,
  max: number,
  grund: string,
): TabellenWertung {
  const a = kriteriumAnteil(t, k, w);
  if (a == null || a <= max + 1e-9) return w;
  const zusatz = `(von der App gedeckelt: ${grund})`;
  const begruendung = [w.begruendung, zusatz].filter(Boolean).join(" ");
  if (k.punkte && k.punkte > 0)
    return { ...w, punkte: Math.floor(max * k.punkte + 1e-9), begruendung };
  const n = t.stufen.length;
  return {
    ...w,
    stufe: Math.min(n - 1, Math.ceil((1 - max) * (n - 1) - 1e-9)),
    begruendung,
  };
}

/**
 * Sprachrichtigkeit höchstens 40 Prozentpunkte über Spektrum/Ausdruck (IQB 2021: „eine
 * unzureichende Bandbreite kann nicht durch ein hohes Maß an Korrektheit ausgeglichen werden";
 * Bayern RS: fehlerfrei, aber nur einfache Strukturen → Band 4 von 7; Berlin, Fachbrief 19:
 * Bandbreite „mangelhaft", Korrektheit „gut" möglich). Der Wert ist abgeleitet.
 */
export const KOMPLEXITAET_SPIELRAUM = 0.4;

export interface TabellenDeckel {
  wertung: TabellenWertung[];
  /** Sätze für die Begründung der Einstufung */
  notizen: string[];
}

/**
 * Leitplanke für die Tabelle der KI: Sprachkriterien höchstens anteilig zum Umfang; Sprachrichtigkeit
 * höchstens eine Stufe über Spektrum/Ausdruck (fehlerfreie, aber einfache Sätze ≠ volle Punktzahl).
 */
export function tabelleDeckeln(
  t: Bewertungstabelle,
  wertung: TabellenWertung[],
  umfang: UmfangBefund | null,
): TabellenDeckel {
  const notizen: string[] = [];
  const sprachlich = t.kriterien.filter(istSprachKriterium);
  if (!sprachlich.length) return { wertung, notizen };
  let neu = wertung.map((w) => ({ ...w }));
  const finde = (k: TabellenKriterium): TabellenWertung | undefined =>
    neu.find((w) => w.kriteriumId === k.id);
  const ersetze = (w: TabellenWertung): void => {
    neu = neu.map((x) => (x.kriteriumId === w.kriteriumId ? w : x));
  };
  // 1. Umfang
  if (umfang && umfang.faktor < 1) {
    let gekappt = false;
    for (const k of sprachlich) {
      const w = finde(k);
      if (!w) continue;
      const g = kappe(
        t,
        k,
        w,
        umfang.faktor,
        `Umfang ${umfang.ist} von ${umfang.soll} Wörtern`,
      );
      if (g !== w) {
        gekappt = true;
        ersetze(g);
      }
    }
    if (gekappt) notizen.push(umfangSatz(umfang));
  }
  // 2. Sprachrichtigkeit im Verhältnis zur Komplexität
  const spektrum = sprachlich.filter(istSpektrum);
  const werte = spektrum
    .map((k) => kriteriumAnteil(t, k, finde(k)))
    .filter((x): x is number => x != null);
  if (werte.length) {
    const mittel = werte.reduce((s, x) => s + x, 0) / werte.length;
    const max = Math.min(1, mittel + KOMPLEXITAET_SPIELRAUM);
    let gekappt = false;
    for (const k of sprachlich.filter(istRichtigkeit)) {
      const w = finde(k);
      if (!w) continue;
      const g = kappe(
        t,
        k,
        w,
        max,
        "Sprachrichtigkeit zählt im Verhältnis zur Komplexität",
      );
      if (g !== w) {
        gekappt = true;
        ersetze(g);
      }
    }
    if (gekappt)
      notizen.push(
        `Sprachrichtigkeit höchstens ${Math.round(max * 100)} %, weil Ausdruck/Spektrum bei ${Math.round(mittel * 100)} % liegt – eine geringe Bandbreite lässt sich nicht durch Fehlerfreiheit ausgleichen (IQB).`,
      );
  }
  return { wertung: neu, notizen };
}

// ---------- Oberstufen-Deckel für die Tabelle ----------

/** Erfüllungsgrad (0–100) der Inhalts- und der Sprachkriterien, Punkte gewichtet */
export function bereichsAnteile(
  t: Bewertungstabelle,
  wertung: TabellenWertung[],
): { inhalt: number | null; sprache: number | null } {
  const mittel = (() => {
    const p = t.kriterien.map((k) => k.punkte ?? 0).filter((x) => x > 0);
    return p.length ? p.reduce((a, b) => a + b, 0) / p.length : 1;
  })();
  const summe = (liste: TabellenKriterium[]): number | null => {
    let s = 0;
    let g = 0;
    for (const k of liste) {
      const a = kriteriumAnteil(
        t,
        k,
        wertung.find((w) => w.kriteriumId === k.id),
      );
      if (a == null) continue;
      const gewicht = k.punkte && k.punkte > 0 ? k.punkte : mittel;
      s += a * gewicht;
      g += gewicht;
    }
    return g ? Math.round((s / g) * 1000) / 10 : null;
  };
  return {
    inhalt: summe(t.kriterien.filter((k) => !istSprachKriterium(k))),
    sprache: summe(t.kriterien.filter(istSprachKriterium)),
  };
}

export const DECKEL_MARKE = "Oberstufen-Deckel";

/**
 * Oberstufe, moderne Fremdsprache: Ist der Inhalt ODER die Sprache der Tabelle ungenügend
 * (unter 20 %), erreicht die Arbeit höchstens 3 Notenpunkte (KMK 2012, Abschn. 3.2.1.3). Die
 * Tabelle gilt dabei als ein Prüfungsteil – sie hat Inhalt und Sprache nebeneinander.
 */
export function tabellenOberstufenDeckel(
  t: Bewertungstabelle,
  wertung: TabellenWertung[],
  m: Lerngruppe,
): { max: number; grund: string } | null {
  if (!m.subjectId || !fremdsprachlich(m.subjectId) || !oberstufeVon(m))
    return null;
  const { inhalt, sprache } = bereichsAnteile(t, wertung);
  if (inhalt == null || sprache == null) return null;
  const schwach =
    inhalt < UNGENUEGEND
      ? `Inhalt ${Math.round(inhalt)} %`
      : sprache < UNGENUEGEND
        ? `Sprache ${Math.round(sprache)} %`
        : "";
  if (!schwach) return null;
  return {
    max: OBERSTUFEN_DECKEL,
    grund: `${DECKEL_MARKE}: ${schwach} ungenügend – höchstens ${OBERSTUFEN_DECKEL} % (KMK-Bildungsstandards 2012: höchstens 3 Notenpunkte).`,
  };
}

/** Begründung mit (neuem) Deckel-Satz – ein älterer Deckel-Satz fällt weg */
export function begruendungMitDeckel(
  basis: string | undefined,
  deckel: string | undefined,
): string | undefined {
  const ohne = (basis ?? "")
    .replace(
      new RegExp(
        `\\s*${DECKEL_MARKE}:[^\\n]*?\\(KMK-Bildungsstandards 2012[^)]*\\)\\.`,
        "g",
      ),
      "",
    )
    .trim();
  const text = [ohne, deckel].filter(Boolean).join(" ");
  return text || undefined;
}

// ---------- Teile ----------

/** Sprachanteil der Schreib-/Sprachmittlungsteile höchstens anteilig zum Umfang */
export function teileDeckeln(
  teile: BewertungsTeil[],
  wertungen: TeilWertung[],
  umfang: UmfangBefund | null,
): { wertungen: TeilWertung[]; notizen: string[] } {
  if (!umfang || umfang.faktor >= 1) return { wertungen, notizen: [] };
  const max = Math.round(umfang.faktor * 100);
  let gekappt = false;
  const neu = wertungen.map((w) => {
    const t = teile.find((x) => x.id === w.teilId);
    if (!t || !getrennt(t) || typeof w.sprache !== "number" || w.sprache <= max)
      return w;
    gekappt = true;
    return {
      ...w,
      sprache: max,
      begruendung: [
        w.begruendung,
        `(Sprache von der App gedeckelt: Umfang ${umfang.ist} von ${umfang.soll} Wörtern)`,
      ]
        .filter(Boolean)
        .join(" "),
    };
  });
  return { wertungen: neu, notizen: gekappt ? [umfangSatz(umfang)] : [] };
}

/** Satz zum Oberstufen-Deckel der Teile, wenn er greift */
export function teileDeckelSatz(
  teile: BewertungsTeil[],
  wertungen: TeilWertung[],
  oberstufe: boolean,
): string | undefined {
  if (!oberstufe) return undefined;
  const betroffen = teile.filter((t) => {
    const w = wertungen.find((x) => x.teilId === t.id);
    return (
      getrennt(t) && w && Math.min(w.inhalt ?? 0, w.sprache ?? 0) < UNGENUEGEND
    );
  });
  if (!betroffen.length) return undefined;
  return `${DECKEL_MARKE}: Inhalt oder Sprache ungenügend in ${betroffen.map((t) => t.titel).join(", ")} – dieser Teil höchstens ${OBERSTUFEN_DECKEL} % (KMK-Bildungsstandards 2012: höchstens 3 Notenpunkte).`;
}

// ---------- Regeln für die KI ----------

/**
 * Erwartetes GER-Niveau am Ende des Jahrgangs (KMK-Bildungsstandards: MSA B1/B1+ in der ersten
 * Fremdsprache, Abitur B2, im Leistungskurs Anteile C1; weitere Fremdsprachen entsprechend später).
 */
export function gerNiveau(
  grade: number,
  subjectId: string,
  oberstufe: boolean,
): string {
  if (!fremdsprachlich(subjectId)) return "";
  const erste = subjectId === "englisch";
  if (oberstufe)
    return erste
      ? "B2 (Leistungskurs mit Anteilen von C1)"
      : "B1+/B2 (fortgeführte Fremdsprache)";
  if (erste) return grade <= 6 ? "A1–A2" : grade <= 8 ? "A2–B1" : "B1–B1+";
  return grade <= 8 ? "A1–A2" : "A2–B1";
}

/** Regeln zur sprachlichen Leistung für die Bogen-Anfrage (nur Sprachfächer mit Schreib-/Sprachbereich) */
export function sprachRegeln(
  r: Pick<Rueckmeldung, "grundlage" | "tabelle"> & { meta: Lerngruppe },
  a: Pick<Abgabe, "text">,
  einstufung: boolean,
): string[] {
  if (!sprachfach(r.meta.subjectId)) return [];
  const bereich = hatSprachbereich(r);
  const u = umfangBefund(r, a);
  const verlangt = umfangAusText(r.grundlage.aufgaben, r.grundlage.erwartung);
  if (!bereich && !verlangt) return [];
  const oberstufe = oberstufeVon(r.meta);
  const niveau = gerNiveau(r.meta.grade, r.meta.subjectId, oberstufe);
  const regeln = [
    "- SPRACHLICHE LEISTUNG (Bewertungsraster KMK/IQB und der Länder): drei Bereiche – kommunikative Textgestaltung (Textsorte, Adressat, Aufbau, Kohärenz, Umfang), Ausdrucksvermögen/Verfügbarkeit sprachlicher Mittel (Spektrum, Präzision, Differenziertheit und Komplexität von Wortschatz und Satzbau) und Sprachrichtigkeit.",
    `- Sprachrichtigkeit NIE isoliert bewerten, sondern im Verhältnis zu Komplexität, Spektrum und Umfang: Wenige, einfache, fehlerfreie Sätze belegen keine sichere Sprachbeherrschung – hohe Werte nur, wenn auch komplexere Strukturen weitgehend korrekt sind. Eine geringe Bandbreite lässt sich nicht durch hohe Korrektheit ausgleichen (IQB); Sprachrichtigkeit liegt höchstens deutlich (etwa zwei Stufen) über Ausdrucksvermögen/Bandbreite.${niveau ? ` Maßstab ist das erwartete Niveau des Jahrgangs (GER ${niveau}).` : ""}`,
    "- UMFANG: Ein deutlich zu kurzer Text lässt die sprachliche Leistung nur eingeschränkt erkennen. Grundlage ist die tatsächlich geschriebene Wortzahl: bis 25 % des verlangten Umfangs höchstens etwa 1/7 der Sprachpunkte, bis 50 % höchstens 3/7, bis 75 % höchstens 5/7 (Vorbild Bayern). Der Inhalt wird davon unabhängig nach den erfüllten Aspekten bewertet.",
    `- Kopplung Inhalt und Sprache: Ist die Aufgabe verfehlt oder der Inhalt ungenügend, bleibt auch die sprachliche Leistung niedrig – sprachliche Mittel zählen nur, soweit sie der Aufgabe dienen.${oberstufe && fremdsprachlich(r.meta.subjectId) ? " Oberstufe: Ist Inhalt ODER Sprache ungenügend, höchstens 3 Notenpunkte für diesen Teil." : ""}`,
  ];
  if (u)
    regeln.push(
      `- BEFUND DER APP: Die Abgabe hat ${u.ist} Wörter; ${u.quelle === "aufgabe" ? `verlangt sind laut Aufgabe ${u.soll} Wörter („${u.stelle}")` : `üblich sind in diesem Jahrgang mindestens etwa ${u.soll} Wörter`}.${u.faktor < 1 && einstufung ? ` Die App deckelt die sprachlichen Kriterien auf höchstens ${Math.round(u.faktor * 100)} % – das in Begründung und Rückmeldung ansprechen.` : ""}`,
    );
  return regeln;
}
