/**
 * generate-markdown.js
 * 生成 Markdown 大纲格式的输出
 */

/**
 * 从纯文本/大纲解析出树形结构
 */
function parseTextToTree(text) {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { text: "空内容", children: [] };

  const root = { text: "", children: [], depth: -1 };
  const stack = [root];

  for (const line of lines) {
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

    const indent = line.match(/^(\s*)/)[1].length;
    const depth = Math.floor(indent / 2);
    const node = { text: line.trim(), children: [], depth };
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  if (root.children.length === 0) return { text: lines[0] || "未命名", children: [] };
  if (root.children.length === 1) return root.children[0];
  const first = root.children[0];
  const isHeading = /^#{1,6}\s+/.test(lines[0]);
  if (isHeading) {
    return { text: first.text, children: [...first.children, ...root.children.slice(1)] };
  }
  return { text: lines[0], children: root.children.slice(1) };
}

/**
 * 递归生成 Markdown 大纲
 */
function treeToMarkdown(node, depth = 0) {
  const indent = "  ".repeat(depth);
  let result;

  if (depth === 0) {
    result = `# ${node.text}\n`;
  } else if (depth === 1) {
    result = `${indent}- **${node.text}**\n`;
  } else {
    result = `${indent}- ${node.text}\n`;
  }

  for (const child of node.children || []) {
    result += treeToMarkdown(child, depth + 1);
  }
  return result;
}

/**
 * 主函数：生成 Markdown 大纲
 * @param {string} title - 导图标题
 * @param {string} mapType - 导图类型
 * @param {string|null} imageBase64 - 图片 base64
 * @param {string|null} text - 文本/大纲内容
 * @returns {string} Markdown 文本
 */
export async function generateMarkdown(title, mapType, imageBase64 = null, text = null) {
  let tree;

  if (text) {
    tree = parseTextToTree(text);
  } else if (imageBase64) {
    tree = {
      text: title || "图片分析结果",
      children: [
        { text: "请通过 AI 分析图片内容", children: [] },
        { text: "此大纲将被自动填充", children: [] },
      ],
    };
  } else {
    tree = { text: title || "中心主题", children: [] };
  }

  // 去重：如果解析出的根节点文本和标题相同，用标题当根，只取 children
  const rootTitle = title || tree.text;
  const rootChildren = tree.text === rootTitle ? tree.children : [tree];

  const header = `> 由 VisionMap 生成 | ${new Date().toLocaleString("zh-CN")}\n> 导图类型: ${mapType}\n\n`;

  const rootNode = { text: rootTitle, children: rootChildren || [] };
  return header + treeToMarkdown(rootNode);
}
