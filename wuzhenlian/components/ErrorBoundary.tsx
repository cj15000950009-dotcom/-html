import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React 错误边界组件
 * 用于捕获子组件树中的 JavaScript 错误，避免整个应用崩溃
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('❌ [ErrorBoundary] 捕获到 React 错误:', error);
    console.error('❌ [ErrorBoundary] 错误信息:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          color: 'white',
          background: '#1e293b',
          borderRadius: '8px',
          margin: '20px',
          maxWidth: '800px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          <h2 style={{ color: '#ef4444', marginBottom: '16px' }}>❌ 应用加载错误</h2>
          <p style={{ marginBottom: '12px' }}>
            <strong>错误信息:</strong> {this.state.error?.message || '未知错误'}
          </p>
          {this.state.error?.stack && (
            <details style={{ marginTop: '16px' }}>
              <summary style={{ cursor: 'pointer', color: '#94a3b8' }}>查看详细错误堆栈</summary>
              <pre style={{
                marginTop: '8px',
                padding: '12px',
                background: '#0f172a',
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '12px',
                color: '#cbd5e1',
              }}>
                {this.state.error.stack}
              </pre>
            </details>
          )}
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              marginTop: '20px',
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            重新加载
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
