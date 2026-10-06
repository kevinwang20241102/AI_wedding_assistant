import { useState } from 'react'
import type { FormEvent } from 'react'
import { ATTENDANCES, guestSeq } from '../../mocks/seating'
import type { Attendance, GuestGroupPublic, GuestPublic } from '../../mocks/seating'

const NEW_GROUP = '__new'

type EditGuestDialogProps = {
  guest: GuestPublic
  groups: GuestGroupPublic[]
  onClose: () => void
  onSave: (input: {
    name: string
    groupId: number | null
    groupName?: string
    attendance: Attendance
    seq: string
  }) => string | null
}

export default function EditGuestDialog({ guest, groups, onClose, onSave }: EditGuestDialogProps) {
  const names = groups.some((group) => group.id === guest.group_id)
    ? groups
    : groups.concat({ id: guest.group_id, name: `分组${guest.group_id}`, is_preset: false })
  const [name, setName] = useState(guest.name)
  const [group, setGroup] = useState(String(guest.group_id))
  const [newGroup, setNewGroup] = useState('')
  const [attendance, setAttendance] = useState<Attendance>(
    ATTENDANCES.includes(guest.attendance) ? guest.attendance : '待定',
  )
  const [seq, setSeq] = useState(String(guestSeq(guest.seq)))
  const [errors, setErrors] = useState<{ name?: string; newGroup?: string }>({})
  const creating = group === NEW_GROUP

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: { name?: string; newGroup?: string } = {}
    if (!name.trim()) next.name = '请填写姓名'
    if (creating && !newGroup.trim()) next.newGroup = '请填写分组名称'
    setErrors(next)
    if (next.name || next.newGroup) return
    const message = onSave({
      name: name.trim(),
      groupId: creating ? null : Number(group),
      groupName: creating ? newGroup.trim() : undefined,
      attendance,
      seq,
    })
    if (message) setErrors({ name: message })
  }

  return (
    <div className="modal-back" data-layer="edit" role="presentation" onClick={onClose}>
      <form
        className="modal"
        data-form="edit-guest"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-guest-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="modal-title" id="edit-guest-title">
          编辑宾客
        </div>
        <div className="field">
          <label htmlFor="edit-guest-name">姓名</label>
          <input
            id="edit-guest-name"
            name="name"
            type="text"
            value={name}
            className={errors.name ? 'invalid' : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          {errors.name ? <div className="error">{errors.name}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="edit-guest-group">分组</label>
          <select
            id="edit-guest-group"
            name="group"
            value={group}
            onChange={(event) => setGroup(event.target.value)}
          >
            {names.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option value={NEW_GROUP}>新建分组</option>
          </select>
        </div>
        <div className="field" data-new-group="" hidden={!creating}>
          <label htmlFor="edit-guest-new-group">新分组名称</label>
          <input
            id="edit-guest-new-group"
            name="newGroup"
            type="text"
            value={newGroup}
            className={errors.newGroup ? 'invalid' : undefined}
            onChange={(event) => setNewGroup(event.target.value)}
          />
          {errors.newGroup ? <div className="error">{errors.newGroup}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="edit-guest-attend">出席</label>
          <select
            id="edit-guest-attend"
            name="attendance"
            value={attendance}
            onChange={(event) => setAttendance(event.target.value as Attendance)}
          >
            {ATTENDANCES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="edit-guest-seq">宾客序号</label>
          <input
            id="edit-guest-seq"
            name="seq"
            type="text"
            inputMode="numeric"
            value={seq}
            onChange={(event) => setSeq(event.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn secondary" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="submit">
            保存
          </button>
        </div>
      </form>
    </div>
  )
}
