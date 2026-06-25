/** Catálogo de bancos expuesto por el backend para el selector de cuentas. */
export interface BankPickerEntry {
  code: string;
  name: string;
  phone: { enabled: boolean };
  email: { enabled: boolean };
}

export interface BanksResponse {
  banks: BankPickerEntry[];
}
