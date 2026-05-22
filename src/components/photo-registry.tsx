'use client';

import { useState, useRef, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useFirestore, useStorage, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Loader2, CheckCircle2, X, Upload, Trash2, CloudOff } from 'lucide-react';
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
 * Módulo de Registro Fotográfico (Unidireccional).
 * 
 * Este componente no consulta la base de datos. Solo permite capturar,
 * comprimir y subir evidencias visuales a Firestore Storage y registrar 
 * el analito en la colección 'samples'.
 */
export function PhotoRegistry({ reportId, formId, stationId, medium }: PhotoRegistryProps) {
  const db = useFirestore();
  const storage = useStorage();
  const { user, loading: authLoading } = useUser();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [localPhoto, setLocalPhoto] = useState<{ id: string; file: File; preview: string } | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<OfflinePhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar fotos guardadas localmente (offline) al iniciar
  useEffect(() => {
    const loadPending = async () => {
      const pending = await offlineStorage.getPendingPhotos(formId);
      setPendingPhotos(pending);
    };
    loadPending();
  }, [formId]);

  const handleCaptureClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsProcessing(true);
    try {
      const compressed = await compressImage(file);
      const photoId = crypto.randomUUID();
      
      const photoObj = {
        id: photoId,
        file: compressed as File,
        preview: URL.createObjectURL(compressed)
      };

      setLocalPhoto(photoObj);
      
      // Guardar también en almacenamiento local por si el usuario cierra la app antes de sincronizar
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

    } catch (error) {
      console.error('Error procesando imagen:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo procesar la fotografía.",
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUpload = async (photoId: string, file: Blob, fileName: string) => {
    if (!user || !storage || !db) return;

    setIsProcessing(true);
    const storagePath = `reports/${reportId}/${formId}/${fileName}`;
    const storageRef = ref(storage, storagePath);

    try {
      // 1. Subir al Storage
      const uploadResult = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(uploadResult.ref);

      // 2. Registrar en Firestore (Colección Samples - Registro Plano)
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

      // No usamos await aquí para seguir el flujo optimista del SDK de Firestore
      addDoc(collection(db, 'samples'), photoData)
        .catch(async (error) => {
          const permissionError = new FirestorePermissionError({
            path: 'samples',
            operation: 'create',
            requestResourceData: photoData,
          });
          errorEmitter.emit('permission-error', permissionError);
        });

      // Registrar también la actividad en el reporte
      updateDoc(doc(db, 'reports', reportId), { 
        editors: arrayUnion(user.email) 
      }).catch(() => {});

      // 3. Limpiar estados
      await offlineStorage.removePhoto(photoId);
      if (localPhoto?.id === photoId) setLocalPhoto(null);
      setPendingPhotos(prev => prev.filter(p => p.id !== photoId));

      toast({
        title: "Foto sincronizada",
        description: "La evidencia se subió correctamente.",
      });

    } catch (error: any) {
      console.error('Fallo en subida:', error);
      toast({
        variant: "destructive",
        title: "Error de sincronización",
        description: "Verificá tu conexión a internet e intentá de nuevo.",
      });
    } finally {
      setIsProcessing(false);
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

        {/* ÁREA DE CAPTURA / PREVIEW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!localPhoto ? (
            <button 
              onClick={handleCaptureClick}
              disabled={isProcessing}
              className="aspect-video flex flex-col items-center justify-center border-2 border-dashed border-neutral-300 rounded-none hover:bg-neutral-50 hover:border-primary/50 transition-all group"
            >
              {isProcessing ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                <>
                  <Camera className="h-8 w-8 text-neutral-400 group-hover:text-primary mb-2" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Capturar Evidencia</span>
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
                  className="h-8 rounded-none uppercase text-[10px] font-black"
                  onClick={() => removePhoto(localPhoto.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Descartar
                </Button>
                <Button 
                  size="sm" 
                  className="h-8 bg-green-600 hover:bg-green-700 rounded-none uppercase text-[10px] font-black text-white"
                  onClick={() => handleUpload(localPhoto.id, localPhoto.file, `${localPhoto.id}.jpg`)}
                  disabled={isProcessing}
                >
                  {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                  Confirmar y Subir
                </Button>
              </div>
            </div>
          )}

          {/* LISTADO DE PENDIENTES (MODO OFFLINE) */}
          {pendingPhotos.filter(p => p.id !== localPhoto?.id).length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase text-neutral-400 tracking-tighter">Fotos capturadas sin subir:</p>
              <div className="flex flex-wrap gap-2">
                {pendingPhotos.filter(p => p.id !== localPhoto?.id).map(photo => (
                  <div key={photo.id} className="relative w-20 h-20 border-2 border-amber-300 bg-amber-50">
                    <img 
                      src={URL.createObjectURL(photo.file)} 
                      alt="Pendiente" 
                      className="w-full h-full object-cover opacity-50 grayscale" 
                    />
                    <button 
                      onClick={() => handleUpload(photo.id, photo.file, photo.fileName)}
                      className="absolute inset-0 flex items-center justify-center text-amber-700 hover:text-primary transition-colors"
                      title="Intentar subir ahora"
                    >
                      <Upload className="h-5 w-5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-[8px] italic text-neutral-400 leading-tight">
          * Las imágenes se comprimen automáticamente a 1024px para optimizar el almacenamiento y el uso de datos.
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
