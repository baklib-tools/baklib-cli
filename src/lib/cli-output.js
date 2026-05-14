/**
 * @param {import('commander').Command} cmd
 */
export function mergedOpts(cmd) {
  if (typeof cmd.optsWithGlobals === "function") {
    return cmd.optsWithGlobals();
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  let cur = cmd;
  while (cur) {
    Object.assign(out, cur.opts());
    cur = cur.parent;
  }
  return out;
}

/**
 * @param {unknown} data
 * @param {{ json?: boolean }} opts
 */
export function printResult(data, opts) {
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (typeof data === "string") {
    console.log(data);
    return;
  }
  console.dir(data, { depth: null, maxArrayLength: 50 });
}
