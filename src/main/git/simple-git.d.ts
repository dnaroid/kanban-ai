declare module 'simple-git' {
  export interface SimpleGitStatus {
    current?: string
    ahead: number
    behind: number
    isClean(): boolean
  }

  export interface SimpleGitCommitResult {
    commit: string
  }

  export interface SimpleGit {
    checkIsRepo(): Promise<boolean>
    status(): Promise<SimpleGitStatus>
    checkout(branch: string): Promise<void>
    checkoutBranch(branch: string, startPoint: string): Promise<void>
    checkoutLocalBranch(branch: string): Promise<void>
    diff(): Promise<string>
    add(files: string | string[]): Promise<void>
    commit(message: string): Promise<SimpleGitCommitResult>
    push(remote: string, branch: string): Promise<void>
    raw(args: string[]): Promise<string>
    revparse(args: string[]): Promise<string>
  }

  const simpleGit: (options?: { baseDir?: string; binary?: string }) => SimpleGit
  export default simpleGit
}
