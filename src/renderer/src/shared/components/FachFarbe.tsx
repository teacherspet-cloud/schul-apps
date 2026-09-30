import { Box } from "@mantine/core";
import { IconFolder, IconFolderOpen } from "@tabler/icons-react";
import { useAppSettings } from "../settingsStore";
import {
  fachFarbeAus,
  fachKuerzel,
  fachMuster,
  fachName,
  MUSTER_NAMEN,
  musterHintergrund,
  type FachMuster,
} from "../fachfarben";

/**
 * Fachfarbe in der Oberfläche (Paket 10a): Punkt am Fach in den Bibliotheken, in „Zuletzt
 * bearbeitet" und in den Suchtreffern der Startseite. Die Karten bleiben nach Materialart
 * getönt – der Punkt sagt nur, zu welchem Fach etwas gehört.
 *
 * Farbe + Muster (30.09.2026): Fächer mit geteilter Grundfarbe (Japanisch, Arabisch, Dänisch,
 * Neugriechisch, Psychologie, Hauswirtschaft) zeigen hier ihr Muster und – wo Platz ist – ihr
 * Kürzel im Farbfeld. Alle Stellen mit Fachfarbe nutzen diese Komponenten.
 */

/** Fachfarbe zu Kennung, Namen oder Sprachcode – folgt einer Änderung in den Einstellungen sofort */
export function useFachFarbe(fach: string | undefined): string | null {
  return fachFarbeAus(
    fach,
    useAppSettings((s) => s.settings.fachfarben)
  );
}

/** Ab dieser Größe (px) steht das Kürzel eines Muster-Fachs im Farbfeld */
const KUERZEL_AB = 18;

const titelMitMuster = (
  titel: string | undefined,
  muster: FachMuster | null | undefined
): string | undefined =>
  titel && muster ? `${titel} (${MUSTER_NAMEN[muster]})` : titel;

/** Kleiner runder Farbpunkt – mit Muster (und ab 18 px Kürzel) bei Fächern mit geteilter Grundfarbe */
export function FarbPunkt({
  farbe,
  groesse = 10,
  titel,
  muster,
  kuerzel,
}: {
  farbe: string | null;
  groesse?: number;
  titel?: string;
  muster?: FachMuster | null;
  kuerzel?: string | null;
}): React.JSX.Element | null {
  if (!farbe) return null;
  return (
    <Box
      component="span"
      className="fach-punkt"
      data-farbe={farbe}
      data-muster={muster ?? undefined}
      title={titelMitMuster(titel, muster)}
      aria-hidden={titel ? undefined : true}
      style={{
        width: groesse,
        height: groesse,
        background: musterHintergrund(farbe, muster),
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        // Ring um gemusterte Punkte: Das Muster bleibt auch vor farbigem Grund als Punkt erkennbar
        boxShadow: muster ? `0 0 0 1px ${farbe}` : undefined,
      }}
    >
      {muster && kuerzel && groesse >= KUERZEL_AB && (
        <MusterKuerzel kuerzel={kuerzel} groesse={groesse} />
      )}
    </Box>
  );
}

function MusterKuerzel({
  kuerzel,
  groesse,
}: {
  kuerzel: string;
  groesse: number;
}): React.JSX.Element {
  return (
    <span
      className="fach-kuerzel"
      style={{
        color: "#fff",
        fontWeight: 700,
        fontSize: Math.max(
          7,
          Math.round(groesse * (kuerzel.length > 2 ? 0.34 : 0.42))
        ),
        lineHeight: 1,
        letterSpacing: 0,
      }}
    >
      {kuerzel}
    </span>
  );
}

/** Farbpunkt eines Fachs mit dem Fachnamen als Tooltip; unbekanntes Fach = nichts */
export function FachPunkt({
  fach,
  groesse,
}: {
  fach: string | undefined;
  groesse?: number;
}): React.JSX.Element | null {
  return (
    <FarbPunkt
      farbe={useFachFarbe(fach)}
      groesse={groesse}
      titel={fachName(fach)}
      muster={fachMuster(fach)}
      kuerzel={fachKuerzel(fach)}
    />
  );
}

/**
 * Eckiges Farbfeld (Einstellungen, Farbwahl): Farbe eines Fachs – oder eine vorgegebene Farbe –
 * mit Muster und Kürzel des Fachs.
 */
export function FachFarbfeld({
  fach,
  farbe,
  groesse = 22,
  children,
}: {
  fach: string | undefined;
  /** Abweichende Farbe (z. B. Palettenfeld); sonst die eingestellte Fachfarbe */
  farbe?: string;
  groesse?: number;
  children?: React.ReactNode;
}): React.JSX.Element | null {
  const eingestellt = useFachFarbe(fach);
  const f = farbe ?? eingestellt;
  const muster = fachMuster(fach);
  const kuerzel = fachKuerzel(fach);
  if (!f) return null;
  return (
    <Box
      component="span"
      className="fach-farbfeld"
      data-muster={muster ?? undefined}
      style={{
        width: groesse,
        height: groesse,
        background: musterHintergrund(f, muster),
        borderRadius: 4,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)",
      }}
    >
      {children ??
        (muster && kuerzel && groesse >= KUERZEL_AB ? (
          <MusterKuerzel kuerzel={kuerzel} groesse={groesse} />
        ) : null)}
    </Box>
  );
}

/**
 * Ordnersymbol in der Fachfarbe (Themenbereiche, Startseite). Muster-Fächer tragen unten rechts
 * ein kleines gemustertes Abzeichen mit Kürzel – das Ordnersymbol selbst ist nur ein Umriss.
 */
export function FachOrdnerSymbol({
  fach,
  groesse = 28,
  offen,
}: {
  fach: string | undefined;
  groesse?: number;
  offen?: boolean;
}): React.JSX.Element {
  const farbe = useFachFarbe(fach) ?? undefined;
  const muster = fachMuster(fach);
  const Symbol = offen ? IconFolderOpen : IconFolder;
  if (!muster || !farbe)
    return (
      <Symbol
        size={groesse}
        color={farbe}
        style={{ flexShrink: 0, verticalAlign: "middle" }}
      />
    );
  const abzeichen = Math.max(10, Math.round(groesse * 0.55));
  return (
    <span
      className="fach-ordner"
      data-muster={muster}
      style={{
        position: "relative",
        display: "inline-flex",
        flexShrink: 0,
        verticalAlign: "middle",
      }}
    >
      <Symbol size={groesse} color={farbe} />
      <span style={{ position: "absolute", right: -2, bottom: -2 }}>
        <FarbPunkt
          farbe={farbe}
          groesse={abzeichen}
          muster={muster}
          kuerzel={fachKuerzel(fach)}
          titel={fachName(fach)}
        />
      </span>
    </span>
  );
}
