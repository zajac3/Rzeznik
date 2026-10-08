import React from 'react';

export const Header: React.FC = () => {
  return (
    <div className="flex justify-center items-center pt-8 pb-4 z-20 relative">
      <img 
        src="./logo.png" 
        onError={(e) => { e.currentTarget.src = './logo.jpg'; }}
        alt="Rzeźnik" 
        className="w-full max-w-[180px] h-auto object-contain select-none drop-shadow-2xl"
      />
    </div>
  );
};
