/**
 * ActiveAlarm Component
 * Displays and manages active task alarm UI
 * Extracted from Home.tsx to reduce complexity
 */

import React, { useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Pause, Play, X, Volume2 } from 'lucide-react';
import { Task } from '../types';

interface ActiveAlarmProps {
  task: Task | null;
  isOpen: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onClose: () => void;
  onStop: () => void;
}

/**
 * Active alarm display component
 * Shows currently playing task alarm
 */
export const ActiveAlarm: React.FC<ActiveAlarmProps> = ({
  task,
  isOpen,
  isPlaying,
  onTogglePlay,
  onClose,
  onStop,
}) => {
  if (!task || !isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-4 right-4 bg-primary text-white rounded-2xl p-4 shadow-2xl max-w-xs z-50"
    >
      <div className="flex items-center gap-3 mb-3">
        <Volume2 size={20} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{task.name}</p>
          <p className="text-xs opacity-90">Alarm Active</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onTogglePlay}
          className="flex-1 flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 rounded-lg py-2 transition-colors"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          <span className="text-xs font-semibold">{isPlaying ? 'Pause' : 'Play'}</span>
        </button>

        <button
          onClick={onStop}
          className="flex-1 flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 rounded-lg py-2 transition-colors"
          title="Stop Alarm"
        >
          <X size={16} />
          <span className="text-xs font-semibold">Stop</span>
        </button>

        <button
          onClick={onClose}
          className="bg-white/20 hover:bg-white/30 rounded-lg p-2 transition-colors"
          title="Close"
        >
          <X size={16} />
        </button>
      </div>
    </motion.div>
  );
};
