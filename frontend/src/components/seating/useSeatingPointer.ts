import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { CanvasView } from '../../mocks/seating'

type Drag =
  | { type: 'table'; id: number; ox: number; oy: number; x: number; y: number }
  | { type: 'guest'; id: number; startX: number; startY: number; moved: boolean }
  | { type: 'pan'; x: number; y: number }

type UseSeatingPointerArgs = {
  rootRef: RefObject<HTMLElement | null>
  boardRef: RefObject<HTMLElement | null>
  canvasRef: RefObject<HTMLElement | null>
  canvas: CanvasView
  onSeat: (guestId: number, tableId: number) => void
  onUnseatToPool: (guestId: number) => void
  onTableMove: (tableId: number, x: number, y: number) => void
  onPan: (x: number, y: number) => void
  onZoom: (dir: number) => void
}

export function useSeatingPointer({
  rootRef,
  boardRef,
  canvasRef,
  canvas,
  onSeat,
  onUnseatToPool,
  onTableMove,
  onPan,
  onZoom,
}: UseSeatingPointerArgs) {
  const dragRef = useRef<Drag | null>(null)
  const canvasRefState = useRef(canvas)
  const moveTable = useRef(onTableMove)
  const panTo = useRef(onPan)
  const seatTo = useRef(onSeat)
  const unseatTo = useRef(onUnseatToPool)
  const zoomBy = useRef(onZoom)
  canvasRefState.current = canvas
  moveTable.current = onTableMove
  panTo.current = onPan
  seatTo.current = onSeat
  unseatTo.current = onUnseatToPool
  zoomBy.current = onZoom

  useEffect(() => {
    const maybeRoot = rootRef.current
    if (!maybeRoot) return undefined
    const host: HTMLElement = maybeRoot

    function clearOver() {
      host.querySelectorAll('.table.over').forEach((node) => node.classList.remove('over'))
    }

    function applyCanvasTransform(x: number, y: number, scale: number) {
      const canvasEl = canvasRef.current
      if (canvasEl) canvasEl.style.transform = `translate(${x}px,${y}px) scale(${scale})`
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null
      if (!target) return
      const handle = target.closest('[data-handle]') as HTMLElement | null
      const guest = target.closest('[data-guest]') as HTMLElement | null
      if (handle) {
        const table = host.querySelector(`[data-table="${handle.dataset.handle}"]`) as HTMLElement | null
        if (!table) return
        dragRef.current = {
          type: 'table',
          id: Number(handle.dataset.handle),
          ox: event.clientX,
          oy: event.clientY,
          x: Number.parseFloat(table.style.left) || 0,
          y: Number.parseFloat(table.style.top) || 0,
        }
        table.classList.add('dragging')
        try {
          handle.setPointerCapture(event.pointerId)
        } catch {
          /* synthetic pointer ids may be uncaptured */
        }
        event.preventDefault()
        return
      }
      if (guest && !target.closest('[data-act]')) {
        dragRef.current = {
          type: 'guest',
          id: Number(guest.dataset.guest),
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
        }
        guest.classList.add('dragging')
        try {
          guest.setPointerCapture(event.pointerId)
        } catch {
          /* synthetic pointer ids may be uncaptured */
        }
        event.preventDefault()
        return
      }
      if (target.classList.contains('board') || target.classList.contains('canvas')) {
        const view = canvasRefState.current
        dragRef.current = { type: 'pan', x: event.clientX - view.x, y: event.clientY - view.y }
        try {
          target.setPointerCapture(event.pointerId)
        } catch {
          /* synthetic pointer ids may be uncaptured */
        }
      }
    }

    function onPointerMove(event: PointerEvent) {
      const drag = dragRef.current
      if (!drag) return
      const view = canvasRefState.current
      if (drag.type === 'table') {
        const scale = view.scale || 1
        const x = drag.x + (event.clientX - drag.ox) / scale
        const y = drag.y + (event.clientY - drag.oy) / scale
        const el = host.querySelector(`[data-table="${drag.id}"]`) as HTMLElement | null
        if (el) {
          el.style.left = `${x}px`
          el.style.top = `${y}px`
        }
        return
      }
      if (drag.type === 'pan') {
        applyCanvasTransform(event.clientX - drag.x, event.clientY - drag.y, view.scale)
        return
      }
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true
      clearOver()
      const under = document.elementFromPoint(event.clientX, event.clientY)
      const table = under?.closest('[data-table]')
      if (table) table.classList.add('over')
    }

    function onPointerUp(event: PointerEvent) {
      const drag = dragRef.current
      dragRef.current = null
      if (!drag) return
      if (drag.type === 'table') {
        const el = host.querySelector(`[data-table="${drag.id}"]`) as HTMLElement | null
        el?.classList.remove('dragging')
        const x = Number.parseFloat(el?.style.left || '') || drag.x
        const y = Number.parseFloat(el?.style.top || '') || drag.y
        moveTable.current(drag.id, x, y)
        return
      }
      if (drag.type === 'pan') {
        panTo.current(event.clientX - drag.x, event.clientY - drag.y)
        return
      }
      const under = document.elementFromPoint(event.clientX, event.clientY)
      host.querySelector(`[data-guest="${drag.id}"]`)?.classList.remove('dragging')
      clearOver()
      if (!drag.moved) return
      const table = under?.closest('[data-table]') as HTMLElement | null
      const pool = under?.closest('[data-pool]')
      if (table) seatTo.current(drag.id, Number(table.dataset.table))
      else if (pool) unseatTo.current(drag.id)
    }

    function onPointerCancel() {
      const drag = dragRef.current
      dragRef.current = null
      if (!drag) return
      if (drag.type === 'table') {
        host.querySelector(`[data-table="${drag.id}"]`)?.classList.remove('dragging')
      }
      if (drag.type === 'guest') {
        host.querySelector(`[data-guest="${drag.id}"]`)?.classList.remove('dragging')
        clearOver()
      }
      if (drag.type === 'pan') {
        applyCanvasTransform(canvasRefState.current.x, canvasRefState.current.y, canvasRefState.current.scale)
      }
    }

    host.addEventListener('pointerdown', onPointerDown)
    host.addEventListener('pointermove', onPointerMove)
    host.addEventListener('pointerup', onPointerUp)
    host.addEventListener('pointercancel', onPointerCancel)
    return () => {
      host.removeEventListener('pointerdown', onPointerDown)
      host.removeEventListener('pointermove', onPointerMove)
      host.removeEventListener('pointerup', onPointerUp)
      host.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [canvasRef, rootRef])

  useEffect(() => {
    const board = boardRef.current
    if (!board) return undefined
    const surface = board
    function onWheel(event: WheelEvent) {
      if (!surface.contains(event.target as Node)) return
      event.preventDefault()
      zoomBy.current(event.deltaY < 0 ? 1 : -1)
    }
    surface.addEventListener('wheel', onWheel, { passive: false })
    return () => surface.removeEventListener('wheel', onWheel)
  }, [boardRef])
}
