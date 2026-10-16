import { Component, type ReactNode } from 'react';
import { Alert } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Alert
          tone="error"
          title="No se pudo mostrar esta pantalla"
          action={
            <Button size="sm" variant="secondary" onClick={() => this.setState({ error: null })}>
              Reintentar
            </Button>
          }
        >
          {this.state.error.message}
        </Alert>
      );
    }
    return this.props.children;
  }
}
