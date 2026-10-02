export type Thought = { id: number; text: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'inner-monologue': { thoughts: Thought[]; isThinking: boolean }
  }
}
