/**
 * Vokabeltest: Vorwissen der Klasse bei Wortformen (30.09.2026, Wunsch der Lehrkraft).
 *
 * Wortänderungen wie das simple past sind für frühe Jahrgänge ggf. noch zu viel. Die App leitet
 * aus Sprache, Jahrgang und Fremdsprachenfolge das Lernjahr ab (wie der Grammatiktest), ordnet
 * die Formthemen der Grammatiktabelle ein und gibt sie der KI als „VORWISSEN DER KLASSE" mit.
 */
import { describe, expect, it } from "vitest";
import type {
  TestSettings,
  VocabEntry,
  GapBlock,
} from "../src/renderer/src/modules/vokabeltest/model/types";
import {
  englischeGegenwartsformen,
  formBefunde,
  formHinweis,
  formVorwissen,
  lernjahrVon,
  vorwissenRegel,
} from "../src/renderer/src/modules/vokabeltest/didactics/formVorwissen";
import {
  FORM_PRUEFUNG,
  reviewBlock,
  reviewVariant,
  systemPrompt,
} from "../src/renderer/src/modules/vokabeltest/generation/generate";
import {
  availableAutoTypes,
  fallbackTypes,
} from "../src/renderer/src/modules/vokabeltest/generation/autoPlan";

const s = (over: Partial<TestSettings> = {}): TestSettings => ({
  targetLanguage: "en",
  stateId: "NI",
  schoolTypeId: "gymnasium",
  languageOrder: 1,
  grade: 5,
  level: "A1",
  vocabCount: 10,
  variantCount: 1,
  variantMode: "sameVocab",
  tasks: [],
  topic: "",
  pictureSource: "none",
  answerKey: true,
  seed: 1,
  ...over,
});

describe("Lernjahr und Einordnung", () => {
  it("rechnet das Lernjahr aus Jahrgang und Fremdsprachenfolge", () => {
    expect(lernjahrVon(s({ grade: 5 }))).toBe(1);
    expect(lernjahrVon(s({ grade: 7 }))).toBe(3);
    expect(
      lernjahrVon(s({ targetLanguage: "fr", languageOrder: 2, grade: 6 }))
    ).toBe(1);
    // NRW: 2. Fremdsprache ein Jahr später
    expect(
      lernjahrVon(
        s({ targetLanguage: "fr", languageOrder: 2, grade: 7, stateId: "NW" })
      )
    ).toBe(1);
  });

  it("Englisch Klasse 5: Plural und simple present bekannt, simple past noch nicht sicher, keine Wortbildung", () => {
    const v = formVorwissen(s());
    expect(v.lernjahr).toBe(1);
    expect(v.bekannt.join(" | ")).toMatch(/plural/i);
    expect(v.bekannt.join(" | ")).toMatch(/simple present/i);
    expect(v.bekannt).not.toContain("simple past");
    expect(v.vielleicht).toContain("simple past");
    expect(v.nochNicht.join(" | ")).toMatch(/present perfect/);
    expect(v.vergangenheit).toBe(false);
    expect(v.wortbildung).toBe(false);
  });

  it("Englisch Klasse 7: simple past bekannt", () => {
    const v = formVorwissen(s({ grade: 7, level: "A2" }));
    expect(v.bekannt).toContain("simple past");
    expect(v.vergangenheit).toBe(true);
  });

  it("Französisch 2. Fremdsprache Klasse 6: passé composé noch nicht", () => {
    const v = formVorwissen(
      s({ targetLanguage: "fr", languageOrder: 2, grade: 6 })
    );
    expect(v.nochNicht.join(" | ")).toMatch(/passé composé/);
    expect(v.vergangenheit).toBe(false);
  });

  it("Sprache ohne Grammatiktabelle: vorsichtige Faustregel", () => {
    const v = formVorwissen(
      s({ targetLanguage: "nl", languageOrder: 2, grade: 6 })
    );
    expect(v.quelle).toBe("faustregel");
    expect(v.nochNicht).toContain("past tenses");
    expect(
      formVorwissen(s({ targetLanguage: "nl", languageOrder: 2, grade: 11 }))
        .nochNicht
    ).toEqual([]);
  });

  it("nimmt die Grammatik des gewählten Lehrwerks dazu", () => {
    const v = formVorwissen(s(), {
      words: [],
      total: 0,
      strict: true,
      source: "Green Line 1",
      buch: "Green Line 1",
      unit: "Unit 3",
    });
    expect(v.lehrwerk?.vorher.join(" ")).toMatch(/simple present/);
    expect(v.lehrwerk?.aktuell).toMatch(/do\/does/);
    expect(v.lehrwerk?.danach.join(" ")).toMatch(/present progressive/);
  });
});

describe("Prompt-Regel", () => {
  it("Systemprompt Klasse 5 enthält VORWISSEN DER KLASSE mit simple past als möglicherweise fehlend", () => {
    const p = systemPrompt(s());
    expect(p).toMatch(/VORWISSEN DER KLASSE/);
    expect(p).toMatch(/Possibly NOT yet taught[^\n]*simple past/);
    expect(p).toMatch(/base form exactly as in the word list/);
    expect(p).toMatch(/Do not ask students to derive new words/);
  });

  it("späte Lernjahre ohne Lücken bekommen keinen Abschnitt", () => {
    expect(vorwissenRegel(formVorwissen(s({ grade: 12, level: "B2" })))).toBe(
      ""
    );
    expect(systemPrompt(s({ grade: 12, level: "B2" }))).not.toMatch(
      /VORWISSEN DER KLASSE/
    );
  });

  it("die KI-Prüfung fragt nach noch nicht eingeführten Formen", async () => {
    const calls: { system: string; user: string }[] = [];
    const ai = async <T>(req: { system: string; user: string }): Promise<T> => {
      calls.push(req);
      return { problems: [] } as T;
    };
    const block: GapBlock = {
      id: "b",
      taskType: "gapSentences",
      kind: "gap",
      title: "",
      instruction: "",
      pointsPerItem: 1,
      items: [],
      wordBank: true,
      firstLetterHint: false,
      extraBankWords: [],
    };
    await reviewBlock(block, s(), ai as never);
    await reviewVariant([block], s(), ai as never);
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.user).toContain(FORM_PRUEFUNG);
      expect(c.system).toMatch(/VORWISSEN DER KLASSE/);
    }
  });
});

describe("Aufgabenwahl und Hinweise", () => {
  it("Wortbildung fällt in frühen Lernjahren aus der automatischen Auswahl", () => {
    expect(
      availableAutoTypes({
        level: "B1",
        targetLanguage: "en",
        grade: 5,
        languageOrder: 1,
      })
    ).not.toContain("wordFormation");
    expect(
      availableAutoTypes({
        level: "B1",
        targetLanguage: "en",
        grade: 5,
        languageOrder: 1,
      })
    ).not.toContain("wordFamily");
    // Ohne Sprache und Jahrgang wie bisher
    expect(availableAutoTypes({ level: "B1" })).toContain("wordFormation");
    expect(
      availableAutoTypes({
        level: "B1",
        targetLanguage: "en",
        grade: 9,
        languageOrder: 1,
      })
    ).toContain("wordFormation");
    for (let i = 0; i < 20; i++)
      expect(
        fallbackTypes(
          { level: "B1", targetLanguage: "en", grade: 5, languageOrder: 1 },
          16
        )
      ).not.toContain("wordFormation");
  });

  it("Aufgabenkarte: Hinweis bei Formänderungen", () => {
    const v = formVorwissen(s());
    expect(formHinweis("wordFormation", v)).toMatch(
      /Verlangt Formänderungen.*Lernjahr 1 ggf\. noch zu schwer/
    );
    expect(formHinweis("gapSentences", v)).toMatch(/Grundform/);
    expect(formHinweis("matchDefinitions", v)).toBeUndefined();
    expect(
      formHinweis("wordFormation", formVorwissen(s({ grade: 9, level: "B1" })))
    ).toBeUndefined();
  });
});

describe("Örtliche Prüfung der Verbformen (Englisch)", () => {
  const go: VocabEntry = { id: "go", term: "to go", translation: "gehen" };
  const house: VocabEntry = {
    id: "h",
    term: "house",
    translation: "Haus",
    pos: "noun",
  };
  const block = (answers: [string, string][]): GapBlock => ({
    id: "b",
    taskType: "gapSentences",
    kind: "gap",
    title: "",
    instruction: "",
    pointsPerItem: 1,
    items: answers.map(([vocabId, answer], i) => ({
      id: `i${i}`,
      vocabId,
      sentences: [{ before: "x", after: "y" }],
      answer,
    })),
    wordBank: true,
    firstLetterHint: false,
    extraBankWords: [],
  });

  it("erlaubt Grundform, -s und -ing", () => {
    expect(englischeGegenwartsformen("go")).toEqual(
      expect.arrayContaining(["go", "goes", "going"])
    );
    expect(englischeGegenwartsformen("study")).toContain("studies");
    expect(englischeGegenwartsformen("be")).toContain("are");
  });

  it("meldet eine Vergangenheitsform in Klasse 5, nicht in Klasse 7", () => {
    const b = block([
      ["go", "went"],
      ["go", "goes"],
      ["h", "houses"],
    ]);
    const f5 = formBefunde(b, [go, house], formVorwissen(s()));
    expect(f5).toHaveLength(1);
    expect(f5[0].item).toBe(1);
    expect(f5[0].message).toMatch(/went/);
    expect(
      formBefunde(b, [go, house], formVorwissen(s({ grade: 7, level: "A2" })))
    ).toEqual([]);
  });
});

describe("Latein", () => {
  it("Lernjahr 1: Perfekt vielleicht noch nicht, Regel für lateinische Sätze statt Wortbildungsverbot", () => {
    const v = formVorwissen(
      s({ targetLanguage: "la", languageOrder: 2, grade: 6 })
    );
    expect(v.vielleicht.join(" ")).toMatch(/perfectum/);
    const regel = vorwissenRegel(v);
    expect(regel).toMatch(
      /Latin sentences and phrases use only forms the class already knows/
    );
    expect(regel).not.toMatch(/derive new words/);
  });
});
