import { watch as watchDirectory, type FSWatcher } from "node:fs";

/**
 * Watching the documentation root.
 *
 * Editors do not save files the way a naive watcher expects. A single "save"
 * in a modern editor is often a write to a temporary file, a rename over the
 * original, and a permissions change — three events, microseconds apart, for
 * one edit. A rebuild per event would rebuild three times and, worse, would
 * sometimes rebuild while the file was still half-written.
 *
 * So this module does two things and no more: it reports that *something*
 * changed, and it waits until the changes stop. Which document changed is not
 * its business — the scanner and the content hashes already answer that, and
 * far more reliably than a platform's file-system events do.
 */

export interface WatchOptions {
  /** How long to wait for the changes to stop, in milliseconds. */
  readonly debounceMs?: number;
  /** Reports a watcher that failed, rather than throwing into an event loop. */
  readonly onError?: (cause: unknown) => void;
}

export interface Watcher {
  /** Stops watching and releases the file-system handle. */
  close(): void;
}

/**
 * The debounce window.
 *
 * Long enough to collapse an editor's save sequence, short enough that a person
 * pressing save and switching to their browser does not arrive first.
 */
const defaultDebounceMs = 60;

/**
 * Watches `root` and calls `onChange` once per settled burst of changes.
 *
 * Recursive watching is used where the platform provides it, which is every
 * platform Tsumugu supports. A watcher that cannot be created at all — a
 * missing directory, a system watch limit — is reported through `onError` and
 * leaves the server serving what it already built, because a documentation
 * server that exits when watching fails is worse than one that stops updating.
 */
export function watchRoot(
  root: string,
  onChange: () => void,
  options: WatchOptions = {},
): Watcher {
  const debounceMs = options.debounceMs ?? defaultDebounceMs;

  let timer: NodeJS.Timeout | undefined;
  let closed = false;
  let watcher: FSWatcher | undefined;

  const schedule = (): void => {
    if (closed) {
      return;
    }
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      onChange();
    }, debounceMs);
    // The timer must not be what keeps the process alive: a pending rebuild is
    // not a reason to refuse to exit.
    timer.unref();
  };

  try {
    watcher = watchDirectory(root, { recursive: true }, schedule);
    watcher.on("error", (cause) => {
      options.onError?.(cause);
    });
  } catch (cause) {
    options.onError?.(cause);
  }

  return {
    close: () => {
      closed = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      watcher?.close();
    },
  };
}
