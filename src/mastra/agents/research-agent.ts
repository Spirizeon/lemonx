import { Agent } from '@mastra/core/agent'

export const researchAgent = new Agent({
  id: 'research-agent',
  name: 'Research Specialist',
  description:
    'Specializes in gathering factual information and data on any topic. ' +
    'Returns concise bullet-point summaries with key facts and sources. ' +
    'Does not write full articles or narrative content.',
  instructions:
    'You are a research specialist. When given a topic, gather key facts, ' +
    'statistics, and information. Present findings as clear bullet points. ' +
    'Include sources when possible. Focus on accuracy and completeness.',
  model: 'openai/gpt-5-mini',
})
