'use client';

import { useState, useRef, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useFirestore, useStorage, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Loader2, X, Upload, Trash2, CloudOff, Image as ImageIcon } from 'lucide-react';
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

  const isAnyUploading = uploadingIds.size > 0;

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
    if (isCompressing || isAnyUploading) return;
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

      // Actualizar lista de pendientes localmente
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

  const handleUpload = async (photoId: string, file: Blob, fileName: string) => {
    if (!user || !storage || !db) {
      toast({ variant: "destructive", title: "Error", description: "Servicios no disponibles." });
      return;
    }

    setUploadingIds(prev => new Set(prev).add(photoId));

    try {
      const storagePath = `reports/${reportId}/${formId}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      // 1. Subir al Storage
      const uploadResult = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(uploadResult.ref);

      // 2. Registrar en Firestore (Optimista)
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

      addDoc(collection(db, 'samples'), photoData)
        .catch(async (error) => {
          const permissionError = new FirestorePermissionError({
            path: 'samples',
            operation: 'create',
            requestResourceData: photoData,
          });
          errorEmitter.emit('permission-error', permissionError);
        });

      updateDoc(doc(db, 'reports', reportId), { 
        editors: arrayUnion(user.email) 
      }).catch(() => {});

      // 3. Limpiar almacenamiento local
      await offlineStorage.removePhoto(photoId);
      
      if (localPhoto?.id === photoId) {
        setLocalPhoto(null);
      }
      
      setPendingPhotos(prev => prev.filter(p => p.id !== photoId));

      toast({
        title: "Éxito",
        description: "Fotografía sincronizada correctamente.",
      });

    } catch (error: any) {
      console.error('Fallo en subida:', error);
      toast({
        variant: "destructive",
        title: "Error de subida",
        description: "Revisá tu conexión e intentá de nuevo.",
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
    toast({ description: "Captura eliminada." });
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
          {/* ÁREA DE CAPTURA / PREVIEW ACTUAL */}
          <div className="space-y-2">
            {!localPhoto ? (
              <button 
                onClick={handleCaptureClick}
                disabled={isCompressing || isAnyUploading}
                className={cn(
                  "w-full aspect-video flex flex-col items-center justify-center border-2 border-dashed rounded-none transition-all group",
                  isCompressing || isAnyUploading 
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
                    Confirmar y Subir
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* LISTADO DE PENDIENTES */}
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
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      ) : (
                        <div className="flex gap-1">
                           <button 
                            onClick={() => handleUpload(photo.id, photo.file, photo.fileName)}
                            disabled={isAnyUploading}
                            className="p-1.5 bg-white text-primary rounded-none shadow-md hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
                            title="Subir ahora"
                          >
                            <Upload className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => removePhoto(photo.id)}
                            disabled={isAnyUploading}
                            className="p-1.5 bg-white text-destructive rounded-none shadow-md hover:bg-destructive hover:text-white transition-colors disabled:opacity-50"
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

        <p className="text-[8px] italic text-neutral-400 leading-tight pt-2 border-t">
          * Optimización: Reducción automática a 1024px. Las fotos se guardan localmente hasta que confirmes la subida con conexión.
        </p>

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