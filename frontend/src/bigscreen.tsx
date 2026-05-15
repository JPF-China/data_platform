import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { BigScreen } from './components/BigScreen'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BigScreen />
  </StrictMode>,
)
