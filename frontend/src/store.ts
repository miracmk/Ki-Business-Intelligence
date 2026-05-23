import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  loginData: {
    userId: string
    methods: string[]
    hints: Record<string, string>
  } | null
  setTokens: (access: string, refresh: string) => void
  setLoginData: (data: { userId: string; methods: string[]; hints: Record<string, string> }) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      loginData: null,
      setTokens: (access, refresh) => {
        localStorage.setItem('accessToken', access)
        localStorage.setItem('refreshToken', refresh)
        set({ accessToken: access, refreshToken: refresh })
      },
      setLoginData: (data) => set({ loginData: data }),
      clearAuth: () => {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        set({ accessToken: null, refreshToken: null, loginData: null })
      },
    }),
    {
      name: 'ki-auth',
    }
  )
)
