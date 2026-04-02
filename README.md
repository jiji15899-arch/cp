# ☁ CloudPress — 실제 WordPress 호스팅 플랫폼

Cloudflare Pages + Workers + D1 + InstaWP API 기반의 **실제 작동하는** WordPress 호스팅 플랫폼입니다.

## 📁 프로젝트 구조

```
cloudpress/
├── functions/                  # Cloudflare Pages Functions (실제 백엔드)
│   ├── _lib/utils.js           # 공통 유틸리티
│   └── api/
│       ├── auth/
│       │   ├── register.js     # 회원가입 API
│       │   ├── login.js        # 로그인 API
│       │   ├── logout.js       # 로그아웃 API
│       │   └── me.js           # 세션 검증 API
│       ├── sites/
│       │   ├── index.js        # 사이트 목록/생성 API
│       │   └── [id].js         # 사이트 상세/삭제/도메인 API
│       └── user/
│           └── index.js        # 프로필 조회/수정 API
├── public/                     # 정적 파일 (프론트엔드)
│   ├── app.js                  # 실제 API 호출 (localStorage 제거)
│   ├── index.html              # 랜딩 페이지
│   ├── auth.html               # 로그인/회원가입
│   ├── dashboard.html          # 대시보드
│   ├── create.html             # WordPress 개설 위저드
│   ├── site.html               # 사이트 상세 (커스텀 도메인)
│   ├── account.html            # 계정 설정
│   └── ...
├── schema.sql                  # D1 데이터베이스 스키마
└── wrangler.toml               # Cloudflare 설정
```

---

## 🚀 배포 단계 (처음 설정)

### 1단계: InstaWP API 키 발급 (실제 WordPress 개설용)

1. [app.instawp.io](https://app.instawp.io) 회원가입
2. 대시보드 → **API** → **Generate API Token**
3. 발급된 키 복사 (나중에 환경변수에 입력)

### 2단계: Cloudflare D1 데이터베이스 생성

```bash
# Wrangler 설치
npm install -g wrangler

# Cloudflare 로그인
wrangler login

# D1 데이터베이스 생성
wrangler d1 create cloudpress-db
```

출력된 `database_id`를 `wrangler.toml`의 `YOUR_D1_DATABASE_ID`에 입력:

```toml
[[d1_databases]]
binding = "DB"
database_name = "cloudpress-db"
database_id = "여기에-database_id-입력"
```

### 3단계: KV 네임스페이스 생성 (세션 저장용)

```bash
wrangler kv:namespace create SESSIONS
```

출력된 `id`를 `wrangler.toml`의 `YOUR_KV_NAMESPACE_ID`에 입력:

```toml
[[kv_namespaces]]
binding = "SESSIONS"
id = "여기에-namespace-id-입력"
```

### 4단계: 데이터베이스 스키마 초기화

```bash
wrangler d1 execute cloudpress-db --file=schema.sql
```

### 5단계: Cloudflare Pages 프로젝트 생성 및 배포

```bash
# Git 저장소 초기화
git init
git add .
git commit -m "CloudPress 초기 배포"

# GitHub에 push 후 Cloudflare Pages에서 연결:
# Pages → Create project → Connect to Git
# Build output directory: public
# Functions directory: functions (자동 감지)
```

### 6단계: 환경 변수 설정

Cloudflare Dashboard → Pages → 프로젝트 → **Settings** → **Environment variables**:

| 변수명 | 값 | 필수 |
|--------|-----|------|
| `INSTAWP_API_KEY` | InstaWP API 키 | ✅ WordPress 개설용 |
| `JWT_SECRET` | 랜덤 문자열 (32자+) | ✅ 세션 보안 |
| `SITE_DOMAIN` | `cloudpress.site` | ✅ 서브도메인 도메인 |
| `CF_API_TOKEN` | Cloudflare API 토큰 | ⚡ 커스텀 도메인 DNS용 |
| `CF_ZONE_ID` | Cloudflare Zone ID | ⚡ 커스텀 도메인 DNS용 |

> **InstaWP API 키 없이도 동작합니다.** API 키 없으면 데모 모드로 실행되며 가짜 크리덴셜이 생성됩니다. 실제 WordPress 인스턴스를 원하면 InstaWP 키가 필요합니다.

---

## ✅ 실제로 작동하는 기능 목록

| 기능 | 방식 |
|------|------|
| 회원가입/로그인 | Cloudflare D1 (SQLite) |
| 세션 유지 | Cloudflare KV (7일) |
| WordPress 개설 | InstaWP API v2 |
| 서브도메인 | DB 저장 + InstaWP 실제 URL |
| 커스텀 도메인 | Cloudflare DNS API (CNAME) |
| 사이트 삭제 | InstaWP 삭제 + DB 삭제 |
| 비밀번호 변경 | SHA-256 해시, D1 저장 |
| 프로비저닝 폴링 | 실시간 상태 확인 |

---

## 🔑 커스텀 도메인 설정 방법 (사용자 입장)

1. 도메인 DNS에서 CNAME 추가:
   - 이름: `www` (또는 서브도메인)
   - 값: `[내서브도메인].cloudpress.site`
2. CloudPress 대시보드 → 사이트 상세 → 커스텀 도메인 입력 → 저장

---

## 🛠️ 로컬 개발

```bash
# 로컬에서 Pages Functions 포함 실행
npx wrangler pages dev public --d1 DB=cloudpress-db --kv SESSIONS=YOUR_KV_ID
```

---

## ⚙️ 기술 스택

| 항목 | 기술 |
|------|------|
| 프론트엔드 | HTML/CSS/JS (정적) |
| 백엔드 | Cloudflare Pages Functions (Workers) |
| 데이터베이스 | Cloudflare D1 (SQLite) |
| 세션 | Cloudflare KV |
| WordPress 프로비저닝 | InstaWP API v2 |
| DNS 자동화 | Cloudflare DNS API |
| 인증 | SHA-256 + Bearer Token |
