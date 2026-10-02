/** Pure narration: a tool call in, one plain-English line for a non-technical viewer out. */

export type Narration = { text: string; minutes: number }

const KIND: Record<string, string> = {
  tsx: 'screen',
  jsx: 'screen',
  vue: 'screen',
  svelte: 'screen',
  html: 'page',
  css: 'styles',
  scss: 'styles',
  ts: 'code',
  js: 'code',
  mjs: 'code',
  py: 'code',
  go: 'code',
  rb: 'code',
  rs: 'code',
  swift: 'code',
  sql: 'database script',
  json: 'settings',
  yaml: 'settings',
  yml: 'settings',
  toml: 'settings',
  env: 'settings',
  md: 'notes',
  txt: 'notes',
  csv: 'data',
  png: 'image',
  jpg: 'image',
  svg: 'graphic',
}

const GENERIC = new Set(['index', 'main', 'page', 'route', 'layout', 'mod', 'app', 'default'])

/** "src/components/PricingCard.tsx" -> "pricing card" */
export const wordsOf = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .trim()
    .toLowerCase()

/** "app/pricing/page.tsx" -> "the pricing page"; "auth.test.ts" -> "the auth tests". */
export const fileLabel = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  const file = parts[parts.length - 1] ?? path
  const dot = file.lastIndexOf('.')
  const ext = dot > 0 ? file.slice(dot + 1).toLowerCase() : ''
  let stem = dot > 0 ? file.slice(0, dot) : file
  const isTest = /\.(test|spec)$/i.test(stem) || /(^|[\\/])(__tests__|tests?)[\\/]/i.test(path)
  stem = stem.replace(/\.(test|spec)$/i, '')
  const isGeneric = GENERIC.has(stem.toLowerCase())
  const parent = parts[parts.length - 2]
  const base = isGeneric && parent && !parent.startsWith('(') && !parent.startsWith('[') ? parent : stem
  const name = wordsOf(base) || 'project'
  if (isTest) return `the ${name} tests`
  if (file.startsWith('.env')) return 'the private settings'
  const kind = KIND[ext] ?? 'file'
  if (isGeneric && ext === 'tsx' && parent) return `the ${name} page`
  return `the ${name} ${kind}`
}

const quote = (text: string, max = 40) => {
  const clean = text.replace(/\s+/g, ' ').trim()
  return `"${clean.length > max ? `${clean.slice(0, max - 1)}…` : clean}"`
}

const hostOf = (url: string) => {
  const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(url)
  return m ? m[1]!.replace(/^www\./, '') : 'a web page'
}

/** A shell command, explained. */
export const narrateCommand = (command: string): Narration => {
  const c = command.trim()
  const rules: [RegExp, Narration][] = [
    [/\b(test|jest|vitest|pytest|mocha|go test|cargo test|bun test)\b/i, { text: 'Running the test suite', minutes: 4 }],
    [/\bgit\s+commit\b/, { text: 'Saving a checkpoint of the work', minutes: 2 }],
    [/\bgit\s+push\b/, { text: 'Publishing the changes', minutes: 2 }],
    [/\bgit\s+(status|diff|log|show)\b/, { text: 'Reviewing what has changed so far', minutes: 2 }],
    [/\bgit\s+(checkout|switch|branch)\b/, { text: 'Setting up a separate workspace for this change', minutes: 1 }],
    [/\b(npm|pnpm|yarn|bun)\s+(i|install|add)\b|\bpip\s+install\b|\bbrew\s+install\b/, { text: 'Installing the building blocks it needs', minutes: 3 }],
    [/\b(run\s+)?build\b|\btsc\b/, { text: 'Building the app to make sure it all fits together', minutes: 4 }],
    [/\b(run\s+)?(dev|start|serve)\b/, { text: 'Starting the app to try it out', minutes: 2 }],
    [/\b(lint|eslint|prettier|ruff|black)\b/, { text: 'Tidying up and checking code style', minutes: 2 }],
    [/\b(vercel|deploy|fly deploy|netlify)\b/, { text: 'Deploying the update live', minutes: 5 }],
    [/\b(curl|wget|http)\b/, { text: 'Checking a live web address', minutes: 2 }],
    [/\b(psql|supabase|prisma|migrate)\b/, { text: 'Working with the database', minutes: 5 }],
    [/^(ls|cat|head|tail|find|tree|wc|pwd|grep|rg|sed -n)\b/, { text: 'Looking around the project', minutes: 1 }],
    [/^(mkdir|cp|mv|touch)\b/, { text: 'Organizing project files', minutes: 1 }],
  ]
  for (const [re, n] of rules) if (re.test(c)) return n
  return { text: 'Running a quick command', minutes: 1 }
}

const field = (input: Record<string, unknown>, key: string) => {
  const v = input[key]
  return typeof v === 'string' ? v : ''
}

/** One tool call, explained, with a rough estimate of the minutes a person would spend on it. */
export const narrate = (tool: string, input: Record<string, unknown>): Narration => {
  const path = field(input, 'file_path') || field(input, 'notebook_path') || field(input, 'path')
  switch (tool) {
    case 'Read':
      return { text: `Reading ${fileLabel(path)}`, minutes: 2 }
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { text: `Saving changes to ${fileLabel(path)}`, minutes: 6 }
    case 'Write':
      return { text: `Creating ${fileLabel(path)}`, minutes: 10 }
    case 'Bash':
      return narrateCommand(field(input, 'command'))
    case 'Grep':
      return { text: `Searching the project for ${quote(field(input, 'pattern'))}`, minutes: 2 }
    case 'Glob':
      return { text: 'Finding the files involved', minutes: 1 }
    case 'WebFetch':
      return { text: `Reading ${hostOf(field(input, 'url'))}`, minutes: 3 }
    case 'WebSearch':
      return { text: `Researching ${quote(field(input, 'query'))} on the web`, minutes: 5 }
    case 'Agent':
    case 'Task': {
      const what = field(input, 'description')
      return { text: what ? `Bringing in a helper to ${what.charAt(0).toLowerCase()}${what.slice(1)}` : 'Bringing in a helper', minutes: 15 }
    }
    case 'TodoWrite':
      return { text: 'Updating the plan', minutes: 1 }
    case 'AskUserQuestion':
      return { text: 'Checking a decision with you', minutes: 0 }
  }
  const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
  if (mcp) {
    const server = wordsOf(mcp[1]!.replace(/^claude_ai_/, '').replace(/^plugin_[^_]+_/, ''))
      .split(' ')
      .map(w => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
      .join(' ')
    const action = wordsOf(mcp[2]!.replace(/^[a-z]+_(?=[a-z]+_)/, ''))
    return { text: `Using ${server} to ${action}`, minutes: 3 }
  }
  return { text: `Using ${wordsOf(tool)}`, minutes: 1 }
}

/** Counts from a test run's output, as a short note: "42 passed" / "40 passed, 2 failed". */
export const testNote = (output: string) => {
  const top = (re: RegExp) => {
    let n: number | null = null
    for (const m of output.matchAll(re)) n = Math.max(n ?? 0, Number(m[1]))
    return n
  }
  const passed = top(/(\d+)\s+(?:tests?\s+)?pass(?:ed|ing)?\b/gi)
  const failed = top(/(\d+)\s+(?:tests?\s+)?fail(?:ed|ing|ures?)?\b/gi)
  if (passed === null && failed === null) return null
  return failed ? `${passed ?? 0} passed, ${failed} failed` : `${passed} passed`
}

/** "3h 05m" / "42m" */
export const duration = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes))
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

export const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The scripted demo: tool, input, a result's stdout, the pause before it. */
export const DEMO: readonly { tool: string; input: Record<string, unknown>; stdout?: string; isError?: boolean; ms: number }[] = [
  { tool: 'Glob', input: { pattern: 'app/**/*.tsx' }, ms: 900 },
  { tool: 'Read', input: { file_path: 'app/pricing/page.tsx' }, ms: 1200 },
  { tool: 'Read', input: { file_path: 'components/CheckoutForm.tsx' }, ms: 1100 },
  { tool: 'Grep', input: { pattern: 'applyDiscount' }, ms: 1000 },
  { tool: 'mcp__claude_ai_Stripe__list_prices', input: {}, ms: 1400 },
  { tool: 'Edit', input: { file_path: 'components/CheckoutForm.tsx' }, ms: 1600 },
  { tool: 'Edit', input: { file_path: 'lib/pricing-rules.ts' }, ms: 1400 },
  { tool: 'Write', input: { file_path: 'tests/checkout.test.ts' }, ms: 1500 },
  { tool: 'Bash', input: { command: 'npm test' }, stdout: 'Tests: 2 failed, 40 passed, 42 total', isError: true, ms: 2200 },
  { tool: 'Edit', input: { file_path: 'lib/pricing-rules.ts' }, ms: 1300 },
  { tool: 'Bash', input: { command: 'npm test' }, stdout: 'Tests: 42 passed, 42 total', ms: 2000 },
  { tool: 'Bash', input: { command: 'npm run build' }, ms: 1800 },
  { tool: 'Bash', input: { command: 'git commit -m "Checkout: apply volume discounts"' }, ms: 900 },
]
