import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeleteProject } from '../../hooks/useProjects';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { AlertTriangle } from 'lucide-react';

interface DeleteProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: {
    id: string;
    name: string;
    videoCount?: number;
  };
  navigateAfterDelete?: boolean;
}

export function DeleteProjectDialog({
  open,
  onOpenChange,
  project,
  navigateAfterDelete = false,
}: DeleteProjectDialogProps) {
  const navigate = useNavigate();
  const { mutate: deleteProject, isPending } = useDeleteProject();

  const handleDelete = () => {
    deleteProject(project.id, {
      onSuccess: () => {
        onOpenChange(false);
        if (navigateAfterDelete) {
          navigate('/projects');
        }
      },
      onError: (error) => {
        console.error('Error deleting project:', error);
        // Optionally show an error message to the user
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Delete Project
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-gray-500">
          <p>
            Are you sure you want to delete the project{' '}
            <span className="font-semibold">"{project.name}"</span>?
          </p>
          <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm">
            <p className="font-semibold text-red-800 mb-1">
              This action cannot be undone and will permanently delete:
            </p>
            <ul className="list-disc list-inside text-red-700 space-y-1">
              <li>The project and all its settings</li>
              {project.videoCount && project.videoCount > 0 && (
                <>
                  <li>{project.videoCount} video{project.videoCount > 1 ? 's' : ''}</li>
                  <li>All associated transcripts</li>
                  <li>All analysis data</li>
                </>
              )}
            </ul>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Deleting...
              </>
            ) : (
              'Delete Project'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}