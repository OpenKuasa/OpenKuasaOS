import { Camera } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { getViewer } from '@/lib/auth/viewer';

export default async function ProfilePage() {
  const viewer = await getViewer();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground">Your personal details.</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile photo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <div className="group relative size-16 shrink-0">
              <Avatar className="size-16">
                <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                  {viewer.initials}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 hidden items-center justify-center rounded-full bg-black/40 text-white group-hover:flex">
                <Camera className="size-5" />
              </div>
            </div>
            <Button variant="outline" size="sm">
              Change photo
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              Remove
            </Button>
            <span className="text-sm text-muted-foreground">
              JPG or PNG, max 2MB
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Personal details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="full-name">Full name</Label>
              <Input id="full-name" defaultValue={viewer.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" defaultValue={viewer.email ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" defaultValue="+60 12-345 6789" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-title">Job title</Label>
              <Input id="job-title" defaultValue="Founder" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select defaultValue="kl">
                <SelectTrigger id="timezone" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kl">Asia/Kuala_Lumpur</SelectItem>
                  <SelectItem value="sg">Asia/Singapore</SelectItem>
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
              <Select defaultValue="en">
                <SelectTrigger id="language" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ms">Bahasa Melayu</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="product-updates" className="font-medium">
                Email me product updates
              </Label>
              <Switch id="product-updates" defaultChecked />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button>Save changes</Button>
        </div>
      </div>
    </div>
  );
}
