import {
  defaultUpdateCopy,
  notifierVersionRows,
  releaseFormToPayload,
  releaseToForm,
  summarizeNotifierVersions,
  validateReleaseForm,
} from './app-release-form';

describe('app-release-form · política de versión', () => {
  it('sin política sugiere la URL de tienda por defecto (iOS no tiene)', () => {
    expect(releaseToForm({ app: 'notifier', platform: 'android' }, null).storeUrl).toBe(
      'https://play.google.com/store/apps/details?id=co.yaestapago.notifier',
    );
    expect(releaseToForm({ app: 'yep', platform: 'android' }, null).storeUrl).toBe(
      'https://play.google.com/store/apps/details?id=co.yaestapago.app',
    );
    const ios = releaseToForm({ app: 'yep', platform: 'ios' }, null);
    expect(ios.storeUrl).toBe('');
    expect(ios.notify).toBe(true);
    expect(ios.enabled).toBe(true);
  });

  it('valida última (requerida), mínima ≤ última y tienda https', () => {
    const base = releaseToForm({ app: 'notifier', platform: 'android' }, null);
    expect(validateReleaseForm(base).latestVersion).toBe('Escribe la última versión.');
    expect(validateReleaseForm({ ...base, latestVersion: '1.0.10' })).toEqual({});
    expect(
      validateReleaseForm({ ...base, latestVersion: '1.0.10', minSupportedVersion: '1.0.11' })
        .minSupportedVersion,
    ).toBe('No puede ser mayor que la última versión.');
    expect(
      validateReleaseForm({ ...base, latestVersion: '1.0.10', minSupportedVersion: '1.0.9' }),
    ).toEqual({});
    expect(
      validateReleaseForm({ ...base, latestVersion: '1.0.10', storeUrl: 'market://details?id=x' })
        .storeUrl,
    ).toBeDefined();
  });

  it('el cuerpo del PUT manda null en los opcionales vacíos', () => {
    expect(
      releaseFormToPayload({
        latestVersion: ' 1.0.10 ',
        minSupportedVersion: '',
        storeUrl: 'https://play.google.com/x',
        title: ' ',
        body: '',
        notify: true,
        enabled: false,
      }),
    ).toEqual({
      latestVersion: '1.0.10',
      minSupportedVersion: null,
      storeUrl: 'https://play.google.com/x',
      title: null,
      body: null,
      notify: true,
      enabled: false,
    });
  });

  it('textos por defecto del aviso de actualizar (contrato)', () => {
    expect(defaultUpdateCopy('notifier', '1.0.10', false)).toEqual({
      title: 'Hay una versión nueva de YEP',
      body: 'Actualiza a la versión 1.0.10 para seguir recibiendo las mejoras.',
    });
    expect(defaultUpdateCopy('notifier', '1.0.10', true).body).toContain(
      'la escucha de pagos sigue funcionando mientras tanto',
    );
    expect(defaultUpdateCopy('yep', '1.2.0', true).body).toBe(
      'Tu versión ya no es compatible. Actualiza a la versión 1.2.0.',
    );
  });
});

describe('app-release-form · versiones del notificador en uso', () => {
  const versions = [
    { version: '1.0.9+14', count: 5 },
    { version: '1.0.10', count: 20 },
    { version: null, count: 2 },
    { version: '1.0.11', count: 3 },
    { version: '1.0.8', count: 1 },
  ];

  it('ordena de la más nueva a la más vieja y deja las desconocidas al final', () => {
    expect(notifierVersionRows(versions, '1.0.11', '1.0.10').map((row) => row.version)).toEqual([
      '1.0.11',
      '1.0.10',
      '1.0.9+14',
      '1.0.8',
      'Sin versión',
    ]);
  });

  it('marca debajo de la mínima / de la última y las anteriores a 1.0.10', () => {
    const rows = notifierVersionRows(versions, '1.0.11', '1.0.10');
    const byVersion = Object.fromEntries(rows.map((row) => [row.version, row]));
    expect(byVersion['1.0.11']).toMatchObject({
      standing: 'current',
      tone: 'success',
      legacy: false,
    });
    expect(byVersion['1.0.10']).toMatchObject({
      standing: 'below_latest',
      tone: 'warning',
      legacy: false,
    });
    expect(byVersion['1.0.9+14']).toMatchObject({
      standing: 'below_min',
      tone: 'error',
      legacy: true,
    });
    expect(byVersion['1.0.9+14'].note).toContain('No ve avisos');
    expect(byVersion['Sin versión']).toMatchObject({ standing: 'unknown', legacy: false });
    expect(byVersion['1.0.10'].share).toBe(100);
    expect(byVersion['1.0.11'].share).toBe(15);
  });

  it('el resumen no cuenta como "verían el aviso" a los anteriores a 1.0.10', () => {
    const summary = summarizeNotifierVersions(notifierVersionRows(versions, '1.0.11', '1.0.10'));
    expect(summary).toEqual({ total: 31, seeUpdate: 20, forced: 0, legacy: 6 });
    const forced = summarizeNotifierVersions(notifierVersionRows(versions, '1.0.12', '1.0.11'));
    expect(forced).toEqual({ total: 31, seeUpdate: 23, forced: 20, legacy: 6 });
  });

  it('sin última ni mínima todo queda al día', () => {
    const rows = notifierVersionRows([{ version: '1.0.10', count: 1 }], '', '');
    expect(rows[0].standing).toBe('current');
  });
});
