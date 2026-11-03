import type { EventOpening } from './types';

export default function EventOpeningCard({opening}:{opening:EventOpening}) {
  return <article className="event-opening" aria-label={`${opening.month}개월차 상황 안내`}>
    <div className="opening-meta"><span>상황 안내</span><span>{opening.month}개월차 · {opening.scene}</span></div>
    <h4>{opening.title}</h4>
    <p className="opening-narration">{opening.narration}</p>
    {opening.messages.map((message,index)=><div className="opening-message" key={index}>
      <strong>{message.name}</strong><p>{message.text}</p>
    </div>)}
    <div className="opening-goal"><strong>이번에 결정할 일</strong><p>{opening.goal}</p></div>
    <ul className="opening-choices" aria-label="현재 사건의 선택지">{opening.choices.map(choice=><li key={choice.id}>{choice.label}</li>)}</ul>
  </article>;
}
