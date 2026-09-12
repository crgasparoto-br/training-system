import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/Button';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError(): State {
    return {
      hasError: true,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Erro de renderizacao capturado pelo boundary:', error, errorInfo);
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background p-6">
          <div
            className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-6 text-center"
            role="alert"
            aria-labelledby="app-error-title"
            aria-describedby="app-error-description"
          >
            <h1 id="app-error-title" className="text-lg font-semibold text-foreground">
              Nao foi possivel carregar esta tela
            </h1>
            <p id="app-error-description" className="mt-2 text-sm text-muted-foreground">
              Ocorreu um erro inesperado na renderizacao. Atualize a pagina para tentar novamente.
            </p>
            <div className="mt-4 flex justify-center">
              <Button type="button" onClick={this.handleReload}>
                Atualizar pagina
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
