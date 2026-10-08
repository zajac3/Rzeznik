import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Search, Plus, Check } from 'lucide-react';
import { db, type Exercise, type MuscleGroup } from '../db/db';
import { getCategoryIcon } from '../utils/categoryIcons';

interface AddExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectExercise: (exerciseId: number) => void;
  existingExerciseIds?: number[];
}

const MUSCLE_GROUPS: (MuscleGroup | 'Wszystkie')[] = [
  'Wszystkie',
  'Klatka',
  'Plecy',
  'Nogi',
  'Barki',
  'Biceps',
  'Triceps',
  'Brzuch',
  'Inne',
];

export const AddExerciseModal: React.FC<AddExerciseModalProps> = ({
  isOpen,
  onClose,
  onSelectExercise,
  existingExerciseIds = [],
}) => {
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | 'Wszystkie'>('Wszystkie');
  const [showCreateNew, setShowCreateNew] = useState(false);

  // Form for new exercise
  const [newName, setNewName] = useState('');
  const [newMuscle, setNewMuscle] = useState<MuscleGroup>('Klatka');
  const [newCalculate1RM, setNewCalculate1RM] = useState(true);

  const exercises = useLiveQuery(async () => {
    return await db.exercises.toArray();
  }, []);

  if (!isOpen) return null;

  const filtered = (exercises ?? []).filter((ex) => {
    const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    const matchesMuscle = selectedMuscle === 'Wszystkie' || ex.muscle_group === selectedMuscle;
    return matchesSearch && matchesMuscle;
  });

  const handleCreateExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const id = await db.exercises.add({
      name: newName.trim(),
      muscle_group: newMuscle,
      calculate_1rm: newCalculate1RM,
    });

    setNewName('');
    setShowCreateNew(false);
    onSelectExercise(id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/90 animate-in fade-in duration-200 font-sans">
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-none border-2 border-zinc-700/80 bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-5 overflow-hidden text-zinc-100 shadow-2xl shadow-black/80">
        {/* iOS Drag Handle */}
        <div className="mx-auto -mt-1 mb-3 h-1 w-10 bg-zinc-700 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-gradient-to-r from-red-600 to-red-800"></div>
              <span className="text-xs font-semibold text-red-500 uppercase tracking-wider">
                Słownik ćwiczeń
              </span>
            </div>
            <h3 className="text-base font-bold text-white tracking-wider uppercase mt-0.5">
              Dodaj ćwiczenie
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-none border border-zinc-800 bg-black p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search & Muscle Filters */}
        {!showCreateNew && (
          <div className="mt-3 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Szukaj ćwiczenia..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-none border border-zinc-700 bg-black py-2 pl-9 pr-3 text-xs text-white placeholder-zinc-500 focus:border-red-600 focus:outline-none"
              />
            </div>

            {/* Muscle tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {MUSCLE_GROUPS.map((grp) => (
                <button
                  key={grp}
                  onClick={() => setSelectedMuscle(grp)}
                  className={`whitespace-nowrap rounded-none px-3 py-1 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    selectedMuscle === grp
                      ? 'bg-gradient-to-r from-red-600 to-red-800 text-white font-bold shadow-[0_0_8px_rgba(220,38,38,0.3)]'
                      : 'bg-black text-zinc-400 hover:bg-zinc-900 hover:text-white border border-zinc-800'
                  }`}
                >
                  {grp}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content list / Creation form */}
        <div className="mt-3 flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[50vh]">
          {showCreateNew ? (
            <form onSubmit={handleCreateExercise} className="space-y-3 rounded-none bg-gradient-to-b from-zinc-950 to-black p-4 border-2 border-zinc-800">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Nowe ćwiczenie
                </h4>
                <button
                  type="button"
                  onClick={() => setShowCreateNew(false)}
                  className="text-xs text-red-500 hover:text-red-400 font-bold uppercase cursor-pointer"
                >
                  Anuluj
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Nazwa ćwiczenia
                </label>
                <input
                  type="text"
                  required
                  placeholder="np. Hack Przysiad..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-none border border-zinc-700 bg-black px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Partia mięśniowa
                </label>
                <select
                  value={newMuscle}
                  onChange={(e) => setNewMuscle(e.target.value as MuscleGroup)}
                  className="w-full rounded-none border border-zinc-700 bg-black px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none uppercase"
                >
                  {MUSCLE_GROUPS.filter((g) => g !== 'Wszystkie').map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-start gap-2.5 rounded-none bg-black p-3 border border-zinc-800">
                <input
                  type="checkbox"
                  id="calc1rm"
                  checked={newCalculate1RM}
                  onChange={(e) => setNewCalculate1RM(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded-none border-zinc-600 text-red-600 focus:ring-red-500 accent-red-600"
                />
                <label htmlFor="calc1rm" className="text-xs text-zinc-300 cursor-pointer">
                  <span className="font-bold text-white block uppercase text-[11px]">
                    Kalkulator 1RM (Formuła Epleya)
                  </span>
                  <span className="text-zinc-400 block text-xs">
                    Dla ćwiczeń wielostawowych ze sztangą
                  </span>
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateNew(false)}
                  className="rounded-none border border-zinc-800 bg-black px-3 py-1.5 text-xs font-bold uppercase text-zinc-400 hover:text-white cursor-pointer"
                >
                  Powrót
                </button>
                <button
                  type="submit"
                  style={{ clipPath: 'polygon(5% 0, 100% 0, 95% 100%, 0 100%)' }}
                  className="rounded-none bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold uppercase tracking-wider px-4 py-2 text-xs transition-colors cursor-pointer"
                >
                  Zapisz ćwiczenie
                </button>
              </div>
            </form>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-zinc-400">Brak ćwiczenia „{search}” w słowniku.</p>
              <button
                type="button"
                onClick={() => {
                  setNewName(search);
                  setShowCreateNew(true);
                }}
                style={{ clipPath: 'polygon(5% 0, 100% 0, 95% 100%, 0 100%)' }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-none bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold uppercase tracking-wider px-4 py-2 text-xs transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Utwórz ćwiczenie „{search}”
              </button>
            </div>
          ) : (
            filtered.map((ex) => {
              const isAlreadyAdded = ex.id ? existingExerciseIds.includes(ex.id) : false;
              const CategoryIcon = getCategoryIcon(ex.muscle_group);
              return (
                <div
                  key={ex.id}
                  onClick={() => ex.id && onSelectExercise(ex.id)}
                  className={`flex items-center justify-between p-2.5 rounded-none border transition-colors cursor-pointer ${
                    isAlreadyAdded
                      ? 'border-zinc-800/40 bg-zinc-950/40 text-zinc-500'
                      : 'border border-zinc-800 bg-gradient-to-r from-black via-zinc-950 to-black hover:border-zinc-600 text-zinc-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-none bg-zinc-950 border border-zinc-800 shrink-0 overflow-hidden">
                      <CategoryIcon className="w-6 h-6 object-contain opacity-85" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white uppercase">{ex.name}</span>
                        {isAlreadyAdded && (
                          <span className="inline-flex items-center gap-0.5 rounded-none bg-zinc-900 border border-zinc-700 px-1.5 py-0.2 text-[9px] font-bold text-zinc-400 uppercase">
                            <Check className="h-2.5 w-2.5" /> W planie
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-zinc-400">{ex.muscle_group}</span>
                        {ex.calculate_1rm && (
                          <span className="text-[10px] text-red-500 font-bold">1RM</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-none border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-red-700 hover:text-white transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {!showCreateNew && (
          <div className="mt-3 pt-2.5 border-t-2 border-zinc-800 flex items-center justify-between">
            <span className="text-xs text-zinc-400">
              {filtered.length} ćwiczeń w słowniku
            </span>
            <button
              onClick={() => {
                setNewName('');
                setShowCreateNew(true);
              }}
              className="text-xs font-bold uppercase tracking-wider text-red-500 hover:text-red-400 cursor-pointer"
            >
              + Własne ćwiczenie
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
