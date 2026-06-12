import { createApp } from "./app.js";
import { env } from "./env.js";

const app = createApp();

app.listen(env.port, () => {
  console.log(`[vendopos-backend] listening on http://localhost:${env.port}`);
  console.log(`[vendopos-backend] CORS allowed origins: ${env.corsOrigins.join(", ")}`);
});
