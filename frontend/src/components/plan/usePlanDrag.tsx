import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { createPortal } from 'react-dom'

export type TaskDrop = { stageId: number; beforeId: number | null }
export type StageDrop = { beforeId: number | null }

type Press = {
  kind: 'task' | 'stage'
  id: number
  x: number
  y: number
  pointerId: number
  target: HTMLElement
}

type DragState = {
  kind: 'task' | 'stage'
  id: number
  x: number
  y: number
  ghost: string
  taskDrop: TaskDrop | null
  stageDrop: StageDrop | null
}

type UsePlanDragArgs = {
  scrollRef: RefObject<HTMLElement | null>
  taskName: (id: number) => string
  stageLabel: (id: number) => string
  onMoveTask: (taskId: number, drop: TaskDrop) => void
  onMoveStage: (stageId: number, drop: StageDrop) => void
  onExpandStage: (stageId: number) => void
}

function blocked(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('button, a, input, select, textarea, label')
}

function nextTaskId(row: Element, skipId: number) {
  let node = row.nextElementSibling
  while (node) {
    const nested = node.matches?.('.task[data-task]') ? node : node.querySelector?.('.task[data-task]')
    if (nested instanceof HTMLElement && Number(nested.dataset.task) !== skipId) return Number(nested.dataset.task)
    node = node.nextElementSibling
  }
  return null
}

function nextStageId(section: Element, skipId: number) {
  let node = section.nextElementSibling
  while (node) {
    if (node instanceof HTMLElement && node.matches('.section[data-stage]') && Number(node.dataset.stage) !== skipId) {
      return Number(node.dataset.stage)
    }
    node = node.nextElementSibling
  }
  return null
}

export function usePlanDrag({
  scrollRef,
  taskName,
  stageLabel,
  onMoveTask,
  onMoveStage,
  onExpandStage,
}: UsePlanDragArgs) {
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

  const dropTaskAt = useCallback(
    (x: number, y: number, taskId: number): TaskDrop | null => {
      const under = document.elementFromPoint(x, y)
      const section = under?.closest('.section') as HTMLElement | null
      if (!section) return null
      const stageId = Number(section.dataset.stage)
      onExpandStage(stageId)
      const rows = [...section.querySelectorAll('.task[data-task]')].filter(
        (row) => Number((row as HTMLElement).dataset.task) !== taskId,
      ) as HTMLElement[]
      if (!rows.length) return { stageId, beforeId: null }
      const row = under?.closest('.task[data-task]') as HTMLElement | null
      if (row && Number(row.dataset.task) !== taskId && row.closest('.section') === section) {
        const rect = row.getBoundingClientRect()
        const before = y < rect.top + rect.height / 2
        return { stageId, beforeId: before ? Number(row.dataset.task) : nextTaskId(row, taskId) }
      }
      for (const item of rows) {
        const rect = item.getBoundingClientRect()
        if (y < rect.top + rect.height / 2) return { stageId, beforeId: Number(item.dataset.task) }
      }
      return { stageId, beforeId: null }
    },
    [onExpandStage],
  )

  const dropStageAt = useCallback((x: number, y: number, stageId: number): StageDrop | null => {
    const under = document.elementFromPoint(x, y)
    if (!under || !under.closest('.stage-list, .section')) return null
    const sections = [...document.querySelectorAll('.section[data-stage]')].filter(
      (item) => Number((item as HTMLElement).dataset.stage) !== stageId,
    ) as HTMLElement[]
    if (!sections.length) return { beforeId: null }
    const section = under.closest('.section[data-stage]') as HTMLElement | null
    if (section && Number(section.dataset.stage) !== stageId) {
      const rect = section.getBoundingClientRect()
      const before = y < rect.top + rect.height / 2
      return { beforeId: before ? Number(section.dataset.stage) : nextStageId(section, stageId) }
    }
    for (const item of sections) {
      const rect = item.getBoundingClientRect()
      if (y < rect.top + rect.height / 2) return { beforeId: Number(item.dataset.stage) }
    }
    return { beforeId: null }
  }, [])

  const finish = useCallback(
    (event?: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      if (event) {
        if (current.kind === 'task') current.taskDrop = dropTaskAt(event.clientX, event.clientY, current.id)
        else current.stageDrop = dropStageAt(event.clientX, event.clientY, current.id)
      }
      swallowRef.current = true
      if (scrollTimerRef.current) window.clearInterval(scrollTimerRef.current)
      scrollTimerRef.current = 0
      document.body.classList.remove('task-dragging')
      const movedTask = current.kind === 'task' ? current.taskDrop : null
      const movedStage = current.kind === 'stage' ? current.stageDrop : null
      dragRef.current = null
      setDrag(null)
      if (current.kind === 'task' && movedTask) onMoveTask(current.id, movedTask)
      if (current.kind === 'stage' && movedStage) onMoveStage(current.id, movedStage)
    },
    [dropStageAt, dropTaskAt, onMoveStage, onMoveTask],
  )

  const move = useCallback(
    (event: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      current.x = event.clientX
      current.y = event.clientY
      if (current.kind === 'task') current.taskDrop = dropTaskAt(event.clientX, event.clientY, current.id) ?? current.taskDrop
      else current.stageDrop = dropStageAt(event.clientX, event.clientY, current.id) ?? current.stageDrop
      setDrag({ ...current })
    },
    [dropStageAt, dropTaskAt],
  )

  const begin = useCallback(() => {
    const held = pressRef.current
    if (!held) return
    pressRef.current = null
    timerRef.current = 0
    const ghost = held.kind === 'task' ? taskName(held.id) : stageLabel(held.id)
    const next: DragState = {
      kind: held.kind,
      id: held.id,
      x: held.x,
      y: held.y,
      ghost,
      taskDrop: null,
      stageDrop: null,
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
      if (active.kind === 'task') {
        active.taskDrop = dropTaskAt(active.x, active.y, active.id) ?? active.taskDrop
      } else {
        active.stageDrop = dropStageAt(active.x, active.y, active.id) ?? active.stageDrop
      }
      setDrag({ ...active })
    }, 50)
  }, [dropStageAt, dropTaskAt, scrollRef, stageLabel, taskName])

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
        dragRef.current.taskDrop = null
        dragRef.current.stageDrop = null
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
    (kind: 'task' | 'stage', id: number, event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || blocked(event.target)) return
      pressRef.current = {
        kind,
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

  const consumeClick = useCallback(() => {
    if (!swallowRef.current) return false
    swallowRef.current = false
    return true
  }, [])

  const ghost =
    drag &&
    createPortal(
      <div className="task-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }}>
        {drag.ghost}
      </div>,
      document.body,
    )

  return { drag, startPress, consumeClick, ghost }
}
