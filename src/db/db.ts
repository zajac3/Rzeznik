import Dexie, { type Table } from 'dexie';

export type MuscleGroup = 'Klatka' | 'Plecy' | 'Nogi' | 'Barki' | 'Biceps' | 'Triceps' | 'Ramiona' | 'Brzuch' | 'Inne';

export interface Exercise {
  id?: number;
  name: string;
  muscle_group: MuscleGroup;
  calculate_1rm: boolean;
}

export type WorkoutStatus = 'planned' | 'in_progress' | 'completed';

export interface WorkoutDay {
  id?: number;
  date: string; // YYYY-MM-DD
  status: WorkoutStatus;
  notes?: string;
  routine_day_id?: number;
  routine_day_name?: string;
  cycle_id?: number;
}

export interface PlannedTask {
  id?: number;
  day_id: number;
  exercise_id: number;
  sort_order: number;
  target_sets?: number;
  is_extra?: boolean; // ćwiczenie dodane poza planem
}

export interface LoggedSet {
  id?: number;
  task_id: number;
  weight: number;
  reps: number;
  rir: number; // 0 - 5
  created_at: string; // ISO string
  exclude_from_1rm?: boolean;
}

export interface BodyWeightEntry {
  id?: number;
  date: string; // YYYY-MM-DD
  weight: number; // kg
  created_at?: string;
}

export interface Manual1RMEntry {
  id?: number;
  exercise_id: number;
  weight: number; // kg
  date: string; // YYYY-MM-DD
  created_at?: string;
}

// Nowy schemat Rutyny / Planu Treningowego
export interface RoutineDay {
  id?: number;
  day_number: number; // 1 do 7
  name: string; // np. "Dzień 1 - Push"
}

export interface RoutineExercise {
  id?: number;
  routine_day_id: number;
  exercise_id: number;
  target_sets: number; // np. 3, 4
  sort_order: number;
}

export interface FullTaskDetails extends PlannedTask {
  exercise?: Exercise;
  sets: LoggedSet[];
  totalTonnage: number;
  estimated1RM: number;
  target_sets?: number;
  is_extra?: boolean;
}

export interface FullDayDetails extends WorkoutDay {
  tasks: FullTaskDetails[];
  totalTonnage: number;
  totalSets: number;
}

export interface RecurringCycle {
  id?: number;
  routine_day_id: number;
  routine_day_name: string;
  mode: 'weekdays' | 'interval';
  weekdays?: number[]; // np. [1, 4]
  interval_days?: number; // np. 4
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  duration_type: '4' | '8' | 'indefinite';
  created_at: string;
}

export class PakomatDB extends Dexie {
  exercises!: Table<Exercise, number>;
  workoutDays!: Table<WorkoutDay, number>;
  plannedTasks!: Table<PlannedTask, number>;
  loggedSets!: Table<LoggedSet, number>;
  bodyWeights!: Table<BodyWeightEntry, number>;
  routineDays!: Table<RoutineDay, number>;
  routineExercises!: Table<RoutineExercise, number>;
  manual1RMs!: Table<Manual1RMEntry, number>;
  recurringCycles!: Table<RecurringCycle, number>;

  constructor() {
    super('PakomatDB');
    this.version(1).stores({
      exercises: '++id, name, muscle_group, calculate_1rm',
      workoutDays: '++id, &date, status',
      plannedTasks: '++id, day_id, exercise_id, sort_order',
      loggedSets: '++id, task_id, created_at',
    });
    this.version(2).stores({
      bodyWeights: '++id, &date',
    });
    this.version(3).stores({
      routineDays: '++id, day_number',
      routineExercises: '++id, routine_day_id, sort_order',
    });
    this.version(4).stores({
      manual1RMs: '++id, exercise_id, date',
    });
    this.version(5).stores({
      workoutDays: '++id, &date, status, routine_day_id',
    });
    this.version(6).stores({
      workoutDays: '++id, &date, status, routine_day_id, cycle_id',
      recurringCycles: '++id, routine_day_id, created_at',
    });
  }
}

export const db = new PakomatDB();

export async function addManual1RM(exerciseId: number, weight: number, date: string): Promise<number> {
  return await db.manual1RMs.add({
    exercise_id: exerciseId,
    weight: Math.round(weight * 10) / 10,
    date,
    created_at: new Date().toISOString(),
  });
}

export async function deleteManual1RM(id: number): Promise<void> {
  await db.manual1RMs.delete(id);
}

export async function delete1RMRecord(type: 'manual' | 'set', id: number): Promise<void> {
  if (type === 'manual') {
    await db.manual1RMs.delete(id);
  } else if (type === 'set') {
    // NIGDY nie usuwamy serii z treningu - oznaczamy ją jedynie jako wykluczoną z rekordów 1RM!
    await db.loggedSets.update(id, { exclude_from_1rm: true });
  }
}

export async function deleteExercise1RMRecords(exerciseId: number): Promise<void> {
  // 1. Usuń wpisy ręczne dla tego ćwiczenia
  await db.manual1RMs.where('exercise_id').equals(exerciseId).delete();

  // 2. Znajdź wszystkie serie powiązane z tym ćwiczeniem i oznacz jako wykluczone z 1RM (BEZ usuwania serii z treningów!)
  const tasks = await db.plannedTasks.where('exercise_id').equals(exerciseId).toArray();
  const taskIds = new Set(tasks.map((t) => t.id).filter((id): id is number => typeof id === 'number'));

  if (taskIds.size > 0) {
    const sets = await db.loggedSets.filter((s) => taskIds.has(s.task_id)).toArray();
    for (const s of sets) {
      if (s.id && !s.exclude_from_1rm) {
        await db.loggedSets.update(s.id, { exclude_from_1rm: true });
      }
    }
  }
}

export interface ExerciseHistoricalPR {
  exerciseId: number;
  maxWeight: number;
  max1RM: number;
  bestDate?: string;
  bestSetId?: number;
  bestManualId?: number;
}

export async function getHistoricalPRs(excludeDate?: string): Promise<Map<number, ExerciseHistoricalPR>> {
  const manual1RMs = await db.manual1RMs.toArray();
  const allDays = await db.workoutDays.toArray();
  const allTasks = await db.plannedTasks.toArray();
  const allSets = await db.loggedSets.toArray();

  const dayMap = new Map(allDays.map((d) => [d.id!, d]));
  const taskMap = new Map(allTasks.map((t) => [t.id!, t]));
  const map = new Map<number, ExerciseHistoricalPR>();

  // Przetwórz wpisy ręczne 1RM
  for (const m of manual1RMs) {
    if (excludeDate && m.date === excludeDate) continue;
    const current = map.get(m.exercise_id) || {
      exerciseId: m.exercise_id,
      maxWeight: 0,
      max1RM: 0,
    };
    if (m.weight > current.max1RM) {
      current.max1RM = m.weight;
      current.maxWeight = Math.max(current.maxWeight, m.weight);
      current.bestDate = m.date;
      current.bestManualId = m.id;
    } else {
      current.maxWeight = Math.max(current.maxWeight, m.weight);
    }
    map.set(m.exercise_id, current);
  }

  // Przetwórz wykonane serie
  for (const s of allSets) {
    if (s.exclude_from_1rm) continue;
    const task = taskMap.get(s.task_id);
    if (!task) continue;
    const day = dayMap.get(task.day_id);
    if (!day) continue;
    if (excludeDate && day.date === excludeDate) continue;

    const exId = task.exercise_id;
    const current = map.get(exId) || {
      exerciseId: exId,
      maxWeight: 0,
      max1RM: 0,
    };

    const est1RM = calculateEpley1RM(s.weight, s.reps);
    let updated = false;

    if (s.weight > current.maxWeight) {
      current.maxWeight = s.weight;
      updated = true;
    }
    if (est1RM > current.max1RM) {
      current.max1RM = est1RM;
      current.bestDate = day.date;
      current.bestSetId = s.id;
      updated = true;
    }

    if (updated || !map.has(exId)) {
      map.set(exId, current);
    }
  }

  return map;
}

export function isSetNewPR(
  weight: number,
  reps: number,
  priorPR?: ExerciseHistoricalPR | null
): boolean {
  if (weight <= 0) return false;
  if (!priorPR || (priorPR.maxWeight === 0 && priorPR.max1RM === 0)) {
    return true; // Pierwszy zapisany wynik stanowi ustanowienie rekordu
  }
  const est1RM = calculateEpley1RM(weight, reps);
  return weight > priorPR.maxWeight || est1RM > priorPR.max1RM;
}

// --- 1RM Epley Formula & Tonnage Helpers ---
/**
 * Oblicza szacowany 1RM z formuły Epleya:
 * 1RM = Ciężar * (1 + (Powtórzenia / 30))
 * Jeśli powtórzenia == 1, 1RM = Ciężar.
 */
export function calculateEpley1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(weight * 10) / 10;
  const raw = weight * (1 + reps / 30);
  return Math.round(raw * 10) / 10;
}

/**
 * Oblicza tonaż pojedynczej serii: Ciężar * Powtórzenia
 */
export function calculateSetTonnage(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  return Math.round(weight * reps * 10) / 10;
}

// --- Seed Default Exercises & Routine ---
export const DEFAULT_EXERCISES: Omit<Exercise, 'id'>[] = [
  // Klatka piersiowa
  { name: 'Wyciskanie sztangi na ławce poziomej', muscle_group: 'Klatka', calculate_1rm: true },
  { name: 'Wyciskanie hantli na ławce skośnej', muscle_group: 'Klatka', calculate_1rm: false },
  { name: 'Rozpiętki z hantlami', muscle_group: 'Klatka', calculate_1rm: false },
  { name: 'Pompki na poręczach', muscle_group: 'Klatka', calculate_1rm: false },
  { name: 'Krzyżowanie linek wyciągu', muscle_group: 'Klatka', calculate_1rm: false },
  { name: 'Wyciskanie sztangi na ławce ujemnej', muscle_group: 'Klatka', calculate_1rm: true },
  { name: 'Hammer press', muscle_group: 'Klatka', calculate_1rm: false },
  { name: 'Wyciskanie sztangi na ławce skośnej (Smith)', muscle_group: 'Klatka', calculate_1rm: true },

  // Plecy
  { name: 'Martwy ciąg', muscle_group: 'Plecy', calculate_1rm: true },
  { name: 'Podciąganie na drążku', muscle_group: 'Plecy', calculate_1rm: false },
  { name: 'Wiosłowanie sztangą w opadzie tułowia', muscle_group: 'Plecy', calculate_1rm: true },
  { name: 'Ściąganie drążka wyciągu górnego (chwyt neutralny)', muscle_group: 'Plecy', calculate_1rm: false },
  { name: 'Ściąganie drążka wyciągu górnego (nachwyt)', muscle_group: 'Plecy', calculate_1rm: false },
  { name: 'Wiosłowanie hantlem jednorącz', muscle_group: 'Plecy', calculate_1rm: false },
  { name: 'Narciarz (ściąganie na prostych rękach)', muscle_group: 'Plecy', calculate_1rm: false },
  { name: 'Pullover', muscle_group: 'Plecy', calculate_1rm: false },

  // Nogi
  { name: 'Przysiady ze sztangą na karku (Back Squat)', muscle_group: 'Nogi', calculate_1rm: true },
  { name: 'Przysiady przednie (Front Squat)', muscle_group: 'Nogi', calculate_1rm: true },
  { name: 'Wyciskanie nóg na suwnicy', muscle_group: 'Nogi', calculate_1rm: true },
  { name: 'Rumuński martwy ciąg (RDL)', muscle_group: 'Nogi', calculate_1rm: true },
  { name: 'Wykroki z hantlami', muscle_group: 'Nogi', calculate_1rm: false },
  { name: 'Uginanie podudzi na maszynie leżąc', muscle_group: 'Nogi', calculate_1rm: false },
  { name: 'Prostowanie nóg na maszynie siedząc', muscle_group: 'Nogi', calculate_1rm: false },
  { name: 'Wspięcia na palce stojąc', muscle_group: 'Nogi', calculate_1rm: false },

  // Barki
  { name: 'Wyciskanie żołnierskie (OHP)', muscle_group: 'Barki', calculate_1rm: true },
  { name: 'Wyciskanie hantli siedząc', muscle_group: 'Barki', calculate_1rm: false },
  { name: 'Wznosy ramion bokiem z hantlami', muscle_group: 'Barki', calculate_1rm: false },
  { name: 'Face pulls (przyciąganie liny do twarzy)', muscle_group: 'Barki', calculate_1rm: false },
  { name: 'Wznosy ramion przodem', muscle_group: 'Barki', calculate_1rm: false },
  { name: 'Odwrotne rozpiętki na maszynie', muscle_group: 'Barki', calculate_1rm: false },
  { name: 'Wznosy bokiem na wyciągu', muscle_group: 'Barki', calculate_1rm: false },

  // Biceps
  { name: 'Uginanie ramion ze sztangą prostą', muscle_group: 'Biceps', calculate_1rm: false },
  { name: 'Uginanie ramion z hantlami (z supinacją)', muscle_group: 'Biceps', calculate_1rm: false },
  { name: 'Uginanie młotkowe (Hammer curls)', muscle_group: 'Biceps', calculate_1rm: false },
  { name: 'Uginanie ramion na modlitewniku', muscle_group: 'Biceps', calculate_1rm: false },
  { name: 'Uginanie na wyciągu dolnym', muscle_group: 'Biceps', calculate_1rm: false },

  // Triceps
  { name: 'Wyciskanie francuskie sztangi leżąc (Skullcrushers)', muscle_group: 'Triceps', calculate_1rm: false },
  { name: 'Prostowanie ramion na wyciągu z liną', muscle_group: 'Triceps', calculate_1rm: false },
  { name: 'Pompki na wąsko', muscle_group: 'Triceps', calculate_1rm: false },
  { name: 'Dipsy na triceps', muscle_group: 'Triceps', calculate_1rm: false },
  { name: 'Wyciskanie sztangi wąskim chwytem', muscle_group: 'Triceps', calculate_1rm: true },
  { name: 'Kickbacki z hantlami', muscle_group: 'Triceps', calculate_1rm: false },

  // Brzuch
  { name: 'Allahy (spięcia brzucha na wyciągu)', muscle_group: 'Brzuch', calculate_1rm: false },
  { name: 'Wznosy nóg w zwisie na drążku', muscle_group: 'Brzuch', calculate_1rm: false },
  { name: 'Deska (Plank)', muscle_group: 'Brzuch', calculate_1rm: false },
  { name: 'Kółko (Ab roller)', muscle_group: 'Brzuch', calculate_1rm: false },
  { name: 'Brzuszki na ławce skośnej', muscle_group: 'Brzuch', calculate_1rm: false },
];

export async function ensureDefaultExercisesSeeded(): Promise<void> {
  const existingExercises = await db.exercises.toArray();

  // Migracja nazw starszych ćwiczeń domyślnych, aby nie dublować i zachować historię
  const RENAME_MAP: Record<string, { name: string; muscle_group: MuscleGroup }> = {
    'wyciskanie sztangi na ławce płaskiej': { name: 'Wyciskanie sztangi na ławce poziomej', muscle_group: 'Klatka' },
    'pompki na poręczach (dipy)': { name: 'Pompki na poręczach', muscle_group: 'Klatka' },
    'rozpiętki w bramie na wyciągu': { name: 'Rozpiętki z hantlami', muscle_group: 'Klatka' },
    'martwy ciąg klasyczny': { name: 'Martwy ciąg', muscle_group: 'Plecy' },
    'wiosłowanie sztangą w opadzie': { name: 'Wiosłowanie sztangą w opadzie tułowia', muscle_group: 'Plecy' },
    'przysiad ze sztangą na karku (high bar)': { name: 'Przysiady ze sztangą na karku (Back Squat)', muscle_group: 'Nogi' },
    'wyciskanie na suwnicy (leg press)': { name: 'Wyciskanie nóg na suwnicy', muscle_group: 'Nogi' },
    'wznosy łydek stojąc': { name: 'Wspięcia na palce stojąc', muscle_group: 'Nogi' },
    'uginanie nóg na maszynie leżąc': { name: 'Uginanie podudzi na maszynie leżąc', muscle_group: 'Nogi' },
    'wyciskanie żołnierskie (ohp)': { name: 'Wyciskanie żołnierskie (OHP)', muscle_group: 'Barki' },
    'wznosy hantli bokiem (lateral raises)': { name: 'Wznosy ramion bokiem z hantlami', muscle_group: 'Barki' },
    'face pulls na wyciągu': { name: 'Face pulls (przyciąganie liny do twarzy)', muscle_group: 'Barki' },
    'uginanie ramion ze sztangą (biceps)': { name: 'Uginanie ramion ze sztangą prostą', muscle_group: 'Biceps' },
    'uginanie ramion z hantlami z supinacją': { name: 'Uginanie ramion z hantlami (z supinacją)', muscle_group: 'Biceps' },
    'modlitewnik': { name: 'Uginanie ramion na modlitewniku', muscle_group: 'Biceps' },
    'wyciskanie francuskie sztangi leżąc (triceps)': { name: 'Wyciskanie francuskie sztangi leżąc (Skullcrushers)', muscle_group: 'Triceps' },
    'allahy na wyciągu': { name: 'Allahy (spięcia brzucha na wyciągu)', muscle_group: 'Brzuch' },
    'plank (deska)': { name: 'Deska (Plank)', muscle_group: 'Brzuch' },
  };

  for (const ex of existingExercises) {
    const key = ex.name.toLowerCase().trim();
    if (RENAME_MAP[key] && ex.id) {
      const target = RENAME_MAP[key];
      await db.exercises.update(ex.id, {
        name: target.name,
        muscle_group: target.muscle_group,
      });
      ex.name = target.name;
      ex.muscle_group = target.muscle_group;
    }
  }

  const updatedExercises = await db.exercises.toArray();
  const existingNames = new Set(updatedExercises.map((e) => e.name.toLowerCase().trim()));

  const toAdd: Omit<Exercise, 'id'>[] = [];
  for (const def of DEFAULT_EXERCISES) {
    if (!existingNames.has(def.name.toLowerCase().trim())) {
      toAdd.push(def);
    }
  }

  if (toAdd.length > 0) {
    await db.exercises.bulkAdd(toAdd);
  }
}

// --- Routine Plan CRUD Functions ---

export async function createRoutineDay(name: string): Promise<number> {
  const currentDays = await db.routineDays.toArray();
  const nextNumber = currentDays.length > 0 ? Math.max(...currentDays.map((d) => d.day_number)) + 1 : 1;
  return await db.routineDays.add({
    day_number: nextNumber,
    name: name.trim() || `Dzień ${nextNumber}`,
  });
}

export async function deleteRoutineDay(dayId: number): Promise<void> {
  await db.transaction('rw', [db.routineDays, db.routineExercises, db.workoutDays], async () => {
    await db.routineExercises.where('routine_day_id').equals(dayId).delete();
    await db.routineDays.delete(dayId);
    // Bezpieczne odpięcie usuniętego dnia treningowego z przypisanych dat
    await db.workoutDays.filter((w) => w.routine_day_id === dayId).modify((w) => {
      delete w.routine_day_id;
      delete w.routine_day_name;
    });
  });
}

export async function assignRoutineDayToDate(date: string, routineDayId: number): Promise<void> {
  const routineDay = await db.routineDays.get(routineDayId);
  if (!routineDay) return;

  const routineExs = await db.routineExercises.where('routine_day_id').equals(routineDayId).sortBy('sort_order');

  // Bezpieczne pobranie serii z poprzednich treningów PRZED otwarciem transakcji zapisu
  const exerciseSetsMap = new Map<number, Array<{ weight: number; reps: number; rir: number }>>();
  for (const re of routineExs) {
    const prevSets = await getLastLoggedSetsForExercise(
      date,
      re.exercise_id,
      routineDayId,
      routineDay.name
    );
    exerciseSetsMap.set(re.exercise_id, prevSets);
  }

  await db.transaction('rw', [db.workoutDays, db.plannedTasks, db.loggedSets], async () => {
    const existing = await db.workoutDays.where('date').equals(date).first();
    let dayId: number;

    if (existing && existing.id) {
      dayId = existing.id;
      await db.workoutDays.update(dayId, {
        routine_day_id: routineDayId,
        routine_day_name: routineDay.name,
      });

      // Usuń dotychczasowe zadania planu (które nie są 'extra') i ich serie
      const oldTasks = await db.plannedTasks.where('day_id').equals(dayId).toArray();
      const oldTaskIds = oldTasks.filter((t) => !t.is_extra).map((t) => t.id!).filter(Boolean);
      if (oldTaskIds.length > 0) {
        await db.loggedSets.where('task_id').anyOf(oldTaskIds).delete();
        await db.plannedTasks.where('id').anyOf(oldTaskIds).delete();
      }
    } else {
      dayId = await db.workoutDays.add({
        date,
        status: 'planned',
        routine_day_id: routineDayId,
        routine_day_name: routineDay.name,
      });
    }

    let hasAnyLoggedSets = false;

    // Bezpieczne klonowanie ćwiczeń z szablonu z automatycznym uzupełnianiem serii z poprzedniego treningu
    for (let idx = 0; idx < routineExs.length; idx++) {
      const re = routineExs[idx];
      const prevSets = exerciseSetsMap.get(re.exercise_id) || [];
      const baseTarget = re.target_sets && re.target_sets > 0 ? re.target_sets : 3;
      const targetSets = prevSets.length > 0 ? Math.max(baseTarget, prevSets.length) : baseTarget;

      const newTaskId = await db.plannedTasks.add({
        day_id: dayId,
        exercise_id: re.exercise_id,
        sort_order: re.sort_order ?? (idx + 1),
        target_sets: targetSets,
        is_extra: false,
      });

      if (prevSets.length > 0) {
        hasAnyLoggedSets = true;
        const setsToAdd: Omit<LoggedSet, 'id'>[] = prevSets.map((s) => ({
          task_id: newTaskId,
          weight: s.weight,
          reps: s.reps,
          rir: s.rir,
          created_at: new Date().toISOString(),
        }));
        await db.loggedSets.bulkAdd(setsToAdd);
      }
    }

    if (hasAnyLoggedSets) {
      await db.workoutDays.update(dayId, { status: 'in_progress' });
    }
  });
}

export interface BatchAssignResult {
  assignedCount: number;
  skippedCompletedCount: number;
  skippedExistingCount: number;
}

export async function assignRoutineDayToMultipleDates(
  dates: string[],
  routineDayId: number,
  options: {
    skipExistingPlanned?: boolean;
    skipCompleted?: boolean;
  } = {}
): Promise<BatchAssignResult> {
  const { skipExistingPlanned = false, skipCompleted = true } = options;
  const routineDay = await db.routineDays.get(routineDayId);
  if (!routineDay) {
    return { assignedCount: 0, skippedCompletedCount: 0, skippedExistingCount: 0 };
  }

  const routineExs = await db.routineExercises.where('routine_day_id').equals(routineDayId).sortBy('sort_order');

  let assignedCount = 0;
  let skippedCompletedCount = 0;
  let skippedExistingCount = 0;

  await db.transaction('rw', [db.workoutDays, db.plannedTasks, db.loggedSets], async () => {
    for (const date of dates) {
      const existing = await db.workoutDays.where('date').equals(date).first();

      if (existing && existing.id) {
        if (skipCompleted && existing.status === 'completed') {
          skippedCompletedCount++;
          continue;
        }

        if (skipExistingPlanned && (existing.routine_day_id || existing.routine_day_name)) {
          skippedExistingCount++;
          continue;
        }

        const dayId = existing.id;
        await db.workoutDays.update(dayId, {
          routine_day_id: routineDayId,
          routine_day_name: routineDay.name,
          status: existing.status === 'in_progress' ? 'in_progress' : 'planned',
        });

        // Usuń stare zadania z planu (które nie są 'extra') i ich serie
        const oldTasks = await db.plannedTasks.where('day_id').equals(dayId).toArray();
        const oldTaskIds = oldTasks.filter((t) => !t.is_extra).map((t) => t.id!).filter(Boolean);
        if (oldTaskIds.length > 0) {
          await db.loggedSets.where('task_id').anyOf(oldTaskIds).delete();
          await db.plannedTasks.where('id').anyOf(oldTaskIds).delete();
        }

        const tasksToAdd: Omit<PlannedTask, 'id'>[] = routineExs.map((re, idx) => ({
          day_id: dayId,
          exercise_id: re.exercise_id,
          sort_order: re.sort_order ?? (idx + 1),
          target_sets: re.target_sets || 3,
          is_extra: false,
        }));

        if (tasksToAdd.length > 0) {
          await db.plannedTasks.bulkAdd(tasksToAdd);
        }
        assignedCount++;
      } else {
        const dayId = await db.workoutDays.add({
          date,
          status: 'planned',
          routine_day_id: routineDayId,
          routine_day_name: routineDay.name,
        });

        const tasksToAdd: Omit<PlannedTask, 'id'>[] = routineExs.map((re, idx) => ({
          day_id: dayId,
          exercise_id: re.exercise_id,
          sort_order: re.sort_order ?? (idx + 1),
          target_sets: re.target_sets || 3,
          is_extra: false,
        }));

        if (tasksToAdd.length > 0) {
          await db.plannedTasks.bulkAdd(tasksToAdd);
        }
        assignedCount++;
      }
    }
  });

  return { assignedCount, skippedCompletedCount, skippedExistingCount };
}

export interface CreateRecurringCycleParams {
  routine_day_id: number;
  mode: 'weekdays' | 'interval';
  weekdays?: number[];
  interval_days?: number;
  start_date: string;
  end_date: string;
  duration_type: '4' | '8' | 'indefinite';
  dates: string[];
  skipExistingPlanned?: boolean;
}

export interface CreateRecurringCycleResult {
  cycleId: number;
  assignedCount: number;
  skippedCompletedCount: number;
  skippedExistingCount: number;
}

export async function createRecurringCycle(
  params: CreateRecurringCycleParams
): Promise<CreateRecurringCycleResult> {
  const {
    routine_day_id,
    mode,
    weekdays,
    interval_days,
    start_date,
    end_date,
    duration_type,
    dates,
    skipExistingPlanned = true,
  } = params;

  const routineDay = await db.routineDays.get(routine_day_id);
  const routineName = routineDay?.name || 'Trening';
  const routineExs = await db.routineExercises.where('routine_day_id').equals(routine_day_id).sortBy('sort_order');

  let assignedCount = 0;
  let skippedCompletedCount = 0;
  let skippedExistingCount = 0;
  let newCycleId = 0;

  await db.transaction(
    'rw',
    [db.recurringCycles, db.workoutDays, db.plannedTasks, db.loggedSets],
    async () => {
      newCycleId = await db.recurringCycles.add({
        routine_day_id,
        routine_day_name: routineName,
        mode,
        weekdays,
        interval_days,
        start_date,
        end_date,
        duration_type,
        created_at: new Date().toISOString(),
      });

      for (const date of dates) {
        const existing = await db.workoutDays.where('date').equals(date).first();

        if (existing && existing.id) {
          if (existing.status === 'completed') {
            skippedCompletedCount++;
            continue;
          }

          if (skipExistingPlanned && (existing.routine_day_id || existing.routine_day_name)) {
            skippedExistingCount++;
            continue;
          }

          const dayId = existing.id;
          await db.workoutDays.update(dayId, {
            routine_day_id,
            routine_day_name: routineName,
            cycle_id: newCycleId,
            status: existing.status === 'in_progress' ? 'in_progress' : 'planned',
          });

          const oldTasks = await db.plannedTasks.where('day_id').equals(dayId).toArray();
          const oldTaskIds = oldTasks.filter((t) => !t.is_extra).map((t) => t.id!).filter(Boolean);
          if (oldTaskIds.length > 0) {
            await db.loggedSets.where('task_id').anyOf(oldTaskIds).delete();
            await db.plannedTasks.where('id').anyOf(oldTaskIds).delete();
          }

          const tasksToAdd: Omit<PlannedTask, 'id'>[] = routineExs.map((re, idx) => ({
            day_id: dayId,
            exercise_id: re.exercise_id,
            sort_order: re.sort_order ?? (idx + 1),
            target_sets: re.target_sets || 3,
            is_extra: false,
          }));

          if (tasksToAdd.length > 0) {
            await db.plannedTasks.bulkAdd(tasksToAdd);
          }
          assignedCount++;
        } else {
          const dayId = await db.workoutDays.add({
            date,
            status: 'planned',
            routine_day_id,
            routine_day_name: routineName,
            cycle_id: newCycleId,
          });

          const tasksToAdd: Omit<PlannedTask, 'id'>[] = routineExs.map((re, idx) => ({
            day_id: dayId,
            exercise_id: re.exercise_id,
            sort_order: re.sort_order ?? (idx + 1),
            target_sets: re.target_sets || 3,
            is_extra: false,
          }));

          if (tasksToAdd.length > 0) {
            await db.plannedTasks.bulkAdd(tasksToAdd);
          }
          assignedCount++;
        }
      }
    }
  );

  return { cycleId: newCycleId, assignedCount, skippedCompletedCount, skippedExistingCount };
}

export async function deleteRecurringCycle(cycleId: number): Promise<{ removedSessionsCount: number }> {
  let removedSessionsCount = 0;
  await db.transaction('rw', [db.recurringCycles, db.workoutDays, db.plannedTasks, db.loggedSets], async () => {
    const days = await db.workoutDays.where('cycle_id').equals(cycleId).toArray();

    for (const day of days) {
      if (!day.id) continue;
      if (day.status === 'planned') {
        const tasks = await db.plannedTasks.where('day_id').equals(day.id).toArray();
        const taskIds = tasks.map((t) => t.id!).filter(Boolean);
        if (taskIds.length > 0) {
          await db.loggedSets.where('task_id').anyOf(taskIds).delete();
          await db.plannedTasks.where('id').anyOf(taskIds).delete();
        }
        await db.workoutDays.delete(day.id);
        removedSessionsCount++;
      } else {
        await db.workoutDays.update(day.id, { cycle_id: undefined });
      }
    }

    await db.recurringCycles.delete(cycleId);
  });

  return { removedSessionsCount };
}

export async function clearAllPlannedSessionsForRoutine(
  routineDayId: number
): Promise<{ removedSessionsCount: number }> {
  let removedSessionsCount = 0;
  await db.transaction('rw', [db.recurringCycles, db.workoutDays, db.plannedTasks, db.loggedSets], async () => {
    await db.recurringCycles.where('routine_day_id').equals(routineDayId).delete();

    const days = await db.workoutDays
      .where('routine_day_id')
      .equals(routineDayId)
      .filter((d) => d.status === 'planned')
      .toArray();

    for (const day of days) {
      if (!day.id) continue;
      const tasks = await db.plannedTasks.where('day_id').equals(day.id).toArray();
      const taskIds = tasks.map((t) => t.id!).filter(Boolean);
      if (taskIds.length > 0) {
        await db.loggedSets.where('task_id').anyOf(taskIds).delete();
        await db.plannedTasks.where('id').anyOf(taskIds).delete();
      }
      await db.workoutDays.delete(day.id);
      removedSessionsCount++;
    }
  });
  return { removedSessionsCount };
}

export async function clearPlannedWorkoutsInRange(
  startDate: string,
  endDate: string,
  routineDayId?: number
): Promise<number> {
  let count = 0;
  await db.transaction('rw', [db.workoutDays, db.plannedTasks, db.loggedSets], async () => {
    const allDays = await db.workoutDays
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray();

    const targetDays = allDays.filter(
      (d) => d.status === 'planned' && (!routineDayId || d.routine_day_id === routineDayId)
    );

    for (const day of targetDays) {
      if (day.id) {
        const tasks = await db.plannedTasks.where('day_id').equals(day.id).toArray();
        const taskIds = tasks.map((t) => t.id!).filter(Boolean);
        if (taskIds.length > 0) {
          await db.loggedSets.where('task_id').anyOf(taskIds).delete();
          await db.plannedTasks.where('id').anyOf(taskIds).delete();
        }
        await db.workoutDays.delete(day.id);
        count++;
      }
    }
  });
  return count;
}

export async function deleteWorkoutSessionById(dayId: number): Promise<void> {
  await db.transaction('rw', [db.workoutDays, db.plannedTasks, db.loggedSets], async () => {
    const tasks = await db.plannedTasks.where('day_id').equals(dayId).toArray();
    const taskIds = tasks.map((t) => t.id!).filter(Boolean);
    if (taskIds.length > 0) {
      await db.loggedSets.where('task_id').anyOf(taskIds).delete();
      await db.plannedTasks.where('id').anyOf(taskIds).delete();
    }
    await db.plannedTasks.where('day_id').equals(dayId).delete();
    await db.workoutDays.delete(dayId);
  });
}

export async function deleteWorkoutSessionByDate(date: string): Promise<void> {
  const matchingDays = await db.workoutDays.where('date').equals(date).toArray();
  const dayIds = matchingDays.map((d) => d.id!).filter(Boolean);

  await db.transaction('rw', [db.workoutDays, db.plannedTasks, db.loggedSets], async () => {
    if (dayIds.length > 0) {
      const tasks = await db.plannedTasks.where('day_id').anyOf(dayIds).toArray();
      const taskIds = tasks.map((t) => t.id!).filter(Boolean);
      if (taskIds.length > 0) {
        await db.loggedSets.where('task_id').anyOf(taskIds).delete();
        await db.plannedTasks.where('id').anyOf(taskIds).delete();
      }
      await db.plannedTasks.where('day_id').anyOf(dayIds).delete();
      await db.workoutDays.where('id').anyOf(dayIds).delete();
    }
  });
}

export async function unassignRoutineDayFromDate(date: string): Promise<void> {
  await deleteWorkoutSessionByDate(date);
}

// --- Routine Plan Functions ---

export async function setRoutineDaysCount(targetCount: number): Promise<void> {
  const clamped = Math.max(1, Math.min(7, targetCount));
  const currentDays = await db.routineDays.orderBy('day_number').toArray();

  if (currentDays.length === clamped) return;

  if (currentDays.length < clamped) {
    // Add missing days
    for (let i = currentDays.length + 1; i <= clamped; i++) {
      await db.routineDays.add({
        day_number: i,
        name: `Dzień ${i}`,
      });
    }
  } else {
    // Remove extra days and their exercises
    const toRemove = currentDays.slice(clamped);
    const toRemoveIds = toRemove.map((d) => d.id!).filter(Boolean);
    await db.transaction('rw', db.routineDays, db.routineExercises, async () => {
      await db.routineExercises.where('routine_day_id').anyOf(toRemoveIds).delete();
      await db.routineDays.where('id').anyOf(toRemoveIds).delete();
    });
  }
}

export async function updateRoutineDayName(dayId: number, name: string): Promise<void> {
  await db.routineDays.update(dayId, { name });
  await db.workoutDays.where('routine_day_id').equals(dayId).modify({ routine_day_name: name });
}

export async function syncNewRoutineExerciseToWorkoutDays(
  routineDayId: number,
  exerciseId: number,
  targetSets: number = 3,
  sortOrder?: number
): Promise<void> {
  const routineDay = await db.routineDays.get(routineDayId);
  const openWorkoutDays = await db.workoutDays
    .where('routine_day_id')
    .equals(routineDayId)
    .filter((d) => d.status !== 'completed')
    .toArray();

  for (const day of openWorkoutDays) {
    if (!day.id) continue;
    const existingTask = await db.plannedTasks
      .where('day_id')
      .equals(day.id)
      .filter((t) => t.exercise_id === exerciseId)
      .first();

    if (!existingTask) {
      const allTasks = await db.plannedTasks.where('day_id').equals(day.id).toArray();
      const nextSortOrder = sortOrder ?? (allTasks.length > 0 ? Math.max(...allTasks.map((t) => t.sort_order)) + 1 : 1);
      const prevSets = await getLastLoggedSetsForExercise(
        day.date,
        exerciseId,
        routineDayId,
        routineDay?.name
      );
      const effTargetSets = prevSets.length > 0 ? Math.max(targetSets, prevSets.length) : targetSets;

      const newTaskId = await db.plannedTasks.add({
        day_id: day.id,
        exercise_id: exerciseId,
        target_sets: Math.max(1, effTargetSets),
        sort_order: nextSortOrder,
        is_extra: false,
      });

      if (prevSets.length > 0) {
        const setsToAdd: Omit<LoggedSet, 'id'>[] = prevSets.map((s) => ({
          task_id: newTaskId,
          weight: s.weight,
          reps: s.reps,
          rir: s.rir,
          created_at: new Date().toISOString(),
        }));
        await db.loggedSets.bulkAdd(setsToAdd);
        if (day.status === 'planned') {
          await db.workoutDays.update(day.id, { status: 'in_progress' });
        }
      }
    }
  }
}

export async function addExerciseToRoutineDay(
  routineDayId: number,
  exerciseId: number,
  targetSets: number = 3
): Promise<number> {
  const current = await db.routineExercises.where('routine_day_id').equals(routineDayId).toArray();
  const nextOrder = current.length > 0 ? Math.max(...current.map((e) => e.sort_order)) + 1 : 1;
  const newRoutineExId = await db.routineExercises.add({
    routine_day_id: routineDayId,
    exercise_id: exerciseId,
    target_sets: Math.max(1, targetSets),
    sort_order: nextOrder,
  });

  // Automatyczna synchronizacja z dniami treningowymi przypisanymi do tego szablonu
  await syncNewRoutineExerciseToWorkoutDays(routineDayId, exerciseId, targetSets, nextOrder);

  return newRoutineExId;
}

export async function removeExerciseFromRoutineDay(routineExerciseId: number): Promise<void> {
  const re = await db.routineExercises.get(routineExerciseId);
  if (!re) return;
  await db.routineExercises.delete(routineExerciseId);

  // Synchronizacja usunięcia z otwartych dni treningowych, w których nie zarejestrowano jeszcze serii
  if (re.routine_day_id) {
    const openDays = await db.workoutDays
      .where('routine_day_id')
      .equals(re.routine_day_id)
      .filter((d) => d.status !== 'completed')
      .toArray();

    for (const day of openDays) {
      if (!day.id) continue;
      const tasks = await db.plannedTasks
        .where('day_id')
        .equals(day.id)
        .filter((t) => !t.is_extra && t.exercise_id === re.exercise_id)
        .toArray();

      for (const t of tasks) {
        if (!t.id) continue;
        const setsCount = await db.loggedSets.where('task_id').equals(t.id).count();
        if (setsCount === 0) {
          await db.plannedTasks.delete(t.id);
        }
      }
    }
  }
}

export async function updateRoutineExerciseTargetSets(
  routineExerciseId: number,
  targetSets: number
): Promise<void> {
  const re = await db.routineExercises.get(routineExerciseId);
  await db.routineExercises.update(routineExerciseId, {
    target_sets: Math.max(1, targetSets),
  });

  if (re && re.routine_day_id) {
    const openDays = await db.workoutDays
      .where('routine_day_id')
      .equals(re.routine_day_id)
      .filter((d) => d.status !== 'completed')
      .toArray();

    for (const day of openDays) {
      if (!day.id) continue;
      const tasks = await db.plannedTasks
        .where('day_id')
        .equals(day.id)
        .filter((t) => !t.is_extra && t.exercise_id === re.exercise_id)
        .toArray();

      for (const t of tasks) {
        if (!t.id) continue;
        const setsCount = await db.loggedSets.where('task_id').equals(t.id).count();
        if (setsCount === 0) {
          await db.plannedTasks.update(t.id, { target_sets: Math.max(1, targetSets) });
        }
      }
    }
  }
}

// --- Workout Session / Day Execution Functions ---

export async function getOrCreateWorkoutDay(
  date: string,
  status: WorkoutStatus = 'in_progress',
  routineDayId?: number,
  routineDayName?: string
): Promise<WorkoutDay> {
  return await db.transaction('rw', db.workoutDays, async () => {
    const existing = await db.workoutDays.where('date').equals(date).first();
    if (existing && existing.id) {
      if (routineDayId && !existing.routine_day_id) {
        await db.workoutDays.update(existing.id, {
          routine_day_id: routineDayId,
          routine_day_name: routineDayName,
        });
        existing.routine_day_id = routineDayId;
        existing.routine_day_name = routineDayName;
      }
      return existing;
    }

    const id = await db.workoutDays.add({
      date,
      status,
      notes: '',
      routine_day_id: routineDayId,
      routine_day_name: routineDayName,
    });
    return { id, date, status, notes: '', routine_day_id: routineDayId, routine_day_name: routineDayName };
  });
}

export async function loadRoutineIntoWorkoutDay(dayId: number, routineDayId: number): Promise<void> {
  const routineDay = await db.routineDays.get(routineDayId);
  if (!routineDay) return;

  const routineExs = await db.routineExercises.where('routine_day_id').equals(routineDayId).sortBy('sort_order');

  await db.transaction('rw', [db.workoutDays, db.plannedTasks], async () => {
    await db.workoutDays.update(dayId, {
      routine_day_id: routineDayId,
      routine_day_name: routineDay.name || `Dzień ${routineDay.day_number}`,
    });

    // Sprawdź czy już istnieją zadania przypisane do tego dnia
    const existingTasks = await db.plannedTasks.where('day_id').equals(dayId).toArray();
    if (existingTasks.some((t) => !t.is_extra)) {
      // Zadania z szablonu zostały już wcześniej dodane - zapobiegaj duplikatom
      return;
    }

    const tasksToAdd: Omit<PlannedTask, 'id'>[] = routineExs.map((re, idx) => ({
      day_id: dayId,
      exercise_id: re.exercise_id,
      sort_order: re.sort_order ?? (idx + 1),
      target_sets: re.target_sets || 3,
      is_extra: false,
    }));

    if (tasksToAdd.length > 0) {
      await db.plannedTasks.bulkAdd(tasksToAdd);
    }
  });
}

export async function addExtraExerciseToWorkoutDay(
  dayId: number,
  exerciseId: number,
  targetSets: number = 0
): Promise<number> {
  const currentTasks = await db.plannedTasks.where('day_id').equals(dayId).toArray();
  const nextOrder = currentTasks.length > 0 ? Math.max(...currentTasks.map((t) => t.sort_order)) + 1 : 1;
  return await db.plannedTasks.add({
    day_id: dayId,
    exercise_id: exerciseId,
    sort_order: nextOrder,
    target_sets: Math.max(0, targetSets),
    is_extra: true,
  });
}

export async function updateWorkoutDayStatus(dayId: number, status: WorkoutStatus): Promise<void> {
  await db.workoutDays.update(dayId, { status });
}

export async function updateWorkoutDayNotes(dayId: number, notes: string): Promise<void> {
  await db.workoutDays.update(dayId, { notes });
}

export async function saveWorkoutDayNotesByDate(date: string, notes: string): Promise<void> {
  const trimmed = (notes ?? '').trim();
  await db.transaction('rw', [db.workoutDays, db.plannedTasks], async () => {
    const existing = await db.workoutDays.where('date').equals(date).first();
    if (existing && existing.id) {
      const tasksCount = await db.plannedTasks.where('day_id').equals(existing.id).count();
      // Jeśli notatka została wyczyszczona i dzień nie ma szablonu ani żadnych zadań/ćwiczeń,
      // usuń pusty wpis, aby nie tworzyć pustego szablonu w historii
      if (!trimmed && tasksCount === 0 && !existing.routine_day_id && !existing.routine_day_name) {
        await db.workoutDays.delete(existing.id);
        return;
      }
      await db.workoutDays.update(existing.id, { notes: notes ?? '' });
    } else {
      if (trimmed) {
        await db.workoutDays.add({
          date,
          status: 'in_progress',
          notes: notes ?? '',
        });
      }
    }
  });
}

export async function deleteWorkoutDay(dayId: number): Promise<void> {
  await deleteWorkoutSessionById(dayId);
}

export interface PreviousWorkoutSummary {
  dayId: number;
  date: string;
  routineDayId?: number;
  routineDayName?: string;
  tasksCount: number;
  setsCount: number;
}

export async function findLastWorkoutSessionOfType(
  currentDate: string,
  routineDayId?: number,
  routineDayName?: string
): Promise<PreviousWorkoutSummary | null> {
  if (!routineDayId && (!routineDayName || routineDayName.trim() === '')) {
    return null;
  }

  const allDays = await db.workoutDays.where('date').below(currentDate).reverse().sortBy('date');

  for (const day of allDays) {
    if (!day.id) continue;

    // Sprawdź czy pasuje do typu rutyny
    const hasRoutineFilter = Boolean(routineDayId || (routineDayName && routineDayName.trim() !== ''));
    if (hasRoutineFilter) {
      const idMatch = routineDayId && day.routine_day_id === routineDayId;
      const nameMatch =
        routineDayName &&
        day.routine_day_name &&
        routineDayName.trim().toLowerCase() === day.routine_day_name.trim().toLowerCase();
      if (!idMatch && !nameMatch) continue;
    }

    // Sesja musi mieć zarejestrowane serie
    const tasks = await db.plannedTasks.where('day_id').equals(day.id).toArray();
    const taskIds = tasks.map((t) => t.id!).filter(Boolean);
    if (taskIds.length === 0) continue;

    const setsCount = await db.loggedSets.where('task_id').anyOf(taskIds).count();
    if (setsCount > 0) {
      return {
        dayId: day.id,
        date: day.date,
        routineDayId: day.routine_day_id,
        routineDayName: day.routine_day_name,
        tasksCount: tasks.length,
        setsCount,
      };
    }
  }

  return null;
}

export async function getLastLoggedSetsForExercise(
  currentDate: string,
  exerciseId: number,
  preferredRoutineDayId?: number,
  preferredRoutineDayName?: string
): Promise<Array<{ weight: number; reps: number; rir: number }>> {
  // 1. Sprawdź czy istnieje wcześniejsza sesja tego samego szablonu
  if (preferredRoutineDayId || (preferredRoutineDayName && preferredRoutineDayName.trim() !== '')) {
    const prevSession = await findLastWorkoutSessionOfType(
      currentDate,
      preferredRoutineDayId,
      preferredRoutineDayName
    );
    if (prevSession && prevSession.dayId) {
      const task = await db.plannedTasks
        .where('day_id')
        .equals(prevSession.dayId)
        .and((t) => t.exercise_id === exerciseId)
        .first();
      if (task && task.id) {
        const sets = await db.loggedSets.where('task_id').equals(task.id).sortBy('id');
        if (sets.length > 0) {
          return sets.map((s) => ({ weight: s.weight, reps: s.reps, rir: s.rir }));
        }
      }
    }
  }

  // 2. Jeśli nie ma w sesji tego samego szablonu, znajdź ostatni jakikolwiek trening przed tą datą z tym ćwiczeniem
  const pastDays = await db.workoutDays.where('date').below(currentDate).reverse().sortBy('date');
  for (const day of pastDays) {
    if (!day.id) continue;
    const task = await db.plannedTasks
      .where('day_id')
      .equals(day.id)
      .and((t) => t.exercise_id === exerciseId)
      .first();
    if (task && task.id) {
      const sets = await db.loggedSets.where('task_id').equals(task.id).sortBy('id');
      if (sets.length > 0) {
        return sets.map((s) => ({ weight: s.weight, reps: s.reps, rir: s.rir }));
      }
    }
  }

  return [];
}

export async function clearWorkoutDaySets(dayId: number): Promise<number> {
  const tasks = await db.plannedTasks.where('day_id').equals(dayId).toArray();
  const taskIds = tasks.map((t) => t.id!).filter(Boolean);
  if (taskIds.length === 0) return 0;

  let clearedCount = 0;
  await db.transaction('rw', [db.workoutDays, db.loggedSets], async () => {
    clearedCount = await db.loggedSets.where('task_id').anyOf(taskIds).delete();
    await db.workoutDays.update(dayId, { status: 'planned' });
  });

  return clearedCount;
}

export async function copyPreviousWorkoutSession(
  targetDate: string,
  sourceDayId: number
): Promise<{ tasksCopied: number; setsCopied: number }> {
  const sourceDay = await db.workoutDays.get(sourceDayId);
  if (!sourceDay) throw new Error('Nie odnaleziono poprzedniego treningu.');

  const sourceTasks = await db.plannedTasks.where('day_id').equals(sourceDayId).sortBy('sort_order');
  const sourceTaskIds = sourceTasks.map((t) => t.id!).filter(Boolean);
  const sourceSets = sourceTaskIds.length > 0 ? await db.loggedSets.where('task_id').anyOf(sourceTaskIds).toArray() : [];

  let tasksCopied = 0;
  let setsCopied = 0;

  await db.transaction('rw', [db.workoutDays, db.plannedTasks, db.loggedSets], async () => {
    let targetDay = await db.workoutDays.where('date').equals(targetDate).first();
    let targetDayId: number;

    if (targetDay && targetDay.id) {
      targetDayId = targetDay.id;
      await db.workoutDays.update(targetDayId, {
        routine_day_id: sourceDay.routine_day_id,
        routine_day_name: sourceDay.routine_day_name,
        status: 'in_progress',
      });
    } else {
      targetDayId = await db.workoutDays.add({
        date: targetDate,
        status: 'in_progress',
        routine_day_id: sourceDay.routine_day_id,
        routine_day_name: sourceDay.routine_day_name,
        notes: '',
      });
    }

    // Usuń dotychczasowe zadania i serie dla tego dnia
    const existingTasks = await db.plannedTasks.where('day_id').equals(targetDayId).toArray();
    const existingTaskIds = existingTasks.map((t) => t.id!).filter(Boolean);
    if (existingTaskIds.length > 0) {
      await db.loggedSets.where('task_id').anyOf(existingTaskIds).delete();
      await db.plannedTasks.where('id').anyOf(existingTaskIds).delete();
    }

    // Skopiuj zadania z poprzedniej sesji
    for (const st of sourceTasks) {
      const newTaskId = await db.plannedTasks.add({
        day_id: targetDayId,
        exercise_id: st.exercise_id,
        sort_order: st.sort_order,
        target_sets: st.target_sets,
        is_extra: st.is_extra,
      });
      tasksCopied++;

      const taskSets = sourceSets.filter((s) => s.task_id === st.id);
      taskSets.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

      const setsToAdd: Omit<LoggedSet, 'id'>[] = taskSets.map((s) => ({
        task_id: newTaskId,
        weight: s.weight,
        reps: s.reps,
        rir: s.rir,
        created_at: new Date().toISOString(),
      }));

      if (setsToAdd.length > 0) {
        await db.loggedSets.bulkAdd(setsToAdd);
        setsCopied += setsToAdd.length;
      }
    }
  });

  return { tasksCopied, setsCopied };
}

export async function syncWorkoutDayWithRoutine(date: string): Promise<boolean> {
  const day = await db.workoutDays.where('date').equals(date).first();
  if (!day || !day.id) return false;

  // Synchronizacja: jeśli dzień ma przypisany szablon i nie jest zakończony,
  // uzupełniamy brakujące ćwiczenia dodane do szablonu
  if (day.routine_day_id && day.status !== 'completed') {
    const routineExs = await db.routineExercises
      .where('routine_day_id')
      .equals(day.routine_day_id)
      .sortBy('sort_order');

    if (routineExs.length > 0) {
      const currentTasks = await db.plannedTasks.where('day_id').equals(day.id).toArray();
      const existingExIds = new Set(currentTasks.filter((t) => !t.is_extra).map((t) => t.exercise_id));

      const missing = routineExs.filter((re) => !existingExIds.has(re.exercise_id));
      if (missing.length > 0) {
        let maxOrder = currentTasks.length > 0 ? Math.max(...currentTasks.map((t) => t.sort_order)) : 0;
        let anySetsAdded = false;

        for (const re of missing) {
          const prevSets = await getLastLoggedSetsForExercise(
            day.date,
            re.exercise_id,
            day.routine_day_id,
            day.routine_day_name
          );
          const baseTarget = re.target_sets && re.target_sets > 0 ? re.target_sets : 3;
          const targetSets = prevSets.length > 0 ? Math.max(baseTarget, prevSets.length) : baseTarget;
          const newTaskId = await db.plannedTasks.add({
            day_id: day.id,
            exercise_id: re.exercise_id,
            target_sets: targetSets,
            sort_order: re.sort_order ?? ++maxOrder,
            is_extra: false,
          });

          if (prevSets.length > 0) {
            anySetsAdded = true;
            const setsToAdd: Omit<LoggedSet, 'id'>[] = prevSets.map((s) => ({
              task_id: newTaskId,
              weight: s.weight,
              reps: s.reps,
              rir: s.rir,
              created_at: new Date().toISOString(),
            }));
            await db.loggedSets.bulkAdd(setsToAdd);
          }
        }

        if (anySetsAdded && day.status === 'planned') {
          await db.workoutDays.update(day.id, { status: 'in_progress' });
        }
        return true;
      }
    }
  }
  return false;
}

export async function getFullDayDetails(date: string): Promise<FullDayDetails | null> {
  const day = await db.workoutDays.where('date').equals(date).first();
  if (!day || !day.id) return null;

  const rawTasks = await db.plannedTasks.where('day_id').equals(day.id).sortBy('sort_order');
  // Zabezpieczenie przed zduplikowanymi zadaniami w bazie
  const seenExerciseIds = new Set<number>();
  const tasks = rawTasks.filter((task) => {
    if (task.is_extra) return true;
    if (seenExerciseIds.has(task.exercise_id)) {
      return false;
    }
    seenExerciseIds.add(task.exercise_id);
    return true;
  });

  const taskIds = tasks.map((t) => t.id!).filter(Boolean);
  const allSets = taskIds.length > 0 ? await db.loggedSets.where('task_id').anyOf(taskIds).toArray() : [];
  const exercises = await db.exercises.toArray();
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

  let totalDayTonnage = 0;
  let totalDaySets = 0;

  const enrichedTasks: FullTaskDetails[] = tasks.map((task) => {
    const exercise = task.exercise_id ? exerciseMap.get(task.exercise_id) : undefined;
    const taskSets = allSets.filter((s) => s.task_id === task.id);
    taskSets.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    let taskTonnage = 0;
    let max1RM = 0;

    for (const set of taskSets) {
      taskTonnage += calculateSetTonnage(set.weight, set.reps);
      if (exercise?.calculate_1rm) {
        const est1RM = calculateEpley1RM(set.weight, set.reps);
        if (est1RM > max1RM) max1RM = est1RM;
      }
    }

    totalDayTonnage += taskTonnage;
    totalDaySets += taskSets.length;

    return {
      ...task,
      exercise,
      sets: taskSets,
      totalTonnage: Math.round(taskTonnage * 10) / 10,
      estimated1RM: max1RM,
      target_sets: task.is_extra ? (task.target_sets ?? 0) : (task.target_sets || 3),
      is_extra: task.is_extra || false,
    };
  });

  return {
    ...day,
    notes: day.notes ?? '',
    tasks: enrichedTasks ?? [],
    totalTonnage: Math.round(totalDayTonnage * 10) / 10,
    totalSets: totalDaySets,
  };
}

export async function addExerciseToDay(
  dayId: number,
  exerciseId: number,
  targetSets: number = 3
): Promise<number> {
  const currentTasks = await db.plannedTasks.where('day_id').equals(dayId).toArray();
  const nextOrder = currentTasks.length > 0 ? Math.max(...currentTasks.map((t) => t.sort_order)) + 1 : 1;
  return await db.plannedTasks.add({
    day_id: dayId,
    exercise_id: exerciseId,
    sort_order: nextOrder,
    target_sets: targetSets,
  });
}

export async function removeTaskFromDay(taskId: number): Promise<void> {
  await db.transaction('rw', [db.workoutDays, db.plannedTasks, db.loggedSets], async () => {
    const task = await db.plannedTasks.get(taskId);
    if (!task) return;

    await db.loggedSets.where('task_id').equals(taskId).delete();
    await db.plannedTasks.delete(taskId);

    const remainingTasks = await db.plannedTasks.where('day_id').equals(task.day_id).count();
    if (remainingTasks === 0) {
      await db.workoutDays.delete(task.day_id);
    }
  });
}

export async function movePlannedTask(dayId: number, taskId: number, direction: 'up' | 'down'): Promise<void> {
  const tasks = await db.plannedTasks.where('day_id').equals(dayId).sortBy('sort_order');
  const index = tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= tasks.length) return;

  // Swap tasks in array
  const temp = tasks[index];
  tasks[index] = tasks[targetIndex];
  tasks[targetIndex] = temp;

  await db.transaction('rw', db.plannedTasks, async () => {
    for (let i = 0; i < tasks.length; i++) {
      if (tasks[i].id) {
        await db.plannedTasks.update(tasks[i].id!, { sort_order: i });
      }
    }
  });
}

export async function reorderPlannedTasksList(dayId: number, taskIdsInOrder: number[]): Promise<void> {
  await db.transaction('rw', db.plannedTasks, async () => {
    for (let i = 0; i < taskIdsInOrder.length; i++) {
      await db.plannedTasks.update(taskIdsInOrder[i], { sort_order: i });
    }
  });
}

export async function addLoggedSet(taskId: number, weight: number, reps: number, rir: number): Promise<number> {
  return await db.loggedSets.add({
    task_id: taskId,
    weight: Math.max(0, weight),
    reps: Math.max(0, reps),
    rir: Math.min(5, Math.max(0, rir)),
    created_at: new Date().toISOString(),
  });
}

export async function updateLoggedSet(
  setId: number,
  updates: Partial<Pick<LoggedSet, 'weight' | 'reps' | 'rir'>>
): Promise<void> {
  await db.loggedSets.update(setId, updates);
}

export async function deleteLoggedSet(setId: number): Promise<void> {
  await db.loggedSets.delete(setId);
}

// --- Body Weight Management ---
export async function addOrUpdateBodyWeight(date: string, weight: number): Promise<void> {
  const existing = await db.bodyWeights.where('date').equals(date).first();
  if (existing && existing.id) {
    await db.bodyWeights.update(existing.id, { weight, created_at: new Date().toISOString() });
  } else {
    await db.bodyWeights.add({
      date,
      weight,
      created_at: new Date().toISOString(),
    });
  }
}

export async function updateBodyWeight(id: number, weight: number): Promise<void> {
  await db.bodyWeights.update(id, { weight, created_at: new Date().toISOString() });
}

export async function deleteBodyWeight(id: number): Promise<void> {
  await db.bodyWeights.delete(id);
}

// --- Backup & Restore (JSON) ---
export interface PakomatBackupData {
  version: number;
  exportedAt: string;
  appName: string;
  exercises: Exercise[];
  workoutDays: WorkoutDay[];
  plannedTasks: PlannedTask[];
  loggedSets: LoggedSet[];
  bodyWeights?: BodyWeightEntry[];
  routineDays?: RoutineDay[];
  routineExercises?: RoutineExercise[];
  manual1RMs?: Manual1RMEntry[];
}

export async function exportDatabaseToJson(): Promise<string> {
  const exercises = await db.exercises.toArray();
  const workoutDays = await db.workoutDays.toArray();
  const plannedTasks = await db.plannedTasks.toArray();
  const loggedSets = await db.loggedSets.toArray();
  const bodyWeights = await db.bodyWeights.toArray();
  const routineDays = await db.routineDays.toArray();
  const routineExercises = await db.routineExercises.toArray();
  const manual1RMs = await db.manual1RMs.toArray();

  const backup: PakomatBackupData = {
    version: 4,
    exportedAt: new Date().toISOString(),
    appName: 'Pakomat',
    exercises,
    workoutDays,
    plannedTasks,
    loggedSets,
    bodyWeights,
    routineDays,
    routineExercises,
    manual1RMs,
  };

  return JSON.stringify(backup, null, 2);
}

export async function importDatabaseFromJson(jsonString: string, mode: 'replace' | 'merge' = 'replace'): Promise<{
  exercisesCount: number;
  daysCount: number;
  tasksCount: number;
  setsCount: number;
  weightsCount: number;
  manual1RMsCount: number;
}> {
  const parsed = JSON.parse(jsonString) as PakomatBackupData;

  if (!parsed.exercises || !parsed.workoutDays || !parsed.plannedTasks || !parsed.loggedSets) {
    throw new Error('Nieprawidłowy format pliku kopii zapasowej (.json)');
  }

  const weights = parsed.bodyWeights || [];
  const routines = parsed.routineDays || [];
  const routineExs = parsed.routineExercises || [];
  const manual1RMs = parsed.manual1RMs || [];

  if (mode === 'replace') {
    await db.transaction(
      'rw',
      [
        db.exercises,
        db.workoutDays,
        db.plannedTasks,
        db.loggedSets,
        db.bodyWeights,
        db.routineDays,
        db.routineExercises,
        db.manual1RMs,
      ],
      async () => {
        await db.loggedSets.clear();
        await db.plannedTasks.clear();
        await db.workoutDays.clear();
        await db.exercises.clear();
        await db.bodyWeights.clear();
        await db.routineDays.clear();
        await db.routineExercises.clear();
        await db.manual1RMs.clear();

        await db.exercises.bulkAdd(parsed.exercises);
        await db.workoutDays.bulkAdd(parsed.workoutDays);
        await db.plannedTasks.bulkAdd(parsed.plannedTasks);
        await db.loggedSets.bulkAdd(parsed.loggedSets);
        if (weights.length > 0) {
          await db.bodyWeights.bulkAdd(weights);
        }
        if (routines.length > 0) {
          await db.routineDays.bulkAdd(routines);
        }
        if (routineExs.length > 0) {
          await db.routineExercises.bulkAdd(routineExs);
        }
        if (manual1RMs.length > 0) {
          await db.manual1RMs.bulkAdd(manual1RMs);
        }
      }
    );
  } else {
    // Merge mode
    await db.transaction(
      'rw',
      [
        db.exercises,
        db.workoutDays,
        db.plannedTasks,
        db.loggedSets,
        db.bodyWeights,
        db.routineDays,
        db.routineExercises,
        db.manual1RMs,
      ],
      async () => {
        for (const ex of parsed.exercises) {
          const exists = await db.exercises.where('name').equalsIgnoreCase(ex.name).first();
          if (!exists) {
            await db.exercises.add({ name: ex.name, muscle_group: ex.muscle_group, calculate_1rm: ex.calculate_1rm });
          }
        }

        for (const day of parsed.workoutDays) {
          const exists = await db.workoutDays.where('date').equals(day.date).first();
          if (!exists) {
            await db.workoutDays.add(day);
          }
        }

        for (const task of parsed.plannedTasks) {
          await db.plannedTasks.add(task);
        }
        for (const set of parsed.loggedSets) {
          await db.loggedSets.add(set);
        }
        for (const bw of weights) {
          const exists = await db.bodyWeights.where('date').equals(bw.date).first();
          if (!exists) {
            await db.bodyWeights.add(bw);
          }
        }
        for (const m of manual1RMs) {
          await db.manual1RMs.add(m);
        }
      }
    );
  }

  return {
    exercisesCount: parsed.exercises.length,
    daysCount: parsed.workoutDays.length,
    tasksCount: parsed.plannedTasks.length,
    setsCount: parsed.loggedSets.length,
    weightsCount: weights.length,
    manual1RMsCount: manual1RMs.length,
  };
}

export async function clearAllUserData(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.workoutDays,
      db.plannedTasks,
      db.loggedSets,
      db.bodyWeights,
      db.routineDays,
      db.routineExercises,
      db.recurringCycles,
    ],
    async () => {
      await db.loggedSets.clear();
      await db.plannedTasks.clear();
      await db.workoutDays.clear();
      await db.bodyWeights.clear();
      await db.routineDays.clear();
      await db.routineExercises.clear();
      await db.recurringCycles.clear();
    }
  );
}

export async function exportDatabaseToCsv(): Promise<string> {
  const days = await db.workoutDays.orderBy('date').toArray();
  const tasks = await db.plannedTasks.toArray();
  const sets = await db.loggedSets.toArray();
  const exercises = await db.exercises.toArray();

  const exerciseMap = new Map<number, Exercise>();
  for (const ex of exercises) {
    if (ex.id) exerciseMap.set(ex.id, ex);
  }

  const tasksByDay = new Map<number, PlannedTask[]>();
  for (const t of tasks) {
    const list = tasksByDay.get(t.day_id) || [];
    list.push(t);
    tasksByDay.set(t.day_id, list);
  }

  const setsByTask = new Map<number, LoggedSet[]>();
  for (const s of sets) {
    const list = setsByTask.get(s.task_id) || [];
    list.push(s);
    setsByTask.set(s.task_id, list);
  }

  const formatCell = (val: string | number | undefined | null): string => {
    if (val === undefined || val === null || val === '') return '';
    if (typeof val === 'number') {
      if (Number.isNaN(val)) return '';
      const rounded = Math.round(val * 10) / 10;
      return String(rounded).replace('.', ',');
    }
    const str = String(val).replace(/\r\n/g, ' ').replace(/[\r\n]/g, ' ').trim();
    if (str.includes(';') || str.includes('"')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const formatPolishDate = (isoDate: string): string => {
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  };

  // Eksportujemy wyłącznie dni, w których faktycznie wykonano serie (od najnowszych)
  const completedDays = days
    .filter((day) => {
      if (!day.id) return false;
      const dTasks = tasksByDay.get(day.id) || [];
      return dTasks.some((t) => t.id && (setsByTask.get(t.id) || []).length > 0);
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const headers = [
    'Data',
    'Trening',
    'Ćwiczenie',
    'Partia mięśniowa',
    'Wykonane serie (Ciężar x Powt.)',
    'Liczba serii',
    'Objętość [kg]',
    'Maks. 1RM [kg]',
  ];

  const rows: string[] = [headers.map(formatCell).join(';')];

  for (let dIdx = 0; dIdx < completedDays.length; dIdx++) {
    const day = completedDays[dIdx];
    if (!day.id) continue;

    const dayTasks = (tasksByDay.get(day.id) || []).sort((a, b) => a.sort_order - b.sort_order);
    const formattedDate = formatPolishDate(day.date);
    const dayTitle = day.routine_day_name || 'Trening wolny';

    let dayTotalSets = 0;
    let dayTotalVolume = 0;
    let dayExercisesCount = 0;

    for (const task of dayTasks) {
      if (!task.id) continue;
      const taskSets = (setsByTask.get(task.id) || [])
        .filter((s) => s.weight > 0 || s.reps > 0)
        .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

      if (taskSets.length === 0) continue;

      const ex = task.exercise_id ? exerciseMap.get(task.exercise_id) : undefined;
      const exName = ex?.name || 'Ćwiczenie';
      const muscleGroup = ex?.muscle_group || '';

      let exerciseVolume = 0;
      let exerciseMax1RM = 0;

      const setsFormatted = taskSets
        .map((s) => {
          const vol = s.weight > 0 && s.reps > 0 ? s.weight * s.reps : 0;
          exerciseVolume += vol;
          const est1rm = s.weight > 0 && s.reps > 0 ? calculateEpley1RM(s.weight, s.reps) : 0;
          if (est1rm > exerciseMax1RM) {
            exerciseMax1RM = est1rm;
          }
          const weightStr = String(Math.round(s.weight * 10) / 10).replace('.', ',');
          return `${weightStr}kg x ${s.reps}`;
        })
        .join('  |  ');

      dayExercisesCount += 1;
      dayTotalSets += taskSets.length;
      dayTotalVolume += exerciseVolume;

      rows.push(
        [
          formattedDate,
          dayTitle,
          exName,
          muscleGroup,
          setsFormatted,
          taskSets.length,
          Math.round(exerciseVolume * 10) / 10,
          exerciseMax1RM > 0 ? exerciseMax1RM : '',
        ]
          .map(formatCell)
          .join(';')
      );
    }

    if (dayExercisesCount > 0) {
      rows.push(
        [
          formattedDate,
          dayTitle,
          `PODSUMOWANIE TRENINGU (${dayExercisesCount} ćw.)`,
          '',
          day.notes ? `Notatka: ${day.notes.trim()}` : '',
          dayTotalSets,
          Math.round(dayTotalVolume * 10) / 10,
          '',
        ]
          .map(formatCell)
          .join(';')
      );

      if (dIdx < completedDays.length - 1) {
        rows.push(';;;;;;;');
      }
    }
  }

  return '\uFEFF' + rows.join('\r\n');
}

