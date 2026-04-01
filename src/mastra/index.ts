import { Mastra } from "@mastra/core/mastra";
import { testGeneratorAgent } from "./agents/testGeneratorAgent";
import { executorAgent } from "./agents/executorAgent";
import { editorAgent } from "./agents/editorAgent";

export const mastra = new Mastra({
  agents: { testGeneratorAgent, executorAgent, editorAgent },
});
