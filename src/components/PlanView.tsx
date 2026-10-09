import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Trash2,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import {
  db,
  createRoutineDay,
  deleteRoutineDay,
  updateRoutineDayName,
  addExerciseToRoutineDay,
  removeExerciseFromRoutineDay,
  updateRoutineExerciseTargetSets,
  assignRoutineDayToDate,
  unassignRoutineDayFromDate,
  type RoutineDay,
} from '../db/db';
import {
  getMonthCalendarCells,
  POLISH_MONTHS_NOMINATIVE,
  POLISH_DAYS_SHORT,
  formatPolishFriendlyDate,
} from '../utils/dateUtils';
import { AddExerciseModal } from './AddExerciseModal';
import { getCategoryIcon } from '../utils/categoryIcons';

export interface PlanViewProps {
  onGoToActiveWorkout?: () => void;
}

export const PlanView: React.FC<PlanViewProps> = ({ onGoToActiveWorkout }) => {
  // Calendar month state
  const [calendarDate, setCalendarDate] = useState<Date>(() => new Date());
  const [selectedCalendarDateISO, setSelectedCalendarDateISO] = useState<string | null>(null);
  const [isConfirmDeleteCalendarSession, setIsConfirmDeleteCalendarSession] = useState(false);

  // New day creation state
  const [isCreatingDay, setIsCreatingDay] = useState(false);
  const [newDayName, setNewDayName] = useState('');

  // Exercise modal target day
  const [activeRoutineDayForExercise, setActiveRoutineDayForExercise] = useState<number | null>(null);

  // Editing day name inline
  const [editingDayId, setEditingDayId] = useState<number | null>(null);
  const [editingDayName, setEditingDayName] = useState('');

  // Zwinięte szablony dni treningowych
  const [collapsedDayIds, setCollapsedDayIds] = useState<Set<number>>(new Set());

  const toggleDayCollapse = (dayId: number) => {
    setCollapsedDayIds((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) {
        next.delete(dayId);
      } else {
        next.add(dayId);
      }
      return next;
    });
  };

  // Live queries
  const daysList = useLiveQuery(async () => {
    return await db.routineDays.orderBy('day_number').toArray();
  }, []) ?? [];

  const routineExercises = useLiveQuery(async () => {
    return await db.routineExercises.toArray();
  }, []) ?? [];

  const exercises = useLiveQuery(async () => {
    return await db.exercises.toArray();
  }, []) ?? [];

  const workoutDays = useLiveQuery(async () => {
    return await db.workoutDays.toArray();
  }, []) ?? [];

  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));
  const workoutDayMap = new Map(workoutDays.map((d) => [d.date, d]));

  // Month navigation
  const currentYear = calendarDate.getFullYear();
  const currentMonth = calendarDate.getMonth();
  const monthName = POLISH_MONTHS_NOMINATIVE[currentMonth];
  const calendarCells = getMonthCalendarCells(currentYear, currentMonth);

  const handlePrevMonth = () => {
    setCalendarDate(new Date(currentYear, currentMonth - 1, 1, 12, 0, 0));
  };

  const handleNextMonth = () => {
    setCalendarDate(new Date(currentYear, currentMonth + 1, 1, 12, 0, 0));
  };

  const handleCurrentMonth = () => {
    setCalendarDate(new Date());
  };

  // Day creation
  const handleCreateDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDayName.trim()) return;
    const name = newDayName.trim();
    setNewDayName('');
    setIsCreatingDay(false);

    try {
      await createRoutineDay(name);
    } catch (err) {
      console.error('Błąd tworzenia dnia:', err);
    }
  };

  // Trwałe usuwanie dnia
  const handleDeleteRoutineDay = async (e: React.MouseEvent, dayId: number) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await deleteRoutineDay(dayId);
    } catch (err) {
      console.error('Błąd usuwania dnia z bazy:', err);
    }
  };

  const handleSaveEditedName = async (dayId: number) => {
    if (editingDayName.trim()) {
      const trimmed = editingDayName.trim();
      await updateRoutineDayName(dayId, trimmed);
    }
    setEditingDayId(null);
  };

  // Stepper target sets
  const handleAdjustTargetSets = async (reId: number, currentSets: number, delta: number) => {
    const next = Math.max(1, Math.min(10, currentSets + delta));
    await updateRoutineExerciseTargetSets(reId, next);
  };

  // Assign routine to calendar date
  const handleAssignToDate = async (routineDayId: number) => {
    if (!selectedCalendarDateISO) return;
    await assignRoutineDayToDate(selectedCalendarDateISO, routineDayId);
    setSelectedCalendarDateISO(null);
  };

  const handleUnassignFromDate = async () => {
    if (!selectedCalendarDateISO) return;
    await unassignRoutineDayFromDate(selectedCalendarDateISO);
  };

  const selectedDateRecord = selectedCalendarDateISO ? workoutDayMap.get(selectedCalendarDateISO) : undefined;

  return (
    <div className="space-y-4 max-w-xl mx-auto text-zinc-100 font-sans">
      {/* 1. INTERAKTYWNY WIDOK KALENDARZA (WIDOK MIESIĄCA) */}
      <div className="rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-4 sm:p-5 border-2 border-zinc-700/80 shadow-lg shadow-black/60 space-y-3.5">
        {/* Month Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-zinc-800">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-red-500" />
            <h2 className="text-sm font-bold text-zinc-100 tracking-wider uppercase">
              {monthName} {currentYear}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCurrentMonth}
              className="h-7 px-3 flex items-center justify-center rounded-none border border-zinc-700 bg-gradient-to-b from-zinc-900 to-black text-xs font-bold text-red-500 hover:text-red-400 hover:border-red-600/80 transition-colors cursor-pointer uppercase tracking-wider"
            >
              Dziś
            </button>
            <button
              type="button"
              onClick={handlePrevMonth}
              className="h-7 w-7 flex items-center justify-center rounded-none border border-zinc-700 bg-gradient-to-b from-zinc-900 to-black text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors cursor-pointer"
              aria-label="Poprzedni miesiąc"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="h-7 w-7 flex items-center justify-center rounded-none border border-zinc-700 bg-gradient-to-b from-zinc-900 to-black text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors cursor-pointer"
              aria-label="Następny miesiąc"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Days of week header (Pn - Nd) */}
        <div className="grid grid-cols-7 gap-2 text-center pb-2 border-b border-zinc-800">
          {POLISH_DAYS_SHORT.map((day) => (
            <span key={day} className="text-[10px] font-bold text-zinc-400 py-1 uppercase tracking-wider">
              {day}
            </span>
          ))}
        </div>

        {/* Month Grid Cells */}
        <div className="grid grid-cols-7 gap-2">
          {calendarCells.map((cell) => {
            const dayRecord = workoutDayMap.get(cell.dateISO);
            const hasAssigned = Boolean(dayRecord?.routine_day_name);
            const isSelected = selectedCalendarDateISO === cell.dateISO;

            return (
              <button
                key={cell.dateISO}
                type="button"
                onClick={() => setSelectedCalendarDateISO(cell.dateISO)}
                className={`relative flex flex-col items-center justify-start min-h-[54px] rounded-none p-1.5 transition-colors text-left cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-b from-red-950 via-zinc-950 to-black text-white font-bold border-2 border-red-600 shadow-[0_0_12px_rgba(220,38,38,0.35)]'
                    : cell.isToday
                    ? 'bg-gradient-to-b from-zinc-900 to-black text-red-500 font-bold border-2 border-red-800'
                    : cell.isCurrentMonth
                    ? 'bg-gradient-to-b from-zinc-900/60 to-black text-zinc-200 border border-zinc-800 hover:border-zinc-600'
                    : 'bg-black text-zinc-600 border border-zinc-900/60 opacity-40'
                }`}
              >
                <span
                  className={`text-xs font-bold ${
                    isSelected
                      ? 'text-white'
                      : cell.isToday
                      ? 'text-red-500'
                      : cell.isCurrentMonth
                      ? 'text-zinc-200'
                      : 'text-zinc-600'
                  }`}
                >
                  {cell.dayNumber}
                </span>

                {/* Plakietka przypisanego dnia */}
                {hasAssigned && (
                  <span
                    className="mt-1 w-full truncate rounded-none bg-gradient-to-r from-red-900 to-red-950 border border-red-700 px-1 py-0.5 text-[9px] font-bold text-red-200 text-center uppercase tracking-wider"
                    title={dayRecord?.routine_day_name}
                  >
                    {dayRecord?.routine_day_name?.replace('Dzień ', 'D')}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="pt-2 border-t border-zinc-800/80 text-xs text-zinc-400">
          Wybierz datę w kalendarzu, aby przypisać dzień treningowy.
        </div>
      </div>

      {/* 2. ZESTAWY TRENINGOWE (LISTA DNI + PRZYCISK DODAJ DZIEŃ) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <h3 className="text-sm font-bold text-zinc-100 tracking-wider uppercase">
              Harmonogram sesji
            </h3>
            <p className="text-xs text-zinc-400">
              Szablony jednostek treningowych
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsCreatingDay(true)}
            style={{ clipPath: 'polygon(5% 0, 100% 0, 95% 100%, 0 100%)' }}
            className="flex items-center gap-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold uppercase tracking-wider rounded-none px-3.5 sm:px-4 py-2 text-xs transition-colors shadow-none cursor-pointer shrink-0 ml-2"
          >
            <span className="text-base font-bold leading-none">+</span>
            <span>Dodaj Dzień</span>
          </button>
        </div>

        {/* Formularz tworzenia nowego dnia */}
        {isCreatingDay && (
          <form
            onSubmit={handleCreateDay}
            className="rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-4 border-2 border-zinc-700 space-y-3 shadow-lg"
          >
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">Nowy dzień treningowy</h4>
              <button
                type="button"
                onClick={() => setIsCreatingDay(false)}
                className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Anuluj
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Nazwa dnia (np. Dzień 1 - Push A)
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="np. Dzień 1 - Push A"
                value={newDayName}
                onChange={(e) => setNewDayName(e.target.value)}
                className="w-full rounded-none border border-zinc-700 bg-black px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCreatingDay(false)}
                className="rounded-none border border-zinc-800 bg-black px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-white cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="submit"
                style={{ clipPath: 'polygon(5% 0, 100% 0, 95% 100%, 0 100%)' }}
                className="rounded-none bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold uppercase tracking-wider px-4 py-2 text-xs transition-colors cursor-pointer"
              >
                Zatwierdź
              </button>
            </div>
          </form>
        )}

        {/* Lista stworzonych dni */}
        {daysList.length === 0 ? (
          <div className="rounded-none bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 text-center border-2 border-zinc-800 shadow-none">
            <p className="text-sm font-semibold text-zinc-300">
              Brak zdefiniowanych dni treningowych
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Kliknij przycisk „Dodaj Dzień” powyżej, aby utworzyć szablon.
            </p>
          </div>
        ) : (
          daysList.map((day) => {
            const dayExercises = routineExercises
              .filter((re) => re.routine_day_id === day.id)
              .sort((a, b) => a.sort_order - b.sort_order);

            const isEditing = editingDayId === day.id;
            const isExpanded = !collapsedDayIds.has(day.id!);

            return (
              <div
                key={day.id}
                className="rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-4 sm:p-5 border-2 border-zinc-700/80 shadow-lg shadow-black/50 transition-all"
              >
                {/* Header dnia - klikalny do zwijania / rozwijania */}
                <div
                  onClick={() => !isEditing && toggleDayCollapse(day.id!)}
                  className={`flex items-center justify-between cursor-pointer select-none transition-colors group ${
                    isExpanded ? 'pb-3 border-b-2 border-zinc-800' : 'pb-0'
                  }`}
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    {/* Ikona zwijania/rozwijania z rotacją */}
                    <div className="flex items-center justify-center h-7 w-7 rounded-none bg-black border border-zinc-800 text-zinc-400 group-hover:text-white group-hover:border-zinc-700 shrink-0 transition-colors">
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-200 ${
                          isExpanded ? 'transform rotate-180 text-red-500' : ''
                        }`}
                      />
                    </div>

                    {isEditing ? (
                      <div
                        className="flex items-center gap-1.5 flex-1 max-w-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          autoFocus
                          value={editingDayName}
                          onChange={(e) => setEditingDayName(e.target.value)}
                          className="rounded-none border border-red-600 bg-black px-2.5 py-1 text-xs font-bold text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEditedName(day.id!)}
                          className="rounded-none bg-red-700 p-1 text-white hover:bg-red-600 cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0">
                        <h4 className="text-sm font-bold text-zinc-100 tracking-wider uppercase truncate group-hover:text-white">
                          {day.name}
                        </h4>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingDayId(day.id!);
                            setEditingDayName(day.name);
                          }}
                          className="text-zinc-500 hover:text-zinc-200 p-1 rounded-none cursor-pointer"
                          title="Zmień nazwę"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Prawa strona nagłówka */}
                  <div className="flex items-center gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[11px] text-zinc-400 font-bold bg-black/60 border border-zinc-800 px-2 py-0.5">
                      {dayExercises.length} ĆW.
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteRoutineDay(e, day.id!);
                      }}
                      className="flex items-center gap-1 rounded-none border border-zinc-800 bg-black px-2.5 py-1 text-xs text-zinc-400 hover:border-red-900 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Usuń ten dzień z planu"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="text-[11px] font-bold uppercase tracking-wider hidden sm:inline">Usuń</span>
                    </button>
                  </div>
                </div>

                {/* Rozwijana zawartość szablonu */}
                {isExpanded && (
                  <div className="pt-3.5 space-y-3.5 animate-in fade-in duration-150">
                    {/* Lista ćwiczeń w zestawie */}
                    {dayExercises.length === 0 ? (
                      <div className="py-3 text-center rounded-none bg-black border border-zinc-800">
                        <p className="text-xs text-zinc-400">
                          Brak ćwiczeń w tym dniu. Dodaj pierwsze ćwiczenie poniżej.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {dayExercises.map((re, idx) => {
                          const ex = exerciseMap.get(re.exercise_id);
                          const CategoryIcon = getCategoryIcon(ex?.muscle_group);
                          return (
                            <div
                              key={re.id}
                              className="flex items-center justify-between rounded-none bg-black p-3 border border-zinc-800 hover:border-zinc-600 transition-colors"
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-7 w-7 items-center justify-center rounded-none bg-zinc-950 border border-zinc-800 shrink-0 overflow-hidden">
                                  <CategoryIcon className="w-5 h-5 object-contain opacity-85" />
                                </div>
                                <span className="text-xs font-bold text-zinc-500 w-4">
                                  #{idx + 1}
                                </span>
                                <div>
                                  <span className="text-xs font-bold text-zinc-100 block uppercase">
                                    {ex?.name ?? 'Ćwiczenie'}
                                  </span>
                                </div>
                              </div>

                              {/* Stepper liczby serii */}
                              <div className="flex items-center gap-2">
                                <div className="flex items-center bg-zinc-950 rounded-none px-2 py-0.5 border border-zinc-800">
                                  <button
                                    type="button"
                                    onClick={() => handleAdjustTargetSets(re.id!, re.target_sets, -1)}
                                    className="h-5 w-5 rounded-none text-xs font-bold text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <span className="px-2 text-xs font-bold text-zinc-200">
                                    {re.target_sets} {re.target_sets === 1 ? 'seria' : 'serie'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleAdjustTargetSets(re.id!, re.target_sets, 1)}
                                    className="h-5 w-5 rounded-none text-xs font-bold text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => removeExerciseFromRoutineDay(re.id!)}
                                  className="text-zinc-500 hover:text-rose-400 transition-colors p-1 cursor-pointer rounded-none"
                                  title="Usuń ćwiczenie"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Przycisk dodaj ćwiczenie */}
                    <button
                      type="button"
                      onClick={() => setActiveRoutineDayForExercise(day.id!)}
                      style={{ clipPath: 'polygon(5% 0, 100% 0, 95% 100%, 0 100%)' }}
                      className="flex w-full items-center justify-center gap-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold uppercase tracking-wider rounded-none py-2 text-xs transition-colors cursor-pointer"
                    >
                      <span className="text-sm font-bold leading-none">+</span>
                      <span>Dodaj ćwiczenie do {day.name}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 3. MODAL PRZYPISANIA DO KALENDARZA */}
      {selectedCalendarDateISO && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/90 animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-none border-2 border-zinc-700 bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b-2 border-zinc-800">
              <div>
                <span className="text-xs font-semibold text-red-500 uppercase tracking-wider">
                  Harmonogram sesji
                </span>
                <h3 className="text-sm font-bold text-zinc-100 tracking-wider uppercase">
                  {formatPolishFriendlyDate(selectedCalendarDateISO)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCalendarDateISO(null)}
                className="rounded-none border border-zinc-800 bg-black p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedDateRecord?.routine_day_name ? (
              <div className="rounded-none bg-black p-3.5 border border-zinc-800 space-y-2">
                <span className="text-xs text-zinc-400 block">Przypisany dzień treningowy:</span>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-zinc-100 uppercase">
                      {selectedDateRecord.routine_day_name}
                    </span>
                    {isConfirmDeleteCalendarSession ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-300">Usunąć trening?</span>
                        <button
                          type="button"
                          onClick={async () => {
                            await handleUnassignFromDate();
                            setIsConfirmDeleteCalendarSession(false);
                          }}
                          className="rounded-none bg-red-700 hover:bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white uppercase cursor-pointer"
                        >
                          Tak, usuń
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsConfirmDeleteCalendarSession(false)}
                          className="rounded-none bg-black border border-zinc-800 px-2 py-0.5 text-xs text-zinc-400 hover:text-white cursor-pointer"
                        >
                          Anuluj
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsConfirmDeleteCalendarSession(true)}
                        className="text-red-500 hover:text-red-400 font-bold uppercase text-xs border-b border-red-900 pb-0.5 cursor-pointer tracking-wider"
                      >
                        Usuń trening
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-400">
                Wybierz dzień treningowy do przypisania:
              </p>
            )}

            {/* Lista zestawów do przypisania */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {daysList.length === 0 ? (
                <p className="text-xs text-zinc-400 py-4 text-center">
                  Brak utworzonych dni treningowych. Utwórz najpierw dzień w harmonogramie.
                </p>
              ) : (
                daysList.map((rd) => {
                  const isCurrent = selectedDateRecord?.routine_day_id === rd.id;
                  return (
                    <button
                      key={rd.id}
                      type="button"
                      onClick={() => handleAssignToDate(rd.id!)}
                      className={`flex w-full items-center justify-between p-3 rounded-none border text-left transition-colors cursor-pointer ${
                        isCurrent
                          ? 'border-2 border-red-600 bg-gradient-to-r from-red-950 to-black text-white font-bold'
                          : 'border border-zinc-800 bg-black hover:border-zinc-600 text-zinc-200'
                      }`}
                    >
                      <div>
                        <span className="text-xs font-bold block uppercase">{rd.name}</span>
                        <span className="text-[10px] text-zinc-400">
                          {routineExercises.filter((re) => re.routine_day_id === rd.id).length} ĆWICZEŃ
                        </span>
                      </div>

                      <span className="text-xs font-bold text-red-500 uppercase">
                        {isCurrent ? 'PRZYPISANO' : 'WYBIERZ'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setSelectedCalendarDateISO(null)}
                className="w-full rounded-none border border-zinc-800 bg-black py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:bg-zinc-900 transition-colors cursor-pointer"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal wyboru ćwiczenia */}
      <AddExerciseModal
        isOpen={activeRoutineDayForExercise !== null}
        onClose={() => setActiveRoutineDayForExercise(null)}
        onSelectExercise={async (exerciseId) => {
          if (activeRoutineDayForExercise) {
            await addExerciseToRoutineDay(activeRoutineDayForExercise, exerciseId, 4);
            setActiveRoutineDayForExercise(null);
          }
        }}
        existingExerciseIds={
          activeRoutineDayForExercise
            ? routineExercises
                .filter((re) => re.routine_day_id === activeRoutineDayForExercise)
                .map((re) => re.exercise_id)
            : []
        }
      />
    </div>
  );
};
