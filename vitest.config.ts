import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  /*
   * Zeitgrenze je Test 20 s statt 5 s (07.10.2026): Im Gesamtlauf (300+ Dateien parallel) überschritten einzelne Tests
   * mit Server- oder Kryptoarbeit (onlinetest, iserv, mobilPcKi) gelegentlich die 5 s – einzeln bestanden sie immer.
   */
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 20_000 }
})
