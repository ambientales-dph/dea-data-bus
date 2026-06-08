
'use client';

import { useState, useMemo, useEffect } from 'react';
import { collection, setDoc, serverTimestamp, doc, updateDoc, arrayUnion, query, where, getDocs, Timestamp, deleteDoc } from 'firebase/firestore';
import { useFirestore, useUser, useDoc } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, CheckCircle2, Clock, User, Calendar, Settings2, Plus, Trash2, ChevronDown, ChevronUp, Star, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhotoRegistry } from './photo-registry';
import { TechnicianLink } from './technician-link';
import { getCurrentGPSLocation } from '@/lib/geo-utils';

type MeasurementSystem = 'metric' | 'imperial' | 'local';

interface Reading {
  id: string;
  value: string;
  capturedAt: number;
  isSaved: boolean;
  isSaving: boolean;
}

interface CustomAnalyteState {
  readings: Reading[];
  unit: string;
  isExpanded: boolean;
  userEmail?: string;
}

interface Props {
  reportId: string;
  formId: string;
  stationId: string;
  templateData: any;
  templateId: string;
  onClose?: () => void;
}

export function CustomTemplateFormIntegrated({ reportId, formId, stationId, templateData, templateId, onClose }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(templateData?.name || 'Protocolo Personalizado');
  const [globalSystem, setGlobalSystem] = useState<MeasurementSystem>('metric');
  const [formData, setFormData] = useState<Record<string, CustomAnalyteState>>({});
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [metadata, setMetadata] = useState<{ timestamp?: any }>({});
  const [isDeferred, setIsDeferred] = useState(false);
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().slice(0, 16));

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
        
        const newFormData: Record<string, CustomAnalyteState> = {};
        let foundMetadata = { timestamp: null };
        let foundDeferred = false;

        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          const analyte = data.analyte;
          if (data.parameterType === 'Fotografía') return;

          const fullValue = data.value || "";
          const lastSpaceIdx = fullValue.lastIndexOf(" ");
          let val = fullValue;
          let unit = "";
          if (lastSpaceIdx !== -1) {
            val = fullValue.substring(0, lastSpaceIdx);
            unit = fullValue.substring(lastSpaceIdx + 1);
          }

          if (!newFormData[analyte]) {
            newFormData[analyte] = { readings: [], unit: unit || "", isExpanded: false, userEmail: data.userEmail };
          }

          newFormData[analyte].readings.push({
            id: docSnap.id,
            value: val,
            capturedAt: data.capturedAt?.toMillis?.() || Date.now(),
            isSaved: true,
            isSaving: false
          });
          
          if (!foundMetadata.timestamp || (data.timestamp && data.timestamp.toMillis() < foundMetadata.timestamp.toMillis())) {
            foundMetadata = { timestamp: data.fechaServidor || data.timestamp };
            if (data.timestamp) {
               const date = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
               setManualDate(date.toISOString().slice(0, 16));
            }
          }
          if (data.isDeferred !== undefined) foundDeferred = data.isDeferred;
        });

        setFormData(newFormData);
        setMetadata(foundMetadata);
        setIsDeferred(foundDeferred);
      } catch (e) {
        console.error("Error fetching", e);
      } finally {
        setIsLoadingExisting(false);
      }
    };

    fetchExistingData();
  }, [db, reportId, formId]);

  const handleReadingChange = (analyteName: string, readingId: string, value: string) => {
    setFormData(prev => {
      const analyte = prev[analyteName] || { readings: [], unit: "", isExpanded: true };
      const updatedReadings = analyte.readings.map(r => 
        r.id === readingId ? { ...r, value, isSaved: false } : r
      );
      return { ...prev, [analyteName]: { ...analyte, readings: updatedReadings } };
    });
  };

  const addReading = (analyteName: string, initialUnit: string) => {
    setFormData(prev => {
      const analyte = prev[analyteName] || { readings: [], unit: initialUnit, isExpanded: true };
      const newReading: Reading = {
        id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        value: "",
        capturedAt: Date.now(),
        isSaved: false,
        isSaving: false
      };
      return { 
        ...prev, 
        [analyteName]: { 
          ...analyte, 
          readings: [...analyte.readings, newReading],
          isExpanded: true 
        } 
      };
    });
  };

  const removeReading = (analyteName: string, readingId: string) => {
    setFormData(prev => {
      const analyte = prev[analyteName];
      if (!analyte) return prev;
      if (!readingId.startsWith('temp_')) {
        deleteDoc(doc(db, 'samples', readingId)).catch(console.error);
      }
      return { 
        ...prev, 
        [analyteName]: { ...analyte, readings: analyte.readings.filter(r => r.id !== readingId) } 
      };
    });
  };

  const saveReading = (analyteName: string, readingId: string, category: string, medium: string) => {
    if (!user || !db) return;
    const analyteState = formData[analyteName];
    const reading = analyteState.readings.find(r => r.id === readingId);
    if (!reading || reading.value === "") return;

    setFormData(prev => ({
      ...prev,
      [analyteName]: {
        ...prev[analyteName],
        userEmail: user.email!,
        readings: prev[analyteName].readings.map(r => 
          r.id === readingId ? { ...r, isSaved: true, isSaving: false } : r
        )
      }
    }));

    (async () => {
      try {
        const location = await getCurrentGPSLocation();
        const finalValue = analyteState.unit ? `${reading.value} ${analyteState.unit}` : reading.value;
        const docId = readingId.startsWith('temp_') 
          ? `${reportId}_${formId}_${analyteName.replace(/\s+/g, '_')}_${reading.capturedAt}`
          : readingId;

        const sampleRef = doc(db, 'samples', docId);
        const payload = {
          medium,
          parameterType: category,
          analyte: analyteName,
          reportId,
          formId,
          stationId,
          value: finalValue,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          retrasoSincronizacionMs: isDeferred ? 0 : Date.now() - reading.capturedAt,
          fechaServidor: serverTimestamp(),
          timestamp: isDeferred ? Timestamp.fromDate(new Date(manualDate)) : serverTimestamp(),
          isDeferred,
          userId: user.uid,
          userEmail: user.email,
          capturedAt: Timestamp.fromMillis(reading.capturedAt)
        };

        setDoc(sampleRef, payload, { merge: true });
        updateDoc(doc(db, 'reports', reportId), { editors: arrayUnion(user.email) });
      } catch (err) {
        console.error("Error guardando lectura:", err);
      }
    })();
    toast({ title: "Lectura capturada", description: `${analyteName}` });
  };

  const calculateStats = (readings: Reading[]) => {
    const nums = readings.map(r => parseFloat(r.value.replace(',', '.'))).filter(n => !isNaN(n));
    if (nums.length === 0) return null;
    const n = nums.length;
    const mean = nums.reduce((a, b) => a + b, 0) / n;
    if (n < 2) return { mean: mean.toFixed(3), error: "0.000", n };
    const variance = nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
    const sd = Math.sqrt(variance);
    const se = sd / Math.sqrt(n); 
    return { mean: mean.toFixed(3), error: se.toFixed(3), n };
  };

  const handleUpdateTemplateName = () => {
    if (!templateId || !db) return;
    updateDoc(doc(db, 'custom_templates', templateId), { name: currentTitle });
    setIsEditingTitle(false);
    toast({ title: "Título actualizado" });
  };

  if (isLoadingExisting) {
    return <div className="p-12 text-center text-xs animate-pulse font-normal uppercase text-black">Cargando Protocolo PP-001...</div>;
  }

  const groupedParams = (templateData?.parameters || []).reduce((acc: any, p: any) => {
    const cat = p.categoria || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  return (
    <div className="mx-auto w-full border border-black bg-white font-body shadow-sm rounded-none overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      <div className="border-b border-black bg-neutral-100 px-4 py-4">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 group">
              {isEditingTitle ? (
                <div className="flex items-center gap-2 flex-1">
                  <input 
                    value={currentTitle} 
                    onChange={(e) => setCurrentTitle(e.target.value)}
                    className="text-sm font-normal uppercase tracking-tight bg-white border border-black px-2 py-0.5 focus:ring-0 outline-none w-full text-black"
                    autoFocus
                  />
                  <button onClick={handleUpdateTemplateName} className="p-1 text-green-600"><Check className="h-4 w-4" /></button>
                </div>
              ) : (
                <>
                  <h1 className="text-sm font-normal uppercase tracking-tight text-black font-headline">{currentTitle} • PP-001</h1>
                  <button onClick={() => setIsEditingTitle(true)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1">
                    <Pencil className="h-3 w-3 text-black" />
                  </button>
                </>
              )}
            </div>
            <p className="text-[10px] text-black font-normal uppercase leading-none tracking-tight mt-1">OID Planilla: {formId}</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0 ml-4">
            <div className="flex items-center gap-1 bg-white border border-black px-2 py-1">
               <Settings2 className="h-3 w-3 text-black" />
               <select 
                 value={globalSystem} 
                 onChange={(e) => setGlobalSystem(e.target.value as MeasurementSystem)}
                 className="text-[9px] font-normal uppercase bg-transparent border-none outline-none focus:ring-0 p-0 text-black"
               >
                 <option value="metric">Métrico (SI)</option>
                 <option value="imperial">Imperial</option>
                 <option value="local">Local</option>
               </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[9px] text-black font-normal uppercase tracking-tighter mt-3">
          {isDeferred ? (
            <div className="flex items-center gap-1.5 bg-white border border-black px-2 py-0.5 rounded-sm">
              <Calendar className="h-3 w-3 text-red-600" />
              <input 
                type="datetime-local" 
                value={manualDate} 
                onChange={(e) => setManualDate(e.target.value)}
                className="bg-transparent border-none p-0 text-[9px] font-normal uppercase outline-none focus:ring-0 w-32 text-black"
              />
            </div>
          ) : (
            <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5 text-black" /> {new Date().toLocaleString('es-AR')}</span>
          )}
          <button 
            onClick={() => setIsDeferred(!isDeferred)}
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded-full border transition-all font-normal",
              isDeferred ? "bg-red-50 border-red-200 text-red-600" : "bg-green-50 border-green-200 text-green-600"
            )}
          >
            <CheckCircle2 className="h-2.5 w-2.5" />
            <span className="text-[7px] font-normal">{isDeferred ? "DIFERIDA" : "REAL"}</span>
          </button>
        </div>
      </div>

      <div className="p-0">
        {Object.entries(groupedParams).map(([category, params]: [string, any]) => (
          <div key={category}>
            <div className="bg-black text-white px-4 py-2 flex items-center gap-2 sticky top-0 z-10">
              <Star className="h-3.5 w-3.5 text-accent fill-accent" />
              <span className="text-[10px] font-normal uppercase tracking-[0.2em]">{category}</span>
            </div>
            
            <div className="divide-y divide-neutral-200">
              {params.map((param: any) => {
                const state = formData[param.nombre] || { readings: [], unit: param.unidades || "", isExpanded: false };
                const stats = calculateStats(state.readings);
                const hasSavedValue = state.readings.some(r => r.isSaved);
                
                return (
                  <div key={param.nombre} className="flex flex-col bg-white overflow-hidden">
                    <div className="flex items-center justify-between py-3 px-4 hover:bg-neutral-50 transition-colors">
                      <button 
                        onClick={() => setFormData(prev => ({ ...prev, [param.nombre]: { ...state, isExpanded: !state.isExpanded } }))}
                        className="flex-1 text-left flex items-center gap-2"
                      >
                        {state.isExpanded ? <ChevronUp className="h-4 w-4 text-black" /> : <ChevronDown className="h-4 w-4 text-black" />}
                        <div className="flex flex-col">
                          <span className="text-[12px] font-normal text-black uppercase tracking-tight">{param.nombre}</span>
                          {hasSavedValue && state.userEmail && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <User className="h-2.5 w-2.5 text-black" />
                              <TechnicianLink email={state.userEmail} className="text-[8px] uppercase text-black font-normal" />
                            </div>
                          )}
                        </div>
                      </button>

                      <div className="flex items-center gap-3">
                        {stats && (
                          <div className="bg-neutral-100 px-3 py-1 rounded-sm border border-neutral-200 flex items-center gap-1.5" title="Media ± SE">
                            <span className="text-[10px] font-code font-normal text-black">x̄: {stats.mean} ± {stats.error}</span>
                          </div>
                        )}
                        <span className="text-[9px] font-normal text-black px-2">{param.unidades}</span>
                      </div>
                    </div>

                    {state.isExpanded && (
                      <div className="bg-white pb-2 animate-in slide-in-from-top-1 duration-200 divide-y divide-neutral-50 border-t border-neutral-100">
                        {state.readings.map((reading, idx) => (
                          <div key={reading.id} className="flex items-center justify-between gap-2 py-1 px-4 border-b border-neutral-50 last:border-0 hover:bg-neutral-50/50 transition-colors group">
                            <span className="text-[9px] font-normal uppercase text-black transition-colors shrink-0">L{idx + 1}</span>
                            <div className="flex items-center gap-2 flex-1 justify-end">
                              <input 
                                type="text" 
                                placeholder="0.00"
                                className="h-7 w-20 border-none bg-transparent px-1 text-[11px] font-code text-black text-right outline-none focus:ring-0 font-normal"
                                value={reading.value}
                                onChange={(e) => handleReadingChange(param.nombre, reading.id, e.target.value)}
                              />
                              <div className="flex items-center gap-1 border-l border-neutral-100 pl-2 ml-2">
                                <button 
                                  onClick={() => saveReading(param.nombre, reading.id, param.categoria, param.mediumKey)}
                                  className={cn("p-1 transition-colors", reading.isSaved ? "text-green-600" : "text-black")}
                                  title="Guardar"
                                >
                                  {reading.isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className={cn("h-3.5 w-3.5", !reading.isSaved && "opacity-30")} />}
                                </button>
                                <button 
                                  onClick={() => addReading(param.nombre, param.unidades)}
                                  className="p-1 text-black transition-colors"
                                  title="Agregar"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                                <button 
                                  onClick={() => removeReading(param.nombre, reading.id)}
                                  className="p-1 text-black hover:text-red-600 transition-colors"
                                  title="Borrar"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {state.readings.length === 0 && (
                          <div className="p-4 text-center">
                            <button 
                              onClick={() => addReading(param.nombre, param.unidades)}
                              className="h-8 px-4 text-[9px] uppercase tracking-widest border border-dashed border-neutral-300 hover:bg-neutral-50 transition-colors text-black font-normal"
                            >
                              <Plus className="h-3 w-3 inline mr-1" /> Comenzar carga
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="px-4 py-6 bg-neutral-50 border-t border-neutral-200 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="h-4 w-4 text-black" />
            <span className="text-[10px] font-normal uppercase tracking-widest text-black">Evidencia de Protocolo PP-001</span>
          </div>
          <PhotoRegistry 
            reportId={reportId} 
            formId={formId} 
            stationId={stationId} 
            medium="personalizado" 
            analyteTag="Evidencia Personalizada (PP-001)"
          />
        </div>
      </div>

      <div className="bg-white p-4 border-t border-black">
        <button onClick={onClose} className="w-full bg-black hover:bg-neutral-900 py-4 text-[11px] font-normal uppercase tracking-widest text-white shadow-xl">Finalizar Protocolo PP-001</button>
      </div>
    </div>
  );
}
