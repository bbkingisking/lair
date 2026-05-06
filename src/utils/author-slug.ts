export function authorToSlug(author: string): string {
  return author.toLowerCase().replace(/\s+/g, '-')
}
