/** What a Kasturi form action hands back to the form that called it. */
export type CrmFormState =
  | { ok: true; message?: string }
  | { ok: false; error: string; values: Record<string, string> }
  | undefined;

export type CrmFormAction = (
  prev: CrmFormState,
  formData: FormData,
) => Promise<CrmFormState>;

/** The writes the Contacts page offers. Absent for people who can only read. */
export type CrmContactActions = {
  /** Creates a contact, or updates one when the form carries `contactId`. */
  save: CrmFormAction;
  remove: CrmFormAction;
  addFollowUp: CrmFormAction;
  completeFollowUp: CrmFormAction;
  /** Takes `payload`: JSON of `{ table, mapping }` from the import card. */
  importContacts: CrmFormAction;
};
