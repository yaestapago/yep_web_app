import { Component, input as defineInput, output } from '@angular/core';
import { LucideCircleCheck, LucideCircleX, LucideInfo, LucideTriangleAlert, LucideX } from '@lucide/angular';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

@Component({
  selector: 'yep-alert',
  imports: [LucideCircleCheck, LucideCircleX, LucideInfo, LucideTriangleAlert, LucideX],
  templateUrl: './alert.html',
  styleUrl: './alert.scss',
})
export class Alert {
  readonly variant = defineInput<AlertVariant>('info');
  readonly title = defineInput('');
  readonly dismissible = defineInput(false);
  readonly dismissed = output<void>();
}
