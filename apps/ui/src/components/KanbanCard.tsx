import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Card as FluentCard,
  CardHeader,
  makeStyles,
  tokens,
  Body1,
  Caption1,
} from '@fluentui/react-components';
import type { Card } from '@copilot-cli-board/shared';
import { useEffect, useRef, useState } from 'react';
import { registerCard, unregisterCard } from './FlyingCardOverlay';

// Column order map — set by App.tsx on board load
const columnOrderMap = new Map<string, number>();
export function setColumnOrders(columns: { id: string; order: number }[]) {
  columnOrderMap.clear();
  for (const c of columns) columnOrderMap.set(c.id, c.order);
}

// No-op kept for App.tsx import compat
export function captureCardPositions() {}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type AnimState = 'none' | 'new' | 'moved-right' | 'moved-left' | 'updated';

// Copilot CLI colors for animations — rgba ensures visibility on both light & dark
const GLOW_SOLID = '#4ea5ca';
const GLOW_RING = 'rgba(78, 165, 202, 0.6)';
const GLOW_SPREAD = 'rgba(78, 165, 202, 0.35)';
const GREEN_GLOW = 'rgba(99, 207, 145, 0.6)';

const useStyles = makeStyles({
  card: {
    cursor: 'grab',
    ':active': { cursor: 'grabbing' },
    position: 'relative',
    flexShrink: 0,
  },

  // New card: gentle drop-in with green glow
  animNew: {
    animationName: {
      '0%':   { opacity: 0, transform: 'translateY(-12px)' },
      '100%': { opacity: 1, transform: 'translateY(0)' },
    },
    animationDuration: '0.5s',
    animationTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
    boxShadow: `0 0 12px 2px ${GREEN_GLOW}`,
  },
  animNewFade: {
    animationName: {
      '0%':   { boxShadow: `0 0 14px 3px ${GREEN_GLOW}` },
      '100%': { boxShadow: '0 0 0 0 transparent' },
    },
    animationDuration: '1.8s',
    animationTimingFunction: 'ease-out',
    animationFillMode: 'forwards',
  },

  // Moved forward (left → right): slide in from left
  animMovedRight: {
    animationName: {
      '0%':   { opacity: 0, transform: 'translateX(-40px)' },
      '70%':  { opacity: 1, transform: 'translateX(4px)' },
      '100%': { opacity: 1, transform: 'translateX(0)' },
    },
    animationDuration: '0.6s',
    animationTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },

  // Moved backward (right → left): slide in from right
  animMovedLeft: {
    animationName: {
      '0%':   { opacity: 0, transform: 'translateX(40px)' },
      '70%':  { opacity: 1, transform: 'translateX(-4px)' },
      '100%': { opacity: 1, transform: 'translateX(0)' },
    },
    animationDuration: '0.6s',
    animationTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },

  // Lingering glow after move
  animMovedGlow: {
    animationName: {
      '0%':   { boxShadow: `0 0 0 2px ${GLOW_RING}, 0 0 12px 3px ${GLOW_SPREAD}` },
      '100%': { boxShadow: '0 0 0 0 transparent, 0 0 0 0 transparent' },
    },
    animationDuration: '2s',
    animationTimingFunction: 'ease-out',
    animationFillMode: 'forwards',
  },

  // In-place update: ring pulse (purple for variety)
  animUpdated: {
    animationName: {
      '0%':   { boxShadow: '0 0 0 2px rgba(200, 117, 209, 0.6)' },
      '50%':  { boxShadow: '0 0 10px 2px rgba(200, 117, 209, 0.4)' },
      '100%': { boxShadow: '0 0 0 0 transparent' },
    },
    animationDuration: '1.5s',
    animationTimingFunction: 'ease-out',
  },

  labels: {
    display: 'flex',
    gap: '5px',
    flexWrap: 'wrap',
    marginTop: '6px',
  },
  labelPill: {
    fontSize: '11px',
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '1',
    padding: '3px 8px',
    borderRadius: '10px',
    whiteSpace: 'nowrap',
  },
  provBadge: {
    marginTop: '4px',
  },
  timestamp: {
    fontSize: '11px',
    color: tokens.colorNeutralForeground4,
    marginTop: '2px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '4px',
  },
  agent: {
    fontSize: '10px',
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '120px',
  },
});

// Label color palette: bg + text pairs for guaranteed contrast in both themes
const LABEL_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#4ea5ca', fg: '#ffffff' },  // cyan
  { bg: '#c875d1', fg: '#ffffff' },  // purple
  { bg: '#63cf91', fg: '#1a3a2a' },  // green
  { bg: '#e8913a', fg: '#ffffff' },  // orange
  { bg: '#e05c6c', fg: '#ffffff' },  // red
  { bg: '#6b8aed', fg: '#ffffff' },  // blue
  { bg: '#d4a843', fg: '#2a2000' },  // gold
  { bg: '#8b8b8b', fg: '#ffffff' },  // gray
];
const LABEL_COLOR_MAP: Record<string, { bg: string; fg: string }> = {};
let colorIdx = 0;
function labelStyle(name: string): { bg: string; fg: string } {
  if (!LABEL_COLOR_MAP[name]) {
    LABEL_COLOR_MAP[name] = LABEL_PALETTE[colorIdx % LABEL_PALETTE.length];
    colorIdx++;
  }
  return LABEL_COLOR_MAP[name];
}

interface Props {
  card: Card;
  onClick: () => void;
}

export function KanbanCard({ card, onClick }: Props) {
  const styles = useStyles();
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: card.id });
  const cardElRef = useRef<HTMLDivElement>(null);
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  const skillCount = card.provenance.skillsUsed.length;

  // Register card position for flying animations
  useEffect(() => {
    registerCard(card.id, () => cardElRef.current!.getBoundingClientRect());
    return () => unregisterCard(card.id);
  }, [card.id]);

  const mergedRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    (cardElRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  const isFirstRender = useRef(true);
  const prevColumnId = useRef(card.columnId);
  const prevUpdatedAt = useRef(card.updatedAt);
  const [anim, setAnim] = useState<AnimState>('none');
  const [phase, setPhase] = useState<1 | 2>(1);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setAnim('new');
      setPhase(1);
      const t1 = setTimeout(() => setPhase(2), 500);
      const t2 = setTimeout(() => setAnim('none'), 2300);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }

    const oldCol = prevColumnId.current;
    const newCol = card.columnId;
    prevColumnId.current = newCol;

    if (oldCol !== newCol) {
      const oldOrder = columnOrderMap.get(oldCol) ?? 0;
      const newOrder = columnOrderMap.get(newCol) ?? 0;
      // Card moved right (forward) or left (backward)?
      setAnim(newOrder > oldOrder ? 'moved-right' : 'moved-left');
      setPhase(1);
      const t1 = setTimeout(() => setPhase(2), 600);
      const t2 = setTimeout(() => setAnim('none'), 2600);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }

    if (card.updatedAt !== prevUpdatedAt.current) {
      prevUpdatedAt.current = card.updatedAt;
      setAnim('updated');
      setPhase(1);
      const t = setTimeout(() => setAnim('none'), 1500);
      return () => clearTimeout(t);
    }
  }, [card.updatedAt, card.columnId]);

  let animClass = '';
  if (anim === 'new') {
    animClass = phase === 1 ? styles.animNew : styles.animNewFade;
  } else if (anim === 'moved-right') {
    animClass = phase === 1 ? styles.animMovedRight : styles.animMovedGlow;
  } else if (anim === 'moved-left') {
    animClass = phase === 1 ? styles.animMovedLeft : styles.animMovedGlow;
  } else if (anim === 'updated') {
    animClass = styles.animUpdated;
  }

  return (
    <FluentCard
      ref={mergedRef}
      data-card-id={card.id}
      className={`${styles.card} ${animClass}`}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      size="small"
    >
      <CardHeader header={<Body1>{card.title}</Body1>} />
      <div className={styles.timestamp}>
        <span>{timeAgo(card.updatedAt)}</span>
        {card.lastUpdatedBy && card.lastUpdatedBy !== 'system' && (
          <span className={styles.agent}>🤖 {card.lastUpdatedBy}</span>
        )}
      </div>
      {card.labels.length > 0 && (
        <div className={styles.labels}>
          {card.labels.map((l) => {
            const cs = labelStyle(l.name);
            return (
              <span key={l.id} className={styles.labelPill} style={{ backgroundColor: cs.bg, color: cs.fg }}>
                {l.name}
              </span>
            );
          })}
        </div>
      )}
      {skillCount > 0 && (
        <Caption1 className={styles.provBadge}>
          🧠 {card.provenance.skillsUsed.join(', ')}
        </Caption1>
      )}
    </FluentCard>
  );
}
