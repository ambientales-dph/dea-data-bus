'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDocs } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, Clock, User, Camera, ClipboardCheck, Info, PenTool } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhotoRegistry } from './photo-registry';
import { TechnicianLink } from './technician-link';

interface Props {
  reportId: string;
  formId: string;
  stationId: string;
  onClose?: () => void;
}

// Estructura de secciones. 'dynamic: true' indica que el título es editable por el usuario.
const SECTIONS = [
  {
    title: "1. Acuerdos y solicitudes anteriores",
    items: [
      { id: "acuerdo_1", label: "..................................................", dynamic: true },
      { id: "acuerdo_2", label: "..................................................", dynamic: true },
      { id: "acuerdo_3", label: "..................................................", dynamic: true },
      { id: "acuerdo_4", label: "..................................................", dynamic: true }
    ]
  },
  {
    title: "2. Programa de Manejo de Obrador",
    items: [
      { id: "obrador_limpieza", label: "Orden y Limpieza del obrador" },
      { id: "obrador_rsu", label: "Correcto manejo de RSU en obrador" },
      { id: "obrador_especiales", label: "Correcto manejo de residuos especiales" },
      { id: "obrador_hidro", label: "Correcto manejo de hidrocarburos y derivados" },
      { id: "obrador_inertes", label: "Correcto acopio de materiales inertes en obrador" }
    ]
  },
  {
    title: "3. Frente de Obra",
    items: [
      { id: "frente_limpieza", label: "Orden y Limpieza del frente de obra" },
      { id: "frente_rsu", label: "Correcto manejo de RSU en frente de obra" },
      { id: "frente_especiales", label: "Correcto manejo de residuos especiales en frente de obra" },
      { id: "frente_hidro", label: "Correcto manejo de hidrocarburos y derivados" }
    ]
  },
  {
    title: "4. Programa de Comunicación, Difusión y Gestión de Reclamos",
    items: [
      { id: "com_buzones", label: "Existencia de buzones y libros de acta activos" },
      { id: "com_recepcion", label: "Se han recepcionado reclamos o consultas por los medios oficiales" },
      { id: "com_carteleria", label: "Carteleria informativa de obra y genero visible y accesible" },
      { id: "com_banos", label: "Existencia de baños discretizados por sexo" },
      { id: "com_conducta", label: "Todo el personal afectado a obra ha firmado el código de conducta" }
    ]
  },
  {
    title: "5. Programa de Cumplimiento Legal, Permisos y Autorizaciones",
    items: [
      { id: "permiso_1", label: "..................................................", dynamic: true },
      { id: "permiso_2", label: "..................................................", dynamic: true }
    ]
  },
  {
    title: "6. Programa de Ordenamiento de la Circulación Vehicular",
    items: [
      { id: "vial_estado", label: "Se observa buen estado de caminos, se realizan tareas periódicas de mantenimiento" },
      { id: "vial_dyn_1", label: "..................................................", dynamic: true },
      { id: "vial_dyn_2", label: "..................................................", dynamic: true },
      { id: "vial_dyn_3", label: "..................................................", dynamic: true }
    ]
  },
  {
    title: "7. Programa de Manejo Suelo / Recinto",
    items: [
      { id: "suelo_sector", label: "Se respeta el sector de disposición final de suelo" },
      { id: "suelo_dyn_1", label: "..................................................", dynamic: true }
    ]
  },
  {
    title: "8. Programa de Monitoreo Ambiental",
    items: [
      { id: "monit_agua", label: "Se realizan de forma quincenal los monitoreos de agua" },
      { id: "monit_suelo", label: "Se ha realizado el monitoreo de suelo inicial" },
      { id: "monit_derrame", label: "Se observa en obra kits para contencion de derrames en lugar accesible" },
      { id: "monit_dyn_1", label: "..................................................", dynamic: true }
    ]
  },
  {
    title: "9. Programa de Prevención de Interferencias",
    items: [
      { id: "interf_servicios", label: "¿Se han detectado interferencias con servicios públicos? ¿Se contactó a la empresa prestadora?" },
      { id: "interf_dyn_1", label: "..................................................", dynamic: true }
    ]
  },
  {
    title: "10. Programa de Prevención de Contingencias",
    items: [
      { id: "cont_emergencia", label: "Control de contingencias y respuesta ante emergencias" },
      { id: "cont_dyn_1", label: "..................................................", dynamic: true },
      { id: "cont_dyn_2", label: "..................................................", dynamic: true }
    ]
  }
];

export function PgaysChecklistForm({ reportId, formId, stationId, onClose }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [savingFields, setSavingFields] = useState<Record<string, boolean>>({});
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const [openPhotos, setOpenPhotos] = useState<Record<string, boolean>>({});
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [metadata, setMetadata] = useState<{ user?: string, timestamp?: any }>({});

  useEffect(() => {
    const fetchExistingData = async () => {
      if (!reportId || !formId || !db) return;
      setIsLoadingExisting(true);
      try {
        const q = query(
          collection(db, 'samples'),
          where('reportId', '==', reportId),
          where('formId', '==', formId)
        );
        const snapshot = await getDocs(q);
        
        const newFormData: Record<string, any> = {};
        const newSavedFields: Record<string, boolean> = {};
        let foundMetadata = { user: user?.email || '', timestamp: null };

        snapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.parameterType === "Fotografía") return;

          newFormData[data.analyte] = data.value;
          newSavedFields[data.analyte] = true;
          
          if (!foundMetadata.timestamp || (data.timestamp && data.timestamp.toMillis() < foundMetadata.timestamp.toMillis())) {
            foundMetadata = { user: data.userEmail || user?.email || '', timestamp: data.timestamp };
          }
        });

        setFormData(newFormData);
        setSavedFields(newSavedFields);
        setMetadata(foundMetadata);
      } catch (e) {
        console.error("Error fetching PGAyS data", e);
      } finally {
        setIsLoadingExisting(false);
      }
    };

    fetchExistingData();
  }, [db, reportId, formId, user?.email]);

  const saveParam = async (name: string, category: string, valueOverride?: any) => {
    if (!user || !db) return;
    const value = valueOverride !== undefined ? valueOverride : formData[name];
    if (value === null || value === undefined || value === "") return;

    setSavingFields(prev => ({ ...prev, [name]: true }));
    
    try {
      const q = query(
        collection(db, 'samples'),
        where('reportId', '==', reportId),
        where('formId', '==', formId),
        where('analyte', '==', name)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        await updateDoc(doc(db, 'samples', snapshot.docs[0].id), {
          value: `${value}`,
          timestamp: serverTimestamp(),
          userId: user.uid,
          userEmail: user.email
        });
      } else {
        await addDoc(collection(db, 'samples'), {
          medium: 'sedimentos',
          parameterType: category,
          analyte: name,
          value: `${value}`,
          reportId,
          formId,
          stationId,
          userId: user.uid,
          userEmail: user.email,
          timestamp: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, 'reports', reportId), { editors: arrayUnion(user.email) });
      setSavedFields(prev => ({ ...prev, [name]: true }));
      toast({ title: "Sincronizado", description: `Dato guardado.` });
    } catch (error: any) {
      console.error(error);
    } finally {
      setSavingFields(prev => ({ ...prev, [name]: false }));
    }
  };

  const handleInputChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (savedFields[name]) {
      setSavedFields(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const togglePhotos = (item: string) => {
    setOpenPhotos(prev => ({ ...prev, [item]: !prev[item] }));
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (isLoadingExisting) {
    return <div className="p-12 text-center text-xs animate-pulse font-normal uppercase text-black">Cargando Inspección PGAyS...</div>;
  }

  const renderItem = (item: { id: string, label: string, dynamic?: boolean }, sectionTitle: string) => {
    // Si es dinámico, el técnico puede editar el nombre del analito.
    const customLabelKey = `${item.id}:custom_label`;
    const labelToUse = item.dynamic ? (formData[customLabelKey] || item.label) : item.label;
    
    return (
      <div key={item.id} className="p-3 bg-white border-b border-neutral-100 last:border-0 hover:bg-neutral-50/50 transition-colors">
        <div className="flex flex-col gap-3">
          {item.dynamic ? (
            <div className="flex items-center gap-2 border-b border-dashed border-neutral-200 pb-2">
              <Input 
                value={formData[customLabelKey] ?? ""}
                onChange={(e) => handleInputChange(customLabelKey, e.target.value)}
                placeholder={item.label}
                className="h-8 text-[11px] font-bold uppercase border-none bg-transparent focus-visible:ring-0 p-0"
              />
              <button 
                onClick={() => saveParam(customLabelKey, "Etiqueta")}
                className={cn("p-1 transition-colors", savedFields[customLabelKey] ? "text-green-600" : "text-black")}
              >
                {savingFields[customLabelKey] ? <Loader2 className="h-3 w-3 animate-spin" /> : savedFields[customLabelKey] ? <Check className="h-3 w-3" /> : <Check className="h-3 w-3 opacity-30" />}
              </button>
            </div>
          ) : (
            <Label className="text-[11px] font-normal text-black leading-tight flex-1">{item.label}</Label>
          )}

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <Select 
                value={formData[`${labelToUse}:cumple`] ?? ""} 
                onValueChange={(val) => {
                  handleInputChange(`${labelToUse}:cumple`, val);
                  saveParam(`${labelToUse}:cumple`, "Inspección", val);
                }}
              >
                <SelectTrigger className="h-8 w-24 rounded-none border-black text-[10px] uppercase font-normal bg-white">
                  <SelectValue placeholder="CUMPLE" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SI" className="text-xs">SÍ</SelectItem>
                  <SelectItem value="NO" className="text-xs">NO</SelectItem>
                  <SelectItem value="N/A" className="text-xs">N/A</SelectItem>
                </SelectContent>
              </Select>
              <div className={cn("p-1 shrink-0", savedFields[`${labelToUse}:cumple`] ? "text-green-600" : "text-transparent")}>
                {savingFields[`${labelToUse}:cumple`] ? <Loader2 className="h-3.5 w-3.5 animate-spin text-black" /> : <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5" /></div>}
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1">
                <Textarea 
                  placeholder="Observaciones..."
                  className="min-h-[36px] text-[11px] rounded-none border-neutral-300 bg-white focus-visible:ring-primary/20 resize-none py-1.5"
                  value={formData[`${labelToUse}:obs`] ?? ""}
                  onChange={(e) => handleInputChange(`${labelToUse}:obs`, e.target.value)}
                />
                <button 
                  onClick={() => saveParam(`${labelToUse}:obs`, "Observación")} 
                  className={cn("absolute right-1 bottom-1 p-1", savedFields[`${labelToUse}:obs`] ? "text-green-600" : "text-black hover:text-primary")}
                >
                  {savingFields[`${labelToUse}:obs`] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </button>
              </div>
              <button 
                onClick={() => togglePhotos(item.id)}
                className={cn(
                  "h-9 w-9 flex items-center justify-center border transition-all shrink-0",
                  openPhotos[item.id] ? "bg-black text-white border-black" : "bg-neutral-100 text-neutral-600 border-neutral-300 hover:bg-neutral-200"
                )}
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {openPhotos[item.id] && (
            <div className="animate-in slide-in-from-top-2 duration-300 border-t border-neutral-100 mt-1 pt-2">
              <PhotoRegistry 
                reportId={reportId} 
                formId={formId} 
                stationId={stationId} 
                medium="sedimentos" 
                analyteTag={`PGAyS: ${labelToUse}`}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full border border-black bg-white font-body shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300 pb-24 overflow-hidden">
      <div className="border-b-2 border-black bg-neutral-100 px-4 py-3">
        <h1 className="text-sm font-normal uppercase tracking-tight text-black font-headline">Inspección de Obra • PGAyS-001</h1>
        <div className="flex flex-col gap-0.5 mt-2">
           <p className="text-[10px] text-black font-normal uppercase leading-none tracking-tight">Planilla ID: {formId}</p>
           <div className="flex items-center gap-3 text-[9px] text-black font-normal uppercase tracking-tighter mt-1">
              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5 text-primary" /> {formatTimestamp(metadata.timestamp)}</span>
              <span className="flex items-center gap-1"><User className="h-2.5 w-2.5 text-primary" /> <TechnicianLink email={metadata.user || user?.email || null} /></span>
           </div>
        </div>
      </div>

      <div className="p-0 border-b border-black">
        <div className="bg-neutral-50 px-3 py-1.5 border-b border-neutral-200">
           <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Datos de la Inspección</span>
        </div>
        {[
          { id: "personal_afectado", label: "Personal afectado a obra" },
          { id: "personal_dyn_1", label: "..................................................", dynamic: true },
          { id: "personal_dyn_2", label: "..................................................", dynamic: true }
        ].map(item => (
          <div key={item.id} className="flex items-center justify-between py-2 px-3 border-b border-neutral-100 last:border-0">
            {item.dynamic ? (
              <div className="flex items-center gap-2 flex-1">
                <Input 
                  value={formData[`${item.id}:custom_label`] ?? ""}
                  onChange={(e) => handleInputChange(`${item.id}:custom_label`, e.target.value)}
                  placeholder={item.label}
                  className="h-7 text-[10px] uppercase font-bold border-none bg-transparent p-0"
                />
                <button onClick={() => saveParam(`${item.id}:custom_label`, "Etiqueta")} className="text-black opacity-30 hover:opacity-100"><Check className="h-3 w-3" /></button>
              </div>
            ) : (
              <label className="text-[11px] font-normal text-black uppercase flex-1">{item.label}</label>
            )}
            <div className="flex items-center gap-2">
              <input 
                type="text" 
                className="h-7 w-20 border-none bg-neutral-50 px-2 text-[12px] font-code text-black text-right focus:ring-0 outline-none" 
                value={formData[item.dynamic ? (formData[`${item.id}:custom_label`] || item.label) : item.label] ?? ""}
                onChange={(e) => handleInputChange(item.dynamic ? (formData[`${item.id}:custom_label`] || item.label) : item.label, e.target.value)}
                placeholder="---"
              />
              <button 
                onClick={() => saveParam(item.dynamic ? (formData[`${item.id}:custom_label`] || item.label) : item.label, "General")} 
                className={cn("p-1", savedFields[item.dynamic ? (formData[`${item.id}:custom_label`] || item.label) : item.label] ? "text-green-600" : "text-black")}
              >
                {savingFields[item.dynamic ? (formData[`${item.id}:custom_label`] || item.label) : item.label] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-0">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="bg-black text-white px-3 py-1.5 flex items-center gap-2 sticky top-0 z-10">
              <ClipboardCheck className="h-3.5 w-3.5" />
              <span className="text-[10px] font-normal uppercase tracking-widest">{section.title}</span>
            </div>
            <div className="divide-y divide-neutral-100">
              {section.items.map((item) => renderItem(item, section.title))}
            </div>
          </div>
        ))}
      </div>

      {/* Sección de Firmas */}
      <div className="mt-6 border-t-2 border-black">
        <div className="bg-neutral-900 text-white px-3 py-2 flex items-center gap-2">
          <PenTool className="h-4 w-4" />
          <span className="text-[10px] font-normal uppercase tracking-widest">Registro de Firmas e Intervinientes</span>
        </div>
        <div className="p-4 bg-neutral-50">
          <p className="text-[10px] text-neutral-600 mb-3 italic">Capture fotografía del acta de inspección con las firmas correspondientes de los intervinientes.</p>
          <PhotoRegistry 
            reportId={reportId} 
            formId={formId} 
            stationId={stationId} 
            medium="sedimentos" 
            analyteTag="Firmas de Intervinientes"
          />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-black shadow-2xl z-[100] md:relative md:mt-10 md:shadow-none">
        <Button onClick={onClose} className="w-full h-12 bg-black hover:bg-neutral-900 text-white font-normal uppercase tracking-widest text-[11px] rounded-none shadow-xl">Finalizar Inspección de Obra</Button>
      </div>
    </div>
  );
}
