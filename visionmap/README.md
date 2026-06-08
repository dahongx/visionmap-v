# VisionMap

> 图片/文档/文本 → HTML 交互式思维导图，浏览器直接打开查看

## 快速开始（3 步）

### 1. 安装依赖

```bash
cd visionmap/server
npm install
```

### 2. 注册 MCP Server（只需一次）

```bash
claude mcp add visionmap -- node <你的路径>/visionmap/server/index.js
```

> Windows 路径用正斜杠，如 `E:/tools/visionmap/server/index.js`

### 3. 安装 Skill（只需一次）

```bash
# Windows
copy skill.md %USERPROFILE%\.claude\skills\visionmap.md

# macOS/Linux
cp skill.md ~/.claude/skills/visionmap.md
```

### 4. 使用

重启 Claude Code，直接说：

```
这张图片转思维导图 [附图]
这个Word转思维导图 [附docx]
把以下内容整理成思维导图：...
```

输出在 `output/` 目录：

```
output/
├── visionmap.html              # 双击打开
└── lib/
    └── simpleMindMap.umd.min.js
```

> HTML 和 lib 目录必须放在一起，打开 HTML 时浏览器会加载同目录下的 lib 文件。
> **注意**：生成后请检查输出目录下是否有 lib/ 文件夹。如果没有，说明 lib 文件没有复制成功，HTML 无法打开。

---

## 环境要求

- Node.js 18+
- Python 3（读 Word 文档需要）
- pip install python-docx

---

## 项目结构

```
visionmap/
├── skill.md                  # Skill 定义（放到 ~/.claude/skills/）
├── README.md                 # 本文件
├── lib/
│   └── simpleMindMap.umd.min.js
└── server/
    ├── index.js              # MCP Server
    ├── generate-html.js      # HTML 生成
    ├── generate-json.js      # JSON 构建
    ├── package.json
    └── package-lock.json
```

## License

MIT
