import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';

import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { SupportApiService } from '../../../support/services/support-api.service';
import type { Announcement } from '../../models/announcement.models';
import { AdminAnnouncementsApiService } from '../../services/admin-announcements-api.service';
import { AnnouncementEditorPage, audienceCountLabel } from './announcement-editor.page';

const existing: Announcement = {
  id: 'a1',
  app: 'notifier',
  status: 'published',
  tone: 'danger',
  title: 'YEP dejó de escuchar los pagos',
  body: 'Toca «Activar».',
  action: { type: 'open_notification_access', label: 'Activar' },
  dismissible: true,
  notify: true,
  repeat: 'until_action',
  snoozeHours: 6,
  priority: 90,
  audience: { condition: 'listener_off', accountIds: [], notifierIds: [] },
  source: 'system',
  systemKey: 'auto:listener_off',
};

describe('AnnouncementEditorPage', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let support: Record<string, ReturnType<typeof vi.fn>>;
  let confirm: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;

  function create(params: Record<string, string> = {}, query: Record<string, string> = {}) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminAnnouncementsApiService, useValue: api },
        { provide: SupportApiService, useValue: support },
        { provide: NotificationModalService, useValue: { confirm } },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap(params),
              queryParamMap: convertToParamMap(query),
            },
          },
        },
      ],
    });
    const fixture: ComponentFixture<AnnouncementEditorPage> =
      TestBed.createComponent(AnnouncementEditorPage);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    api = {
      get: vi.fn().mockReturnValue(of(existing)),
      create: vi.fn((payload) => of({ ...existing, ...payload, id: 'new1' })),
      update: vi.fn((id, payload) => of({ ...existing, ...payload, id })),
      audiencePreview: vi.fn().mockReturnValue(of({ notifiers: 7, users: 3 })),
      setStatus: vi.fn(),
      remove: vi.fn(),
    };
    support = {
      listBusinesses: vi.fn().mockReturnValue(of({ items: [], pagination: {} })),
      listUsers: vi.fn().mockReturnValue(of({ items: [], pagination: {} })),
    };
    confirm = vi.fn().mockResolvedValue(true);
    navigate = vi.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const has = (root: HTMLElement, id: string) => !!root.querySelector(`[data-testid="${id}"]`);

  it('Notificador: muestra condición, celulares y notificación; no usuarios, roles ni plataformas', () => {
    const { page, root } = create();
    expect(page.value().app).toBe('notifier');
    expect(root.querySelector('[data-cy="condition"]')).toBeTruthy();
    expect(has(root, 'picker-notifiers')).toBe(true);
    expect(has(root, 'field-notify')).toBe(true);
    expect(has(root, 'picker-users')).toBe(false);
    expect(has(root, 'field-roles')).toBe(false);
    expect(has(root, 'field-platforms')).toBe(false);
    expect(page.actionOptions().map((option) => option.id)).toEqual([
      '',
      'update_app',
      'open_url',
      'open_notification_access',
      'open_conversations_settings',
      'save_bank_contact',
      'open_autostart_settings',
      'open_battery_settings',
      'open_app_notification_settings',
      'run_self_test',
      'open_diagnostics',
    ]);
  });

  it('al pasar a la App de YEP filtra campos y acciones, y avisa lo que quitó', () => {
    const { fixture, page, root } = create();
    page.form.patchValue({
      condition: 'listener_off',
      actionType: 'open_notification_access',
      actionLabel: 'Activar',
    });
    page.setApp('yep');
    fixture.detectChanges();

    expect(page.value().app).toBe('yep');
    expect(page.value().condition).toBe('');
    expect(page.value().actionType).toBe('');
    expect(has(root, 'picker-users')).toBe(true);
    expect(has(root, 'field-roles')).toBe(true);
    expect(has(root, 'field-platforms')).toBe(true);
    expect(has(root, 'picker-notifiers')).toBe(false);
    expect(has(root, 'field-notify')).toBe(false);
    expect(root.querySelector('[data-cy="condition"]')).toBeNull();
    expect(page.actionOptions().map((option) => option.id)).toEqual([
      '',
      'update_app',
      'open_url',
      'open_route',
    ]);
    expect(page.appNotice()).toContain('la condición automática');
    expect(page.appNotice()).toContain('la App de YEP');
  });

  it('elegir una acción sugiere el texto del botón y, para actualizar, la ficha de la tienda', () => {
    const { page } = create();
    page.form.controls.actionType.setValue('update_app');
    expect(page.form.controls.actionLabel.value).toBe('Actualizar');
    expect(page.form.controls.actionUrl.value).toBe(
      'https://play.google.com/store/apps/details?id=co.yaestapago.notifier',
    );
    page.form.controls.actionType.setValue('run_self_test');
    expect(page.form.controls.actionLabel.value).toBe('Hacer la prueba');
    page.form.controls.actionLabel.setValue('Probar ahora');
    page.form.controls.actionType.setValue('open_diagnostics');
    expect(page.form.controls.actionLabel.value).toBe('Probar ahora');
  });

  it('SMS del banco ocultos por Android: condición y acción «Guardar contacto del banco»', () => {
    const { page } = create();
    expect(page['conditionOptions']).toContainEqual({
      id: 'sms_hidden',
      label: 'SMS del banco ocultos por Android',
    });
    expect(page.actionOptions()).toContainEqual({
      id: 'save_bank_contact',
      label: 'Guardar contacto del banco',
    });
    page.form.controls.actionType.setValue('save_bank_contact');
    expect(page.form.controls.actionLabel.value).toBe('Guardar contacto');
  });

  it('no guarda con errores y los muestra en el formulario', async () => {
    const { fixture, page, root } = create();
    await page.save('draft');
    fixture.detectChanges();
    expect(api['create']).not.toHaveBeenCalled();
    expect(page.error()).toBe('Revisa los campos marcados en rojo.');
    expect(root.querySelector('[data-testid="error-body"]')?.textContent).toContain(
      'Escribe el mensaje.',
    );
    expect(root.querySelector('[data-testid="field-title"]')?.textContent).toContain(
      'Escribe el título.',
    );
  });

  it('el botón no descartable sin acción se rechaza; los errores de fecha se ven', async () => {
    const { fixture, page, root } = create();
    page.form.patchValue({
      title: 'x',
      body: 'y',
      dismissible: false,
      startsAt: '2026-10-21T08:00',
      endsAt: '2026-10-20T08:00',
    });
    await page.save('draft');
    fixture.detectChanges();
    expect(api['create']).not.toHaveBeenCalled();
    expect(page.errors().dismissible).toBeDefined();
    expect(root.querySelector('[data-testid="error-endsAt"]')?.textContent).toContain(
      'El final debe ser después del inicio.',
    );
  });

  it('crea un borrador con el cuerpo del contrato y va al detalle', async () => {
    const { page } = create();
    page.form.patchValue({
      title: '  Nueva guía  ',
      body: 'Mira cómo activar YEP.',
      accountIds: ['6710c0ffee0000000000abcd'],
      actionType: 'open_url',
    });
    page.form.patchValue({ actionUrl: 'https://yaestapago.co/guia' });
    await page.save('draft');

    expect(confirm).not.toHaveBeenCalled();
    expect(api['create']).toHaveBeenCalledTimes(1);
    expect(api['create'].mock.calls[0][0]).toEqual({
      app: 'notifier',
      status: 'draft',
      tone: 'info',
      title: 'Nueva guía',
      body: 'Mira cómo activar YEP.',
      action: { type: 'open_url', label: 'Ver más', url: 'https://yaestapago.co/guia' },
      dismissible: true,
      notify: false,
      repeat: 'once',
      snoozeHours: 24,
      priority: 50,
      audience: { accountIds: ['6710c0ffee0000000000abcd'], notifierIds: [], platforms: [] },
    });
    expect(navigate).toHaveBeenCalledWith(['/__ops/announcements', 'new1'], {
      state: { notice: 'Guardado como borrador.' },
    });
  });

  it('publicar pide confirmación; si cancela no guarda', async () => {
    confirm.mockResolvedValue(false);
    const { page } = create();
    page.form.patchValue({ title: 'Hola', body: 'Mundo' });
    await page.save('published');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(api['create']).not.toHaveBeenCalled();

    confirm.mockResolvedValue(true);
    await page.save('published');
    expect(api['create'].mock.calls[0][0].status).toBe('published');
  });

  it('cuenta los destinatarios con audience-preview (debounce) y lo dice en palabras', async () => {
    vi.useFakeTimers();
    const { fixture, page, root } = create();
    TestBed.tick();
    vi.advanceTimersByTime(450);
    fixture.detectChanges();
    expect(api['audiencePreview']).toHaveBeenLastCalledWith('notifier', {
      accountIds: [],
      notifierIds: [],
      platforms: [],
    });
    expect(root.querySelector('[data-testid="audience-count"]')?.textContent).toContain(
      'Le llegaría a 7 celulares',
    );

    page.setApp('yep');
    page.form.patchValue({ roles: ['account_owner'], minVersion: '1.2' });
    TestBed.tick();
    vi.advanceTimersByTime(450);
    fixture.detectChanges();
    expect(api['audiencePreview']).toHaveBeenLastCalledWith('yep', {
      accountIds: [],
      userIds: [],
      roles: ['account_owner'],
      platforms: [],
      minVersion: '1.2',
    });
    expect(page.audienceCountText()).toBe('Le llegaría a 3 usuarios');
  });

  it('una versión a medio escribir no se manda al contar', () => {
    vi.useFakeTimers();
    const { page } = create();
    page.form.patchValue({ minVersion: '1.0.' });
    TestBed.tick();
    vi.advanceTimersByTime(450);
    expect(api['audiencePreview']).toHaveBeenLastCalledWith('notifier', {
      accountIds: [],
      notifierIds: [],
      platforms: [],
    });
  });

  it('editar: carga el anuncio, bloquea la app y guarda con PATCH sin cambiar el estado', async () => {
    const { fixture, page } = create({ id: 'a1' });
    fixture.detectChanges();
    expect(api['get']).toHaveBeenCalledWith('a1');
    expect(page.mode()).toBe('edit');
    expect(page.appLocked()).toBe(true);
    expect(page.isSystem()).toBe(true);
    expect(page.value().condition).toBe('listener_off');

    page.setApp('yep');
    expect(page.value().app).toBe('notifier');

    page.form.patchValue({ title: 'YEP no está escuchando' });
    await page.save();
    expect(confirm).not.toHaveBeenCalled();
    expect(api['update']).toHaveBeenCalledTimes(1);
    const [id, payload] = api['update'].mock.calls[0];
    expect(id).toBe('a1');
    expect(payload.title).toBe('YEP no está escuchando');
    expect('status' in payload).toBe(false);
    expect(payload.audience).toEqual({
      accountIds: [],
      notifierIds: [],
      platforms: [],
      condition: 'listener_off',
    });
    expect(payload.startsAt).toBeNull();
  });

  it('duplicar: copia la fuente como anuncio nuevo y deja elegir la app', async () => {
    const { page } = create({}, { duplicar: 'a1' });
    expect(api['get']).toHaveBeenCalledWith('a1');
    expect(page.mode()).toBe('create');
    expect(page.duplicateOf()?.id).toBe('a1');
    expect(page.pageTitle()).toBe('Duplicar anuncio');
    expect(page.value().title).toBe(existing.title);

    page.setApp('yep');
    await page.save('draft');
    expect(api['update']).not.toHaveBeenCalled();
    const payload = api['create'].mock.calls[0][0];
    expect(payload.app).toBe('yep');
    expect(payload.audience).toEqual({ accountIds: [], userIds: [], roles: [], platforms: [] });
    expect('action' in payload).toBe(false);
  });

  it('un 400 del backend se muestra en el formulario, un texto por línea', async () => {
    api['create'].mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: {
              message: [
                'action.type=open_battery_settings no aplica a app=yep',
                'startsAt debe ser anterior a endsAt',
              ],
            },
          }),
      ),
    );
    const { fixture, page, root } = create();
    page.form.patchValue({ title: 'Hola', body: 'Mundo' });
    await page.save('draft');
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    const items = root.querySelectorAll('[data-testid="editor-server-errors"] li');
    expect([...items].map((item) => item.textContent?.trim())).toEqual([
      'action.type=open_battery_settings no aplica a app=yep',
      'startsAt debe ser anterior a endsAt',
    ]);
  });

  it('los anuncios automáticos no ofrecen «Borrar»; los borradores manuales sí', () => {
    const system = create({ id: 'a1' });
    expect(system.page.canDelete()).toBe(false);
    api['get'].mockReturnValue(of({ ...existing, status: 'draft', source: 'manual' }));
    const manual = create({ id: 'a1' });
    expect(manual.page.canDelete()).toBe(true);
  });

  it('las frases contraen el artículo: «al Notificador» y «del Notificador»', async () => {
    vi.useFakeTimers();
    api['audiencePreview'].mockReturnValue(of({ notifiers: 1 }));
    const { page } = create({}, { app: 'yep' });
    expect(page.value().app).toBe('yep');
    page.form.patchValue({ userIds: ['6710c0ffee0000000000abcd'] });
    page.setApp('notifier');
    expect(page.appNotice()).toBe('Quité los usuarios elegidos: no aplica al Notificador.');

    page.form.patchValue({ title: 'Hola', body: 'Mundo' });
    TestBed.tick();
    vi.advanceTimersByTime(450);
    expect(page.audienceCountText()).toBe('Le llegaría a 1 celular');
    await page.save('published');
    expect(confirm.mock.calls[0][0].message).toEqual([
      'Le llegaría a 1 celular del Notificador.',
      'Sale en el próximo latido de cada celular (Notificador 1.0.10 o superior).',
    ]);
  });

  it('al pasar a la App de YEP también contrae bien («a la App de YEP»)', () => {
    const { page } = create();
    page.form.patchValue({ condition: 'listener_off', notifierIds: ['6710c0ffee0000000000abcd'] });
    page.setApp('yep');
    expect(page.appNotice()).toBe(
      'Quité los celulares elegidos y la condición automática: no aplican a la App de YEP.',
    );
  });

  it('audienceCountLabel en singular y plural', () => {
    expect(audienceCountLabel('notifier', 1)).toBe('Le llegaría a 1 celular');
    expect(audienceCountLabel('notifier', 1200)).toBe('Le llegaría a 1.200 celulares');
    expect(audienceCountLabel('yep', 1)).toBe('Le llegaría a 1 usuario');
  });
});
