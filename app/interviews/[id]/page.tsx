"use client";

import { use } from "react";
import { InterviewView } from "@/components/InterviewView";

export default function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <InterviewView digestId={id} />;
}
