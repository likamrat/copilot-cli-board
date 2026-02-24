import { useState, useEffect, useRef, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  makeStyles,
  tokens,
  Badge,
  Button,
  Caption1,
  Subtitle2,
} from '@fluentui/react-components';
import { AddRegular } from '@fluentui/react-icons';
import type { Column, Card } from '@copilot-cli-board/shared';
import { KanbanCard } from './KanbanCard';
import { CreateCardDialog } from './CreateCardDialog';
import { registerColumn, unregisterColumn } from './FlyingCardOverlay';

const useStyles = makeStyles({
  column: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: '280px',
    maxWidth: '320px',
    flex: '1 0 280px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusLarge,
    overflow: 'hidden',
    maxHeight: '100%',
    transitionProperty: 'opacity',
    transitionDuration: '0.25s',
  },
  columnDimmed: {
    opacity: 0.4,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  cards: {
    flex: 1,
    padding: '8px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minHeight: '60px',
    transitionProperty: 'background-color',
    transitionDuration: '0.2s',
  },
  dropActive: {
    backgroundColor: tokens.colorNeutralBackground2Hover,
  },
  countPulse: {
    animationName: {
      '0%': { transform: 'scale(1)' },
      '40%': { transform: 'scale(1.4)' },
      '100%': { transform: 'scale(1)' },
    },
    animationDuration: '0.5s',
    animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  ghost: {
    animationName: {
      '0%':   { opacity: 0.5, transform: 'scale(1)', height: '48px' },
      '100%': { opacity: 0, transform: 'scale(0.9)', height: '0px' },
    },
    animationDuration: '0.7s',
    animationTimingFunction: 'ease-out',
    animationFillMode: 'forwards',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px dashed ${tokens.colorNeutralStroke1}`,
    overflow: 'hidden',
    marginBottom: '-6px',
  },
});

interface Props {
  column: Column;
  cards: Card[];
  dimmed?: boolean;
  onCardSelect: (card: Card) => void;
}

export function KanbanColumn({ column, cards, dimmed, onCardSelect }: Props) {
  const styles = useStyles();
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [dialogOpen, setDialogOpen] = useState(false);
  const columnElRef = useRef<HTMLDivElement>(null);

  // Register column position for flying card animations
  useEffect(() => {
    registerColumn(column.id, () => columnElRef.current!.getBoundingClientRect());
    return () => unregisterColumn(column.id);
  }, [column.id]);

  // Track previous card IDs to detect departures
  const prevCardIds = useRef(new Set(cards.map(c => c.id)));
  const [ghosts, setGhosts] = useState<string[]>([]);

  // Pulse the count badge when card count changes
  const prevCount = useRef(cards.length);
  const [countPulse, setCountPulse] = useState(false);

  useEffect(() => {
    const currentIds = new Set(cards.map(c => c.id));

    // Find cards that left this column
    const departed: string[] = [];
    for (const id of prevCardIds.current) {
      if (!currentIds.has(id)) departed.push(id);
    }
    prevCardIds.current = currentIds;

    if (departed.length > 0) {
      setGhosts(departed);
      const t = setTimeout(() => setGhosts([]), 700);
      return () => clearTimeout(t);
    }
  }, [cards]);

  useEffect(() => {
    if (cards.length !== prevCount.current) {
      prevCount.current = cards.length;
      setCountPulse(true);
      const t = setTimeout(() => setCountPulse(false), 500);
      return () => clearTimeout(t);
    }
  }, [cards.length]);

  return (
    <div className={`${styles.column} ${dimmed ? styles.columnDimmed : ''}`} ref={columnElRef}>
      <div className={styles.header}>
        <Subtitle2>{column.name}</Subtitle2>
        <Badge
          appearance="filled"
          color="informative"
          size="small"
          className={countPulse ? styles.countPulse : ''}
        >
          {cards.length}
        </Badge>
        <Button
          appearance="subtle"
          size="small"
          icon={<AddRegular />}
          onClick={() => setDialogOpen(true)}
        />
      </div>
      <CreateCardDialog
        columnId={column.id}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
      <div
        ref={setNodeRef}
        className={`${styles.cards} ${isOver ? styles.dropActive : ''}`}
      >
        {/* Ghost trails for cards that just left */}
        {ghosts.map((id) => (
          <div key={`ghost-${id}`} className={styles.ghost} />
        ))}
        {cards
          .sort((a, b) => a.order - b.order)
          .map((card) => (
            <KanbanCard key={card.id} card={card} onClick={() => onCardSelect(card)} />
          ))}
        {cards.length === 0 && ghosts.length === 0 && (
          <Caption1 style={{ textAlign: 'center', padding: '16px 8px', color: tokens.colorNeutralForeground4 }}>
            No cards yet
          </Caption1>
        )}
      </div>
    </div>
  );
}
