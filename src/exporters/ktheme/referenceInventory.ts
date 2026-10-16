/**
 * Selector → property names observed in the reference archives' KakaoTalkTheme.css
 * (TabBarStyle-Main and InputBarStyle-Chat: union of reference 1 and reference 2)
 * (structure only; no values, images or author data). Used to guarantee the
 * serializer never invents properties. See docs/ktheme-format.md.
 */
export const REFERENCE_CSS_INVENTORY: Record<string, readonly string[]> = {
  'ManifestStyle': ['-kakaotalk-theme-name', '-kakaotalk-theme-version', '-kakaotalk-theme-url', '-kakaotalk-author-name', '-kakaotalk-theme-id'],
  'TabBarStyle-Main': ['background-color', '-ios-background-image', '-ios-friends-normal-icon-image', '-ios-friends-selected-icon-image', '-ios-chats-normal-icon-image', '-ios-chats-selected-icon-image', '-ios-find-normal-icon-image', '-ios-find-selected-icon-image', '-ios-browse-normal-icon-image', '-ios-browse-selected-icon-image', '-ios-piccoma-normal-icon-image', '-ios-piccoma-selected-icon-image', '-ios-game-normal-icon-image', '-ios-game-selected-icon-image', '-ios-more-normal-icon-image', '-ios-more-selected-icon-image', '-ios-now-normal-icon-image', '-ios-now-selected-icon-image', '-ios-shopping-normal-icon-image', '-ios-shopping-selected-icon-image', '-ios-call-normal-icon-image', '-ios-call-selected-icon-image', '-ios-openchats-normal-icon-image', '-ios-openchats-selected-icon-image'],
  'HeaderStyle-Main': ['-ios-text-color', '-ios-tab-text-color', '-ios-tab-highlighted-text-color'],
  'MainViewStyle-Primary': ['background-color', '-ios-background-image', '-ios-text-color', '-ios-highlighted-text-color', '-ios-description-text-color', '-ios-description-highlighted-text-color', '-ios-paragraph-text-color', '-ios-paragraph-highlighted-text-color', '-ios-normal-background-color', '-ios-normal-background-alpha', '-ios-selected-background-color', '-ios-selected-background-alpha'],
  'MainViewStyle-Secondary': ['background-color'],
  'SectionTitleStyle-Main': ['border-color', 'border-alpha', '-ios-text-color', '-ios-text-alpha'],
  'FeatureStyle-Primary': ['-ios-text-color'],
  'ButtonStyle-AddFriend': ['-ios-image'],
  'DefaultProfileStyle': ['-ios-profile-images'],
  'BackgroundStyle-ChatRoom': ['background-color', '-ios-background-image'],
  'InputBarStyle-Chat': ['background-color', '-ios-send-normal-background-color', '-ios-send-normal-foreground-color', '-ios-send-highlighted-background-color', '-ios-send-highlighted-foreground-color', '-ios-button-normal-foreground-color', '-ios-button-highlighted-foreground-color', '-ios-button-text-color', '-ios-button-normal-background-color', '-ios-button-normal-background-alpha'],
  'MessageCellStyle-Send': ['-ios-background-image', '-ios-selected-background-image', '-ios-group-background-image', '-ios-group-selected-background-image', '-ios-title-edgeinsets', '-ios-group-title-edgeinsets', '-ios-text-color', '-ios-selected-text-color', '-ios-unread-text-color'],
  'MessageCellStyle-Receive': ['-ios-background-image', '-ios-selected-background-image', '-ios-group-background-image', '-ios-group-selected-background-image', '-ios-title-edgeinsets', '-ios-group-title-edgeinsets', '-ios-text-color', '-ios-selected-text-color', '-ios-unread-text-color'],
  'BackgroundStyle-Passcode': ['background-color', '-ios-background-image'],
  'LabelStyle-PasscodeTitle': ['-ios-text-color'],
  'PasscodeStyle': ['-ios-bullet-first-image', '-ios-bullet-second-image', '-ios-bullet-third-image', '-ios-bullet-fourth-image', '-ios-bullet-selected-first-image', '-ios-bullet-selected-second-image', '-ios-bullet-selected-third-image', '-ios-bullet-selected-fourth-image', '-ios-keypad-background-color', '-ios-keypad-text-normal-color', '-ios-keypad-number-highlighted-image'],
  'BackgroundStyle-MessageNotificationBar': ['background-color'],
  'LabelStyle-MessageNotificationBarName': ['-ios-text-color'],
  'LabelStyle-MessageNotificationBarMessage': ['-ios-text-color'],
  'BackgroundStyle-DirectShareBar': ['background-color'],
  'LabelStyle-DirectShareBarName': ['-ios-text-color'],
  'LabelStyle-DirectShareBarMessage': ['-ios-text-color'],
}
