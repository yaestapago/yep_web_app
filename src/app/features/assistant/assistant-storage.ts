/** Conversación a retomar: `{ id, at }` por usuario y negocio, solo en este navegador. */
export const ASSISTANT_CONVERSATION_STORAGE_PREFIX = 'yep-zaira-conversation';

/**
 * Borra las conversaciones guardadas de todos: al cerrar sesión o cambiar de usuario no queda
 * rastro en un computador compartido. Lo de la presentación y el saludo se queda: no es de nadie.
 */
export function forgetAssistantConversations(): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of keys) {
      if (key?.startsWith(`${ASSISTANT_CONVERSATION_STORAGE_PREFIX}:`)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Sin almacenamiento: no hay nada guardado que borrar.
  }
}
