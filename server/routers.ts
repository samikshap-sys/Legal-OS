import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { legalRouter } from "./legalRouter";
import { querypadRouter } from "./querypadRouter";
import { pipelineRouter } from "./pipelineRouter";
import { ledgerXRouter } from "./ledgerXRouter";
import { dpReconRouter } from "./dpReconRouter";
import { userMgmtRouter } from "./userMgmtRouter";
import { legalUserMgmtRouter } from "./legalUserMgmtRouter";
import { mogamboRouter } from "./mogamboRouter";
import { gaugeRouter } from "./gaugeRouter";
import { gaugeTasksRouter } from "./gaugeTasksRouter";
import { gaugeMeetingsRouter } from "./gaugeMeetingsRouter";

export const appRouter = router({
  system: systemRouter,
  legal: legalRouter,
  querypad: querypadRouter,
  pipeline: pipelineRouter,
  ledgerX: ledgerXRouter,
  dpRecon: dpReconRouter,
  userMgmt: userMgmtRouter,
  legalUserMgmt: legalUserMgmtRouter,
  mogambo: mogamboRouter,
  gauge: gaugeRouter,
  gaugeTasks: gaugeTasksRouter,
  gaugeMeetings: gaugeMeetingsRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
