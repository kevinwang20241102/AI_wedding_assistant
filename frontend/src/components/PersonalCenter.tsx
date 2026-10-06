import { avatarInitial } from '../utils/avatarInitial'

function localDateLabel() {
  const date = new Date()
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function SettingsMark() {
  return (
    <span className="me-setting" aria-hidden="true">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinejoin="round"
          d="M12 3 L19.79 7.5 L19.79 16.5 L12 21 L4.21 16.5 L4.21 7.5 Z"
        />
        <circle cx="12" cy="12" r="3.05" fill="none" stroke="currentColor" strokeWidth="2.1" />
      </svg>
    </span>
  )
}

export default function PersonalCenter({ username, folded }: { username: string; folded: boolean }) {
  return (
    <div className="me" aria-hidden={folded ? true : undefined} inert={folded}>
      <span className="me-avatar">{avatarInitial(username)}</span>
      <span className="me-copy">
        <span className="me-name">{username}</span>
        <span className="me-date">{localDateLabel()}</span>
      </span>
      <SettingsMark />
    </div>
  )
}
