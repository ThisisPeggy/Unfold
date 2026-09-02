# Unfold

<img src="./public/unfold-logo.png" alt="Unfold" width="128">

**Unfold your thinking.**

**让思绪可放置，让思维被看见。**

Unfold 就像一张会讲故事的白板。你可以把文字、图画和图片自由放在画布上，再安排观看顺序和镜头，让别人跟着你的思路一步步看懂。完成后，还可以把作品发布并分享出去。

## 你可以用 Unfold 做什么

- 在无限画布上书写、绘图和整理想法
- 把画布内容编排成有顺序的故事或讲解
- 为每一步设置取景范围、移动和缩放镜头
- 制作个人介绍、作品集、产品方案、课程和知识地图
- 为内容添加网站、社交账号和自定义链接
- 使用 Hermes 生成或整理画布、制作图片
- 管理多个作品，并在不同浏览器和设备间同步
- 发布只读链接，或嵌入 Notion 等页面
- 导出 PNG、SVG 和可继续编辑的 `.unfold` 文件

## Unfold 和 Excalidraw 的区别

[Excalidraw](https://github.com/excalidraw/excalidraw) 提供自由、自然的手绘画布；Unfold 在它之上增加了故事路径、镜头演示、作品管理、云同步、发布分享和 AI 创作。

简单来说：

> Excalidraw 让你把内容画出来，Unfold 让别人顺着你的思路看懂它。

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:5173`。

运行检查：

```bash
npm test
npm run build
```

## 配置云同步

Unfold 不配置云服务也可以使用，作品默认保存在当前浏览器中。需要跨设备同步和发布链接时，可以连接 Supabase。

1. 复制环境变量文件：

   ```bash
   cp .env.example .env.local
   ```

2. 填写 Supabase 项目地址和 Publishable Key：

   ```env
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

3. 输出建表 SQL，并在 Supabase SQL Editor 中执行：

   ```bash
   npm run setup:supabase
   ```

4. 重新启动开发服务，在 Unfold 中注册或登录。

云同步最多保存 10 个作品，用于多设备继续编辑，不是多人实时共同编辑。

## 连接 Hermes

Hermes 是 Unfold 的本地 AI 助手，可以根据主题生成画布、整理现有内容并返回图片。

打开右下角的 Hermes 助手，按照连接页面给出的命令安装并启动 [Unfold Hermes Connector](https://github.com/ThisisPeggy/Unfold-Hermes-Connector)，然后回到页面完成配对。

## 保存与导出

- 本地保存和云同步会保留完整画布、故事路径与镜头设置。
- `.unfold` 文件会保留完整作品，可以重新导入继续编辑和播放。
- PNG 和 SVG 是静态图片，不包含故事路径与镜头数据。

## 技术栈

- React
- Vite
- Excalidraw
- Supabase
