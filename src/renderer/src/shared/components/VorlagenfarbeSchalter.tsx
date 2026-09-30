import { Checkbox } from "@mantine/core";
import { useAppSettings } from "../settingsStore";
import { fachFarbeAus, fachMuster } from "../fachfarben";
import EinstellungenLink from "./EinstellungenLink";
import { FarbPunkt } from "./FachFarbe";

/**
 * „Farbe der Vorlage verwenden" (Paket 10a) – derselbe Schalter in allen Programmen.
 *
 * Standard ist die Fachfarbe aus den Einstellungen. Wer für ein einzelnes Material die Farbe
 * der Designvorlage (bzw. beim Vokabeltest Schwarz) behalten will – etwa weil es zu einer
 * älteren Reihe passen soll –, schaltet sie hier für genau dieses Material ab.
 */
export default function VorlagenfarbeSchalter({
  fach,
  vorlagenname = "der Vorlage",
  checked,
  onChange,
  size = "sm",
}: {
  /** Fachkennung, Fachname oder Sprachcode */
  fach: string | undefined;
  /** „der Vorlage" bzw. beim Vokabeltest „Schwarz" */
  vorlagenname?: string;
  checked: boolean;
  onChange: (vorlagenfarbe: boolean) => void;
  size?: "xs" | "sm";
}): React.JSX.Element {
  // Aus dem Store, damit der Punkt eine Änderung in den Einstellungen sofort zeigt
  const eigene = useAppSettings((s) => s.settings.fachfarben);
  const farbe = fachFarbeAus(fach, eigene);
  return (
    <Checkbox
      size={size}
      className="vorlagenfarbe-schalter"
      label={
        vorlagenname === "der Vorlage"
          ? "Farbe der Vorlage verwenden"
          : `${vorlagenname} statt Fachfarbe`
      }
      disabled={!farbe}
      description={
        farbe ? (
          // Als span: Die Beschreibung steht in einem Absatz, ein div darin wäre ungültig
          <span
            style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}
          >
            <FarbPunkt
              farbe={farbe}
              titel="Fachfarbe"
              muster={fachMuster(fach)}
            />
            <span>
              Sonst gilt die Fachfarbe – festgelegt unter{" "}
              <EinstellungenLink tab="material">
                Einstellungen › Material
              </EinstellungenLink>
              .
            </span>
          </span>
        ) : (
          "Für dieses Fach ist keine Fachfarbe hinterlegt; es gilt die Farbe der Vorlage."
        )
      }
      checked={checked || !farbe}
      onChange={(e) => onChange(e.currentTarget.checked)}
    />
  );
}
