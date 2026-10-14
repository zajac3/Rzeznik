import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { BottomNavBar, type TabKey } from './components/BottomNavBar';
import { PlanView } from './components/PlanView';
import { ActiveWorkoutView } from './components/ActiveWorkoutView';
import { StatsView } from './components/StatsView';
import { ExportView } from './components/ExportView';
import { SplashScreen } from './components/SplashScreen';
import { ensureDefaultExercisesSeeded } from './db/db';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Błąd renderowania aplikacji:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center bg-gradient-to-b from-zinc-900 to-black border-2 border-red-700 space-y-3 my-6 text-zinc-100">
          <div className="h-2 w-2 bg-red-600 mx-auto" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Wystąpił problem z wyświetlaniem
          </h2>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            {this.state.error?.message || 'Wystąpił błąd podczas ładowania widoku.'}
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 text-xs font-bold uppercase tracking-wider text-white cursor-pointer transition-colors"
          >
            Odśwież aplikację
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('workout');
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    ensureDefaultExercisesSeeded().catch((err) => {
      console.error('Błąd inicjalizacji bazy ćwiczeń:', err);
    });
  }, []);

  return (
    <div className="dark min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans selection:bg-red-950 selection:text-red-200 relative">
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
          html, body {
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
          /* Eliminacja niepożądanych białych obramowań i rozbłysków przy klikaniu/tapowaniu */
          *, *::before, *::after {
            -webkit-tap-highlight-color: transparent !important;
          }
          button, [role="button"], input, select, textarea, a {
            -webkit-tap-highlight-color: transparent !important;
          }
          button:focus, button:active, button:focus-visible,
          [role="button"]:focus, [role="button"]:active, [role="button"]:focus-visible {
            outline: none !important;
          }
          /* Eliminacja zaznaczeń i obramowań na wykresach (Recharts & SVG) */
          .recharts-wrapper,
          .recharts-wrapper *,
          .recharts-surface,
          .recharts-surface *,
          .recharts-responsive-container,
          .recharts-responsive-container *,
          svg, svg *, path, rect, circle, g {
            outline: none !important;
            box-shadow: none !important;
            -webkit-tap-highlight-color: transparent !important;
            user-select: none !important;
            -webkit-user-select: none !important;
          }
        `}</style>

        {/* Brutalist Header z logotypem obrazkowym */}
        <Header />

        {/* Main Tab Content */}
        <main className="flex-1 w-full max-w-xl mx-auto px-4 py-4 pb-24">
          <AppErrorBoundary>
            {activeTab === 'plan' && (
              <PlanView onGoToActiveWorkout={() => setActiveTab('workout')} />
            )}

            {activeTab === 'workout' && <ActiveWorkoutView />}

            {activeTab === 'stats' && <StatsView />}

            {activeTab === 'export' && <ExportView />}
          </AppErrorBoundary>
        </main>

        {/* iOS Bottom Navigation Bar */}
        <BottomNavBar activeTab={activeTab} onSelectTab={setActiveTab} />

        {/* Ekran startowy z animacją logo */}
        {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      </div>
    </div>
  );
}
