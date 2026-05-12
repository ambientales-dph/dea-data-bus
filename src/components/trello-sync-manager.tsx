
'use client';

import { useEffect } from 'react';
import { fetchFilteredTrelloCards } from '@/app/actions/trello-actions';

/**
 * Componente que gestiona la sincronización de datos de Trello hacia el localStorage.
 * Se ejecuta una sola vez al montar la aplicación.
 */
export function TrelloSyncManager() {
  useEffect(() => {
    const syncTrelloData = async () => {
      try {
        console.log('DEA Data Bus: Sincronizando datos de Trello...');
        const cardNames = await fetchFilteredTrelloCards();
        
        if (cardNames && cardNames.length > 0) {
          localStorage.setItem('trello_cards_sync', JSON.stringify({
            updatedAt: new Date().toISOString(),
            cards: cardNames
          }));
          console.log(`DEA Data Bus: ${cardNames.length} tarjetas de Trello sincronizadas.`);
        }
      } catch (error) {
        console.error('DEA Data Bus: Error en sincronización Trello:', error);
      }
    };

    syncTrelloData();
  }, []);

  return null; // Componente invisible
}
