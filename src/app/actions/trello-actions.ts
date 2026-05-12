
'use server';

/**
 * @fileOverview Server Actions para interactuar con la API de Trello.
 */

const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
const TRELLO_API_TOKEN = process.env.TRELLO_API_TOKEN;
const BOARD_ID_1 = process.env.NEXT_PUBLIC_TRELLO_BOARD_ID_1;
const BOARD_ID_2 = process.env.NEXT_PUBLIC_TRELLO_BOARD_ID_2;

/**
 * Obtiene las tarjetas de los tableros configurados y filtra aquellas que 
 * terminan con la estructura (XXX000), donde XXX tiene entre 2 y 4 caracteres.
 */
export async function fetchFilteredTrelloCards(): Promise<string[]> {
  if (!TRELLO_API_KEY || !TRELLO_API_TOKEN) {
    console.error('Trello credentials missing in environment variables');
    return [];
  }

  const boardIds = [BOARD_ID_1, BOARD_ID_2].filter(Boolean) as string[];
  const allCardNames: string[] = [];

  // Expresión regular para detectar (XX000), (XXX000) o (XXXX000) al final
  const pattern = /\([A-Za-z]{2,4}\d+\)$/;

  try {
    for (const boardId of boardIds) {
      const url = `https://api.trello.com/1/boards/${boardId}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_API_TOKEN}`;
      const response = await fetch(url, { next: { revalidate: 3600 } }); // Cache 1 hora

      if (response.ok) {
        const cards = await response.json();
        const filteredNames = cards
          .map((card: any) => card.name)
          .filter((name: string) => pattern.test(name));
        
        allCardNames.push(...filteredNames);
      } else {
        console.error(`Error fetching Trello board ${boardId}: ${response.statusText}`);
      }
    }

    // Eliminar duplicados si existieran
    return Array.from(new Set(allCardNames));
  } catch (error) {
    console.error('Failed to fetch from Trello:', error);
    return [];
  }
}
