import React, { useState } from 'react';
import { Download, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  exportDatabaseToJson,
  importDatabaseFromJson,
} from '../db/db';
import { getTodayISO } from '../utils/dateUtils';

export const ExportView: React.FC = () => {
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleExport = async () => {
    try {
      setIsProcessing(true);
      setErrorMsg(null);
      const jsonString = await exportDatabaseToJson();
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = getTodayISO();
      a.href = url;
      a.download = `rzeznik-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMsg('Plik kopii zapasowej został pobrany.');
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Błąd eksportu');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      setErrorMsg(null);
      setStatusMsg(null);

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const result = await importDatabaseFromJson(content, 'replace');
          setStatusMsg(
            `Zaimportowano bazę: ${result.daysCount} dni, ${result.tasksCount} ćwiczeń, ${result.setsCount} serii.`
          );
        } catch (err: unknown) {
          setErrorMsg((err as Error).message || 'Błąd formatu pliku JSON');
        } finally {
          setIsProcessing(false);
        }
      };
      reader.readAsText(file);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Błąd odczytu pliku');
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl mx-auto text-zinc-100 font-sans">
      <div className="rounded-none bg-gradient-to-b from-zinc-900 via-[#121215] to-zinc-950 p-5 border-2 border-zinc-700/80 space-y-4 shadow-lg shadow-black/50">
        <div className="pb-3 border-b-2 border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-gradient-to-r from-red-600 to-red-800"></div>
            <span className="text-xs font-semibold text-red-500 uppercase tracking-wider">
              Kopia zapasowa
            </span>
          </div>
          <h2 className="text-base font-bold text-white tracking-wider uppercase mt-0.5">
            Eksport i import bazy danych
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Zarządzaj lokalną bazą danych w formacie JSON (IndexedDB)
          </p>
        </div>

        {statusMsg && (
          <div className="flex items-center gap-2 rounded-none bg-emerald-950/70 p-3 text-xs font-semibold text-emerald-300 border-2 border-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{statusMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center gap-2 rounded-none bg-red-950/70 p-3 text-xs font-semibold text-red-300 border-2 border-red-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-2.5 pt-1">
          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={isProcessing}
            className="flex w-full items-center justify-between rounded-none border-2 border-zinc-800 bg-gradient-to-r from-black via-zinc-950 to-black p-4 text-xs font-semibold text-white hover:border-red-700 hover:from-zinc-950 hover:to-zinc-900 transition-all disabled:opacity-50 cursor-pointer shadow-none"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-none bg-gradient-to-b from-red-900 to-red-950 text-red-400 border border-red-700">
                <Download className="h-4 w-4 stroke-[2.3]" />
              </div>
              <div className="text-left">
                <span className="block text-white font-bold text-sm uppercase tracking-wider">
                  Eksportuj bazę danych
                </span>
                <span className="block text-[11px] text-zinc-400">
                  Pobierz plik rzeznik-backup.json
                </span>
              </div>
            </div>
            <span className="text-red-500 text-xs font-bold uppercase tracking-wider">Pobierz →</span>
          </button>

          {/* Import Button */}
          <label className="flex w-full cursor-pointer items-center justify-between rounded-none border-2 border-zinc-800 bg-gradient-to-r from-black via-zinc-950 to-black p-4 text-xs font-semibold text-white hover:border-red-700 hover:from-zinc-950 hover:to-zinc-900 transition-all shadow-none">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-none bg-zinc-900 text-zinc-300 border border-zinc-700">
                <Upload className="h-4 w-4 stroke-[2.3]" />
              </div>
              <div className="text-left">
                <span className="block text-white font-bold text-sm uppercase tracking-wider">
                  Importuj bazę danych
                </span>
                <span className="block text-[11px] text-zinc-400">
                  Wybierz plik kopii zapasowej JSON
                </span>
              </div>
            </div>
            <span className="text-red-500 text-xs font-bold uppercase tracking-wider">Wgraj →</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              disabled={isProcessing}
              className="hidden"
            />
          </label>
        </div>
      </div>

      <div className="px-3 text-center">
        <p className="text-xs text-zinc-400">
          Wszystkie dane zapisywane są wyłącznie w pamięci Twojej przeglądarki (100% offline).
        </p>
      </div>
    </div>
  );
};
