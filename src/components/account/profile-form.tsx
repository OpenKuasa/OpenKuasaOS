'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { LANGUAGES, TIMEZONES } from '@/config/account';
import { updateProfileAction } from '@/app/account/actions';
import type { Profile } from '@/lib/account/data';
import { ReadOnlyNotice, SaveBar, useSettingsForm } from './settings-form';

export function ProfileForm({
  profile,
  initials,
  readOnly,
}: {
  profile: Profile;
  initials: string;
  readOnly: boolean;
}) {
  const { state, onSubmit, pending } = useSettingsForm(updateProfileAction);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {readOnly ? (
        <ReadOnlyNotice>
          You&apos;re exploring the demo workspace, so this profile is
          read-only.
        </ReadOnlyNotice>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Profile photo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground">
            Your initials are shown for now. Photo uploads aren&apos;t
            available yet.
          </span>
        </CardContent>
      </Card>

      <fieldset disabled={readOnly} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Personal details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="full-name">Full name</Label>
              <Input
                id="full-name"
                name="fullName"
                defaultValue={profile.fullName}
                autoComplete="name"
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={profile.email ?? ''}
                readOnly
                disabled
              />
              <p className="text-xs text-muted-foreground">
                Your sign-in email can&apos;t be changed here yet.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={profile.phone}
                placeholder="+60 12-345 6789"
                autoComplete="tel"
                maxLength={40}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-title">Job title</Label>
              <Input
                id="job-title"
                name="jobTitle"
                defaultValue={profile.jobTitle}
                autoComplete="organization-title"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                name="timezone"
                defaultValue={profile.timezone}
                disabled={readOnly}
              >
                <SelectTrigger id="timezone" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select
                name="language"
                defaultValue={profile.language}
                disabled={readOnly}
              >
                <SelectTrigger id="language" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Saved for when the interface is translated; the app is in
                English for now.
              </p>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="product-updates" className="font-medium">
                Email me product updates
              </Label>
              <Switch
                id="product-updates"
                name="productUpdates"
                defaultChecked={profile.productUpdates}
                disabled={readOnly}
              />
            </div>
          </CardContent>
        </Card>
      </fieldset>

      <SaveBar state={state} pending={pending} disabled={readOnly} />
    </form>
  );
}
