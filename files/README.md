# 글로벌 매크로 시그널 대시보드 — Cloudflare Pages 배포판

## Netlify에서 옮긴 이유
Netlify 무료 플랜이 2026년부터 팀 단위 월간 크레딧(대역폭+배포+함수 실행 합산 300개)을 다 쓰면 프로덕션 배포 자체를 막아버리는 구조로 바뀌었습니다. Cloudflare Pages는 정적 파일 대역폭이 무제한이고, 서버리스 함수(Pages Functions)도 하루 10만 건 무료(매일 자정 UTC 초기화)라 개인 대시보드 용도로는 사실상 막힐 일이 없습니다.

## ⚠️ Netlify와 다른 점 한 가지
Cloudflare Pages는 대시보드에서 폴더를 직접 드래그 앤 드롭하는 방식으로는 `functions/` 폴더(서버리스 함수)를 인식하지 못합니다. 함수를 쓰려면 GitHub 같은 Git 저장소에 연결해야 합니다. 그래서 이번엔 "GitHub에 파일 올리기 → Cloudflare Pages가 그 저장소를 보고 자동 배포" 방식으로 안내합니다. GitHub도 브라우저에서 파일을 드래그 앤 드롭으로 올릴 수 있어서, 터미널이나 git 명령어를 몰라도 됩니다.

## 폴더 구조

```
cf-site/
├── index.html                ← 대시보드 본체
└── functions/
    └── api/
        └── fred-data.js        ← FRED 공식 API 호출 함수 (Cloudflare Pages Functions 형식)
```

## 배포 절차

**1. GitHub 저장소 만들기**
github.com 가입(무료) → 우측 상단 "+" → "New repository" → 이름 아무거나 입력(예: `macro-dashboard`) → Public 또는 Private 아무거나 선택 → "Create repository".

**2. 파일 업로드**
방금 만든 저장소 페이지에서 "uploading an existing file" 링크(또는 "Add file" → "Upload files")를 클릭 → 이 폴더(`index.html`과 `functions` 폴더가 들어있는 폴더) 전체를 끌어다 놓기 → 하단 "Commit changes" 버튼 클릭.

**3. Cloudflare 계정에서 Pages 프로젝트 만들기**
dash.cloudflare.com 가입/로그인 → 왼쪽 메뉴 "Workers & Pages" → "Create application" → "Pages" 탭 → "Connect to Git" → GitHub 계정 연결 허용 → 방금 만든 저장소 선택.

**4. 빌드 설정**
별도 빌드 과정이 없는 정적 사이트이므로, "Build command"는 비워두고 "Build output directory"는 `/`(루트, 기본값) 그대로 두고 "Save and Deploy"를 누릅니다.

**5. 환경변수 등록**
배포된 프로젝트 페이지 → "Settings" 탭 → "Environment variables" → "Add variable"
- Variable name: `FRED_API_KEY`
- Value: fredaccount.stlouisfed.org에서 발급받은 키
- 저장 후 "Save"

**6. 재배포**
환경변수 추가 후 "Deployments" 탭 → 가장 최근 배포 옆 "..." 메뉴 → "Retry deployment" (또는 GitHub 저장소에 아무 파일이나 다시 올리면 자동으로 재배포됩니다).

**7. 테스트**
`<프로젝트이름>.pages.dev` 주소로 접속해서 화면이 뜨는지, "FRED 공식 데이터 갱신" 버튼이 작동하는지 확인합니다.

## 이후 수정할 때는
파일을 고친 뒤 같은 GitHub 저장소 페이지에서 다시 "Add file" → "Upload files"로 바뀐 파일을 올리고 "Commit changes"만 누르면 됩니다. Cloudflare Pages가 자동으로 새 배포를 만듭니다 — Netlify처럼 매번 폴더를 통째로 다시 끌어다 놓을 필요 없이, 바뀐 파일만 올리면 됩니다.
