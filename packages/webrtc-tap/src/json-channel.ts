export type JsonMsg = { t: string; [k: string]: unknown };

export function sendJson(dc: RTCDataChannel, msg: JsonMsg): void {
  if (dc.readyState !== "open") return;
  dc.send(JSON.stringify(msg));
}

/** Multiplex JSON messages on a single DataChannel. */
export function createJsonMultiplexer(dc: RTCDataChannel) {
  const handlers = new Map<string, Set<(msg: JsonMsg) => void>>();

  const onMessage = (ev: MessageEvent) => {
    let msg: JsonMsg;
    try {
      msg = JSON.parse(String(ev.data)) as JsonMsg;
    } catch {
      return;
    }
    const t = msg.t;
    if (typeof t !== "string") return;
    const set = handlers.get(t);
    if (!set) return;
    for (const fn of [...set]) fn(msg);
  };

  dc.addEventListener("message", onMessage);

  function on(type: string, fn: (msg: JsonMsg) => void): () => void {
    let set = handlers.get(type);
    if (!set) {
      set = new Set();
      handlers.set(type, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
      if (set?.size === 0) handlers.delete(type);
    };
  }

  function dispose() {
    dc.removeEventListener("message", onMessage);
    handlers.clear();
  }

  return { on, dispose };
}
