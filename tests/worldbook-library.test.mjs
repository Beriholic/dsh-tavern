import assert from 'node:assert/strict'
import test from 'node:test'

import { createWorldBookLibrary } from '../tavern-plugin/lib/domain/worldbook-library.js'

function clone(value) { return JSON.parse(JSON.stringify(value)) }

function harness() {
  const cards = new Map([
    ['cards/命运.json', {
      name: '命运',
      character_book: {
        name: '命运世界书',
        entries: [{ id: 0, comment: '钟楼', content: '钟楼只在午夜开放。', enabled: true, keys: ['钟楼'] }]
      }
    }],
    ['cards/空白.json', { name: '空白' }]
  ])
  const files = new Map([
    ['worldbooks/王都.json', JSON.stringify({
      name: '王都',
      entries: { 7: { uid: 7, comment: '城门', content: '城门日落关闭。', disable: false, key: ['城门'] } }
    })]
  ])
  const bindings = new Map()
  const globalBooks = new Set()
  const removed = []
  function normalize(path, kind) {
    const value = String(path || '')
    if (!value.startsWith(kind === 'card' ? 'cards/' : 'worldbooks/')) throw new Error('路径类型错误: ' + value)
    return value
  }
  const library = createWorldBookLibrary({
    normalizePath: normalize,
    resources: {
      async list() { return Array.from(files.keys()) },
      async readText(path) { return files.get(path) },
      async import(prepared, working) {
        const path = 'worldbooks/' + prepared.name
        files.set(path, JSON.stringify(working))
        return path
      },
      async write(path, text) { files.set(path, text) },
      async bindingForCard(cardPath) {
        if (!bindings.has(cardPath)) return { kind: 'default' }
        const value = bindings.get(cardPath)
        if (value === null) return { kind: 'none' }
        if (value && value.kind === 'embedded') return { kind: 'embedded', cardPath: value.cardPath, available: cards.has(value.cardPath) }
        const path = value && value.kind === 'standalone' ? value.path : value
        return { kind: 'standalone', path, available: files.has(path) }
      },
      async bind(cardPath, locator) {
        if (locator === null) bindings.delete(cardPath)
        else bindings.set(cardPath, locator)
      },
      async unbind(cardPath) { bindings.set(cardPath, null) },
      async listGlobal() { return Array.from(globalBooks) },
      async setGlobal(path, enabled) {
        if (enabled) globalBooks.add(path)
        else globalBooks.delete(path)
        return Array.from(globalBooks)
      }
    },
    cards: {
      async listPaths() { return Array.from(cards.keys()) },
      async read(path) { return cards.has(path) ? clone(cards.get(path)) : undefined },
      async update(path, patch) { cards.set(path, Object.assign({}, cards.get(path), clone(patch))) }
    },
    async removeStandalone(path) { files.delete(path); globalBooks.delete(path); removed.push(path); return { removed: path } }
  })
  return { library, cards, files, bindings, globalBooks, removed }
}

test('World Book Library 用同一 interface 投影独立与人物卡内嵌世界书', async () => {
  const run = harness()
  const catalog = await run.library.catalog()

  assert.deepEqual(catalog.standalone.map(function (book) { return book.name }), ['王都'])
  assert.deepEqual(catalog.embedded.map(function (book) { return book.name }), ['命运世界书'])
  assert.equal((await run.library.get({ kind: 'standalone', path: 'worldbooks/王都.json' })).view.entries[0].ref, 'entry:7')
  assert.equal((await run.library.get({ kind: 'card', cardPath: 'cards/命运.json' })).view.entries[0].ref, 'entry:0')
})

test('World Book Library 目录并行读取每张人物卡一次', async () => {
  const documents = new Map([
    ['cards/甲.json', { name: '甲', character_book: { name: '甲世界书', entries: [] } }],
    ['cards/乙.json', { name: '乙', character_book: { name: '乙世界书', entries: [] } }],
    ['cards/丙.json', { name: '丙', character_book: { name: '丙世界书', entries: [] } }]
  ])
  const reads = new Map()
  let activeReads = 0
  let maxActiveReads = 0
  const library = createWorldBookLibrary({
    normalizePath(path) { return path },
    resources: {
      async list() { return [] },
      async bindingForCard() { return { kind: 'default' } }
    },
    cards: {
      async listPaths() { return Array.from(documents.keys()) },
      async read(path) {
        reads.set(path, (reads.get(path) || 0) + 1)
        activeReads += 1
        maxActiveReads = Math.max(maxActiveReads, activeReads)
        await new Promise(function (resolve) { setTimeout(resolve, 5) })
        activeReads -= 1
        return clone(documents.get(path))
      }
    },
    async removeStandalone() {}
  })

  const catalog = await library.catalog()

  assert.deepEqual(catalog.embedded.map(function (book) { return book.name }), ['甲世界书', '乙世界书', '丙世界书'])
  assert.deepEqual(Array.from(reads.values()), [1, 1, 1])
  assert.equal(maxActiveReads, 3)
})

test('单本世界书或人物卡损坏时目录保留正常项目并返回诊断', async () => {
  const library = createWorldBookLibrary({
    normalizePath(path) { return path },
    resources: {
      async list() { return ['worldbooks/正常.json', 'worldbooks/损坏.json'] },
      async readText(path) { return path.endsWith('正常.json') ? JSON.stringify({ name: '正常', entries: {} }) : 'not-json' },
      async bindingForCard() { return { kind: 'none' } }
    },
    cards: {
      async listPaths() { return ['cards/正常.json', 'cards/损坏.json'] },
      async read(path) {
        if (path.endsWith('损坏.json')) throw new Error('人物卡 JSON 损坏')
        return { name: '正常人物', character_book: { name: '正常内置书', entries: [] } }
      }
    },
    async removeStandalone() {}
  })

  const catalog = await library.catalog()

  assert.deepEqual(catalog.standalone.map(function (book) { return book.name }), ['正常'])
  assert.deepEqual(catalog.embedded.map(function (book) { return book.name }), ['正常内置书'])
  assert.deepEqual(catalog.diagnostics.map(function (item) { return item.path }), ['worldbooks/损坏.json', 'cards/损坏.json'])
})

test('World Book Library 隐藏默认内嵌、解绑和独立绑定的存储差异', async () => {
  const run = harness()

  assert.equal((await run.library.binding('cards/命运.json')).kind, 'embedded')
  assert.equal((await run.library.bound('cards/命运.json')).view.displayName, '命运世界书')
  assert.equal((await run.library.unbind('cards/命运.json')).kind, 'none')
  assert.equal(await run.library.bound('cards/命运.json'), null)
  const rebound = await run.library.bind('cards/命运.json', { kind: 'standalone', path: 'worldbooks/王都.json' })
  assert.equal(rebound.kind, 'standalone')
  assert.equal((await run.library.bound('cards/命运.json')).view.displayName, '王都')
})

test('World Book Library 提供世界书视角的一对一人物卡绑定关系', async () => {
  const run = harness()
  const source = { kind: 'standalone', path: 'worldbooks/王都.json' }

  const initial = await run.library.associations(source)
  assert.equal(initial.conflict, false)
  assert.deepEqual(initial.boundCards, [])
  assert.deepEqual(initial.cards.map(function (card) { return [card.name, card.binding.kind] }), [
    ['命运', 'embedded'],
    ['空白', 'none']
  ])

  await run.library.bind('cards/命运.json', source)
  const bound = await run.library.associations(source)
  assert.deepEqual(bound.boundCards.map(function (card) { return card.name }), ['命运'])
  assert.equal(bound.cards.find(function (card) { return card.name === '命运' }).bound, true)

  await assert.rejects(
    run.library.bind('cards/空白.json', source),
    /该世界书已绑定人物卡：命运/
  )
})

test('人物卡内置世界书解绑原主人后可一对一绑定给其他人物卡', async () => {
  const run = harness()
  const source = { kind: 'card', cardPath: 'cards/命运.json' }

  await run.library.unbind('cards/命运.json')
  const available = await run.library.associations(source)
  assert.deepEqual(available.cards.map(function (card) { return card.name }), ['命运', '空白'])
  assert.deepEqual(available.boundCards, [])

  const binding = await run.library.bind('cards/空白.json', source)
  assert.equal(binding.kind, 'embedded')
  assert.equal(binding.source.cardPath, 'cards/命运.json')
  assert.equal((await run.library.bound('cards/空白.json', run.cards.get('cards/空白.json'))).view.displayName, '命运世界书')
  await assert.rejects(run.library.bind('cards/命运.json', source), /该世界书已绑定人物卡：空白/)
})

test('历史数据中同一本世界书绑定多张人物卡时只报告冲突，不自动拆除', async () => {
  const run = harness()
  run.bindings.set('cards/命运.json', 'worldbooks/王都.json')
  run.bindings.set('cards/空白.json', 'worldbooks/王都.json')

  const result = await run.library.associations({ kind: 'standalone', path: 'worldbooks/王都.json' })

  assert.equal(result.conflict, true)
  assert.deepEqual(result.boundCards.map(function (card) { return card.name }), ['命运', '空白'])
  assert.equal(run.bindings.size, 2)
})

test('World Book Library 通过来源 adapter 原子编辑、导入、导出和删除', async () => {
  const run = harness()

  await run.library.update({ kind: 'card', cardPath: 'cards/命运.json' }, {
    operations: { op: 'update', ref: 'entry:0', patch: { content: '钟楼永不开放。' } }
  })
  assert.equal(run.cards.get('cards/命运.json').character_book.entries[0].content, '钟楼永不开放。')

  await run.library.update({ kind: 'standalone', path: 'worldbooks/王都.json' }, {
    operations: { op: 'update', ref: 'entry:7', patch: { content: '城门永不关闭。' } }
  })
  assert.equal(JSON.parse(run.files.get('worldbooks/王都.json')).entries['7'].content, '城门永不关闭。')

  const imported = await run.library.import({
    name: '海港.json',
    text: JSON.stringify({ name: '海港', entries: { 1: { uid: 1, comment: '码头', content: '潮汐决定船期。' } } })
  })
  assert.equal(imported.path, 'worldbooks/海港.json')
  assert.equal((await run.library.export({ kind: 'standalone', path: imported.path })).name, '海港')
  assert.deepEqual(await run.library.remove(imported.path), { removed: 'worldbooks/海港.json' })
  assert.deepEqual(run.removed, ['worldbooks/海港.json'])
})

test('人物卡内嵌世界书导出为 SillyTavern 可见的独立世界书', async () => {
  const run = harness()

  const exported = await run.library.export({ kind: 'card', cardPath: 'cards/命运.json' })

  assert.equal(Array.isArray(exported.document.entries), false)
  assert.equal(exported.document.entries['0'].content, '钟楼只在午夜开放。')
  assert.deepEqual(exported.document.entries['0'].key, ['钟楼'])
  assert.equal(exported.document.entries['0'].disable, false)
})

test('人物卡导出读取绑定世界书并转换为 character_book', async () => {
  const run = harness()
  await run.library.bind('cards/空白.json', { kind: 'standalone', path: 'worldbooks/王都.json' })

  const book = await run.library.characterBookForCard('cards/空白.json')

  assert.equal(Array.isArray(book.entries), true)
  assert.equal(book.entries[0].content, '城门日落关闭。')
  assert.deepEqual(book.entries[0].keys, ['城门'])
  assert.equal(book.entries[0].enabled, true)
  assert.equal(book.entries[0].id, 7)
})

test('独立世界书支持标记为全局生效与取消，并在目录和关联查询中体现', async () => {
  const run = harness()

  // 初始状态非全局
  assert.equal(await run.library.isGlobal('worldbooks/王都.json'), false)
  let catalog = await run.library.catalog()
  assert.equal(catalog.standalone[0].global, false)
  assert.deepEqual(catalog.globalPaths, [])

  // 标记为全局
  const result = await run.library.toggleGlobal('worldbooks/王都.json', true)
  assert.equal(result.global, true)
  assert.deepEqual(result.globalPaths, ['worldbooks/王都.json'])
  assert.equal(await run.library.isGlobal('worldbooks/王都.json'), true)

  // 目录和详情反映全局
  catalog = await run.library.catalog()
  assert.equal(catalog.standalone[0].global, true)
  assert.deepEqual(catalog.globalPaths, ['worldbooks/王都.json'])

  const bookDetail = await run.library.get({ kind: 'standalone', path: 'worldbooks/王都.json' })
  assert.equal(bookDetail.global, true)

  const assoc = await run.library.associations({ kind: 'standalone', path: 'worldbooks/王都.json' })
  assert.equal(assoc.global, true)
  assert.equal(assoc.conflict, false)

  // 取消全局
  const untoggled = await run.library.toggleGlobal('worldbooks/王都.json', false)
  assert.equal(untoggled.global, false)
  assert.deepEqual(untoggled.globalPaths, [])
  assert.equal(await run.library.isGlobal('worldbooks/王都.json'), false)
})

test('全局世界书与人物卡世界书自动合成为复合世界书并按优先级排序', async () => {
  const run = harness()
  // 添加通用规则世界书（order: 200，比默认 100 优先级更高）
  run.files.set('worldbooks/通用世界观.json', JSON.stringify({
    name: '通用世界观',
    entries: {
      0: { uid: 0, comment: '魔法法则', content: '魔法需要消耗魔力。', disable: false, key: ['魔法'], order: 200, displayIndex: 1 }
    }
  }))

  // 设为全局
  await run.library.toggleGlobal('worldbooks/通用世界观.json', true)

  // 1. 对于没有专属世界书的人物卡（空白），直接返回全局世界书
  const emptyCardBound = await run.library.bound('cards/空白.json', run.cards.get('cards/空白.json'), null)
  assert.ok(emptyCardBound)
  assert.equal(emptyCardBound.view.displayName, '通用世界观')
  assert.equal(emptyCardBound.view.entries.length, 1)
  assert.equal(emptyCardBound.view.entries[0].content, '魔法需要消耗魔力。')

  // 2. 对于有内置世界书的人物卡（命运，条目 order: 100），自动合成复合世界书
  const fateCardBound = await run.library.bound('cards/命运.json', run.cards.get('cards/命运.json'), null)
  assert.ok(fateCardBound)
  assert.equal(fateCardBound.source.kind, 'composite')
  assert.equal(fateCardBound.view.entries.length, 2)
  // order 200 应该排在 order 100 前面
  assert.equal(fateCardBound.view.entries[0].content, '魔法需要消耗魔力。')
  assert.equal(fateCardBound.view.entries[1].content, '钟楼只在午夜开放。')

  // 3. 同时再把王都设为全局，复合三个来源
  await run.library.toggleGlobal('worldbooks/王都.json', true)
  const tripleBound = await run.library.bound('cards/命运.json', run.cards.get('cards/命运.json'), null)
  assert.equal(tripleBound.source.kind, 'composite')
  assert.equal(tripleBound.view.entries.length, 3)
})

test('存在开局快照时复合世界书不重复叠加全局条目', async () => {
  const run = harness()
  run.files.set('worldbooks/通用世界观.json', JSON.stringify({
    name: '通用世界观',
    entries: {
      0: { uid: 0, comment: '魔法法则', content: '魔法需要消耗魔力。', disable: false, key: ['魔法'], order: 200 }
    }
  }))
  await run.library.toggleGlobal('worldbooks/通用世界观.json', true)

  // 先获取复合世界书
  const initial = await run.library.bound('cards/命运.json', run.cards.get('cards/命运.json'), null)
  assert.equal(initial.view.entries.length, 2)

  // 模拟游戏会话保存了开局快照
  const chat = {
    id: 'chat-123',
    openingWorldbookSnapshot: {
      version: 1,
      source: initial.source,
      document: initial.document
    }
  }

  // 再次读取该 chat 的绑定世界书
  const chatBound = await run.library.bound('cards/命运.json', run.cards.get('cards/命运.json'), chat)
  // 不会重复合并全局条目，条目数仍是 2
  assert.equal(chatBound.view.entries.length, 2)
  assert.equal(chatBound.localChatId, 'chat-123')
})

