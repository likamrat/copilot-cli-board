import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FluentProvider,
  webLightTheme,
  webDarkTheme,
  createLightTheme,
  createDarkTheme,
  makeStyles,
  tokens,
  type BrandVariants,
} from '@fluentui/react-components';
import { WeatherSunnyRegular, WeatherMoonRegular } from '@fluentui/react-icons';
import type { Board, Card, Column, Label } from '@copilot-cli-board/shared';
import { getBoard } from './api';
import { useSSE } from './useSSE';
import { KanbanBoard } from './components/KanbanBoard';
import { CardPanel } from './components/CardPanel';
import { captureCardPositions, setColumnOrders } from './components/KanbanCard';
import { FlyingCardOverlay, queueFlyingCard } from './components/FlyingCardOverlay';

// Copilot CLI brand colors: #4ea5ca #c875d1 #63cf91
const copilotBrand: BrandVariants = {
  10: '#061e27',
  20: '#0c3a4d',
  30: '#125674',
  40: '#18729a',
  50: '#1e8ec1',
  60: '#39a0cf',
  70: '#4ea5ca',
  80: '#6ab4d2',
  90: '#86c3da',
  100: '#a1d2e2',
  110: '#bde1ea',
  120: '#d8f0f3',
  130: '#e8f5f8',
  140: '#f0f9fb',
  150: '#f7fcfd',
  160: '#fcfefe',
};

const lightTheme = { ...createLightTheme(copilotBrand) };
const darkTheme = { ...createDarkTheme(copilotBrand) };

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    height: '64px',
    padding: '8px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    background: 'linear-gradient(135deg, #6AB6D6 0%, #C377D1 50%, #73CD90 100%)',
    color: '#ffffff',
    boxSizing: 'border-box' as const,
    width: '100%',
  },
  headerBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: 0,
  },
  headerAscii: {
    margin: 0,
    padding: 0,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 'clamp(4px, 0.42vw, 6px)',
    lineHeight: '1.05',
    whiteSpace: 'pre' as const,
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'clip' as const,
    color: '#ffffff',
    textShadow: '0 1px 2px rgba(0,0,0,0.2)',
    userSelect: 'none' as const,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexShrink: 0,
  },
  board: {
    flex: 1,
    overflow: 'hidden',
  },
  liveIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 10px',
    borderRadius: '999px',
    backgroundColor: 'rgba(255,255,255,0.2)',
    backdropFilter: 'blur(4px)',
  },
  liveDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    boxShadow: '0 0 6px 2px rgba(255,255,255,0.5)',
    animationName: {
      '0%, 100%': { opacity: 1 },
      '50%': { opacity: 0.4 },
    },
    animationDuration: '2s',
    animationIterationCount: 'infinite',
  },
  liveText: {
    color: '#ffffff',
    fontWeight: 'bold' as const,
    fontSize: '12px',
    letterSpacing: '0.08em',
  },
  themeToggle: {
    color: '#ffffff',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    minWidth: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    cursor: 'pointer',
    backdropFilter: 'blur(4px)',
    ':hover': {
      backgroundColor: 'rgba(255,255,255,0.35)',
    },
  },
});

export default function App() {
  const styles = useStyles();
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('copilot-board-theme');
    return saved ? saved === 'dark' : false;
  });
  const [board, setBoard] = useState<Board | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  useEffect(() => {
    localStorage.setItem('copilot-board-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const loadBoard = useCallback(async () => {
    const b = await getBoard();
    setColumnOrders(b.columns);
    setBoard(b);
  }, []);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  useEffect(() => {
    const count = board?.cards.length ?? 0;
    document.title = count > 0 ? `GitHub Copilot CLI Board (${count})` : 'GitHub Copilot CLI Board';
  }, [board?.cards.length]);

  // Apply SSE events incrementally, no full refetch
  useSSE(
    useCallback((type: string, data: unknown) => {
      console.log('[Board] SSE event:', type, data);
      captureCardPositions();

      const cardData = data as Card;

      if (type === 'card:moved') {
        // Find the card's OLD columnId before we update state
        setBoard((prev) => {
          if (!prev) return prev;
          const oldCard = prev.cards.find(c => c.id === cardData.id);
          if (oldCard && oldCard.columnId !== cardData.columnId) {
            // Queue the flying animation from old column to new column
            queueFlyingCard(cardData, oldCard.columnId);
          }
          // Delay the actual state update so the flying card is visible first
          setTimeout(() => {
            setBoard((p) => {
              if (!p) return p;
              const updatedCards = p.cards.map(c => c.id === cardData.id ? cardData : c);
              const newLabels = mergeLabels(p.labels, cardData.labels ?? []);
              return { ...p, cards: updatedCards, labels: newLabels };
            });
          }, 600);
          return prev; // don't update yet, let the flying animation play
        });
        return;
      }

      setBoard((prev) => {
        if (!prev) return prev;

        switch (type) {
          case 'card:created': {
            // Add new card, avoid duplicates
            const exists = prev.cards.some((c) => c.id === cardData.id);
            if (exists) return prev;
            const newLabels = mergeLabels(prev.labels, cardData.labels ?? []);
            return { ...prev, cards: [...prev.cards, cardData], labels: newLabels };
          }

          case 'card:updated':
          case 'card:moved':
          case 'card:labels':
          case 'card:archived':
          case 'card:unarchived': {
            const updatedCards = prev.cards
              .map((c) => (c.id === cardData.id ? cardData : c))
              .filter((c) => type !== 'card:archived' || c.archivedAt === null || c.id === cardData.id);
            // Remove archived cards from active view
            const visibleCards = type === 'card:archived'
              ? updatedCards.filter((c) => c.archivedAt === null)
              : updatedCards;
            const newLabels = mergeLabels(prev.labels, cardData.labels ?? []);
            return { ...prev, cards: visibleCards, labels: newLabels };
          }

          case 'card:provenance': {
            const provData = data as { cardId: string; provenance: Card['provenance'] };
            return {
              ...prev,
              cards: prev.cards.map((c) =>
                c.id === provData.cardId ? { ...c, provenance: provData.provenance } : c
              ),
            };
          }

          case 'label:created':
          case 'label:updated': {
            const labelData = data as Label;
            const existsLabel = prev.labels.some((l) => l.id === labelData.id);
            const newLabels = existsLabel
              ? prev.labels.map((l) => (l.id === labelData.id ? labelData : l))
              : [...prev.labels, labelData];
            return { ...prev, labels: newLabels };
          }

          default:
            return prev;
        }
      });

      // Also update selectedCard if it's the one that changed
      setSelectedCard((prev) => {
        if (!prev) return prev;
        if (type === 'card:provenance') {
          const provData = data as { cardId: string; provenance: Card['provenance'] };
          if (prev.id === provData.cardId) {
            return { ...prev, provenance: provData.provenance };
          }
          return prev;
        }
        if (cardData.id === prev.id) {
          return cardData;
        }
        return prev;
      });
    }, [])
  );

  const allLabels = board?.labels ?? [];

  return (
    <FluentProvider theme={dark ? darkTheme : lightTheme}>
      <div className={styles.root}>
        <div className={styles.header}>
          <div className={styles.headerBrand}>
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="white" style={{ flex: '0 0 auto' }}>
              <path d="M23.922 16.992c-.861 1.495-5.859 5.023-11.922 5.023-6.063 0-11.061-3.528-11.922-5.023A.641.641 0 0 1 0 16.736v-2.869a.841.841 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.195 10.195 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952 1.399-1.136 3.392-2.093 6.122-2.093 2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.832.832 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256ZM12.172 11h-.344a4.323 4.323 0 0 1-.355.508C10.703 12.455 9.555 13 7.965 13c-1.725 0-2.989-.359-3.782-1.259a2.005 2.005 0 0 1-.085-.104L4 11.741v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.323 4.323 0 0 1-.355-.508h-.016.016Zm.641-2.935c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z"/>
              <path d="M14.5 14.25a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Zm-5 0a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Z"/>
            </svg>
            <pre className={styles.headerAscii}>{`██████╗ ██╗████████╗██╗  ██╗██╗   ██╗██████╗      ██████╗ ██████╗ ██████╗ ██╗██╗      ██████╗ ████████╗     ██████╗██╗     ██╗    ██████╗  ██████╗  █████╗ ██████╗ ██████╗
██╔════╝ ██║╚══██╔══╝██║  ██║██║   ██║██╔══██╗    ██╔════╝██╔═══██╗██╔══██╗██║██║     ██╔═══██╗╚══██╔══╝    ██╔════╝██║     ██║    ██╔══██╗██╔═══██╗██╔══██╗██╔══██╗██╔══██╗
██║  ███╗██║   ██║   ███████║██║   ██║██████╔╝    ██║     ██║   ██║██████╔╝██║██║     ██║   ██║   ██║       ██║     ██║     ██║    ██████╔╝██║   ██║███████║██████╔╝██║  ██║
██║   ██║██║   ██║   ██╔══██║██║   ██║██╔══██╗    ██║     ██║   ██║██╔═══╝ ██║██║     ██║   ██║   ██║       ██║     ██║     ██║    ██╔══██╗██║   ██║██╔══██║██╔══██╗██║  ██║
╚██████╔╝██║   ██║   ██║  ██║╚██████╔╝██████╔╝    ╚██████╗╚██████╔╝██║     ██║███████╗╚██████╔╝   ██║       ╚██████╗███████╗██║    ██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝
 ╚═════╝ ╚═╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═════╝      ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝ ╚═════╝    ╚═╝        ╚═════╝╚══════╝╚═╝    ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝`}</pre>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.liveIndicator}>
              <div className={styles.liveDot} />
              <span className={styles.liveText}>LIVE</span>
            </div>
            <button
              className={styles.themeToggle}
              onClick={() => setDark(d => !d)}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? <WeatherSunnyRegular fontSize={20} /> : <WeatherMoonRegular fontSize={20} />}
            </button>
          </div>
        </div>
        <div className={styles.board}>
          {board && (
            <KanbanBoard
              columns={board.columns}
              cards={board.cards}
              onCardSelect={setSelectedCard}
              onRefresh={loadBoard}
            />
          )}
        </div>
        {selectedCard && (
          <CardPanel
            card={selectedCard}
            allLabels={allLabels}
            onClose={() => setSelectedCard(null)}
            onRefresh={loadBoard}
          />
        )}
        <FlyingCardOverlay />

      </div>
    </FluentProvider>
  );
}

// Merge new labels into existing list without duplicates
function mergeLabels(existing: Label[], incoming: Label[]): Label[] {
  const map = new Map(existing.map((l) => [l.id, l]));
  for (const l of incoming) {
    map.set(l.id, l);
  }
  return Array.from(map.values());
}
