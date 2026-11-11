import { useState, type CSSProperties } from 'react';
import { portraitFrames } from './portraitFrames';
import { usePortraitLayout } from './usePortraitLayout';

export function PhotoSlot({ src, fallbackSrc, name, caption, className = '', style }: { src?: string; fallbackSrc?: string; name: string; caption?: string; className?: string; style?: CSSProperties }) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const imageSrc = [src, fallbackSrc].find(candidate => candidate && !failedSources.includes(candidate));
  const frame = imageSrc && portraitFrames[imageSrc.replace('/images/characters/', '')];
  const photoRef = usePortraitLayout(!!frame);
  const framing = frame ? {
    '--cutout-size': .98 * frame[5] / (frame[3] - frame[1]),
    '--cutout-top': .02 - .98 * frame[1] / (frame[3] - frame[1]),
    '--cutout-center': `${-50 * (frame[0] + frame[2]) / frame[4]}%`,
  } as CSSProperties : {};
  return <div ref={photoRef} className={`photo-slot ${frame ? 'dialogue-photo' : ''} ${className}`} style={{ ...framing, ...style }}>
    {imageSrc ? <img key={imageSrc} src={imageSrc} alt={name} onError={() => setFailedSources(failed => [...failed, imageSrc])}/> : <div className="photo-placeholder" role="img" aria-label={`${name} 사진 자리`}>
      <div className="placeholder-person" aria-hidden="true"><i/><b/></div>
      <span>{name}</span><small>{caption ?? '사진 준비 중'}</small>
    </div>}
  </div>;
}
