import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { setUserHasWedding } from '../mocks'
import type { CreateWeddingRequest } from '../mocks'
import { createWeddingProject, isMockAuth } from '../services/authService'
import { getAuthSession, setAuthSession, subscribeAuth } from '../services/authSession'
import { AuthContext } from './authContext'
import type { AuthStatus, AuthValue } from './authContext'
import { confirmLogoutSession, restoreAuthSession } from './authStore'

function readSession() {
  return getAuthSession()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncSession()
  const [ready, setReady] = useState(false)
  const user = session?.user ?? null
  const status: AuthStatus = !ready ? 'loading' : session ? 'authenticated' : 'anonymous'

  useEffect(() => {
    let cancelled = false
    void restoreAuthSession().finally(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const createWedding = useCallback(async (input: CreateWeddingRequest) => {
    const current = getAuthSession()
    if (!current) throw new Error('未登录')
    const created = await createWeddingProject(current.user.id, input)
    if (isMockAuth()) setUserHasWedding(current.user.id, true)
    setAuthSession({
      user: { ...current.user, has_wedding: true },
      remember: current.remember,
    })
    return created
  }, [])

  const logout = useCallback(async () => {
    await confirmLogoutSession()
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      createWedding,
      logout,
    }),
    [status, user, createWedding, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function useSyncSession() {
  const [session, setSession] = useState(readSession)
  useEffect(() => subscribeAuth(() => setSession(readSession())), [])
  return session
}
