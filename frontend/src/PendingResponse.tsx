import type { pendingFeedback } from './pendingFeedback';

export function PendingResponse({ feedback }: { feedback: ReturnType<typeof pendingFeedback> }) {
  return <div className="pending-response" role="status" aria-live="polite">
    <span className="pending-response-dot" aria-hidden="true"/>
    <div><small>{feedback.name}{feedback.speakerId ? ' · 답변 준비 중' : ''}</small><p>{feedback.text}</p></div>
  </div>;
}
