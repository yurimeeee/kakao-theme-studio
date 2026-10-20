import { RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useBlobUrl } from '@/assets/useAssetUrl'
import { Button } from '@/components/ui/Button'
import { ColorField } from '@/components/ui/ColorField'
import { NEUTRAL_SWATCHES } from '@/components/ui/swatches'
import { toast } from '@/components/ui/toast'
import { FieldGroup, Notice } from '@/components/ui/Section'
import { Segmented } from '@/components/ui/Segmented'
import { contrastRatio } from '@/domain/theme/color'
import { isElementDefault, resetElement } from '@/domain/theme/defaults'
import { resolveThemeCached, type ResolvedFill } from '@/domain/theme/resolve'
import { TAB_KEYS, type ElementKey, type HexColor, type TabKey } from '@/domain/theme/types'
import { renderThumbnail, thumbnailKey } from '../../projects/thumbnail'
import { RESOURCES } from '@/exporters/ktheme/catalog'
import { FocusEditor } from '../FocusEditor'
import { ImageField } from '../ImageField'
import { useEditor } from '../store'
import { BubblePanel } from './BubblePanel'
import { modeOptions } from './modes'
import { SchemeFromImage } from './SchemeFromImage'
import { SchemeFromSeed } from './SchemeFromSeed'
import { SchemePresets } from './SchemePresets'
import { FillEditor } from './shared'

const useConfig = () => useEditor((s) => s.project!.config)

/** Contrast check against plain-color fills (photos are skipped); the least readable one is used. */
function against(color: HexColor, min: number, ...fills: Pick<ResolvedFill, 'color' | 'imageAssetId'>[]) {
  const plain = fills.filter((f) => !f.imageAssetId).map((f) => f.color)
  if (!plain.length) return undefined
  return { against: plain.reduce((worst, c) => (contrastRatio(color, c) < contrastRatio(color, worst) ? c : worst)), min }
}
const useUpdate = () => useEditor((s) => s.updateConfig)

function PalettePanel() {
  const { palette } = useConfig()
  const update = useUpdate()
  const minRatio: Partial<Record<keyof typeof palette, number>> = { text: 4.5, subText: 3 }
  const field = (key: keyof typeof palette, label: string) => (
    <ColorField
      label={label}
      value={palette[key]}
      swatches={NEUTRAL_SWATCHES}
      onChange={(v) => update((c) => void (c.palette[key] = v))}
      contrast={minRatio[key] ? { against: palette.background, min: minRatio[key] } : undefined}
    />
  )
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup title="추천 조합" description="골라서 바로 적용해요. 올린 이미지와 말풍선 모양은 그대로예요.">
        <SchemePresets />
      </FieldGroup>
      <FieldGroup title="색 하나로 만들기" description="대표색을 고르면 나머지 색을 어울리게 정해요. 글자는 읽기 쉬운 대비로 맞춰요.">
        <SchemeFromSeed />
      </FieldGroup>
      <FieldGroup title="직접 고르기">
        {field('background', '주요 배경')}
        {field('text', '주요 글자')}
        {field('subText', '보조 글자')}
        {field('accent', '강조색')}
      </FieldGroup>
      <Notice>
        ‘기본’으로 둔 요소에 함께 적용돼요. 주요 배경은 목록 배경과 받는 말풍선, 강조색은 보내는 말풍선과 전송 버튼에 쓰여요. 요소에서 ‘색상’이나
        ‘이미지’를 고르면 그 요소의 설정이 우선해요.
      </Notice>
    </div>
  )
}

function BackgroundPanel() {
  const config = useConfig()
  const update = useUpdate()
  const theme = resolveThemeCached(config)
  // The chat room image is what bubbles sit on, so it leads.
  const schemeImage = theme.chatroom.background.imageAssetId ?? theme.main.background.imageAssetId
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup title="목록 배경" description="친구와 채팅 목록 화면이 함께 사용하는 하나의 배경이에요.">
        <FillEditor
          label="목록 배경"
          fill={config.background.main}
          defaultColor={config.palette.background}
          onChange={(next) => update((c) => void (c.background.main = next))}
          imageHint="화면을 꽉 채우도록 잘라서 써요."
          frame={RESOURCES.mainBackground.sizePt}
        />
      </FieldGroup>
      <FieldGroup title="대화방 배경" description="대화 화면에만 적용돼요.">
        <FillEditor
          label="대화방 배경"
          fill={config.background.chatroom}
          defaultColor={theme.chatroom.background.color}
          onChange={(next) => update((c) => void (c.background.chatroom = next))}
          imageHint="화면을 꽉 채우도록 잘라서 써요."
          frame={RESOURCES.chatroomBackground.sizePt}
        />
      </FieldGroup>
      {schemeImage && <SchemeFromImage key={schemeImage} assetId={schemeImage} />}
    </div>
  )
}

function HeaderInputPanel() {
  const config = useConfig()
  const update = useUpdate()
  const theme = resolveThemeCached(config)
  const hi = config.headerInput
  const custom = hi.mode === 'color'
  const field = (key: Exclude<keyof typeof hi, 'mode'>, label: string, resolved: HexColor, contrast?: { against: HexColor; min: number }) => (
    <ColorField
      label={label}
      value={custom ? hi[key] : resolved}
      contrast={contrast}
      onChange={(v) =>
        update((c) => {
          if (c.headerInput.mode !== 'color') {
            // Start custom mode from what the user currently sees.
            Object.assign(c.headerInput, {
              headerTextColor: theme.header.text,
              inputBackground: theme.inputBar.background,
              sendBackground: theme.inputBar.sendBackground,
              sendIcon: theme.inputBar.sendIcon,
              buttonColor: theme.inputBar.button,
            })
            c.headerInput.mode = 'color'
          }
          c.headerInput[key] = v
        })
      }
    />
  )
  return (
    <div className="flex flex-col gap-6">
      <Segmented
        label="상단 · 입력창 방식"
        hideLabel
        value={hi.mode}
        options={modeOptions(['default', 'color'] as const)}
        onChange={(mode) => update((c) => void (c.headerInput.mode = mode))}
      />
      <FieldGroup title="상단">
        {field('headerTextColor', '상단 글자색', theme.header.text, against(theme.header.text, 3, theme.main.background, theme.chatroom.background))}
      </FieldGroup>
      <FieldGroup title="입력창">
        {field('inputBackground', '입력창 배경', theme.inputBar.background)}
        {field('sendBackground', '전송 버튼 배경', theme.inputBar.sendBackground)}
        {field('sendIcon', '전송 버튼 아이콘', theme.inputBar.sendIcon, { against: theme.inputBar.sendBackground, min: 3 })}
        {field('buttonColor', '기타 버튼', theme.inputBar.button, { against: theme.inputBar.background, min: 3 })}
      </FieldGroup>
      {!custom && <Notice>지금은 전체 색상을 따라요. 색을 바꾸면 이 요소만 개별 색상으로 바뀌어요.</Notice>}
    </div>
  )
}

function ProfilePanel() {
  const { profile } = useConfig()
  const update = useUpdate()
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup>
        <Segmented
          label="기본 프로필 방식"
          hideLabel
          value={profile.mode}
          options={modeOptions(['default', 'image'] as const)}
          onChange={(mode) => update((c) => void (c.profile.mode = mode))}
        />
        {profile.mode === 'default' ? (
          <p className="text-[13px] text-sub">전체 색상에 맞춘 기본 프로필 이미지를 만들어요.</p>
        ) : (
          <>
            <ImageField
              label="기본 프로필 이미지"
              assetId={profile.imageAssetId}
              onChange={(id) => update((c) => void (c.profile.imageAssetId = id))}
              hint="정사각형으로 잘라 사용해요. 300×300px 이상을 권장해요."
            />
            {profile.imageAssetId && (
              <FocusEditor
                label="기본 프로필 위치"
                assetId={profile.imageAssetId}
                focus={profile.focus}
                aspect={1}
                round
                onChange={(focus) => update((c) => void (c.profile.focus = focus))}
              />
            )}
          </>
        )}
      </FieldGroup>
      <Notice>프로필 사진이 없는 친구에게 표시돼요. 사진이 있는 친구의 프로필은 유지돼요.</Notice>
    </div>
  )
}

function ThemeIconPanel() {
  const config = useConfig()
  const { themeIcon } = config
  const update = useUpdate()
  const assets = useEditor((s) => s.assets)
  const key = thumbnailKey(config)
  const [preview, setPreview] = useState<Blob | null>(null)
  useEffect(() => {
    let alive = true
    renderThumbnail(config, assets)
      .then((blob) => alive && setPreview(blob))
      .catch(() => alive && setPreview(null))
    return () => {
      alive = false
    }
    // Redraw only when something the icon depends on changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, assets])
  const previewUrl = useBlobUrl(preview)
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup>
        <Segmented
          label="테마 아이콘 방식"
          hideLabel
          value={themeIcon.mode}
          options={modeOptions(['default', 'image'] as const)}
          onChange={(mode) => update((c) => void (c.themeIcon.mode = mode))}
        />
        {themeIcon.mode === 'default' ? (
          <p className="text-[13px] text-sub">대화방 배경과 말풍선 색으로 아이콘을 만들어요.</p>
        ) : (
          <ImageField
            label="테마 아이콘 이미지"
            assetId={themeIcon.imageAssetId}
            onChange={(id) => update((c) => void (c.themeIcon.imageAssetId = id))}
            hint="정사각형으로 가운데를 잘라 200×200px로 넣어요. 200×200px 이상을 권장해요."
          />
        )}
      </FieldGroup>
      <FieldGroup title="미리보기">
        <div className="size-24 overflow-hidden rounded-[22px] bg-canvas">
          {previewUrl && <img src={previewUrl} alt="테마 아이콘 미리보기" className="size-full object-cover" />}
        </div>
      </FieldGroup>
      <Notice>카카오톡 테마 목록, 내 작업, 갤러리에 이 아이콘이 보여요. 이미지를 고르지 않으면 기본 아이콘을 써요.</Notice>
    </div>
  )
}

const TAB_LABELS: Record<TabKey, string> = { friends: '친구 탭', chats: '채팅 탭', now: '지금(오픈채팅) 탭', shopping: '쇼핑 탭', more: '더보기 탭' }

function TabsPanel() {
  const { tabs } = useConfig()
  const theme = resolveThemeCached(useConfig())
  const update = useUpdate()
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup>
        <Segmented
          label="탭 아이콘 방식"
          hideLabel
          value={tabs.mode}
          options={modeOptions(['default', 'image'] as const)}
          onChange={(mode) => update((c) => void (c.tabs.mode = mode))}
        />
        {tabs.mode === 'default' && <p className="text-[13px] text-sub">카카오톡 기본 아이콘을 그대로 사용해요.</p>}
      </FieldGroup>
      {tabs.mode === 'image' &&
        TAB_KEYS.map((key: TabKey) => (
          <FieldGroup key={key} title={TAB_LABELS[key]}>
            <ImageField
              label={`${TAB_LABELS[key]} 선택 전`}
              assetId={tabs.icons[key].normal}
              onChange={(id) => update((c) => void (c.tabs.icons[key].normal = id))}
              compact
            />
            <ImageField
              label={`${TAB_LABELS[key]} 선택 후`}
              assetId={tabs.icons[key].selected}
              onChange={(id) => update((c) => void (c.tabs.icons[key].selected = id))}
              hint="비워 두면 선택 전 이미지를 사용해요."
              compact
            />
          </FieldGroup>
        ))}
      <FieldGroup title="탭 바 배경">
        <ColorField
          label="탭 바 배경색"
          value={tabs.barColor ?? theme.main.background.color}
          onChange={(v) => update((c) => void (c.tabs.barColor = v))}
          auto={{ active: tabs.barColor === null, onReset: () => update((c) => void (c.tabs.barColor = null)), label: '앱 기본' }}
        />
      </FieldGroup>
      <Notice>
        지금 탭 이미지는 구버전 앱의 오픈채팅 탭에도 쓰이도록 함께 기록해요. 이미지를 올리지 않은 탭은 카카오톡 기본 아이콘이 유지돼요.
      </Notice>
    </div>
  )
}

function PasscodePanel() {
  const config = useConfig()
  const update = useUpdate()
  const theme = resolveThemeCached(config)
  const pc = config.passcode
  const bullets = pc.bullets
  const optional = (key: 'titleColor' | 'keypadTextColor' | 'keypadBackground' | 'pressedColor', label: string, resolved: HexColor, contrast?: { against: HexColor; min: number }) => (
    <ColorField
      label={label}
      value={pc[key] ?? resolved}
      contrast={contrast}
      onChange={(v) => update((c) => void (c.passcode[key] = v))}
      auto={{ active: pc[key] === null, onReset: () => update((c) => void (c.passcode[key] = null)), label: '자동' }}
    />
  )
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup title="배경">
        <FillEditor
          label="암호 화면 배경"
          fill={pc.background}
          defaultColor={config.palette.background}
          onChange={(next) => update((c) => void (c.passcode.background = next))}
          frame={RESOURCES.passcodeBackground.sizePt}
        />
      </FieldGroup>
      <FieldGroup title="글자 · 키패드">
        {optional('titleColor', '제목·안내 글자색', theme.passcode.title, against(theme.passcode.title, 4.5, theme.passcode.background))}
        {optional('keypadTextColor', '숫자색', theme.passcode.keypadText, against(theme.passcode.keypadText, 3, { color: theme.passcode.keypadBackground, imageAssetId: pc.keypadBackground ? null : theme.passcode.background.imageAssetId }))}
        {optional('keypadBackground', '키패드 배경', theme.passcode.keypadBackground)}
        {optional('pressedColor', '눌림 표시', theme.passcode.pressed)}
      </FieldGroup>
      <FieldGroup title="암호 표시" description="4개의 표시가 입력 전·후로 바뀌어요.">
        <Segmented
          label="암호 표시 방식"
          hideLabel
          value={bullets.mode}
          options={modeOptions(['default', 'image'] as const)}
          onChange={(mode) => update((c) => void (c.passcode.bullets.mode = mode))}
        />
        {bullets.mode === 'default' ? (
          <>
            <ColorField
              label="입력 전"
              value={bullets.emptyColor ?? (theme.passcode.bullets.kind === 'generated' ? theme.passcode.bullets.emptyColor : '#cccccc')}
              onChange={(v) => update((c) => void (c.passcode.bullets.emptyColor = v))}
              auto={{ active: bullets.emptyColor === null, onReset: () => update((c) => void (c.passcode.bullets.emptyColor = null)), label: '자동' }}
            />
            <ColorField
              label="입력 후"
              value={bullets.filledColor ?? (theme.passcode.bullets.kind === 'generated' ? theme.passcode.bullets.filledColor : '#222224')}
              onChange={(v) => update((c) => void (c.passcode.bullets.filledColor = v))}
              auto={{ active: bullets.filledColor === null, onReset: () => update((c) => void (c.passcode.bullets.filledColor = null)), label: '자동' }}
            />
          </>
        ) : (
          <>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-3">
                <ImageField label={`${i + 1}번째 입력 전`} assetId={bullets.normal[i]} onChange={(id) => update((c) => void (c.passcode.bullets.normal[i] = id))} compact />
                <ImageField label={`${i + 1}번째 입력 후`} assetId={bullets.selected[i]} onChange={(id) => update((c) => void (c.passcode.bullets.selected[i] = id))} compact />
              </div>
            ))}
            {theme.passcode.bullets.kind !== 'image' && <Notice tone="warn">8개 이미지를 모두 선택하면 적용돼요. 그전에는 기본 표시를 사용해요.</Notice>}
          </>
        )}
      </FieldGroup>
      <Notice>미리보기 키패드는 입력한 개수만 보여 주고 숫자는 어디에도 저장하지 않아요.</Notice>
    </div>
  )
}

/** Puts the open element back to its defaults; 실행 취소 brings the previous settings back. */
function ResetElement({ element }: { element: ElementKey }) {
  const isDefault = useEditor((s) => isElementDefault(s.project!.config, element))
  const update = useUpdate()
  return (
    <Button
      variant="soft"
      className="min-h-10 self-start px-4 text-[13px] font-medium"
      disabled={isDefault}
      onClick={() => {
        update((c) => resetElement(c, element), { newStep: true })
        toast('기본값으로 되돌렸어요. 실행 취소로 되돌릴 수 있어요.')
      }}
    >
      <RotateCcw className="size-4" aria-hidden />
      기본값으로 되돌리기
    </Button>
  )
}

export function ElementPanel({ element }: { element: ElementKey }) {
  return (
    <div className="flex flex-col gap-6">
      <ElementSettings element={element} />
      <div className="border-t border-hair pt-5">
        <ResetElement element={element} />
      </div>
    </div>
  )
}

function ElementSettings({ element }: { element: ElementKey }) {
  switch (element) {
    case 'palette':
      return <PalettePanel />
    case 'background':
      return <BackgroundPanel />
    case 'bubbleSend':
      return <BubblePanel key="send" kind="send" />
    case 'bubbleReceive':
      return <BubblePanel key="receive" kind="receive" />
    case 'headerInput':
      return <HeaderInputPanel />
    case 'profile':
      return <ProfilePanel />
    case 'themeIcon':
      return <ThemeIconPanel />
    case 'tabs':
      return <TabsPanel />
    case 'passcode':
      return <PasscodePanel />
  }
}
