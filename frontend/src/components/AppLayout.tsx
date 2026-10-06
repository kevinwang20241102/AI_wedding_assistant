import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import AppSidebar from './AppSidebar'
import type { ShellModule } from './AppSidebar'
import LogoutConfirm from './LogoutConfirm'
import WeddingArchiveDrawer from './WeddingArchiveDrawer'
import { useAuth } from '../stores/authContext'
import '../styles/shell.css'

const SCROLL_SELECTORS = [
  '.content-scroll',
  '.plan-scroll',
  '.budget-scroll',
  '.guest-sections',
  '.chat-log',
  '.roster-table',
]

type ScrollSnap = { selector: string; top: number; left: number }

function captureScroll(): ScrollSnap[] {
  const snaps: ScrollSnap[] = []
  SCROLL_SELECTORS.forEach((selector) => {
    const node = document.querySelector(selector)
    if (node instanceof HTMLElement) {
      snaps.push({ selector, top: node.scrollTop, left: node.scrollLeft })
    }
  })
  return snaps
}

function restoreScroll(snaps: ScrollSnap[]) {
  snaps.forEach(({ selector, top, left }) => {
    const node = document.querySelector(selector)
    if (node instanceof HTMLElement) {
      node.scrollTop = top
      node.scrollLeft = left
    }
  })
}

function moduleFromPath(pathname: string, search: string): ShellModule {
  if (pathname === '/wedding') {
    const from = new URLSearchParams(search).get('from')
    if (from === 'budget' || from === 'seating' || from === 'xiaobei') return from
    return 'plan'
  }
  if (pathname === '/budget' || pathname === '/seating' || pathname === '/xiaobei') {
    return pathname.slice(1) as ShellModule
  }
  return 'plan'
}

function destFromArchive(search: string) {
  const from = new URLSearchParams(search).get('from')
  if (from === 'budget') return '/budget'
  if (from === 'seating') return '/seating'
  if (from === 'xiaobei') return '/xiaobei'
  return '/plan'
}

export default function AppLayout() {
  const { user, logout, status } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [folded, setFolded] = useState(false)
  const [askLogout, setAskLogout] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [drawerShown, setDrawerShown] = useState(false)
  const closeTimer = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined)
  const pendingScroll = useRef<ScrollSnap[] | null>(null)
  const archiveOpen = location.pathname === '/wedding'
  const currentModule = moduleFromPath(location.pathname, location.search)

  useEffect(() => {
    if (!archiveOpen) {
      setDrawerShown(false)
      return undefined
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setDrawerShown(true)
      return undefined
    }
    const frame = window.requestAnimationFrame(() => setDrawerShown(true))
    return () => window.cancelAnimationFrame(frame)
  }, [archiveOpen])

  useEffect(
    () => () => {
      if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current)
    },
    [],
  )

  useLayoutEffect(() => {
    const snaps = pendingScroll.current
    if (!snaps) return
    restoreScroll(snaps)
    const frame = window.requestAnimationFrame(() => restoreScroll(snaps))
    pendingScroll.current = null
    return () => window.cancelAnimationFrame(frame)
  }, [location.pathname, location.search])

  function openArchive() {
    const focus = currentModule === 'budget' ? '&focus=budget' : ''
    pendingScroll.current = captureScroll()
    navigate(`/wedding?from=${currentModule}${focus}`)
  }

  function closeArchive() {
    const dest = destFromArchive(location.search)
    pendingScroll.current = captureScroll()
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      navigate(dest)
      return
    }
    setDrawerShown(false)
    if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => navigate(dest), 560)
  }

  function toggleArchive() {
    if (archiveOpen) closeArchive()
    else openArchive()
  }

  async function confirmLogout() {
    setConfirming(true)
    try {
      await logout()
      navigate('/login', { replace: true })
    } finally {
      setConfirming(false)
      setAskLogout(false)
    }
  }

  if (!user) return null

  const page = (
    <div className="content-scroll">
      <Outlet />
    </div>
  )

  return (
    <div className="shell">
      <AppSidebar
        folded={folded}
        onToggleFold={() => setFolded((value) => !value)}
        currentModule={currentModule}
        username={user.username}
        userId={user.id}
        archiveOpen={archiveOpen}
        onToggleArchive={toggleArchive}
        onLogout={() => setAskLogout(true)}
        modulesDisabled={status === 'loading'}
      />
      <main className="content">
        {archiveOpen ? (
          <>
            <div className="content-under" inert>
              {page}
            </div>
            <div className="drawer-layer">
              <div
                className={`drawer-sheet${drawerShown ? ' is-shown' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="archive-title"
              >
                <WeddingArchiveDrawer onClose={closeArchive} />
              </div>
            </div>
          </>
        ) : (
          page
        )}
      </main>
      <LogoutConfirm
        open={askLogout}
        onCancel={() => setAskLogout(false)}
        onConfirm={() => {
          void confirmLogout()
        }}
        confirming={confirming}
      />
    </div>
  )
}
