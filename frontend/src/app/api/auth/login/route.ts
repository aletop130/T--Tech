import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const VALID_USERNAME = 'ttechuser2026';
const VALID_PASSWORD = 'fucino65786142@@@';

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to avoid timing leaks on length
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const usernameValid = constantTimeCompare(username, VALID_USERNAME);
    const passwordValid = constantTimeCompare(password, VALID_PASSWORD);

    if (usernameValid && passwordValid) {
      // Generate a session token
      const sessionToken = crypto.randomBytes(32).toString('hex');

      const response = NextResponse.json({ success: true });

      response.cookies.set('horus-session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return response;
    }

    return NextResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}
