import { Component, type ReactNode } from 'react';

/** Keep text-based tools usable if a deferred map module cannot be downloaded. */
export default class MapBoundary extends Component<{ children: ReactNode; className?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <section className={`map-loading map-unavailable ${this.props.className || ''}`} role="alert"><p>地圖暫時無法顯示。文字資訊仍可使用，重新載入頁面後可再試。</p></section>
      : this.props.children;
  }
}
