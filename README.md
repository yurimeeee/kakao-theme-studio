# Kakao Theme Studio

이미지 없이 색상만으로, 또는 필요한 요소에만 이미지를 올려 **카카오톡 iOS 테마(`.ktheme`)** 를 만드는 웹 앱입니다.

- 1차(Phase 1~3): 에디터·미리보기·`.ktheme` 생성·이 기기(IndexedDB) 보관. Firebase 설정 없이 그대로 동작합니다.
- 2차(Phase 4~6): 로그인(이메일·Google·카카오), 저장할 때만 클라우드 보관, 공개 범위·링크 공유, 공개 갤러리. Firebase 설정이 있을 때만 나타납니다. 실제 Firebase 프로젝트(`kakao-theme-studio`)에 배포되어 있고, **카카오 로그인은 아직 설정 전**입니다 → [`docs/cloud.md`](docs/cloud.md).

운영 주소: https://kakao-theme-studio.vercel.app — GitHub `main`에 푸시하면 Vercel이 자동으로 프로덕션 배포합니다([배포](#배포)).

> `.ktheme` 파일은 참고 테마 구조를 기준으로 생성·검증되지만, **실제 iPhone 카카오톡 적용은 아직 기기 검증 대기**입니다. 자세한 근거와 체크리스트는 [`docs/ktheme-format.md`](docs/ktheme-format.md).

## 실행

요구: Node.js 20.19 이상, pnpm 10.

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

| 명령 | 내용 |
|---|---|
| `pnpm dev` | 개발 서버 |
| `pnpm build` | 타입 검사 + 프로덕션 빌드 (`dist/`) |
| `pnpm preview` | 빌드 결과 미리보기 |
| `pnpm typecheck` | TypeScript (앱·E2E·설정) |
| `pnpm lint` | oxlint |
| `pnpm test` | 단위 테스트 (Vitest + fake-indexeddb) |
| `pnpm e2e` | E2E (Playwright Chromium, 빌드 후 `preview`로 실행). 최초 1회 `pnpm exec playwright install chromium` |
| `pnpm check` | typecheck → lint → test → build |
| `pnpm emulators` | Firebase 에뮬레이터 (Auth·Firestore·Storage·Functions). Java 21+ 필요 |
| `pnpm dev:cloud` | 에뮬레이터에 연결된 개발 서버 (`.env.emulator`) |
| `pnpm test:cloud` | 에뮬레이터 통합 테스트: 보안 규칙·클라우드 저장·공유·갤러리·함수 |
| `pnpm e2e:cloud` | 에뮬레이터 + 브라우저 E2E: 로그인·저장·공유·계정 전환·충돌 |
| `pnpm --dir functions test` | Cloud Functions 단위 테스트 (카카오 교환·다운로드 중복 키) |

로컬 전용으로 쓸 때는 환경 변수가 필요 없습니다. 클라우드 설정은 `.env.example`과 [`docs/cloud.md` §9](docs/cloud.md)를 참고하세요. 클라우드 명령은 최초 1회 `pnpm --dir functions install`이 필요합니다.

## 기능 (1차)

- 새 테마에서 시작, 요소별 **기본(전체 색상 따름) / 색상 / 이미지** 혼합
- 전체 색상, 배경(친구·채팅 목록 공용 / 대화방), 보내는·받는 말풍선(직각·둥근·캡슐, 둥글기), 상단·입력창, 기본 프로필, 테마 아이콘(직접 올리거나 색상으로 자동 생성), 탭 아이콘(친구·채팅·지금(오픈채팅)·쇼핑·더보기), 암호 입력
- 이미지 말풍선: 이미지 위에서 늘림 기준점(십자선)·텍스트 여백(점선 상자)을 드래그로 조절, 장식에 걸리면 경고, 표시 크기(20~300%), 연속 메시지 이미지별 기준점·여백
- 친구 / 채팅 목록 / 대화 / 암호 입력 실시간 미리보기 (프로필 사진 있는 친구는 유지, 없는 친구만 기본 프로필)
- 웹: 요소 목록 · 미리보기 · 속성 패널 / 모바일: 미리보기 + 속성 바텀시트
- 자동 보관(IndexedDB), 이미지 Blob 포함 새로고침 복원, 프로젝트별 데이터 격리
- 내 작업: 편집·내보내기·삭제(아이콘), 썸네일·수정일
- `.ktheme` 생성: 말풍선·프로필·암호 리소스 Canvas 생성, @2x/@3x, manifest, 구조 검증 후 다운로드

## 기능 (2차, Firebase 설정 시)

- 로그인: 이메일 회원가입·로그인·비밀번호 재설정, Google, 카카오(서버에서 인가 코드 검증 → 커스텀 토큰)
- 로그인·편집만으로는 아무것도 올리지 않음. **저장/내보내기 확정 때만** 원본 이미지(Storage)·설정(Firestore) 저장, 리비전 승격·충돌 감지(덮어쓰지 않음)
- 내 작업 → 클라우드 탭: 다른 기기에서 이어서 편집, 내보내기, 공유, 삭제
- 공개 범위 비공개 / 링크 공개 / 공개, 링크 복사·변경. 공개·링크 공개 테마는 비로그인으로 보고 `.ktheme` 다운로드(다운로드해도 내 프로젝트를 만들지 않음)
- 둘러보기: 공개 테마만, 이름 부분 검색, 최신순·인기순(하루 1회 중복 제외 다운로드 수), 더 보기
- 로그아웃·계정 변경 시 다른 계정의 로컬 사본 숨김(선택 시 삭제)

## 배포

- **웹**: Vercel 프로젝트 `kakao-theme-studio`가 GitHub 저장소와 연결되어 `main` 푸시마다 프로덕션 배포합니다. 빌드 설정은 Vite 기본값이고, `vercel.json`이 모든 경로를 `index.html`로 보냅니다(카카오 콜백 `/auth/kakao/callback`용, 없는 `/assets/*`는 404). 환경 변수 `VITE_FIREBASE_*`는 Vercel 프로젝트 설정(Production·Preview)에 있습니다.
- **백엔드**: 규칙·인덱스·Storage·Cloud Functions는 Firebase CLI로 배포합니다 → [`docs/cloud.md` §9](docs/cloud.md).
- 새 배포 도메인을 쓰면 Firebase Authentication의 승인된 도메인에 추가해야 Google 로그인이 됩니다.

## 구조

```text
src/
  app/                 라우팅(hash)·서비스 조립·에러 경계
  components/ui/       공통 접근성 컴포넌트 (IconButton, Segmented, Sheet, Dialog, ColorField …)
  domain/theme/        ThemeConfig 타입·기본값·정규화/마이그레이션·resolveTheme
  assets/              이미지 검증·해시·가져오기·object URL 수명 관리
  repositories/        저장소 인터페이스 + local/(Dexie) 구현
  exporters/ktheme/    리소스 카탈로그·Canvas 생성·CSS serializer·패키지 검증·ZIP
  features/editor/     에디터 화면·속성 패널·Zustand 스토어·자동 보관
  features/preview/    카카오톡 화면 렌더러
  features/projects/   내 작업·이름 다이얼로그·썸네일
  features/export/     스냅샷 → 내보내기 서비스
  cloud/               (2차) Firebase 설정·초기화(지연 로드)·인증·모델
  repositories/cloud/  (2차) CloudThemeRepository·ShareRepository
  features/auth|sharing|gallery|cloud/  (2차) 로그인, 공유·상세, 갤러리, 에디터↔클라우드
functions/             (2차) Cloud Functions: kakaoSignIn, recordDownload, 삭제 정리
firestore.rules · storage.rules · firestore.indexes.json · firebase.json
e2e/                   Playwright 시나리오 (로컬 전용 빌드)
e2e-cloud/             Playwright 시나리오 (에뮬레이터)
docs/                  형식 조사·진행 체크리스트·검증 결과
```

데이터 원칙

- `ThemeConfig`는 직렬화 가능한 값만 담고, 이미지는 `AssetId`로만 참조합니다. Blob은 에셋 테이블에, object URL은 화면 표시용으로만 씁니다.
- 로컬 ID(`lp_…`), 클라우드 ID(`cloudThemeId`), 공유 링크 ID(`shareId`), `.ktheme` 테마 ID(`KTS_…`)를 구분합니다.
- 미리보기와 내보내기는 같은 `resolveTheme()` 결과를 사용합니다.
- 저장·내보내기는 실행 시점의 불변 스냅샷(`structuredClone`)으로 처리합니다.
- 클라우드 코드는 `repositories/cloud`·`cloud/`에 분리되어 있고 **저장/내보내기 확정 시에만** 호출됩니다. 자동 보관 경로(`features/editor/autosave.ts`)는 로컬 전용입니다. Firebase SDK는 동적 import로 나눠 시작 시 인증 부분만(gzip ≈33kB) 불러옵니다.

## 저장 정책 (변경 금지)

| 동작 | 로컬 | 서버 쓰기 |
|---|---|---|
| 색상·이미지·속성 편집, 바텀시트 완료 | 자동 보관 | 없음 |
| 로그인 | 기존 작업 유지 | 없음 |
| 저장 버튼 (비로그인) | 이름 확정 + 즉시 기록 | 없음 |
| 저장 버튼 (로그인) | 이름 확정 + 즉시 기록 | 원본 이미지·설정 저장 |
| 내보내기 (비로그인) | 로컬 기록 후 브라우저에서 파일 생성 | 없음 |
| 내보내기 (로그인) | 로컬 기록 | 클라우드 저장 성공 후 파일 생성 (실패 시 우회하지 않음) |
| 공개 테마 다운로드 | 프로젝트 만들지 않음 | 다운로드 집계만 |

`.ktheme` 파일 자체는 어디에도 보관하지 않고 필요할 때 브라우저에서 만듭니다.

브라우저 데이터 삭제·시크릿 모드·저장 공간 정리로 로컬 작업이 사라질 수 있습니다. 명시적 저장 시 `navigator.storage.persist()`를 요청하지만 무기한 보존을 보장하지 않습니다.

## 문서

- [`docs/ktheme-format.md`](docs/ktheme-format.md) — 형식 조사, 리소스 매핑, 근거 등급, 기기 검증 체크리스트
- [`docs/cloud.md`](docs/cloud.md) — 2차 설계: 데이터 모델, 저장 프로토콜, 공유·갤러리, 인증, 보안 규칙, 배포 체크리스트
- [`docs/progress.md`](docs/progress.md) — 진행 체크리스트
- [`docs/verification.md`](docs/verification.md) — 실제 실행한 검증 결과, 제한, 후속 작업
- `kakao-theme-studio-development-kit/` — 요구사항(PROJECT_SPEC), 작업 계획(WORK_PLAN), 디자인 시안
