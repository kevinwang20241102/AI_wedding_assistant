import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
  withCredentials: true,
})

const AUTH_ERROR_PATHS = [
  '/users/login',
  '/users/password-reset/send-code',
  '/users/password-reset/confirm',
]

function isAuthChallengePath(url: string | undefined) {
  if (!url) return false
  if (url === '/users' || url.endsWith('/users')) return true
  return AUTH_ERROR_PATHS.some((path) => url.includes(path))
}

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url
      if (!isAuthChallengePath(url) && window.location.pathname !== '/login') {
        window.location.replace('/login')
      }
    }
    return Promise.reject(error)
  },
)

export default api
