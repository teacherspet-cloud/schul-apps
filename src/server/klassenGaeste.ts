/**
 * Lernende mit Anmeldecode in „Meine Klassen" › Lernende (09.10.2026, Wunsch der Lehrkraft): Code ansehen, Zettel
 * drucken oder sichern, neuen Code erzeugen und den Namen ändern – wie in „Sprachenlernen", aber von der Klasse aus.
 *
 *   GET  /server/klassen/<GRUPPE>/gaeste                    → { gaeste: [{ id, name, zugang }] }  (zugang: 8 Zeichen oder leer)
 *   POST /server/klassen/<GRUPPE>/gast-name  { id, name }   → { ok, name }   Name im Format „Vorname N."
 *   POST /server/klassen/<GRUPPE>/gast-code  { id }         → { ok, zugang } neuer persönlicher Code
 *
 * Nur für die eigene Lerngruppe und nur für Gäste (`quelle = 'gast'`), die dort Mitglied sind. Der Name bleibt
 * verschlüsselt gespeichert (feldschutz.ts, über `nutzerAendern`); das Protokoll nennt keinen Namen. Danach vergisst
 * der Namensschutz seine Liste (namensschutz.ts) – der neue Name wird beim nächsten KI-Aufruf mit geschützt.
 * Steht VOR der Route von „Meine Klassen" (start.ts), die unbekannte POST-Anfragen ablehnt.
 */
import { nutzerNachId, protokolliereServer, type NutzerInfo } from './datenbank'
import { alsNutzer, json, type Anfrage } from './http'
import { gastName, lerngruppe, mitgliederVon, type Lerngruppe } from './onlinetest'
import { db as vokDb, gastCodeSetzen } from './vokabeln'
import { lernendeUmbenennen } from './umbenennen'

/** Gäste der Lerngruppe mit ihrem lesbaren Anmeldecode (aus den Vokabelkursen dieser Lehrkraft) */
export function gaesteDerGruppe(g: Lerngruppe, lehrkraftId: string): { id: string; name: string; zugang: string }[] {
  const gaeste = mitgliederVon(g).filter((n) => n.quelle === 'gast')
  if (!gaeste.length) return []
  const codes = new Map<string, string>()
  for (const z of vokDb()
    .prepare(
      "SELECT g.nutzer_id, g.code_v FROM vok_gaeste g JOIN vok_zuweisungen z ON z.id = g.zuweisung_id WHERE z.lehrkraft_id = ? AND g.anmelde != ''"
    )
    .all(lehrkraftId) as { nutzer_id: string; code_v: string }[])
    // Spalte nicht umbenennen: entschlüsselt wird nach dem Spaltennamen (feldschutz.ts)
    if (typeof z.code_v === 'string' && z.code_v.length === 8 && !codes.has(z.nutzer_id)) codes.set(z.nutzer_id, z.code_v)
  return gaeste.map((n) => ({ id: n.id, name: n.name, zugang: codes.get(n.id) ?? '' }))
}

/** Namen, mit denen der Gast nicht zusammenfallen darf: andere Mitglieder der Lerngruppe und Gäste seiner Kurse */
function belegteNamen(g: Lerngruppe, gast: NutzerInfo): Set<string> {
  const namen = new Set(mitgliederVon(g).filter((n) => n.id !== gast.id).map((n) => n.name.toLowerCase()))
  const d = vokDb()
  for (const tabelle of ['vok_gaeste', 'gram_gaeste']) {
    if (!d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabelle)) continue
    const andere = d
      .prepare(`SELECT DISTINCT b.nutzer_id AS n FROM ${tabelle} a JOIN ${tabelle} b ON b.zuweisung_id = a.zuweisung_id WHERE a.nutzer_id = ? AND b.nutzer_id != ?`)
      .all(gast.id, gast.id) as { n: string }[]
    for (const { n } of andere) {
      const x = nutzerNachId(n)
      if (x) namen.add(x.name.toLowerCase())
    }
  }
  return namen
}

export function klassenGaesteRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const m = /^\/server\/klassen\/([^/]+)\/(gaeste|gast-name|gast-code)$/.exec(url.pathname)
    if (!m) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    if (sitzung.nutzer.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    const ich = alsNutzer(sitzung.nutzer, sitzung.kennung)
    const g = lerngruppe(decodeURIComponent(m[1]))
    if (!g || g.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true)
    if (m[2] === 'gaeste') {
      if (req.method !== 'GET') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
      return (json(res, 200, { gaeste: gaesteDerGruppe(g, ich.id) }), true)
    }
    if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
    if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
    const k0 = (await k.koerper()) as Record<string, unknown>
    const gast = mitgliederVon(g).find((n) => n.id === String(k0.id ?? '') && n.quelle === 'gast')
    if (!gast) return (json(res, 404, { fehler: 'Diese Person meldet sich nicht mit einem Code in dieser Lerngruppe an.' }), true)
    if (m[2] === 'gast-code') {
      const zugang = gastCodeSetzen(gast.id)
      protokolliereServer('klassen', 'Neuer persönlicher Code für einen Gast', ich.id)
      return (json(res, 200, { ok: true, zugang }), true)
    }
    const name = gastName(k0.name)
    if (!name) return (json(res, 400, { fehler: 'Bitte Vorname und Anfangsbuchstaben des Nachnamens eingeben, z. B. „Anna K.“' }), true)
    if (name === gast.name) return (json(res, 200, { ok: true, name }), true)
    if (belegteNamen(g, gast).has(name.toLowerCase()))
      return (json(res, 409, { fehler: `„${name}“ gibt es hier schon – bitte einen zweiten Buchstaben des Nachnamens dazunehmen, z. B. „Anna Ko.“` }), true)
    // Mit den Test-Gastkonten derselben Person (Ergebnisse über den Namen) – umbenennen.ts
    lernendeUmbenennen(gast.id, name)
    protokolliereServer('klassen', 'Name eines Gastes geändert', ich.id)
    return (json(res, 200, { ok: true, name }), true)
  }
}
