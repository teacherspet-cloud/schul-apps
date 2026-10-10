/**
 * Rahmen der App (10.10.2026, Entscheidung der Lehrkraft): Kopfleiste über die volle Breite, die mit der Seitenleiste
 * EIN Stück bildet – ein „L" um den Inhalt auf jeder Seite. Links in der Ecke über der Leiste das freigestellte
 * Schullogo auf weißer Kachel, daneben „Schul-Apps" und der Schulname, rechts die Info-Chips (was ansteht) und das
 * Datum. Farben: Verlauf in der Akzentfarbe (themes.ts kopfVerlauf), die Leiste trägt das dunkle Ende, damit die Ecke
 * nahtlos ist. Am Telefon eine schmale Leiste (Logo, Titel, Schulname gekürzt) mit „Heute ▾".
 * Chips nur auf dem Server (shell/kopfDaten.ts); passen sie nicht in die Zeile, stehen sie in „N Hinweise ▾".
 */
import { Popover, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconSchool } from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { tagKurz, type KopfZahl } from "@shared/startseiteKurse";
import { tagVon } from "@shared/schulkalender";
import { ladeServerSchule } from "../shared/serverSchule";
import { logoFreigestellt } from "../shared/logoFreistellen";
import { useAppSettings } from "../shared/settingsStore";
import { oeffneProgramm, openModule } from "../shared/navigation";
import { useKopfZahlen } from "./kopfDaten";

/** Höhe der Kopfleiste (PC/Tablet bzw. Telefon) */
export const KOPF_HOEHE = 64;
export const KOPF_HOEHE_TELEFON = 52;

/** Schullogo (freigestellt, ohne Hintergrund) und Schulname – vom Server, sonst aus den eigenen Einstellungen */
export function useSchulKopf(): { logo: string | null; schulName: string } {
  const schoolName = useAppSettings((s) => s.settings.schoolName);
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
  return { logo, schulName: serverName || schoolName };
}

export default function RahmenKopf({
  telefon,
  eckeBreite,
}: {
  /** Schmale Kopfleiste (Telefon oder Fenster bis 700 px): kleinere Kachel, kein Datum, Chips in „Heute ▾" */
  telefon: boolean;
  /** Breite der Seitenleiste darunter (0 = keine) – Logo und Titel stehen in dieser Ecke */
  eckeBreite: number;
}): React.JSX.Element {
  const { logo, schulName } = useSchulKopf();
  const zahlen = useKopfZahlen();
  return (
    <div className="rahmen-kopf-innen" data-rahmen-kopf={telefon ? "handy" : "gross"}>
      <UnstyledButton
        className="rahmen-ecke"
        style={eckeBreite ? { minWidth: eckeBreite } : undefined}
        onClick={() => openModule("home")}
        aria-label="Schul-Apps – zur Startseite"
        data-rahmen-ecke
      >
        <span className="rahmen-logo-kachel" data-rahmen-logo-kachel>
          {logo ? (
            <img src={logo} alt="" className="rahmen-logo" data-rahmen-logo draggable={false} />
          ) : (
            <IconSchool size={telefon ? 22 : 26} className="rahmen-logo-ersatz" />
          )}
        </span>
        <span className="rahmen-titel">
          <span className="rahmen-name">Schul-Apps</span>
          {schulName && (
            <span className="rahmen-schule" data-rahmen-schule>
              {schulName}
            </span>
          )}
        </span>
      </UnstyledButton>
      <KopfChips zahlen={zahlen} telefon={telefon} />
      {!telefon && (
        <Text component="span" className="rahmen-datum" data-rahmen-datum>
          {tagKurz(tagVon(Date.now()))}
        </Text>
      )}
    </div>
  );
}

const ChipKnopf = ({ z, onClick }: { z: KopfZahl; onClick: () => void }): React.JSX.Element => (
  <UnstyledButton className="rahmen-chip" title={z.titel} onClick={onClick} data-rahmen-chip={z.id} data-anzahl={z.anzahl}>
    {z.text}
  </UnstyledButton>
);

/**
 * Info-Chips: in einer Zeile, solange sie passen (gemessen an einer unsichtbaren Kopie); sonst ein Knopf
 * „N Hinweise ▾" (am Telefon „Heute ▾") mit den Chips untereinander. Ohne Zahlen nichts.
 */
function KopfChips({ zahlen, telefon }: { zahlen: KopfZahl[]; telefon: boolean }): React.JSX.Element {
  const platz = useRef<HTMLDivElement>(null);
  const mass = useRef<HTMLDivElement>(null);
  const [passt, setPasst] = useState(true);
  const [offen, setOffen] = useState(false);
  const schluessel = zahlen.map((z) => z.text).join("|");
  useLayoutEffect(() => {
    const p = platz.current;
    const m = mass.current;
    if (!p || !m) return;
    const pruefe = (): void => setPasst(m.scrollWidth <= p.clientWidth);
    pruefe();
    const beob = new ResizeObserver(pruefe);
    beob.observe(p);
    return () => beob.disconnect();
  }, [schluessel]);
  if (!zahlen.length) return <div className="rahmen-chips" />;
  const oeffne = (z: KopfZahl): void => {
    setOffen(false);
    oeffneProgramm(z.ziel);
  };
  const eingeklappt = telefon || !passt;
  return (
    <div className="rahmen-chips" ref={platz} role="group" aria-label="Auf einen Blick" data-rahmen-chips>
      {/* Unsichtbare Kopie zum Messen, ob alle Chips in die Zeile passen */}
      <div className="rahmen-chips-mass" ref={mass} aria-hidden>
        {zahlen.map((z) => (
          <span key={z.id} className="rahmen-chip">
            {z.text}
          </span>
        ))}
      </div>
      {eingeklappt ? (
        <Popover opened={offen} onChange={setOffen} position="bottom-end" shadow="md" withArrow>
          <Popover.Target>
            <UnstyledButton
              className="rahmen-chip rahmen-hinweise"
              onClick={() => setOffen((o) => !o)}
              aria-expanded={offen}
              data-rahmen-hinweise={zahlen.length}
            >
              {telefon ? "Heute" : zahlen.length === 1 ? "1 Hinweis" : `${zahlen.length} Hinweise`}
              {telefon && <span className="rahmen-hinweise-zahl">{zahlen.length}</span>}
              <IconChevronDown size={14} />
            </UnstyledButton>
          </Popover.Target>
          <Popover.Dropdown className="rahmen-hinweise-liste" data-rahmen-hinweise-liste>
            <Stack gap={6}>
              {zahlen.map((z) => (
                <UnstyledButton
                  key={z.id}
                  className="rahmen-hinweis"
                  onClick={() => oeffne(z)}
                  data-rahmen-chip={z.id}
                  data-anzahl={z.anzahl}
                >
                  <Text size="sm" fw={600}>
                    {z.text}
                  </Text>
                  {z.titel && (
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "pre-line" }}>
                      {z.titel}
                    </Text>
                  )}
                </UnstyledButton>
              ))}
            </Stack>
          </Popover.Dropdown>
        </Popover>
      ) : (
        zahlen.map((z) => <ChipKnopf key={z.id} z={z} onClick={() => oeffne(z)} />)
      )}
    </div>
  );
}
