
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Timer, Settings, ShieldCheck, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Panel de configuración de sesión.
 * Utiliza un diseño flotante no modal para permitir la operación en campo 
 * sin bloquear el resto de la interfaz.
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [minutes, setMinutes] = useState(10);

  useEffect(() => {
    if (open) {
      const savedEnabled = localStorage.getItem('dea_timeout_enabled');
      const savedMinutes = localStorage.getItem('dea_timeout_minutes');
      
      if (savedEnabled !== null) setEnabled(savedEnabled === 'true');
      if (savedMinutes !== null) setMinutes(parseInt(savedMinutes, 10));
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
    // Restauración manual de foco al cerrar el panel flotante
    document.getElementById('user-menu-trigger')?.focus();
  };

  const handleSave = () => {
    localStorage.setItem('dea_timeout_enabled', enabled.toString());
    localStorage.setItem('dea_timeout_minutes', minutes.toString());
    
    // Notificar al SessionTimeoutManager para que actualice sus timers
    window.dispatchEvent(new Event('dea-settings-updated'));
    
    toast({
      title: "Configuración guardada",
      description: `Inactividad: ${enabled ? `${minutes} min` : 'Desactivado'}.`,
    });
    handleClose();
  };

  if (!open) return null;

  return (
    <div 
      className={cn(
        "fixed right-4 top-20 z-[100] w-[260px] rounded-lg border bg-background p-3 shadow-2xl outline-none",
        "animate-in fade-in slide-in-from-right-2 duration-200"
      )}
      role="dialog"
      aria-labelledby="settings-title"
    >
      <div className="flex items-center justify-between mb-3 border-b pb-2">
        <div className="flex items-center gap-2">
          <Settings className="h-3.5 w-3.5 text-foreground" />
          <h2 id="settings-title" className="text-[10px] font-black uppercase tracking-widest text-foreground font-headline">
            Configuración
          </h2>
        </div>
        <button 
          onClick={handleClose}
          className="text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
          aria-label="Cerrar configuración"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="space-y-0.5">
            <Label className="text-[10px] font-bold flex items-center gap-1.5 text-foreground">
              <Timer className="h-3 w-3 text-muted-foreground" />
              Auto-cierre
            </Label>
          </div>
          <Switch 
            checked={enabled} 
            onCheckedChange={setEnabled} 
            className="scale-75 origin-right"
          />
        </div>

        {enabled && (
          <div className="space-y-1.5 px-1 animate-in fade-in slide-in-from-top-1 duration-200">
            <Label className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Inactividad (minutos)</Label>
            <div className="flex items-center gap-2">
              <Input 
                type="number" 
                min="1" 
                max="480" 
                value={minutes} 
                onChange={(e) => setMinutes(parseInt(e.target.value, 10) || 1)}
                className="h-7 w-16 text-xs font-code font-bold text-center border-input focus-visible:ring-primary/30"
              />
              <span className="text-[10px] font-medium text-muted-foreground">min</span>
            </div>
          </div>
        )}

        <div className="flex items-start gap-1.5 p-1.5 rounded bg-primary/5 border border-primary/10">
          <ShieldCheck className="h-3 w-3 text-foreground shrink-0 mt-0.5" />
          <p className="text-[8px] leading-tight text-foreground/80 italic">
            Ajuste recomendado para trabajo prolongado en campo.
          </p>
        </div>

        <Button onClick={handleSave} className="w-full h-8 text-[10px] font-black uppercase tracking-widest shadow-sm bg-primary hover:bg-primary/90">
          Aplicar
        </Button>
      </div>
    </div>
  );
}
