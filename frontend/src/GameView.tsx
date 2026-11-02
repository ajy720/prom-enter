import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import type { Game, Stats, TurnInput } from './types';

const labels: Record<keyof Stats, string> = { teamwork: '팀워크', fatigue: '피로도', trust: '신뢰', awareness: '인지도', fans: '팬', funds_won: '자금' };
const outcomes: Record<string, string> = { pending: '대화 중', success: '성공', partial: '부분 성공', failure: '실패', neutral: '보류', ending: '결말' };
const emotions: Record<string, string> = { anxious: '조심스러운 마음', hopeful: '조금씩 열리는 마음', tired: '잠시 쉬어갈 시간', relieved: '안도하는 마음' };
const format = (key: keyof Stats, value: number) => key === 'funds_won' ? `${(value / 100000000).toFixed(1)}억` : value.toLocaleString();
// Existing demo scenes that ask for an explicit decision. This is UI behavior only.
const decisionScenes = new Set(['m06_variety', 'm24_contract']);

type Props = {
  game: Game; busy: boolean; pending: TurnInput | null; error: string; text: string;
  onTextChange: (text: string) => void;
  onSend: (actionId?: string) => Promise<boolean>;
  onNewGame: () => void;
  onRetry: () => void;
};

function StatsPanel({ stats }: { stats: Stats }) {
  return <aside className="stats-panel glass-panel" aria-label="팀 상태">
    <div className="panel-heading"><h2>팀 상태</h2><span>TEAM STATUS</span></div>
    {(Object.keys(labels) as (keyof Stats)[]).map(key => <div className={`stat stat-${key}`} key={key}>
      <div className="stat-label"><span>{labels[key]}</span><strong>{format(key, stats[key])}<small>{['funds_won', 'fans'].includes(key) ? '' : ' / 100'}</small></strong></div>
      {!['funds_won', 'fans'].includes(key) && <div className="meter" role="meter" aria-label={labels[key]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats[key]}><i style={{ width: `${stats[key]}%` }}/></div>}
    </div>)}
  </aside>;
}

export function GameView({ game, busy, pending, error, text, onTextChange, onSend, onNewGame, onRetry }: Props) {
  const [choicesOpen, setChoicesOpen] = useState(decisionScenes.has(game.event.id) && !game.ending);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [recordPanel, setRecordPanel] = useState<'history' | 'memory' | 'evidence' | 'system'>('history');
  const [messageIndex, setMessageIndex] = useState(0);
  const last = game.history.at(-1);
  const emotion = last?.direction.emotion ?? 'anxious';
  const messages = last?.messages.length ? last.messages : [{ speaker_id: 'secretary', text: game.event.briefing, emotion: 'neutral' }];
  const index = Math.min(messageIndex, messages.length - 1);
  const message = messages[index];
  const speaker = message.speaker_id === 'secretary' ? '비서' : game.character.name;
  const locked = busy || !!pending || !!game.ending;

  useEffect(() => { setMessageIndex(0); }, [last?.id]);
  useEffect(() => { setChoicesOpen(decisionScenes.has(game.event.id) && !game.ending); }, [game.event.id, game.ending]);

  async function choose(actionId: string) {
    // Close this scene's menu before sending; a new decision scene can open its own.
    setChoicesOpen(false);
    if (!await onSend(actionId)) setChoicesOpen(true);
  }

  return <>
    <section className="game-stage" aria-label="게임 장면">
      <div className="room-background" aria-hidden="true"><div className="room-window"/><div className="room-mirror"/><div className="room-floor"/></div>
      <StatsPanel stats={game.stats}/>
      <div className="scene-heading glass-panel"><p>{String(game.event.month).padStart(2, '0')}개월차 <span>· {game.event.scene}</span></p><h1>{game.event.title}</h1><span>{game.event.subtitle}</span></div>
      <div className="character-stage">
        <div className="character-halo" aria-hidden="true"/>
        <img className="character-portrait" src={last?.image ?? '/portraits/anxious.svg'} alt={`${game.character.name}, ${emotions[emotion]}`}/>
        <span className="portrait-note">임시 캐릭터 · 배경 시안</span>
      </div>
      <aside className="scene-note glass-panel"><span>이번 장면의 목표</span><p>{game.event.goal}</p></aside>

      <div className="dialogue-dock">
        <section className="dialogue-box" aria-label="캐릭터 대사">
          <header className="dialogue-header"><h2>{game.ending ? '우리의 이야기' : speaker}</h2><div className="dialogue-tools">
            <span className="mode-label">{game.provider === 'demo' ? '데모 대화' : 'AI 대화'}</span>
            <button className="text-button" onClick={() => setRecordsOpen(true)}>대화 기록</button>
          </div></header>
          <div className="dialogue-content" role="log" aria-live="polite" aria-busy={busy}>
            {game.ending ? <><h3>{game.ending.title}</h3><p>{game.ending.description}</p></> : busy ? <p className="thinking">다음 말을 고르고 있어요<span aria-hidden="true"> · · ·</span></p> : <p key={`${last?.id ?? 'intro'}-${index}`}>{message.text}</p>}
          </div>
          <footer className="dialogue-footer"><span>{game.ending ? '여정 완료' : emotions[emotion]}</span>
            {!game.ending && messages.length > 1 && <div className="dialogue-pagination"><button aria-label="이전 대사" disabled={busy || index === 0} onClick={() => setMessageIndex(index - 1)}>‹</button><span>{index + 1} / {messages.length}</span><button aria-label="다음 대사" disabled={busy || index === messages.length - 1} onClick={() => setMessageIndex(index + 1)}>다음 대사 ▷</button></div>}
          </footer>
          {last && !busy && <div className="turn-result" aria-label="최근 선택 결과">
            {last.outcome !== 'pending' && <span>{outcomes[last.outcome]}</span>}
            {Object.entries(last.stat_delta).map(([key, value]) => <span key={key}>{labels[key as keyof Stats]} {value! > 0 ? '+' : ''}{format(key as keyof Stats, value!)}</span>)}
            {last.new_evidence.map(evidence => <span key={evidence.id}>새 증거 · {evidence.title}</span>)}
          </div>}
        </section>
        {game.ending ? <button className="primary-button ending-button" onClick={onNewGame}>새로운 이야기 시작하기 →</button> : <form className="chat-composer glass-panel" onSubmit={event => { event.preventDefault(); void onSend(); }}>
          <label className="sr-only" htmlFor="message">캐릭터에게 할 말</label>
          <textarea id="message" value={text} maxLength={2000} rows={2} placeholder={pending && !busy ? '전송 결과를 확인한 뒤 다시 이야기할 수 있어요.' : '대표님의 이야기를 들려주세요…'} disabled={locked || choicesOpen} onChange={event => onTextChange(event.target.value)} onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); void onSend(); }
          }}/>
          <div className="composer-buttons"><button type="button" className="choice-trigger" disabled={locked} onClick={() => setChoicesOpen(true)}>활동 선택</button><button className="primary-button" aria-label="메시지 전송" disabled={locked || !text.trim()}>전송 ↑</button></div>
        </form>}
        <div className="dock-caption"><span>Enter로 전송 · Shift + Enter로 줄바꿈</span><span>현재는 기존 축약 시나리오 · 새 스토리는 준비 중</span></div>
      </div>
    </section>

    <Modal open={choicesOpen} title="대표님의 선택" className="choices-modal" onClose={() => setChoicesOpen(false)}>
      <div className="choices-heading"><span>대표님의 선택</span><h2>{game.event.title}</h2><p>이번 장면에서 할 행동을 골라주세요.</p></div>
      <div className="choice-list">{game.event.actions.map((action, i) => <button className="story-choice" key={action.id} disabled={locked || action.used} onClick={() => void choose(action.id)}><span className="choice-number">{String(i + 1).padStart(2, '0')}</span><span><strong>{action.label}</strong><small>{action.used ? '이미 반영한 선택입니다' : action.hint}</small></span><span aria-hidden="true">{action.used ? '✓' : '→'}</span></button>)}</div>
      {error && <div className="choice-error" role="alert"><p>{error}</p>{pending && <button className="primary-button" disabled={busy} onClick={onRetry}>같은 요청 재시도</button>}</div>}
      {busy && <p className="choice-status" role="status">선택을 반영하고 있어요…</p>}
    </Modal>

    <Modal open={recordsOpen} title="플레이 기록" className="records-modal" onClose={() => setRecordsOpen(false)}>
      <h2>함께한 이야기</h2>
      <div className="record-navigation" aria-label="기록 종류">{([['history', '대화'], ['memory', '기억'], ['evidence', '증거'], ['system', '처리 내역']] as const).map(([id, label]) => <button className={recordPanel === id ? 'active' : ''} aria-pressed={recordPanel === id} key={id} onClick={() => setRecordPanel(id)}>{label}</button>)}</div>
      <div className="records-body">
        {recordPanel === 'history' && (game.history.length ? game.history.map(turn => <article className="history-turn" key={turn.id}><p className="record-caption">{turn.event_title}</p><div className="history-user"><strong>대표님</strong><p>{turn.input}</p></div>{turn.messages.map((item, i) => <div className="history-message" key={i}><strong>{item.speaker_id === 'secretary' ? '비서' : game.character.name}</strong><p>{item.text}</p></div>)}</article>) : <p className="empty">아직 나눈 대화가 없습니다. 첫 이야기를 건네보세요.</p>)}
        {recordPanel === 'memory' && (game.memories.length ? game.memories.slice().reverse().map((memory, i) => <article className="record-card" key={i}><strong>{memory.kind === 'promise' ? '약속' : memory.kind === 'outcome' ? '사건' : '행동'}</strong><p>{memory.text}</p></article>) : <p className="empty">함께한 선택과 약속이 여기에 남습니다.</p>)}
        {recordPanel === 'evidence' && (game.evidence.length ? game.evidence.map(item => <article className="record-card" key={item.id}><strong>{item.title}</strong><p>{item.text}</p></article>) : <p className="empty">아직 수집한 증거가 없습니다.</p>)}
        {recordPanel === 'system' && <div className="trace"><p>{game.provider === 'demo' ? '규칙 기반 데모입니다. 실제 AI 연결 전에는 일반적인 자연어 의미를 해석하지 않습니다.' : '실제 모델로 입력을 해석하고 대사를 생성합니다.'}</p>{last && <><dl><dt>해석한 행동</dt><dd>{last.analysis.action_id}</dd><dt>사건 상태</dt><dd>{outcomes[last.outcome]}</dd><dt>표현 방향</dt><dd>{last.direction.openness} / {last.direction.emotion}</dd><dt>저장 버전</dt><dd>{game.version}</dd></dl><details><summary>분석 결과 보기</summary><pre>{JSON.stringify(last.analysis, null, 2)}</pre></details></>}</div>}
      </div>
    </Modal>
  </>;
}
