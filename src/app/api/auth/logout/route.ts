import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const response = NextResponse.redirect(new URL("/login", req.url));

  // Clear authentication cookies
  response.cookies.set({
    name: "token",
    value: "",
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });
  
  response.cookies.set({
    name: "refreshToken",
    value: "",
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });

  return response;
}
