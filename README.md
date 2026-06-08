# 思维导图小助手

> 拍照/上传图片/文档，一键生成可编辑思维导图

## 功能特点

- 📷 拍照上传图片
- 📄 上传PDF、Word文档
- 🧠 智能识别内容，生成思维导图
- ✏️ 可编辑思维导图节点
- 📸 导出为图片
- 📊 支持思维导图、流程图、组织架构图

## 技术栈

- 微信小程序原生开发
- 微信云开发（云函数 + 云数据库）
- Claude API（图片/文档分析）
- Canvas（思维导图渲染）

## 项目结构

```
visionmap-miniprogram/
├── miniprogram/                    # 小程序前端
│   ├── app.js                      # 小程序入口
│   ├── app.json                    # 小程序配置
│   ├── app.wxss                    # 全局样式
│   ├── pages/
│   │   ├── index/                  # 首页
│   │   ├── result/                 # 结果页
│   │   ├── history/                # 历史记录
│   │   └── profile/                # 个人中心
│   ├── utils/
│   │   ├── api.js                  # API封装
│   │   └── util.js                 # 工具函数
│   └── images/                     # 图标资源
├── cloudfunctions/                 # 云函数
│   ├── analyze-image/              # 图片分析
│   ├── analyze-document/           # 文档分析
│   ├── generate-mindmap/           # 思维导图生成
│   ├── user-points/                # 用户积分
│   └── init-db/                    # 数据库初始化
├── project.config.json             # 项目配置
└── README.md
```

## 快速开始

### 1. 注册小程序账号

1. 访问 https://mp.weixin.qq.com/
2. 注册个人小程序账号
3. 获取 AppID

### 2. 开通云开发

1. 下载微信开发者工具
2. 新建项目，选择「微信云开发」
3. 开通云开发环境
4. 记录云开发环境ID

### 3. 配置项目

1. 打开 `project.config.json`，填入你的 AppID
2. 打开 `miniprogram/app.js`，填入云开发环境ID

### 4. 部署云函数

在微信开发者工具中：
1. 右键点击每个云函数
2. 选择「上传并部署：云端安装依赖」

### 5. 初始化数据库

1. 右键点击 `cloudfunctions/init-db`
2. 选择「云端测试」
3. 点击「执行」

### 6. 设置环境变量

在云开发控制台 → 设置 → 环境变量中添加：
- `CLAUDE_API_KEY`：你的Claude API密钥

### 7. 运行项目

在微信开发者工具中点击「编译」按钮

## 积分系统

| 行为 | 积分 |
|------|------|
| 新用户注册 | 50积分 |
| 图片转导图 | 10积分 |
| 文档转导图 | 15积分 |
| 每日签到 | 5积分 |
| 邀请好友 | 各得20积分 |

## License

MIT
