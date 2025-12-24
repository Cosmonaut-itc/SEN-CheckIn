# DataTable Architecture (TanStack Table + shadcn/ui)

## Location
- DataTable component: apps/web/components/data-table/data-table.tsx
- Table primitives: apps/web/components/ui/table.tsx
- Shared i18n strings: apps/web/messages/es.json (DataTable namespace)

## Goals
- Reuse the same table surface across list pages.
- Centralize sorting, filtering, pagination state.
- Support client mode and server mode.

## Architecture
### Client mode
- Use getFilteredRowModel + getPaginationRowModel + getSortedRowModel.
- manualPagination=false, manualFiltering=false.
- data contains the full dataset.

### Server mode
- manualPagination=true with rowCount (or pageCount).
- manualFiltering=true when filters are server-driven.
- Sorting is client-side for the current page only.
- data contains the current page from the API.

### State contract
- sorting: SortingState
- pagination: { pageIndex, pageSize }
- columnFilters: ColumnFiltersState
- globalFilter: string
- Optional: facetedFilters config for toolbar select filters.

### Reset page on filter change
- When search or filter values change, set pageIndex=0.

### I18n
- Do not hardcode UI strings; use next-intl and translation keys.
- DataTable uses useTranslations('DataTable') for shared labels.

## Usage

### Client mode example
```tsx
const [sorting, setSorting] = useState<SortingState>([]);
const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
const [globalFilter, setGlobalFilter] = useState('');

const columns = useMemo<ColumnDef<Employee>[]>(() => [
  // column defs
], [t]);

return (
  <DataTable
    columns={columns}
    data={rows}
    sorting={sorting}
    onSortingChange={setSorting}
    pagination={pagination}
    onPaginationChange={setPagination}
    columnFilters={columnFilters}
    onColumnFiltersChange={setColumnFilters}
    globalFilter={globalFilter}
    onGlobalFilterChange={setGlobalFilter}
  />
);
```

### Server mode example (limit/offset)
```tsx
const [sorting, setSorting] = useState<SortingState>([]);
const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
const [globalFilter, setGlobalFilter] = useState('');

const params = {
  limit: pagination.pageSize,
  offset: pagination.pageIndex * pagination.pageSize,
};

const { data } = useQuery({
  queryKey: ['resource', params],
  queryFn: () => fetchResource(params),
});

return (
  <DataTable
    columns={columns}
    data={data?.rows ?? []}
    sorting={sorting}
    onSortingChange={setSorting}
    pagination={pagination}
    onPaginationChange={setPagination}
    columnFilters={columnFilters}
    onColumnFiltersChange={setColumnFilters}
    globalFilter={globalFilter}
    onGlobalFilterChange={setGlobalFilter}
    manualPagination
    manualFiltering
    rowCount={data?.total ?? 0}
  />
);
```

## Migration checklist
- Replace the main list <Table> with DataTable.
- Add SortingState, PaginationState, ColumnFiltersState, globalFilter state.
- Decide client vs server mode; use manualPagination + rowCount for server.
- Keep existing filters but route values into columnFilters or globalFilter.
- Reset pageIndex to 0 when filters or search change.
- Ensure at least one sortable column.
- Ensure at least one filter (global search or select) works.
- Provide i18n strings for any new labels or placeholders.

## References (TanStack Table, Context7)
- Column definitions: https://github.com/tanstack/table/blob/main/docs/api/core/column-def.md
- Column API: https://github.com/tanstack/table/blob/main/docs/api/core/column.md
- Sorting guide: https://github.com/tanstack/table/blob/main/docs/guide/sorting.md
- Sorting API: https://github.com/tanstack/table/blob/main/docs/api/features/sorting.md
- Column filtering guide: https://github.com/tanstack/table/blob/main/docs/guide/column-filtering.md
- Global filtering guide: https://github.com/tanstack/table/blob/main/docs/guide/global-filtering.md
- Column filtering API (manualFiltering, getFilteredRowModel): https://github.com/tanstack/table/blob/main/docs/api/features/column-filtering.md
- Pagination guide: https://github.com/tanstack/table/blob/main/docs/guide/pagination.md
- Pagination API (manualPagination, rowCount/pageCount): https://github.com/tanstack/table/blob/main/docs/api/features/pagination.md

## Reminders
- Follow AGENTS.md (strict typing, JSDoc for functions, i18n).
- Run `bun run lint:web` and `bun run check-types:web` before pushing.
