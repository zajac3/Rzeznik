import React, { useState, useEffect } from 'react';

interface SplashScreenProps {
  onFinish?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [phase, setPhase] = useState<'showing' | 'shrinking' | 'done'>('showing');

  useEffect(() => {
    // Faza 1: Wyświetl logo na środku ekranu
    const timerShrink = setTimeout(() => {
      setPhase('shrinking');
    }, 850);

    // Faza 2: Po animacji kurczenia logo i zanikania tła odblokuj aplikację
    const timerDone = setTimeout(() => {
      setPhase('done');
      onFinish?.();
    }, 1450);

    return () => {
      clearTimeout(timerShrink);
      clearTimeout(timerDone);
    };
  }, [onFinish]);

  const handleSkip = () => {
    setPhase('done');
    onFinish?.();
  };

  if (phase === 'done') {
    return null;
  }

  const isShrinking = phase === 'shrinking';

  return (
    <div
      onClick={handleSkip}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-[#09090b] transition-opacity duration-600 ease-in-out select-none cursor-pointer ${
        isShrinking ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-hidden="true"
    >

      {/* Czerwona poświata atmosferyczna w centrum */}
      <div
        className={`absolute h-80 w-80 rounded-full bg-red-600/20 blur-3xl transition-all duration-600 ease-out ${
          isShrinking ? 'scale-0 opacity-0' : 'scale-100 opacity-100'
        }`}
      />

      {/* Kontener z logo - wycentrowany, płynnie kurczący się i znikający ku górze */}
      <div
        className={`relative z-10 flex flex-col items-center justify-center transition-all duration-600 cubic-bezier(0.4,0,0.2,1) transform ${
          isShrinking
            ? 'scale-[0.38] -translate-y-20 opacity-0'
            : 'scale-100 translate-y-0 opacity-100 animate-in fade-in zoom-in-90 duration-350'
        }`}
      >
        <img
          src="./logo.png"
          onError={(e) => {
            e.currentTarget.src = './logo.jpg';
          }}
          alt="Rzeźnik"
          className="w-full max-w-[220px] sm:max-w-[260px] h-auto object-contain drop-shadow-[0_0_30px_rgba(220,38,38,0.5)] select-none"
        />
      </div>
    </div>
  );
};
