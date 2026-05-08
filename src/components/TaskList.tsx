import React, { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Circle, Pencil, Trash2 } from 'lucide-react';
import { SkeletonList } from './Skeleton';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useDragAndDrop } from '../hooks/useDragAndDrop';
import { highlightSearch } from '../lib/utils';
import { cn } from '../lib/utils';

export function TaskList({
  tasks,
  layers,
  failedTaskIds,
  focusedTaskId,
  onToggleTask,
  onModifyTask,
  onDeleteTask,
}: any) {
  // Infinite scroll state
  const [visibleCount, setVisibleCount] = useState(20);
  const hasMore = visibleCount < tasks.length;
  const fetchMore = useCallback(async () => {
    setVisibleCount((c) => Math.min(tasks.length, c + 20));
  }, [tasks.length]);
  const { sentinelRef } = useInfiniteScroll({ fetchMore, hasMore, loading: false });

  // Drag & drop state
  const drag = useDragAndDrop();

  if (!tasks || tasks.length === 0) {
    return <SkeletonList count={6} />;
  }

  return (
    <div>
      <AnimatePresence mode="popLayout">
        {tasks.slice(0, visibleCount).map((task: any, index: number) => {
          const layer = layers.find((l: any) => l.id === task.layerId);
          const failed = failedTaskIds.has(task.id);
          const completed = task.completed;
          return (
            <motion.div
              key={task.id}
              id={`task-card-${task.id}`}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ delay: index * 0.03 }}
              className={cn(
                'rounded-xl border px-4 py-3 flex items-center gap-3 bg-surface-container-lowest',
                completed ? 'opacity-60 border-transparent bg-surface-container-low' : 'border-outline-variant/35',
                failed && !completed ? 'border-red-300 bg-red-50/70' : '',
                focusedTaskId === task.id ? 'ring-2 ring-primary border-primary/60 shadow-[0_0_0_3px_rgba(150,68,7,0.15)]' : ''
              )}
              draggable
              onDragStart={() => drag.handleDragStart({ id: task.id, data: task })}
              onDragEnter={() => drag.handleDragEnter(task.id)}
              onDragEnd={drag.handleDragEnd}
            >
              <button aria-label={`Toggle task ${task.name}`} title="Toggle task" onClick={() => onToggleTask(task.id, 'home-task-list')} className={cn('transition-colors', completed ? 'text-primary' : 'text-secondary/35 hover:text-primary')}>
                {completed ? <CheckCircle2 size={22} /> : <Circle size={22} />}
              </button>

              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium text-on-surface truncate', completed && 'line-through text-secondary')}>
                  {highlightSearch(task.name, '')?.map((part: any, i: number) =>
                    typeof part === 'string' ? part : <mark key={i} className="bg-yellow-100 text-yellow-900 rounded px-1">{part.match}</mark>
                  )}
                </p>
                <p className={cn('font-label text-[10px] uppercase tracking-[0.14em] font-bold mt-1', failed && !completed ? 'text-red-600' : 'text-outline')}>
                  {layer?.name || 'General'} • {task.time}{failed && !completed ? ' • Failed (duration passed)' : ''}
                </p>
              </div>

              <button
                type="button"
                aria-label={`Modify task ${task.name}`}
                title="Modify task"
                onClick={() => onModifyTask(task)}
                className="h-8 px-2.5 flex items-center gap-1.5 justify-center rounded-md border border-outline-variant/40 text-primary hover:bg-surface-container-low"
              >
                <Pencil size={13} />
                <span className="text-[10px] font-bold uppercase tracking-[0.12em]">Modify</span>
              </button>

              <button
                type="button"
                aria-label={`Delete task ${task.name}`}
                title="Delete task"
                onClick={() => onDeleteTask(task.id, 'home-task-list')}
                className="h-8 w-8 flex items-center justify-center rounded-md border border-red-200 text-red-500 hover:bg-red-50"
              >
                <Trash2 size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {hasMore && <div ref={sentinelRef}><SkeletonList count={2} /></div>}
    </div>
  );
}