/**
 * Custom hook for managing Bible reading state
 * Handles scripture display, audio, fullscreen, reflection
 * Reduces Home.tsx by ~100 LOC
 */

import { useState, useRef, useCallback } from 'react';
import { BibleVerse } from '../types';

export interface BibleReaderState {
  // Scripture pages
  pages: BibleVerse[][];
  pageLabels: string[];
  pageIndex: number;

  // Scripture display
  showScripturePage: boolean;
  isReadingAloud: boolean;

  // Fullscreen
  isFullscreen: boolean;

  // Reflection
  showReflectionComposer: boolean;
  reflectionDraft: string;
}

export interface BibleReaderActions {
  // Scripture navigation
  setScripturePages: (pages: BibleVerse[][]) => void;
  setScripturePageLabels: (labels: string[]) => void;
  setScripturePageIndex: (index: number) => void;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
  resetPages: () => void;

  // Scripture display
  setShowScripturePage: (show: boolean) => void;
  setIsReadingAloud: (reading: boolean) => void;
  toggleFullscreen: () => void;

  // Reflection
  setShowReflectionComposer: (show: boolean) => void;
  setReflectionDraft: (draft: string) => void;
  resetReflection: () => void;

  // Refs
  getAudioRef: () => HTMLAudioElement | null;
  setAudioRef: (ref: HTMLAudioElement) => void;
}

/**
 * Hook for managing Bible reader state
 */
export const useBibleReader = (): [BibleReaderState, BibleReaderActions] => {
  const [pages, setScripturePages] = useState<BibleVerse[][]>([]);
  const [pageLabels, setScripturePageLabels] = useState<string[]>([]);
  const [pageIndex, setScripturePageIndex] = useState(0);
  const [showScripturePage, setShowScripturePage] = useState(false);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showReflectionComposer, setShowReflectionComposer] = useState(false);
  const [reflectionDraft, setReflectionDraft] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Navigation handlers
  const goToNextPage = useCallback(() => {
    setScripturePageIndex(prev => Math.min(prev + 1, pages.length - 1));
  }, [pages.length]);

  const goToPreviousPage = useCallback(() => {
    setScripturePageIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const resetPages = useCallback(() => {
    setScripturePages([]);
    setScripturePageLabels([]);
    setScripturePageIndex(0);
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // Reflection handlers
  const resetReflection = useCallback(() => {
    setShowReflectionComposer(false);
    setReflectionDraft('');
  }, []);

  // Audio ref helpers
  const getAudioRef = useCallback(() => audioRef, []);
  const setAudioRef = useCallback((ref: HTMLAudioElement) => {
    audioRef.current = ref;
  }, []);

  const state: BibleReaderState = {
    pages,
    pageLabels,
    pageIndex,
    showScripturePage,
    isReadingAloud,
    isFullscreen,
    showReflectionComposer,
    reflectionDraft,
  };

  const actions: BibleReaderActions = {
    setScripturePages,
    setScripturePageLabels,
    setScripturePageIndex,
    goToNextPage,
    goToPreviousPage,
    resetPages,
    setShowScripturePage,
    setIsReadingAloud,
    toggleFullscreen,
    setShowReflectionComposer,
    setReflectionDraft,
    resetReflection,
    getAudioRef,
    setAudioRef,
  };

  return [state, actions];
};
