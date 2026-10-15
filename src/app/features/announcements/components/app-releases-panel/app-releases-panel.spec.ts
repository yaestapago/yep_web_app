import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AdminAnnouncementsApiService } from '../../services/admin-announcements-api.service';
import { AppReleasesPanel } from './app-releases-panel';

describe('AppReleasesPanel (Versiones de las apps)', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  function create(): {
    fixture: ComponentFixture<AppReleasesPanel>;
    panel: AppReleasesPanel;
    root: HTMLElement;
  } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AdminAnnouncementsApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(AppReleasesPanel);
    fixture.detectChanges();
    return {
      fixture,
      panel: fixture.componentInstance,
      root: fixture.nativeElement as HTMLElement,
    };
  }

  beforeEach(() => {
    api = {
      listReleases: vi.fn().mockReturnValue(
        of({
          releases: [
            {
              app: 'notifier',
              platform: 'android',
              latestVersion: '1.0.10',
              minSupportedVersion: null,
              storeUrl: 'https://play.google.com/store/apps/details?id=co.yaestapago.notifier',
              title: null,
              body: null,
              notify: true,
              enabled: true,
              updatedAt: '2026-10-15T12:00:00.000Z',
              key: 'update:notifier:android:1.0.10',
              stats: { seen: 9, action: 4, dismissed: 3, notified: 6 },
            },
          ],
          notifierVersions: [
            { version: '1.0.10', count: 8 },
            { version: '1.0.9', count: 4 },
          ],
        }),
      ),
      receipts: vi.fn().mockReturnValue(of({ receipts: [], total: 0 })),
      saveRelease: vi.fn((app, platform, payload) =>
        of({ app, platform, ...payload, updatedAt: null }),
      ),
    };
  });

  it('una tarjeta por (app, plataforma); prellena las URLs por defecto sin política', () => {
    const { panel, root } = create();
    expect(panel.cards.map((card) => card.key)).toEqual([
      'notifier/android',
      'yep/android',
      'yep/ios',
    ]);
    expect(panel.cards[0].value().latestVersion).toBe('1.0.10');
    expect(panel.cards[1].value().storeUrl).toBe(
      'https://play.google.com/store/apps/details?id=co.yaestapago.app',
    );
    expect(panel.cards[2].value().storeUrl).toBe('');
    expect(panel.statusChip(panel.cards[1]).label).toBe('Sin configurar');
    expect(root.querySelector('[data-testid="releases-store-note"]')?.textContent).toContain(
      'solo cuando Google Play',
    );
  });

  it('muestra los recibos del aviso de actualizar vigente', () => {
    const { root } = create();
    const block = root.querySelector('[data-testid="release-stats-notifier/android"]');
    expect(block?.textContent).toContain('Aviso de la versión 1.0.10');
    const pairs = [...(block?.querySelectorAll('dl > div') ?? [])].map(
      (item) =>
        `${item.querySelector('dt')?.textContent?.trim()}=${item.querySelector('dd')?.textContent?.trim()}`,
    );
    expect(pairs).toEqual([
      'Lo vieron=9',
      'Tocaron «Actualizar»=4',
      'Más tarde=3',
      'Notificados=6',
    ]);
    expect(root.querySelector('[data-testid="release-stats-yep/ios"]')).toBeNull();
  });

  it('marca las versiones en uso con la última/mínima que se está escribiendo', () => {
    const { fixture, panel, root } = create();
    expect(panel.versionRows().map((row) => row.standing)).toEqual(['current', 'below_latest']);
    panel.patch(panel.cards[0], 'minSupportedVersion', '1.0.10');
    fixture.detectChanges();
    expect(panel.versionRows().map((row) => row.standing)).toEqual(['current', 'below_min']);
    expect(
      root.querySelector('[data-testid="versions-summary"]')?.textContent?.replace(/\s+/g, ' '),
    ).toContain('De 12 celulares');
  });

  it('no guarda con errores y los muestra', () => {
    const { fixture, panel, root } = create();
    const ios = panel.cards[2];
    panel.save(ios);
    fixture.detectChanges();
    expect(api['saveRelease']).not.toHaveBeenCalled();
    expect(root.querySelector('[data-testid="release-card-yep/ios"]')?.textContent).toContain(
      'Escribe la última versión.',
    );
  });

  it('guarda con PUT /admin/app-releases/:app/:platform', () => {
    const { panel } = create();
    const ios = panel.cards[2];
    panel.patch(ios, 'latestVersion', '1.2.0');
    panel.patch(ios, 'storeUrl', 'https://apps.apple.com/co/app/yep/id123');
    panel.save(ios);
    expect(api['saveRelease']).toHaveBeenCalledWith('yep', 'ios', {
      latestVersion: '1.2.0',
      minSupportedVersion: null,
      storeUrl: 'https://apps.apple.com/co/app/yep/id123',
      title: null,
      body: null,
      notify: true,
      enabled: true,
    });
    expect(ios.success()).toContain('Guardado');
    expect(panel.statusChip(ios).label).toBe('Activa');
  });

  it('«Quién lo vio» abre los recibos del aviso de actualizar vigente', () => {
    const { fixture, panel, root } = create();
    expect(root.querySelector('[data-testid="release-receipts-yep/android"]')).toBeNull();
    const button = root.querySelector<HTMLElement>(
      '[data-testid="release-receipts-notifier/android"] button',
    );
    expect(button?.textContent).toContain('Quién lo vio');
    button?.click();
    fixture.detectChanges();

    expect(panel.receiptsKey()).toBe('update:notifier:android:1.0.10');
    expect(panel.receiptsSubtitle()).toBe('Notificador · Android · versión 1.0.10');
    expect(api['receipts']).toHaveBeenCalledWith('update:notifier:android:1.0.10', {
      limit: 50,
      skip: 0,
    });
    expect(root.querySelector('[data-testid="release-receipts-table"]')).not.toBeNull();
    expect(root.textContent).toContain('Quién vio el aviso de actualizar');

    panel.closeReceipts();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="release-receipts-table"]')).toBeNull();
  });

  it('el resumen respeta singular/plural y la política apagada', () => {
    api['listReleases'].mockReturnValue(
      of({
        releases: [
          {
            app: 'notifier',
            platform: 'android',
            latestVersion: '1.0.11',
            minSupportedVersion: null,
            storeUrl: 'https://play.google.com/store/apps/details?id=co.yaestapago.notifier',
            notify: true,
            enabled: false,
          },
        ],
        notifierVersions: [{ version: '1.0.10', count: 1 }],
      }),
    );
    const { fixture, panel, root } = create();
    const summary = () =>
      root
        .querySelector('[data-testid="versions-summary"]')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim();
    expect(summary()).toBe(
      'De 1 celular, ninguno ve el aviso de actualizar: la política del Notificador está apagada. Si la activas, 1 lo vería.',
    );
    panel.patch(panel.cards[0], 'enabled', true);
    fixture.detectChanges();
    expect(summary()).toBe('De 1 celular, 1 vería el aviso de actualizar.');
  });
});
