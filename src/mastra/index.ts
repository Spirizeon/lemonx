import { Mastra } from "@mastra/core/mastra";
import { researchTestAgent } from "./agents/research-agent";
import { editorAgent } from "./agents/editorAgent";
import { testFixWorkflow } from "./workflows/testFixWorkflow";

export const mastra = new Mastra({
  agents: { researchTestAgent, editorAgent },
  workflows: { testFixWorkflow },
});
