import type { SourceEvent } from '../models/source-event.models';
import { classifyLiveSourceEvent, sourceEventReporterKey } from './source-event-groups';

function sourceEvent(id: string, linkedTransactionId?: string): SourceEvent {
  return { id, linkedTransactionId, sourceType: 'NOTIFIER_APP' } as SourceEvent;
}

describe('classifyLiveSourceEvent', () => {
  it('un reporte de un pago que no está en la lista es nuevo y no corrobora', () => {
    const change = classifyLiveSourceEvent(
      [sourceEvent('evt-x', 'tx-9')],
      sourceEvent('evt-a', 'tx-1'),
    );
    expect(change).toEqual({ isNewReport: true, corroborates: false });
  });

  it('otro notificador del mismo pago ya listado corrobora', () => {
    const change = classifyLiveSourceEvent(
      [sourceEvent('evt-a', 'tx-1')],
      sourceEvent('evt-b', 'tx-1'),
    );
    expect(change).toEqual({ isNewReport: true, corroborates: true });
  });

  it('la reemisión ya enlazada a la misma transacción no corrobora de nuevo', () => {
    const list = [sourceEvent('evt-b', 'tx-1'), sourceEvent('evt-a', 'tx-1')];
    const change = classifyLiveSourceEvent(list, sourceEvent('evt-b', 'tx-1'));
    expect(change).toEqual({ isNewReport: false, corroborates: false });
  });

  it('una fila suelta que se enlaza a un pago ya listado corrobora (las filas se funden)', () => {
    const list = [sourceEvent('evt-b'), sourceEvent('evt-a', 'tx-1')];
    const change = classifyLiveSourceEvent(list, sourceEvent('evt-b', 'tx-1'));
    expect(change).toEqual({ isNewReport: false, corroborates: true });
  });

  it('la reemisión del único reporte del pago no corrobora', () => {
    const change = classifyLiveSourceEvent([sourceEvent('evt-a')], sourceEvent('evt-a', 'tx-1'));
    expect(change).toEqual({ isNewReport: false, corroborates: false });
  });
});

describe('sourceEventReporterKey', () => {
  it('usa el notificador y, sin él, el tipo de origen', () => {
    expect(sourceEventReporterKey({ ...sourceEvent('evt-a'), notifierId: 'phone-1' })).toBe(
      'phone-1',
    );
    expect(sourceEventReporterKey(sourceEvent('evt-a'))).toBe('type:NOTIFIER_APP');
  });
});
