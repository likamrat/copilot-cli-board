import { useState, useEffect, useCallback } from 'react';
import {
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  OverlayDrawer,
  Button,
  Input,
  Textarea,
  Badge,
  Divider,
  Subtitle2,
  Caption1,
  Body1,
  makeStyles,
  tokens,
  Tag,
  TagGroup,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
} from '@fluentui/react-components';
import { DismissRegular, AddRegular } from '@fluentui/react-icons';
import type { Card, Label, BoardEvent } from '@copilot-cli-board/shared';
import { updateCard, setCardLabels, getEvents, archiveCard } from '../api';

const useStyles = makeStyles({
  field: { marginBottom: '12px' },
  label: { display: 'block', marginBottom: '4px', fontWeight: tokens.fontWeightSemibold },
  chips: { display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' },
  eventList: { marginTop: '8px' },
  eventItem: {
    padding: '6px 0',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  actions: { display: 'flex', gap: '8px', marginTop: '16px' },
  labelInput: { display: 'flex', gap: '4px', marginTop: '8px' },
});

interface Props {
  card: Card;
  allLabels: Label[];
  onClose: () => void;
  onRefresh: () => void;
}

export function CardPanel({ card, allLabels, onClose, onRefresh }: Props) {
  const styles = useStyles();
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [events, setEvents] = useState<BoardEvent[]>([]);
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    setTitle(card.title);
    setDescription(card.description);
    getEvents(card.id).then(setEvents).catch(() => {});
  }, [card]);

  const handleSave = useCallback(async () => {
    await updateCard(card.id, { title, description });
    onRefresh();
  }, [card.id, title, description, onRefresh]);

  const handleAddLabel = useCallback(async () => {
    if (!newLabel.trim()) return;
    const current = card.labels.map((l) => l.name);
    await setCardLabels(card.id, [...current, newLabel.trim()]);
    setNewLabel('');
    onRefresh();
  }, [card, newLabel, onRefresh]);

  const handleRemoveLabel = useCallback(
    async (name: string) => {
      const remaining = card.labels.map((l) => l.name).filter((n) => n !== name);
      await setCardLabels(card.id, remaining);
      onRefresh();
    },
    [card, onRefresh]
  );

  const handleArchive = useCallback(async () => {
    await archiveCard(card.id, 'Archived from UI');
    onClose();
    onRefresh();
  }, [card.id, onClose, onRefresh]);

  return (
    <OverlayDrawer open position="end" size="medium" onOpenChange={(_, d) => !d.open && onClose()}>
      <DrawerHeader>
        <DrawerHeaderTitle
          action={<Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} />}
        >
          Card Details
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        {/* Title */}
        <div className={styles.field}>
          <label className={styles.label}>Title</label>
          <Input value={title} onChange={(_, d) => setTitle(d.value)} style={{ width: '100%' }} />
        </div>

        {/* Description */}
        <div className={styles.field}>
          <label className={styles.label}>Description</label>
          <Textarea
            value={description}
            onChange={(_, d) => setDescription(d.value)}
            style={{ width: '100%' }}
            rows={3}
          />
        </div>

        <Button appearance="primary" onClick={handleSave} size="small">
          Save
        </Button>

        <Divider style={{ margin: '16px 0' }} />

        {/* Labels */}
        <div className={styles.field}>
          <Subtitle2>Labels</Subtitle2>
          <div className={styles.chips}>
            {card.labels.map((l) => (
              <Tag
                key={l.id}
                dismissible
                dismissIcon={{ 'aria-label': 'remove', onClick: () => handleRemoveLabel(l.name) }}
                size="small"
                shape="circular"
              >
                {l.name}
              </Tag>
            ))}
          </div>
          <div className={styles.labelInput}>
            <Input
              size="small"
              placeholder="Add label..."
              value={newLabel}
              onChange={(_, d) => setNewLabel(d.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddLabel()}
            />
            <Button size="small" icon={<AddRegular />} onClick={handleAddLabel} />
          </div>
        </div>

        <Divider style={{ margin: '16px 0' }} />

        {/* Provenance */}
        <Subtitle2>Provenance</Subtitle2>
        <div className={styles.field} style={{ marginTop: '8px' }}>
          <Caption1>Agents Involved</Caption1>
          <div className={styles.chips}>
            {card.provenance.agentsInvolved.length === 0 && <Caption1>—</Caption1>}
            {card.provenance.agentsInvolved.map((a) => (
              <Badge key={a} appearance="outline" size="small">🤖 {a}</Badge>
            ))}
          </div>
        </div>
        <div className={styles.field}>
          <Caption1>Skills Used</Caption1>
          <div className={styles.chips}>
            {card.provenance.skillsUsed.length === 0 && <Caption1>—</Caption1>}
            {card.provenance.skillsUsed.map((s) => (
              <Badge key={s} appearance="outline" size="small">{s}</Badge>
            ))}
          </div>
        </div>

        <Accordion collapsible>
          <AccordionItem value="tools">
            <AccordionHeader size="small">Tools Used ({card.provenance.toolsUsed.length})</AccordionHeader>
            <AccordionPanel>
              <div className={styles.chips}>
                {card.provenance.toolsUsed.map((t) => (
                  <Badge key={t} appearance="outline" size="small">{t}</Badge>
                ))}
              </div>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>

        <Divider style={{ margin: '16px 0' }} />

        {/* Events */}
        <Subtitle2>Event Log</Subtitle2>
        <div className={styles.eventList}>
          {events.length === 0 && <Caption1>No events yet</Caption1>}
          {events.map((e) => (
            <div key={e.id} className={styles.eventItem}>
              <Body1>
                <Badge appearance="outline" size="small">{e.type}</Badge>{' '}
                <Caption1>{e.actor} · {new Date(e.timestamp).toLocaleString()}</Caption1>
              </Body1>
              {Object.keys(e.payload).length > 0 && (
                <Caption1 style={{ display: 'block', marginTop: '2px' }}>
                  {JSON.stringify(e.payload)}
                </Caption1>
              )}
            </div>
          ))}
        </div>

        {/* Archive */}
        <div className={styles.actions}>
          <Button appearance="subtle" onClick={handleArchive}>
            Archive Card
          </Button>
        </div>
      </DrawerBody>
    </OverlayDrawer>
  );
}
