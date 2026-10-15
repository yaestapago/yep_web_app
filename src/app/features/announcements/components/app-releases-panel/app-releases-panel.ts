import {
  Component,
  DestroyRef,
  OnInit,
  WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideRefreshCw } from '@lucide/angular';
import { finalize } from 'rxjs';

import {
  Alert,
  Button,
  Card,
  Input,
  State,
  StatusChip,
  type StatusChipTone,
  Table,
} from '../../../../shared/ui';
import { Toggle } from '../../../../shared/ui/toggle/toggle';
import { formatDateTime } from '../../../../shared/utils/billing-format';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { httpErrorMessages } from '../../utils/http-error-messages';
import {
  APP_RELEASE_SLOTS,
  type AppRelease,
  type AppReleaseSlot,
  type NotifierVersionCount,
  releaseSlotKey,
} from '../../models/announcement.models';
import { AdminAnnouncementsApiService } from '../../services/admin-announcements-api.service';
import { formatCount } from '../../utils/announcement-labels';
import {
  type AppReleaseFormErrors,
  type AppReleaseFormValue,
  defaultUpdateCopy,
  notifierVersionRows,
  releaseFormToPayload,
  releaseSlotTitle,
  releaseToForm,
  storeName,
  summarizeNotifierVersions,
  validateReleaseForm,
} from '../../utils/app-release-form';

export interface ReleaseCard {
  slot: AppReleaseSlot;
  key: string;
  title: string;
  store: string;
  release: WritableSignal<AppRelease | null>;
  value: WritableSignal<AppReleaseFormValue>;
  submitted: WritableSignal<boolean>;
  saving: WritableSignal<boolean>;
  error: WritableSignal<string[]>;
  success: WritableSignal<string>;
}

/**
 * «Versiones de las apps»: la política de versión por (app, plataforma) y las versiones
 * del Notificador en uso. El backend sintetiza el aviso de actualizar con esto.
 */
@Component({
  selector: 'app-app-releases-panel',
  imports: [
    FormsModule,
    Alert,
    Button,
    Card,
    Input,
    State,
    StatusChip,
    Table,
    Toggle,
    LucideRefreshCw,
  ],
  templateUrl: './app-releases-panel.html',
  styleUrl: './app-releases-panel.scss',
})
export class AppReleasesPanel implements OnInit {
  private readonly api = inject(AdminAnnouncementsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly versions = signal<NotifierVersionCount[]>([]);
  readonly cards: ReleaseCard[] = APP_RELEASE_SLOTS.map((slot) => ({
    slot,
    key: releaseSlotKey(slot),
    title: releaseSlotTitle(slot),
    store: storeName(slot),
    release: signal<AppRelease | null>(null),
    value: signal(releaseToForm(slot, null)),
    submitted: signal(false),
    saving: signal(false),
    error: signal<string[]>([]),
    success: signal(''),
  }));

  private readonly notifierCard = this.cards.find((card) => card.slot.app === 'notifier')!;

  /** Marca cada versión con la última/mínima del formulario del Notificador (aunque no se haya guardado). */
  readonly versionRows = computed(() => {
    const value = this.notifierCard.value();
    return notifierVersionRows(this.versions(), value.latestVersion, value.minSupportedVersion);
  });
  readonly versionSummary = computed(() => summarizeNotifierVersions(this.versionRows()));
  readonly notifierPolicyOff = computed(() => !this.notifierCard.value().enabled);
  readonly formatCount = formatCount;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .listReleases()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          for (const card of this.cards) {
            const release =
              response.releases.find(
                (item) => item.app === card.slot.app && item.platform === card.slot.platform,
              ) ?? null;
            card.release.set(release);
            card.value.set(releaseToForm(card.slot, release));
            card.submitted.set(false);
            card.error.set([]);
          }
          this.versions.set(response.notifierVersions);
          this.loaded.set(true);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  patch<K extends keyof AppReleaseFormValue>(
    card: ReleaseCard,
    field: K,
    value: AppReleaseFormValue[K],
  ): void {
    card.value.update((current) => ({ ...current, [field]: value }));
    card.success.set('');
  }

  onBody(card: ReleaseCard, event: Event): void {
    this.patch(card, 'body', (event.target as HTMLTextAreaElement).value);
  }

  errors(card: ReleaseCard): AppReleaseFormErrors {
    return validateReleaseForm(card.value());
  }

  fieldError(card: ReleaseCard, field: keyof AppReleaseFormValue): string {
    return card.submitted() ? (this.errors(card)[field] ?? '') : '';
  }

  statusChip(card: ReleaseCard): { label: string; tone: StatusChipTone } {
    const release = card.release();
    if (!release) return { label: 'Sin configurar', tone: 'neutral' };
    return release.enabled
      ? { label: 'Activa', tone: 'success' }
      : { label: 'Apagada', tone: 'neutral' };
  }

  updatedLabel(card: ReleaseCard): string {
    const at = card.release()?.updatedAt;
    return at ? `Guardado el ${formatDateTime(at)}` : 'Aún no hay política guardada.';
  }

  copyHint(card: ReleaseCard): string {
    const value = card.value();
    const optional = defaultUpdateCopy(card.slot.app, value.latestVersion, false);
    const mandatory = defaultUpdateCopy(card.slot.app, value.latestVersion, true);
    return `Vacío = «${optional.title}» (o «${mandatory.title}» si es obligatoria).`;
  }

  bodyPlaceholder(card: ReleaseCard): string {
    return defaultUpdateCopy(card.slot.app, card.value().latestVersion, false).body;
  }

  titlePlaceholder(card: ReleaseCard): string {
    return defaultUpdateCopy(card.slot.app, card.value().latestVersion, false).title;
  }

  save(card: ReleaseCard): void {
    card.submitted.set(true);
    card.success.set('');
    card.error.set([]);
    if (Object.keys(this.errors(card)).length > 0) return;
    card.saving.set(true);
    this.api
      .saveRelease(card.slot.app, card.slot.platform, releaseFormToPayload(card.value()))
      .pipe(
        finalize(() => card.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (release) => {
          const previous = card.release();
          const sameVersion = previous?.latestVersion === release.latestVersion;
          const saved: AppRelease = {
            ...release,
            app: card.slot.app,
            platform: card.slot.platform,
            updatedAt: release.updatedAt ?? new Date().toISOString(),
            // Si el PUT no trae recibos, se conservan los del mismo aviso (misma versión).
            stats: release.stats ?? (sameVersion ? (previous?.stats ?? null) : null),
          };
          card.release.set(saved);
          card.value.set(releaseToForm(card.slot, saved));
          card.submitted.set(false);
          card.success.set(
            'Guardado. Los celulares lo ven en su próxima consulta (hasta 1 minuto de caché).',
          );
        },
        error: (error) => card.error.set(httpErrorMessages(error)),
      });
  }
}
