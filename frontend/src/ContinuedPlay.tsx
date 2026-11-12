import { lazy, useRef, useState } from 'react';
import { changeMonth } from './monthTransition';
import SixMonthDemo from './SixMonthDemo';
import PartThree from './PartThree';
const PartFour=lazy(()=>import('./PartFour'));
import { beginPart3, beginPart4, createPlaythrough, readPlaythrough, savePlaythrough, type Playthrough } from './playthroughState';
import type { Game } from './types';

export function ContinuedPlay({source, onTitle}: {source: Game; onTitle: () => void}) {
  const initial = useRef<{save: Playthrough | null; error: string} | null>(null);
  if (!initial.current) {
    try {
      const existing = readPlaythrough(localStorage, source.game_id);
      initial.current = {save:existing ?? savePlaythrough(localStorage, createPlaythrough(source), null),error:''};
    } catch (cause) { initial.current = {save:null,error:String(cause instanceof Error ? cause.message : cause)}; }
  }
  const [save, setSave] = useState(initial.current.save);
  const current = useRef(save);
  const [error, setError] = useState(initial.current.error);
  function commit(next: Playthrough) {
    const saved = savePlaythrough(localStorage, next, current.current!.revision);
    const changed = current.current?.stage !== saved.stage;
    current.current = saved;
    if (changed) changeMonth(() => setSave(saved)); else setSave(saved);
  }
  function continuePart3() {
    try { commit(beginPart3(current.current!)); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '다음 반기 저장에 실패했습니다.'); }
  }
  function continuePart4() {
    try {commit(beginPart4(current.current!));setError('');}
    catch(cause){setError(cause instanceof Error?cause.message:'Part 4 저장에 실패했습니다.');}
  }
  if (!save) return <main className="app-shell"><p className="error-banner" role="alert">{error}</p><button className="quiet-button" onClick={onTitle}>시작 화면으로</button></main>;
  return <>{error && <p className="error-banner" role="alert">{error}</p>}{save.stage === 'six'
    ? <SixMonthDemo key={save.gameId} session={{initial:save.six!,onChange:six=>commit({...current.current!,six}),onPartThree:continuePart3,onTitle}}/>
    : save.stage==='part3'?<PartThree key={save.gameId} session={{initial:save.part3!,source:save.source,six:save.six,onChange:part3=>commit({...current.current!,part3}),onTitle,onPartFour:continuePart4}}/>
    : <PartFour key={save.gameId} session={{initial:save.part4!,onChange:part4=>commit({...current.current!,part4}),onTitle}}/>}</>;
}
