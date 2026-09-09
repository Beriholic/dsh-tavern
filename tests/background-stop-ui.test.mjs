import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../tavern-plugin/lib/client.js', import.meta.url), 'utf8')
const start = source.indexOf('function TavernStatusPanel(props)')
const end = source.indexOf('function TavernCardAppDock(props)', start)

test('status panel stop button targets current operation and disappears when idle', async () => {
  const calls = [], refresh = []
  const view = { card: { name: '测试卡' }, mode: 'story', activity: { busy: true, operationId: 'op-1' }, settleStatus: 'running' }
  const Panel = vm.runInNewContext('(' + source.slice(start, end).trim() + ')', {
    React: { useState: value => [value, () => {}], useRef: () => ({}), useEffect() {}, createElement: (tag, props, ...children) => ({ tag, props, children }) },
    usePersistentError: () => ['', () => {}], useLiveTavernView: () => ({ view }), isMissingTavernCardError: () => false,
    latestTavernAssistantMessageId() {}, TavernCardAppDock() {}, TavernLedger() {},
    rpc: async (...args) => calls.push(args), liveTavernView: { invalidate: id => refresh.push(id) }, tavernErrorHub: { report: (...args) => { throw Error(String(args)); } }
  })
  const props = { sessionId: 'game', useSession: () => false, useChat: () => null }
  function buttons(node) { return !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flatMap(buttons)].filter(n => n.tag === 'button' && n.children.includes('停止后台')) }
  const button = buttons(Panel(props))[0]
  assert.ok(button)
  await button.props.onClick()
  assert.equal(calls[0][0], 'stopBackground')
  assert.equal(calls[0][1].operationId, 'op-1')
  assert.equal(calls[0][2], 'game')
  assert.deepEqual(refresh, ['game'])
  view.activity.busy = false
  assert.equal(buttons(Panel(props)).length, 0)
})
