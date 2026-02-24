import { useCallback, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { makeStyles, tokens } from '@fluentui/react-components';
import type { Column, Card } from '@copilot-cli-board/shared';
import { updateCard } from '../api';
import { KanbanColumn } from './KanbanColumn';

const useStyles = makeStyles({
  board: {
    display: 'flex',
    gap: '12px',
    padding: '16px',
    height: '100%',
    overflowX: 'auto',
    overflowY: 'hidden',
    alignItems: 'stretch',
  },
});

interface Props {
  columns: Column[];
  cards: Card[];
  filterQuery?: string;
  onCardSelect: (card: Card) => void;
  onRefresh: () => void;
}

export function KanbanBoard({ columns, cards, filterQuery = '', onCardSelect, onRefresh }: Props) {
  const styles = useStyles();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const isFiltering = filterQuery.trim().length > 0;
  const query = filterQuery.trim().toLowerCase();

  const filteredCards = useMemo(
    () => isFiltering ? cards.filter((c) => c.title.toLowerCase().includes(query)) : cards,
    [cards, query, isFiltering],
  );

  // Track which columns have matching cards when filtering
  const columnsWithMatches = useMemo(() => {
    if (!isFiltering) return null;
    const set = new Set<string>();
    for (const c of filteredCards) set.add(c.columnId);
    return set;
  }, [filteredCards, isFiltering]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const cardId = active.id as string;
      const targetColumnId = over.id as string;

      const card = cards.find((c) => c.id === cardId);
      if (!card || card.columnId === targetColumnId) return;

      // Check if we're dropping on a column
      const isColumn = columns.some((c) => c.id === targetColumnId);
      if (!isColumn) return;

      await updateCard(cardId, { columnId: targetColumnId });
      onRefresh();
    },
    [cards, columns, onRefresh]
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className={styles.board}>
        {columns.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            cards={filteredCards.filter((c) => c.columnId === col.id)}
            dimmed={columnsWithMatches !== null && !columnsWithMatches.has(col.id)}
            onCardSelect={onCardSelect}
          />
        ))}
      </div>
    </DndContext>
  );
}
