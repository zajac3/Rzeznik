import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  X,
  Repeat,
  Calendar as CalendarIcon,
  Check,
  AlertCircle,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import {
  db,
  type RoutineDay,
  type RoutineExercise,
  type WorkoutDay,
  type RecurringCycle,
  createRecurringCycle,
  deleteRecurringCycle,
  clearAllPlannedSessionsForRoutine,
} from '../db/db';
import {
  formatDateToISO,
  parseISODate,
  getTodayISO,
  POLISH_DAYS_SHORT,
} from '../utils/dateUtils';

interface RecurringWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  routineDays: RoutineDay[];
  routineExercises: RoutineExercise[];
  workoutDays: WorkoutDay[];
  initialDateISO?: string | null;
  initialRoutineDayId?: number | null;
  onSuccess?: (message: string, targetMonthDate?: Date) => void;
}

type RecurrenceMode = 'weekdays' | 'interval';
type DurationOption = '4' | '8' | 'indefinite';

// Mapowanie dni tygodnia: Pn=1, Wt=2, Śr=3, Czw=4, Pt=5, Sb=6, Nd=0
const WEEKDAY_BUTTONS: { dayIndex: number; label: string }[] = [
  { dayIndex: 1, label: 'Pn' },
  { dayIndex: 2, label: 'Wt' },
  { dayIndex: 3, label: 'Śr' },
  { dayIndex: 4, label: 'Czw' },
  { dayIndex: 5, label: 'Pt' },
  { dayIndex: 6, label: 'Sb' },
  { dayIndex: 0, label: 'Nd' },
];

export const RecurringWorkoutModal: React.FC<RecurringWorkoutModalProps> = ({
  isOpen,
  onClose,
  routineDays,
  routineExercises,
  workoutDays,
  initialDateISO,
  initialRoutineDayId,
  onSuccess,
}) => {
  const todayISO = getTodayISO();

  // Pobierz aktywne cykle treningowe z bazy w czasie rzeczywistym
  const activeCycles = useLiveQuery(async () => {
    return await db.recurringCycles.orderBy('created_at').reverse().toArray();
  }, []) ?? [];

  // 1. Wybór szablonu treningowego
  const [selectedRoutineDayId, setSelectedRoutineDayId] = useState<number | null>(() => {
    if (initialRoutineDayId) return initialRoutineDayId;
    return routineDays.length > 0 ? routineDays[0].id ?? null : null;
  });

  // 2. Tryb powtarzania: Dni tygodnia vs Interwał
  const [mode, setMode] = useState<RecurrenceMode>('weekdays');

  // Dni tygodnia: domyślnie Pn (1) i Czw (4)
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1, 4]);

  // Interwał: domyślnie co 4 dni
  const [intervalDays, setIntervalDays] = useState<number>(4);

  // 3. Zakres dat i horyzont czasowy: dokładnie 4 tyg., 8 tyg., nieokreślony
  const [startDateISO, setStartDateISO] = useState<string>(initialDateISO || todayISO);
  const [durationType, setDurationType] = useState<DurationOption>('8');

  // 4. Opcje konfliktów
  const [skipExistingPlanned, setSkipExistingPlanned] = useState<boolean>(true);

  // 5. Zarządzanie cyklami / stan usuwania
  const [deletingCycleId, setDeletingCycleId] = useState<number | null>(null);
  const [isCleaningLegacy, setIsCleaningLegacy] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [showActiveCyclesSection, setShowActiveCyclesSection] = useState<boolean>(true);

  // Synchronizacja przy otwarciu oraz blokada przewijania poziomego i tła
  React.useEffect(() => {
    if (isOpen) {
      const prevBodyOverflow = document.body.style.overflow;
      const prevBodyTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'pan-y';

      if (initialRoutineDayId) {
        setSelectedRoutineDayId(initialRoutineDayId);
      } else if (!selectedRoutineDayId && routineDays.length > 0) {
        setSelectedRoutineDayId(routineDays[0].id ?? null);
      }
      if (initialDateISO) {
        setStartDateISO(initialDateISO);
      }
      setStatusFeedback(null);

      return () => {
        document.body.style.overflow = prevBodyOverflow;
        document.body.style.touchAction = prevBodyTouchAction;
      };
    }
  }, [isOpen, initialDateISO, initialRoutineDayId, routineDays]);

  // Obliczenie daty końcowej:
  // 4 tyg. = +28 dni, 8 tyg. = +56 dni, nieokreślony = +182 dni (26 tygodni / pół roku w przód)
  const effectiveEndDateISO = useMemo(() => {
    const start = parseISODate(startDateISO);
    if (durationType === '4') {
      start.setDate(start.getDate() + 28);
    } else if (durationType === '8') {
      start.setDate(start.getDate() + 56);
    } else {
      // Nieokreślony: planujemy 26 tygodni (pół roku) w przód w kalendarzu
      start.setDate(start.getDate() + 182);
    }
    return formatDateToISO(start);
  }, [startDateISO, durationType]);

  // Generowanie listy dat dla nowego cyklu
  const generatedDates = useMemo(() => {
    const dates: string[] = [];
    if (!startDateISO || !effectiveEndDateISO) return dates;

    const start = parseISODate(startDateISO);
    const end = parseISODate(effectiveEndDateISO);

    if (start > end) return dates;

    if (mode === 'weekdays') {
      if (selectedWeekdays.length === 0) return dates;
      const cur = new Date(start);
      let safetyCounter = 0;
      while (cur <= end && safetyCounter < 400) {
        safetyCounter++;
        const dayOfWeek = cur.getDay(); // 0-6
        if (selectedWeekdays.includes(dayOfWeek)) {
          dates.push(formatDateToISO(cur));
        }
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      const step = Math.max(1, intervalDays);
      const cur = new Date(start);
      let safetyCounter = 0;
      while (cur <= end && safetyCounter < 400) {
        safetyCounter++;
        dates.push(formatDateToISO(cur));
        cur.setDate(cur.getDate() + step);
      }
    }

    return dates;
  }, [mode, selectedWeekdays, intervalDays, startDateISO, effectiveEndDateISO]);

  // Kolizje z istniejącymi treningami
  const existingWorkoutMap = useMemo(() => {
    return new Map(workoutDays.map((d) => [d.date, d]));
  }, [workoutDays]);

  const collisionStats = useMemo(() => {
    let plannedCollisions = 0;

    for (const d of generatedDates) {
      const existing = existingWorkoutMap.get(d);
      if (existing && (existing.routine_day_id || existing.routine_day_name)) {
        plannedCollisions++;
      }
    }

    return { plannedCollisions };
  }, [generatedDates, existingWorkoutMap]);

  // Sprawdź czy dla wybranego szablonu istnieją jakieś zaplanowane sesje w ogóle
  const plannedSessionsForSelectedRoutineCount = useMemo(() => {
    if (!selectedRoutineDayId) return 0;
    return workoutDays.filter(
      (w) => w.routine_day_id === selectedRoutineDayId && w.status === 'planned'
    ).length;
  }, [workoutDays, selectedRoutineDayId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleWeekday = (dayIndex: number) => {
    setSelectedWeekdays((prev) => {
      if (prev.includes(dayIndex)) {
        if (prev.length === 1) return prev; // minimum 1 dzień
        return prev.filter((d) => d !== dayIndex);
      } else {
        return [...prev, dayIndex].sort();
      }
    });
  };

  const handleApplySchedule = async () => {
    if (!selectedRoutineDayId || generatedDates.length === 0) return;

    setIsSubmitting(true);
    setStatusFeedback(null);

    try {
      const targetRoutine = routineDays.find((r) => r.id === selectedRoutineDayId);
      const routineName = targetRoutine?.name || 'Trening';

      const result = await createRecurringCycle({
        routine_day_id: selectedRoutineDayId,
        mode,
        weekdays: mode === 'weekdays' ? selectedWeekdays : undefined,
        interval_days: mode === 'interval' ? intervalDays : undefined,
        start_date: startDateISO,
        end_date: effectiveEndDateISO,
        duration_type: durationType,
        dates: generatedDates,
        skipExistingPlanned,
      });

      let msg = `Zaplanowano ${result.assignedCount} sesji cyklu (${routineName})!`;
      if (result.skippedExistingCount > 0) {
        msg += ` Pominięto ${result.skippedExistingCount} dni z zaplanowanymi jednostkami.`;
      }

      onSuccess?.(msg, parseISODate(startDateISO));
      onClose();
    } catch (err) {
      console.error('Błąd planowania cyklu:', err);
      setStatusFeedback('Wystąpił błąd podczas zapisywania cyklu w kalendarzu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Usuwanie konkretnego cyklu z bazy
  const handleDeleteSpecificCycle = async (cycle: RecurringCycle) => {
    if (!cycle.id) return;
    setDeletingCycleId(cycle.id);
    try {
      const res = await deleteRecurringCycle(cycle.id);
      setStatusFeedback(`Usunięto cykl: "${cycle.routine_day_name}" (${res.removedSessionsCount} sesji wyczyszczonych).`);
    } catch (err) {
      console.error('Błąd usuwania cyklu:', err);
      setStatusFeedback('Wystąpił problem podczas usuwania cyklu.');
    } finally {
      setDeletingCycleId(null);
    }
  };

  // Wyczyść wszystkie zaplanowane sesje wybranego szablonu (np. jeśli były dodane wcześniej)
  const handleClearLegacySessions = async () => {
    if (!selectedRoutineDayId) return;
    setIsCleaningLegacy(true);
    try {
      const targetRoutine = routineDays.find((r) => r.id === selectedRoutineDayId);
      const res = await clearAllPlannedSessionsForRoutine(selectedRoutineDayId);
      setStatusFeedback(`Usunięto ${res.removedSessionsCount} zaplanowanych sesji dla: ${targetRoutine?.name || 'szablonu'}.`);
    } catch (err) {
      console.error('Błąd usuwania sesji szablonu:', err);
      setStatusFeedback('Wystąpił problem podczas usuwania sesji.');
    } finally {
      setIsCleaningLegacy(false);
    }
  };

  const selectedRoutineDay = routineDays.find((r) => r.id === selectedRoutineDayId);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/90 overflow-hidden touch-pan-y overscroll-none animate-in fade-in duration-150 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden touch-pan-y overscroll-contain rounded-none border-2 border-zinc-700 bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-4 sm:p-5 space-y-4 shadow-2xl text-zinc-100 cursor-default"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-none bg-black border border-red-800 text-red-500">
              <Repeat className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest block">
                Harmonogram cykliczny
              </span>
              <h3 className="text-sm font-bold text-zinc-100 tracking-wider uppercase">
                Dodaj cykliczny trening
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-none border border-zinc-800 bg-black p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {statusFeedback && (
          <div className="p-3 bg-red-950/80 border border-red-700 text-red-200 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{statusFeedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusFeedback(null)}
              className="text-red-300 hover:text-white text-xs font-bold"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {routineDays.length === 0 ? (
          <div className="p-6 text-center bg-black border border-zinc-800 space-y-2">
            <AlertCircle className="h-6 w-6 text-red-500 mx-auto" />
            <p className="text-sm font-bold text-zinc-200 uppercase">
              Brak szablonów treningowych
            </p>
            <p className="text-xs text-zinc-400">
              Aby zaplanować trening cyklicznie, najpierw utwórz szablon dnia (np. „Push A”) w sekcji „Szablony treningowe”.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 px-4 py-2 bg-zinc-900 border border-zinc-700 text-xs font-bold uppercase tracking-wider text-white cursor-pointer"
            >
              Rozumiem
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 1. WYBÓR SZABLONU */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center justify-between">
                <span>1. Wybierz szablon treningowy</span>
                {selectedRoutineDay && (
                  <span className="text-[10px] text-red-400 font-bold">
                    {routineExercises.filter((re) => re.routine_day_id === selectedRoutineDay.id).length} ćwiczeń w szablonie
                  </span>
                )}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1 bg-black/60 border border-zinc-800">
                {routineDays.map((rd) => {
                  const isSelected = selectedRoutineDayId === rd.id;
                  const exCount = routineExercises.filter((re) => re.routine_day_id === rd.id).length;
                  return (
                    <button
                      key={rd.id}
                      type="button"
                      onClick={() => setSelectedRoutineDayId(rd.id!)}
                      className={`flex items-center justify-between p-2.5 text-left rounded-none border transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-2 border-red-600 bg-gradient-to-r from-red-950 to-black text-white font-bold shadow-[0_0_8px_rgba(220,38,38,0.25)]'
                          : 'border-zinc-800 bg-black hover:border-zinc-700 text-zinc-300'
                      }`}
                    >
                      <div className="min-w-0 pr-1">
                        <span className="text-xs font-bold block uppercase truncate">{rd.name}</span>
                        <span className="text-[10px] text-zinc-400">{exCount} ćwiczeń</span>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-red-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. SPOSÓB POWTARZANIA (BEZ NAWIASÓW) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
                2. Sposób powtarzania
              </label>

              {/* Przełącznik trybu - BEZ informacji w nawiasach */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('weekdays')}
                  className={`py-2 px-3 text-xs font-bold uppercase tracking-wider rounded-none border text-center transition-colors cursor-pointer ${
                    mode === 'weekdays'
                      ? 'border-2 border-red-600 bg-gradient-to-r from-red-950 to-zinc-950 text-white font-bold'
                      : 'border-zinc-800 bg-black text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  Dni tygodnia
                </button>

                <button
                  type="button"
                  onClick={() => setMode('interval')}
                  className={`py-2 px-3 text-xs font-bold uppercase tracking-wider rounded-none border text-center transition-colors cursor-pointer ${
                    mode === 'interval'
                      ? 'border-2 border-red-600 bg-gradient-to-r from-red-950 to-zinc-950 text-white font-bold'
                      : 'border-zinc-800 bg-black text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  Interwał
                </button>
              </div>

              {/* Konfiguracja trybu: Dni tygodnia (TYLKO przyciski dni, BEZ skrótów) */}
              {mode === 'weekdays' && (
                <div className="p-3 bg-black border border-zinc-800 space-y-2.5 animate-in fade-in duration-100">
                  <span className="text-[11px] text-zinc-400 block font-semibold">
                    Zaznacz dni treningowe w tygodniu:
                  </span>

                  {/* Przyciski dni tygodnia */}
                  <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                    {WEEKDAY_BUTTONS.map(({ dayIndex, label }) => {
                      const isSelected = selectedWeekdays.includes(dayIndex);
                      return (
                        <button
                          key={dayIndex}
                          type="button"
                          onClick={() => toggleWeekday(dayIndex)}
                          className={`h-9 min-w-0 w-full flex flex-col items-center justify-center rounded-none border text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'border-2 border-red-600 bg-red-950 text-white shadow-[0_0_8px_rgba(220,38,38,0.4)]'
                              : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                          }`}
                        >
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Konfiguracja trybu: Interwał (TYLKO stepper, BEZ gotowych przycisków "co x dni") */}
              {mode === 'interval' && (
                <div className="p-3 bg-black border border-zinc-800 space-y-3 animate-in fade-in duration-100">
                  <div className="flex items-center justify-between p-2 bg-zinc-950 border border-zinc-800">
                    <span className="text-xs text-zinc-300 font-bold uppercase">
                      Odstęp między treningami:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIntervalDays((prev) => Math.max(1, prev - 1))}
                        className="h-8 w-8 rounded-none border border-zinc-700 bg-black text-sm font-bold text-zinc-300 hover:text-white hover:border-red-600 flex items-center justify-center cursor-pointer"
                      >
                        -
                      </button>
                      <span className="text-sm font-bold text-red-500 w-20 text-center">
                        Co {intervalDays} {intervalDays === 1 ? 'dzień' : 'dni'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIntervalDays((prev) => Math.min(30, prev + 1))}
                        className="h-8 w-8 rounded-none border border-zinc-700 bg-black text-sm font-bold text-zinc-300 hover:text-white hover:border-red-600 flex items-center justify-center cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 3. ZAKRES DAT I HORYZONT (OPCJE: 4 TYG., 8 TYG., NIEOKREŚLONY) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
                3. Zakres czasowy
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-zinc-400 block mb-1 font-semibold uppercase">
                    Data rozpoczęcia:
                  </span>
                  <input
                    type="date"
                    value={startDateISO}
                    onChange={(e) => setStartDateISO(e.target.value)}
                    className="w-full bg-black border border-zinc-700 px-3 py-1.5 text-xs text-white focus:border-red-600 focus:outline-none"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-zinc-400 block mb-1 font-semibold uppercase">
                    Horyzont czasowy:
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => setDurationType('4')}
                      className={`py-1.5 text-[11px] font-bold uppercase rounded-none border text-center transition-colors cursor-pointer ${
                        durationType === '4'
                          ? 'border-red-600 bg-red-950 text-white'
                          : 'border-zinc-800 bg-black text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      4 tyg.
                    </button>
                    <button
                      type="button"
                      onClick={() => setDurationType('8')}
                      className={`py-1.5 text-[11px] font-bold uppercase rounded-none border text-center transition-colors cursor-pointer ${
                        durationType === '8'
                          ? 'border-red-600 bg-red-950 text-white'
                          : 'border-zinc-800 bg-black text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      8 tyg.
                    </button>
                    <button
                      type="button"
                      onClick={() => setDurationType('indefinite')}
                      className={`py-1.5 text-[11px] font-bold uppercase rounded-none border text-center transition-colors cursor-pointer ${
                        durationType === 'indefinite'
                          ? 'border-red-600 bg-red-950 text-white'
                          : 'border-zinc-800 bg-black text-zinc-400 hover:text-zinc-200'
                      }`}
                      title="Nieokreślony - generuje sesje na kolejne 6 miesięcy w przód"
                    >
                      Nieokreślony
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end pt-0.5">
                <span className="text-[10px] text-zinc-500 font-bold uppercase">
                  {durationType === 'indefinite' ? 'Generuje: 6 miesięcy w przód' : `Do: ${effectiveEndDateISO}`}
                </span>
              </div>
            </div>

            {/* 4. KONFLIKTY I BEZPIECZEŃSTWO */}
            <div className="p-3 bg-black/80 border border-zinc-800 space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={skipExistingPlanned}
                  onChange={(e) => setSkipExistingPlanned(e.target.checked)}
                  className="mt-0.5 accent-red-600 rounded-none h-4 w-4"
                />
                <div className="text-xs">
                  <span className="font-bold text-zinc-200 block">
                    Pomiń dni z już zaplanowanymi treningami
                  </span>
                  <span className="text-[10px] text-zinc-400 block">
                    Jeśli dany dzień ma już przypisany inny trening, nie zostanie nadpisany.
                  </span>
                </div>
              </label>

              <div className="pt-1 text-[10px] text-zinc-500 flex items-center gap-1.5 border-t border-zinc-900">
                <span className="text-emerald-500 font-bold">✓</span>
                <span>Ukończone treningi (wykonane serie) nigdy nie są nadpisywane.</span>
              </div>
            </div>

            {/* 5. PODGLĄD WYGENEROWANEGO CYKLU */}
            <div className="p-3 bg-gradient-to-b from-zinc-950 to-black border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5 text-red-500" />
                  <span>Wygenerowane sesje:</span>
                </span>
                <span className="text-xs font-bold text-red-500 bg-red-950/60 border border-red-800/80 px-2 py-0.5">
                  {generatedDates.length} {generatedDates.length === 1 ? 'trening' : 'treningów'}
                </span>
              </div>

              {generatedDates.length === 0 ? (
                <p className="text-[11px] text-zinc-400 italic">
                  Brak wygenerowanych dat. Wybierz co najmniej jeden dzień tygodnia.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto overflow-x-hidden touch-pan-y p-1 bg-zinc-950/80 border border-zinc-900">
                    {generatedDates.slice(0, 16).map((d) => {
                      const dateObj = parseISODate(d);
                      const dayName = POLISH_DAYS_SHORT[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1];
                      const parts = d.split('-');
                      const dayMonth = `${parts[2]}.${parts[1]}`;
                      const hasConflict = existingWorkoutMap.has(d);

                      return (
                        <span
                          key={d}
                          className={`text-[10px] px-1.5 py-0.5 border font-bold ${
                            hasConflict
                              ? 'bg-amber-950/40 border-amber-700/80 text-amber-200'
                              : 'bg-black border-zinc-800 text-zinc-300'
                          }`}
                          title={hasConflict ? 'W ten dzień istnieje już trening' : ''}
                        >
                          {dayName} {dayMonth}
                        </span>
                      );
                    })}
                    {generatedDates.length > 16 && (
                      <span className="text-[10px] px-1.5 py-0.5 text-zinc-500 font-bold self-center">
                        +{generatedDates.length - 16} więcej...
                      </span>
                    )}
                  </div>

                  {collisionStats.plannedCollisions > 0 && (
                    <p className="text-[10px] text-amber-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      <span>
                        {collisionStats.plannedCollisions} z tych dni ma już przypisany trening
                        {skipExistingPlanned ? ' (zostaną pominięte).' : ' (zostaną zaktualizowane).'}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 6. GŁÓWNY PRZYCISK ZAPISU CYKLU */}
            <div className="pt-1">
              <button
                type="button"
                disabled={isSubmitting || generatedDates.length === 0 || !selectedRoutineDayId}
                onClick={handleApplySchedule}
                style={{ clipPath: 'polygon(5% 0, 100% 0, 95% 100%, 0 100%)' }}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-50 text-white font-bold uppercase tracking-wider py-3 text-xs transition-colors cursor-pointer"
              >
                <Repeat className="h-4 w-4" />
                <span>
                  {isSubmitting
                    ? 'Zapisywanie w kalendarzu...'
                    : `ZAPLANUJ CYKL (${generatedDates.length} SESJI)`}
                </span>
              </button>
            </div>

            {/* 7. SEKCJA: AKTYWNE CYKLE TRENINGOWE (ZARZĄDZANIE I USUWANIE KONKRETNEGO CYKLU) */}
            <div className="pt-3 border-t-2 border-zinc-800 space-y-2.5">
              <div
                onClick={() => setShowActiveCyclesSection((prev) => !prev)}
                className="flex items-center justify-between cursor-pointer select-none py-1 group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider group-hover:text-white">
                    Aktywne cykle w kalendarzu
                  </span>
                  <span className="text-[10px] font-bold bg-black border border-zinc-700 px-2 py-0.5 text-red-400">
                    {activeCycles.length}
                  </span>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-zinc-400 group-hover:text-white transition-transform ${
                    showActiveCyclesSection ? 'rotate-180' : ''
                  }`}
                />
              </div>

              {showActiveCyclesSection && (
                <div className="space-y-2 animate-in fade-in duration-100">
                  {activeCycles.length === 0 ? (
                    <div className="p-3 text-center bg-black/60 border border-zinc-900 text-xs text-zinc-500">
                      Brak zarejestrowanych cykli w kalendarzu.
                    </div>
                  ) : (
                    activeCycles.map((cycle) => {
                      const isDeleting = deletingCycleId === cycle.id;
                      const weekdayNames =
                        cycle.mode === 'weekdays' && cycle.weekdays
                          ? cycle.weekdays
                              .map((w) => (w === 0 ? 'Nd' : POLISH_DAYS_SHORT[w - 1]))
                              .join(', ')
                          : null;

                      return (
                        <div
                          key={cycle.id}
                          className="p-3 bg-black border border-zinc-800 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-zinc-100 uppercase truncate">
                                {cycle.routine_day_name}
                              </span>
                              <span className="text-[9px] font-bold bg-red-950 border border-red-800 text-red-300 px-1.5 py-0.2 uppercase">
                                {cycle.mode === 'weekdays'
                                  ? `Dni: ${weekdayNames}`
                                  : `Co ${cycle.interval_days} dni`}
                              </span>
                            </div>
                            <span className="text-[10px] text-zinc-400 block mt-0.5">
                              Od {cycle.start_date} • Horyzont:{' '}
                              {cycle.duration_type === 'indefinite'
                                ? 'Nieokreślony'
                                : `${cycle.duration_type} tyg.`}
                            </span>
                          </div>

                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => handleDeleteSpecificCycle(cycle)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-950/80 border border-red-800 hover:bg-red-900 hover:text-white text-rose-300 text-xs font-bold uppercase tracking-wider cursor-pointer shrink-0"
                            title="Usuń ten konkretny cykl z kalendarza"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="text-[10px]">
                              {isDeleting ? 'Usuwanie...' : 'Usuń cykl'}
                            </span>
                          </button>
                        </div>
                      );
                    })
                  )}

                  {/* Opcja usunięcia pozostałych zaplanowanych sesji dla wybranego szablonu (np. starych) */}
                  {plannedSessionsForSelectedRoutineCount > 0 && (
                    <div className="p-2.5 bg-zinc-950 border border-zinc-900 flex items-center justify-between gap-2 mt-2">
                      <div className="text-[11px] text-zinc-400 min-w-0">
                        <span>Zaplanowane sesje dla </span>
                        <strong className="text-zinc-200">{selectedRoutineDay?.name}</strong>:
                        <span className="text-red-400 font-bold ml-1">
                          {plannedSessionsForSelectedRoutineCount}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={isCleaningLegacy}
                        onClick={handleClearLegacySessions}
                        className="px-2 py-1 bg-black border border-zinc-800 hover:border-red-900 text-[10px] font-bold text-zinc-400 hover:text-rose-400 uppercase tracking-wider cursor-pointer shrink-0"
                      >
                        {isCleaningLegacy ? 'Czyszczenie...' : 'Wyczyść wszystkie'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
