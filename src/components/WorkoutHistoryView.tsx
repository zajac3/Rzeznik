import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, Dumbbell, Calendar, Layers, Trash2, Flame } from 'lucide-react';
import {
  db,
  type PlannedTask,
  type LoggedSet,
  deleteWorkoutSessionById,
  getHistoricalPRs,
  type ExerciseHistoricalPR,
} from '../db/db';
import { getCategoryIconElement } from '../utils/categoryIcons';
import { formatPolishFriendlyDate } from '../utils/dateUtils';

function formatDisplayDate(isoString: string): string {
  try {
    const parts = isoString.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return isoString;
  } catch {
    return isoString;
  }
}

const RirBadge: React.FC<{ rir: number }> = ({ rir }) => {
  if (rir === 0) {
    return (
      <span className="rounded-none bg-rose-950 border border-rose-600 text-rose-300 px-2 py-0.5 text-[10px] font-bold">
        RIR 0 (Upadek)
      </span>
    );
  }
  if (rir <= 2) {
    return (
      <span className="rounded-none bg-amber-950 border border-amber-600 text-amber-300 px-2 py-0.5 text-[10px] font-bold">
        RIR {rir}
      </span>
    );
  }
  return (
    <span className="rounded-none bg-black border border-zinc-700 text-zinc-400 px-2 py-0.5 text-[10px] font-medium">
      RIR {rir}
    </span>
  );
};

export const WorkoutHistoryView: React.FC = () => {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const handleDeleteSession = async (sessionId: number) => {
    await deleteWorkoutSessionById(sessionId);
    setConfirmDeleteId(null);
  };

  const sessions = useLiveQuery(async () => {
    const days = await db.workoutDays.toArray();
    const tasks = await db.plannedTasks.toArray();
    const sets = await db.loggedSets.toArray();
    const exercises = await db.exercises.toArray();

    const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

    // Grupuj zadania po day_id
    const tasksByDay = new Map<number, PlannedTask[]>();
    for (const t of tasks) {
      const list = tasksByDay.get(t.day_id) || [];
      list.push(t);
      tasksByDay.set(t.day_id, list);
    }

    // Grupuj serie po task_id
    const setsByTask = new Map<number, LoggedSet[]>();
    for (const s of sets) {
      const list = setsByTask.get(s.task_id) || [];
      list.push(s);
      setsByTask.set(s.task_id, list);
    }

    const result: Array<{
      id: number;
      date: string;
      routine_day_name?: string;
      totalSets: number;
      totalTonnage: number;
      exercisesCount: number;
      tasks: Array<{
        id: number;
        exerciseId: number;
        exerciseName: string;
        muscleGroup?: string;
        sets: LoggedSet[];
      }>;
    }> = [];

    for (const day of days) {
      if (!day.id) continue;
      const dayTasks = tasksByDay.get(day.id) || [];
      dayTasks.sort((a, b) => a.sort_order - b.sort_order);

      let dayTotalSets = 0;
      let dayTotalTonnage = 0;
      const enrichedTasks: Array<{
        id: number;
        exerciseId: number;
        exerciseName: string;
        muscleGroup?: string;
        sets: LoggedSet[];
      }> = [];

      for (const t of dayTasks) {
        if (!t.id) continue;
        const tSets = setsByTask.get(t.id) || [];
        tSets.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
        if (tSets.length > 0) {
          dayTotalSets += tSets.length;
          for (const s of tSets) {
            dayTotalTonnage += s.weight * s.reps;
          }
          const ex = exerciseMap.get(t.exercise_id);
          enrichedTasks.push({
            id: t.id,
            exerciseId: t.exercise_id,
            exerciseName: ex?.name ?? 'Ćwiczenie',
            muscleGroup: ex?.muscle_group,
            sets: tSets,
          });
        }
      }

      // Do historii zaliczamy sesje z zapisanymi seriami
      if (dayTotalSets > 0) {
        result.push({
          id: day.id,
          date: day.date,
          routine_day_name: day.routine_day_name,
          totalSets: dayTotalSets,
          totalTonnage: Math.round(dayTotalTonnage * 10) / 10,
          exercisesCount: enrichedTasks.length,
          tasks: enrichedTasks,
        });
      }
    }

    // Sortowanie od najnowszej do najstarszej sesji
    result.sort((a, b) => b.date.localeCompare(a.date));

    return result;
  }, []);

  const allTimePRs = useLiveQuery(async () => {
    return await getHistoricalPRs();
  }, []) ?? new Map<number, ExerciseHistoricalPR>();

  const toggleExpand = (dayId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) {
        next.delete(dayId);
      } else {
        next.add(dayId);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (!sessions) return;
    setExpandedIds(new Set(sessions.map((s) => s.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  if (!sessions) {
    return (
      <div className="py-8 text-center text-xs text-zinc-400">
        Wczytywanie historii sesji...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-6 border-2 border-zinc-700/80 text-center space-y-3 shadow-lg shadow-black/50">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-none bg-black border border-zinc-800 text-red-500">
            <Calendar className="h-6 w-6" />
          </div>
        </div>
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Brak zapisanych treningów
        </h3>
        <p className="text-xs text-zinc-400 max-w-sm mx-auto">
          Wykonaj i zarejestruj serie w zakładce Trening, aby przeglądać pełną historię sesji treningowych.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 font-sans">
      {/* Pasek podsumowania i szybkich akcji */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Zapisane sesje: <strong className="text-white">{sessions.length}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="text-[11px] font-bold text-zinc-400 hover:text-white uppercase tracking-wider transition-colors cursor-pointer"
          >
            Rozwiń wszystkie
          </button>
          <span className="text-zinc-600 text-xs">•</span>
          <button
            type="button"
            onClick={collapseAll}
            className="text-[11px] font-bold text-zinc-400 hover:text-white uppercase tracking-wider transition-colors cursor-pointer"
          >
            Zwiń wszystkie
          </button>
        </div>
      </div>

      {/* Lista sesji treningowych */}
      <div className="space-y-3">
        {sessions.map((session) => {
          const isExpanded = expandedIds.has(session.id);
          const friendlyDayName = formatPolishFriendlyDate(session.date).split(',')[0];

          return (
            <div
              key={session.id}
              className="rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 border-2 border-zinc-700/80 shadow-lg shadow-black/50 transition-all overflow-hidden"
            >
              {/* Nagłówek karty treningu (klikalny) */}
              <button
                type="button"
                onClick={() => toggleExpand(session.id)}
                className="w-full p-4 sm:p-5 flex items-center justify-between text-left cursor-pointer hover:bg-zinc-900/50 transition-colors"
                aria-expanded={isExpanded}
              >
                <div className="space-y-1.5 flex-1 pr-3">
                  {/* Data i dzień tygodnia */}
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 bg-gradient-to-r from-red-600 to-red-800 shrink-0" />
                    <span className="text-sm sm:text-base font-bold text-white tracking-wide">
                      {formatDisplayDate(session.date)}
                    </span>
                    <span className="text-xs font-semibold text-zinc-400">
                      • {friendlyDayName}
                    </span>
                  </div>

                  {/* Nazwa treningu */}
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-red-500 uppercase tracking-wider">
                      {session.routine_day_name || 'Trening'}
                    </h3>
                  </div>

                  {/* Podsumowanie: liczba ćwiczeń, serii, tonaż */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-zinc-400">
                    <span className="inline-flex items-center gap-1">
                      <Dumbbell className="h-3 w-3 text-zinc-500" />
                      <span>{session.exercisesCount} ćw.</span>
                    </span>
                    <span className="text-zinc-600">•</span>
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3 w-3 text-zinc-500" />
                      <span>{session.totalSets} serii</span>
                    </span>
                    {session.totalTonnage > 0 && (
                      <>
                        <span className="text-zinc-600">•</span>
                        <span className="text-zinc-300 font-semibold">
                          {session.totalTonnage.toLocaleString('pl-PL')} kg
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Ikona rozwijania z rotacją */}
                <div className="flex items-center justify-center h-8 w-8 rounded-none bg-black border border-zinc-800 text-zinc-400 shrink-0">
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      isExpanded ? 'transform rotate-180 text-red-500' : ''
                    }`}
                  />
                </div>
              </button>

              {/* Rozwijana sekcja szczegółów (Accordion) */}
              {isExpanded && (
                <div className="border-t-2 border-zinc-800/90 p-4 sm:p-5 bg-black/40 space-y-4 animate-in fade-in duration-150">
                  <div className="space-y-4">
                    {session.tasks.map((task, taskIdx) => (
                      <div
                        key={task.id}
                        className="rounded-none bg-gradient-to-b from-zinc-950 to-black p-3.5 border border-zinc-800/90 space-y-2.5"
                      >
                        {/* Nagłówek ćwiczenia z ikoną partii */}
                        <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 items-center justify-center rounded-none bg-black border border-zinc-800 shrink-0 overflow-hidden">
                              {getCategoryIconElement(
                                task.muscleGroup,
                                'w-5 h-5 object-contain opacity-85'
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-zinc-500">
                                  #{taskIdx + 1}
                                </span>
                                <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide">
                                  {task.exerciseName}
                                </h4>
                              </div>
                              {task.muscleGroup && (
                                <span className="text-[10px] text-zinc-400">
                                  {task.muscleGroup}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-[11px] font-semibold text-zinc-400">
                            {task.sets.length} {task.sets.length === 1 ? 'seria' : 'serie'}
                          </span>
                        </div>

                        {/* Lista zarejestrowanych serii (ciężar, powtórzenia, RIR) */}
                        <div className="space-y-1.5">
                          {task.sets.map((set, setIdx) => {
                            const pr = allTimePRs.get(task.exerciseId);
                            const isPR = Boolean(set.id && pr && pr.bestSetId === set.id);

                            return (
                              <div
                                key={set.id ?? setIdx}
                                className="flex items-center justify-between rounded-none bg-black/80 px-3 py-2 border border-zinc-900 hover:border-zinc-800 transition-colors"
                              >
                                <div className="flex items-center gap-2 sm:gap-3">
                                  <span className="text-[11px] font-bold text-zinc-500 w-5">
                                    #{setIdx + 1}
                                  </span>
                                  <span className="text-sm font-bold text-white font-sans">
                                    {set.weight} kg
                                  </span>
                                  <span className="text-xs text-zinc-400 font-sans">
                                    × {set.reps} powt.
                                  </span>
                                  {isPR && (
                                    <span className="inline-flex items-center gap-1 rounded-none bg-red-950/80 border border-red-700/80 px-1.5 py-0.5 text-[9px] font-bold text-red-400 font-sans">
                                      <Flame className="h-2.5 w-2.5 fill-red-600 text-red-600 shrink-0" />
                                      PR
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center">
                                  <RirBadge rir={set.rir} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Akcja usunięcia treningu z historii */}
                  <div className="pt-3 border-t-2 border-zinc-800 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">
                      Zarejestrowana sesja #{session.id}
                    </span>

                    {confirmDeleteId === session.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-300">Usunąć na stałe?</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteSession(session.id)}
                          className="rounded-none bg-red-700 hover:bg-red-600 px-3 py-1 text-xs font-bold text-white uppercase cursor-pointer"
                        >
                          Tak, usuń
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-none bg-black border border-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:text-white cursor-pointer"
                        >
                          Anuluj
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(session.id)}
                        className="flex items-center gap-1.5 text-zinc-400 hover:text-rose-400 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                        title="Usuń ten trening z bazy i historii"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Usuń trening</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
