# `.ktheme` 형식 조사와 어댑터 근거 (iOS)

- 작성일: 2026-10-11
- 어댑터 버전: `ios-css-ref2023-r2` (`src/exporters/ktheme/catalog.ts`의 `ADAPTER_VERSION`)
- 상태: **구조 검증 완료 / 기기 적용 검증 대기**

이 문서는 생성 엔진이 따르는 규칙을 사실별로 근거와 함께 기록합니다. 근거 등급:

| 등급 | 뜻 |
|---|---|
| **참고 파일** | 첨부된 참고 테마에서 직접 확인한 사실. 참고 1: `TalkFile_COL_치이카와.ktheme.ktheme`(주 근거). 참고 2: 최신 하단 탭 키가 들어 있는 다른 개인 제작 테마(§6에서만 사용) |
| **추정** | 참고 파일에 답이 없어서 정한 우리 쪽 선택. 기기 검증 필요 |
| **기기 검증** | 실제 iPhone 카카오톡에서 확인한 사실 — **현재 0건** |

> 공식 공개 규격 문서는 찾지 못했습니다(2026-10-11 웹 검색). 판매처 안내에는 `.ktheme` 파일을 아이폰으로 받아 카카오톡 "나와의 채팅방"으로 보내 적용하는 절차만 있고 내부 구조 설명은 없습니다. 따라서 아래 내용은 모두 참고 파일 1개를 근거로 하며, 현행 앱 전체의 지원 범위를 대신하지 않습니다.

참고 파일의 캐릭터 이미지·작성자 정보·테마 ID는 이 저장소에 포함하지 않았고 기본 리소스로도 쓰지 않습니다. `src/exporters/ktheme/referenceInventory.ts`에는 **선택자와 속성 이름만**(값·이미지 없음) 남겼습니다.

---

## 1. 아카이브 구조 — 참고 파일

| 항목 | 관찰 |
|---|---|
| 컨테이너 | 일반 ZIP (deflate). 확장자만 `.ktheme` |
| 엔트리 수 | 138개 = 일반 69 + `__MACOSX/` 69 (macOS Finder 압축 부산물) |
| 일반 엔트리 | `KakaoTalkTheme.css`(루트), `Images/` 디렉터리 엔트리, PNG 66개, `Images/.DS_Store` |
| CSS 인코딩 | **UTF-8 + BOM**. 테마 이름에 한글 포함 |
| 이미지 형식 | 전부 PNG |
| 이미지 이름 | `Images/<이름>@2x.png`, `Images/<이름>@3x.png`. CSS에서는 배율 없이 `'<이름>.png'`로 참조 |
| 테마 아이콘 | `Images/commonIcoTheme.png` 200×200, 배율 접미사 없음, CSS에서 참조하지 않음 |

분석 시 `__MACOSX/`·`.DS_Store`는 테마 엔트리에서 제외했습니다. CSS는 BOM을 고려해 UTF-8로, `__MACOSX/._*` AppleDouble 파일은 텍스트로 읽지 않았습니다.

**생성 엔진 규칙**: 루트에 `KakaoTalkTheme.css`(UTF-8 BOM) → `Images/` 디렉터리 엔트리 → 이미지 순서. `__MACOSX`·`.DS_Store`·임의 파일은 만들지 않으며 검증기(`validate.ts`)가 경로를 `^(KakaoTalkTheme\.css|Images/[A-Za-z0-9_]+(@[23]x)?\.png)$`로 제한합니다.

## 2. Manifest — 참고 파일

```text
ManifestStyle {
  -kakaotalk-theme-name / -kakaotalk-theme-version / -kakaotalk-theme-url
  -kakaotalk-author-name / -kakaotalk-theme-id
}
```

| 속성 | 참고 파일 형태 | 생성 값 | 근거 |
|---|---|---|---|
| theme-name | 작은따옴표 문자열, 한글 | 사용자 테마 이름 (NFC, 따옴표·역슬래시·제어문자·`*/` 제거) | 참고 파일 |
| theme-id | `[A-Za-z_]` 문자열 | `KTS_` + 16자 `[0-9a-z]`, 프로젝트마다 한 번 생성해 유지 | 형식은 참고 파일, **같은 ID 재설치 시 덮어쓰기 여부는 추정** |
| theme-version | 자유 문자열 | `1.0.<revision>` | 추정 |
| author-name | 문자열 | `Kakao Theme Studio` | 추정(참고 파일 작성자 정보는 복사하지 않음) |
| theme-url | URL | 빈 문자열 `''` | **추정 — 빈 값 허용 여부 기기 검증 필요** |

## 3. 선택자·속성 — 참고 파일

참고 CSS의 22개 선택자: `ManifestStyle`, `TabBarStyle-Main`, `HeaderStyle-Main`, `MainViewStyle-Primary`, `MainViewStyle-Secondary`, `SectionTitleStyle-Main`, `FeatureStyle-Primary`, `ButtonStyle-AddFriend`, `DefaultProfileStyle`, `BackgroundStyle-ChatRoom`, `InputBarStyle-Chat`, `MessageCellStyle-Send`, `MessageCellStyle-Receive`, `BackgroundStyle-Passcode`, `LabelStyle-PasscodeTitle`, `PasscodeStyle`, `BackgroundStyle-MessageNotificationBar`, `LabelStyle-MessageNotificationBarName`, `LabelStyle-MessageNotificationBarMessage`, `BackgroundStyle-DirectShareBar`, `LabelStyle-DirectShareBarName`, `LabelStyle-DirectShareBarMessage`.

**생성 엔진 규칙**: 위 목록에 있는 선택자·속성만 출력합니다. 단위 테스트 `reference inventory guard`가 출력 CSS의 모든 선택자·속성이 참고 목록에 있는지 확인합니다. 웹 CSS(`border-radius` 등)는 출력하지 않습니다. 빈 블록은 만들지 않습니다.

생성하지 않는 선택자: `ButtonStyle-AddFriend`(친구 추가 버튼 이미지 — 에디터 요소 없음), `DirectShareBar` 계열(대상 화면 미확인), `BottomBannerStyle`(아래 §3.1).

### 3.1 참고 2에만 있는 속성 (2026-10-16 검토)

`~/Downloads`의 참고 테마 9개 CSS를 위 목록과 비교했습니다. 목록에 없는 선택자·속성은 참고 2 한 파일에만 있는 다음 다섯 가지뿐입니다.

| 선택자 / 속성 | 참고 2 주석·값 | 결정 | 이유 |
|---|---|---|---|
| `InputBarStyle-Chat` `-ios-button-normal-background-color` | "메뉴버튼 배경 컬러" `#fafafa` (입력창 `#ffffff`) | **생성** — 입력창 배경에 기타 버튼 색을 6% 섞은 값 | 주석이 "CUX 관련 버튼 (신규추가)". 앱 기본값이 어두운 테마와 어긋나지 않도록 테마 색에서 파생. 별도 편집 항목은 두지 않음 |
| `InputBarStyle-Chat` `-ios-button-text-color` | "인풋바 텍스트 컬러" `#000000` | **생성** — 위 배경에서 대비 4.5:1 이상인 주요 글자색 | 같음 |
| `InputBarStyle-Chat` `-ios-button-normal-background-alpha` | `1.0` | **생성** — `1.0` | 같음 |
| `BottomBannerStyle` `background-color` | 값만 있음(주석 없음) | 생성 안 함 | 어느 화면의 배너인지 근거 없음. 미리보기에서 광고·배너를 제거하는 제품 범위와도 맞지 않음 |
| `TabBarStyle-Main` `-ios-call-{normal,selected}-icon-image` | "콜탭" | 생성 안 함 (§6) | 참고 2도 콜탭에 더보기 탭과 같은 그림을 쓰고 선택 상태도 같은 그림이라 실제 탭으로 쓴 흔적이 없음 |

미리보기는 입력창의 "메시지 입력" 칸을 메뉴 버튼 배경색으로 그립니다. 이 속성이 실제로 어느 버튼에 적용되는지는 D13에서 확인합니다. 출력이 바뀌었으므로 어댑터 버전을 `r2`로 올렸습니다.

## 4. 에디터 요소 ↔ 리소스 매핑

크기는 pt(= CSS의 `px`), 이미지 px = pt × 배율입니다.

| 에디터 요소 | 선택자 / 속성 | 리소스 | pt 크기 | 참고 파일 관찰 | 근거 |
|---|---|---|---|---|---|
| 배경 › 목록 배경 | `MainViewStyle-Primary` `background-color`, `-ios-background-image` | `mainBgImage` | 375×750 | @3x 1125×2250만 있음 | 참고 파일 |
| 배경 › 대화방 배경 | `BackgroundStyle-ChatRoom` | `chatroomBgImage` | 375×750 | @3x 1125×2250만 있음 | 참고 파일 |
| 보내는/받는 말풍선 | `MessageCellStyle-Send/Receive` | `chatroomBubble{Send,Receive}{01,02}[Selected]` | 생성 시 결정 | 아래 5절 | 참고 파일 |
| 상단 글자 | `HeaderStyle-Main -ios-text-color` | — | — | 있음 | 참고 파일 |
| 입력창 | `InputBarStyle-Chat` 배경·전송 버튼 배경/전경·기타 버튼 | — | — | 있음 | 참고 파일 |
| 입력창 메뉴 버튼 | `InputBarStyle-Chat -ios-button-normal-background-{color,alpha}`, `-ios-button-text-color` | — | — | 참고 2만 | 참고 2 (값은 파생, §3.1) |
| 기본 프로필 | `DefaultProfileStyle -ios-profile-images` | `profileImg01` | 100×100 | @3x 300×300만 있음 | 참고 파일 |
| 탭 아이콘 | `TabBarStyle-Main -ios-{friends,chats,now,openchats,shopping,more}-{normal,selected}-icon-image` | `maintabIco{Friends,Chats,Now,Shopping,More}[Selected]` | 40×40 | @3x 120×120, @2x 76×76(38pt) | 참고 파일 (키: 참고 1·2, 파일 이름·크기: 참고 1) |
| 탭 바 배경 | `TabBarStyle-Main background-color`, `-ios-background-image` | `maintabBgImage` | 470×49 | @2x 940×98, @3x 1410×147, 주석 "top-center-crop" | 참고 파일 |
| 암호 배경 | `BackgroundStyle-Passcode` | `passcodeBgImage` | 400×400 | @3x 1200×1200만 있음 | 참고 파일 (화면 배치 방식은 미확인) |
| 암호 제목 글자 | `LabelStyle-PasscodeTitle` | — | — | 있음 | 참고 파일 |
| 암호 표시 4개 ×(전/후) | `PasscodeStyle -ios-bullet-{first..fourth}-image`, `-ios-bullet-selected-…` | `passcodeImgCode0N[Selected]` | **48×48 (16pt 원)** | 200×200 @3x 캐릭터 그림 | 속성은 참고 파일, **생성 크기는 추정** |
| 키패드 | `-ios-keypad-background-color`, `-ios-keypad-text-normal-color`, `-ios-keypad-number-highlighted-image` | `passcodeKeypadPressed` | 60×60 | @3x 180×180 | 참고 파일 |
| 알림 바 | `BackgroundStyle-MessageNotificationBar`, `LabelStyle-…Name/Message` | — | — | 있음 | 참고 파일 (전체 색상에서 파생) |
| 테마 아이콘 | (CSS 참조 없음) | `Images/commonIcoTheme.png` | 200×200px (올린 이미지는 가운데 정사각형으로 자름, 없으면 대화방 배경+말풍선 색으로 생성) | 있음 | 참고 파일 |

전체 색상(주요 배경·주요 글자·보조 글자·강조색)은 별도 리소스가 아니라 `src/domain/theme/resolve.ts`의 상속 규칙으로 각 속성 값이 됩니다. 미리보기와 생성 엔진이 같은 `resolveTheme()` 결과를 사용합니다.

### 배경 공유 관계

친구 화면과 채팅 목록은 `MainViewStyle-Primary` 하나를 함께 씁니다. 에디터는 이를 "목록 배경" 하나로 노출하고 두 화면에 함께 적용된다고 안내합니다(독립 리소스처럼 보이지 않게).

### 배율 규칙 (생성 엔진)

참고 파일은 배경·프로필·암호 리소스를 @3x만, 말풍선·탭은 @2x와 @3x를 함께 넣었습니다. 생성 엔진은 **모든 리소스를 @2x·@3x 둘 다** 넣습니다(@2x 기기 대비, 상위 집합). 검증기는 CSS가 참조하는 모든 이름에 대해 두 배율 파일이 있고 `@2x × 1.5 ≈ @3x`(±2px)인지 확인합니다.

### 색상만 있는 배경

참고 파일은 배경색과 배경 이미지를 함께 지정합니다. 앱이 `background-color`만으로 배경을 칠하는지 확인할 수 없어서, 색상 모드에서도 같은 색의 단색 배경 PNG를 생성해 함께 넣습니다(추정, 안전 쪽 선택).

## 5. 말풍선 늘림 규칙 — 참고 파일 + 추정

참고 파일:

```css
MessageCellStyle-Send {
  -ios-background-image: 'chatroomBubbleSend01.png' 16px 39px;
  -ios-group-background-image: 'chatroomBubbleSend02.png' 16px 16.5px;
  -ios-title-edgeinsets: 29px 12px 8px 36px;  /* top, left, bottom, right */
  …
}
```

- 이미지 뒤 두 값은 **늘림 기준점(왼쪽 캡 너비, 위쪽 캡 높이, pt)** 입니다. 보내는 말풍선 01 @3x 171×159(57×53pt) 이미지를 확대해 보면 왼쪽 아래 원형 말풍선 영역 안의 (16, 39)pt가 늘림 지점이고, 위쪽은 캐릭터 장식입니다. 이는 iOS `stretchableImage(leftCapWidth:topCapHeight:)` 동작(해당 1pt 열·행이 늘어남)과 일치합니다. 0.5pt 값도 쓰입니다.
- `-ios-title-edgeinsets`는 말풍선 테두리 기준 텍스트 여백이며 주석상 순서는 위·왼쪽·아래·오른쪽입니다. 캐릭터 장식 때문에 위 29pt·오른쪽 36pt처럼 큰 값도 씁니다.
- `01` = 첫 메시지, `02` = 연속(group) 메시지, `Selected` = 눌림 상태. 각각 별도 기준점과 여백을 가집니다.
- 텍스트 색: `-ios-text-color`, `-ios-selected-text-color`, `-ios-unread-text-color`.

생성 엔진 (`bubbleGeometry.ts`):

| 경우 | 규칙 | 근거 |
|---|---|---|
| 색상/기본 말풍선 | 모서리 반경 r(직각 0, 캡슐 17pt) → 캡 c = max(⌈r⌉, 8), 이미지 (2c+1)×(2c+1)pt, 기준점 (c, c). Canvas로 둥근 사각형을 그림 | 늘림 의미는 참고 파일, 수치는 추정 |
| 이미지 말풍선 | 업로드 이미지를 **@3x 원본**으로 간주 (pt = px/3), @2x는 2/3 축소. **표시 크기**(20~300%)로 이미지 전체(장식 포함)를 확대·축소하고, 바꿀 때 기준점·여백도 같은 비율로 옮김. 기준점 기본값 = 중앙, 이미지 위 편집기(십자선·점선 상자)에서 드래그/방향키로 조절, 이미지 내부로 제한. 기준 줄이 같은 픽셀 줄이 아니면(장식·모서리) 경고 | 추정 |
| 연속 메시지 | 별도 이미지 선택 가능. 그 이미지는 자체 기준점·여백·표시 크기(`-ios-group-*`)를 가지며, 따로 조절하지 않으면 첫 메시지 값을 따름. 비우면 첫 메시지 이미지·값 재사용 | 추정 |
| 선택 상태 | 같은 이미지에 검정 10%를 불투명 픽셀에만 덧칠 | 추정 |
| 텍스트 여백 | 기본 9·12·9·12pt, 고급 설정에서 조절 | 추정 |
| 꼬리 | 생성하지 않음 (직각·둥근·캡슐만) | 제품 범위 |

캡슐 반경 17pt는 한 줄 말풍선 높이(여백 18 + 줄 높이 약 17)의 절반으로 잡은 값이며, 여러 줄이 되면 모서리 17pt의 둥근 사각형이 됩니다. 실제 앱 글꼴·줄 높이에 따른 결과는 기기 검증 항목입니다.

## 6. 하단 탭 — 추측 금지

### 참고 1

참고 CSS `TabBarStyle-Main`에는 `friends`, `chats`, `find`(주석: 글로벌), `browse`(채널), `piccoma`(만화, 일본), `game`, `more`가 선언되어 있습니다. 그러나:

- `game`은 CSS에만 있고 이미지 파일이 없습니다.
- `maintabIcoShopping*`, `maintabIcoView*` 이미지는 있으나 CSS에서 참조하지 않습니다.
- 일부 탭 이미지는 다른 탭 파일과 바이트 크기가 같아 그림을 재사용한 것으로 보입니다(예: `maintabIcoBrowse@3x`와 `maintabIcoView@3x` 9918바이트, `maintabIcoFriends@3x`와 `maintabIcoPiccoma@3x` 8482바이트). 탭 키가 실제 어떤 화면에 대응하는지 이 파일만으로는 판단할 수 없습니다.

### 참고 2 (2026-10-11 추가)

다른 개인 제작 테마의 `TabBarStyle-Main`에는 다음 키가 주석과 함께 선언되어 있고, 모두 실제 이미지를 참조합니다(이미지·작성자 정보는 저장소에 포함하지 않음).

| 키 | 주석 | 비고 |
|---|---|---|
| `friends`, `chats`, `more` | 친구탭 / 채팅탭 / 더보기탭 | 참고 1과 같음 |
| `now` | 지금 | 오픈채팅 자리의 현행 탭 |
| `openchats` | 오픈채팅탭 (하위호환) | `now`와 **같은 이미지**를 참조 |
| `shopping` | 쇼핑탭 | |
| `piccoma` | 만화탭 (일본) | |
| `call` | 콜탭 | |

참고 2에는 `find`·`browse`·`game`이 없습니다. 파일 이름은 자유 형식(`mt1.png` 등)이고 배율은 @3x만, 탭 아이콘은 115×115px입니다.

### 생성 규칙

에디터는 **친구·채팅·지금(오픈채팅)·쇼핑·더보기 5개**를 편집 대상으로 둡니다(현행 하단 탭 순서).

- "지금(오픈채팅)" 탭 이미지는 참고 2와 같이 `now`와 `openchats` **두 키에 같은 파일**로 기록합니다. 구버전 앱의 오픈채팅 탭과 현행 지금 탭에 모두 적용되도록 하기 위함입니다.
- 쇼핑 탭은 `shopping` 키로 기록합니다.
- 파일 이름은 `maintabIcoNow[Selected]`, `maintabIcoShopping[Selected]` 형식을 씁니다. 크기는 다른 탭과 같은 40pt입니다.
- `call`(콜탭)과 `piccoma`(일본 전용)는 국내 현행 하단 탭에서 의미가 확인되지 않아 제외했습니다. 참고 2는 `call`에 더보기 탭 그림(`mt5.png`)을 일반·선택 상태 모두에 그대로 넣어, 콜탭을 실제로 꾸민 흔적이 없습니다(2026-10-16 재검토). 기기에서 콜탭이 보이면 D14에 기록한 뒤 다시 판단합니다.
- 사용자가 이미지를 올린 탭만 CSS에 기록하고, 나머지 탭은 앱 기본 아이콘을 그대로 둡니다.

## 7. 사용자 이미지 처리

- 입력: PNG·JPEG·WebP. 확장자가 아닌 매직 바이트로 형식을 판별하고 디코딩·용량(10MB)·한 변(8192px)을 검사합니다.
- EXIF 방향: `createImageBitmap(…, { imageOrientation: 'from-image' })`로 디코딩해 반영합니다.
- 출력: 모두 PNG(Canvas `toBlob`/`convertToBlob`). 배경·프로필은 cover(가운데) 자르기, 탭·암호 이미지는 contain 맞춤.
- 누락·디코딩 실패 시 파일을 만들지 않고 오류를 표시합니다(가짜 성공 없음).

## 8. 검증 상태

| 검증 | 상태 | 방법 |
|---|---|---|
| 아카이브 엔트리·경로·순서 | 통과 | `exporter.test.ts`, `e2e/export.spec.ts` (실제 다운로드 파일을 JSZip으로 열어 확인) |
| Manifest 필드 존재 | 통과 | 동일 |
| CSS 이미지 참조 ↔ @2x/@3x 파일 | 통과 | 동일 + 내보내기 직전 `validatePackage()` |
| 배율·크기 (예: `mainBgImage@3x` 1125×2250) | 통과 | E2E에서 PNG IHDR 읽기 |
| 말풍선 기준점이 이미지 안에 있음 | 통과 | `validatePackage()` |
| 참고 파일에 없는 선택자·속성 미사용 | 통과 | `reference inventory guard` |
| **iPhone 카카오톡에서 적용** | **기기 검증 대기** | 아래 체크리스트 |

### 기기 검증 체크리스트 (미실시)

접근 가능한 iPhone이 없어 아래 항목은 아직 확인하지 않았습니다. 결과를 이 표에 기록해 주세요.

| # | 항목 | 결과 | iOS / 카카오톡 버전 |
|---|---|---|---|
| D1 | 기본값 그대로 내보낸 테마가 설치·적용되는가 | 대기 | |
| D2 | 색상만 바꾼 테마 적용 | 대기 | |
| D3 | 배경 이미지 + 색상 말풍선 혼합 | 대기 | |
| D4 | 말풍선 짧은/긴/연속 메시지, 캡슐·직각 모양, 여백 | 대기 | |
| D5 | 이미지 말풍선 늘림 기준점 | 대기 | |
| D6 | 기본 프로필(사진 없는 친구만 바뀌는지) | 대기 | |
| D7 | 암호 화면 배경·표시·키패드 눌림 (생성 표시 48pt 크기 적절성) | 대기 | |
| D8 | 친구·채팅·지금(오픈채팅)·쇼핑·더보기 탭 아이콘, 올리지 않은 탭 기본 유지 | 대기 | |
| D9 | `theme-url` 빈 값 허용 | 대기 | |
| D10 | 같은 theme-id로 다시 내보낸 파일 설치 시 덮어쓰기/중복 | 대기 | |
| D11 | 색상만 지정 시 `background-color` 단독 동작 여부 (현재는 단색 PNG를 함께 넣음) | 대기 | |
| D12 | iOS Safari에서 다운로드 → 파일 앱/카카오톡 전달 → 적용 흐름 | 대기 | |
| D13 | 입력창 메뉴 버튼 색(`-ios-button-normal-background-color`·`-ios-button-text-color`)이 어느 버튼에 적용되는가, 구버전 앱에서 무시되는가 | 대기 | |
| D14 | 하단 탭에 콜탭이 보이는 앱 버전이 있는가 (`call` 키 생성 여부 판단) | 대기 | |

웹 미리보기와 실제 앱 화면이 완전히 같다고 보장하지 않습니다. 차이는 위 표에 기록하고, 확인된 사실은 근거 등급을 "기기 검증"으로 올린 뒤 `ADAPTER_VERSION`을 올려 이후 내보내기 결과 변화를 추적합니다.

## 9. 가져오기 (`src/importers/ktheme/`, 2026-10-19)

`.ktheme`을 에디터 모델(`ThemeConfig`)로 되돌립니다. 생성 규칙의 역방향이며, 파일 내용과 같게 보이는 것을 우선하되 전체 색상에서 파생되는 값과 같으면 `기본`으로 둬서 이어서 편집할 수 있게 합니다.

| 항목 | 규칙 |
|---|---|
| 아카이브 | 50MB·엔트리 1000개 이하. `__MACOSX/`·`.DS_Store`·`._*` 무시, 감싸는 폴더 허용. 이미지는 CSS가 참조하는 것만 압축 해제(선언 크기 10MB 초과 건너뜀) |
| 이미지 배율 | `@3x` → `@2x` → 접미사 없음 순으로 선택. 말풍선 표시 크기 = 300 / 배율 % (`@2x`만 있으면 150%) |
| 전체 색상 | 주요 배경 `MainViewStyle-Primary background-color`, 주요 글자 같은 블록 `-ios-text-color`, 보조 글자 `-ios-description-text-color`, 강조색 입력창 전송 버튼 배경 |
| 배경 | 모든 불투명 픽셀이 한 색인 이미지(우리 생성기처럼 색 배경에 덧붙인 단색 PNG)는 색으로, 그 밖은 이미지 모드 |
| 말풍선 | 단색 + 정사각형 + 기준점이 가운데 → 생성 말풍선(모서리 반경은 대각선 투명 픽셀 수 / 배율 / (1 − 1/√2)로 추정, 0~20). 그 밖은 이미지 말풍선, 기준점·텍스트 여백은 CSS 값 그대로. 연속 메시지는 다른 이미지이거나 여백·기준점이 다를 때만 별도 칸에 둠 |
| 탭 | 친구·채팅·지금(`now`, 없으면 `openchats`)·쇼핑·더보기. 탭 바는 단색 이미지면 그 색, 아니면 `background-color` |
| 암호 표시 | 일반 4개·선택 4개가 각각 한 색이면 생성 점 색으로, 아니면 이미지 8개 |
| 기본 프로필·테마 아이콘 | 이 앱이 그리는 그림(실루엣, 대화방 배경+말풍선 아이콘)을 가져온 색으로 128px에 다시 그려 픽셀 평균 차이 6 이하면 생성 그림으로 보고 `기본`으로 둠(색 연동 유지). 그 밖은 이미지 |
| 테마 이름 | manifest 이름(30자). theme-id는 새로 만듦(원본 테마를 덮어쓰지 않도록) |

지원하지 않아 빠지는 항목은 가져온 뒤 대화상자로 알립니다: 찾기·채널·만화·게임·콜 탭, 친구 추가 버튼, 탭 바 배경 이미지, 키패드 눌림 이미지(단색이 아니면), 파일에 없는 이미지.

진입점: 내 작업 헤더·빈 화면의 가져오기 버튼, 내 작업 화면에 파일 끌어다 놓기.

확인: 로컬 참고 테마 9개(이 앱이 만든 7개, 외부 제작 2개)에서 생성 프로필·아이콘은 `기본`, 직접 올린 그림과 외부 테마는 이미지로 가져옴(2026-10-19). 제한: 대화방 배경 이미지의 보일 위치를 가운데가 아닌 곳으로 옮긴 테마는 아이콘이 다시 그린 것과 달라 이미지로 가져옵니다(겉모습은 같음).
