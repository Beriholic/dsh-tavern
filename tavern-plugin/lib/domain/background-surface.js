import { sessionEvents } from './session-events.js'
import { randomUUID } from 'node:crypto'

export function rewindBackgroundSurface(session, boundary) {
  if (!Number.isSafeInteger(boundary)) return 0
  const events = sessionEvents(session)
  const nodes = session && session.surface && Array.isArray(session.surface.nodes) ? session.surface.nodes : []
  const shadowed = nodes.filter(function (seq) { return Number.isSafeInteger(seq) && seq > boundary })
  if (shadowed.length === 0) return 0
  let source = null
  let turn = 0
  let step = 1
  for (let index = nodes.length - 1; index >= 0; index--) {
    const event = events[nodes[index]]
    const candidate = event && event.data && event.data.message && event.data.message.source
    if (event && event.type === 'assistant/message' && candidate && candidate.kind === 'model') {
      source = candidate
      turn = Math.max(0, Number(event.data.turn) || 0)
      step = Math.max(1, Number(event.data.step) || 1)
      break
    }
  }
  if (source === null) throw new Error('后台 Agent checkpoint 之后存在消息，但找不到可用的模型来源')
  session.append('assistant/message', {
    turn,
    step,
    message: { id: randomUUID(), role: 'assistant', content: [], source }
  }, {
    surfaceOp: { op: 'replace', start: shadowed[0], end: shadowed[shadowed.length - 1] },
    sourceEventSeqs: shadowed
  })
  return shadowed.length
}

