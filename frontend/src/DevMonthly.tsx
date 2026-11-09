import { useRef, useState } from 'react';
import { ServerMonthly } from './ServerMonthly';
import { advanceMonthlyFixture, createMonthlyFixture, fixtureMonths, fixtureSaveKey, restoreMonthlyFixture } from './monthlyFixture';
import type { FixtureEnding } from './monthlyFixture';
import type { Game, TurnInput } from './types';

// Loaded only by Vite DEV with ?monthlyFixture=1. Never a fallback for API failure.
export default function DevMonthly() {
  const [game, setGame] = useState<Game>(() => {
    try { return restoreMonthlyFixture(localStorage.getItem(fixtureSaveKey)) ?? createMonthlyFixture(); }
    catch { return createMonthlyFixture(); }
  });
  const [month, setMonth] = useState(3);
  const [ending, setEnding] = useState<FixtureEnding>('happy');
  const [fault, setFault] = useState('none');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<TurnInput | null>(null);
  const inFlight = useRef(false);
  async function submit(input: TurnInput) {
    if (inFlight.current) return false;
    inFlight.current = true;
    try {
      setPending(input); setError('');
      if (fault === 'failure') throw new Error('개발용 통신 실패입니다. 같은 요청으로 재시도해주세요.');
      const next = advanceMonthlyFixture(game, input, ending);
      localStorage.setItem(fixtureSaveKey, JSON.stringify(next));
      if (fault === 'response') throw new Error('fixture 저장 후 응답이 유실된 상황입니다. 같은 요청을 재시도하세요.');
      setGame(next); setPending(null); setText(''); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'fixture 처리 실패'); return false; }
    finally { inFlight.current = false; setFault('none'); }
  }
  function input(actionId?: string): TurnInput {
    return { request_id: crypto.randomUUID(), state_version: game.version, input_type: actionId ? 'action' : 'chat', text: actionId ? '' : text, action_id: actionId ?? null };
  }
  function start() {
    try {
      const next = createMonthlyFixture(month);
      localStorage.setItem(fixtureSaveKey, JSON.stringify(next));
      setGame(next); setPending(null); setText(''); setError('');
    } catch (cause) { setError(String(cause)); }
  }
  async function retry() {
    if (!pending) return;
    // Model the server's cached response when storage committed before response loss.
    try {
      const saved = restoreMonthlyFixture(localStorage.getItem(fixtureSaveKey));
      if (saved?.history.some(turn => turn.id === pending.request_id)) {
        setGame(saved); setPending(null); setText(''); setError(''); return;
      }
      await submit(pending);
    } catch (cause) { setError(String(cause)); }
  }
  return <main className="app-shell is-playing">
    <aside className="fixture-toolbar" aria-label="개발용 fixture 도구"><strong>개발 전용 FIXTURE · 서버·AI 연결 및 서버 저장 아님</strong><p>모든 달의 수치는 고정 예시이며 결과·엔딩은 직접 고릅니다. 실제 저장과 분리된 이 브라우저의 임시 저장만 사용합니다.</p>
      <label>시작 월 <select value={month} onChange={event => setMonth(Number(event.target.value))}>{fixtureMonths.map((title, index) => <option key={index} value={index + 3}>{index + 3}개월 · {title}</option>)}</select></label>
      <button onClick={start}>새 fixture 시작</button>
      <label>24개월 결말 예시 <select value={ending} onChange={event => setEnding(event.target.value as FixtureEnding)}><option value="happy">해피엔딩</option><option value="ordinary">평범</option><option value="forgotten">잊혀진 그룹</option></select></label>
      <label>다음 요청 오류 <select value={fault} onChange={event => setFault(event.target.value)}><option value="none">없음</option><option value="failure">저장 전 실패</option><option value="response">저장 후 응답 유실</option></select></label>
      <a href="/">실제 플레이로 돌아가기</a>
    </aside>
    {error && <div className="error-banner" role="alert">{error}{pending && <button onClick={() => void retry()}>같은 요청 재시도</button>}</div>}
    <ServerMonthly key={game.game_id + game.event.id} game={game} busy={false} pending={pending} text={text} onTextChange={setText}
      onSend={action => !pending && (action || text.trim()) ? submit(input(action)) : Promise.resolve(false)}
      onConversationChange={target => pending ? Promise.resolve(false) : submit({ ...input(), input_type: 'conversation', text: '', conversation_mode: target === 'public' ? 'public' : 'private', target_character_id: target === 'public' ? null : target })}
      onTitle={() => { window.location.href = '/'; }} onNewGame={start}/>
  </main>;
}
