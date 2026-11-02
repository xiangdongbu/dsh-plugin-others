/**
 * dsh-plugin-auto-load-earlier — Host half.
 *
 * Browser-only behaviour shim; the Node half is an empty Loader row that
 * exposes this package's `dsh.client` declaration to the Web module graph.
 * The paging takeover lives in lib/client.js.
 */

export const name = 'dsh-plugin-auto-load-earlier'

export function apply() {}
