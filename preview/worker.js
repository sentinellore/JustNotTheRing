/**
 * Just Not The Ring — the preview Worker's entry.
 *
 * The production Worker (../src/index.js), unchanged, with one thing added to every response:
 * `X-Robots-Tag: noindex`, so a preview on workers.dev is never indexed as a second copy of
 * the site. It lives here, in the preview's own files, so production cannot pick it up.
 */
import worker, { SendLimiter } from "../src/index.js";

export { SendLimiter };

export default {
  async fetch(request, env, ctx) {
    const res = await worker.fetch(request, env, ctx);
    const headers = new Headers(res.headers);
    headers.set("X-Robots-Tag", "noindex");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
