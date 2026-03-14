import { useState } from 'react'
import App from './App.jsx'
import Dashboard from './Dashboard.jsx'

export default function Root() {
  const [page, setPage] = useState('dashboard')

  return (
    <>
      <nav className="page-nav">
        <button
          className={page === 'dashboard' ? 'active' : ''}
          onClick={() => setPage('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={page === 'voice' ? 'active' : ''}
          onClick={() => setPage('voice')}
        >
          Voice Assistant
        </button>
      </nav>
      {page === 'dashboard' ? <Dashboard /> : <App />}
    </>
  )
}
