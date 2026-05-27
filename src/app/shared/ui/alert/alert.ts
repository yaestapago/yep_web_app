import { Component, input as defineInput, output } from '@angular/core';
import { LucideX } from '@lucide/angular';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

@Component({
  selector: 'yep-alert',
  imports: [LucideX],
  templateUrl: './alert.html',
  styleUrl: './alert.scss',
})
export class Alert {
  readonly variant = defineInput<AlertVariant>('info');
  readonly title = defineInput('');
  readonly dismissible = defineInput(false);
  readonly dismissed = output<void>();
}
