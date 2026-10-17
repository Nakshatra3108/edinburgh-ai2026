import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Maximize, Minimize } from 'lucide-react';
import { FollowCanvas, type FollowCanvasProps } from '../canvas/FollowCanvas';
import { defaultResolveAsset } from '../canvas/assets';
import { Wordmark } from '../preview/Wordmark';
export type AudienceScreenProps = Omit<FollowCanvasProps, 'mode' | 'onPositionChange' | 'onAction'> & {
  inputMode?: 'manual' | 'microphone' | 'typed' | 'replay';
  onExit?: () => void;
  contentLabel?: string;
};
export function AudienceScreen({ onExit, inputMode = 'manual', contentLabel, ...canvas }: AudienceScreenProps) {
  const root = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');
  const [assetsReady, setAssetsReady] = useState(false);
  useEffect(() => {
    let live = true; setAssetsReady(false);
    const images = canvas.state.project.assets.flatMap(asset => {
      const url = (canvas.resolveAsset ?? defaultResolveAsset)(asset);
      if (!url) return [];
      return [new Promise<void>(resolve => { const image = new Image(); image.onload = () => resolve(); image.onerror = () => resolve(); image.src = url; setTimeout(resolve, 4000); })];
    });
    void Promise.all([document.fonts.ready, ...images]).then(() => { if (live) setAssetsReady(true); });
    return () => { live = false; };
  }, [canvas.state.project, canvas.resolveAsset]);
  useEffect(() => {
    const changed = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const toggleFullscreen = async () => {
    try {
      setError('');
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen();
      else setError('Fullscreen is unavailable in this browser. Use the browser’s fullscreen command.');
    } catch { setError('Fullscreen was blocked. Activate Fullscreen again, or use the browser’s fullscreen command.'); }
  };
  return <main ref={root} className="audience-screen" aria-label="Audience stage">
    <div className="audience-region">
      <div className="audience-brand"><Wordmark/></div>
      <div className="audience-safe-area">{assetsReady ? <FollowCanvas {...canvas} mode="audience"/> : <p className="stage-loading" role="status">Preparing stage…</p>}</div>
      {(inputMode === 'replay' || contentLabel) && <div className="audience-disclosure">{inputMode === 'replay' ? 'Recorded replay' : contentLabel}</div>}
    </div>
    <div className="audience-controls">{onExit && <button onClick={onExit}><ArrowLeft size={16}/>Back to studio</button>}<button onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize size={16}/> : <Maximize size={16}/>}<span>{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span></button></div>
    {error && <p className="fullscreen-error" role="alert">{error}</p>}
  </main>;
}
