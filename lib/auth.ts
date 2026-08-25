import { randomBytes } from "node:crypto";
import { ObjectId, type Collection } from "mongodb";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "./db";
import { hashPassword, verifyPassword } from "./password";

export const SESSION_COOKIE = "jojo_session";
export const OAUTH_COOKIE = "jojo_oauth";
const SESSION_DAYS = 30;

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  image?: string;
  googleLinked: boolean;
  hasPassword: boolean;
};

type UserDoc = {
  _id?: ObjectId;
  email: string;
  name: string;
  image?: string;
  passwordHash?: string;
  googleId?: string;
  createdAt: Date;
  updatedAt: Date;
};

type SessionDoc = {
  _id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
};

async function users(): Promise<Collection<UserDoc>> {
  return (await getDb()).collection<UserDoc>("users");
}

async function sessions(): Promise<Collection<SessionDoc>> {
  return (await getDb()).collection<SessionDoc>("sessions");
}

export async function ensureAuthIndexes() {
  await Promise.all([
    (await users()).createIndex({ email: 1 }, { unique: true }),
    (await users()).createIndex({ googleId: 1 }, { unique: true, sparse: true }),
    (await sessions()).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

function toPublic(doc: UserDoc): PublicUser {
  if (!doc._id) throw new Error("User record is missing id");
  return {
    id: doc._id.toHexString(),
    email: doc.email,
    name: doc.name,
    image: doc.image,
    googleLinked: Boolean(doc.googleId),
    hasPassword: Boolean(doc.passwordHash),
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function googleEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function appOrigin(request?: Request) {
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/+$/, "");
  if (request) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") ?? "http";
    if (host) return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}

export async function countUsers() {
  await ensureAuthIndexes();
  return (await users()).countDocuments();
}

export async function claimOrphanData(userId: string) {
  const db = await getDb();
  const filter = { $or: [{ userId: { $exists: false } }, { userId: null }] };
  await Promise.all([
    db.collection("profiles").updateMany(filter, { $set: { userId } }),
    db.collection("job_descriptions").updateMany(filter, { $set: { userId } }),
    db.collection("llm_providers").updateMany(filter, { $set: { userId } }),
    db.collection("llm_models").updateMany(filter, { $set: { userId } }),
    db.collection("crafted_resumes").updateMany(filter, { $set: { userId } }),
    db.collection("work_jobs").updateMany(filter, { $set: { userId } }),
  ]);
}

async function afterCreateUser(user: PublicUser) {
  if ((await countUsers()) <= 1) {
    await claimOrphanData(user.id);
  }
}

type CookieOptions = {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  expires?: Date;
  maxAge?: number;
};

async function applyCookie(name: string, value: string, options: CookieOptions, response?: NextResponse) {
  if (response) {
    response.cookies.set(name, value, options);
    return;
  }
  (await cookies()).set(name, value, options);
}

async function writeSession(userId: string, response?: NextResponse) {
  await ensureAuthIndexes();
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await (await sessions()).insertOne({
    _id: token,
    userId,
    expiresAt,
    createdAt: now,
  });
  await applyCookie(
    SESSION_COOKIE,
    token,
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: expiresAt,
    },
    response,
  );
}

export async function registerWithPassword(input: {
  email: string;
  name: string;
  password: string;
}): Promise<PublicUser> {
  await ensureAuthIndexes();
  const email = normalizeEmail(input.email);
  const name = input.name.trim() || email.split("@")[0];
  if (!email.includes("@")) throw new Error("Enter a valid email");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters");
  const existing = await (await users()).findOne({ email });
  if (existing) throw new Error("This email is already registered");
  const now = new Date();
  const result = await (await users()).insertOne({
    email,
    name,
    passwordHash: await hashPassword(input.password),
    createdAt: now,
    updatedAt: now,
  });
  const user = toPublic({
    _id: result.insertedId,
    email,
    name,
    passwordHash: "x",
    createdAt: now,
    updatedAt: now,
  });
  await afterCreateUser(user);
  await writeSession(user.id);
  return user;
}

export async function loginWithPassword(email: string, password: string): Promise<PublicUser> {
  await ensureAuthIndexes();
  const doc = await (await users()).findOne({ email: normalizeEmail(email) });
  if (!doc?.passwordHash) throw new Error("Wrong email or password");
  const ok = await verifyPassword(password, doc.passwordHash);
  if (!ok) throw new Error("Wrong email or password");
  const user = toPublic(doc);
  await writeSession(user.id);
  return user;
}

export async function loginWithGoogle(
  profile: {
    googleId: string;
    email: string;
    name: string;
    image?: string;
  },
  response?: NextResponse,
): Promise<PublicUser> {
  await ensureAuthIndexes();
  const email = normalizeEmail(profile.email);
  const col = await users();
  const now = new Date();
  let doc =
    (await col.findOne({ googleId: profile.googleId })) ?? (await col.findOne({ email }));

  if (!doc) {
    const inserted = await col.insertOne({
      email,
      name: profile.name.trim() || email.split("@")[0],
      image: profile.image,
      googleId: profile.googleId,
      createdAt: now,
      updatedAt: now,
    });
    doc = await col.findOne({ _id: inserted.insertedId });
    if (!doc) throw new Error("Failed to create account");
    const user = toPublic(doc);
    await afterCreateUser(user);
    await writeSession(user.id, response);
    return user;
  }

  await col.updateOne(
    { _id: doc._id },
    {
      $set: {
        googleId: profile.googleId,
        image: profile.image || doc.image,
        name: doc.name || profile.name,
        updatedAt: now,
      },
    },
  );
  const updated = (await col.findOne({ _id: doc._id })) ?? doc;
  const user = toPublic(updated);
  await writeSession(user.id, response);
  return user;
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await (await sessions()).findOne({
    _id: token,
    expiresAt: { $gt: new Date() },
  });
  if (!session) {
    (await cookies()).delete(SESSION_COOKIE);
    return null;
  }
  const doc = await (await users()).findOne({ _id: new ObjectId(session.userId) });
  return doc ? toPublic(doc) : null;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await (await sessions()).deleteOne({ _id: token });
  jar.delete(SESSION_COOKIE);
}
