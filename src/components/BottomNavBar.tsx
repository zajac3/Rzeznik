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
      <div className="mx-auto flex max-w-xl items-center justify-around px-2 py-1.5 pb-safe">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => onSelectTab(tab.key)}
              className={`flex flex-1 flex-col items-center justify-center py-1 transition-all cursor-pointer ${
                isActive ? 'text-red-500' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon
                className={`h-5 w-5 transition-transform ${
                  isActive ? 'scale-110 stroke-[2.4] text-red-500' : 'stroke-[1.8]'
                }`}
              />
              <span
                className={`mt-1 text-[11px] tracking-tight transition-all ${
                  isActive ? 'font-bold text-red-500' : 'font-medium text-zinc-500'
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
