/** One agent loop: a subagent, a fork, a teammate or a workflow worker. Times are epoch ms. */
export type Agent = {
  id: string
  /** The row's label: the Agent call's description. */
  label: string
  /** general-purpose, Explore, teammate, workflow... */
  type: string
  /** What SendMessage addresses it by. */
  name?: string
  parentId?: string
  model?: string
  /** running, completed, failed, killed, or another engine status. */
  status: string
  startedAt: number
  endedAt?: number
  tools: number
  errors: number
  /** Plain-English line for the tool in flight (or the last one). */
  doing?: string
  doingTool?: string
  /** True while a tool call is open in this loop. */
  busy: boolean
  lastAt: number
  /** Tool name -> calls. */
  mix: Record<string, number>
  outTokens: number
  bg?: boolean
  toolUseId?: string
  /** The plugin that spawned it, when one did. */
  viaPlugin?: string
}

/** The main loop: the orchestrator / team lead. */
export type Lead = { doing?: string; doingTool?: string; busy: boolean; tools: number; lastAt: number; startedAt: number }

/** One message between agents. `from`/`to` are agent ids, or 'main'. */
export type Msg = { at: number; from: string; to: string; text: string }

/** One line of the activity feed. */
export type Beat = { at: number; who: string; kind: 'spawn' | 'tool' | 'done' | 'fail' | 'msg' | 'deny'; text: string }

declare module 'claude-code' {
  interface PluginState {
    swarm: {
      agents: Agent[]
      lead: Lead
      msgs: Msg[]
      beats: Beat[]
      tick: number
    }
  }
}
