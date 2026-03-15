import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-surface-page px-4">
          <div className="w-full max-w-md text-center">
            <h1 className="mb-2 text-2xl font-semibold text-foreground">
              Something went wrong
            </h1>
            <p className="mb-6 text-base-62">
              Something went wrong. Please try refreshing the page.
            </p>
            <button
              onClick={this.handleReload}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2"
            >
              Refresh Page
            </button>
            {this.state.error && (
              <div className="mt-6">
                <button
                  onClick={this.toggleDetails}
                  className="text-sm text-base-40 hover:text-base-62 underline underline-offset-2"
                >
                  {this.state.showDetails ? "Hide technical details" : "Show technical details"}
                </button>
                {this.state.showDetails && (
                  <pre className="mt-3 max-h-32 overflow-auto rounded bg-base-04 p-3 text-left text-xs text-base-55">
                    {this.state.error.message}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
