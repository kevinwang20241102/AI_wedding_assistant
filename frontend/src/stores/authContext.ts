import { createContext, useContext } from 'react'
import type { LoginSuccessData } from '../types/auth'
import type { CreateWeddingRequest, WeddingPublic } from '../mocks'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type AuthValue = {
  status: AuthStatus
  user: LoginSuccessData | null
  createWedding: (input: CreateWeddingRequest) => Promise<WeddingPublic>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
