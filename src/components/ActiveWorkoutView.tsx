import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Trash2,
  Copy,
  Check,
  Dumbbell,
  RotateCcw,
  Pencil,
  X,
  Flame,
  Droplet,
  ChevronDown,
} from 'lucide-react';
import {
  db,
  getOrCreateWorkoutDay,
  addExtraExerciseToWorkoutDay,
  addLoggedSet,
  updateLoggedSet,
  deleteLoggedSet,
  removeTaskFromDay,
  getFullDayDetails,
  assignRoutineDayToDate,
  unassignRoutineDayFromDate,
  deleteWorkoutSessionByDate,
  findLastWorkoutSessionOfType,
  copyPreviousWorkoutSession,
  getHistoricalPRs,
  isSetNewPR,
  calculateEpley1RM,
  type FullDayDetails,
  type FullTaskDetails,
  type RoutineDay,
  type PreviousWorkoutSummary,
  type LoggedSet,
  type ExerciseHistoricalPR,
} from '../db/db';
import {
  getTodayISO,
  formatPolishFriendlyDate,
  POLISH_DAYS_SHORT,
  formatDateToISO,
} from '../utils/dateUtils';
import { AddExerciseModal } from './AddExerciseModal';
import { getCategoryIcon } from '../utils/categoryIcons';

const getSetsWord = (count: number) => {
  if (count === 1) return 'seria';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return 'serie';
  }
  return 'serii';
};

export const ActiveWorkoutView: React.FC = () => {
  const todayISO = getTodayISO();
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);
  const [isAddExtraOpen, setIsAddExtraOpen] = useState(false);
  const [isSelectPlanModalOpen, setIsSelectPlanModalOpen] = useState(false);
  const [isConfirmDeleteSession, setIsConfirmDeleteSession] = useState(false);
  const [isConfirmCopyPrevious, setIsConfirmCopyPrevious] = useState(false);
  const [copyFeedbackMsg, setCopyFeedbackMsg] = useState<string | null>(null);
  const [copyErrorMsg, setCopyErrorMsg] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsConfirmDeleteSession(false);
    setIsConfirmCopyPrevious(false);
    setCopyFeedbackMsg(null);
    setCopyErrorMsg(null);
  }, [selectedDate]);

  // Dni treningowe: 30 dni w przeszłość, dzień dzisiejszy w centrum i 30 dni w przyszłość
  const dateRange = React.useMemo(() => {
    const list: { dateISO: string; dayNumber: number; dayShort: string; isToday: boolean }[] = [];
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    // Zakres 30 dni wstecz i 30 dni naprzód (łącznie 61 dni, dzień dzisiejszy dokładnie w centrum)
    for (let offset = -30; offset <= 30; offset++) {
      const d = new Date(base);
      d.setDate(base.getDate() + offset);
      const iso = formatDateToISO(d);
      let dayIndex = d.getDay() - 1;
      if (dayIndex === -1) dayIndex = 6;

      list.push({
        dateISO: iso,
        dayNumber: d.getDate(),
        dayShort: POLISH_DAYS_SHORT[dayIndex],
        isToday: iso === todayISO,
      });
    }
    return list;
  }, [todayISO]);

  // Funkcja wyśrodkowująca dzień dzisiejszy w poziomym pasku
  const centerOnToday = React.useCallback((smooth = false) => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const todayEl = container.querySelector<HTMLElement>('[data-today="true"]');
    if (todayEl) {
      const containerWidth = container.clientWidth;
      const target = todayEl.offsetLeft - (containerWidth / 2) + (todayEl.offsetWidth / 2);
      if (smooth) {
        container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
      } else {
        container.scrollLeft = Math.max(0, target);
      }
    } else {
      container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
    }
  }, []);

  // Przewiń na start tak, aby dzień dzisiejszy był dokładnie po środku
  useEffect(() => {
    centerOnToday(false);
    const timer = setTimeout(() => {
      centerOnToday(false);
    }, 60);
    return () => clearTimeout(timer);
  }, [centerOnToday]);

  // Pobierz szablony dni z planu
  const routineDays: RoutineDay[] = useLiveQuery(async () => {
    return await db.routineDays.orderBy('day_number').toArray();
  }, []) ?? [];

  // Live query wszystkich zaplanowanych dni
  const allWorkoutDays = useLiveQuery(async () => {
    return await db.workoutDays.toArray();
  }, []) ?? [];

  const workoutDaysMap = new Map(allWorkoutDays.map((d) => [d.date, d]));

  // Live Query szczegółów dnia dla zaznaczonej daty (CZYSTY READ-ONLY BEZ EFEKTÓW UBOCZNYCH)
  const dayData: FullDayDetails | null | undefined = useLiveQuery(
    async () => {
      return await getFullDayDetails(selectedDate);
    },
    [selectedDate]
  );

  // Szukanie ostatniej zakończonej sesji tego samego rodzaju w historii
  const previousSessionSummary = useLiveQuery(async () => {
    if (!dayData?.routine_day_id && (!dayData?.routine_day_name || dayData.routine_day_name.trim() === '')) {
      return null;
    }
    return await findLastWorkoutSessionOfType(
      selectedDate,
      dayData?.routine_day_id,
      dayData?.routine_day_name
    );
  }, [selectedDate, dayData?.routine_day_id, dayData?.routine_day_name]);

  const handleCopyPreviousSession = async () => {
    if (!previousSessionSummary) {
      setCopyErrorMsg('Brak poprzednich treningów tego typu w historii.');
      setTimeout(() => setCopyErrorMsg(null), 3000);
      return;
    }

    try {
      const res = await copyPreviousWorkoutSession(selectedDate, previousSessionSummary.dayId);
      setIsConfirmCopyPrevious(false);
      setCopyFeedbackMsg(
        `Skopiowano ${res.tasksCopied} ćwiczeń i ${res.setsCopied} serii z treningu (${previousSessionSummary.date})!`
      );
      setTimeout(() => setCopyFeedbackMsg(null), 3500);
    } catch (err) {
      console.error('Błąd kopiowania sesji:', err);
    }
  };

  const handleSelectPlan = async (routineDayId: number) => {
    await assignRoutineDayToDate(selectedDate, routineDayId);
    setIsSelectPlanModalOpen(false);
  };

  const handleDeleteTask = async (taskId?: number) => {
    if (!taskId) return;
    await removeTaskFromDay(taskId);
  };

  const handleAddExtraExercise = async (exerciseId: number) => {
    let dayId = dayData?.id;
    if (!dayId) {
      const newDay = await getOrCreateWorkoutDay(selectedDate, 'in_progress');
      dayId = newDay.id!;
    }
    await addExtraExerciseToWorkoutDay(dayId, exerciseId, 0);
    setIsAddExtraOpen(false);
  };

  // Pobierz dotychczasowe rekordy sprzed wybranej daty sesji (lub ogólne w bazie)
  const priorPRs = useLiveQuery(async () => {
    return await getHistoricalPRs(selectedDate);
  }, [selectedDate]) ?? new Map<number, ExerciseHistoricalPR>();

  // Obliczanie rekordów (PR) osiągniętych w bieżącej sesji treningowej
  const sessionPRs = React.useMemo(() => {
    if (!dayData?.tasks) return [];
    const list: Array<{
      exerciseId: number;
      exerciseName: string;
      weight: number;
      reps: number;
      estimated1RM: number;
      priorWeight: number;
    }> = [];

    for (const task of dayData.tasks) {
      if (!task.exercise_id || task.sets.length === 0) continue;
      const prior = priorPRs.get(task.exercise_id);
      let topSet: LoggedSet | null = null;
      let topEst = 0;

      for (const s of task.sets) {
        if (isSetNewPR(s.weight, s.reps, prior)) {
          const est = calculateEpley1RM(s.weight, s.reps);
          if (!topSet || est > topEst || s.weight > topSet.weight) {
            topSet = s;
            topEst = est;
          }
        }
      }

      if (topSet) {
        list.push({
          exerciseId: task.exercise_id,
          exerciseName: task.exercise?.name ?? 'Ćwiczenie',
          weight: topSet.weight,
          reps: topSet.reps,
          estimated1RM: topEst,
          priorWeight: prior?.maxWeight ?? 0,
        });
      }
    }

    return list;
  }, [dayData, priorPRs]);

  const hasExercises = Boolean(dayData?.tasks && dayData.tasks.length > 0);
  const hasTemplate = Boolean(dayData?.routine_day_id || (dayData?.routine_day_name && dayData.routine_day_name.trim() !== ''));

  // Bazowa liczba zaplanowanych serii z szablonu planu (jeśli przypisano szablon do tego dnia)
  const templateTargetSets = useLiveQuery(async () => {
    if (!dayData?.routine_day_id) return 0;
    const routineExs = await db.routineExercises
      .where('routine_day_id')
      .equals(dayData.routine_day_id)
      .toArray();
    return routineExs.reduce((acc, re) => acc + (re.target_sets || 3), 0);
  }, [dayData?.routine_day_id]) ?? 0;

  // Śledzenie szczytowej liczby zaplanowanych serii w sesji, aby usunięcie wykonanego ćwiczenia
  // nie kurczyło mianownika i cofało pasek dokładnie o taką samą wartość procentową
  const [sessionPeakTargets, setSessionPeakTargets] = useState<Record<string, number>>({});

  // Zadania zaplanowane w ramach planu (ćwiczenia dodane poza planem nie wpływają na pasek postępu)
  const plannedTasks = React.useMemo(() => {
    return (dayData?.tasks ?? []).filter((t) => !t.is_extra);
  }, [dayData?.tasks]);

  const currentComputedTarget = React.useMemo(() => {
    return plannedTasks.reduce((acc, t) => {
      const planned = t.target_sets && t.target_sets > 0 ? t.target_sets : 3;
      return acc + Math.max(planned, t.sets?.length || 0);
    }, 0);
  }, [plannedTasks]);

  useEffect(() => {
    if (currentComputedTarget > 0) {
      setSessionPeakTargets((prev) => {
        const prevVal = prev[selectedDate] || 0;
        if (currentComputedTarget > prevVal) {
          return { ...prev, [selectedDate]: currentComputedTarget };
        }
        return prev;
      });
    }
  }, [selectedDate, currentComputedTarget]);

  // Obliczenie postępu treningu (wyłącznie serie z ćwiczeń w planie)
  const totalCompletedSets = plannedTasks.reduce((acc, t) => acc + (t.sets?.length || 0), 0);
  const baselineTarget = Math.max(
    templateTargetSets,
    sessionPeakTargets[selectedDate] || 0,
    currentComputedTarget
  );
  const totalTargetSets = baselineTarget;

  const progressPercent = totalTargetSets > 0 && totalCompletedSets > 0
    ? Math.min(100, Math.round((totalCompletedSets / totalTargetSets) * 100))
    : 0;

  return (
    <div className="space-y-4 max-w-xl mx-auto text-zinc-100 font-sans">
      {/* 1. HORYZONTALNIE PRZEWIJANY PASEK DAT (PRZESZŁOŚĆ, DZIŚ W CENTRUM, PRZYSZŁOŚĆ) */}
      <div className="rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-3.5 border-2 border-zinc-700/80 shadow-lg shadow-black/50">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-400">
              Dni treningowe
            </span>
            {selectedDate !== todayISO && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDate(todayISO);
                  centerOnToday(true);
                }}
                className="text-[10px] font-bold uppercase tracking-wider text-red-500 hover:text-red-400 bg-red-950/40 border border-red-900/60 px-2 py-0.5 cursor-pointer transition-colors"
                title="Wróć do dzisiejszego dnia"
              >
                Dziś
              </button>
            )}
          </div>
          <span className="text-xs font-bold text-red-500 tracking-wide">
            {formatPolishFriendlyDate(selectedDate)}
          </span>
        </div>
        <div
          ref={scrollRef}
          className="relative flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 px-0.5"
        >
          {dateRange.map((item) => {
            const isSelected = selectedDate === item.dateISO;
            const hasWorkout = Boolean(workoutDaysMap.get(item.dateISO)?.routine_day_name);

            return (
              <button
                key={item.dateISO}
                data-today={item.isToday ? 'true' : undefined}
                type="button"
                onClick={() => setSelectedDate(item.dateISO)}
                className={`relative flex flex-col items-center justify-center min-w-[52px] h-[66px] rounded-none transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-b from-red-950 via-zinc-950 to-black text-white font-bold border-2 border-red-600 shadow-[0_0_12px_rgba(220,38,38,0.35)]'
                    : item.isToday
                    ? 'bg-gradient-to-b from-zinc-900 to-black text-red-500 font-bold border-2 border-red-800'
                    : 'bg-gradient-to-b from-zinc-900/60 to-black text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600'
                }`}
              >
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  {item.dayShort}
                </span>
                <span className="text-base font-bold mt-0.5">
                  {item.dayNumber}
                </span>

                {/* Wskaźnik przypisanego treningu */}
                <div className="mt-1 h-1.5 w-1.5 rounded-none">
                  {hasWorkout && (
                    <div
                      className={`h-1.5 w-1.5 rounded-none ${
                        isSelected ? 'bg-red-500' : 'bg-red-600'
                      }`}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1.5. ZBIORNIK KRWI - POSTĘP SESJI TRENINGOWEJ */}
      <div className="rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-3 sm:p-3.5 border-2 border-zinc-700/80 shadow-lg shadow-black/50">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <Droplet
              className={`h-3.5 w-3.5 transition-colors ${
                progressPercent > 0
                  ? 'text-red-500 fill-red-600 animate-pulse'
                  : 'text-zinc-500 fill-zinc-700'
              }`}
            />
            <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Postęp treningu
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {totalTargetSets > 0 ? (
              <>
                <span className="text-zinc-400 font-mono text-[11px]">
                  {totalCompletedSets}/{totalTargetSets} {getSetsWord(totalTargetSets)}
                </span>
                <span
                  className={`font-bold font-mono tracking-wide ${
                    progressPercent === 100
                      ? 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]'
                      : 'text-red-500'
                  }`}
                >
                  {progressPercent}%
                </span>
              </>
            ) : (
              <span className="text-zinc-500 text-[11px]">
                Brak zaplanowanych serii
              </span>
            )}
          </div>
        </div>

        {/* Szklany zbiornik / fiolka napełniająca się krwią */}
        <div className="relative w-full h-3.5 bg-black/90 border border-zinc-700/90 overflow-hidden shadow-[inset_0_2px_5px_rgba(0,0,0,0.95)]">
          {/* Krew napełniająca zbiornik */}
          <div
            className="h-full bg-gradient-to-r from-red-950 via-red-700 to-red-600 transition-all duration-700 ease-out relative shadow-[0_0_12px_rgba(220,38,38,0.6)]"
            style={{ width: `${progressPercent}%` }}
          >
            {/* Lśniący brzeg płynu (menisk krwi) */}
            {progressPercent > 0 && (
              <div className="absolute right-0 top-0 bottom-0 w-2 bg-gradient-to-r from-transparent to-red-300 opacity-90 shadow-[0_0_10px_rgba(254,202,202,0.9)]" />
            )}
            {/* Połysk światła na szklanej powierzchni cieczy */}
            <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          </div>
        </div>
      </div>

      {/* 2. NAGŁÓWEK SESJI */}
      <div className="rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-4 sm:p-5 border-2 border-zinc-700/80 shadow-lg shadow-black/50">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-gradient-to-r from-red-600 to-red-800"></div>
            <span className="text-xs font-bold text-red-500 tracking-wide">
              {formatPolishFriendlyDate(selectedDate)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-wider uppercase">
              {dayData?.routine_day_name || 'Trening dzienny'}
            </h2>
            {(dayData?.routine_day_name || (dayData?.tasks && dayData.tasks.length > 0)) && (
              isConfirmDeleteSession ? (
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-xs text-zinc-300">Usunąć trening?</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteWorkoutSessionByDate(selectedDate);
                      setSessionPeakTargets((prev) => {
                        const next = { ...prev };
                        delete next[selectedDate];
                        return next;
                      });
                      setIsConfirmDeleteSession(false);
                    }}
                    className="rounded-none bg-red-700 hover:bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white uppercase cursor-pointer"
                  >
                    Tak, usuń
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmDeleteSession(false)}
                    className="rounded-none bg-black border border-zinc-800 px-2 py-0.5 text-xs text-zinc-400 hover:text-white cursor-pointer"
                  >
                    Anuluj
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirmDeleteSession(true)}
                  className="text-red-500 hover:text-red-400 font-bold uppercase text-xs border-b border-red-900 pb-0.5 ml-4 cursor-pointer tracking-wider"
                  title="Usuń ten trening z bazy i historii"
                >
                  Usuń trening
                </button>
              )
            )}
          </div>
        </div>

        {/* Pasek akcji: Kopiowanie z poprzedniego treningu - tylko po wybraniu szablonu */}
        {hasTemplate && (
          <div className="mt-3 pt-3 border-t-2 border-zinc-800 space-y-2">
            {previousSessionSummary ? (
              isConfirmCopyPrevious ? (
                <div className="flex flex-col sm:flex-row items-center justify-center text-center gap-2.5 p-2.5 bg-black border border-red-800 w-full animate-in fade-in duration-150">
                  <span className="text-xs text-zinc-300">
                    Zastąpić dotychczasowe serie danymi z ostatniego treningu ({previousSessionSummary.date})?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyPreviousSession}
                      className="rounded-none bg-red-700 hover:bg-red-600 px-3 py-1 text-xs font-bold text-white uppercase cursor-pointer"
                    >
                      Tak, wczytaj
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConfirmCopyPrevious(false)}
                      className="rounded-none bg-black border border-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:text-white cursor-pointer"
                    >
                      Anuluj
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center w-full">
                  <button
                    type="button"
                    onClick={() => {
                      if (dayData?.totalSets && dayData.totalSets > 0) {
                        setIsConfirmCopyPrevious(true);
                      } else {
                        handleCopyPreviousSession();
                      }
                    }}
                    style={{ clipPath: 'polygon(4% 0, 100% 0, 96% 100%, 0 100%)' }}
                    className="inline-flex items-center justify-center gap-2 rounded-none bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold uppercase tracking-wider px-4 py-2 text-xs transition-colors cursor-pointer shadow-none"
                    title={`Wczytaj ostatni trening z dnia ${previousSessionSummary.date}`}
                  >
                    <RotateCcw className="h-3.5 w-3.5 stroke-[2.3]" />
                    <span>Skopiuj z poprzedniego razu</span>
                    <span className="text-[10px] text-red-200 opacity-90 font-normal">
                      ({previousSessionSummary.date})
                    </span>
                  </button>
                </div>
              )
            ) : (
              <div className="flex items-center justify-center w-full">
                <button
                  type="button"
                  onClick={() => {
                    setCopyErrorMsg('Brak poprzednich treningów tego typu w historii.');
                    setTimeout(() => setCopyErrorMsg(null), 3000);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-none bg-zinc-900 border border-zinc-800 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-400 cursor-pointer transition-colors"
                  title="Brak poprzednich treningów tego typu"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-zinc-600" />
                  <span>Skopiuj z poprzedniego razu</span>
                </button>
              </div>
            )}

            {copyFeedbackMsg && (
              <div className="text-xs font-semibold text-emerald-400 pt-1 text-center animate-in fade-in">
                {copyFeedbackMsg}
              </div>
            )}
            {copyErrorMsg && (
              <div className="text-xs font-semibold text-amber-400 pt-1 text-center animate-in fade-in">
                {copyErrorMsg}
              </div>
            )}
          </div>
        )}

        {/* Jeśli brak przypisanego planu na ten dzień */}
        {!hasExercises && (
          <div className="mt-3 pt-3 border-t border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="text-xs text-zinc-400">
              Brak zaplanowanego treningu na ten dzień.
            </span>
            <button
              onClick={() => setIsSelectPlanModalOpen(true)}
              style={{ clipPath: 'polygon(5% 0, 100% 0, 95% 100%, 0 100%)' }}
              className="inline-flex items-center justify-center gap-1.5 rounded-none bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold uppercase tracking-wider px-4 py-2 text-xs transition-colors cursor-pointer shadow-none"
            >
              <Dumbbell className="h-3.5 w-3.5" />
              <span>Wybierz plan</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. LISTA ĆWICZEŃ */}
      <div className="space-y-3">
        {hasExercises &&
          dayData?.tasks.map((task, index) => (
            <ExerciseSessionCard
              key={task.id}
              task={task}
              index={index}
              priorPR={task.exercise_id ? priorPRs.get(task.exercise_id) : undefined}
              onDeleteExercise={() => handleDeleteTask(task.id)}
            />
          ))}

        {/* 4. PRZYCISK: DODAJ ĆWICZENIE POZA PLANEM */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setIsAddExtraOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-none border-2 border-dashed border-zinc-800 bg-gradient-to-b from-zinc-950 to-black py-3.5 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:border-red-700 hover:text-white transition-colors cursor-pointer"
          >
            <span className="text-base font-bold text-red-500 leading-none">+</span>
            <span>Dodaj ćwiczenie poza planem</span>
          </button>
        </div>

        {/* 5. PODSUMOWANIE SESJI TRENINGOWEJ (Z LISTĄ NOWYCH REKORDÓW) */}
        {dayData && dayData.tasks.some((t) => t.sets.length > 0) && (
          <div className="mt-4 rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-4 sm:p-5 border-2 border-zinc-700/80 shadow-lg shadow-black/50 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b-2 border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-gradient-to-r from-red-600 to-red-800"></div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-sans">
                  Podsumowanie treningu
                </h3>
              </div>
              <span className="text-xs text-zinc-400 font-sans">
                {formatPolishFriendlyDate(selectedDate)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
              <div className="bg-black/60 border border-zinc-800 p-2.5">
                <span className="block text-[10px] text-zinc-400 uppercase font-bold">Łączny tonaż</span>
                <span className="text-base font-bold text-white font-sans">{dayData.totalTonnage} kg</span>
              </div>
              <div className="bg-black/60 border border-zinc-800 p-2.5">
                <span className="block text-[10px] text-zinc-400 uppercase font-bold">Zrobione serie</span>
                <span className="text-base font-bold text-white font-sans">{dayData.totalSets}</span>
              </div>
              <div className="bg-black/60 border border-zinc-800 p-2.5 col-span-2 sm:col-span-1">
                <span className="block text-[10px] text-zinc-400 uppercase font-bold">Nowe PR</span>
                <span className="text-base font-bold text-red-500 font-sans flex items-center justify-center gap-1">
                  <Flame className="h-4 w-4 fill-red-600 text-red-600 inline" />
                  {sessionPRs.length}
                </span>
              </div>
            </div>

            {sessionPRs.length > 0 && (
              <div className="mt-3 pt-3 border-t-2 border-zinc-800 space-y-2">
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider block font-sans">
                  Ustanowione PR w tej sesji:
                </span>
                <div className="space-y-1.5">
                  {sessionPRs.map((sr) => (
                    <div
                      key={sr.exerciseId}
                      className="flex flex-wrap items-center justify-between bg-black/80 border border-red-900/60 p-2.5 gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <Flame className="h-4 w-4 fill-red-600 text-red-600 shrink-0" />
                        <span className="text-xs font-bold text-white uppercase font-sans">
                          {sr.exerciseName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-red-500 font-sans">
                          {sr.weight} kg × {sr.reps}
                        </span>
                        {sr.estimated1RM > 0 && (
                          <span className="text-[10px] text-zinc-400 font-sans">
                            (1RM: {sr.estimated1RM} kg)
                          </span>
                        )}
                        <span className="rounded-none bg-red-950 border border-red-700 px-1.5 py-0.5 text-[9px] font-bold text-red-400 font-sans">
                          Nowy PR!
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Wybierz plan z listy */}
      {isSelectPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/90 animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-none border-2 border-zinc-700 bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b-2 border-zinc-800">
              <div>
                <span className="text-xs font-semibold text-red-500 uppercase tracking-wider">
                  Wybór planu treningowego
                </span>
                <h3 className="text-base font-bold text-white tracking-wider uppercase">
                  Wybierz plan ({formatPolishFriendlyDate(selectedDate)})
                </h3>
              </div>
              <button
                onClick={() => setIsSelectPlanModalOpen(false)}
                className="rounded-none border border-zinc-800 bg-black p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {routineDays.length === 0 ? (
                <p className="text-xs text-zinc-400 py-4 text-center">
                  Brak dni treningowych w bazie. Utwórz najpierw dzień w harmonogramie.
                </p>
              ) : (
                routineDays.map((rd) => (
                  <button
                    key={rd.id}
                    type="button"
                    onClick={() => handleSelectPlan(rd.id!)}
                    className="flex w-full items-center justify-between p-3.5 rounded-none border border-zinc-800 bg-black hover:border-red-700 text-left transition-colors cursor-pointer"
                  >
                    <div>
                      <span className="text-xs font-bold text-white uppercase">
                        {rd.name}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-red-500 uppercase">
                      Załaduj →
                    </span>
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => setIsSelectPlanModalOpen(false)}
              className="w-full rounded-none border border-zinc-800 bg-black py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:bg-zinc-900 cursor-pointer"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}

      {/* Modal: Dodaj ćwiczenie poza planem */}
      <AddExerciseModal
        isOpen={isAddExtraOpen}
        onClose={() => setIsAddExtraOpen(false)}
        onSelectExercise={handleAddExtraExercise}
        existingExerciseIds={dayData?.tasks.map((t) => t.exercise_id)}
      />
    </div>
  );
};

// --- Komponent ćwiczenia (UKRYTY 1RM, TYLKO WAGA, POWTÓRZENIA, RIR I CHECKBOX) ---
interface ExerciseSessionCardProps {
  task: FullTaskDetails;
  index: number;
  priorPR?: ExerciseHistoricalPR | null;
  onDeleteExercise: () => void;
}

const ExerciseSessionCard: React.FC<ExerciseSessionCardProps> = ({
  task,
  index,
  priorPR,
  onDeleteExercise,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [weightInput, setWeightInput] = useState<string>('60');
  const [repsInput, setRepsInput] = useState<string>('8');
  const [rirInput, setRirInput] = useState<number>(2);

  // Stan chwilowego, nieinwazyjnego powiadomienia o nowym PR pod ćwiczeniem
  const [prCelebration, setPrCelebration] = useState<{
    weight: number;
    reps: number;
    estimated1RM: number;
  } | null>(null);

  useEffect(() => {
    if (prCelebration) {
      const timer = setTimeout(() => {
        setPrCelebration(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [prCelebration]);

  // Edycja pojedynczej serii
  const [editingSetId, setEditingSetId] = useState<number | null>(null);
  const [editWeight, setEditWeight] = useState<string>('');
  const [editReps, setEditReps] = useState<string>('');
  const [editRir, setEditRir] = useState<number>(2);

  const handleStartEditSet = (set: LoggedSet) => {
    setEditingSetId(set.id ?? null);
    setEditWeight(String(set.weight));
    setEditReps(String(set.reps));
    setEditRir(set.rir);
  };

  const handleSaveEditSet = async (setId: number) => {
    const w = parseFloat(editWeight);
    const r = parseInt(editReps, 10);
    if (isNaN(w) || isNaN(r) || w < 0 || r <= 0) return;
    await updateLoggedSet(setId, { weight: w, reps: r, rir: editRir });
    setEditingSetId(null);
  };

  // Prefill next set with values from previous set if available
  const lastSet = task.sets[task.sets.length - 1];
  const lastSetId = lastSet?.id;

  useEffect(() => {
    if (lastSet) {
      setWeightInput(String(lastSet.weight));
      setRepsInput(String(lastSet.reps));
      setRirInput(lastSet.rir);
    }
  }, [lastSetId]);

  const parsedWeight = parseFloat(weightInput) || 0;
  const parsedReps = parseInt(repsInput, 10) || 0;

  const targetSets = task.target_sets || 0;
  const loggedSetsCount = task.sets.length;
  const remainingSets = Math.max(0, targetSets - loggedSetsCount);

  // Dotychczasowy rekord dla tego ćwiczenia (z historii oraz wcześniejszych serii w tej sesji)
  const currentMaxSession = React.useMemo(() => {
    let maxWeight = priorPR?.maxWeight ?? 0;
    let max1RM = priorPR?.max1RM ?? 0;
    for (const s of task.sets) {
      if (s.weight > maxWeight) maxWeight = s.weight;
      const est = calculateEpley1RM(s.weight, s.reps);
      if (est > max1RM) max1RM = est;
    }
    return { maxWeight, max1RM };
  }, [task.sets, priorPR]);

  // Wyznacz serie, które były rekordem w momencie ich wykonania
  const setPRMap = React.useMemo(() => {
    const isPR = new Set<number>();
    let maxW = priorPR?.maxWeight ?? 0;
    let max1RM = priorPR?.max1RM ?? 0;

    for (const s of task.sets) {
      if (!s.id || s.weight <= 0) continue;
      const est = calculateEpley1RM(s.weight, s.reps);
      const isRecord =
        (priorPR?.maxWeight === 0 && priorPR?.max1RM === 0 && maxW === 0 && max1RM === 0) ||
        s.weight > maxW ||
        est > max1RM;

      if (isRecord) {
        isPR.add(s.id);
        if (s.weight > maxW) maxW = s.weight;
        if (est > max1RM) max1RM = est;
      }
    }
    return isPR;
  }, [task.sets, priorPR]);

  const typingEst1RM = parsedWeight > 0 && parsedReps > 0 ? calculateEpley1RM(parsedWeight, parsedReps) : 0;
  const isTypingPR =
    parsedWeight > 0 &&
    parsedReps > 0 &&
    (currentMaxSession.maxWeight > 0 || currentMaxSession.max1RM > 0) &&
    (parsedWeight > currentMaxSession.maxWeight || typingEst1RM > currentMaxSession.max1RM);

  const handleAddSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.id) return;
    if (parsedWeight < 0 || parsedReps <= 0) return;

    const willBePR =
      (currentMaxSession.maxWeight > 0 || currentMaxSession.max1RM > 0) &&
      (parsedWeight > currentMaxSession.maxWeight || typingEst1RM > currentMaxSession.max1RM);

    await addLoggedSet(task.id, parsedWeight, parsedReps, rirInput);

    if (willBePR) {
      setPrCelebration({
        weight: parsedWeight,
        reps: parsedReps,
        estimated1RM: typingEst1RM,
      });
    }
  };

  const handleCopyLastSet = async () => {
    if (!task.id || task.sets.length === 0) return;
    const last = task.sets[task.sets.length - 1];
    setWeightInput(String(last.weight));
    setRepsInput(String(last.reps));
    setRirInput(last.rir);
    await addLoggedSet(task.id, last.weight, last.reps, last.rir);
    setIsExpanded(true);
  };

  const handleDeleteSet = async (setId?: number) => {
    if (!setId) return;
    await deleteLoggedSet(setId);
  };

  const CategoryIcon = getCategoryIcon(task.exercise?.muscle_group);

  return (
    <div className={`rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-4 sm:p-5 border-2 border-zinc-700/80 shadow-lg shadow-black/50 ${isExpanded ? 'space-y-3' : ''}`}>
      {/* Nagłówek ćwiczenia z licznikiem serii - klikalny do zwijania / rozwijania */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 cursor-pointer select-none transition-colors group ${
          isExpanded ? 'pb-3 border-b-2 border-zinc-800' : 'pb-0'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-none bg-black border border-zinc-800 shrink-0 overflow-hidden">
            <CategoryIcon className="w-6 h-6 object-contain opacity-85" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-zinc-500">
                #{index + 1}
              </span>
              <h4 className="text-sm font-bold text-white tracking-wide uppercase group-hover:text-red-400 transition-colors">
                {task.exercise?.name ?? 'Ćwiczenie'}
              </h4>
            </div>

            {/* Dotychczasowy rekord ćwiczenia */}
            {priorPR && priorPR.maxWeight > 0 ? (
              <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-400 font-sans">
                <span>Dotychczasowy rekord:</span>
                <span className="font-bold text-zinc-200">{priorPR.maxWeight} kg</span>
                {priorPR.max1RM > 0 && (
                  <span className="text-zinc-500 font-normal">({priorPR.max1RM} kg 1RM)</span>
                )}
              </div>
            ) : null}

            {/* Licznik serii - jednolity rozmiar, kolor i czcionka */}
            <div className="mt-1 flex items-center gap-2">
              {!task.is_extra ? (
                remainingSets > 0 ? (
                  <span className="inline-flex items-center rounded-none bg-black border border-zinc-800 px-2 py-0.5 text-xs text-zinc-300 font-sans">
                    Pozostało: {remainingSets} z {targetSets} serii
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-none bg-red-950 border border-red-700 px-2 py-0.5 text-xs font-bold text-red-300 font-sans">
                    <Check className="h-3 w-3 stroke-[2.5]" />
                    Ukończono ({targetSets}/{targetSets} serii)
                  </span>
                )
              ) : null}
              {task.sets.length > 0 ? (
                <span className="inline-flex items-center rounded-none bg-black border border-zinc-800 px-2 py-0.5 text-xs text-zinc-300 font-sans">
                  Wykonano: {task.sets.length} {getSetsWord(task.sets.length)}
                </span>
              ) : task.is_extra ? (
                <span className="inline-flex items-center rounded-none bg-black border border-zinc-800 px-2 py-0.5 text-xs text-zinc-400 font-sans">
                  0 wykonanych serii
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Akcje ćwiczenia: POZA PLANEM / Kopiuj serię / Usuń ćwiczenie / Zwiń-Rozwiń */}
        <div className="flex items-center gap-2 self-end sm:self-auto" onClick={(e) => e.stopPropagation()}>
          {task.is_extra && (
            <span className="flex items-center justify-center h-7 px-2.5 rounded-none bg-red-950/80 border border-red-800 text-[10px] font-bold text-red-300 uppercase tracking-wider">
              POZA PLANEM
            </span>
          )}
          {task.sets.length > 0 && (
            <button
              type="button"
              onClick={handleCopyLastSet}
              className="flex items-center gap-1 h-7 rounded-none bg-black border border-zinc-800 px-2.5 text-xs font-bold text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors cursor-pointer"
              title="Powtórz parametry ostatniej serii"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>Powtórz</span>
            </button>
          )}
          <button
            type="button"
            onClick={onDeleteExercise}
            className="flex items-center gap-1 h-7 rounded-none border border-zinc-800 bg-black px-2.5 text-xs font-bold text-zinc-400 hover:border-red-900 hover:text-rose-400 transition-colors cursor-pointer"
            title="Usuń to ćwiczenie z tego dnia treningowego"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Usuń</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="flex items-center justify-center h-7 w-7 rounded-none border border-zinc-800 bg-black text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
            title={isExpanded ? 'Zwiń ćwiczenie' : 'Rozwiń ćwiczenie'}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                isExpanded ? 'transform rotate-180 text-red-500' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Rozwijana zawartość ćwiczenia: lista serii oraz formularz nowej serii */}
      {isExpanded && (
        <div className="space-y-3 animate-in fade-in duration-150">
          {/* Chwilowe, animowane powiadomienie o nowym PR po zapisaniu serii */}
          {prCelebration && (
            <div className="flex items-center gap-2 p-2.5 bg-gradient-to-r from-red-950/80 via-zinc-950 to-black border border-red-700/80 text-xs font-bold text-red-400 animate-in fade-in slide-in-from-top-1 duration-200 font-sans shadow-md">
              <Flame className="h-4 w-4 fill-red-600 text-red-600 shrink-0 animate-pulse" />
              <span>
                Nowy PR! {prCelebration.weight} kg × {prCelebration.reps} powt.
                {prCelebration.estimated1RM > 0 && (
                  <span className="text-zinc-300 font-normal ml-1">
                    (szac. 1RM: {prCelebration.estimated1RM} kg)
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Tabela zarejestrowanych serii (CZYSTY INTERFEJS: TYLKO WAGA, POWTÓRZENIA, RIR I CHECKBOX) */}
          {task.sets.length > 0 && (
            <div className="mt-3 divide-y-2 divide-zinc-900 text-xs">
          {task.sets.map((set, setIdx) => {
            const isSetPR = set.id ? setPRMap.has(set.id) : false;

            if (editingSetId === set.id) {
              return (
                <div
                  key={set.id}
                  className="flex flex-wrap items-center justify-between py-2 px-2 bg-black border border-red-700/80 rounded-none gap-2 my-1 animate-in fade-in duration-100"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-sans text-[11px] font-bold text-red-500 w-4">
                      #{setIdx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={editWeight}
                        onChange={(e) => setEditWeight(e.target.value)}
                        className="w-16 rounded-none bg-black border border-zinc-700 px-1.5 py-0.5 text-xs text-white focus:border-red-600 focus:outline-none"
                      />
                      <span className="text-[10px] text-zinc-400">kg</span>
                    </div>
                    <span className="text-zinc-600">×</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        value={editReps}
                        onChange={(e) => setEditReps(e.target.value)}
                        className="w-12 rounded-none bg-black border border-zinc-700 px-1.5 py-0.5 text-xs text-white focus:border-red-600 focus:outline-none"
                      />
                      <span className="text-[10px] text-zinc-400">powt.</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <select
                        value={editRir}
                        onChange={(e) => setEditRir(Number(e.target.value))}
                        className="rounded-none bg-black border border-zinc-700 px-1 py-0.5 text-xs text-white focus:border-red-600 focus:outline-none"
                      >
                        <option value={0}>RIR 0</option>
                        <option value={1}>RIR 1</option>
                        <option value={2}>RIR 2</option>
                        <option value={3}>RIR 3</option>
                        <option value={4}>RIR 4</option>
                        <option value={5}>RIR 5</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      type="button"
                      onClick={() => handleSaveEditSet(set.id!)}
                      className="rounded-none bg-red-700 hover:bg-red-600 p-1 text-white cursor-pointer"
                      title="Zapisz"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSetId(null)}
                      className="rounded-none bg-black border border-zinc-800 p-1 text-zinc-400 hover:text-white cursor-pointer"
                      title="Anuluj"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={set.id}
                className="flex items-center justify-between py-2 px-1 hover:bg-zinc-900/60 rounded-none transition-colors"
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Checkbox odhaczonej serii */}
                  <div className="flex h-5 w-5 items-center justify-center rounded-none bg-red-950 border border-red-800 text-red-400">
                    <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                  </div>
                  <span className="font-sans text-[11px] font-bold text-zinc-500 w-4">
                    #{setIdx + 1}
                  </span>
                  <span className="font-bold text-white font-sans">{set.weight} kg</span>
                  <span className="text-zinc-400 font-sans">× {set.reps}</span>
                  {isSetPR && (
                    <span className="inline-flex items-center gap-1 rounded-none bg-red-950/80 border border-red-700/80 px-1.5 py-0.5 text-[10px] font-bold text-red-400 font-sans">
                      <Flame className="h-3 w-3 fill-red-600 text-red-600 shrink-0" />
                      <span>PR</span>
                    </span>
                  )}
                  <span className="font-sans">
                    <RirPill rir={set.rir} />
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleStartEditSet(set)}
                    className="text-zinc-500 hover:text-zinc-200 transition-colors p-1 cursor-pointer rounded-none"
                    title="Edytuj serię"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSet(set.id)}
                    className="text-zinc-500 hover:text-rose-400 transition-colors p-1 cursor-pointer rounded-none"
                    title="Usuń serię"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Formularz wprowadzania nowej serii (Ciężar, Powtórzenia, RIR) */}
      <form
        onSubmit={handleAddSet}
        className="mt-3 rounded-none bg-gradient-to-b from-zinc-950 to-black p-3.5 border-2 border-zinc-800 space-y-2.5"
      >
        <div className="grid grid-cols-3 gap-2">
          {/* Ciężar */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
              Ciężar (kg)
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              className="mt-1 w-full rounded-none border border-zinc-700 bg-black px-2.5 py-1.5 text-xs font-medium text-white focus:border-red-600 focus:outline-none"
            />
          </div>

          {/* Powtórzenia */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
              Powtórzenia
            </label>
            <input
              type="number"
              min="1"
              value={repsInput}
              onChange={(e) => setRepsInput(e.target.value)}
              className="mt-1 w-full rounded-none border border-zinc-700 bg-black px-2.5 py-1.5 text-xs font-medium text-white focus:border-red-600 focus:outline-none"
            />
          </div>

          {/* RIR (0-5) */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
              RIR (0-5)
            </label>
            <select
              value={rirInput}
              onChange={(e) => setRirInput(Number(e.target.value))}
              className="mt-1 w-full rounded-none border border-zinc-700 bg-black px-2 py-1.5 text-xs font-medium text-white focus:border-red-600 focus:outline-none"
            >
              <option value={0}>0 (Upadek)</option>
              <option value={1}>1 (Zapas 1)</option>
              <option value={2}>2 (Zapas 2)</option>
              <option value={3}>3 (Zapas 3)</option>
              <option value={4}>4 (Zapas 4)</option>
              <option value={5}>5 (Rozgrzewka)</option>
            </select>
          </div>
        </div>

        {/* Wykrywanie nowego rekordu w czasie rzeczywistym podczas wpisywania */}
        {isTypingPR && (
          <div className="flex items-center gap-2 p-2 bg-red-950/60 border border-red-700/80 animate-in fade-in duration-150">
            <Flame className="h-4 w-4 fill-red-600 text-red-600 shrink-0 animate-pulse" />
            <div className="text-xs font-bold text-red-400 font-sans tracking-wide">
              <span>Nowy PR! {parsedWeight} kg × {parsedReps} powt.</span>
              {typingEst1RM > 0 && (
                <span className="text-zinc-300 font-normal ml-1">
                  (szac. 1RM: {typingEst1RM} kg)
                </span>
              )}
              {currentMaxSession.maxWeight > 0 && (
                <span className="text-zinc-400 font-normal text-[10px] ml-1.5">
                  Dotychczasowy: {currentMaxSession.maxWeight} kg
                </span>
              )}
            </div>
          </div>
        )}

        {/* Przycisk Zapisz serię */}
        <div className="flex items-center justify-end pt-1">
          <button
            type="submit"
            style={{ clipPath: 'polygon(5% 0, 100% 0, 95% 100%, 0 100%)' }}
            className="rounded-none bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold uppercase tracking-wider px-4 py-1.5 text-xs transition-colors cursor-pointer"
          >
            + Dodaj serię
          </button>
        </div>
      </form>
        </div>
      )}
    </div>
  );
};

const RirPill: React.FC<{ rir: number }> = ({ rir }) => {
  if (rir === 0) {
    return (
      <span className="rounded-none bg-rose-950 border border-rose-600 text-rose-300 px-1.5 py-0.5 text-[9px] font-bold">
        RIR 0
      </span>
    );
  }
  if (rir <= 2) {
    return (
      <span className="rounded-none bg-amber-950 border border-amber-600 text-amber-300 px-1.5 py-0.5 text-[9px] font-bold">
        RIR {rir}
      </span>
    );
  }
  return (
    <span className="rounded-none bg-black border border-zinc-700 text-zinc-400 px-1.5 py-0.5 text-[9px] font-medium">
      RIR {rir}
    </span>
  );
};
