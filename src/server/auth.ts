import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type NextAuthOptions,
  type DefaultSession,
} from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import SlackProvider from "next-auth/providers/slack";
import { OAuth2Client } from "google-auth-library";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { env } from "~/env.mjs";
import { prisma } from "~/server/db";

const googleAuthClient = new OAuth2Client(process.env.NEXT_PUBLIC_GOOGLE_ID);

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      // ...other properties
      // role: UserRole;
    } & DefaultSession["user"];
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

const adapter = PrismaAdapter(prisma);

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  debug: true,
  adapter,
  providers: [
    SlackProvider({
      clientId: env.SLACK_CLIENT_ID,
      clientSecret: env.SLACK_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    CredentialsProvider({
      // The id of this credential provider. It's important to give an id because, in frontend we don't want to
      // show anything about this provider in a normal login flow
      id: "googleonetap",
      // A readable name
      name: "google-one-tap",

      // This field define what parameter we expect from the FE and what's its name. In this case "credential"
      // This field will contain the token generated by google
      credentials: {
        credential: { type: "text" },
      },
      // This is where all the logic goes
      authorize: async (credentials) => {
        // The token given by google and provided from the frontend
        const token = credentials?.credential;

        if (!token) throw new Error("no token");
        // We use the google library to exchange the token with some information about the user
        const ticket = await googleAuthClient.verifyIdToken({
          // The token received from the interface
          idToken: token,
          // This is the google ID of your application
          audience: env.NEXT_PUBLIC_GOOGLE_ID,
        });
        const payload = ticket.getPayload(); // This is the user

        if (!payload) {
          throw new Error("Cannot extract payload from signin token");
        }

        // If the request went well, we received all this info from Google.
        const {
          email,
          sub,
          given_name,
          family_name,
          email_verified,
          picture: image,
        } = payload;

        // If for some reason the email is not provided, we cannot login the user with this method
        if (!email) {
          throw new Error("Email not available");
        }

        if (!email_verified) {
          throw new Error("Email not verified");
        }

        // Let's check on our DB if the user exists
        const user = await adapter.getUserByEmail(email);

        console.log(user);

        // If there's no user, we need to create it
        if (!user) {
          // user = await adapter.createUser({
          //   name: [given_name, family_name].join(" "),
          //   email,
          //   image,
          //   emailVerified: email_verified ? new Date() : null,
          // });
          throw new Error("The user is not available");
        }

        await adapter.updateUser({
          id: user.id,
          emailVerified: new Date(),
        });

        // Let's also retrieve any account for the user from the DB, if any
        const account = await adapter.getUserByAccount({
          provider: "google",
          providerAccountId: sub,
        });

        // In case the account is not yet present on our DB, we want to create one and link to the user
        if (!account) {
          await adapter.linkAccount({
            userId: user.id,
            provider: "google",
            providerAccountId: sub,
            type: "credentials",
          });
        }
        // We can finally returned the retrieved or created user

        console.log(user);
        return user;
      },
    }),
  ],
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = (ctx: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}) => {
  return getServerSession(ctx.req, ctx.res, authOptions);
};
