import { useEffect, useState } from 'react';
import { CopilotPlatform } from '@kaily-ai/chat-sdk';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KailyBot = any;

export interface KailyUserInfo {
  name?: string;
  email?: string;
}

export function useKailyBot(token: string, user?: KailyUserInfo) {
  const [bot, setBot] = useState<KailyBot>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('KAILY_APP_TOKEN is not set');
      return;
    }
    let mounted = true;
    async function init() {
      try {
        const platform = CopilotPlatform.getInstance({
          environment: 'production',
          surfaceClient: 'web',
        });
        const botInstance = await platform.createBotInstance(token);

        // Associate the logged-in user so the SDK can maintain per-user
        // conversation history and thread context across sessions.
        if (user?.email || user?.name) {
          try {
            await botInstance.setUser({
              name: user.name ?? '',
              email: user.email ?? '',
            });
          } catch (userErr) {
            // Non-fatal — bot still works, just without user identity
            console.warn('[Kaily] setUser failed:', userErr);
          }
        }

        if (mounted) {
          setBot(botInstance);
          setIsReady(true);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize Kaily bot');
        }
      }
    }
    init();
    return () => {
      mounted = false;
    };
  // Re-init if token or user identity changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.email]);

  return { bot, isReady, error };
}
