export const AUTH_WHITELIST = [
  { nombre: 'Luis Bree', email: 'luisbree@gmail.com' },
  { nombre: 'María de los Ángeles González', email: 'mdlangeles.dph@gmail.com' },
  { nombre: 'Nancy Neschuk', email: 'nancyneschuk@gmail.com' },
  { nombre: 'No68 Si40', email: 'no68si40@gmail.com' },
  { nombre: 'Gonzalo Castro', email: 'gacastrocp@gmail.com' },
  { nombre: 'Eugenia Agabios', email: 'eugeniaagabios@gmail.com' },
  { nombre: 'Alan Santamarina', email: 'alansantamarina@gmail.com' },
  { nombre: 'Canela Castro', email: 'canelamdq@gmail.com' },
  { nombre: 'Cintia Di Grazia', email: 'cintiadigrazia@gmail.com' },
  { nombre: 'Mariano Mediavilla', email: 'marianomediavilla.pba@gmail.com' },
  { nombre: 'Marina Raggio', email: 'marinaraggioambientales@gmail.com' },
  { nombre: 'Luciana Lugones', email: 'lucianalugones@gsuite.fcnym.unlp.edu.ar' },
  { nombre: 'Pablo Giner', email: 'pabloginer76@gmail.com' },
  { nombre: 'Vanina Kapeika', email: 'vaninakapeika@gmail.com' },
  { nombre: 'Virginia Alcántara', email: 'vmalcan@gmail.com' },
  { nombre: 'Celina Bertone', email: 'chechechelina@gmail.com' },
  { nombre: 'Ariel Menescardi', email: 'arielmenescardi@hotmail.com' },
  { nombre: 'Sandra Lafalce', email: 'sandru_18neta@hotmail.com' },
  { nombre: 'Andrea D´Emilio', email: 'avdemilio@gmail.com' },
  { nombre: 'Carolina Silva', email: 'karitosilva@gmail.com' },
  { nombre: 'Joaquín Montorsi', email: 'joaquinmontorsi@gmail.com' },
  { nombre: 'Ambientales DPH', email: 'ambientales.dph@gmail.com' }
];

export function isUserWhitelisted(email: string | null): boolean {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  return AUTH_WHITELIST.some(user => user.email.toLowerCase() === cleanEmail);
}

export function getUserNameByEmail(email: string | null): string {
  if (!email) return 'Técnico Desconocido';
  const cleanEmail = email.trim().toLowerCase();
  const user = AUTH_WHITELIST.find(u => u.email.toLowerCase() === cleanEmail);
  return user ? user.nombre : email.split('@')[0];
}
