import React from 'react';
import type { MuscleGroup } from '../db/db';

/**
 * Mapowanie ikon partii mięśniowych (.jpg) z folderu public:
 * - Klatka piersiowa: <img src="./icon-chest.jpg" alt="Klatka" className="w-6 h-6 object-contain opacity-85" />
 * - Plecy: <img src="./icon-back.jpg" alt="Plecy" className="w-6 h-6 object-contain opacity-85" />
 * - Barki: <img src="./icon-shoulders.jpg" alt="Barki" className="w-6 h-6 object-contain opacity-85" />
 * - Nogi: <img src="./icon-legs.jpg" alt="Nogi" className="w-6 h-6 object-contain opacity-85" />
 * - Triceps: <img src="./icon-triceps.jpg" alt="Triceps" className="w-6 h-6 object-contain opacity-85" />
 * - Biceps: <img src="./icon-biceps.jpg" alt="Biceps" className="w-6 h-6 object-contain opacity-85" />
 * - Brzuch: <img src="./icon-abs.jpg" alt="Brzuch" className="w-6 h-6 object-contain opacity-85" />
 * - Domyślna / Inne: <img src="./icon-default.jpg" alt="Inne" className="w-6 h-6 object-contain opacity-85" />
 */
export function getCategoryIconElement(
  muscleGroup?: MuscleGroup | string,
  className = 'w-6 h-6 object-contain opacity-85'
): React.ReactElement {
  if (!muscleGroup) {
    return (
      <img
        src="./icon-default.jpg"
        alt="Inne"
        className={className}
        onError={(e) => {
          if (!e.currentTarget.src.includes('icon-default.jpg')) {
            e.currentTarget.src = './icon-default.jpg';
          }
        }}
      />
    );
  }

  const normalized = muscleGroup.toLowerCase().trim();

  if (normalized.includes('klatka')) {
    return <img src="./icon-chest.jpg" alt="Klatka" className={className} />;
  }
  if (normalized.includes('plecy')) {
    return <img src="./icon-back.jpg" alt="Plecy" className={className} />;
  }
  if (normalized.includes('bark')) {
    return <img src="./icon-shoulders.jpg" alt="Barki" className={className} />;
  }
  if (normalized.includes('nog')) {
    return <img src="./icon-legs.jpg" alt="Nogi" className={className} />;
  }
  if (normalized.includes('triceps')) {
    return <img src="./icon-triceps.jpg" alt="Triceps" className={className} />;
  }
  if (normalized.includes('biceps')) {
    return <img src="./icon-biceps.jpg" alt="Biceps" className={className} />;
  }
  if (normalized.includes('brzuch')) {
    return <img src="./icon-abs.jpg" alt="Brzuch" className={className} />;
  }

  return (
    <img
      src="./icon-default.jpg"
      alt="Inne"
      className={className}
      onError={(e) => {
        if (!e.currentTarget.src.includes('icon-default.jpg')) {
          e.currentTarget.src = './icon-default.jpg';
        }
      }}
    />
  );
}

export function getCategoryIcon(
  muscleGroup?: MuscleGroup | string
): React.FC<{ className?: string }> {
  return function MuscleIcon({ className }: { className?: string }) {
    return getCategoryIconElement(
      muscleGroup,
      className || 'w-6 h-6 object-contain opacity-85'
    );
  };
}

export const CategoryIcon: React.FC<{
  muscleGroup?: MuscleGroup | string;
  className?: string;
}> = ({ muscleGroup, className }) => {
  return getCategoryIconElement(
    muscleGroup,
    className || 'w-6 h-6 object-contain opacity-85'
  );
};
