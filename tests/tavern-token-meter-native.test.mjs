import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { installTavernTokenMeter } from '../tavern-plugin/lib/domain/tavern-token-meter.js'
import { ensureSessionSeedTrajectory } from '../tavern-plugin/lib/domain/session-seed-trajectory.js'

const native = { skip: !process.env.DSH_BOOT_MODULE }
async function harness(t) {
  const url = pathToFileURL(process.env.DSH_BOOT_MODULE)
  const { boot } = await import(url)
  const { Session } = await import(new URL('../../dsh-session/lib/index.js', url))
  const root = await mkdtemp(join(tmpdir(), 'tavern-meter-'))
  const config = join(root, 'host.yml')
  await writeFile(config, ['dsh-session', 'dsh-session-projection', 'dsh-token-meter'].map(n => '- name: ' + new URL('../../' + n + '/lib/index.js', url).href).join('\n'))
  const ctx = await boot('tavern-meter-test', config)
  t.after(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  return { ctx, Session }
}
const source = { kind: 'model', provider: 'fixture', model: 'text' }
function completed(session) {
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  const e = session.append('assistant/message', { turn: 1, step: 1, message: { id: 'body', role: 'assistant', content: [{ type: 'text', text: 'Story '.repeat(1000) }], source } }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  return e
}

test('原生 Token Meter 可统计既有无 step 的 Tavern 种子消息，且不改写历史', native, async t => {
  const { ctx, Session } = await harness(t)
  const session = Session.create('seed', [], { ...Session.create('seed').header, agentPreset: 'tavern' })
  await ensureSessionSeedTrajectory(session)
  const before = JSON.stringify(session.snapshotEvents())
  assert.throws(() => ctx.tokenMeter.measure(session), /assistant\/message.*no matching step\/start/)
  const dispose = installTavernTokenMeter(ctx.tokenMeter)
  t.after(dispose)
  const measured = ctx.tokenMeter.measure(session)
  assert.ok(measured.totalTokens > 0)
  assert.equal(measured.nodes.length, 3)
  assert.equal(JSON.stringify(session.snapshotEvents()), before)
})

test('原生 Token Meter 在闭合回合后统计后台回退和正文替换', native, async t => {
  const { ctx, Session } = await harness(t)
  const session = Session.create('background', [], { ...Session.create('background').header, agentPreset: 'tavern-background' })
  completed(session)
  const before = ctx.tokenMeter.measure(session).totalTokens
  const seq = session.surface.nodes[0]
  session.append('assistant/message', { turn: 1, step: 1, message: { id: 'replacement', role: 'assistant', content: [], source } }, { surfaceOp: { op: 'replace', start: seq, end: seq }, sourceEventSeqs: [seq] })
  assert.throws(() => ctx.tokenMeter.measure(session), /assistant\/message.*no matching step\/start/)
  t.after(installTavernTokenMeter(ctx.tokenMeter))
  assert.ok(ctx.tokenMeter.measure(session).totalTokens < before)
})

test('适配不放过真实模型回复缺步骤或其他预设历史', native, async t => {
  const { ctx, Session } = await harness(t)
  t.after(installTavernTokenMeter(ctx.tokenMeter))
  const session = Session.create('bad-model')
  session.append('assistant/message', { turn: 1, step: 1, message: { id: 'real', role: 'assistant', content: [], source } }, { surfaceOp: 'append' })
  assert.throws(() => ctx.tokenMeter.measure(session), /no matching step\/start/)
  const other = Session.create('other')
  completed(other)
  const seq = other.surface.nodes[0]
  other.append('assistant/message', { turn: 1, step: 1, message: { id: 'unknown-replace', role: 'assistant', content: [], source } }, { surfaceOp: { op: 'replace', start: seq, end: seq }, sourceEventSeqs: [seq] })
  assert.throws(() => ctx.tokenMeter.measure(other), /no matching step\/start/)
})

test('原生手动压缩可处理种子和后台替换，压缩后仍能计量并保留原事件', native, async t => {
  const { ctx, Session } = await harness(t)
  const url = pathToFileURL(process.env.DSH_BOOT_MODULE)
  const { BasicCompactionEngine } = await import(new URL('../../dsh-compaction-basic/lib/index.js', url))
  let calls = 0
  class FixtureCompaction extends BasicCompactionEngine {
    async summarize() { calls++; return { summary: [{ type: 'text', text: '简短摘要。' }], provider: 'fixture', model: 'summary', maxTokens: 128 } }
  }
  const engine = new FixtureCompaction(ctx, { auto: false })
  t.after(installTavernTokenMeter(ctx.tokenMeter))
  for (const preset of ['tavern', 'tavern-background']) {
    const session = ctx.sessions.create(preset, { meta: { agentPreset: preset } })
    if (preset === 'tavern') await ensureSessionSeedTrajectory(session)
    completed(session)
    if (preset === 'tavern-background') {
      const seq = session.surface.nodes[0]
      session.append('assistant/message', { turn: 1, step: 1, message: { id: 'edited-body', role: 'assistant', content: [{ type: 'text', text: 'Updated story '.repeat(1000) }], source } }, { surfaceOp: { op: 'replace', start: seq, end: seq }, sourceEventSeqs: [seq] })
    }
    session.append('user/message', { id: 'latest', role: 'user', content: [{ type: 'text', text: '继续' }], source: { kind: 'human' } }, { surfaceOp: 'append' })
    const before = ctx.tokenMeter.measure(session).totalTokens
    const original = session.snapshotEvents()
    const signal = new AbortController().signal
    const result = await engine.compactNow({ session, options: {}, runMaintenance: fn => fn(signal) }, signal).catch(e => { throw e.cause || e })
    assert.ok(result)
    assert.ok(ctx.tokenMeter.measure(session).totalTokens < before)
    assert.deepEqual(session.snapshotEvents().slice(0, original.length), original)
    assert.ok(session.snapshotEvents().some(e => e.type === 'compaction/end'))
  }
  assert.equal(calls, 2)
})
