import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import {ensureWindowApiBridge} from "./services/web-api-bridge"
import App from "./App"

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

async function bootstrap() {
  if (typeof window !== 'undefined') {
    await ensureWindowApiBridge()
  }

  renderApp()
}

void bootstrap()
