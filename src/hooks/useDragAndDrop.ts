import { useRef, useState } from 'react';

export interface DragDropItem<T> {
  id: string;
  data: T;
}

export function useDragAndDrop<T>() {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragItemRef = useRef<DragDropItem<T> | null>(null);

  const handleDragStart = (item: DragDropItem<T>) => {
    setDraggedId(item.id);
    dragItemRef.current = item;
  };

  const handleDragEnter = (id: string) => {
    setOverId(id);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setOverId(null);
    dragItemRef.current = null;
  };

  return {
    draggedId,
    overId,
    handleDragStart,
    handleDragEnter,
    handleDragEnd,
    dragItemRef,
  };
}