import assert from 'node:assert/strict'
import test from 'node:test'
import { cardAgentContext } from '../tavern-plugin/lib/domain/card-agent-context.js'
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

test('卡片 system 使用最新基本信息，保留模板，不带入其他资源和游玩指令', async () => {
  let card = { name: '甲', description: '{{char}} 与 {{user}}', first_mes: '<%= value %>', system_prompt: '扮演角色', character_book: { entries: ['大世界书'] } }
  const strategy = createNativePlayOrchestrationStrategy({
    modeFor: async () => 'card', visibleTools: async () => [],
    modePrompt: () => '工作台规则', workspaceContext: () => '',
    cardContext: async () => cardAgentContext(card), controlledToolNames: new Set()
  })
  const assemble = () => strategy.assembleSystemPrompt({ sections: [], tools: [] }, { sessionId: 'card' })
  const first = await assemble()
  assert.deepEqual(first.sections.map(s => s.name), ['tavern:mode-persona', 'tavern:character-card'])
  assert.match(first.sections[1].text, /\{\{char\}\} 与 \{\{user\}\}/)
  assert.match(first.sections[1].text, /<%= value %>/)
  assert.doesNotMatch(first.sections[1].text, /大世界书|扮演角色/)
  card = { name: '乙', description: '修改后的设定' }
  assert.match((await assemble()).sections[1].text, /修改后的设定/)
  card = null
  assert.deepEqual((await assemble()).sections.map(s => s.name), ['tavern:mode-persona'])
})
