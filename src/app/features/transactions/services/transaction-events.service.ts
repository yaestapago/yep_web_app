import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TransactionEventsService {
  readonly revision = signal(0);

  notifyChanged(): void {
    this.revision.update((revision) => revision + 1);
  }
}
