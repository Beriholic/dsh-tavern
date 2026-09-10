import assert from 'node:assert/strict'
import test from 'node:test'
import { mutateScriptPrompts, scriptPromptScanText, scriptPromptFrameInputs, consumeScriptPrompts } from '../tavern-plugin/lib/domain/tavern-script-prompts.js'
import { prepareWorldBookRecall } from '../tavern-plugin/lib/domain/worldbook-recall.js'
import { foregroundFrameInputs } from '../tavern-plugin/lib/domain/turn-orchestration.js'
import { createForegroundFrameBuilder } from '../tavern-plugin/lib/domain/agent-input-frame.js'
import { createForegroundFrameSessionAdapter } from '../tavern-plugin/lib/domain/foreground-frame-session-adapter.js'
import { createStoryTimeline } from '../tavern-plugin/lib/domain/story-timeline.js'
import { createHelperWorldbookHost } from './fixtures/helper-worldbook-host.mjs'
import { helperHostHarness } from './fixtures/helper-host-harness.mjs'

const prompt = (id, content, position = 'in_chat') => ({ id, content, position, role: 'system', depth: 0, should_scan: true })

test('脚本扫描触发原生世界书，正文进入实际 Frame，不修改世界书和旧消息', () => {
  const chat = { messages: [], tavernScriptPrompts: [] }
  mutateScriptPrompts(chat, { kind: 'inject', prompts: [prompt('location', '王都', 'none'), prompt('event', '请继续当前事件')] })
  const worldBook = { view: { entries: [{ ref: 'city', enabled: true, primaryKeys: ['王都'], content: '王都有三座城门' }] } }
  const original = structuredClone(worldBook)
  const recalled = prepareWorldBookRecall({ chat, worldBook, latestBody: scriptPromptScanText(chat), turn: 1 })
  assert.equal(recalled.context, '王都有三座城门')
  const frame = createForegroundFrameBuilder().build({ chatId: 'a', branchId: 'b', operationId: 'op', basedOnRevision: 0, turn: 1,
    inputs: foregroundFrameInputs({ sections: [{ kind: 'world-book', text: recalled.context }] }, '继续', '继续', null, chat) })
  const prior = [{ id: 'old', role: 'assistant', content: [{ type: 'text', text: '旧剧情' }] }]
  const output = createForegroundFrameSessionAdapter({ id: () => 'new' }).append({ messages: prior, frame, step: 1 })
  assert.match(output.messages.at(-1).content[0].text, /请继续当前事件/)
  assert.match(output.messages.at(-1).content[0].text, /王都有三座城门/)
  assert.equal(frame.contributions.filter(x => x.source.stage === 'tavern-script-prompt').length, 1)
  assert.deepEqual(worldBook, original)
  assert.equal(prior.length, 1)
  mutateScriptPrompts(chat, { kind: 'remove', ids: ['event'] })
  assert.deepEqual(scriptPromptFrameInputs(chat), [])
})

test('同 ID 替换、删除、一次性与无效批次原子验证', () => {
  const chat = {}
  mutateScriptPrompts(chat, { kind: 'inject', prompts: [prompt('__proto__', '旧')] })
  mutateScriptPrompts(chat, { kind: 'inject', prompts: [prompt('__proto__', '新')], once: true })
  assert.equal(chat.tavernScriptPrompts.length, 1)
  assert.equal(scriptPromptFrameInputs(chat)[0].text, '新')
  assert.throws(() => mutateScriptPrompts(chat, { kind: 'inject', prompts: [prompt('ok', '有效'), { ...prompt('bad', '错误'), depth: -1 }] }))
  assert.equal(chat.tavernScriptPrompts.length, 1)
  consumeScriptPrompts(chat)
  assert.deepEqual(chat.tavernScriptPrompts, [])
})

test('原生回退恢复提示词，不带回未来事件', () => {
  const timeline = createStoryTimeline()
  let chat = { id: 'a', messages: [] }
  mutateScriptPrompts(chat, { kind: 'inject', prompts: [prompt('event', '旧事件')] })
  const beforeChat = structuredClone(chat)
  const begun = timeline.apply({ chat, intent: { kind: 'body.begin', turn: 1, userText: '继续' } })
  chat = timeline.complete({ chat: begun.chat, operationId: begun.value.operationId, basedOn: begun.value.basedOn, outcome: { status: 'success' },
    apply(draft) { draft.messages.push({ role: 'assistant', text: '新剧情' }); mutateScriptPrompts(draft, { kind: 'inject', prompts: [prompt('event', '新事件')] }) } }).chat
  const rolled = timeline.apply({ chat, intent: { kind: 'turn.rollback', beforeChat } }).chat
  assert.equal(rolled.tavernScriptPrompts[0].content, '旧事件')
})

test('宿主拒绝过期写入，提示词与会话隔离', async t => {
  const host = await createHelperWorldbookHost()
  t.after(host.cleanup)
  host.chat.tavernHelperLifecycleRevision = 2
  assert.equal((await host.adapter.updatePrompts('audit', { kind: 'inject', prompts: [prompt('x', '内容')] }, 1)).stale, true)
  assert.equal(host.chat.tavernScriptPrompts, undefined)
  await host.adapter.updatePrompts('audit', { kind: 'inject', prompts: [prompt('x', '内容')] }, 2)
  assert.equal(host.chat.tavernScriptPrompts[0].content, '内容')
})

test('同步 injectPrompts 返回 uninject，事件等待保存成功；失败不能假装结算完成', async () => {
  const run = helperHostHarness()
  let handle
  run.window.eventOn('MESSAGE_RECEIVED', () => { handle = run.window.injectPrompts([prompt('x', '内容')]) })
  let completed = false
  const event = run.window.eventEmit('MESSAGE_RECEIVED').then(() => { completed = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(completed, false)
  assert.equal(typeof handle.uninject, 'function')
  assert.equal(run.calls()[0].method, 'updateTavernHelperPrompts')
  run.reply(run.calls()[0], { updated: true })
  await event
  handle.uninject()
  assert.equal(run.calls()[1].args.operation.kind, 'remove')
  run.reply(run.calls()[1], { updated: true })
  assert.equal(run.window.TavernHelper.injectPrompts, run.window.injectPrompts)
})

test('并发宿主事件串行完成，提示词写入不会携带已经结束的事件 ID', async () => {
  const run = helperHostHarness({ lifecycleRevision: 3 })
  run.window.eventOn('ONE', () => run.window.injectPrompts([prompt('one', '一')]))
  run.window.eventOn('TWO', () => run.window.injectPrompts([prompt('two', '二')]))
  run.receive({ type: 'dsh-tavern-helper-event', name: 'ONE', args: [], eventId: 'event-one' })
  run.receive({ type: 'dsh-tavern-helper-event', name: 'TWO', args: [], eventId: 'event-two' })
  const tick = () => new Promise(resolve => setImmediate(resolve))
  await tick()
  assert.equal(run.calls().length, 1)
  assert.equal(run.calls()[0].eventId, 'event-one')
  assert.equal(run.calls()[0].lifecycleRevision, 3)
  run.reply(run.calls()[0], { updated: true })
  await tick()
  assert.equal(run.calls()[1].eventId, 'event-two')
  run.reply(run.calls()[1], { updated: true })
  await tick()
  assert.deepEqual(run.sent.filter(x => x.type === 'dsh-tavern-helper-event-complete').map(x => x.eventId), ['event-one', 'event-two'])
})

test('提示词保存失败会让调用事件失败，不返回成功结算', async () => {
  const run = helperHostHarness()
  run.window.eventOn('FAIL', () => run.window.injectPrompts([prompt('x', '内容')]))
  const event = run.window.eventEmit('FAIL')
  const rejected = assert.rejects(event, /保存失败/)
  await new Promise(resolve => setImmediate(resolve))
  run.reply(run.calls()[0], '保存失败', false)
  await rejected
  run.window.eventOn('NEXT', () => {})
  await run.window.eventEmit('NEXT')
})

test('scan-only prompts may omit depth without aborting MVU initialization callbacks', () => {
  const chat = {}
  mutateScriptPrompts(chat, { kind: 'inject', prompts: [{
    id: 'Plot_Title_Trigger', content: '当前章节：序章',
    position: 'none', role: 'system', should_scan: true
  }] })
  assert.equal(scriptPromptScanText(chat), '当前章节：序章')
  assert.deepEqual(scriptPromptFrameInputs(chat), [])
  assert.equal(chat.tavernScriptPrompts[0].depth, 0)
})
