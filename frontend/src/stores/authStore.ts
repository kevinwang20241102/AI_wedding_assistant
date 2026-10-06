import { mockCurrentUser, mockLogout } from '../mocks'
import {
  fetchCurrentUser,
  isMockAuth,
  logoutAccount,
} from '../services/authService'
import { getAuthSession, setAuthSession } from '../services/authSession'

export async function restoreAuthSession() {
  if (isMockAuth()) {
    const session = getAuthSession()
    if (!session) {
      setAuthSession(null)
      return null
    }
    try {
      const me = await mockCurrentUser(session.user.id)
      if (me.has_wedding !== session.user.has_wedding) {
        setAuthSession({ user: me, remember: session.remember })
      }
      return getAuthSession()
    } catch {
      setAuthSession(null)
      return null
    }
  }

  try {
    const me = await fetchCurrentUser()
    if (!me) {
      if (!getAuthSession()) setAuthSession(null)
      return getAuthSession()
    }
    const current = getAuthSession()
    setAuthSession({ user: me, remember: current?.remember ?? false })
    return getAuthSession()
  } catch {
    if (!getAuthSession()) setAuthSession(null)
    return getAuthSession()
  }
}

export async function confirmLogoutSession() {
  if (isMockAuth()) {
    await mockLogout()
  } else {
    await logoutAccount()
  }
  setAuthSession(null)
}
