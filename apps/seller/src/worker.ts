import { createApp } from "./index.ts";

// Workers entry. nodejs_compat populates process.env from vars and secrets.
let app: ReturnType<typeof createApp> | undefined;

export default {
  fetch(request: Request): Response | Promise<Response> {
    app ??= createApp();
    return app.fetch(request);
  },
};
