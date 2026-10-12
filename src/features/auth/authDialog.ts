import { create } from 'zustand'

interface AuthDialogState {
  open: boolean
  /** Optional line explaining why login was requested (e.g. 공유하려면 로그인이 필요해요). */
  reason: string | null
}

export const useAuthDialog = create<AuthDialogState>(() => ({ open: false, reason: null }))

export const openLogin = (reason: string | null = null) => useAuthDialog.setState({ open: true, reason })
export const closeLogin = () => useAuthDialog.setState({ open: false, reason: null })
