'use client';

import { addDoc, collection, serverTimestamp, type Firestore } from 'firebase/firestore';
import { getUserNameByEmail } from '@/app/lib/auth-config';

export type DataBusActionType = 
  | 'data_bus_report_created' 
  | 'data_bus_samples_uploaded' 
  | 'data_bus_photos_uploaded'
  | 'data_bus_survey_created';

export interface DataBusActivityPayload {
  actionType: DataBusActionType;
  projectName?: string;
  stationName?: string;
  stationId?: string;
  reportId?: string;
  reportOid?: string;
  surveyId?: string;
  userEmail: string;
  userName?: string;
  userPhoto?: string | null;
  details?: string;
  cardId?: string;
}

/**
 * Registra una actividad del DEA Data Bus en la colección unificada 'app_activities'.
 * Esta colección es escuchada en tiempo real por la campanita de notificaciones
 * del Portal DEA, permitiendo avisos instantáneos de operaciones en campo.
 */
export async function notifyPortalActivity(db: Firestore, payload: DataBusActivityPayload): Promise<void> {
  if (!db || !payload.userEmail) return;

  try {
    const finalUserName = payload.userName || getUserNameByEmail(payload.userEmail);
    const finalProjectName = payload.projectName?.trim() || 'Monitoreo de Campo DPH';

    await addDoc(collection(db, 'app_activities'), {
      source: 'databus',
      actionType: payload.actionType,
      projectName: finalProjectName,
      stationName: payload.stationName || null,
      stationId: payload.stationId || null,
      reportId: payload.reportId || null,
      reportOid: payload.reportOid || null,
      surveyId: payload.surveyId || null,
      userName: finalUserName,
      userEmail: payload.userEmail,
      userPhoto: payload.userPhoto || null,
      details: payload.details || null,
      cardId: payload.cardId || null,
      timestamp: serverTimestamp(),
    });
  } catch (err: any) {
    // Si falla o no hay conexión de inmediato, no debe bloquear el flujo de campo
    console.warn('[PortalNotifications] Error registrando actividad en app_activities:', err?.message || err);
  }
}
