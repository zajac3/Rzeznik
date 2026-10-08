import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { BottomNavBar, type TabKey } from './components/BottomNavBar';
import { PlanView } from './components/PlanView';
import { ActiveWorkoutView } from './components/ActiveWorkoutView';
import { StatsView } from './components/StatsView';
import { ExportView } from './components/ExportView';
import { ensureDefaultExercisesSeeded } from './db/db';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('workout');

  useEffect(() => {
    ensureDefaultExercisesSeeded().catch((err) => {
      console.error('Błąd inicjalizacji bazy ćwiczeń:', err);
    });
  }, []);

  return (
    <div className="dark min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans selection:bg-red-950 selection:text-red-200 relative">
      {/* WARSTWA SZUMU */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-[0.12] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* WYMUSZENIE CZCIONKI I SUROWEGO STYLU (Global Override - Brutalist Dark Mode) */}
        <style>{`
          *, *::before, *::after,
          body, button, input, select, textarea, div, span, p, h1, h2, h3, h4, h5, h6, label {
            font-family: 'Space Grotesk', sans-serif !important;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          .font-mono, [class*="font-mono"], .font-sans, [class*="font-sans"] {
            font-family: 'Space Grotesk', sans-serif !important;
          }
          :root {
            --background: 240 5% 4% !important; /* #09090b */
            --foreground: 0 0% 98% !important;
            --card: 240 5% 10% !important; /* #18181b */
            --card-foreground: 0 0% 98% !important;
            --border: 240 5% 18% !important;
            --radius: 0 !important;
          }
          body {
            background-color: #09090b !important;
            color: #f4f4f5 !important;
          }
          /* Bezpieczne odstępy dla iPhone PWA (skrót na ekranie domowym) */
          @supports (padding-top: env(safe-area-inset-top)) {
            .app-header-safe {
              padding-top: max(2rem, calc(env(safe-area-inset-top, 0px) + 1.25rem)) !important;
            }
          }
          @media all and (display-mode: standalone) {
            .app-header-safe {
              padding-top: max(2.5rem, calc(env(safe-area-inset-top, 0px) + 1.25rem)) !important;
            }
          }
        `}</style>

        {/* Brutalist Header z logotypem obrazkowym */}
        <Header />

        {/* Main Tab Content */}
        <main className="flex-1 w-full max-w-xl mx-auto px-4 py-4 pb-24">
          {activeTab === 'plan' && (
            <PlanView onGoToActiveWorkout={() => setActiveTab('workout')} />
          )}

          {activeTab === 'workout' && <ActiveWorkoutView />}

          {activeTab === 'stats' && <StatsView />}

          {activeTab === 'export' && <ExportView />}
        </main>

        {/* iOS Bottom Navigation Bar */}
        <BottomNavBar activeTab={activeTab} onSelectTab={setActiveTab} />
      </div>
    </div>
  );
}
