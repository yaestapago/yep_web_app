import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import type {
  ReceiptExample,
  ReceiptExampleStatus,
  ReceiptExampleSummary,
  ReceiptExamplesQuery,
  ReceiptIssuer,
  ReceiptSourceType,
  ReceiptTestResult,
} from '../../../../shared/models/receipt-bank.models';
import { Button } from '../../../../shared/ui/button/button';
import { FileDrop } from '../../../../shared/ui/file-drop/file-drop';
import { Select, type SelectOption } from '../../../../shared/ui/select/select';
import { State } from '../../../../shared/ui/state/state';
import { StatusChip } from '../../../../shared/ui/status-chip/status-chip';
import { Table } from '../../../../shared/ui/table/table';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { ReceiptBankApiService } from '../../services/receipt-bank-api.service';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];

const STATUS_OPTIONS: SelectOption[] = [
  { id: 'draft', label: 'Borrador' },
  { id: 'confirmed', label: 'Confirmado' },
];

const SOURCE_OPTIONS: SelectOption[] = [
  { id: 'superadmin_upload', label: 'Subido por un admin' },
  { id: 'client_support', label: 'De un cliente' },
];

/**
 * Ejemplos del banco: lista con paginación por cursor y subida de comprobantes. Dentro de una
 * plantilla queda fijo a ella, sin filtros. Lo que se sube entra como borrador: un admin llena sus
 * datos y lo confirma.
 */
@Component({
  selector: 'app-examples-list',
  imports: [DatePipe, FormsModule, Button, FileDrop, Select, State, StatusChip, Table],
  templateUrl: './examples-list.html',
  styleUrl: './examples-list.scss',
})
export class ExamplesList {
  private readonly api = inject(ReceiptBankApiService);
  private readonly destroyRef = inject(DestroyRef);

  /** Fija la lista a un emisor o una plantilla, y a lo que se suba desde aquí. */
  readonly issuerId = input<string | null>(null);
  readonly templateId = input<string | null>(null);
  /** Emisores para el filtro. Sin ellos no hay filtro de emisor. */
  readonly issuers = input<readonly ReceiptIssuer[]>([]);
  /** Última prueba de la plantilla: agrega ✅/❌ a cada fila. */
  readonly testResult = input<ReceiptTestResult | null>(null);
  /** Sube este número para volver a cargar (se guardó o se borró un ejemplo). */
  readonly refreshKey = input(0);

  readonly openExample = output<string>();
  /** Se subió un comprobante. El padre abre el borrador y sube `refreshKey`. */
  readonly uploaded = output<ReceiptExample>();

  readonly examples = signal<ReceiptExampleSummary[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal('');
  readonly uploading = signal(false);
  readonly uploadError = signal('');

  readonly filterIssuer = signal('');
  readonly filterStatus = signal('');
  readonly filterSource = signal('');

  readonly statusOptions = STATUS_OPTIONS;
  readonly sourceOptions = SOURCE_OPTIONS;
  readonly showFilters = computed(() => !this.templateId());
  readonly issuerOptions = computed<SelectOption[]>(() =>
    this.issuers().map((issuer) => ({ id: issuer.id, label: issuer.name })),
  );

  constructor() {
    effect(() => {
      this.refreshKey();
      this.templateId();
      this.issuerId();
      untracked(() => this.load());
    });
  }

  private query(cursor?: string): ReceiptExamplesQuery {
    return {
      issuerId: this.issuerId() ?? (this.filterIssuer() || undefined),
      templateId: this.templateId() ?? undefined,
      status: (this.filterStatus() || undefined) as ReceiptExampleStatus | undefined,
      sourceType: (this.filterSource() || undefined) as ReceiptSourceType | undefined,
      cursor,
    };
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .listExamples(this.query())
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => {
          this.examples.set(page.examples);
          this.nextCursor.set(page.nextCursor);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.error.set('');
    this.api
      .listExamples(this.query(cursor))
      .pipe(
        finalize(() => this.loadingMore.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => {
          this.examples.update((current) => [...current, ...page.examples]);
          this.nextCursor.set(page.nextCursor);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  setFilter(which: 'issuer' | 'status' | 'source', value: string | null): void {
    const signals = {
      issuer: this.filterIssuer,
      status: this.filterStatus,
      source: this.filterSource,
    };
    signals[which].set(value ?? '');
    this.load();
  }

  onFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    target.value = '';
    if (!file || this.uploading()) return;
    this.uploadError.set('');
    // Algunos sistemas no informan el tipo: en ese caso decide el backend, que lo lee de los bytes.
    if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
      this.uploadError.set('Sube una imagen PNG o JPG, o un PDF de una página.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.uploadError.set('El archivo pesa más de 10 MB.');
      return;
    }
    this.uploading.set(true);
    this.api
      .uploadExample(file, {
        issuerId: this.issuerId() ?? undefined,
        templateId: this.templateId() ?? undefined,
      })
      .pipe(
        finalize(() => this.uploading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ example }) => this.uploaded.emit(example),
        error: (error) => this.uploadError.set(httpErrorMessage(error)),
      });
  }

  testOutcome(exampleId: string): boolean | null {
    const result = this.testResult()?.results.find((item) => item.exampleId === exampleId);
    return result ? result.ok : null;
  }
}
