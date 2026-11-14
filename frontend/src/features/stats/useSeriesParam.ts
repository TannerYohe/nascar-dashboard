import { useSearchParams } from 'react-router'

/** The `?series=` in the URL, or undefined when there is none, and a setter that replaces it. */
export function useSeriesParam(): [number | undefined, (series: number) => void] {
  const [params, setParams] = useSearchParams()
  const series = Number(params.get('series')) || undefined
  const setSeries = (next: number) =>
    setParams(
      (current) => {
        current.set('series', String(next))
        return current
      },
      { replace: true },
    )
  return [series, setSeries]
}
