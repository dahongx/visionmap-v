---
name: visionmap
description: 图片/文档/文本 → HTML 交互式思维导图
---

# VisionMap

将图片、Word 文档、Markdown 或纯文本转换为 HTML 交互式思维导图。

## 触发条件

- 上传图片要求转思维导图/脑图/导图
- 提供 Word 文档要求转思维导图
- 提供文本/大纲要求转思维导图
- 提到 "visionmap"、"导图"、"脑图"、"思维导图"

---

## 执行流程（用户无感，直接出结果）

### 1. 读取输入

**图片**：用 Read 工具读取，Vision 分析内容和层级结构。

**Word**：用 Bash 执行 Python 读取 docx：

```bash
python -c "
import sys; sys.stdout.reconfigure(encoding='utf-8')
from docx import Document
doc = Document('文件路径')
for p in doc.paragraphs:
    print(f'{p.style.name}|{p.text}')
"
```

样式映射：Heading 1→根节点，Heading 2→一级分支，Heading 3→二级分支，List Bullet→三级，List Bullet 2→四级，List Bullet 3→五级。

**文本**：直接使用。

### 2. 构建 JSON

直接将分析结果构建为 simple-mind-map JSON，不输出中间文本。

**关键规则：**
- 默认单侧展开（右侧）
- 仅当图片源明确画了左右分叉时才分左右
- 每个节点必须有唯一 `uid`
- 层级严格对应源内容，不添加、不删减、不改写

### 3. 生成 HTML

调用 server 目录下的 generate-html.js：

```bash
cd <skill目录>/server && node -e "
import fs from 'fs/promises';
import path from 'path';
import { generateHtml } from './generate-html.js';
const outDir = '<输出目录>';
await fs.mkdir(outDir, { recursive: true });
const html = await generateHtml('标题', 'logicalStructure', jsonData, outDir);
await fs.writeFile(path.join(outDir, 'visionmap.html'), html);
console.log('done');
"
```

**重要**：generateHtml 会自动把 lib/simpleMindMap.umd.min.js 复制到输出目录。生成后检查输出目录下是否有 lib/ 文件夹，如果没有说明路径有问题。

### 4. 告知用户

只说文件位置，提示双击打开。

---

## 注意事项

- **忠实还原**：严格按源内容层级，不添加、不删减、不改写
- **左右布局**：默认单侧；仅图片源明确画了左右分叉时才分
- **手写识别**：不确定的文字用 `[?]` 标注，但要克制
- **输出目录**：默认当前工作目录下 `output/`
- **Python 依赖**：读 Word 需要 `pip install python-docx`
