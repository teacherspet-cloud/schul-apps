/**
 * Farbe + Muster (Entscheidung der Lehrkraft vom 30.09.2026): Japanisch, Arabisch, Dänisch,
 * Neugriechisch, Psychologie und Hauswirtschaft teilen die Grundfarbe eines verwandten Fachs und
 * unterscheiden sich durch Muster und Kürzel. Geprüft ohne Oberfläche: Katalog, Helfer und die
 * Weitergabe an Druck (Designvorlage, Deckblatt) und Word.
 */
import { afterEach, describe, expect, it } from "vitest";
import { presetDesigns } from "@shared/design";
import {
  FAECHER,
  FACH_ZU_SPRACHE,
  bilingualFaehig,
} from "../src/shared/faecher";
import {
  designMitFachfarbe,
  FACH_MUSTER,
  FACH_PALETTE,
  FACH_VORSCHLAG,
  fachIdVon,
  fachKennzeichen,
  fachKuerzel,
  fachMuster,
  farbzwilling,
  graustufenPruefung,
  merkeFachfarben,
  musterEbene,
  musterHintergrund,
  musterWordSchattierung,
} from "../src/renderer/src/shared/fachfarben";
import {
  deckblattFarben,
  deckblattVariablen,
} from "../src/renderer/src/modules/arbeitsblatt/render/coverDesigns";

afterEach(() => merkeFachfarben({}));

const MUSTER_FAECHER = FAECHER.filter((f) => f.muster);

describe("Muster-Fächer im Katalog", () => {
  it("die sechs Fächer der Lehrkraft, je mit verwandtem Farbzwilling", () => {
    expect(MUSTER_FAECHER.map((f) => f.id).sort()).toEqual([
      "arabisch",
      "daenisch",
      "hauswirtschaft",
      "japanisch",
      "neugriechisch",
      "psychologie",
    ]);
    expect(farbzwilling("japanisch")).toBe("chinesisch");
    expect(farbzwilling("arabisch")).toBe("tuerkisch");
    expect(farbzwilling("daenisch")).toBe("niederlaendisch");
    expect(farbzwilling("neugriechisch")).toBe("griechisch");
    expect(farbzwilling("psychologie")).toBe("paedagogik");
    expect(farbzwilling("hauswirtschaft")).toBe("arbeitslehre");
    expect(farbzwilling("englisch")).toBeNull();
  });

  it("Sprachen mit Sprachcode (Neugriechisch el ≠ Altgriechisch grc), nicht bilingual; Landesnamen erkannt", () => {
    expect(FACH_ZU_SPRACHE.ja).toBe("japanisch");
    expect(FACH_ZU_SPRACHE.ar).toBe("arabisch");
    expect(FACH_ZU_SPRACHE.da).toBe("daenisch");
    expect(FACH_ZU_SPRACHE.el).toBe("neugriechisch");
    expect(FACH_ZU_SPRACHE.grc).toBe("griechisch");
    for (const id of ["japanisch", "arabisch", "daenisch", "neugriechisch"])
      expect(bilingualFaehig(id), id).toBe(false);
    expect(bilingualFaehig("psychologie")).toBe(true);
    expect(fachIdVon("AES")).toBe("hauswirtschaft");
    expect(fachIdVon("Hauswirtschaft")).toBe("hauswirtschaft");
    expect(fachIdVon("Griechisch")).toBe("griechisch");
  });

  it("Grundfarbe aus der druckfesten Palette – S/W-Prüfung gilt weiter", () => {
    const palette = new Set(FACH_PALETTE.map((p) => p.hex));
    for (const f of MUSTER_FAECHER) {
      expect(palette.has(FACH_VORSCHLAG[f.id]), f.id).toBe(true);
      expect(graustufenPruefung(FACH_VORSCHLAG[f.id]).stufe, f.id).toBe("gut");
    }
  });
});

describe("Unterscheidbar durch Muster + Kürzel", () => {
  it("jedes Muster-Fach unterscheidet sich von seinem Farbzwilling und von allen anderen Fächern", () => {
    for (const f of MUSTER_FAECHER) {
      const zwilling = farbzwilling(f.id)!;
      // Gleiche Grundfarbe, aber Muster ≠ keins und eigenes Kürzel
      expect(FACH_VORSCHLAG[f.id]).toBe(FACH_VORSCHLAG[zwilling]);
      expect(fachMuster(zwilling), zwilling).toBeNull();
      expect(
        musterHintergrund(FACH_VORSCHLAG[f.id], fachMuster(f.id))
      ).not.toBe(
        musterHintergrund(FACH_VORSCHLAG[zwilling], fachMuster(zwilling))
      );
      expect(fachKuerzel(f.id)).not.toBe(fachKuerzel(zwilling));
      // Gegen alle anderen: Paar (Farbe, Muster) und Kürzel eindeutig
      for (const g of FAECHER)
        if (g.id !== f.id) {
          const gleichesBild =
            FACH_VORSCHLAG[g.id] === FACH_VORSCHLAG[f.id] &&
            (g.muster ?? null) === f.muster;
          expect(gleichesBild, `${f.id} ↔ ${g.id}`).toBe(false);
          expect(g.kuerzel, `${f.id} ↔ ${g.id}`).not.toBe(f.kuerzel);
        }
    }
  });

  it("jedes Muster ergibt eine sichtbare Ebene; drei Muster, drei Bilder", () => {
    const ebenen = new Set(
      ["streifen", "punkte", "karo"].map((m) => musterEbene(m as "streifen"))
    );
    expect(ebenen.size).toBe(3);
    expect(musterEbene(null)).toBe("none");
    expect(musterHintergrund("#403040", null)).toBe("#403040");
    expect(musterHintergrund("#403040", "punkte")).toMatch(
      /radial-gradient.*#403040$/
    );
    expect(musterEbene("streifen", "mm")).toContain("mm");
    expect(Object.keys(FACH_MUSTER).length).toBe(MUSTER_FAECHER.length);
  });

  it("Kennzeichen folgt einer eigenen Farbe aus den Einstellungen – das Muster bleibt", () => {
    merkeFachfarben({ japanisch: "#1971c2" });
    expect(fachKennzeichen("ja")).toMatchObject({
      farbe: "#1971c2",
      muster: "punkte",
      kuerzel: "Jap",
    });
    expect(fachKennzeichen("zh")).toMatchObject({
      muster: null,
      kuerzel: "Chin",
    });
  });
});

describe("Muster im Druck und in Word", () => {
  const d = presetDesigns()[0];

  it("Designvorlage: Muster reist mit der Fachfarbe, fehlt bei „Farbe der Vorlage“ und bei Fächern ohne Muster", () => {
    expect(
      designMitFachfarbe(d, "japanisch", false, {}).page.accentMuster
    ).toBe("punkte");
    expect(
      designMitFachfarbe(d, "chinesisch", false, {}).page.accentMuster
    ).toBeUndefined();
    expect(designMitFachfarbe(d, "japanisch", true, {})).toBe(d);
  });

  it("Deckblatt: Muster im Kopfbereich nur bei der Fachfarbe", () => {
    const fach = deckblattFarben({ subjectId: "psychologie" });
    expect(fach.muster).toBe("streifen");
    expect(deckblattVariablen(fach)["--cover-muster"]).toContain(
      "repeating-linear-gradient"
    );
    expect(
      deckblattVariablen(deckblattFarben({ subjectId: "paedagogik" }))[
        "--cover-muster"
      ]
    ).toBe("none");
  });

  it("Word: gemusterte Schattierung statt voller Fläche", () => {
    expect(musterWordSchattierung("#403040", null)).toEqual({
      type: "clear",
      color: "auto",
      fill: "403040",
    });
    expect(musterWordSchattierung("#403040", "streifen").type).toBe(
      "thinDiagStripe"
    );
    expect(musterWordSchattierung("#403040", "karo").type).toBe(
      "thinDiagCross"
    );
    expect(musterWordSchattierung("#403040", "punkte").type).toBe("pct10");
  });
});
