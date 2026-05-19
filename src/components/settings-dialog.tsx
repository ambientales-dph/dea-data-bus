'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Timer, Settings, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [minutes, setMinutes] = useState(10);

  useEffect(() => {
    const savedEnabled = localStorage.getItem('dea_timeout_enabled');
    const savedMinutes = localStorage.getItem('dea_timeout_minutes');
    
    if (savedEnabled !== null) setEnabled(savedEnabled === 'true');
    if (savedMinutes !== null) setMinutes(parseInt(savedMinutes, 10));
  }, [open]);

  const handleSave = () => {
    localStorage.setItem('dea_timeout_enabled', enabled.toString());
    localStorage.setItem('dea_timeout_minutes', minutes.toString());
    
    window.dispatchEvent(new Event('dea-settings-updated'));
    
    toast({
      title: "Configuración guardada",
      description: `Inactividad: ${enabled ? `${minutes} min` : 'Desactivado'}.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[340px] p-4 border-t-4 border-t-primary shadow-2xl">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-primary/10 rounded-full">
              <Settings className="h-4 w-4 text-primary" />
            </div>
            <DialogTitle className="text-sm font-bold font-headline">Configuración de Sesión</DialogTitle>
          </div>
          <DialogDescription className="text-left text-[11px] leading-tight">
            Ajustá el sistema para el trabajo en campo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between p-2 rounded-md bg-muted/30 border border-muted-foreground/10">
            <div className="space-y-0.5">
              <Label className="text-xs font-bold flex items-center gap-2">
                <Timer className="h-3 w-3 text-primary" />
                Auto-cierre
              </Label>
              <p className="text-[9px] text-muted-foreground leading-none">Cerrar sesión por inactividad.</p>
            </div>
            <Switch 
              checked={enabled} 
              onCheckedChange={setEnabled} 
              className="scale-75"
            />
          </div>

          {enabled && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider px-1">Minutos permitidos</Label>
              <div className="flex items-center gap-3">
                <Input 
                  type="number" 
                  min="1" 
                  max="480" 
                  value={minutes} 
                  onChange={(e) => setMinutes(parseInt(e.target.value, 10) || 1)}
                  className="h-9 w-20 text-sm font-code font-bold text-center border-primary/20 focus-visible:ring-primary/30"
                />
                <span className="text-[11px] font-medium text-muted-foreground">minutos</span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 p-2 rounded-md bg-primary/5 border border-primary/10">
            <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-[9px] leading-tight text-primary/80 italic">
              Desactivar el cierre facilita el trabajo, pero recordá cerrar sesión manualmente al terminar.
            </p>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button onClick={handleSave} className="w-full h-9 text-xs font-bold shadow-sm bg-primary hover:bg-primary/90">
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
