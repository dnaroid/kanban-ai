export type Screen =
  | { id: 'projects' }
  | { id: 'diagnostics' }
  | { id: 'board'; projectId: string; projectName: string }
  | { id: 'timeline'; projectId: string; projectName: string }
  | { id: 'settings' }
