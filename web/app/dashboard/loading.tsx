export default function DashboardLoading() {
  return <div className="workspace-route-loading-state" role="status" aria-live="polite" aria-busy="true">
    <div className="workspace-route-loading">
      <span className="workspace-route-loading-track" aria-hidden="true"><i /></span>
      <span className="sr-only">กำลังเปิดหน้าที่เลือก</span>
    </div>
    <div className="workspace-route-skeleton" aria-hidden="true">
      <div className="workspace-skeleton-heading"><span /><i /></div>
      <div className="workspace-skeleton-metrics"><i /><i /><i /><i /></div>
      <div className="workspace-skeleton-panel"><i /><i /><i /></div>
      <div className="workspace-skeleton-panel is-short"><i /><i /></div>
    </div>
  </div>;
}
