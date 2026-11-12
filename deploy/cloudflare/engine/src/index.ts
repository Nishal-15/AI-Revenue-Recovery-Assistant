import { Container } from "@cloudflare/containers";

/**
 * Worker in front of the Python engine container.
 *
 *   fetch      forwards every request (Meta webhooks, /health, /jobs/*) to the engine
 *   scheduled  replaces the engine's in-process scheduler: Cloudflare cron wakes the
 *              container, runs the jobs, and the container sleeps again between runs
 */

type Env = {
  ENGINE: DurableObjectNamespace<Engine>;
  // Secrets (wrangler secret put)
  DATABASE_URL: string;
  ENGINE_API_TOKEN: string;
  GEMINI_API_KEY?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  // Plain vars (wrangler.jsonc)
  GEMINI_MODEL: string;
  WHATSAPP_API_VERSION: string;
  DB_POOL_MAX_SIZE: string;
  AI_BATCH_SIZE: string;
};

const PASSED_TO_ENGINE = [
  "DATABASE_URL",
  "ENGINE_API_TOKEN",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_API_VERSION",
  "DB_POOL_MAX_SIZE",
  "AI_BATCH_SIZE",
] as const satisfies readonly (keyof Env)[];

// Detection is heavier and changes slowly, so it runs on every third 5-minute tick.
const SCAN_EVERY_MINUTES = 15;

export class Engine extends Container<Env> {
  defaultPort = 8080;
  // Sleep soon after the last request so we only pay while jobs or webhooks are running.
  sleepAfter = "2m";

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    const passed: Record<string, string> = { ENABLE_SCHEDULER: "false" };
    for (const name of PASSED_TO_ENGINE) {
      const value = env[name];
      if (value) passed[name] = value;
    }
    this.envVars = passed;
  }
}

// One named engine instance: jobs and webhooks share its database pool.
const engine = (env: Env) => env.ENGINE.getByName("engine");

const runJob = async (env: Env, path: string): Promise<void> => {
  const response = await engine(env).fetch(
    new Request(`http://engine${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.ENGINE_API_TOKEN}` },
    }),
  );
  const body = await response.text();
  // 503 from /jobs/ai just means no Gemini key is set; everything else should succeed.
  if (!response.ok && !(path === "/jobs/ai" && response.status === 503)) {
    throw new Error(`${path} failed with ${response.status}: ${body.slice(0, 300)}`);
  }
  console.log(`${path} -> ${response.status} ${body.slice(0, 300)}`);
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return engine(env).fetch(request);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const minute = new Date(controller.scheduledTime).getUTCMinutes();
    const jobs = async () => {
      if (minute % SCAN_EVERY_MINUTES === 0) await runJob(env, "/jobs/scan");
      // AI first so a confirmation read from a reply resolves its item before more reminders go out.
      await runJob(env, "/jobs/ai");
      await runJob(env, "/jobs/dispatch");
    };
    ctx.waitUntil(jobs());
  },
} satisfies ExportedHandler<Env>;
