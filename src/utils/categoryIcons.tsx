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
function resolveCategoryIconSrc(muscleGroup?: MuscleGroup | string): { src: string; alt: string } {
  if (!muscleGroup) {
    return { src: './icon-default.jpg', alt: 'Inne' };
  }

  const normalized = muscleGroup.toLowerCase().trim();

  if (normalized.includes('klatka')) {
    return { src: './icon-chest.jpg', alt: 'Klatka' };
  }
  if (normalized.includes('plecy')) {
    return { src: './icon-back.jpg', alt: 'Plecy' };
  }
  if (normalized.includes('bark')) {
    return { src: './icon-shoulders.jpg', alt: 'Barki' };
  }
  if (normalized.includes('nog')) {
    return { src: './icon-legs.jpg', alt: 'Nogi' };
  }
  if (normalized.includes('triceps')) {
    return { src: './icon-triceps.jpg', alt: 'Triceps' };
  }
  if (normalized.includes('biceps')) {
    return { src: './icon-biceps.jpg', alt: 'Biceps' };
  }
  if (normalized.includes('brzuch')) {
    return { src: './icon-abs.jpg', alt: 'Brzuch' };
  }

  return { src: './icon-default.jpg', alt: 'Inne' };
}

export function getCategoryIconElement(
  muscleGroup?: MuscleGroup | string,
  className = 'w-6 h-6 object-contain opacity-85'
): React.ReactElement {
  const { src, alt } = resolveCategoryIconSrc(muscleGroup);
  return (
    <img
      src={src}
      alt={alt}
      loading="eager"
      decoding="sync"
      draggable={false}
      className={className}
      onError={(e) => {
        if (e.currentTarget.dataset.fallbackApplied) return;
        e.currentTarget.dataset.fallbackApplied = '1';
        if (!e.currentTarget.src.includes('icon-default.jpg')) {
          e.currentTarget.src = './icon-default.jpg';
        }
      }}
    />
  );
}

const cachedCategoryComponents = new Map<string, React.FC<{ className?: string }>>();

export function getCategoryIcon(
  muscleGroup?: MuscleGroup | string
): React.FC<{ className?: string }> {
  const { src } = resolveCategoryIconSrc(muscleGroup);
  let Comp = cachedCategoryComponents.get(src);
  if (!Comp) {
    Comp = React.memo(function MuscleIcon({ className }: { className?: string }) {
      return getCategoryIconElement(
        muscleGroup,
        className || 'w-6 h-6 object-contain opacity-85'
      );
    });
    cachedCategoryComponents.set(src, Comp);
  }
  return Comp;
}

export const CategoryIcon: React.FC<{
  muscleGroup?: MuscleGroup | string;
  className?: string;
}> = React.memo(({ muscleGroup, className }) => {
  return getCategoryIconElement(
    muscleGroup,
    className || 'w-6 h-6 object-contain opacity-85'
  );
});
