import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import App from './App'
import './index.css'
import { queryClient } from './lib/query'
import { useUi } from './stores/ui.store'

function ThemedToaster() {
  const { theme } = useUi()
  return (
    <Toaster
      theme={theme === 'system' ? 'system' : theme}
      richColors
      position="top-right"
      closeButton
      toastOptions={{ duration: 4000 }}
      expand={false}
    />
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <ThemedToaster />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
