'use client';

import { useState, useRef, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useFirestore, useStorage, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Loader2, X, Upload, Trash2, CloudOff, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { compressImage } from '@/lib/image-processing';
import { offlineStorage, OfflinePhoto } from '@/lib/offline-storage';
import { cn } from '@/lib/utils';

interface PhotoRegistryProps {
  reportId: string;
  formId: string;
  stationId: string;
  medium: string;
}

/**
 * Módulo de registro fotográfico.
 * Permite capturar imágenes, comprimirlas y gestionarlas de forma offline-first.
 */
export function PhotoRegistry({ reportId, formId, stationId, medium }: PhotoRegistryProps) {
  const db = useFirestore();
  const storage = useStorage();
  const { user, loading: authLoading } = useUser();
  const { toast } = useToast();
  
  const [isCompressing, setIsCompressing] = useState(false);
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [localPhoto, setLocalPhoto] = useState<{ id: string; file: File; preview: string } | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<OfflinePhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar fotos pendientes del almacenamiento local al montar
  useEffect(() => {
    const loadPending = async () => {
      try {
        const pending = await offlineStorage.getPendingPhotos(formId);
        setPendingPhotos(pending);
      } catch (e) {
        console.error("Error al cargar fotos pendientes:", e);
      }
    };
    loadPending();
  }, [formId]);

  const handleCaptureClick = () => {
    if (isCompressing) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsCompressing(true);
    try {
      const compressed = await compressImage(file);
      const photoId = crypto.randomUUID();
      
      const photoObj = {
        id: photoId,
        file: compressed as File,
        preview: URL.createObjectURL(compressed)
      };

      setLocalPhoto(photoObj);
      
      // Guardar en IndexedDB para resiliencia offline inmediata
      await offlineStorage.savePhoto({
        id: photoId,
        reportId,
        formId,
        stationId,
        medium,
        file: compressed,
        fileName: `${photoId}.jpg`,
        timestamp: Date.now()
      });

      const updatedPending = await offlineStorage.getPendingPhotos(formId);
      setPendingPhotos(updatedPending);

    } catch (error) {
      console.error('Error procesando imagen:', error);
      toast({
        variant: "destructive",
        title: "Error de captura",
        description: "No se pudo procesar la fotografía.",
      });
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /**
   * Sube una foto específica a Firebase Storage y registra la URL en Firestore.
   * Incluye un timeout de 30 segundos para evitar spinners infinitos.
   */
  const handleUpload = async (photoId: string, file: Blob, fileName: string) => {
    if (!user || !storage || !db) {
      toast({ variant: "destructive", title: "Servicios no disponibles", description: "Verificá tu sesión." });
      return;
    }

    setUploadingIds(prev => new Set(prev).add(photoId));

    try {
      // Sanitización de IDs para la ruta
      const safeReportId = reportId?.trim() || 'unknown_report';
      const safeFormId = formId?.trim() || 'unknown_form';
      const storagePath = `reports/${safeReportId}/${safeFormId}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      // Wrapper con timeout para la subida
      const uploadTask = uploadBytes(storageRef, file);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), 30000)
      );

      // 1. Subir al Storage (con límite de tiempo)
      const uploadResult = (await Promise.race([uploadTask, timeoutPromise])) as any;
      const downloadUrl = await getDownloadURL(uploadResult.ref);

      // 2. Registrar en Firestore (Colección plana samples)
      const photoData = {
        reportId,
        formId,
        stationId,
        medium,
        parameterType: "Fotografía",
        analyte: "Evidencia Visual",
        value: downloadUrl,
        timestamp: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email
      };

      await addDoc(collection(db, 'samples'), photoData).catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: 'samples',
          operation: 'create',
          requestResourceData: photoData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

      // Actualizar editores del reporte
      updateDoc(doc(db, 'reports', reportId), { 
        editors: arrayUnion(user.email) 
      }).catch(() => {});

      // 3. Limpieza de almacenamiento local tras éxito
      await offlineStorage.removePhoto(photoId);
      
      if (localPhoto?.id === photoId) setLocalPhoto(null);
      setPendingPhotos(prev => prev.filter(p => p.id !== photoId));

      toast({
        title: "Sincronizado",
        description: "La fotografía se subió correctamente.",
      });

    } catch (error: any) {
      console.error('Fallo en subida:', error);
      const message = error.message === 'TIMEOUT' 
        ? "La subida tardó demasiado. Intentá de nuevo con mejor señal." 
        : "Error de red o permisos al subir la imagen.";
      
      toast({
        variant: "destructive",
        title: "Error de subida",
        description: message,
      });
    } finally {
      setUploadingIds(prev => {
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });
    }
  };

  const removePhoto = async (id: string) => {
    await offlineStorage.removePhoto(id);
    if (localPhoto?.id === id) setLocalPhoto(null);
    setPendingPhotos(prev => prev.filter(p => p.id !== id));
    toast({ description: "Captura descartada." });
  };

  if (authLoading) return null;

  return (
    <Card className="border-t-4 border-t-accent shadow-md overflow-hidden rounded-none mt-6">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-black" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-black font-headline">Evidencia Visual</h3>
          </div>
          {pendingPhotos.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-600 rounded-sm">
              <CloudOff className="h-3 w-3" />
              <span className="text-[9px] font-black uppercase">{pendingPhotos.length} Pendientes</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ÁREA DE CAPTURA ACTUAL */}
          <div className="space-y-2">
            {!localPhoto ? (
              <button 
                onClick={handleCaptureClick}
                disabled={isCompressing}
                className={cn(
                  "w-full aspect-video flex flex-col items-center justify-center border-2 border-dashed rounded-none transition-all group",
                  isCompressing 
                    ? "bg-neutral-50 border-neutral-200 cursor-not-allowed" 
                    : "border-neutral-300 hover:bg-neutral-50 hover:border-primary/50"
                )}
              >
                {isCompressing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-[9px] font-bold uppercase text-primary">Comprimiendo...</span>
                  </div>
                ) : (
                  <>
                    <Camera className="h-8 w-8 text-neutral-400 group-hover:text-primary mb-2" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Tomar Fotografía</span>
                  </>
                )}
              </button>
            ) : (
              <div className="aspect-video relative border-2 border-primary bg-neutral-100 overflow-hidden group">
                <img src={localPhoto.preview} alt="Vista previa" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button 
                    size="sm" 
                    variant="destructive" 
                    disabled={uploadingIds.has(localPhoto.id)}
                    className="h-8 rounded-none uppercase text-[10px] font-black"
                    onClick={() => removePhoto(localPhoto.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Descartar
                  </Button>
                  <Button 
                    size="sm" 
                    className="h-8 bg-green-600 hover:bg-green-700 rounded-none uppercase text-[10px] font-black text-white"
                    onClick={() => handleUpload(localPhoto.id, localPhoto.file, `${localPhoto.id}.jpg`)}
                    disabled={uploadingIds.has(localPhoto.id)}
                  >
                    {uploadingIds.has(localPhoto.id) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 mr-1" />
                    )}
                    Subir Ahora
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* LISTADO DE PENDIENTES / COLA DE ENVÍO */}
          <div className="space-y-3">
            <h4 className="text-[9px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-1.5">
              <ImageIcon className="h-3 w-3" /> Fotos en cola de envío:
            </h4>
            
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {pendingPhotos.length === 0 && (
                <div className="col-span-full py-8 border border-dashed border-neutral-200 flex flex-col items-center justify-center opacity-30">
                  <ImageIcon className="h-6 w-6 mb-1" />
                  <span className="text-[8px] font-bold uppercase">Sin archivos en cola</span>
                </div>
              )}
              
              {pendingPhotos.map(photo => {
                const isThisUploading = uploadingIds.has(photo.id);
                const isCurrentPreview = localPhoto?.id === photo.id;
                
                if (isCurrentPreview) return null;

                return (
                  <div key={photo.id} className="relative aspect-square border-2 border-amber-200 bg-amber-50 group overflow-hidden">
                    <img 
                      src={URL.createObjectURL(photo.file)} 
                      alt="Pendiente" 
                      className="w-full h-full object-cover grayscale opacity-60" 
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all">
                      {isThisUploading ? (
                        <div className="flex flex-col items-center gap-1">
                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                          <span className="text-[7px] text-white font-black uppercase">Subiendo...</span>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                           <button 
                            onClick={() => handleUpload(photo.id, photo.file, photo.fileName)}
                            className="p-1.5 bg-white text-primary rounded-none shadow-md hover:bg-primary hover:text-white transition-colors"
                            title="Subir ahora"
                          >
                            <Upload className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => removePhoto(photo.id)}
                            className="p-1.5 bg-white text-destructive rounded-none shadow-md hover:bg-destructive hover:text-white transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 p-2 bg-neutral-50 border border-neutral-200 mt-2">
          <AlertCircle className="h-3 w-3 text-neutral-400 shrink-0 mt-0.5" />
          <p className="text-[8px] italic text-neutral-500 leading-tight">
            Optimizamos cada foto a 1024px para ahorrar datos. Si la subida demora más de 30s, el proceso se cancelará para evitar bloqueos. Podrás reintentar cuando tengas mejor señal.
          </p>
        </div>

        <input 
          type="file" 
          ref={fileInputRef}
          accept="image/*" 
          capture="environment" 
          onChange={handleFileChange}
          className="hidden" 
        />
      </CardContent>
    </Card>
  );
}
