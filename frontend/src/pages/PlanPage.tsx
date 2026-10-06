import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { useAuth } from '../stores/authContext'
import { shanghaiToday, slashDate, stageNo } from '../mocks/plan'
import type { PlanAggregate, TaskStatus } from '../mocks/plan'
import PlanBoard from '../components/plan/PlanBoard'
import StageSection from '../components/plan/StageSection'
import DeleteConfirm from '../components/plan/DeleteConfirm'
import { usePlanDrag } from '../components/plan/usePlanDrag'
import {
  createPlanTask,
  deletePlanTask,
  getPlan,
  movePlanTask,
  previewMoveTask,
  taskInsertIndex,
  updatePlanTask,
} from '../services/taskService'
import {
  createPlanStage,
  deletePlanStage,
  movePlanStage,
  previewMoveStage,
  stageInsertIndex,
  updatePlanStage,
} from '../services/stageService'
import '../components/plan/plan.css'

function emptyCollapsed(plan: PlanAggregate) {
  const map: Record<number, boolean> = {}
  plan.stages.forEach((stage) => {
    map[stage.id] = stage.id !== plan.current_stage
  })
  return map
}

export default function PlanPage() {
  const { user } = useAuth()
  const userId = user?.id ?? 0
  const [plan, setPlan] = useState<PlanAggregate | null>(null)
  const [loadError, setLoadError] = useState('')
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  const [quiet, setQuiet] = useState<Record<number, boolean>>({})
  const [editTaskId, setEditTaskId] = useState<number | null>(null)
  const [editStageId, setEditStageId] = useState<number | null>(null)
  const [stageError, setStageError] = useState('')
  const [confirmTaskId, setConfirmTaskId] = useState<number | null>(null)
  const [confirmStageId, setConfirmStageId] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pendingScroll = useRef<{ plan: number; content: number } | null>(null)
  const planRef = useRef<PlanAggregate | null>(null)
  const today = shanghaiToday()

  const applyPlan = useCallback((next: PlanAggregate) => {
    const content = document.querySelector('.content-scroll')
    pendingScroll.current = {
      plan: scrollRef.current?.scrollTop ?? 0,
      content: content instanceof HTMLElement ? content.scrollTop : 0,
    }
    planRef.current = next
    setPlan(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const next = await getPlan(userId)
        if (cancelled) return
        planRef.current = next
        setPlan(next)
        setCollapsed(emptyCollapsed(next))
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
    const snap = pendingScroll.current
    if (!snap) return
    if (scrollRef.current) scrollRef.current.scrollTop = snap.plan
    const content = document.querySelector('.content-scroll')
    if (content instanceof HTMLElement) content.scrollTop = snap.content
    pendingScroll.current = null
  }, [plan])

  const taskName = useCallback(
    (id: number) => plan?.tasks.find((task) => task.id === id)?.name ?? '',
    [plan],
  )
  const stageLabel = useCallback(
    (id: number) => {
      if (!plan) return ''
      const index = plan.stages.findIndex((stage) => stage.id === id)
      const stage = index >= 0 ? plan.stages[index] : null
      return stage ? `${stageNo(index)}【${stage.name}】` : ''
    },
    [plan],
  )

  const expandStage = useCallback((stageId: number) => {
    setCollapsed((current) => ({ ...current, [stageId]: false }))
    setQuiet((current) => ({ ...current, [stageId]: true }))
  }, [])

  const { drag, startPress, consumeClick, ghost } = usePlanDrag({
    scrollRef,
    taskName,
    stageLabel,
    onExpandStage: expandStage,
    onMoveTask: (taskId, drop) => {
      const current = planRef.current
      if (!current) return
      const sortOrder = taskInsertIndex(current, taskId, drop.stageId, drop.beforeId)
      applyPlan(previewMoveTask(current, taskId, drop.stageId, drop.beforeId))
      setQuiet({})
      void movePlanTask(userId, taskId, drop.stageId, sortOrder)
        .then(applyPlan)
        .catch(() => applyPlan(current))
    },
    onMoveStage: (stageId, drop) => {
      const current = planRef.current
      if (!current) return
      const sortOrder = stageInsertIndex(current, stageId, drop.beforeId)
      applyPlan(previewMoveStage(current, stageId, drop.beforeId))
      setQuiet({})
      void movePlanStage(userId, stageId, sortOrder)
        .then(applyPlan)
        .catch(() => applyPlan(current))
    },
  })

  const tasksByStage = useMemo(() => {
    const map = new Map<number, NonNullable<typeof plan>['tasks']>()
    if (!plan) return map
    plan.stages.forEach((stage) => map.set(stage.id, []))
    plan.tasks.forEach((task) => {
      const list = map.get(task.stage_id)
      if (list) list.push(task)
    })
    return map
  }, [plan])

  function toggleStage(stageId: number) {
    if (!plan) return
    setCollapsed((current) => {
      const now = current[stageId] !== undefined ? current[stageId] : stageId !== plan.current_stage
      return { ...current, [stageId]: !now }
    })
    setQuiet((current) => ({ ...current, [stageId]: false }))
  }

  function handleHeadClick(event: MouseEvent<HTMLDivElement>, stageId: number) {
    if (consumeClick()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, select, textarea, label, form')) return
    toggleStage(stageId)
  }

  async function addTask(stageId: number) {
    const result = await createPlanTask(userId, stageId)
    applyPlan(result.plan)
    setEditTaskId(result.createdId || null)
    setCollapsed((current) => ({ ...current, [stageId]: false }))
  }

  async function saveTaskName(taskId: number, name: string) {
    const current = plan?.tasks.find((task) => task.id === taskId)
    const nextName = name.trim() || current?.name || '新任务'
    applyPlan(await updatePlanTask(userId, taskId, { name: nextName }))
    setEditTaskId(null)
  }

  async function saveStage(stageId: number, name: string) {
    const result = await updatePlanStage(userId, stageId, name)
    applyPlan(result.data)
    if (!result.ok) {
      setStageError(result.error)
      return
    }
    setStageError('')
    setEditStageId(null)
  }

  async function addStage() {
    const result = await createPlanStage(userId)
    applyPlan(result.plan)
    if (result.createdId) {
      setEditStageId(result.createdId)
      setStageError('')
      setCollapsed((current) => ({ ...current, [result.createdId]: false }))
    }
  }

  async function confirmDelete() {
    if (confirmStageId != null) {
      applyPlan(await deletePlanStage(userId, confirmStageId))
      if (editStageId === confirmStageId) setEditStageId(null)
    } else if (confirmTaskId != null) {
      applyPlan(await deletePlanTask(userId, confirmTaskId))
      if (editTaskId === confirmTaskId) setEditTaskId(null)
    }
    setConfirmStageId(null)
    setConfirmTaskId(null)
  }

  if (!plan) {
    return (
      <div className="plan-page">
        <p role="status">{loadError || '正在加载'}</p>
      </div>
    )
  }

  return (
    <div className="plan-page">
      <PlanBoard
        weddingDate={slashDate(plan.wedding_date)}
        countdownDays={plan.countdown_days}
        completed={plan.progress.completed}
        inProgress={plan.progress.in_progress}
        total={plan.progress.total}
      />
      <div className="plan-scroll" ref={scrollRef}>
        <div className="stage-add-bar">
          <p className="stage-hint">* 温馨提示：点击长按拖动可调换阶段/任务位置哦~</p>
          <button className="btn primary" type="button" onClick={() => void addStage()}>
            新增阶段
          </button>
        </div>
        <div className="stage-list">
          {plan.stages.map((stage, index) => {
            const isCollapsed = collapsed[stage.id] !== undefined ? collapsed[stage.id] : stage.id !== plan.current_stage
            const taskDrop = drag?.kind === 'task' && drag.taskDrop?.stageId === stage.id ? drag.taskDrop : null
            const showStageLine = drag?.kind === 'stage' && drag.stageDrop?.beforeId === stage.id
            return (
              <Fragment key={stage.id}>
                {showStageLine ? <div className="drop-line" /> : null}
                <StageSection
                  stage={stage}
                  index={index}
                  tasks={tasksByStage.get(stage.id) ?? []}
                  today={today}
                  collapsed={isCollapsed}
                  noMotion={!!quiet[stage.id]}
                  lifted={drag?.kind === 'stage' && drag.id === stage.id}
                  editing={editStageId === stage.id}
                  nameError={editStageId === stage.id ? stageError : ''}
                  editTaskId={editTaskId}
                  liftedTaskId={drag?.kind === 'task' ? drag.id : null}
                  dropBeforeTaskId={taskDrop ? taskDrop.beforeId : undefined}
                  onHeadClick={handleHeadClick}
                  onHeadPointerDown={(event, stageId) => startPress('stage', stageId, event)}
                  onToggle={toggleStage}
                  onEditStage={(stageId) => {
                    setEditStageId(stageId)
                    setStageError('')
                  }}
                  onSaveStage={(stageId, name) => {
                    void saveStage(stageId, name)
                  }}
                  onDeleteStage={setConfirmStageId}
                  onAddTask={(stageId) => {
                    void addTask(stageId)
                  }}
                  onTaskPointerDown={(event, taskId) => startPress('task', taskId, event)}
                  onEditTask={setEditTaskId}
                  onSaveTaskName={(taskId, name) => {
                    void saveTaskName(taskId, name)
                  }}
                  onTaskStatus={(taskId, status: TaskStatus) => {
                    void updatePlanTask(userId, taskId, { status }).then(applyPlan)
                  }}
                  onTaskDue={(taskId, dueDate) => {
                    void updatePlanTask(userId, taskId, { due_date: dueDate }).then(applyPlan)
                  }}
                  onDeleteTask={setConfirmTaskId}
                />
              </Fragment>
            )
          })}
          {drag?.kind === 'stage' && drag.stageDrop?.beforeId === null ? <div className="drop-line" /> : null}
        </div>
      </div>
      {ghost}
      <DeleteConfirm
        open={confirmTaskId != null || confirmStageId != null}
        onCancel={() => {
          setConfirmTaskId(null)
          setConfirmStageId(null)
        }}
        onConfirm={() => {
          void confirmDelete()
        }}
      />
    </div>
  )
}
