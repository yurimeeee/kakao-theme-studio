# 2차 클라우드 설계 (Phase 4~6)

작성일 2026-10-11. 요구사항 기준은 `kakao-theme-studio-development-kit/PROJECT_SPEC.md` §9·§11~13, 작업 계획은 `WORK_PLAN.md` §8~11.

> 이 문서의 모든 동작은 **Firebase Emulator Suite(`demo-kakao-theme-studio`)** 에서 구현·검증했습니다. 실제 Firebase 프로젝트 생성·배포, 카카오 앱 등록, 요금제·예산 설정은 계정 작업이라 하지 않았습니다(§9 체크리스트).

## 1. 저장 정책 → 구현 위치

| 동작 | 로컬 | 클라우드 쓰기 | 구현 |
|---|---|---|---|
| 색상·이미지·속성 편집, 바텀시트 완료 | 자동 보관 | **없음** | `features/editor/autosave.ts` (Firebase를 import하지 않음) |
| 로그인 | 기존 작업 유지 | **없음** | `features/auth/*` — 작업 업로드 코드 없음 |
| 저장 (비로그인) | 확정 | 없음 | `EditorPage.confirmSave` |
| 저장 (로그인) | 확정 | 이미지·설정 저장 | `cloudSync.saveOpenProjectToCloud` |
| 내보내기 (로그인) | 유지 | 저장 **성공 후** 파일 생성. 실패 시 로컬 전용으로 우회하지 않음 | `EditorPage.confirmExport` |
| 내보내기 (비로그인) | 유지 | 없음 | 1차와 동일 |
| 공개 범위 변경 | — | 확인 버튼에서만 | `ShareDialog` → `ShareRepository.setVisibility` |
| 타인 공개 테마 다운로드 | 프로젝트 생성 없음 | 다운로드 집계 호출만 | `ThemeDetailPage` → `exportSharedTheme` |

E2E `로그인·편집만으로는 업로드하지 않고…` 가 편집·자동 보관·로그인 동안 Firestore/Storage/Functions 요청이 **0건**인지 실제 브라우저에서 확인합니다.

`.ktheme` 파일은 서버에 보관하지 않습니다. 로컬 프로젝트, 내 클라우드 테마, 공유 테마 모두 같은 엔진(`exportConfig`)으로 브라우저에서 만듭니다.

## 2. 구조

```text
src/cloud/
  config.ts          VITE_ 설정 읽기 (Firebase 미설정이면 null → 로컬 전용)
  firebaseAuth.ts    App + Auth 초기화 (에뮬레이터 연결 포함)
  firebase.ts        Firestore·Storage·Functions 추가
  authRuntime.ts     시작 시 동적 import: 로그인 상태 확인용 (gzip ≈33kB)
  runtime.ts         첫 클라우드 사용 시 동적 import: 데이터 SDK + 저장소 (gzip ≈149kB)
  auth.ts            이메일·Google·카카오 로그인, 오류 문구
  model.ts           문서/경로 모델, 검색 토큰, 공유 ID
  errors.ts          CloudError + 한국어 문구
src/repositories/cloud/
  cloudThemes.ts     CloudThemeRepository — 저장(리비전 승격)·목록·삭제·정리
  shares.ts          ShareRepository — 공개 범위·공유 사본·갤러리·다운로드 집계
src/features/
  auth/              세션 스토어, 로그인/계정 다이얼로그, 카카오 콜백
  cloud/cloudSync.ts 에디터 ↔ 클라우드 (저장, 클라우드에서 열기, 내보내기)
  sharing/           공유 설정 다이얼로그, 테마 상세(#/t/{shareId})
  gallery/           둘러보기(#/gallery)
  projects/          내 작업 — 이 기기 / 클라우드 탭
functions/src/       kakaoSignIn, recordDownload, onThemeDeleted, onShareDeleted, onShareWritten
firestore.rules · storage.rules · firestore.indexes.json · firebase.json
```

로컬 저장소(`repositories/local`)와 클라우드 코드는 섞이지 않습니다. 클라우드 연결 정보는 `ThemeProject`의 `cloudThemeId`·`cloudOwnerId`·`cloudRevisionId` 세 필드뿐이며 IndexedDB v2에서 `cloudThemeId` 인덱스를 추가했습니다(기존 행은 `null`로 읽음).

## 3. 데이터 모델

```text
Firestore
  users/{uid}                              displayName, updatedAt (명시적 저장 때만 기록)
  themes/{themeId}                         소유자 전용 작업본
    ownerId, name, visibility, shareId, activeRevisionId, previousRevisionId,
    schemaVersion, config, assetManifest, exportThemeId, thumbnailPath, createdAt, updatedAt
  themes/{themeId}/revisions/{revisionId}  ownerId, name, config, assetManifest, thumbnailPath, baseRevisionId, createdAt
  shares/{shareId}                         공개/링크 공개 사본 (비공개면 문서 없음)
    ownerId, themeId, status(preparing|ready), visibility(public|unlisted), name, ownerName,
    config(사용 중인 이미지만), assetManifest, exportThemeId, revisionId, thumbnailPath,
    searchTokens[](서버 전용), downloadCount(서버 전용), publishedAt, updatedAt
  downloadMarks/{markId}                   서버 전용 (다운로드 중복 방지, TTL expiresAt)

Storage
  users/{uid}/themes/{themeId}/assets/{sha256}.{png|jpg|webp}
  users/{uid}/themes/{themeId}/thumbnails/{revisionId}.png
  shares/{shareId}/assets/{sha256}.{ext}
  shares/{shareId}/thumbnails/{revisionId}.png
```

- Firestore에는 이미지·Base64를 넣지 않습니다. `assetManifest`는 `AssetId → {hash, ext, mime, width, height, size, name, path}` 메타데이터입니다.
- **명세와 다른 점**: 명세 예시는 `themes/{themeId}/revisions/{revisionId}/assets/{hash}`였지만, 원본을 테마 단위 해시 경로에 두어 리비전 간 같은 이미지를 다시 올리지 않게 했고, 경로에 `uid`를 넣어 Storage 규칙이 Firestore 조회 없이 소유자를 확인합니다.
- 다른 기기에서 열 때 `AssetId`는 로컬에서 새로 발급하고 설정의 참조를 바꿉니다(`mapAssetRefs`).

## 4. 저장 프로토콜 (Phase 4)

여러 파일 업로드와 Firestore 쓰기는 원자적이지 않으므로 다음 순서를 지킵니다.

1. 기준 리비전 확인(빠른 실패): 연결된 테마가 없어졌으면 `gone`, `activeRevisionId ≠ cloudRevisionId`면 `conflict`.
2. 활성·직전 리비전에 없는 해시만 업로드(`customMetadata.sha256`). 재시도해도 같은 경로라 멱등입니다.
3. 새 리비전 썸네일 업로드.
4. **트랜잭션**: 기준 리비전을 다시 확인하고 `revisions/{new}` 생성 + `activeRevisionId` 승격(`previousRevisionId` 보존).
5. 정리(실패해도 저장은 성공): 활성·직전 리비전이 참조하지 않는 파일과 그 밖의 리비전 문서를 삭제. **10분 이내 파일은 남김**(다른 기기의 진행 중 업로드 보호).

- 4 이전 실패 → 기존 활성 리비전은 그대로입니다. 올라간 파일은 지우지 않고(직전 리비전·동시 저장과 경로를 공유할 수 있음) 다음 성공 저장의 정리 단계가 제거합니다.
- 충돌은 덮어쓰지 않습니다. 에디터에서 **클라우드 버전 불러오기** 또는 **새 테마로 저장**(새 `.ktheme` ID)을 고릅니다.
- 클라우드에서 열기: 이 기기 사본이 같은 리비전이면 그대로 열고, 다르면 "이 기기 사본 열기 / 클라우드 버전 불러오기"를 묻습니다.
- 공개 중인 테마를 저장하면 공개 사본도 갱신합니다. 이 단계만 실패하면 "클라우드에 저장했지만 공개된 테마를 갱신하지 못했어요"를 표시합니다.

## 5. 공개·공유 (Phase 5)

| 범위 | 의미 | 구현 |
|---|---|---|
| 비공개 | 소유자만 | `shares` 문서 없음. `themes`·`users/` 파일은 소유자 전용 규칙 |
| 링크 공개 | 링크로 비로그인 조회·다운로드, 갤러리 제외 | `shares/{shareId}` (`visibility: unlisted`). 누구나 `get`, `list`는 불가 |
| 공개 | 갤러리 표시 + 비로그인 조회·다운로드 | `shares/{shareId}` (`visibility: public`). `list`는 `public`+`ready` 조건 쿼리만 허용 |

- 공유 링크: `https://<앱>/#/t/{shareId}`. `shareId`는 56자 알파벳 22자(약 128비트) 난수로 추측할 수 없고 `themeId`와 무관합니다.
- 공개 시 **사용 중인 이미지만** `shares/{shareId}/`로 복사하고 설정에서 비활성 이미지 참조를 지웁니다. 비활성 원본(예: 기본 모드로 돌려 둔 프로필 이미지)은 공개되지 않습니다.
- 비공개 전환·링크 변경·삭제는 **share 문서를 먼저 지워** 즉시 차단합니다. Storage 규칙이 `firestore.get(shares/{id}).status == 'ready'`를 확인하므로 파일 URL을 알아도 읽을 수 없습니다. 사본 파일은 `onShareDeleted` 함수가 재시도하며 지웁니다.
- 앱은 `getDownloadURL`(영구 토큰 URL)을 쓰지 않고 규칙을 거치는 `getBytes`로만 읽습니다.
- 이미 내려받은 파일은 회수할 수 없다고 공유 다이얼로그에 표시합니다.
- 복제 허용(선택 기능)은 구현하지 않았습니다. 디자인 시안의 "내 작업으로 복제" 버튼은 넣지 않았습니다.

## 6. 갤러리 (Phase 6)

- 쿼리: `visibility == public` · `status == ready` · 정렬 · `limit(12+1)` · `startAfter(cursor)`. 규칙도 같은 조건을 요구하므로 클라이언트 필터에 의존하지 않습니다.
- 정렬: **최신순** = `publishedAt desc`(처음 공개한 시각). **인기순** = `downloadCount desc, publishedAt desc`.
- **인기 집계 기준**: 공유 테마별로 *같은 계정(비로그인은 솔트를 섞은 IP 해시) 기준 UTC 하루 1회*만 셉니다. 소유자 본인 다운로드는 세지 않습니다. 원본 IP는 저장하지 않습니다. 클라이언트는 `downloadCount`를 쓸 수 없고(규칙) `recordDownload` 함수만 증가시킵니다. 중복 표식은 `downloadMarks`에 2일 TTL로 남습니다.
- **검색 전략**: Firestore에는 부분 문자열 검색이 없어, 이름(NFC·소문자·공백 정리, 최대 30자)의 **모든 부분 문자열**을 `searchTokens`에 저장하고 정규화한 검색어 전체로 `array-contains` 한 번 조회합니다(최대 465개).
  - `searchTokens`는 `onShareWritten` 함수가 share의 이름에서 만들어 씁니다. 클라이언트는 이 필드를 쓸 수 없어(규칙) 이름과 무관한 검색어로 노출시킬 수 없습니다. 그래서 공개 직후 검색에 잡히기까지 잠깐(보통 1초 이내) 걸립니다.
  - 정규화는 `functions/src/search.ts`와 `src/cloud/model.ts`가 같아야 하며 단위 테스트가 확인합니다.
  - 장점: 한국어 부분 일치, 정렬·페이지네이션과 같은 쿼리라 결과가 일관됨.
  - 한계/비용: 이름만 검색(설명·제작자 제외), 오타·형태소·초성 검색 없음, 공개 문서당 색인 항목이 수백 개(쓰기·저장 비용 증가). 검색어 30자 초과는 결과 없음.
  - 확장 시: 공개 테마가 많아지면 Algolia/Typesense 같은 외부 검색 인덱스를 `shares` 트리거로 동기화하는 방식으로 교체합니다.
- 공개 범위 변경은 share 문서 변경/삭제라 다음 조회부터 반영됩니다.

## 7. 인증

- **이메일/비밀번호**: 회원가입(이름 필수), 로그인, 재설정 메일(계정 존재 여부를 드러내지 않는 문구).
- **Google**: 팝업, 차단되면 리디렉션으로 대체.
- **카카오**: 인가 코드 방식.
  1. 브라우저가 `state`(sessionStorage, 10분, 1회용)를 만들고 `kauth.kakao.com/oauth/authorize`로 이동.
  2. `/auth/kakao/callback?code&state`에서 `state` 검증(CSRF).
  3. `kakaoSignIn` 함수가 **서버에서** 클라이언트 시크릿으로 토큰 교환 → `/v2/user/me` → uid `kakao:{카카오ID}` 사용자 생성/갱신 → 커스텀 토큰 발급.
  4. 브라우저가 `signInWithCustomToken`.
  - redirect URI는 허용 목록과 정확히 일치해야 합니다. 시크릿·Admin 권한은 브라우저에 없습니다.
  - 설정이 없으면 버튼을 "카카오 로그인은 준비 중이에요"로 비활성화하고, 서버도 `kakao-not-configured`로 거절합니다(가짜 성공 없음).
  - 같은 이메일의 Google/카카오 계정 자동 연결은 하지 않습니다(별도 계정).
- **비공개 캐시 보호**
  - Firestore는 메모리 캐시만 사용합니다(디스크에 다른 계정 문서가 남지 않음).
  - 계정에 연결된 로컬 사본(`cloudOwnerId`)은 그 계정으로 로그인했을 때만 내 작업·에디터에 보입니다. 로그아웃하면 열려 있던 사본을 저장 후 닫습니다.
  - 로그아웃 시 "이 기기에 남은 사본 N개도 지우기"를 고를 수 있습니다(공용 기기용).
  - 다른 탭에서 계정이 바뀌어도(`onAuthStateChanged`) 열린 사본을 닫습니다.
  - 내 테마 목록은 uid가 바뀌면 새로 그립니다.

## 8. 보안 규칙 요약

| 대상 | 읽기 | 쓰기 |
|---|---|---|
| `users/{uid}` | 본인 | 본인, `displayName`·시각만 |
| `themes/{id}` | 소유자 | 생성: `ownerId == 본인` / 수정·삭제: 소유자, `ownerId`·`createdAt` 불변. 정해진 필드만(`hasOnly`) |
| `themes/{id}/revisions` | 소유자 | 생성만(트랜잭션 `getAfter`로 부모 소유 확인), 수정 불가. 정해진 필드만 |
| `shares/{id}` | `ready`면 누구나 `get`, 목록은 `public`+`ready`만 | 생성: 자기 테마에만, `downloadCount == 0`, `searchTokens` 없음 / 수정: 소유자, `themeId`·`downloadCount`·`publishedAt`·`searchTokens` 불변. 정해진 필드만 |
| `downloadMarks` | 불가 | 불가 (Admin만) |
| Storage `users/{uid}/themes/**` | 본인 | 본인, PNG/JPEG/WebP ≤ 10MB |
| Storage `shares/{id}/**` | share가 `ready`일 때 누구나, 목록은 소유자 | share 소유자, 이미지 ≤ 10MB |

## 9. 로컬 개발과 운영 배포

### 로컬 (에뮬레이터)

요구: Java 21 이상(Firebase CLI 15), firebase-tools, Node 20.19+.

```bash
pnpm --dir functions install
pnpm emulators          # 터미널 1: Auth 9099 · Firestore 8180 · Storage 9199 · Functions 5001
pnpm dev:cloud          # 터미널 2: .env.emulator로 에뮬레이터에 연결된 개발 서버
pnpm test:cloud         # 에뮬레이터 통합 테스트 (규칙·저장·공유·갤러리·함수)
pnpm e2e:cloud          # 실제 브라우저 E2E (빌드 → preview → Playwright)
```

에뮬레이터 Google 로그인은 가짜 계정 선택 화면이 뜹니다. 카카오 로그인은 실제 카카오 서버가 필요해 에뮬레이터에서 끝까지 확인할 수 없습니다(함수 로직은 단위 테스트).

### 운영 배포 체크리스트 (`kakao-theme-studio`에 2026-10-12 진행 — 카카오 제외)

1. Firebase 프로젝트 생성, **Blaze 요금제**(Cloud Functions·Secret Manager 필요). 예산 알림 설정.
2. 웹 앱 등록 → `.env.local`에 `VITE_FIREBASE_*` 입력. `.firebaserc`의 기본 프로젝트를 바꾸거나 `firebase use --add`.
3. Authentication: 이메일/비밀번호, Google 사용 설정. 승인된 도메인에 배포 도메인 추가.
4. Firestore(네이티브 모드)·Storage 생성. 리전은 함수와 맞춰 `asia-northeast3` 권장. Storage 기본 버킷(`*.firebasestorage.app`)은 Blaze 전환 후 콘솔 "시작하기"에서 만들어지며 위치는 나중에 바꿀 수 없습니다.
   - **Storage 규칙의 `firestore.get()`**: Firebase Storage 서비스 에이전트(`service-<projectNumber>@gcp-sa-firebasestorage.iam.gserviceaccount.com`)에 `roles/firebaserules.firestoreServiceAgent`가 있어야 합니다. 콘솔에서 규칙을 게시하면 부여를 제안하지만 CLI 배포는 묻지 않습니다. 없으면 공개 사본(`shares/...`) 업로드·조회가 403이 됩니다.
5. 카카오 디벨로퍼스: 앱 생성 → 카카오 로그인 활성화 → Redirect URI `https://<도메인>/auth/kakao/callback` 등록 → 동의 항목 `profile_nickname`(선택 `profile_image`) → 보안 탭에서 Client Secret 사용.
6. 함수 설정
   ```bash
   firebase functions:secrets:set KAKAO_CLIENT_SECRET
   firebase functions:secrets:set DOWNLOAD_SALT        # 임의의 긴 문자열
   # functions/.env.<projectId>
   KAKAO_REST_API_KEY=...
   KAKAO_REDIRECT_URIS=https://<도메인>/auth/kakao/callback
   ```
   카카오를 아직 쓰지 않으면 `KAKAO_REST_API_KEY`·`KAKAO_REDIRECT_URIS`를 비워 둡니다(`kakaoSignIn`이 `kakao-not-configured`로 거부). 시크릿은 자리 값이라도 있어야 배포됩니다.
   `functions/pnpm-workspace.yaml`(빌드 스크립트 허용 목록)과 `@google-cloud/functions-framework` 의존성은 Cloud Build의 pnpm 11 설치에 필요합니다. 첫 배포에서 Eventarc 권한 전파 오류가 나면 몇 분 뒤 다시 배포하고, 실패로 HTTPS 형태로 남은 트리거 함수는 삭제 후 재생성합니다.
   커스텀 토큰 발급을 위해 함수 실행 서비스 계정에 **Service Account Token Creator** 역할이 필요할 수 있습니다.
7. 배포: `pnpm build && firebase deploy --project prod --only firestore:rules,firestore:indexes,storage,functions,hosting` (재시도 정책이 있는 함수는 비대화형에서 `--force` 필요)
8. Storage CORS(브라우저 `getBytes`에 필요): `storage-cors.json`의 origin을 바꾼 뒤 `gcloud storage buckets update gs://<bucket> --cors-file=storage-cors.json`
9. Firestore TTL: `downloadMarks.expiresAt` (indexes 파일의 fieldOverrides로 배포됨, 콘솔에서 활성 확인).
10. 권장: App Check(reCAPTCHA Enterprise)로 함수·Storage 남용 완화, 업로드 한도(파일 10MB)·Storage 사용량 모니터링, Firestore 백업(PITR 또는 예약 내보내기).

## 10. 제한과 후속

- 실제 카카오 환경에서는 실행하지 않았습니다. 커스텀 토큰 서명 권한은 카카오 설정 후 확인해야 합니다.
- `kakao-theme-studio` Storage 버킷 위치는 `US-EAST1`입니다(생성 후 변경 불가). 한국 사용자에게는 이미지 왕복 지연이 조금 있습니다.
- 계정 삭제(회원 탈퇴)와 그 데이터 정리는 구현하지 않았습니다. Auth 계정만 지우면 `users/{uid}` 문서가 남습니다(규칙상 사용자 삭제 불가).
- 다운로드 집계의 IP 기준 중복 방지는 같은 네트워크 사용자를 한 명으로 셉니다. 대규모 남용 방지는 App Check·레이트 리밋 추가가 필요합니다.
- 갤러리 썸네일은 저장 시 만든 128px 아이콘(대화방 배경 + 말풍선)입니다.
- 공개 사본은 원본과 별도로 Storage 용량을 씁니다(공개 테마만).
- Firebase가 설정되지 않은 빌드에서는 계정에 연결된 로컬 사본이 계속 숨겨집니다(로그인할 방법이 없음).
