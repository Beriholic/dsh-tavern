import assert from 'node:assert/strict'
import test from 'node:test'

import { projectPersistentStatusView } from '../tavern-plugin/lib/domain/persistent-status-view.js'

function projection(turn, parts) {
  return { version: 2, turn, mode: 'html', text: '', parts, warnings: [] }
}

test('把最近一次实际读取 MVU 的独立 View 提升为对话级状态视图', () => {
  const statusView = { kind: 'html', content: '<body><script>loadStatus()</script></body>' }
  const messages = [
    { role: 'assistant', turn: 1, variables: [{ hp: 10 }], swipeId: 0, displayRuntime: { frames: [{ partIndex: 1, mvuViewUsed: true }] } },
    { role: 'user', turn: 2, text: '继续' },
    { role: 'assistant', turn: 2, variables: [{ hp: 9 }], swipeId: 0 }
  ]
  const projections = [
    projection(1, [{ kind: 'html', content: '<p>第一轮正文</p>' }, statusView]),
    projection(2, [{ kind: 'html', content: '<p>第二轮正文</p>' }])
  ]

  const result = projectPersistentStatusView(messages, projections)

  assert.deepEqual(result.projections[0].parts, [{ kind: 'html', content: '<p>第一轮正文</p>' }])
  assert.deepEqual(result.projections[1].parts, [{ kind: 'html', content: '<p>第二轮正文</p>' }])
  assert.deepEqual(result.statusView, {
    version: 1,
    viewId: 'primary',
    sourceTurn: 1,
    sourcePartIndex: 1,
    targetTurn: 2,
    templateRevision: 'e18e3235334b4999',
    content: statusView.content
  })
})

test('同一状态模板在历史各轮中都从消息投影移除', () => {
  const content = '<script>loadStatus()</script>'
  const messages = [
    { role: 'assistant', turn: 1, variables: [{}], swipeId: 0, displayRuntime: { frames: [{ partIndex: 1, mvuViewUsed: true }] } },
    { role: 'assistant', turn: 2, variables: [{}], swipeId: 0, displayRuntime: { frames: [{ partIndex: 1, mvuViewUsed: true }] } }
  ]
  const projections = [
    projection(1, [{ kind: 'html', content: '<p>一</p>' }, { kind: 'html', content }]),
    projection(2, [{ kind: 'html', content: '<p>二</p>' }, { kind: 'html', content }])
  ]

  const result = projectPersistentStatusView(messages, projections)

  assert.deepEqual(result.projections.map(item => item.parts), [
    [{ kind: 'html', content: '<p>一</p>' }],
    [{ kind: 'html', content: '<p>二</p>' }]
  ])
  assert.equal(result.statusView.sourceTurn, 2)
  assert.equal(result.statusView.targetTurn, 2)
})

test('不把普通正文 iframe 或没有 MVU 状态的对话误判为保活 View', () => {
  const messages = [
    { role: 'assistant', turn: 1, displayRuntime: { frames: [{ partIndex: 0, mvuViewUsed: true }] } },
    { role: 'assistant', turn: 2 }
  ]
  const projections = [
    projection(1, [{ kind: 'html', content: '<p>只是正文</p>' }]),
    projection(2, [{ kind: 'html', content: '<p>下一轮</p>' }])
  ]

  assert.deepEqual(projectPersistentStatusView(messages, projections), { projections, statusView: null })
})

test('按前端实际渲染下标识别状态 View，忽略空白投影片段', () => {
  const content = '<script>loadStatus()</script>'
  const messages = [
    { role: 'assistant', turn: 1, displayRuntime: { frames: [{ partIndex: 1, mvuViewUsed: true }] } }
  ]
  const projections = [projection(1, [
    { kind: 'markdown', text: '正文' },
    { kind: 'html', content: '   ' },
    { kind: 'html', content }
  ])]

  const result = projectPersistentStatusView(messages, projections)

  assert.equal(result.statusView.content, content)
  assert.deepEqual(result.projections[0].parts, [
    { kind: 'markdown', text: '正文' },
    { kind: 'html', content: '   ' }
  ])
})

test('声明状态栏的卡保留开局页，正文推进后使用声明模板而非 MVU 开局页', () => {
  const opening = '<script>loadCustomStart()</script>'
  const status = '<script>loadRealStatus()</script>'
  const regexScripts = [{ enabled: true, placement: [2], markdownOnly: true,
    findRegex: '<StatusPlaceHolderImpl/>', replaceString: '```html\n' + status + '\n```', maxDepth: 2 }]
  const messages = [{ role: 'assistant', turn: 1, displayRuntime: { frames: [{ partIndex: 0, mvuViewUsed: true }] } }]
  const projections = [projection(1, [{ kind: 'html', content: opening }])]
  const initial = projectPersistentStatusView(messages, projections, { regexScripts })
  assert.equal(initial.statusView, null)
  assert.deepEqual(initial.projections, projections)
  const advanced = projectPersistentStatusView([...messages, { role: 'assistant', turn: 6, text: '抵达庄园' }], projections, { regexScripts })
  assert.match(advanced.statusView.content, /loadRealStatus/)
  assert.equal(advanced.statusView.targetTurn, 6)
  assert.deepEqual(advanced.projections, projections)
  assert.equal(projectPersistentStatusView([...messages, { role: 'assistant', turn: 6 }], [], { regexScripts }).statusView.targetTurn, 6)
})

test('声明模板在开场已出现时立即提升，禁用声明不加载远程页面', () => {
  const content = '<script>loadRealStatus()</script>'
  const rule = { enabled: true, placement: [2], markdownOnly: true,
    findRegex: '<StatusPlaceHolderImpl/>', replaceString: content }
  const messages = [{ role: 'assistant', turn: 1 }]
  const projections = [projection(1, [{ kind: 'html', content }])]
  const result = projectPersistentStatusView(messages, projections, { regexScripts: [rule] })
  assert.equal(result.statusView.content, content)
  assert.deepEqual(result.projections[0].parts, [])
  for (const disabled of [{ enabled: false }, { disabled: true }]) {
    assert.equal(projectPersistentStatusView([...messages, { role: 'assistant', turn: 2 }], [],
      { regexScripts: [{ ...rule, ...disabled }] }).statusView, null)
  }
})
