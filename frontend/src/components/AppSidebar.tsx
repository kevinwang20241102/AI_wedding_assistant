import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  deleteConversation,
  getXiaobeiVersion,
  listConversations,
  refreshConversations,
  renameConversation,
  startConversationEvents,
  subscribeXiaobei,
} from '../services/conversationService'
import PersonalCenter from './PersonalCenter'
import DeleteChatDialog from './xiaobei/DeleteChatDialog'
import RenameChatDialog from './xiaobei/RenameChatDialog'
import { MoreDots, RenameIcon, TrashIcon } from './xiaobei/ChatIcons'
import './xiaobei/xiaobei.css'

const MODULES = [
  { to: '/xiaobei', name: '新建对话', kind: 'xiaobei' },
  { to: '/plan', name: '备婚计划书', kind: 'plan' },
  { to: '/budget', name: '预算管理本', kind: 'budget' },
  { to: '/seating', name: '婚宴座位表', kind: 'seating' },
] as const

export type ShellModule = (typeof MODULES)[number]['kind']

function ProductLogo() {
  const rows = ['01100110', '11111111', '11111111', '11111111', '01111110', '00111100', '00011000']
  const tile = 4
  const gap = 1
  const step = tile + gap
  return (
    <svg
      className="logo"
      viewBox={`0 0 ${8 * step - gap} ${7 * step - gap}`}
      aria-hidden="true"
      focusable="false"
    >
      {rows.flatMap((row, y) =>
        [...row].flatMap((cell, x) =>
          cell === '1'
            ? [
                <rect
                  key={`${x}-${y}`}
                  x={x * step}
                  y={y * step}
                  width={tile}
                  height={tile}
                />,
              ]
            : [],
        ),
      )}
    </svg>
  )
}

function ModuleLogo({ kind }: { kind: ShellModule }) {
  if (kind === 'xiaobei') {
    return (
      <svg className="mod-logo" viewBox="0 0 33 33" aria-hidden="true" focusable="false">
        <path
          d="M12.2 23.03A9.25 7.5 0 1 0 9.6 21.26L10.7 26Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="13" cy="16.5" r="1.05" fill="currentColor" />
        <circle cx="17" cy="16.5" r="1.05" fill="currentColor" />
        <circle cx="21" cy="16.5" r="1.05" fill="currentColor" />
      </svg>
    )
  }
  if (kind === 'plan') {
    return (
      <svg className="mod-logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <g transform="translate(16 16) scale(1.3333) translate(-16 -16)">
          <rect x="12.2" y="11.2" width="7.6" height="10.2" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M14.4 10.2h3.2M14.2 14.4h3.6M14.2 17h3.6M14.2 19.4h2.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </g>
      </svg>
    )
  }
  if (kind === 'budget') {
    return (
      <svg className="mod-logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <g transform="translate(16 16) scale(1.3333) translate(-16 -16)">
          <path d="M16 11.2 A4.8 4.8 0 0 0 16 20.8 Z" fill="currentColor" />
          <circle cx="16" cy="16" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </g>
      </svg>
    )
  }
  return (
    <svg className="mod-logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <g transform="translate(16 16) scale(1.072) translate(-16 -16)">
        {[10.8, 16, 21.2].flatMap((y) =>
          [10.8, 16, 21.2].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" fill="currentColor" />),
        )}
      </g>
    </svg>
  )
}

function FoldIcon({ folded }: { folded: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="1.25" y="2.5" width="13.5" height="11" rx="2" fill="#FFFFFF" stroke="currentColor" strokeWidth="1.25" />
      {folded ? (
        <rect x="10.15" y="4.15" width="3.15" height="7.7" rx="0.7" fill="currentColor" />
      ) : (
        <rect x="2.7" y="4.15" width="3.15" height="7.7" rx="0.7" fill="currentColor" />
      )}
    </svg>
  )
}

function ToolSvg({ kind }: { kind: 'settings' | 'edit' | 'logout' }) {
  if (kind === 'settings') {
    return (
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
    )
  }
  if (kind === 'edit') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinejoin="round"
          strokeLinecap="round"
          d="M15.15 4.35 L19.65 8.85 L8.9 19.6 H4.4 V15.1 Z"
        />
        <path fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" d="M13.2 6.3 L17.7 10.8" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
        strokeLinecap="round"
        d="M9.2 5 H6.4 A1.9 1.9 0 0 0 4.5 6.9 v10.2 A1.9 1.9 0 0 0 6.4 19 h2.8"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
        strokeLinecap="round"
        d="M10.2 12 H19.5 M16.1 8.4 L19.5 12 L16.1 15.6"
      />
    </svg>
  )
}

type AppSidebarProps = {
  folded: boolean
  onToggleFold: () => void
  currentModule: ShellModule
  username: string
  userId: number
  archiveOpen: boolean
  onToggleArchive: () => void
  onLogout: () => void
  modulesDisabled: boolean
}

export default function AppSidebar({
  folded,
  onToggleFold,
  currentModule,
  username,
  userId,
  archiveOpen,
  onToggleArchive,
  onLogout,
  modulesDisabled,
}: AppSidebarProps) {
  const navRef = useRef<HTMLElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const prevIndexRef = useRef(-1)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const activeChatId = currentModule === 'xiaobei' && params.get('c') ? Number(params.get('c')) : 0
  const version = useSyncExternalStore(subscribeXiaobei, getXiaobeiVersion, getXiaobeiVersion)
  const chats = listConversations(userId)
  const [menuId, setMenuId] = useState<number | null>(null)
  const [renameId, setRenameId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const renameChat = chats.find((item) => item.id === renameId)
  void version

  useLayoutEffect(() => {
    const nav = navRef.current
    const indicator = indicatorRef.current
    if (!nav || !indicator) return
    const current = nav.querySelector('a.current')
    if (!(current instanceof HTMLElement)) {
      indicator.classList.add('is-off')
      prevIndexRef.current = -1
      return
    }
    indicator.classList.remove('is-off')
    const links = [...nav.querySelectorAll('a')]
    const next = links.findIndex((link) => link === current)
    const y = current.offsetTop
    const from = prevIndexRef.current
    prevIndexRef.current = next
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || from < 0 || from === next) {
      indicator.style.transition = 'none'
      indicator.style.transform = `translateY(${y}px)`
      return
    }
    const fromEl = links[from]
    const fromY = fromEl instanceof HTMLElement ? fromEl.offsetTop : y
    indicator.style.transition = 'none'
    indicator.style.transform = `translateY(${fromY}px)`
    indicator.getBoundingClientRect()
    indicator.style.transition = ''
    indicator.style.transform = `translateY(${y}px)`
  }, [currentModule, folded, activeChatId])

  useEffect(() => {
    void refreshConversations(userId)
    return startConversationEvents(userId)
  }, [userId])

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      const target = event.target as HTMLElement
      if (!target.closest('.chat-row')) setMenuId(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <aside className={`side${folded ? ' is-folded' : ''}`}>
      <div className="side-head">
        <div className="brand">
          <ProductLogo />
          <span>备备</span>
        </div>
        <button
          className="nav-fold"
          type="button"
          aria-expanded={folded ? 'false' : 'true'}
          aria-label={folded ? '展开侧栏' : '折叠侧栏'}
          onClick={onToggleFold}
        >
          <FoldIcon folded={folded} />
        </button>
      </div>
      <nav className="nav" ref={navRef}>
        <div className="nav-indicator" ref={indicatorRef} aria-hidden="true" />
        {MODULES.map((item) => (
          <Link
            key={item.kind}
            to={item.to}
            className={
              item.kind === 'xiaobei'
                ? currentModule === 'xiaobei' && !activeChatId
                  ? 'current'
                  : undefined
                : currentModule === item.kind
                  ? 'current'
                  : undefined
            }
            aria-label={item.name}
            aria-disabled={modulesDisabled ? 'true' : undefined}
            onClick={(event) => {
              if (modulesDisabled) event.preventDefault()
            }}
          >
            <ModuleLogo kind={item.kind} />
            <span>{item.name}</span>
          </Link>
        ))}
      </nav>
      <div className="chat-side" aria-hidden={folded ? true : undefined} inert={folded}>
        <div className="chat-recent">最近</div>
        <div className="chat-side-list">
          {chats.map((chat) => (
            <div
              className={`chat-row${chat.id === activeChatId ? ' current' : ''}${menuId === chat.id ? ' is-menu' : ''}`}
              key={chat.id}
            >
              <Link to={`/xiaobei?c=${chat.id}`}>{chat.title}</Link>
              <button
                className="chat-more"
                type="button"
                aria-label="对话操作"
                aria-expanded={menuId === chat.id ? 'true' : 'false'}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setMenuId((current) => (current === chat.id ? null : chat.id))
                }}
              >
                <MoreDots />
              </button>
              {menuId === chat.id ? (
                <div className="chat-more-menu" role="menu">
                  <button
                    type="button"
                    onClick={() => {
                      setRenameId(chat.id)
                      setMenuId(null)
                    }}
                  >
                    <RenameIcon />
                    <span>重命名</span>
                  </button>
                  <button
                    className="is-danger"
                    type="button"
                    onClick={() => {
                      setDeleteId(chat.id)
                      setMenuId(null)
                    }}
                  >
                    <TrashIcon />
                    <span>删除</span>
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <PersonalCenter username={username} folded={folded} />
      <div className="side-foot" aria-hidden={folded ? true : undefined} inert={folded}>
        <button
          className={`btn primary${archiveOpen ? ' is-open' : ''}`}
          type="button"
          aria-expanded={archiveOpen ? 'true' : 'false'}
          onClick={onToggleArchive}
        >
          编辑婚礼档案
          <span className="archive-caret" aria-hidden="true">
            <svg viewBox="0 0 12 12">
              <path d="M8.6 2.8 L3.8 6 L8.6 9.2 Z" fill="currentColor" />
            </svg>
          </span>
        </button>
        <button className="logout" type="button" onClick={onLogout}>
          退出登录
        </button>
      </div>
      <div className="side-tools" aria-hidden={folded ? undefined : true} inert={!folded}>
        <span className="side-tool is-mark" aria-hidden="true">
          <ToolSvg kind="settings" />
        </span>
        <button
          className={`side-tool${archiveOpen ? ' is-open' : ''}`}
          type="button"
          aria-label="编辑婚礼档案"
          aria-expanded={archiveOpen ? 'true' : 'false'}
          onClick={onToggleArchive}
        >
          <ToolSvg kind="edit" />
        </button>
        <button className="side-tool" type="button" aria-label="退出登录" onClick={onLogout}>
          <ToolSvg kind="logout" />
        </button>
      </div>
      <RenameChatDialog
        open={!!renameChat}
        title={renameChat?.title ?? ''}
        customized={renameChat?.title_customized ?? false}
        onCancel={() => setRenameId(null)}
        onConfirm={(title) => {
          if (renameId) void renameConversation(userId, renameId, title)
          setRenameId(null)
        }}
      />
      <DeleteChatDialog
        open={deleteId != null}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId == null) return
          const wasCurrent = deleteId === activeChatId
          const id = deleteId
          setDeleteId(null)
          void deleteConversation(userId, id).then(() => {
            if (wasCurrent) navigate('/xiaobei')
          })
        }}
      />
    </aside>
  )
}
