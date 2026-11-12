import { useEffect, useRef, useState } from 'react';
import './showcase-video.css';

// Save/API character IDs remain unchanged.
const versions: Record<string, string> = {hyerin:'ido', seoyeon:'yeoul', jiwoo:'saya'};

export function ShowcaseVideo({characterId, characterName, onNext, onDismiss}: {
  characterId: string; characterName: string; onNext: () => void; onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playRequested, setPlayRequested] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const next = useRef(onNext);
  next.current = onNext;
  const version = versions[characterId];
  useEffect(() => {
    const element = dialog.current!;
    const media = video.current;
    element.showModal();
    return () => { media?.pause(); element.close(); };
  }, []);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => next.current(), 2200);
    return () => window.clearTimeout(timer);
  }, [leaving]);
  async function play() {
    setPlayRequested(true);
    try { setError(''); await video.current?.play(); }
    catch { setError('영상을 재생하지 못했습니다. 다시 재생해주세요.'); }
    finally { setPlayRequested(false); }
  }
  async function advance() {
    if (!started || playing || playRequested || error || leaving) return;
    video.current?.pause();
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    setLeaving(true);
  }
  return <dialog ref={dialog} className={`showcase-video-dialog ${leaving ? 'is-leaving' : ''}`} aria-label="데뷔 뮤직비디오" onCancel={event => {
    event.preventDefault();
    if (!leaving) onDismiss();
  }}>
    {leaving ? <div className="showcase-video-bridge" role="status"><p>무대 위, {characterName}의 파트가 시작된다.</p></div> : <>
      <header className="showcase-video-heading"><div><p>DEBUT SHOWCASE</p><h2>데뷔 뮤직비디오</h2></div><button className="text-button" onClick={onDismiss} aria-label="나레이션으로 돌아가기">닫기</button></header>
      <div className={`showcase-video-screen ${!started ? 'is-unstarted' : ''}`}>
        {version && <video ref={video} src={`/videos/showcase/${version}.mp4`} controls={started} playsInline preload="metadata" aria-label="데뷔 뮤직비디오 영상"
          onPlay={() => setPlaying(true)}
          onPlaying={() => {setStarted(true); setPlaying(true); setError('');}}
          onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
          onError={() => {setPlaying(false); setError('영상을 불러오지 못했습니다. 연결을 확인하고 다시 시도해주세요.');}}/>}
        {!started && version && <button className="showcase-video-play" aria-label={playRequested ? '불러오는 중' : '재생'} aria-busy={playRequested} disabled={playRequested} onClick={play}><svg viewBox="0 0 48 56" aria-hidden="true"><path d="M4 2 L46 28 L4 54 Z" fill="currentColor"/></svg></button>}
      </div>
      {(!version || error) && <div role="alert"><p>{error || '선발 멤버의 영상을 찾지 못했습니다.'}</p>{version && <button className="quiet-button" onClick={() => {setStarted(false); setPlaying(false); setError(''); video.current?.load();}}>다시 불러오기</button>}</div>}
      <footer><p aria-live="polite">{!started ? '재생 버튼을 눌러 뮤직비디오를 감상해주세요.' : playing ? '일시정지하거나 감상을 마치면 다음 장면으로 이어갈 수 있습니다.' : '다음 장면으로 이어갈 수 있습니다.'}</p><button className="primary-button" disabled={!started || playing || playRequested || !!error} onClick={advance}>다음 →</button></footer>
    </>}
  </dialog>;
}
