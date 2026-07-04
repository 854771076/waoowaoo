<h1 align="center">vvicat AI 影视 Studio</h1>

<p align="center">
  一款基于 AI 的短剧/漫画视频制作工具，从小说文本自动生成分镜、角色、场景，直至完整成片。
</p>

---

## ✨ 功能特性

- 🎬 **AI 剧本分析** — 自动解析小说，提取角色、场景、剧情
- 🎨 **角色 & 场景生成** — AI 生成一致性人物与场景图
- 📽️ **分镜视频制作** — 自动生成分镜头并合成视频
- 🎙️ **AI 配音** — 多角色语音合成，支持声音克隆与声音设计
- 🌐 **多语言** — 中文 / 英文界面，右上角一键切换

---

## 🚀 快速开始

**前提条件**：安装 [Docker Desktop](https://docs.docker.com/get-docker/)

### 方式一：预构建镜像（最简单）

无需克隆仓库：

```bash
curl -O https://raw.githubusercontent.com/saturndec/vvicat/main/docker-compose.yml
docker compose up -d
```

升级版本（Beta 阶段数据库不兼容，需清旧数据）：

```bash
docker compose down -v
docker rmi ghcr.io/saturndec/vvicat:latest
curl -O https://raw.githubusercontent.com/saturndec/vvicat/main/docker-compose.yml
docker compose up -d
```

> 启动后请清空浏览器缓存并重新登录，避免旧前端缓存导致异常。

### 方式二：克隆仓库 + Docker 构建

```bash
git clone https://github.com/saturndec/vvicat.git
cd vvicat
docker compose up -d
```

更新到最新版本：

```bash
git pull
docker compose down && docker compose up -d --build
```

### 方式三：本地开发模式

```bash
git clone https://github.com/saturndec/vvicat.git
cd vvicat

# 复制环境变量（必须在 npm install 之前）
cp .env.example .env
# 编辑 .env，填入 AI API Key；NEXTAUTH_URL 默认 http://localhost:3000 即可

npm install

# 启动基础设施（MySQL:13306 / Redis:16379 / MinIO:19000）
docker compose up mysql redis minio -d

# 初始化数据库（首次必须执行，否则启动后报表不存在）
npx prisma db push

# 启动开发服务器
npm run dev
```

---

访问 [http://localhost:13000](http://localhost:13000)（方式一、二）或 [http://localhost:3000](http://localhost:3000)（方式三）即可使用。

> [!TIP]
> 若网页卡顿，可能是 HTTP 下浏览器并发连接数受限。可启用 HTTPS：
> ```bash
> caddy run --config Caddyfile
> ```
> 然后访问 https://localhost:1443

---

## 🔧 API 配置

启动后进入**设置中心**配置 AI 服务的 API Key，内置配置教程。目前推荐使用各服务商官方 API，第三方 OpenAI 兼容格式支持尚在完善中。

---

## 🧰 技术栈

- **框架**：Next.js 15 + React 19（App Router）
- **数据库**：MySQL 8.0 + Prisma ORM
- **队列**：Redis + BullMQ
- **样式**：Tailwind CSS v4
- **认证**：NextAuth.js
- **国际化**：next-intl

更多架构细节见 [CLAUDE.md](CLAUDE.md)。

---

## 🖼️ 功能预览

![剧本与分镜](https://github.com/user-attachments/assets/fa0e9c57-9ea0-4df3-893e-b76c4c9d304b)
![角色与场景](https://github.com/user-attachments/assets/f2fb6a64-5ba8-4896-a064-be0ded213e42)
![编辑工作台](https://github.com/user-attachments/assets/09bbff39-e535-4c67-80a9-69421c3b05ee)
![成片导出](https://github.com/user-attachments/assets/688e3147-6e95-43b0-b9e7-dd9af40db8a0)

---

## 🔌 OmniVoice 部署（可选）

vvicat 支持接入 OmniVoice-Studio 作为第三个语音 provider（与 fal、百炼并列），覆盖 TTS、声音克隆、声音设计。

**环境变量**：

```bash
OMNIVOICE_BASE_URL=http://omnivoice-backend:3900   # 必填：服务端可达地址
OMNIVOICE_REQUEST_TIMEOUT_MS=300000                 # 可选：请求超时，默认 5 分钟
```

**部署要点**：

- SDK 已 vendored 在 `vendor/omnivoice-sdk/`（仅构建产物，约 148 KB），`npm install` 即可用，无需额外构建。
- OmniVoice 后端容器必须挂载 `omnivoice_data/` 目录，否则重启会丢失音色数据，已绑定的 voiceId 将失效。
- vvicat 后端只需能访问 OmniVoice 后端即可，**无需 API Key、无需用户端配置**，用户在声音设计对话框中选择 provider 即可使用。
- OmniVoice 后端离线时，fal / 百炼语音路径不受影响。

**健康检查**：`GET /api/providers/omnivoice/health` 返回 `{ available: true, version, device }` 即为正常。

---

## 🤝 参与贡献

本项目由核心团队独立维护。欢迎通过以下方式参与：

- 🐛 提交 [Issue](https://github.com/saturndec/vvicat/issues) 反馈 Bug
- 💡 提交 [Issue](https://github.com/saturndec/vvicat/issues) 提出功能建议
- 🔧 提交 Pull Request 供参考（团队会审阅思路，但最终自行实现修复，不直接合并外部 PR）

---

## 📈 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=saturndec/vvicat&type=date&legend=top-left)](https://www.star-history.com/#saturndec/vvicat&type=date&legend=top-left)

---

**Made with ❤️ by vvicat team**
