import { useSceneViewport } from './useSceneViewport';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { clearPending, rememberPending, restorePending } from './pendingTurn';
import { Prologue, readIntroProgress, TitleScreen } from './Prologue';
import { ServerInterviewRoom } from './ServerInterviewRoom';
import { ServerCasting } from './ServerCasting';
import { ServerMonthOne } from './ServerMonthOne';
import { ServerMonthly } from './ServerMonthly';
import { ServerPartTwo } from './ServerPartTwo';
import { MonthTwoTransition } from './MonthTwoTransition';
import { ContinuedPlay } from './ContinuedPlay';
import { playthroughKey, readPlaythrough } from './playthroughState';
import { interviewCandidateId, serverCandidates, storyGameKey } from './serverInterviewState';
import type { CreateGameInput, Game, TurnInput, PromotionAllocation } from './types';

export default function App() {
  const viewportRef = useSceneViewport();
  const [game, setGame] = useState<Game | null>(null);
  const [localResume, setLocalResume] = useState(false);
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
  function rememberInterviewRoom(id: string, eventId: string, open: boolean) {
    setInterviewOpen(open);
    try { localStorage.setItem(`prom-interview-view:${id}:${eventId}`,open?'open':'list'); } catch { /* Server progress and pending retries remain authoritative. */ }
  }

  const playtestStarted = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV || !['month1', 'center', 'month3'].includes(new URLSearchParams(location.search).get('playtest') ?? '') || playtestStarted.current) return;
    playtestStarted.current = true;
    requestInFlight.current = true; setBusy(true);
    const start = new URLSearchParams(location.search).get('playtest');
    void import('./prepareCenterPlaytest').then(module => start === 'month1' ? module.prepareMonthOnePlaytest() : module.prepareCenterPlaytest(start === 'month3')).then(next => {
      if (start === 'month1') { localStorage.setItem(storyGameKey,next.game_id); localStorage.setItem('prom-active-save','story'); }
      setGame(next); setFormationReviewed(true);
      const interrupted = restorePending(sessionStorage, next);
      setPending(interrupted); setText(interrupted?.text ?? '');
      if (interrupted) setError('완료를 확인하지 못한 요청이 있습니다. 같은 요청으로 다시 시도해주세요.');
      setView('game');
    }).catch(cause => setError(cause instanceof Error ? cause.message : '플레이 시작 지점 준비에 실패했습니다.'))
      .finally(() => { requestInFlight.current = false; setBusy(false); });
  }, []);

  async function send(actionId?: string, retry?: TurnInput, question?: string): Promise<boolean> {
    if (!game || requestInFlight.current || (pending && !retry)) return false;
    if (game.ending && !(game.ending.id === 'part2_complete' && (retry?.action_id ?? actionId) === 'start_month_seven')) return false;
    if (retry) return submit(retry);
    const value = (question ?? text).trim();
    if (!actionId && !retry && !value) return false;
    // Preserve the payload on retry so the server can prevent duplicate turns.
    const input: TurnInput = retry ?? {
      request_id: crypto.randomUUID(), state_version: game.version,
      input_type: actionId ? 'action' : 'chat', text: actionId ? question?.trim() ?? '' : value,
      action_id: actionId ?? null,
    };
    return submit({ ...input, ...(game.event.id === 'p2_m01_training' ? { stop_after_month_one: true } : {}) });
  }

  async function allocatePromotion(promotion_allocation: PromotionAllocation) {
    if (!game || requestInFlight.current || pending) return false;
    return submit({request_id: crypto.randomUUID(), state_version: game.version, input_type: 'action', action_id: 'allocate_promotion', text: '', promotion_allocation});
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
      rememberPending(sessionStorage, game.game_id, input);
      const result = await api<{ game: Game }>('/games/' + game.game_id + '/turns', input);
      setGame(result.game);
      clearPending(sessionStorage, game.game_id);
      if (game.event.id.startsWith('p2_interview_') && result.game.event.id !== game.event.id) setInterviewOpen(false);
      setPending(null);
      const unfinishedInterview = ['finish_center_interviews', 'close_center_interview'].includes(input.action_id ?? '') && result.game.event.id === 'p2_m02_center';
      if (input.input_type !== 'conversation' && !unfinishedInterview) setText('');
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        try {
          setGame(await api<Game>('/games/' + game.game_id)); setPending(null);
          clearPending(sessionStorage, game.game_id);
          setError('다른 요청의 진행을 반영해 최신 상태를 불러왔습니다.');
        } catch { setError('최신 상태를 불러오지 못했습니다. 같은 요청으로 다시 시도해주세요.'); }
      } else {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) { setPending(null); clearPending(sessionStorage, game.game_id); }
        setError(e instanceof Error ? e.message : '연결이 끊겼습니다. 같은 요청으로 다시 시도해주세요.');
      }
      return false;
    } finally {
      requestInFlight.current = false; setBusy(false);
    }
  }

  function openIntro(fresh: boolean) {
    if (fresh) { localStorage.setItem('prom-active-save', 'intro'); introServerId.current = null; setLocalResume(false); }
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
      setGame(next); rememberInterviewRoom(next.game_id,next.event.id,true); setFormationReviewed(false); setPending(null); setText(''); setView('game');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '면담을 불러오지 못했습니다. 다시 선택해주세요.'); }
    finally { requestInFlight.current = false; setBusy(false); }
  }

  async function continueStory(legacy = false) {
    const id = localStorage.getItem(storyGameKey);
    if (localStorage.getItem('prom-active-save') === 'intro' || !id) { openIntro(false); return; }
    if (requestInFlight.current) return;
    requestInFlight.current = true; setBusy(true); setError('');
    try {
      if (legacy) {
        const continued = readPlaythrough(localStorage, id);
        if (!continued) throw new Error('이 브라우저에 데모 저장이 없습니다.');
        setGame(continued.source); setLocalResume(true); setPending(null); setText(''); setView('game');
        return;
      }
      const next = await api<Game>('/games/' + id);
      setLocalResume(false);
      const interrupted = restorePending(sessionStorage, next);
      setGame(next); setInterviewOpen(!!interviewCandidateId(next.event.id) && (!!interrupted || !!next.interview?.completed || next.conversation.mode === 'private' || localStorage.getItem(`prom-interview-view:${id}:${next.event.id}`) === 'open')); setFormationReviewed(Number(localStorage.getItem('prom-recruitment-step:' + id)) >= 4);
      setPending(interrupted); setText(interrupted?.text ?? '');
      if (interrupted) setError('완료를 확인하지 못한 요청이 있습니다. 같은 요청으로 다시 시도해주세요.');
      setView('game');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '저장한 이야기를 불러오지 못했습니다. 다시 시도해주세요.'); }
    finally { requestInFlight.current = false; setBusy(false); }
  }

  if (view === 'intro') return <Prologue key={introRun.key} fresh={introRun.fresh} onTitle={() => setView('title')} onServerInterview={id => void enterInterview(id)} busy={busy} serverError={error}/>;
  if (view === 'title') {
    const savedGameId = localStorage.getItem(storyGameKey);
    const hasLegacy = savedGameId && localStorage.getItem(playthroughKey(savedGameId));
    return <main className="app-shell">{error && <p className="error-banner" role="alert">{error}</p>}<TitleScreen onStart={() => openIntro(true)} onContinue={() => void continueStory()} onLegacy={hasLegacy ? () => void continueStory(true) : undefined} busy={busy}/></main>;
  }
  if (!game) return null;
  if (localResume) return <ContinuedPlay key={game.game_id} source={game} onTitle={() => setView('title')}/>;
  const nickname = readIntroProgress()?.nickname ?? '';
  const interviewing = !!interviewCandidateId(game.event.id);

  return <main ref={viewportRef} className="app-shell is-playing">
    <header className="intro-topbar"><button className="text-button intro-brand" disabled={busy || !!pending} onClick={() => setView('title')}>prom::enter.</button><span>{game.event.title}</span><button className="quiet-button" disabled={busy || !!pending} onClick={() => setView('title')}>시작 화면</button></header>
    {error && <div className="error-banner" role="alert"><span>{error}</span>{pending && <button disabled={busy} onClick={() => void send(undefined, pending)}>같은 요청 재시도</button>}<button disabled={busy} onClick={() => window.location.reload()}>다시 불러오기</button></div>}
    {interviewing && interviewOpen ? <ServerInterviewRoom key={game.game_id + game.event.id} game={game} busy={busy} pending={pending} text={text} onTextChange={setText} onSend={send} onBack={() => { rememberInterviewRoom(game.game_id,game.event.id,false); if (game.interview?.completed) void send('finish_interview'); }}/>
      : interviewing || game.event.id === 'p2_casting' || (game.event.id === 'p2_m01_training' && !!game.completed_events.p2_casting && !formationReviewed && !game.history.some(turn => turn.event_id === 'p2_m01_training')) ? <ServerCasting key={game.game_id + game.event.id} game={game} busy={busy} pending={pending} nickname={nickname} onInterview={async id => { const person = serverCandidates.find(candidate => candidate.id === id); if (person && (person.eventId === game.event.id || await send('interview_' + person.slot))) rememberInterviewRoom(game.game_id,person.eventId,true); }} onSend={send} onBack={() => setView('title')} onProceed={() => setFormationReviewed(true)}/>
      : game.event.id === 'p2_m01_training' ? <ServerMonthOne key={game.game_id} game={game} busy={busy} pending={pending} text={text} onTextChange={setText} onSend={send} onConversationChange={changeConversation} onTitle={() => setView('title')}/>
      : game.event.id === 'p2_m03_rehearsal' ? <MonthTwoTransition key={game.game_id} game={game}><ServerPartTwo game={game} busy={busy} pending={pending} text={text} onTextChange={setText} onSend={send} onConversationChange={changeConversation} onTitle={() => setView('title')} onAllocate={allocatePromotion}/></MonthTwoTransition>
      : (game.event.month >= 2 && game.event.month <= 6) || game.event.id === 'p2_complete' ? <ServerPartTwo key={game.game_id + game.event.id} game={game} busy={busy} pending={pending} text={text} onTextChange={setText} onSend={send} onConversationChange={changeConversation} onTitle={() => setView('title')} onAllocate={allocatePromotion}/>
      : (game.event.month >= 2 && game.event.month <= 24) || !!game.ending || game.event.id === 'p2_complete' ? <ServerMonthly key={game.game_id + game.event.id} game={game} busy={busy} pending={pending} text={text} onTextChange={setText} onSend={send} onConversationChange={changeConversation} onTitle={() => setView('title')} onNewGame={() => openIntro(true)} onDecision={(action, value) => send(action, undefined, value)}/>
      : <p role="alert">이 사건은 아직 화면 연결이 필요합니다. 저장은 유지됩니다.</p>}
  </main>;
}
