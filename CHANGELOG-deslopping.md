# Deslopping Changes — Architecture Consolidation

## Summary
Reduced from 5 active + 3 unused agents → 2 agents + 1 Mastra Workflow.
Replaced procedural orchestration with Mastra Workflow pattern.

## Files Deleted (7)
- `src/mastra/agents/testGeneratorAgent.ts` — merged into researchTestAgent
- `src/mastra/agents/integrationGeneratorAgent.ts` — merged
- `src/mastra/agents/e2eGeneratorAgent.ts` — merged
- `src/mastra/agents/executorAgent.ts` — merged
- `src/mastra/agents/orchestratorAgent.ts` — unused, replaced by Workflow
- `src/mastra/agents/myAgent.ts` — unused template
- `src/mastra/tools/fs/runTestsTool.ts` — duplicate of runner/runTestsTool.ts

## Files Created (1)
- `src/mastra/workflows/testFixWorkflow.ts` — Mastra Workflow using createWorkflow, createStep, .then(), .dountil()

## Files Modified (11)
- `src/mastra/agents/research-agent.ts` — rewritten as combined researchTestAgent (6 tools: readFile, writeFile, runTests, fetchAnalysis, storeTests, storeResults)
- `src/mastra/index.ts` — registers 2 agents + 1 workflow
- `src/index.ts` — 575→40 lines, just runs the workflow
- `src/webhook-server.ts` — 798→195 lines, consolidated to single /webhook/generate-and-test
- `tests/e2e/webhook-server.test.ts` — updated for new agent names + consolidated endpoints
- `docs/architecture/agents.md` — 2-agent architecture
- `docs/architecture/control-flow.md` — workflow-based flow
- `docs/architecture/overview.md` — updated diagram/table
- `docs/architecture/state-management.md` — agent name updates
- `docs/reference/agents.md` — researchTestAgent + editorAgent + testFixWorkflow
- `docs/reference/entry-points.md`, `docs/guide/how-it-works.md`, `docs/index.md` — agent reference updates

## Key Changes
1. **researchTestAgent** autonomously determines test type (unit/integration/E2E) from file content
2. **testFixWorkflow** orchestrates: discoverFiles → researchAndGenerate → loop(checkAndFix via .dountil) → createPR
3. All context flows through Redis (unchanged pattern)
4. Fix loop uses Mastra's .dountil() instead of procedural for-loop
5. PR creation built into workflow's createPR step
