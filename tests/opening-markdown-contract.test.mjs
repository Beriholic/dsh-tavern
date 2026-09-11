import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { parse } from 'acorn'

const source = await readFile(new URL('../tavern-plugin/src/client/main.js', import.meta.url), 'utf8')
const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
const calls = []
let renderer
function walk(node) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'FunctionDeclaration' && node.id.name === 'renderTavernProjection') renderer = source.slice(node.start, node.end)
  if (node.type === 'CallExpression' && node.callee.name === 'renderTavernProjection' && node.arguments[1]?.properties?.some(p => p.key.name === 'sessionId' && p.value.value === '')) calls.push(source.slice(node.start, node.end))
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object') walk(value)
  }
}
walk(tree)

test('all pre-game Markdown call sites support links without a Session file resolver', () => {
  assert.equal(calls.length, 3)
  const projection = { parts: [{ kind: 'markdown', text: '[说明](https://example.com)' }] }
  for (const call of calls) {
    const sandbox = {
      selectedOpening: { projection }, sessionTransitioning: { projection }, openingPicker: {},
      projectionPartsOf: value => value.parts,
      DshUi: { MarkdownText: props => { props.fileMentions?.resolve('https://example.com'); return props.text } },
      React: { createElement: (component, props) => component(props) }
    }
    sandbox.TavernColoredMarkdown = sandbox.DshUi.MarkdownText
    assert.doesNotThrow(() => vm.runInNewContext(renderer + '\n' + call, sandbox))
  }
})
