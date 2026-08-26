"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Mail, MessageSquare } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";

/** What is coming next, newest thinking first. */
const UPCOMING_FEATURES = [
  {
    title: "Email us an Exhibit G",
    detail:
      "Forward the photo to an address and it lands in your uploads, ready to transcribe.",
    status: "Planned",
    icon: Mail,
  },
  {
    title: "Text us an Exhibit G",
    detail:
      "Send the photo by text from set and it is stored against your account.",
    status: "Planned",
    icon: MessageSquare,
  },
];

export default function UpcomingFeaturesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  if (authLoading) return null;

  if (!user || !isAdminEmail(user.email)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => router.push("/admin")}
          className="text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          ← Admin
        </button>
        <h1 className="text-2xl font-bold">Upcoming features</h1>
        <p className="text-sm text-muted-foreground mt-1">
          What is planned next for the Bookkeeper.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Planned</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {UPCOMING_FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="flex items-start gap-3 p-3 rounded border border-border/50"
            >
              <feature.icon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{feature.title}</div>
                <div className="text-xs text-muted-foreground">
                  {feature.detail}
                </div>
              </div>
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground border border-border/60 rounded px-2 py-0.5 shrink-0">
                {feature.status}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
