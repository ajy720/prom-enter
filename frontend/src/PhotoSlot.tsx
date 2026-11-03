import { useState } from 'react';

export function PhotoSlot({ src, name, caption, className = '' }: { src?: string; name: string; caption?: string; className?: string }) {
  const [failedSource, setFailedSource] = useState<string>();
  return <div className={`photo-slot ${className}`}>
    {src && failedSource !== src ? <img src={src} alt={name} onError={() => setFailedSource(src)}/> : <div className="photo-placeholder" role="img" aria-label={`${name} 사진 자리`}>
      <div className="placeholder-person" aria-hidden="true"><i/><b/></div>
      <span>{name}</span><small>{caption ?? '사진 준비 중'}</small>
    </div>}
  </div>;
}
