import type { StoryControls } from './ServerMonthlyStory';

export function StoryRequestError({controls}: {controls?: StoryControls}) {
  if (!controls?.error) return null;
  return <div className="error-banner" role="alert">
    <span>{controls.error}</span>
    {controls.retry && <button disabled={controls.busy} onClick={controls.retry}>같은 요청 재시도</button>}
  </div>;
}
