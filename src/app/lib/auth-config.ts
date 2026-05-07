
export const AUTH_WHITELIST = [
  'user@example.com',
  'admin@geodatos.com',
  'field.technician@environmental.org',
  'inspector@government.gov',
  'luisbree@gmail.com',
  'mdlangeles.dph@gmail.com',
  'nancyneschuk@gmail.com',
  'no68si40@gmail.com',
  'gacastrocp@gmail.com',
  'eugeniaagabios@gmail.com',
  'alansantamarina@gmail.com',
  'canelamdq@gmail.com',
  'cintiadigrazia@gmail.com',
  'marianomediavilla.pba@gmail.com',
  'marinaraggioambientales@gmail.com',
  'lucianalugones@gsuite.fcnym.unlp.edu.ar',
  'pabloginer76@gmail.com',
  'vaninakapeika@gmail.com',
  'vmalcan@gmail.com',
  'chechechelina@gmail.com',
  'arielmenescardi@hotmail.com',
  'sandru_18neta@hotmail.com',
  'avdemilio@gmail.com',
  'karitosilva@gmail.com',
  'joaquinmontorsi@gmail.com'
];

export function isUserWhitelisted(email: string | null): boolean {
  if (!email) return false;
  return AUTH_WHITELIST.includes(email.toLowerCase());
}
