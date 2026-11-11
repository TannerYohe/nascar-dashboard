import { useEffect } from 'react'

export const APP_NAME = 'NasDash'

/** "Standings" -> "Standings · NasDash". */
export function pageTitle(page: string): string {
  return `${page} · ${APP_NAME}`
}

/** Sets the browser tab title to the page's title while the component is mounted. */
export function useDocumentTitle(page: string): void {
  useEffect(() => {
    document.title = pageTitle(page)
  }, [page])
}
