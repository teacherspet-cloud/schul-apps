import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

/*
 * Belastungstest mit echter KI (22.10.2026, tests/redteam): verbraucht KI-Kontingent – nur ausdrücklich starten:
 *   npx vitest run -c vitest.redteam.config.ts     (Modell: REDTEAM_MODELL=sonnet|haiku|opus)
 */
export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  test: { include: ['tests/redteam/**/*.redteam.ts'], environment: 'node', testTimeout: 900_000, hookTimeout: 900_000, fileParallelism: false }
})
