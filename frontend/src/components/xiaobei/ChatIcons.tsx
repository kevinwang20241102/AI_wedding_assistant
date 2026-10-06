import type { ReactNode } from 'react'

type IconProps = { className?: string }

export function ProductLogo({ className = 'logo' }: IconProps) {
  const rows = ['01100110', '11111111', '11111111', '11111111', '01111110', '00111100', '00011000']
  const tile = 4
  const gap = 1
  const step = tile + gap
  return (
    <svg
      className={className}
      viewBox={`0 0 ${8 * step - gap} ${7 * step - gap}`}
      aria-hidden="true"
      focusable="false"
    >
      {rows.flatMap((row, y) =>
        [...row].flatMap((cell, x) =>
          cell === '1'
            ? [<rect key={`${x}-${y}`} x={x * step} y={y * step} width={tile} height={tile} />]
            : [],
        ),
      )}
    </svg>
  )
}

export function ChatGlyph({ kind }: { kind: 'copy' | 'edit' | 'like' | 'dislike' | 'regen' | 'down' }) {
  const common = { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': true as const }
  if (kind === 'copy') {
    return (
      <svg {...common}>
        <rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M14 8V6.2A2.2 2.2 0 0 0 11.8 4H6.2A2.2 2.2 0 0 0 4 6.2v5.6A2.2 2.2 0 0 0 6.2 14H8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    )
  }
  if (kind === 'edit') {
    return (
      <svg {...common}>
        <path
          d="M4 17.5 14.2 7.3l2.5 2.5L6.5 20H4zM15.4 6.1l2.5 2.5 1.3-1.3-2.5-2.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (kind === 'like') {
    return (
      <svg {...common}>
        <path
          d="M7 11v9H4.8A1.8 1.8 0 0 1 3 18.2V12.8A1.8 1.8 0 0 1 4.8 11H7zm0 0 3.2-6.2A2.2 2.2 0 0 1 12.2 3.6c.9 0 1.6.8 1.6 1.7V8h4.3a2 2 0 0 1 2 2.3l-1.1 7A2 2 0 0 1 17 19H7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (kind === 'dislike') {
    return (
      <svg {...common}>
        <path
          d="M17 13V4h2.2A1.8 1.8 0 0 1 21 5.8v5.4A1.8 1.8 0 0 1 19.2 13H17zm0 0-3.2 6.2A2.2 2.2 0 0 1 11.8 20.4c-.9 0-1.6-.8-1.6-1.7V16H5.9a2 2 0 0 1-2-2.3l1.1-7A2 2 0 0 1 7 5h10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (kind === 'regen') {
    return (
      <svg {...common}>
        <path
          d="M4.6 12a7.4 7.4 0 0 1 12.5-5.3L19 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M19 4.8V9h-4.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M19.4 12a7.4 7.4 0 0 1-12.5 5.3L5 15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M5 19.2V15h4.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path
        d="M6.5 10.2 12 15.5l5.5-5.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function MoreDots() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="4" cy="8" r="1.2" fill="currentColor" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
      <circle cx="12" cy="8" r="1.2" fill="currentColor" />
    </svg>
  )
}

export function RenameIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d="M3.2 11.8 11.4 3.6l1 1-8.2 8.2H3.2zM12.1 2.9l1 1 1.1-1.1-1-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d="M3.5 4.5h9M6 4.5V3.4h4v1.1M5 4.5l.5 8.2h5l.5-8.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" fill="currentColor" />
    </svg>
  )
}

export function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="10" r="1.3" fill="currentColor" />
      <path d="M7 16l3.2-3.2 2.2 2.2L16 11.2 19 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M7 3.5h7.2L19 8.2V20.5H7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 3.5V8.2H19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function SendArrow() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M12 18.5V6.5M7 11.2 12 6.5l5 4.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ModelChevron() {
  return (
    <svg className="chat-model-chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path d="M2.2 4.2L6 8l3.8-3.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ModelCheck() {
  return (
    <svg className="chat-model-check" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M3.2 8.2l3 3 6.6-6.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ChatToolBtn({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      <span className="chat-tip">{label}</span>
    </button>
  )
}
