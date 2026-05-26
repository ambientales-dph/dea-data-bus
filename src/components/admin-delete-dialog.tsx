'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from 'lucide-react';

interface AdminDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  title: string;
  description: string;
  isLoading?: boolean;
}

export function AdminDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  isLoading
}: AdminDeleteDialogProps) {
  const [confirmationText, setConfirmationText] = useState('');

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (confirmationText.toLowerCase() === 'borralo') {
      await onConfirm();
      setConfirmationText('');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-t-4 border-t-destructive rounded-none max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertTriangle className="h-5 w-5" />
            <AlertDialogTitle className="text-sm font-black uppercase tracking-tight">Acción de Administrador</AlertDialogTitle>
          </div>
          <AlertDialogHeader className="text-left space-y-1">
            <p className="text-xs font-black text-black uppercase">{title}</p>
            <AlertDialogDescription className="text-xs font-medium text-muted-foreground leading-relaxed">
              {description} Esta acción es irreversible y limpiará todos los datos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogHeader>

        <div className="py-4 space-y-3">
          <Label className="text-[10px] font-black uppercase text-black">
            Escribí <span className="text-destructive">"borralo"</span> para confirmar
          </Label>
          <Input
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder="Escribí aquí..."
            className="h-10 text-xs font-bold border-black rounded-none focus-visible:ring-destructive/20"
            disabled={isLoading}
          />
        </div>

        <AlertDialogFooter className="flex-row gap-2">
          <AlertDialogCancel 
            className="flex-1 h-10 text-[10px] font-black uppercase tracking-widest rounded-none border-black m-0"
            disabled={isLoading}
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={confirmationText.toLowerCase() !== 'borralo' || isLoading}
            className="flex-1 h-10 text-[10px] font-black uppercase tracking-widest rounded-none bg-destructive hover:bg-destructive/90 text-white m-0"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Borrado'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
