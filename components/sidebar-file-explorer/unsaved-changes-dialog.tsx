import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type UnsavedChangesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingFileName: string | null;
  onCancel: () => void;
  onDiscardAndOpen: () => void;
  onSaveAndOpen: () => void;
  saveInFlight: boolean;
  canSave: boolean;
};

export function UnsavedChangesDialog({
  open,
  onOpenChange,
  pendingFileName,
  onCancel,
  onDiscardAndOpen,
  onSaveAndOpen,
  saveInFlight,
  canSave,
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingFileName ? (
              <>
                Opening <span className="font-medium text-foreground">{pendingFileName}</span> will
                close the current document. Save your edits first, or discard them to continue.
              </>
            ) : (
              'Opening another document will close the current one. Save your edits first, or discard them to continue.'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel type="button" onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <Button
            type="button"
            variant="outline"
            onClick={onDiscardAndOpen}
            disabled={saveInFlight}
          >
            Discard and open
          </Button>
          <AlertDialogAction type="button" onClick={onSaveAndOpen} disabled={!canSave || saveInFlight}>
            {saveInFlight ? 'Saving…' : 'Save and open'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
