import { useState } from 'react';
import { FileText, Plus, X, Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import type { NoteType } from '@honeydo/shared';

const NOTE_TYPES: { value: NoteType; label: string; color: string }[] = [
  { value: 'general', label: 'General', color: 'bg-blue-100 text-blue-700' },
  { value: 'ingredient', label: 'Ingredient', color: 'bg-green-100 text-green-700' },
  { value: 'rule', label: 'Rule', color: 'bg-purple-100 text-purple-700' },
  { value: 'seasonal', label: 'Seasonal', color: 'bg-orange-100 text-orange-700' },
];

export function FreeformNotes() {
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<NoteType>('general');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const { data: notes, isLoading } = trpc.recipes.preferences.getNotes.useQuery();
  const utils = trpc.useUtils();

  const addNote = trpc.recipes.preferences.addNote.useMutation({
    onSuccess: () => {
      utils.recipes.preferences.getNotes.invalidate();
      setNewContent('');
    },
  });

  const updateNote = trpc.recipes.preferences.updateNote.useMutation({
    onSuccess: () => {
      utils.recipes.preferences.getNotes.invalidate();
      setEditingId(null);
    },
  });

  const deleteNote = trpc.recipes.preferences.deleteNote.useMutation({
    onSuccess: () => {
      utils.recipes.preferences.getNotes.invalidate();
    },
  });

  const handleAddNote = () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;

    addNote.mutate({
      noteType: newType,
      content: trimmed,
    });
  };

  const handleUpdateNote = (id: string) => {
    const trimmed = editContent.trim();
    if (!trimmed) return;

    updateNote.mutate({
      id,
      content: trimmed,
    });
  };

  const handleToggleActive = (id: string, isActive: boolean) => {
    updateNote.mutate({
      id,
      isActive: !isActive,
    });
  };

  const startEditing = (id: string, content: string) => {
    setEditingId(id);
    setEditContent(content);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  const getNoteTypeConfig = (type: NoteType) =>
    NOTE_TYPES.find((t) => t.value === type) ?? NOTE_TYPES[0];

  return (
    <div className="space-y-6">
      {/* Add New Note */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Note</CardTitle>
          <CardDescription>
            Add natural language rules like "No fish on Mondays" or "More salads in summer"
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="e.g., We prefer one-pot meals on weeknights..."
            rows={3}
          />
          <div className="flex gap-2">
            <Select
              value={newType}
              onValueChange={(v) => setNewType(v as NoteType)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAddNote}
              disabled={!newContent.trim() || addNote.isPending}
              className="flex-1"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Note
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Type Legend */}
      <div className="flex flex-wrap gap-2">
        {NOTE_TYPES.map((type) => (
          <Badge key={type.value} variant="outline" className={type.color}>
            {type.label}
          </Badge>
        ))}
      </div>

      {/* Notes List */}
      {(notes ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-2">No notes yet</p>
          <p className="text-sm text-muted-foreground">
            Add natural language rules and preferences
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {(notes ?? []).map((note) => {
            const typeConfig = getNoteTypeConfig(note.noteType);
            const isEditing = editingId === note.id;

            return (
              <Card
                key={note.id}
                className={!note.isActive ? 'opacity-50' : ''}
              >
                <CardContent className="p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={2}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleUpdateNote(note.id)}
                          disabled={updateNote.isPending}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Badge variant="outline" className={typeConfig.color}>
                          {typeConfig.label}
                        </Badge>
                        <p className="flex-1 text-sm">{note.content}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`active-${note.id}`}
                            checked={note.isActive}
                            onCheckedChange={() =>
                              handleToggleActive(note.id, note.isActive)
                            }
                          />
                          <Label
                            htmlFor={`active-${note.id}`}
                            className="text-sm text-muted-foreground"
                          >
                            Active
                          </Label>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditing(note.id, note.content)}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteNote.mutate(note.id)}
                            disabled={deleteNote.isPending}
                          >
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
