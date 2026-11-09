// Qui est Patron, Co Fondateur ou Staff d'après le serveur (même règle que api/cinema.js : listes de secours + colonne "role" + liste "roles" du compte).
import { getRow } from './_store.js';

const PATRONS = ['ystroz', 'alex'];
const CO_FONDATEURS = ['yohan81'];

// vrai pour le Patron, le Co Fondateur et le Staff (les jeux en test : course, golf, prop hunt, tableau dessin)
export async function isStaffActor(actor) {
  const name = String(actor || '').toLowerCase();
  if (!name) return false;
  if (PATRONS.includes(name) || CO_FONDATEURS.includes(name)) return true;
  try {
    const row = await getRow(name);
    if (!row) return false;
    if (row.role === 'patron' || row.role === 'co_fondateur') return true;
    return !!(row.data && Array.isArray(row.data.roles) && row.data.roles.includes('staff'));
  } catch (e) { return false; }
}
