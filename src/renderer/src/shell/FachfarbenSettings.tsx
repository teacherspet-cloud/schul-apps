import {
  Button,
  Card,
  ColorInput,
  ColorSwatch,
  Group,
  Popover,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { useState } from "react";
import type { AppSettings, DeepPartial } from "@shared/types";
import { SUBJECTS } from "../modules/arbeitsblatt/model/subjects";
import {
  FACH_PALETTE,
  FACH_VORSCHLAG,
  fachFarbeAus,
  fachMuster,
  farbabstand,
  graustufenPruefung,
  istFarbe,
  leuchtdichte,
  MUSTER_NAMEN,
  WEITERE_FAECHER,
} from "../shared/fachfarben";
import MehrText from "../shared/components/MehrText";
import { FachFarbfeld } from "../shared/components/FachFarbe";

/** Grauwert einer Farbe, wie ein S/W-Drucker sie ungefähr wiedergibt */
function grau(hex: string): string {
  const g = Math.round(leuchtdichte(hex) ** (1 / 2.2) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${g}${g}${g}`;
}

const farbname = (hex: string): string =>
  FACH_PALETTE.find((f) => f.hex.toLowerCase() === hex.toLowerCase())?.name ??
  hex;

/** Anzeigename ohne die Auslassungspunkte der Fachwahl („Anderes Fach …") */
const fachname = (label: string): string => label.replace(/\s*…$/, "");

/**
 * Fachfarben in den Einstellungen (Paket 10a).
 *
 * Je Fach eine Farbe: Sie färbt Kopf, Überschriften, Rahmen, Farbband und Seitenleiste aller
 * Materialien dieses Fachs – die Designvorlage bestimmt nur noch Aufbau und Schrift. Jedes
 * Fach hat einen Vorschlag aus einer druckfesten Palette; frei wählbar ist jede Farbe. Beim
 * Wählen prüft die App, wie die Farbe im Schwarz-Weiß-Druck ankommt, denn im Kopierraum
 * werden die meisten Blätter grau.
 */
export default function FachfarbenSettings({
  settings,
  update,
  eingebettet = false,
}: {
  settings: AppSettings;
  update: (patch: DeepPartial<AppSettings>) => void;
  /** Ohne eigene Karte und Überschrift – in der Verwaltung (Fachfarben der Schule, 09.10.2026) */
  eingebettet?: boolean;
}): React.JSX.Element {
  const eigene = settings.fachfarben ?? {};
  // Dazu die Sprachen, die es nur im Vokabeltest gibt (Niederländisch, Russisch)
  const faecher = [...SUBJECTS, ...WEITERE_FAECHER].map((s) => ({
    id: s.id,
    name: fachname(s.label),
    farbe: fachFarbeAus(s.id, eigene)!,
  }));

  const inhalt = (
    <>
      <MehrText
        size="sm"
        text="Jedes Fach färbt seine Materialien in einer eigenen Farbe: Kopf, Überschriften, Rahmen, Farbband und Seitenleiste. Die Designvorlage bestimmt weiter Aufbau und Schrift. An jedem Material lässt sich stattdessen die Farbe der Vorlage wählen. Die Vorschläge stammen aus einer Palette, die auch auf Schwarz-Weiß-Kopien lesbar bleibt."
      />
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="xs" mt="md">
        {faecher.map((f) => (
          <FachZeile
            key={f.id}
            fach={f}
            // Farbe + Muster (30.09.2026): Gleiche Grundfarbe mit anderem Muster ist Absicht, kein Konflikt
            gleich={faecher
              .filter(
                (x) =>
                  x.id !== f.id &&
                  farbabstand(x.farbe, f.farbe) < 5 &&
                  fachMuster(x.id) === fachMuster(f.id)
              )
              .map((x) => x.name)}
            zwilling={faecher
              .filter(
                (x) =>
                  x.id !== f.id &&
                  farbabstand(x.farbe, f.farbe) < 5 &&
                  fachMuster(x.id) !== fachMuster(f.id)
              )
              .map((x) => x.name)}
            eigen={istFarbe(eigene[f.id])}
            setze={(hex) => update({ fachfarben: { [f.id]: hex } })}
          />
        ))}
      </SimpleGrid>
    </>
  );
  if (eingebettet) return <div className="fachfarben-karte">{inhalt}</div>;
  return (
    <Card withBorder padding="lg" className="fachfarben-karte">
      <Title order={4} mb={4}>
        Fachfarben
      </Title>
      {inhalt}
    </Card>
  );
}

function FachZeile({
  fach,
  gleich,
  zwilling,
  eigen,
  setze,
}: {
  fach: { id: string; name: string; farbe: string };
  /** Fächer mit (fast) derselben Farbe */
  gleich: string[];
  /** Fächer mit derselben Grundfarbe, aber anderem Muster (Farbe + Muster) */
  zwilling: string[];
  /** Von der Lehrkraft gewählt (sonst Vorschlag) */
  eigen: boolean;
  /** '' = zurück zum Vorschlag */
  setze: (hex: string) => void;
}): React.JSX.Element {
  const [offen, setOffen] = useState(false);
  const pruefung = graustufenPruefung(fach.farbe);
  const muster = fachMuster(fach.id);
  return (
    <Popover
      opened={offen}
      onChange={setOffen}
      width={300}
      position="bottom-start"
      shadow="md"
      withArrow
      trapFocus
    >
      <Popover.Target>
        <UnstyledButton
          className="fachfarbe-zeile"
          data-fach={fach.id}
          aria-label={`Farbe für ${fach.name}: ${farbname(
            fach.farbe
          )} – ändern`}
          onClick={() => setOffen((o) => !o)}
        >
          <Group gap="sm" wrap="nowrap">
            <FachFarbfeld fach={fach.id} farbe={fach.farbe} groesse={22} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" fw={500} truncate>
                {fach.name}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {farbname(fach.farbe)}
                {muster ? ` + ${MUSTER_NAMEN[muster]}` : ""}
                {eigen ? "" : " · Vorschlag"}
              </Text>
            </div>
            {pruefung.stufe !== "gut" && (
              <Tooltip label={pruefung.hinweis} multiline w={260}>
                <IconAlertTriangle
                  size={16}
                  color={`var(--mantine-color-${
                    pruefung.stufe === "zu-hell" ? "red" : "orange"
                  }-6)`}
                  aria-label="Hinweis zum S/W-Druck"
                />
              </Tooltip>
            )}
          </Group>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Text size="sm" fw={600}>
            Farbe für {fach.name}
          </Text>
          <Group gap={6}>
            {FACH_PALETTE.map((p) => (
              <Tooltip key={p.hex} label={p.name} openDelay={300}>
                <UnstyledButton
                  type="button"
                  aria-label={p.name}
                  onClick={() => setze(p.hex)}
                  style={{ display: "inline-flex" }}
                >
                  {/* Muster-Fächer sehen die Palette gleich mit ihrem Muster */}
                  <FachFarbfeld fach={fach.id} farbe={p.hex} groesse={26}>
                    {p.hex.toLowerCase() === fach.farbe.toLowerCase() ? (
                      <IconCheck size={14} color="#fff" />
                    ) : null}
                  </FachFarbfeld>
                </UnstyledButton>
              </Tooltip>
            ))}
          </Group>
          <ColorInput
            size="xs"
            label="Freie Farbe"
            format="hex"
            value={fach.farbe}
            onChangeEnd={(v) => istFarbe(v) && setze(v.toLowerCase())}
            aria-label={`Freie Farbe für ${fach.name}`}
          />
          <GrauVorschau farbe={fach.farbe} />
          {gleich.length > 0 && (
            <Text size="xs" c="dimmed">
              Dieselbe Farbe hat {gleich.join(", ")}.
            </Text>
          )}
          {zwilling.length > 0 && (
            <Text size="xs" c="dimmed">
              Dieselbe Grundfarbe hat {zwilling.join(", ")} – unterschieden
              durch{" "}
              {muster
                ? `das Muster „${MUSTER_NAMEN[muster]}" und das Kürzel`
                : "das Muster"}
              .
            </Text>
          )}
          {eigen && FACH_VORSCHLAG[fach.id] && (
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => setze("")}
              leftSection={
                <ColorSwatch color={FACH_VORSCHLAG[fach.id]} size={12} />
              }
            >
              Vorschlag wiederherstellen ({farbname(FACH_VORSCHLAG[fach.id])})
            </Button>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 * So kommt die Farbe auf der Schwarz-Weiß-Kopie an: als Grauton neben dem Original, dazu der
 * Kontrast gegen weißes Papier und gegen schwarzen Text. Belegte Schwellen und Faustregel
 * stehen in shared/fachfarben.ts.
 */
function GrauVorschau({ farbe }: { farbe: string }): React.JSX.Element {
  const p = graustufenPruefung(farbe);
  const farbeDerMeldung =
    p.stufe === "gut" ? "teal" : p.stufe === "zu-hell" ? "red" : "orange";
  return (
    <Stack gap={4} className="fachfarbe-grau" data-stufe={p.stufe}>
      <Group gap="xs" wrap="nowrap">
        <div className="fachfarbe-probe" style={{ background: farbe }}>
          Überschrift
        </div>
        <div className="fachfarbe-probe" style={{ background: grau(farbe) }}>
          S/W-Druck
        </div>
      </Group>
      <Text size="xs" c="dimmed">
        Kontrast zu Weiß {p.gegenWeiss.toFixed(1).replace(".", ",")} : 1 · zu
        schwarzem Text {p.gegenSchwarz.toFixed(1).replace(".", ",")} : 1 ·
        Grauwert {p.grauProzent} %
      </Text>
      <Text
        size="xs"
        c={`${farbeDerMeldung}.7`}
        role={p.stufe === "gut" ? undefined : "alert"}
      >
        {p.stufe === "gut"
          ? "Gut für den S/W-Druck: Linien und Überschriften bleiben deutlich."
          : p.hinweis}
      </Text>
    </Stack>
  );
}
