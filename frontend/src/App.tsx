import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { GameView } from './GameView';
import { Prologue, TitleScreen } from './Prologue';
import type { Character, Game, TurnInput } from './types';

function ServerDemoStart({ onStarted, onBack }: { onStarted: (game: Game) => void; onBack: () => void }) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api<{ characters: Character[] }>('/catalog', undefined, controller.signal).then(result => setCharacters(result.characters)).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '목록을 불러오지 못했습니다.'); });
    return () => controller.abort();
  }, []);
  async function start(characterId: string) {
    if (busy) return;
    setBusy(true); setError('');
    try { const game = await api<Game>('/games', { character_id: characterId }); localStorage.setItem('prom-game', game.game_id); onStarted(game); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '시작하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <main className="selection-screen"><p className="section-kicker">서버 연결 데모</p><h1>함께할 연습생 선택</h1><p>서버가 제공하는 대화와 사건 진행을 확인하는 별도 데모입니다.</p><div className="month-options">{characters.map(character => <button disabled={busy} key={character.id} onClick={() => void start(character.id)}><strong>{character.name}</strong><span>{character.description}</span></button>)}</div>{error && <p role="alert">{error}</p>}<button className="quiet-button" disabled={busy} onClick={onBack}>시작 화면으로</button></main>;
}

export default function App() {
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<TurnInput | null>(null);
  const [view, setView] = useState<'title' | 'intro' | 'game'>('title');
  const [introRun, setIntroRun] = useState({ fresh: false, key: 0 });
  const requestInFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const id = localStorage.getItem('prom-game');
        if (id) {
          try { setGame(await api<Game>('/games/' + id, undefined, controller.signal)); }
          catch (e) {
            if (e instanceof ApiError && e.status === 404) localStorage.removeItem('prom-game');
            else throw e;
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '불러오기에 실패했습니다.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  async function send(actionId?: string, retry?: TurnInput): Promise<boolean> {
    if (!game || requestInFlight.current || game.ending || (pending && !retry)) return false;
    const value = text.trim();
    if (!actionId && !retry && !value) return false;
    // Preserve the payload on retry so the server can prevent duplicate turns.
    const input: TurnInput = retry ?? {
      request_id: crypto.randomUUID(), state_version: game.version,
      input_type: actionId ? 'action' : 'chat', text: actionId ? '' : value,
      action_id: actionId ?? null,
    };
    return submit(input);
  }

  async function changeConversation(target: string) {
    if (!game || requestInFlight.current || pending || game.ending) return;
    await submit({ request_id: crypto.randomUUID(), state_version: game.version, input_type: 'conversation', text: '', action_id: null,
      conversation_mode: target === 'public' ? 'public' : 'private', target_character_id: target === 'public' ? null : target });
  }

  async function submit(input: TurnInput): Promise<boolean> {
    if (!game || requestInFlight.current) return false;
    requestInFlight.current = true;
    setBusy(true); setError(''); setPending(input);
    try {
      const result = await api<{ game: Game }>('/games/' + game.game_id + '/turns', input);
      setGame(result.game); setPending(null); if (input.input_type !== 'conversation') setText('');
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
    setIntroRun(current => ({ fresh, key: current.key + 1 }));
    setView('intro');
  }

  if (view === 'intro') return <Prologue key={introRun.key} fresh={introRun.fresh} onTitle={() => setView('title')}/>;
  if (view === 'title') return <main className="app-shell"><TitleScreen hasGame={!!game} onStart={() => openIntro(true)} onContinue={() => openIntro(false)} onLegacy={() => setView('game')}/></main>;

  if (!game) return <ServerDemoStart onStarted={setGame} onBack={() => setView('title')}/>;

  return <main className="app-shell is-playing">
    <header className="topbar">
      <button className="text-button intro-brand" disabled={busy || !!pending} onClick={() => setView('title')}>prom::enter.</button>
      <div className="topbar-status"><span className="live-dot"/>{busy ? '응답을 준비하는 중' : loading ? '불러오는 중' : '자동 저장됨'}</div>
      <button className="quiet-button" disabled={busy || !!pending} onClick={() => openIntro(true)}>새 이야기</button>
    </header>
    {error && <div className="error-banner" role="alert"><span>{error}</span>
      {pending && <button disabled={busy} onClick={() => void send(undefined, pending)}>같은 요청 재시도</button>}
      <button onClick={() => window.location.reload()}>다시 불러오기</button>
    </div>}
    <GameView key={game.game_id} game={game} busy={busy} pending={pending} error={error} text={text} onTextChange={setText} onSend={send} onConversationChange={changeConversation} onNewGame={() => openIntro(true)} onRetry={() => pending && void send(undefined, pending)}/>
  </main>;
}
