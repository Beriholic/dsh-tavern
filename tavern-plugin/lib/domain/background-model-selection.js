function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export const VALID_REASONING_EFFORTS = Object.freeze(['off', 'low', 'medium', 'high'])

export function normalizeReasoningEffort(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return VALID_REASONING_EFFORTS.includes(normalized) ? normalized : null
}

export function normalizeBackgroundModel(value) {
  if (value === null || value === undefined) return null
  const input = object(value)
  const provider = text(input.provider)
  const model = text(input.model)
  if (provider === '' || model === '') return null
  const result = { provider, model }
  const reasoningEffort = normalizeReasoningEffort(input.reasoningEffort)
  if (reasoningEffort !== null) result.reasoningEffort = reasoningEffort
  return result
}

export function snapshotBackgroundModel(configured) {
  // Null means resolve the current foreground selection when each task starts.
  // Only an explicit user choice is frozen into the game.
  return normalizeBackgroundModel(configured)
}

export function resolveChatBackgroundModel(chat, fallback) {
  const source = object(chat).backgroundModelSelection || fallback
  const selected = normalizeBackgroundModel(source)
  if (selected !== null && typeof source?.reasoningEffort === 'string' && source.reasoningEffort.trim() !== '') {
    selected.reasoningEffort = source.reasoningEffort.trim()
  }
  return selected
}

export function resolveMvuSelection(baseSelection, mvuReasoningEffort) {
  if (baseSelection === null || typeof baseSelection !== 'object') return null
  const effort = normalizeReasoningEffort(mvuReasoningEffort)
  if (effort === null) return baseSelection
  return Object.assign({}, baseSelection, { reasoningEffort: effort })
}
