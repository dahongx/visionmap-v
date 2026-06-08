#!/usr/bin/env node

/**
 * VisionMap MCP Server
 * 结构化文本 → 思维导图/流程图/框图 多格式输出
 *
 * 注意：图片分析由 Claude 自行完成（Vision 能能），
 * 本 Server 只负责将结构化文本转换为各种导图格式。
 *
 * Tools:
 *   - text_to_mindmap  : 文本/大纲输入，生成多格式导图
 *   - list_templates   : 列出可用的导图模板
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { generateMermaid } from "./generate-mermaid.js";
import { generateHtml } from "./generate-html.js";
import { generateJson } from "./generate-json.js";
import { generateMarkdown } from "./generate-markdown.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const server = new McpServer({
  name: "visionmap",
  version: "1.0.0",
});

// ─── Tool: text_to_mindmap ────────────────────────────────────────────
server.tool(
  "text_to_mindmap",
  "将结构化的文本大纲转换为思维导图/流程图等多种格式的文件。输入应为已分析好的缩进大纲文本（图片分析由调用方完成）。",
  {
    text: z
      .string()
      .describe("结构化的文本大纲，使用缩进表示层级关系。例如：\n# 标题\n- 一级节点\n  - 二级节点\n    - 三级节点"),
    output_dir: z
      .string()
      .optional()
      .describe("输出目录的绝对路径，默认为当前工作目录下的 output/"),
    title: z
      .string()
      .optional()
      .describe("导图标题，默认从文本首行提取"),
    format: z
      .enum(["all", "mermaid", "html", "json", "markdown"])
      .optional()
      .default("all")
      .describe("输出格式：all=全部格式，也可指定单个格式"),
    map_type: z
      .enum(["mindmap", "flowchart", "orgchart", "tree", "fishbone"])
      .optional()
      .default("mindmap")
      .describe("导图类型：mindmap=思维导图，flowchart=流程图，orgchart=组织架构图，tree=树形图，fishbone=鱼骨图"),
  },
  async ({ text, output_dir, title, format, map_type }) => {
    try {
      const outDir = output_dir || path.join(process.cwd(), "output");
      await fs.mkdir(outDir, { recursive: true });

      const result = {
        title: title || "未命名导图",
        map_type,
        files: [],
      };

      const tasks = [];

      if (format === "all" || format === "mermaid") {
        tasks.push(
          generateMermaid(result.title, map_type, null, text).then((content) => {
            const fp = path.join(outDir, "visionmap.mmd");
            return fs.writeFile(fp, content, "utf-8").then(() => {
              result.files.push({ format: "mermaid", path: fp });
            });
          })
        );
      }

      if (format === "all" || format === "markdown") {
        tasks.push(
          generateMarkdown(result.title, map_type, null, text).then((content) => {
            const fp = path.join(outDir, "visionmap.md");
            return fs.writeFile(fp, content, "utf-8").then(() => {
              result.files.push({ format: "markdown", path: fp });
            });
          })
        );
      }

      if (format === "all" || format === "json") {
        tasks.push(
          generateJson(result.title, map_type, null, text).then((content) => {
            const fp = path.join(outDir, "visionmap.json");
            return fs.writeFile(fp, JSON.stringify(content, null, 2), "utf-8").then(() => {
              result.files.push({ format: "json", path: fp });
            });
          })
        );
      }

      if (format === "all" || format === "html") {
        tasks.push(
          generateJson(result.title, map_type, null, text).then((jsonData) =>
            generateHtml(result.title, map_type, jsonData, outDir).then((content) => {
              const fp = path.join(outDir, "visionmap.html");
              return fs.writeFile(fp, content, "utf-8").then(() => {
                result.files.push({ format: "html", path: fp });
              });
            })
          )
        );
      }

      await Promise.all(tasks);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `错误: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: list_templates ─────────────────────────────────────────────
server.tool(
  "list_templates",
  "列出 VisionMap 支持的所有导图类型和输出格式",
  {},
  async () => {
    const info = {
      map_types: [
        { id: "mindmap", name: "思维导图", description: "放射状结构，适合知识梳理、头脑风暴" },
        { id: "flowchart", name: "流程图", description: "自上而下的流程，适合步骤、决策树" },
        { id: "orgchart", name: "组织架构图", description: "层级结构，适合团队/组织展示" },
        { id: "tree", name: "树形图", description: "树状展开，适合分类、目录结构" },
        { id: "fishbone", name: "鱼骨图", description: "因果分析，适合问题根因分析" },
      ],
      output_formats: [
        { id: "mermaid", ext: ".mmd", description: "Mermaid 源码，可在 Markdown/VS Code 中预览" },
        { id: "html", ext: ".html", description: "自包含 HTML 文件，双击浏览器打开即可查看" },
        { id: "json", ext: ".json", description: "simple-mind-map 兼容格式，可导入 Web 端编辑" },
        { id: "markdown", ext: ".md", description: "Markdown 大纲格式，层级缩进文本" },
      ],
    };
    return {
      content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
    };
  }
);

// ─── 启动 ─────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("VisionMap MCP Server 已启动");
