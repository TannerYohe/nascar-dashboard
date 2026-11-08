import { Link } from 'react-router'

/** A full-page message with a way back to the race list. */
export function Problem({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="grid flex-1 place-items-center p-6">
      <div className="max-w-md text-center">
        <h2 className="text-lg font-semibold">{title}</h2>
        {detail && <p className="mt-2 text-sm text-muted">{detail}</p>}
        <Link to="/races" className="mt-4 inline-block text-sm font-semibold text-accent hover:underline">
          Browse races
        </Link>
      </div>
    </div>
  )
}
