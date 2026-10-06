import type { LoginSuccessData, RegisterSuccessData } from '../types/auth'

export type AuthSession = {
  user: LoginSuccessData | RegisterSuccessData
  remember: boolean
}

let session: AuthSession | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function getAuthSession() {
  return session
}

export function setAuthSession(next: AuthSession | null) {
  session = next
  emit()
}

export function subscribeAuth(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
