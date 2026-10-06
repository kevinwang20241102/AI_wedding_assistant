import type { GuestPublic } from '../../mocks/seating'
import GuestChip from './GuestChip'

type GuestPoolProps = {
  seatedGuests: GuestPublic[]
  waitingGuests: GuestPublic[]
  onAdd: () => void
  onRoster: () => void
  onDeleteGuest: (guestId: number) => void
}

export default function GuestPool({
  seatedGuests,
  waitingGuests,
  onAdd,
  onRoster,
  onDeleteGuest,
}: GuestPoolProps) {
  return (
    <aside className="pool" data-pool="1">
      <button className="btn primary" type="button" onClick={onAdd}>
        添加宾客
      </button>
      <button className="btn secondary" type="button" onClick={onRoster}>
        全部宾客名单
      </button>
      <div className="guest-sections">
        <section className="guest-section">
          <div className="section-label">已排座</div>
          <div className="pool-list">
            {seatedGuests.length ? (
              seatedGuests.map((guest) => (
                <GuestChip
                  key={guest.id}
                  guest={guest}
                  tone="placed"
                  removeAct="delete-guest"
                  removeLabel={`删除${guest.name}`}
                  onRemove={() => onDeleteGuest(guest.id)}
                />
              ))
            ) : (
              <div className="empty">已排座是空的</div>
            )}
          </div>
        </section>
        <section className="guest-section">
          <div className="section-label">未排座</div>
          <div className="pool-list">
            {waitingGuests.length ? (
              waitingGuests.map((guest) => (
                <GuestChip
                  key={guest.id}
                  guest={guest}
                  tone="waiting"
                  removeAct="delete-guest"
                  removeLabel={`删除${guest.name}`}
                  onRemove={() => onDeleteGuest(guest.id)}
                />
              ))
            ) : (
              <div className="empty">未排座是空的</div>
            )}
          </div>
        </section>
      </div>
    </aside>
  )
}
