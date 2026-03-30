# Light OSS MVP

轻量对象存储服务 MVP，包含 React 管理台、Go API、MySQL 元数据和本地文件系统对象内容存储。

## 项目结构

```text
.
├─ backend/
├─ frontend/
├─ docker-compose.yml
├─ Makefile
└─ .env.example
```

## 功能清单

- Bucket 创建与列表
- 对象上传、下载、HEAD、分页列表、软删除
- public/private 可见性
- private 对象签名下载 URL
- Bearer Token 鉴权
- 上传体积限制、基础限速、结构化日志、request_id
- React 管理台：设置页、Bucket 页、对象页、上传进度、错误 toast

## 环境变量

1. 复制环境模板：

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

2. 根据需要修改 `.env` 中的 Token、签名密钥和数据库密码。

```text
host: localhost
port: 3306
username: root
password: 112233ss
database: light-oss
```

对应 `DB_DSN`：

```text
root:112233ss@tcp(localhost:3306)/light-oss?charset=utf8mb4&parseTime=True&loc=UTC
```

## 本地运行

### 后端

前提：安装 Go 1.22+ 和 MySQL 8+。

```bash
cd backend
go test ./...
go run ./cmd/server
```

### 前端

前提：安装 Node.js 20+。

```bash
cd frontend
npm install
npm test
npm run dev
```

默认前端地址：`http://localhost:3000`

## Docker 运行

1. 准备环境变量：

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

2. 一键启动：

```bash
docker compose up --build
```

服务默认地址：

- 前端：`http://localhost:3000`
- 后端：`http://localhost:8080`
- MySQL：`localhost:3306`

## API 文档与数据库

- OpenAPI：`backend/docs/openapi.yaml`
- Migration SQL：`backend/migrations/000001_init.up.sql`

## curl 示例

### 1. 健康检查

```bash
curl http://localhost:8080/healthz
```

### 2. 创建 Bucket

```bash
curl -X POST http://localhost:8080/api/v1/buckets \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"name":"demo-bucket"}'
```

### 3. Bucket 列表

```bash
curl http://localhost:8080/api/v1/buckets \
  -H "Authorization: Bearer dev-token"
```

### 4. 上传 public 对象

```bash
curl -X PUT "http://localhost:8080/api/v1/buckets/demo-bucket/objects/docs/hello.txt" \
  -H "Authorization: Bearer dev-token" \
  -H "X-Object-Visibility: public" \
  -H "X-Original-Filename: hello.txt" \
  -H "Content-Type: text/plain" \
  --data-binary "hello world"
```

### 5. 上传 private 对象

```bash
curl -X PUT "http://localhost:8080/api/v1/buckets/demo-bucket/objects/private/secret.txt" \
  -H "Authorization: Bearer dev-token" \
  -H "X-Object-Visibility: private" \
  -H "X-Original-Filename: secret.txt" \
  -H "Content-Type: text/plain" \
  --data-binary "secret"
```

### 6. 匿名下载 public 对象

```bash
curl "http://localhost:8080/api/v1/buckets/demo-bucket/objects/docs/hello.txt"
```

### 7. HEAD 对象元数据

```bash
curl -I "http://localhost:8080/api/v1/buckets/demo-bucket/objects/docs/hello.txt"
```

### 8. 列出对象

```bash
curl "http://localhost:8080/api/v1/buckets/demo-bucket/objects?prefix=docs/&limit=10" \
  -H "Authorization: Bearer dev-token"
```

### 9. 生成私有对象签名下载 URL

```bash
curl -X POST http://localhost:8080/api/v1/sign/download \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"bucket":"demo-bucket","object_key":"private/secret.txt","expires_in_seconds":300}'
```

### 10. 删除对象

```bash
curl -X DELETE "http://localhost:8080/api/v1/buckets/demo-bucket/objects/docs/hello.txt" \
  -H "Authorization: Bearer dev-token"
```

## 前端使用说明

1. 打开 `/settings` 页面，确认 API Base URL 和 Bearer Token。
2. 进入 `/buckets` 页面创建或查看 Bucket。
3. 进入具体 Bucket 页面上传对象、筛选 prefix、分页查看、删除对象。
4. public 对象可直接下载；private 对象点击“签名下载”生成临时链接。

## 已知限制

- 仅支持单机本地文件系统存储，不适合多副本部署。
- 对象覆盖上传后，旧物理文件不会即时 GC。
- 不包含用户系统、ACL、分片上传、对象版本控制。
- Bucket 删除接口未实现。

## 调试命令

```bash
cd backend && go test ./...
cd frontend && npm test
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mysql
```

## Bucket Website Hosting MVP

This repository now supports bucket-backed website hosting for public static assets.

### Deployment topology

- `console.underhear.cn` -> frontend console
- `api.underhear.cn` -> backend API
- `*.underhear.cn` -> backend website hosting resolver

Use the new `gateway` container as the only public entrypoint on port `80`.

### Upload a site build

Upload your Vue or React `dist/` output into a bucket prefix, for example:

- bucket: `websites`
- prefix: `demo/`

Typical object keys:

- `demo/index.html`
- `demo/assets/index.js`
- `demo/assets/index.css`

All website files must be uploaded as `public`.

### Create a site binding

Create a site that binds a domain to a bucket prefix:

```bash
curl -X POST http://api.underhear.cn/api/v1/sites \
  -H "Authorization: Bearer light-oss" \
  -H "Content-Type: application/json" \
  -d '{
    "bucket": "websites",
    "root_prefix": "demo/",
    "index_document": "index.html",
    "error_document": "404.html",
    "spa_fallback": true,
    "domains": ["demo.underhear.cn"]
  }'
```

After that:

- `http://demo.underhear.cn/` -> `websites/demo/index.html`
- `http://demo.underhear.cn/assets/index.js` -> `websites/demo/assets/index.js`

### Gateway notes

The Nginx gateway does not map domains to buckets directly. It only preserves the incoming `Host` header and proxies requests to the backend. The backend resolves `Host -> site -> bucket + prefix`.

This MVP only handles HTTP. DNS, HTTPS certificates, and TLS termination should be managed separately when you move beyond local validation.

## 常见问题

### 前端提示 401

检查 `/settings` 中的 Bearer Token 是否和 `.env` 的 `APP_BEARER_TOKENS` 一致。

### 私有对象下载失败

确认使用 Bearer Token 下载，或通过 `/api/v1/sign/download` 获取未过期的签名 URL。

### Docker 无法启动

确认 Docker Desktop 已启动，且已先复制 `.env.example` 为 `.env`。
