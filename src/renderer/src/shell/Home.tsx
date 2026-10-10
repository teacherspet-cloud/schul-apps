import { Schnellzugriff, SchnellzugriffTitel } from './Schnellzugriff'
import { aufServer, nurPcNetz } from "../shared/plattform";
import {
  Alert,
  Badge,
  Button,
  Card,
  CloseButton,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconDeviceFloppy,
  IconSearch,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronDown, IconChevronRight, IconUsersGroup } from "@tabler/icons-react";
import { useOffenGemerkt } from "../shared/sitzung";
import { holen } from "../modules/onlinetest/serverApi";
import { begrenzt, type StartKlasse, type StartseiteDaten } from "@shared/startseiteKurse";
import { AnzahlWahl, useStartAnzahl } from "./StartAnzahl";
import { ladeServerSchule } from "../shared/serverSchule";
import { logoFreigestellt } from "../shared/logoFreistellen";
import { modules } from "../modules/registry";
import { useAppSettings } from "../shared/settingsStore";
import {
  openDocument,
  openSettings,
  openThemen,
} from "../shared/navigation";
import { imNetz } from "../shared/netzZugang";
import {
  fachAnzeige,
  ladeMaterialien,
  Material,
  neueste,
  suche,
} from "./materialien";
import { FachOrdnerSymbol, FachPunkt, useFachFarbe } from "../shared/components/FachFarbe";
import { abgleichen, ladeThemen, useThemen } from "../shared/themenbereiche";
import { nachfahrenVon, pfadVon, type Themenbereich } from "@shared/themen";
import SchulpaketKnoepfe from "./Schulpaket";
import {
  NurReiheHinweis,
  ReiheMarke,
  useReiheZuordnung,
} from "../shared/reiheZuordnung";
import { istReiheMaterial, suchtrefferMitReihen, type ReiheMitMaterial } from "@shared/reiheMaterial";

/** So viele Einträge zeigt „Zuletzt bearbeitet" */
const ZULETZT_ANZAHL = 8;
/** Ab so vielen Tagen ohne Sicherung erinnert die Startseite daran */
const SICHERUNG_NACH_TAGEN = 30;

const TAG = 24 * 60 * 60 * 1000;
const uhrzeit = new Intl.DateTimeFormat("de-DE", { timeStyle: "short" });
const datum = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

/** „heute, 14:05", „gestern, 09:12" oder das Datum */
function wann(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const tag = new Date(d);
  tag.setHours(0, 0, 0, 0);
  const diff = Math.round((heute.getTime() - tag.getTime()) / TAG);
  if (diff === 0) return `heute, ${uhrzeit.format(d)}`;
  if (diff === 1) return `gestern, ${uhrzeit.format(d)}`;
  return datum.format(d);
}

/**
 * Die Startseite.
 *
 * Neu gefasst nach der Rückmeldung der Lehrkraft (25.09.2026): Sie war eine reine
 * Kachelwand. Wer an gestern anknüpfen wollte, musste das Programm wissen, darin die
 * Bibliothek öffnen und dort suchen. Jetzt stehen oben die zuletzt bearbeiteten Materialien
 * aller Programme (ein Klick öffnet sie direkt), eine Suche über alles und – nur wenn es
 * etwas zu tun gibt – Hinweise auf den fehlenden KI-Zugang oder eine lange zurückliegende
 * Sicherung.
 *
 * Die Seite wird bei jedem Zurückkommen neu aufgebaut (App.tsx zeigt sie nur, solange sie
 * vorn liegt) – damit ist die Liste immer auf dem Stand der Bibliotheken.
 */
export default function Home(): React.JSX.Element {
  const schoolName = useAppSettings((s) => s.settings.schoolName);
  /*
   * Smartphone (10.10.2026, Wunsch der Lehrkraft): im Kopf kein Untertitel, sondern links das Schullogo (freigestellt,
   * ohne Hintergrund) und rechts daneben „Schul-Apps" und der Schulname; darunter eine Zeile „Meine Klassen"
   */
  const handy = useMediaQuery("(max-width: 700px)") ?? false;
  const eigenesLogo = useAppSettings((s) => s.logoDataUrl);
  const [serverLogo, setServerLogo] = useState<string | null>(null);
  const [serverName, setServerName] = useState("");
  useEffect(() => {
    void ladeServerSchule().then((d) => {
      setServerLogo(d?.logo ?? null);
      setServerName(d?.schule?.name ?? "");
    });
  }, []);
  const logoQuelle = serverLogo || eigenesLogo;
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    if (!logoQuelle) return setLogo(null);
    let weg = false;
    void logoFreigestellt(logoQuelle).then((l) => !weg && setLogo(l));
    return () => {
      weg = true;
    };
  }, [logoQuelle]);
  const schulName = serverName || schoolName;
  const letzteSicherung = useAppSettings((s) => s.settings.letzteSicherung);
  const [materialien, setMaterialien] = useState<Material[] | null>(null);
  const [ohneKi, setOhneKi] = useState(false);
  const [suchtext, setSuchtext] = useState("");

  useEffect(() => {
    let weg = false;
    void ladeMaterialien().then((m) => {
      if (weg) return;
      setMaterialien(m);
      // Neue Materialien in die Themenbereiche einsortieren (Paket 10b) – auch wer nur die Startseite sieht, findet sie dort
      void abgleichen(m.filter((x) => x.moduleId !== "vokabelliste"));
    });
    void ladeThemen().catch(() => undefined);
    // Am Tablet richtet niemand den KI-Zugang ein – dort wäre der Hinweis nur Lärm (auf dem Server schon)
    if (!nurPcNetz())
      window.api.ai
        .status()
        .then((s) => !weg && setOhneKi(!s.hasTextKey))
        .catch(() => undefined);
    return () => {
      weg = true;
    };
  }, []);

  /*
   * Material aus Unterrichtsreihen (09.10.2026, shared/reiheMaterial.ts): in „Zuletzt bearbeitet" zunächst ausgeblendet,
   * in der Suche nur, wenn sie ausschließlich solches findet (dann mit Hinweis)
   */
  const reiheZuordnung = useReiheZuordnung((z) => z.zuordnung);
  const reiheEinblenden = useReiheZuordnung((z) => z.einblenden);
  const reihenListe = useReiheZuordnung((z) => z.reihen);
  useEffect(() => {
    void useReiheZuordnung.getState().laden();
  }, []);
  const zuletzt = useMemo(
    () =>
      neueste(
        // Startseite (09.10.2026, Wunsch der Lehrkraft): immer nur die Reihe als Ganzes – ihr Material nie, auch nicht eingeblendet.
        // Seit 10.10.2026: nur, was für die Reihe entstanden ist; in eine Reihe geholtes eigenes Material bleibt stehen
        [
          ...(materialien ?? []).filter((m) => !istReiheMaterial(reiheZuordnung.get(m.id), m.name)),
          ...reihenListe.map(reiheAlsMaterial),
        ],
        // Smartphone (10.10.2026): Anzahl wählbar (bis „alle") – erst beim Zeigen gekürzt
        handy ? Number.MAX_SAFE_INTEGER : ZULETZT_ANZAHL
      ),
    [materialien, reiheZuordnung, reihenListe, handy]
  );
  // „Zuletzt bearbeitet" am Smartphone: zunächst 5, Anzahl wählbar und dauerhaft je Gerät (StartAnzahl.tsx)
  const [zuletztAnzahl, setZuletztAnzahl] = useStartAnzahl("zuletzt");
  const zuletztSichtbar = handy ? begrenzt(zuletzt, zuletztAnzahl) : zuletzt;
  const { liste: treffer, nurReihe } = useMemo(
    () =>
      suchtrefferMitReihen(
        suche(materialien ?? [], suchtext),
        (m) => m.id,
        reiheZuordnung,
        reiheEinblenden,
        (m) => m.name
      ),
    [materialien, suchtext, reiheZuordnung, reiheEinblenden]
  );
  const suchtAktiv = suchtext.trim().length > 0;
  const themen = useThemen((s) => s.daten);
  // Themenbereiche passend zur Suche (Name oder Fach) – vor den Materialien
  const bereichTreffer = useMemo(() => {
    const woerter = suchtext
      .toLocaleLowerCase("de")
      .split(/\s+/)
      .filter(Boolean);
    if (!woerter.length) return [];
    return themen.bereiche
      .filter((b) =>
        woerter.every((w) =>
          `${b.name} ${fachAnzeige(b.fachId)}`
            .toLocaleLowerCase("de")
            .includes(w)
        )
      )
      .slice(0, 6);
  }, [suchtext, themen]);
  // Mit Unterbereichen gezählt (Paket 12) – die Zahl am Ordner zeigt, was darin steckt
  const bereichZahl = (b: Themenbereich): number => {
    const ids = new Set([b.id, ...nachfahrenVon(themen, b.id)]);
    return (materialien ?? []).filter((m) =>
      ids.has(themen.zuordnungen[`${m.moduleId}:${m.id}`]?.bereichId ?? "")
    ).length;
  };

  /*
   * Erinnerung ans Sichern: nur, wenn es überhaupt Material gibt, und erst nach einem Monat.
   * Ein Hinweis, der immer dasteht, wird nicht mehr gelesen.
   */
  const tageSeitSicherung = letzteSicherung
    ? Math.floor((Date.now() - Date.parse(letzteSicherung)) / TAG)
    : null;
  const sicherungFaellig =
    !imNetz() &&
    (materialien?.length ?? 0) > 0 &&
    (tageSeitSicherung === null ||
      Number.isNaN(tageSeitSicherung) ||
      tageSeitSicherung > SICHERUNG_NACH_TAGEN);

  const materialListe = (materialien?.length ?? 0) > 0 && (
        <Stack gap="sm" mb={40}>
          <Group justify="space-between" align="end" wrap="wrap" gap="sm">
            <Group gap="xs" wrap="nowrap">
              <Title order={3}>
                {suchtAktiv ? "Suchergebnis" : "Zuletzt bearbeitet"}
              </Title>
              {handy && !suchtAktiv && (
                <AnzahlWahl karte="zuletzt" wert={zuletztAnzahl} setzen={setZuletztAnzahl} />
              )}
            </Group>
          </Group>
          {suchtAktiv && bereichTreffer.length > 0 && (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              {bereichTreffer.map((b) => (
                <BereichZeile
                  key={b.id}
                  bereich={b}
                  anzahl={bereichZahl(b)}
                  oben={pfadVon(themen, b.id)
                    .slice(0, -1)
                    .map((x) => x.name)}
                />
              ))}
            </SimpleGrid>
          )}
          {suchtAktiv && treffer.length === 0 ? (
            bereichTreffer.length === 0 && (
              <Text c="dimmed" size="sm">
                Keine Materialien gefunden.
              </Text>
            )
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              {suchtAktiv && nurReihe && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <NurReiheHinweis />
                </div>
              )}
              {(suchtAktiv ? treffer.slice(0, 40) : zuletztSichtbar).map((m) => (
                <MaterialZeile key={`${m.moduleId}-${m.id}`} material={m} />
              ))}
            </SimpleGrid>
          )}
          {suchtAktiv && treffer.length > 40 && (
            <Text c="dimmed" size="xs">
              {treffer.length - 40} weitere Treffer – Suche genauer fassen.
            </Text>
          )}
        </Stack>
  );

  return (
    <Container size="lg" py={48} style={{ height: "100%", overflow: "auto" }}>
      {/* Kopf überall wie am Telefon (10.10.2026, Wunsch der Lehrkraft): Schullogo freigestellt links, „Schul-Apps" und
          der Schulname rechts daneben – ohne Untertitel */}
      <Group
        gap={handy ? "sm" : "lg"}
        wrap="nowrap"
        className={handy ? "home-hero home-hero-handy" : "home-hero"}
        data-home-kopf={handy ? "handy" : "gross"}
      >
        {logo && <img src={logo} alt="" className={handy ? "home-logo" : "home-logo home-logo-gross"} data-home-logo />}
        <div style={{ minWidth: 0 }}>
          <Title order={1}>Schul-Apps</Title>
          {schulName && (
            <Text opacity={0.92} size={handy ? "sm" : "md"} lineClamp={2}>
              {schulName}
            </Text>
          )}
        </div>
      </Group>

      {/* Smartphone: „Meine Klassen" über der Materialsuche (10.10.2026) – aufklappbar mit Klassen und Kursen */}
      {handy && aufServer() && modules.some((m) => m.id === "meineklassen") && <MeineKlassenKasten />}

      {/* Suche ganz oben (09.10.2026, Wunsch der Lehrkraft) – Treffer seit 10.10.2026 direkt darunter */}
      {(materialien?.length ?? 0) > 0 && (
      <TextInput
        aria-label="Materialien durchsuchen"
        placeholder="Alle Materialien durchsuchen (Name, Thema, Fach)"
        leftSection={<IconSearch size={16} />}
        rightSection={
          suchtAktiv ? (
            <CloseButton
              size="sm"
              aria-label="Suche leeren"
              onClick={() => setSuchtext("")}
            />
          ) : null
        }
        value={suchtext}
        onChange={(e) => setSuchtext(e.currentTarget.value)}
        onKeyDown={(e) => {
          // Enter öffnet den ersten Treffer, Escape leert die Suche
          if (e.key === "Enter" && treffer[0])
            void openDocument(treffer[0].moduleId, treffer[0].id);
          if (e.key === "Escape") setSuchtext("");
        }}
        size="md"
        mb="lg"
        data-home-suche
      />
      )}
      {/* Suchergebnis direkt unter dem Suchfeld (10.10.2026, Wunsch der Lehrkraft) */}
      {suchtAktiv && materialListe}

      {(ohneKi || sicherungFaellig) && (
        <Stack gap="sm" mb="xl">
          {ohneKi && (
            <Alert
              color="orange"
              icon={<IconAlertTriangle />}
              title="Kein KI-Zugang eingerichtet"
              className="home-hinweis"
            >
              <Group justify="space-between" gap="sm">
                <Text size="sm">
                  Ohne Zugang entsteht kein neues Material. Nach dem Einlesen
                  einer Sicherung auf einem anderen Rechner fehlt er ebenfalls –
                  Schlüssel und Abo-Anmeldung stehen aus Sicherheitsgründen
                  nicht in der Sicherung.
                </Text>
                <Button
                  size="xs"
                  variant="white"
                  color="orange"
                  onClick={() => openSettings("ki")}
                >
                  KI-Zugang einrichten
                </Button>
              </Group>
            </Alert>
          )}
          {sicherungFaellig && (
            <Alert
              color="blue"
              icon={<IconDeviceFloppy />}
              title={
                tageSeitSicherung === null
                  ? "Noch keine Sicherung"
                  : "Sicherung empfohlen"
              }
              className="home-hinweis"
            >
              <Group justify="space-between" gap="sm">
                <Text size="sm">
                  {tageSeitSicherung === null || Number.isNaN(tageSeitSicherung)
                    ? "Von den erstellten Materialien gibt es noch keine Sicherung."
                    : `Die letzte Sicherung liegt ${tageSeitSicherung} Tage zurück.`}{" "}
                  Eine Sicherungsdatei, etwa auf einem USB-Stick, bewahrt alles
                  vor einem Rechnerausfall.
                </Text>
                <Button
                  size="xs"
                  variant="white"
                  onClick={() => openSettings("wartung")}
                >
                  Zur Sicherung
                </Button>
              </Group>
            </Alert>
          )}
        </Stack>
      )}

      {/* Server (03.10.2026): das Wichtigste auf einen Blick – Reihen, Tests, Freigaben, Termine */}
      {aufServer() && (
        <>
          <SchnellzugriffTitel />
          <Schnellzugriff />
        </>
      )}

      {!imNetz() && (
        <Group justify="flex-end" mb="xs">
          <SchulpaketKnoepfe
            eingelesen={() =>
              void ladeMaterialien().then((m) => {
                setMaterialien(m);
                // Eingelesenes Material gleich in die Themenbereiche einsortieren, wie jedes neue
                void abgleichen(m.filter((x) => x.moduleId !== "vokabelliste"));
              })
            }
          />
        </Group>
      )}

      {/* Ohne Suche: „Zuletzt bearbeitet" hier unten; mit Suche stehen die Treffer direkt unter dem Feld (10.10.2026) */}
      {!suchtAktiv && materialListe}


    </Container>
  );
}

/** Ein Eintrag in „Zuletzt bearbeitet" bzw. im Suchergebnis; ein Klick öffnet das Dokument. */
/** Eine Unterrichtsreihe als Eintrag in „Zuletzt bearbeitet" (09.10.2026) – öffnet die Reihe */
function reiheAlsMaterial(r: ReiheMitMaterial): Material {
  const schritte = r.schritte ?? 0;
  return {
    moduleId: "unterrichtsreihe",
    id: r.id,
    name: r.titel,
    detail: [r.fach, r.oberthema, `${schritte} ${schritte === 1 ? "Schritt" : "Schritte"}`]
      .filter(Boolean)
      .join(" · "),
    // SQLite-Zeit („JJJJ-MM-TT hh:mm:ss", UTC) als ISO, damit Sortierung und „vor …" stimmen
    updatedAt: r.geaendert ? `${r.geaendert.replace(" ", "T")}${/[zZ]|[+-]\d\d:?\d\d$/.test(r.geaendert) ? "" : "Z"}` : "",
    entwurf: false,
    suchtext: `${r.titel} ${r.fach ?? ""} ${r.oberthema ?? ""}`.toLowerCase(),
    fach: r.fachId || r.fach,
    fachId: r.fachId ?? "",
    thema: r.oberthema ?? "",
  };
}

function MaterialZeile({
  material: m,
}: {
  material: Material;
}): React.JSX.Element {
  const modul = modules.find((x) => x.id === m.moduleId);
  // Gehört zu einer Unterrichtsreihe (09.10.2026) – nur sichtbar, wenn eingeblendet bzw. als einziger Suchtreffer
  const reihe = useReiheZuordnung((z) => z.zuordnung.get(m.id));
  return (
    <UnstyledButton
      className="home-material"
      onClick={() => void openDocument(m.moduleId, m.id)}
    >
      <Group gap="sm" wrap="nowrap">
        {/* Das Programmbild wie in der Leiste (Paket 10a); ohne Bild das Vektorsymbol */}
        {modul?.leistenbild ? (
          <img
            src={modul.leistenbild}
            className="home-material-bild"
            width={36}
            height={36}
            alt=""
            title={modul.name}
            draggable={false}
          />
        ) : (
          modul && (
            <ThemeIcon
              size={36}
              variant="light"
              color={modul.color}
              title={modul.name}
            >
              <modul.icon size={20} />
            </ThemeIcon>
          )
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <Group gap={6} wrap="nowrap">
            {/* Farbpunkt des Fachs (Paket 10a) */}
            <FachPunkt fach={m.fach} />
            <Text fw={600} size="sm" truncate>
              {m.name}
            </Text>
            {m.entwurf && (
              <Badge
                size="xs"
                variant="light"
                color="gray"
                style={{ flexShrink: 0 }}
              >
                Entwurf
              </Badge>
            )}
            {reihe && <ReiheMarke verweis={reihe} size="xs" />}
          </Group>
          <Text size="xs" c="dimmed" truncate>
            {zeileMitModul(modul?.name, m.detail, wann(m.updatedAt))}
          </Text>
        </div>
      </Group>
    </UnstyledButton>
  );
}

const zeileMitModul = (...teile: (string | undefined)[]): string =>
  teile.filter(Boolean).join(" · ");

/** Suchtreffer „Themenbereich": öffnet die übergreifende Seite in diesem Bereich */
function BereichZeile({
  bereich: b,
  anzahl,
  oben = [],
}: {
  bereich: Themenbereich;
  anzahl: number;
  oben?: string[];
}): React.JSX.Element {
  return (
    <UnstyledButton
      className="home-material"
      onClick={() => openThemen(b.fachId, b.id)}
      data-home-bereich={b.name}
    >
      <Group gap="sm" wrap="nowrap">
        <FachOrdnerSymbol fach={b.fachId} groesse={32} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text fw={600} size="sm" truncate>
            {b.name}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {/* Unterbereiche (Paket 12): der Weg dorthin, damit „Ursachen" nicht ohne Einheit dasteht */}
            {zeileMitModul(
              oben.length ? "Unterbereich" : "Themenbereich",
              [fachAnzeige(b.fachId), ...oben].join(" › "),
              anzahl === 1 ? "1 Material" : `${anzahl} Materialien`
            )}
          </Text>
        </div>
      </Group>
    </UnstyledButton>
  );
}

/**
 * „Meine Klassen" am Smartphone (10.10.2026, Wunsch der Lehrkraft): ein Kasten, zunächst zugeklappt (Auf/Zu gilt nur
 * für die Sitzung, shared/sitzung.ts). Zugeklappt steht rechts eine kurze Übersicht („3 Klassen · 5 Kurse"),
 * aufgeklappt EINE Zeile je Klasse (10.10.2026, zweite Fassung): rundes Klassenzeichen, „Klasse 7b", darunter die Fächer
 * als Chips in ihrer Fachfarbe (Tipp = Klasse + Fach direkt), ein Tipp auf die Zeile öffnet die Klasse; ein roter
 * Zähler nennt Kurse mit Handlungsbedarf (Abzeichen „Test bald"/„nicht geübt"/„Problemwörter" aus derselben Anfrage).
 * Unten als gleich gestaltete Zeile „Alle Klassen ›". Die Daten (leichte Anfrage /server/startseite) kommen gleich
 * beim Anzeigen – für die Übersicht im zugeklappten Kopf.
 */
function MeineKlassenKasten(): React.JSX.Element {
  const [offen, setOffen] = useOffenGemerkt<boolean>("home-meineklassen-offen", false);
  const [daten, setDaten] = useState<StartseiteDaten | null>(null);
  const modul = modules.find((m) => m.id === "meineklassen");
  useEffect(() => {
    let weg = false;
    void holen<StartseiteDaten>("/server/startseite").then(
      (d) => !weg && setDaten(d),
      () => !weg && setDaten({ kurse: [], klassen: [] })
    );
    return () => {
      weg = true;
    };
  }, []);
  const klassen = daten?.klassen ?? null;
  const kursAnzahl = (klassen ?? []).reduce((s, k) => s + k.faecher.length, 0);
  const uebersicht = klassen?.length
    ? [
        klassen.length === 1 ? "1 Klasse" : `${klassen.length} Klassen`,
        kursAnzahl ? (kursAnzahl === 1 ? "1 Kurs" : `${kursAnzahl} Kurse`) : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  return (
    <Card
      withBorder
      radius="lg"
      padding={0}
      className="home-meineklassen"
      data-home-meineklassen
      data-offen={offen}
      mb="sm"
    >
      <UnstyledButton
        onClick={() => setOffen((o) => !o)}
        data-home-meineklassen-kopf
        aria-expanded={offen}
        className="home-mk-kopf"
      >
        <Group gap="sm" wrap="nowrap">
          {modul?.leistenbild ? (
            <img src={modul.leistenbild} width={36} height={36} alt="" />
          ) : (
            <ThemeIcon variant="light" size={36} radius="md">
              <IconUsersGroup size={20} />
            </ThemeIcon>
          )}
          <Text fw={600} style={{ flex: 1 }}>
            Meine Klassen
          </Text>
          {!offen && uebersicht && (
            <Text size="xs" c="dimmed" data-home-meineklassen-uebersicht style={{ whiteSpace: "nowrap" }}>
              {uebersicht}
            </Text>
          )}
          {offen ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
        </Group>
      </UnstyledButton>
      {offen && (
        <div className="home-mk-liste" data-home-meineklassen-liste>
          {klassen === null ? (
            <Text size="sm" c="dimmed" className="home-mk-hinweis">
              Wird geladen …
            </Text>
          ) : klassen.length === 0 ? (
            <Text size="sm" c="dimmed" className="home-mk-hinweis">
              Noch keine Klassen oder Kurse.
            </Text>
          ) : (
            klassen.map((k) => <KlassenZeile key={k.schluessel} k={k} kurse={daten?.kurse ?? []} />)
          )}
          <UnstyledButton
            className="home-mk-zeile home-mk-alle"
            onClick={() => void openDocument("meineklassen", "uebersicht")}
            data-home-alle-klassen
          >
            <Text fw={600} size="sm" c="var(--mantine-primary-color-light-color)" style={{ flex: 1 }}>
              Alle Klassen
            </Text>
            <IconChevronRight size={18} className="home-mk-pfeil" />
          </UnstyledButton>
        </div>
      )}
    </Card>
  );
}

/** „7b" → „Klasse 7b"; Kursnamen („EN 13 eA Kon", „6s579") bleiben, wie sie sind */
const klassenTitel = (name: string): string => (/^\d{1,2}\s?[a-zA-Z]{0,2}$/.test(name) ? `Klasse ${name}` : name);

/** Abzeichen, die Handlungsbedarf anzeigen (wie in der Karte „Termine & Vokabeltraining") */
const BEDARF_ARTEN = new Set(["test", "inaktiv", "problem"]);

/**
 * Eine Klassenzeile im Kasten: die ganze Zeile öffnet die Klasse (Knopf über die volle Fläche), die Fach-Chips liegen
 * darüber und öffnen Klasse + Fach.
 */
function KlassenZeile({ k, kurse }: { k: StartKlasse; kurse: StartseiteDaten["kurse"] }): React.JSX.Element {
  const gruppen = new Set([k.gruppeId, ...k.faecher.map((f) => f.id)]);
  const bedarf = kurse.filter((x) => gruppen.has(x.gruppeId) && BEDARF_ARTEN.has(x.abzeichen.art)).length;
  const titel = klassenTitel(k.name);
  return (
    <div className="home-mk-zeile home-mk-klasse" data-home-klasse={k.name}>
      <UnstyledButton
        className="home-mk-flaeche"
        aria-label={`${titel} öffnen`}
        onClick={() => void openDocument("meineklassen", k.faecher[0]?.id ?? k.gruppeId)}
      />
      <span className="home-mk-zeichen" data-lang={k.name.length > 3 || undefined} aria-hidden>
        {k.name}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Group gap={6} wrap="nowrap">
          <Text fw={600} size="sm" truncate>
            {titel}
          </Text>
          {bedarf > 0 && (
            <span
              className="home-mk-bedarf"
              title={bedarf === 1 ? "1 Kurs mit Handlungsbedarf" : `${bedarf} Kurse mit Handlungsbedarf`}
              data-home-klasse-bedarf={bedarf}
            >
              {bedarf}
            </span>
          )}
        </Group>
        {k.faecher.length > 0 && (
          <div className="home-mk-faecher">
            {k.faecher.map((f) => (
              <FachChip key={f.id} fach={f.fach} onClick={() => void openDocument("meineklassen", f.id)} />
            ))}
          </div>
        )}
      </div>
      <IconChevronRight size={18} className="home-mk-pfeil" />
    </div>
  );
}

/** Fach als kleiner Chip in seiner Fachfarbe (getönter Grund, Farbpunkt) – tippbar */
function FachChip({ fach, onClick }: { fach: string; onClick: () => void }): React.JSX.Element {
  const farbe = useFachFarbe(fach) ?? "var(--mantine-color-gray-6)";
  return (
    <UnstyledButton
      className="home-mk-fach"
      onClick={onClick}
      data-home-klasse-fach={fach}
      style={{
        background: `color-mix(in srgb, ${farbe} 16%, transparent)`,
        borderColor: `color-mix(in srgb, ${farbe} 45%, transparent)`,
      }}
    >
      <FachPunkt fach={fach} groesse={8} />
      {fach}
    </UnstyledButton>
  );
}
