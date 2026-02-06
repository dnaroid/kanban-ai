export type PermissionValue = "ask" | "allow" | "deny"
export type BashPermission = PermissionValue | Record<string, PermissionValue>

export interface AgentPermission {
  edit?: PermissionValue
  bash?: BashPermission
  webfetch?: PermissionValue
  doom_loop?: PermissionValue
  external_directory?: PermissionValue
}

export interface ThinkingConfig {
  type: "enabled" | "disabled"
  budgetTokens?: number
}

export interface AgentConfig {
  [key: string]: unknown
  model?: string
  variant?: string
  category?: string
  skills?: string[]
  temperature?: number
  top_p?: number
  prompt?: string
  prompt_append?: string
  tools?: Record<string, boolean>
  disable?: boolean
  description?: string
  mode?: "subagent" | "primary" | "all"
  color?: string
  permission?: AgentPermission
  maxTokens?: number
  thinking?: ThinkingConfig
  reasoningEffort?: "low" | "medium" | "high" | "xhigh"
  textVerbosity?: "low" | "medium" | "high"
  providerOptions?: Record<string, unknown>
}

export interface CategoryConfig {
  [key: string]: unknown
  description?: string
  model?: string
  variant?: string
  temperature?: number
  top_p?: number
  maxTokens?: number
  thinking?: ThinkingConfig
  reasoningEffort?: "low" | "medium" | "high" | "xhigh"
  textVerbosity?: "low" | "medium" | "high"
  tools?: Record<string, boolean>
  prompt_append?: string
  is_unstable_agent?: boolean
}

export interface OhMyOpencodeConfig {
  categories?: Record<string, CategoryConfig>
  agents?: Record<string, AgentConfig>
  systemDefaultModel?: string
  $schema?: string
}
