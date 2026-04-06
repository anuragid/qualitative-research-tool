import React, { useState, useEffect, useRef } from 'react';
import { useUpdateProject } from '../../hooks/useProjects';
import { usePostHog } from '@posthog/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Loader2 } from 'lucide-react';

interface EditProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: {
    id: string;
    name: string;
    description?: string | null;
    status?: string;
  };
}

export function EditProjectDialog({
  open,
  onOpenChange,
  project,
}: EditProjectDialogProps) {
  const { mutate: updateProject, isPending, error: mutationError } = useUpdateProject();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const prevOpen = useRef(open);
  const posthog = usePostHog();

  // Reset form only when dialog first opens, not on every re-render
  useEffect(() => {
    if (open && !prevOpen.current) {
      setName(project.name);
      setDescription(project.description || '');
    }
    prevOpen.current = open;
  }, [open, project.name, project.description]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      return;
    }

    updateProject(
      {
        id: project.id,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          posthog?.capture("project_edited", {
            project_id: project.id,
          });
          onOpenChange(false);
        },
        onError: () => {
          // Error is handled by the mutation's error state
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>
              Make changes to your project details below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Project Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter project name"
                maxLength={255}
                disabled={isPending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this research about? e.g., 'Understanding why users abandon onboarding in mobile banking apps.' This guides the AI analysis — be specific about your research question."
                maxLength={5000}
                disabled={isPending}
                rows={4}
              />
            </div>
          </div>
          {mutationError && (
            <p className="text-sm text-destructive mt-2">Failed to save. Please try again.</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
