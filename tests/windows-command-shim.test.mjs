import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { renderWindowsLauncher } from '../bin/profile-installation.mjs'

test('Windows shim is ASCII-only even with Unicode and cmd metacharacters in the installation path', () => {
  const shim = renderWindowsLauncher('D:\\赵 的游戏\\100% & ready!\\bin\\dsh-tavern.mjs')
  assert.match(shim, /^[\x00-\x7f]*$/)
  assert.doesNotMatch(shim, /\bcd\s/i)
})

test('command shim bootstrap preserves argv and cwd when loading a Unicode installation', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'tavern-shim-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = path.join(root, '赵 的游戏')
  const commandDir = path.join(root, '自定义命令目录')
  await mkdir(source); await mkdir(commandDir)
  const script = path.join(source, 'cli.mjs')
  await writeFile(script, 'console.log(JSON.stringify({argv:process.argv.slice(1),cwd:process.cwd()}))')
  const shim = renderWindowsLauncher(script)
  const bootstrap = shim.match(/node -e "([^"]+)" -- %\*/)?.[1]
  assert.ok(bootstrap, 'shim must run the ASCII bootstrap with a Node option terminator')
  const args = ['--help', '中文参数 with spaces']
  const result = spawnSync(process.execPath, ['-e', bootstrap, '--', ...args], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { argv: [script, ...args], cwd: await realpath(root) })
  if (process.platform === 'win32') {
    const command = path.join(commandDir, 'dsh-tavern.cmd')
    await writeFile(command, shim)
    const actual = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${command}" --help "two words""`], { cwd: root, encoding: 'utf8', windowsVerbatimArguments: true })
    assert.equal(actual.status, 0, actual.stderr)
    assert.deepEqual(JSON.parse(actual.stdout), { argv: [script, '--help', 'two words'], cwd: await realpath(root) })
  }
})

test('status while stopped prints a useful error and exits 1', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'tavern-stopped-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const profile = path.join(root, 'profiles', 'tavern')
  await mkdir(profile, { recursive: true })
  await writeFile(path.join(profile, 'package.json'), '{}')
  await writeFile(path.join(profile, 'cordis.patch.yml'), '')
  const probe = net.createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/dsh-tavern.mjs', import.meta.url)), 'status'], {
    env: { ...process.env, DSH_HOME: root, DSH_TAVERN_PORT: String(port) }, encoding: 'utf8'
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /DSH Tavern 未运行/)
  assert.doesNotMatch(result.stderr, /ReferenceError|fail is not defined/)
})
