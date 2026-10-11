# 진행 체크리스트 (1차: Phase 1~3)

기준: `kakao-theme-studio-development-kit/WORK_PLAN.md`. 갱신일 2026-10-11.

표기: [x] 완료·검증됨 / [~] 구현했으나 기기 검증 대기 / [ ] 미착수

## 착수

- [x] 기존 저장소 확인: 초기 커밋 + 개발 키트 폴더만 존재, README·AGENTS.md·패키지 없음 → React + TS + Vite 새로 구성 (개발 키트 폴더는 그대로 보존)
- [x] Node 20.19 / pnpm 10.33 확인, `engines` 기록
- [x] Tailwind CSS v4, Radix(Dialog·Tooltip·Slider·Collapsible), Lucide, Zustand, Dexie, JSZip, Canvas
- [x] typecheck·lint(oxlint)·unit(Vitest)·E2E(Playwright)·build 스크립트
- [x] 첨부 자료 확인: 디자인 ZIP(웹·모바일 HTML), 참고 테마는 `~/Downloads`에서 발견. 무채색 레퍼런스 JPG·카카오톡 스크린샷은 폴더에 없음 → 디자인 HTML 기준으로 진행
- [x] 미확정 규격을 `docs/ktheme-format.md` 기기 검증 체크리스트로 분리

## Phase 1 — 에디터

### P1-1 도메인·기본 리소스
- [x] `ThemeConfig` schemaVersion 1, `ThemeProject`(로컬 ID `lp_`, `cloudThemeId`, 내보내기 ID `KTS_` 분리)
- [x] 기본 설정 + 자체 기본 리소스(기본 프로필·말풍선·암호 표시·테마 아이콘을 Canvas로 생성)
- [x] 요소별 기본/색상/이미지 모드, 비활성 분기 값 보존(모드 전환으로 원본 이미지가 사라지지 않음)
- [x] 지원 범위/미검증을 카탈로그(`catalog.ts`)에 근거 등급으로 명시
- [x] 미리보기·내보내기 공용 `resolveTheme()`
- [x] `migrateConfig`/`normalizeConfig`: 손상 값 복구, 미래 버전 거부

### P1-2 디자인 시스템·반응형
- [x] 화이트/옅은 회색/차콜 토큰(`src/index.css`), 초록 포인트·그라데이션 없음
- [x] 원형 아이콘 버튼, 캡슐 선택 컨트롤, 둥근 카드
- [x] 웹(≥1024px) 3영역: 요소 목록 / 미리보기(스크롤 시 고정) / 속성 패널
- [x] 모바일·태블릿: 미리보기 + 요소 칩 + 속성 바텀시트
- [x] aria-label·툴팁(한국어), 포커스 링, 44px 터치 영역, safe-area, 모션 감소
- [x] 다이얼로그·시트: 포커스 트랩, Escape, 바깥 터치, 배경 스크롤 잠금(Radix), 핸들 드래그로 닫기

### P1-3 이미지·속성 편집
- [x] 이미지 선택·검증(매직 바이트·디코딩·10MB·8192px)·교체·제거, 중복 선택 방지
- [x] Blob 에셋 저장소 + 참조 카운트 object URL(해제 포함)
- [x] 전체 색상·배경(목록 공용/대화방)·보내는/받는 말풍선
- [x] 직각/둥근/캡슐, 모서리 둥글기
- [x] 기본 프로필·상단/입력창·탭 아이콘(친구·채팅·지금(오픈채팅)·쇼핑·더보기)·암호 입력
- [x] 고급 설정(접이식): 텍스트 여백, 늘림 기준점, 연속 메시지 이미지
- [x] 편집 시 네트워크 쓰기 없음 (E2E `편집 중 서버로 요청을 보내지 않는다`)

### P1-4 미리보기
- [x] 친구: 소식·광고·업데이트 프로필·생일 없음
- [x] 채팅 목록: 안읽음 필터·광고 없음, 라이언·어피치·무지·튜브·프로도·네오 (캐릭터 그림 미사용)
- [x] 대화: 짧은/긴/연속, 수신/발신, 입력창
- [x] 프로필 있음/없음 혼합, 기본 프로필은 사진 없는 친구에게만
- [x] 암호: 숫자·취소·삭제·입력 전후, 개수만 시뮬레이션(저장 없음)
- [x] "실제 앱과 다를 수 있어요" 표기

## Phase 2 — 내보내기 엔진

- [x] 참고 archive 분석(`__MACOSX` 제외), `docs/ktheme-format.md`
- [x] 불변 스냅샷 → `buildThemePackage` → `validatePackage` → JSZip
- [x] 말풍선 이미지 생성·늘림 기준점·여백 매핑, 선택 상태 생성
- [x] 사용자 이미지 변환(cover/contain, @2x·@3x)
- [x] CSS serializer(UTF-8 BOM), manifest, 프로젝트별 고정 테마 ID
- [x] 참조 누락·경로·배율·기준점 검증, 파일명 안전화(한글 유지)
- [x] 다운로드 URL 지연 해제, 이름 확인 다이얼로그, 진행·실패 표시, 중복 클릭 방지
- [x] `.ktheme` 파일 서버 저장 없음 (생성은 브라우저에서)
- [~] **P2-3 실제 기기 검증 — 대기** (iPhone 접근 불가. `docs/ktheme-format.md` §8 체크리스트 D1~D12)

## Phase 3 — 로컬 보관·목록

- [x] Dexie `ProjectRepository`/`AssetRepository`/`SettingsRepository`, config·Blob·썸네일 별도 테이블
- [x] 저장 트랜잭션 + 낙관적 revision 충돌 감지(다른 탭 덮어쓰기 방지)
- [x] 자동 보관 debounce(0.7초) + 최대 대기(4초) + 직렬화, 탭 숨김/종료 시 추가 flush
- [x] 초기 복원 중 자동 보관 차단, 새 테마는 첫 편집/저장 시 기록
- [x] 쓰기 완료 후에만 "이 기기에 보관됨" 표시, 실패 시 오류 + 다시 시도
- [x] 스냅샷 이후 첨부된 에셋은 정리 대상에서 제외 (경쟁 조건 테스트 포함)
- [x] 내 작업: 썸네일·이름·수정일·"이 기기에 보관", 편집/내보내기/삭제 아이콘
- [x] 삭제 확인 + 해당 프로젝트 에셋·썸네일 정리
- [x] 빈 상태·불러오기 실패·이미지 누락(참조 정리 후 안내)·저장 공간 부족 메시지
- [x] 다중 프로젝트 격리 (단위 + E2E)
- [x] 로그인과 무관한 로컬 구조 (`repositories/types.ts` 인터페이스, 2차 Cloud 구현 자리)

## 1차 인계 산출물

- [x] 소스·README·실행 명령
- [x] `.env.example` (비밀값 없음)
- [x] `docs/ktheme-format.md` (+ 기기 검증 기록 표)
- [x] 진행 체크리스트 (이 문서)
- [x] `docs/verification.md` 검증 결과·제한·후속 작업

## 2차 (별도 요청 후 착수)

- [ ] Phase 4 Firebase 인증·클라우드 저장·내 테마
- [ ] Phase 5 공개 범위·공유·비로그인 다운로드
- [ ] Phase 6 공개 갤러리
