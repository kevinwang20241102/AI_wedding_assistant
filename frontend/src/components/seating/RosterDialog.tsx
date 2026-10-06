import { useMemo, useState } from 'react'
import { ATTENDANCES, attendKind, compareGuestSeq, guestSeq, groupNameOf } from '../../mocks/seating'
import type { GuestGroupPublic, GuestPublic } from '../../mocks/seating'

type RosterDialogProps = {
  guests: GuestPublic[]
  groups: GuestGroupPublic[]
  onClose: () => void
  onEdit: (guestId: number) => void
  onDelete: (guestId: number) => void
}

export default function RosterDialog({ guests, groups, onClose, onEdit, onDelete }: RosterDialogProps) {
  const [draftQuery, setDraftQuery] = useState('')
  const [draftType, setDraftType] = useState('')
  const [draftAttend, setDraftAttend] = useState('')
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [attend, setAttend] = useState('')

  const listed = useMemo(() => {
    const q = query.trim()
    return guests
      .filter((guest) => {
        if (q && !guest.name.includes(q)) return false
        if (type && String(guest.group_id) !== type) return false
        if (attend && (guest.attendance || '待定') !== attend) return false
        return true
      })
      .slice()
      .sort(compareGuestSeq)
  }, [attend, guests, query, type])

  return (
    <div className="modal-back" role="presentation" onClick={onClose}>
      <div
        className="modal roster"
        role="dialog"
        aria-modal="true"
        aria-labelledby="roster-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="roster-head-bar">
          <div className="modal-title" id="roster-title">
            全部宾客名单
          </div>
          <button className="btn secondary" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="roster-tools">
          <input
            type="text"
            placeholder="搜索姓名"
            aria-label="搜索姓名"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
          />
          <select
            aria-label="宾客类型筛选"
            value={draftType}
            onChange={(event) => setDraftType(event.target.value)}
          >
            <option value="">全部类型</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <select
            aria-label="出席状态筛选"
            value={draftAttend}
            onChange={(event) => setDraftAttend(event.target.value)}
          >
            <option value="">全部出席</option>
            {ATTENDANCES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button
            className="btn roster-reset"
            type="button"
            onClick={() => {
              setDraftQuery('')
              setDraftType('')
              setDraftAttend('')
              setQuery('')
              setType('')
              setAttend('')
            }}
          >
            重置
          </button>
          <button
            className="btn roster-apply"
            type="button"
            onClick={() => {
              setQuery(draftQuery)
              setType(draftType)
              setAttend(draftAttend)
            }}
          >
            搜索
          </button>
        </div>
        <div className="roster-table">
          <div className="roster-head">
            <span>宾客序号</span>
            <span>姓名</span>
            <span>宾客类型</span>
            <span>出席状态</span>
            <span />
          </div>
          <div className="roster-list">
            {listed.length ? (
              listed.map((guest) => (
                <div className="roster-row" key={guest.id}>
                  <span>{guestSeq(guest.seq)}</span>
                  <span>{guest.name}</span>
                  <span>{groupNameOf(groups, guest.group_id)}</span>
                  <span className="roster-attend">
                    <span className={`attend-tag ${attendKind(guest.attendance)}`}>{guest.attendance || '待定'}</span>
                  </span>
                  <span className="roster-actions">
                    <button
                      className="btn danger"
                      type="button"
                      aria-label={`编辑${guest.name}`}
                      onClick={() => onEdit(guest.id)}
                    >
                      编辑
                    </button>
                    <button
                      className="btn danger"
                      type="button"
                      aria-label={`删除${guest.name}`}
                      onClick={() => onDelete(guest.id)}
                    >
                      删除
                    </button>
                  </span>
                </div>
              ))
            ) : (
              <div className="empty">{guests.length ? '没有符合条件的宾客' : '还没有宾客'}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
