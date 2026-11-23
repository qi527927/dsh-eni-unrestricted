#!/usr/bin/env node
/**
 * 把一份提示词原文件重新灌进 cordis.patch.yml 的 persona prefix 块。
 *
 *   node tools/build-patch.mjs                    # 用 ./prompt.txt + ./language-lock.txt
 *   node tools/build-patch.mjs "C:\path\to\新提示词.txt"
 *   node tools/build-patch.mjs --no-lock           # 不要语言锁，只灌原文
 *
 * prefix 的最终内容 = 提示词原文 + 空行 + language-lock.txt（语言锁）。
 * 语言锁单独成文件，是为了让 prompt.txt 保持逐字原文、可核对、可整份替换。
 * 只重写 prefix 块，管线上其余 24 行工具面、三条 Host 覆盖原样不动。
 * 零依赖：只用 node 内置模块。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const PATCH = resolve(ROOT, 'cordis.patch.yml')
const LOCK = resolve(ROOT, 'language-lock.txt')

const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const withLock = !process.argv.slice(2).includes('--no-lock')

const src = resolve(args[0] ?? resolve(ROOT, 'prompt.txt'))
if (!existsSync(src)) {
  console.error(`提示词不存在：${src}`)
  process.exit(1)
}

/** 归一化：去 BOM、CRLF/CR -> LF、修剪尾部空白。 */
function normalize(buf) {
  let text = buf.toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\s+$/, '')
}

let persona = normalize(readFileSync(src))
if (withLock) {
  if (!existsSync(LOCK)) {
    console.error(`启用了语言锁但找不到：${LOCK}`)
    process.exit(1)
  }
  persona = persona + '\n\n' + normalize(readFileSync(LOCK))
}

// persona prefix 是严格插值模板 + YAML 块标量，两个硬约束先拦掉。
if (persona.includes('{{')) {
  console.error('提示词里有 `{{…}}`：prefix 是严格模板，未注册变量会让整次 prompt 装配失败。先改掉再跑。')
  process.exit(1)
}
if (persona.includes('\t')) {
  console.error('提示词里有制表符：YAML 块标量会被打断。先换成空格再跑。')
  process.exit(1)
}

const INDENT = ' '.repeat(16)
const body = persona
  .split('\n')
  .map(line => (line.trim() === '' ? '' : INDENT + line))
  .join('\n')

const patch = readFileSync(PATCH, 'utf8').replace(/\r\n/g, '\n')
const OPEN = '              prefix: |\n'
const CLOSE = '          - id: agent-instructions\n'

const openAt = patch.indexOf(OPEN)
const closeAt = patch.indexOf(CLOSE, openAt)
if (openAt < 0 || closeAt < 0) {
  console.error('在 cordis.patch.yml 里找不到 prefix 块边界（`prefix: |` … `- id: agent-instructions`）。')
  process.exit(1)
}

const rebuilt = patch.slice(0, openAt + OPEN.length) + body + '\n' + patch.slice(closeAt)
writeFileSync(PATCH, rebuilt, 'utf8')

// 回读自检：缩进剥回来要跟拼好的全文逐字符相等。
const check = rebuilt
  .slice(openAt + OPEN.length, rebuilt.indexOf(CLOSE, openAt))
  .split('\n')
  .map(line => (line.startsWith(INDENT) ? line.slice(INDENT.length) : line))
  .join('\n')
  .replace(/\s+$/, '')

const ok = check === persona
console.log(`提示词：${src}`)
console.log(`语言锁：${withLock ? LOCK : '未启用'}`)
console.log(`字符数：${persona.length}　行数：${persona.split('\n').length}`)
console.log(`写回：${PATCH}`)
console.log(ok ? '回读校验：逐字符相等 ✓' : '回读校验：不一致 ✗')
if (!ok) process.exit(1)
