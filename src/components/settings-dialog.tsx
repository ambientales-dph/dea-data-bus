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
    
    // Emitir evento personalizado para que el manager se actualice
    window.dispatchEvent(new Event('dea-settings-updated'));
    
    toast({
      title: "Configuración guardada",
      description: `Tiempo de inactividad: ${enabled ? `${minutes} minutos` : 'Desactivado'}.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] border-t-4 border-t-primary shadow-2xl">
        <DialogHeader>
          <div className="mx-auto mb-2 p-3 bg-primary/10 rounded-full w-fit">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center font-headline font-bold text-xl">Configuración de Sesión</DialogTitle>
          <DialogDescription className="text-center text-xs">
            Ajustá el comportamiento del sistema para el trabajo en campo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-muted-foreground/10">
            <div className="space-y-0.5">
              <Label className="text-sm font-bold flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary" />
                Auto-cierre de sesión
              </Label>
              <p className="text-[10px] text-muted-foreground leading-tight">Cierra la sesión automáticamente tras inactividad.</p>
            </div>
            <Switch 
              checked={enabled} 
              onCheckedChange={setEnabled} 
            />
          </div>

          {enabled && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <Label className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider px-1">Tiempo de inactividad (minutos)</Label>
              <div className="flex items-center gap-4">
                <Input 
                  type="number" 
                  min="1" 
                  max="480" 
                  value={minutes} 
                  onChange={(e) => setMinutes(parseInt(e.target.value, 10) || 1)}
                  className="h-12 text-lg font-code font-bold text-center border-primary/20 focus-visible:ring-primary/30"
                />
                <span className="text-xs font-medium text-muted-foreground shrink-0">minutos</span>
              </div>
              <p className="text-[10px] text-muted-foreground italic px-1">
                Sugerencia: 10 min (estándar) o 30 min (campo intenso).
              </p>
            </div>
          )}

          <div className="flex items-start gap-3 p-3 rounded-md bg-primary/5 border border-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p className="text-[10px] leading-tight text-primary/80">
              <b>Nota de seguridad:</b> Desactivar el auto-cierre facilita el trabajo, pero recordá cerrar sesión manualmente si compartís el dispositivo.
            </p>
          </div>
        </div>

        <DialogFooter className="sm:justify-center">
          <Button onClick={handleSave} className="w-full h-12 font-bold shadow-md bg-primary hover:bg-primary/90">
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
