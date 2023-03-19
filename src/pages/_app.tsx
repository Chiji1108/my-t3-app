import { type AppType } from "next/app";
import { type Session } from "next-auth";
import { SessionProvider, signIn, useSession } from "next-auth/react";

import { api } from "~/utils/api";

import "~/styles/globals.css";
import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (param: unknown) => void;
          prompt: (param?: unknown) => void;
        };
      };
    };
  }
}

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  return (
    <SessionProvider session={session}>
      <Script
        src="https://accounts.google.com/gsi/client"
        onLoad={() => {
          window.google.accounts.id.initialize({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_ID,
            callback: async (response: { credential: string }) => {
              await signIn("googleonetap", {
                credential: response.credential,
              });
            },
          });
        }}
      />
      <Prompt />
      <Component {...pageProps} />
    </SessionProvider>
  );
};

export default api.withTRPC(MyApp);

const Prompt = () => {
  const { data } = useSession();

  useEffect(() => {
    if (!data && window.google) {
      window.google.accounts.id.prompt();
    }
  }, [data]);

  return <></>;
};
