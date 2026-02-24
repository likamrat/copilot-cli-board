import { useState } from 'react';
import {
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogActions,
  DialogContent,
  Button,
  Input,
  Textarea,
  Field,
} from '@fluentui/react-components';
import { createCard } from '../api';

interface Props {
  columnId: string;
  open: boolean;
  onClose: () => void;
}

export function CreateCardDialog({ columnId, open, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [labels, setLabels] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const labelList = labels
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean);
      await createCard({
        title: title.trim(),
        description: description.trim() || undefined,
        columnId,
        labels: labelList.length > 0 ? labelList : undefined,
      });
      setTitle('');
      setDescription('');
      setLabels('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Create Card</DialogTitle>
          <DialogContent>
            <Field label="Title" required>
              <Input
                value={title}
                onChange={(_, data) => setTitle(data.value)}
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={description}
                onChange={(_, data) => setDescription(data.value)}
                resize="vertical"
              />
            </Field>
            <Field label="Labels" hint="Comma-separated">
              <Input
                value={labels}
                onChange={(_, data) => setLabels(data.value)}
              />
            </Field>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              onClick={handleSubmit}
              disabled={!title.trim() || submitting}
            >
              Create
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
