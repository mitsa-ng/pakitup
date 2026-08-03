import { os } from "@orpc/server";

import type { Context } from "./context";

export * from "./domain";

export const o = os.$context<Context>();

export const publicProcedure = o;
