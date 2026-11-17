import { Component, type ReactNode } from 'react';
import { routeCopy } from '../route-copy';

export default class PlanBoundary extends Component<{ onClose: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <section className="planner-loading" role="alert">
      <span>{routeCopy.planFailed}</span>
      <button onClick={() => window.location.reload()}>{routeCopy.reload}</button>
      <button onClick={this.props.onClose}>{routeCopy.close}</button>
    </section> : this.props.children;
  }
}
