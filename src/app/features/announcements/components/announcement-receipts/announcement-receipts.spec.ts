import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import type { AnnouncementReceipt } from '../../models/announcement.models';
import { AdminAnnouncementsApiService } from '../../services/admin-announcements-api.service';
import { AnnouncementReceipts, RECEIPTS_PAGE_SIZE, toReceiptRow } from './announcement-receipts';

function receipt(overrides: Partial<AnnouncementReceipt> = {}): AnnouncementReceipt {
  return {
    id: 'r1',
    announcementKey: 'k',
    recipientType: 'notifier',
    recipientId: 'n1',
    recipientName: 'Caja principal',
    recipientDetail: 'Redmi Note 12',
    email: null,
    accountId: 'b1',
    accountName: 'Supercarnes',
    appVersion: '1.0.10',
    platform: 'android',
    firstSeenAt: '2026-10-15T11:00:00.000Z',
    lastSeenAt: '2026-10-15T12:00:00.000Z',
    seenCount: 1,
    notifiedAt: null,
    actionAt: null,
    dismissedAt: null,
    dismissCount: 0,
    ...overrides,
  };
}

describe('AnnouncementReceipts («Quién lo vio»)', () => {
  let receipts: ReturnType<typeof vi.fn>;

  function render(inputs: Record<string, unknown>): {
    fixture: ComponentFixture<AnnouncementReceipts>;
    root: HTMLElement;
  } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AdminAnnouncementsApiService, useValue: { receipts } }],
    });
    const fixture = TestBed.createComponent(AnnouncementReceipts);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    receipts = vi.fn().mockReturnValue(of({ receipts: [receipt()], total: 1 }));
  });

  it('carga los recibos de la key (también la del aviso de actualizar)', () => {
    const { root } = render({ announcementKey: 'update:notifier:android:1.0.10', app: 'notifier' });
    expect(receipts).toHaveBeenCalledWith('update:notifier:android:1.0.10', {
      limit: RECEIPTS_PAGE_SIZE,
      skip: 0,
    });
    const rows = root.querySelectorAll('[data-testid="receipt-row"]');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Caja principal');
    expect(rows[0].textContent).toContain('Redmi Note 12');
    expect(root.textContent).toContain('Notificado');
  });

  it('la App de YEP no tiene columna «Notificado»', () => {
    const { root } = render({ announcementKey: 'a1', app: 'yep' });
    expect(root.querySelector('thead')?.textContent).not.toContain('Notificado');
    expect(root.querySelector('thead')?.textContent).toContain('Usuario');
  });

  it('pagina de 50 en 50 con skip', () => {
    receipts.mockReturnValue(of({ receipts: [receipt()], total: 120 }));
    const { fixture } = render({ announcementKey: 'a1' });
    const table = fixture.componentInstance;
    expect(table.pageCount()).toBe(3);
    table.goToPage(3);
    expect(receipts).toHaveBeenLastCalledWith('a1', { limit: 50, skip: 100 });
  });

  it('al cambiar de key vuelve a la primera página', () => {
    receipts.mockReturnValue(of({ receipts: [], total: 120 }));
    const { fixture } = render({ announcementKey: 'a1' });
    fixture.componentInstance.goToPage(2);
    fixture.componentRef.setInput('announcementKey', 'a2');
    fixture.detectChanges();
    expect(receipts).toHaveBeenLastCalledWith('a2', { limit: 50, skip: 0 });
  });

  it('vacío con el texto que se le pase', () => {
    receipts.mockReturnValue(of({ receipts: [], total: 0 }));
    const { root } = render({
      announcementKey: 'a1',
      emptyDescription: 'Solo se entrega cuando está publicado.',
    });
    expect(root.textContent).toContain('Nadie lo ha visto todavía');
    expect(root.textContent).toContain('Solo se entrega cuando está publicado.');
  });

  it('toReceiptRow: «N veces» solo desde 2', () => {
    expect(toReceiptRow(receipt({ seenCount: 1 })).seenCount).toBe('');
    expect(toReceiptRow(receipt({ seenCount: 3 })).seenCount).toMatch(/^3 veces · primera /);
    expect(
      toReceiptRow(receipt({ dismissedAt: '2026-10-15T12:00:00.000Z', dismissCount: 1 }))
        .dismissCount,
    ).toBe('');
    expect(toReceiptRow(receipt({ recipientName: null })).name).toBe('Celular sin nombre');
  });
});
