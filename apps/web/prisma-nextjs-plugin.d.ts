declare module "@prisma/nextjs-monorepo-workaround-plugin" {
  /** Webpack plugin that copies Prisma engine binaries into the server bundle (pnpm monorepos on Vercel). */
  export class PrismaPlugin {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apply(compiler: any): void;
  }
}
