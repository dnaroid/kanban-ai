export interface RolePreset {
  id: string
  name: string
  description: string
  preset: Record<string, unknown>
}

export interface RolePresetProvider {
  getById(roleId: string): RolePreset
}
