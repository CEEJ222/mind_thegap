"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sparkles, Target, FileText, BarChart3 } from "lucide-react";

const features = [
  {
    icon: Target,
    title: "Gap Analysis",
    description:
      "AI compares your profile against each job description and identifies what's missing or underrepresented.",
  },
  {
    icon: Sparkles,
    title: "Tailored Generation",
    description:
      "Every resume is built from scratch for the specific role — structured, trimmed, and editorial-quality.",
  },
  {
    icon: FileText,
    title: "One Profile, Unlimited Resumes",
    description:
      "Upload your experience once. Generate a bespoke resume for every application in minutes.",
  },
  {
    icon: BarChart3,
    title: "Application Tracker",
    description:
      "Track every application, fit score, and interview outcome in one persistent record.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 md:px-12">
        <div className="text-xl font-semibold">
          Mind <span className="text-accent">the Gap</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/auth/login">
            <Button variant="ghost" size="sm">
              Log In
            </Button>
          </Link>
          <Link href="/auth/signup">
            <Button size="sm">Create Account</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
          Your resume should be as{" "}
          <span className="text-accent">unique</span> as the role
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          Mind the Gap analyzes job descriptions, finds what&apos;s missing from your
          profile, and generates tailored, editorial-quality resumes — every
          time.
        </p>
        <div className="mt-10">
          <Link href="/auth/signup">
            <Button size="lg" className="text-base px-8">
              Get Started Free
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-8 md:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border border-border bg-card p-6 shadow-sm"
            >
              <feature.icon className="mb-4 h-8 w-8 text-accent" />
              <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8 text-center text-sm text-muted-foreground">
        Mind the Gap &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
