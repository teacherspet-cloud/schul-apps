/**
 * Bildsymbol der Partnerarbeit (24.10.2026): OpenMoji-SVG vom Server, bei Wiederholung mit kleiner Zahl.
 * Lernende holen es über /s/api/partnerarbeit/symbol/<hex>, Lehrkräfte über /server/partnerarbeit/symbol/<hex>.
 */
import { Box, Text } from '@mantine/core'
import { symbolName, symbolTeile } from '@shared/partnerarbeit/symbole'

export const symbolAdresse = (symbol: string, lehrkraft = false): string =>
  `${lehrkraft ? '/server' : '/s/api'}/partnerarbeit/symbol/${encodeURIComponent(symbolTeile(symbol).hex)}`

export function SymbolBild({
  symbol,
  groesse = 48,
  lehrkraft = false,
  sprache = 'de',
  mitName = false
}: {
  symbol: string
  groesse?: number
  lehrkraft?: boolean
  sprache?: string
  mitName?: boolean
}): React.JSX.Element | null {
  if (!symbol) return null
  const { hex, zahl } = symbolTeile(symbol)
  const name = symbolName(hex, sprache)
  return (
    <Box style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} data-pa-symbol={symbol}>
      <Box style={{ position: 'relative', width: groesse, height: groesse }}>
        <img src={symbolAdresse(symbol, lehrkraft)} alt={name} width={groesse} height={groesse} style={{ display: 'block', objectFit: 'contain' }} />
        {zahl && (
          <Text
            size="xs"
            fw={800}
            style={{
              position: 'absolute',
              right: -4,
              bottom: -4,
              background: 'var(--mantine-color-body)',
              border: '1px solid var(--app-border, #ccc)',
              borderRadius: 999,
              padding: '0 6px'
            }}
          >
            {zahl}
          </Text>
        )}
      </Box>
      {mitName && (
        <Text size="sm" fw={600} ta="center">
          {name}
        </Text>
      )}
    </Box>
  )
}
