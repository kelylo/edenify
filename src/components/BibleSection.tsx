/**
 * Bible Section Component
 * Displays daily Bible reading with progression tracking
 * Extracted from Home.tsx to reduce complexity
 */

import React from 'react';
import { motion } from 'motion/react';
import { BibleReadingUI } from './BibleReadingUI';
import { BibleReaderState, BibleReaderActions } from '../hooks/useBibleReader';

interface BibleSectionProps {
  // Bible reading data
  bibleReading: any;
  bibleLoading: boolean;

  // State and actions
  readerState: BibleReaderState;
  readerActions: BibleReaderActions;

  // Handlers
  onToggleComplete: (completed: boolean) => Promise<void>;
}

/**
 * Bible reading section with UI and state management
 */
export const BibleSection: React.FC<BibleSectionProps> = ({
  bibleReading,
  bibleLoading,
  readerState,
  readerActions,
  onToggleComplete,
}) => {
  if (bibleLoading) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-surface-container-low p-6 rounded-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-0.5 bg-primary/20" />
        <div className="h-20 bg-surface-container animate-pulse rounded-xl" />
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="space-y-3"
    >
      <div className="bg-surface-container-low p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-primary/20" />

        {bibleReading ? (
          <BibleReadingUI
            currentDay={bibleReading.day}
            completedToday={bibleReading.completed}
            onToggleComplete={onToggleComplete}
            onReadMore={() => readerActions.setShowScripturePage(true)}
            isProgressionEnforced={true}
            totalDays={bibleReading.totalDays}
          />
        ) : (
          <div className="text-center py-4">
            <p className="text-secondary text-sm">No Bible reading data available</p>
          </div>
        )}
      </div>
    </motion.section>
  );
};
