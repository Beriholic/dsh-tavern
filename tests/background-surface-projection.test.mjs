import test from 'node:test'
import assert from 'node:assert/strict'
import { backgroundSuppressedTurns } from '../tavern-plugin/lib/domain/background-surface.js'
test('durable rollback excludes tool and reasoning turns including older rollback records', () => {
  const events = [
    { type: "projection-cache", data: { turn: 1 } },
    { seq: 2959, type: 'turn/end', data: { turn: 2 } },
    { seq: 2964, type: 'user/message', data: { turn: 3 } },
    { seq: 3325, type: 'tool/call', data: { turn: 3 } },
    { seq: 4000, type: 'assistant/message', data: { turn: 4 } },
    { seq: 4257, type: 'tool/call', data: { turn: 5 } },
    { seq: 4262, type: 'assistant/message', data: { turn: 5, message: { content: [] } }, surfaceOp: { op: 'replace', start: 2964, end: 4258 } },
    { seq: 4265, type: 'tool/call', data: { turn: 6 } }
  ]
  assert.deepEqual(backgroundSuppressedTurns(events), [3, 4, 5])
  assert.deepEqual(backgroundSuppressedTurns(events.slice(0, 5)), [])
})
