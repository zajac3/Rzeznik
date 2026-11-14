import React, { useState, useEffect, useRef } from 'react';

interface SplashScreenProps {
  onFinish?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [phase, setPhase] = useState<'showing' | 'shrinking' | 'done'>('showing');
  const [logoReady, setLogoReady] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // Sprawdź, czy obrazek jest już w cache lub uruchom awaryjny limit czasu oczekiwania
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLogoReady(true);
      return;
    }
    const maxWaitTimer = setTimeout(() => {
      setLogoReady(true);
    }, 1000);
    return () => clearTimeout(maxWaitTimer);
  }, []);

  // Rozpocznij odliczanie widoczności splasha dopiero gdy logo jest gotowe
  useEffect(() => {
    if (!logoReady) return;

    const timerShrink = setTimeout(() => {
      setPhase('shrinking');
    }, 850);

    const timerDone = setTimeout(() => {
      setPhase('done');
      onFinishRef.current?.();
    }, 1450);

    return () => {
      clearTimeout(timerShrink);
      clearTimeout(timerDone);
    };
  }, [logoReady]);

  const handleSkip = () => {
    setPhase('done');
    onFinishRef.current?.();
  };

  if (phase === 'done') {
    return null;
  }

  const isShrinking = phase === 'shrinking';

  return (
    <div
      onClick={handleSkip}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-[#09090b] overflow-hidden transition-opacity duration-600 ease-in-out select-none cursor-pointer ${
        isShrinking ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-hidden="true"
    >
      {/* Płynna czerwona poświata atmosferyczna w centrum (radial-gradient gwarantujący brak artefaktów prostokąta) */}
      <div
        className={`pointer-events-none absolute w-80 h-80 sm:w-96 sm:h-96 rounded-full transition-all duration-600 ease-out ${
          isShrinking ? 'scale-0 opacity-0' : 'scale-100 opacity-100'
        }`}
        style={{
          background:
            'radial-gradient(circle at center, rgba(220, 38, 38, 0.45) 0%, rgba(185, 28, 28, 0.2) 35%, rgba(220, 38, 38, 0.05) 60%, transparent 75%)',
        }}
      />

      {/* Kontener z logo - wycentrowany, płynnie kurczący się i znikający ku górze */}
      <div
        className={`relative z-10 flex flex-col items-center justify-center transition-all duration-600 ease-[cubic-bezier(0.4,0,0.2,1)] transform ${
          isShrinking
            ? 'scale-[0.38] -translate-y-20 opacity-0'
            : 'scale-100 translate-y-0 opacity-100'
        }`}
      >
        <img
          ref={imgRef}
          src="./logo.png"
          onLoad={() => setLogoReady(true)}
          onError={(e) => {
            if (!e.currentTarget.dataset.fallbackApplied) {
              e.currentTarget.dataset.fallbackApplied = '1';
              e.currentTarget.src = './logo.jpg';
              return;
            }
            setLogoReady(true);
          }}
          alt="Rzeźnik"
          loading="eager"
          decoding="sync"
          className="w-[220px] sm:w-[260px] h-auto aspect-[780/435] object-contain select-none"
        />
      </div>
    </div>
  );
};
