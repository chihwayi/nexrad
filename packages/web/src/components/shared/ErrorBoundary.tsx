import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center space-y-4 animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-danger/10 flex items-center justify-center">
            <AlertTriangle size={28} className="text-danger" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">Something went wrong</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {this.state.error?.message ??
                'An unexpected error occurred. Try refreshing the page.'}
            </p>
          </div>
          <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw size={14} />
            Reload page
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
