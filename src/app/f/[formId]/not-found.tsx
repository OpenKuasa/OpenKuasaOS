import { PublicFormNotice, PublicFormShell } from '@/components/reach/public-form-shell';

/** A link with no form behind it. Says so, and offers nothing of the app. */
export default function PublicFormNotFound() {
  return (
    <PublicFormShell>
      <PublicFormNotice title="Form not found">
        There is no form at this link. Check that you copied the whole link.
      </PublicFormNotice>
    </PublicFormShell>
  );
}
