import { useRef, useState } from "react";
import { RichText } from "../../../shared/richtext/RichText";
import { fachPfad, ueberthemaVon } from "../../../shared/ueberthema";
import type { Worksheet, WorksheetMeta } from "../model/types";
import { deckblattFarben, deckblattVariablen } from "./coverDesigns";
import {
  aufsBlatt,
  geltendeAnordnung,
  geltenderRahmen,
  geltendeSeiten,
  istQuer,
  kartenMasse,
  rahmenRaender,
  SEITE_B,
  SEITE_H,
  umriss,
  vorschauFlaeche,
  type DeckblattKarte,
  type DeckblattRahmen,
  type SeitenKandidat,
} from "./deckblatt";
import { maskottchenBild } from "./maskottchen";

/**
 * Deckblatt als Seite 0 vor den Arbeitsblättern.
 *
 * Es richtet sich an Lehrkräfte: Titel, ein Maskottchen, eine sehr kurze Beschreibung, der
 * Hinweis auf Lösungen – und darunter die Blätter als kleine Vorschau, damit man sofort sieht,
 * was einen erwartet. Die Vorschau entsteht aus den echten Seiten und ist deshalb immer aktuell;
 * ein abgelegter Bildschirmabzug wäre es nach der ersten Änderung nicht mehr.
 *
 * Titel und Kurzbeschreibung laufen wie das ganze Blatt über `RichText`, nicht über
 * `Editable`: Sonst stünde auf dem Deckblatt eines Mathematikblattes „Rechnen mit $a^2$"
 * wörtlich da, während dieselbe Formel eine Seite weiter gesetzt wird.
 *
 * Paket 11 (26.09.2026): vier Kopf-Layouts, wählbares Maskottchen, Überthema im Kopf und frei
 * angeordnete Seitenvorschauen (render/deckblatt.ts). Die Griffe zum Ziehen, Drehen und
 * Vergrößern gibt es nur im Editor (`onChange`); Druck und PDF rendern dieselbe Seite ohne sie.
 */

/** Was das Deckblatt über die Seiten des Materials wissen muss */
export interface DeckblattVorschau {
  kandidaten: SeitenKandidat[];
  /** Eine Seite verkleinert zeichnen (die echte Seite, siehe `SheetPages` mit `nurSeite`) */
  seite: (schluessel: string) => React.ReactNode;
}

/** Seiten, Lage und Rahmen, wie sie gerade gelten – Vorschau, Druck und Word nutzen dasselbe */
export function deckblattLage(
  meta: WorksheetMeta,
  kandidaten: SeitenKandidat[]
): { karten: DeckblattKarte[]; rahmen: DeckblattRahmen } {
  const layout = meta.coverLayout ?? "faecher";
  const rahmen = geltenderRahmen(layout, meta.coverFrame);
  const seiten = geltendeSeiten(kandidaten, meta.coverPages);
  return {
    karten: geltendeAnordnung(
      seiten,
      layout,
      vorschauFlaeche(meta.coverHead ?? "band"),
      rahmen,
      meta.coverArrangement
    ),
    rahmen,
  };
}

/**
 * Eine Seitenvorschau als Karte – schlicht oder als Polaroid mit Klebestreifen bzw. Pin.
 * Ohne Lage und Drehung: Die setzt der Aufrufer (auf dem Deckblatt absolut, im Word-Export
 * als schwebendes Bild).
 */
export function DeckblattKarteInhalt({
  karte,
  rahmen,
  nummer,
  children,
}: {
  karte: DeckblattKarte;
  rahmen: DeckblattRahmen;
  /** Stellung auf dem Deckblatt – entscheidet zwischen Klebestreifen und Pin */
  nummer: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const quer = istQuer(karte.seite);
  const m = kartenMasse(karte.breite, quer, rahmen);
  const r = rahmenRaender(rahmen);
  const seiteB = quer ? SEITE_H : SEITE_B;
  const seiteH = quer ? SEITE_B : SEITE_H;
  return (
    <>
      <div
        className="ws-cover-karte-seite"
        style={{
          left: `${r.seite * karte.breite}mm`,
          top: `${r.oben * karte.breite}mm`,
          width: `${m.innenBreite}mm`,
          height: `${m.innenHoehe}mm`,
        }}
      >
        <div
          className="ws-cover-thumb-inner"
          style={{
            width: `${seiteB}mm`,
            height: `${seiteH}mm`,
            transform: `scale(${m.innenBreite / seiteB})`,
          }}
        >
          {children}
        </div>
      </div>
      {rahmen === "polaroid" &&
        /*
         * Klebestreifen oder Pin – abwechselnd, jede dritte Karte hängt an einem Pin. Beides
         * dezent: Der Streifen ist ein heller, halb durchsichtiger Grauton, der im S/W-Druck
         * als zarter Balken erscheint; der Pin ein kleiner Kreis in der Deckblattfarbe.
         */
        (nummer % 3 === 2 ? (
          <span
            className="ws-cover-pin"
            style={{
              width: `${Math.max(3, karte.breite * 0.08)}mm`,
              height: `${Math.max(3, karte.breite * 0.08)}mm`,
            }}
          />
        ) : (
          <span
            className="ws-cover-klebe"
            style={{
              width: `${karte.breite * 0.36}mm`,
              height: `${Math.max(3, karte.breite * 0.075)}mm`,
              transform: `translate(-50%, -50%) rotate(${
                nummer % 2 ? 4 : -3
              }deg)`,
            }}
          />
        ))}
    </>
  );
}

export function CoverPage({
  ws,
  vorschau,
  onChange,
  onAustauschen,
  nurGrund,
}: {
  ws: Worksheet;
  /** Seiten des Blattes für die Vorschauen; fehlt = ohne Vorschauen */
  vorschau?: DeckblattVorschau;
  /** Nur im Editor: ändert das Blatt; `gruppe` fasst eine Geste zu EINEM Rückgängig-Schritt zusammen */
  onChange?: (fn: (ws: Worksheet) => void, gruppe?: string) => void;
  /** Nur im Editor: die Seite einer Karte gegen eine andere tauschen (öffnet die Seitenwahl) */
  onAustauschen?: (seite: string) => void;
  /**
   * Nur für den Word-Export: die Seite ohne sichtbare Texte, als Hintergrundbild. Die Texte
   * setzt Word als echten, bearbeitbaren Text darüber (render/deckblattBilder.tsx).
   */
  nurGrund?: boolean;
}): React.JSX.Element {
  const d = deckblattFarben(ws.meta);
  const kopf = ws.meta.coverHead ?? "band";
  const bild = maskottchenBild(ws.meta, d.dark, d.mid);
  const editable = Boolean(onChange);
  const set = (fn: (m: Worksheet["meta"], v: string) => void) =>
    onChange ? (v: string) => onChange((w) => fn(w.meta, v)) : undefined;
  const levels = ws.meta.differentiation.levels;
  // Überthema (Paket 11) – dargestellt wie in der Designvorlage gewählt
  const stil = ws.design.header.overTopicStyle ?? "path";
  const ueber = ueberthemaVon(ws.meta);
  const fach = ws.meta.subjectLabel;
  // „0 Aufgaben" auf einem Deckblatt wirkt wie ein Fehler – bei reinen Materialblättern entfällt die Angabe
  const aufgaben =
    ws.sheets[0]?.blocks.filter((b) => b.type === "task").length ?? 0;
  const facts = [
    stil === "path"
      ? fachPfad(fach, ueber)
      : stil === "emphasis" && ueber
      ? ""
      : fach,
    ws.meta.grade ? `Klasse ${ws.meta.grade}` : "",
    levels > 1 ? `${levels} Niveaustufen` : "",
    aufgaben > 0
      ? `${aufgaben} ${aufgaben === 1 ? "Aufgabe" : "Aufgaben"}`
      : "",
  ].filter(Boolean);

  const { karten, rahmen } = vorschau
    ? deckblattLage(ws.meta, vorschau.kandidaten)
    : { karten: [], rahmen: "schlicht" as const };
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const seiteRef = useRef<HTMLDivElement>(null);

  /**
   * Eine Karte ändern. Beim ersten Anfassen wird die ganze geltende Anordnung festgehalten –
   * vorher war sie nur aus dem Start-Layout berechnet. Seiten werden dabei mit festgehalten,
   * damit eine später geänderte Automatik die gezogene Karte nicht austauscht.
   */
  const aendereKarte = (
    seite: string,
    fn: (k: DeckblattKarte) => DeckblattKarte,
    gruppe?: string
  ): void => {
    onChange?.((w) => {
      const liste = w.meta.coverArrangement?.length
        ? w.meta.coverArrangement
        : karten.map((k) => ({ ...k }));
      w.meta.coverPages = karten.map((k) => k.seite);
      w.meta.coverArrangement = liste.map((k) =>
        k.seite === seite ? aufsBlatt(fn(k), rahmen) : k
      );
    }, gruppe);
  };

  /** Zeigerbewegung verfolgen – am Fenster, damit der Zug nicht abreißt, wenn die Karte neu gezeichnet wird */
  const verfolge = (
    e: React.PointerEvent,
    bewegen: (ev: PointerEvent, mmProPx: number) => void
  ): void => {
    if (!onChange || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const flaeche = seiteRef.current?.getBoundingClientRect();
    if (!flaeche) return;
    const mmProPx = SEITE_B / flaeche.width;
    const weiter = (ev: PointerEvent): void => bewegen(ev, mmProPx);
    const schluss = (): void => {
      window.removeEventListener("pointermove", weiter);
      window.removeEventListener("pointerup", schluss);
      window.removeEventListener("pointercancel", schluss);
    };
    window.addEventListener("pointermove", weiter);
    window.addEventListener("pointerup", schluss);
    window.addEventListener("pointercancel", schluss);
  };

  const ziehen = (e: React.PointerEvent, k: DeckblattKarte): void => {
    setAuswahl(k.seite);
    const start = { x: e.clientX, y: e.clientY };
    // Eine Geste = ein Rückgängig-Schritt (shared/undo.ts)
    const geste = `deckblatt-ziehen:${k.seite}:${Date.now()}`;
    verfolge(e, (ev, mm) => {
      const dx = (ev.clientX - start.x) * mm;
      const dy = (ev.clientY - start.y) * mm;
      if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) return;
      aendereKarte(
        k.seite,
        (alt) => ({ ...alt, x: k.x + dx, y: k.y + dy }),
        geste
      );
    });
  };

  const mitte = (el: HTMLElement | null): { x: number; y: number } => {
    const r = el?.getBoundingClientRect();
    return r
      ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      : { x: 0, y: 0 };
  };

  const drehen = (e: React.PointerEvent, k: DeckblattKarte): void => {
    const m = mitte(
      (e.currentTarget as HTMLElement).closest(".ws-cover-thumb")
    );
    const geste = `deckblatt-drehen:${k.seite}:${Date.now()}`;
    verfolge(e, (ev) => {
      // Der Griff sitzt über der Oberkante: Winkel des Zeigers zur Mitte, oben = 0°
      let grad =
        (Math.atan2(ev.clientY - m.y, ev.clientX - m.x) * 180) / Math.PI + 90;
      if (grad > 180) grad -= 360;
      // Mit gedrückter Umschalttaste in 15°-Schritten, sonst nahe 0° einrasten
      grad = ev.shiftKey
        ? Math.round(grad / 15) * 15
        : Math.abs(grad) < 2
        ? 0
        : grad;
      aendereKarte(
        k.seite,
        (alt) => ({ ...alt, drehung: Math.round(grad * 10) / 10 }),
        geste
      );
    });
  };

  const groesse = (e: React.PointerEvent, k: DeckblattKarte): void => {
    const m = mitte(
      (e.currentTarget as HTMLElement).closest(".ws-cover-thumb")
    );
    const abstand0 = Math.hypot(e.clientX - m.x, e.clientY - m.y) || 1;
    const geste = `deckblatt-groesse:${k.seite}:${Date.now()}`;
    verfolge(e, (ev) => {
      const faktor = Math.hypot(ev.clientX - m.x, ev.clientY - m.y) / abstand0;
      aendereKarte(
        k.seite,
        (alt) => ({ ...alt, breite: Math.round(k.breite * faktor * 10) / 10 }),
        geste
      );
    });
  };

  const ebenen = karten.map((k) => k.ebene);
  const nachVorn = (k: DeckblattKarte): void =>
    aendereKarte(k.seite, (alt) => ({
      ...alt,
      ebene: Math.max(...ebenen) + 1,
    }));
  const nachHinten = (k: DeckblattKarte): void =>
    aendereKarte(k.seite, (alt) => ({
      ...alt,
      ebene: Math.min(...ebenen) - 1,
    }));
  const entfernen = (k: DeckblattKarte): void => {
    setAuswahl(null);
    onChange?.((w) => {
      w.meta.coverPages = karten
        .map((x) => x.seite)
        .filter((s) => s !== k.seite);
      if (w.meta.coverArrangement)
        w.meta.coverArrangement = w.meta.coverArrangement.filter(
          (x) => x.seite !== k.seite
        );
    });
  };
  // Tastatur: Pfeile verschieben (mit Umschalttaste weiter), Bild auf/ab legt nach vorn/hinten
  const taste = (e: React.KeyboardEvent, k: DeckblattKarte): void => {
    const schritt = e.shiftKey ? 5 : 1;
    const weg: Record<string, [number, number]> = {
      ArrowLeft: [-schritt, 0],
      ArrowRight: [schritt, 0],
      ArrowUp: [0, -schritt],
      ArrowDown: [0, schritt],
    };
    if (weg[e.key]) {
      e.preventDefault();
      aendereKarte(
        k.seite,
        (alt) => ({
          ...alt,
          x: alt.x + weg[e.key][0],
          y: alt.y + weg[e.key][1],
        }),
        `deckblatt-taste:${k.seite}`
      );
    } else if (e.key === "PageUp") {
      e.preventDefault();
      nachVorn(k);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      nachHinten(k);
    }
  };

  const gewaehlt = karten.find((k) => k.seite === auswahl);
  const titel = (
    <div className="ws-cover-title">
      <RichText
        value={ws.meta.title || ws.meta.topic}
        inline
        editable={editable}
        onChange={set((m, v) => (m.title = v))}
      />
    </div>
  );
  const kicker =
    stil === "emphasis" && ueber ? (
      <div className="ws-cover-kicker" data-ueberthema={ueber}>
        {fach && <span className="ws-cover-kicker-fach">{fach}</span>}
        <span className="ws-cover-kicker-thema">{ueber}</span>
      </div>
    ) : null;
  const rechts =
    stil === "split" && ueber ? (
      <div className="ws-cover-ueberthema" data-ueberthema={ueber}>
        {ueber}
      </div>
    ) : null;
  const maskottchen = bild ? (
    <div className="ws-cover-fox">
      <img src={bild} alt="" />
    </div>
  ) : null;

  return (
    <div
      ref={seiteRef}
      className={`ws-page ws-cover ws-cover-kopf-${kopf} ${
        bild ? "" : "ws-cover-ohne-bild"
      } ${nurGrund ? "ws-cover-nur-grund" : ""}`}
      // Schrift der Designvorlage – im Druck fiele das Deckblatt sonst auf die Serifen-Grundschrift zurück
      style={{
        fontFamily: ws.design.page.fontFamily,
        ...deckblattVariablen(d),
      }}
      data-ueberthema={ueber || undefined}
      onPointerDown={(e) => {
        // Klick ins Leere hebt die Auswahl auf
        if (
          !(e.target as HTMLElement).closest(
            ".ws-cover-thumb, .ws-cover-griffe"
          )
        )
          setAuswahl(null);
      }}
    >
      <div className="ws-cover-top">
        {kopf === "titelbild" && (
          <div className="ws-cover-bildflaeche">{maskottchen}</div>
        )}
        {kopf !== "titelbild" && kopf !== "band" && maskottchen}
        <div className="ws-cover-headline">
          {kicker}
          {titel}
          <div className="ws-cover-facts">{facts.join(" · ")}</div>
          {kopf !== "band" && rechts}
        </div>
        {kopf === "band" && rechts}
        {kopf === "band" && maskottchen}
      </div>

      <div className="ws-cover-blurb">
        <RichText
          value={ws.meta.coverText ?? ""}
          editable={editable}
          placeholder="In einem Satz: worum geht es auf diesem Blatt?"
          onChange={set((m, v) => (m.coverText = v))}
        />
      </div>

      <div className="ws-cover-badges">
        {ws.meta.answerKey && (
          <span className="ws-cover-badge">mit Lösungen</span>
        )}
        {ws.meta.boardPlan && (
          <span className="ws-cover-badge">mit Tafelbild</span>
        )}
        {ws.sheets.some((s) => s.blocks.some((b) => b.type === "audio")) && (
          <span className="ws-cover-badge">mit Hörtexten</span>
        )}
        {ws.meta.helpCards !== false && (
          <span className="ws-cover-badge">mit Hilfekarten</span>
        )}
      </div>

      {vorschau && karten.length > 0 && (
        /*
          Vier bis sechs EINZELNE Seiten (Wunsch vom 24.09.2026), seit Paket 11 frei angeordnet:
          Jede Karte liegt absolut auf der Seite, in mm – so gibt der Druck genau wieder, was
          im Editor zu sehen ist.
        */
        <div
          className={`ws-cover-previews ws-cover-rahmen-${rahmen}`}
          aria-hidden={!editable}
        >
          {karten.map((k, i) => {
            const m = kartenMasse(k.breite, istQuer(k.seite), rahmen);
            return (
              <div
                key={k.seite}
                className={`ws-cover-thumb ${
                  auswahl === k.seite ? "ws-cover-thumb-aktiv" : ""
                }`}
                data-seite={k.seite}
                data-drehung={k.drehung}
                style={{
                  left: `${k.x - m.breite / 2}mm`,
                  top: `${k.y - m.hoehe / 2}mm`,
                  width: `${m.breite}mm`,
                  height: `${m.hoehe}mm`,
                  transform: k.drehung ? `rotate(${k.drehung}deg)` : undefined,
                  zIndex: 10 + k.ebene,
                }}
                {...(editable
                  ? {
                      tabIndex: 0,
                      role: "button",
                      "aria-label": `Seitenvorschau ${
                        vorschau.kandidaten.find(
                          (c) => c.schluessel === k.seite
                        )?.titel ?? ""
                      } – ziehen zum Verschieben, Pfeiltasten verschieben`,
                      onPointerDown: (e: React.PointerEvent) => ziehen(e, k),
                      onFocus: () => setAuswahl(k.seite),
                      onKeyDown: (e: React.KeyboardEvent) => taste(e, k),
                    }
                  : {})}
              >
                <DeckblattKarteInhalt karte={k} rahmen={rahmen} nummer={i}>
                  {vorschau.seite(k.seite)}
                </DeckblattKarteInhalt>
                {editable && auswahl === k.seite && (
                  <>
                    <span
                      className="ws-cover-griff ws-cover-griff-drehen"
                      role="slider"
                      aria-label="Drehen"
                      aria-valuenow={k.drehung}
                      title="Drehen (mit Umschalttaste in 15°-Schritten)"
                      onPointerDown={(e) => drehen(e, k)}
                    />
                    <span
                      className="ws-cover-griff ws-cover-griff-groesse"
                      aria-label="Größe ändern"
                      title="Größe ändern"
                      onPointerDown={(e) => groesse(e, k)}
                    />
                  </>
                )}
              </div>
            );
          })}
          {editable && gewaehlt && (
            // Werkzeuge der gewählten Karte – über ihrem Umriss, nicht mitgedreht
            <div
              className="ws-cover-griffe"
              style={{
                left: `${Math.max(2, umriss(gewaehlt, rahmen).x0)}mm`,
                top: `${Math.max(2, umriss(gewaehlt, rahmen).y0 - 11)}mm`,
              }}
            >
              <button
                type="button"
                onClick={() => nachVorn(gewaehlt)}
                title="Nach vorn legen (Bild auf)"
              >
                Nach vorn
              </button>
              <button
                type="button"
                onClick={() => nachHinten(gewaehlt)}
                title="Nach hinten legen (Bild ab)"
              >
                Nach hinten
              </button>
              {onAustauschen && (
                <button
                  type="button"
                  onClick={() => onAustauschen(gewaehlt.seite)}
                >
                  Austauschen …
                </button>
              )}
              <button type="button" onClick={() => entfernen(gewaehlt)}>
                Entfernen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
