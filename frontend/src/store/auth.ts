import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  user: any | null; 
  accessToken: string | null; 
  refreshToken: string | null
  setAuth: (user: any, access: string, refresh: string) => void
  clear: () => void
}

export const useAuth = create<AuthState>()(persist(
  set => ({
    user: null, 
    accessToken: null, 
    refreshToken: null,
    setAuth: (user, accessToken, refreshToken) => { 
      localStorage.setItem('accessToken', accessToken); 
      localStorage.setItem('refreshToken', refreshToken); 
      set({ user, accessToken, refreshToken }) 
    },
    clear: () => { 
      localStorage.clear(); 
      set({ user: null, accessToken: null, refreshToken: null }) 
    }
  }),
  { 
    name: 'ki-auth', 
    partialize: s => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken }) 
  }
))
