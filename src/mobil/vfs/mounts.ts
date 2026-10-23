/**
 * Die Einhängepunkte des Speicher-Dateisystems und das Laden beim Start.
 *
 *  /userData   bleibend – Library/SchulApps; wird beim Start ganz geladen
 *  /documents  bleibend – Dokumente-Ordner der App (Dateien-App: „Auf meinem iPad › Schul-Apps");
 *              Ausgaben und Sicherungen; wird NICHT geladen, nur geschrieben
 *  /resources  nur lesen – die mitgelieferten Ressourcen (Build: out/mobil/resources);
 *              klein und immer gebraucht wird vorgeladen, der Rest vor dem Aufruf, der ihn braucht
 *  /tmp        flüchtig
 *
 * Die API-Schlüssel (secrets.json) liegen NICHT im Dateisystem, sondern im Schlüsselbund von
 * iOS: Der Träger von /userData leitet genau diese Datei zum Plugin Schluesselbund um.
 *
 * Schülerdaten (23.10.2026, Nachprüfung des Schulträgers): Vor dem Laden wird der Datenschlüssel
 * geholt (vfs/ruhendIos.ts); Rückmeldungen, Elternbriefe und Nachteilsausgleiche liegen nur
 * verschlüsselt auf dem Gerät, ihre Ordner sind von der iCloud-Sicherung ausgenommen.
 */
import { Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { PERSONENBEZOGENE_ORDNER } from '@shared/lokaleDaten'
import { Dateien, Schluesselbund } from '../plugins'
import { indexedDbQuelle, iosRuhendEinschalten, iosSchutz, schluesselbundQuelle } from './ruhendIos'
import { vfs, type Traeger } from './speicher'
import { CapacitorTraeger } from './traeger'

export const USERDATA = '/userData'
export const DOKUMENTE = '/documents'
export const RESSOURCEN = '/resources'

const GEHEIMNISSE = 'secrets.json'

/** Träger von /userData – secrets.json geht in den Schlüsselbund */
export const userDataTraeger = new CapacitorTraeger(Directory.Library, 'SchulApps')
export const dokumenteTraeger = new CapacitorTraeger(Directory.Documents, '')

const mitSchluesselbund: Traeger = {
  schreiben: async (rel, daten) => {
    if (rel === GEHEIMNISSE) return Schluesselbund.set({ value: new TextDecoder().decode(daten) })
    return userDataTraeger.schreiben(rel, daten)
  },
  loeschen: async (rel) => {
    if (rel === GEHEIMNISSE) return Schluesselbund.remove()
    return userDataTraeger.loeschen(rel)
  },
  ordnerLoeschen: (rel) => userDataTraeger.ordnerLoeschen(rel)
}

/** Basisadresse der Ressourcen – neben index.html (out/mobil/resources) */
const ressourcenAdresse = (rel: string): string => new URL(`resources/${rel.split('/').map(encodeURIComponent).join('/')}`, document.baseURI).toString()

async function ladeRessource(rel: string): Promise<Uint8Array> {
  const res = await fetch(ressourcenAdresse(rel))
  if (!res.ok) throw new Error(`Ressource ${rel} fehlt (${res.status}).`)
  return new Uint8Array(await res.arrayBuffer())
}

/** Beim Start vorgeladen: klein und von Anfang an gebraucht */
const VORLADEN = [/^cefr\/levels\.json$/, /^lehrwerke\/[^/]+\.json$/]

/** Alles einhängen und laden – vor dem ersten Aufruf der Oberfläche (mobil/start.ts) */
export async function vfsLaden(): Promise<{ dateien: number }> {
  vfs.zuruecksetzen()
  vfs.einhaengen({ wurzel: USERDATA, traeger: mitSchluesselbund })
  vfs.einhaengen({ wurzel: DOKUMENTE, traeger: dokumenteTraeger })
  vfs.einhaengen({ wurzel: RESSOURCEN, nurLesen: true, laden: ladeRessource })
  vfs.einhaengen({ wurzel: '/tmp' })

  // Erst der Schlüssel, dann das Laden – sonst kämen die verschlüsselten Dateien als Chiffrat in den Speicher
  await iosRuhendEinschalten(Capacitor.isNativePlatform() ? schluesselbundQuelle(Schluesselbund) : indexedDbQuelle())
  userDataTraeger.schutz = iosSchutz
  // Von der iCloud-Sicherung ausnehmen (natives Plugin Dateien; ältere App ohne die Methode: null)
  void Dateien.vonSicherungAusnehmen(PERSONENBEZOGENE_ORDNER.map((o) => `${userDataTraeger.basis}/${o}`)).then((ok) => {
    if (ok === null && Capacitor.isNativePlatform()) console.warn('Ordner mit Schülerdaten konnten nicht von der iCloud-Sicherung ausgenommen werden')
  })

  const [anzahl] = await Promise.all([
    userDataTraeger.allesLaden(vfs, USERDATA, (rel) => rel === GEHEIMNISSE),
    (async () => {
      const { value } = await Schluesselbund.get().catch(() => ({ value: null }))
      if (value) vfs.uebernehmen(`${USERDATA}/${GEHEIMNISSE}`, new TextEncoder().encode(value))
    })(),
    ressourcenVerzeichnis()
  ])
  return { dateien: anzahl }
}

/** Das Verzeichnis der Ressourcen (vom Build erzeugt): alles bekannt, Kleines gleich geladen */
async function ressourcenVerzeichnis(): Promise<void> {
  let liste: { pfad: string; groesse: number }[] = []
  try {
    const res = await fetch(ressourcenAdresse('verzeichnis.json'))
    if (res.ok) liste = ((await res.json()) as { dateien: { pfad: string; groesse: number }[] }).dateien
  } catch {
    // Ohne Verzeichnis gibt es keine Ressourcen – die App läuft trotzdem (Vorgaben der Oberfläche)
  }
  for (const d of liste) vfs.uebernehmen(`${RESSOURCEN}/${d.pfad}`, null, 0, d.groesse)
  await vfs.sicherstellen(liste.filter((d) => VORLADEN.some((m) => m.test(d.pfad))).map((d) => `${RESSOURCEN}/${d.pfad}`))
}

/**
 * Ressourcen, die ein Aufruf braucht, vorher nachladen – die Dienste lesen synchron.
 * Unbekannte Dateien bleiben unbekannt (dann meldet der Dienst „nicht vorhanden", wie am PC).
 */
export async function vorbereiten(kanal: string, args: unknown[]): Promise<void> {
  const r = (rel: string): string => `${RESSOURCEN}/${rel}`
  if (kanal === 'lehrplan:themen' && typeof args[0] === 'string' && /^[A-Z]{2,3}$/.test(args[0])) {
    await vfs.sicherstellen([r(`lehrplaene/${args[0]}.json`)])
  } else if (kanal.startsWith('schulen:')) {
    const pfade = [r('schulen/schulen.json')]
    if (kanal === 'schulen:logo' && typeof args[0] === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(args[0])) pfade.push(r(`schulen/logos/${args[0]}.png`))
    await vfs.sicherstellen(pfade)
  } else if (kanal === 'images:openmoji-search') {
    await vfs.sicherstellen([r('openmoji/index.json')])
  } else if (kanal === 'images:openmoji-svg') {
    await vfs.sicherstellen([r('openmoji/svgs.json')])
  }
}
