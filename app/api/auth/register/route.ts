import { NextResponse } from "next/server";
import { registerWithPassword } from "@/lib/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  name: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const user = await registerWithPassword({
      email: body.email,
      name: body.name ?? "",
      password: body.password,
    });
    return NextResponse.json({ user });
  } catch (error) {
    const message =
      error instanceof Error && /E11000|duplicate/.test(error.message)
        ? "This email is already registered"
        : error instanceof Error
          ? error.message
          : "Registration failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
