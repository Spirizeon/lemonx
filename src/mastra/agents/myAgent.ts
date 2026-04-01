import { Agent } from "@mastra/core/agent";

export const myAgent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: "cloudflare-workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
});
