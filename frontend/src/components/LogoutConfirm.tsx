type LogoutConfirmProps = {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  confirming: boolean
}

export default function LogoutConfirm({ open, onCancel, onConfirm, confirming }: LogoutConfirmProps) {
  if (!open) return null
  return (
    <div className="modal-back is-front" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="logout-ask">
        <div className="modal-title" id="logout-ask">
          是否确认退出登录
        </div>
        <div className="modal-actions">
          <button className="btn secondary" type="button" onClick={onCancel} disabled={confirming}>
            取消
          </button>
          <button className="btn primary" type="button" onClick={onConfirm} disabled={confirming}>
            确认
          </button>
        </div>
      </div>
    </div>
  )
}
