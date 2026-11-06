import { useSceneViewport } from './useSceneViewport';
import { useRef, useState } from 'react';
import { api, ApiError } from './api';
import { Prologue, readIntroProgress, TitleScreen } from './Prologue';
import { ServerInterviewRoom } from './ServerInterviewRoom';
import { ServerCasting } from './ServerCasting';
import { ServerMonthOne } from './ServerMonthOne';
import { interviewCandidateId, serverCandidates, storyGameKey } from './serverInterviewState';
import type { CreateGameInput, Game, TurnInput } from './types';

export default function App() {
  const viewportRef = useSceneViewport();
  const [game, setGame] = useState<Game | null>(null);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [formationReviewed, setFormationReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<TurnInput | null>(null);
  const [view, setView] = useState<'title' | 'intro' | 'game'>('title');
  const [introRun, setIntroRun] = useState({ fresh: false, key: 0 });
  const requestInFlight = useRef(false);

  const introServerId = useRef<string | null>(null);

  async function send(actionId?: string, retry?: TurnInput, question?: string): Promise<boolean> {
    if (!game || requestInFlight.current || game.ending || (pending && !retry)) return false;
    const value = (question ?? text).trim();
    if (!actionId && !retry && !value) return false;
    // Preserve the payload on retry so the server can prevent duplicate turns.
    const input: TurnInput = retry ?? {
      request_id: crypto.randomUUID(), state_version: game.version,
      input_type: actionId ? 'action' : 'chat', text: actionId ? '' : value,
      action_id: actionId ?? null,
    };
    return submit({ ...input, ...(game.event.id === 'p2_m01_training' ? { stop_after_month_one: true } : {}) });
  }

  async function changeConversation(target: string) {
    if (!game || requestInFlight.current || pending || game.ending) return false;
    return submit({ request_id: crypto.randomUUID(), state_version: game.version, input_type: 'conversation', text: '', action_id: null,
      conversation_mode: target === 'public' ? 'public' : 'private', target_character_id: target === 'public' ? null : target, ...(game.event.id === 'p2_m01_training' ? { stop_after_month_one: true } : {}) });
  }

  async function submit(input: TurnInput): Promise<boolean> {
    if (!game || requestInFlight.current) return false;
    requestInFlight.current = true;
    setBusy(true); setError(''); setPending(input);
    try {
      const result = await api<{ game: Game }>('/games/' + game.game_id + '/turns', input);
      setGame(result.game);
      if (game.event.id.startsWith('p2_interview_') && result.game.event.id !== game.event.id) setInterviewOpen(false);
      setPending(null); if (input.input_type !== 'conversation') setText('');
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        try {
          setGame(await api<Game>('/games/' + game.game_id)); setPending(null);
          setError('다른 요청의 진행을 반영해 최신 상태를 불러왔습니다.');
        } catch { setError('최신 상태를 불러오지 못했습니다. 같은 요청으로 다시 시도해주세요.'); }
      } else {
        if (e instanceof ApiError && e.status < 500) setPending(null);
        setError(e instanceof Error ? e.message : '연결이 끊겼습니다. 같은 요청으로 다시 시도해주세요.');
      }
      return false;
    } finally {
      requestInFlight.current = false; setBusy(false);
    }
  }

  function openIntro(fresh: boolean) {
    if (fresh) { localStorage.setItem('prom-active-save', 'intro'); introServerId.current = null; }
    setIntroRun(current => ({ fresh, key: current.key + 1 }));
    setError(''); setView('intro');
  }

  async function enterInterview(id: string) {
    const candidate = serverCandidates.find(person => person.id === id);
    if (!candidate || requestInFlight.current) return;
    requestInFlight.current = true; setBusy(true); setError('');
    try {
      let next = introServerId.current
        ? await api<Game>('/games/' + introServerId.current)
        : await api<Game>('/games', { character_id: 'a', scenario: 'part2' } satisfies CreateGameInput);
      introServerId.current = next.game_id;
      localStorage.setItem(storyGameKey, next.game_id);
      if (next.event.id !== candidate.eventId) {
        next = (await api<{ game: Game }>('/games/' + next.game_id + '/turns', {
          request_id: crypto.randomUUID(), state_version: next.version, input_type: 'action',
          action_id: 'interview_' + candidate.slot, text: '',
        } satisfies TurnInput)).game;
      }
      localStorage.setItem('prom-active-save', 'story');
      setGame(next); setInterviewOpen(true); setFormationReviewed(false); setPending(null); setText(''); setView('game');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '면담을 불러오지 못했습니다. 다시 선택해주세요.'); }
    finally { requestInFlight.current = false; setBusy(false); }
  }

  async function continueStory() {
    const id = localStorage.getItem(storyGameKey);
    if (localStorage.getItem('prom-active-save') === 'intro' || !id) { openIntro(false); return; }
    if (requestInFlight.current) return;
    requestInFlight.current = true; setBusy(true); setError('');
    try {
      const next = await api<Game>('/games/' + id);
      setGame(next); setInterviewOpen(!!interviewCandidateId(next.event.id) && (!!next.interview?.completed || next.conversation.mode === 'private')); setFormationReviewed(Number(localStorage.getItem('prom-recruitment-step:' + id)) >= 4);
      setPending(null); setText(''); setView('game');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '저장한 이야기를 불러오지 못했습니다. 다시 시도해주세요.'); }
    finally { requestInFlight.current = false; setBusy(false); }
  }

  if (view === 'intro') return <Prologue key={introRun.key} fresh={introRun.fresh} onTitle={() => setView('title')} onServerInterview={id => void enterInterview(id)} busy={busy} serverError={error}/>;
  if (view === 'title') return <main className="app-shell">{error && <p className="error-banner" role="alert">{error}</p>}<TitleScreen onStart={() => openIntro(true)} onContinue={() => void continueStory()} busy={busy}/></main>;
  if (!game) return null;
  const nickname = readIntroProgress()?.nickname ?? '';
  const interviewing = !!interviewCandidateId(game.event.id);

  return <main ref={viewportRef} className="app-shell is-playing">
    <header className="intro-topbar"><button className="text-button intro-brand" disabled={busy || !!pending} onClick={() => setView('title')}>prom::enter.</button><span>{game.event.title}</span><button className="quiet-button" disabled={busy || !!pending} onClick={() => setView('title')}>시작 화면</button></header>
    {error && <div className="error-banner" role="alert"><span>{error}</span>{pending && <button disabled={busy} onClick={() => void send(undefined, pending)}>같은 요청 재시도</button>}<button disabled={busy} onClick={() => window.location.reload()}>다시 불러오기</button></div>}
    {interviewing && interviewOpen ? <ServerInterviewRoom key={game.game_id + game.event.id} game={game} busy={busy} pending={pending} text={text} onTextChange={setText} onSend={send} onBack={() => { if (game.interview?.completed) void send('finish_interview'); else setInterviewOpen(false); }}/>
      : interviewing || game.event.id === 'p2_casting' || (game.event.id === 'p2_m01_training' && !!game.completed_events.p2_casting && !formationReviewed && !game.history.some(turn => turn.event_id === 'p2_m01_training')) ? <ServerCasting key={game.game_id + game.event.id} game={game} busy={busy} pending={pending} nickname={nickname} onInterview={async id => { const person = serverCandidates.find(candidate => candidate.id === id); if (person && (person.eventId === game.event.id || await send('interview_' + person.slot))) setInterviewOpen(true); }} onSend={send} onBack={() => setView('title')} onProceed={() => setFormationReviewed(true)}/>
      : game.event.id === 'p2_m01_training' ? <ServerMonthOne key={game.game_id} game={game} busy={busy} pending={pending} text={text} onTextChange={setText} onSend={send} onConversationChange={changeConversation} onTitle={() => setView('title')}/>
      : <p role="alert">저장한 장면은 현재 연결된 1개월차 범위 밖입니다.</p>}
  </main>;
}
