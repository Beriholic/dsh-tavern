import assert from 'node:assert/strict'
import test from 'node:test'
import { createNativePlayOrchestrationStrategy } from '../tavern-plugin/lib/domain/foreground-orchestration-strategies.js'
import { ensureSessionSeedTrajectory, sessionSeedTrajectoryMessages } from '../tavern-plugin/lib/domain/session-seed-trajectory.js'
import { Session } from './fixtures/dsh-session-host.mjs'

test('卡片种子使用原生轨迹，部分写入恢复和重载不会重复', async () => {
  let session = Session.create('card-seed')
  const first = sessionSeedTrajectoryMessages(session.id, 'card')[0]
  session.append(first.type, first.data, first.intent)
  await ensureSessionSeedTrajectory(session, 'card')
  session = Session.create(session.id, session.events, session.header)
  await ensureSessionSeedTrajectory(session, 'card')
  const messages = session.deriveMessages()
  assert.deepEqual(messages.map(m => m.role), ['user', 'assistant', 'user'])
  assert.match(messages[0].content[0].text, /待编辑素材/)
  assert.doesNotMatch(messages.map(m => m.content[0].text).join('\n'), /只输出小说正文|从人物卡给定的开场继续/)
})

test('卡片 system 只读取自定义文本，空白清空且不恢复旧注入', async () => {
  let text = ''
  const strategy = createNativePlayOrchestrationStrategy({
    modeFor: async () => 'card', visibleTools: async () => [],
    cardSystemPrompt: () => text,
    modePrompt: () => { throw Error('旧规则不应读取') },
    cardContext: () => { throw Error('人物卡不应读取') },
    workspaceContext: () => '工作区说明',
    controlledToolNames: new Set()
  })
  const assemble = () => strategy.assembleSystemPrompt({ sections: [{ name: 'old', text: 'inherited' }], tools: [] }, { sessionId: 'card' })
  assert.deepEqual((await assemble()).sections, [{ name: 'tavern:resource-workspace', text: '工作区说明' }])
  text = '自定义指令'
  assert.deepEqual((await assemble()).sections, [{ name: 'tavern:card-system', text }, { name: 'tavern:resource-workspace', text: '工作区说明' }])
  text = '  \n '
  assert.deepEqual((await assemble()).sections, [{ name: 'tavern:resource-workspace', text: '工作区说明' }])
})
