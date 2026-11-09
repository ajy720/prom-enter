import { useEffect, useRef } from 'react';
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
  const notice = status?.finish_notice ?? (secretary ? '면담 완료를 누르면 현재 팀워크로 이번 달 결과를 확인합니다.' : null);
  const name = secretary ? '백하연' : member?.name ?? '멤버 면담';
  const initial = member ? '센터와 포지션에 대해 어떤 생각인지 이야기를 들어보세요.' : '이야기를 나눌 멤버를 선택해주세요.';
  const autoFinished = useRef(false);
  const exhausted = !!status && status.members.every(person => person.turn_count >= status.turn_limit);
  useEffect(() => {
    if (exhausted && !locked && !autoFinished.current) {
      autoFinished.current = true;
      void onSend('finish_center_interviews');
    }
  }, [exhausted, locked, onSend]);
  return <>
    <CenterInterviewMembers game={game} disabled={locked} onConversationChange={onConversationChange}/>
    <div className="monthly-dialogue-area"><section className="dialogue-box"><header className="dialogue-header"><h2>{feedback?.name ?? (notice ? '백하연' : last?.name === '대표님' ? name : last?.name ?? name)}</h2><button className="text-button" onClick={onRecords}>대화 기록</button></header><div className="dialogue-content" role="log" aria-live="polite" aria-busy={busy}>{feedback ? <PendingResponse feedback={feedback}/> : <p>{notice ?? last?.text ?? initial}</p>}</div></section>
      {member?.completed && !status?.ready_for_decision && <p className="monthly-note">{member.name}와 이번 면담의 대화를 모두 나눴습니다. 다른 멤버의 이야기도 듣고 전체 면담을 마무리해주세요.</p>}
      {(member && !member.completed) && <ChatComposer id="center-message" label="포지션 면담" text={text} placeholder={`${member?.name}에게 이야기하기`} disabled={locked} onTextChange={onTextChange} onSend={() => onSend()} suggestions={secretary ? [] : ['이번 포지션에서 가장 하고 싶은 역할은 뭐야?', '센터를 정할 때 어떤 점을 고려하면 좋을까?']}/>}
    </div>
    <div className="monthly-buttons"><button className="primary-button" disabled={locked || !status?.can_finish} onClick={() => void onSend('finish_center_interviews')}>면담 완료</button><span className="monthly-note">모든 멤버와 최소 1회 · 멤버별 최대 {status?.turn_limit ?? 8}회 면담</span></div>
    {!status?.can_finish && <p className="monthly-note">모든 멤버와 한 번 이상 이야기한 뒤 완료할 수 있습니다.</p>}
  </>;
}

// Stable card geometry; status and the selected member still come from the server.
export function CenterInterviewMembers({ game, disabled, onConversationChange }: {
  game: Game; disabled: boolean; onConversationChange: (target: string) => Promise<boolean>;
}) {
  const status = game.center_interviews;
  return <nav className="month-people center-people center-member-tabs" aria-label="포지션 면담 상대">
    {status?.members.map(person => <button type="button" key={person.character_id}
      aria-pressed={game.conversation.target_character_id === person.character_id} disabled={disabled}
      onClick={() => void onConversationChange(person.character_id)}>
      <strong>{person.name}</strong><small>{person.completed || status.ready_for_decision ? '면담 완료' : person.turn_count ? `${person.turn_count}/${status.turn_limit}회 대화` : '면담 전'}</small>
    </button>)}
  </nav>;
}

export function CenterMonthSidebar({ game, onTitle, onRecords, disabled }: {
  game: Game; onTitle: () => void; onRecords: () => void; disabled: boolean;
}) {
  const status = game.center_interviews;
  const heard = status?.members.filter(person => person.turn_count > 0).length ?? 0;
  return <aside className="interview-info glass-panel month-tasks">
    <p className="section-kicker">PROMYOU · 2개월차</p><h1>함께 정하는 포지션</h1>
    <p>멤버들의 이야기를 듣고 이번 달 면담을 마무리해주세요.</p>
    <section className="team-status-summary" aria-label="팀 능력치"><div className="team-status-values">
      {([['팀워크', game.stats.teamwork], ['스트레스·피로도', game.stats.fatigue], ['인지도', game.stats.awareness], ['팬 수', '-']] as const).map(([label,value]) => <div className="team-status-value" key={label}><span>{label}</span><strong>{value.toLocaleString()}</strong></div>)}
    </div></section>
    <ol className="month-checklist"><li>{heard === 4 ? '✓' : '○'} 멤버 면담 · {heard}/4명</li><li>○ 전체 면담 마무리</li></ol>
    <button className="operation-button" onClick={onRecords}><span>이번 달 면담 기록</span><span aria-hidden="true">→</span></button>
    <button className="quiet-button" disabled={disabled} onClick={onTitle}>← 시작 화면</button>
  </aside>;
}
