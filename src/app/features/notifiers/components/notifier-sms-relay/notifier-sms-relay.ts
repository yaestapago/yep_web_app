import {
  Component,
  DestroyRef,
  computed,
  inject,
  input as defineInput,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideMessageSquareText } from '@lucide/angular';
import { finalize } from 'rxjs';

import {
  SMS_RELAY_CONSENT_VERSION,
  type Notifier,
  type NotifierSmsRelayStatus,
} from '../../../../shared/models/notifier.models';
import { Button } from '../../../../shared/ui/button/button';
import { Checkbox } from '../../../../shared/ui/checkbox/checkbox';
import { Modal } from '../../../../shared/ui/modal/modal';
import { Toggle } from '../../../../shared/ui/toggle/toggle';
import { formatDateTime } from '../../../../shared/utils/billing-format';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { NotifiersApiService } from '../../services/notifiers-api.service';

/** Texto del consentimiento (versión `SMS_RELAY_CONSENT_VERSION`). */
export const SMS_RELAY_CONSENT_TEXT =
  'Si este celular se queda sin internet, cada pago se enviará por SMS desde su línea a YEP. Normalmente son 2 SMS por pago y se cobran según tu plan.';
export const SMS_RELAY_CONSENT_CHECKBOX = 'Autorizo el uso del saldo de esta línea';

type RelayTone = 'active' | 'unavailable' | 'disabled';

interface RelayCopy {
  tone: RelayTone;
  label: string;
  hint: string;
}

/** Estado legible del respaldo para la tarjeta del notificador. */
export function smsRelayCopy(
  relay: NotifierSmsRelayStatus | null | undefined,
  paired: boolean,
): RelayCopy {
  if (!relay?.optedIn) {
    return {
      tone: 'disabled',
      label: 'Desactivado',
      hint: 'Sin internet, los pagos llegan cuando el celular vuelva a conectarse.',
    };
  }
  if (relay.status === 'unavailable' || !relay.globallyAvailable) {
    return {
      tone: 'unavailable',
      label: 'No disponible todavía',
      hint: 'Ya lo autorizaste. Lo activaremos pronto; mientras tanto no se envía ningún SMS.',
    };
  }
  return {
    tone: 'active',
    label: 'Activo',
    hint: paired
      ? 'El celular debe tener concedido el permiso de SMS en la app de YEP.'
      : 'Se aplicará al emparejar el celular. Concede el permiso de SMS en la app de YEP.',
  };
}

/**
 * "Respaldo por SMS cuando no hay internet" en la tarjeta de un notificador de
 * celular: estado y, para el dueño, el interruptor. Activarlo pide un
 * consentimiento explícito (los SMS salen del saldo de la línea del negocio) y
 * envía la versión del texto aceptado. No renderiza nada para correo/escritorio.
 */
@Component({
  selector: 'app-notifier-sms-relay',
  imports: [Button, Checkbox, Modal, Toggle, LucideMessageSquareText],
  templateUrl: './notifier-sms-relay.html',
  styleUrl: './notifier-sms-relay.scss',
})
export class NotifierSmsRelay {
  private readonly api = inject(NotifiersApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly notifier = defineInput.required<Notifier>();
  /** Solo el dueño puede activarlo o desactivarlo. */
  readonly canManage = defineInput(false);
  /** El backend devolvió el notificador actualizado. */
  readonly updated = output<Notifier>();

  readonly consentText = SMS_RELAY_CONSENT_TEXT;
  readonly consentCheckbox = SMS_RELAY_CONSENT_CHECKBOX;

  /** Mientras YEP no ofrezca el respaldo (sin receptores) no se muestra, para
   * no pedir un consentimiento de cobro de SMS que no se va a usar; si el dueño
   * ya lo había autorizado, se sigue mostrando para que pueda desactivarlo. */
  readonly visible = computed(() => {
    const notifier = this.notifier();
    const relay = notifier.smsRelay;
    return (
      notifier.type === 'phone_app' &&
      (relay?.globallyAvailable === true || relay?.optedIn === true)
    );
  });
  readonly optedIn = computed(() => this.notifier().smsRelay?.optedIn === true);
  readonly copy = computed(() =>
    smsRelayCopy(this.notifier().smsRelay, Boolean(this.notifier().pairedDevice)),
  );
  readonly consentAtLabel = computed(() => {
    const at = this.notifier().smsRelay?.consentAt;
    return at ? formatDateTime(at) : '';
  });

  readonly consentOpen = signal(false);
  readonly consentChecked = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  onToggle(next: boolean): void {
    this.error.set('');
    if (next) {
      this.consentChecked.set(false);
      this.consentOpen.set(true);
      return;
    }
    this.save(false);
  }

  closeConsent(): void {
    if (this.saving()) return;
    this.consentOpen.set(false);
  }

  confirmConsent(): void {
    if (!this.consentChecked()) return;
    this.save(true);
  }

  private save(enabled: boolean): void {
    this.saving.set(true);
    this.api
      .setSmsRelay(
        this.notifier().id,
        enabled ? { enabled: true, consentVersion: SMS_RELAY_CONSENT_VERSION } : { enabled: false },
      )
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.consentOpen.set(false);
          this.updated.emit(response.notifier);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }
}
