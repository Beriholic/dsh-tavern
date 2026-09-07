import { randomUUID } from 'node:crypto'
import { cardOpeningChoices } from './card-openings.js'
import { inspectWorldBookDocument, updateWorldBookDocument } from './worldbook-resource.js'
import { projectTavernHelperWorldbook, replaceTavernHelperWorldbookOperations } from './tavern-helper-worldbook.js'

const copy = value => structuredClone(value)

/** Private pre-game host state. No Session or shared resource is written here. */
export function createOpeningPreparation({ readCard, worldBooks, now = Date.now }) {
  const drafts = new Map()
  const lifetime = 2 * 60 * 60 * 1000
  function requireDraft(id) {
    const draft = drafts.get(id)
    if (!draft || now() - draft.touchedAt > lifetime) {
      drafts.delete(id)
      throw new Error('开局准备已过期，请重新打开人物卡')
    }
    draft.touchedAt = now()
    return draft
  }
  function present(draft) {
    return copy({ id: draft.id, cardPath: draft.cardPath, openings: draft.openings,
      openingId: draft.openingId || draft.openings[0]?.id, worldbook: draft.document ? projectTavernHelperWorldbook(inspectWorldBookDocument(draft.document)) : null })
  }
  return {
    async create(cardPath) {
      for (const [id, draft] of drafts) if (now() - draft.touchedAt > lifetime) drafts.delete(id)
      if (drafts.size >= 64) throw new Error('打开的游戏准备页过多，请稍后重试')
      const card = await readCard(cardPath)
      if (!card) throw new Error('人物卡不存在')
      const record = await worldBooks.bound(cardPath, card)
      const draft = { id: randomUUID(), cardPath, openings: cardOpeningChoices(card),
        document: record ? copy(record.view.raw) : null, source: record ? copy(record.source) : null, touchedAt: now() }
      drafts.set(draft.id, draft)
      return present(draft)
    },
    get(id) { return present(requireDraft(id)) },
    select(id, openingId) {
      const draft = requireDraft(id)
      if (!draft.openings.some(opening => opening.id === openingId)) throw new Error('人物卡开场白不存在')
      draft.openingId = openingId
      return { saved: true, openingId }
    },
    async replaceWorldbook(id, entries, expectedEntries) {
      const draft = requireDraft(id)
      if (!draft.document) throw new Error('当前人物卡没有绑定世界书')
      const view = inspectWorldBookDocument(draft.document)
      if (JSON.stringify(projectTavernHelperWorldbook(view).entries) !== JSON.stringify(expectedEntries)) {
        throw new Error('世界书已被其他操作修改，请重新读取后重试')
      }
      const operations = replaceTavernHelperWorldbookOperations(view, entries)
      draft.document = updateWorldBookDocument(draft.document, { operations }).document
      return present(draft)
    },
    resolve(id, cardPath, openingId) {
      const draft = requireDraft(id)
      if (draft.cardPath !== cardPath) throw new Error('开局草稿与人物卡不匹配')
      const selected = openingId || 'primary'
      if (!draft.openings.some(opening => opening.id === selected)) throw new Error('人物卡开场白不存在')
      return copy({ openingId: selected, worldbookSnapshot: { version: 1, source: draft.source, document: draft.document } })
    }
  }
}
