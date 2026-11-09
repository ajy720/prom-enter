import { useState, type CSSProperties } from 'react';

export function PhotoSlot({ src, fallbackSrc, name, caption, className = '', style }: { src?: string; fallbackSrc?: string; name: string; caption?: string; className?: string; style?: CSSProperties }) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const imageSrc = [src, fallbackSrc].find(candidate => candidate && !failedSources.includes(candidate));
  return <div className={`photo-slot ${className}`} style={style}>
    {imageSrc ? <img key={imageSrc} src={imageSrc} alt={name} onError={() => setFailedSources(failed => [...failed, imageSrc])}/> : <div className="photo-placeholder" role="img" aria-label={`${name} 사진 자리`}>
      <div className="placeholder-person" aria-hidden="true"><i/><b/></div>
      <span>{name}</span><small>{caption ?? '사진 준비 중'}</small>
    </div>}
  </div>;
}
