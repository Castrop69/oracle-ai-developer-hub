import { useCallback, useEffect, useRef, useState } from 'react';
import { parseMspXml } from './parseMspXml';
import type { ProjectData } from '../types';

interface FileSystemFileHandleLike {
  getFile(): Promise<File>;
  name: string;
}

declare global {
  interface Window {
    showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandleLike[]>;
  }
}

export interface ProjectFileState {
  project: ProjectData | null;
  watching: boolean;
  watchedFileName: string | null;
  lastSync: Date | null;
  error: string | null;
  /** Pick an XML file and keep watching it for saves from MS Project. */
  openAndWatch: () => Promise<void>;
  /** One-shot import from a dropped/selected File (no watching). */
  importFile: (file: File) => Promise<void>;
  importText: (text: string, label?: string) => void;
  stopWatching: () => void;
  supportsWatch: boolean;
}

const POLL_MS = 2000;

/**
 * Live link to Microsoft Project: the user keeps their .mpp open in Project and
 * saves a copy as XML (File > Save As > XML). This hook holds a handle to that
 * XML file and polls its modification time — every time the user re-saves from
 * Project, the schedule re-parses and the 4D simulation updates automatically.
 */
export function useProjectFile(onLoaded?: (p: ProjectData) => void): ProjectFileState {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [watching, setWatching] = useState(false);
  const [watchedFileName, setWatchedFileName] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<FileSystemFileHandleLike | null>(null);
  const lastModifiedRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  const supportsWatch = typeof window !== 'undefined' && !!window.showOpenFilePicker;

  const applyText = useCallback((text: string) => {
    const parsed = parseMspXml(text);
    setProject(parsed);
    setLastSync(new Date());
    setError(null);
    onLoadedRef.current?.(parsed);
  }, []);

  const importText = useCallback(
    (text: string) => {
      try {
        applyText(text);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [applyText],
  );

  const importFile = useCallback(
    async (file: File) => {
      try {
        applyText(await file.text());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [applyText],
  );

  const stopWatching = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    handleRef.current = null;
    setWatching(false);
    setWatchedFileName(null);
  }, []);

  const openAndWatch = useCallback(async () => {
    if (!window.showOpenFilePicker) {
      setError('This browser does not support live file watching. Use Import instead (Chrome/Edge support watching).');
      return;
    }
    let handles: FileSystemFileHandleLike[];
    try {
      handles = await window.showOpenFilePicker({
        types: [{ description: 'Microsoft Project XML', accept: { 'text/xml': ['.xml'] } }],
        multiple: false,
      });
    } catch {
      return; // user cancelled the picker
    }
    const handle = handles[0];
    try {
      const file = await handle.getFile();
      applyText(await file.text());
      handleRef.current = handle;
      lastModifiedRef.current = file.lastModified;
      setWatching(true);
      setWatchedFileName(handle.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [applyText]);

  // Poll the watched file for changes saved from Microsoft Project.
  useEffect(() => {
    if (!watching) return;
    const tick = async () => {
      const handle = handleRef.current;
      if (!handle) return;
      try {
        const file = await handle.getFile();
        if (file.lastModified !== lastModifiedRef.current) {
          lastModifiedRef.current = file.lastModified;
          applyText(await file.text());
        }
      } catch {
        // File temporarily locked mid-save; try again next tick.
      }
    };
    timerRef.current = window.setInterval(tick, POLL_MS);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [watching, applyText]);

  return {
    project,
    watching,
    watchedFileName,
    lastSync,
    error,
    openAndWatch,
    importFile,
    importText,
    stopWatching,
    supportsWatch,
  };
}
