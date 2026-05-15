/** 与 `jsonapi-pages.js` 配套的声明，供 `src/App.tsx` 类型检查。 */
export function jsonApiDataArray(j: unknown): unknown[]
export function jsonApiRowsToRemotePageRows(rows: unknown[]): Record<string, unknown>[]
