import { cn } from '@/lib/utils'

interface Column<T> {
  key: keyof T | string
  header: string
  cell?: (row: T) => React.ReactNode
  width?: string
  align?: 'left' | 'right' | 'center'
  hide?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  emptyText?: string
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  skeletonRows?: number
}

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyText = 'No data found.',
  rowKey,
  onRowClick,
  skeletonRows = 5,
}: DataTableProps<T>) {
  const visible = columns.filter((c) => !c.hide)

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="data-table w-full">
        <thead>
          <tr>
            {visible.map((col) => (
              <th
                key={String(col.key)}
                style={{ width: col.width }}
                className={cn(
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center'
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={i}>
                {visible.map((col) => (
                  <td key={String(col.key)}>
                    <div
                      className={cn(
                        'h-4 bg-muted rounded animate-pulse',
                        col.align === 'right' ? 'ml-auto w-1/2' : 'w-3/4'
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={visible.length}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(onRowClick && 'cursor-pointer')}
                onClick={() => onRowClick?.(row)}
              >
                {visible.map((col) => (
                  <td
                    key={String(col.key)}
                    className={cn(
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center'
                    )}
                  >
                    {col.cell
                      ? col.cell(row)
                      : String((row as Record<string, unknown>)[col.key as string] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
