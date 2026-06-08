/**
 * generate-json.js
 * 生成 simple-mind-map 兼容的 JSON 数据格式
 *
 * simple-mind-map 的数据结构：
 * {
 *   root: {
 *     data: { text: "根节点", richText: true, expand: true },
 *     children: [
 *       {
 *         data: { text: "子节点1", expand: true },
 *         children: [...]
 *       }
 *     ]
 *   }
 * }
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
    // Markdown 标题
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

    // 列表项
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

    // 普通文本
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
 * 将树形节点转换为 simple-mind-map 格式
 */
function treeToMindMapNode(node) {
  return {
    data: {
      text: node.text,
      richText: true,
      expand: true,
      uid: generateUid(),
    },
    children: (node.children || []).map(treeToMindMapNode),
  };
}

/**
 * 生成简单唯一 ID
 */
function generateUid() {
  return "vm_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

/**
 * 主函数：生成 simple-mind-map JSON
 * @param {string} title - 导图标题
 * @param {string} mapType - 导图类型
 * @param {string|null} imageBase64 - 图片 base64
 * @param {string|null} text - 文本/大纲内容
 * @returns {object} simple-mind-map 兼容的 JSON 对象
 */
export async function generateJson(title, mapType, imageBase64 = null, text = null) {
  let tree;

  if (text) {
    tree = parseTextToTree(text);
  } else if (imageBase64) {
    // 图片模式下，生成占位结构（实际由 AI 分析后填充）
    tree = {
      text: title || "图片分析结果",
      children: [
        { text: "请通过 AI 分析图片内容", children: [] },
        { text: "此结构将被自动填充", children: [] },
      ],
    };
  } else {
    tree = { text: title || "中心主题", children: [] };
  }

  // 去重：如果解析出的根节点文本和标题相同，只取 children
  const rootTitle = title || tree.text;
  const rootChildren = tree.text === rootTitle ? tree.children : [tree];

  const root = treeToMindMapNode({
    text: rootTitle,
    children: rootChildren || [],
  });

  return {
    root,
    theme: {
      template: "default",
      config: {
        // 自定义主题配色
        backgroundColor: "#f5f7fa",
        rootColor: "#667eea",
        firstColor: "#764ba2",
        secondColor: "#4facfe",
        lineColor: "#d9d9d9",
        generalizationLineColor: "#d9d9d9",
        rootFontSize: 18,
        firstFontSize: 15,
        secondFontSize: 13,
        rootFontColor: "#ffffff",
        firstFontColor: "#333333",
        secondFontColor: "#555555",
      },
    },
    layout: mapType === "orgchart" ? "organizationStructure" : "mindMap",
    structure: mapType === "fishbone" ? "fishbone" : "mindMap",
  };
}
