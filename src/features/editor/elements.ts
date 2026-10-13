import type { LucideIcon } from 'lucide-react'
import { AppWindow, Image, KeyRound, LayoutGrid, LayoutPanelTop, MessageSquare, MessagesSquare, Palette, UserRound } from 'lucide-react'
import type { ElementKey, PreviewScreen } from '@/domain/theme/types'

export interface ElementInfo {
  label: string
  description: string
  icon: LucideIcon
  group: 'theme' | 'common'
  /** Preview screen to show when the element is selected (null = keep current). */
  screen: PreviewScreen | null
}

export const ELEMENTS: Record<ElementKey, ElementInfo> = {
  palette: { label: '전체 색상', description: '기본 설정을 쓰는 요소에 함께 적용돼요.', icon: Palette, group: 'theme', screen: null },
  background: { label: '배경', description: '목록 화면과 대화방 배경을 바꿔요.', icon: Image, group: 'theme', screen: 'friends' },
  bubbleSend: { label: '보내는 말풍선', description: '색상과 모서리 형태를 조절해요.', icon: MessageSquare, group: 'theme', screen: 'chatroom' },
  bubbleReceive: { label: '받는 말풍선', description: '색상과 모서리 형태를 조절해요.', icon: MessagesSquare, group: 'theme', screen: 'chatroom' },
  headerInput: { label: '상단 · 입력창', description: '상단 글자와 메시지 입력창 색상이에요.', icon: LayoutPanelTop, group: 'theme', screen: 'chatroom' },
  profile: { label: '기본 프로필', description: '프로필 사진이 없는 친구에게 표시돼요.', icon: UserRound, group: 'common', screen: 'friends' },
  themeIcon: { label: '테마 아이콘', description: '테마 목록과 내 작업에 보이는 썸네일이에요.', icon: AppWindow, group: 'common', screen: null },
  tabs: { label: '탭 아이콘', description: '하단 탭의 선택 전·후 아이콘이에요.', icon: LayoutGrid, group: 'common', screen: 'friends' },
  passcode: { label: '암호 입력', description: '암호 입력 화면의 배경과 키패드예요.', icon: KeyRound, group: 'common', screen: 'passcode' },
}

export const ELEMENT_ORDER: ElementKey[] = ['palette', 'background', 'bubbleSend', 'bubbleReceive', 'headerInput', 'profile', 'themeIcon', 'tabs', 'passcode']

export const SCREEN_LABELS: Record<PreviewScreen, string> = {
  friends: '친구',
  chats: '채팅 목록',
  chatroom: '대화',
  passcode: '암호 입력',
}

/** Options for the preview screen switcher. */
export const SCREEN_OPTIONS = (Object.keys(SCREEN_LABELS) as PreviewScreen[]).map((value) => ({ value, label: SCREEN_LABELS[value] }))
