/**
 * Mensaje de una sola vez que el editor deja al navegar (`router.navigate(..., { state: { notice } })`).
 * Se lee y se borra del historial para que no vuelva a salir al recargar.
 */
export function takeNavigationNotice(): string {
  if (typeof history === 'undefined') return '';
  const state = history.state as Record<string, unknown> | null;
  if (!state || typeof state['notice'] !== 'string') return '';
  const notice = state['notice'];
  try {
    const { notice: _notice, ...rest } = state;
    history.replaceState(rest, '');
  } catch {
    // Sin acceso al historial: el aviso podría repetirse al recargar, nada más.
  }
  return notice;
}
