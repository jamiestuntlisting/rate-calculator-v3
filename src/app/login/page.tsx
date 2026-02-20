"use client";

import { useState } from "react";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AlertCircle, Loader2, ExternalLink } from "lucide-react";

export default function LoginPage() {
  const { login, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [userTier, setUserTier] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setUpgradeRequired(false);
    setSubmitting(true);

    const result = await login(email, password);

    if (!result.success) {
      if (result.upgradeRequired) {
        setUpgradeRequired(true);
        setUserTier(result.tier || "free");
      } else {
        setError(result.error || "Login failed");
      }
    }

    setSubmitting(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="h-8 w-8 animate-spin text-stunt-red" />
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <Card className="w-full max-w-md bg-[#1a1a1a] border-border/50">
        <CardHeader className="text-center pb-2">
          <div className="flex items-center justify-center gap-1 mb-2">
            <span className="text-white uppercase font-bold text-2xl tracking-tight">
              Stunt
            </span>
            <span className="text-stunt-red uppercase font-bold text-2xl tracking-tight">
              Listing
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Bookkeeper
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Upgrade Required State */}
          {upgradeRequired ? (
            <div className="space-y-4">
              <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="space-y-2">
                    <p className="text-amber-200 font-medium">
                      Plus Membership Required
                    </p>
                    <p className="text-amber-200/80 text-sm">
                      StuntListing Bookkeeper is exclusively available to
                      members with an active{" "}
                      <span className="font-semibold text-amber-100">Plus</span>{" "}
                      membership. Your current membership is{" "}
                      <span className="font-semibold capitalize text-amber-100">
                        {userTier}
                      </span>
                      .
                    </p>
                  </div>
                </div>
              </div>

              <a
                href="https://www.stuntlisting.com/membership_plans"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full"
              >
                <Button className="w-full bg-stunt-red hover:bg-stunt-red/90 text-white">
                  Upgrade to Plus on StuntListing
                  <ExternalLink className="h-4 w-4 ml-2" />
                </Button>
              </a>

              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => {
                  setUpgradeRequired(false);
                  setEmail("");
                  setPassword("");
                }}
              >
                Sign in with a different account
              </Button>
            </div>
          ) : (
            /* Login Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-muted-foreground text-sm text-center">
                Sign in with your StuntListing account
              </p>

              {error && (
                <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm text-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="bg-[#111] border-border/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm text-foreground">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Your StuntListing password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="bg-[#111] border-border/50"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-stunt-red hover:bg-stunt-red/90 text-white"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center mt-4">
                Requires an active{" "}
                <a
                  href="https://www.stuntlisting.com/membership_plans"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-stunt-red hover:underline"
                >
                  Plus membership
                </a>{" "}
                on StuntListing.com
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
