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

/** The writes the Deals page offers. Absent for people who can only read. */
export type CrmDealActions = {
  /** Creates a deal, or updates one when the form carries `dealId`. */
  save: CrmFormAction;
  /** Takes `dealId` and `stageId`. */
  move: CrmFormAction;
  /** Takes `dealId` and an optional `lostReason`. */
  markLost: CrmFormAction;
  reopen: CrmFormAction;
  remove: CrmFormAction;
};
