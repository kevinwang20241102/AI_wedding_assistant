import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../stores/authContext'
import { clampScale, compareGuestSeq } from '../mocks/seating'
import type { Attendance, GuestPublic, SeatingPageData } from '../mocks/seating'
import AddGuestDialog from '../components/seating/AddGuestDialog'
import EditGuestDialog from '../components/seating/EditGuestDialog'
import GuestPool from '../components/seating/GuestPool'
import RosterDialog from '../components/seating/RosterDialog'
import SeatCanvas from '../components/seating/SeatCanvas'
import SeatingBoard from '../components/seating/SeatingBoard'
import { useSeatingPointer } from '../components/seating/useSeatingPointer'
import {
  addGuest,
  deleteGuest,
  getSeating,
  previewAssignTable,
  previewDeleteGuest,
  previewDeleteTable,
  updateGuest,
} from '../services/guestService'
import {
  addTable,
  deleteTable,
  persistCanvasView,
  persistTablePosition,
  updateTable,
} from '../services/tableService'
import '../components/seating/seating.css'

const EMPTY_PAGE: SeatingPageData = {
  seating_stats: { guest_total: 0, confirmed: 0, seated: 0, unseated: 0 },
  guests: [],
  groups: [],
  tables: [],
  canvas: { scale: 1, x: 0, y: 0 },
}

const CANVAS_SAVE_MS = 400
const SCROLL_SELECTORS = ['.guest-sections', '.roster-table', '.content-scroll']

type ScrollSnap = { selector: string; top: number; left: number }

function captureScroll(): ScrollSnap[] {
  return SCROLL_SELECTORS.flatMap((selector) => {
    const node = document.querySelector(selector)
    if (!(node instanceof HTMLElement)) return []
    return [{ selector, top: node.scrollTop, left: node.scrollLeft }]
  })
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

export default function SeatingPage() {
  const { user } = useAuth()
  const userId = user?.id ?? 0
  const [page, setPage] = useState<SeatingPageData>(EMPTY_PAGE)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<SeatingPageData>(EMPTY_PAGE)
  const loadedRef = useRef(false)
  const pendingScroll = useRef<ScrollSnap[] | null>(null)
  const canvasTimer = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined)
  const pendingCanvas = useRef(false)
  const pendingMoves = useRef(new Map<number, { x: number; y: number }>())
  const busyRef = useRef(false)

  const applyPage = useCallback((next: SeatingPageData) => {
    pendingScroll.current = captureScroll()
    pageRef.current = next
    setPage(next)
    setLoadError('')
  }, [])

  const flushPersist = useCallback(() => {
    if (canvasTimer.current !== undefined) {
      window.clearTimeout(canvasTimer.current)
      canvasTimer.current = undefined
    }
    const current = pageRef.current
    const shouldSaveCanvas = pendingCanvas.current
    const moves = new Map(pendingMoves.current)
    pendingCanvas.current = false
    pendingMoves.current.clear()
    if (shouldSaveCanvas) {
      void persistCanvasView(userId, current.canvas).catch(() => undefined)
    }
    moves.forEach((pos, tableId) => {
      void persistTablePosition(tableId, pos.x, pos.y).catch(() => undefined)
    })
  }, [userId])

  const schedulePersist = useCallback(() => {
    if (canvasTimer.current !== undefined) window.clearTimeout(canvasTimer.current)
    canvasTimer.current = window.setTimeout(() => {
      canvasTimer.current = undefined
      flushPersist()
    }, CANVAS_SAVE_MS)
  }, [flushPersist])

  useEffect(() => {
    let cancelled = false
    loadedRef.current = false
    setLoaded(false)
    async function load() {
      try {
        const next = await getSeating(userId)
        if (cancelled) return
        pageRef.current = next
        loadedRef.current = true
        setPage(next)
        setLoaded(true)
        setLoadError('')
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : '请求失败')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [userId])

  useLayoutEffect(() => {
    const snaps = pendingScroll.current
    if (!snaps) return
    restoreScroll(snaps)
    const frame = window.requestAnimationFrame(() => restoreScroll(snaps))
    pendingScroll.current = null
    return () => window.cancelAnimationFrame(frame)
  }, [page])

  useEffect(() => {
    function onHidden() {
      if (document.visibilityState === 'hidden') flushPersist()
    }
    function onPageHide() {
      flushPersist()
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onPageHide)
      flushPersist()
    }
  }, [flushPersist])

  const seatedGuests = useMemo(
    () => page.guests.filter((guest) => guest.table_id != null).slice().sort(compareGuestSeq),
    [page.guests],
  )
  const waitingGuests = useMemo(
    () => page.guests.filter((guest) => guest.table_id == null).slice().sort(compareGuestSeq),
    [page.guests],
  )
  const canvasGuests = useMemo(() => page.guests.slice().sort(compareGuestSeq), [page.guests])
  const editGuest = editId != null ? page.guests.find((guest) => guest.id === editId) ?? null : null

  useSeatingPointer({
    rootRef,
    boardRef,
    canvasRef,
    canvas: page.canvas,
    onSeat: (guestId, tableId) => {
      const current = pageRef.current
      if (!loadedRef.current) return
      applyPage(previewAssignTable(current, guestId, tableId))
      void updateGuest(userId, current, guestId, { table_id: tableId })
        .then((next) => applyPage(next))
        .catch(() => applyPage(current))
    },
    onUnseatToPool: (guestId) => {
      const current = pageRef.current
      if (!loadedRef.current) return
      applyPage(previewAssignTable(current, guestId, null))
      void updateGuest(userId, current, guestId, { table_id: null })
        .then((next) => applyPage(next))
        .catch(() => applyPage(current))
    },
    onTableMove: (tableId, x, y) => {
      const current = pageRef.current
      if (!loadedRef.current) return
      applyPage({
        ...current,
        tables: current.tables.map((table) =>
          table.id === tableId ? { ...table, pos_x: x, pos_y: y } : table,
        ),
      })
      pendingMoves.current.set(tableId, { x, y })
      schedulePersist()
    },
    onPan: (x, y) => {
      const current = pageRef.current
      if (!loadedRef.current) return
      applyPage({ ...current, canvas: { ...current.canvas, x, y } })
      pendingCanvas.current = true
      schedulePersist()
    },
    onZoom: (dir) => {
      const current = pageRef.current
      if (!loadedRef.current) return
      applyPage({
        ...current,
        canvas: { ...current.canvas, scale: clampScale(current.canvas.scale + dir * 0.1) },
      })
      pendingCanvas.current = true
      schedulePersist()
    },
  })

  function saveGuest(input: {
    name: string
    groupId: number | null
    groupName?: string
    attendance: Attendance
    seq: string
  }) {
    const current = pageRef.current
    if (!loadedRef.current || busyRef.current) return null
    busyRef.current = true
    void addGuest(userId, current, {
      name: input.name,
      group_id: input.groupId,
      group_name: input.groupName,
      attendance: input.attendance,
      seq: input.seq,
    })
      .then((next) => {
        applyPage(next)
        setAddOpen(false)
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : '请求失败')
      })
      .finally(() => {
        busyRef.current = false
      })
    return null
  }

  function saveEdit(
    guest: GuestPublic,
    input: {
      name: string
      groupId: number | null
      groupName?: string
      attendance: Attendance
      seq: string
    },
  ) {
    const current = pageRef.current
    if (!loadedRef.current || busyRef.current) return null
    busyRef.current = true
    void updateGuest(userId, current, guest.id, {
      name: input.name,
      group_id: input.groupId,
      group_name: input.groupName,
      attendance: input.attendance,
      seq: input.seq,
    })
      .then((next) => {
        applyPage(next)
        setEditId(null)
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : '请求失败')
      })
      .finally(() => {
        busyRef.current = false
      })
    return null
  }

  function removeGuest(guestId: number) {
    const current = pageRef.current
    if (!loadedRef.current) return
    applyPage(previewDeleteGuest(current, guestId))
    if (editId === guestId) setEditId(null)
    void deleteGuest(userId, current, guestId)
      .then(applyPage)
      .catch(() => applyPage(current))
  }

  return (
    <div className="seat-page" ref={rootRef}>
      {!loaded && loadError ? <p role="status">{loadError}</p> : null}
      <SeatingBoard
        guestTotal={page.seating_stats.guest_total}
        confirmed={page.seating_stats.confirmed}
        seated={page.seating_stats.seated}
        unseated={page.seating_stats.unseated}
      />
      <div className="seat">
        <GuestPool
          seatedGuests={seatedGuests}
          waitingGuests={waitingGuests}
          onAdd={() => {
            if (!loadedRef.current) return
            setAddOpen(true)
            setRosterOpen(false)
          }}
          onRoster={() => {
            if (!loadedRef.current) return
            setRosterOpen(true)
            setAddOpen(false)
          }}
          onDeleteGuest={removeGuest}
        />
        <SeatCanvas
          canvas={page.canvas}
          tables={page.tables}
          guests={canvasGuests}
          boardRef={boardRef}
          canvasRef={canvasRef}
          onZoom={(dir) => {
            const current = pageRef.current
            if (!loadedRef.current) return
            applyPage({
              ...current,
              canvas: { ...current.canvas, scale: clampScale(current.canvas.scale + dir * 0.1) },
            })
            pendingCanvas.current = true
            schedulePersist()
          }}
          onAddTable={() => {
            const current = pageRef.current
            if (!loadedRef.current) return
            void addTable(userId, current).then(applyPage)
          }}
          onRename={(tableId, name) => {
            const current = pageRef.current
            if (!loadedRef.current) return
            void updateTable(userId, current, tableId, { name }).then(applyPage)
          }}
          onCapacity={(tableId, capacity) => {
            const current = pageRef.current
            if (!loadedRef.current) return
            void updateTable(userId, current, tableId, { capacity }).then(applyPage)
          }}
          onMain={(tableId) => {
            const current = pageRef.current
            if (!loadedRef.current) return
            void updateTable(userId, current, tableId, { is_head: true }).then(applyPage)
          }}
          onDelete={(tableId) => {
            const current = pageRef.current
            if (!loadedRef.current) return
            applyPage(previewDeleteTable(current, tableId))
            void deleteTable(userId, current, tableId)
              .then(applyPage)
              .catch(() => applyPage(current))
          }}
          onUnseat={(guestId) => {
            const current = pageRef.current
            if (!loadedRef.current) return
            applyPage(previewAssignTable(current, guestId, null))
            void updateGuest(userId, current, guestId, { table_id: null })
              .then(applyPage)
              .catch(() => applyPage(current))
          }}
        />
      </div>
      {addOpen ? (
        <AddGuestDialog groups={page.groups} onClose={() => setAddOpen(false)} onSave={saveGuest} />
      ) : null}
      {rosterOpen ? (
        <RosterDialog
          guests={page.guests}
          groups={page.groups}
          onClose={() => {
            setRosterOpen(false)
            setEditId(null)
          }}
          onEdit={setEditId}
          onDelete={removeGuest}
        />
      ) : null}
      {editGuest ? (
        <EditGuestDialog
          guest={editGuest}
          groups={page.groups}
          onClose={() => setEditId(null)}
          onSave={(input) => saveEdit(editGuest, input)}
        />
      ) : null}
    </div>
  )
}
