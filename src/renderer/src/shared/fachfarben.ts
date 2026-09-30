/**
 * Fachfarben (Paket 10a, 26.09.2026).
 *
 * Wunsch der Lehrkraft: Ein Fach hat EINE Farbe über alle Materialien – Arbeitsblatt,
 * Lernzielkontrolle, Grammatiktest, Klassenarbeit, Vokabeltest. Die Designvorlage bestimmt
 * weiter Aufbau und Schrift, die Farbe kommt vom Fach. So erkennt man im Ordner und auf dem
 * Tisch sofort, was zu Biologie und was zu Englisch gehört.
 *
 * Die Farbe wird beim Darstellen aus den Einstellungen gelesen, nicht ins Material kopiert:
 * Ändert die Lehrkraft die Farbe eines Fachs, ziehen alle Materialien dieses Fachs mit. Nur
 * wer an einem Material „Farbe der Vorlage verwenden" wählt, behält die Vorlagenfarbe.
 *
 * Dieses Modul ist bewusst ohne React und ohne Store geschrieben (Prüfung in
 * tests/fachfarben.test.ts). Die Einstellungen reicht settingsStore.ts über
 * `merkeFachfarben` herein – so können auch Druck und Word-Export, die außerhalb von React
 * laufen, die Farbe lesen.
 */
import type { DesignTemplate } from "@shared/design";
import { SUBJECTS } from "../modules/arbeitsblatt/model/subjects";
import {
  FAECHER,
  FACH_ZU_SPRACHE as KATALOG_SPRACHE,
  fachAusName,
} from "@shared/faecher";
import type { FachMuster } from "@shared/faecher";

export interface PalettenFarbe {
  hex: string;
  name: string;
}

/*
 * DRUCKFESTE PALETTE: 24 Farben, gewählt für Schulkopierer und Laserdrucker.
 *
 * Belegt (WCAG 2.1): Jede Farbe hat gegen Weiß ein Kontrastverhältnis von mindestens 4,5 : 1
 * (SC 1.4.3) – weiße Aufgabennummern auf der Farbfläche bleiben lesbar, Überschriften und
 * Linien auf weißem Papier ebenso. Untereinander liegen die Farben mindestens ΔE₀₀ = 12
 * auseinander (CIEDE2000; ab etwa 10 gelten Farben nebeneinander als klar verschieden).
 *
 * Faustregel (nicht belegt, aus der Druckpraxis): Sehr helle Farben (Gelb, Hellblau)
 * verschwinden auf der Schwarz-Weiß-Kopie, fast schwarze Farben unterscheiden sich dort nicht
 * mehr vom Text. Deshalb enthält die Palette weder Pastell- noch Neonfarben; die hellste liegt
 * noch bei 4,5 : 1 gegen Weiß, die dunkelste bei 1,6 : 1 gegen Schwarz.
 */
export const FACH_PALETTE: PalettenFarbe[] = [
  { hex: "#1d4e89", name: "Dunkelblau" },
  { hex: "#1971c2", name: "Blau" },
  { hex: "#0b6e80", name: "Petrol" },
  { hex: "#0a8068", name: "Türkis" },
  { hex: "#1f5c45", name: "Tannengrün" },
  { hex: "#2a7f38", name: "Grün" },
  { hex: "#617a14", name: "Olivgrün" },
  { hex: "#946b00", name: "Ocker" },
  { hex: "#c25100", name: "Orange" },
  { hex: "#c92a2a", name: "Rot" },
  { hex: "#8c1d40", name: "Bordeaux" },
  { hex: "#b0247a", name: "Magenta" },
  { hex: "#5f3dc4", name: "Violett" },
  { hex: "#7c4a1e", name: "Braun" },
  { hex: "#5a6270", name: "Schiefergrau" },
  { hex: "#2f3338", name: "Anthrazit" },
  /*
   * Ergänzt am 26.09.2026 (Wunsch der Lehrkraft: jedes Fach ein eigener Vorschlag, auch
   * Niederländisch und Russisch aus dem Vokabeltest – 24 Fächer). Die ersten 16 blieben, wie
   * sie waren. Die acht neuen sind per Rechnung gesucht: unter allen sRGB-Farben mit
   * „gut" in der Graustufen-Prüfung (≥ 4,5 : 1 gegen Weiß, ≥ 1,6 : 1 gegen Schwarz), mit
   * mittlerer Buntheit (Chroma 35–70 – keine Neon-, keine Grautöne) jeweils die, die von
   * allen übrigen am weitesten entfernt liegt. Ergebnis: kleinster Abstand zweier Farben der
   * ganzen Palette ΔE₀₀ = 12,3 – die Schwelle 12 hält also auch mit 24 Farben.
   */
  { hex: "#aa50be", name: "Orchidee" },
  { hex: "#5a5014", name: "Khaki" },
  { hex: "#b45a6e", name: "Altrosa" },
  { hex: "#643c78", name: "Pflaume" },
  { hex: "#285a00", name: "Moosgrün" },
  { hex: "#aa6450", name: "Terrakotta" },
  { hex: "#823c32", name: "Rostrot" },
  { hex: "#786eaa", name: "Lavendel" },
  // 29.09.2026 fuer das neue Fach Technik: per Rechnung gesucht wie oben, kleinster Abstand zur Palette dE00 = 14,3
  { hex: "#004048", name: "Tiefseeblau" },
  // 29.09.2026 für Griechisch, Wirtschaft, Ethik, Philosophie – nacheinander so gesucht, jeweils ΔE₀₀ ≥ 12,5 zu allen übrigen
  { hex: "#480088", name: "Indigo" },
  { hex: "#581840", name: "Aubergine" },
  { hex: "#582000", name: "Kastanie" },
  { hex: "#907050", name: "Nougat" },
  /*
   * 30.09.2026 für zehn neue Fächer (Niederländisch hatte schon eine Farbe): Polnisch, Tschechisch,
   * Portugiesisch, Türkisch, Chinesisch, Gesellschaftslehre, Naturwissenschaften, Arbeitslehre,
   * Darstellendes Spiel, Pädagogik. Gesucht wie oben, aber ohne Untergrenze der Buntheit: Mit
   * Chroma ≥ 35 findet sich neben den 29 Farben nur noch EINE mit ΔE₀₀ ≥ 12. Deshalb Schritt für
   * Schritt unter allen druckfesten Kandidaten mit ΔE₀₀ ≥ 12,2 zu allen übrigen die buntesten –
   * gedeckte, dunkle Töne. Kleinster Abstand der ganzen Palette danach ΔE₀₀ = 12,2. Der Farbraum
   * ist damit ausgeschöpft: Weitere Fächer brauchen eine niedrigere Schwelle oder teilen Farben.
   */
  { hex: "#283060", name: "Nachtblau" },
  { hex: "#283808", name: "Dunkeloliv" },
  { hex: "#906088", name: "Malve" },
  { hex: "#403010", name: "Mokka" },
  { hex: "#502828", name: "Ochsenblut" },
  { hex: "#586848", name: "Salbei" },
  { hex: "#704858", name: "Heide" },
  { hex: "#886868", name: "Taupe" },
  { hex: "#403040", name: "Brombeere" },
  { hex: "#605040", name: "Walnuss" },
];

const farbe = (name: string): string =>
  FACH_PALETTE.find((f) => f.name === name)!.hex;

/*
 * Vorschläge je Fach – seit 26.09.2026 für JEDES Fach ein eigener (vorher teilten sich
 * sechs Fächer ihre Farbe mit einem anderen, Niederländisch und Russisch hatten keine).
 * Naheliegendes blieb: Biologie grün, Erdkunde oliv, Deutsch rot; DaZ bekam das Altrosa neben
 * dem Rot von Deutsch, Sachunterricht ein Moosgrün neben Biologie.
 * Geschichte war braun; auf Wunsch der Lehrkraft (26.09.2026) getauscht mit Latein: Geschichte
 * jetzt Bordeaux, Latein Braun.
 * Eine in den Einstellungen gewählte Farbe bleibt unverändert – nur die Vorschläge sind neu.
 */
export const FACH_VORSCHLAG: Record<string, string> = Object.fromEntries(
  FAECHER.map((f) => [f.id, farbe(f.farbe)])
);

/**
 * Fächer außerhalb der Fächerliste – seit 30.09.2026 leer: Niederländisch (bis dahin nur im
 * Vokabeltest) steht jetzt im gemeinsamen Katalog. Bleibt für Aufrufer und Tests bestehen.
 */
export const WEITERE_FAECHER: { id: string; label: string }[] = [];

/** Sprachcode eines Vokabeltests → Fach (Vokabeltests kennen nur die Sprache) – aus dem Katalog */
export const FACH_ZU_SPRACHE: Record<string, string> = KATALOG_SPRACHE;

// ---------- Farbrechnung (sRGB, WCAG 2.1, CIELAB) ----------

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

export function istFarbe(wert: unknown): wert is string {
  return typeof wert === "string" && HEX.test(wert.trim());
}

function rgb(hex: string): [number, number, number] {
  let h = hex.trim().replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

const linear = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Relative Leuchtdichte nach WCAG 2.1 (0 = Schwarz, 1 = Weiß) – das ist zugleich der Grauwert im S/W-Druck */
export function leuchtdichte(hex: string): number {
  const [r, g, b] = rgb(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Kontrastverhältnis nach WCAG 2.1 (1 … 21) */
export function kontrast(a: string, b: string): number {
  const [hell, dunkel] = [leuchtdichte(a), leuchtdichte(b)].sort(
    (x, y) => y - x
  );
  return (hell + 0.05) / (dunkel + 0.05);
}

function lab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(linear);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number =>
    t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Farbabstand ΔE₀₀ (CIEDE2000) – wie verschieden zwei Farben fürs Auge wirken */
export function farbabstand(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  const rad = Math.PI / 180;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cm = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cm ** 7 / (cm ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const h1p = (Math.atan2(b1, a1p) / rad + 360) % 360;
  const h2p = (Math.atan2(b2, a2p) / rad + 360) % 360;
  const dL = l2 - l1;
  const dC = c2p - c1p;
  let dh = 0;
  if (c1p * c2p !== 0) {
    dh = h2p - h1p;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin((dh / 2) * rad);
  const lm = (l1 + l2) / 2;
  const cpm = (c1p + c2p) / 2;
  let hm = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hm = (h1p + h2p) / 2;
    else hm = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos((hm - 30) * rad) +
    0.24 * Math.cos(2 * hm * rad) +
    0.32 * Math.cos((3 * hm + 6) * rad) -
    0.2 * Math.cos((4 * hm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cpm ** 7 / (cpm ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lm - 50) ** 2) / Math.sqrt(20 + (lm - 50) ** 2);
  const sc = 1 + 0.045 * cpm;
  const sh = 1 + 0.015 * cpm * t;
  const rt = -Math.sin(2 * dTheta * rad) * rc;
  return Math.sqrt(
    (dL / sl) ** 2 +
      (dC / sc) ** 2 +
      (dH / sh) ** 2 +
      rt * (dC / sc) * (dH / sh)
  );
}

// ---------- Graustufen-Prüfung ----------

export type GrauStufe = "gut" | "knapp" | "zu-hell" | "zu-dunkel";

export interface GrauPruefung {
  stufe: GrauStufe;
  /** Kontrast gegen weißes Papier */
  gegenWeiss: number;
  /** Kontrast gegen schwarzen Text */
  gegenSchwarz: number;
  /** Grauwert im S/W-Druck in Prozent Schwärzung (0 = weiß, 100 = schwarz) */
  grauProzent: number;
  /** Hinweis für die Lehrkraft; leer, wenn alles in Ordnung ist */
  hinweis: string;
}

/*
 * Schwellen der Prüfung.
 *  - 3 : 1 gegen Weiß: belegt als Mindestkontrast für Linien und Flächen (WCAG 2.1 SC 1.4.11).
 *    Darunter verblassen Rahmen und Farbband im S/W-Druck – auf Kopien noch stärker.
 *  - 4,5 : 1 gegen Weiß: belegt als Mindestkontrast für Text (WCAG 2.1 SC 1.4.3). Farbige
 *    Überschriften und weiße Nummern auf der Farbfläche brauchen ihn.
 *  - 1,6 : 1 gegen Schwarz: FAUSTREGEL. Darunter ist die Farbe im S/W-Druck praktisch
 *    schwarz – Überschriften heben sich nicht mehr vom Text ab. Das ist kein Lesbarkeits-
 *    problem, nur verschenkte Gliederung; deshalb nur ein milder Hinweis.
 */
export const GRAU_SCHWELLEN = {
  linieGegenWeiss: 3,
  textGegenWeiss: 4.5,
  gegenSchwarz: 1.6,
};

export function graustufenPruefung(hex: string): GrauPruefung {
  const gegenWeiss = kontrast(hex, "#ffffff");
  const gegenSchwarz = kontrast(hex, "#000000");
  const grauProzent = Math.round((1 - leuchtdichte(hex) ** (1 / 2.2)) * 100);
  const s = GRAU_SCHWELLEN;
  if (gegenWeiss < s.linieGegenWeiss)
    return {
      stufe: "zu-hell",
      gegenWeiss,
      gegenSchwarz,
      grauProzent,
      hinweis:
        "Zu hell für den S/W-Druck: Linien, Farbband und Überschriften verblassen auf der Kopie fast ganz.",
    };
  if (gegenWeiss < s.textGegenWeiss)
    return {
      stufe: "knapp",
      gegenWeiss,
      gegenSchwarz,
      grauProzent,
      hinweis:
        "Knapp: Im S/W-Druck bleiben Linien sichtbar, farbige Überschriften und weiße Nummern auf der Farbe werden aber blass.",
    };
  if (gegenSchwarz < s.gegenSchwarz)
    return {
      stufe: "zu-dunkel",
      gegenWeiss,
      gegenSchwarz,
      grauProzent,
      hinweis:
        "Sehr dunkel: Im S/W-Druck sehen Überschriften aus wie normaler Text (Faustregel).",
    };
  return { stufe: "gut", gegenWeiss, gegenSchwarz, grauProzent, hinweis: "" };
}

// ---------- Fachfarbe eines Materials ----------

/** Fachkennung aus Kennung, Anzeigename oder Sprachcode – die Listen der Programme speichern Verschiedenes */
export function fachIdVon(wert?: string): string | null {
  if (!wert) return null;
  const w = wert.trim();
  if (FACH_VORSCHLAG[w]) return w;
  if (FACH_ZU_SPRACHE[w]) return FACH_ZU_SPRACHE[w];
  const klein = w.toLocaleLowerCase("de");
  // Auch Landesnamen wie „Gemeinschaftskunde“ oder „WAT“ (Katalog, Feld auch)
  return (
    [...SUBJECTS, ...WEITERE_FAECHER].find(
      (s) => s.label.toLocaleLowerCase("de") === klein
    )?.id ??
    fachAusName(w)?.id ??
    null
  );
}

/** Farbe eines Fachs nach den Einstellungen (fehlt dort eine, gilt der Vorschlag); null = unbekanntes Fach */
export function fachFarbeAus(
  fach: string | undefined,
  eigene: Record<string, string> | undefined
): string | null {
  const id = fachIdVon(fach);
  if (!id) return null;
  const gewaehlt = eigene?.[id];
  return istFarbe(gewaehlt) ? gewaehlt : FACH_VORSCHLAG[id] ?? null;
}

let eingestellt: Record<string, string> = {};

/** Von settingsStore.ts nach jedem Laden und Ändern der Einstellungen aufgerufen */
export function merkeFachfarben(
  werte: Record<string, string> | undefined
): void {
  eingestellt = werte ?? {};
}

/**
 * Farbe eines Fachs, wie sie gerade eingestellt ist – für Punkte in Bibliotheken und auf der
 * Startseite und (Paket 10b) die Ordnersymbole der Themenbereiche. Nimmt Kennung, Namen
 * („Biologie") oder Sprachcode („en").
 */
export function fachFarbe(fach: string | undefined): string | null {
  return fachFarbeAus(fach, eingestellt);
}

/**
 * Die Akzentfarbe, mit der ein Material gedruckt wird – der Vorrang in einer Funktion:
 * 1. „Farbe der Vorlage verwenden" am Material → die Vorlagenfarbe;
 * 2. sonst die Fachfarbe (eigene Wahl in den Einstellungen, sonst der Vorschlag);
 * 3. unbekanntes Fach (z. B. Niederländisch im Vokabeltest) → die Vorlagenfarbe.
 */
export function wirksameFarbe(
  vorlage: string,
  fach: string | undefined,
  vorlagenfarbe: boolean | undefined,
  eigene = eingestellt
): string {
  if (vorlagenfarbe) return vorlage;
  return fachFarbeAus(fach, eigene) ?? vorlage;
}

/**
 * Designvorlage mit Fachfarbe: ersetzt die Akzentfarbe und die Farbe der Seitenleiste. Aufbau,
 * Schrift und Ränder bleiben die der Vorlage. Liefert dasselbe Objekt zurück, wenn sich nichts
 * ändert – wichtig für die Vorschau, die an unveränderten Objekten nichts neu misst.
 */
export function designMitFachfarbe(
  design: DesignTemplate,
  fach: string | undefined,
  vorlagenfarbe: boolean | undefined,
  eigene = eingestellt
): DesignTemplate {
  const f = vorlagenfarbe ? null : fachFarbeAus(fach, eigene);
  // Vorlagenfarbe gewählt oder Fach unbekannt: Die Vorlage bleibt ganz, auch ihre Seitenleiste
  if (!f) return design;
  // Farbe + Muster (30.09.2026): Das Muster reist mit der Fachfarbe – Farbband und Seitenleiste zeigen es
  const muster = fachMuster(fach) ?? undefined;
  if (
    f === design.page.accentColor &&
    f === design.sidebar.color &&
    muster === design.page.accentMuster
  )
    return design;
  return {
    ...design,
    page: { ...design.page, accentColor: f, accentMuster: muster },
    sidebar: { ...design.sidebar, color: f },
  };
}

/** Was ein Material zum Einfärben braucht – Arbeitsblatt und alle Programme, die ihr Blatt als Arbeitsblatt darstellen */
interface Farbquelle {
  design: DesignTemplate;
  meta: { subjectId?: string; vorlagenfarbe?: boolean };
}

/** Die Designvorlage eines Blattes, wie sie gedruckt wird (mit Fachfarbe, sofern nicht abgeschaltet) */
export const druckDesign = (
  ws: Farbquelle,
  eigene = eingestellt
): DesignTemplate =>
  designMitFachfarbe(
    ws.design,
    ws.meta.subjectId,
    ws.meta.vorlagenfarbe,
    eigene
  );

/** Akzentfarbe eines Blattes, wie sie gedruckt wird (Tafelbild, Deckblatt) */
export const druckAkzent = (ws: Farbquelle, eigene = eingestellt): string =>
  druckDesign(ws, eigene).page.accentColor;

/** Mischt eine Farbe mit Weiß (anteil 0 = unverändert, 1 = weiß) – für helle Flächen in der Fachfarbe */
export function aufhellen(hex: string, anteil: number): string {
  const kanal = (c: number): string =>
    Math.round(c + (255 - c) * anteil)
      .toString(16)
      .padStart(2, "0");
  const [r, g, b] = rgb(hex);
  return `#${kanal(r)}${kanal(g)}${kanal(b)}`;
}

/**
 * Fachfarbe eines Materials, sofern sie gilt – sonst null (Vorlagenfarbe gewählt oder Fach
 * unbekannt). Für Stellen ohne Designvorlage: Deckblatt, Vokabeltest.
 */
export const geltendeFachfarbe = (
  fach: string | undefined,
  vorlagenfarbe: boolean | undefined,
  eigene = eingestellt
): string | null => (vorlagenfarbe ? null : fachFarbeAus(fach, eigene));

/** Anzeigename des Fachs zu Kennung, Namen oder Sprachcode (für Tooltips an Farbpunkten) */
export function fachName(fach: string | undefined): string | undefined {
  const id = fachIdVon(fach);
  const label = [...SUBJECTS, ...WEITERE_FAECHER].find(
    (s) => s.id === id
  )?.label;
  return label ? `Fach: ${label.replace(/\s*…$/, "")}` : undefined;
}

// ---------- Farbe + Muster (30.09.2026) ----------

/*
 * Entscheidung der Lehrkraft vom 30.09.2026: Der druckfeste Farbraum ist ausgeschöpft (siehe
 * oben). Japanisch, Arabisch, Dänisch, Neugriechisch, Psychologie und Hauswirtschaft teilen
 * deshalb die Grundfarbe eines verwandten Fachs und tragen ein Muster (Katalog: `muster`).
 * ALLE Stellen, an denen Fachfarben erscheinen, holen Muster und Kürzel hier – Farbpunkte,
 * Farbfelder, Ordnersymbole (FachFarbe.tsx), Farbband und Seitenleiste im Druck
 * (designMitFachfarbe → PageFrame) und die Kopfschattierung in Word (`musterWordSchattierung`).
 *
 * Das Muster liegt als halbdurchsichtiges Weiß über der Fachfarbe. Faustregel: Mit höchstens
 * rund einem Drittel Weiß bleiben weiße Schrift und Nummern auf der Fläche lesbar, und im
 * S/W-Druck zeigt sich das Muster als hellere Streifen/Punkte im Grauton.
 */

export type { FachMuster };

/** Muster je Fach (nur Fächer mit geteilter Grundfarbe) */
export const FACH_MUSTER: Record<string, FachMuster> = Object.fromEntries(
  FAECHER.filter((f) => f.muster).map((f) => [f.id, f.muster!])
);

/** Bezeichnung des Musters für Tooltips und Einstellungen */
export const MUSTER_NAMEN: Record<FachMuster, string> = {
  streifen: "Streifen",
  punkte: "Punkte",
  karo: "Gitter",
};

/** Muster eines Fachs (Kennung, Name oder Sprachcode); null = Fach mit eigener Farbe */
export function fachMuster(fach: string | undefined): FachMuster | null {
  const id = fachIdVon(fach);
  return (id && FACH_MUSTER[id]) || null;
}

/** Kürzel eines Fachs (steht im Farbfeld der Muster-Fächer) */
export function fachKuerzel(fach: string | undefined): string | null {
  const id = fachIdVon(fach);
  return FAECHER.find((f) => f.id === id)?.kuerzel ?? null;
}

/** Das Fach mit derselben Grundfarbe ohne Muster – der „Farbzwilling" (für Hinweise in den Einstellungen) */
export function farbzwilling(fach: string | undefined): string | null {
  const f = FAECHER.find((x) => x.id === fachIdVon(fach));
  if (!f?.muster) return null;
  return FAECHER.find((x) => x.farbe === f.farbe && !x.muster)?.id ?? null;
}

/** Maße des Musters je Einheit: Bildschirm in px, Druck in mm */
const MASS = {
  px: { strich: 2, abstand: 5, punkt: 1.3, raster: 4 },
  mm: { strich: 0.7, abstand: 2, punkt: 0.45, raster: 1.5 },
};

/**
 * Nur die Musterebene als CSS-`background-image` (ohne Farbe) – oder `none`. Für Stellen, die die
 * Farbe schon selbst setzen (Farbband, Seitenleiste über `--ws-accent-muster`).
 */
export function musterEbene(
  muster: FachMuster | null | undefined,
  einheit: "px" | "mm" = "px"
): string {
  if (!muster) return "none";
  const m = MASS[einheit];
  const weiss = "rgba(255,255,255,0.34)";
  const streifen = (winkel: number): string =>
    `repeating-linear-gradient(${winkel}deg, ${weiss} 0 ${m.strich}${einheit}, transparent ${m.strich}${einheit} ${m.abstand}${einheit})`;
  switch (muster) {
    case "streifen":
      return streifen(45);
    case "karo":
      return `${streifen(45)}, ${streifen(-45)}`;
    case "punkte":
      return `radial-gradient(circle, rgba(255,255,255,0.5) ${
        m.punkt
      }${einheit}, transparent ${m.punkt + 0.2 * m.punkt}${einheit})`;
  }
}

/** Kachelgröße der Musterebene (nur Punkte brauchen eine) */
export function musterGroesse(
  muster: FachMuster | null | undefined,
  einheit: "px" | "mm" = "px"
): string {
  return muster === "punkte"
    ? `${MASS[einheit].raster}${einheit} ${MASS[einheit].raster}${einheit}`
    : "auto";
}

/**
 * Vollständiger CSS-Hintergrund (Kurzschreibweise) für Farbe + Muster – ohne Muster nur die Farbe.
 * Beispiel: `style={{ background: musterHintergrund('#403040', 'punkte') }}`
 */
export function musterHintergrund(
  farbe: string,
  muster: FachMuster | null | undefined,
  einheit: "px" | "mm" = "px"
): string {
  if (!muster) return farbe;
  const ebene = musterEbene(muster, einheit);
  const groesse = musterGroesse(muster, einheit);
  // Bei „karo" zwei Ebenen: Die Größe gilt für jede
  const ebenen = muster === "karo" ? ebene : `${ebene} 0 0 / ${groesse}`;
  return `${ebenen}, ${farbe}`;
}

/** Farbe, Muster und Kürzel eines Fachs, wie sie gerade gelten – für Komponenten und Druck */
export function fachKennzeichen(
  fach: string | undefined,
  eigene = eingestellt
): {
  farbe: string;
  muster: FachMuster | null;
  kuerzel: string | null;
  name?: string;
} | null {
  const farbe = fachFarbeAus(fach, eigene);
  if (!farbe) return null;
  return {
    farbe,
    muster: fachMuster(fach),
    kuerzel: fachKuerzel(fach),
    name: fachName(fach),
  };
}

/**
 * Schattierung einer Word-Zelle in Fachfarbe + Muster (docx `ShadingType`-Werte als Text, damit
 * dieses Modul ohne die docx-Bibliothek auskommt): Muster in aufgehellter Fachfarbe auf der
 * Fachfarbe. Ohne Muster die bisherige volle Fläche.
 */
export function musterWordSchattierung(
  farbeHex: string,
  muster: FachMuster | null | undefined
): {
  type: "clear" | "thinDiagStripe" | "thinDiagCross" | "pct10";
  color: string;
  fill: string;
} {
  const fill = farbeHex.replace("#", "").toUpperCase();
  if (!muster) return { type: "clear", color: "auto", fill };
  const hell = aufhellen(`#${fill}`, 0.3).replace("#", "").toUpperCase();
  return {
    type:
      muster === "streifen"
        ? "thinDiagStripe"
        : muster === "karo"
        ? "thinDiagCross"
        : "pct10",
    color: hell,
    fill,
  };
}
