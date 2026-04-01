import { Redis } from "ioredis";

let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (client) return client;
  client = new Redis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379"),
    password: process.env.REDIS_PASSWORD ?? undefined,
  });
  return client;
}
