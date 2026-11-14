import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway((ctx) => {
  if (ctx.projectId !== "1b4fcf83-538e-43e4-9e61-a5eb2bbd87d5" ||
      ctx.environmentId !== "26102b65-a559-47a6-97c8-d9e0ca42840d") {
    throw new Error("This configuration targets taste-vault production only.");
  }

  const db = postgres("Postgres");
  const images = volume("screenshots", { region: "us-west2", sizeMB: 5000 });
  const app = service("taste-vault", {
    source: github("knakamura13/taste-vault", { branch: "main" }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile", buildCommand: null },
    deploy: { preDeployCommand: [], restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 3 },
    start: "node scripts/serve.js",
    healthcheck: "/healthz",
    healthcheckTimeout: 120,
    replicas: { "us-west2": 1 },
    volumeMounts: { "/data": images },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      NODE_ENV: "production",
      HOST: "0.0.0.0",
      PORT: "8080",
      ORIGIN: "https://taste-vault-production.up.railway.app",
      TASTE_WEB_PASSWORD: preserve(),
      TASTE_API_READ_TOKEN: preserve(),
      TASTE_API_WRITE_TOKEN: preserve(),
      BODY_SIZE_LIMIT: "210M",
      TASTE_STORAGE_DIR: "/data/images",
      TASTE_REQUIRE_AUTH: "true",
    },
  });

  return project("taste-vault", { resources: [db, images, app] });
});
