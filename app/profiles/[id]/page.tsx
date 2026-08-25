"use client";

import { use } from "react";
import { ProfileEditor } from "@/components/ProfileEditor";

export default function EditProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ProfileEditor profileId={id} />;
}
