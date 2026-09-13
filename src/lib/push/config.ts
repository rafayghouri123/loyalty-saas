import { z } from 'zod';

export function firebaseWebConfig() {
  const parsed = z.object({ apiKey: z.string().min(20), projectId: z.string().min(1), appId: z.string().min(1), messagingSenderId: z.string().min(1) }).safeParse({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID, messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  });
  return parsed.success ? parsed.data : null;
}
