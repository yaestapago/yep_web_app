import type { Announcement } from '../models/announcement.models';
import {
  type AnnouncementFormValue,
  announcementToForm,
  audienceFieldsFor,
  emptyAnnouncementForm,
  formToPayload,
  localInputToIso,
  snoozeApplies,
  switchFormApp,
  validateAnnouncementForm,
} from './announcement-form';
import { ACTIONS_BY_APP, audienceSummary, isActionAllowed } from './announcement-labels';

function form(overrides: Partial<AnnouncementFormValue> = {}): AnnouncementFormValue {
  return { ...emptyAnnouncementForm('notifier'), title: 'Título', body: 'Mensaje', ...overrides };
}

describe('announcement-form · validaciones del contrato', () => {
  it('un anuncio mínimo (título y cuerpo) es válido', () => {
    expect(validateAnnouncementForm(form())).toEqual({});
  });

  it('título 1–80 y cuerpo 1–600', () => {
    expect(validateAnnouncementForm(form({ title: '   ' })).title).toBe('Escribe el título.');
    expect(validateAnnouncementForm(form({ title: 'x'.repeat(81) })).title).toBe(
      'Máximo 80 caracteres.',
    );
    expect(validateAnnouncementForm(form({ title: 'x'.repeat(80) })).title).toBeUndefined();
    expect(validateAnnouncementForm(form({ body: '' })).body).toBe('Escribe el mensaje.');
    expect(validateAnnouncementForm(form({ body: 'x'.repeat(601) })).body).toBe(
      'Máximo 600 caracteres.',
    );
  });

  it('el texto del botón es obligatorio con acción y de 1–30', () => {
    const base = { actionType: 'run_self_test' as const };
    expect(validateAnnouncementForm(form({ ...base, actionLabel: '' })).actionLabel).toBe(
      'Escribe el texto del botón.',
    );
    expect(
      validateAnnouncementForm(form({ ...base, actionLabel: 'x'.repeat(31) })).actionLabel,
    ).toBe('Máximo 30 caracteres.');
    expect(validateAnnouncementForm(form({ ...base, actionLabel: 'Probar' }))).toEqual({});
  });

  it('open_url y update_app exigen https://', () => {
    const open = form({
      actionType: 'open_url',
      actionLabel: 'Ver',
      actionUrl: 'http://wa.me/57300',
    });
    expect(validateAnnouncementForm(open).actionUrl).toBe('Pon un enlace que empiece por https://');
    expect(validateAnnouncementForm({ ...open, actionUrl: 'https://wa.me/57300' })).toEqual({});
    const update = form({ actionType: 'update_app', actionLabel: 'Actualizar', actionUrl: '' });
    expect(validateAnnouncementForm(update).actionUrl).toBeDefined();
  });

  it('open_route exige que la pantalla empiece por /', () => {
    const value = form({
      app: 'yep',
      actionType: 'open_route',
      actionLabel: 'Ver',
      actionRoute: 'settings',
    });
    expect(validateAnnouncementForm(value).actionRoute).toContain('debe empezar por /');
    expect(validateAnnouncementForm({ ...value, actionRoute: '/settings' })).toEqual({});
  });

  it('dismissible=false solo con acción', () => {
    expect(validateAnnouncementForm(form({ dismissible: false })).dismissible).toBe(
      'Para que no se pueda cerrar, el aviso necesita un botón.',
    );
    expect(
      validateAnnouncementForm(
        form({ dismissible: false, actionType: 'run_self_test', actionLabel: 'Probar' }),
      ),
    ).toEqual({});
  });

  it('snoozeHours entero 1–720 y prioridad entero 0–100', () => {
    expect(validateAnnouncementForm(form({ snoozeHours: '0' })).snoozeHours).toBeDefined();
    expect(validateAnnouncementForm(form({ snoozeHours: '721' })).snoozeHours).toBeDefined();
    expect(validateAnnouncementForm(form({ snoozeHours: '1.5' })).snoozeHours).toBeDefined();
    expect(validateAnnouncementForm(form({ snoozeHours: '720' })).snoozeHours).toBeUndefined();
    expect(validateAnnouncementForm(form({ priority: '101' })).priority).toBeDefined();
    expect(validateAnnouncementForm(form({ priority: '-1' })).priority).toBeDefined();
    expect(validateAnnouncementForm(form({ priority: '0' })).priority).toBeUndefined();
  });

  it('versiones con números y puntos, la mínima no mayor que la máxima', () => {
    expect(validateAnnouncementForm(form({ minVersion: '1.0.x' })).minVersion).toBeDefined();
    expect(
      validateAnnouncementForm(form({ minVersion: '1.0.10', maxVersion: '1.0.9' })).maxVersion,
    ).toBe('La versión máxima no puede ser menor que la mínima.');
    expect(validateAnnouncementForm(form({ minVersion: '1.0.9', maxVersion: '1.0.10' }))).toEqual(
      {},
    );
  });

  it('la ventana debe terminar después de empezar', () => {
    expect(
      validateAnnouncementForm(form({ startsAt: '2026-10-20T08:00', endsAt: '2026-10-20T08:00' }))
        .endsAt,
    ).toBe('El final debe ser después del inicio.');
    expect(
      validateAnnouncementForm(form({ startsAt: '2026-10-20T08:00', endsAt: '2026-10-21T08:00' })),
    ).toEqual({});
  });

  it('rechaza audiencia y acciones que no aplican a la app', () => {
    const yep = form({
      app: 'yep',
      notifierIds: ['6710c0ffee0000000000abcd'],
      condition: 'listener_off',
      actionType: 'open_notification_access',
      actionLabel: 'Activar',
    });
    const errors = validateAnnouncementForm(yep);
    expect(errors.notifierIds).toBeDefined();
    expect(errors.condition).toBeDefined();
    expect(errors.actionType).toBe('Esa acción no existe en App de YEP.');

    const notifier = form({
      userIds: ['u1'],
      roles: ['account_owner'],
      actionType: 'open_route',
      actionLabel: 'Ver',
      actionRoute: '/x',
    });
    const notifierErrors = validateAnnouncementForm(notifier);
    expect(notifierErrors.userIds).toBeDefined();
    expect(notifierErrors.roles).toBeDefined();
    expect(notifierErrors.actionType).toBeDefined();
  });
});

describe('announcement-form · filtrado por app', () => {
  it('campos de audiencia por app', () => {
    expect(audienceFieldsFor('notifier')).toEqual({
      notifierIds: true,
      condition: true,
      notify: true,
      userIds: false,
      roles: false,
      platforms: false,
    });
    expect(audienceFieldsFor('yep')).toEqual({
      notifierIds: false,
      condition: false,
      notify: false,
      userIds: true,
      roles: true,
      platforms: true,
    });
  });

  it('acciones por app (contrato · Acciones)', () => {
    expect(ACTIONS_BY_APP.yep).toEqual(['update_app', 'open_url', 'open_route']);
    expect(isActionAllowed('notifier', 'open_route')).toBe(false);
    expect(isActionAllowed('notifier', 'open_conversations_settings')).toBe(true);
    expect(isActionAllowed('yep', 'run_self_test')).toBe(false);
  });

  it('switchFormApp quita lo que la otra app no entiende y lo cuenta', () => {
    const { value, removed } = switchFormApp(
      form({
        notifierIds: ['6710c0ffee0000000000abcd'],
        condition: 'listener_off',
        notify: true,
        accountIds: ['b1'],
        actionType: 'open_notification_access',
        actionLabel: 'Activar',
        dismissible: false,
      }),
      'yep',
    );
    expect(value.app).toBe('yep');
    expect(value.notifierIds).toEqual([]);
    expect(value.condition).toBe('');
    expect(value.notify).toBe(false);
    expect(value.accountIds).toEqual(['b1']);
    expect(value.actionType).toBe('');
    expect(value.dismissible).toBe(true);
    expect(removed).toEqual([
      'los celulares elegidos',
      'la condición automática',
      'el botón (esa acción no existe en la otra app)',
    ]);
  });

  it('switchFormApp conserva update_app y cambia la ficha de tienda sugerida', () => {
    const { value } = switchFormApp(
      form({
        actionType: 'update_app',
        actionLabel: 'Actualizar',
        actionUrl: 'https://play.google.com/store/apps/details?id=co.yaestapago.notifier',
      }),
      'yep',
    );
    expect(value.actionType).toBe('update_app');
    expect(value.actionUrl).toBe('https://play.google.com/store/apps/details?id=co.yaestapago.app');
  });

  it('el snooze aplica a until_action y a los automáticos', () => {
    expect(snoozeApplies({ app: 'notifier', repeat: 'once', condition: '' })).toBe(false);
    expect(snoozeApplies({ app: 'notifier', repeat: 'until_action', condition: '' })).toBe(true);
    expect(snoozeApplies({ app: 'notifier', repeat: 'once', condition: 'listener_off' })).toBe(
      true,
    );
  });
});

describe('announcement-form · cuerpo para el backend', () => {
  it('al crear omite los opcionales vacíos y solo manda la audiencia de la app', () => {
    const payload = formToPayload(
      form({ accountIds: ['b1'], notifierIds: ['n1'], condition: 'listener_off', notify: true }),
      { mode: 'create', status: 'draft' },
    );
    expect(payload).toEqual({
      app: 'notifier',
      status: 'draft',
      tone: 'info',
      title: 'Título',
      body: 'Mensaje',
      dismissible: true,
      notify: true,
      repeat: 'once',
      snoozeHours: 24,
      priority: 50,
      audience: {
        accountIds: ['b1'],
        notifierIds: ['n1'],
        platforms: [],
        condition: 'listener_off',
      },
    });
    expect('action' in payload).toBe(false);
    expect('startsAt' in payload).toBe(false);
  });

  it('la App de YEP manda usuarios, roles y plataformas, y notify en false', () => {
    const payload = formToPayload(
      form({
        app: 'yep',
        userIds: ['u1'],
        roles: ['account_staff'],
        platforms: ['ios'],
        notify: true,
        minVersion: '1.2.0',
        actionType: 'open_route',
        actionLabel: ' Ver ',
        actionRoute: '/settings',
        actionUrl: 'https://no-se-manda',
      }),
      { mode: 'create', status: 'published' },
    );
    expect(payload.notify).toBe(false);
    expect(payload.audience).toEqual({
      accountIds: [],
      userIds: ['u1'],
      roles: ['account_staff'],
      platforms: ['ios'],
      minVersion: '1.2.0',
    });
    expect(payload.action).toEqual({ type: 'open_route', label: 'Ver', route: '/settings' });
  });

  it('al editar manda null para borrar acción y fechas, y sin status conserva el estado', () => {
    const payload = formToPayload(form(), { mode: 'update' });
    expect(payload.action).toBeNull();
    expect(payload.startsAt).toBeNull();
    expect(payload.endsAt).toBeNull();
    expect('status' in payload).toBe(false);
  });

  it('las fechas viajan en ISO', () => {
    const payload = formToPayload(form({ startsAt: '2026-10-20T08:00' }), { mode: 'create' });
    expect(payload.startsAt).toBe(localInputToIso('2026-10-20T08:00'));
    expect(payload.startsAt).toMatch(/Z$/);
  });

  it('announcementToForm ida y vuelta', () => {
    const announcement: Announcement = {
      id: 'a1',
      app: 'notifier',
      status: 'published',
      tone: 'warning',
      title: 'Activa «Conversaciones»',
      body: 'Línea 1\nLínea 2',
      action: { type: 'open_conversations_settings', label: 'Activar' },
      dismissible: true,
      notify: true,
      repeat: 'until_action',
      snoozeHours: 12,
      priority: 80,
      audience: { condition: 'conversations_blocked', accountIds: [], notifierIds: [] },
      startsAt: '2026-10-20T13:00:00.000Z',
      endsAt: null,
      source: 'system',
    };
    const value = announcementToForm(announcement);
    expect(value.snoozeHours).toBe('12');
    expect(value.condition).toBe('conversations_blocked');
    const payload = formToPayload(value, { mode: 'update' });
    expect(payload.audience).toEqual({
      accountIds: [],
      notifierIds: [],
      platforms: [],
      condition: 'conversations_blocked',
    });
    expect(payload.startsAt).toBe('2026-10-20T13:00:00.000Z');
    expect(payload.body).toBe('Línea 1\nLínea 2');
  });
});

describe('announcement-labels · a quién va', () => {
  it('automático por condición', () => {
    expect(audienceSummary('notifier', { condition: 'listener_off' })).toBe(
      'Automático: escucha apagada',
    );
    expect(
      audienceSummary('notifier', { condition: 'conversations_blocked', accountIds: ['b1'] }),
    ).toBe('Automático: «Conversaciones» bloqueado · 1 negocio');
  });

  it('todos, o el resumen de los filtros', () => {
    expect(audienceSummary('notifier', {})).toBe('Todos los celulares del Notificador');
    expect(audienceSummary('yep', { accountIds: [], userIds: [] })).toBe(
      'Todos los usuarios de la App de YEP',
    );
    expect(
      audienceSummary('yep', {
        accountIds: ['b1', 'b2', 'b3'],
        roles: ['account_owner'],
        platforms: ['ios'],
        minVersion: '1.2.0',
      }),
    ).toBe('3 negocios · Solo dueños · Solo iPhone · desde la versión 1.2.0');
    expect(audienceSummary('notifier', { notifierIds: ['n1', 'n2'], maxVersion: '1.0.9' })).toBe(
      '2 celulares · hasta la versión 1.0.9',
    );
  });
});
