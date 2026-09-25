/// <reference types="vite/client" />
import type { SchulAppsApi } from '../../preload/index'

declare global {
  interface Window {
    api: SchulAppsApi
  }
}
