import React from 'react';
import { Calendar, Dumbbell, BarChart3, FolderDown } from 'lucide-react';

export type TabKey = 'plan' | 'workout' | 'stats' | 'export';

interface BottomNavBarProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeTab, onSelectTab }) => {
  const tabs = [
    { key: 'plan' as TabKey, label: 'Plan', icon: Calendar },
    { key: 'workout' as TabKey, label: 'Trening', icon: Dumbbell },
    { key: 'stats' as TabKey, label: 'Statystyki', icon: BarChart3 },
    { key: 'export' as TabKey, label: 'Eksport', icon: FolderDown },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t-2 border-zinc-800 bg-gradient-to-t from-black via-[#0d0d10] to-[#121215]/95 backdrop-blur-md shadow-2xl shadow-black font-sans">
      <style>{`
        @keyframes subtleRedPulse {
          0%, 100% {
            filter: drop-shadow(0 0 1px rgba(239, 68, 68, 0.2));
            opacity: 0.88;
          }
          50% {
            filter: drop-shadow(0 0 3.5px rgba(239, 68, 68, 0.55));
            opacity: 1;
          }
        }
        @keyframes subtleTextPulse {
          0%, 100% {
            opacity: 0.90;
            text-shadow: none;
          }
          50% {
            opacity: 1;
            text-shadow: 0 0 3px rgba(239, 68, 68, 0.4);
          }
        }
        @keyframes tabAuraPulse {
          0%, 100% {
            opacity: 0.12;
            transform: scale(0.95);
          }
          50% {
            opacity: 0.35;
            transform: scale(1.04);
          }
        }
        .active-tab-icon {
          animation: subtleRedPulse 2.8s ease-in-out infinite;
          will-change: filter, opacity;
        }
        .active-tab-text {
          animation: subtleTextPulse 2.8s ease-in-out infinite;
          will-change: opacity, text-shadow;
        }
        .active-tab-aura {
          animation: tabAuraPulse 2.8s ease-in-out infinite;
          will-change: transform, opacity;
        }
      `}</style>
      <div className="mx-auto flex max-w-xl items-center justify-around px-2 py-1.5 pb-safe">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => onSelectTab(tab.key)}
              className={`relative flex flex-1 flex-col items-center justify-center py-1 transition-all cursor-pointer ${
                isActive ? 'text-red-500' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {/* Delikatna, ledwo zauważalna poświata pod wybraną zakładką */}
              {isActive && (
                <div className="absolute inset-0 m-auto h-8 w-10 rounded-full bg-red-600/15 blur-md pointer-events-none active-tab-aura" />
              )}
              <Icon
                className={`h-5 w-5 transition-transform ${
                  isActive
                    ? 'scale-105 stroke-[2.2] text-red-500 active-tab-icon'
                    : 'stroke-[1.8]'
                }`}
              />
              <span
                className={`mt-1 text-[11px] tracking-tight transition-all ${
                  isActive
                    ? 'font-bold text-red-500 active-tab-text'
                    : 'font-medium text-zinc-500'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
