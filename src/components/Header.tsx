import React from 'react';

export const Header: React.FC = () => {
  return (
    <header 
      className="app-header-safe flex justify-center items-center pb-4 z-20 relative"
      style={{
        paddingTop: 'max(2rem, calc(env(safe-area-inset-top, 0px) + 1.25rem))',
      }}
    >
      <img 
        src="./logo.png" 
        onError={(e) => {
          if (e.currentTarget.dataset.fallbackApplied) return;
          e.currentTarget.dataset.fallbackApplied = '1';
          e.currentTarget.src = './logo.jpg';
        }}
        alt="Rzeźnik" 
        loading="eager"
        decoding="sync"
        className="w-[138px] h-auto aspect-[780/435] object-contain select-none drop-shadow-2xl"
      />
    </header>
  );
};
