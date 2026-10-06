import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { createPortal } from 'react-dom'

export type CatDrop = { beforeId: number | null }

type Press = {
  id: number
  x: number
  y: number
  pointerId: number
  target: HTMLElement
}

type DragState = {
  id: number
  x: number
  y: number
  ghost: string
  drop: CatDrop | null
}

type UseBudgetDragArgs = {
  scrollRef: RefObject<HTMLElement | null>
  categoryName: (id: number) => string
  onMove: (categoryId: number, drop: CatDrop) => void
}

function blocked(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('button, a, input, select, textarea, label')
}

function nextCatId(row: Element, skipId: number) {
  let node = row.nextElementSibling
  while (node) {
    if (node instanceof HTMLElement && node.matches('.cat-item[data-cat]') && Number(node.dataset.cat) !== skipId) {
      return Number(node.dataset.cat)
    }
    node = node.nextElementSibling
  }
  return null
}

export function useBudgetDrag({ scrollRef, categoryName, onMove }: UseBudgetDragArgs) {
  const pressRef = useRef<Press | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const swallowRef = useRef(false)
  const timerRef = useRef<number>(0)
  const scrollTimerRef = useRef<number>(0)
  const [drag, setDrag] = useState<DragState | null>(null)

  const clearPress = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = 0
    pressRef.current = null
  }, [])

  const dropCatAt = useCallback((x: number, y: number, catId: number): CatDrop | null => {
    const under = document.elementFromPoint(x, y)
    if (!under || !under.closest('.cat-list, .cat-item')) return null
    const rows = [...document.querySelectorAll('.cat-item[data-cat]')].filter(
      (row) => Number((row as HTMLElement).dataset.cat) !== catId,
    ) as HTMLElement[]
    if (!rows.length) return { beforeId: null }
    const row = under.closest('.cat-item[data-cat]') as HTMLElement | null
    if (row && Number(row.dataset.cat) !== catId) {
      const rect = row.getBoundingClientRect()
      const before = y < rect.top + rect.height / 2
      return { beforeId: before ? Number(row.dataset.cat) : nextCatId(row, catId) }
    }
    for (const item of rows) {
      const rect = item.getBoundingClientRect()
      if (y < rect.top + rect.height / 2) return { beforeId: Number(item.dataset.cat) }
    }
    return { beforeId: null }
  }, [])

  const finish = useCallback(
    (event?: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      if (event) current.drop = dropCatAt(event.clientX, event.clientY, current.id)
      swallowRef.current = true
      if (scrollTimerRef.current) window.clearInterval(scrollTimerRef.current)
      scrollTimerRef.current = 0
      document.body.classList.remove('task-dragging')
      const drop = current.drop
      dragRef.current = null
      setDrag(null)
      if (drop) onMove(current.id, drop)
    },
    [dropCatAt, onMove],
  )

  const move = useCallback(
    (event: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      current.x = event.clientX
      current.y = event.clientY
      current.drop = dropCatAt(event.clientX, event.clientY, current.id) ?? current.drop
      setDrag({ ...current })
    },
    [dropCatAt],
  )

  const begin = useCallback(() => {
    const held = pressRef.current
    if (!held) return
    pressRef.current = null
    timerRef.current = 0
    const next: DragState = {
      id: held.id,
      x: held.x,
      y: held.y,
      ghost: categoryName(held.id),
      drop: null,
    }
    dragRef.current = next
    document.body.classList.add('task-dragging')
    try {
      held.target.setPointerCapture(held.pointerId)
    } catch {
      /* pointer already released */
    }
    setDrag({ ...next })
    scrollTimerRef.current = window.setInterval(() => {
      const active = dragRef.current
      if (!active) return
      const scroller = scrollRef.current
      if (!scroller) return
      const rect = scroller.getBoundingClientRect()
      if (active.y < rect.top + 48) scroller.scrollTop -= 18
      else if (active.y > rect.bottom - 48) scroller.scrollTop += 18
      else return
      active.drop = dropCatAt(active.x, active.y, active.id) ?? active.drop
      setDrag({ ...active })
    }, 50)
  }, [categoryName, dropCatAt, scrollRef])

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const press = pressRef.current
      if (press && !dragRef.current) {
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) clearPress()
      }
      if (dragRef.current) move(event)
    }
    function onUp(event: PointerEvent) {
      if (dragRef.current) {
        finish(event)
        return
      }
      clearPress()
    }
    function onCancel() {
      if (pressRef.current) clearPress()
      if (dragRef.current) {
        dragRef.current.drop = null
        finish()
      }
    }
    function onClick(event: MouseEvent) {
      if (!swallowRef.current) return
      swallowRef.current = false
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('click', onClick, true)
      if (timerRef.current) window.clearTimeout(timerRef.current)
      if (scrollTimerRef.current) window.clearInterval(scrollTimerRef.current)
      document.body.classList.remove('task-dragging')
    }
  }, [clearPress, finish, move])

  const startPress = useCallback(
    (id: number, event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || blocked(event.target)) return
      pressRef.current = {
        id,
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
        target: event.currentTarget,
      }
      timerRef.current = window.setTimeout(begin, 500)
    },
    [begin],
  )

  const ghost =
    drag &&
    createPortal(
      <div className="budget-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }}>
        {drag.ghost}
      </div>,
      document.body,
    )

  return { drag, startPress, ghost }
}
