import { BrowserRouter } from 'react-router'
import { AppRoutes } from './router'
import './styles/auth.css'

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
