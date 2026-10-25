import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Tests stub `fetch` for Gemini. A real Claude key from .env would route the
    // backup path through that stub, so it is blanked here (dotenv never overrides).
    env: { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GROQ_API_KEY: '', AI_PROVIDER_ORDER: '' },
    // Integration suites each start an in-memory MongoDB instance. Running those
    // files concurrently is slower and flaky on resource-constrained machines.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});

