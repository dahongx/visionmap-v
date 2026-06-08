/**
 * generate-mermaid.js
 * 生成 Mermaid 格式的导图代码
 *
 * 注意：这个模块本身不做 AI 分析，它接收已结构化的数据来生成 Mermaid 代码。
 * 实际的图片分析由 Claude 在调用 tool 时完成，MCP Server 接收的是
 * Claude 已经解析好的结构化描述（通过 prompt 约定）。
 *
 * 但为了灵活性，这里也提供了从纯文本/大纲直接解析的能力。
 */

/**
 * 从纯文本/大纲解析出树形结构
 * 支持：
 *   - Markdown 大纲（# / - / * / 1.）
 *   - 缩进文本
 *   - 普通段落（按句子分割）
 */
function parseTextToTree(text) {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { text: "空内容", children: [] };

  const root = { text: "", children: [], depth: -1 };
  const stack = [root];

  for (const line of lines) {
    // 检测 Markdown 标题层级
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const depth = headingMatch[1].length;
      const node = { text: headingMatch[2].trim(), children: [], depth };
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      continue;
    }

    // 检测列表项（- / * / + / 数字.）
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)/);
    if (listMatch) {
      const indent = listMatch[1].length;
      const depth = Math.floor(indent / 2);
      const node = { text: listMatch[3].trim(), children: [], depth };
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      continue;
    }

    // 普通文本行，按缩进判断层级
    const indent = line.match(/^(\s*)/)[1].length;
    const depth = Math.floor(indent / 2);
    const node = { text: line.trim(), children: [], depth };
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  // 如果没有解析出任何子节点，把第一行当根节点
  if (root.children.length === 0) {
    return { text: lines[0] || "未命名", children: [] };
  }
  if (root.children.length === 1) {
    return root.children[0];
  }
  // 首个子节点是 Markdown 标题时，用它当根，它的 children + 后续节点合并
  const first = root.children[0];
  const isHeading = /^#{1,6}\s+/.test(lines[0]);
  if (isHeading) {
    return { text: first.text, children: [...first.children, ...root.children.slice(1)] };
  }
  // 多个顶级节点，用第一行当根
  return { text: lines[0], children: root.children.slice(1) };
}

/**
 * 转义 Mermaid 节点文本中的特殊字符
 */
function escapeMermaid(text) {
  return text
    .replace(/"/g, "'")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\n/g, " ")
    .trim();
}

/**
 * 递归生成 mindmap Mermaid 代码
 */
function treeToMindmap(node, indent = 4) {
  const prefix = " ".repeat(indent);
  const escaped = escapeMermaid(node.text);
  let result = `${prefix}${escaped}\n`;
  for (const child of node.children || []) {
    result += treeToMindmap(child, indent + 2);
  }
  return result;
}

/**
 * 递归生成 flowchart Mermaid 代码
 */
function treeToFlowchart(node, parentId = null, counter = { n: 0 }) {
  const nodeId = `N${counter.n++}`;
  const escaped = escapeMermaid(node.text);
  let result = `    ${nodeId}["${escaped}"]\n`;

  if (parentId) {
    result += `    ${parentId} --> ${nodeId}\n`;
  }

  for (const child of node.children || []) {
    result += treeToFlowchart(child, nodeId, counter);
  }
  return result;
}

/**
 * 生成 orgchart Mermaid 代码
 */
function treeToOrgchart(node, parentId = null, counter = { n: 0 }) {
  const nodeId = `N${counter.n++}`;
  const escaped = escapeMermaid(node.text);
  let result = `    ${nodeId}["${escaped}"]\n`;

  if (parentId) {
    result += `    ${parentId} -->> ${nodeId}\n`;
  }

  for (const child of node.children || []) {
    result += treeToOrgchart(child, nodeId, counter);
  }
  return result;
}

/**
 * 主函数：生成 Mermaid 代码
 * @param {string} title - 导图标题
 * @param {string} mapType - 导图类型
 * @param {string|null} imageBase64 - 图片 base64（此模块不直接处理，由上层 AI 分析）
 * @param {string|null} text - 文本/大纲内容
 * @returns {string} Mermaid 代码
 */
export async function generateMermaid(title, mapType, imageBase64 = null, text = null) {
  // 如果有文本内容，解析为树形结构
  const tree = text
    ? parseTextToTree(text)
    : { text: title || "中心主题", children: [] };

  // 如果传入了图片但没有文本，生成占位结构（实际使用时由 AI 分析后填充）
  if (!text && imageBase64) {
    return [
      "mindmap",
      `  ${escapeMermaid(title || "图片分析结果")}`,
      "    (请通过 AI 分析图片内容后填充此结构)",
      "",
      "<!-- 提示：此文件需要配合 AI 图片分析使用 -->",
      "<!-- Claude 会自动分析图片内容并填充上方结构 -->",
    ].join("\n");
  }

  // 去重：如果解析出的根节点文本和标题相同，用标题当根，只取 children
  const rootTitle = title || tree.text;
  const rootChildren = tree.text === rootTitle ? tree.children : [tree];

  switch (mapType) {
    case "mindmap":
      return `mindmap\n  ${escapeMermaid(rootTitle)}\n${rootChildren.map((c) => treeToMindmap(c, 4)).join("")}`;

    case "flowchart":
      return [
        "flowchart TD",
        `    title["${escapeMermaid(rootTitle)}"]`,
        ...rootChildren.map((c) => treeToFlowchart(c, "title")),
      ].join("\n");

    case "orgchart":
      return [
        "graph TD",
        `    title["${escapeMermaid(rootTitle)}"]`,
        ...rootChildren.map((c) => treeToOrgchart(c, "title")),
      ].join("\n");

    case "tree":
      return [
        "graph TD",
        `    title["${escapeMermaid(rootTitle)}"]`,
        ...rootChildren.map((c) => treeToFlowchart(c, "title")),
      ].join("\n");

    case "fishbone":
      return [
        "flowchart LR",
        `    root(("${escapeMermaid(rootTitle)}"))`,
        ...rootChildren.map((c, i) => {
          const catId = `C${i}`;
          const lines = [`    ${catId}["${escapeMermaid(c.text)}"]`, `    root --> ${catId}`];
          for (const sub of c.children || []) {
            const subId = `S${i}_${lines.length}`;
            lines.push(`    ${subId}["${escapeMermaid(sub.text)}"]`);
            lines.push(`    ${catId} --> ${subId}`);
          }
          return lines.join("\n");
        }),
      ].join("\n");

    default:
      return `mindmap\n  ${escapeMermaid(rootTitle)}\n${rootChildren.map((c) => treeToMindmap(c, 4)).join("")}`;
  }
}
