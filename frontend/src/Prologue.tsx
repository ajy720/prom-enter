import { NarrationScene } from './NarrationScene';
import { useSceneViewport } from './useSceneViewport';
import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { PhotoSlot } from './PhotoSlot';
import { InterviewHub } from './InterviewHub';
import { ResourceStatus } from './ResourceStatus';
import { MonthOne } from './MonthOne';
import { storyGameKey } from './serverInterviewState';
import { part4StorageKey } from './part4State';
import { createMonthOneState, readMonthOneState, type MonthOneState } from './monthOneState';
import { createInterviewState, readInterviewState, type InterviewState } from './interviewState';
import { debutMembers, newcomers, titlePhotos, introScenes, characterPortraits, characterProfiles, sceneBackgrounds, type IntroCharacter } from './introContent';

const progressKey = 'prom-intro-v1';
type IntroProgress = { step: number; nickname: string; selectedId: string | null; interviews: InterviewState; monthOne: MonthOneState | null; resourcesIntroduced: boolean };
const initialProgress: IntroProgress = { step: 0, nickname: '', selectedId: null, interviews: createInterviewState(), monthOne: null, resourcesIntroduced: false };

export function readIntroProgress(): IntroProgress | null {
  try {
    const value = JSON.parse(localStorage.getItem(progressKey) ?? 'null');
    if (!value || !Number.isInteger(value.step) || value.step < 0 || value.step > introScenes.length || typeof value.nickname !== 'string') return null;
    const interviews = readInterviewState(value.interviews);
    if (interviews.recruitedId && value.monthOne && value.interviews?.recruitmentStep === undefined) interviews.recruitmentStep = 4;
    return { step: value.step === introScenes.length && (!interviews.recruitedId || !value.monthOne) ? introScenes.length - 1 : value.step, nickname: value.nickname.slice(0, 12), selectedId: newcomers.some(c => c.id === value.selectedId) ? value.selectedId : null, interviews, monthOne: interviews.recruitedId ? readMonthOneState(value.monthOne) : null, resourcesIntroduced: value.resourcesIntroduced === true || value.step > introScenes.findIndex(scene => scene.id === 'briefing') };
  } catch { return null; }
}

export function TitleScreen({ onStart, onContinue, onLegacy, busy = false }: { onStart: () => void; onContinue: () => void; onLegacy?: () => void; busy?: boolean }) {
  const saved = readIntroProgress();
  return <section className="title-screen" aria-label="Prom::Enter 시작 화면">
    <TitleArtwork/>
    <div className="title-copy">
    <header className="title-heading"><h1>Prom<span>::</span>Enter<span>.</span></h1>
      <p className="title-subtitle">다시 빛날 무대의 시작</p>
    </header>
    <div className="title-menu">
      <p className="title-description">당신의 선택으로 만나고, <br/>대화로 함께 만들어가는 이야기.</p>
      <div className="title-actions"><button className="primary-button" disabled={busy} onClick={onStart}>게임 시작 <span aria-hidden="true">→</span></button>
        {(saved || localStorage.getItem(storyGameKey)) && <button className="quiet-button" disabled={busy} onClick={onContinue}>{busy ? '불러오는 중…' : '이야기 이어하기'}</button>}
        {onLegacy && <button className="quiet-button" disabled={busy} onClick={onLegacy}>이전 브라우저 데모 열기</button>}
        {localStorage.getItem(storyGameKey)&&localStorage.getItem(part4StorageKey(localStorage.getItem(storyGameKey)))&&<button className="quiet-button" disabled={busy} onClick={()=>location.assign('/?part4Demo=1&game='+encodeURIComponent(localStorage.getItem(storyGameKey)!))}>Part 4 데모 이어하기</button>}
      </div>
    </div>
    </div>
  </section>;
}

function TitleArtwork() {
  const [frame, setFrame] = useState<{ active: number; previous: number | null }>({ active: 0, previous: null });
  const [firstLoaded, setFirstLoaded] = useState(false);
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(new Set());
  const [reducedMotion, setReducedMotion] = useState(true);
  const ready = loaded.size === titlePhotos.length - 1;
  const active = reducedMotion ? 0 : frame.active;

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      setReducedMotion(preference.matches);
      if (preference.matches) setFrame({ active: 0, previous: null });
    };
    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (!ready || reducedMotion || frame.active === titlePhotos.length - 1) return;
    const timer = window.setTimeout(() => setFrame({ active: frame.active + 1, previous: frame.active }), 4500);
    return () => window.clearTimeout(timer);
  }, [ready, reducedMotion, frame.active]);

  return <div className="title-art">
    <div className="title-photo-stack" role="img" aria-label="Prom::Enter의 여섯 연습생 단체 사진">
      {(firstLoaded && !reducedMotion ? titlePhotos : titlePhotos.slice(0, 1)).map((src, index) => <img key={src} src={src}
        srcSet={`${src.replace('.webp', '-768.webp')} 768w, ${src} 1536w`} sizes="(max-width: 640px) 100vw, (max-width: 760px) 640px, 66vw"
        alt="" aria-hidden="true" width={1536} height={1024} fetchPriority={index === 0 ? 'high' : 'low'} decoding="async"
        onLoad={event => {
          if (index === 0) setFirstLoaded(true);
          else void event.currentTarget.decode().then(() => setLoaded(current => new Set(current).add(index))).catch(() => {});
        }}
        className={index === active ? `is-active${!reducedMotion && frame.previous !== null ? ' is-wiping' : ''}` : index === frame.previous ? 'is-previous' : ''}
        onAnimationEnd={event => {
          if (event.animationName === 'title-outfit-wipe') setFrame(current => current.active === index ? { ...current, previous: null } : current);
        }}/>) }
    </div>
  </div>;
}

function CharacterDetails({ character, showAbilities = false }: { character: IntroCharacter; showAbilities?: boolean }) {
  return <>
    <p className="section-kicker">{character.role}</p><h2>{character.name}</h2>
    <p className="character-meta">{character.fullName}{character.age ? ` · ${character.age}세` : ''}</p>
    <div className="character-keywords">{character.keywords.map(word => <span key={word}>{word}</span>)}</div>
    <p className="character-description">{character.description}</p>
    {showAbilities && <dl className="profile-abilities">{Object.entries(character.abilities).map(([key, value]) => <div key={key}><dt>{key.toUpperCase()}</dt><dd>{value}<span> / 10</span></dd></div>)}</dl>}
  </>;
}

function CharacterGallery({ characters, selectedId, onSelect }: { characters: IntroCharacter[]; selectedId: string; onSelect: (id: string) => void }) {
  return <div className="profile-cards">{characters.map(character => <button key={character.id} className={`profile-card ${character.id === selectedId ? 'is-selected' : ''}`} aria-pressed={character.id === selectedId} onClick={() => onSelect(character.id)}>
    <PhotoSlot src={characterProfiles[character.id]} name={character.name}/>
    <span className="profile-card-label"><strong>{character.name}</strong></span>
  </button>)}</div>;
}

export function Prologue({ fresh, onTitle, onServerInterview, busy = false, serverError = '' }: { fresh: boolean; onTitle: () => void; onServerInterview: (id: string) => void; busy?: boolean; serverError?: string }) {
  const viewportRef = useSceneViewport();
  const [progress, setProgress] = useState<IntroProgress>(() => fresh ? { ...initialProgress } : readIntroProgress() ?? { ...initialProgress });
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [profileId, setProfileId] = useState(debutMembers[0].id);
  const [storageError, setStorageError] = useState(false);
  const [resourceNoticeOpen, setResourceNoticeOpen] = useState(false);
  const [briefingPart, setBriefingPart] = useState(() => progress.resourcesIntroduced ? 1 : 0);
  const scene = introScenes[Math.min(progress.step, introScenes.length - 1)];
  const character = newcomers.find(c => c.id === scene.characterId);
  const profile = debutMembers.find(c => c.id === profileId)!;
  const recruited = newcomers.find(c => c.id === progress.interviews.recruitedId);
  const nickname = progress.nickname.trim();
  const canAdvance = scene.kind !== 'nickname' || !!nickname;
  const briefingText = scene.id === 'briefing' ? (briefingPart === 0
    ? '{name}대표님, 회사의 자금과 시간은 넉넉하지 않습니다.'
    : '기존 데뷔조 세 명과 함께할 신입 한 명을 골라, 네 사람의 무대를 만들어주셔야 합니다.') : scene.text;

  useEffect(() => { setBriefingPart(progress.resourcesIntroduced ? 1 : 0); }, [scene.id]);

  useEffect(() => {
    try { localStorage.setItem(progressKey, JSON.stringify(progress)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [progress]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [progress.step, progress.interviews.activeId, progress.monthOne?.scene, progress.monthOne?.completed]);

  function advance() {
    if (scene.id === 'briefing' && briefingPart === 0) { setResourceNoticeOpen(true); return; }
    if (canAdvance) setProgress(current => ({ ...current, nickname: current.nickname.trim(), step: Math.min(current.step + 1, introScenes.length - 1) }));
  }

  function closeResourceNotice() {
    setResourceNoticeOpen(false); setBriefingPart(1);
    setProgress(current => ({ ...current, resourcesIntroduced: true }));
  }

  const navigation = <div className="intro-navigation"><button className="quiet-button" disabled={progress.step === 0} onClick={() => { if (scene.id === 'briefing' && briefingPart === 1) setBriefingPart(0); else setProgress(current => ({ ...current, step: Math.max(current.step - 1, 0) })); }}>← 이전</button>
    <span>{String(progress.step + 1).padStart(2, '0')} / {introScenes.length}</span>
    {scene.kind !== 'selection' && <button className="primary-button" disabled={!canAdvance} onClick={advance}>{scene.nextLabel ?? '다음'} →</button>}
  </div>;

  if (progress.monthOne && recruited && progress.step === introScenes.length) return <>
    {storageError && <p className="error-banner" role="alert">이 브라우저에 진행 상황을 저장하지 못했습니다. 새로고침하면 진행이 사라질 수 있어요.</p>}
    <MonthOne candidate={recruited} nickname={nickname} state={progress.monthOne}
      onUpdate={update => setProgress(current => ({ ...current, monthOne: update(current.monthOne ?? createMonthOneState()) }))}
      onTitle={onTitle} onCasting={() => setProgress(current => ({ ...current, step: introScenes.length - 1 }))}/>
  </>;

  return <div ref={viewportRef} className="prologue-shell">
    <header className="intro-topbar"><button className="text-button intro-brand" disabled={busy} onClick={onTitle}>prom::enter.</button><span>프롤로그 · {progress.interviews.recruitedId ? '프로뮤의 새로운 시작' : scene.title}</span><button className="quiet-button" disabled={busy} onClick={onTitle}>시작 화면</button></header>
    {storageError && <p className="error-banner" role="alert">이 브라우저에 진행 상황을 저장하지 못했습니다. 새로고침하면 진행이 사라질 수 있어요.</p>}
    {serverError && <p className="error-banner" role="alert">{serverError}</p>}
    {scene.kind === 'introduction' && character ? <section className="character-introduction part-one-photos" aria-label={`${character.name} 소개`}>
      <div className="introduction-photo" style={{ backgroundImage: `url("${sceneBackgrounds.practice}")` }}><PhotoSlot src={characterPortraits[character.id]} name={character.name} caption="반신 사진 자리"/></div>
      <div className="introduction-copy"><p className="section-kicker">MEET OUR TRAINEE · 0{newcomers.indexOf(character) + 1}</p><blockquote>{scene.text}</blockquote><CharacterDetails character={character}/>{navigation}</div>
    </section> : scene.kind === 'selection' ? <InterviewHub state={progress.interviews} selectedId={progress.selectedId} nickname={nickname}
      onInterview={onServerInterview} busy={busy}
      onSelect={id => setProgress(current => ({ ...current, selectedId: id }))}
      onUpdate={update => setProgress(current => ({ ...current, interviews: update(current.interviews) }))}
      onBack={() => setProgress(current => ({ ...current, step: current.step - 1 }))}
      onProceed={() => setProgress(current => current.interviews.recruitedId && current.interviews.recruitmentStep >= 4 ? ({ ...current, step: introScenes.length, monthOne: current.monthOne ?? createMonthOneState() }) : current)}/>
    : scene.speaker === '이야기' ? <NarrationScene title={scene.title} location={{office:'대표실',corridor:'복도',practice:'연습실'}[scene.location]} background={sceneBackgrounds[scene.location]} text={briefingText.replace('{name}',nickname ? nickname + ' ' : '')}>{navigation}</NarrationScene>
    : <section className={`intro-scene prologue-scene part-one-photos intro-${scene.location}${scene.speaker === '이야기' ? ' is-narration' : ''}`} aria-label={scene.title} style={{ backgroundImage: `url("${sceneBackgrounds[scene.location]}")` }}>
      <div className="intro-location"><span>Prom::Enter</span><strong>{{ office: '대표실', corridor: '복도', practice: '연습실' }[scene.location]}</strong></div>
      {progress.resourcesIntroduced && <div className="scene-resource-status"><ResourceStatus compact/></div>}
      <div className="secretary-photo">{scene.speaker !== '이야기' && <PhotoSlot src={characterPortraits.baek_hayeon} name="백하연" caption="대표 비서실장 · 반신 사진 자리"/>}</div>
      <div className="intro-dialogue-dock"><section className="dialogue-box"><header className="dialogue-header"><h2>{scene.speaker}</h2><span className="mode-label">{scene.title}</span></header>
        <div className="dialogue-content" role="log" aria-live="polite"><p>{briefingText.replace('{name}', nickname ? nickname + ' ' : '')}</p></div>
        {scene.kind === 'nickname' && <form className="nickname-form" onSubmit={event => { event.preventDefault(); advance(); }}><label htmlFor="nickname">이름을 입력해주세요</label><div><input autoComplete="off" id="nickname" value={progress.nickname} maxLength={12} placeholder="예: 민지" onChange={event => setProgress(current => ({ ...current, nickname: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }}/><span>대표님</span></div><small>최대 12자 · 이후 안내에 이 호칭을 사용합니다.</small></form>}
        {scene.kind === 'profiles' && <button className="profile-open-button choice-trigger" onClick={() => setProfilesOpen(true)}>데뷔조 프로필 보기</button>}
        {navigation}
      </section></div>
    </section>}

    <Modal open={resourceNoticeOpen} title="회사 자금과 남은 시간 안내" className="resource-notice-modal" onClose={closeResourceNotice}>
      <p className="section-kicker">백하연의 운영 브리핑</p><h2>우리에게 남은 자금과 시간</h2><ResourceStatus/>
      <p>현재 회사의 운영 자금은 20억 원입니다. 프로뮤의 계약 기간은 2년이며, 데뷔 쇼케이스까지는 3개월이 남았습니다.</p>
      <p>운영 안내와 활동 화면에서 자금과 계약 기간을 확인할 수 있습니다. 활동과 지출을 결정할 때 함께 살펴봐주세요.</p>
      <small>도입에서는 초기 자금을, 첫 달 활동에서는 저장된 잔액과 현재 진행 시점을 표시합니다. 후보 면담에는 자금과 기간을 표시하지 않습니다.</small>
      <button className="primary-button" onClick={closeResourceNotice}>확인 · 안내 계속하기 →</button>
    </Modal>
    <Modal open={profilesOpen} title="기존 데뷔조 프로필" className="profiles-modal" closeAtBottom onClose={() => setProfilesOpen(false)}>
      <div className="selection-heading"><h2>무대를 기다려온 세 사람</h2></div>
      <div className="gallery-layout"><CharacterGallery characters={debutMembers} selectedId={profileId} onSelect={setProfileId}/><aside className="profile-detail glass-panel"><CharacterDetails character={profile} showAbilities/></aside></div>
    </Modal>
  </div>;
}
