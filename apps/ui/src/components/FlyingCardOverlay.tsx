import { useEffect, useState, useCallback, useRef } from 'react';
import { makeStyles, tokens, Badge, Body1, Caption1 } from '@fluentui/react-components';
import type { Card } from '@copilot-cli-board/shared';

// Registry: column elements register themselves so we know where to fly to
const columnRects = new Map<string, () => DOMRect>();

export function registerColumn(columnId: string, getRect: () => DOMRect) {
  columnRects.set(columnId, getRect);
}

export function unregisterColumn(columnId: string) {
  columnRects.delete(columnId);
}

// Card element registry: cards register so we can snapshot their position before they move
const cardRects = new Map<string, () => DOMRect>();

export function registerCard(cardId: string, getRect: () => DOMRect) {
  cardRects.set(cardId, getRect);
}

export function unregisterCard(cardId: string) {
  cardRects.delete(cardId);
}

interface FlyingCard {
  id: string;
  card: Card;
  fromRect: DOMRect;
  toRect: DOMRect;
}

const useStyles = makeStyles({
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: 10000,
  },
  flyingCard: {
    position: 'absolute',
    width: '264px',
    padding: '12px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: `${tokens.shadow8}, 0 0 8px 1px rgba(78,165,202,0.3)`,
    border: `1px solid rgba(78,165,202,0.4)`,
    transitionProperty: 'top, left, opacity, transform',
    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
  },
  labels: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
    marginTop: '6px',
  },
});

let queueCallback: ((card: Card, fromColumnId: string) => void) | null = null;

// Called by App.tsx BEFORE updating state, to queue a flying animation
export function queueFlyingCard(card: Card, fromColumnId: string) {
  queueCallback?.(card, fromColumnId);
}

interface Props {}

export function FlyingCardOverlay() {
  const styles = useStyles();
  const [flying, setFlying] = useState<FlyingCard[]>([]);
  const doneTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Register the queue callback
  const handleQueue = useCallback((card: Card, fromColumnId: string) => {
    // Get source position: either the card's current position or the column's position
    const cardGetRect = cardRects.get(card.id);
    const fromColGetRect = columnRects.get(fromColumnId);
    const toColGetRect = columnRects.get(card.columnId);

    if (!toColGetRect) return; // can't animate without target

    const fromRect = cardGetRect?.() ?? fromColGetRect?.();
    const toRect = toColGetRect();

    if (!fromRect) return; // can't animate without source

    const flyId = `${card.id}-${Date.now()}`;

    setFlying(prev => [...prev, { id: flyId, card, fromRect, toRect }]);

    // Remove after animation completes
    const timer = setTimeout(() => {
      setFlying(prev => prev.filter(f => f.id !== flyId));
    }, 750);
    doneTimers.current.push(timer);
  }, []);

  useEffect(() => {
    queueCallback = handleQueue;
    return () => { queueCallback = null; };
  }, [handleQueue]);

  // Cleanup timers
  useEffect(() => {
    return () => doneTimers.current.forEach(clearTimeout);
  }, []);

  if (flying.length === 0) return null;

  return (
    <div className={styles.overlay}>
      {flying.map(f => (
        <FlyingCardElement key={f.id} flying={f} styles={styles} />
      ))}
    </div>
  );
}

function FlyingCardElement({ flying, styles }: { flying: FlyingCard; styles: ReturnType<typeof useStyles> }) {
  const elRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'start' | 'flying' | 'landing'>('start');

  useEffect(() => {
    // Start at source position, then after a frame, transition to target
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPhase('flying');
      });
    });
    const t = setTimeout(() => setPhase('landing'), 600);
    return () => clearTimeout(t);
  }, []);

  const { fromRect, toRect, card } = flying;

  let style: React.CSSProperties;
  if (phase === 'start') {
    style = {
      top: fromRect.top,
      left: fromRect.left,
      opacity: 0.9,
      transform: 'scale(1)',
      transitionDuration: '0s',
    };
  } else if (phase === 'flying') {
    style = {
      top: toRect.top + 40, // offset below column header
      left: toRect.left + 8,
      opacity: 1,
      transform: 'scale(1.03)',
      transitionDuration: '0.55s',
    };
  } else {
    style = {
      top: toRect.top + 40,
      left: toRect.left + 8,
      opacity: 0,
      transform: 'scale(0.95)',
      transitionDuration: '0.15s',
    };
  }

  return (
    <div
      ref={elRef}
      className={styles.flyingCard}
      style={style}
    >
      <Body1 className={styles.title}>{card.title}</Body1>
      {card.labels && card.labels.length > 0 && (
        <div className={styles.labels}>
          {card.labels.map(l => (
            <Badge key={l.id} appearance="filled" color="brand" size="small">
              {l.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
