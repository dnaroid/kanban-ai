const nonSlugChars = /[^a-z0-9]+/g

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(nonSlugChars, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

export const buildTaskBranchName = (taskId: string, title: string): string => {
  const slug = slugify(title)
  return slug ? `task/${taskId}-${slug}` : `task/${taskId}`
}
