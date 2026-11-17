/**
 * Bilder des Boss-Kampfs (17.11.2026): per Bild-KI erzeugt (ChatGPT-Abo der Lehrkraft), freigestellt, als WebP im
 * Programm. Namen: held-<figur>-<pose>, boss-<monster>-<pose>, hg-<hintergrund>, effekte-<art> (shared/klassenspiel/bossBestand.ts).
 */
const BILDER = import.meta.glob<string>('../../../assets/klassenspiele/boss/*.webp', { eager: true, import: 'default' })

export const bossBild = (name: string): string | undefined => BILDER[`../../../assets/klassenspiele/boss/${name}.webp`]

/** Grundposen; dazu Rollenposen (Tank: Schild hoch / in die Knie, Heiler: Heilzauber / Heilwelle) und Spezialangriff */
export type FigurPose = 'ruhe' | 'angriff' | 'getroffen' | 'besiegt' | 'rolle1' | 'rolle2' | 'spezial'
/** Fehlt eine Zusatzpose (noch nicht erzeugt), gilt die nächstpassende Grundpose */
const ERSATZ: Partial<Record<FigurPose, FigurPose>> = { rolle1: 'angriff', rolle2: 'getroffen', spezial: 'angriff' }
export const figurBild = (figur: string, pose: FigurPose = 'ruhe'): string | undefined =>
  bossBild(`held-${figur}-${pose}`) ?? (ERSATZ[pose] ? bossBild(`held-${figur}-${ERSATZ[pose]}`) : undefined) ?? bossBild(`held-${figur}-ruhe`)
