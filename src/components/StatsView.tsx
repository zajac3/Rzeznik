import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ChevronDown,
  Trash2,
  CheckCircle2,
  Flame,
  Pencil,
  Check,
  X,
  Search,
  Plus,
  RotateCcw,
} from 'lucide-react';
import {
  db,
  addOrUpdateBodyWeight,
  updateBodyWeight,
  deleteBodyWeight,
  calculateEpley1RM,
  addManual1RM,
  deleteManual1RM,
  delete1RMRecord,
  deleteExercise1RMRecords,
  type BodyWeightEntry,
  type Manual1RMEntry,
  type Exercise,
} from '../db/db';
import { getTodayISO } from '../utils/dateUtils';
import { WorkoutHistoryView } from './WorkoutHistoryView';

// 4 domyślne boje objęte maksami:
// 1. Wyciskanie sztangi na poziomej
// 2. Wyciskanie hantli na ławce dodatniej
// 3. Martwy ciąg
// 4 domyślne boje objęte maksami:
// 1. Wyciskanie sztangi na poziomej
// 2. Wyciskanie hantli na ławce dodatniej
// 3. Martwy ciąg
// 4. Przysiady ze sztangą (zwykłe)
const isDefaultMaxExercise = (name: string): boolean => {
  const n = name.toLowerCase().trim();
  // 1. Wyciskanie sztangi na poziomej
  if (
    n.includes('wyciskanie sztangi na ławce poziomej') ||
    n.includes('wyciskanie sztangi na ławce płaskiej') ||
    n === 'wyciskanie sztangi leżąc' ||
    (n.includes('wyciskanie sztangi') && (n.includes('poziom') || n.includes('płask')))
  ) {
    return true;
  }
  // 2. Wyciskanie hantli na ławce dodatniej
  if (
    n.includes('wyciskanie hantli') &&
    (n.includes('skośn') || n.includes('dodatn') || n.includes('skos')) &&
    !n.includes('ujemn')
  ) {
    return true;
  }
  // 3. Martwy ciąg
  if (n === 'martwy ciąg' || n === 'martwy ciąg klasyczny') {
    return true;
  }
  // 4. Przysiady ze sztangą (zwykłe)
  if (
    n.includes('przysiady ze sztangą na karku') ||
    n.includes('back squat') ||
    n === 'przysiady ze sztangą' ||
    n === 'przysiad ze sztangą' ||
    (n.includes('przysiad') && n.includes('sztang') && !n.includes('przedn') && !n.includes('front') && !n.includes('bułgar') && !n.includes('hack') && !n.includes('zercher'))
  ) {
    return true;
  }
  return false;
};

const getDefaultMaxOrder = (name: string): number => {
  const n = name.toLowerCase().trim();
  if (n.includes('wyciskanie sztangi')) return 1;
  if (n.includes('wyciskanie hantli')) return 2;
  if (n.includes('martwy ciąg')) return 3;
  if (n.includes('przysiad')) return 4;
  return 99;
};

export const StatsView: React.FC = () => {
  // Trzy subzakładki: [Wykresy], [Maksy] oraz [Historia treningów] (Segmented Control)
  const [subTab, setSubTab] = useState<'charts' | 'maxes' | 'history'>('charts');

  // Wewnątrz Wykresów: przełącznik wykresu ćwiczeń / masy ciała
  const [chartType, setChartType] = useState<'exercise' | 'weight'>('exercise');
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(() => {
    const saved = localStorage.getItem('pakomat_selected_chart_exercise_id');
    return saved ? Number(saved) : null;
  });

  // Wyszukiwarka ćwiczeń do wykresu progresu
  const [isExerciseSearchModalOpen, setIsExerciseSearchModalOpen] = useState<boolean>(false);
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState<string>('');
  const [exerciseMuscleFilter, setExerciseMuscleFilter] = useState<string>('Wszystkie');

  // Formularz wagi ciała
  const [newWeight, setNewWeight] = useState<string>('80.0');
  const [weightDate, setWeightDate] = useState<string>(() => getTodayISO());

  // Edycja wpisu wagi ciała
  const [editingWeightId, setEditingWeightId] = useState<number | null>(null);
  const [editingWeightVal, setEditingWeightVal] = useState<string>('');

  // Formularz ręcznego wpisu 1RM
  const [selectedMaxExerciseId, setSelectedMaxExerciseId] = useState<number | null>(null);
  const [manualExerciseId, setManualExerciseId] = useState<number | null>(null);
  const [manualWeight, setManualWeight] = useState<string>('100.0');
  const [manualDate, setManualDate] = useState<string>(() => getTodayISO());
  const [manualSuccessMsg, setManualSuccessMsg] = useState<string | null>(null);

  // Potwierdzenie usuwania rekordów i usuwania ćwiczeń ze śledzonych w zakładce Maksy
  const [confirmDeleteExerciseId, setConfirmDeleteExerciseId] = useState<number | null>(null);
  const [confirmDeleteManualId, setConfirmDeleteManualId] = useState<number | null>(null);
  const [confirmRemoveTrackedId, setConfirmRemoveTrackedId] = useState<number | null>(null);

  // Live queries
  const exercises = useLiveQuery(async () => {
    return await db.exercises.toArray();
  }, []) ?? [];

  const bodyWeights: BodyWeightEntry[] = useLiveQuery(async () => {
    return await db.bodyWeights.orderBy('date').toArray();
  }, []) ?? [];

  const manual1RMs: Manual1RMEntry[] = useLiveQuery(async () => {
    return await db.manual1RMs.orderBy('date').toArray();
  }, []) ?? [];

  const workoutData = useLiveQuery(async () => {
    const days = await db.workoutDays.toArray();
    const tasks = await db.plannedTasks.toArray();
    const sets = await db.loggedSets.toArray();

    const dayMap = new Map(days.map((d) => [d.id, d]));
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    return { days, tasks, sets, dayMap, taskMap };
  }, []);

  // Śledzone ćwiczenia w zakładce Maksy (domyślnie 4 główne boje + własne dodane przez użytkownika)
  const [trackedMaxExerciseIds, setTrackedMaxExerciseIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('pakomat_tracked_max_exercise_ids_v3');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [];
  });

  // Modal wyboru ćwiczenia do dodania do maksów
  const [isAddMaxModalOpen, setIsAddMaxModalOpen] = useState<boolean>(false);
  const [maxSearchQuery, setMaxSearchQuery] = useState<string>('');
  const [maxMuscleFilter, setMaxMuscleFilter] = useState<string>('Wszystkie');

  // Inicjalizacja domyślnych 4 bojów po załadowaniu ćwiczeń
  useEffect(() => {
    if (exercises.length === 0) return;
    setTrackedMaxExerciseIds((prev) => {
      if (prev.length > 0) {
        const valid = prev.filter((id) => exercises.some((e) => e.id === id));
        if (valid.length > 0) return valid;
      }
      const defaultExs = exercises
        .filter((e) => isDefaultMaxExercise(e.name))
        .sort((a, b) => getDefaultMaxOrder(a.name) - getDefaultMaxOrder(b.name));
      const defIds = defaultExs.map((e) => e.id!).filter(Boolean);
      try {
        localStorage.setItem('pakomat_tracked_max_exercise_ids_v3', JSON.stringify(defIds));
      } catch {}
      return defIds;
    });
  }, [exercises]);

  const compoundExercises = useMemo(() => {
    if (exercises.length === 0) return [];
    if (trackedMaxExerciseIds.length > 0) {
      const matched = trackedMaxExerciseIds
        .map((id) => exercises.find((e) => e.id === id))
        .filter((e): e is Exercise => e !== undefined);
      if (matched.length > 0) return matched;
    }
    return exercises
      .filter((e) => isDefaultMaxExercise(e.name))
      .sort((a, b) => getDefaultMaxOrder(a.name) - getDefaultMaxOrder(b.name));
  }, [exercises, trackedMaxExerciseIds]);

  const handleAddTrackedMaxExercise = (exerciseId: number) => {
    setTrackedMaxExerciseIds((prev) => {
      if (prev.includes(exerciseId)) return prev;
      const next = [...prev, exerciseId];
      try {
        localStorage.setItem('pakomat_tracked_max_exercise_ids_v3', JSON.stringify(next));
      } catch {}
      return next;
    });
    setSelectedMaxExerciseId(exerciseId);
    setManualExerciseId(exerciseId);
    setIsAddMaxModalOpen(false);
    setMaxSearchQuery('');
  };

  const handleRemoveTrackedMaxExercise = (exerciseId: number) => {
    setTrackedMaxExerciseIds((prev) => {
      const next = prev.filter((id) => id !== exerciseId);
      try {
        localStorage.setItem('pakomat_tracked_max_exercise_ids_v3', JSON.stringify(next));
      } catch {}
      return next;
    });
    if (selectedMaxExerciseId === exerciseId) {
      setSelectedMaxExerciseId(null);
    }
    if (manualExerciseId === exerciseId) {
      setManualExerciseId(null);
    }
  };

  const handleResetDefaultMaxExercises = () => {
    const defaultExs = exercises
      .filter((e) => isDefaultMaxExercise(e.name))
      .sort((a, b) => getDefaultMaxOrder(a.name) - getDefaultMaxOrder(b.name));
    const defIds = defaultExs.map((e) => e.id!).filter(Boolean);
    setTrackedMaxExerciseIds(defIds);
    try {
      localStorage.setItem('pakomat_tracked_max_exercise_ids_v3', JSON.stringify(defIds));
    } catch {}
    setSelectedMaxExerciseId(null);
  };

  const filteredExercisesForMaxSearch = useMemo(() => {
    const q = maxSearchQuery.trim().toLowerCase();
    return exercises.filter((ex) => {
      const matchesSearch =
        !q ||
        ex.name.toLowerCase().includes(q) ||
        ex.muscle_group.toLowerCase().includes(q);
      const matchesMuscle =
        maxMuscleFilter === 'Wszystkie' || ex.muscle_group === maxMuscleFilter;
      return matchesSearch && matchesMuscle;
    });
  }, [exercises, maxSearchQuery, maxMuscleFilter]);

  useEffect(() => {
    if (!isAddMaxModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsAddMaxModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddMaxModalOpen]);

  // Efektywne ID ćwiczenia do wykresu 1RM w subzakładce Maksy
  const effectiveMaxExerciseId = useMemo(() => {
    if (selectedMaxExerciseId) return selectedMaxExerciseId;
    if (compoundExercises.length > 0) return compoundExercises[0].id!;
    return null;
  }, [selectedMaxExerciseId, compoundExercises]);

  // Efektywne ID ćwiczenia do dodawania wpisu ręcznego
  const effectiveManualExerciseId = manualExerciseId || effectiveMaxExerciseId;

  // --- LOGIKA SUBZAKŁADKI: MAKSY (WYKRES 1RM ŁĄCZĄCY TRENINGI I WPISY RĘCZNE) ---
  const maxProgressionChartData = useMemo(() => {
    if (!effectiveMaxExerciseId) return [];

    const dateRecordsMap = new Map<
      string,
      { oneRepMax: number; source: string; details?: string }
    >();

    // 1. Dodaj dane z zarejestrowanych sesji treningowych (formuła Epleya)
    if (workoutData) {
      const { sets, taskMap, dayMap } = workoutData;
      const relevantSets = sets.filter((s) => {
        if (s.exclude_from_1rm) return false;
        const task = taskMap.get(s.task_id);
        return task && task.exercise_id === effectiveMaxExerciseId;
      });

      for (const set of relevantSets) {
        const task = taskMap.get(set.task_id);
        const day = task?.day_id ? dayMap.get(task.day_id) : undefined;
        const date = day?.date;
        if (!date) continue;

        const est1RM = calculateEpley1RM(set.weight, set.reps);
        const existing = dateRecordsMap.get(date);

        if (!existing || est1RM > existing.oneRepMax) {
          dateRecordsMap.set(date, {
            oneRepMax: est1RM,
            source: 'Trening (Epley)',
            details: `${set.weight} kg × ${set.reps} (RIR ${set.rir})`,
          });
        }
      }
    }

    // 2. Dodaj wpisy ręczne dla tego ćwiczenia
    const relevantManuals = manual1RMs.filter((m) => m.exercise_id === effectiveMaxExerciseId);
    for (const man of relevantManuals) {
      const existing = dateRecordsMap.get(man.date);
      if (!existing || man.weight >= existing.oneRepMax) {
        dateRecordsMap.set(man.date, {
          oneRepMax: man.weight,
          source: 'Wpis ręczny',
          details: 'Wprowadzony rekord',
        });
      }
    }

    const sortedDates = Array.from(dateRecordsMap.keys()).sort((a, b) => a.localeCompare(b));

    return sortedDates.map((date) => {
      const item = dateRecordsMap.get(date)!;
      const parts = date.split('-');
      const shortDate = parts.length === 3 ? `${parts[2]}.${parts[1]}` : date;

      return {
        date,
        shortDate,
        oneRepMax: item.oneRepMax,
        source: item.source,
        details: item.details,
      };
    });
  }, [effectiveMaxExerciseId, workoutData, manual1RMs]);

  // Lista podsumowania rekordów 1RM dla wszystkich ćwiczeń wielostawowych
  const maxesSummaryList = useMemo(() => {
    return compoundExercises.map((ex) => {
      let best1RM: number | null = null;
      let bestDate: string | null = null;
      let bestSource = '';
      let bestRecordId: number | null = null;
      let bestRecordType: 'manual' | 'set' | null = null;

      // Z treningów
      if (workoutData) {
        const { sets, taskMap, dayMap } = workoutData;
        const relevantSets = sets.filter((s) => {
          if (s.exclude_from_1rm) return false;
          const task = taskMap.get(s.task_id);
          return task && task.exercise_id === ex.id;
        });

        for (const s of relevantSets) {
          const task = taskMap.get(s.task_id);
          const day = task?.day_id ? dayMap.get(task.day_id) : undefined;
          const d = day?.date;
          if (!d) continue;

          const est = calculateEpley1RM(s.weight, s.reps);
          if (best1RM === null || est > best1RM) {
            best1RM = est;
            bestDate = d;
            bestSource = `Trening: ${s.weight} kg × ${s.reps}`;
            bestRecordId = s.id ?? null;
            bestRecordType = 'set';
          }
        }
      }

      // Z wpisów ręcznych
      const relevantManuals = manual1RMs.filter((m) => m.exercise_id === ex.id);
      for (const man of relevantManuals) {
        if (best1RM === null || man.weight >= best1RM) {
          best1RM = man.weight;
          bestDate = man.date;
          bestSource = 'Wpis ręczny';
          bestRecordId = man.id ?? null;
          bestRecordType = 'manual';
        }
      }

      return {
        exercise: ex,
        best1RM,
        date: bestDate,
        source: bestSource,
        recordId: bestRecordId,
        recordType: bestRecordType,
      };
    });
  }, [compoundExercises, workoutData, manual1RMs]);

  // --- LOGIKA SUBZAKŁADKI: WYKRES CIĘŻARU W TRENINGU ---
  const currentExerciseId = useMemo(() => {
    if (selectedExerciseId && exercises.some((e) => e.id === selectedExerciseId)) {
      return selectedExerciseId;
    }
    const saved = localStorage.getItem('pakomat_selected_chart_exercise_id');
    const savedId = saved ? Number(saved) : null;
    if (savedId && exercises.some((e) => e.id === savedId)) {
      return savedId;
    }
    if (exercises.length > 0) return exercises[0].id!;
    return null;
  }, [selectedExerciseId, exercises]);

  const handleSelectExercise = (id: number) => {
    setSelectedExerciseId(id);
    localStorage.setItem('pakomat_selected_chart_exercise_id', String(id));
    setIsExerciseSearchModalOpen(false);
  };

  const MUSCLE_GROUPS = ['Wszystkie', 'Klatka', 'Plecy', 'Nogi', 'Barki', 'Ramiona', 'Brzuch'];

  const exercisesWithDataIds = useMemo(() => {
    if (!workoutData?.sets || !workoutData?.taskMap) return new Set<number>();
    const ids = new Set<number>();
    for (const s of workoutData.sets) {
      const task = workoutData.taskMap.get(s.task_id);
      if (task?.exercise_id) ids.add(task.exercise_id);
    }
    return ids;
  }, [workoutData]);

  const filteredExercisesForSearch = useMemo(() => {
    const q = exerciseSearchQuery.trim().toLowerCase();
    return exercises.filter((ex) => {
      const matchesSearch =
        !q ||
        ex.name.toLowerCase().includes(q) ||
        ex.muscle_group.toLowerCase().includes(q);
      const matchesMuscle =
        exerciseMuscleFilter === 'Wszystkie' || ex.muscle_group === exerciseMuscleFilter;
      return matchesSearch && matchesMuscle;
    });
  }, [exercises, exerciseSearchQuery, exerciseMuscleFilter]);

  useEffect(() => {
    if (!isExerciseSearchModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExerciseSearchModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExerciseSearchModalOpen]);

  const exerciseChartData = useMemo(() => {
    if (!workoutData || !currentExerciseId) return [];

    const { sets, taskMap, dayMap } = workoutData;

    const relevantSets = sets.filter((s) => {
      const task = taskMap.get(s.task_id);
      return task && task.exercise_id === currentExerciseId;
    });

    if (relevantSets.length === 0) return [];

    const perDateMap = new Map<
      string,
      { maxWeight: number; max1RM: number; reps: number; rir: number }
    >();

    for (const set of relevantSets) {
      const task = taskMap.get(set.task_id);
      const day = task?.day_id ? dayMap.get(task.day_id) : undefined;
      const date = day?.date;
      if (!date) continue;

      const est1RM = calculateEpley1RM(set.weight, set.reps);
      const existing = perDateMap.get(date);

      if (!existing || set.weight > existing.maxWeight) {
        perDateMap.set(date, {
          maxWeight: set.weight,
          max1RM: est1RM,
          reps: set.reps,
          rir: set.rir,
        });
      }
    }

    const sortedDates = Array.from(perDateMap.keys()).sort((a, b) => a.localeCompare(b));

    return sortedDates.map((date) => {
      const item = perDateMap.get(date)!;
      const parts = date.split('-');
      const formattedDate = `${parts[2]}.${parts[1]}`;

      return {
        date,
        shortDate: formattedDate,
        weight: item.maxWeight,
        estimated1RM: item.max1RM,
        reps: item.reps,
        rir: item.rir,
      };
    });
  }, [workoutData, currentExerciseId]);

  const handleSaveWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(newWeight);
    if (!val || val <= 0) return;
    await addOrUpdateBodyWeight(weightDate, val);
  };

  const handleSaveEditWeight = async (id?: number) => {
    if (!id) return;
    const val = parseFloat(editingWeightVal);
    if (!val || val <= 0) return;
    await updateBodyWeight(id, val);
    setEditingWeightId(null);
  };

  const handleDeleteWeight = async (id?: number) => {
    if (!id) return;
    await deleteBodyWeight(id);
  };

  const handleAddManual1RMRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveManualExerciseId) return;
    const val = parseFloat(manualWeight);
    if (!val || val <= 0) return;

    await addManual1RM(effectiveManualExerciseId, val, manualDate);
    const exName = compoundExercises.find((e) => e.id === effectiveManualExerciseId)?.name || 'ćwiczenia';
    const existingBest = maxesSummaryList.find((m) => m.exercise.id === effectiveManualExerciseId)?.best1RM ?? 0;
    const isNewPR = existingBest > 0 && val > existingBest;

    if (isNewPR) {
      setManualSuccessMsg(`Nowy PR! Zapisano 1RM ${val} kg dla "${exName}"!`);
    } else {
      setManualSuccessMsg(`Zapisano 1RM ${val} kg dla "${exName}".`);
    }
    setTimeout(() => setManualSuccessMsg(null), 3500);
  };

  const handleDeleteManual1RM = async (id?: number) => {
    if (!id) return;
    await deleteManual1RM(id);
  };

  const handleDeleteMaxRecord = async (item: {
    exercise: Exercise;
    recordId: number | null;
    recordType: 'manual' | 'set' | null;
  }) => {
    if (item.exercise.id) {
      // Usuń rekord 1RM dla tego ćwiczenia za jednym zamachem (BEZ usuwania serii z treningu!)
      await deleteExercise1RMRecords(item.exercise.id);
    }
    setConfirmDeleteExerciseId(null);
  };

  const currentExerciseObj = exercises.find((e) => e.id === currentExerciseId);
  const currentMaxExerciseObj = compoundExercises.find((e) => e.id === effectiveMaxExerciseId);

  const currentSelectedManualMaxItem = useMemo(() => {
    return maxesSummaryList.find((m) => m.exercise.id === effectiveManualExerciseId);
  }, [maxesSummaryList, effectiveManualExerciseId]);

  const parsedManualWeightNum = parseFloat(manualWeight) || 0;
  const isManualTypingPR =
    parsedManualWeightNum > 0 &&
    (!currentSelectedManualMaxItem?.best1RM || parsedManualWeightNum > currentSelectedManualMaxItem.best1RM);

  return (
    <div className="space-y-4 max-w-xl mx-auto text-zinc-100 font-sans">
      {/* NATYWNY MOBILNY SEGMENTED CONTROL: [Wykresy], [Maksy], [Historia treningów] */}
      <div className="grid grid-cols-3 rounded-none bg-gradient-to-r from-zinc-900 via-[#121215] to-zinc-950 border-2 border-zinc-700/80 p-1 text-[11px] sm:text-xs shadow-lg shadow-black/50">
        <button
          type="button"
          onClick={() => setSubTab('charts')}
          className={`rounded-none py-2 font-bold uppercase tracking-wider transition-colors cursor-pointer text-center outline-none focus:outline-none focus:ring-0 active:outline-none select-none border ${
            subTab === 'charts'
              ? 'bg-gradient-to-r from-red-600 to-red-800 text-white border-red-500 shadow-[0_0_10px_rgba(220,38,38,0.3)]'
              : 'text-zinc-400 hover:text-zinc-200 border-transparent'
          }`}
        >
          Wykresy
        </button>
        <button
          type="button"
          onClick={() => setSubTab('maxes')}
          className={`rounded-none py-2 font-bold uppercase tracking-wider transition-colors cursor-pointer text-center outline-none focus:outline-none focus:ring-0 active:outline-none select-none border ${
            subTab === 'maxes'
              ? 'bg-gradient-to-r from-red-600 to-red-800 text-white border-red-500 shadow-[0_0_10px_rgba(220,38,38,0.3)]'
              : 'text-zinc-400 hover:text-zinc-200 border-transparent'
          }`}
        >
          Maksy
        </button>
        <button
          type="button"
          onClick={() => setSubTab('history')}
          className={`rounded-none py-2 font-bold uppercase tracking-wider transition-colors cursor-pointer text-center outline-none focus:outline-none focus:ring-0 active:outline-none select-none border ${
            subTab === 'history'
              ? 'bg-gradient-to-r from-red-600 to-red-800 text-white border-red-500 shadow-[0_0_10px_rgba(220,38,38,0.3)]'
              : 'text-zinc-400 hover:text-zinc-200 border-transparent'
          }`}
        >
          <span className="hidden sm:inline">Historia treningów</span>
          <span className="sm:hidden">Historia</span>
        </button>
      </div>

      {/* SUBZAKŁADKA 1: WYKRESY */}
      {subTab === 'charts' && (
        <div className="space-y-4">
          {/* Przełącznik: Wykres ćwiczenia / Masa ciała */}
          <div className="flex rounded-none bg-gradient-to-r from-zinc-900 to-black border-2 border-zinc-800 p-1 text-xs shadow-none">
            <button
              type="button"
              onClick={() => setChartType('exercise')}
              className={`flex-1 rounded-none py-1.5 font-bold uppercase tracking-wider transition-colors cursor-pointer outline-none focus:outline-none focus:ring-0 active:outline-none select-none border ${
                chartType === 'exercise'
                  ? 'bg-gradient-to-r from-zinc-800 to-zinc-900 text-white border-zinc-700 shadow-none'
                  : 'text-zinc-400 hover:text-zinc-200 border-transparent'
              }`}
            >
              Ciężar ćwiczenia
            </button>
            <button
              type="button"
              onClick={() => setChartType('weight')}
              className={`flex-1 rounded-none py-1.5 font-bold uppercase tracking-wider transition-colors cursor-pointer outline-none focus:outline-none focus:ring-0 active:outline-none select-none border ${
                chartType === 'weight'
                  ? 'bg-gradient-to-r from-zinc-800 to-zinc-900 text-white border-zinc-700 shadow-none'
                  : 'text-zinc-400 hover:text-zinc-200 border-transparent'
              }`}
            >
              Masa ciała
            </button>
          </div>

          {chartType === 'exercise' ? (
            <div className="rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-4 sm:p-5 border-2 border-zinc-700/80 shadow-lg shadow-black/50">
              {/* Wybór ćwiczenia */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b-2 border-zinc-800 gap-3">
                <div>
                  <span className="text-xs font-semibold text-red-500 uppercase tracking-wider">
                    Historia obciążeń
                  </span>
                  <h3 className="text-base font-bold text-white tracking-wide uppercase">
                    Wykres progresu
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setIsExerciseSearchModalOpen(true)}
                  className="w-full sm:w-auto flex items-center justify-between gap-3 rounded-none border border-zinc-700 bg-black px-3 py-2 text-xs font-semibold text-white hover:border-red-600 transition-colors uppercase cursor-pointer"
                  title="Wyszukaj ćwiczenie do wykresu"
                >
                  <div className="flex items-center gap-2 truncate text-left">
                    <Search className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    <span className="truncate max-w-[180px] sm:max-w-xs font-bold text-white">
                      {currentExerciseObj?.name ?? 'Wybierz ćwiczenie'}
                    </span>
                    {currentExerciseObj && (
                      <span className="text-[10px] text-zinc-400 font-normal shrink-0">
                        ({currentExerciseObj.muscle_group})
                      </span>
                    )}
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-400 shrink-0 ml-1" />
                </button>
              </div>

              {/* Wykres Recharts */}
              <div className="mt-4 pt-2">
                {exerciseChartData.length === 0 ? (
                  <div className="py-10 px-6 text-center rounded-none bg-black/60 border border-zinc-800 flex flex-col items-center justify-center">
                    <p className="text-sm font-semibold text-zinc-300 max-w-sm mx-auto leading-relaxed text-balance">
                      Brak danych treningowych dla{' '}
                      <span className="text-white font-bold">{currentExerciseObj?.name ?? 'wybranego ćwiczenia'}</span>.
                    </p>
                    <p className="mt-2 text-xs text-zinc-500 max-w-xs mx-auto leading-relaxed">
                      Wykonaj serię w zakładce Trening, aby wygenerować wykres.
                    </p>
                  </div>
                ) : (
                  <div className="w-full h-64 -ml-2 select-none outline-none focus:outline-none">
                    <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none select-none">
                      <LineChart
                        data={exerciseChartData}
                        margin={{ top: 15, right: 15, left: -10, bottom: 5 }}
                        style={{ outline: 'none' }}
                        tabIndex={-1}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis
                          dataKey="shortDate"
                          tick={{ fontSize: 11, fill: '#a1a1aa' }}
                          stroke="#52525b"
                          tickLine={false}
                        />
                        <YAxis
                          domain={['dataMin - 5', 'dataMax + 5']}
                          tick={{ fontSize: 11, fill: '#a1a1aa' }}
                          stroke="#52525b"
                          tickLine={false}
                          unit=" kg"
                        />
                        <Tooltip content={<CustomChartTooltip />} />
                        <Line
                          type="monotone"
                          dataKey="weight"
                          name="Podniesiony ciężar"
                          stroke="#dc2626"
                          strokeWidth={2.5}
                          dot={{
                            r: 4.5,
                            fill: '#991b1b',
                            stroke: '#09090b',
                            strokeWidth: 2,
                          }}
                          activeDot={{
                            r: 6.5,
                            fill: '#ef4444',
                            stroke: '#09090b',
                            strokeWidth: 2,
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-4 sm:p-5 border-2 border-zinc-700/80 space-y-4 shadow-lg shadow-black/50 w-full max-w-full overflow-hidden box-border">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-xs font-semibold text-red-500 uppercase tracking-wider">
                    Ostatni pomiar masy ciała
                  </span>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold text-white">
                      {bodyWeights.length > 0 ? bodyWeights[bodyWeights.length - 1].weight : '—'}
                    </span>
                    <span className="text-sm font-bold text-zinc-400">kg</span>
                  </div>
                </div>
              </div>

              {/* Wykres wagi */}
              {bodyWeights.length < 2 ? (
                <div className="py-8 text-center text-xs text-zinc-400 rounded-none bg-black border-2 border-dashed border-zinc-800">
                  Wprowadź co najmniej 2 pomiary wagi, aby zobaczyć wykres trendu.
                </div>
              ) : (
                <div className="w-full h-52 -ml-2 select-none outline-none focus:outline-none">
                  <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none select-none">
                    <LineChart
                      data={bodyWeights.map((w) => ({
                        date: w.date.slice(5),
                        fullDate: w.date,
                        weight: w.weight,
                      }))}
                      margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                      style={{ outline: 'none' }}
                      tabIndex={-1}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: '#a1a1aa' }}
                        stroke="#3f3f46"
                        tickLine={false}
                      />
                      <YAxis
                        domain={['dataMin - 1', 'dataMax + 1']}
                        tick={{ fontSize: 11, fill: '#a1a1aa' }}
                        stroke="#3f3f46"
                        tickLine={false}
                        unit=" kg"
                      />
                      <Tooltip content={<CustomWeightTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="#dc2626"
                        strokeWidth={2.5}
                        dot={{
                          r: 4.5,
                          fill: '#991b1b',
                          stroke: '#09090b',
                          strokeWidth: 2,
                        }}
                        activeDot={{
                          r: 6.5,
                          fill: '#ef4444',
                          stroke: '#09090b',
                          strokeWidth: 2,
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Formularz wprowadzania wagi - zoptymalizowany dla urządzeń mobilnych */}
              <form onSubmit={handleSaveWeight} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t-2 border-zinc-800 w-full min-w-0 max-w-full box-border">
                <div className="w-full min-w-0">
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Data pomiaru
                  </label>
                  <input
                    type="date"
                    value={weightDate}
                    onChange={(e) => setWeightDate(e.target.value)}
                    className="w-full max-w-full min-w-0 box-border rounded-none border border-zinc-700 bg-black px-2.5 py-1.5 text-xs text-white focus:border-red-600 focus:outline-none [color-scheme:dark] block"
                  />
                </div>
                <div className="w-full min-w-0">
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Waga (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="30"
                    max="300"
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    className="w-full max-w-full min-w-0 box-border rounded-none border border-zinc-700 bg-black px-2.5 py-1.5 text-xs text-white focus:border-red-600 focus:outline-none block"
                  />
                </div>
                <div className="flex items-end w-full min-w-0">
                  <button
                    type="submit"
                    style={{ clipPath: 'polygon(5% 0, 100% 0, 95% 100%, 0 100%)' }}
                    className="w-full rounded-none bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold uppercase tracking-wider py-2 text-xs transition-colors cursor-pointer"
                  >
                    Zapisz pomiar
                  </button>
                </div>
              </form>

              {/* Historia wpisów wagi */}
              {bodyWeights.length > 0 && (
                <div className="divide-y-2 divide-zinc-900 text-xs max-h-48 overflow-y-auto pt-2">
                  {bodyWeights
                    .slice()
                    .reverse()
                    .map((entry) => {
                      const isEditing = editingWeightId === entry.id;

                      return (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between py-2 px-1 hover:bg-zinc-900/60 rounded-none transition-colors"
                        >
                          <span className="text-zinc-400 font-sans">{entry.date}</span>
                          <div className="flex items-center gap-2">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                                <input
                                  type="number"
                                  step="0.1"
                                  min="30"
                                  max="300"
                                  value={editingWeightVal}
                                  onChange={(e) => setEditingWeightVal(e.target.value)}
                                  className="w-20 rounded-none bg-black border border-red-600 px-2 py-0.5 text-xs font-bold text-white focus:outline-none"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleSaveEditWeight(entry.id);
                                    }
                                    if (e.key === 'Escape') {
                                      setEditingWeightId(null);
                                    }
                                  }}
                                />
                                <span className="text-xs text-zinc-400 font-sans">kg</span>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditWeight(entry.id)}
                                  className="rounded-none bg-red-700 hover:bg-red-600 p-1 text-white cursor-pointer transition-colors"
                                  title="Zapisz nową wagę"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingWeightId(null)}
                                  className="rounded-none bg-black border border-zinc-800 p-1 text-zinc-400 hover:text-white cursor-pointer transition-colors"
                                  title="Anuluj"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="font-bold text-white font-sans">{entry.weight} kg</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingWeightId(entry.id!);
                                    setEditingWeightVal(String(entry.weight));
                                  }}
                                  className="text-zinc-500 hover:text-zinc-200 p-1 cursor-pointer transition-colors"
                                  title="Edytuj pomiar wagi"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteWeight(entry.id)}
                                  className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer transition-colors"
                                  title="Usuń pomiar"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUBZAKŁADKA 2: MAKSY (WYKRES LINIOWY 1RM, RĘCZNE DODAWAJIE I PODSUMOWANIE) */}
      {subTab === 'maxes' && (
        <div className="space-y-4">
          {/* 1. WYKRES LINIOWY PROGRESJI 1RM */}
          <div className="rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-4 sm:p-5 border-2 border-zinc-700/80 shadow-lg shadow-black/50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b-2 border-zinc-800 gap-3">
              <div>
                <span className="text-xs font-semibold text-red-500 uppercase tracking-wider">
                  Progresja siłowa
                </span>
                <h3 className="text-base font-bold text-white tracking-wide uppercase">
                  Wykres maksów (1RM)
                </h3>
              </div>

              {/* Wybór ćwiczenia + Przycisk Dodaj ćwiczenie */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:min-w-[200px]">
                  <select
                    value={effectiveMaxExerciseId ?? ''}
                    onChange={(e) => setSelectedMaxExerciseId(Number(e.target.value))}
                    className="w-full appearance-none rounded-none border border-zinc-700 bg-black px-3 py-2 pr-8 text-xs font-semibold text-white focus:border-red-600 focus:outline-none uppercase"
                  >
                    {compoundExercises.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddMaxModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-none border border-red-700 bg-red-950/70 hover:bg-red-900 px-3 py-2 text-xs font-bold text-white uppercase tracking-wider transition-colors shrink-0 cursor-pointer"
                  title="Dodaj własne ćwiczenie z listy do śledzenia w maksach"
                >
                  <Plus className="h-3.5 w-3.5 text-red-400" />
                  <span>Dodaj</span>
                </button>
              </div>
            </div>

            {/* Wykres Recharts dla 1RM */}
            <div className="mt-4 pt-1">
              {maxProgressionChartData.length === 0 ? (
                <div className="py-10 px-6 text-center rounded-none bg-black/60 border border-zinc-800 flex flex-col items-center justify-center">
                  <p className="text-sm font-semibold text-zinc-300 max-w-sm mx-auto leading-relaxed text-balance">
                    Brak danych 1RM dla{' '}
                    <span className="text-white font-bold">{currentMaxExerciseObj?.name ?? 'wybranego ćwiczenia'}</span>.
                  </p>
                  <p className="mt-2 text-xs text-zinc-500 max-w-xs mx-auto leading-relaxed">
                    Wykonaj trening z tym ćwiczeniem lub dodaj własny rekord w formularzu poniżej.
                  </p>
                </div>
              ) : (
                <div className="w-full h-60 -ml-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={maxProgressionChartData}
                      margin={{ top: 15, right: 15, left: -10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis
                        dataKey="shortDate"
                        tick={{ fontSize: 11, fill: '#a1a1aa' }}
                        stroke="#3f3f46"
                        tickLine={false}
                      />
                      <YAxis
                        domain={['dataMin - 5', 'dataMax + 5']}
                        tick={{ fontSize: 11, fill: '#a1a1aa' }}
                        stroke="#3f3f46"
                        tickLine={false}
                        unit=" kg"
                      />
                      <Tooltip content={<CustomMaxTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="oneRepMax"
                        name="Szacowany 1RM"
                        stroke="#dc2626"
                        strokeWidth={2.5}
                        dot={{
                          r: 4.5,
                          fill: '#991b1b',
                          stroke: '#09090b',
                          strokeWidth: 2,
                        }}
                        activeDot={{
                          r: 6.5,
                          fill: '#ef4444',
                          stroke: '#09090b',
                          strokeWidth: 2,
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* 2. DYSKRETNY FORMULARZ: DODAJ WŁASNY REKORD 1RM */}
          <div className="rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-4 sm:p-5 border-2 border-zinc-700/80 space-y-3 shadow-lg shadow-black/50">
            <div className="flex items-center justify-between pb-2 border-b-2 border-zinc-800">
              <div>
                <span className="text-xs font-semibold text-red-500 uppercase tracking-wider">
                  Rejestracja rekordu
                </span>
                <h4 className="text-sm font-bold text-white tracking-wide uppercase">
                  Dodaj własny rekord 1RM
                </h4>
              </div>
            </div>

            {manualSuccessMsg && (
              <div className="flex items-center gap-2 rounded-none bg-emerald-950/70 p-2.5 text-xs font-semibold text-emerald-300 border-2 border-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{manualSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleAddManual1RMRecord} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1">
              {/* Wybór ćwiczenia */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Ćwiczenie
                </label>
                <div className="relative">
                  <select
                    value={effectiveManualExerciseId ?? ''}
                    onChange={(e) => {
                      if (e.target.value === 'ADD_FROM_LIST') {
                        setIsAddMaxModalOpen(true);
                      } else {
                        setManualExerciseId(Number(e.target.value));
                      }
                    }}
                    className="w-full appearance-none rounded-none border border-zinc-700 bg-black px-3 py-1.5 pr-8 text-xs text-white focus:border-red-600 focus:outline-none uppercase"
                  >
                    {compoundExercises.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.name}
                      </option>
                    ))}
                    <option value="ADD_FROM_LIST">+ Dodaj inne ćwiczenie z listy...</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                </div>
              </div>

              {/* Ciężar 1RM */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Ciężar 1RM (kg)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="600"
                  required
                  value={manualWeight}
                  onChange={(e) => setManualWeight(e.target.value)}
                  className="w-full rounded-none border border-zinc-700 bg-black px-3 py-1.5 text-xs text-white focus:border-red-600 focus:outline-none"
                />
              </div>

              {/* Data */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Data rekordu
                </label>
                <input
                  type="date"
                  required
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full rounded-none border border-zinc-700 bg-black px-2.5 py-1.5 text-xs text-white focus:border-red-600 focus:outline-none"
                />
              </div>

              {/* Wykrywanie nowego rekordu w czasie rzeczywistym */}
              {isManualTypingPR && currentSelectedManualMaxItem?.best1RM && (
                <div className="sm:col-span-4 flex items-center gap-2 p-2.5 bg-red-950/60 border border-red-700/80 animate-in fade-in duration-150">
                  <Flame className="h-4 w-4 fill-red-600 text-red-600 shrink-0 animate-pulse" />
                  <span className="text-xs font-bold text-red-400 font-sans tracking-wide">
                    Nowy PR!
                    <span className="text-zinc-300 ml-1.5 font-normal">
                      Dotychczasowy rekord dla tego boju: {currentSelectedManualMaxItem.best1RM} kg
                    </span>
                  </span>
                </div>
              )}

              {/* Przycisk */}
              <div className="sm:col-span-4 flex justify-end pt-1">
                <button
                  type="submit"
                  style={{ clipPath: 'polygon(5% 0, 100% 0, 95% 100%, 0 100%)' }}
                  className="inline-flex items-center gap-1.5 rounded-none bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold uppercase tracking-wider px-4 py-2 text-xs transition-colors cursor-pointer"
                >
                  <span className="text-sm font-bold leading-none">+</span>
                  <span>Zapisz rekord 1RM</span>
                </button>
              </div>
            </form>
          </div>

          {/* 3. AKTUALNE MAKSY (PODSUMOWANIE DLA ŚLEDZONYCH BOJÓW) */}
          <div className="space-y-2.5">
            <div className="px-1 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Podsumowanie rekordów (Najwyższy 1RM)
                </h4>
                <span className="text-[10px] text-zinc-500 font-normal">
                  Śledzone ćwiczenia: {compoundExercises.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddMaxModalOpen(true)}
                  className="inline-flex items-center gap-1 rounded-none border border-red-700 bg-red-950/60 hover:bg-red-900 px-2.5 py-1 text-[11px] font-bold text-red-300 hover:text-white uppercase tracking-wider transition-colors cursor-pointer"
                  title="Wybierz dodatkowe ćwiczenie z listy do śledzenia maksów"
                >
                  <Plus className="h-3 w-3" />
                  <span>Dodaj ćwiczenie</span>
                </button>
                {trackedMaxExerciseIds.length !== 4 && (
                  <button
                    type="button"
                    onClick={handleResetDefaultMaxExercises}
                    className="inline-flex items-center gap-1 rounded-none border border-zinc-800 bg-black hover:border-zinc-700 px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-200 uppercase tracking-wider transition-colors cursor-pointer"
                    title="Przywróć 4 domyślne boje"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    <span>Domyślne</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {maxesSummaryList.map((item) => {
                const hasData = item.best1RM !== null;
                const isConfirmingDeleteRecord = confirmDeleteExerciseId === item.exercise.id;
                const isConfirmingRemoveTracked = confirmRemoveTrackedId === item.exercise.id;
                const isCustom = !isDefaultMaxExercise(item.exercise.name);

                return (
                  <div
                    key={item.exercise.id}
                    className="rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-3.5 border-2 border-zinc-700/80 space-y-1 shadow-md shadow-black/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs font-bold text-white uppercase truncate">
                            {item.exercise.name}
                          </h4>
                          {isCustom && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-none bg-red-950/80 border border-red-800 text-red-300 uppercase tracking-wider shrink-0">
                              Dodane
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold block mt-0.5">
                          {item.exercise.muscle_group}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          {hasData ? (
                            <div className="flex items-baseline gap-1 justify-end">
                              <span className="text-lg font-bold text-red-500 font-sans">
                                {item.best1RM}
                              </span>
                              <span className="text-xs font-bold text-zinc-300 font-sans">kg 1RM</span>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-500">
                              Brak wpisów
                            </span>
                          )}
                        </div>

                        {hasData && (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmRemoveTrackedId(null);
                              setConfirmDeleteExerciseId(item.exercise.id!);
                            }}
                            className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer transition-colors"
                            title="Usuń ten rekord"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Przycisk usunięcia ćwiczenia z listy śledzonych maksów */}
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteExerciseId(null);
                            setConfirmRemoveTrackedId(item.exercise.id!);
                          }}
                          className="text-zinc-600 hover:text-zinc-200 p-1 cursor-pointer transition-colors"
                          title="Usuń ćwiczenie z listy maksów"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {hasData && (
                      <div className="pt-1.5 border-t-2 border-zinc-900 text-[10px] text-zinc-400 flex items-center justify-between">
                        <span>{item.source}</span>
                        <span>{item.date}</span>
                      </div>
                    )}

                    {/* Potwierdzenie usunięcia wartości rekordu */}
                    {isConfirmingDeleteRecord && (
                      <div className="pt-2 mt-2 border-t-2 border-zinc-800 flex items-center justify-between text-xs animate-in fade-in duration-150">
                        <span className="text-zinc-300">Usunąć ten rekord?</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteMaxRecord(item)}
                            className="rounded-none bg-red-700 hover:bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white uppercase cursor-pointer"
                          >
                            Usuń rekord
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteExerciseId(null)}
                            className="rounded-none bg-black border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 hover:text-white cursor-pointer"
                          >
                            Anuluj
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Potwierdzenie usunięcia ćwiczenia z listy śledzonych */}
                    {isConfirmingRemoveTracked && (
                      <div className="pt-2 mt-2 border-t-2 border-zinc-800 flex items-center justify-between text-xs animate-in fade-in duration-150">
                        <span className="text-zinc-300">Usunąć ćwiczenie z maksów?</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              handleRemoveTrackedMaxExercise(item.exercise.id!);
                              setConfirmRemoveTrackedId(null);
                            }}
                            className="rounded-none bg-zinc-800 hover:bg-zinc-700 text-red-400 border border-red-800 px-2.5 py-1 text-[11px] font-bold uppercase cursor-pointer"
                          >
                            Usuń z listy
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveTrackedId(null)}
                            className="rounded-none bg-black border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 hover:text-white cursor-pointer"
                          >
                            Anuluj
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. HISTORIA WPISÓW RĘCZNYCH (Z MOŻLIWOŚCIĄ USUNIĘCIA) */}
          {manual1RMs.length > 0 && (
            <div className="rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-4 border-2 border-zinc-700/80 space-y-2 shadow-lg shadow-black/50">
              <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                Historia wpisów ręcznych 1RM
              </h4>

              <div className="divide-y-2 divide-zinc-900 text-xs max-h-48 overflow-y-auto">
                {manual1RMs
                  .slice()
                  .reverse()
                  .map((entry) => {
                    const ex = exercises.find((e) => e.id === entry.exercise_id);
                    const isConfirming = confirmDeleteManualId === entry.id;
                    const maxForEx = maxesSummaryList.find((m) => m.exercise.id === entry.exercise_id)?.best1RM;
                    const isTopRecord = maxForEx !== null && maxForEx !== undefined && entry.weight >= maxForEx;

                    return (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between py-2 px-1 hover:bg-zinc-900/60 rounded-none transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">{entry.date}</span>
                          <span className="font-sans text-zinc-200 font-medium truncate max-w-[140px]">
                            {ex?.name ?? 'Ćwiczenie'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-red-500 font-sans">{entry.weight} kg</span>
                            {isTopRecord && (
                              <span className="inline-flex items-center gap-1 bg-red-950/80 border border-red-700/80 px-1.5 py-0.5 text-[9px] font-bold text-red-400 font-sans">
                                <Flame className="h-2.5 w-2.5 fill-red-600 text-red-600 shrink-0" />
                                PR
                              </span>
                            )}
                          </div>
                          {isConfirming ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={async () => {
                                  await handleDeleteManual1RM(entry.id);
                                  setConfirmDeleteManualId(null);
                                }}
                                className="rounded-none bg-red-700 hover:bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase cursor-pointer"
                              >
                                Usuń
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteManualId(null)}
                                className="rounded-none bg-black border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-white cursor-pointer"
                              >
                                Anuluj
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteManualId(entry.id!)}
                              className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer transition-colors"
                              title="Usuń wpis"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBZAKŁADKA 3: HISTORIA TRENINGÓW */}
      {subTab === 'history' && <WorkoutHistoryView />}

      {/* MODAL WYSZUKIWANIA ĆWICZENIA DO WYKRESU */}
      {isExerciseSearchModalOpen && (
        <div
          onClick={() => setIsExerciseSearchModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-zinc-950 border-2 border-zinc-700 p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[85vh] flex flex-col"
          >
            {/* Nagłówek modalu */}
            <div className="flex items-center justify-between pb-2 border-b-2 border-zinc-800">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Wybierz ćwiczenie do wykresu
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsExerciseSearchModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 cursor-pointer transition-colors"
                title="Zamknij"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Pole wyszukiwania */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                autoFocus
                placeholder="Szukaj po nazwie (np. wyciskanie, przysiad)..."
                value={exerciseSearchQuery}
                onChange={(e) => setExerciseSearchQuery(e.target.value)}
                className="w-full rounded-none border border-zinc-700 bg-black py-2 pl-9 pr-9 text-xs font-medium text-white placeholder-zinc-500 focus:border-red-600 focus:outline-none uppercase"
              />
              {exerciseSearchQuery && (
                <button
                  type="button"
                  onClick={() => setExerciseSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filtry grup mięśniowych */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 shrink-0">
              {MUSCLE_GROUPS.map((group) => {
                const isActive = exerciseMuscleFilter === group;
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setExerciseMuscleFilter(group)}
                    className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer shrink-0 border ${
                      isActive
                        ? 'bg-red-600 text-white border-red-500'
                        : 'bg-black text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {group}
                  </button>
                );
              })}
            </div>

            {/* Lista wyników */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 divide-y divide-zinc-900 min-h-[220px]">
              {filteredExercisesForSearch.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500">
                  Nie znaleziono ćwiczeń dla zapytania „{exerciseSearchQuery}”.
                </div>
              ) : (
                filteredExercisesForSearch.map((ex) => {
                  const isSelected = ex.id === currentExerciseId;
                  const hasData = ex.id ? exercisesWithDataIds.has(ex.id) : false;

                  return (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => ex.id && handleSelectExercise(ex.id)}
                      className={`w-full text-left p-2.5 rounded-none transition-colors cursor-pointer flex items-center justify-between gap-3 border ${
                        isSelected
                          ? 'bg-gradient-to-r from-red-950 via-zinc-950 to-black border-red-700 text-white'
                          : 'bg-black/50 hover:bg-zinc-900 border-transparent text-zinc-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold uppercase tracking-wide truncate ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                            {ex.name}
                          </span>
                          {hasData && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-red-950/80 text-red-400 border border-red-800 shrink-0">
                              Dane sesji
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mt-0.5">
                          {ex.muscle_group}
                        </span>
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-red-500 shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Dolna informacja */}
            <div className="pt-2 border-t border-zinc-800 text-[10px] text-zinc-500 flex items-center justify-between shrink-0">
              <span>Wyniki: {filteredExercisesForSearch.length} z {exercises.length}</span>
              <span>Kliknij, aby wybrać do wykresu</span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DODAJ ĆWICZENIE DO MAKSÓW Z BAZY ĆWICZEŃ */}
      {isAddMaxModalOpen && (
        <div
          onClick={() => setIsAddMaxModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-zinc-950 border-2 border-zinc-700 p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[85vh] flex flex-col"
          >
            {/* Nagłówek modalu */}
            <div className="flex items-center justify-between pb-2 border-b-2 border-zinc-800">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-red-500" />
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Dodaj ćwiczenie do maksów
                  </h3>
                  <span className="text-[10px] text-zinc-400 block">
                    Wybierz ćwiczenie z biblioteki, aby śledzić jego rekordy 1RM
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddMaxModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 cursor-pointer transition-colors"
                title="Zamknij"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Pole wyszukiwania */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                autoFocus
                placeholder="Szukaj ćwiczenia (np. hantle, wyciskanie, przysiad)..."
                value={maxSearchQuery}
                onChange={(e) => setMaxSearchQuery(e.target.value)}
                className="w-full rounded-none border border-zinc-700 bg-black py-2 pl-9 pr-9 text-xs font-medium text-white placeholder-zinc-500 focus:border-red-600 focus:outline-none uppercase"
              />
              {maxSearchQuery && (
                <button
                  type="button"
                  onClick={() => setMaxSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filtry partii mięśniowych */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 shrink-0">
              {MUSCLE_GROUPS.map((group) => {
                const isActive = maxMuscleFilter === group;
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setMaxMuscleFilter(group)}
                    className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer shrink-0 border ${
                      isActive
                        ? 'bg-red-600 text-white border-red-500'
                        : 'bg-black text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {group}
                  </button>
                );
              })}
            </div>

            {/* Lista wyników */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 divide-y divide-zinc-900 min-h-[220px]">
              {filteredExercisesForMaxSearch.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500">
                  Nie znaleziono ćwiczeń dla zapytania „{maxSearchQuery}”.
                </div>
              ) : (
                filteredExercisesForMaxSearch.map((ex) => {
                  const isAlreadyTracked = trackedMaxExerciseIds.includes(ex.id!);

                  return (
                    <button
                      key={ex.id}
                      type="button"
                      disabled={isAlreadyTracked}
                      onClick={() => ex.id && handleAddTrackedMaxExercise(ex.id)}
                      className={`w-full text-left p-2.5 rounded-none transition-colors flex items-center justify-between gap-3 border ${
                        isAlreadyTracked
                          ? 'bg-zinc-900/30 border-zinc-800/60 text-zinc-500 cursor-not-allowed opacity-60'
                          : 'bg-black/60 hover:bg-zinc-900 border-zinc-800 hover:border-red-600 text-zinc-200 cursor-pointer'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wide truncate text-white">
                            {ex.name}
                          </span>
                          {isAlreadyTracked && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-400 border border-zinc-700 shrink-0">
                              Śledzone
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mt-0.5">
                          {ex.muscle_group}
                        </span>
                      </div>

                      <div className="shrink-0">
                        {isAlreadyTracked ? (
                          <Check className="h-4 w-4 text-zinc-500" />
                        ) : (
                          <span className="text-xs font-bold text-red-500 uppercase flex items-center gap-1">
                            <span>Dodaj</span>
                            <span className="text-sm font-bold leading-none">+</span>
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Stopka modalu */}
            <div className="pt-2 border-t border-zinc-800 text-[10px] text-zinc-500 flex items-center justify-between shrink-0">
              <span>Wyniki: {filteredExercisesForMaxSearch.length} z {exercises.length}</span>
              <span>Kliknij ćwiczenie, aby dodać do wykresu 1RM</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Custom Tooltip dla wykresu ćwiczeń w Dark Mode
function CustomChartTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded-none bg-black p-2.5 border-2 border-zinc-700 text-xs shadow-2xl">
        <div className="font-semibold text-white mb-0.5">{data.date}</div>
        <div className="text-red-500 font-bold">
          Ciężar: {data.weight} kg
        </div>
        {data.reps && (
          <div className="text-zinc-400 text-[11px]">
            Seria: {data.weight} kg × {data.reps} (RIR {data.rir})
          </div>
        )}
      </div>
    );
  }
  return null;
}

// Custom Tooltip dla wykresu 1RM w Dark Mode
function CustomMaxTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded-none bg-black p-2.5 border-2 border-zinc-700 text-xs shadow-2xl">
        <div className="font-semibold text-white mb-0.5">{data.date}</div>
        <div className="text-red-500 font-bold text-sm">
          1RM: {data.oneRepMax} kg
        </div>
        <div className="text-zinc-400 text-[11px] mt-0.5">
          Źródło: {data.source}
        </div>
        {data.details && (
          <div className="text-zinc-500 text-[10px] mt-0.5">
            {data.details}
          </div>
        )}
      </div>
    );
  }
  return null;
}

// Custom Tooltip dla wagi ciała w Dark Mode
function CustomWeightTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded-none bg-black p-2.5 border-2 border-zinc-700 text-xs shadow-2xl">
        <div className="text-zinc-400 text-[11px]">{data.fullDate}</div>
        <div className="font-bold text-red-500 mt-0.5">{data.weight} kg</div>
      </div>
    );
  }
  return null;
}
