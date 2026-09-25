// Kleine Helfer für JSON-Schemas im „strict"-Format (alle Felder Pflicht, keine Zusatzfelder).

type Schema = Record<string, unknown>

export const str = (description?: string): Schema => ({ type: 'string', ...(description ? { description } : {}) })
export const int = (description?: string): Schema => ({ type: 'integer', ...(description ? { description } : {}) })
export const bool = (description?: string): Schema => ({ type: 'boolean', ...(description ? { description } : {}) })
export const arr = (items: Schema, description?: string): Schema => ({
  type: 'array',
  items,
  ...(description ? { description } : {})
})
export const obj = (properties: Record<string, Schema>): Schema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false
})
export const enumOf = (values: string[]): Schema => ({ type: 'string', enum: values })
