import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideArchive,
  LucideArrowLeft,
  LucideSend,
  LucideTrash2,
  LucideUsers,
} from '@lucide/angular';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';

import {
  Alert,
  Button,
  Card,
  CardSection,
  Input,
  PageHeader,
  Select,
  type SelectOption,
  State,
} from '../../../../shared/ui';
import { Checkbox } from '../../../../shared/ui/checkbox/checkbox';
import { Radio } from '../../../../shared/ui/radio/radio';
import { Toggle } from '../../../../shared/ui/toggle/toggle';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { httpErrorMessages } from '../../utils/http-error-messages';
import { SupportApiService } from '../../../support/services/support-api.service';
import { AnnouncementPreview } from '../../components/announcement-preview/announcement-preview';
import { IdPicker, type IdPickerSearch } from '../../components/id-picker/id-picker';
import type {
  Announcement,
  AnnouncementActionType,
  AnnouncementApp,
  AnnouncementCondition,
  AnnouncementPlatform,
  AnnouncementRepeat,
  AnnouncementRole,
  AnnouncementStatus,
  AnnouncementTone,
} from '../../models/announcement.models';
import { DEFAULT_STORE_URLS } from '../../models/announcement.models';
import { AdminAnnouncementsApiService } from '../../services/admin-announcements-api.service';
import { AnnouncementCommandsService } from '../../services/announcement-commands.service';
import {
  ACTION_LABEL_MAX,
  type AnnouncementFormField,
  type AnnouncementFormValue,
  BODY_MAX,
  TITLE_MAX,
  actionNeedsRoute,
  actionNeedsUrl,
  announcementToForm,
  audienceFieldsFor,
  emptyAnnouncementForm,
  formToAudience,
  formToPayload,
  snoozeApplies,
  switchFormApp,
  validateAnnouncementForm,
} from '../../utils/announcement-form';
import {
  ACTIONS_BY_APP,
  ACTION_LABELS,
  APP_LABELS,
  appInSentence,
  CONDITION_HINTS,
  CONDITION_LABELS,
  PLATFORM_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  TONE_LABELS,
} from '../../utils/announcement-labels';
import { isValidVersionInput } from '../../utils/app-version';

type EditorMode = 'create' | 'edit';

/** Texto sugerido del botón al elegir una acción (si el campo está vacío o tenía otra sugerencia). */
export const SUGGESTED_ACTION_LABELS: Record<AnnouncementActionType, string> = {
  update_app: 'Actualizar',
  open_url: 'Ver más',
  open_route: 'Ver',
  open_notification_access: 'Dar permiso',
  open_conversations_settings: 'Activar',
  open_autostart_settings: 'Activar',
  open_battery_settings: 'Quitar restricción',
  open_app_notification_settings: 'Activar',
  run_self_test: 'Hacer la prueba',
  open_diagnostics: 'Ver diagnóstico',
};

const CONDITIONS: AnnouncementCondition[] = [
  'permission_missing',
  'listener_off',
  'conversations_blocked',
  'notifications_blocked',
  'battery_restricted',
];

export type AudienceCountState =
  | { state: 'loading' }
  | { state: 'ready'; count: number }
  | { state: 'error' };

/** "Le llegaría a 12 celulares" / "Le llegaría a 1 usuario". */
export function audienceCountLabel(app: AnnouncementApp, count: number): string {
  const formatted = new Intl.NumberFormat('es-CO').format(count);
  const noun =
    app === 'notifier'
      ? count === 1
        ? 'celular'
        : 'celulares'
      : count === 1
        ? 'usuario'
        : 'usuarios';
  return `Le llegaría a ${formatted} ${noun}`;
}

/**
 * Superadmin · crear, editar y duplicar un anuncio (`/__ops/announcements/new`,
 * `/__ops/announcements/:id/edit`, `/__ops/announcements/new?duplicar=:id`).
 */
@Component({
  selector: 'app-announcement-editor-page',
  imports: [
    ReactiveFormsModule,
    Alert,
    Button,
    Card,
    CardSection,
    Checkbox,
    Input,
    PageHeader,
    Radio,
    Select,
    State,
    Toggle,
    AnnouncementPreview,
    IdPicker,
    LucideArchive,
    LucideArrowLeft,
    LucideSend,
    LucideTrash2,
    LucideUsers,
  ],
  templateUrl: './announcement-editor.page.html',
  styleUrl: './announcement-editor.page.scss',
})
export class AnnouncementEditorPage implements OnInit {
  private readonly api = inject(AdminAnnouncementsApiService);
  private readonly commands = inject(AnnouncementCommandsService);
  private readonly support = inject(SupportApiService);
  private readonly notifications = inject(NotificationModalService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly titleMax = TITLE_MAX;
  protected readonly bodyMax = BODY_MAX;
  protected readonly actionLabelMax = ACTION_LABEL_MAX;
  protected readonly appLabels = APP_LABELS;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly roles: { value: AnnouncementRole; label: string }[] = [
    { value: 'account_owner', label: ROLE_LABELS.account_owner },
    { value: 'account_staff', label: ROLE_LABELS.account_staff },
  ];
  protected readonly platforms: { value: AnnouncementPlatform; label: string }[] = [
    { value: 'android', label: PLATFORM_LABELS.android },
    { value: 'ios', label: PLATFORM_LABELS.ios },
  ];
  protected readonly toneOptions: SelectOption[] = (
    Object.keys(TONE_LABELS) as AnnouncementTone[]
  ).map((tone) => ({ id: tone, label: TONE_LABELS[tone] }));
  protected readonly conditionOptions: SelectOption[] = [
    { id: '', label: 'Ninguna: le llega a quien elijas abajo' },
    ...CONDITIONS.map((condition) => ({ id: condition, label: CONDITION_LABELS[condition] })),
  ];

  readonly mode = signal<EditorMode>('create');
  readonly original = signal<Announcement | null>(null);
  readonly duplicateOf = signal<Announcement | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly saving = signal<'draft' | 'published' | 'save' | 'archive' | 'delete' | null>(null);
  readonly error = signal('');
  /** Textos de un 400 del backend (`message` en arreglo), uno por línea. */
  readonly serverErrors = signal<string[]>([]);
  readonly appNotice = signal('');
  readonly submitted = signal(false);

  readonly form = this.fb.group({
    app: ['notifier' as AnnouncementApp],
    tone: ['info' as AnnouncementTone],
    title: [''],
    body: [''],
    actionType: ['' as AnnouncementActionType | ''],
    actionLabel: [''],
    actionUrl: [''],
    actionRoute: [''],
    dismissible: [true],
    notify: [false],
    repeat: ['once' as AnnouncementRepeat],
    snoozeHours: ['24'],
    priority: ['50'],
    accountIds: [[] as string[]],
    notifierIds: [[] as string[]],
    userIds: [[] as string[]],
    roles: [[] as AnnouncementRole[]],
    platforms: [[] as AnnouncementPlatform[]],
    minVersion: [''],
    maxVersion: [''],
    condition: ['' as AnnouncementCondition | ''],
    startsAt: [''],
    endsAt: [''],
  });

  readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  readonly errors = computed(() => validateAnnouncementForm(this.value()));
  readonly isValid = computed(() => Object.keys(this.errors()).length === 0);
  readonly fields = computed(() => audienceFieldsFor(this.value().app));
  readonly appLocked = computed(() => this.mode() === 'edit');
  readonly status = computed<AnnouncementStatus | null>(() => this.original()?.status ?? null);
  readonly isSystem = computed(() => this.original()?.source === 'system');
  readonly canDelete = computed(() => {
    const original = this.original();
    return !!original && AnnouncementCommandsService.canDelete(original);
  });
  readonly needsUrl = computed(() => actionNeedsUrl(this.value().actionType));
  readonly needsRoute = computed(() => actionNeedsRoute(this.value().actionType));
  readonly hasAction = computed(() => !!this.value().actionType);
  readonly showSnooze = computed(() => snoozeApplies(this.value()));
  readonly conditionHint = computed(() => {
    const condition = this.value().condition;
    return condition ? CONDITION_HINTS[condition] : '';
  });
  readonly actionOptions = computed<SelectOption[]>(() => [
    { id: '', label: 'Sin botón: solo «Cerrar»' },
    ...ACTIONS_BY_APP[this.value().app].map((type) => ({ id: type, label: ACTION_LABELS[type] })),
  ]);
  readonly pageTitle = computed(() => {
    if (this.mode() === 'edit') return 'Editar anuncio';
    return this.duplicateOf() ? 'Duplicar anuncio' : 'Nuevo anuncio';
  });

  /** Cuenta aproximada de destinatarios (`POST /admin/announcements/audience-preview`). */
  readonly audienceCount = signal<AudienceCountState>({ state: 'loading' });
  private readonly audienceRequest = computed(() => {
    const value = this.value();
    // Versiones a medio escribir no se mandan (el backend respondería 400).
    const safe: AnnouncementFormValue = {
      ...value,
      minVersion: isValidVersionInput(value.minVersion) ? value.minVersion : '',
      maxVersion: isValidVersionInput(value.maxVersion) ? value.maxVersion : '',
    };
    return JSON.stringify({ app: value.app, audience: formToAudience(safe) });
  });
  readonly audienceCountText = computed(() => {
    const count = this.audienceCount();
    if (count.state === 'loading') return 'Calculando a cuántos le llegaría…';
    if (count.state === 'error') return 'No se pudo calcular a cuántos le llegaría.';
    return audienceCountLabel(this.value().app, count.count);
  });
  readonly audienceCountNote = computed(() => {
    const value = this.value();
    if (value.app === 'notifier' && value.condition) {
      return 'Cuenta los celulares que hoy tienen ese problema, según su último latido.';
    }
    return value.app === 'yep'
      ? 'Aproximado: no tiene en cuenta el filtro de versión.'
      : 'Celulares activos del Notificador que cumplen el filtro.';
  });

  readonly searchBusinesses: IdPickerSearch = (query) =>
    this.support.listBusinesses(query, 1).pipe(
      map((response) =>
        response.items.map((business) => ({
          id: business.id,
          label: business.name || 'Negocio sin nombre',
          detail: [business.cityName, business.phone].filter(Boolean).join(' · ') || business.id,
        })),
      ),
    );

  readonly searchUsers: IdPickerSearch = (query) =>
    this.support.listUsers(query, 1).pipe(
      map((response) =>
        response.items.map((user) => ({
          id: user.id,
          label: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
          detail: user.email,
        })),
      ),
    );

  /** Evita que las sugerencias del botón pisen un valor cargado. */
  private patching = false;

  constructor() {
    toObservable(this.audienceRequest)
      .pipe(
        debounceTime(400),
        distinctUntilChanged(),
        tap(() => this.audienceCount.set({ state: 'loading' })),
        switchMap((json) => {
          const request = JSON.parse(json) as {
            app: AnnouncementApp;
            audience: ReturnType<typeof formToAudience>;
          };
          return this.api.audiencePreview(request.app, request.audience).pipe(
            map((response): AudienceCountState => {
              const count = request.app === 'notifier' ? response.notifiers : response.users;
              return typeof count === 'number' ? { state: 'ready', count } : { state: 'error' };
            }),
            catchError(() => of<AudienceCountState>({ state: 'error' })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.audienceCount.set(state));

    let previousType: AnnouncementActionType | '' = this.form.controls.actionType.value;
    this.form.controls.actionType.valueChanges.pipe(takeUntilDestroyed()).subscribe((type) => {
      const before = previousType;
      previousType = type;
      if (!this.patching) this.applyActionSuggestions(before, type);
    });
  }

  ngOnInit(): void {
    const params = this.route.snapshot.paramMap;
    const query = this.route.snapshot.queryParamMap;
    const id = params.get('id');
    const duplicateId = query.get('duplicar');

    if (id) {
      this.mode.set('edit');
      this.loadSource(id, (announcement) => {
        this.original.set(announcement);
        this.setFormValue(announcementToForm(announcement));
      });
    } else if (duplicateId) {
      this.loadSource(duplicateId, (announcement) => {
        this.duplicateOf.set(announcement);
        this.setFormValue(announcementToForm(announcement));
      });
    } else if (query.get('app') === 'yep') {
      this.setFormValue(emptyAnnouncementForm('yep'));
    }
  }

  private loadSource(id: string, apply: (announcement: Announcement) => void): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api
      .get(id)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: apply,
        error: (error) => this.loadError.set(httpErrorMessage(error)),
      });
  }

  private setFormValue(value: AnnouncementFormValue): void {
    this.patching = true;
    this.form.setValue(value);
    this.patching = false;
  }

  private applyActionSuggestions(
    before: AnnouncementActionType | '',
    type: AnnouncementActionType | '',
  ): void {
    const controls = this.form.controls;
    if (!type) {
      controls.dismissible.setValue(true);
      return;
    }
    const label = controls.actionLabel.value.trim();
    if (!label || (before && label === SUGGESTED_ACTION_LABELS[before])) {
      controls.actionLabel.setValue(SUGGESTED_ACTION_LABELS[type]);
    }
    if (type === 'update_app' && !controls.actionUrl.value.trim()) {
      controls.actionUrl.setValue(DEFAULT_STORE_URLS[`${controls.app.value}/android`] ?? '');
    }
  }

  setApp(app: string): void {
    if (this.appLocked()) return;
    const target: AnnouncementApp = app === 'yep' ? 'yep' : 'notifier';
    const { value, removed } = switchFormApp(this.form.getRawValue(), target);
    this.setFormValue(value);
    this.appNotice.set(
      removed.length
        ? `Quité ${joinList(removed)}: no aplica${removed.length > 1 ? 'n' : ''} ${appInSentence(target, 'a')}.`
        : '',
    );
  }

  setRepeat(repeat: string): void {
    this.form.controls.repeat.setValue(repeat === 'until_action' ? 'until_action' : 'once');
  }

  setDismissible(value: boolean): void {
    this.form.controls.dismissible.setValue(value);
    this.form.controls.dismissible.markAsTouched();
  }

  setNotify(value: boolean): void {
    this.form.controls.notify.setValue(value);
  }

  toggleRole(role: AnnouncementRole, checked: boolean): void {
    const current = this.form.controls.roles.value.filter((item) => item !== role);
    this.form.controls.roles.setValue(checked ? [...current, role] : current);
  }

  togglePlatform(platform: AnnouncementPlatform, checked: boolean): void {
    const current = this.form.controls.platforms.value.filter((item) => item !== platform);
    this.form.controls.platforms.setValue(checked ? [...current, platform] : current);
  }

  fieldError(field: AnnouncementFormField): string {
    const message = this.errors()[field];
    if (!message) return '';
    return this.submitted() || this.form.controls[field].touched ? message : '';
  }

  counter(field: 'title' | 'body' | 'actionLabel', max: number): string {
    return `${this.value()[field].trim().length}/${max}`;
  }

  back(): void {
    const original = this.original();
    void this.router.navigate(
      original ? ['/__ops/announcements', original.id] : ['/__ops/announcements'],
    );
  }

  /**
   * Guarda. `status` = `draft`/`published` cambia el estado; sin `status` lo conserva
   * (solo al editar). Publicar pide confirmación con la cuenta de destinatarios.
   */
  async save(status?: AnnouncementStatus): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.error.set('');
    this.serverErrors.set([]);
    if (!this.isValid()) {
      this.error.set('Revisa los campos marcados en rojo.');
      return;
    }
    const value = this.form.getRawValue();
    const original = this.original();

    if (status === 'published' && original?.status !== 'published') {
      const count = this.audienceCount();
      const confirmed = await this.notifications.confirm({
        title: `Publicar «${value.title.trim()}»`,
        message: [
          count.state === 'ready'
            ? `${audienceCountLabel(value.app, count.count)} ${appInSentence(value.app, 'de')}.`
            : `Va ${appInSentence(value.app, 'para')}.`,
          AnnouncementCommandsService.deliveryHint(value.app),
        ],
        type: 'question',
        confirmText: 'Publicar',
        cancelText: 'Cancelar',
      });
      if (!confirmed) return;
    }

    this.saving.set(status === 'published' ? 'published' : status === 'draft' ? 'draft' : 'save');
    const request = original
      ? this.api.update(original.id, formToPayload(value, { mode: 'update', status }))
      : this.api.create(formToPayload(value, { mode: 'create', status: status ?? 'draft' }));

    request
      .pipe(
        finalize(() => this.saving.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (saved) => {
          const id = saved.id || original?.id;
          const notice =
            status === 'published'
              ? 'Anuncio publicado.'
              : status === 'draft'
                ? 'Guardado como borrador.'
                : 'Cambios guardados.';
          void this.router.navigate(id ? ['/__ops/announcements', id] : ['/__ops/announcements'], {
            state: { notice },
          });
        },
        error: (error) => this.serverErrors.set(httpErrorMessages(error)),
      });
  }

  async archive(): Promise<void> {
    const original = this.original();
    if (!original) return;
    this.saving.set('archive');
    const result = await this.commands.changeStatus(original, 'archived');
    this.saving.set(null);
    if (result.kind === 'error') this.error.set(result.message);
    if (result.kind === 'updated') {
      void this.router.navigate(['/__ops/announcements', original.id], {
        state: { notice: result.message },
      });
    }
  }

  async remove(): Promise<void> {
    const original = this.original();
    if (!original) return;
    this.saving.set('delete');
    const result = await this.commands.remove(original);
    this.saving.set(null);
    if (result.kind === 'error') this.error.set(result.message);
    if (result.kind === 'updated') {
      void this.router.navigate(['/__ops/announcements', original.id], {
        state: { notice: result.message },
      });
    }
    if (result.kind === 'deleted') {
      void this.router.navigate(['/__ops/announcements'], { state: { notice: result.message } });
    }
  }
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}
