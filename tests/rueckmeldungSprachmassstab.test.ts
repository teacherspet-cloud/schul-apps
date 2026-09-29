import { describe, expect, it } from "vitest";
import {
  gesamtAusTabelle,
  tabellenSumme,
  type SkalenKontext,
} from "../src/renderer/src/modules/rueckmeldung/art";
import {
  bogenAnfrage,
  bogenAus,
} from "../src/renderer/src/modules/rueckmeldung/generation";
import type {
  Abgabe,
  Bewertungstabelle,
  Rueckmeldung,
  RueckmeldungMeta,
} from "../src/renderer/src/modules/rueckmeldung/model/types";
import {
  begruendungMitDeckel,
  istRichtigkeit,
  istSpektrum,
  istSprachKriterium,
  tabelleDeckeln,
  umfangAusText,
  umfangBefund,
  umfangFaktor,
  wortzahl,
} from "../src/renderer/src/modules/rueckmeldung/sprachmassstab";
import {
  tabelleAus,
  tabelleEntwurfAnfrage,
  tabelleText,
} from "../src/renderer/src/modules/rueckmeldung/tabelle";
import type { BewertungsTeil } from "../src/renderer/src/modules/rueckmeldung/teilbewertung";

/*
 * Sprachliche Bewertungsmaßstäbe (29.09.2026, Fehlerbericht der Lehrkraft): Englisch Kl. 13,
 * Sprachmittlung als E-Mail (ca. 200 Wörter verlangt), Abgabe gut 20 Wörter – die KI gab 18/20 für
 * Sprachrichtigkeit, am Ende 6 Notenpunkte. Erwartet: 0–2 Notenpunkte.
 */
const meta = (over: Partial<RueckmeldungMeta> = {}): RueckmeldungMeta => ({
  title: "Exam no. 4",
  subjectId: "englisch",
  subjectLabel: "Englisch",
  grade: 13,
  stateId: "NW",
  schoolTypeId: "gymnasium",
  schoolTypeName: "Gymnasium",
  anrede: "du",
  schwerpunkt: "",
  formen: ["schriftlich", "tipps", "tabelle"],
  einstufung: "notenpunkte",
  ebene: "gesamt",
  ...over,
});

const AUFGABE =
  "Mediation: Your English partner school is planning a Macbeth evening. Eddie, the student coordinator, asks whether Kurzel’s film should be shown. Write an email to Eddie (ca. 200 words) in which you present the findings of the German review.";

const tabelle: Bewertungstabelle = {
  titel: "Mediation",
  kriterien: [
    {
      id: "i1",
      bereich: "Inhalt",
      kriterium: "Gewaltinszenierung",
      punkte: 10,
    },
    {
      id: "i2",
      bereich: "Inhalt",
      kriterium: "Neuinterpretation Lady Macbeths",
      punkte: 10,
    },
    {
      id: "i3",
      bereich: "Inhalt",
      kriterium: "Abwägung von Stärken und Schwächen",
      punkte: 10,
    },
    {
      id: "i4",
      bereich: "Inhalt",
      kriterium: "Begründete Empfehlung",
      punkte: 10,
    },
    {
      id: "s1",
      bereich: "Darstellung/Sprache",
      kriterium:
        "Kommunikative Textgestaltung: adressatengerechte E-Mail, Orientierung an ca. 200 Wörtern",
      punkte: 20,
    },
    {
      id: "s2",
      bereich: "Darstellung/Sprache",
      kriterium:
        "Ausdrucksvermögen: differenziertes, präzises Vokabular, variabler Satzbau",
      punkte: 20,
    },
    {
      id: "s3",
      bereich: "Darstellung/Sprache",
      kriterium:
        "Sprachrichtigkeit: Grammatik, Satzbau, Wortformen, Rechtschreibung",
      punkte: 20,
    },
  ],
  stufen: ["voll", "überwiegend", "teilweise", "nicht"],
  quelle: "ki",
};

const mediation: BewertungsTeil = {
  id: "t1",
  titel: "Mediation",
  art: "sprachmittlung",
  gewicht: 100,
  inhalt: 40,
  ergebnisSprache: "zielsprache",
  quelle: "material",
};

const doc = (
  m: Partial<RueckmeldungMeta> = {},
  over: Partial<Rueckmeldung> = {},
): Rueckmeldung => ({
  version: 1,
  meta: meta(m),
  grundlage: {
    art: "frei",
    titel: "Exam no. 4",
    aufgaben: AUFGABE,
    teile: [mediation],
    verrechnung: "prozent",
  },
  tabelle,
  abgaben: [],
  createdAt: "",
  ...over,
});

const KURZ =
  "Kurzel did a great job\n\nHi Eddie,\n\nI think the staging shown here turned out really well.\n\nWhat do you think?\n\nBest,\nFrank";
const abgabe = (text = KURZ): Abgabe => ({
  id: "a1",
  kuerzel: "S2",
  name: "",
  dateiname: "x",
  text,
  bilder: [],
});

/** Antwort der KI wie im Fehlerbericht: Inhalt fast 0, Sprachrichtigkeit 18/20 */
const kiAntwort = {
  staerken: ["Passende Anrede."],
  schritte: ["Die Befunde der Rezension vermitteln."],
  kriterien: [],
  tabelle: [
    { id: "i1", punkte: 0, stufe: 0, begruendung: "fehlt" },
    { id: "i2", punkte: 0, stufe: 0, begruendung: "fehlt" },
    { id: "i3", punkte: 0, stufe: 0, begruendung: "fehlt" },
    { id: "i4", punkte: 1, stufe: 0, begruendung: "angedeutet" },
    { id: "s1", punkte: 5, stufe: 0, begruendung: "Anrede und Schluss" },
    { id: "s2", punkte: 5, stufe: 0, begruendung: "sehr allgemein" },
    { id: "s3", punkte: 18, stufe: 0, begruendung: "weitgehend sprachrichtig" },
  ],
  teile: [
    { id: "t1", inhalt: 3, sprache: 60, anteil: 0, begruendung: "kaum Inhalt" },
  ],
};

const ctx = { zeichen: [], schwellen: [91, 78, 64, 50, 25, 0] };

describe("Wortzahl und verlangter Umfang", () => {
  it("zählt die Wörter der Abgabe", () => {
    expect(wortzahl(KURZ)).toBe(23);
    expect(wortzahl("<p>Hello <b>world</b></p><p>it’s me</p>")).toBe(4);
    expect(wortzahl("")).toBe(0);
  });

  it("erkennt den Umfang in Aufgabe, Erwartung und Tabelle – Spanne: Untergrenze, mehrere: die kleinste", () => {
    expect(umfangAusText(AUFGABE)?.woerter).toBe(200);
    expect(umfangAusText("Write a comment (about 250 words).")?.woerter).toBe(
      250,
    );
    expect(umfangAusText("Write 200–250 words.")?.woerter).toBe(200);
    expect(
      umfangAusText("Rédigez un courriel (environ 120 mots).")?.woerter,
    ).toBe(120);
    expect(
      umfangAusText("Schreibe einen Leserbrief von mindestens 180 Wörtern.")
        ?.woerter,
    ).toBe(180);
    expect(
      umfangAusText("Part B: write 150 words", "Part C: write about 300 words")
        ?.woerter,
    ).toBe(150);
    // Längenangabe der Vorlage ist kein verlangter Umfang
    expect(
      umfangAusText(
        "Read the article (approx. 800 words) and answer the questions.",
      ),
    ).toBeNull();
    expect(umfangAusText("Beantworte die Fragen.")).toBeNull();
  });

  it("Deckel nach Umfang in Stufen (Vorbild Bayern: bis 25/50/75 % → 1/7, 3/7, 5/7)", () => {
    expect(umfangFaktor(23, 200)).toBe(0.143);
    expect(umfangFaktor(50, 200)).toBe(0.143);
    expect(umfangFaktor(90, 200)).toBe(0.429);
    expect(umfangFaktor(140, 200)).toBe(0.714);
    expect(umfangFaktor(160, 200)).toBe(1);
    // Richtwert: nur bis zur Hälfte
    expect(umfangFaktor(140, 200, true)).toBe(1);
    expect(umfangFaktor(90, 200, true)).toBe(0.429);
  });

  it("Befund: ausdrücklich verlangt oder Richtwert (nur in den Fremdsprachen)", () => {
    const r = doc();
    const u = umfangBefund(r, abgabe())!;
    expect(u).toMatchObject({
      ist: 23,
      soll: 200,
      quelle: "aufgabe",
      faktor: 0.143,
    });
    expect(umfangBefund(r, abgabe("word ".repeat(170)))!.faktor).toBe(1);
    // Ohne Angabe: Richtwert Oberstufe Englisch 200
    const ohne = doc(
      {},
      {
        tabelle: undefined,
        grundlage: {
          art: "frei",
          titel: "",
          aufgaben: "Write an email to Eddie.",
          teile: [mediation],
        },
      },
    );
    expect(umfangBefund(ohne, abgabe())).toMatchObject({
      quelle: "richtwert",
      soll: 200,
    });
    expect(umfangBefund(ohne, abgabe("word ".repeat(120)))?.faktor).toBe(1);
    expect(umfangBefund(ohne, abgabe())?.faktor).toBe(0.143);
    // Deutsch: nur mit ausdrücklicher Angabe
    const ohneZahl = {
      ...tabelle,
      kriterien: tabelle.kriterien.map((k) => ({
        ...k,
        kriterium: k.kriterium.split(":")[0],
      })),
    };
    const deutsch = doc(
      { subjectId: "deutsch", subjectLabel: "Deutsch" },
      {
        tabelle: ohneZahl,
        grundlage: {
          art: "frei",
          titel: "",
          aufgaben: "Schreibe eine Erörterung.",
        },
      },
    );
    expect(umfangBefund(deutsch, abgabe())).toBeNull();
    // Nur Scan, noch kein Text: nichts zu deckeln
    expect(umfangBefund(r, abgabe(""))).toBeNull();
  });
});

describe("Sprachkriterien der Tabelle", () => {
  it("erkennt Bereiche und Kriterien", () => {
    expect(
      tabelle.kriterien.filter(istSprachKriterium).map((k) => k.id),
    ).toEqual(["s1", "s2", "s3"]);
    expect(tabelle.kriterien.filter(istRichtigkeit).map((k) => k.id)).toEqual([
      "s3",
    ]);
    expect(tabelle.kriterien.filter(istSpektrum).map((k) => k.id)).toEqual([
      "s2",
    ]);
    expect(
      istSprachKriterium({
        id: "x",
        kriterium: "Language: range and accuracy",
        punkte: 10,
      }),
    ).toBe(true);
    expect(
      istSprachKriterium({
        id: "x",
        kriterium: "Content: task achievement",
        punkte: 10,
      }),
    ).toBe(false);
  });

  it("Sprachrichtigkeit höchstens 40 Prozentpunkte über dem Ausdruck – auch ohne Umfangsproblem", () => {
    const w = [
      { kriteriumId: "s2", punkte: 8 },
      { kriteriumId: "s3", punkte: 19, begruendung: "kaum Fehler" },
    ];
    const d = tabelleDeckeln(tabelle, w, null);
    // Ausdruck 40 % → Richtigkeit höchstens 80 % von 20 = 16
    expect(d.wertung.find((x) => x.kriteriumId === "s3")?.punkte).toBe(16);
    expect(d.wertung.find((x) => x.kriteriumId === "s3")?.begruendung).toMatch(
      /kaum Fehler \(von der App gedeckelt/,
    );
    expect(d.notizen.join(" ")).toMatch(
      /Bandbreite lässt sich nicht durch Fehlerfreiheit ausgleichen/,
    );
    // Stufen statt Punkten
    const stufen: Bewertungstabelle = {
      ...tabelle,
      kriterien: tabelle.kriterien.map((k) => ({ ...k, punkte: undefined })),
    };
    const s = tabelleDeckeln(
      stufen,
      [
        { kriteriumId: "s2", stufe: 3 },
        { kriteriumId: "s3", stufe: 0 },
      ],
      null,
    );
    // Ausdruck 0 % → Richtigkeit höchstens 40 % → Stufe 2 von 0–3 (33 %)
    expect(s.wertung.find((x) => x.kriteriumId === "s3")?.stufe).toBe(2);
  });

  it("der Umfang deckelt alle Sprachkriterien anteilig, Inhalt bleibt unberührt", () => {
    const u = umfangBefund(doc(), abgabe())!;
    const d = tabelleDeckeln(
      tabelle,
      kiAntwort.tabelle.map((x) => ({ kriteriumId: x.id, punkte: x.punkte })),
      u,
    );
    const p = Object.fromEntries(
      d.wertung.map((x) => [x.kriteriumId, x.punkte]),
    );
    expect(p).toMatchObject({ i4: 1, s1: 2, s2: 2, s3: 2 });
    expect(d.notizen[0]).toMatch(
      /Umfang: 23 von 200 verlangten Wörtern \(„200 words", 12 %\)/,
    );
  });
});

describe("Beispiel der Lehrkraft: 23 Wörter statt ca. 200, Kl. 13", () => {
  it("Tabelle und Teile: 0–2 Notenpunkte statt 6, Begründung nennt die Kappung", () => {
    const r = doc();
    const b = bogenAus(kiAntwort, r, abgabe(), ctx);
    expect(Number(b.gesamt?.wert)).toBeLessThanOrEqual(2);
    expect(b.gesamt?.begruendung).toMatch(/Umfang: 23 von 200/);
    expect(
      b.tabelle?.find((x) => x.kriteriumId === "s3")?.punkte,
    ).toBeLessThanOrEqual(3);
    expect(b.hinweise?.join(" ")).toMatch(/Umfang: 23/);
    // Ohne Leitplanke wären es 29 von 100 Punkten gewesen
    expect(tabellenSumme(tabelle, b.tabelle).erreicht).toBeLessThan(10);
  });

  it("nur Teile (ohne Tabelle): Sprache gedeckelt, Oberstufen-Deckel greift", () => {
    const r = doc({ formen: ["schriftlich", "tipps"] }, { tabelle: undefined });
    const b = bogenAus(kiAntwort, r, abgabe(), ctx);
    expect(b.teile?.[0].sprache).toBeLessThanOrEqual(14);
    expect(Number(b.gesamt?.wert)).toBeLessThanOrEqual(2);
    expect(b.gesamt?.begruendung).toMatch(/Sprache/);
    expect(b.gesamt?.begruendung).toMatch(/Umfang: 23 von 200/);
  });

  it("ein vollständiger Text bleibt ungedeckelt", () => {
    const r = doc();
    const lang =
      "This review shows clearly why the film deserves to be screened. ".repeat(
        18,
      );
    const b = bogenAus(
      {
        ...kiAntwort,
        tabelle: [
          { id: "i1", punkte: 8 },
          { id: "i2", punkte: 8 },
          { id: "i3", punkte: 7 },
          { id: "i4", punkte: 8 },
          { id: "s1", punkte: 16 },
          { id: "s2", punkte: 15 },
          { id: "s3", punkte: 16 },
        ],
      },
      r,
      abgabe(lang),
      ctx,
    );
    expect(b.tabelle?.find((x) => x.kriteriumId === "s3")?.punkte).toBe(16);
    expect(b.gesamt?.anteil).toBe(78);
    expect(b.hinweise ?? []).toEqual([]);
  });

  it("geänderte Punkte der Lehrkraft: Oberstufen-Deckel auch im Tabellen-Weg, Begründung ohne Doppelung", () => {
    const k: SkalenKontext = { meta: meta(), schwellen: ctx.schwellen };
    const w = [
      { kriteriumId: "i1", punkte: 1 },
      { kriteriumId: "i2", punkte: 1 },
      { kriteriumId: "i3", punkte: 1 },
      { kriteriumId: "i4", punkte: 1 },
      { kriteriumId: "s1", punkte: 18 },
      { kriteriumId: "s2", punkte: 18 },
      { kriteriumId: "s3", punkte: 18 },
    ];
    // 58 % ohne Deckel, Inhalt 10 % ungenügend → höchstens 38 % (3 Notenpunkte)
    const s = tabellenSumme(tabelle, w, meta());
    expect(s.gedeckelt?.ohneDeckel).toBe(58);
    expect(s.anteil).toBe(38);
    expect(tabellenSumme(tabelle, w).anteil).toBe(58);
    const g1 = gesamtAusTabelle(
      tabelle,
      { staerken: [], schritte: [], kriterien: [], tabelle: w },
      "notenpunkte",
      k,
    )!;
    expect(g1.anteil).toBe(38);
    const g2 = gesamtAusTabelle(
      tabelle,
      { staerken: [], schritte: [], kriterien: [], tabelle: w, gesamt: g1 },
      "notenpunkte",
      k,
    )!;
    expect(g2.begruendung?.match(/Oberstufen-Deckel/g)).toHaveLength(1);
    // Sek I: kein Oberstufen-Deckel
    expect(tabellenSumme(tabelle, w, meta({ grade: 9 })).anteil).toBe(58);
    expect(
      begruendungMitDeckel(
        "A. Oberstufen-Deckel: x (KMK-Bildungsstandards 2012: y).",
        undefined,
      ),
    ).toBe("A.");
  });
});

describe("Anfragen an die KI", () => {
  it("Bogen: Sprachrichtigkeit relativ zur Komplexität, Umfang als Befund der App", () => {
    const u = bogenAnfrage(doc(), abgabe(), "sys").user;
    expect(u).toMatch(/Sprachrichtigkeit NIE isoliert/);
    expect(u).toMatch(
      /BEFUND DER APP: Die Abgabe hat 23 Wörter; verlangt sind laut Aufgabe 200 Wörter/,
    );
    expect(u).toMatch(/Sprachliche Leistung \(Nordrhein-Westfalen\)/);
    expect(u).toMatch(/GER B2/);
    // Mathematik: keine Sprachregeln
    const mathe = doc(
      { subjectId: "mathematik", subjectLabel: "Mathematik" },
      {
        tabelle: undefined,
        grundlage: { art: "frei", titel: "", aufgaben: "Löse." },
      },
    );
    expect(bogenAnfrage(mathe, abgabe(), "sys").user).not.toMatch(
      /SPRACHLICHE LEISTUNG/,
    );
  });

  it("Tabellen-Entwurf: drei Sprachkriterien mit Stufen, Umfang aus der Aufgabe, Gewichtung 40 : 60", () => {
    const u = tabelleEntwurfAnfrage(doc()).user;
    expect(u).toMatch(/Kommunikative Textgestaltung/);
    expect(u).toMatch(/Ausdrucksvermögen\/Verfügbarkeit sprachlicher Mittel/);
    expect(u).toMatch(/Sprachrichtigkeit .*IM VERHÄLTNIS ZUR KOMPLEXITÄT/);
    expect(u).toMatch(/ca\. 200 words/);
    expect(u).toMatch(/Inhalt etwa 40 %, Darstellung\/Sprache etwa 60 %/);
    expect(
      tabelleEntwurfAnfrage(
        doc({ subjectId: "mathematik", subjectLabel: "Mathematik" }),
      ).user,
    ).not.toMatch(/Sprachrichtigkeit/);
  });

  it("Stufenbeschreibungen bleiben auch bei Punkten erhalten und gehen an die KI", () => {
    const t = tabelleAus(
      {
        titel: "T",
        stufen: [],
        kriterien: [
          {
            bereich: "Darstellung/Sprache",
            kriterium: "Sprachrichtigkeit",
            punkte: 20,
            deskriptoren: ["18–20 P.: a", "0–4 P.: b"],
          },
        ],
      },
      "ki",
    );
    expect(t.kriterien[0].deskriptoren).toEqual(["18–20 P.: a", "0–4 P.: b"]);
    expect(tabelleText(t)).toMatch(
      /max\. 20 Punkte \(Stufen: 18–20 P\.: a; 0–4 P\.: b\)/,
    );
  });
});
