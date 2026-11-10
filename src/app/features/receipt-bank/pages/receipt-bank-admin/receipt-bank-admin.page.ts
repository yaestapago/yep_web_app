import { Component, DestroyRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucidePlus } from '@lucide/angular';
import { finalize } from 'rxjs';

import type {
  ReceiptIssuer,
  ReceiptMedium,
  ReceiptPromptKind,
  ReceiptTemplateKind,
  ReceiptTemplateSummary,
} from '../../../../shared/models/receipt-bank.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Card } from '../../../../shared/ui/card/card';
import { Input } from '../../../../shared/ui/input/input';
import { Menu } from '../../../../shared/ui/menu/menu';
import { MenuItem } from '../../../../shared/ui/menu/menu-item';
import { Modal } from '../../../../shared/ui/modal/modal';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Segmented } from '../../../../shared/ui/segmented/segmented';
import { Select } from '../../../../shared/ui/select/select';
import { State } from '../../../../shared/ui/state/state';
import { StatusChip } from '../../../../shared/ui/status-chip/status-chip';
import { Table } from '../../../../shared/ui/table/table';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { CandidatesTable } from '../../components/candidates-table/candidates-table';
import { CopilotPromptModal } from '../../components/copilot-prompt-modal/copilot-prompt-modal';
import { ExamplesList } from '../../components/examples-list/examples-list';
import { IssuerEditorModal, type IssuerDraft } from '../../components/issuer-editor-modal/issuer-editor-modal';
import { ReceiptExampleModal } from '../../components/receipt-example-modal/receipt-example-modal';
import { TemplateEditor } from '../../components/template-editor/template-editor';
import { ReceiptBankApiService } from '../../services/receipt-bank-api.service';
import {
  MEDIUM_OPTIONS,
  RECEIPT_CODE_PATTERN,
  TEMPLATE_KIND_LABELS,
  TEMPLATE_KIND_OPTIONS,
  templateStatusChips,
} from '../../utils/receipt-bank.util';

type ReceiptBankView = 'issuers' | 'examples' | 'candidates';

const VIEW_OPTIONS: { value: ReceiptBankView; label: string }[] = [
  { value: 'issuers', label: 'Bancos emisores' },
  { value: 'examples', label: 'Ejemplos' },
  { value: 'candidates', label: 'Comprobantes de clientes' },
];

/**
 * Banco de comprobantes (solo superadmin). Se organiza por banco emisor: el banco desde el que se
 * hizo la transferencia, porque cada uno tiene comprobantes distintos y cualquiera puede transferir
 * a la cuenta de un negocio. Nada entra solo: un admin escoge, llena y confirma cada ejemplo.
 */
@Component({
  selector: 'app-receipt-bank-admin-page',
  imports: [
    FormsModule,
    Alert,
    Button,
    CandidatesTable,
    Card,
    CopilotPromptModal,
    ExamplesList,
    Input,
    IssuerEditorModal,
    Menu,
    MenuItem,
    Modal,
    PageHeader,
    ReceiptExampleModal,
    Segmented,
    Select,
    State,
    StatusChip,
    Table,
    TemplateEditor,
    LucidePlus,
  ],
  templateUrl: './receipt-bank-admin.page.html',
  styleUrl: './receipt-bank-admin.page.scss',
})
export class ReceiptBankAdminPage implements OnInit {
  private readonly api = inject(ReceiptBankApiService);
  private readonly notifications = inject(NotificationModalService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly editor = viewChild(TemplateEditor);

  readonly viewOptions = VIEW_OPTIONS;
  readonly kindOptions = TEMPLATE_KIND_OPTIONS;
  readonly mediumOptions = MEDIUM_OPTIONS;

  readonly view = signal<ReceiptBankView>('issuers');
  readonly notice = signal('');

  // Emisores
  readonly issuers = signal<ReceiptIssuer[]>([]);
  readonly issuersLoading = signal(true);
  readonly issuersError = signal('');
  readonly selectedIssuerId = signal<string | null>(null);
  readonly selectedIssuer = computed(
    () => this.issuers().find((issuer) => issuer.id === this.selectedIssuerId()) ?? null,
  );
  readonly issuerDraft = signal<IssuerDraft | null>(null);
  readonly issuerActionId = signal<string | null>(null);
  readonly issuerError = signal('');

  // Plantillas
  readonly templates = signal<ReceiptTemplateSummary[]>([]);
  readonly templatesLoading = signal(false);
  readonly templatesError = signal('');
  readonly selectedTemplateId = signal<string | null>(null);

  // Crear plantilla
  readonly creatingTemplate = signal(false);
  readonly newCode = signal('');
  readonly newName = signal('');
  readonly newKind = signal<ReceiptTemplateKind>('same_bank_transfer');
  readonly newMedium = signal<ReceiptMedium>('app_screenshot');
  readonly newTemplateSaving = signal(false);
  readonly newTemplateError = signal('');
  readonly newCodeError = computed(() => {
    const code = this.newCode().trim();
    return code && !RECEIPT_CODE_PATTERN.test(code)
      ? 'Usa minúsculas, números, guion o guion bajo, sin espacios.'
      : '';
  });
  readonly canCreateTemplate = computed(
    () => Boolean(this.newCode().trim() && this.newName().trim()) && !this.newCodeError(),
  );

  // Ejemplo abierto
  readonly openExampleId = signal<string | null>(null);
  readonly examplesRefreshKey = signal(0);

  // Prompt
  readonly promptKind = signal<ReceiptPromptKind | null>(null);

  ngOnInit(): void {
    this.loadIssuers();
  }

  // --- Vistas -----------------------------------------------------------------

  async setView(value: string): Promise<void> {
    if (value === this.view()) return;
    if (!(await this.canLeaveEditor())) return;
    this.view.set(value as ReceiptBankView);
    this.notice.set('');
  }

  private async canLeaveEditor(): Promise<boolean> {
    return (await this.editor()?.canLeave()) ?? true;
  }

  // --- Emisores ---------------------------------------------------------------

  loadIssuers(): void {
    this.issuersLoading.set(true);
    this.issuersError.set('');
    this.api
      .listIssuers()
      .pipe(
        finalize(() => this.issuersLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ issuers }) => {
          this.issuers.set(issuers);
          const selected = this.selectedIssuerId();
          if (selected && !issuers.some((issuer) => issuer.id === selected)) {
            this.selectedIssuerId.set(null);
            this.selectedTemplateId.set(null);
          }
        },
        error: (error) => this.issuersError.set(httpErrorMessage(error)),
      });
  }

  async selectIssuer(issuer: ReceiptIssuer): Promise<void> {
    if (issuer.id === this.selectedIssuerId() && !this.selectedTemplateId()) return;
    if (!(await this.canLeaveEditor())) return;
    if (issuer.id !== this.selectedIssuerId()) this.templates.set([]);
    this.selectedIssuerId.set(issuer.id);
    this.selectedTemplateId.set(null);
    this.issuerError.set('');
    this.loadTemplates(issuer.id);
  }

  issuerSummary(issuer: ReceiptIssuer): string {
    const templates = Object.values(issuer.templateCounts ?? {}).reduce((sum, n) => sum + n, 0);
    const examples = Object.values(issuer.exampleCounts ?? {}).reduce((sum, n) => sum + n, 0);
    return `${templates} ${templates === 1 ? 'tipo' : 'tipos'} · ${examples} ${examples === 1 ? 'ejemplo' : 'ejemplos'}`;
  }

  openNewIssuer(): void {
    this.issuerDraft.set({ issuer: null });
  }

  editIssuer(issuer: ReceiptIssuer): void {
    this.issuerDraft.set({ issuer });
  }

  onIssuerSaved(issuer: ReceiptIssuer): void {
    const isNew = !this.issuerDraft()?.issuer;
    this.issuerDraft.set(null);
    this.upsertIssuer(issuer);
    this.notice.set(isNew ? `Agregamos ${issuer.name} como banco emisor.` : `Guardamos ${issuer.name}.`);
    if (isNew) void this.selectIssuer(issuer);
  }

  private upsertIssuer(issuer: ReceiptIssuer): void {
    this.issuers.update((current) =>
      current.some((item) => item.id === issuer.id)
        ? current.map((item) => (item.id === issuer.id ? issuer : item))
        : [...current, issuer],
    );
  }

  /** Desactivar no borra nada. Un emisor inactivo no recibe plantillas nuevas. */
  setIssuerActive(issuer: ReceiptIssuer, active: boolean): void {
    if (this.issuerActionId()) return;
    this.issuerActionId.set(issuer.id);
    this.issuerError.set('');
    const request$ = active
      ? this.api.updateIssuer(issuer.id, { isActive: true })
      : this.api.deactivateIssuer(issuer.id);
    request$
      .pipe(
        finalize(() => this.issuerActionId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ issuer: updated }) => {
          this.upsertIssuer(updated);
          this.notice.set(active ? `${updated.name} quedó activo.` : `${updated.name} quedó inactivo.`);
        },
        error: (error) => this.issuerError.set(httpErrorMessage(error)),
      });
  }

  // --- Plantillas -------------------------------------------------------------

  private loadTemplates(issuerId: string): void {
    this.templatesLoading.set(true);
    this.templatesError.set('');
    this.api
      .listTemplates(issuerId)
      .pipe(
        finalize(() => this.templatesLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ templates }) => {
          if (this.selectedIssuerId() === issuerId) this.templates.set(templates);
        },
        error: (error) => this.templatesError.set(httpErrorMessage(error)),
      });
  }

  reloadTemplates(): void {
    const issuerId = this.selectedIssuerId();
    if (issuerId) this.loadTemplates(issuerId);
  }

  kindLabel(kind: ReceiptTemplateKind): string {
    return TEMPLATE_KIND_LABELS[kind] ?? kind;
  }

  chips(template: ReceiptTemplateSummary) {
    return templateStatusChips(template.status, template.hasUnapprovedChanges);
  }

  openNewTemplate(): void {
    this.newCode.set('');
    this.newName.set('');
    this.newKind.set('same_bank_transfer');
    this.newMedium.set('app_screenshot');
    this.newTemplateError.set('');
    this.creatingTemplate.set(true);
  }

  createTemplate(): void {
    const issuerId = this.selectedIssuerId();
    if (!issuerId || this.newTemplateSaving() || !this.canCreateTemplate()) return;
    this.newTemplateSaving.set(true);
    this.newTemplateError.set('');
    this.api
      .createTemplate(issuerId, {
        code: this.newCode().trim(),
        name: this.newName().trim(),
        kind: this.newKind(),
        medium: this.newMedium(),
      })
      .pipe(
        finalize(() => this.newTemplateSaving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ template }) => {
          this.creatingTemplate.set(false);
          this.loadTemplates(issuerId);
          this.loadIssuers();
          this.selectedTemplateId.set(template.id);
        },
        error: (error) => this.newTemplateError.set(httpErrorMessage(error)),
      });
  }

  onTemplateChanged(): void {
    this.reloadTemplates();
    this.loadIssuers();
  }

  onTemplateDeleted(): void {
    this.selectedTemplateId.set(null);
    this.notice.set('Eliminamos la plantilla.');
    this.onTemplateChanged();
  }

  // --- Ejemplos ---------------------------------------------------------------

  onExampleChanged(): void {
    this.examplesRefreshKey.update((key) => key + 1);
    this.loadIssuers();
    this.reloadTemplates();
  }

  onExampleChosen(event: { exampleId: string; alreadySelected: boolean }): void {
    this.notice.set(
      event.alreadySelected
        ? 'Este comprobante ya estaba escogido: abrimos el mismo borrador.'
        : 'Creamos un borrador. Llena sus datos y confírmalo: nada entra solo al banco.',
    );
    this.openExampleId.set(event.exampleId);
    this.examplesRefreshKey.update((key) => key + 1);
  }

  onPromptSaved(message: string): void {
    this.notice.set(message);
  }
}
