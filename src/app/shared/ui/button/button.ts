import { Component, input as defineInput, output } from '@angular/core';

type ButtonType = 'button' | 'submit' | 'reset';
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'yep-button',
  host: {
    '[class.yep-button-host--full]': 'fullWidth()',
  },
  templateUrl: './button.html',
  styleUrl: './button.scss',
})
export class Button {
  readonly type = defineInput<ButtonType>('button');
  readonly variant = defineInput<ButtonVariant>('primary');
  readonly size = defineInput<ButtonSize>('md');
  readonly disabled = defineInput(false);
  readonly loading = defineInput(false);
  readonly fullWidth = defineInput(false);
  readonly clicked = output<MouseEvent>();

  onClick(event: MouseEvent): void {
    if (this.disabled() || this.loading()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.clicked.emit(event);
  }
}
