import type { FormEvent, MouseEvent, PointerEvent } from 'react'
import { Fragment } from 'react'
import { stageNo } from '../../mocks/plan'
import type { StagePublic, TaskPublic, TaskStatus } from '../../mocks/plan'
import TaskRow from './TaskRow'

type StageSectionProps = {
  stage: StagePublic
  index: number
  tasks: TaskPublic[]
  today: string
  collapsed: boolean
  noMotion: boolean
  lifted: boolean
  editing: boolean
  nameError: string
  editTaskId: number | null
  liftedTaskId: number | null
  dropBeforeTaskId: number | null | undefined
  onHeadClick: (event: MouseEvent<HTMLDivElement>, stageId: number) => void
  onHeadPointerDown: (event: PointerEvent<HTMLDivElement>, stageId: number) => void
  onToggle: (stageId: number) => void
  onEditStage: (stageId: number) => void
  onSaveStage: (stageId: number, name: string) => void
  onDeleteStage: (stageId: number) => void
  onAddTask: (stageId: number) => void
  onTaskPointerDown: (event: PointerEvent<HTMLDivElement>, taskId: number) => void
  onEditTask: (taskId: number) => void
  onSaveTaskName: (taskId: number, name: string) => void
  onTaskStatus: (taskId: number, status: TaskStatus) => void
  onTaskDue: (taskId: number, dueDate: string) => void
  onDeleteTask: (taskId: number) => void
}

export default function StageSection({
  stage,
  index,
  tasks,
  today,
  collapsed,
  noMotion,
  lifted,
  editing,
  nameError,
  editTaskId,
  liftedTaskId,
  dropBeforeTaskId,
  onHeadClick,
  onHeadPointerDown,
  onToggle,
  onEditStage,
  onSaveStage,
  onDeleteStage,
  onAddTask,
  onTaskPointerDown,
  onEditTask,
  onSaveTaskName,
  onTaskStatus,
  onTaskDue,
  onDeleteTask,
}: StageSectionProps) {
  const number = stageNo(index)

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    event.stopPropagation()
    const value = String(new FormData(event.currentTarget).get('name') ?? '')
    onSaveStage(stage.id, value)
  }

  return (
    <section
      className={`section${collapsed ? ' is-collapsed' : ''}${noMotion ? ' no-motion' : ''}${lifted ? ' is-lifted' : ''}`}
      data-stage={String(stage.id)}
    >
      <div
        className="section-head"
        data-id={String(stage.id)}
        onClick={(event) => onHeadClick(event, stage.id)}
        onPointerDown={(event) => onHeadPointerDown(event, stage.id)}
      >
        {editing ? (
          <div className="stage-title">
            <span className="stage-tag">{number}</span>
            <span>【</span>
            <form className="stage-rename" onSubmit={handleSave} key={`${stage.id}-rename`}>
              <input
                name="name"
                type="text"
                defaultValue={stage.name}
                aria-label="阶段名称"
                className={nameError ? 'invalid' : ''}
                autoFocus
                onFocus={(event) => event.currentTarget.select()}
              />
              <button className="btn stage-act" type="submit">
                保存
              </button>
            </form>
            <span>】</span>
            {nameError ? <div className="error">{nameError}</div> : null}
          </div>
        ) : (
          <h2>
            <span className="stage-tag">{number}</span>
            <span>【{stage.name}】</span>
          </h2>
        )}
        <span className="stage-tools">
          {editing ? null : (
            <button className="btn stage-act" type="button" onClick={() => onEditStage(stage.id)}>
              编辑
            </button>
          )}
          <button className="btn stage-act" type="button" onClick={() => onDeleteStage(stage.id)}>
            删除
          </button>
          <button
            className="fold-arrow"
            type="button"
            aria-expanded={collapsed ? 'false' : 'true'}
            aria-label={collapsed ? '展开' : '收起'}
            onClick={() => onToggle(stage.id)}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M2.2 4.2 L6 8 L9.8 4.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </span>
      </div>
      <div className="stage-body" inert={collapsed || undefined}>
        <div className="stage-body-inner">
          <div className="stage-add">
            <button className="btn secondary" type="button" onClick={() => onAddTask(stage.id)}>
              新增任务
            </button>
          </div>
          {tasks.map((task) => (
            <Fragment key={task.id}>
              {dropBeforeTaskId === task.id ? <div className="drop-line" /> : null}
              <TaskRow
                task={task}
                today={today}
                editing={editTaskId === task.id}
                lifted={liftedTaskId === task.id}
                onPointerDown={onTaskPointerDown}
                onEdit={onEditTask}
                onSaveName={onSaveTaskName}
                onStatus={onTaskStatus}
                onDue={onTaskDue}
                onDelete={onDeleteTask}
              />
            </Fragment>
          ))}
          {dropBeforeTaskId === null ? <div className="drop-line" /> : null}
        </div>
      </div>
    </section>
  )
}
