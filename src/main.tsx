import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// WCAG 3.1.1 — declare document language (index.html uses a Figma template placeholder).
document.documentElement.lang = 'pt-BR'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
