# Kakao Theme Studio

이미지 없이 색상만으로, 또는 필요한 요소에만 이미지를 올려 **카카오톡 iOS 테마(`.ktheme`)** 를 만드는 웹 앱입니다. 현재 버전은 1차 범위(Phase 1~3)로, 모든 작업이 브라우저 안에서 처리되고 이 기기(IndexedDB)에만 보관됩니다. 서버·로그인·클라우드는 연결되어 있지 않습니다.

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

환경 변수는 필요 없습니다(`.env.example` 참고).

## 기능 (1차)

- 새 테마에서 시작, 요소별 **기본(전체 색상 따름) / 색상 / 이미지** 혼합
- 전체 색상, 배경(친구·채팅 목록 공용 / 대화방), 보내는·받는 말풍선(직각·둥근·캡슐, 둥글기, 고급: 여백·늘림 기준점·연속 메시지 이미지), 상단·입력창, 기본 프로필, 탭 아이콘(친구·채팅·더보기), 암호 입력
- 친구 / 채팅 목록 / 대화 / 암호 입력 실시간 미리보기 (프로필 사진 있는 친구는 유지, 없는 친구만 기본 프로필)
- 웹: 요소 목록 · 미리보기 · 속성 패널 / 모바일: 미리보기 + 속성 바텀시트
- 자동 보관(IndexedDB), 이미지 Blob 포함 새로고침 복원, 프로젝트별 데이터 격리
- 내 작업: 편집·내보내기·삭제(아이콘), 썸네일·수정일
- `.ktheme` 생성: 말풍선·프로필·암호 리소스 Canvas 생성, @2x/@3x, manifest, 구조 검증 후 다운로드

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
e2e/                   Playwright 시나리오
docs/                  형식 조사·진행 체크리스트·검증 결과
```

데이터 원칙

- `ThemeConfig`는 직렬화 가능한 값만 담고, 이미지는 `AssetId`로만 참조합니다. Blob은 에셋 테이블에, object URL은 화면 표시용으로만 씁니다.
- 로컬 ID(`lp_…`), 클라우드 ID(`cloudThemeId`, 1차에서는 항상 `null`), `.ktheme` 테마 ID(`KTS_…`)를 구분합니다.
- 미리보기와 내보내기는 같은 `resolveTheme()` 결과를 사용합니다.
- 저장·내보내기는 실행 시점의 불변 스냅샷(`structuredClone`)으로 처리합니다.
- 저장소 코드는 `repositories/` 인터페이스 뒤에 있고, 2차 CloudRepository는 별도 모듈로 추가해 **저장/내보내기 확정 시에만** 호출하도록 설계했습니다. 자동 보관 경로(`features/editor/autosave.ts`)는 로컬 전용입니다.

## 저장 정책 (변경 금지)

| 동작 | 로컬 | 서버 쓰기 |
|---|---|---|
| 색상·이미지·속성 편집, 바텀시트 완료 | 자동 보관 | 없음 |
| 저장 버튼 | 이름 확정 + 즉시 기록 | 없음 (1차) |
| 내보내기 | 로컬 기록 후 브라우저에서 파일 생성 | 없음, `.ktheme` 파일도 보관하지 않음 |

브라우저 데이터 삭제·시크릿 모드·저장 공간 정리로 로컬 작업이 사라질 수 있습니다. 명시적 저장 시 `navigator.storage.persist()`를 요청하지만 무기한 보존을 보장하지 않습니다.

## 문서

- [`docs/ktheme-format.md`](docs/ktheme-format.md) — 형식 조사, 리소스 매핑, 근거 등급, 기기 검증 체크리스트
- [`docs/progress.md`](docs/progress.md) — 진행 체크리스트
- [`docs/verification.md`](docs/verification.md) — 실제 실행한 검증 결과, 제한, 후속 작업
- `kakao-theme-studio-development-kit/` — 요구사항(PROJECT_SPEC), 작업 계획(WORK_PLAN), 디자인 시안
