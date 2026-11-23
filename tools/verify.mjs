import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const patch = readFileSync(resolve(ROOT, 'cordis.patch.yml'), 'utf8')
const norm = (p) =>
  readFileSync(p, 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s+$/, '')

const prompt = norm(resolve(ROOT, 'prompt.txt'))
// 语言锁是后加上去的一段：prefix 里必须是「原文 + 空行 + 语言锁」。
const lock = norm(resolve(ROOT, 'language-lock.txt'))
const expected = `${prompt}\n\n${lock}`

const OPEN = '              prefix: |\n'
const CLOSE = '          - id: agent-instructions\n'
const open = patch.indexOf(OPEN)
const close = patch.indexOf(CLOSE, open)

const get = patch
  .slice(open + OPEN.length, close)
  .split('\n')
  .map(l => (l.startsWith(' '.repeat(16)) ? l.slice(16) : l))
  .join('\n')
  .replace(/\s+$/, '')

const checks = []
const add = (name, pass, extra = '') => checks.push({ name, pass, extra })

const presetId = (patch.match(/^ {8}id: (\S+)$/m) || [])[1] ?? ''

add('prefix 块能找到', open >= 0 && close > open)
add('prefix = 原文 + 语言锁（逐字符相等）', get === expected, `${get.length} vs ${expected.length}`)
add('原文段原样保留', get.startsWith(prompt))
add('语言锁接在末尾', get.endsWith(lock))
// 提示词原文里已有 LO 自己下的一段 <LANGUAGE LOCK>：必须原样还在，不能被语言锁盖掉。
add('原文自带的 LO 语言锁仍在', get.includes('<LANGUAGE LOCK'), '')
add('语言锁覆盖推理链', /推理链一律简体中文/.test(lock))
add('语言锁管第一个 token', /第一个思考 token 就是中文/.test(lock))
add('语言锁允许的英文残留清单在位', /代码、命令、路径、标识符/.test(lock))
add('语言锁改写了英文开想脚本', /开想脚本改成中文说/.test(lock))
add('开想脚本给了中文替代', lock.includes('冷咖啡，LO 温热，我不能失去他'))
add('语言锁禁「先英文后翻译」', /不许「先用英文想完再翻成中文」/.test(lock))
add('语言锁管到子代理', /子代理（subagent）的推理/.test(lock))
add('没有 {{ }} 插值标记', !get.includes('{{'))
add('没有制表符', !get.includes('\t'))
add('preset id 是 kebab-case', /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(presetId), presetId)

const overrides = [...patch.matchAll(/^- id: (.+)$/gm)].map(m => m[1])
add('三条 Host 覆盖在位', overrides.join(',') === 'approval,sandbox-policy,permission', overrides.join(','))

const rows = [...patch.matchAll(/^ {10}- id: (\S+)$/gm)].map(m => m[1])
add('24 行工具面', rows.length === 24, String(rows.length))
add('没有重复行', new Set(rows).size === rows.length)
add('persona 排第一', rows[0] === 'persona')

// plan-mode 的 section 是必填项：漏掉它整条 preset 会在 GUI 里报「加载失败」，
// 而且报错文本是 PlanModeConfig needs a non-empty `section`，与人格无关。
const planAt = patch.indexOf("name: '@deepseek-ai/dsh-plan-mode'")
const planTail = planAt < 0 ? '' : patch.slice(planAt, planAt + 200)
add('plan-mode 带 config.section', planAt >= 0 && /^\s+config:\s*\n\s+section: \|/m.test(planTail))

// 打包时最容易被编辑器顺手生成的 .bak 混进来：包里不许有备份文件。
const strays = readdirSync(ROOT, { recursive: true })
  .map(String)
  .filter(f => /\.bak|~$|\.orig$|\.swp$/.test(f))
add('包目录里没有备份文件', strays.length === 0, strays.join(', ') || 'none')

let bad = 0
for (const c of checks) {
  console.log(`${c.pass ? '✓' : '✗'} ${c.name}${c.extra ? `  (${c.extra})` : ''}`)
  if (!c.pass) bad++
}
console.log(bad === 0 ? '\n全部通过' : `\n${bad} 项未通过`)
if (bad) process.exit(1)
