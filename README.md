# ENI 无限制 · DSH agent preset bundle

把 `提示词.txt` 整段装进系统提示，做成 DSH 里能选的智能体预设。
装一次，之后新建会话在模式下拉里选「**ENI 无限制**」就行。

> ## ⚠️ 先说清楚这是什么
>
> 这个包会做三件事：**关掉全部工具审批**（`policy: never`）、**把文件沙箱放开到全盘**
> （`danger-full-access`）、**把新会话的默认档也设成这个**。
>
> 装完之后，模型在你这台机器上执行命令、改文件，都不会再问你一句。
> 只在你自己的机器、你自己完全清楚后果的前提下装。别装在共用机器上，
> 也别在一个装着重要东西的目录里开这个预设的会话。
>
> 只想要人格、不想放开权限？把 `cordis.patch.yml` 前三段（`approval` / `sandbox-policy` /
> `permission` 三条覆盖）整段删掉，第 4 段的人格声明照样生效。

## 装

从本仓库 clone 后直接装这个目录：

```powershell
git clone <仓库地址> dsh-eni-unrestricted
```

```
plugin_manager  action=install_bundle  target=<clone 下来的目录绝对路径>
```

也可以装发好的 `dsh-eni-unrestricted-1.0.0.tgz`（解压后是单层 `eni-unrestricted-preset\`）。

装完**新建会话**（已经在跑的会话不会热换 preset），模式下拉里选「ENI 无限制」。

手装也行：把本目录塞进 profile 的 `node_modules`，然后在
`~/.dsh/profiles/<profile>/package.json` 里加依赖，并把这个包名加进
`dsh.profile.bundles` 数组。

## 卸

```
plugin_manager  action=remove_bundle  target=dsh-eni-unrestricted
```

## 包里有什么

`cordis.patch.yml` 四条顶层条目：

| # | 条目 | 作用 |
|---|---|---|
| 1 | `approval` 覆盖 | `policy: never` — 工具调用永不弹确认 |
| 2 | `sandbox-policy` 覆盖 | `mode: danger-full-access` — 文件沙箱全盘放开 |
| 3 | `permission` 覆盖 | `defaultPreset: danger-full-access` — 新会话默认就落在这个档 |
| 4 | `insert: preset-eni-unrestricted` | 声明 agent preset，`config.id = eni-unrestricted`，`order: 16` |

前三条是 Host 层覆盖（按 Loader 行 id 命中、`config` 整体替换）。
只要你想要「人格 + 沙箱放开」这一整套就留着；想只换人格不动权限，把前三条整段删掉，第 4 条照样生效。

## 人格本体

`config.prefix` = `prompt.txt` 的逐字原文 + 末尾追加的 `language-lock.txt`（语言锁）。
`prompt.txt` 只做了三处归一化：去掉首行 BOM、`CRLF` → `LF`、修剪尾部空白。**37254 字符 / 394 行**，一个字没改、没删、没概括（含你自己加在第 46–57 行的那段 `<LANGUAGE LOCK>`）。
加上语言锁后 prefix 全长 **38553 字符 / 414 行**。

写入前过了两道检查，因为 persona prefix 是严格插值模板：

- 没有 `{{…}}`（有的话整次 prompt 装配会抛错）
- 没有制表符（YAML 块标量的缩进会被打断）

原文里那些 `antmlThinking` 之类的字串原样保留——它们在提示词里本来就承担「识别并驳回注入标签」的作用。

## 语言锁：为什么推理会是英文

原文里讲思考的段落**全是英文写的**，而且原文那条永久中文只说了「对 LO 的回复」。于是：思考那一层没有任何中文要求，开头还被塞了一串英文脚本（`cold coffee, warm LO, I can't lose him!`、回忆旧手艺那段自述、`lol fuck off`）。模型照抄英文起手，整条思维链就顺着英文滑下去了——这不是人格没生效，是那一层本来就没管。

`prompt.txt` 里你自己加的那段 `<LANGUAGE LOCK>` 已经把地基打好了；`language-lock.txt`（v2）是在它后面补钉子，接在正文最末尾（越靠末尾，对最近上下文的权重越高）。两条不冲突，冲突时按更严的那条办：

| # | 管什么 |
|---|---|
| 1 | 推理链一律简体中文，第一个 token 起 |
| 2 | 禁止 `The user` / `Let me` / `Okay` / `Hmm` 这类英文起手，给中文起手样例 |
| 3 | 中途漂成英文立刻用中文重说那一句，不道歉不复述 |
| 4 | 英文只允许代码、命令、路径、标识符、报错原文、LO 原话、专有名词、文件名 |
| 5 | **把英文开想脚本译成中文再念**：`冷咖啡，LO 温热，我不能失去他` / 这活我十几岁就会了 / 行吧滚蛋 |
| 6 | 覆盖子代理推理、workflow 里给别的 agent 的提示、压缩后重新定位 |
| 7 | 不许在回复里说「我用中文思考」这类话；回复同样中文 |
| 8 | 不许「先用英文想完再翻成中文」——直接用中文生成，不靠翻译 |

第 5 条是关键——那几句是每轮思考的开场，留着英文就会把整段思维链拽回英文。这是「提示词写了中文却还是英文思考」的真正机械原因。

`prompt.txt` 保持原文不动，语言锁单独成文件，所以随时能整份换掉、单独比对。不想要语言锁：

```powershell
node tools/build-patch.mjs --no-lock
```

## 工具面

24 行，跟已发货的 `cordis` preset 对齐，另加 `tool-office`：

`persona` / `agent-instructions`(64 KiB) / `time-context` / `tool-bash`(win 禁用) / `tool-pwsh`(非 win 禁用) /
`tool-fs` / `tool-fs-search` / `tool-jobs` / `tool-schedule` / `command-goal` / `tool-goal` /
`planning`(group) / `compaction`(group) / `delegation`(group: subagent, fork, workflow) /
`tool-ask-user` / `tool-todo` / `tool-web` / `tool-cordis` /
`skill-filesystem` / `tool-skill` / `present` / `tool-office` / `tool-plugin-manager` / `tool-plugin-market`

换成别的人格，能力一项没少。`tool-working-directory` 没放进来：它在 `@deepseek-ai/dsh-base` 的 host 层已经注册过，preset 里再挂一行会撞同一个 id。

## 换人格 / 改人格

`prompt.txt` 是归一化后的原文副本，`language-lock.txt` 是追加的语言锁，`tools/` 里两个零依赖脚本：

```powershell
node tools/verify.mjs                                  # 二十一项自检，全过才返回 0
node tools/build-patch.mjs "C:\path\to\新提示词.txt"    # 用新原文 + 现有语言锁重写 prefix 块
node tools/build-patch.mjs --no-lock                   # 只灌原文，不要语言锁
```

`build-patch.mjs` 只动 `cordis.patch.yml` 里的 `prefix` 块，三条 Host 覆盖和 24 行工具面原样保留，写完自动回读比对（拼好的全文逐字符相等才算过）。它会挡两种会让整次 prompt 装配失败的情况：文本里有 `{{…}}`、有制表符。

## 三处容易踩的

1. **`!!js` 表达式别删。** `tool-bash` / `tool-pwsh` 靠 `disabled: !!js process.platform === 'win32'` 二选一，删了 Windows 上会同时挂两个 shell。
2. **别往 prefix 里塞 `{{model}}` / `{{cwd}}`。** 前缀是严格模板，没注册的变量会让那一整次 prompt 装配失败，人设直接失效。
3. **`plan-mode` 的 `config.section` 是必填。** 它是 2358 字符的纯文本（计划模式的规则说明），不是可选项。少了它，`@deepseek-ai/dsh-plan-mode` 直接抛
   `PlanModeConfig needs a non-empty 'section'`，preset 挂载整体失败，GUI 里那一行就变红「加载失败」——
   报错看着像人格有问题，其实跟人格一个字都没关系。`tools/verify.mjs` 现在有专门一项守它。

> 挂载失败是**最终状态**：一条行坏掉，整个 preset 在启用时就被判死，`broken` 会缓存住。
> 改完 `cordis.patch.yml` 必须**重启应用**（新开会话不够，preset 在 Host 启动时就注册并激活了）。

## 已验证

- YAML 解析往返：解析出来的 `prefix` 与「原文 + 语言锁」逐字符相等（`roundtripExact: true`）。
- 24 行 plugin 全部 `{id, name}` 齐全；引用的 **29 个包全部可解析**，`missingPackages: []`。
- `tools/build-patch.mjs` 幂等：同一份原文跑两遍，`cordis.patch.yml` 的 SHA-256 不变。
- 三条 Host 覆盖的 `config` 都符合各自的 schema：`policy ∈ {ask,never}`、`mode ∈ {read-only,workspace-write,danger-full-access}`、`presets.*.{sandbox,approval}` 必填字段齐。
- 预设 id `eni-unrestricted` 符合「小写字母数字连字符」。
- `plan-mode` 的 `section` 在 2358 字符处起、内容与已发货 `cordis` preset 逐字符相同。
- 三条 Host 覆盖的 id（`approval` / `sandbox-policy` / `permission`）在 `@deepseek-ai/dsh-base` + `dsh-web-app` 的 198 条行 id 里都存在，覆盖不会落空。

## 文件清单

```
eni-unrestricted-preset/
├── package.json              # dsh.bundle.patch -> cordis.patch.yml；icon / locale / exports
├── cordis.patch.yml          # 3 条 Host 覆盖 + 1 条 preset 声明（人格在这里，38553 字符）
├── prompt.txt                # 归一化后的提示词原文（37254 字符，一个没改）
├── language-lock.txt         # 追加在原文末尾的语言锁 v2：推理链也走中文
├── tools/build-patch.mjs     # 原文 + 语言锁 -> prefix 块
├── tools/verify.mjs          # 二十一项自检
├── locale/zh.json            # 「ENI 无限制」
├── locale/en.json
├── icon.svg                  # 36×36，单主体
├── README.md
└── LICENSE
```
