// Railway Infrastructure as Code for the methodex project (production).
//
// Generated with `railway config migrate --variables=unmanaged` (CLI 5.71) from
// railway.toml plus the live environment, then corrected to match what the
// current deployments actually run (see .railway/README.md). Railway does not
// read this file during deploys: nothing changes until `railway config apply`.
//
// Whole-project file, not a partial: an apply can delete any resource that is
// missing here, so every service, database and volume must stay declared.
import { defineRailway, github, image, postgres, project, redis, service, volume } from "railway/iac";

export default defineRailway(() => {
  const qualitativeResearchTool = github("anuragid/qualitative-research-tool", { branch: "main", checkSuites: true });

  // Carried over from railway.toml. ON_FAILURE/10 is also Railway's default, but
  // it was only ever set by railway.toml, so keep it explicit.
  const restartPolicy = { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 } as const;

  // Pin the images that are running today. Without these, postgres() / redis()
  // fall back to SDK or CLI defaults (postgres:18, postgres-ssl:18,
  // railwayapp/redis:8.2), and `config plan` showed an apply would move
  // Postgres 17 to 18 on its existing v17 data volume. A major-version upgrade
  // has to be its own deliberate change.
  const Postgres = postgres("Postgres", { region: "us-west2" });
  Postgres.source = image("ghcr.io/railwayapp-templates/postgres-ssl:17");
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const Redis = redis("Redis", { region: "us-west2" });
  Redis.source = image("redis:8.2.9");
  // docs/ops/redis-config.md: rm lost+found, --requirepass, maxmemory 300mb + allkeys-lru.
  Redis.deploy = { startCommand: "/bin/sh -c \"rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH --maxmemory 300mb --maxmemory-policy allkeys-lru\"" };
  Redis.networking = { privateNetworkEndpoint: "redis" };
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-west2", sizeMB: 500 });
  const redisVolume = volume("redis-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-west2", sizeMB: 500 });

  // backend, worker and beat share one image. There is no start command: the
  // image's ENTRYPOINT (backend/scripts/startup.sh) picks api / worker / beat
  // from each service's SERVICE_TYPE variable.
  const worker = service("worker", {
    source: qualitativeResearchTool,
    build: { builder: "DOCKERFILE", dockerfilePath: "backend/Dockerfile.railway" },
    replicas: { "us-west2": 1 },
    deploy: { drainingSeconds: 900, ...restartPolicy },
  });
  const backend = service("backend", {
    source: qualitativeResearchTool,
    // The migrator emitted RAILPACK (the dashboard value, never used because
    // railway.toml's dockerfilePath forces the Dockerfile build).
    build: { builder: "DOCKERFILE", dockerfilePath: "backend/Dockerfile.railway" },
    healthcheck: "/health/ready",
    healthcheckTimeout: 10,
    replicas: { "us-west2": 1 },
    deploy: { drainingSeconds: 30, ...restartPolicy },
    domains: ["api.methodex.ai"],
  });
  // beat deploys are not gated on CI (scripts/railway-service-config.py gates
  // backend and worker only).
  const beat = service("beat", {
    source: github("anuragid/qualitative-research-tool", { branch: "main", checkSuites: false }),
    build: { builder: "DOCKERFILE", dockerfilePath: "backend/Dockerfile.railway" },
    replicas: { "us-west2": 1 },
    deploy: { drainingSeconds: 10, ...restartPolicy },
  });

  // Variables stay owned by the dashboard (managed: false): this file never
  // reads, writes or deletes service variables. Without it the CLI defaults to
  // managed and refuses to plan ("backend declares no env but Railway has 23
  // variables"). The CLI honours the key but SDK 3.16's ProjectDefinition type
  // doesn't declare it yet, so it goes through a constant to pass tsc.
  const definition = {
    variables: { managed: false },
    resources: [Postgres, worker, backend, beat, Redis, postgresVolume, redisVolume],
  };
  return project("methodex", definition);
});
