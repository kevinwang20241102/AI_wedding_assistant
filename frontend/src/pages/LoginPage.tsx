import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { isMockAuth, loginAccount } from '../services/authService'
import { setAuthSession } from '../services/authSession'
import { ApiError } from '../types/auth'

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

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const notice = (location.state as { notice?: string } | null)?.notice ?? ''
  const passwordRef = useRef<HTMLInputElement>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({})
  const [banner, setBanner] = useState(notice)

  function togglePassword() {
    setPasswordVisible((visible) => !visible)
    passwordRef.current?.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: { username?: string; password?: string } = {}
    if (!username.trim()) nextErrors.username = '请填写用户名'
    if (!password) nextErrors.password = '请填写密码'
    setErrors(nextErrors)
    if (nextErrors.username || nextErrors.password) return

    setSaving(true)
    setBanner('')
    try {
      const user = await loginAccount({
        username: username.trim(),
        password,
        remember,
      })
      setAuthSession({ user, remember })
      navigate(user.has_wedding ? '/plan' : '/wedding/new', { replace: true })
    } catch (error) {
      const message = error instanceof ApiError ? error.error : '用户名或密码不正确'
      setErrors({ password: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="auth-wrap has-hearts">
      {isMockAuth() ? <p className="demo">[Mock]</p> : null}
      <form className="card" onSubmit={handleSubmit}>
        <h1 className="brand-lockup">
          <ProductLogo />
          <span>备备</span>
        </h1>
        {banner ? <div className="banner">{banner}</div> : null}
        <div className="field">
          <label htmlFor="username">用户名</label>
          <input
            id="username"
            name="username"
            type="text"
            value={username}
            className={errors.username ? 'invalid' : undefined}
            onChange={(event) => setUsername(event.target.value)}
          />
          {errors.username ? <div className="error">{errors.username}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="password">密码</label>
          <div className="password-line">
            <input
              ref={passwordRef}
              id="password"
              name="password"
              type={passwordVisible ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              className={errors.password ? 'invalid' : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              className="reveal"
              type="button"
              aria-pressed={passwordVisible}
              aria-label={passwordVisible ? '隐藏密码' : '显示密码'}
              onClick={togglePassword}
            >
              {passwordVisible ? '隐藏' : '显示'}
            </button>
          </div>
          {errors.password ? <div className="error">{errors.password}</div> : null}
        </div>
        <label className="check">
          <input
            type="checkbox"
            name="remember"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          记住用户名和密码
        </label>
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? '正在保存' : '登录'}
        </button>
        <div className="links">
          <Link to="/register">注册</Link>
          <Link to="/reset-password">找回密码</Link>
        </div>
      </form>
    </div>
  )
}
