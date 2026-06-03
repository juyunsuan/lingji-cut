/**
 * 卡片宿主占位（Phase 3 替换为 sandbox iframe + 帧同步实现）。
 * 当前仅渲染空容器，保证 Phase 1 组件树可编译。
 */
export function CardHost(_props: { overlayId: string; tsx: string }) {
  return <div style={{ width: '100%', height: '100%' }} />;
}
