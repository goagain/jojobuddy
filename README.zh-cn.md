# JoJobuddy

[English](./README.md)

个人 AI 简历工作台：**白金之星（Star Platinum）** 按 JD 定制母简历；**天堂之门（Heaven's Door）** 做 ATS 评分并驱动自循环优化。

## 功能

- **工作台** — 选择档案 + 职位，生成定制简历，查看分数与各轮迭代结果。
- **档案库** — 上传或粘贴母简历（Word / PDF / Markdown）；可导出 JSON / Markdown。
- **职位库** — 粘贴 JD 或解析招聘链接；支持标题、公司、地点、时间筛选；可清理 30 天前的职位。
- **链接解析** — Apple、LinkedIn、TikTok 等站点适配器；复杂页面用 Playwright（Chromium）兜底。
- **LLM 设置** — 生成器与评判器可分别配置模型；管理员可设**全局**模型（已有全局模型时不会自动添加个人 Mock）。
- **界面语言** — 英文 / 简体中文。

## 技术栈

- Next.js 16 · React 19 · Tailwind CSS 4
- MongoDB
- 后台 worker（抓取链接、解析简历、生成任务）
- Playwright（Chromium）抓取 SPA / 反爬职位页

## 本地开发

**环境：** Node.js 24+，Docker（跑 MongoDB）。

```bash
cp .env.example .env.local
# 配置 MONGODB_URI、AUTH_SECRET（见下方环境变量）

docker compose up -d mongo
npm install
npm run playwright:install   # 首次需要，用于 URL 解析兜底
npm run dev:web              # 终端 1 — http://localhost:3000
npm run dev:worker           # 终端 2 — 解析 / 生成必须开 worker
```

`npm run dev` 会通过 `scripts/boot.mjs` 同时启动 web 与 worker。

### 测试

```bash
npm test
```

## Docker 部署

同一镜像，通过 `JOJOBUDDY_ROLE` 区分角色（`web` | `worker`）。

```bash
cp .env.example .env
# 设置 AUTH_SECRET（可选 Google OAuth）

docker compose up -d --build
```

拉取已发布镜像：

```bash
export JOJOBUDDY_IMAGE=ghcr.io/goagain/jojobuddy:latest
docker compose up -d
```

## NAS / 生产环境

使用 [`docker-compose.nas.yml`](./docker-compose.nas.yml)，需已有外部网络 `reverse_proxy`（如 Caddy）。建议 pin 版本号：

```bash
export JOJOBUDDY_IMAGE=ghcr.io/goagain/jojobuddy:v0.0.25
docker compose -f docker-compose.nas.yml pull
docker compose -f docker-compose.nas.yml up -d
```

The `release` branch has compose files pinned to each tagged release.

## 发布版本

在 GitHub Actions 中手动运行 **Release** 工作流（`workflow_dispatch`）：

1. CI 跑单元测试。
2. 构建并推送 `ghcr.io/goagain/jojobuddy:vX.Y.Z`。
3. 创建 Git tag 与 GitHub Release；更新 `release` 分支（见下）。

版本列表：[GitHub Releases](https://github.com/goagain/jojobuddy/releases)

### `release` 分支

仓库有两条部署线：

| 分支 | Compose 默认镜像 | 用途 |
|------|------------------|------|
| `main` | `:latest` | 持续更新，始终跟随 `main` 最新构建。 |
| `release` | `:vX.Y.Z`（已 pin） | 稳定部署，仅在运行 Release 工作流时更新。 |

Release 成功后，CI 会：

1. 在 `release` 分支上检出本次发布的 commit。
2. 将 `docker-compose.yml` 与 `docker-compose.nas.yml` 里的默认 `JOJOBUDDY_IMAGE` 改为 `ghcr.io/goagain/jojobuddy:vX.Y.Z`。
3. 提交 pin、在 pin commit 上打 tag **`vX.Y.Z`**，并 force-push `release`。

因此 **`main` 继续用 `:latest`**；**`release` + git tag** 给 NAS / Portainer 提供可复现的 compose 默认值。

**从 release 分支部署**（无需手动 export `JOJOBUDDY_IMAGE`）：

```bash
git fetch origin release
git checkout release
docker compose -f docker-compose.nas.yml pull
docker compose -f docker-compose.nas.yml up -d
```

或在 Portainer 里使用 `release` 分支的 `docker-compose.nas.yml`，默认已是最近一次发布的版本号。

若要固定更旧的版本，checkout tag `vX.Y.Z`，或显式设置 `JOJOBUDDY_IMAGE`。

**发起新版本**（GitHub → Actions → Release → Run workflow，版本号如 `0.0.26`）：

```bash
gh workflow run release.yml -f version=0.0.26
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `MONGODB_URI` | 是 | MongoDB 连接串 |
| `AUTH_SECRET` | 是 | 会话签名密钥（长随机串） |
| `AUTH_URL` | 是 | 对外访问地址，如 `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | 否 | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | 否 | Google OAuth |
| `JOJOBUDDY_ROLE` | Docker | `web`、`worker`，或不设（单容器 web + worker） |
| `JOJOBUDDY_IMAGE` | Compose | 覆盖 compose 中的镜像 tag |

默认值见 [`.env.example`](./.env.example)。

## CI

- 推送到 `main` / `master` 或 tag `v*` → 构建并发布 `ghcr.io/<owner>/<repo>:latest`
- Pull Request → 仅构建，不推送镜像

## 许可

私有项目，自用风险自负。
