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
>
> ```bash
> caddy run --config Caddyfile
> ```
>
> 然后访问 https://localhost:1443

---

## 🔊 OmniVoice TTS 后端（可选）

AI 配音（声音克隆、声音设计、TTS、视频配音）依赖独立的 OmniVoice-Studio 后端服务。若不启动该服务，配音相关功能将不可用，其余功能不受影响。

```bash
# 克隆并启动 OmniVoice-Studio（默认监听 127.0.0.1:3900）
git clone https://github.com/debpalash/OmniVoice-Studio.git
cd OmniVoice-Studio
# 按其 README 启动服务后，在 vvicat 的 .env 中配置：
#   OMNIVOICE_BASE_URL=http://127.0.0.1:3900
#   OMNIVOICE_REQUEST_TIMEOUT_MS=300000
```

SDK 以 vendored 形式放在 `vendor/omnivoice-sdk/`，无需单独安装。在**设置中心 → 配音**处可测试连通性。

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
