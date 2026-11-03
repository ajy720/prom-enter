import { useState } from 'react';
import { Modal } from './Modal';
import { PhotoSlot } from './PhotoSlot';
import { useDialogueHistory } from './DialogueNavigation';
import { TeamStatus } from './TeamStatus';
import { ResourceStatus } from './ResourceStatus';
import { debutMembers, introAssets, type IntroCharacter } from './introContent';
import type { CandidateId } from './interviewState';
import { dormRules, monthQuestions, monthReply, trainingOptions } from './monthOneContent';
import { canFinishMonth, finishMonth, hasDiscussion, memberIds, recordMonthTurn, type MonthOneState, type MonthSpeaker } from './monthOneState';

export function MonthOne({ candidate, nickname, state, onUpdate, onTitle, onCasting }: {
  candidate: IntroCharacter; nickname: string; state: MonthOneState;
  onUpdate: (update: (current: MonthOneState) => MonthOneState) => void; onTitle: () => void; onCasting: () => void;
}) {
  const [speaker, setSpeaker] = useState<MonthSpeaker>('newcomer');
  const [text, setText] = useState('');
  const [recordsSpeaker, setRecordsSpeaker] = useState<MonthSpeaker>('newcomer');
  const [menu, setMenu] = useState<'training' | 'rule' | 'confirm' | 'records' | null>(null);
  const people = [{ ...candidate, id: 'newcomer' }, ...debutMembers];
  const person = people.find(person => person.id === speaker)!;
  const messages = state.conversations[speaker];
  const training = trainingOptions.find(option => option.id === state.training);
  const rule = dormRules.find(option => option.id === state.rule);
  const talked = memberIds.filter(id => hasDiscussion(state, id)).length;
  const scenes = [
    { speaker: '이야기', portrait: candidate.portrait, text: `프로뮤의 첫 합숙이 시작됐습니다.\n${candidate.name}, 리안, 도하, 세인. 서로 다른 시간을 지나온 네 사람이 같은 숙소에서 하루를 시작합니다. 익숙해지기까지는 조금 시간이 필요할 것 같습니다.` },
    { speaker: '이야기', portrait: candidate.portrait, text: `${candidate.name}, 기존 멤버들의 연습에 합류합니다.\n오랫동안 호흡을 맞춰온 세 사람과 달리 신입은 동작과 타이밍을 맞추는 데 어려움을 겪습니다. 연습실에는 어색한 침묵이 흐릅니다.` },
    { speaker: candidate.name, portrait: candidate.portrait, text: candidate.id === 'jiwoo' ? '혼자 연습할 때는 문제없었습니다. 그런데 같이 하니 자꾸 어긋납니다. 제가 이 자리에 맞는 사람인지……실력으로 보여드리고 싶습니다.' : candidate.id === 'hyerin' ? '저……다른 친구가 왔다면 더 잘했을까요? 제가 다른 사람의 자리를 가져간 것 같아서……자꾸 긴장이 돼요.' : '제가 자꾸 늦어서 언니들 연습까지 멈추는 것 같아요. 다른 친구가 왔으면 더 잘했을까요……아니에요, 저도 꼭 따라갈 거예요.' },
  ];
  const introductory = state.scene < scenes.length;
  const storyFrames = scenes.slice(0, introductory ? state.scene + 1 : scenes.length).map(scene => ({ ...scene, photoName: scene.speaker === '이야기' ? candidate.name : scene.speaker }));
  const history = useDialogueHistory(storyFrames.length, String(introductory));
  const lastMessage = messages[messages.length - 1];
  const secretaryReply = lastMessage?.reply.startsWith('백하연: ');
  const displayed = introductory ? storyFrames[history.index] : state.completed
    ? { speaker: '백하연', text: '대표님, 이번 달 훈련 분야와 합숙 규칙, 멤버들의 의견을 기록했습니다. 서로의 이야기를 바탕으로 첫 합숙을 준비하겠습니다.', portrait: introAssets.secretary, photoName: '백하연' }
    : { speaker: secretaryReply ? '백하연' : person.name,
      text: lastMessage?.reply.replace(/^백하연: /, '') ?? '연습 소감과 필요한 도움에 대해 이야기를 나눠보세요. 대화 상대는 아래에서 바꿀 수 있어요.',
      portrait: secretaryReply ? introAssets.secretary : person.portrait, photoName: secretaryReply ? '백하연' : person.name };
  const recordPerson = people.find(target => target.id === recordsSpeaker)!;
  function openRecords() { setRecordsSpeaker(speaker); setMenu('records'); }

  function send(value: string) {
    const question = value.trim();
    if (!question || state.completed || introductory) return;
    onUpdate(current => recordMonthTurn(current, speaker, { id: crypto.randomUUID(), question,
      ...monthReply(speaker, candidate.id as CandidateId, question, !!current.training) }));
    setText('');
  }
  const summary = <dl className="month-summary"><div><dt>합류 멤버</dt><dd>{candidate.name}</dd></div><div><dt>집중 훈련</dt><dd>{training?.label ?? '미지정'}</dd></div><div><dt>기존 멤버 면담</dt><dd>{talked} / 3명</dd></div><div><dt>합숙 규칙</dt><dd>{rule?.label ?? '미지정'}</dd></div></dl>;

  return <div className="prologue-shell">
    <header className="intro-topbar"><button className="text-button intro-brand" onClick={onTitle}>prom::enter.</button><span>Part 2 · 1개월차 · 어색한 첫 합숙</span><button className="quiet-button" onClick={onTitle}>시작 화면</button></header>
    <section className="interview-room month-one" aria-label="1개월차 어색한 첫 합숙" style={introAssets.practice ? { backgroundImage: `url("${introAssets.practice}")`, backgroundSize: 'cover' } : undefined}>
    <div className="scene-resource-status"><ResourceStatus compact/></div>
      <aside className="interview-info glass-panel month-tasks"><p className="section-kicker">PROMYOU · 첫 합숙</p><h1>같은 무대를 향해</h1><p>{candidate.name}의 팀 적응을 도와주세요.</p>

        <TeamStatus/>
        <ol className="month-checklist"><li>{state.training ? '✓' : '○'} 집중 훈련 {training?.label ?? '선택'}</li><li>{talked === 3 ? '✓' : '○'} 기존 멤버 면담 {talked}/3</li><li>{state.rule ? '✓' : '○'} 합숙 규칙 정하기</li></ol>
        {!introductory && !state.completed && <><button className="quiet-button" onClick={() => setMenu('training')}>집중 훈련 {training ? '변경' : '선택'}</button><button className="quiet-button" onClick={() => setMenu('rule')}>합숙 규칙 {rule ? '변경' : '선택'}</button></>}
      </aside>
      <div className="interview-portrait"><PhotoSlot src={displayed.portrait} name={displayed.photoName} caption="반신 사진 자리"/></div>
      <div className="interview-context"><span>연습실 · 합숙 첫 달</span><p>처음부터 완벽한 팀은 없으니까.<br/>서로의 속도를 알아가는 시간.</p><span>프론트 데모 · 준비된 대화</span></div>
      <div className="interview-dock">
        <section className="dialogue-box"><header className="dialogue-header"><h2>{displayed.speaker}</h2><div className="dialogue-tools"><span className="mode-label">1개월차 데모</span><button className="text-button" onClick={openRecords}>대화 기록 보기</button></div></header>
          <div className="dialogue-content" role="log" aria-live="polite"><p>{displayed.text}</p></div>
          {introductory ? <div className="intro-navigation"><button className="quiet-button" onClick={history.index === 0 ? onCasting : history.previous}>← 이전</button><span>{history.index + 1} / 3{history.reviewing ? ' · 지난 대화' : ''}</span><button className="primary-button" onClick={history.reviewing ? history.next : () => onUpdate(current => ({ ...current, scene: Math.min(3, current.scene + 1) }))}>{history.reviewing || state.scene < 2 ? '다음' : '첫 달 계획 세우기'} →</button></div>
            : null}
        </section>
        {!introductory && (state.completed ? <section className="glass-panel month-finished"><p className="section-kicker">1개월차 계획 확정</p><h2>프로뮤의 첫걸음을 준비했어요.</h2>{summary}<p>선택과 대화 기록이 이 브라우저에 저장되었습니다. 실제 훈련 결과·신뢰도·성공/실패 판정은 서버 연결 후 반영합니다.</p><div className="month-actions"><button className="quiet-button" onClick={openRecords}>멤버별 대화 기록 보기</button><button className="primary-button" disabled>2개월차 · 준비 중</button></div></section> : <>
          <div className="month-people" aria-label="대화 상대">{people.map(target => <button key={target.id} aria-pressed={speaker === target.id} onClick={() => { setSpeaker(target.id as MonthSpeaker); setText(''); }}>{target.name}<small>{target.id === 'newcomer' ? '신입' : hasDiscussion(state, target.id as MonthSpeaker) ? '면담 확인 ✓' : '면담 전'}</small></button>)}</div>
          <div className="interview-suggestions">{monthQuestions.map(question => <button key={question} onClick={() => send(question)}>{question}</button>)}</div>
          <form className="chat-composer glass-panel" onSubmit={event => { event.preventDefault(); send(text); }}><label htmlFor="month-message" className="sr-only">첫 합숙 대화</label><textarea id="month-message" rows={2} maxLength={2000} value={text} placeholder={`${person.name}에게 이야기하기`} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); send(text); } }}/><button className="primary-button" disabled={!text.trim()}>전송 ↑</button></form>
          <div className="month-actions"><p>{canFinishMonth(state) ? '필요한 준비를 마쳤어요. 확인 후 이번 달 계획을 확정해주세요.' : '훈련 1개·기존 멤버 3명과 대화·합숙 규칙을 정해주세요.'}</p><button className="primary-button" disabled={!canFinishMonth(state)} onClick={() => setMenu('confirm')}>첫 달 계획 확인 →</button></div>
          <p className="dock-caption">준비된 주제에 답하는 데모입니다. 실제 AI와 게임 수치 판정은 아직 연결하지 않았어요.</p>
        </>)}
      </div>
    </section>
    <Modal open={menu === 'training'} title="집중 훈련 선택" className="month-modal" onClose={() => setMenu(null)}><p className="section-kicker">이번 달 집중 분야 · 하나 선택</p><h2>{candidate.name}의 첫 트레이닝</h2><p>트레이닝에는 자금이 필요합니다. 현재는 계획을 정하는 단계로 비용이 차감되지 않습니다.</p><p>지금 가장 필요한 기초를 골라주세요. 계획 확정 전까지 바꿀 수 있어요.</p><div className="month-options">{trainingOptions.map(option => <button key={option.id} aria-pressed={state.training === option.id} disabled={state.completed} onClick={() => { onUpdate(current => ({ ...current, training: option.id })); setMenu(null); }}><strong>{option.label}</strong><span>{option.description}</span></button>)}</div></Modal>
    <Modal open={menu === 'rule'} title="합숙 규칙 선택" className="month-modal" onClose={() => setMenu(null)}><p className="section-kicker">함께 지낼 약속</p><h2>어떤 규칙부터 시작할까요?</h2><p>이번 달에 우선 지킬 규칙 한 가지를 골라주세요.</p><div className="month-options">{dormRules.map(option => <button key={option.id} aria-pressed={state.rule === option.id} disabled={state.completed} onClick={() => { onUpdate(current => ({ ...current, rule: option.id })); setMenu(null); }}><strong>{option.label}</strong><span>{option.description}</span></button>)}</div></Modal>
    <Modal open={menu === 'confirm'} title="첫 달 계획 확인" className="month-modal" onClose={() => setMenu(null)}><p className="section-kicker">대표님의 첫 운영 계획</p><h2>이 계획으로 준비할까요?</h2>{summary}<p>확정 후에는 이번 달 선택을 바꿀 수 없습니다. 이 단계는 데모 계획 기록이며 성공·실패 결과를 계산하지 않습니다.</p><button className="primary-button" disabled={!canFinishMonth(state) || state.completed} onClick={() => { onUpdate(finishMonth); setMenu(null); }}>첫 달 계획 확정</button></Modal>
    <Modal open={menu === 'records'} title="첫 합숙 대화 기록" className="records-modal" onClose={() => setMenu(null)}><h2>{recordPerson.name} · 첫 달 대화 기록</h2>
      <div className="month-people" aria-label="대화 기록 멤버 선택">{people.map(target => <button key={target.id} aria-pressed={recordsSpeaker === target.id} onClick={() => setRecordsSpeaker(target.id as MonthSpeaker)}>{target.name}</button>)}</div>
      <div className="interview-history" key={recordsSpeaker}>{!state.conversations[recordsSpeaker].length && <p className="empty">아직 나눈 이야기가 없습니다.</p>}{state.conversations[recordsSpeaker].flatMap(message => [
        <article key={`${message.id}:question`} className="interview-history-message speaker-player"><strong>{nickname ? nickname + ' 대표님' : '대표님'}</strong><p>{message.question}</p></article>,
        <article key={`${message.id}:reply`} className={`interview-history-message speaker-${message.reply.startsWith('백하연: ') ? 'secretary' : 'trainee'}`}><strong>{message.reply.startsWith('백하연: ') ? '백하연' : recordPerson.name}</strong><p>{message.reply.replace(/^백하연: /, '')}</p></article>,
      ])}</div>
    </Modal>
  </div>;
}
