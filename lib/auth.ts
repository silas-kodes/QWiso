import { cookies } from "next/headers";

const AUTH_COOKIE_NAME = "qwiso_session";
const APP_PASSWORD = process.env.APP_PASSWORD || "admin"; // Default password

export async function isAuthenticated() {
  const cookieStore = await cookies();
  const session = cookieStore.get(AUTH_COOKIE_NAME);
  return session?.value === "authenticated";
}

export async function login(password: string) {
  if (password === APP_PASSWORD) {
    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE_NAME, "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: "/",
    });
    return true;
  }
  return false;
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}
