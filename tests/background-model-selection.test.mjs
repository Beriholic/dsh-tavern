import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeBackgroundModel,
  normalizeReasoningEffort,
  resolveChatBackgroundModel,
  resolveMvuSelection,
  snapshotBackgroundModel
} from '../tavern-plugin/lib/domain/background-model-selection.js'

test('后台模型设置只接受完整 provider/model', () => {
  assert.deepEqual(normalizeBackgroundModel({ provider: ' vertex ', model: ' gemini ' }), { provider: 'vertex', model: 'gemini' })
  assert.equal(normalizeBackgroundModel({ provider: 'vertex' }), null)
  assert.equal(normalizeBackgroundModel(null), null)
})

test('仅手动配置生成固定快照，默认不冻结前台模型', () => {
  assert.deepEqual(snapshotBackgroundModel({ provider: 'fixed', model: 'worker' }, { provider: 'front', model: 'chat' }), { provider: 'fixed', model: 'worker' })
  assert.equal(snapshotBackgroundModel(null, { provider: 'front', model: 'chat', reasoningEffort: 'high' }), null)
  const chat = { backgroundModelSelection: snapshotBackgroundModel(null) }
  for (const model of ['first', 'changed']) assert.deepEqual(resolveChatBackgroundModel(chat, { provider: 'front', model, reasoningEffort: 'high' }), { provider: 'front', model, reasoningEffort: 'high' })
})

test('运行时优先使用游戏快照，旧游戏才回退当前前台模型', () => {
  assert.deepEqual(resolveChatBackgroundModel({ backgroundModelSelection: { provider: 'fixed', model: 'worker', reasoningEffort: 'high' } }, { provider: 'front', model: 'chat' }), { provider: 'fixed', model: 'worker', reasoningEffort: 'high' })
  assert.deepEqual(resolveChatBackgroundModel({}, { provider: 'front', model: 'chat' }), { provider: 'front', model: 'chat' })
})

test('推理强度只接受 off/low/medium/high，其余返回 null', () => {
  assert.equal(normalizeReasoningEffort('off'), 'off')
  assert.equal(normalizeReasoningEffort('  LOW  '), 'low')
  assert.equal(normalizeReasoningEffort('Medium'), 'medium')
  assert.equal(normalizeReasoningEffort('high'), 'high')
  assert.equal(normalizeReasoningEffort('inherit'), null)
  assert.equal(normalizeReasoningEffort(''), null)
  assert.equal(normalizeReasoningEffort(null), null)
  assert.equal(normalizeReasoningEffort(undefined), null)
  assert.equal(normalizeReasoningEffort('extra-high'), null)
})

test('MVU 结算模型选择优先使用独立思考强度，未配置时跟随后台模型', () => {
  const base = { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'high' }
  assert.deepEqual(resolveMvuSelection(base, 'off'), { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'off' })
  assert.deepEqual(resolveMvuSelection(base, 'low'), { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'low' })
  assert.deepEqual(resolveMvuSelection(base, null), base)
  assert.deepEqual(resolveMvuSelection(base, 'inherit'), base)

  const noEffort = { provider: 'deepseek-official', model: 'deepseek-v4-flash' }
  assert.deepEqual(resolveMvuSelection(noEffort, 'off'), { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'off' })
  assert.deepEqual(resolveMvuSelection(noEffort, null), noEffort)
  assert.equal(resolveMvuSelection(null, 'off'), null)
})
