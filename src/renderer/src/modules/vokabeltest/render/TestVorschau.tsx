import { Text } from '@mantine/core'
import { useMemo } from 'react'
import type { Zwischenstand } from '../../../shared/zwischenstand'
import type { TestDocument } from '../model/types'
import { RenderContext } from './RenderContext'
import { TestPage } from './TestPage'
import './test.css'
// Das Aufleuchten (`ws-live-neu`) ist für alle Vorschauen dasselbe
import '../../arbeitsblatt/render/ws.css'

/**
 * Live-Vorschau eines entstehenden Vokabeltests (02.10.2026, shared/zwischenstand.ts).
 *
 * Nur zum Ansehen und bewusst OHNE Seitenaufteilung: jede Variante als ein durchgehendes Blatt
 * (`TestPage` ohne `layout`). Die Aufteilung auf Seiten mit Schriftgröße und Seitenvorgabe
 * rechnet der Editor, sobald der Test abgelegt ist – sie bei jeder neuen Aufgabe zu wiederholen,
 * kostete viel und änderte sich mit jeder weiteren ohnehin.
 */
export function TestVorschau({ z }: { z: Zwischenstand }): React.JSX.Element | null {
  const doc = z.stand as TestDocument
  const neu = useMemo(() => new Set(z.markiert), [z.markiert])
  const varianten = doc.variants.filter((v) => v.blocks.length)
  if (!varianten.length) return null
  return (
    <RenderContext.Provider value={{ mode: 'print' }}>
      <div className="editor-sheet" data-live-vorschau>
        {varianten.map((variant) => (
          <div key={variant.id} style={{ marginBottom: 24 }}>
            {varianten.length > 1 && (
              <Text size="sm" fw={600} c="dimmed" mb={4}>
                Variante {variant.label}
              </Text>
            )}
            <TestPage
              doc={doc}
              variant={variant}
              wrapBlock={(block, _i, content) => (
                <div key={neu.has(block.id) ? `neu-${z.nr}` : 'alt'} className={neu.has(block.id) ? 'ws-live-neu' : undefined} data-live-baustein={block.id}>
                  {content}
                </div>
              )}
            />
          </div>
        ))}
      </div>
    </RenderContext.Provider>
  )
}
