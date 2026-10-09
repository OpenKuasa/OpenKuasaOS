import { redirect } from 'next/navigation';

// Workspace settings live under /account; keep the old URL working.
export default function SettingsPage() {
  redirect('/account');
}
