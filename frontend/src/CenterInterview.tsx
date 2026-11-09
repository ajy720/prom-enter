import { ChatComposer } from './ChatComposer';
import { PendingResponse } from './PendingResponse';
import { pendingFeedback } from './pendingFeedback';
import { serverInterviewFrames } from './serverInterviewState';
import type { Game, TurnInput } from './types';

export function CenterInterview({ game, busy, pending, text, onTextChange, onSend, onConversationChange, onRecords }: {
  game: Game; busy: boolean; pending: TurnInput | null; text: string;
  onTextChange: (value: string) => void; onSend: (actionId?: string) => Promise<boolean>;
  onConversationChange: (target: string) => Promise<boolean>; onRecords: () => void;
}) {
  const status = game.center_interviews;
  const targetId = game.conversation.mode === 'private' ? game.conversation.target_character_id : null;
  const member = status?.members.find(person => person.character_id === targetId);
  const secretary = targetId === 'baek_hayeon';
  const locked = busy || !!pending;
  const memberTurns = (id: string | null) => game.history.filter(turn => turn.event_id === game.event.id && turn.conversation?.mode === 'private' && turn.conversation.target_character_id === id && (id === 'baek_hayeon' || turn.kind !== 'activity'));
  const turns = memberTurns(targetId).map(turn => ({ ...turn, messages: secretary ? turn.messages : turn.messages.filter(message => message.speaker_id !== 'secretary') }));
  const frames = serverInterviewFrames({ ...game, history: turns, event_openings: [] }).filter(frame => frame.id !== 'briefing');
  const last = frames.at(-1);
  const feedback = busy && pending ? pendingFeedback(game, pending) : null;
  const notice = status?.finish_notice;
  const name = notice || secretary ? '백하연' : member?.name ?? '멤버 면담';
  const initial = secretary ? status?.decision_prompt : member ? '센터와 포지션에 대해 어떤 생각인지 이야기를 들어보세요.' : '이야기를 나눌 멤버를 선택해주세요.';
  return <>
    <div className="month-people center-people" aria-label="포지션 면담 상대">{status?.members.map(person => <button key={person.character_id} aria-pressed={targetId === person.character_id} disabled={locked} onClick={() => void onConversationChange(person.character_id)}>{person.name}<small>{status.ready_for_decision ? '면담 완료' : person.turn_count >= status.turn_limit ? `${status.turn_limit}회 대화 완료` : person.turn_count ? `${person.turn_count}/${status.turn_limit}회 대화` : '대화 전'}</small></button>)}</div>
    <div className="monthly-dialogue-area"><section className="dialogue-box"><header className="dialogue-header"><h2>{feedback?.name ?? (notice ? '백하연' : last?.name === '대표님' ? name : last?.name ?? name)}</h2><button className="text-button" onClick={onRecords}>대화 기록</button></header><div className="dialogue-content" role="log" aria-live="polite" aria-busy={busy}>{feedback ? <PendingResponse feedback={feedback}/> : <p>{notice ?? last?.text ?? initial}</p>}</div></section>
      {member?.completed && !status?.ready_for_decision && <p className="monthly-note">{member.name}와 이번 면담의 대화를 모두 나눴습니다. 다른 멤버의 이야기도 듣고 전체 면담을 마무리해주세요.</p>}
      {((member && !member.completed && !status?.ready_for_decision) || (secretary && status?.ready_for_decision)) && <ChatComposer id="center-message" label={secretary ? '센터 결정 대화' : '포지션 면담'} text={text} placeholder={secretary ? '백하연에게 이야기하기' : `${member?.name}에게 이야기하기`} disabled={locked} onTextChange={onTextChange} onSend={() => onSend()} suggestions={secretary ? [] : ['이번 포지션에서 가장 하고 싶은 역할은 뭐야?', '센터를 정할 때 어떤 점을 고려하면 좋을까?']}/>}
    </div>
    <div className="monthly-buttons">{!status?.ready_for_decision ? <><button className="primary-button" disabled={locked || !status} onClick={() => void onSend('finish_center_interviews')}>면담 마무리</button><span className="monthly-note">모든 멤버와 최소 1회 · 멤버별 최대 {status?.turn_limit ?? 8}회 대화</span></> : !secretary && <button className="quiet-button" disabled={locked} onClick={() => void onConversationChange('baek_hayeon')}>백하연과 이야기하기</button>}</div>
  </>;
}
