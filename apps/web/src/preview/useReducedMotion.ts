import { useEffect, useState } from 'react';
export function useReducedMotion() {
  const [system, setSystem] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [explicit, setExplicit] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setSystem(media.matches); media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  return { reducedMotion: system || explicit, explicit, setExplicit, system };
}
